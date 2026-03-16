import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireEdgeUser } from "@/lib/auth-edge";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { badRequest, json, parseJson } from "@/lib/http";
import { riskScoreSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireEdgeUser(request);
  if ("error" in auth) return auth.error;

  const limited = await enforceRateLimit(auth.user.id, "risk");
  if (limited) {
    return limited;
  }

  const payload = await parseJson(request, riskScoreSchema);
  const positions =
    payload.positions ??
    (payload.portfolioId
      ? (
          await getPortfolioWithPositionsEdge(payload.portfolioId, auth.user.id)
        )?.positions.map((position) => ({
          ticker: position.ticker,
          shares: position.shares,
          avgCost: position.avgCost,
          assetClass: position.assetClass as "equities" | "bonds" | "commodities"
        }))
      : undefined);

  if (!positions || positions.length === 0) {
    return badRequest("Portfolio positions are required");
  }

  const result = await hydratePortfolioRisk(positions, payload.drawdownThreshold);
  if (!result.metrics) {
    return json({
      holdings: result.holdings,
      series: result.series,
      quotes: result.quotes,
      metrics: null,
      degraded: true,
      error: "Insufficient Yahoo Finance history to compute a reliable risk score.",
      marketDataState: result.marketDataState,
      historyCoverageDays: result.historyCoverageDays
    });
  }

  if (payload.persist !== false && payload.portfolioId) {
    const supabase = createSupabaseAdminClient();
    const riskRow = {
      id: crypto.randomUUID(),
      portfolioId: payload.portfolioId,
      sharpe: result.metrics.sharpe,
      maxDrawdown: result.metrics.maxDrawdown,
      var95: result.metrics.var95,
      var95Amount: result.metrics.var95Amount,
      drawdownProb3m: result.metrics.drawdownProb3m,
      drawdownProb6m: result.metrics.drawdownProb6m,
      drawdownProb12m: result.metrics.drawdownProb12m,
      riskTier: result.metrics.riskTier,
      summary: result.metrics.summary,
      inputs: {
        drawdownThreshold: payload.drawdownThreshold,
        positions
      }
    };
    const { error: riskError } = await supabase.from("RiskScore").insert(riskRow);
    if (riskError) {
      return badRequest(riskError.message, 500);
    }

    const { data: latestScore } = await supabase
      .from("RiskScore")
      .select("riskTier")
      .eq("portfolioId", payload.portfolioId)
      .order("scoredAt", { ascending: false })
      .limit(2);

    const riskTierBefore = latestScore?.[1]?.riskTier ?? null;
    const { error: auditError } = await supabase.from("AuditLog").insert({
      id: crypto.randomUUID(),
      userId: auth.user.id,
      portfolioId: payload.portfolioId,
      actionType: "RISK_SCORED",
      beforeState: {},
      afterState: riskRow,
      riskTierBefore,
      riskTierAfter: result.metrics.riskTier,
      metadata: {
        portfolioValue: result.metrics.portfolioValue,
        annualizedReturn: result.metrics.annualizedReturn,
        annualizedVolatility: result.metrics.annualizedVolatility
      }
    });

    if (auditError) {
      return badRequest(auditError.message, 500);
    }
  }

  return json(result);
}
