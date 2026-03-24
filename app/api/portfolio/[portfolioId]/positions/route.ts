import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { positionSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

const createPositionSchema = positionSchema.extend({
  ticker: z.string().trim().min(1).max(12)
});

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;
  const payload = createPositionSchema.parse(await request.json());
  const ticker = payload.ticker.trim().toUpperCase();
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }

  const [{ data: portfolio, error: portfolioError }, { data: existingPosition, error: existingError }] =
    await Promise.all([
      supabase
        .from("Portfolio")
        .select("id")
        .eq("id", portfolioId)
        .eq("userId", auth.user.id)
        .single(),
      supabase
        .from("Position")
        .select("*")
        .eq("portfolioId", portfolioId)
        .eq("ticker", ticker)
        .maybeSingle()
    ]);

  if (portfolioError || !portfolio) {
    return badRequest("Portfolio not found", 404);
  }
  if (existingError) {
    return badRequest(existingError.message, 500);
  }

  const nextRow = {
    id: existingPosition?.id ?? crypto.randomUUID(),
    portfolioId,
    ticker,
    shares: payload.shares,
    avgCost: payload.avgCost,
    assetClass: payload.assetClass ?? "equities",
    updatedAt: now
  };

  const { data: savedPosition, error: saveError } = await supabase
    .from("Position")
    .upsert(nextRow, { onConflict: "portfolioId,ticker" })
    .select()
    .single();

  if (saveError || !savedPosition) {
    return badRequest(saveError?.message ?? "Failed to save position", 500);
  }

  const actionType =
    existingPosition == null
      ? "POSITION_ADDED"
      : existingPosition.shares !== payload.shares ||
          existingPosition.avgCost !== payload.avgCost ||
          existingPosition.assetClass !== (payload.assetClass ?? "equities")
        ? "POSITION_RESIZED"
        : "POSITION_RESIZED";

  let auditWarning: string | null = null;
  try {
    await writeAuditEvent(supabase, {
      request,
      userId: auth.user.id,
      portfolioId,
      actionType,
      beforeState: (existingPosition ?? {}) as Record<string, unknown>,
      afterState: savedPosition as Record<string, unknown>
    });
  } catch (error) {
    auditWarning = error instanceof Error ? error.message : "Failed to write audit log";
  }

  await supabase
    .from("Portfolio")
    .update({ updatedAt: now })
    .eq("id", portfolioId)
    .eq("userId", auth.user.id);

  return json(
    { position: savedPosition, auditWarning },
    { status: existingPosition ? 200 : 201 }
  );
}
