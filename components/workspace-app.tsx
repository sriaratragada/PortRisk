"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AuditEntryView, PortfolioSummary, WorkspaceData, WorkspacePortfolio } from "@/lib/workspace-data";
import { STRESS_SCENARIOS } from "@/lib/portfolio-edge";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { RiskTier } from "@/lib/types";

type TabId =
  | "overview"
  | "holdings"
  | "risk"
  | "stress"
  | "allocation"
  | "audit"
  | "settings";

type SearchResult = {
  symbol: string;
  shortname: string;
  exchange: string;
  quoteType: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "risk", label: "Risk" },
  { id: "stress", label: "Stress Tests" },
  { id: "allocation", label: "Allocation Modeler" },
  { id: "audit", label: "Audit Log" },
  { id: "settings", label: "Settings" }
];

const tierStyles: Record<RiskTier, string> = {
  LOW: "bg-success/15 text-success ring-success/30",
  MODERATE: "bg-warning/15 text-warning ring-warning/30",
  ELEVATED: "bg-elevated/15 text-elevated ring-elevated/30",
  HIGH: "bg-danger/15 text-danger ring-danger/30"
};

function Panel({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-800/80 bg-panel/85 p-6 shadow-panel backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", tierStyles[tier])}>
      {tier}
    </span>
  );
}

function MetricStat({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );
}

function EmptyState({
  title,
  copy,
  action
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/25 p-10 text-center">
      <h3 className="text-2xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">{copy}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function mapSummary(portfolios: Array<{ id: string; name: string; updatedAt: string; positions: unknown[]; riskScores: Array<{ riskTier: string }> }>) {
  return portfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    updatedAt: portfolio.updatedAt,
    positionCount: portfolio.positions.length,
    latestRiskTier: portfolio.riskScores[0]?.riskTier ?? null
  })) satisfies PortfolioSummary[];
}

function buildPortfolioHistory(series: Array<{ date: string; value: number }>) {
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

export function WorkspaceApp({ initialData }: { initialData: WorkspaceData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [portfolioSummaries, setPortfolioSummaries] = useState(initialData.portfolios);
  const [selectedPortfolio, setSelectedPortfolio] = useState<WorkspacePortfolio | null>(
    initialData.selectedPortfolio
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(initialData.selectedPortfolio?.id ?? "");
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [positionTicker, setPositionTicker] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionShares, setPositionShares] = useState("10");
  const [positionAvgCost, setPositionAvgCost] = useState("100");
  const [positionAssetClass, setPositionAssetClass] = useState<"equities" | "bonds" | "commodities">("equities");
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [createPortfolioName, setCreatePortfolioName] = useState("");
  const [auditRows, setAuditRows] = useState<AuditEntryView[]>(initialData.selectedPortfolio?.auditLog ?? []);
  const [auditActionType, setAuditActionType] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [stressScenario, setStressScenario] = useState("2008 Financial Crisis");
  const [stressCustom, setStressCustom] = useState({
    equities: -0.2,
    bonds: 0.05,
    commodities: -0.1
  });
  const [stressResult, setStressResult] = useState<Record<string, unknown> | null>(null);
  const [allocationWeights, setAllocationWeights] = useState<Record<string, number>>({});
  const [proposedMetrics, setProposedMetrics] = useState<WorkspacePortfolio["metrics"]>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.authorization = `Bearer ${session.access_token}`;
    }

    return headers;
  }

  useEffect(() => {
    if (!selectedPortfolio) {
      setAllocationWeights({});
      return;
    }
    setAuditRows(selectedPortfolio.auditLog);
    setAllocationWeights(
      Object.fromEntries(selectedPortfolio.holdings.map((holding) => [holding.ticker, holding.weight]))
    );
    setProposedMetrics(selectedPortfolio.metrics);
  }, [selectedPortfolio]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setHighlightedSearchIndex(-1);
      return;
    }

    const handle = window.setTimeout(async () => {
      const response = await fetch(`/api/portfolio/search?q=${encodeURIComponent(searchTerm)}`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { results: SearchResult[] };
      setSearchResults(data.results);
      setHighlightedSearchIndex(data.results.length > 0 ? 0 : -1);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    if (!selectedPortfolio || activeTab !== "allocation" || selectedPortfolio.holdings.length === 0) {
      return;
    }

    const totalWeight = Object.values(allocationWeights).reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0) {
      return;
    }

    const handle = window.setTimeout(async () => {
      const normalized = Object.fromEntries(
        Object.entries(allocationWeights).map(([ticker, weight]) => [ticker, weight / totalWeight])
      );
      const proposedPositions = selectedPortfolio.holdings.map((holding) => {
        const targetValue = (selectedPortfolio.metrics?.portfolioValue ?? 0) * (normalized[holding.ticker] ?? 0);
        return {
          ticker: holding.ticker,
          shares: holding.currentPrice === 0 ? 0 : targetValue / holding.currentPrice,
          avgCost: holding.avgCost,
          assetClass: holding.assetClass ?? "equities"
        };
      });

      const response = await fetch("/api/risk/score", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({
          positions: proposedPositions,
          persist: false
        })
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setProposedMetrics(data.metrics ?? null);
    }, 300);

    return () => window.clearTimeout(handle);
  }, [activeTab, allocationWeights, selectedPortfolio]);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`portfolio:${selectedPortfolioId}`)
      .on("broadcast", { event: "price-update" }, ({ payload }) => {
        setSelectedPortfolio((current) =>
          current && current.id === selectedPortfolioId
            ? {
                ...current,
                holdings: (payload.holdings as WorkspacePortfolio["holdings"]) ?? current.holdings,
                metrics: (payload.metrics as WorkspacePortfolio["metrics"]) ?? current.metrics
              }
            : current
        );
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedPortfolioId]);

  const selectedMetrics = selectedPortfolio?.metrics ?? null;
  const dailyPnl = useMemo(
    () => selectedPortfolio?.holdings.reduce((sum, holding) => sum + holding.dailyPnl, 0) ?? 0,
    [selectedPortfolio]
  );
  const dailyPnlPercent = useMemo(
    () =>
      selectedPortfolio?.holdings.reduce((sum, holding) => sum + holding.dailyPnlPercent * holding.weight, 0) ?? 0,
    [selectedPortfolio]
  );

  async function refreshPortfolioList() {
    const response = await fetch("/api/portfolio");
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as {
      portfolios: Array<{
        id: string;
        name: string;
        updatedAt: string;
        positions: unknown[];
        riskScores: Array<{ riskTier: string }>;
      }>;
    };
    setPortfolioSummaries(mapSummary(data.portfolios));
  }

  async function loadPortfolio(portfolioId: string) {
    setPortfolioLoading(true);
    setErrorMessage(null);

    try {
      const [portfolioResponse, riskResponse] = await Promise.all([
        fetch(`/api/portfolio/${portfolioId}`),
        fetch("/api/risk/score", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await getAuthHeaders())
          },
          body: JSON.stringify({
            portfolioId,
            persist: false
          })
        })
      ]);

      if (!portfolioResponse.ok) {
        throw new Error("Failed to load portfolio");
      }

      const portfolioData = (await portfolioResponse.json()) as {
        portfolio: {
          id: string;
          name: string;
          updatedAt: string;
          positions: Array<{
            ticker: string;
            shares: number;
            avgCost: number;
            assetClass: "equities" | "bonds" | "commodities";
          }>;
          stressTests: Array<{
            id: string;
            scenarioName: string;
            runAt: string;
            projectedValue: number;
            newRiskTier: string;
            recoveryDays: number;
          }>;
          auditLogs: AuditEntryView[];
        };
      };

      const nextPortfolio: WorkspacePortfolio = {
        id: portfolioData.portfolio.id,
        name: portfolioData.portfolio.name,
        updatedAt: portfolioData.portfolio.updatedAt,
        positions: portfolioData.portfolio.positions,
        holdings: [],
        metrics: null,
        valueHistory: [],
        auditLog: portfolioData.portfolio.auditLogs,
        stressTests: portfolioData.portfolio.stressTests
      };

      if (portfolioData.portfolio.positions.length > 0 && riskResponse.ok) {
        const riskData = (await riskResponse.json()) as {
          holdings: WorkspacePortfolio["holdings"];
          series: Array<{ date: string; value: number }>;
          metrics: WorkspacePortfolio["metrics"];
        };
        nextPortfolio.holdings = riskData.holdings;
        nextPortfolio.metrics = riskData.metrics;
        nextPortfolio.valueHistory = buildPortfolioHistory(riskData.series);
      }

      setSelectedPortfolio(nextPortfolio);
      setSelectedPortfolioId(portfolioId);
      setAuditRows(nextPortfolio.auditLog);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load portfolio");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function refreshAudit() {
    if (!selectedPortfolioId) {
      return;
    }

    const params = new URLSearchParams({
      page: "1",
      pageSize: "20",
      portfolioId: selectedPortfolioId
    });
    if (auditActionType) params.set("actionType", auditActionType);
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);

    const response = await fetch(`/api/audit?${params.toString()}`);
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { items: AuditEntryView[] };
    setAuditRows(data.items);
  }

  async function createPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createPortfolioName.trim()) {
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: createPortfolioName.trim(),
          positions: []
        })
      });

      if (!response.ok) {
        setErrorMessage("Failed to create portfolio");
        return;
      }

      const data = await response.json();
      setCreatePortfolioName("");
      await refreshPortfolioList();
      await loadPortfolio(data.portfolio.id);
      setStatusMessage("Portfolio created.");
    });
  }

  function applySearchResult(result: SearchResult) {
    setPositionTicker(result.symbol.toUpperCase());
    setPositionName(result.shortname);
    setSearchTerm(`${result.symbol} ${result.shortname}`);
    setSearchResults([]);
    setHighlightedSearchIndex(-1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (searchResults.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSearchIndex((current) => Math.min(current + 1, searchResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSearchIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && highlightedSearchIndex >= 0) {
      event.preventDefault();
      applySearchResult(searchResults[highlightedSearchIndex]);
    }
  }

  function resetPositionForm() {
    setPositionTicker("");
    setPositionName("");
    setSearchTerm("");
    setPositionShares("10");
    setPositionAvgCost("100");
    setPositionAssetClass("equities");
    setEditingTicker(null);
  }

  async function commitPositions(nextPositions: WorkspacePortfolio["positions"], successMessage: string) {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      const response = await fetch(`/api/portfolio/${selectedPortfolio.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          positions: nextPositions
        })
      });

      if (!response.ok) {
        setErrorMessage("Failed to update portfolio");
        return;
      }

      await loadPortfolio(selectedPortfolio.id);
      await refreshPortfolioList();
      setStatusMessage(successMessage);
    });
  }

  async function handlePositionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPortfolio || !positionTicker) {
      return;
    }

    const nextPosition = {
      ticker: positionTicker.toUpperCase(),
      shares: Number(positionShares),
      avgCost: Number(positionAvgCost),
      assetClass: positionAssetClass
    } as WorkspacePortfolio["positions"][number];

    const remaining = selectedPortfolio.positions.filter((position) => position.ticker !== nextPosition.ticker);
    await commitPositions([...remaining, nextPosition], editingTicker ? "Position updated." : "Position added.");
    resetPositionForm();
  }

  function startEditingPosition(ticker: string) {
    if (!selectedPortfolio) {
      return;
    }

    const position = selectedPortfolio.positions.find((entry) => entry.ticker === ticker);
    if (!position) {
      return;
    }

    setEditingTicker(position.ticker);
    setPositionTicker(position.ticker);
    setPositionName(position.ticker);
    setSearchTerm(position.ticker);
    setPositionShares(String(position.shares));
    setPositionAvgCost(String(position.avgCost));
    setPositionAssetClass(position.assetClass);
    setActiveTab("holdings");
  }

  async function removePosition(ticker: string) {
    if (!selectedPortfolio) {
      return;
    }

    const nextPositions = selectedPortfolio.positions.filter((position) => position.ticker !== ticker);
    await commitPositions(nextPositions, `${ticker} removed from portfolio.`);
  }

  async function rerunRiskScore(persist: boolean) {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/risk/score", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({
          portfolioId: selectedPortfolio.id,
          persist
        })
      });

      if (!response.ok) {
        setErrorMessage("Risk scoring failed");
        return;
      }

      const data = await response.json();
      setSelectedPortfolio((current) =>
        current
          ? {
              ...current,
              holdings: data.holdings ?? current.holdings,
              metrics: data.metrics ?? current.metrics,
              valueHistory: data.series ? buildPortfolioHistory(data.series) : current.valueHistory
            }
          : current
      );
      if (persist) {
        await refreshPortfolioList();
        await refreshAudit();
        setStatusMessage("Risk score refreshed.");
      }
    });
  }

  async function runStressScenario() {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/stress", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({
          portfolioId: selectedPortfolio.id,
          scenarioName: stressScenario,
          customShocks: stressScenario === "Custom" ? stressCustom : undefined
        })
      });

      if (!response.ok) {
        setErrorMessage("Stress test failed");
        return;
      }

      const data = await response.json();
      setStressResult(data);
      await loadPortfolio(selectedPortfolio.id);
      setStatusMessage("Stress test completed.");
    });
  }

  async function commitAllocation() {
    if (!selectedPortfolio || !selectedMetrics) {
      return;
    }

    const totalWeight = Object.values(allocationWeights).reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0) {
      return;
    }

    const normalized = Object.fromEntries(
      Object.entries(allocationWeights).map(([ticker, weight]) => [ticker, weight / totalWeight])
    );
    const nextPositions = selectedPortfolio.holdings.map((holding) => {
      const targetValue = selectedMetrics.portfolioValue * (normalized[holding.ticker] ?? 0);
      return {
        ticker: holding.ticker,
        shares: holding.currentPrice === 0 ? 0 : targetValue / holding.currentPrice,
        avgCost: holding.avgCost,
        assetClass: holding.assetClass ?? "equities"
      };
    });

    await commitPositions(nextPositions, "Allocation committed.");
    await rerunRiskScore(true);
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const portfolioSelector = (
    <select
      className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
      value={selectedPortfolioId}
      onChange={(event) => {
        const nextId = event.target.value;
        if (!nextId) {
          return;
        }
        void loadPortfolio(nextId);
      }}
    >
      {portfolioSummaries.map((portfolio) => (
        <option key={portfolio.id} value={portfolio.id}>
          {portfolio.name}
        </option>
      ))}
    </select>
  );

  const renderOverview = () => {
    if (!selectedPortfolio || !selectedMetrics) {
      return (
        <EmptyState
          title="Create your first portfolio"
          copy="Start by creating a portfolio, then add NYSE-listed positions to begin live risk analysis and audit tracking."
          action={
            <form onSubmit={createPortfolio} className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
              <input
                value={createPortfolioName}
                onChange={(event) => setCreatePortfolioName(event.target.value)}
                placeholder="Institutional Core"
                className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              />
              <button className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
                Create Portfolio
              </button>
            </form>
          }
        />
      );
    }

    return (
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Portfolio Snapshot" action={<TierBadge tier={selectedMetrics.riskTier} />}>
          <div className="grid gap-6 md:grid-cols-[1fr_0.95fr]">
            <div>
              <div className="flex flex-wrap items-end gap-3">
                <h2 className="text-4xl font-semibold tracking-tight text-white">
                  {formatCurrency(selectedMetrics.portfolioValue)}
                </h2>
                <div
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    dailyPnl >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                  )}
                >
                  {formatCurrency(dailyPnl)} / {formatPercent(dailyPnlPercent)}
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{selectedMetrics.summary}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricStat label="Sharpe Ratio" value={selectedMetrics.sharpe.toFixed(2)} />
              <MetricStat label="VaR (95%)" value={formatPercent(selectedMetrics.var95)} />
              <MetricStat label="Max Drawdown" value={formatPercent(selectedMetrics.maxDrawdown)} />
              <MetricStat
                label="3M Drawdown Prob."
                value={formatPercent(selectedMetrics.drawdownProb3m)}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Portfolio Selector" action={<span className="text-xs text-slate-500">User-scoped</span>}>
          <div className="space-y-4">
            {portfolioSelector}
            <div className="space-y-3">
              {portfolioSummaries.map((portfolio) => (
                <button
                  key={portfolio.id}
                  onClick={() => void loadPortfolio(portfolio.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-3xl border px-4 py-4 text-left transition",
                    selectedPortfolioId === portfolio.id
                      ? "border-cyan-400/50 bg-cyan-400/10"
                      : "border-slate-800 bg-slate-950/30 hover:border-slate-700"
                  )}
                >
                  <div>
                    <p className="font-medium text-white">{portfolio.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {portfolio.positionCount} positions
                    </p>
                  </div>
                  {portfolio.latestRiskTier ? (
                    <TierBadge tier={portfolio.latestRiskTier as RiskTier} />
                  ) : (
                    <span className="text-xs text-slate-500">Unscored</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Performance" action={<button onClick={() => void rerunRiskScore(true)} className="text-sm text-cyan-300">Re-run Risk</button>}>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedPortfolio.valueHistory}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} minTickGap={22} />
                <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="drawdown" fill="rgba(239,68,68,0.18)" stroke="rgba(239,68,68,0.25)" />
                <Line type="monotone" dataKey="peak" stroke="#e2e8f0" dot={false} strokeWidth={1.4} />
                <Line type="monotone" dataKey="value" stroke="#22d3ee" dot={false} strokeWidth={2.2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Create Portfolio">
          <form onSubmit={createPortfolio} className="space-y-4">
            <input
              value={createPortfolioName}
              onChange={(event) => setCreatePortfolioName(event.target.value)}
              placeholder="Event-Driven Sleeve"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
            />
            <button className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
              Create New Portfolio
            </button>
          </form>
        </Panel>
      </div>
    );
  };

  const renderHoldings = () => (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Current Holdings">
        {!selectedPortfolio || selectedPortfolio.holdings.length === 0 ? (
          <EmptyState
            title="No positions yet"
            copy="Search by ticker and add your first NYSE-listed equity or ETF to begin risk monitoring."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Shares</th>
                  <th className="pb-3">Avg Cost</th>
                  <th className="pb-3">Current Price</th>
                  <th className="pb-3">Value</th>
                  <th className="pb-3">Daily P&L</th>
                  <th className="pb-3">Weight</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {selectedPortfolio.holdings
                  .slice()
                  .sort((left, right) => right.currentValue - left.currentValue)
                  .map((holding) => (
                    <tr key={holding.ticker}>
                      <td className="py-4 font-medium text-white">{holding.ticker}</td>
                      <td className="py-4">{holding.shares.toFixed(2)}</td>
                      <td className="py-4">{formatCurrency(holding.avgCost)}</td>
                      <td className="py-4">{formatCurrency(holding.currentPrice)}</td>
                      <td className="py-4">{formatCurrency(holding.currentValue)}</td>
                      <td className={cn("py-4", holding.dailyPnl >= 0 ? "text-success" : "text-danger")}>
                        {formatCurrency(holding.dailyPnl)}
                      </td>
                      <td className="py-4">{formatPercent(holding.weight)}</td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEditingPosition(holding.ticker)} className="text-cyan-300">
                            Edit
                          </button>
                          <button onClick={() => void removePosition(holding.ticker)} className="text-danger">
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={editingTicker ? "Edit Position" : "Add Position"}>
        <form onSubmit={handlePositionSubmit} className="space-y-4">
          <div className="relative">
            <label className="mb-2 block text-sm text-slate-300">Search NYSE ticker</label>
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPositionTicker("");
                setPositionName("");
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="AAPL, KO, XOM..."
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.symbol}-${result.exchange}`}
                    type="button"
                    onClick={() => applySearchResult(result)}
                    className={cn(
                      "flex w-full items-start justify-between px-4 py-3 text-left text-sm transition",
                      index === highlightedSearchIndex ? "bg-cyan-400/10" : "hover:bg-slate-900"
                    )}
                  >
                    <div>
                      <p className="font-medium text-white">{result.symbol}</p>
                      <p className="mt-1 text-slate-400">{result.shortname}</p>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.2em] text-slate-500">
                      <p>{result.exchange}</p>
                      <p className="mt-1">{result.quoteType}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
            <p className="text-sm text-slate-300">Selected ticker</p>
            <p className="mt-2 text-lg font-semibold text-white">{positionTicker || "Choose a ticker"}</p>
            {positionName ? <p className="mt-1 text-sm text-slate-500">{positionName}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Shares</span>
              <input
                type="number"
                min="0.0001"
                step="0.01"
                value={positionShares}
                onChange={(event) => setPositionShares(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Average cost</span>
              <input
                type="number"
                min="0.0001"
                step="0.01"
                value={positionAvgCost}
                onChange={(event) => setPositionAvgCost(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Asset class</span>
            <select
              value={positionAssetClass}
              onChange={(event) => setPositionAssetClass(event.target.value as "equities" | "bonds" | "commodities")}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
            >
              <option value="equities">Equities</option>
              <option value="bonds">Bonds</option>
              <option value="commodities">Commodities</option>
            </select>
          </label>

          <div className="flex gap-3">
            <button className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
              {editingTicker ? "Update Position" : "Add Position"}
            </button>
            {editingTicker ? (
              <button
                type="button"
                onClick={resetPositionForm}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-slate-300"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Panel>
    </div>
  );

  const renderRisk = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel
        title="Risk Score"
        action={
          selectedMetrics ? <TierBadge tier={selectedMetrics.riskTier} /> : <span className="text-xs text-slate-500">No data</span>
        }
      >
        {!selectedMetrics ? (
          <EmptyState title="No risk metrics yet" copy="Add positions to calculate risk-adjusted performance and downside metrics." />
        ) : (
          <div className="space-y-4">
            <MetricStat label="Sharpe Ratio" value={selectedMetrics.sharpe.toFixed(2)} helper="Annualized excess return per unit of volatility." />
            <MetricStat label="Maximum Drawdown" value={formatPercent(selectedMetrics.maxDrawdown)} helper="Peak-to-trough loss over the trailing year." />
            <MetricStat label="VaR (95%)" value={`${formatPercent(selectedMetrics.var95)} / ${formatCurrency(selectedMetrics.var95Amount)}`} />
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
              <p className="text-sm leading-7 text-slate-300">{selectedMetrics.summary}</p>
            </div>
            <button onClick={() => void rerunRiskScore(true)} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
              Re-run Risk Score
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Drawdown Probability Term Structure">
        {!selectedMetrics ? (
          <EmptyState title="Awaiting portfolio data" copy="Risk charts appear once positions have market history." />
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={[
                  { horizon: "3M", probability: selectedMetrics.drawdownProb3m },
                  { horizon: "6M", probability: selectedMetrics.drawdownProb6m },
                  { horizon: "12M", probability: selectedMetrics.drawdownProb12m }
                ]}
              >
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="horizon" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatPercent(value)} />
                <Area type="monotone" dataKey="probability" stroke="#22d3ee" fill="rgba(34,211,238,0.18)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );

  const renderStress = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Scenario Runner">
        <div className="space-y-4">
          <select
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
            value={stressScenario}
            onChange={(event) => setStressScenario(event.target.value)}
          >
            {Object.keys(STRESS_SCENARIOS).concat("Custom").map((scenario) => (
              <option key={scenario} value={scenario}>
                {scenario}
              </option>
            ))}
          </select>
          {stressScenario === "Custom" && (
            <div className="grid gap-3 sm:grid-cols-3">
              {(["equities", "bonds", "commodities"] as const).map((asset) => (
                <label key={asset} className="block space-y-2">
                  <span className="text-sm capitalize text-slate-300">{asset}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={stressCustom[asset]}
                    onChange={(event) =>
                      setStressCustom((current) => ({
                        ...current,
                        [asset]: Number(event.target.value)
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                  />
                </label>
              ))}
            </div>
          )}
          <button onClick={runStressScenario} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
            Run Stress Test
          </button>
          {stressResult ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4 text-sm">
              <p className="font-medium text-white">{String(stressResult.scenarioName)}</p>
              <p className="mt-3 text-slate-300">Projected value: {formatCurrency(Number(stressResult.projectedValue ?? 0))}</p>
              <p className="mt-2 text-slate-300">New tier: {String(stressResult.newRiskTier ?? "N/A")}</p>
              <p className="mt-2 text-slate-300">Recovery estimate: {Number(stressResult.recoveryDays ?? 0)} days</p>
              <p className="mt-3 text-slate-400">{String(stressResult.summary ?? "")}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Recent Stress History">
        {!selectedPortfolio || selectedPortfolio.stressTests.length === 0 ? (
          <EmptyState title="No stress runs yet" copy="Run a historical or custom scenario to populate this history." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="pb-3">Scenario</th>
                  <th className="pb-3">Run At</th>
                  <th className="pb-3">Projected Value</th>
                  <th className="pb-3">Risk Tier</th>
                  <th className="pb-3">Recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {selectedPortfolio.stressTests.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-4 text-white">{entry.scenarioName}</td>
                    <td className="py-4">{new Date(entry.runAt).toLocaleString()}</td>
                    <td className="py-4">{formatCurrency(entry.projectedValue)}</td>
                    <td className="py-4">{entry.newRiskTier}</td>
                    <td className="py-4">{entry.recoveryDays} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const renderAllocation = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Target Weights">
        {!selectedPortfolio || selectedPortfolio.holdings.length === 0 || !selectedMetrics ? (
          <EmptyState title="No holdings to rebalance" copy="Add positions before using the allocation modeler." />
        ) : (
          <div className="space-y-5">
            {selectedPortfolio.holdings.map((holding) => (
              <div key={holding.ticker} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{holding.ticker}</span>
                  <span className="font-mono text-slate-300">{formatPercent(allocationWeights[holding.ticker] ?? 0)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={allocationWeights[holding.ticker] ?? 0}
                  onChange={(event) =>
                    setAllocationWeights((current) => ({
                      ...current,
                      [holding.ticker]: Number(event.target.value)
                    }))
                  }
                  className="w-full accent-cyan-300"
                />
              </div>
            ))}
            <button onClick={commitAllocation} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
              Commit Allocation
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Current vs Proposed Risk">
        {!selectedMetrics || !proposedMetrics ? (
          <EmptyState title="Waiting for proposed weights" copy="Adjust target weights to calculate proposed risk in real time." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current</p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Sharpe: {selectedMetrics.sharpe.toFixed(2)}</p>
                <p>Max Drawdown: {formatPercent(selectedMetrics.maxDrawdown)}</p>
                <p>VaR (95%): {formatPercent(selectedMetrics.var95)}</p>
                <p>Risk Tier: {selectedMetrics.riskTier}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Proposed</p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Sharpe: {proposedMetrics.sharpe.toFixed(2)}</p>
                <p>Max Drawdown: {formatPercent(proposedMetrics.maxDrawdown)}</p>
                <p>VaR (95%): {formatPercent(proposedMetrics.var95)}</p>
                <p>Risk Tier: {proposedMetrics.riskTier}</p>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-6">
      <Panel title="Filters">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={auditActionType}
            onChange={(event) => setAuditActionType(event.target.value)}
            className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400"
          >
            <option value="">All actions</option>
            <option value="POSITION_ADDED">Position Added</option>
            <option value="POSITION_REMOVED">Position Removed</option>
            <option value="POSITION_RESIZED">Position Resized</option>
            <option value="RISK_SCORED">Risk Scored</option>
            <option value="STRESS_TEST_RUN">Stress Test Run</option>
            <option value="ALLOCATION_COMMITTED">Allocation Committed</option>
          </select>
          <input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400" />
          <input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none focus:border-cyan-400" />
          <button onClick={() => void refreshAudit()} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">
            Apply
          </button>
        </div>
      </Panel>

      <Panel title="Audit Trail">
        {auditRows.length === 0 ? (
          <EmptyState title="No audit events match" copy="Try broadening the date range or action filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Risk Change</th>
                  <th className="pb-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {auditRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-4">{new Date(entry.timestamp).toLocaleString()}</td>
                    <td className="py-4 text-white">{entry.actionType}</td>
                    <td className="py-4">
                      {entry.riskTierBefore ?? "N/A"} to {entry.riskTierAfter ?? "N/A"}
                    </td>
                    <td className="py-4 text-slate-400">{entry.metadata ? JSON.stringify(entry.metadata) : "No metadata"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const renderSettings = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Account">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Email</p>
            <p className="mt-3 text-lg font-medium text-white">{initialData.user.email}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger">
            Log Out
          </button>
        </div>
      </Panel>

      <Panel title="Workspace">
        <div className="space-y-4 text-sm text-slate-300">
          <p>Portfolios in workspace: {portfolioSummaries.length}</p>
          <p>Selected portfolio: {selectedPortfolio?.name ?? "None"}</p>
          <p>Use the holdings tab to add or resize positions, then re-run risk and stress tabs to persist updated analytics.</p>
          <Link className="text-cyan-300" href="https://github.com/sriaratragada/PortRisk" target="_blank">
            View repository
          </Link>
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.08),transparent_20%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/60 px-6 py-5 shadow-panel backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-cyan-300">Portfolio Risk Engine</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Authenticated risk workspace</h1>
            <p className="mt-2 text-sm text-slate-400">
              Logged in as {initialData.user.email}. Persisted portfolios, live search, and compliance-grade history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {portfolioSummaries.length > 0 ? portfolioSelector : null}
            <button
              onClick={() => setActiveTab("holdings")}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
            >
              Add Position
            </button>
          </div>
        </header>

        <nav className="mb-6 flex gap-3 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition",
                activeTab === tab.id
                  ? "bg-cyan-300 text-slate-950"
                  : "border border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {(statusMessage || errorMessage || portfolioLoading || isPending) && (
          <div
            className={cn(
              "mb-6 rounded-2xl px-4 py-3 text-sm",
              errorMessage ? "bg-danger/10 text-danger" : "bg-cyan-400/10 text-cyan-200"
            )}
          >
            {errorMessage ?? statusMessage ?? (portfolioLoading || isPending ? "Updating workspace..." : null)}
          </div>
        )}

        {activeTab === "overview" && renderOverview()}
        {activeTab === "holdings" && renderHoldings()}
        {activeTab === "risk" && renderRisk()}
        {activeTab === "stress" && renderStress()}
        {activeTab === "allocation" && renderAllocation()}
        {activeTab === "audit" && renderAudit()}
        {activeTab === "settings" && renderSettings()}
      </div>
    </div>
  );
}
