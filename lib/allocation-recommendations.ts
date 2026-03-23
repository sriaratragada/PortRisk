import { fetchHistoricalSeriesResult } from "@/lib/market";
import type {
  AllocationInsight,
  AllocationRecommendation,
  AllocationRecommendationSet,
  AllocationRecommendationVariant,
  ChartRange,
  HistoricalSeriesResult,
  HoldingSnapshot,
  MarketDataProvider,
  MarketDataState,
  PositionInput
} from "@/lib/types";

const TRADING_DAYS = 252;
const RISK_FREE_RATE = 0.045;
const MAX_SINGLE_WEIGHT = 0.25;
const MAX_SECTOR_WEIGHT = 0.4;
const MIN_HISTORY_POINTS = 60;

type HistoryFetcher = (
  symbol: string,
  range: ChartRange
) => Promise<HistoricalSeriesResult>;

type MetricsSnapshot = {
  annualReturn: number | null;
  annualVolatility: number | null;
  sharpe: number | null;
  var95: number | null;
  betaToBenchmark: number | null;
  correlationToBenchmark: number | null;
  turnover: number;
  topWeight: number;
  topSector: string | null;
  topSectorWeight: number;
  effectiveHoldings: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeDailyReturns(closes: number[]) {
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous && previous > 0 && current && current > 0) {
      returns.push(current / previous - 1);
    }
  }
  return returns;
}

function covariance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;
  const leftSlice = left.slice(-length);
  const rightSlice = right.slice(-length);
  const leftMean = mean(leftSlice);
  const rightMean = mean(rightSlice);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += (leftSlice[index]! - leftMean) * (rightSlice[index]! - rightMean);
  }
  return total / (length - 1);
}

function correlation(left: number[], right: number[]) {
  const cov = covariance(left, right);
  const leftStd = standardDeviation(left);
  const rightStd = standardDeviation(right);
  if (leftStd === 0 || rightStd === 0) return null;
  return cov / (leftStd * rightStd);
}

function beta(portfolioReturns: number[], benchmarkReturns: number[]) {
  const variance = covariance(benchmarkReturns, benchmarkReturns);
  if (variance === 0) return null;
  return covariance(portfolioReturns, benchmarkReturns) / variance;
}

function normalizeWeights(weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const equalWeight = weights.length > 0 ? 1 / weights.length : 0;
    return weights.map(() => equalWeight);
  }
  return weights.map((value) => value / total);
}

function dot(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return total;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => dot(row, vector));
}

function projectWeights(weights: number[], sectors: string[]) {
  let next = weights.map((value) => clamp(value, 0, MAX_SINGLE_WEIGHT));

  const applySectorCaps = () => {
    const sectorTotals = new Map<string, number>();
    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + (next[index] ?? 0));
    }

    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      const sectorTotal = sectorTotals.get(sector) ?? 0;
      if (sectorTotal > MAX_SECTOR_WEIGHT + 1e-9) {
        const factor = MAX_SECTOR_WEIGHT / sectorTotal;
        next[index] = (next[index] ?? 0) * factor;
      }
    }
  };

  applySectorCaps();
  next = next.map((value) => clamp(value, 0, MAX_SINGLE_WEIGHT));

  let total = next.reduce((sum, value) => sum + value, 0);
  if (total > 1 + 1e-9) {
    const scale = 1 / total;
    next = next.map((value) => value * scale);
    total = 1;
  }

  let remainder = Math.max(0, 1 - total);
  for (let pass = 0; pass < 32 && remainder > 1e-9; pass += 1) {
    let progress = false;
    const sectorTotals = new Map<string, number>();
    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + (next[index] ?? 0));
    }

    for (let index = 0; index < next.length; index += 1) {
      if (remainder <= 1e-9) break;
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      const singleHeadroom = MAX_SINGLE_WEIGHT - (next[index] ?? 0);
      const sectorHeadroom = MAX_SECTOR_WEIGHT - (sectorTotals.get(sector) ?? 0);
      const headroom = Math.min(singleHeadroom, sectorHeadroom);
      if (headroom <= 1e-9) {
        continue;
      }
      const increment = Math.min(headroom, remainder);
      next[index] = (next[index] ?? 0) + increment;
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + increment);
      remainder -= increment;
      progress = true;
    }

    if (!progress) {
      break;
    }
  }

  applySectorCaps();
  return next.map((value) => clamp(value, 0, MAX_SINGLE_WEIGHT));
}

function buildSectorSnapshot(weights: number[], sectors: string[]) {
  const sectorTotals = new Map<string, number>();
  for (let index = 0; index < weights.length; index += 1) {
    const sector = sectors[index] ?? "ETFs / Funds / Other";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + (weights[index] ?? 0));
  }
  const sorted = [...sectorTotals.entries()].sort((left, right) => right[1] - left[1]);
  return {
    topSector: sorted[0]?.[0] ?? null,
    topSectorWeight: sorted[0]?.[1] ?? 0
  };
}

function evaluateWeights(input: {
  weights: number[];
  currentWeights: number[];
  sectors: string[];
  expectedReturns: number[];
  covarianceMatrix: number[][];
  returnsMatrix: number[][];
  benchmarkReturns: number[];
}): MetricsSnapshot {
  const annualReturn = dot(input.weights, input.expectedReturns);
  const matrixVector = multiplyMatrixVector(input.covarianceMatrix, input.weights);
  const variance = dot(input.weights, matrixVector);
  const annualVolatility = variance > 0 ? Math.sqrt(variance) : 0;
  const sharpe =
    annualVolatility > 0 ? (annualReturn - RISK_FREE_RATE) / annualVolatility : null;

  const portfolioDailyReturns = input.returnsMatrix[0]
    ? input.returnsMatrix[0].map((_, dayIndex) =>
        input.returnsMatrix.reduce(
          (sum, series, holdingIndex) => sum + (series[dayIndex] ?? 0) * (input.weights[holdingIndex] ?? 0),
          0
        )
      )
    : [];

  const dailyMean = mean(portfolioDailyReturns);
  const dailyStd = standardDeviation(portfolioDailyReturns);
  const var95 = Math.abs(dailyMean - 1.645 * dailyStd);
  const betaToBenchmark = beta(portfolioDailyReturns, input.benchmarkReturns);
  const correlationToBenchmark = correlation(portfolioDailyReturns, input.benchmarkReturns);
  const turnover =
    0.5 *
    input.weights.reduce(
      (sum, weight, index) => sum + Math.abs(weight - (input.currentWeights[index] ?? 0)),
      0
    );
  const topWeight = input.weights.length > 0 ? Math.max(...input.weights) : 0;
  const { topSector, topSectorWeight } = buildSectorSnapshot(input.weights, input.sectors);
  const effectiveHoldings =
    input.weights.length > 0
      ? 1 /
        Math.max(
          input.weights.reduce((sum, weight) => sum + weight ** 2, 0),
          1e-9
        )
      : 0;

  return {
    annualReturn: Number.isFinite(annualReturn) ? annualReturn : null,
    annualVolatility: Number.isFinite(annualVolatility) ? annualVolatility : null,
    sharpe: sharpe != null && Number.isFinite(sharpe) ? sharpe : null,
    var95: Number.isFinite(var95) ? var95 : null,
    betaToBenchmark:
      betaToBenchmark != null && Number.isFinite(betaToBenchmark) ? betaToBenchmark : null,
    correlationToBenchmark:
      correlationToBenchmark != null && Number.isFinite(correlationToBenchmark)
        ? correlationToBenchmark
        : null,
    turnover,
    topWeight,
    topSector,
    topSectorWeight,
    effectiveHoldings
  };
}

function objectiveScore(
  variant: AllocationRecommendationVariant,
  metrics: MetricsSnapshot
) {
  const sharpe = metrics.sharpe ?? -1;
  const annualReturn = metrics.annualReturn ?? -1;
  const annualVolatility = metrics.annualVolatility ?? 1;
  const concentrationPenalty = Math.max(0, metrics.topWeight - 0.2);
  if (variant === "conservative") {
    return sharpe - annualVolatility * 0.9 - metrics.turnover * 0.1;
  }
  if (variant === "growth") {
    return annualReturn - annualVolatility * 0.55 - concentrationPenalty * 0.2 - metrics.turnover * 0.08;
  }
  return sharpe - metrics.turnover * 0.15 - concentrationPenalty * 0.35;
}

function localSearch(input: {
  seed: number[];
  variant: AllocationRecommendationVariant;
  sectors: string[];
  currentWeights: number[];
  expectedReturns: number[];
  covarianceMatrix: number[][];
  returnsMatrix: number[][];
  benchmarkReturns: number[];
}) {
  let bestWeights = projectWeights(input.seed, input.sectors);
  let bestMetrics = evaluateWeights({
    weights: bestWeights,
    currentWeights: input.currentWeights,
    sectors: input.sectors,
    expectedReturns: input.expectedReturns,
    covarianceMatrix: input.covarianceMatrix,
    returnsMatrix: input.returnsMatrix,
    benchmarkReturns: input.benchmarkReturns
  });
  let bestScore = objectiveScore(input.variant, bestMetrics);

  const steps = [0.08, 0.04, 0.02, 0.01];
  for (const step of steps) {
    for (let round = 0; round < 18; round += 1) {
      let improved = false;
      for (let left = 0; left < bestWeights.length; left += 1) {
        for (let right = left + 1; right < bestWeights.length; right += 1) {
          const candidates = [
            { from: right, to: left },
            { from: left, to: right }
          ];
          for (const candidate of candidates) {
            if ((bestWeights[candidate.from] ?? 0) < step) {
              continue;
            }
            const next = [...bestWeights];
            next[candidate.to] = (next[candidate.to] ?? 0) + step;
            next[candidate.from] = (next[candidate.from] ?? 0) - step;
            const projected = projectWeights(next, input.sectors);
            const metrics = evaluateWeights({
              weights: projected,
              currentWeights: input.currentWeights,
              sectors: input.sectors,
              expectedReturns: input.expectedReturns,
              covarianceMatrix: input.covarianceMatrix,
              returnsMatrix: input.returnsMatrix,
              benchmarkReturns: input.benchmarkReturns
            });
            const score = objectiveScore(input.variant, metrics);
            if (score > bestScore + 1e-9) {
              bestWeights = projected;
              bestMetrics = metrics;
              bestScore = score;
              improved = true;
            }
          }
        }
      }
      if (!improved) {
        break;
      }
    }
  }

  return {
    weights: bestWeights,
    metrics: bestMetrics
  };
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

function buildRecommendationLabel(variant: AllocationRecommendationVariant) {
  if (variant === "conservative") return "Conservative";
  if (variant === "growth") return "Growth-Tilted";
  return "Balanced Max Sharpe";
}

function buildRecommendationObjective(variant: AllocationRecommendationVariant) {
  if (variant === "conservative") return "lower-volatility profile";
  if (variant === "growth") return "higher-return tilt with risk guardrails";
  return "max sharpe with turnover penalty";
}

function formatPercent(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function buildInsights(input: {
  benchmark: string;
  current: MetricsSnapshot;
  primary: MetricsSnapshot;
  recommendation: AllocationRecommendation;
}) {
  const volatilityDelta =
    input.primary.annualVolatility != null && input.current.annualVolatility != null
      ? input.primary.annualVolatility - input.current.annualVolatility
      : null;
  const sharpeDelta =
    input.primary.sharpe != null && input.current.sharpe != null
      ? input.primary.sharpe - input.current.sharpe
      : null;
  const topWeightDelta = input.primary.topWeight - input.current.topWeight;
  const constraintsPassing =
    input.recommendation.weights.every((row) => row.targetWeight <= MAX_SINGLE_WEIGHT + 1e-9) &&
    input.primary.topSectorWeight <= MAX_SECTOR_WEIGHT + 1e-9;

  const insights: AllocationInsight[] = [
    {
      id: "expected-sharpe",
      label: "Expected Sharpe",
      value: input.primary.sharpe != null ? input.primary.sharpe.toFixed(2) : "N/A",
      tone: sharpeDelta != null && sharpeDelta >= 0 ? "positive" : "risk",
      description:
        sharpeDelta != null
          ? `Delta vs current: ${sharpeDelta >= 0 ? "+" : ""}${sharpeDelta.toFixed(2)}.`
          : "Current comparison unavailable."
    },
    {
      id: "volatility-delta",
      label: "Volatility Delta",
      value: volatilityDelta != null ? formatPercent(volatilityDelta) : "N/A",
      tone: volatilityDelta != null && volatilityDelta <= 0 ? "positive" : "risk",
      description: `Primary recommendation relative to current annualized volatility.`
    },
    {
      id: "turnover",
      label: "Turnover Required",
      value: formatPercent(input.primary.turnover),
      tone: input.primary.turnover <= 0.2 ? "positive" : "neutral",
      description: "Estimated rebalance turnover from current weights."
    },
    {
      id: "concentration",
      label: "Top Position Shift",
      value: formatPercent(topWeightDelta),
      tone: topWeightDelta <= 0 ? "positive" : "risk",
      description: "Change in highest single-name exposure."
    },
    {
      id: "benchmark",
      label: `Beta vs ${input.benchmark}`,
      value:
        input.primary.betaToBenchmark != null
          ? input.primary.betaToBenchmark.toFixed(2)
          : "N/A",
      tone: "neutral",
      description: "Estimated benchmark sensitivity from aligned daily returns."
    },
    {
      id: "constraints",
      label: "Constraint Status",
      value: constraintsPassing ? "Pass" : "Review",
      tone: constraintsPassing ? "positive" : "risk",
      description: "Checks long-only, max single-weight, and max sector-weight limits."
    }
  ];

  return insights;
}

export async function buildAllocationRecommendationSet(input: {
  positions: PositionInput[];
  holdings: HoldingSnapshot[];
  benchmark: string;
  range?: ChartRange;
  historyFetcher?: HistoryFetcher;
}): Promise<AllocationRecommendationSet> {
  const benchmark = input.benchmark.trim().toUpperCase();
  const range = input.range ?? "1Y";
  const sortedHoldings = [...input.holdings].sort((left, right) => left.ticker.localeCompare(right.ticker));
  if (sortedHoldings.length < 2) {
    return {
      benchmark,
      range,
      recommendationState: "insufficient_history",
      model: {
        objective: "max_sharpe_v1",
        constraints: {
          longOnly: true,
          maxSingleWeight: MAX_SINGLE_WEIGHT,
          maxSectorWeight: MAX_SECTOR_WEIGHT,
          universe: "current_holdings"
        }
      },
      current: {
        annualReturn: null,
        annualVolatility: null,
        sharpe: null,
        var95: null,
        betaToBenchmark: null,
        correlationToBenchmark: null,
        topWeight: null,
        topSector: null,
        topSectorWeight: null,
        effectiveHoldings: null
      },
      recommendations: [],
      insights: [],
      asOf: null,
      dataState: "unavailable",
      provider: null
    };
  }

  const tickerOrder = sortedHoldings.map((holding) => holding.ticker.toUpperCase());
  const fetchHistory = input.historyFetcher ?? fetchHistoricalSeriesResult;
  const [benchmarkHistory, holdingHistories] = await Promise.all([
    fetchHistory(benchmark, range).catch(() => ({
      symbol: benchmark,
      range,
      points: [],
      dataState: "unavailable" as const,
      asOf: null,
      provider: null
    })),
    Promise.all(
      tickerOrder.map(async (ticker) => ({
        ticker,
        history: await fetchHistory(ticker, range).catch(() => ({
          symbol: ticker,
          range,
          points: [],
          dataState: "unavailable" as const,
          asOf: null,
          provider: null
        }))
      }))
    )
  ]);

  const benchmarkReturns = computeDailyReturns(benchmarkHistory.points.map((point) => point.close));
  const benchmarkAnnualized = mean(benchmarkReturns) * TRADING_DAYS;
  const returnsMatrix = holdingHistories.map(({ history }) =>
    computeDailyReturns(history.points.map((point) => point.close))
  );
  const alignedLength = Math.min(
    benchmarkReturns.length,
    ...returnsMatrix.map((series) => series.length)
  );
  const dataCoverage =
    returnsMatrix.filter((series) => series.length >= MIN_HISTORY_POINTS).length /
    Math.max(returnsMatrix.length, 1);

  const dataState = aggregateDataState([
    benchmarkHistory.dataState,
    ...holdingHistories.map(({ history }) => history.dataState)
  ]);
  const provider = aggregateProvider([
    benchmarkHistory.provider,
    ...holdingHistories.map(({ history }) => history.provider)
  ]);
  const asOf = aggregateAsOf([
    benchmarkHistory.asOf,
    ...holdingHistories.map(({ history }) => history.asOf)
  ]);

  if (alignedLength < MIN_HISTORY_POINTS) {
    return {
      benchmark,
      range,
      recommendationState: "insufficient_history",
      model: {
        objective: "max_sharpe_v1",
        constraints: {
          longOnly: true,
          maxSingleWeight: MAX_SINGLE_WEIGHT,
          maxSectorWeight: MAX_SECTOR_WEIGHT,
          universe: "current_holdings"
        }
      },
      current: {
        annualReturn: null,
        annualVolatility: null,
        sharpe: null,
        var95: null,
        betaToBenchmark: null,
        correlationToBenchmark: null,
        topWeight: null,
        topSector: null,
        topSectorWeight: null,
        effectiveHoldings: null
      },
      recommendations: [],
      insights: [],
      asOf,
      dataState,
      provider
    };
  }

  const alignedBenchmarkReturns = benchmarkReturns.slice(-alignedLength);
  const alignedReturnsMatrix = returnsMatrix.map((series) => series.slice(-alignedLength));
  const expectedReturns = alignedReturnsMatrix.map(
    (series) => 0.6 * (mean(series) * TRADING_DAYS) + 0.4 * benchmarkAnnualized
  );
  const covarianceMatrix = alignedReturnsMatrix.map((leftSeries) =>
    alignedReturnsMatrix.map((rightSeries) => covariance(leftSeries, rightSeries) * TRADING_DAYS)
  );

  const currentWeights = normalizeWeights(
    sortedHoldings.map((holding) => (holding.weight != null ? holding.weight : 0))
  );
  const sectors = sortedHoldings.map((holding) => holding.sector ?? "ETFs / Funds / Other");
  const currentMetrics = evaluateWeights({
    weights: currentWeights,
    currentWeights,
    sectors,
    expectedReturns,
    covarianceMatrix,
    returnsMatrix: alignedReturnsMatrix,
    benchmarkReturns: alignedBenchmarkReturns
  });

  const inverseVolSeed = normalizeWeights(
    alignedReturnsMatrix.map((series) => {
      const vol = standardDeviation(series);
      return vol > 0 ? 1 / vol : 0;
    })
  );
  const equalSeed = normalizeWeights(alignedReturnsMatrix.map(() => 1));

  const buildRecommendation = (
    variant: AllocationRecommendationVariant
  ): { weights: number[]; metrics: MetricsSnapshot } => {
    const seeds = [currentWeights, equalSeed, inverseVolSeed];
    const candidates = seeds.map((seed) =>
      localSearch({
        seed,
        variant,
        sectors,
        currentWeights,
        expectedReturns,
        covarianceMatrix,
        returnsMatrix: alignedReturnsMatrix,
        benchmarkReturns: alignedBenchmarkReturns
      })
    );
    return candidates.sort(
      (left, right) =>
        objectiveScore(variant, right.metrics) - objectiveScore(variant, left.metrics)
    )[0]!;
  };

  const variants: AllocationRecommendationVariant[] = ["primary", "conservative", "growth"];
  const recommendations: AllocationRecommendation[] = variants.map((variant) => {
    const candidate = buildRecommendation(variant);
    return {
      variant,
      label: buildRecommendationLabel(variant),
      objective: buildRecommendationObjective(variant),
      weights: sortedHoldings.map((holding, index) => ({
        ticker: holding.ticker,
        companyName: holding.companyName ?? holding.ticker,
        sector: sectors[index] ?? "ETFs / Funds / Other",
        currentWeight: currentWeights[index] ?? 0,
        targetWeight: candidate.weights[index] ?? 0,
        deltaWeight: (candidate.weights[index] ?? 0) - (currentWeights[index] ?? 0)
      })),
      expected: {
        annualReturn: candidate.metrics.annualReturn,
        annualVolatility: candidate.metrics.annualVolatility,
        sharpe: candidate.metrics.sharpe,
        var95: candidate.metrics.var95,
        betaToBenchmark: candidate.metrics.betaToBenchmark,
        correlationToBenchmark: candidate.metrics.correlationToBenchmark
      },
      diagnostics: {
        turnover: candidate.metrics.turnover,
        topWeight: candidate.metrics.topWeight,
        topSector: candidate.metrics.topSector,
        topSectorWeight: candidate.metrics.topSectorWeight,
        effectiveHoldings: candidate.metrics.effectiveHoldings,
        dataCoverage
      }
    };
  });

  const primaryRecommendation = recommendations[0]!;
  const insights = buildInsights({
    benchmark,
    current: currentMetrics,
    primary: {
      ...primaryRecommendation.expected,
      turnover: primaryRecommendation.diagnostics.turnover,
      topWeight: primaryRecommendation.diagnostics.topWeight,
      topSector: primaryRecommendation.diagnostics.topSector,
      topSectorWeight: primaryRecommendation.diagnostics.topSectorWeight,
      effectiveHoldings: primaryRecommendation.diagnostics.effectiveHoldings
    },
    recommendation: primaryRecommendation
  });

  return {
    benchmark,
    range,
    recommendationState: recommendations.length > 0 ? "available" : "unavailable",
    model: {
      objective: "max_sharpe_v1",
      constraints: {
        longOnly: true,
        maxSingleWeight: MAX_SINGLE_WEIGHT,
        maxSectorWeight: MAX_SECTOR_WEIGHT,
        universe: "current_holdings"
      }
    },
    current: {
      annualReturn: currentMetrics.annualReturn,
      annualVolatility: currentMetrics.annualVolatility,
      sharpe: currentMetrics.sharpe,
      var95: currentMetrics.var95,
      betaToBenchmark: currentMetrics.betaToBenchmark,
      correlationToBenchmark: currentMetrics.correlationToBenchmark,
      topWeight: currentMetrics.topWeight,
      topSector: currentMetrics.topSector,
      topSectorWeight: currentMetrics.topSectorWeight,
      effectiveHoldings: currentMetrics.effectiveHoldings
    },
    recommendations,
    insights,
    asOf,
    dataState,
    provider
  };
}
