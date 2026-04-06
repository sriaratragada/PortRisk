"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  AlertTriangle,
  ArrowRight,
  Clock,
  Play,
  TrendingDown,
  Zap
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { RiskTier, RiskMetrics } from "@/lib/types";
import {
  PremiumPanel,
  NestedCard,
  TierBadge,
  PrimaryButton,
  SecondaryButton,
  staggerContainer,
  staggerChild
} from "./premium-components";
import { SegmentedControl } from "./pill-navigation";

type StressResult = {
  scenario: string;
  projectedValue: number;
  valueChange: number;
  percentChange: number;
  recoveryDays: number;
  newRiskTier: RiskTier;
  summary: string;
  impactByHolding?: Array<{
    ticker: string;
    impact: number;
    percentImpact: number;
  }>;
};

type StressTabProps = {
  currentValue: number;
  currentTier: RiskTier | null;
  scenarios: string[];
  onRunScenario: (scenario: string) => Promise<StressResult>;
  stressResults: StressResult[];
};

const scenarioDescriptions: Record<string, string> = {
  "2008 Financial Crisis": "Simulates a severe market crash similar to the 2008 global financial crisis with significant drawdowns across all asset classes.",
  "2020 COVID Crash": "Models the rapid market selloff experienced during the March 2020 pandemic panic, followed by recovery patterns.",
  "Rising Rate Environment": "Projects portfolio impact from sustained interest rate increases affecting growth and duration-sensitive holdings.",
  "Tech Selloff": "Simulates a concentrated selloff in technology stocks similar to early 2022 market conditions.",
  "Stagflation": "Models a scenario with persistent inflation combined with economic stagnation.",
  "Custom": "Define your own stress parameters for bespoke scenario analysis."
};

// Scenario card for selection
function ScenarioCard({
  name,
  description,
  isSelected,
  onSelect,
  isRunning
}: {
  name: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
  isRunning: boolean;
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onSelect}
      disabled={isRunning}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all duration-200",
        isSelected
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-white/[0.06] bg-black/20 hover:border-white/[0.12] hover:bg-white/[0.02]",
        isRunning && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isSelected ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.06] text-zinc-500"
        )}>
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-white">{name}</h4>
          <p className="mt-1 text-sm text-zinc-500 line-clamp-2">{description}</p>
        </div>
      </div>
    </motion.button>
  );
}

// Result visualization
function StressResultCard({
  result,
  currentValue,
  currentTier
}: {
  result: StressResult;
  currentValue: number;
  currentTier: RiskTier | null;
}) {
  const isNegative = result.valueChange < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      {/* Summary */}
      <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/50 via-zinc-900/20 to-zinc-950/50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
              Scenario Result
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {result.scenario}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {currentTier && (
              <>
                <TierBadge tier={currentTier} size="sm" />
                <ArrowRight className="h-4 w-4 text-zinc-500" />
              </>
            )}
            <TierBadge tier={result.newRiskTier} />
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
          {result.summary}
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <NestedCard className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Projected Value
          </p>
          <p className={cn(
            "mt-2 font-mono text-2xl font-semibold tabular-nums",
            isNegative ? "text-rose-400" : "text-emerald-400"
          )}>
            {formatCurrency(result.projectedValue)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {isNegative ? "" : "+"}{formatCurrency(result.valueChange)} ({isNegative ? "" : "+"}{formatPercent(result.percentChange)})
          </p>
        </NestedCard>

        <NestedCard className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Estimated Recovery
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-white">
            {result.recoveryDays} days
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Based on historical patterns
          </p>
        </NestedCard>

        <NestedCard className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Peak Drawdown
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-rose-400">
            {formatPercent(result.percentChange)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Maximum portfolio decline
          </p>
        </NestedCard>
      </div>

      {/* Impact by holding */}
      {result.impactByHolding && result.impactByHolding.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white">Impact by Holding</h4>
          <div className="space-y-2">
            {result.impactByHolding.slice(0, 5).map((holding) => (
              <div
                key={holding.ticker}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] font-mono text-xs font-bold text-white">
                    {holding.ticker.slice(0, 2)}
                  </div>
                  <span className="font-mono text-sm text-white">{holding.ticker}</span>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-mono text-sm font-medium tabular-nums",
                    holding.impact < 0 ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {holding.impact >= 0 ? "+" : ""}{formatCurrency(holding.impact)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {holding.percentImpact >= 0 ? "+" : ""}{formatPercent(holding.percentImpact)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Historical results chart
function HistoricalResultsChart({
  results
}: {
  results: StressResult[];
}) {
  const data = results.map((r) => ({
    scenario: r.scenario.split(" ")[0],
    impact: r.percentChange * 100,
    recovery: r.recoveryDays
  }));

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="impactGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="scenario"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              return (
                <div className="rounded-lg border border-white/[0.08] bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur-xl">
                  <p className="text-sm font-medium text-white">
                    {payload[0].payload.scenario}
                  </p>
                  <p className="text-xs text-rose-400">
                    Impact: {payload[0].payload.impact.toFixed(1)}%
                  </p>
                  <p className="text-xs text-zinc-400">
                    Recovery: {payload[0].payload.recovery} days
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="impact"
            stroke="#f43f5e"
            strokeWidth={2}
            fill="url(#impactGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StressTab({
  currentValue,
  currentTier,
  scenarios,
  onRunScenario,
  stressResults
}: StressTabProps) {
  const [selectedScenario, setSelectedScenario] = useState(scenarios[0] || "");
  const [isRunning, setIsRunning] = useState(false);
  const [activeResult, setActiveResult] = useState<StressResult | null>(
    stressResults[0] || null
  );

  const handleRunScenario = async () => {
    if (!selectedScenario || isRunning) return;

    setIsRunning(true);
    try {
      const result = await onRunScenario(selectedScenario);
      setActiveResult(result);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-[0.4fr_0.6fr]">
        {/* Scenario Selection */}
        <motion.div variants={staggerChild}>
          <PremiumPanel
            title="Stress Scenarios"
            subtitle="Select a scenario to test"
            className="h-full"
          >
            <div className="space-y-3">
              {scenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario}
                  name={scenario}
                  description={scenarioDescriptions[scenario] || "Custom stress scenario"}
                  isSelected={selectedScenario === scenario}
                  onSelect={() => setSelectedScenario(scenario)}
                  isRunning={isRunning}
                />
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <PrimaryButton
                onClick={handleRunScenario}
                disabled={!selectedScenario || isRunning}
                isLoading={isRunning}
                className="w-full"
              >
                {isRunning ? (
                  "Running Analysis..."
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Scenario
                  </>
                )}
              </PrimaryButton>
            </div>
          </PremiumPanel>
        </motion.div>

        {/* Results Panel */}
        <motion.div variants={staggerChild}>
          <PremiumPanel
            title="Scenario Results"
            action={activeResult && <TierBadge tier={activeResult.newRiskTier} />}
          >
            <AnimatePresence mode="wait">
              {activeResult ? (
                <StressResultCard
                  key={activeResult.scenario}
                  result={activeResult}
                  currentValue={currentValue}
                  currentTier={currentTier}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <div className="rounded-2xl bg-white/[0.04] p-6">
                    <TrendingDown className="h-12 w-12 text-zinc-600" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">
                    Run a stress test
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-zinc-500">
                    Select a scenario from the left and run the analysis to see
                    how your portfolio would perform under stress conditions.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </PremiumPanel>
        </motion.div>
      </div>

      {/* Historical Results */}
      {stressResults.length > 1 && (
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Historical Stress Tests">
            <HistoricalResultsChart results={stressResults} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stressResults.slice(0, 4).map((result) => (
                <button
                  key={result.scenario}
                  onClick={() => setActiveResult(result)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all duration-200",
                    activeResult?.scenario === result.scenario
                      ? "border-emerald-500/30 bg-emerald-500/[0.08]"
                      : "border-white/[0.06] bg-black/20 hover:border-white/[0.12]"
                  )}
                >
                  <p className="text-sm font-medium text-white line-clamp-1">
                    {result.scenario}
                  </p>
                  <p className={cn(
                    "mt-1 font-mono text-lg font-semibold tabular-nums",
                    result.percentChange < 0 ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {result.percentChange >= 0 ? "+" : ""}{formatPercent(result.percentChange)}
                  </p>
                </button>
              ))}
            </div>
          </PremiumPanel>
        </motion.div>
      )}
    </motion.div>
  );
}
