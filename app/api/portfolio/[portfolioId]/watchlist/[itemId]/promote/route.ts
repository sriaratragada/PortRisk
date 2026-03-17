import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { mapWatchlistItemRow } from "@/lib/research";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string; itemId: string }>;
};

export async function POST(_request: NextRequest, context: Context) {
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

  const { data: item, error: itemError } = await supabase
    .from("WatchlistItem")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    return badRequest(itemError.message, 500);
  }
  if (!item) {
    return badRequest("Research item not found", 404);
  }

  const { data: updated, error: updateError } = await supabase
    .from("WatchlistItem")
    .update({
      status: "PROMOTED",
      updatedAt: now
    })
    .eq("portfolioId", portfolioId)
    .eq("id", itemId)
    .select()
    .single();

  if (updateError || !updated) {
    return badRequest(updateError?.message ?? "Failed to promote research item", 500);
  }

  await Promise.all([
    supabase.from("AuditLog").insert({
      id: crypto.randomUUID(),
      userId: auth.user.id,
      portfolioId,
      actionType: "WATCHLIST_ITEM_PROMOTED",
      beforeState: item,
      afterState: updated,
      riskTierBefore: null,
      riskTierAfter: null,
      metadata: {
        ticker: item.ticker
      }
    }),
    supabase
      .from("Portfolio")
      .update({ updatedAt: now })
      .eq("id", portfolioId)
      .eq("userId", auth.user.id)
  ]);

  return json({ item: mapWatchlistItemRow(updated) });
}
