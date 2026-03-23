import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { fetchSecurityPreview } from "@/lib/market";
import { mapWatchlistItemRow } from "@/lib/research";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { watchlistCreateSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;
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

  const { data: items, error } = await supabase
    .from("WatchlistItem")
    .select("*")
    .eq("portfolioId", portfolioId)
    .order("updatedAt", { ascending: false });

  if (error) {
    return badRequest(error.message, 500);
  }

  return json({
    items: (items ?? []).map((item) => mapWatchlistItemRow(item))
  });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;
  const payload = watchlistCreateSchema.parse(await request.json());
  const ticker = payload.ticker.trim().toUpperCase();
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

  const { data: existingRows, error: existingError } = await supabase
    .from("WatchlistItem")
    .select("*")
    .eq("portfolioId", portfolioId)
    .eq("ticker", ticker);

  if (existingError) {
    return badRequest(existingError.message, 500);
  }

  if ((existingRows ?? []).some((row) => row.status !== "PASSED" && row.status !== "PROMOTED")) {
    return badRequest(`${ticker} is already active in this portfolio research queue.`, 409);
  }

  let preview;
  try {
    preview = await fetchSecurityPreview(ticker);
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Ticker must be a Yahoo-valid security.",
      400
    );
  }

  const nextRow = {
    id: crypto.randomUUID(),
    portfolioId,
    ticker: preview.symbol,
    companyName: preview.companyName,
    exchange: preview.exchange,
    quoteType: preview.quoteType,
    sector: preview.sector,
    industry: preview.industry ?? null,
    status: "NEW",
    conviction: 3,
    targetPrice: null,
    thesis: "",
    catalysts: "",
    risks: "",
    valuationNotes: "",
    notes: "",
    sourceType: payload.sourceType,
    sourceLabel: payload.sourceLabel,
    updatedAt: now
  };

  const { data: saved, error: saveError } = await supabase
    .from("WatchlistItem")
    .insert(nextRow)
    .select()
    .single();

  if (saveError || !saved) {
    return badRequest(saveError?.message ?? "Failed to save watchlist item", 500);
  }

  try {
    await Promise.all([
      writeAuditEvent(supabase, {
        request,
        userId: auth.user.id,
        portfolioId,
        actionType: "WATCHLIST_ITEM_ADDED",
        beforeState: {},
        afterState: saved as Record<string, unknown>,
        metadata: {
          sourceType: payload.sourceType,
          sourceLabel: payload.sourceLabel
        }
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

  return json({ item: mapWatchlistItemRow(saved) }, { status: 201 });
}
