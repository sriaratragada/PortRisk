import { prisma } from "@/lib/db";
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
  const portfolio = await prisma.portfolio.findFirst({
    where: {
      id: portfolioId,
      userId
    },
    include: {
      positions: true,
      riskScores: {
        orderBy: { scoredAt: "desc" },
        take: 10
      },
      stressTests: {
        orderBy: { runAt: "desc" },
        take: 10
      },
      auditLogs: {
        orderBy: { timestamp: "desc" },
        take: 20
      }
    }
  });

  if (!portfolio) {
    return null;
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));

  if (positions.length === 0) {
    return {
      id: portfolio.id,
      name: portfolio.name,
      updatedAt: portfolio.updatedAt.toISOString(),
      holdings: [],
      positions,
      metrics: null,
      valueHistory: [],
      auditLog: portfolio.auditLogs.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp.toISOString(),
        actionType: entry.actionType,
        riskTierBefore: entry.riskTierBefore,
        riskTierAfter: entry.riskTierAfter,
        metadata: (entry.metadata as Record<string, unknown> | null) ?? null
      })),
      stressTests: portfolio.stressTests.map((entry) => ({
        id: entry.id,
        scenarioName: entry.scenarioName,
        runAt: entry.runAt.toISOString(),
        projectedValue: entry.projectedValue,
        newRiskTier: entry.newRiskTier,
        recoveryDays: entry.recoveryDays
      }))
    } satisfies WorkspacePortfolio;
  }

  const hydrated = await hydratePortfolioRisk(positions);
  return {
    id: portfolio.id,
    name: portfolio.name,
    updatedAt: portfolio.updatedAt.toISOString(),
    holdings: hydrated.holdings,
    positions,
    metrics: hydrated.metrics,
    valueHistory: buildValueHistory(hydrated.series),
    auditLog: portfolio.auditLogs.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      actionType: entry.actionType,
      riskTierBefore: entry.riskTierBefore,
      riskTierAfter: entry.riskTierAfter,
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null
    })),
    stressTests: portfolio.stressTests.map((entry) => ({
      id: entry.id,
      scenarioName: entry.scenarioName,
      runAt: entry.runAt.toISOString(),
      projectedValue: entry.projectedValue,
      newRiskTier: entry.newRiskTier,
      recoveryDays: entry.recoveryDays
    }))
  } satisfies WorkspacePortfolio;
}

export async function getWorkspaceData(user: { id: string; email: string }): Promise<WorkspaceData> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId: user.id },
    include: {
      positions: true,
      riskScores: {
        orderBy: { scoredAt: "desc" },
        take: 1
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const selectedPortfolio = portfolios[0]
    ? await buildWorkspacePortfolio(portfolios[0].id, user.id)
    : null;

  return {
    user,
    portfolios: portfolios.map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      updatedAt: portfolio.updatedAt.toISOString(),
      positionCount: portfolio.positions.length,
      latestRiskTier: portfolio.riskScores[0]?.riskTier ?? null
    })),
    selectedPortfolio
  };
}
