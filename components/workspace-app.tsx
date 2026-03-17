"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
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
import {
  BENCHMARK_PRESETS,
  defaultBenchmarkForPortfolio,
  normalizeBenchmarkSymbol,
  PORTFOLIO_TEMPLATE_BENCHMARKS
} from "@/lib/benchmarks";
import { sortWatchlistItems } from "@/lib/research-client";
import { STRESS_SCENARIOS } from "@/lib/stress-scenarios";
import { getDefaultSector } from "@/lib/sectors";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { buildFallbackHoldings } from "@/lib/holdings";
import type {
  BenchmarkAnalytics,
  ChartRange,
  CompanyDetail,
  HoldingSnapshot,
  PositionInput,
  ResearchCandidate,
  ResearchFeatureBundle,
  ResearchInsight,
  RiskInsight,
  RiskReport,
  RiskTier,
  SecuritySearchResult,
  SecurityPreview,
  WatchlistItem
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
  | "research"
  | "risk"
  | "stress"
  | "allocation"
  | "audit"
  | "settings";

type PortfolioCardStats = {
  portfolioValue: number | null;
  dailyPnl: number | null;
  topWeight: number | null;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "research", label: "Research" },
  { id: "risk", label: "Risk" },
  { id: "stress", label: "Stress Tests" },
  { id: "allocation", label: "Allocation Modeler" },
  { id: "audit", label: "Audit Log" },
  { id: "settings", label: "Settings" }
];

const chartRanges: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];

const portfolioTemplates = PORTFOLIO_TEMPLATE_BENCHMARKS.map((template) => ({
  ...template,
  description:
    template.name === "Growth"
      ? "Focused on high capital appreciation through stock-heavy exposure and long-duration risk."
      : template.name === "Income"
        ? "Built for recurring cash flow using dividend-paying equities and income-oriented holdings."
        : template.name === "Balanced"
          ? "A hybrid allocation that blends growth and income across stocks and bonds."
          : template.name === "Defensive/Conservative"
            ? "Prioritizes capital preservation with lower-volatility exposures and cash-like resilience."
            : "High-risk, high-reward positioning intended for tactical and short-term market opportunities."
}));

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
        "animate-[fadeIn_220ms_ease-out] rounded-2xl border border-white/10 bg-panel/90 p-5 shadow-panel backdrop-blur-xl",
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
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
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

function HealthBandBadge({ band }: { band: "Strong" | "Moderate" | "Weak" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
        band === "Strong"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : band === "Moderate"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
      )}
    >
      {band}
    </span>
  );
}

function HealthScoreCard({
  label,
  detail
}: {
  label: string;
  detail: {
    score: number;
    band: "Strong" | "Moderate" | "Weak";
    summary: string;
    drivers: string[];
  };
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <HealthBandBadge band={detail.band} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{detail.score}/100</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail.summary}</p>
      <details className="mt-4 group">
        <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.18em] text-slate-500 transition group-open:text-slate-300">
          Score basis
        </summary>
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          {detail.drivers.map((driver) => (
            <p key={driver} className="text-sm text-slate-300">
              {driver}
            </p>
          ))}
        </div>
      </details>
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

function ResearchToneChip({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]",
        tone === "positive"
          ? "border-success/30 bg-success/10 text-success"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-white/10 bg-white/[0.04] text-slate-300"
      )}
    >
      {label}
    </span>
  );
}

function ResearchInsightCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p> : null}
    </div>
  );
}

function ResearchBulletList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((entry) => (
            <div key={entry} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/60" />
              <span>{entry}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No detail yet.</p>
        )}
      </div>
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
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <h3 className="text-2xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">{copy}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function InlineNotice({
  message,
  tone = "neutral"
}: {
  message: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "danger"
          ? "border-danger/30 bg-danger/10 text-danger"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-white/10 bg-white/[0.03] text-slate-300"
      )}
    >
      {message}
    </div>
  );
}

function mapSummary(
  portfolios: Array<{
    id: string;
    name: string;
    benchmark: string;
    updatedAt: string;
    positions: unknown[];
    riskScores: Array<{ riskTier: string }>;
  }>
) {
  return portfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    benchmark: portfolio.benchmark,
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

function formatRangeBounds(low?: number, high?: number) {
  if (low == null && high == null) {
    return "N/A";
  }
  if (low != null && high != null) {
    return `${formatCurrency(low)} - ${formatCurrency(high)}`;
  }
  return low != null ? `${formatCurrency(low)} - N/A` : `N/A - ${formatCurrency(high ?? null)}`;
}

function labelForRange(range: ChartRange) {
  switch (range) {
    case "1D":
      return "1D Change";
    case "1W":
      return "1W Return";
    case "1M":
      return "1M Return";
    case "3M":
      return "3M Return";
    case "1Y":
      return "1Y Return";
    case "5Y":
      return "5Y Return";
    case "MAX":
      return "MAX Return";
  }
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function RangeSelector({
  value,
  onChange
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-black/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {chartRanges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-xs font-medium transition duration-200",
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
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))[0] ?? null;
}

function mergeHydratedHoldings(
  positions: WorkspacePortfolio["positions"],
  hydrated: WorkspacePortfolio["holdings"]
) {
  const hydratedMap = new Map(hydrated.map((holding) => [holding.ticker.toUpperCase(), holding]));
  return positions.map((position) => {
    const matched = hydratedMap.get(position.ticker.toUpperCase());
    return matched
      ? {
          ...matched,
          shares: position.shares,
          avgCost: position.avgCost,
          assetClass: position.assetClass
        }
      : buildFallbackHoldings([position])[0]!;
  });
}

function buildFallbackCompanyDetail(holding: HoldingSnapshot): CompanyDetail {
  return {
    ticker: holding.ticker,
    companyName: holding.companyName ?? holding.ticker,
    exchange: holding.exchange ?? "N/A",
    currentPrice: holding.currentPrice ?? null,
    currency: "USD",
    sector: holding.sector ?? getDefaultSector(),
    industry: holding.industry,
    chart: [],
    dataState: "unavailable",
    asOf: null,
    provider: null,
    historyDataState: "unavailable",
    historyAsOf: null,
    historyProvider: null
  };
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [benchmarkAnalytics, setBenchmarkAnalytics] = useState<BenchmarkAnalytics | null>(null);
  const [benchmarkAnalyticsLoading, setBenchmarkAnalyticsLoading] = useState(false);
  const [benchmarkAnalyticsError, setBenchmarkAnalyticsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SecuritySearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedSecurity, setSelectedSecurity] = useState<SecuritySearchResult | null>(null);
  const [benchmarkSearchTerm, setBenchmarkSearchTerm] = useState("");
  const [benchmarkSearchResults, setBenchmarkSearchResults] = useState<SecuritySearchResult[]>([]);
  const [benchmarkSearchLoading, setBenchmarkSearchLoading] = useState(false);
  const [benchmarkSearchError, setBenchmarkSearchError] = useState<string | null>(null);
  const [selectedBenchmarkSecurity, setSelectedBenchmarkSecurity] =
    useState<SecuritySearchResult | null>(null);
  const [benchmarkPreview, setBenchmarkPreview] = useState<SecurityPreview | null>(null);
  const [benchmarkPreviewLoading, setBenchmarkPreviewLoading] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(
    initialData.selectedPortfolio?.watchlist ?? []
  );
  const [researchFeed, setResearchFeed] = useState<{
    generatedAt: string | null;
    candidates: ResearchCandidate[];
  }>({
    generatedAt: null,
    candidates: []
  });
  const [researchFeedLoading, setResearchFeedLoading] = useState(false);
  const [researchFeedError, setResearchFeedError] = useState<string | null>(null);
  const [researchSearchTerm, setResearchSearchTerm] = useState("");
  const [researchSearchResults, setResearchSearchResults] = useState<SecuritySearchResult[]>([]);
  const [researchSearchLoading, setResearchSearchLoading] = useState(false);
  const [researchSearchError, setResearchSearchError] = useState<string | null>(null);
  const [selectedResearchSecurity, setSelectedResearchSecurity] =
    useState<SecuritySearchResult | null>(null);
  const [researchPreview, setResearchPreview] = useState<SecurityPreview | null>(null);
  const [researchPreviewLoading, setResearchPreviewLoading] = useState(false);
  const [selectedResearchTicker, setSelectedResearchTicker] = useState<string | null>(
    initialData.selectedPortfolio?.watchlist[0]?.ticker ?? null
  );
  const [selectedResearchItemId, setSelectedResearchItemId] = useState<string | null>(
    initialData.selectedPortfolio?.watchlist[0]?.id ?? null
  );
  const [researchInsight, setResearchInsight] = useState<ResearchInsight | null>(null);
  const [researchFeatureBundle, setResearchFeatureBundle] = useState<ResearchFeatureBundle | null>(
    null
  );
  const [researchInsightLoading, setResearchInsightLoading] = useState(false);
  const [researchInsightError, setResearchInsightError] = useState<string | null>(null);
  const [researchSort, setResearchSort] = useState<"updated" | "conviction" | "marketCap">("updated");
  const [researchSourceFilter, setResearchSourceFilter] = useState<
    "all" | "manual" | "related" | "screener" | "trending"
  >("all");
  const [researchSectorFilter, setResearchSectorFilter] = useState<string>("all");
  const [researchNotebookSection, setResearchNotebookSection] = useState<
    "thesis" | "catalysts" | "risks" | "valuation" | "notes"
  >("thesis");
  const [researchMobileView, setResearchMobileView] = useState<"feed" | "notebook" | "insight">("feed");
  const [pendingPromotionItemId, setPendingPromotionItemId] = useState<string | null>(null);
  const [watchlistDraft, setWatchlistDraft] = useState({
    status: "NEW" as WatchlistItem["status"],
    conviction: "3",
    targetPrice: "",
    thesis: "",
    catalysts: "",
    risks: "",
    valuationNotes: "",
    notes: ""
  });
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
  const [positionPreview, setPositionPreview] = useState<SecurityPreview | null>(null);
  const [positionPreviewLoading, setPositionPreviewLoading] = useState(false);
  const [selectedHoldingDetail, setSelectedHoldingDetail] = useState<CompanyDetail | null>(null);
  const [holdingDetailLoading, setHoldingDetailLoading] = useState(false);
  const [holdingDetailError, setHoldingDetailError] = useState<string | null>(null);
  const [portfolioRange, setPortfolioRange] = useState<ChartRange>("1M");
  const [holdingRange, setHoldingRange] = useState<ChartRange>("1M");
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null);
  const [riskReportLoading, setRiskReportLoading] = useState(false);
  const [riskInsight, setRiskInsight] = useState<RiskInsight | null>(null);
  const [riskInsightLoading, setRiskInsightLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [riskInsightError, setRiskInsightError] = useState<string | null>(null);
  const [stressError, setStressError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [portfolioCardStats, setPortfolioCardStats] = useState<
    Record<string, PortfolioCardStats>
  >(() =>
    initialData.selectedPortfolio
      ? {
          [initialData.selectedPortfolio.id]: {
            portfolioValue: initialData.selectedPortfolio.metrics?.portfolioValue ?? null,
            dailyPnl: initialData.selectedPortfolio.holdings.reduce(
              (sum, holding) => sum + (holding.dailyPnl ?? 0),
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
        dailyPnl: portfolio.holdings.reduce((sum, holding) => sum + (holding.dailyPnl ?? 0), 0),
        topWeight: topConcentration(portfolio.holdings)?.weight ?? null
      }
    }));
  }

  function updateWatchlistSnapshot(items: WatchlistItem[]) {
    setWatchlistItems(items);
  }

  useEffect(() => {
    if (!selectedPortfolio) {
      setAllocationWeights({});
      setProposedMetrics(null);
      setRiskReport(null);
      setRiskInsight(null);
      setWatchlistItems([]);
      setResearchFeed({ generatedAt: null, candidates: [] });
      setSelectedResearchItemId(null);
      setSelectedResearchTicker(null);
      setResearchInsight(null);
      setResearchFeatureBundle(null);
      resetBenchmarkForm();
      return;
    }

    setAuditRows(selectedPortfolio.auditLog);
    setAllocationWeights(
      Object.fromEntries(
        selectedPortfolio.holdings.map((holding) => [holding.ticker, holding.weight ?? 0])
      )
    );
    setProposedMetrics(selectedPortfolio.metrics);
    updateSelectedPortfolioSnapshot(selectedPortfolio);
    setWatchlistItems(selectedPortfolio.watchlist);
    setSelectedResearchItemId(selectedPortfolio.watchlist[0]?.id ?? null);
    setSelectedResearchTicker(selectedPortfolio.watchlist[0]?.ticker ?? null);
    setResearchInsight(null);
    setResearchFeatureBundle(null);
    setResearchInsightError(null);
    setBenchmarkSearchTerm(selectedPortfolio.benchmark);
    setBenchmarkPreview(null);
    setBenchmarkSearchResults([]);
    setBenchmarkSearchLoading(false);
    setBenchmarkSearchError(null);
    setSelectedBenchmarkSecurity({
      symbol: selectedPortfolio.benchmark,
      companyName: selectedPortfolio.benchmark,
      exchange: "Benchmark",
      quoteType: "ETF",
      hasPreviewData: true
    });
  }, [selectedPortfolio]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (!query || selectedSecurity?.symbol === query.toUpperCase()) {
      setSearchResults([]);
      setSearchLoading(false);
      if (!query) {
        setSearchError(null);
      }
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/securities/search?q=${encodeURIComponent(query)}`, {
          headers: {
            ...(await getAuthHeaders())
          }
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const data = (await response.json()) as {
          results?: SecuritySearchResult[];
        };
        setSearchResults(data.results ?? []);
      } catch (error) {
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Ticker search failed");
      } finally {
        setSearchLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [searchTerm, selectedSecurity]);

  useEffect(() => {
    const query = benchmarkSearchTerm.trim();
    if (!query || selectedBenchmarkSecurity?.symbol === query.toUpperCase()) {
      setBenchmarkSearchResults([]);
      setBenchmarkSearchLoading(false);
      if (!query) {
        setBenchmarkSearchError(null);
      }
      return;
    }

    const handle = window.setTimeout(async () => {
      setBenchmarkSearchLoading(true);
      setBenchmarkSearchError(null);
      try {
        const response = await fetch(`/api/securities/search?q=${encodeURIComponent(query)}`, {
          headers: {
            ...(await getAuthHeaders())
          }
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const data = (await response.json()) as {
          results?: SecuritySearchResult[];
        };
        setBenchmarkSearchResults(data.results ?? []);
      } catch (error) {
        setBenchmarkSearchResults([]);
        setBenchmarkSearchError(error instanceof Error ? error.message : "Benchmark search failed");
      } finally {
        setBenchmarkSearchLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [benchmarkSearchTerm, selectedBenchmarkSecurity]);

  useEffect(() => {
    const query = researchSearchTerm.trim();
    if (!query || selectedResearchSecurity?.symbol === query.toUpperCase()) {
      setResearchSearchResults([]);
      setResearchSearchLoading(false);
      if (!query) {
        setResearchSearchError(null);
      }
      return;
    }

    const handle = window.setTimeout(async () => {
      setResearchSearchLoading(true);
      setResearchSearchError(null);
      try {
        const response = await fetch(`/api/securities/search?q=${encodeURIComponent(query)}`, {
          headers: {
            ...(await getAuthHeaders())
          }
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const data = (await response.json()) as {
          results?: SecuritySearchResult[];
        };
        setResearchSearchResults(data.results ?? []);
      } catch (error) {
        setResearchSearchResults([]);
        setResearchSearchError(error instanceof Error ? error.message : "Research search failed");
      } finally {
        setResearchSearchLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [researchSearchTerm, selectedResearchSecurity]);

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
          shares: !holding.currentPrice ? 0 : targetValue / holding.currentPrice,
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

  const holdingsDependencyKey = useMemo(
    () =>
      selectedPortfolio?.holdings
        .map((holding) =>
          [
            holding.ticker,
            holding.shares,
            holding.avgCost,
            holding.currentPrice ?? "na",
            holding.currentValue ?? "na",
            holding.weight ?? "na",
            holding.sector ?? "na",
            holding.industry ?? "na"
          ].join(":")
        )
        .join("|") ?? "",
    [selectedPortfolio?.holdings]
  );

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
      setRiskError(null);
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
            setRiskError(await readErrorMessage(response));
          }
          return;
        }
        const data = (await response.json()) as { report: RiskReport | null; error?: string };
        if (!controller.signal.aborted) {
          setRiskReport(data.report);
          setRiskError(data.report ? null : data.error ?? "Risk report unavailable");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRiskReport(null);
          setRiskError(error instanceof Error ? error.message : "Risk report unavailable");
        }
      } finally {
        if (!controller.signal.aborted) {
          setRiskReportLoading(false);
        }
      }
    }

    void loadRiskReport();
    return () => controller.abort();
  }, [activeTab, selectedPortfolio?.id, holdingsDependencyKey]);

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

    async function loadRiskInsight() {
      setRiskInsightLoading(true);
      setRiskInsightError(null);
      try {
        const response = await fetch(`/api/risk/insights?portfolioId=${portfolioId}`, {
          signal: controller.signal,
          headers: {
            ...(await getAuthHeaders())
          }
        });
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setRiskInsight(null);
            setRiskInsightError(await readErrorMessage(response));
          }
          return;
        }
        const data = (await response.json()) as { insight: RiskInsight | null; error?: string };
        if (!controller.signal.aborted) {
          setRiskInsight(data.insight);
          setRiskInsightError(data.insight ? null : data.error ?? "AI insight unavailable");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRiskInsight(null);
          setRiskInsightError(error instanceof Error ? error.message : "AI insight unavailable");
        }
      } finally {
        if (!controller.signal.aborted) {
          setRiskInsightLoading(false);
        }
      }
    }

    void loadRiskInsight();
    return () => controller.abort();
  }, [activeTab, selectedPortfolio?.id, holdingsDependencyKey]);

  useEffect(() => {
    if (
      !selectedPortfolio ||
      selectedPortfolio.positions.length === 0 ||
      !["overview", "holdings", "risk"].includes(activeTab)
    ) {
      setBenchmarkAnalytics(null);
      setBenchmarkAnalyticsError(null);
      setBenchmarkAnalyticsLoading(false);
      return;
    }

    let cancelled = false;
    const portfolioId = selectedPortfolio.id;
    setBenchmarkAnalyticsLoading(true);
    setBenchmarkAnalyticsError(null);

    async function loadBenchmarkAnalytics() {
      try {
        const response = await fetch(
          `/api/portfolio/${portfolioId}/benchmark?range=${portfolioRange}`,
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
          analytics: BenchmarkAnalytics | null;
          error?: string | null;
        };
        if (cancelled) {
          return;
        }
        setBenchmarkAnalytics(data.analytics);
        setBenchmarkAnalyticsError(
          data.analytics ? null : data.error ?? "Benchmark comparison unavailable"
        );
      } catch (error) {
        if (!cancelled) {
          setBenchmarkAnalytics(null);
          setBenchmarkAnalyticsError(
            error instanceof Error ? error.message : "Benchmark comparison unavailable"
          );
        }
      } finally {
        if (!cancelled) {
          setBenchmarkAnalyticsLoading(false);
        }
      }
    }

    void loadBenchmarkAnalytics();

    return () => {
      cancelled = true;
    };
  }, [activeTab, portfolioRange, selectedPortfolio?.id, holdingsDependencyKey]);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
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
          setHistoryError(error instanceof Error ? error.message : "Failed to load history");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
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
    setHoldingDetailError(null);
    void loadHoldingDetail(selectedHoldingDetail.ticker, holdingRange)
      .catch((error) => {
        if (!cancelled) {
          setHoldingDetailError(
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

  useEffect(() => {
    if (!selectedPortfolio) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `research-feed:${initialData.user.id}:${selectedPortfolio.id}`;
    const loadedForDay = window.localStorage.getItem(storageKey);
    if (loadedForDay === today && researchFeed.generatedAt) {
      return;
    }

    let cancelled = false;
    setResearchFeedLoading(true);
    void loadResearchFeed(selectedPortfolio.id, false)
      .catch((error) => {
        if (!cancelled) {
          setResearchFeedError(
            error instanceof Error ? error.message : "Research feed unavailable"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setResearchFeedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialData.user.id, researchFeed.generatedAt, selectedPortfolio?.id]);

  useEffect(() => {
    const selectedItem =
      watchlistItems.find((item) => item.id === selectedResearchItemId) ?? null;
    if (!selectedItem) {
      return;
    }

    setWatchlistDraft({
      status: selectedItem.status,
      conviction: String(selectedItem.conviction),
      targetPrice: selectedItem.targetPrice != null ? String(selectedItem.targetPrice) : "",
      thesis: selectedItem.thesis,
      catalysts: selectedItem.catalysts,
      risks: selectedItem.risks,
      valuationNotes: selectedItem.valuationNotes,
      notes: selectedItem.notes
    });
  }, [selectedResearchItemId, watchlistItems]);

  useEffect(() => {
    if (!selectedPortfolio || !selectedResearchTicker || activeTab !== "research") {
      return;
    }

    const selectedWatchlistSource =
      watchlistItems.find((item) => item.id === selectedResearchItemId)?.sourceType;
    const selectedFeedSource =
      researchFeed.candidates.find((candidate) => candidate.ticker === selectedResearchTicker)?.sourceType;

    void loadResearchInsightForTicker(
      selectedResearchTicker,
      selectedResearchItemId,
      selectedWatchlistSource ?? selectedFeedSource
    );
  }, [
    activeTab,
    selectedPortfolio?.id,
    selectedResearchItemId,
    selectedResearchTicker,
    researchFeed.candidates,
    watchlistItems
  ]);

  const selectedMetrics = selectedPortfolio?.metrics ?? null;
  const dailyPnl = useMemo(
    () => selectedPortfolio?.holdings.reduce((sum, holding) => sum + (holding.dailyPnl ?? 0), 0) ?? 0,
    [selectedPortfolio]
  );
  const dailyPnlPercent = useMemo(
    () =>
      selectedPortfolio?.holdings.reduce(
        (sum, holding) => sum + (holding.dailyPnlPercent ?? 0) * (holding.weight ?? 0),
        0
      ) ?? 0,
    [selectedPortfolio]
  );
  const sortedHoldings = useMemo(
    () =>
      selectedPortfolio?.holdings
        .slice()
        .sort((left, right) => (right.currentValue ?? 0) - (left.currentValue ?? 0)) ?? [],
    [selectedPortfolio]
  );
  const totalReturn = useMemo(
    () => selectedPortfolio?.holdings.reduce((sum, holding) => sum + (holding.totalGain ?? 0), 0) ?? 0,
    [selectedPortfolio]
  );
  const totalReturnPercent = useMemo(() => {
    const currentValue =
      selectedPortfolio?.holdings.reduce((sum, holding) => sum + (holding.currentValue ?? 0), 0) ?? 0;
    const costBasis = currentValue - totalReturn;
    return costBasis > 0 ? totalReturn / costBasis : 0;
  }, [selectedPortfolio, totalReturn]);
  const biggestGainer = useMemo(
    () =>
      sortedHoldings
        .filter((holding) => (holding.dailyPnl ?? 0) > 0)
        .sort((left, right) => (right.dailyPnl ?? 0) - (left.dailyPnl ?? 0))[0] ?? null,
    [sortedHoldings]
  );
  const biggestLoser = useMemo(
    () =>
      sortedHoldings
        .filter((holding) => (holding.dailyPnl ?? 0) < 0)
        .sort((left, right) => (left.dailyPnl ?? 0) - (right.dailyPnl ?? 0))[0] ?? null,
    [sortedHoldings]
  );
  const medianWeight = useMemo(
    () => median(sortedHoldings.map((holding) => holding.weight ?? 0)),
    [sortedHoldings]
  );
  const topThreeConcentration = useMemo(
    () => sortedHoldings.slice(0, 3).reduce((sum, holding) => sum + (holding.weight ?? 0), 0),
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
  const selectedRangePortfolioValue = useMemo(() => {
    const history = selectedPortfolio?.valueHistory ?? [];
    if (history.length > 0) {
      return history[history.length - 1]?.value ?? 0;
    }
    return selectedMetrics?.portfolioValue ?? 0;
  }, [selectedMetrics?.portfolioValue, selectedPortfolio?.valueHistory]);
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
  const holdingContributionMap = useMemo(
    () =>
      new Map(
        (benchmarkAnalytics?.holdingAttribution ?? []).map((entry) => [entry.ticker.toUpperCase(), entry])
      ),
    [benchmarkAnalytics]
  );
  const topPositiveHoldingContributor = useMemo(
    () =>
      (benchmarkAnalytics?.holdingAttribution ?? [])
        .filter((entry) => (entry.contribution ?? 0) > 0)
        .sort((left, right) => (right.contribution ?? 0) - (left.contribution ?? 0))[0] ?? null,
    [benchmarkAnalytics]
  );
  const topNegativeHoldingContributor = useMemo(
    () =>
      (benchmarkAnalytics?.holdingAttribution ?? [])
        .filter((entry) => (entry.contribution ?? 0) < 0)
        .sort((left, right) => (left.contribution ?? 0) - (right.contribution ?? 0))[0] ?? null,
    [benchmarkAnalytics]
  );
  const topPositiveSectorContributor = useMemo(
    () =>
      (benchmarkAnalytics?.sectorAttribution ?? [])
        .filter((entry) => entry.contribution > 0)
        .sort((left, right) => right.contribution - left.contribution)[0] ?? null,
    [benchmarkAnalytics]
  );
  const topNegativeSectorContributor = useMemo(
    () =>
      (benchmarkAnalytics?.sectorAttribution ?? [])
        .filter((entry) => entry.contribution < 0)
        .sort((left, right) => left.contribution - right.contribution)[0] ?? null,
    [benchmarkAnalytics]
  );
  const researchMarketCapMap = useMemo(() => {
    const pairs: Array<[string, number | null]> = [];
    for (const candidate of researchFeed.candidates) {
      pairs.push([candidate.ticker.toUpperCase(), candidate.marketCap ?? null]);
    }
    if (researchPreview) {
      pairs.push([researchPreview.symbol.toUpperCase(), researchPreview.marketCap ?? null]);
    }
    return new Map(pairs);
  }, [researchFeed.candidates, researchPreview]);
  const researchPriceMap = useMemo(() => {
    const pairs: Array<[string, number | null]> = [];
    for (const candidate of researchFeed.candidates) {
      pairs.push([candidate.ticker.toUpperCase(), candidate.currentPrice]);
    }
    if (researchPreview) {
      pairs.push([researchPreview.symbol.toUpperCase(), researchPreview.currentPrice ?? null]);
    }
    for (const holding of selectedPortfolio?.holdings ?? []) {
      pairs.push([holding.ticker.toUpperCase(), holding.currentPrice ?? null]);
    }
    return new Map(pairs);
  }, [researchFeed.candidates, researchPreview, selectedPortfolio?.holdings]);
  const sortedWatchlist = useMemo(
    () => sortWatchlistItems(watchlistItems, researchSort, researchMarketCapMap),
    [researchMarketCapMap, researchSort, watchlistItems]
  );
  const groupedWatchlist = useMemo(
    () =>
      ["NEW", "RESEARCHING", "READY", "PASSED", "PROMOTED"].map((status) => ({
        status,
        items: sortedWatchlist.filter((item) => item.status === status)
      })),
    [sortedWatchlist]
  );
  const selectedWatchlistItem = useMemo(
    () => watchlistItems.find((item) => item.id === selectedResearchItemId) ?? null,
    [selectedResearchItemId, watchlistItems]
  );
  const selectedFeedCandidate = useMemo(
    () => researchFeed.candidates.find((candidate) => candidate.ticker === selectedResearchTicker) ?? null,
    [researchFeed.candidates, selectedResearchTicker]
  );
  const researchSectorOptions = useMemo(() => {
    const sectors = new Set<string>();
    for (const candidate of researchFeed.candidates) {
      if (candidate.sector) {
        sectors.add(candidate.sector);
      }
    }
    for (const item of watchlistItems) {
      if (item.sector) {
        sectors.add(item.sector);
      }
    }
    return Array.from(sectors).sort((left, right) => left.localeCompare(right));
  }, [researchFeed.candidates, watchlistItems]);
  const filteredResearchCandidates = useMemo(
    () =>
      researchFeed.candidates.filter((candidate) => {
        const sourceMatches = researchSourceFilter === "all" || candidate.sourceType === researchSourceFilter;
        const sectorMatches = researchSectorFilter === "all" || candidate.sector === researchSectorFilter;
        return sourceMatches && sectorMatches;
      }),
    [researchFeed.candidates, researchSectorFilter, researchSourceFilter]
  );
  const activeWatchlistTickerSet = useMemo(
    () =>
      new Set(
        watchlistItems
          .filter((item) => item.status !== "PASSED" && item.status !== "PROMOTED")
          .map((item) => item.ticker.toUpperCase())
      ),
    [watchlistItems]
  );
  const selectedResearchPrice = selectedResearchTicker
    ? researchPriceMap.get(selectedResearchTicker.toUpperCase()) ?? null
    : null;
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
        benchmark: string;
        updatedAt: string;
        positions: unknown[];
        riskScores: Array<{ riskTier: string }>;
      }>;
    };
    const summaries = mapSummary(data.portfolios);
    setPortfolioSummaries(summaries);
    return summaries;
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
      dataState?: "live" | "unavailable";
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
    const data = (await response.json()) as { detail: CompanyDetail; degraded?: boolean };
    const fallbackHolding = selectedPortfolio?.holdings.find((holding) => holding.ticker === ticker);
    setSelectedHoldingDetail(
      data.degraded && fallbackHolding
        ? {
            ...buildFallbackCompanyDetail(fallbackHolding),
            ...data.detail,
            companyName: fallbackHolding.companyName ?? data.detail.companyName
          }
        : data.detail
    );
  }

  async function loadPortfolio(portfolioId: string) {
    setPortfolioLoading(true);
    setErrorMessage(null);
    setHistoryError(null);
    setRiskError(null);
    setStressError(null);
    setAllocationError(null);
    setAuditError(null);
    setHoldingDetailError(null);

    try {
      const authHeaders = await getAuthHeaders();
      const portfolioResponse = await fetch(`/api/portfolio/${portfolioId}`, {
        headers: authHeaders
      });

      if (!portfolioResponse.ok) {
        throw new Error(await readErrorMessage(portfolioResponse));
      }

      const portfolioData = (await portfolioResponse.json()) as {
        portfolio: {
          id: string;
          name: string;
          benchmark: string;
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
          watchlistItems: WatchlistItem[];
        };
      };

      const nextPortfolio: WorkspacePortfolio = {
        id: portfolioData.portfolio.id,
        name: portfolioData.portfolio.name,
        benchmark: portfolioData.portfolio.benchmark,
        updatedAt: portfolioData.portfolio.updatedAt,
        positions: portfolioData.portfolio.positions,
        holdings: buildFallbackHoldings(portfolioData.portfolio.positions),
        metrics: null,
        valueHistory: [],
        auditLog: portfolioData.portfolio.auditLogs,
        stressTests: portfolioData.portfolio.stressTests,
        watchlist: portfolioData.portfolio.watchlistItems ?? []
      };

      setSelectedPortfolio(nextPortfolio);
      setSelectedPortfolioId(portfolioId);
      setAuditRows(nextPortfolio.auditLog);
      setRiskReport(null);
      setRiskInsight(null);
      setBenchmarkAnalytics(null);
      setStressResult(null);

      const requests: Promise<void>[] = [
        loadPortfolioHistory(portfolioId, portfolioRange)
          .then((history) => {
            setSelectedPortfolio((current) =>
              current && current.id === portfolioId
                ? {
                    ...current,
                    valueHistory: history
                  }
                : current
            );
          })
          .catch((error) => {
            setHistoryError(error instanceof Error ? error.message : "Performance history unavailable");
            setSelectedPortfolio((current) =>
              current && current.id === portfolioId
                ? {
                    ...current,
                    valueHistory: current.valueHistory
                  }
                : current
            );
          })
      ];

      if (portfolioData.portfolio.positions.length > 0) {
        requests.push(
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
          })
            .then(async (riskResponse) => {
              if (!riskResponse.ok) {
                setRiskError(await readErrorMessage(riskResponse));
                return;
              }
              const riskData = (await riskResponse.json()) as {
                holdings: WorkspacePortfolio["holdings"];
                metrics: WorkspacePortfolio["metrics"];
                error?: string;
              };
              setSelectedPortfolio((current) =>
                current && current.id === portfolioId
                  ? {
                      ...current,
                      holdings: mergeHydratedHoldings(current.positions, riskData.holdings ?? []),
                      metrics: riskData.metrics ?? null
                  }
                  : current
              );
              setRiskError(riskData.error ?? null);
            })
            .catch((error) => {
              setRiskError(error instanceof Error ? error.message : "Live pricing and risk are unavailable");
            })
        );
      }

      await Promise.allSettled(requests);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load portfolio");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function refreshAudit() {
    if (!selectedPortfolioId) {
      return false;
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
    setAuditError(null);
    return true;
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
        const benchmark = defaultBenchmarkForPortfolio(nextName);
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await getAuthHeaders())
          },
          body: JSON.stringify({
            name: nextName,
            benchmark,
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

  async function fetchSecurityPreviewData(symbol: string) {
    const normalizedSymbol = normalizeBenchmarkSymbol(symbol);
    const response = await fetch(`/api/securities/${encodeURIComponent(normalizedSymbol)}/preview`, {
      headers: {
        ...(await getAuthHeaders())
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as {
      preview: SecurityPreview | null;
      valid?: boolean;
      error?: string;
    };
    if (!data.valid || !data.preview) {
      throw new Error(data.error ?? "No listed ticker found.");
    }
    return data.preview;
  }

  async function loadPositionPreview(
    symbol: string,
    selection?: SecuritySearchResult | null
  ) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setPositionPreview(null);
      setPositionPreviewLoading(false);
      return false;
    }

    setPositionPreviewLoading(true);
    setSearchError(null);
    try {
      const preview = await fetchSecurityPreviewData(normalizedSymbol);

      setSelectedSecurity(
        selection ?? {
          symbol: preview.symbol,
          companyName: preview.companyName,
          exchange: preview.exchange,
          quoteType: preview.quoteType,
          sector: preview.sector,
          hasPreviewData: true
        }
      );
      setPositionTicker(preview.symbol);
      setPositionName(preview.companyName);
      setPositionPreview(preview);
      setSearchResults([]);
      return true;
    } catch (error) {
      setSelectedSecurity(null);
      setPositionTicker("");
      setPositionName("");
      setPositionPreview(null);
      setSearchError(error instanceof Error ? error.message : "Ticker preview failed");
      return false;
    } finally {
      setPositionPreviewLoading(false);
    }
  }

  async function handleSelectSearchResult(result: SecuritySearchResult) {
    setSelectedSecurity(result);
    setPositionTicker(result.symbol);
    setPositionName(result.companyName);
    setSearchTerm(result.symbol);
    await loadPositionPreview(result.symbol, result);
  }

  async function loadBenchmarkPreview(
    symbol: string,
    selection?: SecuritySearchResult | null
  ) {
    const normalizedSymbol = normalizeBenchmarkSymbol(symbol);
    if (!normalizedSymbol) {
      setBenchmarkPreview(null);
      setBenchmarkPreviewLoading(false);
      return false;
    }

    setBenchmarkPreviewLoading(true);
    setBenchmarkSearchError(null);
    try {
      const preview = await fetchSecurityPreviewData(normalizedSymbol);
      setSelectedBenchmarkSecurity(
        selection ?? {
          symbol: preview.symbol,
          companyName: preview.companyName,
          exchange: preview.exchange,
          quoteType: preview.quoteType,
          sector: preview.sector,
          hasPreviewData: true
        }
      );
      setBenchmarkSearchTerm(preview.symbol);
      setBenchmarkPreview(preview);
      setBenchmarkSearchResults([]);
      return true;
    } catch (error) {
      setSelectedBenchmarkSecurity(null);
      setBenchmarkPreview(null);
      setBenchmarkSearchError(
        error instanceof Error ? error.message : "Benchmark preview failed"
      );
      return false;
    } finally {
      setBenchmarkPreviewLoading(false);
    }
  }

  async function handleSelectBenchmarkResult(result: SecuritySearchResult) {
    setSelectedBenchmarkSecurity(result);
    setBenchmarkSearchTerm(result.symbol);
    await loadBenchmarkPreview(result.symbol, result);
  }

  async function refreshWatchlist(portfolioId = selectedPortfolioId) {
    if (!portfolioId) {
      return [];
    }

    const response = await fetch(`/api/portfolio/${portfolioId}/watchlist`, {
      headers: {
        ...(await getAuthHeaders())
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as { items: WatchlistItem[] };
    updateWatchlistSnapshot(data.items ?? []);
    return data.items ?? [];
  }

  async function loadResearchFeed(portfolioId: string, refresh = false) {
    const todayKey = `research-feed:${initialData.user.id}:${portfolioId}`;
    const response = await fetch(`/api/portfolio/${portfolioId}/research/feed`, {
      method: refresh ? "POST" : "GET",
      headers: {
        ...(await getAuthHeaders())
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as {
      generatedAt: string | null;
      candidates: ResearchCandidate[];
      error?: string;
    };
    setResearchFeed({
      generatedAt: data.generatedAt,
      candidates: data.candidates ?? []
    });
    if (data.error) {
      setResearchFeedError(data.error);
    } else {
      setResearchFeedError(null);
      window.localStorage.setItem(todayKey, new Date().toISOString().slice(0, 10));
    }
    return data.candidates ?? [];
  }

  async function loadResearchPreview(
    symbol: string,
    selection?: SecuritySearchResult | null
  ) {
    const normalizedSymbol = normalizeBenchmarkSymbol(symbol);
    if (!normalizedSymbol) {
      setResearchPreview(null);
      setResearchPreviewLoading(false);
      return false;
    }

    setResearchPreviewLoading(true);
    setResearchSearchError(null);
    try {
      const preview = await fetchSecurityPreviewData(normalizedSymbol);
      setSelectedResearchSecurity(
        selection ?? {
          symbol: preview.symbol,
          companyName: preview.companyName,
          exchange: preview.exchange,
          quoteType: preview.quoteType,
          sector: preview.sector,
          hasPreviewData: true
        }
      );
      setResearchSearchTerm(preview.symbol);
      setResearchPreview(preview);
      setSelectedResearchTicker(preview.symbol);
      setSelectedResearchItemId(null);
      setResearchSearchResults([]);
      return true;
    } catch (error) {
      setSelectedResearchSecurity(null);
      setResearchPreview(null);
      setResearchSearchError(error instanceof Error ? error.message : "Research preview failed");
      return false;
    } finally {
      setResearchPreviewLoading(false);
    }
  }

  async function handleSelectResearchSearchResult(result: SecuritySearchResult) {
    setSelectedResearchSecurity(result);
    setResearchSearchTerm(result.symbol);
    await loadResearchPreview(result.symbol, result);
  }

  async function saveWatchlistEntry(input: {
    ticker: string;
    sourceType: "manual" | "related" | "screener" | "trending";
    sourceLabel: string;
  }) {
    if (!selectedPortfolio) {
      setErrorMessage("Select a portfolio before saving research ideas.");
      return false;
    }

    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          setResearchSearchError(null);
          const response = await fetch(`/api/portfolio/${selectedPortfolio.id}/watchlist`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(await getAuthHeaders())
            },
            body: JSON.stringify(input)
          });

          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }

          const data = (await response.json()) as { item: WatchlistItem };
          const nextItems = await refreshWatchlist(selectedPortfolio.id);
          setSelectedResearchItemId(data.item.id);
          setSelectedResearchTicker(data.item.ticker);
          setStatusMessage(`${data.item.ticker} saved to research queue.`);
          if (nextItems.length > 0) {
            setResearchPreview(null);
            setSelectedResearchSecurity(null);
            setResearchSearchTerm("");
          }
          resolve(true);
        } catch (error) {
          setResearchSearchError(
            error instanceof Error ? error.message : "Failed to save research idea"
          );
          resolve(false);
        }
      });
    });
  }

  async function saveWatchlistDraft() {
    if (!selectedPortfolio || !selectedResearchItemId) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/portfolio/${selectedPortfolio.id}/watchlist/${selectedResearchItemId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              ...(await getAuthHeaders())
            },
            body: JSON.stringify({
              status: watchlistDraft.status,
              conviction: Number(watchlistDraft.conviction),
              targetPrice: watchlistDraft.targetPrice ? Number(watchlistDraft.targetPrice) : null,
              thesis: watchlistDraft.thesis,
              catalysts: watchlistDraft.catalysts,
              risks: watchlistDraft.risks,
              valuationNotes: watchlistDraft.valuationNotes,
              notes: watchlistDraft.notes
            })
          }
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        await refreshWatchlist(selectedPortfolio.id);
        setStatusMessage("Research notebook updated.");
      } catch (error) {
        setResearchInsightError(
          error instanceof Error ? error.message : "Failed to update research item"
        );
      }
    });
  }

  async function removeWatchlistItem(itemId: string) {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/portfolio/${selectedPortfolio.id}/watchlist/${itemId}`, {
          method: "DELETE",
          headers: {
            ...(await getAuthHeaders())
          }
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const nextItems = await refreshWatchlist(selectedPortfolio.id);
        const nextItem = nextItems[0] ?? null;
        setSelectedResearchItemId(nextItem?.id ?? null);
        setSelectedResearchTicker(nextItem?.ticker ?? null);
        setStatusMessage("Research item removed.");
      } catch (error) {
        setResearchInsightError(
          error instanceof Error ? error.message : "Failed to remove research item"
        );
      }
    });
  }

  async function markWatchlistPromoted(itemId: string) {
    if (!selectedPortfolio) {
      return false;
    }

    const response = await fetch(
      `/api/portfolio/${selectedPortfolio.id}/watchlist/${itemId}/promote`,
      {
        method: "POST",
        headers: {
          ...(await getAuthHeaders())
        }
      }
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    await refreshWatchlist(selectedPortfolio.id);
    return true;
  }

  async function promoteWatchlistItem(item: WatchlistItem) {
    const selection: SecuritySearchResult = {
      symbol: item.ticker,
      companyName: item.companyName,
      exchange: item.exchange,
      quoteType: item.quoteType,
      sector: item.sector,
      hasPreviewData: true
    };

    setPendingPromotionItemId(item.id);
    setEditingTicker(null);
    setPositionShares("");
    setPositionAvgCost("");
    setPositionAssetClass("equities");
    setActiveTab("holdings");
    setSelectedSecurity(selection);
    setPositionTicker(item.ticker);
    setPositionName(item.companyName);
    setSearchTerm(item.ticker);
    setPositionPreview(null);
    await loadPositionPreview(item.ticker, selection);
    setStatusMessage(`Review size and cost basis, then add ${item.ticker} as a holding.`);
  }

  async function loadResearchInsightForTicker(
    ticker: string,
    watchlistItemId?: string | null,
    sourceType?: "manual" | "related" | "screener" | "trending"
  ) {
    if (!selectedPortfolio) {
      return;
    }

    setResearchInsightLoading(true);
    setResearchInsightError(null);
    try {
      const response = await fetch(`/api/portfolio/${selectedPortfolio.id}/research/insight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({
          ticker,
          watchlistItemId: watchlistItemId ?? undefined,
          sourceType
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const data = (await response.json()) as {
        insight: ResearchInsight;
        featureBundle: ResearchFeatureBundle;
      };
      setResearchInsight(data.insight);
      setResearchFeatureBundle(data.featureBundle);
    } catch (error) {
      setResearchInsight(null);
      setResearchFeatureBundle(null);
      setResearchInsightError(
        error instanceof Error ? error.message : "Research copilot unavailable"
      );
    } finally {
      setResearchInsightLoading(false);
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
    setSelectedSecurity(null);
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError(null);
    setPendingPromotionItemId(null);
  }

  function resetBenchmarkForm() {
    setBenchmarkSearchTerm("");
    setBenchmarkSearchResults([]);
    setBenchmarkSearchLoading(false);
    setBenchmarkSearchError(null);
    setSelectedBenchmarkSecurity(null);
    setBenchmarkPreview(null);
  }

  async function saveBenchmarkSymbol(symbol: string, successMessage: string) {
    if (!selectedPortfolio) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
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
              benchmark: normalizeBenchmarkSymbol(symbol)
            })
          });

          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }

          await loadPortfolio(selectedPortfolio.id);
          await refreshPortfolioList();
          setStatusMessage(successMessage);
          resolve(true);
        } catch (error) {
          setBenchmarkSearchError(
            error instanceof Error ? error.message : "Failed to update benchmark"
          );
          resolve(false);
        }
      });
    });
  }

  async function saveSinglePosition(
    position: PositionInput,
    mode: "create" | "update",
    successMessage: string
  ) {
    if (!selectedPortfolio) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        setErrorMessage(null);
        setStatusMessage(null);
        try {
          const authHeaders = await getAuthHeaders();
          const endpoint =
            mode === "update"
              ? `/api/portfolio/${selectedPortfolio.id}/positions/${encodeURIComponent(position.ticker)}`
              : `/api/portfolio/${selectedPortfolio.id}/positions`;
          const response = await fetch(endpoint, {
            method: mode === "update" ? "PATCH" : "POST",
            headers: {
              "content-type": "application/json",
              ...authHeaders
            },
            body: JSON.stringify(position)
          });

          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }

          await loadPortfolio(selectedPortfolio.id);
          await refreshPortfolioList();
          setStatusMessage(successMessage);
          resolve(true);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to update portfolio"
          );
          resolve(false);
        }
      });
    });
  }

  async function deleteSinglePosition(ticker: string, successMessage: string) {
    if (!selectedPortfolio) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        setErrorMessage(null);
        setStatusMessage(null);
        try {
          const response = await fetch(
            `/api/portfolio/${selectedPortfolio.id}/positions/${encodeURIComponent(ticker)}`,
            {
              method: "DELETE",
              headers: {
                ...(await getAuthHeaders())
              }
            }
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }

          await loadPortfolio(selectedPortfolio.id);
          await refreshPortfolioList();
          setStatusMessage(successMessage);
          resolve(true);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to update portfolio"
          );
          resolve(false);
        }
      });
    });
  }

  async function commitAllocationPositions(
    nextPositions: WorkspacePortfolio["positions"],
    successMessage: string
  ) {
    if (!selectedPortfolio) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
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
          resolve(true);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to commit allocation"
          );
          resolve(false);
        }
      });
    });
  }

  async function handlePositionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPortfolio) {
      setErrorMessage("Create or select a portfolio first.");
      return;
    }

    const normalizedTicker = (selectedSecurity?.symbol ?? positionTicker).trim().toUpperCase();
    const shares = Number(positionShares);
    const avgCost = Number(positionAvgCost);

    if (!normalizedTicker) {
      setErrorMessage("Choose a ticker before adding a position.");
      return;
    }
    if (!selectedSecurity || selectedSecurity.symbol !== normalizedTicker) {
      setErrorMessage("Select a listed ticker from search before saving the position.");
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

    const existing = selectedPortfolio.positions.find((position) => position.ticker === normalizedTicker);
    const actionLabel =
      editingTicker || existing ? "Position updated." : "Position added.";

    const saved = await saveSinglePosition(
      nextPosition,
      editingTicker || existing ? "update" : "create",
      actionLabel
    );
    if (saved) {
      if (pendingPromotionItemId) {
        try {
          await markWatchlistPromoted(pendingPromotionItemId);
          setStatusMessage(`${normalizedTicker} promoted into holdings.`);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Position saved, but research promotion failed."
          );
        } finally {
          setPendingPromotionItemId(null);
        }
      }
      resetPositionForm();
    }
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
    const selection: SecuritySearchResult = {
      symbol: position.ticker,
      companyName: holding?.companyName ?? position.ticker,
      exchange: holding?.exchange ?? "N/A",
      quoteType: "EQUITY",
      sector: holding?.sector,
      hasPreviewData: true
    };
    setSelectedSecurity(selection);
    setPositionTicker(position.ticker);
    setPositionName(holding?.companyName ?? position.ticker);
    setSearchTerm(position.ticker);
    setPositionShares(String(position.shares));
    setPositionAvgCost(String(position.avgCost));
    setPositionAssetClass(position.assetClass);
    setActiveTab("holdings");
    void loadPositionPreview(position.ticker, selection);
  }

  async function removePosition(ticker: string) {
    if (!selectedPortfolio) {
      return;
    }

    await deleteSinglePosition(ticker, `${ticker} removed from portfolio.`);
  }

  async function openHoldingDetail(ticker: string) {
    setHoldingDetailLoading(true);
    setSelectedHoldingDetail(null);
    setHoldingDetailError(null);
    try {
      await loadHoldingDetail(ticker, holdingRange);
    } catch (error) {
      const fallbackHolding = selectedPortfolio?.holdings.find((holding) => holding.ticker === ticker);
      if (fallbackHolding) {
        setSelectedHoldingDetail(buildFallbackCompanyDetail(fallbackHolding));
      }
      setHoldingDetailError(
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
        setRiskError(null);
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
          error?: string;
        };
        setSelectedPortfolio((current) => {
          if (!current) {
            return current;
          }
          const nextPortfolio = {
            ...current,
            holdings: data.holdings ?? current.holdings,
            metrics: data.metrics ?? null,
            valueHistory: data.series
              ? buildPortfolioHistory(data.series, portfolioRange)
              : current.valueHistory
          };
          updateSelectedPortfolioSnapshot(nextPortfolio);
          return nextPortfolio;
        });
        setRiskError(data.error ?? null);
        if (persist && data.metrics) {
          await refreshPortfolioList();
          try {
            await refreshAudit();
          } catch (error) {
            setAuditError(error instanceof Error ? error.message : "Audit refresh failed");
          }
          setRiskReport(null);
          setRiskInsight(null);
          setStatusMessage("Risk score refreshed.");
        } else if (persist && data.error) {
          setStatusMessage(null);
        }
      } catch (error) {
        setRiskError(error instanceof Error ? error.message : "Risk scoring failed");
      }
    });
  }

  async function refreshRiskInsight() {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      try {
        setRiskInsightError(null);
        const response = await fetch("/api/risk/insights", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await getAuthHeaders())
          },
          body: JSON.stringify({
            portfolioId: selectedPortfolio.id,
            refresh: true,
            persist: true
          })
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const data = (await response.json()) as { insight: RiskInsight | null; error?: string };
        setRiskInsight(data.insight);
        setRiskInsightError(data.insight ? null : data.error ?? "AI insight unavailable");
        setStatusMessage("AI risk insight refreshed.");
      } catch (error) {
        setRiskInsightError(error instanceof Error ? error.message : "AI insight unavailable");
      }
    });
  }

  async function runStressScenario() {
    if (!selectedPortfolio) {
      return;
    }

    startTransition(async () => {
      try {
        setStressError(null);
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
        setStressError(error instanceof Error ? error.message : "Stress test failed");
      }
    });
  }

  async function commitAllocation() {
    if (!selectedPortfolio || !selectedMetrics) {
      return;
    }

    const totalWeight = Object.values(allocationWeights).reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0) {
      setAllocationError("Target weights must sum to more than zero.");
      return;
    }
    setAllocationError(null);

    const normalized = Object.fromEntries(
      Object.entries(allocationWeights).map(([ticker, weight]) => [ticker, weight / totalWeight])
    );
    const nextPositions = selectedPortfolio.holdings.map((holding) => {
      const targetValue =
        selectedMetrics.portfolioValue * (normalized[holding.ticker] ?? 0);
      return {
        ticker: holding.ticker,
        shares: !holding.currentPrice ? 0 : targetValue / holding.currentPrice,
        avgCost: holding.avgCost,
        assetClass: holding.assetClass ?? "equities"
      };
    });

    const committed = await commitAllocationPositions(nextPositions, "Allocation committed.");
    if (!committed) {
      setAllocationError("Allocation commit failed.");
      return;
    }
    await rerunRiskScore(true);
  }

  async function choosePresetBenchmark(symbol: string) {
    const normalizedSymbol = normalizeBenchmarkSymbol(symbol);
    setBenchmarkSearchError(null);
    setSelectedBenchmarkSecurity({
      symbol: normalizedSymbol,
      companyName: normalizedSymbol,
      exchange: "Preset benchmark",
      quoteType: "ETF",
      hasPreviewData: true
    });
    setBenchmarkSearchTerm(normalizedSymbol);
    void loadBenchmarkPreview(normalizedSymbol);
  }

  async function applyBenchmarkSelection() {
    if (!selectedPortfolio) {
      return;
    }

    const symbol = normalizeBenchmarkSymbol(
      benchmarkPreview?.symbol ?? selectedBenchmarkSecurity?.symbol ?? benchmarkSearchTerm
    );
    if (!symbol) {
      setBenchmarkSearchError("Choose a benchmark ticker before saving.");
      return;
    }

    if (!benchmarkPreview || benchmarkPreview.symbol !== symbol) {
      setBenchmarkSearchError("Select a valid Yahoo benchmark result before saving.");
      return;
    }

    const saved = await saveBenchmarkSymbol(symbol, `Benchmark updated to ${symbol}.`);
    if (saved) {
      setBenchmarkSearchTerm(symbol);
    }
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function deletePortfolio() {
    if (!selectedPortfolio) {
      return;
    }

    const confirmed = window.confirm(
      `Archive ${selectedPortfolio.name}? It will disappear from the active workspace but remain in compliance history.`
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/portfolio/${selectedPortfolio.id}`, {
          method: "DELETE",
          headers: {
            ...(await getAuthHeaders())
          }
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const remaining = await refreshPortfolioList();
        const nextPortfolioId = remaining[0]?.id ?? "";
        setSelectedPortfolio(null);
        setSelectedPortfolioId("");
        setAuditRows([]);
        setStressResult(null);
        setRiskReport(null);
        setRiskInsight(null);
        if (nextPortfolioId) {
          await loadPortfolio(nextPortfolioId);
        }
        setStatusMessage("Portfolio archived.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to archive portfolio");
      }
    });
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
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                  />
                    <button className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
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
                value={`${formatCurrency(dailyPnl)} • ${formatPercent(dailyPnlPercent)}`}
                tone={dailyPnl >= 0 ? "positive" : "negative"}
              />
              <InfoPill
                label={labelForRange(portfolioRange)}
                value={`${formatCurrency(portfolioRangePerformance.absolute)} • ${formatPercent(
                  portfolioRangePerformance.percent
                )}`}
                tone={portfolioRangePerformance.absolute >= 0 ? "positive" : "negative"}
              />
              <InfoPill label="Risk Tier" value={selectedMetrics?.riskTier ?? "Unscored"} />
              <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
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
                <span className="text-xs text-slate-500">
                  {selectedPortfolio?.positions.length ? "Pricing unavailable" : "Unfunded"}
                </span>
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
                    {selectedPortfolio.name} • Benchmark {selectedPortfolio.benchmark}
                  </p>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <h2 className="text-5xl font-semibold tracking-[-0.05em] text-white">
                      {selectedMetrics
                        ? formatCurrency(selectedMetrics.portfolioValue)
                        : selectedPortfolio.positions.length > 0
                          ? "Pricing unavailable"
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
                      (selectedPortfolio.positions.length > 0
                        ? "Positions are saved, but live pricing or risk hydration is currently unavailable."
                        : "This sleeve has no positions yet. Add holdings to start live valuation and risk scoring.")}
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
                          : riskReportLoading
                            ? "Loading"
                            : getDefaultSector()
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
                        className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
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
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                <button className="w-full rounded-md bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
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
              copy="Create sleeves for growth, income, balanced, defensive, or speculative strategies and compare them here."
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
                      "rounded-xl border p-5 text-left transition duration-200 hover:-translate-y-0.5",
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
              <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-4">
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
                      value={
                        selectedRangePortfolioValue > 0
                          ? formatCurrency(selectedRangePortfolioValue)
                          : "N/A"
                      }
                    />
                    <InfoPill
                      label="Day Move"
                      value={formatCurrency(dailyPnl)}
                      tone={dailyPnl >= 0 ? "positive" : "negative"}
                    />
                  </div>
                </div>
                <div className={cn("h-80 transition-opacity duration-200", historyLoading && "opacity-70")}>
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
                    <Tooltip
                      cursor={{
                        stroke: "rgba(255,255,255,0.28)",
                        strokeWidth: 1,
                        fill: "rgba(255,255,255,0.02)"
                      }}
                      wrapperStyle={{ outline: "none" }}
                      content={<ChartTooltip formatter={formatCurrency} />}
                    />
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
                    {riskReport?.sectorConcentration[0]?.sector ??
                      (riskReportLoading ? "Loading" : getDefaultSector())}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {riskReport?.sectorConcentration[0]
                      ? `${formatPercent(riskReport.sectorConcentration[0].weight)} portfolio weight`
                      : riskReportLoading
                        ? "Sector analysis is loading."
                        : "Sector data unavailable for the current holdings."}
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

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="Portfolio vs Benchmark">
            {benchmarkAnalyticsError ? (
              <div className="mb-4">
                <InlineNotice message={benchmarkAnalyticsError} tone="warning" />
              </div>
            ) : null}
            {!selectedPortfolio ? (
              <EmptyState
                title="No benchmark comparison yet"
                copy="Select a portfolio to compare selected-range performance against its benchmark."
              />
            ) : !benchmarkAnalytics ? (
              <EmptyState
                title="Benchmark comparison loading"
                copy="Selected-range portfolio and benchmark analytics appear here once Yahoo history resolves."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <InfoPill
                    label="Portfolio"
                    value={formatPercent(benchmarkAnalytics.portfolioReturn)}
                    tone={(benchmarkAnalytics.portfolioReturn ?? 0) >= 0 ? "positive" : "negative"}
                  />
                  <InfoPill
                    label={benchmarkAnalytics.benchmark}
                    value={formatPercent(benchmarkAnalytics.benchmarkReturn)}
                    tone={(benchmarkAnalytics.benchmarkReturn ?? 0) >= 0 ? "positive" : "negative"}
                  />
                  <InfoPill
                    label="Excess Return"
                    value={formatPercent(benchmarkAnalytics.excessReturn)}
                    tone={(benchmarkAnalytics.excessReturn ?? 0) >= 0 ? "positive" : "negative"}
                  />
                  <InfoPill
                    label="Correlation"
                    value={
                      benchmarkAnalytics.correlation != null
                        ? benchmarkAnalytics.correlation.toFixed(2)
                        : "N/A"
                    }
                  />
                  <InfoPill
                    label="Beta"
                    value={
                      benchmarkAnalytics.beta != null ? benchmarkAnalytics.beta.toFixed(2) : "N/A"
                    }
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Relative stance</p>
                  <div className="mt-3 space-y-2">
                    {benchmarkAnalytics.relativeNotes.map((note) => (
                      <p key={note} className="text-sm text-slate-300">
                        {note}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Top Drivers">
            {!benchmarkAnalytics ? (
              <EmptyState
                title="Attribution loading"
                copy="Holding and sector contribution drivers populate from the active selected range."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Top holding contributor</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {topPositiveHoldingContributor?.ticker ?? "N/A"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {topPositiveHoldingContributor
                      ? `${formatPercent(topPositiveHoldingContributor.contribution)} contribution`
                      : "No positive holding contribution yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Top holding detractor</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {topNegativeHoldingContributor?.ticker ?? "N/A"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {topNegativeHoldingContributor
                      ? `${formatPercent(topNegativeHoldingContributor.contribution)} contribution`
                      : "No negative holding contribution yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Top sector contributor</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {topPositiveSectorContributor?.sector ?? "N/A"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {topPositiveSectorContributor
                      ? `${formatPercent(topPositiveSectorContributor.contribution)} contribution`
                      : "No positive sector contribution yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Top sector detractor</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {topNegativeSectorContributor?.sector ?? "N/A"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {topNegativeSectorContributor
                      ? `${formatPercent(topNegativeSectorContributor.contribution)} contribution`
                      : "No negative sector contribution yet"}
                  </p>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel
            title="Portfolio Health Matrix"
            action={
              riskReport ? (
                <span className="text-xs text-slate-500">
                  Data confidence {riskReport.dataConfidence.overall}
                </span>
              ) : null
            }
          >
            {!riskReport ? (
              <EmptyState
                title="Health scores are loading"
                copy="Quality, downside, and concentration diagnostics appear once the deterministic report is available."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <HealthScoreCard label="Concentration" detail={riskReport.qualityScoreDetails.concentration} />
                <HealthScoreCard label="Liquidity" detail={riskReport.qualityScoreDetails.liquidity} />
                <HealthScoreCard label="Balance Sheet" detail={riskReport.qualityScoreDetails.balanceSheet} />
                <HealthScoreCard label="Profitability" detail={riskReport.qualityScoreDetails.profitability} />
                <HealthScoreCard label="Growth" detail={riskReport.qualityScoreDetails.growth} />
                <HealthScoreCard label="Downside" detail={riskReport.qualityScoreDetails.downsideRisk} />
              </div>
            )}
          </Panel>

          <Panel
            title="AI Copilot Summary"
            action={
              <div className="flex items-center gap-3">
                {riskInsightLoading ? <span className="text-xs text-slate-500">Refreshing AI</span> : null}
                <button
                  onClick={() => void refreshRiskInsight()}
                  className="text-sm text-zinc-300 transition hover:text-white"
                >
                  Refresh AI
                </button>
              </div>
            }
          >
            {riskInsightError ? <div className="mb-4"><InlineNotice message={riskInsightError} tone="warning" /></div> : null}
            {!riskInsight ? (
              <EmptyState
                title="AI copilot unavailable"
                copy="Deterministic risk is still active. AI interpretation appears here when the insight pipeline succeeds."
              />
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Executive diagnosis</p>
                    <span className="text-xs text-slate-500">
                      {riskInsight.source} • {riskInsight.dataConfidence}
                    </span>
                  </div>
                  <p className="text-sm leading-7 text-slate-300">{riskInsight.summary}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Key Drivers</p>
                    <div className="mt-3 space-y-2">
                      {riskInsight.drivers.map((item) => (
                        <p key={item} className="text-sm text-slate-300">{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recommended Action</p>
                    <div className="mt-3 space-y-2">
                      {riskInsight.recommendedActions.map((item) => (
                        <p key={item} className="text-sm text-slate-300">{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="What Changed">
            {!riskReport ? (
              <EmptyState
                title="Change diagnostics unavailable"
                copy="The portfolio delta and regime-change logic appears once the deterministic report is computed."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Change Summary</p>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{riskReport.changeDiagnostics.summary}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoPill
                    label="Sharpe Delta"
                    value={riskReport.changeDiagnostics.sharpeDelta != null ? riskReport.changeDiagnostics.sharpeDelta.toFixed(2) : "Baseline"}
                    tone={(riskReport.changeDiagnostics.sharpeDelta ?? 0) >= 0 ? "positive" : "negative"}
                  />
                  <InfoPill
                    label="VaR Delta"
                    value={riskReport.changeDiagnostics.varDelta != null ? formatPercent(riskReport.changeDiagnostics.varDelta) : "Baseline"}
                    tone={(riskReport.changeDiagnostics.varDelta ?? 0) <= 0 ? "positive" : "negative"}
                  />
                  <InfoPill
                    label="Trigger"
                    value={riskReport.changeDiagnostics.trigger.replace("_", " ")}
                  />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Exposure Snapshot">
            {!riskReport ? (
              <EmptyState
                title="Exposure snapshot unavailable"
                copy="Sector, industry, and benchmark-relative exposure load after the report pipeline completes."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoPill label="Sectors" value={`${riskReport.exposureDiagnostics.sectorCount}`} />
                  <InfoPill label="Industries" value={`${riskReport.exposureDiagnostics.industryCount}`} />
                  <InfoPill
                    label={`Excess vs ${selectedPortfolio?.benchmark ?? riskReport.benchmarkComparison.benchmark}`}
                    value={formatPercent(benchmarkAnalytics?.excessReturn ?? riskReport.benchmarkComparison.excessReturn)}
                    tone={(benchmarkAnalytics?.excessReturn ?? riskReport.benchmarkComparison.excessReturn) >= 0 ? "positive" : "negative"}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Top Industries</p>
                    <div className="mt-3 space-y-2">
                      {riskReport.industryConcentration.slice(0, 3).map((industry) => (
                        <div key={industry.industry} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300">{industry.industry}</span>
                          <span className="text-white">{formatPercent(industry.weight)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Watchlist Alerts</p>
                    <div className="mt-3 space-y-2">
                      {(riskInsight?.alerts ?? []).length > 0 ? (
                        riskInsight!.alerts.map((alert) => (
                          <p key={alert.message} className="text-sm text-slate-300">{alert.message}</p>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">No AI alerts available yet.</p>
                      )}
                    </div>
                  </div>
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
          <div className="grid gap-3 lg:grid-cols-7">
            <InfoPill label="Selected" value={selectedPortfolio.name} />
            <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
            <InfoPill
              label="Portfolio Value"
              value={selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "N/A"}
            />
            <InfoPill
              label="Day Change"
              value={formatCurrency(dailyPnl)}
              tone={dailyPnl >= 0 ? "positive" : "negative"}
            />
            <InfoPill
              label={labelForRange(portfolioRange)}
              value={formatPercent(benchmarkAnalytics?.portfolioReturn ?? portfolioRangePerformance.percent)}
              tone={(benchmarkAnalytics?.portfolioReturn ?? portfolioRangePerformance.percent) >= 0 ? "positive" : "negative"}
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
        {historyError ? <div className="mb-4"><InlineNotice message={historyError} tone="warning" /></div> : null}
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
                    {selectedRangePortfolioValue > 0
                      ? formatCurrency(selectedRangePortfolioValue)
                      : "Awaiting price"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {portfolioRange} return {formatCurrency(portfolioRangePerformance.absolute)} •{" "}
                    {formatPercent(portfolioRangePerformance.percent)}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium",
                    portfolioRangePerformance.absolute >= 0
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger"
                  )}
                >
                  {formatCurrency(portfolioRangePerformance.absolute)} /{" "}
                  {formatPercent(portfolioRangePerformance.percent)}
                </div>
              </div>
              <div className={cn("mt-4 h-72 transition-opacity duration-200", historyLoading && "opacity-70")}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedPortfolio.valueHistory}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} minTickGap={24} />
                    <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip
                      cursor={{
                        stroke: "rgba(255,255,255,0.28)",
                        strokeWidth: 1,
                        fill: "rgba(255,255,255,0.02)"
                      }}
                      wrapperStyle={{ outline: "none" }}
                      content={<ChartTooltip formatter={formatCurrency} />}
                    />
                    <Area type="monotone" dataKey="drawdown" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.18)" />
                    <Line type="monotone" dataKey="peak" stroke="rgba(255,255,255,0.18)" dot={false} strokeWidth={1.1} />
                    <Line type="monotone" dataKey="value" stroke="#fafafa" dot={false} strokeWidth={2.4} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
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
          {riskError ? <div className="mb-4"><InlineNotice message={riskError} tone="warning" /></div> : null}
          {benchmarkAnalyticsError ? <div className="mb-4"><InlineNotice message={benchmarkAnalyticsError} tone="warning" /></div> : null}
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
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <InfoPill
                  label="Biggest contributor"
                  value={
                    topPositiveHoldingContributor
                      ? `${topPositiveHoldingContributor.ticker} ${formatPercent(topPositiveHoldingContributor.contribution)}`
                      : "N/A"
                  }
                  tone={(topPositiveHoldingContributor?.contribution ?? 0) >= 0 ? "positive" : "negative"}
                />
                <InfoPill
                  label="Biggest detractor"
                  value={
                    topNegativeHoldingContributor
                      ? `${topNegativeHoldingContributor.ticker} ${formatPercent(topNegativeHoldingContributor.contribution)}`
                      : "N/A"
                  }
                  tone={(topNegativeHoldingContributor?.contribution ?? 0) >= 0 ? "positive" : "negative"}
                />
                <InfoPill
                  label="Strongest sector"
                  value={
                    topPositiveSectorContributor
                      ? `${topPositiveSectorContributor.sector} ${formatPercent(topPositiveSectorContributor.contribution)}`
                      : "N/A"
                  }
                  tone={(topPositiveSectorContributor?.contribution ?? 0) >= 0 ? "positive" : "negative"}
                />
                <InfoPill
                  label="Weakest sector"
                  value={
                    topNegativeSectorContributor
                      ? `${topNegativeSectorContributor.sector} ${formatPercent(topNegativeSectorContributor.contribution)}`
                      : "N/A"
                  }
                  tone={(topNegativeSectorContributor?.contribution ?? 0) >= 0 ? "positive" : "negative"}
                />
              </div>
              <div className="space-y-2">
              {sortedHoldings.map((holding) => (
                <button
                  key={holding.ticker}
                  type="button"
                  onClick={() => void openHoldingDetail(holding.ticker)}
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-4 text-left transition duration-200 hover:border-white/25 hover:bg-white/[0.045]"
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

                    <div className="grid min-w-[250px] gap-3 sm:grid-cols-5">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Price</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(holding.currentPrice)}</p>
                        {holding.dailyPnl != null ? (
                          <p className={cn("mt-1 text-xs", holding.dailyPnl >= 0 ? "text-success" : "text-danger")}>
                            {formatCurrency(holding.dailyPnl)} today
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">Quote unavailable</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Position</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(holding.currentValue)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatPercent(holding.weight)} weight</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Return</p>
                        <p className={cn("mt-1 text-lg font-semibold", (holding.totalGain ?? 0) >= 0 ? "text-success" : "text-danger")}>
                          {formatCurrency(holding.totalGain)} • {formatPercent(holding.totalGainPercent)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Avg {formatCurrency(holding.avgCost)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Exposure</p>
                        <p className="mt-1 text-lg font-semibold text-white">{holding.shares.toFixed(2)} sh</p>
                        <p className="mt-1 text-xs text-slate-500">{holding.assetClass ?? "equities"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Contribution</p>
                        <p
                          className={cn(
                            "mt-1 text-lg font-semibold",
                            (holdingContributionMap.get(holding.ticker.toUpperCase())?.contribution ?? 0) >= 0
                              ? "text-success"
                              : "text-danger"
                          )}
                        >
                          {formatPercent(holdingContributionMap.get(holding.ticker.toUpperCase())?.contribution)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {portfolioRange} contribution
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingPosition(holding.ticker);
                        }}
                        className="rounded-md border border-white/12 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.04]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removePosition(holding.ticker);
                        }}
                        className="rounded-md border border-danger/40 px-4 py-2 text-sm text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </button>
              ))}
              </div>
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
                {searchError ? <div className="mb-2"><InlineNotice message={searchError} tone="warning" /></div> : null}
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setSearchTerm(nextQuery);
                    setSelectedSecurity(null);
                    setPositionTicker("");
                    setPositionName("");
                    setPositionPreview(null);
                    setSearchError(null);
                  }}
                  placeholder="AAPL, KO, XOM..."
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                {searchTerm.trim() && !selectedSecurity ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-white/10 bg-panel/95 shadow-panel backdrop-blur-xl">
                    {searchLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Searching Yahoo Finance...</div>
                    ) : searchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto py-2">
                        {searchResults.map((result) => (
                          <button
                            key={`${result.symbol}:${result.exchange}`}
                            type="button"
                            onClick={() => {
                              void handleSelectSearchResult(result);
                            }}
                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                          >
                            <div>
                              <p className="text-sm font-semibold text-white">{result.symbol}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.companyName}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{result.quoteType}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.exchange}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-400">No listed Yahoo Finance matches found.</div>
                    )}
                  </div>
                ) : null}
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
                    <span className="text-sm text-slate-500">Loading preview...</span>
                  ) : positionPreview ? (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Price</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {formatCurrency(positionPreview.currentPrice ?? null)}
                      </p>
                    </div>
                  ) : null}
                </div>
                {positionPreview ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-white/10 bg-black/40 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Sector</p>
                      <p className="mt-2 text-sm text-white">{positionPreview.sector ?? getDefaultSector()}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/40 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Exchange</p>
                      <p className="mt-2 text-sm text-white">{positionPreview.exchange}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/40 p-3">
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
              <button
                type="submit"
                disabled={!selectedSecurity || positionPreviewLoading}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
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

  const renderResearch = () => {
    const selectedLabel =
      selectedWatchlistItem?.companyName ??
      selectedFeedCandidate?.companyName ??
      researchPreview?.companyName ??
      selectedResearchTicker;
    const insightBadges = researchFeatureBundle
      ? [
          {
            label:
              researchFeatureBundle.diversificationImpact.toLowerCase().includes("divers")
                ? "Diversifying"
                : "Portfolio overlap",
            tone: researchFeatureBundle.diversificationImpact.toLowerCase().includes("divers")
              ? ("positive" as const)
              : ("neutral" as const)
          },
          {
            label:
              researchFeatureBundle.concentrationImpact.toLowerCase().includes("worsen") ||
              researchFeatureBundle.concentrationImpact.toLowerCase().includes("increase")
                ? "Concentration watch"
                : "Concentration contained",
            tone:
              researchFeatureBundle.concentrationImpact.toLowerCase().includes("worsen") ||
              researchFeatureBundle.concentrationImpact.toLowerCase().includes("increase")
                ? ("warning" as const)
                : ("neutral" as const)
          },
          {
            label: `Benchmark ${researchFeatureBundle.benchmark}`,
            tone: "neutral" as const
          },
          {
            label:
              researchFeatureBundle.missingData.length > 0
                ? `${researchFeatureBundle.missingData.length} gaps`
                : "Coverage solid",
            tone: researchFeatureBundle.missingData.length > 0 ? ("warning" as const) : ("positive" as const)
          }
        ]
      : [];
    const insightFitScore =
      researchInsight?.fitScore != null
        ? `${researchInsight.fitScore}/100`
        : selectedFeedCandidate
          ? `${selectedFeedCandidate.fitScore}/100`
          : "N/A";
    const notebookSections: Array<{
      id: "thesis" | "catalysts" | "risks" | "valuation" | "notes";
      label: string;
    }> = [
      { id: "thesis", label: "Thesis" },
      { id: "catalysts", label: "Catalysts" },
      { id: "risks", label: "Risks" },
      { id: "valuation", label: "Valuation" },
      { id: "notes", label: "Notes" }
    ];
    const renderFeedPane = () => (
      <Panel
        title="Idea Feed"
        className="flex h-full min-h-[34rem] flex-col xl:min-h-0"
        action={
          selectedPortfolio ? (
            <button
              type="button"
              onClick={() => {
                setResearchFeedLoading(true);
                void loadResearchFeed(selectedPortfolio.id, true)
                  .catch((error) => {
                    setResearchFeedError(
                      error instanceof Error ? error.message : "Failed to refresh research feed"
                    );
                  })
                  .finally(() => setResearchFeedLoading(false));
              }}
              className="text-sm text-zinc-300 transition hover:text-white"
            >
              Refresh
            </button>
          ) : null
        }
      >
        {researchFeedError ? <div className="mb-3"><InlineNotice message={researchFeedError} tone="warning" /></div> : null}
        {!selectedPortfolio ? (
          <EmptyState
            title="Research feed unavailable"
            copy="Pick an active portfolio first so Yahoo candidate sourcing can use its benchmark and current holdings."
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="space-y-3">
              <div className="relative">
                <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Manual Yahoo search
                </label>
                {researchSearchError ? <div className="mb-2"><InlineNotice message={researchSearchError} tone="warning" /></div> : null}
                <input
                  value={researchSearchTerm}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setResearchSearchTerm(nextQuery);
                    setSelectedResearchSecurity(null);
                    setResearchPreview(null);
                    setResearchSearchError(null);
                  }}
                  placeholder="Search ideas by ticker or company..."
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                {researchSearchTerm.trim() && !selectedResearchSecurity ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-white/10 bg-panel/95 shadow-panel backdrop-blur-xl">
                    {researchSearchLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Searching Yahoo Finance...</div>
                    ) : researchSearchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto py-2">
                        {researchSearchResults.map((result) => (
                          <button
                            key={`${result.symbol}:${result.exchange}`}
                            type="button"
                            onClick={() => {
                              void handleSelectResearchSearchResult(result);
                            }}
                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                          >
                            <div>
                              <p className="text-sm font-semibold text-white">{result.symbol}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.companyName}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{result.quoteType}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.exchange}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-400">No listed Yahoo matches found.</div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Source</span>
                  <select
                    value={researchSourceFilter}
                    onChange={(event) =>
                      setResearchSourceFilter(
                        event.target.value as "all" | "manual" | "related" | "screener" | "trending"
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="all">All sources</option>
                    <option value="related">Related</option>
                    <option value="screener">Screens</option>
                    <option value="trending">Trending</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Sector</span>
                  <select
                    value={researchSectorFilter}
                    onChange={(event) => setResearchSectorFilter(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="all">All sectors</option>
                    {researchSectorOptions.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {researchPreview ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Selected idea</p>
                      <p className="mt-2 text-lg font-semibold text-white">{researchPreview.symbol}</p>
                      <p className="mt-1 text-sm text-slate-400">{researchPreview.companyName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Current</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatCurrency(researchPreview.currentPrice ?? null)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ResearchToneChip label={researchPreview.sector} />
                    <ResearchToneChip label={researchPreview.exchange} />
                    <ResearchToneChip label={formatBigNumber(researchPreview.marketCap)} />
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() =>
                        void saveWatchlistEntry({
                          ticker: researchPreview.symbol,
                          sourceType: "manual",
                          sourceLabel: "Manual search"
                        })
                      }
                      className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                    >
                      Save to Watchlist
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {researchFeedLoading ? (
                <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-slate-400">
                  Building Yahoo candidate feed...
                </div>
              ) : filteredResearchCandidates.length === 0 ? (
                <EmptyState
                  title="No ideas surfaced yet"
                  copy="Use manual Yahoo search or refresh the feed to source related, screener, and trending candidates for this portfolio."
                />
              ) : (
                <div className="space-y-4">
                  {(["related", "screener", "trending"] as const).map((sourceType) => {
                    const rows = filteredResearchCandidates.filter((candidate) => candidate.sourceType === sourceType);
                    if (rows.length === 0) {
                      return null;
                    }
                    return (
                      <div key={sourceType} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            {sourceType === "related"
                              ? "Related ideas"
                              : sourceType === "screener"
                                ? "Benchmark-aware screens"
                                : "Trending names"}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">Ranked by fit</p>
                        </div>
                        <div className="space-y-2">
                          {rows.map((candidate) => (
                            <button
                              key={`${sourceType}:${candidate.ticker}`}
                              type="button"
                              onClick={() => {
                                setSelectedResearchTicker(candidate.ticker);
                                setSelectedResearchItemId(null);
                                setResearchPreview(null);
                                setResearchMobileView("insight");
                              }}
                              className={cn(
                                "w-full rounded-xl border px-4 py-3 text-left transition",
                                selectedResearchTicker === candidate.ticker
                                  ? "border-white/25 bg-white/[0.045]"
                                  : "border-white/10 bg-black/35 hover:border-white/20"
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-white">{candidate.ticker}</p>
                                    <ResearchToneChip label={candidate.sourceLabel} />
                                  </div>
                                  <p className="mt-1 truncate text-sm text-slate-400">{candidate.companyName}</p>
                                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">
                                    {candidate.aiSummary ?? candidate.deterministicSummary}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-lg font-semibold text-white">{candidate.fitScore}</p>
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fit</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                                <div className="flex flex-wrap gap-2">
                                  <span>{candidate.sector}</span>
                                  <span>{formatCurrency(candidate.currentPrice)}</span>
                                  <span>{candidate.benchmarkContext}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void saveWatchlistEntry({
                                      ticker: candidate.ticker,
                                      sourceType: candidate.sourceType,
                                      sourceLabel: candidate.sourceLabel
                                    });
                                  }}
                                  disabled={activeWatchlistTickerSet.has(candidate.ticker.toUpperCase())}
                                  className="rounded-md border border-white/12 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {activeWatchlistTickerSet.has(candidate.ticker.toUpperCase())
                                    ? "In Watchlist"
                                    : "Save"}
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>
    );
    const renderNotebookPane = () => (
      <Panel title="Watchlist Queue / Notebook" className="flex h-full min-h-[34rem] flex-col xl:min-h-0">
        {!selectedPortfolio ? (
          <EmptyState
            title="No research queue"
            copy="Select a portfolio to persist thesis notes, catalysts, risks, and conviction for candidate names."
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">Saved ideas, ranked for actionability and promotion.</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Queue sort</span>
                <select
                  value={researchSort}
                  onChange={(event) =>
                    setResearchSort(event.target.value as "updated" | "conviction" | "marketCap")
                  }
                  className="rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="updated">Updated</option>
                  <option value="conviction">Conviction</option>
                  <option value="marketCap">Market cap</option>
                </select>
              </div>
            </div>

            {watchlistItems.length === 0 ? (
              <EmptyState
                title="No saved research names"
                copy="Save a Yahoo search result or feed candidate to start a thesis notebook for this portfolio."
              />
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-5">
                  {groupedWatchlist.map((group) => (
                    <div key={group.status} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{group.status}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{group.items.length}</p>
                    </div>
                  ))}
                </div>

                <div className="min-h-0 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="space-y-2">
                    {sortedWatchlist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedResearchItemId(item.id);
                          setSelectedResearchTicker(item.ticker);
                          setResearchPreview(null);
                          setResearchMobileView("notebook");
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition",
                          selectedResearchItemId === item.id
                            ? "border-white/25 bg-white/[0.05]"
                            : "border-white/10 bg-black/35 hover:border-white/20"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{item.ticker}</p>
                            <ResearchToneChip label={item.status} />
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-400">{item.companyName}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm text-white">{item.conviction}/5</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.targetPrice != null ? formatCurrency(item.targetPrice) : "Target open"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedWatchlistItem ? (
                  <EmptyState
                    title="Select a watchlist item"
                    copy="Pick a saved research name to edit thesis notes, conviction, status, and promotion readiness."
                  />
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">{selectedWatchlistItem.ticker}</p>
                        <p className="mt-1 text-sm text-slate-400">{selectedWatchlistItem.companyName}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <ResearchToneChip label={selectedWatchlistItem.sourceLabel} />
                          <ResearchToneChip label={selectedWatchlistItem.sector} />
                          <ResearchToneChip label={`Conviction ${selectedWatchlistItem.conviction}/5`} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void promoteWatchlistItem(selectedWatchlistItem)}
                          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeWatchlistItem(selectedWatchlistItem.id)}
                          className="rounded-md border border-danger/40 px-4 py-2 text-sm text-danger"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="block space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</span>
                        <select
                          value={watchlistDraft.status}
                          onChange={(event) =>
                            setWatchlistDraft((current) => ({
                              ...current,
                              status: event.target.value as WatchlistItem["status"]
                            }))
                          }
                          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                        >
                          <option value="NEW">NEW</option>
                          <option value="RESEARCHING">RESEARCHING</option>
                          <option value="READY">READY</option>
                          <option value="PASSED">PASSED</option>
                          <option value="PROMOTED">PROMOTED</option>
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Conviction</span>
                        <input
                          value={watchlistDraft.conviction}
                          onChange={(event) =>
                            setWatchlistDraft((current) => ({
                              ...current,
                              conviction: event.target.value
                            }))
                          }
                          type="number"
                          min="1"
                          max="5"
                          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Target price</span>
                        <input
                          value={watchlistDraft.targetPrice}
                          onChange={(event) =>
                            setWatchlistDraft((current) => ({
                              ...current,
                              targetPrice: event.target.value
                            }))
                          }
                          type="number"
                          min="0"
                          step="any"
                          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-b border-white/10 pb-3">
                      {notebookSections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setResearchNotebookSection(section.id)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em] transition",
                            researchNotebookSection === section.id
                              ? "border-white/20 bg-white/[0.08] text-white"
                              : "border-white/10 bg-black/20 text-slate-400 hover:text-white"
                          )}
                        >
                          {section.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                      {researchNotebookSection === "thesis" ? (
                        <label className="block space-y-2">
                          <span className="text-sm text-slate-300">Thesis</span>
                          <textarea
                            value={watchlistDraft.thesis}
                            onChange={(event) =>
                              setWatchlistDraft((current) => ({ ...current, thesis: event.target.value }))
                            }
                            rows={10}
                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                          />
                        </label>
                      ) : null}
                      {researchNotebookSection === "catalysts" ? (
                        <label className="block space-y-2">
                          <span className="text-sm text-slate-300">Catalysts</span>
                          <textarea
                            value={watchlistDraft.catalysts}
                            onChange={(event) =>
                              setWatchlistDraft((current) => ({ ...current, catalysts: event.target.value }))
                            }
                            rows={10}
                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                          />
                        </label>
                      ) : null}
                      {researchNotebookSection === "risks" ? (
                        <label className="block space-y-2">
                          <span className="text-sm text-slate-300">Risks</span>
                          <textarea
                            value={watchlistDraft.risks}
                            onChange={(event) =>
                              setWatchlistDraft((current) => ({ ...current, risks: event.target.value }))
                            }
                            rows={10}
                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                          />
                        </label>
                      ) : null}
                      {researchNotebookSection === "valuation" ? (
                        <label className="block space-y-2">
                          <span className="text-sm text-slate-300">Valuation notes</span>
                          <textarea
                            value={watchlistDraft.valuationNotes}
                            onChange={(event) =>
                              setWatchlistDraft((current) => ({
                                ...current,
                                valuationNotes: event.target.value
                              }))
                            }
                            rows={10}
                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                          />
                        </label>
                      ) : null}
                      {researchNotebookSection === "notes" ? (
                        <label className="block space-y-2">
                          <span className="text-sm text-slate-300">General notes</span>
                          <textarea
                            value={watchlistDraft.notes}
                            onChange={(event) =>
                              setWatchlistDraft((current) => ({ ...current, notes: event.target.value }))
                            }
                            rows={10}
                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <p className="text-sm text-slate-400">
                        Latest price {formatCurrency(researchPriceMap.get(selectedWatchlistItem.ticker.toUpperCase()))}
                      </p>
                      <button
                        type="button"
                        onClick={() => void saveWatchlistDraft()}
                        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                      >
                        Save Notebook
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Panel>
    );
    const renderInsightPane = () => (
      <Panel title="Portfolio Fit" className="flex h-full min-h-[34rem] flex-col xl:min-h-0">
        {researchInsightError ? <div className="mb-3"><InlineNotice message={researchInsightError} tone="warning" /></div> : null}
        {!selectedPortfolio || !selectedResearchTicker ? (
          <EmptyState
            title="No selected research name"
            copy="Pick a feed candidate or watchlist item to see AI-assisted memo output and deterministic portfolio-fit context."
          />
        ) : researchInsightLoading ? (
          <div className="rounded-xl border border-white/10 bg-black/35 p-5 text-sm text-slate-400">
            Building research memo and portfolio-fit summary...
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{selectedResearchTicker}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedLabel ?? selectedResearchTicker}</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {selectedWatchlistItem?.sector ??
                      selectedFeedCandidate?.sector ??
                      researchPreview?.sector ??
                      getDefaultSector()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {insightBadges.map((badge) => (
                    <ResearchToneChip key={badge.label} label={badge.label} tone={badge.tone} />
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <ResearchInsightCard label="Fit Score" value={insightFitScore} helper="Composite portfolio-fit rank." />
                <ResearchInsightCard
                  label="Latest Price"
                  value={formatCurrency(selectedResearchPrice)}
                  helper={researchInsight?.source === "AI" ? "Live Yahoo facts with AI synthesis." : "Deterministic fallback active."}
                />
                <ResearchInsightCard
                  label="Data Coverage"
                  value={researchInsight?.dataConfidence ?? selectedFeedCandidate?.dataConfidence ?? "N/A"}
                  helper={
                    researchFeatureBundle?.missingData.length
                      ? researchFeatureBundle.missingData.join(", ")
                      : "Coverage is strong enough for a first-pass memo."
                  }
                />
              </div>
              {researchInsight ? (
                <p className="mt-4 text-sm leading-6 text-slate-300">{researchInsight.summary}</p>
              ) : null}
            </div>

            {researchFeatureBundle ? (
              <div className="grid gap-3 md:grid-cols-2">
                <ResearchInsightCard
                  label="Portfolio Fit"
                  value={researchFeatureBundle.diversificationImpact}
                  helper={researchInsight?.portfolioFit ?? researchFeatureBundle.overlapNote}
                />
                <ResearchInsightCard
                  label="Benchmark Context"
                  value={researchFeatureBundle.benchmarkContext}
                  helper={`Benchmark ${researchFeatureBundle.benchmark} | Top sector ${researchFeatureBundle.topSector}`}
                />
                <ResearchInsightCard
                  label="Quality Snapshot"
                  value={
                    researchFeatureBundle.trailingPE != null
                      ? `P/E ${researchFeatureBundle.trailingPE.toFixed(1)}x`
                      : "Valuation partial"
                  }
                  helper={
                    researchInsight?.valuationFrame ??
                    "Fundamental coverage is partial, so valuation should be cross-checked before promotion."
                  }
                />
                <ResearchInsightCard
                  label="Promotion Readiness"
                  value={selectedWatchlistItem?.status ?? "Feed candidate"}
                  helper={
                    pendingPromotionItemId === selectedWatchlistItem?.id
                      ? "Promotion handoff is already active in Holdings."
                      : "Promote only after size, cost basis, and diligence are confirmed."
                  }
                />
              </div>
            ) : null}

            {researchInsight ? (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ResearchInsightCard label="Why Now" value={researchInsight.whyNow} />
                    <ResearchInsightCard label="Top Concern" value={researchInsight.topConcern} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ResearchBulletList title="Thesis" items={researchInsight.thesis.slice(0, 3)} />
                    <ResearchBulletList title="Catalysts" items={researchInsight.catalysts.slice(0, 3)} />
                    <ResearchBulletList title="Risks" items={researchInsight.risks.slice(0, 3)} />
                    <ResearchBulletList
                      title="Diligence Questions"
                      items={researchInsight.diligenceQuestions.slice(0, 3)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No research memo yet"
                copy="Select an idea or watchlist item to build a portfolio-fit memo from Yahoo facts and AI interpretation."
              />
            )}
          </div>
        )}
      </Panel>
    );

    return (
      <div className="space-y-4">
        <Panel title="Research Command Strip">
          {!selectedPortfolio ? (
            <EmptyState
              title="No portfolio selected"
              copy="Select a portfolio to source ideas, build a watchlist, and promote research names into holdings."
            />
          ) : (
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-3 lg:grid-cols-6 xl:flex-1">
                <InfoPill label="Portfolio" value={selectedPortfolio.name} />
                <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
                <InfoPill label="Watchlist" value={`${watchlistItems.length} names`} />
                <InfoPill
                  label="Idea Feed"
                  value={researchFeed.generatedAt ? formatCompactDate(researchFeed.generatedAt) : "Not loaded"}
                />
                <InfoPill
                  label="Selected"
                  value={selectedResearchTicker ?? "None"}
                />
                <InfoPill
                  label="AI"
                  value={researchInsight?.source === "AI" ? "Live interpretation" : "Deterministic fallback"}
                />
              </div>
              <div className="flex flex-wrap gap-2 xl:hidden">
                {(["feed", "notebook", "insight"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setResearchMobileView(view)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em] transition",
                      researchMobileView === view
                        ? "border-white/20 bg-white/[0.08] text-white"
                        : "border-white/10 bg-black/20 text-slate-400 hover:text-white"
                    )}
                  >
                    {view === "feed" ? "Idea Feed" : view === "notebook" ? "Notebook" : "Portfolio Fit"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="hidden gap-4 xl:grid xl:grid-cols-[0.95fr_1.05fr_1fr] xl:h-[calc(100vh-15rem)] xl:min-h-[46rem]">
          {renderFeedPane()}
          {renderNotebookPane()}
          {renderInsightPane()}
        </div>

        <div className="space-y-4 xl:hidden">
          {researchMobileView === "feed" ? renderFeedPane() : null}
          {researchMobileView === "notebook" ? renderNotebookPane() : null}
          {researchMobileView === "insight" ? renderInsightPane() : null}
        </div>
      </div>
    );
  };

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
          {riskError ? <div className="mb-4"><InlineNotice message={riskError} tone="warning" /></div> : null}
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
          {riskError && !riskReport ? (
            <div className="mb-4"><InlineNotice message={riskError} tone="warning" /></div>
          ) : null}
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

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Benchmark Relative">
          {benchmarkAnalyticsError ? <div className="mb-4"><InlineNotice message={benchmarkAnalyticsError} tone="warning" /></div> : null}
          {!riskReport || !selectedPortfolio ? (
            <EmptyState
              title="No regime diagnostics yet"
              copy="Benchmark-relative statistics appear once the deterministic report has loaded."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
                <InfoPill label="Trend" value={riskReport.marketContext.trend} />
                <InfoPill label="Benchmark Vol" value={formatPercent(riskReport.marketContext.volatility)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <MetricStat
                  label={`Correlation to ${selectedPortfolio.benchmark}`}
                  value={
                    benchmarkAnalytics?.correlation != null
                      ? benchmarkAnalytics.correlation.toFixed(2)
                      : riskReport.returnDiagnostics.correlationToBenchmark.toFixed(2)
                  }
                />
                <MetricStat
                  label={`Beta to ${selectedPortfolio.benchmark}`}
                  value={
                    benchmarkAnalytics?.beta != null
                      ? benchmarkAnalytics.beta.toFixed(2)
                      : riskReport.returnDiagnostics.betaToBenchmark.toFixed(2)
                  }
                />
                <MetricStat
                  label="Excess Return"
                  value={formatPercent(benchmarkAnalytics?.excessReturn ?? riskReport.benchmarkComparison.excessReturn)}
                />
                <MetricStat label="Current Drawdown" value={formatPercent(riskReport.returnDiagnostics.currentDrawdown)} />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Benchmark-relative concentration notes</p>
                <div className="mt-3 space-y-2">
                  {(benchmarkAnalytics?.relativeNotes ?? [
                    "Benchmark-relative notes are unavailable until the selected-range comparison loads."
                  ]).map((note) => (
                    <p key={note} className="text-sm text-slate-300">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Portfolio Quality Scorecards">
          {!riskReport ? (
            <EmptyState
              title="Quality scorecards unavailable"
              copy="Liquidity, profitability, growth, and balance-sheet diagnostics populate with the risk report."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <HealthScoreCard label="Liquidity" detail={riskReport.qualityScoreDetails.liquidity} />
              <HealthScoreCard label="Balance Sheet" detail={riskReport.qualityScoreDetails.balanceSheet} />
              <HealthScoreCard label="Profitability" detail={riskReport.qualityScoreDetails.profitability} />
              <HealthScoreCard label="Growth" detail={riskReport.qualityScoreDetails.growth} />
              <HealthScoreCard label="Concentration" detail={riskReport.qualityScoreDetails.concentration} />
              <HealthScoreCard label="Downside Risk" detail={riskReport.qualityScoreDetails.downsideRisk} />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Top Contributors to Risk">
          {!riskReport ? (
            <EmptyState
              title="No contributor model yet"
              copy="The engine will rank the holdings contributing most to concentration and realized risk."
            />
          ) : (
            <div className="space-y-3">
              {riskReport.topRiskContributors.map((entry) => (
                <div key={entry.ticker} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{entry.ticker}</p>
                      <p className="mt-1 text-sm text-slate-400">{entry.companyName}</p>
                    </div>
                    <span className="text-sm text-white">{formatPercent(entry.contribution)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{entry.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="AI Analyst Notes"
          action={
            <button
              onClick={() => void refreshRiskInsight()}
              className="text-sm text-zinc-300 transition hover:text-white"
            >
              Refresh AI
            </button>
          }
        >
          {riskInsightError ? <div className="mb-4"><InlineNotice message={riskInsightError} tone="warning" /></div> : null}
          {!riskInsight ? (
            <EmptyState
              title="AI notes unavailable"
              copy="The deterministic model is still active. AI interpretation appears here when the copilot pipeline succeeds."
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">AI interpretation</p>
                  <span className="text-xs text-slate-500">{riskInsight.source} • {riskInsight.model}</span>
                </div>
                <p className="text-sm leading-7 text-slate-300">{riskInsight.summary}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Resilience Factors</p>
                  <div className="mt-3 space-y-2">
                    {riskInsight.resilienceFactors.map((item) => (
                      <p key={item} className="text-sm text-slate-300">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recommended Actions</p>
                  <div className="mt-3 space-y-2">
                    {riskInsight.recommendedActions.map((item) => (
                      <p key={item} className="text-sm text-slate-300">{item}</p>
                    ))}
                  </div>
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
          {stressError ? <InlineNotice message={stressError} tone="warning" /> : null}
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
        {allocationError ? <div className="mb-4"><InlineNotice message={allocationError} tone="warning" /></div> : null}
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
        {auditError ? <div className="mb-4"><InlineNotice message={auditError} tone="warning" /></div> : null}
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
            onClick={() =>
              void refreshAudit().catch((error) =>
                setAuditError(error instanceof Error ? error.message : "Audit refresh failed")
              )
            }
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
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
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
          <p>Current benchmark: {selectedPortfolio?.benchmark ?? "None"}</p>
          <p>
            Use separate sleeves for growth, income, balanced, defensive, or speculative strategies,
            then compare their concentration and risk states independently.
          </p>
          {selectedPortfolio ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Benchmark presets</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BENCHMARK_PRESETS.map((symbol) => (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => void choosePresetBenchmark(symbol)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm transition",
                        selectedPortfolio.benchmark === symbol
                          ? "border-white/30 bg-white/[0.08] text-white"
                          : "border-white/10 bg-black/40 text-zinc-200 hover:border-white/20 hover:bg-white/[0.04]"
                      )}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <label className="mb-2 block text-sm text-slate-300">Custom benchmark ticker</label>
                {benchmarkSearchError ? <div className="mb-2"><InlineNotice message={benchmarkSearchError} tone="warning" /></div> : null}
                <input
                  value={benchmarkSearchTerm}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setBenchmarkSearchTerm(nextQuery);
                    setSelectedBenchmarkSecurity(null);
                    setBenchmarkPreview(null);
                    setBenchmarkSearchError(null);
                  }}
                  placeholder="QQQ, SPY, VTI..."
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/35"
                />
                {benchmarkSearchTerm.trim() && !selectedBenchmarkSecurity ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-white/10 bg-panel/95 shadow-panel backdrop-blur-xl">
                    {benchmarkSearchLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Searching Yahoo Finance...</div>
                    ) : benchmarkSearchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto py-2">
                        {benchmarkSearchResults.map((result) => (
                          <button
                            key={`${result.symbol}:${result.exchange}:benchmark`}
                            type="button"
                            onClick={() => {
                              void handleSelectBenchmarkResult(result);
                            }}
                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                          >
                            <div>
                              <p className="text-sm font-semibold text-white">{result.symbol}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.companyName}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{result.quoteType}</p>
                              <p className="mt-1 text-sm text-slate-400">{result.exchange}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-400">No listed Yahoo Finance matches found.</div>
                    )}
                  </div>
                ) : null}
              </div>

              {benchmarkPreview ? (
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected benchmark</p>
                      <p className="mt-2 text-lg font-semibold text-white">{benchmarkPreview.symbol}</p>
                      <p className="mt-1 text-sm text-slate-400">{benchmarkPreview.companyName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current price</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatCurrency(benchmarkPreview.currentPrice)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <InfoPill label="Sector" value={benchmarkPreview.sector} />
                    <InfoPill label="Exchange" value={benchmarkPreview.exchange} />
                    <InfoPill label="Type" value={benchmarkPreview.quoteType} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void applyBenchmarkSelection()}
                  disabled={
                    !selectedPortfolio ||
                    !benchmarkPreview ||
                    benchmarkPreview.symbol === selectedPortfolio.benchmark ||
                    benchmarkPreviewLoading
                  }
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save Benchmark
                </button>
                <button
                  type="button"
                  onClick={resetBenchmarkForm}
                  className="rounded-lg border border-white/10 px-5 py-3 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.03]"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : null}
          {selectedPortfolio ? (
            <button
              onClick={deletePortfolio}
              className="rounded-lg border border-danger/40 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger"
            >
              Archive Portfolio
            </button>
          ) : null}
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
        {activeTab === "research" && renderResearch()}
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
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
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
                {holdingDetailError ? <InlineNotice message={holdingDetailError} tone="warning" /> : null}
                <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
                  <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
                    <div>
                      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <span>{selectedHoldingDetail.exchange || "Exchange N/A"}</span>
                        {selectedHoldingDetail.sector ? <span>{selectedHoldingDetail.sector}</span> : null}
                        {selectedHoldingDetail.industry ? <span>{selectedHoldingDetail.industry}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <p className="text-4xl font-semibold tracking-[-0.05em] text-white">
                          {formatCurrency(
                            selectedHoldingDetail.currentPrice != null &&
                              selectedHoldingDetail.currentPrice > 0
                              ? selectedHoldingDetail.currentPrice
                              : null
                          )}
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
                      <div className="rounded-md border border-white/10 bg-black/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Market Cap</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatBigNumber(selectedHoldingDetail.marketCap)}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">52W Range</p>
                        <p className="mt-2 text-base font-semibold text-white">
                          {formatRangeBounds(
                            selectedHoldingDetail.fiftyTwoWeekLow,
                            selectedHoldingDetail.fiftyTwoWeekHigh
                          )}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/35 p-3">
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

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
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

                <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-5">
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
                        <Tooltip
                          cursor={{
                            stroke: "rgba(255,255,255,0.28)",
                            strokeWidth: 1,
                            fill: "rgba(255,255,255,0.02)"
                          }}
                          wrapperStyle={{ outline: "none" }}
                          content={<ChartTooltip formatter={formatCurrency} />}
                        />
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
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
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
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
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
