import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { generateResearchInsight } from "@/lib/ai-research";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { buildResearchFeatureBundle, mapWatchlistItemRow } from "@/lib/research";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { researchInsightSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;
  const payload = researchInsightSchema.parse(await request.json());
  const portfolio = await getPortfolioWithPositionsEdge(portfolioId, auth.user.id);
  if (!portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));
  const hydrated = positions.length > 0
    ? await hydratePortfolioRisk(positions).catch(() => ({
        holdings: [],
        series: [],
        quotes: [],
        metrics: null,
        marketDataState: "unavailable" as const,
        historySufficient: false,
        historyCoverageDays: 0,
        asOf: null,
        provider: null
      }))
    : {
        holdings: [],
        series: [],
        quotes: [],
        metrics: null,
        marketDataState: "unavailable" as const,
        historySufficient: false,
        historyCoverageDays: 0,
        asOf: null,
        provider: null
      };

  const supabase = createSupabaseAdminClient();
  const watchlistNotes = payload.watchlistItemId
    ? await supabase
        .from("WatchlistItem")
        .select("*")
        .eq("portfolioId", portfolioId)
        .eq("id", payload.watchlistItemId)
        .maybeSingle()
        .then(({ data }) => (data ? mapWatchlistItemRow(data) : null))
    : null;

  const featureBundle = await buildResearchFeatureBundle({
    ticker: payload.ticker,
    benchmark: portfolio.benchmark,
    positions,
    holdings: hydrated.holdings,
    sourceType: watchlistNotes?.sourceType ?? payload.sourceType
  });

  const { insight } = await generateResearchInsight({
    featureBundle,
    watchlistNotes: watchlistNotes
      ? {
          thesis: watchlistNotes.thesis,
          catalysts: watchlistNotes.catalysts,
          risks: watchlistNotes.risks,
          valuationNotes: watchlistNotes.valuationNotes,
          notes: watchlistNotes.notes
        }
      : null
  });

  return json({
    insight,
    featureBundle
  });
}
