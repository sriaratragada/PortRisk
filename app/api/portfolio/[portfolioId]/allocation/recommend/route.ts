import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { buildAllocationRecommendationSet } from "@/lib/allocation-recommendations";
import type { ChartRange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limited = await enforceRateLimit(auth.user.id, "default");
  if (limited) {
    return limited;
  }

  const { portfolioId } = await context.params;
  const rangeParam = (request.nextUrl.searchParams.get("range") ?? "1Y").toUpperCase() as ChartRange;
  const range = CHART_RANGES.includes(rangeParam) ? rangeParam : "1Y";

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

  if (positions.length < 2) {
    return json(
      {
        recommendation: {
          benchmark: portfolio.benchmark,
          range,
          recommendationState: "insufficient_history",
          model: {
            objective: "max_sharpe_v1",
            constraints: {
              longOnly: true,
              maxSingleWeight: 0.25,
              maxSectorWeight: 0.4,
              universe: "current_holdings"
            }
          },
          current: {
            annualReturn: null,
            annualVolatility: null,
            sharpe: null,
            var95: null,
            betaToBenchmark: null,
            correlationToBenchmark: null,
            topWeight: null,
            topSector: null,
            topSectorWeight: null,
            effectiveHoldings: null
          },
          recommendations: [],
          insights: [],
          asOf: null,
          dataState: "unavailable",
          provider: null
        }
      },
      { status: 200 }
    );
  }

  const hydrated = await hydratePortfolioRisk(positions);
  const recommendation = await buildAllocationRecommendationSet({
    positions,
    holdings: hydrated.holdings,
    benchmark: portfolio.benchmark,
    range
  });

  return json({
    recommendation
  });
}
