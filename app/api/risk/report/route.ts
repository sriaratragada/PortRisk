import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { buildRiskReport } from "@/lib/risk-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const portfolioId = request.nextUrl.searchParams.get("portfolioId");
  if (!portfolioId) {
    return badRequest("Missing portfolioId");
  }

  const portfolio = await getPortfolioWithPositionsEdge(portfolioId, auth.user.id);
  if (!portfolio || portfolio.positions.length === 0) {
    return badRequest("Portfolio not found", 404);
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));
  try {
    const hydrated = await hydratePortfolioRisk(positions);
    const report = await buildRiskReport(portfolioId, hydrated.holdings, hydrated.metrics);
    return json({ report });
  } catch (error) {
    return json(
      {
        report: null,
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to build risk report"
      },
      { status: 200 }
    );
  }
}
