import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import {
  fetchCompanyDetails,
  fetchHistoricalSeriesResult,
  fetchQuotes
} from "@/lib/market";
import { resolveSector } from "@/lib/sectors";
import { STRESS_SCENARIOS } from "@/lib/stress-scenarios";
import {
  buildHoldingSnapshots,
  buildPortfolioSeries,
  summarizeRiskDrivers,
  classifyRiskTier,
  calculateMaximumDrawdown,
  calculateSharpeRatio,
  calculateVaR95,
  computeDailyReturns,
  monteCarloDrawdownProbability
} from "@/lib/risk";
import type {
  ChartRange,
  HistoricalSeriesResult,
  HoldingSnapshot,
  HydratedPortfolioRisk,
  MarketDataProvider,
  MarketDataState,
  PositionInput,
  RiskMetrics
} from "@/lib/types";

function aggregateDataState(states: MarketDataState[]) {
  if (states.length === 0 || states.every((state) => state === "unavailable")) {
    return "unavailable" as const;
  }
  return "live" as const;
}

function aggregateProvider(providers: Array<MarketDataProvider>) {
  return providers.some((provider) => provider === "Yahoo Finance") ? "Yahoo Finance" : null;
}

function aggregateAsOf(values: Array<string | null | undefined>) {
  const parsed = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value));
  if (parsed.length === 0) return null;
  return new Date(Math.min(...parsed)).toISOString();
}

function aggregatePortfolioSeriesFromHistory(
  positions: PositionInput[],
  historyResults: Record<string, HistoricalSeriesResult>
) {
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const lengths = tickers.map((ticker) => historyResults[ticker]?.points.length ?? 0);
  if (lengths.some((length) => length === 0)) {
    return { series: [], alignedLength: 0 };
  }

  const alignedLength = Math.min(...lengths);
  const series = Array.from({ length: alignedLength }, (_, index) => {
    let value = 0;
    let date = "";
    for (const position of positions) {
      const history = historyResults[position.ticker.toUpperCase()]?.points ?? [];
      const point = history[history.length - alignedLength + index];
      if (!point) {
        return null;
      }
      date = point.date;
      value += point.close * position.shares;
    }
    return { date, value };
  }).filter((point): point is { date: string; value: number } => point !== null);

  return { series, alignedLength };
}

export async function getPortfolioWithPositionsEdge(portfolioId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(userId, portfolioId)) {
    return null;
  }
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

export async function hydratePortfolioRisk(
  positions: PositionInput[],
  drawdownThreshold = 0.15
): Promise<HydratedPortfolioRisk> {
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const [quotes, details] = await Promise.all([
    fetchQuotes(tickers),
    fetchCompanyDetails(tickers).catch(() => [])
  ]);
  const quoteMap = Object.fromEntries(quotes.map((quote) => [quote.ticker.toUpperCase(), quote]));
  const detailMap = Object.fromEntries(details.map((detail) => [detail.ticker.toUpperCase(), detail]));
  const histories = await Promise.all(
    tickers.map(async (ticker) => ({
      ticker,
      history: await fetchHistoricalSeriesResult(ticker, "1Y").catch(() => ({
        symbol: ticker,
        range: "1Y" as const,
        points: [],
        dataState: "unavailable" as const,
        asOf: null,
        provider: null
      }))
    }))
  );
  const historyResultMap = Object.fromEntries(histories.map(({ ticker, history }) => [ticker, history]));

  const holdings: HoldingSnapshot[] = buildHoldingSnapshots(positions, quoteMap).map((holding) => {
    const detail = detailMap[holding.ticker.toUpperCase()];
    return detail
      ? {
          ...holding,
          companyName: detail.companyName ?? holding.companyName,
          exchange: detail.exchange ?? holding.exchange,
          sector: resolveSector({
            ticker: holding.ticker,
            providerSector: detail.sector ?? holding.sector,
            providerIndustry: detail.industry ?? holding.industry,
            assetClass: holding.assetClass
          }),
          industry: detail.industry ?? holding.industry
        }
      : {
          ...holding,
          sector: resolveSector({
            ticker: holding.ticker,
            providerSector: holding.sector,
            providerIndustry: holding.industry,
            assetClass: holding.assetClass
          })
        };
  });

  const latestPrices = Object.fromEntries(
    positions.map((position) => {
      const ticker = position.ticker.toUpperCase();
      const quotePrice = quoteMap[ticker]?.price;
      const history = historyResultMap[ticker]?.points ?? [];
      const fallbackClose = history[history.length - 1]?.close;
      return [ticker, quotePrice ?? fallbackClose ?? 0];
    })
  );
  const historicalByTicker = Object.fromEntries(
    tickers.map((ticker) => [ticker, historyResultMap[ticker]?.points ?? []])
  );
  const { series, alignedLength } = aggregatePortfolioSeriesFromHistory(positions, historyResultMap);
  const historySufficient = alignedLength >= 60;

  let metrics: RiskMetrics | null = null;
  if (historySufficient && series.length >= 60) {
    const built = buildPortfolioSeries(positions, historicalByTicker, latestPrices);
    const dailyReturns = computeDailyReturns(built.series.map((point) => point.value));
    const probabilities = monteCarloDrawdownProbability(dailyReturns, drawdownThreshold);
    metrics = {
      ...built.metrics,
      drawdownProb3m: probabilities[63],
      drawdownProb6m: probabilities[126],
      drawdownProb12m: probabilities[252]
    } satisfies RiskMetrics;
  }

  return {
    holdings,
    series,
    quotes,
    metrics,
    marketDataState: aggregateDataState(histories.map(({ history }) => history.dataState)),
    historySufficient,
    historyCoverageDays: alignedLength,
    asOf: aggregateAsOf(histories.map(({ history }) => history.asOf)),
    provider: aggregateProvider(histories.map(({ history }) => history.provider))
  };
}

export async function hydratePortfolioHistory(
  positions: PositionInput[],
  range: ChartRange
) {
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const histories = await Promise.all(
    tickers.map(async (ticker) => ({
      ticker,
      history: await fetchHistoricalSeriesResult(ticker, range).catch(() => ({
        symbol: ticker,
        range,
        points: [],
        dataState: "unavailable" as const,
        asOf: null,
        provider: null
      }))
    }))
  );
  const historyResultMap = Object.fromEntries(histories.map(({ ticker, history }) => [ticker, history]));
  const { series } = aggregatePortfolioSeriesFromHistory(positions, historyResultMap);

  return {
    series,
    dataState: aggregateDataState(histories.map(({ history }) => history.dataState)),
    asOf: aggregateAsOf(histories.map(({ history }) => history.asOf)),
    provider: aggregateProvider(histories.map(({ history }) => history.provider))
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
        pseudoSeries.reduce((sum, item, positionIndex) => sum + item[index] * positions[positionIndex]!.shares, 0)
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
