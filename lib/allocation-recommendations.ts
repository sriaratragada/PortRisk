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

type ObjectiveAnchors = {
  currentWeights: number[];
  conservativeAnchor: number[];
  growthAnchor: number[];
};

type OptimizationConstraints = {
  singleCap: number;
  sectorCap: number;
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

function projectWeights(
  weights: number[],
  sectors: string[],
  constraints: OptimizationConstraints
) {
  let next = weights.map((value) => clamp(value, 0, constraints.singleCap));

  const applySectorCaps = () => {
    const sectorTotals = new Map<string, number>();
    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + (next[index] ?? 0));
    }

    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      const sectorTotal = sectorTotals.get(sector) ?? 0;
      if (sectorTotal > constraints.sectorCap + 1e-9) {
        const factor = constraints.sectorCap / sectorTotal;
        next[index] = (next[index] ?? 0) * factor;
      }
    }
  };

  applySectorCaps();
  next = next.map((value) => clamp(value, 0, constraints.singleCap));

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
      const singleHeadroom = constraints.singleCap - (next[index] ?? 0);
      const sectorHeadroom = constraints.sectorCap - (sectorTotals.get(sector) ?? 0);
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
  next = next.map((value) => clamp(value, 0, constraints.singleCap));

  // Force a deterministic sum of 1 whenever feasible under constraints.
  let finalRemainder = 1 - next.reduce((sum, value) => sum + value, 0);
  if (Math.abs(finalRemainder) > 1e-9) {
    const sectorTotals = new Map<string, number>();
    for (let index = 0; index < next.length; index += 1) {
      const sector = sectors[index] ?? "ETFs / Funds / Other";
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + (next[index] ?? 0));
    }

    if (finalRemainder > 0) {
      for (let index = 0; index < next.length && finalRemainder > 1e-9; index += 1) {
        const sector = sectors[index] ?? "ETFs / Funds / Other";
        const singleHeadroom = constraints.singleCap - (next[index] ?? 0);
        const sectorHeadroom = constraints.sectorCap - (sectorTotals.get(sector) ?? 0);
        const add = Math.min(finalRemainder, Math.max(0, Math.min(singleHeadroom, sectorHeadroom)));
        if (add > 0) {
          next[index] = (next[index] ?? 0) + add;
          sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + add);
          finalRemainder -= add;
        }
      }
    } else {
      let excess = Math.abs(finalRemainder);
      for (let index = 0; index < next.length && excess > 1e-9; index += 1) {
        const remove = Math.min(excess, next[index] ?? 0);
        if (remove > 0) {
          next[index] = (next[index] ?? 0) - remove;
          excess -= remove;
        }
      }
    }
  }

  return next.map((value) => clamp(value, 0, constraints.singleCap));
}

function l1Distance(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + Math.abs(value - (right[index] ?? 0)), 0);
}

function buildReturnTiltSeed(
  expectedReturns: number[],
  sectors: string[],
  constraints: OptimizationConstraints
) {
  const seed = expectedReturns.map(() => 0);
  const ranked = expectedReturns
    .map((expectedReturn, index) => ({ expectedReturn, index }))
    .sort((left, right) => right.expectedReturn - left.expectedReturn);

  const sectorTotals = new Map<string, number>();
  let remainder = 1;
  for (const { index } of ranked) {
    if (remainder <= 1e-9) {
      break;
    }
    const sector = sectors[index] ?? "ETFs / Funds / Other";
    const sectorTotal = sectorTotals.get(sector) ?? 0;
    const headroom = Math.min(
      constraints.singleCap,
      constraints.sectorCap - sectorTotal
    );
    if (headroom <= 1e-9) {
      continue;
    }
    const allocation = Math.min(headroom, remainder);
    seed[index] = allocation;
    sectorTotals.set(sector, sectorTotal + allocation);
    remainder -= allocation;
  }

  return projectWeights(seed, sectors, constraints);
}

function maxFeasibleWeightTotal(
  sectors: string[],
  constraints: OptimizationConstraints
) {
  const sectorCounts = new Map<string, number>();
  for (const sector of sectors) {
    const key = sector || "ETFs / Funds / Other";
    sectorCounts.set(key, (sectorCounts.get(key) ?? 0) + 1);
  }
  return [...sectorCounts.values()].reduce(
    (sum, count) =>
      sum + Math.min(constraints.sectorCap, count * constraints.singleCap),
    0
  );
}

function resolveOptimizationConstraints(sectors: string[]) {
  const holdingCount = sectors.length;
  const sectorCount = new Set(
    sectors.map((sector) => sector || "ETFs / Funds / Other")
  ).size;

  let singleCap = Math.max(MAX_SINGLE_WEIGHT, 1 / Math.max(holdingCount, 1));
  let sectorCap = MAX_SECTOR_WEIGHT;
  let constraints: OptimizationConstraints = { singleCap, sectorCap };

  if (maxFeasibleWeightTotal(sectors, constraints) < 1 - 1e-9) {
    sectorCap = Math.max(sectorCap, 1 / Math.max(sectorCount, 1));
    constraints = { singleCap, sectorCap };
  }
  if (maxFeasibleWeightTotal(sectors, constraints) < 1 - 1e-9) {
    sectorCap = 1;
    constraints = { singleCap, sectorCap };
  }
  return constraints;
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
  metrics: MetricsSnapshot,
  weights: number[],
  anchors: ObjectiveAnchors
) {
  const sharpe = metrics.sharpe ?? -1;
  const annualReturn = metrics.annualReturn ?? -1;
  const annualVolatility = metrics.annualVolatility ?? 1;
  const concentrationPenalty = Math.max(0, metrics.topWeight - 0.2);
  const sectorPenalty = Math.max(0, metrics.topSectorWeight - 0.33);
  const distanceToConservative = l1Distance(weights, anchors.conservativeAnchor);
  const distanceToGrowth = l1Distance(weights, anchors.growthAnchor);
  const distanceToCurrent = l1Distance(weights, anchors.currentWeights);

  if (variant === "conservative") {
    return (
      sharpe * 0.45 -
      annualVolatility * 1.35 -
      metrics.turnover * 0.16 -
      concentrationPenalty * 0.7 -
      sectorPenalty * 0.55 -
      distanceToConservative * 0.25
    );
  }
  if (variant === "growth") {
    return (
      annualReturn * 1.45 +
      sharpe * 0.2 -
      annualVolatility * 0.3 -
      metrics.turnover * 0.06 -
      concentrationPenalty * 0.12 -
      distanceToGrowth * 0.1
    );
  }
  return (
    sharpe * 1.15 -
    annualVolatility * 0.35 -
    metrics.turnover * 0.14 -
    concentrationPenalty * 0.32 -
    sectorPenalty * 0.2 -
    distanceToCurrent * 0.05
  );
}

function localSearch(input: {
  seed: number[];
  variant: AllocationRecommendationVariant;
  anchors: ObjectiveAnchors;
  constraints: OptimizationConstraints;
  sectors: string[];
  currentWeights: number[];
  expectedReturns: number[];
  covarianceMatrix: number[][];
  returnsMatrix: number[][];
  benchmarkReturns: number[];
}) {
  let bestWeights = projectWeights(input.seed, input.sectors, input.constraints);
  let bestMetrics = evaluateWeights({
    weights: bestWeights,
    currentWeights: input.currentWeights,
    sectors: input.sectors,
    expectedReturns: input.expectedReturns,
    covarianceMatrix: input.covarianceMatrix,
    returnsMatrix: input.returnsMatrix,
    benchmarkReturns: input.benchmarkReturns
  });
  let bestScore = objectiveScore(input.variant, bestMetrics, bestWeights, input.anchors);

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
            const projected = projectWeights(
              next,
              input.sectors,
              input.constraints
            );
            const metrics = evaluateWeights({
              weights: projected,
              currentWeights: input.currentWeights,
              sectors: input.sectors,
              expectedReturns: input.expectedReturns,
              covarianceMatrix: input.covarianceMatrix,
              returnsMatrix: input.returnsMatrix,
              benchmarkReturns: input.benchmarkReturns
            });
            const score = objectiveScore(input.variant, metrics, projected, input.anchors);
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
  if (variant === "growth") return "Growth";
  return "Balanced";
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
  constraints: OptimizationConstraints;
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
    input.recommendation.weights.every(
      (row) => row.targetWeight <= input.constraints.singleCap + 1e-9
    ) && input.primary.topSectorWeight <= input.constraints.sectorCap + 1e-9;

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
  const constraints = resolveOptimizationConstraints(sectors);
  const feasibleCapacity = maxFeasibleWeightTotal(sectors, constraints);
  if (feasibleCapacity < 1 - 1e-6) {
    return {
      benchmark,
      range,
      recommendationState: "unavailable",
      model: {
        objective: "max_sharpe_v1",
        constraints: {
          longOnly: true,
          maxSingleWeight: constraints.singleCap,
          maxSectorWeight: constraints.sectorCap,
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
      insights: [
        {
          id: "constraints",
          label: "Constraint Status",
          value: "Infeasible",
          tone: "risk",
          description:
            "Current-holdings universe cannot satisfy 100% allocation under 25% single-name and 40% sector caps."
        }
      ],
      asOf,
      dataState,
      provider
    };
  }

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
  const conservativeAnchor = projectWeights(inverseVolSeed, sectors, constraints);
  const growthAnchor = buildReturnTiltSeed(expectedReturns, sectors, constraints);
  const anchors: ObjectiveAnchors = {
    currentWeights,
    conservativeAnchor,
    growthAnchor
  };

  const buildRecommendation = (
    variant: AllocationRecommendationVariant
  ): { weights: number[]; metrics: MetricsSnapshot } => {
    const seeds =
      variant === "conservative"
        ? [conservativeAnchor, currentWeights, equalSeed]
        : variant === "growth"
          ? [growthAnchor, currentWeights, equalSeed]
          : [currentWeights, equalSeed, conservativeAnchor];
    const candidates = seeds.map((seed) =>
      localSearch({
        seed,
        variant,
        anchors,
        constraints,
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
        objectiveScore(variant, right.metrics, right.weights, anchors) -
        objectiveScore(variant, left.metrics, left.weights, anchors)
    )[0]!;
  };

  const ensureVariantDistinct = (
    candidateWeights: number[],
    anchorWeights: number[]
  ) => {
    const blended = candidateWeights.map(
      (weight, index) => weight * 0.35 + (anchorWeights[index] ?? 0) * 0.65
    );
    return projectWeights(blended, sectors, constraints);
  };

  const buildCandidateForVariant = (
    variant: AllocationRecommendationVariant
  ) => buildRecommendation(variant);

  const variants: AllocationRecommendationVariant[] = ["primary", "conservative", "growth"];
  const candidateByVariant = new Map<
    AllocationRecommendationVariant,
    { weights: number[]; metrics: MetricsSnapshot }
  >();

  for (const variant of variants) {
    candidateByVariant.set(variant, buildCandidateForVariant(variant));
  }

  const primaryCandidate = candidateByVariant.get("primary")!;
  const conservativeCandidate = candidateByVariant.get("conservative")!;
  const growthCandidate = candidateByVariant.get("growth")!;

  if (l1Distance(primaryCandidate.weights, conservativeCandidate.weights) < 0.01) {
    const adjustedWeights = ensureVariantDistinct(
      conservativeCandidate.weights,
      conservativeAnchor
    );
    candidateByVariant.set("conservative", {
      weights: adjustedWeights,
      metrics: evaluateWeights({
        weights: adjustedWeights,
        currentWeights,
        sectors,
        expectedReturns,
        covarianceMatrix,
        returnsMatrix: alignedReturnsMatrix,
        benchmarkReturns: alignedBenchmarkReturns
      })
    });
  }

  if (l1Distance(primaryCandidate.weights, growthCandidate.weights) < 0.01) {
    const adjustedWeights = ensureVariantDistinct(growthCandidate.weights, growthAnchor);
    candidateByVariant.set("growth", {
      weights: adjustedWeights,
      metrics: evaluateWeights({
        weights: adjustedWeights,
        currentWeights,
        sectors,
        expectedReturns,
        covarianceMatrix,
        returnsMatrix: alignedReturnsMatrix,
        benchmarkReturns: alignedBenchmarkReturns
      })
    });
  }

  const recommendations: AllocationRecommendation[] = variants.map((variant) => {
    const candidate = candidateByVariant.get(variant)!;
    const targetTotal = candidate.weights.reduce((sum, weight) => sum + weight, 0);
    const normalizedCandidateWeights =
      Math.abs(targetTotal - 1) > 1e-8
        ? projectWeights(candidate.weights, sectors, constraints)
        : candidate.weights;
    const normalizedMetrics =
      Math.abs(targetTotal - 1) > 1e-8
        ? evaluateWeights({
            weights: normalizedCandidateWeights,
            currentWeights,
            sectors,
            expectedReturns,
            covarianceMatrix,
            returnsMatrix: alignedReturnsMatrix,
            benchmarkReturns: alignedBenchmarkReturns
          })
        : candidate.metrics;
    return {
      variant,
      label: buildRecommendationLabel(variant),
      objective: buildRecommendationObjective(variant),
      weights: sortedHoldings.map((holding, index) => ({
        ticker: holding.ticker,
        companyName: holding.companyName ?? holding.ticker,
        sector: sectors[index] ?? "ETFs / Funds / Other",
        currentWeight: currentWeights[index] ?? 0,
        targetWeight: normalizedCandidateWeights[index] ?? 0,
        deltaWeight: (normalizedCandidateWeights[index] ?? 0) - (currentWeights[index] ?? 0)
      })),
      expected: {
        annualReturn: normalizedMetrics.annualReturn,
        annualVolatility: normalizedMetrics.annualVolatility,
        sharpe: normalizedMetrics.sharpe,
        var95: normalizedMetrics.var95,
        betaToBenchmark: normalizedMetrics.betaToBenchmark,
        correlationToBenchmark: normalizedMetrics.correlationToBenchmark
      },
      diagnostics: {
        turnover: normalizedMetrics.turnover,
        topWeight: normalizedMetrics.topWeight,
        topSector: normalizedMetrics.topSector,
        topSectorWeight: normalizedMetrics.topSectorWeight,
        effectiveHoldings: normalizedMetrics.effectiveHoldings,
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
    recommendation: primaryRecommendation,
    constraints
  });

  return {
    benchmark,
    range,
    recommendationState: recommendations.length > 0 ? "available" : "unavailable",
    model: {
      objective: "max_sharpe_v1",
      constraints: {
        longOnly: true,
        maxSingleWeight: constraints.singleCap,
        maxSectorWeight: constraints.sectorCap,
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
