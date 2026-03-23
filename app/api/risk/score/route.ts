import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireEdgeUser } from "@/lib/auth-edge";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { badRequest, json, parseJson } from "@/lib/http";
import { riskScoreSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit-events";

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
    if (payload.persist !== false && payload.portfolioId) {
      const supabase = createSupabaseAdminClient();
      try {
        await writeAuditEvent(supabase, {
          request,
          userId: auth.user.id,
          portfolioId: payload.portfolioId,
          actionType: "RISK_SCORED",
          outcome: "FAILED",
          reasonCode: "INSUFFICIENT_HISTORY",
          beforeState: {},
          afterState: {
            degraded: true,
            historyCoverageDays: result.historyCoverageDays
          },
          policyEvaluations: [
            {
              policyId: "RISK_HISTORY_SUFFICIENCY",
              result: "FAIL",
              message: `Aligned daily history (${result.historyCoverageDays}) was below minimum threshold.`
            }
          ]
        });
      } catch {
        // Keep risk endpoint availability independent from logging write failures.
      }
    }
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
    try {
      await writeAuditEvent(supabase, {
        request,
        userId: auth.user.id,
        portfolioId: payload.portfolioId,
        actionType: "RISK_SCORED",
        beforeState: {},
        afterState: riskRow as Record<string, unknown>,
        riskTierBefore,
        riskTierAfter: result.metrics.riskTier,
        metadata: {
          portfolioValue: result.metrics.portfolioValue,
          annualizedReturn: result.metrics.annualizedReturn,
          annualizedVolatility: result.metrics.annualizedVolatility
        },
        policyEvaluations: [
          {
            policyId: "RISK_HISTORY_SUFFICIENCY",
            result: "PASS",
            message: `Risk scoring ran with ${result.historyCoverageDays} aligned daily points.`
          }
        ]
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
    }
  }

  return json(result);
}
