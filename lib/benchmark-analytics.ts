import { fetchCompanyDetails, fetchHistoricalSeriesResult } from "@/lib/market";
import { hydratePortfolioHistory } from "@/lib/portfolio-edge";
import { getDefaultSector, resolveSector } from "@/lib/sectors";
import { computeDailyReturns } from "@/lib/risk";
import type {
  BenchmarkAnalytics,
  ChartRange,
  HistoricalSeriesResult,
  HistoricalPoint,
  HoldingSnapshot,
  MarketDataProvider,
  MarketDataState,
  PositionInput
} from "@/lib/types";

type BenchmarkHoldingInput = {
  ticker: string;
  companyName: string;
  sector: string;
  shares: number;
  points: HistoricalPoint[];
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function alignSamples(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) {
    return { left: [], right: [] };
  }
  return {
    left: left.slice(-length),
    right: right.slice(-length)
  };
}

function calculateCorrelation(leftValues: number[], rightValues: number[]) {
  const { left, right } = alignSamples(leftValues, rightValues);
  if (left.length < 2) return null;

  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  if (leftVariance === 0 || rightVariance === 0) {
    return null;
  }

  return numerator / Math.sqrt(leftVariance * rightVariance);
}

function calculateBeta(portfolioReturns: number[], benchmarkReturns: number[]) {
  const { left, right } = alignSamples(portfolioReturns, benchmarkReturns);
  if (left.length < 2) return null;

  const leftMean = average(left);
  const rightMean = average(right);
  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < left.length; index += 1) {
    covariance += (left[index]! - leftMean) * (right[index]! - rightMean);
    variance += (right[index]! - rightMean) ** 2;
  }

  if (variance === 0) {
    return null;
  }

  return covariance / variance;
}

function calculateSeriesReturn(values: number[]) {
  if (values.length < 2) {
    return null;
  }
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first <= 0) {
    return null;
  }
  return last / first - 1;
}

function buildIndexSeries(
  portfolioSeries: Array<{ date: string; value: number }>,
  benchmarkSeries: HistoricalPoint[]
) {
  const length = Math.min(portfolioSeries.length, benchmarkSeries.length);
  if (length < 2) {
    return [] as Array<{ date: string; portfolioIndex: number; benchmarkIndex: number }>;
  }

  const portfolioSlice = portfolioSeries.slice(-length);
  const benchmarkSlice = benchmarkSeries.slice(-length);
  const portfolioBase = portfolioSlice[0]?.value ?? 0;
  const benchmarkBase = benchmarkSlice[0]?.close ?? 0;
  if (portfolioBase <= 0 || benchmarkBase <= 0) {
    return [] as Array<{ date: string; portfolioIndex: number; benchmarkIndex: number }>;
  }

  return portfolioSlice.map((point, index) => ({
    date: point.date,
    portfolioIndex: (point.value / portfolioBase) * 100,
    benchmarkIndex: ((benchmarkSlice[index]?.close ?? benchmarkBase) / benchmarkBase) * 100
  }));
}

function aggregateDataState(states: MarketDataState[]) {
  if (states.some((state) => state === "live")) {
    return "live" as const;
  }
  return "unavailable" as const;
}

function aggregateProvider(providers: Array<string | null | undefined>): MarketDataProvider {
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

export function buildBenchmarkAnalyticsFromData(input: {
  benchmark: string;
  portfolioSeries: Array<{ date: string; value: number }>;
  benchmarkSeries: HistoricalPoint[];
  holdings: BenchmarkHoldingInput[];
  dataState?: MarketDataState;
  asOf?: string | null;
  provider?: MarketDataProvider;
}): BenchmarkAnalytics {
  const portfolioValues = input.portfolioSeries.map((point) => point.value);
  const benchmarkValues = input.benchmarkSeries.map((point) => point.close);

  const portfolioReturn = calculateSeriesReturn(portfolioValues);
  const benchmarkReturn = calculateSeriesReturn(benchmarkValues);
  const portfolioReturns = computeDailyReturns(portfolioValues);
  const benchmarkReturns = computeDailyReturns(benchmarkValues);
  const correlation = calculateCorrelation(portfolioReturns, benchmarkReturns);
  const beta = calculateBeta(portfolioReturns, benchmarkReturns);

  const holdingRows = input.holdings
    .map((holding) => {
      const prices = holding.points.map((point) => point.close);
      const holdingReturn = calculateSeriesReturn(prices);
      const firstPrice = prices[0] ?? null;
      const startValue = firstPrice != null ? firstPrice * holding.shares : null;
      return {
        ticker: holding.ticker,
        companyName: holding.companyName,
        sector: holding.sector,
        startValue,
        holdingReturn
      };
    })
    .filter((holding) => holding.startValue != null && holding.holdingReturn != null);

  const totalStartValue = holdingRows.reduce((sum, holding) => sum + (holding.startValue ?? 0), 0);
  const holdingAttribution = holdingRows
    .map((holding) => {
      const startWeight = totalStartValue > 0 ? (holding.startValue ?? 0) / totalStartValue : null;
      const contribution =
        startWeight != null && holding.holdingReturn != null ? startWeight * holding.holdingReturn : null;
      return {
        ticker: holding.ticker,
        companyName: holding.companyName,
        sector: holding.sector,
        startWeight,
        holdingReturn: holding.holdingReturn,
        contribution
      };
    })
    .sort((left, right) => (right.contribution ?? -Infinity) - (left.contribution ?? -Infinity));

  const sectorMap = new Map<string, { weight: number; contribution: number }>();
  for (const row of holdingAttribution) {
    const current = sectorMap.get(row.sector) ?? { weight: 0, contribution: 0 };
    sectorMap.set(row.sector, {
      weight: current.weight + (row.startWeight ?? 0),
      contribution: current.contribution + (row.contribution ?? 0)
    });
  }

  const sectorAttribution = [...sectorMap.entries()]
    .map(([sector, values]) => ({
      sector,
      weight: values.weight,
      contribution: values.contribution
    }))
    .sort((left, right) => right.contribution - left.contribution);

  const topSector = sectorAttribution[0];
  const bottomSector = [...sectorAttribution].sort((left, right) => left.contribution - right.contribution)[0];
  const relativeNotes = [
    `Benchmark sector holdings are not exposed by Yahoo Finance for ${input.benchmark}, so this pass runs in return-only mode.`,
    topSector
      ? `${topSector.sector} is the largest sector exposure at ${(topSector.weight * 100).toFixed(1)}% of start-of-range value.`
      : `Sector contribution is unavailable, so the view falls back to ${getDefaultSector()} coverage.`,
    portfolioReturn != null && benchmarkReturn != null
      ? `Selected-range excess return is ${((portfolioReturn - benchmarkReturn) * 100).toFixed(2)}%.`
      : `Benchmark-relative return is unavailable until both portfolio and benchmark series load for the selected range.`
  ];
  if (bottomSector && bottomSector.sector !== topSector?.sector) {
    relativeNotes.push(
      `${bottomSector.sector} is the weakest sector contributor at ${(bottomSector.contribution * 100).toFixed(2)}%.`
    );
  }

  const chartSeries = buildIndexSeries(input.portfolioSeries, input.benchmarkSeries);

  return {
    benchmark: input.benchmark,
    portfolioReturn,
    benchmarkReturn,
    excessReturn:
      portfolioReturn != null && benchmarkReturn != null ? portfolioReturn - benchmarkReturn : null,
    trackingDifference:
      portfolioReturn != null && benchmarkReturn != null ? portfolioReturn - benchmarkReturn : null,
    correlation,
    beta,
    holdingAttribution,
    sectorAttribution,
    relativeNotes,
    relativeMode: "return_only",
    benchmarkAvailable: input.benchmarkSeries.length >= 2,
    benchmarkSectorDataAvailable: false,
    chartSeries,
    dataState: input.dataState ?? "unavailable",
    asOf: input.asOf ?? null,
    provider: input.provider ?? null
  };
}

export async function buildBenchmarkAnalytics(
  positions: PositionInput[],
  holdings: HoldingSnapshot[],
  benchmark: string,
  range: ChartRange
): Promise<BenchmarkAnalytics> {
  const normalizedBenchmark = benchmark.trim().toUpperCase();
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const [portfolioHistory, benchmarkHistory, details, holdingHistories] = await Promise.all([
    hydratePortfolioHistory(positions, range),
    fetchHistoricalSeriesResult(normalizedBenchmark, range).catch(
      (): HistoricalSeriesResult => ({
      symbol: normalizedBenchmark,
      range,
      points: [],
      dataState: "unavailable" as const,
      asOf: null,
      provider: null
      })
    ),
    fetchCompanyDetails(tickers).catch(() => []),
    Promise.all(
      positions.map(async (position) => ({
        ticker: position.ticker.toUpperCase(),
        shares: position.shares,
        history: await fetchHistoricalSeriesResult(position.ticker, range).catch(
          (): HistoricalSeriesResult => ({
            symbol: position.ticker.toUpperCase(),
            range,
            points: [],
            dataState: "unavailable" as const,
            asOf: null,
            provider: null
          })
        )
      }))
    )
  ]);

  const detailMap = new Map(details.map((detail) => [detail.ticker.toUpperCase(), detail]));
  const holdingMap = new Map(holdings.map((holding) => [holding.ticker.toUpperCase(), holding]));
  const attributionHoldings = holdingHistories.map(({ ticker, shares, history }) => {
    const detail = detailMap.get(ticker);
    const holding = holdingMap.get(ticker);
    return {
      ticker,
      companyName: detail?.companyName ?? holding?.companyName ?? ticker,
      sector: resolveSector({
        ticker,
        providerSector: detail?.sector ?? holding?.sector,
        providerIndustry: detail?.industry ?? holding?.industry,
        assetClass: holding?.assetClass
      }),
      shares,
      points: history.points
    };
  });

  return buildBenchmarkAnalyticsFromData({
    benchmark: normalizedBenchmark,
    portfolioSeries: portfolioHistory.series,
    benchmarkSeries: benchmarkHistory.points,
    holdings: attributionHoldings,
    dataState: aggregateDataState([portfolioHistory.dataState, benchmarkHistory.dataState]),
    asOf: aggregateAsOf([portfolioHistory.asOf, benchmarkHistory.asOf]),
    provider: aggregateProvider([portfolioHistory.provider, benchmarkHistory.provider])
  });
}
