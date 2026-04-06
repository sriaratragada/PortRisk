"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { HoldingSnapshot, RiskMetrics } from "@/lib/types";
import {
  PremiumPanel,
  TierBadge,
  NumberTicker,
  NestedCard,
  staggerContainer,
  staggerChild
} from "./premium-components";
import { ChartRangeSelector } from "./pill-navigation";

type OverviewTabProps = {
  metrics: RiskMetrics | null;
  holdings: HoldingSnapshot[];
  valueHistory: Array<{ date: string; value: number }>;
  chartRange: string;
  onChartRangeChange: (range: string) => void;
};

const chartRanges = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];

// Mini sparkline component (60px height, no axes per spec)
function MiniSparkline({
  data,
  color = "#10b981",
  className
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const chartData = data.map((value, index) => ({ index, value }));
  const isPositive = data.length > 1 && data[data.length - 1] >= data[0];
  const actualColor = isPositive ? "#10b981" : "#f43f5e";

  return (
    <div className={cn("h-[60px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkline-gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={actualColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={actualColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={actualColor}
            strokeWidth={1.5}
            fill={`url(#sparkline-gradient-${color})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Allocation donut chart per spec
function AllocationDonut({
  holdings,
  className
}: {
  holdings: HoldingSnapshot[];
  className?: string;
}) {
  const data = useMemo(() => {
    const sectors = holdings.reduce<Record<string, number>>((acc, h) => {
      const sector = h.sector || "Other";
      acc[sector] = (acc[sector] || 0) + (h.weight ?? 0);
      return acc;
    }, {});

    return Object.entries(sectors)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // Max 6 sectors for readability
  }, [holdings]);

  const colors = [
    "#10b981", // emerald
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#f59e0b", // amber
    "#ec4899", // pink
    "#6366f1"  // indigo
  ];

  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={cn("relative", className)}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={1}
            stroke="rgba(0,0,0,0.3)"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={colors[index % colors.length]}
                className="transition-all duration-200 hover:opacity-80"
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const item = payload[0].payload;
              return (
                <div className="rounded-lg border border-white/[0.08] bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur-xl">
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <p className="text-xs text-zinc-400">{formatPercent(item.value)}</p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs text-zinc-500">Total</p>
          <p className="text-lg font-semibold text-white">{formatPercent(totalValue)}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-xs text-zinc-400">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hero metric card with large value
function HeroMetricCard({
  value,
  dailyPnl,
  dailyPnlPercent,
  className
}: {
  value: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  className?: string;
}) {
  const isPositive = dailyPnl >= 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end gap-4">
        <motion.h1
          className="text-[48px] font-semibold tracking-[-0.02em] text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <NumberTicker value={value} format="currency" />
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className={cn(
            "mb-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
            isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span className="font-mono tabular-nums">
            {isPositive ? "+" : ""}{formatCurrency(dailyPnl)}
          </span>
          <span className="text-zinc-500">
            ({isPositive ? "+" : ""}{formatPercent(dailyPnlPercent)})
          </span>
        </motion.div>
      </div>
    </div>
  );
}

// Metric glass card (2x2 grid items)
function MetricGlassCard({
  label,
  value,
  sparklineData,
  delay = 0
}: {
  label: string;
  value: string;
  sparklineData?: number[];
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/40 via-zinc-900/20 to-zinc-950/40 p-5"
    >
      <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-[-0.01em] text-white font-mono tabular-nums">
          {value}
        </p>
        {sparklineData && sparklineData.length > 0 && (
          <div className="h-[40px] w-[80px]">
            <MiniSparkline data={sparklineData} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Portfolio value chart
function PortfolioValueChart({
  data,
  range,
  onRangeChange,
  className
}: {
  data: Array<{ date: string; value: number }>;
  range: string;
  onRangeChange: (range: string) => void;
  className?: string;
}) {
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;
  const color = isPositive ? "#10b981" : "#f43f5e";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Portfolio Value</h4>
        <ChartRangeSelector
          ranges={chartRanges}
          value={range}
          onChange={onRangeChange}
        />
      </div>
      
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.[0]) return null;
                return (
                  <div className="rounded-lg border border-white/[0.08] bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur-xl">
                    <p className="text-xs text-zinc-400">{new Date(label).toLocaleDateString()}</p>
                    <p className="text-sm font-medium text-white">
                      {formatCurrency(payload[0].value as number)}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#valueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function OverviewTab({
  metrics,
  holdings,
  valueHistory,
  chartRange,
  onChartRangeChange
}: OverviewTabProps) {
  // Calculate daily P&L
  const dailyPnl = holdings.reduce((sum, h) => sum + (h.dailyPnl ?? 0), 0);
  const portfolioValue = metrics?.portfolioValue ?? 0;
  const dailyPnlPercent = portfolioValue > 0 ? dailyPnl / portfolioValue : 0;

  // Generate sparkline data for metrics
  const generateSparkline = (base: number, variance: number = 0.1) => {
    return Array.from({ length: 20 }, (_, i) => {
      const trend = (i / 19) * variance;
      const noise = (Math.random() - 0.5) * variance * 0.5;
      return base * (1 + trend + noise);
    });
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Hero Section */}
      <motion.div variants={staggerChild}>
        <PremiumPanel
          title="Portfolio Overview"
          action={metrics?.riskTier && <TierBadge tier={metrics.riskTier} />}
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <HeroMetricCard
                value={portfolioValue}
                dailyPnl={dailyPnl}
                dailyPnlPercent={dailyPnlPercent}
              />
              
              {metrics?.summary && (
                <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
                  {metrics.summary}
                </p>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <MetricGlassCard
                label="Return"
                value={formatPercent(metrics?.annualizedReturn ?? 0)}
                sparklineData={generateSparkline(1, 0.15)}
                delay={0.1}
              />
              <MetricGlassCard
                label="Sharpe"
                value={(metrics?.sharpe ?? 0).toFixed(2)}
                sparklineData={generateSparkline(1.2, 0.08)}
                delay={0.15}
              />
              <MetricGlassCard
                label="Max Drawdown"
                value={formatPercent(metrics?.maxDrawdown ?? 0)}
                sparklineData={generateSparkline(0.85, -0.1)}
                delay={0.2}
              />
              <MetricGlassCard
                label="VaR (95%)"
                value={formatPercent(metrics?.var95 ?? 0)}
                sparklineData={generateSparkline(0.05, 0.05)}
                delay={0.25}
              />
            </div>
          </div>
        </PremiumPanel>
      </motion.div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Performance">
            <PortfolioValueChart
              data={valueHistory}
              range={chartRange}
              onRangeChange={onChartRangeChange}
            />
          </PremiumPanel>
        </motion.div>

        <motion.div variants={staggerChild}>
          <PremiumPanel title="Allocation">
            <AllocationDonut holdings={holdings} />
          </PremiumPanel>
        </motion.div>
      </div>

      {/* Risk Metrics Row */}
      <motion.div variants={staggerChild}>
        <PremiumPanel title="Risk Metrics" subtitle="Live recalculation">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <NestedCard className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Volatility
              </p>
              <p className="mt-2 text-xl font-semibold text-white font-mono tabular-nums">
                {formatPercent(metrics?.annualizedVolatility ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Annualized</p>
            </NestedCard>

            <NestedCard className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                DD Prob (3M)
              </p>
              <p className="mt-2 text-xl font-semibold text-white font-mono tabular-nums">
                {formatPercent(metrics?.drawdownProb3m ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">10% threshold</p>
            </NestedCard>

            <NestedCard className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                DD Prob (6M)
              </p>
              <p className="mt-2 text-xl font-semibold text-white font-mono tabular-nums">
                {formatPercent(metrics?.drawdownProb6m ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">10% threshold</p>
            </NestedCard>

            <NestedCard className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                DD Prob (12M)
              </p>
              <p className="mt-2 text-xl font-semibold text-white font-mono tabular-nums">
                {formatPercent(metrics?.drawdownProb12m ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">10% threshold</p>
            </NestedCard>

            <NestedCard className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                VaR Amount
              </p>
              <p className="mt-2 text-xl font-semibold text-rose-400 font-mono tabular-nums">
                {formatCurrency(metrics?.var95Amount ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Daily 95%</p>
            </NestedCard>
          </div>
        </PremiumPanel>
      </motion.div>
    </motion.div>
  );
}
