"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Info,
  Shield,
  TrendingDown
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { RiskReport, RiskInsight, RiskMetrics, HoldingSnapshot } from "@/lib/types";
import {
  PremiumPanel,
  NestedCard,
  TierBadge,
  staggerContainer,
  staggerChild
} from "./premium-components";

type RiskTabProps = {
  metrics: RiskMetrics | null;
  report: RiskReport | null;
  insight: RiskInsight | null;
  holdings: HoldingSnapshot[];
};

const signalIcons = {
  INFO: Info,
  WATCH: AlertTriangle,
  HIGH: AlertTriangle
};

const signalStyles = {
  INFO: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  WATCH: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  HIGH: "border-rose-500/30 bg-rose-500/10 text-rose-400"
};

// Quality score bar
function QualityScoreBar({
  label,
  score,
  band
}: {
  label: string;
  score: number;
  band: "Strong" | "Moderate" | "Weak";
}) {
  const barColor =
    band === "Strong"
      ? "bg-emerald-500"
      : band === "Moderate"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-white tabular-nums">{score}/100</span>
          <span className={cn(
            "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            band === "Strong"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : band === "Moderate"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          )}>
            {band}
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={cn("h-full rounded-full", barColor)}
        />
      </div>
    </div>
  );
}

// Alert card
function AlertCard({
  severity,
  message
}: {
  severity: "INFO" | "WATCH" | "HIGH";
  message: string;
}) {
  const Icon = signalIcons[severity];

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border p-3",
      signalStyles[severity]
    )}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// Sector concentration chart
function SectorConcentrationChart({
  data,
  className
}: {
  data: Array<{ sector: string; weight: number }>;
  className?: string;
}) {
  const colors = [
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#f59e0b",
    "#ec4899",
    "#6366f1",
    "#14b8a6",
    "#f97316"
  ];

  return (
    <div className={cn("h-[200px]", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
          <XAxis
            type="number"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="sector"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              return (
                <div className="rounded-lg border border-white/[0.08] bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur-xl">
                  <p className="text-sm font-medium text-white">
                    {payload[0].payload.sector}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatPercent(payload[0].value as number)}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.sector} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Return diagnostics visualization
function ReturnDiagnosticsChart({
  diagnostics
}: {
  diagnostics: RiskReport["returnDiagnostics"];
}) {
  const data = [
    { name: "Best Day", value: diagnostics.bestDay, fill: "#10b981" },
    { name: "Worst Day", value: diagnostics.worstDay, fill: "#f43f5e" },
    { name: "Drawdown", value: diagnostics.currentDrawdown, fill: "#f59e0b" }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {data.map((item) => (
        <NestedCard key={item.name} className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            {item.name}
          </p>
          <p
            className="mt-2 font-mono text-xl font-semibold tabular-nums"
            style={{ color: item.fill }}
          >
            {formatPercent(item.value)}
          </p>
        </NestedCard>
      ))}
    </div>
  );
}

// Scenario matrix
function ScenarioMatrix({
  scenarios
}: {
  scenarios: RiskReport["scenarioMatrix"];
}) {
  return (
    <div className="space-y-2">
      {scenarios.map((scenario) => (
        <div
          key={scenario.name}
          className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
        >
          <span className="text-sm text-zinc-300">{scenario.name}</span>
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-mono text-sm tabular-nums",
              scenario.impact < 0 ? "text-rose-400" : "text-emerald-400"
            )}>
              {scenario.impact >= 0 ? "+" : ""}{formatPercent(scenario.impact)}
            </span>
            <span className={cn(
              "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              scenario.severity === "LOW"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : scenario.severity === "MODERATE"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400"
            )}>
              {scenario.severity}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskTab({
  metrics,
  report,
  insight,
  holdings
}: RiskTabProps) {
  // Calculate sector concentration from holdings if report not available
  const sectorData = useMemo(() => {
    if (report?.sectorConcentration) {
      return report.sectorConcentration;
    }

    const sectors = holdings.reduce<Record<string, number>>((acc, h) => {
      const sector = h.sector || "Other";
      acc[sector] = (acc[sector] || 0) + (h.weight ?? 0);
      return acc;
    }, {});

    return Object.entries(sectors)
      .map(([sector, weight]) => ({ sector, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
  }, [report, holdings]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Summary Row */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <motion.div variants={staggerChild}>
          <PremiumPanel
            title="Risk Summary"
            action={metrics?.riskTier && <TierBadge tier={metrics.riskTier} />}
          >
            <div className="space-y-4">
              {report?.summary ? (
                <p className="text-[15px] leading-relaxed text-zinc-300">
                  {report.summary}
                </p>
              ) : metrics?.summary ? (
                <p className="text-[15px] leading-relaxed text-zinc-300">
                  {metrics.summary}
                </p>
              ) : (
                <p className="text-[15px] leading-relaxed text-zinc-500">
                  Risk analysis summary will appear here when available.
                </p>
              )}

              {/* Key metrics grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Sharpe
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                    {(metrics?.sharpe ?? 0).toFixed(2)}
                  </p>
                </NestedCard>
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Max DD
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-rose-400">
                    {formatPercent(metrics?.maxDrawdown ?? 0)}
                  </p>
                </NestedCard>
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    VaR 95%
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-400">
                    {formatPercent(metrics?.var95 ?? 0)}
                  </p>
                </NestedCard>
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Volatility
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                    {formatPercent(metrics?.annualizedVolatility ?? 0)}
                  </p>
                </NestedCard>
              </div>
            </div>
          </PremiumPanel>
        </motion.div>

        <motion.div variants={staggerChild}>
          <PremiumPanel title="Alerts & Insights">
            <div className="space-y-3">
              {insight?.alerts && insight.alerts.length > 0 ? (
                insight.alerts.map((alert, i) => (
                  <AlertCard
                    key={i}
                    severity={alert.severity}
                    message={alert.message}
                  />
                ))
              ) : report?.vulnerabilities && report.vulnerabilities.length > 0 ? (
                report.vulnerabilities.map((vuln, i) => (
                  <AlertCard key={i} severity="WATCH" message={vuln} />
                ))
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm">No critical alerts at this time</p>
                </div>
              )}
            </div>
          </PremiumPanel>
        </motion.div>
      </div>

      {/* Quality Scores */}
      {report?.qualityScoreDetails && (
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Quality Scores">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <QualityScoreBar
                  label="Concentration"
                  score={report.qualityScoreDetails.concentration.score}
                  band={report.qualityScoreDetails.concentration.band}
                />
                <QualityScoreBar
                  label="Liquidity"
                  score={report.qualityScoreDetails.liquidity.score}
                  band={report.qualityScoreDetails.liquidity.band}
                />
                <QualityScoreBar
                  label="Balance Sheet"
                  score={report.qualityScoreDetails.balanceSheet.score}
                  band={report.qualityScoreDetails.balanceSheet.band}
                />
              </div>
              <div className="space-y-4">
                <QualityScoreBar
                  label="Profitability"
                  score={report.qualityScoreDetails.profitability.score}
                  band={report.qualityScoreDetails.profitability.band}
                />
                <QualityScoreBar
                  label="Growth"
                  score={report.qualityScoreDetails.growth.score}
                  band={report.qualityScoreDetails.growth.band}
                />
                <QualityScoreBar
                  label="Downside Risk"
                  score={report.qualityScoreDetails.downsideRisk.score}
                  band={report.qualityScoreDetails.downsideRisk.band}
                />
              </div>
            </div>
          </PremiumPanel>
        </motion.div>
      )}

      {/* Concentration Analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Sector Concentration">
            <SectorConcentrationChart data={sectorData} />
          </PremiumPanel>
        </motion.div>

        {report?.returnDiagnostics && (
          <motion.div variants={staggerChild}>
            <PremiumPanel title="Return Diagnostics">
              <ReturnDiagnosticsChart diagnostics={report.returnDiagnostics} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Beta to Benchmark
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                    {report.returnDiagnostics.betaToBenchmark.toFixed(2)}
                  </p>
                </NestedCard>
                <NestedCard className="p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Hit Rate
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                    {formatPercent(report.returnDiagnostics.hitRate)}
                  </p>
                </NestedCard>
              </div>
            </PremiumPanel>
          </motion.div>
        )}
      </div>

      {/* Scenario Matrix */}
      {report?.scenarioMatrix && report.scenarioMatrix.length > 0 && (
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Scenario Impact Matrix">
            <ScenarioMatrix scenarios={report.scenarioMatrix} />
          </PremiumPanel>
        </motion.div>
      )}

      {/* Top Risk Contributors */}
      {report?.topRiskContributors && report.topRiskContributors.length > 0 && (
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Top Risk Contributors">
            <div className="space-y-2">
              {report.topRiskContributors.map((contributor) => (
                <div
                  key={contributor.ticker}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 font-mono text-xs font-bold text-rose-400">
                      {contributor.ticker.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium text-white">
                        {contributor.ticker}
                      </p>
                      <p className="text-xs text-zinc-500">{contributor.companyName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium tabular-nums text-rose-400">
                      {formatPercent(contributor.contribution)}
                    </p>
                    <p className="text-xs text-zinc-500">{contributor.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>
        </motion.div>
      )}
    </motion.div>
  );
}
