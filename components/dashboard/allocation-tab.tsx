"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  RefreshCw,
  Target,
  TrendingUp
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type {
  AllocationRecommendation,
  AllocationRecommendationSet,
  AllocationRecommendationVariant,
  HoldingSnapshot
} from "@/lib/types";
import {
  PremiumPanel,
  NestedCard,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  staggerContainer,
  staggerChild
} from "./premium-components";
import { SegmentedControl } from "./pill-navigation";

type AllocationTabProps = {
  holdings: HoldingSnapshot[];
  recommendations: AllocationRecommendationSet | null;
  onApplyAllocation: (variant: AllocationRecommendationVariant) => void;
  isApplying: boolean;
};

const variantLabels: Record<AllocationRecommendationVariant, string> = {
  primary: "Optimal",
  conservative: "Conservative",
  growth: "Growth"
};

const variantDescriptions: Record<AllocationRecommendationVariant, string> = {
  primary: "Maximizes risk-adjusted returns (Sharpe ratio)",
  conservative: "Prioritizes capital preservation with lower volatility",
  growth: "Targets higher returns with increased risk tolerance"
};

// Comparison row for current vs target
function AllocationRow({
  ticker,
  companyName,
  sector,
  currentWeight,
  targetWeight,
  deltaWeight
}: {
  ticker: string;
  companyName: string;
  sector: string;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
}) {
  const action = deltaWeight > 0.001 ? "BUY" : deltaWeight < -0.001 ? "SELL" : "HOLD";
  const actionColor =
    action === "BUY"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : action === "SELL"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";

  return (
    <motion.div
      variants={staggerChild}
      className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
    >
      {/* Ticker info */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] font-mono text-xs font-bold text-white">
          {ticker.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-white">{ticker}</p>
          <p className="truncate text-xs text-zinc-500">{companyName}</p>
        </div>
      </div>

      {/* Current weight */}
      <div className="w-20 text-right">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
          Current
        </p>
        <p className="font-mono text-sm tabular-nums text-zinc-400">
          {formatPercent(currentWeight)}
        </p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600" />

      {/* Target weight */}
      <div className="w-20 text-right">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
          Target
        </p>
        <p className="font-mono text-sm tabular-nums text-white">
          {formatPercent(targetWeight)}
        </p>
      </div>

      {/* Delta badge */}
      <div className="w-24 text-right">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
          actionColor
        )}>
          {action === "BUY" ? (
            <Plus className="h-3 w-3" />
          ) : action === "SELL" ? (
            <Minus className="h-3 w-3" />
          ) : null}
          {action}
          <span className="ml-1 font-mono tabular-nums">
            {Math.abs(deltaWeight) > 0.001 ? formatPercent(Math.abs(deltaWeight)) : "—"}
          </span>
        </span>
      </div>
    </motion.div>
  );
}

// Variant selector card
function VariantCard({
  variant,
  label,
  objective,
  expected,
  diagnostics,
  isSelected,
  onSelect
}: {
  variant: AllocationRecommendationVariant;
  label: string;
  objective: string;
  expected: AllocationRecommendation["expected"];
  diagnostics: AllocationRecommendation["diagnostics"];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-5 transition-all duration-200",
        isSelected
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-white/[0.06] bg-black/20 hover:border-white/[0.12] hover:bg-white/[0.02]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">{label}</h4>
          <p className="mt-1 text-sm text-zinc-500">{objective}</p>
        </div>
        {isSelected && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black">
            <Check className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Exp. Return
          </p>
          <p className="mt-1 font-mono text-sm font-medium tabular-nums text-emerald-400">
            {expected.annualReturn != null ? formatPercent(expected.annualReturn) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Sharpe
          </p>
          <p className="mt-1 font-mono text-sm font-medium tabular-nums text-white">
            {expected.sharpe?.toFixed(2) ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Turnover
          </p>
          <p className="mt-1 font-mono text-sm font-medium tabular-nums text-zinc-400">
            {formatPercent(diagnostics.turnover)}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// Insights list
function InsightsList({
  insights
}: {
  insights: AllocationRecommendationSet["insights"];
}) {
  const toneStyles = {
    positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    neutral: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    risk: "border-rose-500/30 bg-rose-500/10 text-rose-400"
  };

  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={cn(
            "rounded-lg border p-3",
            toneStyles[insight.tone]
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{insight.label}</span>
            <span className="font-mono text-sm font-semibold">{insight.value}</span>
          </div>
          {insight.description && (
            <p className="mt-1 text-xs opacity-80">{insight.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Rebalance command list
function RebalanceCommandList({
  weights,
  portfolioValue
}: {
  weights: AllocationRecommendation["weights"];
  portfolioValue: number;
}) {
  const commands = weights
    .filter((w) => Math.abs(w.deltaWeight) > 0.001)
    .sort((a, b) => b.deltaWeight - a.deltaWeight);

  if (commands.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No rebalancing required
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {commands.map((cmd) => {
        const action = cmd.deltaWeight > 0 ? "BUY" : "SELL";
        const value = Math.abs(cmd.deltaWeight * portfolioValue);
        const actionColor =
          action === "BUY"
            ? "text-emerald-400"
            : "text-rose-400";
        const tagColor =
          action === "BUY"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-rose-500/30 bg-rose-500/10 text-rose-400";

        return (
          <div
            key={cmd.ticker}
            className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-black/10 px-3 py-2"
          >
            <span className={cn(
              "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold",
              tagColor
            )}>
              {action}
            </span>
            <span className="font-mono text-sm font-medium text-white">
              {cmd.ticker}
            </span>
            <span className="flex-1 text-xs text-zinc-500">
              {cmd.companyName}
            </span>
            <span className={cn("font-mono text-sm font-medium tabular-nums", actionColor)}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AllocationTab({
  holdings,
  recommendations,
  onApplyAllocation,
  isApplying
}: AllocationTabProps) {
  const [selectedVariant, setSelectedVariant] = useState<AllocationRecommendationVariant>("primary");

  const selectedRecommendation = useMemo(() => {
    return recommendations?.recommendations.find((r) => r.variant === selectedVariant);
  }, [recommendations, selectedVariant]);

  const portfolioValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
  }, [holdings]);

  const variantOptions = [
    { value: "primary" as const, label: "Optimal" },
    { value: "conservative" as const, label: "Conservative" },
    { value: "growth" as const, label: "Growth" }
  ];

  if (!recommendations || recommendations.recommendationState !== "available") {
    return (
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <PremiumPanel title="Allocation Modeler">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-white/[0.04] p-6">
              <Target className="h-12 w-12 text-zinc-600" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">
              {recommendations?.recommendationState === "insufficient_history"
                ? "Insufficient Data"
                : "Recommendations Unavailable"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              {recommendations?.recommendationState === "insufficient_history"
                ? "More historical data is needed to generate allocation recommendations."
                : "Allocation recommendations are not available at this time."}
            </p>
          </div>
        </PremiumPanel>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Variant Selector */}
      <motion.div variants={staggerChild}>
        <PremiumPanel
          title="Allocation Strategy"
          subtitle={`Benchmark: ${recommendations.benchmark}`}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {recommendations.recommendations.map((rec) => (
              <VariantCard
                key={rec.variant}
                variant={rec.variant}
                label={rec.label}
                objective={rec.objective}
                expected={rec.expected}
                diagnostics={rec.diagnostics}
                isSelected={selectedVariant === rec.variant}
                onSelect={() => setSelectedVariant(rec.variant)}
              />
            ))}
          </div>
        </PremiumPanel>
      </motion.div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.4fr]">
        {/* Comparison Table */}
        <motion.div variants={staggerChild}>
          <PremiumPanel
            title="Allocation Comparison"
            subtitle="Current vs Target weights"
            noPadding
          >
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
              <SegmentedControl
                options={variantOptions}
                value={selectedVariant}
                onChange={setSelectedVariant}
              />
              <PrimaryButton
                onClick={() => onApplyAllocation(selectedVariant)}
                disabled={isApplying}
                isLoading={isApplying}
              >
                <RefreshCw className="h-4 w-4" />
                Apply Changes
              </PrimaryButton>
            </div>

            {/* Comparison rows */}
            <div className="max-h-[400px] space-y-2 overflow-auto p-4">
              <AnimatePresence mode="popLayout">
                {selectedRecommendation?.weights.map((weight) => (
                  <AllocationRow
                    key={weight.ticker}
                    ticker={weight.ticker}
                    companyName={weight.companyName}
                    sector={weight.sector}
                    currentWeight={weight.currentWeight}
                    targetWeight={weight.targetWeight}
                    deltaWeight={weight.deltaWeight}
                  />
                ))}
              </AnimatePresence>
            </div>
          </PremiumPanel>
        </motion.div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Expected Metrics */}
          <motion.div variants={staggerChild}>
            <PremiumPanel title="Expected Metrics">
              {selectedRecommendation && (
                <div className="grid grid-cols-2 gap-3">
                  <NestedCard className="p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                      Return
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-400">
                      {selectedRecommendation.expected.annualReturn != null
                        ? formatPercent(selectedRecommendation.expected.annualReturn)
                        : "—"}
                    </p>
                  </NestedCard>
                  <NestedCard className="p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                      Volatility
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                      {selectedRecommendation.expected.annualVolatility != null
                        ? formatPercent(selectedRecommendation.expected.annualVolatility)
                        : "—"}
                    </p>
                  </NestedCard>
                  <NestedCard className="p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                      Sharpe
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                      {selectedRecommendation.expected.sharpe?.toFixed(2) ?? "—"}
                    </p>
                  </NestedCard>
                  <NestedCard className="p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                      VaR 95%
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-rose-400">
                      {selectedRecommendation.expected.var95 != null
                        ? formatPercent(selectedRecommendation.expected.var95)
                        : "—"}
                    </p>
                  </NestedCard>
                </div>
              )}
            </PremiumPanel>
          </motion.div>

          {/* Rebalance Commands */}
          <motion.div variants={staggerChild}>
            <PremiumPanel title="Rebalance Actions">
              {selectedRecommendation && (
                <RebalanceCommandList
                  weights={selectedRecommendation.weights}
                  portfolioValue={portfolioValue}
                />
              )}
            </PremiumPanel>
          </motion.div>

          {/* Insights */}
          {recommendations.insights.length > 0 && (
            <motion.div variants={staggerChild}>
              <PremiumPanel title="Insights">
                <InsightsList insights={recommendations.insights} />
              </PremiumPanel>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
