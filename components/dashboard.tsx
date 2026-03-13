"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@supabase/supabase-js";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { HoldingSnapshot, RiskMetrics, RiskTier } from "@/lib/types";

type AuditLogRow = {
  id: string;
  timestamp: string;
  actionType: string;
  riskTierBefore: string | null;
  riskTierAfter: string | null;
  metadata?: Record<string, unknown> | null;
};

type PortfolioViewModel = {
  id: string;
  name: string;
  valueHistory: { date: string; value: number; peak: number; drawdown: number }[];
  holdings: HoldingSnapshot[];
  metrics: RiskMetrics;
  auditLog: AuditLogRow[];
};

const tierStyles: Record<RiskTier, string> = {
  LOW: "bg-success/15 text-success ring-success/30",
  MODERATE: "bg-warning/15 text-warning ring-warning/30",
  ELEVATED: "bg-elevated/15 text-elevated ring-elevated/30",
  HIGH: "bg-danger/15 text-danger ring-danger/30"
};

const scenarios = [
  "2008 Financial Crisis",
  "2020 COVID Crash",
  "Rising Rate Environment",
  "Custom"
];

function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", tierStyles[tier])}>
      {tier}
    </span>
  );
}

function Panel({
  title,
  children,
  action
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-panel/80 p-6 shadow-panel backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricBar({ label, value, max = 1, format = "percent" }: { label: string; value: number; max?: number; format?: "percent" | "number" }) {
  const ratio = Math.min(Math.abs(value) / max, 1);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>{label}</span>
        <span className="font-mono">{format === "number" ? value.toFixed(2) : formatPercent(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-300" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function buildDrawdownSeries(valueHistory: PortfolioViewModel["valueHistory"]) {
  let peak = 0;
  return valueHistory.map((point) => {
    peak = Math.max(peak, point.value);
    return {
      ...point,
      peak,
      drawdown: point.value - peak
    };
  });
}

export function Dashboard({ initialPortfolio }: { initialPortfolio: PortfolioViewModel }) {
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [proposedWeights, setProposedWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialPortfolio.holdings.map((holding) => [holding.ticker, holding.weight ?? 0]))
  );
  const [stressScenario, setStressScenario] = useState("2008 Financial Crisis");
  const [stressResult, setStressResult] = useState<Record<string, unknown> | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return;
    }

    const supabase = createClient(url, key);
    const channel = supabase
      .channel(`portfolio:${portfolio.id}`)
      .on("broadcast", { event: "price-update" }, ({ payload }) => {
        setPortfolio((current) => ({
          ...current,
          holdings: payload.holdings ?? current.holdings,
          metrics: payload.metrics ?? current.metrics
        }));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [portfolio.id]);

  const currentWeightTotal = useMemo(
    () => Object.values(proposedWeights).reduce((sum, value) => sum + value, 0),
    [proposedWeights]
  );

  const proposedComparison = useMemo(() => {
    const normalized = currentWeightTotal === 0 ? proposedWeights : Object.fromEntries(
      Object.entries(proposedWeights).map(([ticker, value]) => [ticker, value / currentWeightTotal])
    );
    const currentValue = portfolio.metrics.portfolioValue;
    const holdings = portfolio.holdings.map((holding) => {
      const targetWeight = normalized[holding.ticker] ?? 0;
      const targetValue = currentValue * targetWeight;
      const shares = !holding.currentPrice ? 0 : targetValue / holding.currentPrice;
      return { ...holding, shares, weight: targetWeight, currentValue: targetValue };
    });
    const projectedVar = holdings.reduce(
      (sum, holding) => sum + (holding.weight ?? 0) * Math.abs(holding.dailyPnlPercent ?? 0),
      0
    );

    return {
      portfolioValue: currentValue,
      sharpe: portfolio.metrics.sharpe * (1 - projectedVar * 0.5),
      maxDrawdown: Math.min(0.7, portfolio.metrics.maxDrawdown + projectedVar * 0.4),
      var95: Math.min(0.5, portfolio.metrics.var95 + projectedVar * 0.25)
    };
  }, [currentWeightTotal, portfolio.holdings, portfolio.metrics, proposedWeights]);

  const proposedTier = useMemo<RiskTier>(() => {
    const sharpe = proposedComparison.sharpe;
    const maxDrawdown = proposedComparison.maxDrawdown;
    const var95 = proposedComparison.var95;
    if (sharpe > 1.5 && maxDrawdown < 0.1 && var95 < 0.05) return "LOW";
    if (sharpe >= 1 && sharpe <= 1.5 && maxDrawdown < 0.2 && var95 < 0.1) return "MODERATE";
    if (sharpe >= 0.5 && sharpe < 1 && maxDrawdown < 0.35 && var95 < 0.2) return "ELEVATED";
    return "HIGH";
  }, [proposedComparison]);

  const drawdownSeries = useMemo(
    () => buildDrawdownSeries(portfolio.valueHistory),
    [portfolio.valueHistory]
  );

  async function runStressTest() {
    startTransition(async () => {
      const response = await fetch("/api/stress", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          scenarioName: stressScenario
        })
      });

      const data = await response.json();
      setStressResult(data);
    });
  }

  async function commitAllocation() {
    const normalized = Object.fromEntries(
      Object.entries(proposedWeights).map(([ticker, weight]) => [ticker, weight / currentWeightTotal])
    );
    const positions = portfolio.holdings.map((holding) => {
      const targetValue = portfolio.metrics.portfolioValue * (normalized[holding.ticker] ?? 0);
      return {
        ticker: holding.ticker,
        shares: !holding.currentPrice ? 0 : targetValue / holding.currentPrice,
        avgCost: holding.avgCost,
        assetClass: holding.assetClass
      };
    });

    startTransition(async () => {
      await fetch(`/api/portfolio/${portfolio.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ positions })
      });
      const scoreResponse = await fetch("/api/risk/score", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ portfolioId: portfolio.id, persist: true })
      });
      const score = await scoreResponse.json();
      setPortfolio((current) => ({
        ...current,
        metrics: score.metrics ?? current.metrics
      }));
    });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <Panel
          title="Portfolio Overview"
          action={<TierBadge tier={portfolio.metrics.riskTier} />}
        >
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex items-end gap-3">
                <h1 className="text-4xl font-semibold tracking-tight">{formatCurrency(portfolio.metrics.portfolioValue)}</h1>
                <div className={cn("rounded-full px-3 py-1 text-sm", portfolio.holdings.reduce((sum, holding) => sum + (holding.dailyPnl ?? 0), 0) >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                  {formatCurrency(portfolio.holdings.reduce((sum, holding) => sum + (holding.dailyPnl ?? 0), 0))} / {formatPercent(portfolio.holdings.reduce((sum, holding) => sum + (holding.dailyPnlPercent ?? 0) * (holding.weight ?? 0), 0))}
                </div>
              </div>
              <p className="mt-3 max-w-xl text-sm text-slate-400">
                {portfolio.metrics.summary}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Sharpe</p>
                <p className="mt-3 text-3xl font-semibold">{portfolio.metrics.sharpe.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">VaR (95%)</p>
                <p className="mt-3 text-3xl font-semibold">{formatPercent(portfolio.metrics.var95)}</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Risk Metrics" action={<p className="text-xs text-slate-500">Live recalculation</p>}>
          <div className="space-y-4">
            <MetricBar label="Maximum Drawdown" value={portfolio.metrics.maxDrawdown} />
            <MetricBar label="Drawdown Probability (3m)" value={portfolio.metrics.drawdownProb3m} />
            <MetricBar label="Drawdown Probability (6m)" value={portfolio.metrics.drawdownProb6m} />
            <MetricBar label="Drawdown Probability (12m)" value={portfolio.metrics.drawdownProb12m} />
            <MetricBar label="Annualized Volatility" value={portfolio.metrics.annualizedVolatility} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title="Portfolio Value Chart">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={drawdownSeries}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} minTickGap={32} />
                <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Area type="monotone" dataKey="drawdown" fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" name="Drawdown" />
                <Line type="monotone" dataKey="peak" stroke="#f8fafc" dot={false} strokeWidth={1.5} name="Rolling Peak" />
                <Line type="monotone" dataKey="value" stroke="#0ea5e9" dot={false} strokeWidth={2.2} name="Portfolio Value" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Stress Testing" action={<TierBadge tier={(stressResult?.newRiskTier as RiskTier | undefined) ?? portfolio.metrics.riskTier} />}>
          <div className="space-y-4">
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm"
              value={stressScenario}
              onChange={(event) => setStressScenario(event.target.value)}
            >
              {scenarios.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </select>
            <button
              className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={runStressTest}
              disabled={isPending}
            >
              {isPending ? "Running..." : "Run Scenario"}
            </button>
            {stressResult ? (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Projected Value</span>
                  <span>{formatCurrency(Number(stressResult.projectedValue ?? 0))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Recovery Time</span>
                  <span>{stressResult.recoveryDays as number} days</span>
                </div>
                <p className="text-slate-300">{String(stressResult.summary ?? "")}</p>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Holdings Table">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {portfolio.holdings.map((holding) => (
                  <tr key={holding.ticker}>
                    <td className="py-4 font-medium">{holding.ticker}</td>
                    <td className="py-4">{holding.shares.toFixed(2)}</td>
                    <td className="py-4">{formatCurrency(holding.avgCost)}</td>
                    <td className="py-4">{formatCurrency(holding.currentPrice)}</td>
                    <td className="py-4">{formatCurrency(holding.currentValue)}</td>
                    <td className={cn("py-4", (holding.dailyPnl ?? 0) >= 0 ? "text-success" : "text-danger")}>
                      {formatCurrency(holding.dailyPnl)}
                    </td>
                    <td className="py-4">{formatPercent(holding.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Capital Allocation Modeler" action={<TierBadge tier={proposedTier} />}>
          <div className="space-y-5">
            {portfolio.holdings.map((holding) => (
              <div key={holding.ticker} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{holding.ticker}</span>
                  <span className="font-mono">{formatPercent(proposedWeights[holding.ticker] ?? 0)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={proposedWeights[holding.ticker] ?? 0}
                  onChange={(event) =>
                    setProposedWeights((current) => ({
                      ...current,
                      [holding.ticker]: Number(event.target.value)
                    }))
                  }
                  className="w-full accent-accent"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4 text-sm">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Current</p>
                <p>Sharpe {portfolio.metrics.sharpe.toFixed(2)}</p>
                <p>Max DD {formatPercent(portfolio.metrics.maxDrawdown)}</p>
                <p>VaR {formatPercent(portfolio.metrics.var95)}</p>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Proposed</p>
                <p>Sharpe {proposedComparison.sharpe.toFixed(2)}</p>
                <p>Max DD {formatPercent(proposedComparison.maxDrawdown)}</p>
                <p>VaR {formatPercent(proposedComparison.var95)}</p>
              </div>
            </div>
            <button
              className="w-full rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={commitAllocation}
              disabled={isPending || currentWeightTotal === 0}
            >
              Commit Allocation
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Audit Log">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="pb-3">Timestamp</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Tier Change</th>
                <th className="pb-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {portfolio.auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-4">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="py-4">{entry.actionType}</td>
                  <td className="py-4">
                    {entry.riskTierBefore ?? "N/A"} to {entry.riskTierAfter ?? "N/A"}
                  </td>
                  <td className="py-4 text-slate-400">
                    {entry.metadata ? JSON.stringify(entry.metadata).slice(0, 96) : "No metadata"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
