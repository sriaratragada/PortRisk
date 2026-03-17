import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { buildBenchmarkAnalytics } from "@/lib/benchmark-analytics";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import type { ChartRange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { portfolioId } = await context.params;
  const range = (request.nextUrl.searchParams.get("range") ?? "1M").toUpperCase() as ChartRange;
  const allowedRanges: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];
  if (!allowedRanges.includes(range)) {
    return badRequest("Invalid range");
  }

  const portfolio = await getPortfolioWithPositionsEdge(portfolioId, auth.user.id);
  if (!portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  if (portfolio.positions.length === 0) {
    return json({
      analytics: null,
      degraded: true,
      error: "Add holdings to compute benchmark comparison."
    });
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));

  try {
    const hydrated = await hydratePortfolioRisk(positions);
    const analytics = await buildBenchmarkAnalytics(
      positions,
      hydrated.holdings,
      portfolio.benchmark,
      range
    );

    return json({
      analytics,
      degraded: !analytics.benchmarkAvailable,
      error: analytics.benchmarkAvailable
        ? null
        : `Benchmark history is unavailable for ${portfolio.benchmark} over ${range}.`
    });
  } catch (error) {
    return json(
      {
        analytics: null,
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to compute benchmark analytics"
      },
      { status: 200 }
    );
  }
}
