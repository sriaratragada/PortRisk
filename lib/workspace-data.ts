import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArchivedPortfolioIds, isPortfolioArchived } from "@/lib/portfolio-archive";
import { buildFallbackHoldings } from "@/lib/holdings";
import { hydratePortfolioHistory, hydratePortfolioRisk } from "@/lib/portfolio-edge";
import { mapWatchlistItemRow } from "@/lib/research";
import { HoldingSnapshot, RiskMetrics, WatchlistItem } from "@/lib/types";

export type PortfolioSummary = {
  id: string;
  name: string;
  benchmark: string;
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
  benchmark: string;
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
    label: string;
    value: number;
    peak: number;
    drawdown: number;
  }>;
  auditLog: AuditEntryView[];
  stressTests: StressTestView[];
  watchlist: WatchlistItem[];
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
    const timestamp = new Date(point.date);
    return {
      date: new Date(point.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      }),
      label: timestamp.toLocaleDateString("en-US", {
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
  const archived = await isPortfolioArchived(userId, portfolioId);
  if (archived) {
    return null;
  }
  const [
    { data: portfolio, error: portfolioError },
    { data: positions },
    { data: stressTests },
    { data: auditLogs },
    { data: watchlistItems }
  ] =
    await Promise.all([
      supabase
        .from("Portfolio")
        .select("id,name,benchmark,updatedAt")
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
        .limit(20),
      supabase
        .from("WatchlistItem")
        .select("*")
        .eq("portfolioId", portfolioId)
        .order("updatedAt", { ascending: false })
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
      benchmark: portfolio.benchmark,
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
      })),
      watchlist: (watchlistItems ?? []).map((item) => mapWatchlistItemRow(item))
    } satisfies WorkspacePortfolio;
  }

  try {
    const [hydrated, historySeries] = await Promise.all([
      hydratePortfolioRisk(normalizedPositions),
      hydratePortfolioHistory(normalizedPositions, "1M")
    ]);
    return {
      id: portfolio.id,
      name: portfolio.name,
      benchmark: portfolio.benchmark,
      updatedAt: portfolio.updatedAt,
      holdings: hydrated.holdings,
      positions: normalizedPositions,
      metrics: hydrated.metrics,
      valueHistory: buildValueHistory(historySeries.series),
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
      })),
      watchlist: (watchlistItems ?? []).map((item) => mapWatchlistItemRow(item))
    } satisfies WorkspacePortfolio;
  } catch {
    return {
      id: portfolio.id,
      name: portfolio.name,
      benchmark: portfolio.benchmark,
      updatedAt: portfolio.updatedAt,
      holdings: buildFallbackHoldings(normalizedPositions),
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
      })),
      watchlist: (watchlistItems ?? []).map((item) => mapWatchlistItemRow(item))
    } satisfies WorkspacePortfolio;
  }
}

export async function getWorkspaceData(user: { id: string; email: string }): Promise<WorkspaceData> {
  const supabase = createSupabaseAdminClient();
  const [archivedIds, portfolioResult, positionResult, riskScoreResult] =
    await Promise.all([
      getArchivedPortfolioIds(user.id),
      supabase
        .from("Portfolio")
        .select("id,name,benchmark,updatedAt")
        .eq("userId", user.id)
        .order("updatedAt", { ascending: false }),
      supabase.from("Position").select("portfolioId,id"),
      supabase.from("RiskScore").select("portfolioId,riskTier,scoredAt").order("scoredAt", { ascending: false })
    ]);

  const { data: portfolios, error: portfolioError } = portfolioResult;
  const { data: positions } = positionResult;
  const { data: riskScores } = riskScoreResult;

  if (portfolioError) {
    throw new Error(portfolioError.message);
  }

  const activePortfolios = (portfolios ?? []).filter((portfolio) => !archivedIds.has(portfolio.id));

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

  const selectedPortfolio = activePortfolios[0]
    ? await buildWorkspacePortfolio(activePortfolios[0].id, user.id)
    : null;

  return {
    user,
    portfolios: activePortfolios.map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      benchmark: portfolio.benchmark,
      updatedAt: portfolio.updatedAt,
      positionCount: positionCountByPortfolio.get(portfolio.id) ?? 0,
      latestRiskTier: latestRiskTierByPortfolio.get(portfolio.id) ?? null
    })),
    selectedPortfolio
  };
}
