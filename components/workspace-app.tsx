"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useState,
  useTransition
} from "react";
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
import { STRESS_SCENARIOS } from "@/lib/portfolio-edge";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  ChartRange,
  CompanyDetail,
  HoldingSnapshot,
  RiskReport,
  RiskTier
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type {
  AuditEntryView,
  PortfolioSummary,
  WorkspaceData,
  WorkspacePortfolio
} from "@/lib/workspace-data";

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
  currentPrice?: number | null;
  changePercent?: number | null;
};

type PortfolioCardStats = {
  portfolioValue: number | null;
  dailyPnl: number | null;
  topWeight: number | null;
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

const chartRanges: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];

const portfolioTemplates = [
  { name: "Growth", benchmark: "QQQ", description: "Focused on high capital appreciation through stock-heavy exposure and long-duration risk." },
  { name: "Income", benchmark: "SCHD", description: "Built for recurring cash flow using dividend-paying equities and income-oriented holdings." },
  { name: "Balanced", benchmark: "AOR", description: "A hybrid allocation that blends growth and income across stocks and bonds." },
  { name: "Defensive/Conservative", benchmark: "AGG", description: "Prioritizes capital preservation with lower-volatility exposures and cash-like resilience." },
  { name: "Speculative", benchmark: "ARKK", description: "High-risk, high-reward positioning intended for tactical and short-term market opportunities." }
] as const;

const tierStyles: Record<RiskTier, string> = {
  LOW: "bg-success/15 text-success ring-success/30",
  MODERATE: "bg-warning/15 text-warning ring-warning/30",
  ELEVATED: "bg-elevated/15 text-elevated ring-elevated/30",
  HIGH: "bg-danger/15 text-danger ring-danger/30"
};

const signalStyles = {
  INFO: "border-slate-700 bg-slate-900/70 text-slate-200",
  WATCH: "border-warning/40 bg-warning/10 text-warning",
  HIGH: "border-danger/40 bg-danger/10 text-danger"
} as const;

function Panel({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "animate-[fadeIn_220ms_ease-out] rounded-[2rem] border border-white/10 bg-panel/80 p-6 shadow-panel backdrop-blur-xl",
        className
      )}
    >
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
    <span className={cn("rounded-md px-3 py-1 text-xs font-semibold ring-1", tierStyles[tier])}>
      {tier}
    </span>
  );
}

function MetricStat({
  label,
  value,
  helper,
  tone = "default"
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold tracking-[-0.03em]",
          tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-white"
        )}
      >
        {value}
      </p>
      {helper ? <p className="mt-2 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );
}

function InfoPill({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-medium",
          tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-white"
        )}
      >
        {value}
      </p>
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
    <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <h3 className="text-2xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">{copy}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function mapSummary(
  portfolios: Array<{
    id: string;
    name: string;
    updatedAt: string;
    positions: unknown[];
    riskScores: Array<{ riskTier: string }>;
  }>
) {
  return portfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    updatedAt: portfolio.updatedAt,
    positionCount: portfolio.positions.length,
    latestRiskTier: portfolio.riskScores[0]?.riskTier ?? null
  })) satisfies PortfolioSummary[];
}

function buildPortfolioHistory(
  series: Array<{ date: string; value: number }>,
  range: ChartRange
) {
  let peak = 0;
  return series.map((point) => {
    peak = Math.max(peak, point.value);
    const timestamp = new Date(point.date);
    const label =
      range === "1D"
        ? timestamp.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })
        : range === "1W" || range === "1M" || range === "3M"
          ? timestamp.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric"
            })
          : timestamp.toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit"
            });
    return {
      date: point.date,
      label,
      value: point.value,
      peak,
      drawdown: point.value - peak
    };
  });
}

function formatBigNumber(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatCompactDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function benchmarkForName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("growth")) return "QQQ";
  if (lower.includes("income")) return "SCHD";
  if (lower.includes("balanced")) return "AOR";
  if (lower.includes("defensive") || lower.includes("conservative")) return "AGG";
  if (lower.includes("speculative")) return "ARKK";
  return "SPY";
}

function RangeSelector({
  value,
  onChange
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {chartRanges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition duration-200",
            value === range
              ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.14)]"
              : "text-zinc-500 hover:text-white"
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter = formatCurrency
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length || typeof payload[0]?.value !== "number") {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/92 px-3 py-2 shadow-2xl backdrop-blur">
      {label ? <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p> : null}
      <p className="mt-1 text-sm font-medium text-white">{formatter(payload[0].value)}</p>
    </div>
  );
}

function topConcentration(holdings: HoldingSnapshot[]) {
  return holdings
    .slice()
    .sort((left, right) => right.weight - left.weight)[0] ?? null;
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error ?? data.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function WorkspaceApp({ initialData }: { initialData: WorkspaceData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [portfolioSummaries, setPortfolioSummaries] = useState(initialData.portfolios);
  const [selectedPortfolio, setSelectedPortfolio] = useState<WorkspacePortfolio | null>(
    initialData.selectedPortfolio
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    initialData.selectedPortfolio?.id ?? ""
  );
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [positionTicker, setPositionTicker] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionShares, setPositionShares] = useState("10");
  const [positionAvgCost, setPositionAvgCost] = useState("100");
  const [positionAssetClass, setPositionAssetClass] = useState<
    "equities" | "bonds" | "commodities"
  >("equities");
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [createPortfolioName, setCreatePortfolioName] = useState("");
  const [auditRows, setAuditRows] = useState<AuditEntryView[]>(
    initialData.selectedPortfolio?.auditLog ?? []
  );
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
  const [proposedMetrics, setProposedMetrics] =
    useState<WorkspacePortfolio["metrics"]>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [positionPreview, setPositionPreview] = useState<CompanyDetail | null>(null);
  const [positionPreviewLoading, setPositionPreviewLoading] = useState(false);
  const [selectedHoldingDetail, setSelectedHoldingDetail] = useState<CompanyDetail | null>(null);
  const [holdingDetailLoading, setHoldingDetailLoading] = useState(false);
  const [portfolioRange, setPortfolioRange] = useState<ChartRange>("1M");
  const [holdingRange, setHoldingRange] = useState<ChartRange>("1M");
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null);
  const [riskReportLoading, setRiskReportLoading] = useState(false);
  const [portfolioCardStats, setPortfolioCardStats] = useState<
    Record<string, PortfolioCardStats>
  >(() =>
    initialData.selectedPortfolio
      ? {
          [initialData.selectedPortfolio.id]: {
            portfolioValue: initialData.selectedPortfolio.metrics?.portfolioValue ?? null,
            dailyPnl: initialData.selectedPortfolio.holdings.reduce(
              (sum, holding) => sum + holding.dailyPnl,
              0
            ),
            topWeight: topConcentration(initialData.selectedPortfolio.holdings)?.weight ?? null
          }
        }
      : {}
  );
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

  function updateSelectedPortfolioSnapshot(
    portfolio: Pick<WorkspacePortfolio, "id" | "holdings" | "metrics">
  ) {
    setPortfolioCardStats((current) => ({
      ...current,
      [portfolio.id]: {
        portfolioValue: portfolio.metrics?.portfolioValue ?? null,
        dailyPnl: portfolio.holdings.reduce((sum, holding) => sum + holding.dailyPnl, 0),
        topWeight: topConcentration(portfolio.holdings)?.weight ?? null
      }
    }));
  }

  useEffect(() => {
    if (!selectedPortfolio) {
      setAllocationWeights({});
      setProposedMetrics(null);
      setRiskReport(null);
      return;
    }

    setAuditRows(selectedPortfolio.auditLog);
    setAllocationWeights(
      Object.fromEntries(
        selectedPortfolio.holdings.map((holding) => [holding.ticker, holding.weight])
      )
    );
    setProposedMetrics(selectedPortfolio.metrics);
    updateSelectedPortfolioSnapshot(selectedPortfolio);
  }, [selectedPortfolio]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setHighlightedSearchIndex(-1);
      return;
    }

    const handle = window.setTimeout(async () => {
      const response = await fetch(
        `/api/portfolio/search?q=${encodeURIComponent(searchTerm)}`
      );
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
    const ticker = positionTicker.trim().toUpperCase();
    if (!ticker) {
      setPositionPreview(null);
      setPositionPreviewLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setPositionPreviewLoading(true);
      try {
        const response = await fetch(`/api/company/${encodeURIComponent(ticker)}`, {
          headers: {
            ...(await getAuthHeaders())
          }
        });
        if (!response.ok) {
          setPositionPreview(null);
          return;
        }
        const data = (await response.json()) as { detail: CompanyDetail };
        setPositionPreview(data.detail);
      } finally {
        setPositionPreviewLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(handle);
  }, [positionTicker]);

  useEffect(() => {
    if (!selectedPortfolio || activeTab !== "allocation" || selectedPortfolio.holdings.length === 0) {
      return;
    }

    const totalWeight = Object.values(allocationWeights).reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0 || !selectedPortfolio.metrics) {
      return;
    }

    const handle = window.setTimeout(async () => {
      const normalized = Object.fromEntries(
        Object.entries(allocationWeights).map(([ticker, weight]) => [ticker, weight / totalWeight])
      );
      const proposedPositions = selectedPortfolio.holdings.map((holding) => {
        const targetValue =
          (selectedPortfolio.metrics?.portfolioValue ?? 0) *
          (normalized[holding.ticker] ?? 0);
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

      const data = (await response.json()) as {
        metrics?: WorkspacePortfolio["metrics"];
      };
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
        setSelectedPortfolio((current) => {
          if (!current || current.id !== selectedPortfolioId) {
            return current;
          }
          const nextPortfolio = {
            ...current,
            holdings:
              (payload.holdings as WorkspacePortfolio["holdings"]) ?? current.holdings,
            metrics:
              (payload.metrics as WorkspacePortfolio["metrics"]) ?? current.metrics
          };
          updateSelectedPortfolioSnapshot(nextPortfolio);
          return nextPortfolio;
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedPortfolioId]);

  useEffect(() => {
    if (
      !selectedPortfolio ||
      selectedPortfolio.holdings.length === 0 ||
      (activeTab !== "risk" && activeTab !== "overview")
    ) {
      return;
    }

    const controller = new AbortController();
    const portfolioId = selectedPortfolio.id;

    async function loadRiskReport() {
      setRiskReportLoading(true);
      try {
        const response = await fetch(
          `/api/risk/report?portfolioId=${portfolioId}`,
          {
            signal: controller.signal,
            headers: {
              ...(await getAuthHeaders())
            }
          }
        );
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setRiskReport(null);
          }
          return;
        }
        const data = (await response.json()) as { report: RiskReport };
        if (!controller.signal.aborted) {
          setRiskReport(data.report);
        }
      } finally {
        if (!controller.signal.aborted) {
          setRiskReportLoading(false);
        }
      }
    }

    void loadRiskReport();
    return () => controller.abort();
  }, [activeTab, selectedPortfolio?.id, selectedPortfolio?.holdings.length]);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    let cancelled = false;
    setPortfolioLoading(true);
    void loadPortfolioHistory(selectedPortfolioId, portfolioRange)
      .then((history) => {
        if (cancelled) return;
        setSelectedPortfolio((current) =>
          current && current.id === selectedPortfolioId
            ? {
                ...current,
                valueHistory: history
              }
            : current
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load history");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPortfolioLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [portfolioRange, selectedPortfolioId]);

  useEffect(() => {
    if (!statusMessage && !errorMessage) {
      return;
    }
    const handle = window.setTimeout(() => {
      setStatusMessage(null);
      setErrorMessage(null);
    }, 3500);
    return () => window.clearTimeout(handle);
  }, [statusMessage, errorMessage]);

  useEffect(() => {
    if (!selectedHoldingDetail?.ticker) {
      return;
    }

    let cancelled = false;
    setHoldingDetailLoading(true);
    void loadHoldingDetail(selectedHoldingDetail.ticker, holdingRange)
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load company detail"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHoldingDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [holdingRange, selectedHoldingDetail?.ticker]);

  const selectedMetrics = selectedPortfolio?.metrics ?? null;
  const dailyPnl = useMemo(
    () => selectedPortfolio?.holdings.reduce((sum, holding) => sum + holding.dailyPnl, 0) ?? 0,
    [selectedPortfolio]
  );
  const dailyPnlPercent = useMemo(
    () =>
      selectedPortfolio?.holdings.reduce(
        (sum, holding) => sum + holding.dailyPnlPercent * holding.weight,
        0
      ) ?? 0,
    [selectedPortfolio]
  );
  const sortedHoldings = useMemo(
    () =>
      selectedPortfolio?.holdings
        .slice()
        .sort((left, right) => right.currentValue - left.currentValue) ?? [],
    [selectedPortfolio]
  );
  const totalReturn = useMemo(
    () => selectedPortfolio?.holdings.reduce((sum, holding) => sum + holding.totalGain, 0) ?? 0,
    [selectedPortfolio]
  );
  const totalReturnPercent = useMemo(() => {
    const currentValue =
      selectedPortfolio?.holdings.reduce((sum, holding) => sum + holding.currentValue, 0) ?? 0;
    const costBasis = currentValue - totalReturn;
    return costBasis > 0 ? totalReturn / costBasis : 0;
  }, [selectedPortfolio, totalReturn]);
  const biggestGainer = useMemo(
    () =>
      sortedHoldings
        .filter((holding) => holding.dailyPnl > 0)
        .sort((left, right) => right.dailyPnl - left.dailyPnl)[0] ?? null,
    [sortedHoldings]
  );
  const biggestLoser = useMemo(
    () =>
      sortedHoldings
        .filter((holding) => holding.dailyPnl < 0)
        .sort((left, right) => left.dailyPnl - right.dailyPnl)[0] ?? null,
    [sortedHoldings]
  );
  const medianWeight = useMemo(
    () => median(sortedHoldings.map((holding) => holding.weight)),
    [sortedHoldings]
  );
  const topThreeConcentration = useMemo(
    () => sortedHoldings.slice(0, 3).reduce((sum, holding) => sum + holding.weight, 0),
    [sortedHoldings]
  );
  const portfolioRangePerformance = useMemo(() => {
    const history = selectedPortfolio?.valueHistory ?? [];
    if (history.length < 2) {
      return { absolute: 0, percent: 0 };
    }
    const first = history[0]?.value ?? 0;
    const last = history[history.length - 1]?.value ?? 0;
    const absolute = last - first;
    return {
      absolute,
      percent: first > 0 ? absolute / first : 0
    };
  }, [selectedPortfolio?.valueHistory]);
  const holdingRangePerformance = useMemo(() => {
    const history = selectedHoldingDetail?.chart ?? [];
    if (history.length < 2) {
      return { absolute: 0, percent: 0 };
    }
    const first = history[0]?.close ?? 0;
    const last = history[history.length - 1]?.close ?? 0;
    const absolute = last - first;
    return {
      absolute,
      percent: first > 0 ? absolute / first : 0
    };
  }, [selectedHoldingDetail?.chart]);

  async function refreshPortfolioList() {
    const response = await fetch("/api/portfolio", {
      headers: {
        ...(await getAuthHeaders())
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
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

  async function loadPortfolioHistory(portfolioId: string, range: ChartRange) {
    const response = await fetch(
      `/api/portfolio/${portfolioId}/history?range=${range}`,
      {
        headers: {
          ...(await getAuthHeaders())
        }
      }
    );
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as {
      series: Array<{ date: string; value: number }>;
    };
    return buildPortfolioHistory(data.series, range);
  }

  async function loadHoldingDetail(ticker: string, range: ChartRange) {
    const response = await fetch(
      `/api/company/${encodeURIComponent(ticker)}?range=${range}`,
      {
        headers: {
          ...(await getAuthHeaders())
        }
      }
    );
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as { detail: CompanyDetail };
    setSelectedHoldingDetail(data.detail);
  }

  async function loadPortfolio(portfolioId: string) {
    setPortfolioLoading(true);
    setErrorMessage(null);

    try {
      const authHeaders = await getAuthHeaders();
      const [portfolioResponse, riskResponse, history] = await Promise.all([
        fetch(`/api/portfolio/${portfolioId}`, {
          headers: authHeaders
        }),
        fetch("/api/risk/score", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders
          },
          body: JSON.stringify({
            portfolioId,
            persist: false
          })
        }),
        loadPortfolioHistory(portfolioId, portfolioRange)
      ]);

      if (!portfolioResponse.ok) {
        throw new Error(await readErrorMessage(portfolioResponse));
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
        valueHistory: history,
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
      }

      setSelectedPortfolio(nextPortfolio);
      setSelectedPortfolioId(portfolioId);
      setAuditRows(nextPortfolio.auditLog);
      setRiskReport(null);
      setStressResult(null);
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

    const response = await fetch(`/api/audit?${params.toString()}`, {
      headers: {
        ...(await getAuthHeaders())
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as { items: AuditEntryView[] };
    setAuditRows(data.items);
  }

  async function createPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = createPortfolioName.trim();
    if (!nextName) {
      setErrorMessage("Enter a portfolio name.");
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      setStatusMessage(null);
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await getAuthHeaders())
          },
          body: JSON.stringify({
            name: nextName,
            positions: []
          })
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as { portfolio: { id: string } };
        setCreatePortfolioName("");
        await refreshPortfolioList();
        await loadPortfolio(data.portfolio.id);
        setActiveTab("holdings");
        setStatusMessage(`Portfolio "${nextName}" created.`);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to create portfolio"
        );
      }
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
      setHighlightedSearchIndex((current) =>
        Math.min(current + 1, searchResults.length - 1)
      );
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
    setPositionPreview(null);
  }

  async function commitPositions(
    nextPositions: WorkspacePortfolio["positions"],
    successMessage: string
  ) {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      setStatusMessage(null);
      try {
        const response = await fetch(`/api/portfolio/${selectedPortfolio.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await getAuthHeaders())
          },
          body: JSON.stringify({
            positions: nextPositions
          })
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        await loadPortfolio(selectedPortfolio.id);
        await refreshPortfolioList();
        setStatusMessage(successMessage);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to update portfolio"
        );
      }
    });
  }

  async function handlePositionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPortfolio) {
      setErrorMessage("Create or select a portfolio first.");
      return;
    }

    const normalizedTicker = (positionTicker || searchTerm.split(/\s+/)[0] || "")
      .trim()
      .toUpperCase();
    const shares = Number(positionShares);
    const avgCost = Number(positionAvgCost);

    if (!normalizedTicker) {
      setErrorMessage("Choose a ticker before adding a position.");
      return;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      setErrorMessage("Shares must be greater than zero.");
      return;
    }
    if (!Number.isFinite(avgCost) || avgCost <= 0) {
      setErrorMessage("Average cost must be greater than zero.");
      return;
    }

    const nextPosition = {
      ticker: normalizedTicker,
      shares,
      avgCost,
      assetClass: positionAssetClass
    } as WorkspacePortfolio["positions"][number];

    const existing = selectedPortfolio.positions.find(
      (position) => position.ticker === normalizedTicker
    );
    const remaining = selectedPortfolio.positions.filter(
      (position) => position.ticker !== normalizedTicker
    );
    const actionLabel =
      editingTicker || existing ? "Position updated." : "Position added.";

    await commitPositions([...remaining, nextPosition], actionLabel);
    resetPositionForm();
  }

  function startEditingPosition(ticker: string) {
    if (!selectedPortfolio) {
      return;
    }

    const position = selectedPortfolio.positions.find((entry) => entry.ticker === ticker);
    const holding = selectedPortfolio.holdings.find((entry) => entry.ticker === ticker);
    if (!position) {
      return;
    }

    setEditingTicker(position.ticker);
    setPositionTicker(position.ticker);
    setPositionName(holding?.companyName ?? position.ticker);
    setSearchTerm(
      holding?.companyName ? `${position.ticker} ${holding.companyName}` : position.ticker
    );
    setPositionShares(String(position.shares));
    setPositionAvgCost(String(position.avgCost));
    setPositionAssetClass(position.assetClass);
    setActiveTab("holdings");
  }

  async function removePosition(ticker: string) {
    if (!selectedPortfolio) {
      return;
    }

    const nextPositions = selectedPortfolio.positions.filter(
      (position) => position.ticker !== ticker
    );
    await commitPositions(nextPositions, `${ticker} removed from portfolio.`);
  }

  async function openHoldingDetail(ticker: string) {
    setHoldingDetailLoading(true);
    setSelectedHoldingDetail(null);
    try {
      await loadHoldingDetail(ticker, holdingRange);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load company detail"
      );
    } finally {
      setHoldingDetailLoading(false);
    }
  }

  async function rerunRiskScore(persist: boolean) {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      try {
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
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as {
          holdings?: WorkspacePortfolio["holdings"];
          metrics?: WorkspacePortfolio["metrics"];
          series?: Array<{ date: string; value: number }>;
        };
        setSelectedPortfolio((current) => {
          if (!current) {
            return current;
          }
          const nextPortfolio = {
            ...current,
            holdings: data.holdings ?? current.holdings,
            metrics: data.metrics ?? current.metrics,
            valueHistory: data.series
              ? buildPortfolioHistory(data.series, portfolioRange)
              : current.valueHistory
          };
          updateSelectedPortfolioSnapshot(nextPortfolio);
          return nextPortfolio;
        });
        if (persist) {
          await refreshPortfolioList();
          await refreshAudit();
          setRiskReport(null);
          setStatusMessage("Risk score refreshed.");
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Risk scoring failed");
      }
    });
  }

  async function runStressScenario() {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      try {
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
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as Record<string, unknown>;
        setStressResult(data);
        await loadPortfolio(selectedPortfolio.id);
        setStatusMessage("Stress test completed.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Stress test failed");
      }
    });
  }

  async function commitAllocation() {
    if (!selectedPortfolio || !selectedMetrics) {
      return;
    }

    const totalWeight = Object.values(allocationWeights).reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0) {
      setErrorMessage("Target weights must sum to more than zero.");
      return;
    }

    const normalized = Object.fromEntries(
      Object.entries(allocationWeights).map(([ticker, weight]) => [ticker, weight / totalWeight])
    );
    const nextPositions = selectedPortfolio.holdings.map((holding) => {
      const targetValue =
        selectedMetrics.portfolioValue * (normalized[holding.ticker] ?? 0);
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
      className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35 focus:bg-black/65"
      value={selectedPortfolioId}
      onChange={(event) => {
        const nextId = event.target.value;
        if (!nextId) {
          return;
        }
        void loadPortfolio(nextId);
      }}
    >
      <option value="" disabled>
        Select a portfolio
      </option>
      {portfolioSummaries.map((portfolio) => (
        <option key={portfolio.id} value={portfolio.id}>
          {portfolio.name}
        </option>
      ))}
    </select>
  );

  const renderOverview = () => {
    const selectedTopHolding = selectedPortfolio
      ? topConcentration(selectedPortfolio.holdings)
      : null;

    return (
      <div className="space-y-6">
        <Panel title="Portfolio Summary Strip">
          {!selectedPortfolio ? (
            <EmptyState
              title="Create your first strategy sleeve"
                copy="Build separate growth, income, balanced, defensive, or speculative sleeves and track each strategy with its own risk state."
              action={
                <form
                  onSubmit={createPortfolio}
                  className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row"
                >
                  <input
                    value={createPortfolioName}
                    onChange={(event) => setCreatePortfolioName(event.target.value)}
                      placeholder="Growth"
                    className="flex-1 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                  />
                    <button className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
                      Create Portfolio
                    </button>
                </form>
              }
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-7">
              <InfoPill label="Portfolio" value={selectedPortfolio.name} />
              <InfoPill
                label="Value"
                value={selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "N/A"}
              />
              <InfoPill
                label="Day Change"
                value={formatCurrency(dailyPnl)}
                tone={dailyPnl >= 0 ? "positive" : "negative"}
              />
              <InfoPill
                label={`${portfolioRange} Return`}
                value={`${formatCurrency(portfolioRangePerformance.absolute)} • ${formatPercent(
                  portfolioRangePerformance.percent
                )}`}
                tone={portfolioRangePerformance.absolute >= 0 ? "positive" : "negative"}
              />
              <InfoPill label="Risk Tier" value={selectedMetrics?.riskTier ?? "Unscored"} />
              <InfoPill label="Benchmark" value={benchmarkForName(selectedPortfolio.name)} />
              <InfoPill label="Positions" value={`${selectedPortfolio.positions.length}`} />
            </div>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
          <Panel
            title="Portfolio Command"
            action={
              selectedMetrics ? (
                <TierBadge tier={selectedMetrics.riskTier} />
              ) : (
                <span className="text-xs text-slate-500">Unfunded</span>
              )
            }
          >
            {!selectedPortfolio ? (
              <EmptyState
                title="No active portfolio selected"
                copy="Use the selector above or create a sleeve to populate the dashboard."
              />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-500">
                    {selectedPortfolio.name} • Benchmark {benchmarkForName(selectedPortfolio.name)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <h2 className="text-5xl font-semibold tracking-[-0.05em] text-white">
                      {selectedMetrics
                        ? formatCurrency(selectedMetrics.portfolioValue)
                        : "Awaiting positions"}
                    </h2>
                    {selectedMetrics ? (
                      <div
                        className={cn(
                          "rounded-lg px-3.5 py-1.5 text-sm font-medium",
                          dailyPnl >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                        )}
                      >
                        {formatCurrency(dailyPnl)} / {formatPercent(dailyPnlPercent)}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
                    {selectedMetrics?.summary ??
                      "This sleeve has no positions yet. Add holdings to start live valuation and risk scoring."}
                  </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoPill label="Positions" value={`${selectedPortfolio.positions.length}`} />
                    <InfoPill label="Updated" value={formatCompactDate(selectedPortfolio.updatedAt)} />
                    <InfoPill
                      label="Top Weight"
                      value={
                        selectedTopHolding
                          ? `${selectedTopHolding.ticker} ${formatPercent(selectedTopHolding.weight)}`
                          : "N/A"
                      }
                    />
                    <InfoPill
                      label="Top Sector"
                      value={
                        riskReport?.sectorConcentration[0]
                          ? `${riskReport.sectorConcentration[0].sector} ${formatPercent(riskReport.sectorConcentration[0].weight)}`
                          : "Loading"
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <MetricStat
                    label="Sharpe Ratio"
                    value={selectedMetrics ? selectedMetrics.sharpe.toFixed(2) : "N/A"}
                  />
                  <MetricStat
                    label="VaR (95%)"
                    value={selectedMetrics ? formatPercent(selectedMetrics.var95) : "N/A"}
                  />
                  <MetricStat
                    label="Max Drawdown"
                    value={selectedMetrics ? formatPercent(selectedMetrics.maxDrawdown) : "N/A"}
                  />
                  <MetricStat
                    label="Annual Volatility"
                    value={
                      selectedMetrics
                        ? formatPercent(selectedMetrics.annualizedVolatility)
                        : "N/A"
                    }
                  />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Execution Stack" action={<span className="text-xs text-slate-500">At a glance</span>}>
            <div className="space-y-3">
              <div className="grid gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Top mover</p>
                  <p className="mt-2 text-lg font-semibold text-white">{biggestGainer?.ticker ?? "N/A"}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {biggestGainer ? `${formatCurrency(biggestGainer.dailyPnl)} today` : "No positive movers yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Lagging name</p>
                  <p className="mt-2 text-lg font-semibold text-white">{biggestLoser?.ticker ?? "N/A"}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {biggestLoser ? `${formatCurrency(biggestLoser.dailyPnl)} today` : "No negative movers yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Portfolio templates</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {portfolioTemplates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => setCreatePortfolioName(template.name)}
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <form onSubmit={createPortfolio} className="space-y-3">
                <input
                  value={createPortfolioName}
                  onChange={(event) => setCreatePortfolioName(event.target.value)}
                  placeholder="Balanced"
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                <button className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
                  Create New Portfolio
                </button>
              </form>
            </div>
          </Panel>
        </div>

        <Panel title="Portfolio Comparison Strip">
          {portfolioSummaries.length === 0 ? (
            <EmptyState
              title="No portfolios yet"
              copy="Create sleeves for large cap, mid cap, small cap, or flexicap and compare them here."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-4">
              {portfolioSummaries.map((portfolio) => {
                const stats = portfolioCardStats[portfolio.id];
                return (
                  <button
                    key={portfolio.id}
                    onClick={() => void loadPortfolio(portfolio.id)}
                    className={cn(
                      "rounded-[1.5rem] border p-5 text-left transition duration-200 hover:-translate-y-0.5",
                      selectedPortfolioId === portfolio.id
                        ? "border-white/30 bg-white/[0.05]"
                        : "border-white/10 bg-black/30 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{portfolio.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                          {portfolio.positionCount} positions
                        </p>
                      </div>
                      {portfolio.latestRiskTier ? (
                        <TierBadge tier={portfolio.latestRiskTier as RiskTier} />
                      ) : (
                        <span className="text-xs text-slate-500">Unscored</span>
                      )}
                    </div>
                    <div className="mt-5 space-y-2 text-sm">
                      <p className="text-slate-400">
                        Value:{" "}
                        <span className="font-medium text-white">
                          {stats?.portfolioValue != null
                            ? formatCurrency(stats.portfolioValue)
                            : "Load to price"}
                        </span>
                      </p>
                      <p
                        className={cn(
                          "text-slate-400",
                          (stats?.dailyPnl ?? 0) >= 0 ? "text-success" : "text-danger"
                        )}
                      >
                        Daily:{" "}
                        <span className="font-medium">
                          {stats?.dailyPnl != null
                            ? formatCurrency(stats.dailyPnl)
                            : "Load to price"}
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Top concentration:{" "}
                        <span className="font-medium text-white">
                          {stats?.topWeight != null ? formatPercent(stats.topWeight) : "N/A"}
                        </span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel
            title="Portfolio Performance"
            action={
              <div className="flex items-center gap-3">
                <RangeSelector value={portfolioRange} onChange={setPortfolioRange} />
                <button
                  onClick={() => void rerunRiskScore(true)}
                  className="text-sm text-zinc-300 transition hover:text-white"
                >
                  Re-run Risk
                </button>
              </div>
            }
          >
            {!selectedPortfolio || selectedPortfolio.valueHistory.length === 0 ? (
              <EmptyState
                title="No performance curve yet"
                copy="Add holdings to populate a trailing portfolio value history."
              />
            ) : (
              <div className="rounded-[1.8rem] border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Value curve</p>
                    <p className="mt-2 text-lg font-medium text-white">
                      {selectedPortfolio.name} over {portfolioRange}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <InfoPill
                      label="Current"
                      value={selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "N/A"}
                    />
                    <InfoPill
                      label="Day Move"
                      value={formatCurrency(dailyPnl)}
                      tone={dailyPnl >= 0 ? "positive" : "negative"}
                    />
                  </div>
                </div>
                <div className="h-80 animate-[fadeIn_220ms_ease-out]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedPortfolio.valueHistory}>
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      minTickGap={22}
                    />
                    <YAxis
                      tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                    />
                    <Tooltip content={<ChartTooltip formatter={formatCurrency} />} />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      fill="rgba(239,68,68,0.12)"
                      stroke="rgba(239,68,68,0.2)"
                    />
                    <Line
                      type="monotone"
                      dataKey="peak"
                      stroke="rgba(255,255,255,0.22)"
                      dot={false}
                      strokeWidth={1.2}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#fafafa"
                      dot={false}
                      strokeWidth={2.5}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              </div>
            )}
          </Panel>

          <Panel title="Concentration Watch">
            {!selectedPortfolio || selectedPortfolio.holdings.length === 0 ? (
              <EmptyState
                title="No concentration data"
                copy="Add holdings to surface sector and single-name concentration warnings."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Largest Position
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {selectedTopHolding?.ticker ?? "N/A"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {selectedTopHolding
                      ? `${formatPercent(selectedTopHolding.weight)} of portfolio value`
                      : "No holdings yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Primary Sector
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {riskReport?.sectorConcentration[0]?.sector ?? "Loading"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {riskReport?.sectorConcentration[0]
                      ? `${formatPercent(riskReport.sectorConcentration[0].weight)} portfolio weight`
                      : "Sector analysis appears once the risk report is loaded."}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-sm leading-7 text-slate-300">
                    {riskReport?.summary ??
                      "The risk narrative will summarize concentration, market regime, and balance-sheet resilience here."}
                  </p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    );
  };

  const renderHoldings = () => (
    <div className="space-y-6">
      <Panel title="Holdings Command Strip">
        {!selectedPortfolio ? (
          <EmptyState
            title="No portfolio selected"
            copy="Select a sleeve to monitor holdings, top movers, and concentration."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-6">
            <InfoPill label="Selected" value={selectedPortfolio.name} />
            <InfoPill
              label="Portfolio Value"
              value={selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "N/A"}
            />
            <InfoPill
              label="Day Change"
              value={formatCurrency(dailyPnl)}
              tone={dailyPnl >= 0 ? "positive" : "negative"}
            />
            <InfoPill label="Holdings" value={`${sortedHoldings.length}`} />
            <InfoPill label="Median Weight" value={formatPercent(medianWeight)} />
            <InfoPill label="Top 3 Weight" value={formatPercent(topThreeConcentration)} />
          </div>
        )}
      </Panel>

      <Panel
        title="Portfolio Performance"
        action={<RangeSelector value={portfolioRange} onChange={setPortfolioRange} />}
      >
        {!selectedPortfolio || selectedPortfolio.valueHistory.length === 0 ? (
          <EmptyState
            title="No performance history yet"
            copy="Select a portfolio and add holdings to see 1D through MAX performance."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
                    {selectedPortfolio.name}
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">
                    {selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "Awaiting price"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {portfolioRange} return {formatCurrency(portfolioRangePerformance.absolute)} •{" "}
                    {formatPercent(portfolioRangePerformance.percent)}
                  </p>
                </div>
                <div
                  className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium",
                    dailyPnl >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                  )}
                >
                  {formatCurrency(dailyPnl)} / {formatPercent(dailyPnlPercent)}
                </div>
              </div>
              <div className="mt-4 h-72 animate-[fadeIn_220ms_ease-out]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedPortfolio.valueHistory}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} minTickGap={24} />
                    <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip content={<ChartTooltip formatter={formatCurrency} />} />
                    <Area type="monotone" dataKey="drawdown" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.18)" />
                    <Line type="monotone" dataKey="peak" stroke="rgba(255,255,255,0.18)" dot={false} strokeWidth={1.1} />
                    <Line type="monotone" dataKey="value" stroke="#fafafa" dot={false} strokeWidth={2.4} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Biggest gainer</p>
                <p className="mt-2 text-lg font-semibold text-white">{biggestGainer?.ticker ?? "N/A"}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {biggestGainer
                    ? `${formatCurrency(biggestGainer.dailyPnl)} • ${formatPercent(biggestGainer.dailyPnlPercent)}`
                    : "No positive movers"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Biggest loser</p>
                <p className="mt-2 text-lg font-semibold text-white">{biggestLoser?.ticker ?? "N/A"}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {biggestLoser
                    ? `${formatCurrency(biggestLoser.dailyPnl)} • ${formatPercent(biggestLoser.dailyPnlPercent)}`
                    : "No negative movers"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Concentration</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {topConcentration(sortedHoldings)?.ticker ?? "N/A"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {topConcentration(sortedHoldings)
                    ? `${formatPercent(topConcentration(sortedHoldings)?.weight ?? 0)} top weight`
                    : "No holdings yet"}
                </p>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Current Holdings" action={<span className="text-xs text-slate-500">Portfolio-scoped</span>}>
          {!selectedPortfolio ? (
            <EmptyState
              title="Select or create a portfolio"
              copy="Each holding belongs to a specific sleeve. Create a portfolio, then add positions into it."
            />
          ) : sortedHoldings.length === 0 ? (
            <EmptyState
              title="No positions yet"
              copy="Search by ticker and add your first NYSE-listed equity or ETF to begin live risk monitoring."
            />
          ) : (
            <div className="space-y-2">
              {sortedHoldings.map((holding) => (
                <button
                  key={holding.ticker}
                  type="button"
                  onClick={() => void openHoldingDetail(holding.ticker)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-left transition duration-200 hover:border-white/25 hover:bg-white/[0.045]"
                >
                  <div className="grid gap-4 xl:grid-cols-[0.9fr_1.35fr_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-white">{holding.ticker}</p>
                        <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                          {holding.assetClass ?? "equities"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{holding.companyName ?? holding.ticker}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                        {holding.exchange ?? "Exchange N/A"}
                      </p>
                    </div>

                    <div className="grid min-w-[250px] gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Price</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(holding.currentPrice)}</p>
                        <p className={cn("mt-1 text-xs", holding.dailyPnl >= 0 ? "text-success" : "text-danger")}>
                          {formatCurrency(holding.dailyPnl)} today
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Position</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(holding.currentValue)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatPercent(holding.weight)} weight</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Return</p>
                        <p className={cn("mt-1 text-lg font-semibold", holding.totalGain >= 0 ? "text-success" : "text-danger")}>
                          {formatCurrency(holding.totalGain)} • {formatPercent(holding.totalGainPercent)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Avg {formatCurrency(holding.avgCost)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Exposure</p>
                        <p className="mt-1 text-lg font-semibold text-white">{holding.shares.toFixed(2)} sh</p>
                        <p className="mt-1 text-xs text-slate-500">{holding.assetClass ?? "equities"}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingPosition(holding.ticker);
                        }}
                        className="rounded-lg border border-white/12 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.04]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removePosition(holding.ticker);
                        }}
                        className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={editingTicker ? "Edit Position" : "Add Position"}>
          {!selectedPortfolio ? (
            <EmptyState
              title="No portfolio selected"
              copy="Create a portfolio first. Holdings are always saved into the active portfolio."
            />
          ) : (
            <form onSubmit={handlePositionSubmit} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Target portfolio</span>
                {portfolioSelector}
              </label>
              <div className="relative">
                <label className="mb-2 block text-sm text-slate-300">Search listed ticker</label>
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPositionTicker("");
                    setPositionName("");
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="AAPL, KO, XOM..."
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/95 shadow-2xl">
                    {searchResults.map((result, index) => (
                      <button
                        key={`${result.symbol}-${result.exchange}`}
                        type="button"
                        onClick={() => applySearchResult(result)}
                        className={cn(
                          "flex w-full items-start justify-between gap-4 px-4 py-3 text-left text-sm transition",
                          index === highlightedSearchIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white">{result.symbol}</p>
                            {result.currentPrice != null ? (
                              <span className="text-xs text-slate-400">{formatCurrency(result.currentPrice)}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-slate-400">{result.shortname}</p>
                        </div>
                        <div className="text-right text-xs uppercase tracking-[0.2em] text-slate-500">
                          <p>{result.exchange}</p>
                          <p className="mt-1">{result.quoteType}</p>
                          {result.changePercent != null ? (
                            <p className={cn("mt-1", result.changePercent >= 0 ? "text-success" : "text-danger")}>
                              {formatPercent(result.changePercent)}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Selected security</p>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {positionTicker || "Choose a ticker"}
                    </p>
                    {positionName ? <p className="mt-1 text-sm text-slate-500">{positionName}</p> : null}
                  </div>
                  {positionPreviewLoading ? (
                    <span className="text-sm text-slate-500">Loading quote...</span>
                  ) : positionPreview ? (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Price</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {formatCurrency(positionPreview.currentPrice)}
                      </p>
                    </div>
                  ) : null}
                </div>
                {positionPreview ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Sector</p>
                      <p className="mt-2 text-sm text-white">{positionPreview.sector ?? "Unclassified"}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Market Cap</p>
                      <p className="mt-2 text-sm text-white">{formatBigNumber(positionPreview.marketCap)}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Shares</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={positionShares}
                    onChange={(event) => setPositionShares(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Average cost</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={positionAvgCost}
                    onChange={(event) => setPositionAvgCost(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Asset class</span>
                <select
                  value={positionAssetClass}
                  onChange={(event) =>
                    setPositionAssetClass(event.target.value as "equities" | "bonds" | "commodities")
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                >
                  <option value="equities">Equities</option>
                  <option value="bonds">Bonds</option>
                  <option value="commodities">Commodities</option>
                </select>
              </label>

              {positionPreview ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                  Current market price is pulled live from market data. Average cost remains your entered cost basis.
                </div>
              ) : null}

              <div className="flex gap-3">
              <button className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
                {editingTicker ? "Update Position" : "Add Position"}
              </button>
              {editingTicker ? (
                <button
                  type="button"
                  onClick={resetPositionForm}
                  className="rounded-lg border border-slate-700 px-5 py-3 text-sm text-slate-300"
                >
                  Cancel
                </button>
                ) : null}
              </div>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );

  const renderRisk = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel
          title="Risk Score"
          action={
            selectedMetrics ? (
              <TierBadge tier={selectedMetrics.riskTier} />
            ) : (
              <span className="text-xs text-slate-500">No data</span>
            )
          }
        >
          {!selectedMetrics ? (
            <EmptyState
              title="No risk metrics yet"
              copy="Add positions to calculate risk-adjusted performance and downside metrics."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricStat
                  label="Sharpe Ratio"
                  value={selectedMetrics.sharpe.toFixed(2)}
                  helper="Annualized excess return per unit of volatility."
                />
                <MetricStat
                  label="Maximum Drawdown"
                  value={formatPercent(selectedMetrics.maxDrawdown)}
                  helper="Peak-to-trough loss over the trailing year."
                />
                <MetricStat
                  label="VaR (95%)"
                  value={`${formatPercent(selectedMetrics.var95)} / ${formatCurrency(
                    selectedMetrics.var95Amount
                  )}`}
                  helper="Parametric one-day value at risk."
                />
                <MetricStat
                  label="Annualized Volatility"
                  value={formatPercent(selectedMetrics.annualizedVolatility)}
                />
              </div>
              <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  <InfoPill label="Portfolio Value" value={formatCurrency(selectedMetrics.portfolioValue)} />
                  <InfoPill label="Annual Return" value={formatPercent(selectedMetrics.annualizedReturn)} />
                </div>
                <p className="text-sm leading-7 text-slate-300">{selectedMetrics.summary}</p>
              </div>
              <button
                onClick={() => void rerunRiskScore(true)}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-zinc-200"
              >
                Re-run Risk Score
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Drawdown Probability Term Structure">
          {!selectedMetrics ? (
            <EmptyState
              title="Awaiting portfolio data"
              copy="Risk charts appear once positions have market history."
            />
          ) : (
            <div className="rounded-[1.8rem] border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Forward drawdown risk</p>
                  <p className="mt-2 text-lg font-medium text-white">Monte Carlo term structure</p>
                </div>
                <InfoPill label="Tier" value={selectedMetrics.riskTier} />
              </div>
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
                  <YAxis
                    tickFormatter={(value) => `${Math.round(value * 100)}%`}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                  />
                  <Tooltip content={<ChartTooltip formatter={formatPercent} />} />
                  <Area
                    type="monotone"
                    dataKey="probability"
                    stroke="#fafafa"
                    fill="rgba(255,255,255,0.1)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Qualitative Risk Report"
          action={
            riskReportLoading ? (
              <span className="text-xs text-slate-500">Loading report</span>
            ) : null
          }
        >
          {!selectedPortfolio || selectedPortfolio.holdings.length === 0 ? (
            <EmptyState
              title="No holdings to analyze"
              copy="Add holdings to generate sector, market regime, and balance-sheet commentary."
            />
          ) : riskReport ? (
            <div className="space-y-5">
              <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm leading-7 text-slate-300">{riskReport.summary}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Market Regime</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {riskReport.marketContext.trend}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {riskReport.marketContext.benchmark} trailing return{" "}
                    {formatPercent(riskReport.marketContext.trailingReturn)} with volatility{" "}
                    {formatPercent(riskReport.marketContext.volatility)}.
                  </p>
                </div>
                <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Top Single Name
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {riskReport.singleNameConcentration[0]?.ticker ?? "N/A"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {riskReport.singleNameConcentration[0]
                      ? `${formatPercent(riskReport.singleNameConcentration[0].weight)} weight`
                      : "No concentration data yet."}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Vulnerabilities
                </p>
                <div className="mt-3 space-y-3">
                  {riskReport.vulnerabilities.length > 0 ? (
                    riskReport.vulnerabilities.map((item) => (
                      <div key={item} className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                        {item}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No major vulnerabilities flagged.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Resilience Factors
                </p>
                <div className="mt-3 space-y-3">
                  {riskReport.resilienceFactors.length > 0 ? (
                    riskReport.resilienceFactors.map((item) => (
                      <div key={item} className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                        {item}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">
                      No standout resilience factors detected yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Risk report is loading"
              copy="The engine is pulling sector, broad-market, and balance-sheet context."
            />
          )}
        </Panel>

        <Panel title="Exposure and Balance-Sheet Signals">
          {!riskReport ? (
            <EmptyState
              title="No report data yet"
              copy="Run or refresh risk scoring to populate concentration and company-level signals."
            />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Sector Concentration
                </p>
                <div className="mt-3 space-y-3">
                  {riskReport.sectorConcentration.slice(0, 5).map((sector) => (
                    <div key={sector.sector}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-white">{sector.sector}</span>
                        <span className="text-slate-400">{formatPercent(sector.weight)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-900">
                        <div
                          className="h-2 rounded-full bg-white"
                          style={{ width: `${Math.min(sector.weight * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Top Holdings
                </p>
                <div className="mt-3 space-y-3">
                  {riskReport.singleNameConcentration.slice(0, 5).map((holding) => (
                    <div
                      key={holding.ticker}
                      className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-white">{holding.ticker}</p>
                        <p className="text-sm text-slate-400">{holding.companyName}</p>
                      </div>
                      <span className="text-sm text-slate-300">
                        {formatPercent(holding.weight)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Company Red Flags
                </p>
                <div className="mt-3 space-y-3">
                  {riskReport.balanceSheetSignals.length > 0 ? (
                    riskReport.balanceSheetSignals.map((signal) => (
                      <div
                        key={`${signal.ticker}-${signal.signal}`}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-sm",
                          signalStyles[signal.severity]
                        )}
                      >
                        <p className="font-medium">
                          {signal.ticker} • {signal.companyName}
                        </p>
                        <p className="mt-1">{signal.signal}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">
                      No company-level balance-sheet warnings detected from the available data.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );

  const renderStress = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Scenario Runner">
        <div className="space-y-4">
          <select
            className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
            value={stressScenario}
            onChange={(event) => setStressScenario(event.target.value)}
          >
            {Object.keys(STRESS_SCENARIOS)
              .concat("Custom")
              .map((scenario) => (
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
                    className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                  />
                </label>
              ))}
            </div>
          )}
          <button
            onClick={runStressScenario}
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Run Stress Test
          </button>
          {stressResult ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4 text-sm">
              <p className="font-medium text-white">{String(stressResult.scenarioName)}</p>
              <p className="mt-3 text-slate-300">
                Projected value: {formatCurrency(Number(stressResult.projectedValue ?? 0))}
              </p>
              <p className="mt-2 text-slate-300">
                New tier: {String(stressResult.newRiskTier ?? "N/A")}
              </p>
              <p className="mt-2 text-slate-300">
                Recovery estimate: {Number(stressResult.recoveryDays ?? 0)} days
              </p>
              <p className="mt-3 text-slate-400">{String(stressResult.summary ?? "")}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Recent Stress History">
        {!selectedPortfolio || selectedPortfolio.stressTests.length === 0 ? (
          <EmptyState
            title="No stress runs yet"
            copy="Run a historical or custom scenario to populate this history."
          />
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
          <EmptyState
            title="No holdings to rebalance"
            copy="Add positions before using the allocation modeler."
          />
        ) : (
          <div className="space-y-5">
            {selectedPortfolio.holdings.map((holding) => (
              <div key={holding.ticker} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{holding.ticker}</span>
                  <span className="font-mono text-slate-300">
                    {formatPercent(allocationWeights[holding.ticker] ?? 0)}
                  </span>
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
                  className="w-full accent-white"
                />
              </div>
            ))}
            <button
              onClick={commitAllocation}
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Commit Allocation
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Current vs Proposed Risk">
        {!selectedMetrics || !proposedMetrics ? (
          <EmptyState
            title="Waiting for proposed weights"
            copy="Adjust target weights to calculate proposed risk in real time."
          />
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
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
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
            className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
          >
            <option value="">All actions</option>
            <option value="POSITION_ADDED">Position Added</option>
            <option value="POSITION_REMOVED">Position Removed</option>
            <option value="POSITION_RESIZED">Position Resized</option>
            <option value="RISK_SCORED">Risk Scored</option>
            <option value="STRESS_TEST_RUN">Stress Test Run</option>
            <option value="ALLOCATION_COMMITTED">Allocation Committed</option>
          </select>
          <input
            type="date"
            value={auditFrom}
            onChange={(event) => setAuditFrom(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
          />
          <input
            type="date"
            value={auditTo}
            onChange={(event) => setAuditTo(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
          />
          <button
            onClick={() => void refreshAudit()}
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Apply
          </button>
        </div>
      </Panel>

      <Panel title="Audit Trail">
        {auditRows.length === 0 ? (
          <EmptyState
            title="No audit events match"
            copy="Try broadening the date range or action filter."
          />
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
                    <td className="py-4 text-slate-400">
                      {entry.metadata ? JSON.stringify(entry.metadata) : "No metadata"}
                    </td>
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
          <button
            onClick={logout}
              className="rounded-lg border border-danger/40 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger"
          >
            Log Out
          </button>
        </div>
      </Panel>

      <Panel title="Workspace">
        <div className="space-y-4 text-sm text-slate-300">
          <p>Portfolios in workspace: {portfolioSummaries.length}</p>
          <p>Selected portfolio: {selectedPortfolio?.name ?? "None"}</p>
          <p>
            Use separate sleeves for large cap, mid cap, small cap, or flexicap strategies,
            then compare their concentration and risk states independently.
          </p>
          <Link
            className="text-zinc-200 transition hover:text-white"
            href="https://github.com/sriaratragada/PortRisk"
            target="_blank"
          >
            View repository
          </Link>
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.04),transparent_18%),linear-gradient(180deg,#030303_0%,#090909_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-black/55 px-6 py-5 shadow-panel backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-300">
              Portfolio Risk Engine
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              Investment workspace
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Logged in as {initialData.user.email}. Persisted portfolios, live quotes, company
              detail, and compliance-grade history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {portfolioSummaries.length > 0 ? portfolioSelector : null}
            <button
              onClick={() => setActiveTab("holdings")}
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black shadow-[0_18px_40px_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 hover:bg-zinc-100"
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
                "rounded-lg px-4 py-2 text-sm transition duration-200",
                activeTab === tab.id
                  ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.12)]"
                  : "border border-white/10 bg-black/35 text-slate-300 hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {(statusMessage || errorMessage || portfolioLoading || isPending) && (
          <div
            className={cn(
              "mb-6 rounded-2xl border px-4 py-3 text-sm backdrop-blur",
              errorMessage
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-white/10 bg-white/[0.04] text-zinc-100"
            )}
          >
            {errorMessage ??
              statusMessage ??
              (portfolioLoading || isPending ? "Updating workspace..." : null)}
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

      {(holdingDetailLoading || selectedHoldingDetail) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/72 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              setSelectedHoldingDetail(null);
              setHoldingDetailLoading(false);
            }}
          />
          <aside className="relative z-10 h-full w-full max-w-2xl animate-[slideUpSoft_240ms_ease-out] overflow-y-auto border-l border-white/10 bg-black/95 px-6 py-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-300">
                  Holding Detail
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                  {selectedHoldingDetail?.ticker ?? "Loading"}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedHoldingDetail?.companyName ??
                    "Pulling company profile, valuation, and balance-sheet detail."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedHoldingDetail(null);
                  setHoldingDetailLoading(false);
                }}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Close
              </button>
            </div>

            {holdingDetailLoading || !selectedHoldingDetail ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-8 text-sm text-slate-400">
                Loading company detail...
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[1.2rem] border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
                  <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em] text-slate-500">
                        {selectedHoldingDetail.exchange || "Exchange N/A"} • {selectedHoldingDetail.sector || "Sector N/A"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <p className="text-4xl font-semibold tracking-[-0.05em] text-white">
                          {formatCurrency(selectedHoldingDetail.currentPrice)}
                        </p>
                        <span
                          className={cn(
                            "rounded-md border px-3 py-1 text-sm",
                            holdingRangePerformance.absolute >= 0
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-danger/30 bg-danger/10 text-danger"
                          )}
                        >
                          {formatCurrency(holdingRangePerformance.absolute)} /{" "}
                          {formatPercent(holdingRangePerformance.percent)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        {selectedHoldingDetail.industry || "Industry N/A"} • {holdingRange} performance
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Market Cap</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatBigNumber(selectedHoldingDetail.marketCap)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">52W Range</p>
                        <p className="mt-2 text-base font-semibold text-white">
                          {formatCurrency(selectedHoldingDetail.fiftyTwoWeekLow ?? 0)} -{" "}
                          {formatCurrency(selectedHoldingDetail.fiftyTwoWeekHigh ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Trailing P/E</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {selectedHoldingDetail.trailingPE != null
                            ? selectedHoldingDetail.trailingPE.toFixed(2)
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                    <span>{selectedHoldingDetail.exchange || "Exchange N/A"}</span>
                    <span>{selectedHoldingDetail.sector || "Sector N/A"}</span>
                    <span>{selectedHoldingDetail.industry || "Industry N/A"}</span>
                    {selectedHoldingDetail.website ? <span>{selectedHoldingDetail.website}</span> : null}
                  </div>
                  {selectedHoldingDetail.summary ? (
                    <p className="mt-4 text-sm leading-7 text-slate-300">
                      {selectedHoldingDetail.summary}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-[1.2rem] border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Recent Price Trend
                  </p>
                  <div className="mt-4">
                    <RangeSelector value={holdingRange} onChange={setHoldingRange} />
                  </div>
                  <div className="mt-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedHoldingDetail.chart}>
                        <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value: string) =>
                            new Date(value).toLocaleDateString("en-US", {
                              month: holdingRange === "1D" ? undefined : "short",
                              day: holdingRange === "1D" ? undefined : "numeric",
                              hour: holdingRange === "1D" ? "numeric" : undefined,
                              minute: holdingRange === "1D" ? "2-digit" : undefined,
                              year: holdingRange === "5Y" || holdingRange === "MAX" ? "2-digit" : undefined
                            })
                          }
                          tick={{ fill: "#94a3b8", fontSize: 12 }}
                          minTickGap={28}
                        />
                        <YAxis
                          tickFormatter={(value) => `$${Math.round(value)}`}
                          tick={{ fill: "#94a3b8", fontSize: 12 }}
                        />
                        <Tooltip content={<ChartTooltip formatter={formatCurrency} />} />
                        <Line
                          type="monotone"
                          dataKey="close"
                          stroke="#fafafa"
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Balance Sheet
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <p>Debt / Equity: {selectedHoldingDetail.debtToEquity ?? "N/A"}</p>
                      <p>Current Ratio: {selectedHoldingDetail.currentRatio ?? "N/A"}</p>
                      <p>Quick Ratio: {selectedHoldingDetail.quickRatio ?? "N/A"}</p>
                      <p>Total Debt: {formatBigNumber(selectedHoldingDetail.totalDebt)}</p>
                      <p>Total Cash: {formatBigNumber(selectedHoldingDetail.totalCash)}</p>
                    </div>
                  </div>
                  <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Operating Quality
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <p>
                        Revenue Growth:{" "}
                        {selectedHoldingDetail.revenueGrowth != null
                          ? formatPercent(selectedHoldingDetail.revenueGrowth)
                          : "N/A"}
                      </p>
                      <p>
                        Earnings Growth:{" "}
                        {selectedHoldingDetail.earningsGrowth != null
                          ? formatPercent(selectedHoldingDetail.earningsGrowth)
                          : "N/A"}
                      </p>
                      <p>
                        Profit Margins:{" "}
                        {selectedHoldingDetail.profitMargins != null
                          ? formatPercent(selectedHoldingDetail.profitMargins)
                          : "N/A"}
                      </p>
                      <p>
                        Return on Equity:{" "}
                        {selectedHoldingDetail.returnOnEquity != null
                          ? formatPercent(selectedHoldingDetail.returnOnEquity)
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
