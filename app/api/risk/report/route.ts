import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { buildRiskReport } from "@/lib/risk-report";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
    const supabase = createSupabaseAdminClient();
    const [{ data: previousScores }, { data: recentActions }] = await Promise.all([
      supabase
        .from("RiskScore")
        .select("riskTier,sharpe,maxDrawdown,var95,scoredAt")
        .eq("portfolioId", portfolioId)
        .order("scoredAt", { ascending: false })
        .limit(2),
      supabase
        .from("AuditLog")
        .select("actionType,timestamp")
        .eq("portfolioId", portfolioId)
        .eq("userId", auth.user.id)
        .order("timestamp", { ascending: false })
        .limit(12)
    ]);
    const report = await buildRiskReport(portfolioId, hydrated.holdings, hydrated.metrics, hydrated.series, {
      previousScore: previousScores?.[1]
        ? {
            riskTier: previousScores[1].riskTier,
            sharpe: previousScores[1].sharpe,
            maxDrawdown: previousScores[1].maxDrawdown,
            var95: previousScores[1].var95
          }
        : null,
      recentActions: recentActions ?? []
    });
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
