import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { HoldingSnapshot, RiskMetrics } from "@/lib/types";

export type PortfolioSummary = {
  id: string;
  name: string;
  updatedAt: string;
  positionCount: number;
  latestRiskTier: string | null;
};

export type AuditEntryView = {
  id: string;
  timestamp: string;
  actionType: string;
  riskTierBefore: string | null;
  riskTierAfter: string | null;
  metadata: Record<string, unknown> | null;
};

export type StressTestView = {
  id: string;
  scenarioName: string;
  runAt: string;
  projectedValue: number;
  newRiskTier: string;
  recoveryDays: number;
};

export type WorkspacePortfolio = {
  id: string;
  name: string;
  updatedAt: string;
  holdings: HoldingSnapshot[];
  positions: Array<{
    ticker: string;
    shares: number;
    avgCost: number;
    assetClass: "equities" | "bonds" | "commodities";
  }>;
  metrics: RiskMetrics | null;
  valueHistory: Array<{
    date: string;
    value: number;
    peak: number;
    drawdown: number;
  }>;
  auditLog: AuditEntryView[];
  stressTests: StressTestView[];
};

export type WorkspaceData = {
  user: {
    id: string;
    email: string;
  };
  portfolios: PortfolioSummary[];
  selectedPortfolio: WorkspacePortfolio | null;
};

function buildValueHistory(series: Array<{ date: string; value: number }>) {
  let peak = 0;
  return series.map((point) => {
    peak = Math.max(peak, point.value);
    return {
      date: new Date(point.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      }),
      value: point.value,
      peak,
      drawdown: point.value - peak
    };
  });
}

export async function buildWorkspacePortfolio(portfolioId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const [{ data: portfolio, error: portfolioError }, { data: positions }, { data: stressTests }, { data: auditLogs }] =
    await Promise.all([
      supabase
        .from("Portfolio")
        .select("id,name,updatedAt")
        .eq("id", portfolioId)
        .eq("userId", userId)
        .single(),
      supabase
        .from("Position")
        .select("*")
        .eq("portfolioId", portfolioId)
        .order("ticker", { ascending: true }),
      supabase
        .from("StressTest")
        .select("*")
        .eq("portfolioId", portfolioId)
        .order("runAt", { ascending: false })
        .limit(10),
      supabase
        .from("AuditLog")
        .select("*")
        .eq("portfolioId", portfolioId)
        .eq("userId", userId)
        .order("timestamp", { ascending: false })
        .limit(20)
    ]);

  if (portfolioError || !portfolio) {
    return null;
  }

  const normalizedPositions = (positions ?? []).map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));

  if (normalizedPositions.length === 0) {
    return {
      id: portfolio.id,
      name: portfolio.name,
      updatedAt: portfolio.updatedAt,
      holdings: [],
      positions: normalizedPositions,
      metrics: null,
      valueHistory: [],
      auditLog: (auditLogs ?? []).map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actionType: entry.actionType,
        riskTierBefore: entry.riskTierBefore,
        riskTierAfter: entry.riskTierAfter,
        metadata: (entry.metadata as Record<string, unknown> | null) ?? null
      })),
      stressTests: (stressTests ?? []).map((entry) => ({
        id: entry.id,
        scenarioName: entry.scenarioName,
        runAt: entry.runAt,
        projectedValue: entry.projectedValue,
        newRiskTier: entry.newRiskTier,
        recoveryDays: entry.recoveryDays
      }))
    } satisfies WorkspacePortfolio;
  }

  const hydrated = await hydratePortfolioRisk(normalizedPositions);
  return {
    id: portfolio.id,
    name: portfolio.name,
    updatedAt: portfolio.updatedAt,
    holdings: hydrated.holdings,
    positions: normalizedPositions,
    metrics: hydrated.metrics,
    valueHistory: buildValueHistory(hydrated.series),
    auditLog: (auditLogs ?? []).map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      actionType: entry.actionType,
      riskTierBefore: entry.riskTierBefore,
      riskTierAfter: entry.riskTierAfter,
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null
    })),
    stressTests: (stressTests ?? []).map((entry) => ({
      id: entry.id,
      scenarioName: entry.scenarioName,
      runAt: entry.runAt,
      projectedValue: entry.projectedValue,
      newRiskTier: entry.newRiskTier,
      recoveryDays: entry.recoveryDays
    }))
  } satisfies WorkspacePortfolio;
}

export async function getWorkspaceData(user: { id: string; email: string }): Promise<WorkspaceData> {
  const supabase = createSupabaseAdminClient();
  const [{ data: portfolios, error: portfolioError }, { data: positions }, { data: riskScores }] =
    await Promise.all([
      supabase
        .from("Portfolio")
        .select("id,name,updatedAt")
        .eq("userId", user.id)
        .order("updatedAt", { ascending: false }),
      supabase.from("Position").select("portfolioId,id"),
      supabase
        .from("RiskScore")
        .select("portfolioId,riskTier,scoredAt")
        .order("scoredAt", { ascending: false })
    ]);

  if (portfolioError) {
    throw new Error(portfolioError.message);
  }

  const positionCountByPortfolio = new Map<string, number>();
  for (const row of positions ?? []) {
    positionCountByPortfolio.set(row.portfolioId, (positionCountByPortfolio.get(row.portfolioId) ?? 0) + 1);
  }

  const latestRiskTierByPortfolio = new Map<string, string>();
  for (const row of riskScores ?? []) {
    if (!latestRiskTierByPortfolio.has(row.portfolioId)) {
      latestRiskTierByPortfolio.set(row.portfolioId, row.riskTier);
    }
  }

  const selectedPortfolio = portfolios?.[0]
    ? await buildWorkspacePortfolio(portfolios[0].id, user.id)
    : null;

  return {
    user,
    portfolios: (portfolios ?? []).map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      updatedAt: portfolio.updatedAt,
      positionCount: positionCountByPortfolio.get(portfolio.id) ?? 0,
      latestRiskTier: latestRiskTierByPortfolio.get(portfolio.id) ?? null
    })),
    selectedPortfolio
  };
}
