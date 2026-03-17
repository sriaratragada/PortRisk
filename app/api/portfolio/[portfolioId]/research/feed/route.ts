import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { rankResearchCandidates } from "@/lib/ai-research";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { generateResearchFeed } from "@/lib/research";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

async function buildFeed(portfolioId: string, userId: string, refresh = false) {
  const portfolio = await getPortfolioWithPositionsEdge(portfolioId, userId);
  if (!portfolio) {
    return { routeError: badRequest("Portfolio not found", 404) } as const;
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));

  const supabase = createSupabaseAdminClient();
  const { data: watchlistItems } = await supabase
    .from("WatchlistItem")
    .select("ticker,status")
    .eq("portfolioId", portfolioId);

  const activeWatchlistTickers = (watchlistItems ?? [])
    .filter((item) => item.status !== "PASSED" && item.status !== "PROMOTED")
    .map((item) => item.ticker);

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

  const feed = await generateResearchFeed({
    portfolioId,
    benchmark: portfolio.benchmark,
    positions,
    holdings: hydrated.holdings,
    activeWatchlistTickers,
    refresh
  });

  const ranked = await rankResearchCandidates({
    benchmark: portfolio.benchmark,
    portfolioName: portfolio.name,
    candidates: feed.candidates.slice(0, 10)
  });

  const rankingMap = new Map(
    ranked.rankings.map((entry) => [entry.ticker.toUpperCase(), entry])
  );
  const candidates = feed.candidates.map((candidate) => {
    const ranking = rankingMap.get(candidate.ticker.toUpperCase());
    if (!ranking) {
      return candidate;
    }
    return {
      ...candidate,
      fitScore: ranking.fitScore ?? candidate.fitScore,
      aiSummary: ranking.rationale || candidate.aiSummary,
      topConcern: ranking.topConcern || candidate.topConcern,
      whyNow: ranking.whyNow || candidate.whyNow,
      deterministicSummary: candidate.deterministicSummary
    };
  });

  return {
    feed: {
      generatedAt: feed.generatedAt,
      candidates
    }
  } as const;
}

export async function GET(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;

  try {
    const result = await buildFeed(portfolioId, auth.user.id, false);
    if ("routeError" in result) return result.routeError;
    return json(result.feed);
  } catch (error) {
    return json(
      {
        generatedAt: null,
        candidates: [],
        error: error instanceof Error ? error.message : "Failed to load research feed"
      },
      { status: 200 }
    );
  }
}

export async function POST(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { portfolioId } = await context.params;

  try {
    const result = await buildFeed(portfolioId, auth.user.id, true);
    if ("routeError" in result) return result.routeError;
    return json(result.feed);
  } catch (error) {
    return json(
      {
        generatedAt: null,
        candidates: [],
        error: error instanceof Error ? error.message : "Failed to refresh research feed"
      },
      { status: 200 }
    );
  }
}
