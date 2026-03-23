import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { mapWatchlistItemRow } from "@/lib/research";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { watchlistUpdateSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string; itemId: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId, itemId } = await context.params;
  const payload = watchlistUpdateSchema.parse(await request.json());
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
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

  const { data: existing, error: existingError } = await supabase
    .from("WatchlistItem")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("id", itemId)
    .maybeSingle();

  if (existingError) {
    return badRequest(existingError.message, 500);
  }
  if (!existing) {
    return badRequest("Research item not found", 404);
  }

  const updateRow = {
    status: payload.status ?? existing.status,
    conviction: payload.conviction ?? existing.conviction,
    targetPrice: payload.targetPrice === undefined ? existing.targetPrice : payload.targetPrice,
    thesis: payload.thesis ?? existing.thesis,
    catalysts: payload.catalysts ?? existing.catalysts,
    risks: payload.risks ?? existing.risks,
    valuationNotes: payload.valuationNotes ?? existing.valuationNotes,
    notes: payload.notes ?? existing.notes,
    updatedAt: now
  };

  const { data: updated, error: updateError } = await supabase
    .from("WatchlistItem")
    .update(updateRow)
    .eq("portfolioId", portfolioId)
    .eq("id", itemId)
    .select()
    .single();

  if (updateError || !updated) {
    return badRequest(updateError?.message ?? "Failed to update research item", 500);
  }

  try {
    await Promise.all([
      writeAuditEvent(supabase, {
        request,
        userId: auth.user.id,
        portfolioId,
        actionType: "WATCHLIST_ITEM_UPDATED",
        beforeState: existing as Record<string, unknown>,
        afterState: updated as Record<string, unknown>
      }),
      supabase
        .from("Portfolio")
        .update({ updatedAt: now })
        .eq("id", portfolioId)
        .eq("userId", auth.user.id)
    ]);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  return json({ item: mapWatchlistItemRow(updated) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId, itemId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
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

  const { data: existing, error: existingError } = await supabase
    .from("WatchlistItem")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("id", itemId)
    .maybeSingle();

  if (existingError) {
    return badRequest(existingError.message, 500);
  }
  if (!existing) {
    return badRequest("Research item not found", 404);
  }

  const { error: deleteError } = await supabase
    .from("WatchlistItem")
    .delete()
    .eq("portfolioId", portfolioId)
    .eq("id", itemId);

  if (deleteError) {
    return badRequest(deleteError.message, 500);
  }

  try {
    await Promise.all([
      writeAuditEvent(supabase, {
        request: _request,
        userId: auth.user.id,
        portfolioId,
        actionType: "WATCHLIST_ITEM_REMOVED",
        beforeState: existing as Record<string, unknown>,
        afterState: {}
      }),
      supabase
        .from("Portfolio")
        .update({ updatedAt: now })
        .eq("id", portfolioId)
        .eq("userId", auth.user.id)
    ]);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  return json({ deleted: true });
}
