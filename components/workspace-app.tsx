"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizablePanelResizeHandle
} from "react-resizable-panels";
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

type ResearchPanelLayout = {
  researchFeed: number;
  researchNotebook: number;
  researchInsight: number;
};

type IconProps = {
  className?: string;
};

function IconBase({
  className,
  children,
  viewBox = "0 0 24 24"
}: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-4 w-4", className)}
    >
      {children}
    </svg>
  );
}

function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <rect x="2" y="2" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.95" />
      <rect x="13" y="2" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.5" />
      <rect x="2" y="13" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.5" />
      <rect x="13" y="13" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.95" />
    </svg>
  );
}

function OverviewIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19v-4" />
    </IconBase>
  );
}

function HoldingsIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18" />
    </IconBase>
  );
}

function ResearchIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

function RiskIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3 5 6v5c0 4.6 2.9 8.7 7 10 4.1-1.3 7-5.4 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.6 1.6 3.4-4.1" />
    </IconBase>
  );
}

function StressIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M13 2 5 14h5l-1 8 8-12h-5l1-8Z" />
    </IconBase>
  );
}

function AllocationIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 7h10" />
      <path d="M4 17h16" />
      <path d="M14 7v10" />
      <circle cx="17" cy="7" r="3" />
      <circle cx="9" cy="17" r="3" />
    </IconBase>
  );
}

function AuditIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 4h8" />
      <path d="M7 8h10" />
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </IconBase>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </IconBase>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

function MenuIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </IconBase>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </IconBase>
  );
}

const tabs: Array<{
  id: TabId;
  label: string;
  shortLabel: string;
  caption: string;
  icon: (props: IconProps) => JSX.Element;
}> = [
  { id: "overview", label: "Overview", shortLabel: "Overview", caption: "Portfolio command", icon: OverviewIcon },
  { id: "holdings", label: "Holdings", shortLabel: "Holdings", caption: "Blotter and positions", icon: HoldingsIcon },
  { id: "research", label: "Research", shortLabel: "Research", caption: "Idea pipeline", icon: ResearchIcon },
  { id: "risk", label: "Risk", shortLabel: "Risk", caption: "Deterministic score", icon: RiskIcon },
  { id: "stress", label: "Stress Tests", shortLabel: "Stress", caption: "Scenario runner", icon: StressIcon },
  { id: "allocation", label: "Allocation Modeler", shortLabel: "Allocation", caption: "Weight planning", icon: AllocationIcon },
  { id: "audit", label: "Audit Log", shortLabel: "Audit", caption: "Compliance trail", icon: AuditIcon },
  { id: "settings", label: "Settings", shortLabel: "Settings", caption: "Workspace controls", icon: SettingsIcon }
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
        "animate-[fadeIn_220ms_ease-out] rounded-xl border border-white/8 bg-panel px-5 py-4 shadow-panel",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/8 pb-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
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
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-[-0.02em]",
          tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-white"
        )}
      >
        {value}
      </p>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p> : null}
    </div>
  );
}

function HealthBandBadge({ band }: { band: "Strong" | "Moderate" | "Weak" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-1 text-[11px] font-medium",
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
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <HealthBandBadge band={detail.band} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">{detail.score}/100</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail.summary}</p>
      <details className="mt-4 group">
        <summary className="cursor-pointer list-none text-xs font-medium text-slate-500 transition group-open:text-slate-300">
          Score basis
        </summary>
        <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
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
    <div className="rounded-md border border-white/8 bg-black/20 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
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

function InlineMetric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "text-sm font-medium tracking-[-0.01em]",
          tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SidebarNavItem({
  active,
  label,
  icon: Icon,
  onClick
}: {
  active: boolean;
  label: string;
  icon: (props: IconProps) => JSX.Element;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center rounded border transition",
        active
          ? "border-primary/35 bg-primary/12 text-primary"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {active ? (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute -left-1 top-2.5 h-5 w-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      ) : null}
      <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 rounded bg-card px-2 py-1 text-[10px] text-foreground opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

function WorkspaceToolbar({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-subtle bg-surface px-3 sm:px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {subtitle ? <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
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
        "inline-flex rounded-md border px-2 py-1 text-[11px] font-medium",
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
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p> : null}
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
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <p className="text-xs font-medium text-slate-500">{title}</p>
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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function computeFitComposition(input: {
  fitScore: number;
  diversificationImpact?: string;
  concentrationImpact?: string;
  dataConfidence?: "HIGH" | "MEDIUM" | "LOW";
}) {
  const diversificationBoost =
    input.diversificationImpact?.toLowerCase().includes("divers") ? 34 : 20;
  const concentrationScore =
    input.concentrationImpact?.toLowerCase().includes("worsen") ||
    input.concentrationImpact?.toLowerCase().includes("increase")
      ? 14
      : 28;
  const coverageScore =
    input.dataConfidence === "HIGH" ? 24 : input.dataConfidence === "MEDIUM" ? 18 : 10;
  const timingScore = clampScore(input.fitScore - diversificationBoost - concentrationScore - coverageScore);

  return [
    { key: "diversification", label: "Diversification", value: diversificationBoost, color: "#f8fafc" },
    { key: "concentration", label: "Concentration", value: concentrationScore, color: "#38bdf8" },
    { key: "coverage", label: "Coverage", value: coverageScore, color: "#34d399" },
    { key: "timing", label: "Timing", value: timingScore, color: "#f59e0b" }
  ];
}

function scoreFromRatio(value: number | undefined, healthy: number, stretched: number) {
  if (value == null || Number.isNaN(value)) {
    return 50;
  }
  if (value >= healthy) {
    return 82;
  }
  if (value <= stretched) {
    return 28;
  }
  const span = healthy - stretched;
  return Math.round(28 + ((value - stretched) / span) * 54);
}

function scoreFromPercentage(value: number | undefined, strong: number, weak: number) {
  if (value == null || Number.isNaN(value)) {
    return 50;
  }
  if (value >= strong) {
    return 86;
  }
  if (value <= weak) {
    return 24;
  }
  const span = strong - weak;
  return Math.round(24 + ((value - weak) / span) * 62);
}

function qualityScoreItems(bundle: ResearchFeatureBundle | null) {
  if (!bundle) {
    return [];
  }

  return [
    {
      label: "Growth",
      score: scoreFromPercentage(bundle.revenueGrowth ?? bundle.earningsGrowth, 0.18, -0.02)
    },
    {
      label: "Margins",
      score: scoreFromPercentage(bundle.profitMargins, 0.2, 0.04)
    },
    {
      label: "Balance Sheet",
      score: bundle.debtToEquity == null ? 50 : scoreFromRatio(1 / Math.max(bundle.debtToEquity, 0.1), 1.2, 0.35)
    },
    {
      label: "Liquidity",
      score: scoreFromRatio(bundle.currentRatio ?? bundle.quickRatio, 1.6, 0.8)
    }
  ];
}

function ResearchFitComposition({
  fitScore,
  diversificationImpact,
  concentrationImpact,
  dataConfidence
}: {
  fitScore: number;
  diversificationImpact?: string;
  concentrationImpact?: string;
  dataConfidence?: "HIGH" | "MEDIUM" | "LOW";
}) {
  const segments = computeFitComposition({
    fitScore,
    diversificationImpact,
    concentrationImpact,
    dataConfidence
  });
  const chartRow = segments.reduce<Record<string, number | string>>(
    (accumulator, segment) => {
      accumulator[segment.key] = segment.value;
      return accumulator;
    },
    { label: "Fit" }
  );

  return (
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">Fit composition</p>
        <p className="text-sm font-semibold text-white">{fitScore}/100</p>
      </div>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[chartRow]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="label" hide />
            {segments.map((segment) => (
              <Bar
                key={segment.key}
                dataKey={segment.key}
                stackId="fit"
                radius={segment.key === "timing" ? [0, 8, 8, 0] : segment.key === "diversification" ? [8, 0, 0, 8] : 0}
                fill={segment.color}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {segments.map((segment) => (
          <div key={segment.key} className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">{segment.label}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-sm text-white">{segment.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchQualityStrip({ bundle }: { bundle: ResearchFeatureBundle | null }) {
  const items = qualityScoreItems(bundle);

  return (
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <p className="text-xs font-medium text-slate-500">Quality snapshot</p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-300">{item.label}</p>
                <p className="text-sm font-semibold text-white">{item.score}/100</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-300 to-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${item.score}%` }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Quality metrics will appear once Yahoo fundamentals are available.</p>
        )}
      </div>
    </div>
  );
}

function ResearchStatusFlow({ status }: { status: WatchlistItem["status"] | "Feed candidate" }) {
  const steps = ["NEW", "RESEARCHING", "READY", "PROMOTED"] as const;
  const activeIndex = status === "Feed candidate" ? -1 : steps.indexOf(status as (typeof steps)[number]);

  return (
    <div className="rounded-lg border border-white/8 bg-black/20 p-4">
      <p className="text-xs font-medium text-slate-500">Research flow</p>
      <div className="mt-4 flex items-center gap-2">
        {steps.map((step, index) => {
          const active = activeIndex >= index;
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold",
                  active ? "border-white/25 bg-white text-black" : "border-white/10 bg-white/[0.03] text-slate-500"
                )}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[11px] font-medium", active ? "text-white" : "text-slate-500")}>
                  {step}
                </p>
                {index < steps.length - 1 ? (
                  <div className={cn("mt-1 h-px w-full", activeIndex > index ? "bg-white/40" : "bg-white/10")} />
                ) : null}
              </div>
            </div>
          );
        })}
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
    <div className="rounded-xl border border-dashed border-white/8 bg-black/10 p-8 text-center">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">{copy}</p>
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
        "rounded-lg border px-4 py-3 text-sm",
        tone === "danger"
          ? "border-danger/30 bg-danger/10 text-danger"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-white/8 bg-black/20 text-slate-300"
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const [activeResearchAnalysisTab, setActiveResearchAnalysisTab] = useState<
    "fit" | "ai" | "quality" | "diligence"
  >("fit");
  const [researchPanelLayout, setResearchPanelLayout] = useState<ResearchPanelLayout>({
    researchFeed: 32,
    researchNotebook: 36,
    researchInsight: 32
  });
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
  const [auditSearch, setAuditSearch] = useState("");
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
  const prefersReducedMotion = useReducedMotion();
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;

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
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem("research-workstation-panels");
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as ResearchPanelLayout).researchFeed === "number" &&
        typeof (parsed as ResearchPanelLayout).researchNotebook === "number" &&
        typeof (parsed as ResearchPanelLayout).researchInsight === "number"
      ) {
        setResearchPanelLayout(parsed as ResearchPanelLayout);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab, selectedPortfolioId]);

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
    const chartData = selectedPortfolio
      ? benchmarkAnalytics?.chartSeries?.length
        ? benchmarkAnalytics.chartSeries.map((point, index) => ({
            ...point,
            label: `D${index + 1}`
          }))
        : (() => {
            const series = selectedPortfolio.valueHistory;
            if (series.length < 2) return [];
            const base = series[0]?.value ?? 0;
            return series.map((point, index) => ({
              date: point.date,
              label: `D${index + 1}`,
              portfolioIndex: base > 0 ? (point.value / base) * 100 : 100,
              benchmarkIndex: Number.NaN
            }));
          })()
      : [];
    const biggestResearchNote = watchlistItems[0] ?? null;
    const topSector = riskReport?.sectorConcentration[0] ?? null;
    const topHoldingRows = sortedHoldings.slice(0, 6);
    const topBenchmarkLabel = selectedPortfolio?.benchmark ?? benchmarkAnalytics?.benchmark ?? "S&P 500";

    return (
      <div className="space-y-3">
        {!selectedPortfolio ? (
          <EmptyState
            title="Create your first strategy sleeve"
            copy="Build separate growth, income, balanced, defensive, or speculative sleeves and track each strategy with its own risk state."
            action={
              <form onSubmit={createPortfolio} className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
                <input
                  value={createPortfolioName}
                  onChange={(event) => setCreatePortfolioName(event.target.value)}
                  placeholder="Growth"
                  className="flex-1 rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40"
                />
                <button className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                  Create Portfolio
                </button>
              </form>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3">
              <Panel
                title="Portfolio Performance"
                className="col-span-12 lg:col-span-8"
                action={<span className="text-[10px] text-muted-foreground">{portfolioRange} • vs {topBenchmarkLabel}</span>}
              >
                {benchmarkAnalyticsError ? <div className="mb-3"><InlineNotice message={benchmarkAnalyticsError} tone="warning" /></div> : null}
                {chartData.length < 2 ? (
                  <EmptyState
                    title="Performance chart unavailable"
                    copy="Add holdings and wait for range history to load to render portfolio and benchmark series."
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">{selectedPortfolio.name}</p>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-mono-data text-sm", dailyPnl >= 0 ? "text-positive" : "text-risk")}>
                          {formatCurrency(dailyPnl)}
                        </span>
                        <span className={cn("text-xs", dailyPnlPercent >= 0 ? "text-positive" : "text-risk")}>
                          {formatPercent(dailyPnlPercent)}
                        </span>
                      </div>
                    </div>
                    <div className={cn("h-[22rem] transition-opacity duration-200", historyLoading && "opacity-70")}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid stroke="hsl(var(--border) / 0.35)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                          <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={36}
                            tickFormatter={(value) => Math.round(value).toString()}
                          />
                          <Tooltip
                            wrapperStyle={{ outline: "none" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) {
                                return null;
                              }
                              const portfolioValue = payload.find((point) => point.dataKey === "portfolioIndex")?.value;
                              const benchmarkValue = payload.find((point) => point.dataKey === "benchmarkIndex")?.value;
                              return (
                                <div className="rounded border border-subtle bg-card px-3 py-2 text-xs shadow-panel">
                                  <p className="font-mono-data text-foreground">Portfolio {typeof portfolioValue === "number" ? portfolioValue.toFixed(2) : "N/A"}</p>
                                  <p className="font-mono-data text-muted-foreground">
                                    {topBenchmarkLabel} {typeof benchmarkValue === "number" ? benchmarkValue.toFixed(2) : "N/A"}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="portfolioIndex" stroke="none" fill="hsl(var(--primary) / 0.12)" />
                          <Line type="monotone" dataKey="benchmarkIndex" stroke="hsl(var(--muted-foreground) / 0.9)" strokeWidth={1.6} dot={false} strokeDasharray="4 4" connectNulls />
                          <Line type="monotone" dataKey="portfolioIndex" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />Portfolio</span>
                      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 border-b border-dashed border-muted-foreground" />{topBenchmarkLabel}</span>
                    </div>
                  </div>
                )}
              </Panel>

              <div className="col-span-12 grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1">
                <div className="panel p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">vs {topBenchmarkLabel}</p>
                  <p className={cn("mt-2 font-mono-data text-3xl font-semibold", (benchmarkAnalytics?.excessReturn ?? 0) >= 0 ? "text-positive" : "text-risk")}>
                    {formatPercent(benchmarkAnalytics?.excessReturn ?? portfolioRangePerformance.percent)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{labelForRange(portfolioRange)} alpha</p>
                </div>
                <div className="panel p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Risk tier</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{selectedMetrics?.riskTier ?? "Unscored"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">VaR {selectedMetrics ? formatCurrency(selectedMetrics.var95Amount) : "N/A"} (95%)</p>
                </div>
                <div className="panel p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Top concentration</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{formatPercent(topThreeConcentration)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Top 3 holdings</p>
                </div>
                <div className="panel p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Biggest mover</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{biggestLoser?.ticker ?? biggestGainer?.ticker ?? "N/A"}</p>
                  <p className={cn("mt-1 text-xs", ((biggestLoser?.dailyPnl ?? biggestGainer?.dailyPnl ?? 0) >= 0) ? "text-positive" : "text-risk")}>
                    {formatCurrency(biggestLoser?.dailyPnl ?? biggestGainer?.dailyPnl ?? null)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <Panel title="Top Holdings" className="col-span-12 lg:col-span-5">
                {topHoldingRows.length === 0 ? (
                  <EmptyState title="No holdings yet" copy="Add positions to populate the holdings blotter." />
                ) : (
                  <div className="overflow-hidden rounded border border-subtle">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-bright text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Ticker</th>
                          <th className="px-3 py-2 font-medium text-right">Weight</th>
                          <th className="px-3 py-2 font-medium text-right">Day P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {topHoldingRows.map((holding) => (
                          <tr key={holding.ticker} className="hover:bg-secondary/30">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => void openHoldingDetail(holding.ticker)}
                                className="font-mono-data text-foreground hover:text-primary"
                              >
                                {holding.ticker}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right font-mono-data">{formatPercent(holding.weight)}</td>
                            <td className={cn("px-3 py-2 text-right font-mono-data", (holding.dailyPnl ?? 0) >= 0 ? "text-positive" : "text-risk")}>
                              {formatCurrency(holding.dailyPnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Risk Drivers" className="col-span-12 lg:col-span-4">
                <div className="space-y-3">
                  <MetricStat label="Sharpe" value={selectedMetrics ? selectedMetrics.sharpe.toFixed(2) : "N/A"} />
                  <MetricStat label="Max Drawdown" value={selectedMetrics ? formatPercent(selectedMetrics.maxDrawdown) : "N/A"} />
                  <MetricStat label="Annual Volatility" value={selectedMetrics ? formatPercent(selectedMetrics.annualizedVolatility) : "N/A"} />
                  <div className="panel-bright p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Top sector</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{topSector?.sector ?? getDefaultSector()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{topSector ? formatPercent(topSector.weight) : "Unavailable"}</p>
                  </div>
                </div>
              </Panel>

              <div className="col-span-12 space-y-3 lg:col-span-3">
                <Panel title="Research">
                  {biggestResearchNote ? (
                    <div className="space-y-2">
                      <p className="font-mono-data text-sm font-semibold text-primary">{biggestResearchNote.ticker}</p>
                      <p className="text-xs text-muted-foreground">{biggestResearchNote.sourceLabel}</p>
                      <p className="line-clamp-3 text-sm text-foreground">{biggestResearchNote.thesis || biggestResearchNote.notes || "Notebook entry saved for this security."}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No watchlist notes yet.</p>
                  )}
                </Panel>
                <Panel title="Health Matrix">
                  {riskReport ? (
                    <div className="grid grid-cols-2 gap-2">
                      <InfoPill label="Conc." value={`${riskReport.qualityScores.concentration}/100`} />
                      <InfoPill label="Liquidity" value={`${riskReport.qualityScores.liquidity}/100`} />
                      <InfoPill label="Balance" value={`${riskReport.qualityScores.balanceSheet}/100`} />
                      <InfoPill label="Downside" value={`${riskReport.qualityScores.downsideRisk}/100`} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Health diagnostics loading.</p>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderHoldings = () => {
    const holdingsChartData = selectedPortfolio
      ? benchmarkAnalytics?.chartSeries?.length
        ? benchmarkAnalytics.chartSeries.map((point, index) => ({
            ...point,
            label: `D${index + 1}`
          }))
        : (() => {
            const series = selectedPortfolio.valueHistory;
            if (series.length < 2) return [];
            const base = series[0]?.value ?? 0;
            return series.map((point, index) => ({
              date: point.date,
              label: `D${index + 1}`,
              portfolioIndex: base > 0 ? (point.value / base) * 100 : 100,
              benchmarkIndex: Number.NaN
            }));
          })()
      : [];

    return (
    <div className="space-y-6">
      <Panel title="Holdings status" action={<RangeSelector value={portfolioRange} onChange={setPortfolioRange} />}>
        {!selectedPortfolio ? (
          <EmptyState
            title="No portfolio selected"
            copy="Select a sleeve to monitor holdings, top movers, and concentration."
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_repeat(5,minmax(0,1fr))]">
            <div className="rounded-lg border border-white/[0.06] bg-muted/60 p-4">
              <p className="text-sm font-medium text-white">{selectedPortfolio.name}</p>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <p className="text-3xl font-semibold tracking-[-0.05em] text-white">
                  {selectedMetrics ? formatCurrency(selectedMetrics.portfolioValue) : "N/A"}
                </p>
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium",
                    dailyPnl >= 0
                      ? "border-success/20 bg-success/10 text-success"
                      : "border-danger/20 bg-danger/10 text-danger"
                  )}
                >
                  {formatCurrency(dailyPnl)}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {labelForRange(portfolioRange)} {formatCurrency(portfolioRangePerformance.absolute)} • {" "}
                {formatPercent(benchmarkAnalytics?.portfolioReturn ?? portfolioRangePerformance.percent)}
              </p>
            </div>
            <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
            <InfoPill label="Holdings" value={`${sortedHoldings.length}`} />
            <InfoPill label="Median weight" value={formatPercent(medianWeight)} />
            <InfoPill label="Top 3 weight" value={formatPercent(topThreeConcentration)} />
            <InfoPill
              label="Top mover"
              value={biggestGainer ? `${biggestGainer.ticker} ${formatCurrency(biggestGainer.dailyPnl)}` : "N/A"}
              tone={(biggestGainer?.dailyPnl ?? 0) >= 0 ? "positive" : "default"}
            />
            <InfoPill
              label="Lagging name"
              value={biggestLoser ? `${biggestLoser.ticker} ${formatCurrency(biggestLoser.dailyPnl)}` : "N/A"}
              tone={(biggestLoser?.dailyPnl ?? 0) < 0 ? "negative" : "default"}
            />
          </div>
        )}
      </Panel>

      <Panel title="Portfolio Performance" action={<span className="text-[10px] text-muted-foreground">{portfolioRange} • vs {selectedPortfolio?.benchmark ?? "Benchmark"}</span>}>
        {!selectedPortfolio || holdingsChartData.length < 2 ? (
          <EmptyState
            title="Performance chart unavailable"
            copy="Add holdings and wait for benchmark analytics to load this comparison chart."
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={holdingsChartData}>
                <CartesianGrid stroke="hsl(var(--border) / 0.35)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  wrapperStyle={{ outline: "none" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null;
                    }
                    const portfolioValue = payload.find((point) => point.dataKey === "portfolioIndex")?.value;
                    const benchmarkValue = payload.find((point) => point.dataKey === "benchmarkIndex")?.value;
                    return (
                      <div className="rounded border border-subtle bg-card px-3 py-2 text-xs shadow-panel">
                        <p className="font-mono-data text-foreground">Portfolio {typeof portfolioValue === "number" ? portfolioValue.toFixed(2) : "N/A"}</p>
                        <p className="font-mono-data text-muted-foreground">
                          {selectedPortfolio.benchmark} {typeof benchmarkValue === "number" ? benchmarkValue.toFixed(2) : "N/A"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="portfolioIndex" stroke="none" fill="hsl(var(--primary) / 0.12)" />
                <Line type="monotone" dataKey="benchmarkIndex" stroke="hsl(var(--muted-foreground) / 0.9)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="portfolioIndex" stroke="hsl(var(--primary))" strokeWidth={2.3} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <Panel title="Positions" action={<span className="text-xs text-slate-500">Portfolio blotter</span>}>
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
              copy="Search by ticker and add your first listed equity or ETF to begin live monitoring."
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

              <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                <div className="max-h-[720px] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
                      <tr className="border-b border-white/[0.06] text-slate-500">
                        <th className="px-4 py-3 font-medium">Ticker</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Price</th>
                        <th className="px-4 py-3 font-medium">Market value</th>
                        <th className="px-4 py-3 font-medium">Weight</th>
                        <th className="px-4 py-3 font-medium">Total return</th>
                        <th className="px-4 py-3 font-medium">Contribution</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {sortedHoldings.map((holding) => {
                        const contribution = holdingContributionMap.get(holding.ticker.toUpperCase())?.contribution;
                        return (
                          <tr key={holding.ticker} className="bg-panel/40 transition hover:bg-white/[0.02]">
                            <td className="px-4 py-3 align-top">
                              <button
                                type="button"
                                onClick={() => void openHoldingDetail(holding.ticker)}
                                className="text-left"
                              >
                                <p className="font-semibold text-white">{holding.ticker}</p>
                                <p className="mt-1 text-xs text-slate-500">{holding.assetClass ?? "equities"}</p>
                              </button>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-white">{holding.companyName ?? holding.ticker}</p>
                              <p className="mt-1 text-xs text-slate-500">{holding.exchange ?? "Exchange N/A"}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-white">{formatCurrency(holding.currentPrice)}</p>
                              <p className={cn("mt-1 text-xs", (holding.dailyPnl ?? 0) >= 0 ? "text-success" : "text-danger")}>
                                {holding.dailyPnl != null ? formatCurrency(holding.dailyPnl) : "Quote unavailable"}
                              </p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-white">{formatCurrency(holding.currentValue)}</p>
                              <p className="mt-1 text-xs text-slate-500">{holding.shares.toFixed(2)} shares</p>
                            </td>
                            <td className="px-4 py-3 align-top text-white">{formatPercent(holding.weight)}</td>
                            <td className="px-4 py-3 align-top">
                              <p className={cn((holding.totalGain ?? 0) >= 0 ? "text-success" : "text-danger")}>
                                {formatCurrency(holding.totalGain)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{formatPercent(holding.totalGainPercent)}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className={cn((contribution ?? 0) >= 0 ? "text-success" : "text-danger")}>
                                {formatPercent(contribution)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{portfolioRange}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void openHoldingDetail(holding.ticker)}
                                  className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 transition hover:border-white/[0.14] hover:text-white"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditingPosition(holding.ticker)}
                                  className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 transition hover:border-white/[0.14] hover:text-white"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removePosition(holding.ticker)}
                                  className="rounded-lg border border-danger/30 px-3 py-2 text-xs text-danger"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={editingTicker ? "Edit position" : "Position inspector"}>
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
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0d1014] px-4 py-3 text-sm text-white outline-none focus:border-white/[0.16]"
                  />
                  {searchTerm.trim() && !selectedSecurity ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-panel shadow-panel">
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
                              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">{result.symbol}</p>
                                <p className="mt-1 text-sm text-slate-400">{result.companyName}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-500">{result.quoteType}</p>
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

                <div className="rounded-lg border border-white/[0.06] bg-muted/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">{positionTicker || "Choose a ticker"}</p>
                      {positionName ? <p className="mt-1 text-sm text-slate-400">{positionName}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Current price</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {positionPreviewLoading ? "Loading..." : formatCurrency(positionPreview?.currentPrice ?? null)}
                      </p>
                    </div>
                  </div>
                  {positionPreview ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoPill label="Sector" value={positionPreview.sector ?? getDefaultSector()} />
                      <InfoPill label="Exchange" value={positionPreview.exchange} />
                      <InfoPill label="Market cap" value={formatBigNumber(positionPreview.marketCap)} />
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
                      className="w-full rounded-lg border border-white/[0.08] bg-[#0d1014] px-4 py-3 text-sm text-white outline-none focus:border-white/[0.16]"
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
                      className="w-full rounded-lg border border-white/[0.08] bg-[#0d1014] px-4 py-3 text-sm text-white outline-none focus:border-white/[0.16]"
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
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0d1014] px-4 py-3 text-sm text-white outline-none focus:border-white/[0.16]"
                  >
                    <option value="equities">Equities</option>
                    <option value="bonds">Bonds</option>
                    <option value="commodities">Commodities</option>
                  </select>
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={!selectedSecurity || positionPreviewLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {editingTicker ? "Update position" : "Add position"}
                  </button>
                  {editingTicker ? (
                    <button
                      type="button"
                      onClick={resetPositionForm}
                      className="rounded-lg border border-white/[0.08] px-4 py-3 text-sm text-slate-300 transition hover:border-white/[0.14] hover:text-white"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            )}
          </Panel>

          <Panel title="Signals">
            {!selectedPortfolio ? (
              <EmptyState title="No portfolio selected" copy="Select a portfolio to monitor blotter signals." />
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-white/[0.06] bg-muted/60 p-4">
                  <p className="text-sm font-medium text-white">Concentration</p>
                  <div className="mt-4 grid gap-4">
                    <InlineMetric
                      label="Top weight"
                      value={
                        topConcentration(sortedHoldings)
                          ? `${topConcentration(sortedHoldings)?.ticker} ${formatPercent(topConcentration(sortedHoldings)?.weight ?? 0)}`
                          : "N/A"
                      }
                    />
                    <InlineMetric label="Top 3 weight" value={formatPercent(topThreeConcentration)} />
                    <InlineMetric label="Median weight" value={formatPercent(medianWeight)} />
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-muted/60 p-4">
                  <p className="text-sm font-medium text-white">Attribution</p>
                  <div className="mt-4 grid gap-4">
                    <InlineMetric
                      label="Best sector"
                      value={
                        topPositiveSectorContributor
                          ? `${topPositiveSectorContributor.sector} ${formatPercent(topPositiveSectorContributor.contribution)}`
                          : "N/A"
                      }
                      tone={(topPositiveSectorContributor?.contribution ?? 0) >= 0 ? "positive" : "default"}
                    />
                    <InlineMetric
                      label="Worst sector"
                      value={
                        topNegativeSectorContributor
                          ? `${topNegativeSectorContributor.sector} ${formatPercent(topNegativeSectorContributor.contribution)}`
                          : "N/A"
                      }
                      tone={(topNegativeSectorContributor?.contribution ?? 0) < 0 ? "negative" : "default"}
                    />
                    <InlineMetric
                      label="Excess return"
                      value={formatPercent(benchmarkAnalytics?.excessReturn)}
                      tone={(benchmarkAnalytics?.excessReturn ?? 0) >= 0 ? "positive" : "negative"}
                    />
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
  };

  const renderResearch = () => {
    const selectedLabel =
      selectedWatchlistItem?.companyName ??
      selectedFeedCandidate?.companyName ??
      researchPreview?.companyName ??
      selectedResearchTicker;
    const selectedSector =
      selectedWatchlistItem?.sector ??
      selectedFeedCandidate?.sector ??
      researchPreview?.sector ??
      getDefaultSector();
    const activeFitScoreValue =
      researchInsight?.fitScore ?? selectedFeedCandidate?.fitScore ?? researchFeatureBundle?.fitScore ?? null;
    const insightFitScore = activeFitScoreValue != null ? `${activeFitScoreValue}/100` : "N/A";
    const analysisActionBias =
      activeFitScoreValue == null
        ? "Monitor"
        : activeFitScoreValue >= 78
          ? "Starter-ready"
          : activeFitScoreValue >= 60
            ? "Research deeper"
            : "Watch";
    const insightBadges = researchFeatureBundle
      ? [
          {
            label:
              researchFeatureBundle.diversificationImpact.toLowerCase().includes("divers")
                ? "New diversification"
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
              researchFeatureBundle.starterPositionTopHolding
                ? "Starter becomes top holding"
                : "Starter size manageable",
            tone: researchFeatureBundle.starterPositionTopHolding ? ("warning" as const) : ("positive" as const)
          }
        ]
      : [];
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
                              setActiveResearchAnalysisTab("fit");
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
                <motion.div
                  layout
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
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
                </motion.div>
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
                      <motion.div
                        key={sourceType}
                        layout
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                      >
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
                          {rows.map((candidate, index) => (
                            <motion.button
                              key={`${sourceType}:${candidate.ticker}`}
                              type="button"
                              layout
                              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.18, delay: prefersReducedMotion ? 0 : index * 0.03 }}
                              whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.005 }}
                              onClick={() => {
                                setActiveResearchAnalysisTab("fit");
                                setSelectedResearchTicker(candidate.ticker);
                                setSelectedResearchItemId(null);
                                setResearchPreview(null);
                                setResearchMobileView("insight");
                              }}
                              className={cn(
                                "w-full rounded-xl border px-4 py-3 text-left transition",
                                selectedResearchTicker === candidate.ticker
                                  ? "border-white/25 bg-white/[0.055] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                                  : "border-white/10 bg-black/35 hover:border-white/20"
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-white">{candidate.ticker}</p>
                                    <ResearchToneChip label={candidate.sourceLabel} />
                                    <ResearchToneChip label={candidate.sector} />
                                  </div>
                                  <p className="mt-1 truncate text-sm text-slate-400">{candidate.companyName}</p>
                                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">
                                    {candidate.aiSummary ?? candidate.deterministicSummary}
                                  </p>
                                  <div className="mt-3">
                                    <ResearchFitComposition
                                      fitScore={candidate.fitScore}
                                      diversificationImpact={candidate.diversificationImpact}
                                      concentrationImpact={candidate.concentrationImpact}
                                      dataConfidence={candidate.dataConfidence}
                                    />
                                  </div>
                                </div>
                                <div className="w-24 shrink-0 text-right">
                                  <motion.p
                                    className="text-xl font-semibold text-white"
                                    key={`${candidate.ticker}:${candidate.fitScore}`}
                                    initial={prefersReducedMotion ? false : { opacity: 0.6, scale: 0.92 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    {candidate.fitScore}
                                  </motion.p>
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fit score</p>
                                  <p className="mt-3 text-xs text-slate-400">{formatCurrency(candidate.currentPrice)}</p>
                                  <p className="mt-1 text-xs text-slate-500">{candidate.benchmarkContext}</p>
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
                                    className="mt-3 rounded-md border border-white/12 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {activeWatchlistTickerSet.has(candidate.ticker.toUpperCase())
                                      ? "Saved"
                                      : "Save"}
                                  </button>
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
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
      <Panel title="Queue / Notebook" className="flex h-full min-h-[34rem] flex-col xl:min-h-0">
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
                <ResearchStatusFlow status={selectedWatchlistItem?.status ?? "Feed candidate"} />
                <div className="min-h-0 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="space-y-2">
                    {sortedWatchlist.map((item, index) => (
                      <motion.button
                        key={item.id}
                        type="button"
                        layout
                        initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.16, delay: prefersReducedMotion ? 0 : index * 0.02 }}
                        whileHover={prefersReducedMotion ? undefined : { x: 2 }}
                        onClick={() => {
                          setActiveResearchAnalysisTab("fit");
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
                      </motion.button>
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
                          <ResearchToneChip label={`Updated ${formatCompactDate(selectedWatchlistItem.updatedAt)}`} />
                        </div>
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
                            "rounded-md border px-3 py-1.5 text-xs font-medium transition",
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

                    <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-white/10 bg-panel/95 pt-4 backdrop-blur">
                      <p className="text-sm text-slate-400">
                        Latest {formatCurrency(researchPriceMap.get(selectedWatchlistItem.ticker.toUpperCase()))}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void removeWatchlistItem(selectedWatchlistItem.id)}
                          className="rounded-md border border-danger/40 px-4 py-2 text-sm text-danger"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => void promoteWatchlistItem(selectedWatchlistItem)}
                          className="rounded-md border border-white/12 px-4 py-2 text-sm text-white transition hover:bg-white/[0.05]"
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveWatchlistDraft()}
                          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                        >
                          Save Notebook
                        </button>
                      </div>
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
      <Panel title="Analysis" className="flex h-full min-h-[34rem] flex-col xl:min-h-0">
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
          <Tabs.Root
            value={activeResearchAnalysisTab}
            onValueChange={(value) =>
              setActiveResearchAnalysisTab(value as "fit" | "ai" | "quality" | "diligence")
            }
            className="flex min-h-0 flex-1 flex-col"
          >
              <div className="rounded-lg border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                  <p className="text-xs font-medium text-slate-500">{selectedResearchTicker}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedLabel ?? selectedResearchTicker}</p>
                  <p className="mt-2 text-sm text-slate-400">{selectedSector}</p>
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
                  label="Action Bias"
                  value={analysisActionBias}
                  helper="Condensed action framing from portfolio fit, coverage, and concentration context."
                />
              </div>
            </div>

            <Tabs.List className="sticky top-0 z-10 mt-4 grid grid-cols-4 gap-2 rounded-xl border border-white/10 bg-black/35 p-2">
              {[
                ["fit", "Fit"],
                ["ai", "AI"],
                ["quality", "Quality"],
                ["diligence", "Diligence"]
              ].map(([value, label]) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="rounded-md border border-transparent px-3 py-2 text-xs font-medium text-slate-400 transition data-[state=active]:border-white/12 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white"
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="mt-4 min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeResearchAnalysisTab}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="h-full overflow-y-auto pr-1"
                >
                  <Tabs.Content value="fit" forceMount hidden={activeResearchAnalysisTab !== "fit"} className="space-y-3">
                    {activeFitScoreValue != null ? (
                      <ResearchFitComposition
                        fitScore={activeFitScoreValue}
                        diversificationImpact={researchFeatureBundle?.diversificationImpact}
                        concentrationImpact={researchFeatureBundle?.concentrationImpact}
                        dataConfidence={researchInsight?.dataConfidence ?? researchFeatureBundle?.dataConfidence}
                      />
                    ) : null}
                    <div className="grid gap-3">
                      <ResearchInsightCard
                        label="Diversification Impact"
                        value={researchFeatureBundle?.diversificationImpact ?? "Unavailable"}
                        helper={researchInsight?.portfolioFit ?? researchFeatureBundle?.overlapNote}
                      />
                      <ResearchInsightCard
                        label="Concentration Impact"
                        value={researchFeatureBundle?.concentrationImpact ?? "Unavailable"}
                        helper={
                          researchFeatureBundle?.starterPositionTopHolding
                            ? "Starter position would likely enter the top holding tier."
                            : "Starter sizing appears manageable relative to current leaders."
                        }
                      />
                      <ResearchInsightCard
                        label="Benchmark Stance"
                        value={researchFeatureBundle?.benchmarkContext ?? researchInsight?.benchmarkContext ?? "Unavailable"}
                        helper={
                          researchFeatureBundle
                            ? `Top sector ${researchFeatureBundle.topSector} at ${formatPercent(researchFeatureBundle.topSectorWeight)}.`
                            : undefined
                        }
                      />
                      <div className="rounded-lg border border-white/8 bg-black/20 p-4">
                        <p className="text-xs font-medium text-slate-500">Portfolio overlap</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {insightBadges.map((badge) => (
                            <ResearchToneChip key={badge.label} label={badge.label} tone={badge.tone} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </Tabs.Content>

                  <Tabs.Content value="ai" forceMount hidden={activeResearchAnalysisTab !== "ai"} className="space-y-3">
                    {researchInsight ? (
                      <>
                        <ResearchInsightCard label="AI interpretation" value={researchInsight.summary} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <ResearchInsightCard label="Why Now" value={researchInsight.whyNow} />
                          <ResearchInsightCard label="Top Concern" value={researchInsight.topConcern} />
                          <ResearchInsightCard label="Role in Portfolio" value={researchInsight.portfolioFit} />
                          <ResearchInsightCard
                            label="Coverage"
                            value={researchInsight.dataConfidence}
                            helper={
                              researchInsight.missingData.length > 0
                                ? researchInsight.missingData.join(", ")
                                : "Coverage is strong enough for a first-pass memo."
                            }
                          />
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        title="No AI interpretation yet"
                        copy="Select an idea or watchlist item to build a structured Yahoo-backed memo."
                      />
                    )}
                  </Tabs.Content>

                  <Tabs.Content value="quality" forceMount hidden={activeResearchAnalysisTab !== "quality"} className="space-y-3">
                    <ResearchQualityStrip bundle={researchFeatureBundle} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <ResearchInsightCard
                        label="Valuation"
                        value={
                          researchFeatureBundle?.trailingPE != null
                            ? `P/E ${researchFeatureBundle.trailingPE.toFixed(1)}x`
                            : "Valuation partial"
                        }
                        helper={
                          researchInsight?.valuationFrame ??
                          "Fundamental coverage is partial, so valuation should be cross-checked before promotion."
                        }
                      />
                      <ResearchInsightCard
                        label="Coverage Gaps"
                        value={`${researchFeatureBundle?.missingData.length ?? 0} open items`}
                        helper={
                          researchFeatureBundle?.missingData.length
                            ? researchFeatureBundle.missingData.join(", ")
                            : "No major Yahoo data gaps for the current memo."
                        }
                      />
                    </div>
                  </Tabs.Content>

                  <Tabs.Content
                    value="diligence"
                    forceMount
                    hidden={activeResearchAnalysisTab !== "diligence"}
                    className="space-y-3"
                  >
                    <ResearchBulletList title="Thesis" items={researchInsight?.thesis.slice(0, 3) ?? []} />
                    <ResearchBulletList title="Catalysts" items={researchInsight?.catalysts.slice(0, 3) ?? []} />
                    <ResearchBulletList title="Risks" items={researchInsight?.risks.slice(0, 3) ?? []} />
                    <ResearchBulletList
                      title="Diligence Questions"
                      items={researchInsight?.diligenceQuestions.slice(0, 3) ?? []}
                    />
                  </Tabs.Content>
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs.Root>
        )}
      </Panel>
    );

    return (
      <div className="space-y-4">
        <Panel title="Research">
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
                <InfoPill label="Selected" value={selectedResearchTicker ?? "None"} />
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
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                      researchMobileView === view
                        ? "border-white/20 bg-white/[0.08] text-white"
                        : "border-white/10 bg-black/20 text-slate-400 hover:text-white"
                    )}
                  >
                    {view === "feed" ? "Idea Feed" : view === "notebook" ? "Notebook" : "Analysis"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="hidden xl:block">
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={researchPanelLayout}
            onLayoutChanged={(layout) => {
              setResearchPanelLayout(layout as ResearchPanelLayout);
              if (typeof window !== "undefined") {
                window.localStorage.setItem("research-workstation-panels", JSON.stringify(layout));
              }
            }}
            className="h-[calc(100vh-15rem)] min-h-[46rem] gap-4"
          >
            <ResizablePanel id="researchFeed" defaultSize={researchPanelLayout.researchFeed} minSize={24}>
              {renderFeedPane()}
            </ResizablePanel>
            <ResizablePanelResizeHandle className="mx-1 w-1 rounded-full bg-white/10 transition hover:bg-white/20" />
            <ResizablePanel
              id="researchNotebook"
              defaultSize={researchPanelLayout.researchNotebook}
              minSize={28}
            >
              {renderNotebookPane()}
            </ResizablePanel>
            <ResizablePanelResizeHandle className="mx-1 w-1 rounded-full bg-white/10 transition hover:bg-white/20" />
            <ResizablePanel
              id="researchInsight"
              defaultSize={researchPanelLayout.researchInsight}
              minSize={24}
            >
              {renderInsightPane()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="space-y-4 xl:hidden">
          {researchMobileView === "feed" ? renderFeedPane() : null}
          {researchMobileView === "notebook" ? renderNotebookPane() : null}
          {researchMobileView === "insight" ? renderInsightPane() : null}
        </div>
      </div>
    );
  };

  const renderRisk = () => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thisWeekEvents = auditRows.filter((entry) => Date.parse(entry.timestamp) >= weekAgo).length;
    const activeNotes = watchlistItems.filter((item) =>
      [item.thesis, item.catalysts, item.risks, item.notes].some((value) => value?.trim())
    ).length;
    const drawdownCurve = selectedMetrics
      ? [
          { horizon: "3M", probability: selectedMetrics.drawdownProb3m },
          { horizon: "6M", probability: selectedMetrics.drawdownProb6m },
          { horizon: "12M", probability: selectedMetrics.drawdownProb12m }
        ]
      : [];

    const alertFeed = [
      ...(riskReport?.vulnerabilities ?? []).map((vulnerability, index) => ({
        id: `vuln:${index}`,
        type: "Risk Alert",
        status: "Active",
        conviction: "High",
        title: vulnerability,
        body: riskReport?.summary ?? "Deterministic model flagged an elevated downside signal.",
        owner: "Risk Engine",
        timestamp: selectedPortfolio?.updatedAt ?? new Date().toISOString(),
        action: vulnerability.toLowerCase().includes("concentration") ? "Reduce" : "Review"
      })),
      ...(riskReport?.balanceSheetSignals ?? []).slice(0, 4).map((signal, index) => ({
        id: `balance:${index}:${signal.ticker}`,
        type: signal.signal.toLowerCase().includes("earnings") ? "Earnings" : "Macro",
        status: signal.severity === "HIGH" ? "Under Review" : "Active",
        conviction: signal.severity === "HIGH" ? "High" : signal.severity === "WATCH" ? "Medium" : "Low",
        title: `${signal.ticker} ${signal.signal}`,
        body: `${signal.companyName} shows a ${signal.severity.toLowerCase()} balance-sheet signal in deterministic diagnostics.`,
        owner: signal.companyName,
        timestamp: selectedPortfolio?.updatedAt ?? new Date().toISOString(),
        action: signal.severity === "HIGH" ? "Hedge" : "Monitor"
      })),
      ...(riskInsight?.recommendedActions ?? []).slice(0, 3).map((action, index) => ({
        id: `ai:${index}`,
        type: "Macro",
        status: "Active",
        conviction: "Medium",
        title: action,
        body: riskInsight?.summary ?? "AI interpretation generated this action from deterministic inputs.",
        owner: riskInsight?.model ?? "AI Copilot",
        timestamp: selectedPortfolio?.updatedAt ?? new Date().toISOString(),
        action: "Review"
      }))
    ].slice(0, 8);

    const pendingActions = alertFeed.filter((item) => item.action !== "Monitor").length;
    const riskAlerts = alertFeed.length;

    const typeStyles: Record<string, string> = {
      "Risk Alert": "border-risk/30 bg-risk/10 text-risk",
      Macro: "border-primary/30 bg-primary/10 text-primary",
      Earnings: "border-warning/30 bg-warning/10 text-warning"
    };
    const statusStyles: Record<string, string> = {
      Active: "border-positive/30 bg-positive/10 text-positive",
      "Under Review": "border-warning/30 bg-warning/10 text-warning"
    };
    const convictionStyles: Record<string, string> = {
      High: "text-foreground",
      Medium: "text-muted-foreground",
      Low: "text-muted-foreground"
    };

    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active Notes</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{activeNotes}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk Alerts</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{riskAlerts}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pending Actions</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{pendingActions}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">This Week</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{thisWeekEvents}</p>
          </div>
        </div>

        <Panel title="Risk Feed" action={<span className="text-xs text-muted-foreground">Deterministic + AI interpretation</span>}>
          {riskError ? <div className="mb-3"><InlineNotice message={riskError} tone="warning" /></div> : null}
          {riskInsightError ? <div className="mb-3"><InlineNotice message={riskInsightError} tone="warning" /></div> : null}
          {alertFeed.length === 0 ? (
            <EmptyState
              title="No active alerts"
              copy="Risk feed cards will appear as soon as deterministic risk diagnostics complete."
            />
          ) : (
            <div className="space-y-2">
              {alertFeed.map((item) => (
                <div key={item.id} className="rounded-lg border border-subtle bg-surface-bright p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", typeStyles[item.type] ?? typeStyles.Macro)}>
                      {item.type}
                    </span>
                    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", statusStyles[item.status] ?? statusStyles.Active)}>
                      {item.status}
                    </span>
                    <span className={cn("text-xs", convictionStyles[item.conviction] ?? "text-muted-foreground")}>
                      Conviction: {item.conviction}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-foreground">{item.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{item.owner}</span>
                    <span>·</span>
                    <span>{new Date(item.timestamp).toISOString().slice(0, 10)}</span>
                    <span>·</span>
                    <span className="text-foreground">Action: {item.action}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Panel
            title="Benchmark Relative"
            action={selectedMetrics ? <TierBadge tier={selectedMetrics.riskTier} /> : <span className="text-xs text-muted-foreground">No score</span>}
          >
            {benchmarkAnalyticsError ? <div className="mb-3"><InlineNotice message={benchmarkAnalyticsError} tone="warning" /></div> : null}
            {!selectedPortfolio || !selectedMetrics ? (
              <EmptyState
                title="Benchmark diagnostics unavailable"
                copy="Add holdings and load benchmark analytics to populate relative risk diagnostics."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <InfoPill label="Benchmark" value={selectedPortfolio.benchmark} />
                <InfoPill
                  label="Excess return"
                  value={formatPercent(benchmarkAnalytics?.excessReturn ?? riskReport?.benchmarkComparison.excessReturn)}
                  tone={(benchmarkAnalytics?.excessReturn ?? 0) >= 0 ? "positive" : "negative"}
                />
                <InfoPill
                  label="Correlation"
                  value={
                    benchmarkAnalytics?.correlation != null
                      ? benchmarkAnalytics.correlation.toFixed(2)
                      : riskReport?.returnDiagnostics.correlationToBenchmark.toFixed(2) ?? "N/A"
                  }
                />
                <InfoPill
                  label="Beta"
                  value={
                    benchmarkAnalytics?.beta != null
                      ? benchmarkAnalytics.beta.toFixed(2)
                      : riskReport?.returnDiagnostics.betaToBenchmark.toFixed(2) ?? "N/A"
                  }
                />
                <InfoPill label="VaR (95%)" value={formatCurrency(selectedMetrics.var95Amount)} />
                <InfoPill label="Max drawdown" value={formatPercent(selectedMetrics.maxDrawdown)} tone="negative" />
              </div>
            )}
          </Panel>

          <Panel
            title="Drawdown Term Structure"
            action={
              <button
                onClick={() => void rerunRiskScore(true)}
                className="rounded border border-subtle px-3 py-1.5 text-xs text-foreground transition hover:bg-secondary"
              >
                Re-run
              </button>
            }
          >
            {!selectedMetrics || drawdownCurve.length < 1 ? (
              <EmptyState
                title="No drawdown model yet"
                copy="Run risk scoring to generate forward probability diagnostics."
              />
            ) : (
              <div className="space-y-3">
                <div className="h-48 rounded border border-subtle bg-surface-bright p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={drawdownCurve}>
                      <CartesianGrid stroke="hsl(var(--border) / 0.35)" vertical={false} />
                      <XAxis dataKey="horizon" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                      <Tooltip content={<ChartTooltip formatter={formatPercent} />} />
                      <Area type="monotone" dataKey="probability" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.12)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm text-muted-foreground">
                  {riskReportLoading
                    ? "Refreshing deterministic risk brief..."
                    : selectedMetrics.summary}
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    );
  };

  const renderStress = () => {
    const derivedRows = Object.entries(STRESS_SCENARIOS).map(([name, shocks]) => {
      const impact = shocks.equities * 0.65 + shocks.bonds * 0.25 + shocks.commodities * 0.1;
      return {
        scenario: name,
        impact,
        recoveryMonths: Math.max(2, Math.round(Math.abs(impact) * 38)),
        probability:
          Math.abs(impact) >= 0.25
            ? "Tail"
            : Math.abs(impact) >= 0.12
              ? "Elevated"
              : "Moderate"
      };
    });
    const historyRows = (selectedPortfolio?.stressTests ?? []).map((entry) => ({
      scenario: entry.scenarioName,
      impact:
        selectedMetrics?.portfolioValue && selectedMetrics.portfolioValue > 0
          ? entry.projectedValue / selectedMetrics.portfolioValue - 1
          : 0,
      recoveryMonths: Math.max(1, Math.round(entry.recoveryDays / 30)),
      probability: entry.recoveryDays > 270 ? "Tail" : entry.recoveryDays > 150 ? "Elevated" : "Moderate"
    }));
    const scenarioRows = [...historyRows, ...derivedRows].reduce<Array<{
      scenario: string;
      impact: number;
      recoveryMonths: number;
      probability: string;
    }>>((acc, row) => {
      if (acc.some((item) => item.scenario === row.scenario)) {
        return acc;
      }
      acc.push(row);
      return acc;
    }, []);
    const worstCase = scenarioRows.slice().sort((left, right) => left.impact - right.impact)[0] ?? null;
    const mostLikely = scenarioRows.find((row) => row.probability === "Moderate") ?? scenarioRows[0] ?? null;
    const maxHistoricalDrawdown = selectedMetrics?.maxDrawdown ?? 0;
    const probabilityStyles: Record<string, string> = {
      Tail: "bg-danger/10 text-danger",
      Elevated: "bg-warning/10 text-warning",
      Moderate: "bg-primary/10 text-primary",
      Low: "bg-positive/10 text-positive"
    };

    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Worst Case Loss</p>
            <p className="mt-2 font-mono-data text-4xl text-risk">
              {worstCase ? formatCurrency((selectedMetrics?.portfolioValue ?? 0) * worstCase.impact) : "N/A"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{worstCase?.scenario ?? "No scenario"}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Most Likely Stress</p>
            <p className="mt-2 font-mono-data text-4xl text-risk">
              {mostLikely ? formatCurrency((selectedMetrics?.portfolioValue ?? 0) * mostLikely.impact) : "N/A"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{mostLikely?.scenario ?? "No scenario"}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Max Historical DD</p>
            <p className="mt-2 font-mono-data text-4xl text-risk">{formatPercent(maxHistoricalDrawdown)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Current portfolio profile</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Scenarios Run</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{selectedPortfolio?.stressTests.length ?? 0}</p>
            <p className="mt-1 text-sm text-muted-foreground">Monte Carlo + deterministic set</p>
          </div>
        </div>

        <Panel title="Stress Scenarios" action={<span className="text-xs text-muted-foreground">Scenario impact matrix</span>}>
          <div className="mb-3 grid gap-3 xl:grid-cols-[1fr_auto]">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                className="rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
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
              <button
                onClick={runStressScenario}
                className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Run Scenario
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setStressScenario("Custom");
              }}
              className="rounded border border-subtle px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              Custom Stress
            </button>
          </div>

          {stressError ? <div className="mb-3"><InlineNotice message={stressError} tone="warning" /></div> : null}

          {stressScenario === "Custom" ? (
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              {(["equities", "bonds", "commodities"] as const).map((asset) => (
                <label key={asset} className="space-y-2">
                  <span className="block text-xs capitalize text-muted-foreground">{asset}</span>
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
                    className="w-full rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
                  />
                </label>
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded border border-subtle">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-bright text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Scenario</th>
                  <th className="px-4 py-3 text-right font-medium">Portfolio Impact</th>
                  <th className="px-4 py-3 text-right font-medium">Recovery Est.</th>
                  <th className="px-4 py-3 text-right font-medium">Probability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarioRows.map((row) => (
                  <tr key={row.scenario} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 text-foreground">{row.scenario}</td>
                    <td className="px-4 py-3 text-right font-mono-data text-risk">{formatPercent(row.impact)}</td>
                    <td className="px-4 py-3 text-right font-mono-data text-muted-foreground">{row.recoveryMonths} months</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("inline-flex rounded px-2 py-0.5 text-xs font-medium", probabilityStyles[row.probability] ?? probabilityStyles.Moderate)}>
                        {row.probability}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stressResult ? (
            <div className="mt-3 rounded border border-subtle bg-surface-bright p-3 text-sm">
              <p className="font-medium text-foreground">{String(stressResult.scenarioName)}</p>
              <p className="mt-1 text-muted-foreground">Projected value: {formatCurrency(Number(stressResult.projectedValue ?? 0))}</p>
              <p className="mt-1 text-muted-foreground">New tier: {String(stressResult.newRiskTier ?? "N/A")} • Recovery {Number(stressResult.recoveryDays ?? 0)} days</p>
            </div>
          ) : null}
        </Panel>
      </div>
    );
  };

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

  const renderAudit = () => {
    const normalizeAction = (actionType: string) =>
      actionType
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

    const parsedRows = auditRows.map((entry) => {
      const metadata = entry.metadata ?? {};
      const metadataText = Object.values(metadata)
        .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
        .map((value) => String(value));
      const detail =
        metadataText.find((value) => value.length > 8) ??
        (entry.riskTierBefore || entry.riskTierAfter
          ? `Risk ${entry.riskTierBefore ?? "N/A"} -> ${entry.riskTierAfter ?? "N/A"}`
          : "System update");
      const entity =
        (typeof metadata.ticker === "string" && metadata.ticker) ||
        (typeof metadata.entity === "string" && metadata.entity) ||
        (typeof metadata.portfolioName === "string" && metadata.portfolioName) ||
        "Portfolio";
      const user =
        (typeof metadata.user === "string" && metadata.user) ||
        (typeof metadata.actor === "string" && metadata.actor) ||
        "System";
      const actionLabel = normalizeAction(entry.actionType);
      const severity =
        entry.actionType.includes("BREACH") || entry.actionType.includes("VIOLATION")
          ? "Warning"
          : entry.actionType.includes("RISK") && entry.riskTierAfter === "HIGH"
            ? "Warning"
            : "Info";
      const status =
        severity === "Warning"
          ? "Flagged"
          : entry.actionType.includes("CHECK")
            ? "Passed"
            : "Completed";

      return {
        ...entry,
        actionLabel,
        detail,
        entity,
        user,
        severity,
        status
      };
    });

    const searchedRows = parsedRows.filter((entry) => {
      const query = auditSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.actionLabel.toLowerCase().includes(query) ||
        entry.entity.toLowerCase().includes(query) ||
        entry.user.toLowerCase().includes(query) ||
        entry.detail.toLowerCase().includes(query)
      );
    });

    const totalEvents = parsedRows.length;
    const violations = parsedRows.filter((entry) => entry.severity !== "Info").length;
    const pendingReview = parsedRows.filter((entry) => entry.status === "Flagged").length;
    const lastViolationTs = parsedRows
      .filter((entry) => entry.severity !== "Info")
      .map((entry) => Date.parse(entry.timestamp))
      .filter((timestamp) => Number.isFinite(timestamp))
      .sort((left, right) => right - left)[0];
    const cleanDays = lastViolationTs
      ? Math.max(0, Math.floor((Date.now() - lastViolationTs) / (24 * 60 * 60 * 1000)))
      : totalEvents > 0
        ? 14
        : 0;

    const handleAuditExport = () => {
      const rows = searchedRows.map((entry) => [
        entry.id,
        entry.timestamp,
        entry.actionLabel,
        entry.entity,
        entry.user,
        entry.detail,
        entry.severity,
        entry.status
      ]);
      const csv = [
        ["ID", "TIMESTAMP", "ACTION", "ENTITY", "USER", "DETAIL", "SEVERITY", "STATUS"].join(","),
        ...rows.map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(selectedPortfolio?.name ?? "portfolio").toLowerCase().replaceAll(" ", "-")}-audit.csv`;
      link.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Total Events</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{totalEvents.toLocaleString()}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Violations</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{violations}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pending Review</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{pendingReview}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Clean Days</p>
            <p className="mt-2 font-mono-data text-4xl text-foreground">{cleanDays}</p>
          </div>
        </div>

        <Panel title="Audit Log" action={<span className="text-xs text-muted-foreground">Compliance and operational trail</span>}>
          {auditError ? <div className="mb-3"><InlineNotice message={auditError} tone="warning" /></div> : null}
          <div className="mb-3 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
            <input
              value={auditSearch}
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Search audit log..."
              className="rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
            />
            <button
              onClick={() =>
                void refreshAudit().catch((error) =>
                  setAuditError(error instanceof Error ? error.message : "Audit refresh failed")
                )
              }
              className="rounded border border-subtle px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              Filter
            </button>
            <button
              type="button"
              onClick={handleAuditExport}
              className="rounded border border-subtle px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              Export
            </button>
          </div>

          <div className="mb-3 grid gap-3 md:grid-cols-4">
            <select
              value={auditActionType}
              onChange={(event) => setAuditActionType(event.target.value)}
              className="rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
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
              className="rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
            />
            <input
              type="date"
              value={auditTo}
              onChange={(event) => setAuditTo(event.target.value)}
              className="rounded border border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/35"
            />
            <div className="rounded border border-subtle bg-surface px-3 py-2 text-xs text-muted-foreground">
              Showing {searchedRows.length} of {totalEvents}
            </div>
          </div>

          {searchedRows.length === 0 ? (
            <EmptyState
              title="No audit events match"
              copy="Try broadening the date range or action filter."
            />
          ) : (
            <div className="overflow-hidden rounded border border-subtle">
              <div className="max-h-[38rem] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-bright text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">ID</th>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Entity</th>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Detail</th>
                      <th className="px-4 py-3 font-medium">Severity</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {searchedRows.map((entry) => (
                      <tr key={entry.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-3 font-mono-data text-muted-foreground">{entry.id.slice(0, 10)}</td>
                        <td className="px-4 py-3 font-mono-data text-muted-foreground">
                          {new Date(entry.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                        </td>
                        <td className="px-4 py-3 text-foreground">{entry.actionLabel}</td>
                        <td className="px-4 py-3 text-foreground">{entry.entity}</td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.user}</td>
                        <td className="max-w-[24rem] truncate px-4 py-3 text-muted-foreground">{entry.detail}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                              entry.severity === "Warning"
                                ? "bg-warning/10 text-warning"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {entry.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                              entry.status === "Flagged"
                                ? "bg-risk/10 text-risk"
                                : entry.status === "Passed"
                                  ? "bg-positive/10 text-positive"
                                  : "bg-primary/10 text-primary"
                            )}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </div>
    );
  };

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
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-subtle bg-surface py-3 lg:flex">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded bg-primary/20 text-primary">
            <LogoMark className="h-5 w-5" />
          </div>
          {tabs.map((tab) => (
            <SidebarNavItem
              key={tab.id}
              active={activeTab === tab.id}
              label={tab.shortLabel}
              icon={tab.icon}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => setActiveTab("holdings")}
            className="mt-auto flex h-10 w-10 items-center justify-center rounded border border-subtle text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Add position"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <WorkspaceToolbar
            title={activeTabMeta.label}
            subtitle={selectedPortfolio?.name ?? activeTabMeta.caption}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-8 items-center gap-1 rounded border border-subtle px-2 text-xs text-muted-foreground transition hover:text-foreground lg:hidden"
                >
                  <MenuIcon className="h-3.5 w-3.5" />
                  Menu
                </button>
                <div className="hidden min-w-[210px] max-w-[260px] lg:block">{portfolioSelector}</div>
                <RangeSelector value={portfolioRange} onChange={setPortfolioRange} />
              </>
            }
          />

          {(statusMessage || errorMessage || portfolioLoading || isPending) && (
            <div
              className={cn(
                "mx-3 mt-2 rounded border px-3 py-2 text-xs",
                errorMessage
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-subtle bg-surface text-foreground"
              )}
            >
              {errorMessage ??
                statusMessage ??
                (portfolioLoading || isPending ? "Updating workspace..." : null)}
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-auto p-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "overview" && renderOverview()}
                {activeTab === "holdings" && renderHoldings()}
                {activeTab === "research" && renderResearch()}
                {activeTab === "risk" && renderRisk()}
                {activeTab === "stress" && renderStress()}
                {activeTab === "allocation" && renderAllocation()}
                {activeTab === "audit" && renderAudit()}
                {activeTab === "settings" && renderSettings()}
              </motion.div>
            </AnimatePresence>
          </main>

          <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-subtle bg-surface px-4 text-[9px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse-glow" />
              System online
            </span>
            <span>Tab: {activeTabMeta.shortLabel}</span>
            <span>{selectedPortfolio ? `${selectedPortfolio.positions.length} positions` : "No portfolio"}</span>
            <span className="ml-auto font-mono-data">as-of {new Date().toISOString().slice(0, 19)}Z</span>
          </footer>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-[88%] max-w-xs border-r border-white/[0.08] bg-sidebar px-4 py-4 shadow-shell">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-3">
                <span className="text-white">
                  <LogoMark />
                </span>
                <p className="text-sm font-semibold text-white">Portfolio Risk Engine</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg border border-white/[0.08] p-2 text-slate-300"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-slate-500">Portfolio</p>
              {portfolioSummaries.length > 0 ? portfolioSelector : null}
            </div>
            <nav className="mt-6 space-y-1.5">
              {tabs.map((tab) => (
                <SidebarNavItem
                  key={tab.id}
                  active={activeTab === tab.id}
                  label={tab.shortLabel}
                  icon={tab.icon}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

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
