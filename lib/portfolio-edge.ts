import { createSupabaseAdminClient } from "@/lib/supabase";
import { fetchHistoricalCloses, fetchQuotes } from "@/lib/market";
import {
  buildHoldingSnapshots,
  buildPortfolioSeries,
  monteCarloDrawdownProbability,
  summarizeRiskDrivers,
  classifyRiskTier,
  calculateMaximumDrawdown,
  calculateSharpeRatio,
  calculateVaR95,
  computeDailyReturns
} from "@/lib/risk";
import type { PositionInput, RiskMetrics } from "@/lib/types";

export const STRESS_SCENARIOS: Record<
  string,
  { equities: number; bonds: number; commodities: number }
> = {
  "2008 Financial Crisis": { equities: -0.5, bonds: 0.1, commodities: -0.3 },
  "2020 COVID Crash": { equities: -0.34, bonds: 0.08, commodities: -0.2 },
  "Rising Rate Environment": { equities: -0.15, bonds: -0.2, commodities: 0.05 }
};

export async function getPortfolioWithPositionsEdge(portfolioId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("Portfolio")
    .select("id, userId, name, positions:Position(*)")
    .eq("id", portfolioId)
    .eq("userId", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as {
    id: string;
    userId: string;
    name: string;
    positions: Array<{
      ticker: string;
      shares: number;
      avgCost: number;
      assetClass: string;
    }>;
  };
}

export async function hydratePortfolioRisk(positions: PositionInput[], drawdownThreshold = 0.15) {
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const quotes = await fetchQuotes(tickers);
  const histories = await Promise.all(tickers.map((ticker) => fetchHistoricalCloses(ticker, 252)));
  const latestPrices = Object.fromEntries(quotes.map((quote) => [quote.ticker.toUpperCase(), quote.price]));
  const previousCloses = Object.fromEntries(
    quotes.map((quote) => [quote.ticker.toUpperCase(), quote.previousClose])
  );
  const historicalByTicker = Object.fromEntries(
    tickers.map((ticker, index) => [ticker, histories[index]])
  );

  const { series, metrics } = buildPortfolioSeries(positions, historicalByTicker, latestPrices);
  const holdings = buildHoldingSnapshots(positions, latestPrices, previousCloses);
  const dailyReturns = computeDailyReturns(series.map((point) => point.value));
  const probabilities = monteCarloDrawdownProbability(dailyReturns, drawdownThreshold);

  return {
    holdings,
    series,
    quotes,
    metrics: {
      ...metrics,
      drawdownProb3m: probabilities[63],
      drawdownProb6m: probabilities[126],
      drawdownProb12m: probabilities[252]
    } satisfies RiskMetrics
  };
}

export function scoreStressedPortfolio(
  positions: PositionInput[],
  basePrices: Record<string, number>,
  shocks: { equities: number; bonds: number; commodities: number }
) {
  const stressedPrices = Object.fromEntries(
    positions.map((position) => {
      const assetClass = position.assetClass ?? "equities";
      const shock = shocks[assetClass];
      const currentPrice = basePrices[position.ticker.toUpperCase()] ?? 0;
      return [position.ticker.toUpperCase(), currentPrice * (1 + shock)];
    })
  );

  const portfolioValue = positions.reduce(
    (sum, position) => sum + position.shares * (stressedPrices[position.ticker.toUpperCase()] ?? 0),
    0
  );

  const pseudoSeries = positions.map((position) => {
    const currentPrice = basePrices[position.ticker.toUpperCase()] ?? 0;
    const stressedPrice = stressedPrices[position.ticker.toUpperCase()] ?? currentPrice;
    return [currentPrice * 0.9, currentPrice, stressedPrice];
  });

  const aggregatedCloses = pseudoSeries[0]
    ? pseudoSeries[0].map((_, index) =>
        pseudoSeries.reduce((sum, item, pIndex) => sum + item[index] * positions[pIndex].shares, 0)
      )
    : [0, 0, 0];

  const dailyReturns = computeDailyReturns(aggregatedCloses);
  const { sharpe } = calculateSharpeRatio(dailyReturns);
  const maxDrawdown = calculateMaximumDrawdown(aggregatedCloses);
  const { var95 } = calculateVaR95(dailyReturns, portfolioValue);
  const riskTier = classifyRiskTier(sharpe, maxDrawdown, var95);

  return {
    projectedValue: portfolioValue,
    riskTier,
    estimatedMetrics: {
      sharpe,
      maxDrawdown,
      var95
    }
  };
}

export function estimateRecoveryDays(annualizedReturn: number, drawdown: number) {
  if (annualizedReturn <= 0) {
    return 365;
  }

  return Math.ceil((drawdown / annualizedReturn) * 252);
}

export function buildStressSummary(current: RiskMetrics, projectedValue: number, riskTier: string) {
  return summarizeRiskDrivers({
    sharpe: current.sharpe,
    maxDrawdown: Math.max(current.maxDrawdown, 1 - projectedValue / Math.max(current.portfolioValue, 1)),
    var95: current.var95,
    riskTier: riskTier as RiskMetrics["riskTier"]
  });
}
