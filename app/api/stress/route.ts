import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireEdgeUser } from "@/lib/auth-edge";
import { enforceRateLimit } from "@/lib/ratelimit";
import { buildStressSummary, estimateRecoveryDays, getPortfolioWithPositionsEdge, hydratePortfolioRisk, scoreStressedPortfolio, STRESS_SCENARIOS } from "@/lib/portfolio-edge";
import { badRequest, json, parseJson } from "@/lib/http";
import { stressSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireEdgeUser(request);
  if ("error" in auth) return auth.error;

  const limited = await enforceRateLimit(auth.user.id, "stress");
  if (limited) {
    return limited;
  }

  const payload = await parseJson(request, stressSchema);
  const portfolio = await getPortfolioWithPositionsEdge(payload.portfolioId, auth.user.id);
  if (!portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));
  const current = await hydratePortfolioRisk(positions);
  const scenario =
    payload.scenarioName === "Custom"
      ? payload.customShocks
      : STRESS_SCENARIOS[payload.scenarioName];

  if (!scenario) {
    return badRequest("Unknown stress scenario");
  }

  const basePrices = Object.fromEntries(
    current.holdings.map((holding) => [holding.ticker.toUpperCase(), holding.currentPrice])
  );
  const stressed = scoreStressedPortfolio(positions, basePrices, scenario);
  const recoveryDays = estimateRecoveryDays(
    Math.max(current.metrics.annualizedReturn, 0.01),
    Math.max(1 - stressed.projectedValue / Math.max(current.metrics.portfolioValue, 1), 0)
  );
  const summary = buildStressSummary(current.metrics, stressed.projectedValue, stressed.riskTier);
  const response = {
    scenarioName: payload.scenarioName,
    currentMetrics: current.metrics,
    projectedValue: stressed.projectedValue,
    newRiskTier: stressed.riskTier,
    recoveryDays,
    summary,
    comparison: stressed.estimatedMetrics
  };

  const supabase = createSupabaseAdminClient();
  const { error: stressError } = await supabase.from("StressTest").insert({
    id: crypto.randomUUID(),
    portfolioId: payload.portfolioId,
    scenarioName: payload.scenarioName,
    projectedValue: stressed.projectedValue,
    newRiskTier: stressed.riskTier,
    recoveryDays,
    inputs: { scenario, positions },
    results: response
  });
  if (stressError) {
    return badRequest(stressError.message, 500);
  }

  const { error: auditError } = await supabase.from("AuditLog").insert({
    id: crypto.randomUUID(),
    userId: auth.user.id,
    portfolioId: payload.portfolioId,
    actionType: "STRESS_TEST_RUN",
    beforeState: current.metrics,
    afterState: response,
    riskTierBefore: current.metrics.riskTier,
    riskTierAfter: stressed.riskTier,
    metadata: { scenario }
  });
  if (auditError) {
    return badRequest(auditError.message, 500);
  }

  return json(response);
}
