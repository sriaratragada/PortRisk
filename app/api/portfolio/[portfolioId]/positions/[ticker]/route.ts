import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { assetClassSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string; ticker: string }>;
};

const updateSchema = z.object({
  shares: z.number().positive(),
  avgCost: z.number().positive(),
  assetClass: assetClassSchema.optional().default("equities")
});

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId, ticker: rawTicker } = await context.params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
  const payload = updateSchema.parse(await request.json());
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("Portfolio")
    .select("id")
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .single();

  if (portfolioError || !portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const { data: existingPosition, error: existingError } = await supabase
    .from("Position")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existingError) {
    return badRequest(existingError.message, 500);
  }
  if (!existingPosition) {
    return badRequest("Position not found", 404);
  }

  const { data: updatedPosition, error: updateError } = await supabase
    .from("Position")
    .update({
      shares: payload.shares,
      avgCost: payload.avgCost,
      assetClass: payload.assetClass,
      updatedAt: now
    })
    .eq("portfolioId", portfolioId)
    .eq("ticker", ticker)
    .select()
    .single();

  if (updateError || !updatedPosition) {
    return badRequest(updateError?.message ?? "Failed to update position", 500);
  }

  try {
    await writeAuditEvent(supabase, {
      request,
      userId: auth.user.id,
      portfolioId,
      actionType: "POSITION_RESIZED",
      beforeState: existingPosition as Record<string, unknown>,
      afterState: updatedPosition as Record<string, unknown>
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  await supabase
    .from("Portfolio")
    .update({ updatedAt: now })
    .eq("id", portfolioId)
    .eq("userId", auth.user.id);

  return json({ position: updatedPosition });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId, ticker: rawTicker } = await context.params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("Portfolio")
    .select("id")
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .single();

  if (portfolioError || !portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const { data: existingPosition, error: existingError } = await supabase
    .from("Position")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existingError) {
    return badRequest(existingError.message, 500);
  }
  if (!existingPosition) {
    return badRequest("Position not found", 404);
  }

  const { error: deleteError } = await supabase
    .from("Position")
    .delete()
    .eq("portfolioId", portfolioId)
    .eq("ticker", ticker);

  if (deleteError) {
    return badRequest(deleteError.message, 500);
  }

  try {
    await writeAuditEvent(supabase, {
      request: _request,
      userId: auth.user.id,
      portfolioId,
      actionType: "POSITION_REMOVED",
      beforeState: existingPosition as Record<string, unknown>,
      afterState: {}
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  await supabase
    .from("Portfolio")
    .update({ updatedAt: now })
    .eq("id", portfolioId)
    .eq("userId", auth.user.id);

  return json({ deleted: true });
}
