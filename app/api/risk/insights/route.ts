import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json, parseJson } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getPortfolioWithPositionsEdge, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { buildRiskReport } from "@/lib/risk-report";
import { generateRiskInsight } from "@/lib/ai-risk";
import { riskInsightSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function persistInsight(input: {
  userId: string;
  portfolioId: string;
  insight: Awaited<ReturnType<typeof generateRiskInsight>>["insight"];
  rawPromptInput: Record<string, unknown>;
  sourceRiskScoreId: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const row = {
    id: crypto.randomUUID(),
    portfolioId: input.portfolioId,
    generatedAt: input.insight.generatedAt,
    sourceRiskScoreId: input.sourceRiskScoreId,
    model: input.insight.model,
    provider: input.insight.provider,
    source: input.insight.source,
    summary: input.insight.summary,
    drivers: input.insight.drivers,
    resilienceFactors: input.insight.resilienceFactors,
    alerts: input.insight.alerts,
    recommendedActions: input.insight.recommendedActions,
    regimeCommentary: input.insight.regimeCommentary,
    changeSummary: input.insight.changeSummary,
    dataConfidence: input.insight.dataConfidence,
    rawPromptInput: input.rawPromptInput
  };

  const { error } = await supabase.from("RiskInsight").insert(row);
  if (error) {
    return { persisted: false, error: error.message };
  }

  await supabase.from("AuditLog").insert({
    id: crypto.randomUUID(),
    userId: input.userId,
    portfolioId: input.portfolioId,
    actionType: "RISK_INSIGHT_GENERATED",
    beforeState: {},
    afterState: row,
    riskTierBefore: null,
    riskTierAfter: null,
    metadata: {
      provider: input.insight.provider,
      model: input.insight.model,
      source: input.insight.source
    }
  });

  return { persisted: true as const };
}

async function buildInsightForPortfolio(portfolioId: string, userId: string) {
  const portfolio = await getPortfolioWithPositionsEdge(portfolioId, userId);
  if (!portfolio || portfolio.positions.length === 0) {
    return { routeError: badRequest("Portfolio not found", 404) } as const;
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));

  const hydrated = await hydratePortfolioRisk(positions);
  if (!hydrated.metrics) {
    return {
      insight: null,
      report: null,
      rawPromptInput: null,
      sourceRiskScoreId: null,
      degraded: true,
      error: "Insufficient Yahoo Finance history to generate AI risk insight."
    } as const;
  }
  const supabase = createSupabaseAdminClient();
  const [{ data: previousScores }, { data: recentActions }, { data: latestRiskScore }] = await Promise.all([
    supabase
      .from("RiskScore")
      .select("id,riskTier,sharpe,maxDrawdown,var95,scoredAt")
      .eq("portfolioId", portfolioId)
      .order("scoredAt", { ascending: false })
      .limit(2),
    supabase
      .from("AuditLog")
      .select("actionType,timestamp")
      .eq("portfolioId", portfolioId)
      .eq("userId", userId)
      .order("timestamp", { ascending: false })
      .limit(12),
    supabase
      .from("RiskScore")
      .select("id")
      .eq("portfolioId", portfolioId)
      .order("scoredAt", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const report = await buildRiskReport(portfolioId, hydrated.holdings, hydrated.metrics, hydrated.series, {
    benchmark: portfolio.benchmark,
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

  const { insight, rawPromptInput } = await generateRiskInsight(report);
  return {
    report,
    insight,
    rawPromptInput,
    sourceRiskScoreId: latestRiskScore?.id ?? null
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const portfolioId = request.nextUrl.searchParams.get("portfolioId");
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  if (!portfolioId) {
    return badRequest("Missing portfolioId");
  }

  const supabase = createSupabaseAdminClient();
  if (!refresh) {
    const { data, error } = await supabase
      .from("RiskInsight")
      .select("*")
      .eq("portfolioId", portfolioId)
      .order("generatedAt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return json({
        insight: {
          summary: data.summary,
          drivers: Array.isArray(data.drivers) ? data.drivers : [],
          resilienceFactors: Array.isArray(data.resilienceFactors) ? data.resilienceFactors : [],
          alerts: Array.isArray(data.alerts) ? data.alerts : [],
          recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : [],
          regimeCommentary: data.regimeCommentary,
          changeSummary: data.changeSummary,
          dataConfidence: data.dataConfidence,
          generatedAt: data.generatedAt,
          model: data.model,
          provider: data.provider,
          source: data.source
        },
        persisted: true
      });
    }
  }

  try {
    const built = await buildInsightForPortfolio(portfolioId, auth.user.id);
    if ("routeError" in built) return built.routeError;
    if (!built.insight) {
      return json(
        {
          insight: null,
          report: built.report,
          persisted: false,
          degraded: true,
          error: built.error
        },
        { status: 200 }
      );
    }
    const persistence = await persistInsight({
      userId: auth.user.id,
      portfolioId,
      insight: built.insight,
      rawPromptInput: built.rawPromptInput,
      sourceRiskScoreId: built.sourceRiskScoreId
    });
    return json({
      insight: built.insight,
      persisted: persistence.persisted,
      warning: persistence.persisted ? null : persistence.error
    });
  } catch (error) {
    return json(
      {
        insight: null,
        persisted: false,
        error: error instanceof Error ? error.message : "Failed to build AI insight"
      },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const payload = await parseJson(request, riskInsightSchema);
  try {
    const built = await buildInsightForPortfolio(payload.portfolioId, auth.user.id);
    if ("routeError" in built) return built.routeError;
    if (!built.insight) {
      return json(
        {
          insight: null,
          report: built.report,
          persisted: false,
          degraded: true,
          error: built.error
        },
        { status: 200 }
      );
    }

    const persistence = payload.persist
      ? await persistInsight({
          userId: auth.user.id,
          portfolioId: payload.portfolioId,
          insight: built.insight,
          rawPromptInput: built.rawPromptInput,
          sourceRiskScoreId: built.sourceRiskScoreId
        })
      : { persisted: false as const };

    return json({
      insight: built.insight,
      report: built.report,
      persisted: persistence.persisted,
      warning: "error" in persistence ? persistence.error : null
    });
  } catch (error) {
    return json(
      {
        insight: null,
        report: null,
        persisted: false,
        error: error instanceof Error ? error.message : "Failed to generate AI insight"
      },
      { status: 200 }
    );
  }
}
