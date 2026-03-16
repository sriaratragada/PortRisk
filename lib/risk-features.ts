import { fetchCompanyDetails, fetchHistoricalCloses } from "@/lib/market";
import { clamp } from "@/lib/utils";
import { annualizeVolatility, computeDailyReturns } from "@/lib/risk";
import { getDefaultSector, resolveSector } from "@/lib/sectors";
import type { HistoricalPoint, HoldingSnapshot, RiskMetrics, RiskReport } from "@/lib/types";

type PreviousScore = {
  riskTier: string | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  var95: number | null;
};

type RecentAction = {
  actionType: string;
  timestamp: string;
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values: Array<{ value: number | null | undefined; weight: number | null | undefined }>) {
  const valid = values.filter(
    (entry): entry is { value: number; weight: number } =>
      entry.value != null && Number.isFinite(entry.value) && entry.weight != null && entry.weight > 0
  );
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;
  return valid.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function scoreFromValue(value: number | null, min: number, max: number, invert = false) {
  if (value == null || !Number.isFinite(value)) return 50;
  const normalized = clamp((value - min) / Math.max(max - min, 1e-9), 0, 1);
  const score = invert ? 1 - normalized : normalized;
  return Math.round(score * 100);
}

function scoreBand(score: number): "Strong" | "Moderate" | "Weak" {
  if (score >= 67) return "Strong";
  if (score >= 34) return "Moderate";
  return "Weak";
}

function correlation(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;
  const leftSlice = left.slice(-length);
  const rightSlice = right.slice(-length);
  const leftMean = average(leftSlice);
  const rightMean = average(rightSlice);
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const leftDelta = leftSlice[index]! - leftMean;
    const rightDelta = rightSlice[index]! - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  if (leftVariance === 0 || rightVariance === 0) return 0;
  return numerator / Math.sqrt(leftVariance * rightVariance);
}

function beta(portfolioReturns: number[], benchmarkReturns: number[]) {
  const length = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (length < 2) return 0;
  const left = portfolioReturns.slice(-length);
  const right = benchmarkReturns.slice(-length);
  const leftMean = average(left);
  const rightMean = average(right);
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < length; index += 1) {
    covariance += (left[index]! - leftMean) * (right[index]! - rightMean);
    variance += (right[index]! - rightMean) ** 2;
  }
  return variance === 0 ? 0 : covariance / variance;
}

function currentDrawdown(series: HistoricalPoint[]) {
  let peak = 0;
  let latest = 0;
  for (const point of series) {
    peak = Math.max(peak, point.close);
    latest = point.close;
  }
  return peak === 0 ? 0 : Math.max(0, 1 - latest / peak);
}

function determineTrigger(recentActions: RecentAction[]) {
  const relevant = recentActions
    .slice(0, 8)
    .map((entry) => entry.actionType);
  const hasPositionChange = relevant.some((action) =>
    ["POSITION_ADDED", "POSITION_REMOVED", "POSITION_RESIZED", "ALLOCATION_COMMITTED"].includes(action)
  );
  const hasRiskRefresh = relevant.includes("RISK_SCORED");
  if (hasPositionChange && hasRiskRefresh) return "MIXED" as const;
  if (hasPositionChange) return "POSITION_CHANGE" as const;
  if (hasRiskRefresh) return "MARKET_MOVEMENT" as const;
  return "UNKNOWN" as const;
}

export async function buildRiskFeatureReport(
  portfolioId: string,
  holdings: HoldingSnapshot[],
  metrics: RiskMetrics,
  portfolioSeries: Array<{ date: string; value: number }>,
  options?: {
    previousScore?: PreviousScore | null;
    recentActions?: RecentAction[];
  }
): Promise<RiskReport> {
  const details = await fetchCompanyDetails(holdings.map((holding) => holding.ticker));
  const detailByTicker = new Map(details.map((detail) => [detail.ticker.toUpperCase(), detail]));

  const sectorWeights = new Map<string, number>();
  const industryWeights = new Map<string, number>();
  for (const holding of holdings) {
    const detail = detailByTicker.get(holding.ticker.toUpperCase());
    const sector = resolveSector({
      ticker: holding.ticker,
      providerSector: detail?.sector ?? holding.sector,
      providerIndustry: detail?.industry ?? holding.industry,
      assetClass: holding.assetClass
    });
    const industry = detail?.industry ?? holding.industry ?? "ETFs / Funds / Other";
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + (holding.weight ?? 0));
    industryWeights.set(industry, (industryWeights.get(industry) ?? 0) + (holding.weight ?? 0));
  }

  const sectorConcentration = [...sectorWeights.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((left, right) => right.weight - left.weight);
  const industryConcentration = [...industryWeights.entries()]
    .map(([industry, weight]) => ({ industry, weight }))
    .sort((left, right) => right.weight - left.weight);

  const singleNameConcentration = holdings
    .map((holding) => {
      const detail = detailByTicker.get(holding.ticker.toUpperCase());
      return {
        ticker: holding.ticker,
        companyName: detail?.companyName ?? holding.companyName ?? holding.ticker,
        weight: holding.weight ?? 0
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 5);

  const benchmarkHistory = await fetchHistoricalCloses("SPY", 252);
  if (benchmarkHistory.length < 60) {
    throw new Error("Benchmark history unavailable");
  }
  const benchmarkReturns = computeDailyReturns(benchmarkHistory.map((point) => point.close));
  const portfolioReturns = computeDailyReturns(portfolioSeries.map((point) => point.value));
  const benchmarkReturn =
    benchmarkHistory.length > 1
      ? benchmarkHistory[benchmarkHistory.length - 1]!.close / benchmarkHistory[0]!.close - 1
      : 0;
  const portfolioReturn =
    portfolioSeries.length > 1
      ? portfolioSeries[portfolioSeries.length - 1]!.value / portfolioSeries[0]!.value - 1
      : 0;
  const benchmarkVolatility = annualizeVolatility(benchmarkReturns);
  const latestBenchmark = benchmarkHistory[benchmarkHistory.length - 1]?.close ?? 0;
  const avg200 =
    benchmarkHistory.length >= 200
      ? benchmarkHistory.slice(-200).reduce((sum, point) => sum + point.close, 0) / 200
      : latestBenchmark;
  const trend =
    latestBenchmark > avg200 * 1.02 ? "BULLISH" : latestBenchmark < avg200 * 0.98 ? "BEARISH" : "NEUTRAL";

  const marketContext = {
    benchmark: "SPY",
    trailingReturn: benchmarkReturn,
    trend,
    volatility: benchmarkVolatility,
    summary:
      trend === "BULLISH"
        ? "The broad market remains above trend, which supports risk appetite but can disguise concentration build-up."
        : trend === "BEARISH"
          ? "The broad market is below trend, so crowded positions and leverage matter more."
          : "The broad market is range-bound, increasing the value of diversification and balance-sheet quality."
  } as const;

  const weightedDebt = weightedAverage(
    holdings.map((holding) => ({
      value: detailByTicker.get(holding.ticker.toUpperCase())?.debtToEquity ?? null,
      weight: holding.weight
    }))
  );
  const weightedLiquidity = weightedAverage(
    holdings.map((holding) => ({
      value: detailByTicker.get(holding.ticker.toUpperCase())?.currentRatio ?? null,
      weight: holding.weight
    }))
  );
  const weightedProfitability = weightedAverage(
    holdings.map((holding) => ({
      value: detailByTicker.get(holding.ticker.toUpperCase())?.profitMargins ?? null,
      weight: holding.weight
    }))
  );
  const weightedGrowth = weightedAverage(
    holdings.map((holding) => ({
      value:
        detailByTicker.get(holding.ticker.toUpperCase())?.revenueGrowth ??
        detailByTicker.get(holding.ticker.toUpperCase())?.earningsGrowth ??
        null,
      weight: holding.weight
    }))
  );

  const negativeReturns = portfolioReturns.filter((value) => value < 0);
  const downsideVolatility =
    negativeReturns.length > 0 ? annualizeVolatility(negativeReturns) : metrics.annualizedVolatility * 0.5;
  const hitRate = portfolioReturns.length > 0 ? portfolioReturns.filter((value) => value > 0).length / portfolioReturns.length : 0;
  const bestDay = portfolioReturns.length > 0 ? Math.max(...portfolioReturns) : 0;
  const worstDay = portfolioReturns.length > 0 ? Math.min(...portfolioReturns) : 0;
  const correlationToBenchmark = correlation(portfolioReturns, benchmarkReturns);
  const betaToBenchmark = beta(portfolioReturns, benchmarkReturns);
  const currentDrawdownValue = currentDrawdown(
    portfolioSeries.map((point) => ({ date: point.date, close: point.value }))
  );

  const balanceSheetSignals: RiskReport["balanceSheetSignals"] = [];
  for (const holding of holdings) {
    const detail = detailByTicker.get(holding.ticker.toUpperCase());
    if (!detail) continue;
    const companyName = detail.companyName ?? holding.companyName ?? holding.ticker;
    if ((detail.debtToEquity ?? 0) > 150) {
      balanceSheetSignals.push({ ticker: holding.ticker, companyName, signal: "Debt-to-equity is elevated.", severity: "HIGH" });
    }
    if ((detail.currentRatio ?? 2) < 1) {
      balanceSheetSignals.push({ ticker: holding.ticker, companyName, signal: "Current ratio is below 1.0, indicating tighter liquidity.", severity: "WATCH" });
    }
    if ((detail.revenueGrowth ?? 0) < 0 || (detail.earningsGrowth ?? 0) < 0) {
      balanceSheetSignals.push({ ticker: holding.ticker, companyName, signal: "Revenue or earnings growth is negative.", severity: "WATCH" });
    }
    if ((detail.profitMargins ?? 0) < 0.05) {
      balanceSheetSignals.push({ ticker: holding.ticker, companyName, signal: "Profit margins are thin versus market leaders.", severity: "INFO" });
    }
  }

  const qualityScores = {
    concentration: scoreFromValue((singleNameConcentration[0]?.weight ?? 0) + (sectorConcentration[0]?.weight ?? 0), 0.15, 0.8, true),
    liquidity: scoreFromValue(weightedLiquidity, 0.8, 2.5, false),
    balanceSheet: scoreFromValue(weightedDebt, 40, 220, true),
    profitability: scoreFromValue(weightedProfitability, 0.02, 0.3, false),
    growth: scoreFromValue(weightedGrowth, -0.1, 0.25, false),
    downsideRisk: scoreFromValue(metrics.var95 + metrics.maxDrawdown + currentDrawdownValue, 0.05, 0.6, true)
  };
  const qualityScoreDetails: RiskReport["qualityScoreDetails"] = {
    concentration: {
      score: qualityScores.concentration,
      band: scoreBand(qualityScores.concentration),
      summary:
        qualityScores.concentration >= 67
          ? "Diversification is broad enough that no single sleeve currently dominates overall exposure."
          : qualityScores.concentration >= 34
            ? "Exposure is somewhat concentrated in the top holdings or sectors, but not yet extreme."
            : "A small set of names or sectors is driving portfolio exposure, increasing concentration risk.",
      drivers: [
        `Top holding weight: ${Math.round((singleNameConcentration[0]?.weight ?? 0) * 100)}%.`,
        `Top sector weight: ${Math.round((sectorConcentration[0]?.weight ?? 0) * 100)}%.`,
        `Distinct sectors represented: ${sectorConcentration.filter((entry) => entry.sector !== getDefaultSector()).length}.`
      ]
    },
    liquidity: {
      score: qualityScores.liquidity,
      band: scoreBand(qualityScores.liquidity),
      summary:
        qualityScores.liquidity >= 67
          ? "Underlying companies show comparatively strong near-term balance-sheet liquidity."
          : qualityScores.liquidity >= 34
            ? "Liquidity indicators are mixed, with enough coverage to avoid a stress warning but not enough for a strong rating."
            : "Working-capital flexibility looks weak across the weighted holdings mix.",
      drivers: [
        `Weighted current ratio: ${weightedLiquidity != null ? weightedLiquidity.toFixed(2) : "N/A"}.`,
        `Fundamental coverage: ${Math.round(
          (holdings.filter((holding) => detailByTicker.get(holding.ticker.toUpperCase())?.currentRatio != null).length /
            Math.max(holdings.length, 1)) *
            100
        )}%.`,
        `Signals used: current ratio and quick ratio from company fundamentals.`
      ]
    },
    balanceSheet: {
      score: qualityScores.balanceSheet,
      band: scoreBand(qualityScores.balanceSheet),
      summary:
        qualityScores.balanceSheet >= 67
          ? "Leverage appears contained relative to the weighted holdings mix."
          : qualityScores.balanceSheet >= 34
            ? "Balance-sheet leverage is manageable but not uniformly conservative across holdings."
            : "Debt and leverage are elevated enough to weaken balance-sheet quality.",
      drivers: [
        `Weighted debt-to-equity: ${weightedDebt != null ? weightedDebt.toFixed(1) : "N/A"}.`,
        `High-leverage flags: ${balanceSheetSignals.filter((signal) => signal.signal.includes("Debt-to-equity")).length}.`,
        `Signals used: debt-to-equity, cash, debt, and liquidity ratios where available.`
      ]
    },
    profitability: {
      score: qualityScores.profitability,
      band: scoreBand(qualityScores.profitability),
      summary:
        qualityScores.profitability >= 67
          ? "Weighted margins and operating quality are supportive of resilience."
          : qualityScores.profitability >= 34
            ? "Profitability is mixed across the portfolio rather than consistently strong or weak."
            : "Thin margins or weak operating quality leave less room for error under pressure.",
      drivers: [
        `Weighted profit margin: ${weightedProfitability != null ? `${(weightedProfitability * 100).toFixed(1)}%` : "N/A"}.`,
        `Low-margin flags: ${balanceSheetSignals.filter((signal) => signal.signal.includes("Profit margins")).length}.`,
        `Signals used: net margins and return-on-equity where reported.`
      ]
    },
    growth: {
      score: qualityScores.growth,
      band: scoreBand(qualityScores.growth),
      summary:
        qualityScores.growth >= 67
          ? "Revenue and earnings trends are broadly supportive across the weighted holdings mix."
          : qualityScores.growth >= 34
            ? "Growth trends are mixed, with some positive trends offset by weaker names."
            : "Growth quality is weak enough to increase earnings and multiple-compression risk.",
      drivers: [
        `Weighted growth signal: ${weightedGrowth != null ? `${(weightedGrowth * 100).toFixed(1)}%` : "N/A"}.`,
        `Negative-growth flags: ${balanceSheetSignals.filter((signal) => signal.signal.includes("Revenue or earnings growth is negative")).length}.`,
        `Signals used: revenue growth and earnings growth from the latest reported data.`
      ]
    },
    downsideRisk: {
      score: qualityScores.downsideRisk,
      band: scoreBand(qualityScores.downsideRisk),
      summary:
        qualityScores.downsideRisk >= 67
          ? "Observed drawdown and downside behavior are relatively contained."
          : qualityScores.downsideRisk >= 34
            ? "Downside behavior is manageable but still exposed to volatility spikes."
            : "Drawdown and tail-risk behavior are severe enough to warrant close monitoring.",
      drivers: [
        `VaR (95%): ${Math.round(metrics.var95 * 100)}%.`,
        `Maximum drawdown: ${Math.round(metrics.maxDrawdown * 100)}%.`,
        `Current drawdown: ${Math.round(currentDrawdownValue * 100)}%.`
      ]
    }
  };

  const tickerHistories = await Promise.all(
    holdings.map(async (holding) => ({
      ticker: holding.ticker,
      series: await fetchHistoricalCloses(holding.ticker, 126).catch(() => [])
    }))
  );
  const topRiskContributors = tickerHistories
    .map(({ ticker, series }) => {
      const holding = holdings.find((entry) => entry.ticker === ticker)!;
      const returns = computeDailyReturns(series.map((point) => point.close));
      const volatility = annualizeVolatility(returns);
      const contribution = (holding.weight ?? 0) * volatility;
      return {
        ticker,
        companyName: detailByTicker.get(ticker)?.companyName ?? holding.companyName ?? ticker,
        contribution,
        reason:
          (holding.weight ?? 0) > 0.18
            ? "High weight concentration"
            : volatility > 0.45
              ? "Elevated realized volatility"
              : "Material exposure to portfolio variance"
      };
    })
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 5);

  const previousScore = options?.previousScore ?? null;
  const trigger = determineTrigger(options?.recentActions ?? []);
  const sharpeDelta = previousScore?.sharpe != null ? metrics.sharpe - previousScore.sharpe : null;
  const varDelta = previousScore?.var95 != null ? metrics.var95 - previousScore.var95 : null;
  const drawdownDelta =
    previousScore?.maxDrawdown != null ? metrics.maxDrawdown - previousScore.maxDrawdown : null;
  const riskTierChanged = previousScore?.riskTier != null ? previousScore.riskTier !== metrics.riskTier : false;
  const changeDiagnostics = {
    summary:
      previousScore == null
        ? "No prior score exists yet, so this snapshot becomes the baseline."
        : riskTierChanged
          ? `Risk tier changed from ${previousScore.riskTier} to ${metrics.riskTier}, primarily driven by ${trigger === "POSITION_CHANGE" ? "position changes" : trigger === "MARKET_MOVEMENT" ? "market movement" : "a mix of portfolio edits and market movement"}.`
          : `Risk tier is unchanged, but Sharpe moved ${sharpeDelta != null ? sharpeDelta.toFixed(2) : "0.00"} and VaR moved ${varDelta != null ? `${(varDelta * 100).toFixed(2)} bps` : "0.00 bps"}.`,
    trigger,
    sharpeDelta,
    varDelta,
    drawdownDelta,
    riskTierChanged
  } satisfies RiskReport["changeDiagnostics"];

  const exposureDiagnostics = {
    sectorCount: sectorConcentration.length,
    industryCount: industryConcentration.length,
    growthTilt: (weightedGrowth ?? 0) > 0.12 ? "HIGH" : (weightedGrowth ?? 0) > 0.03 ? "MODERATE" : "LOW",
    incomeTilt:
      weightedAverage(
        holdings.map((holding) => ({
          value: detailByTicker.get(holding.ticker.toUpperCase())?.dividendYield ?? null,
          weight: holding.weight
        }))
      ) ?? 0 > 0.025
        ? "HIGH"
        : (weightedAverage(
            holdings.map((holding) => ({
              value: detailByTicker.get(holding.ticker.toUpperCase())?.dividendYield ?? null,
              weight: holding.weight
            }))
          ) ?? 0) > 0.01
          ? "MODERATE"
          : "LOW",
    defensiveness:
      sectorConcentration[0]?.sector === "Utilities" || sectorConcentration[0]?.sector === "Consumer Defensive"
        ? "DEFENSIVE"
        : sectorConcentration[0]?.sector === "Technology" || sectorConcentration[0]?.sector === "Consumer Cyclical"
          ? "CYCLICAL"
          : "NEUTRAL"
  } satisfies RiskReport["exposureDiagnostics"];

  const vulnerabilities: string[] = [];
  const resilienceFactors: string[] = [];
  if (sectorConcentration[0] && sectorConcentration[0].weight > 0.4) {
    vulnerabilities.push(`${sectorConcentration[0].sector} accounts for ${Math.round(sectorConcentration[0].weight * 100)}% of the portfolio.`);
  }
  if (singleNameConcentration[0] && singleNameConcentration[0].weight > 0.2) {
    vulnerabilities.push(`${singleNameConcentration[0].ticker} is a large single-name position at ${Math.round(singleNameConcentration[0].weight * 100)}% weight.`);
  }
  if (metrics.var95 > 0.1) {
    vulnerabilities.push("One-day downside risk is elevated relative to a moderate risk mandate.");
  }
  if (metrics.sharpe > 1.2) {
    resilienceFactors.push("Risk-adjusted return quality has been favorable over the trailing period.");
  }
  if (metrics.maxDrawdown < 0.15) {
    resilienceFactors.push("Historical drawdowns have remained relatively contained.");
  }
  if (sectorConcentration.length >= 3 && sectorConcentration[0].weight < 0.35) {
    resilienceFactors.push("Sector exposure is reasonably diversified across the book.");
  }

  const summaryParts = [
    `The portfolio is currently classified as ${metrics.riskTier.toLowerCase()} risk with a Sharpe ratio of ${metrics.sharpe.toFixed(2)} and a ${Math.round(metrics.maxDrawdown * 100)}% max drawdown.`,
    marketContext.summary
  ];
  if (vulnerabilities.length > 0) summaryParts.push(`Primary vulnerabilities: ${vulnerabilities.slice(0, 2).join(" ")}`);
  if (resilienceFactors.length > 0) summaryParts.push(`Offsets to that risk: ${resilienceFactors.slice(0, 2).join(" ")}`);

  const fundamentalsCoverage = details.length / Math.max(holdings.length, 1);
  const priceCoverage = holdings.filter((holding) => holding.currentPrice != null).length / Math.max(holdings.length, 1);
  const confidenceOverall =
    fundamentalsCoverage > 0.8 && priceCoverage > 0.9
      ? "HIGH"
      : fundamentalsCoverage > 0.45 || priceCoverage > 0.6
        ? "MEDIUM"
        : "LOW";

  return {
    portfolioId,
    summary: summaryParts.join(" "),
    marketDataState: "live",
    historySufficient: portfolioSeries.length >= 60,
    historyCoverageDays: portfolioSeries.length,
    sectorConcentration,
    singleNameConcentration,
    marketContext,
    balanceSheetSignals: balanceSheetSignals.slice(0, 8),
    industryConcentration: industryConcentration.slice(0, 5),
    qualityScores,
    qualityScoreDetails,
    returnDiagnostics: {
      realizedVolatility: metrics.annualizedVolatility,
      downsideVolatility,
      hitRate,
      bestDay,
      worstDay,
      currentDrawdown: currentDrawdownValue,
      betaToBenchmark,
      correlationToBenchmark
    },
    benchmarkComparison: {
      benchmark: "SPY",
      portfolioReturn,
      benchmarkReturn,
      excessReturn: portfolioReturn - benchmarkReturn
    },
    exposureDiagnostics,
    topRiskContributors,
    scenarioMatrix: [
      { name: "Growth shock", impact: -(metrics.var95 * 1.4 + (singleNameConcentration[0]?.weight ?? 0) * 0.12), severity: metrics.var95 > 0.1 ? "HIGH" : "MODERATE" },
      { name: "Rate spike", impact: -(metrics.annualizedVolatility * 0.15 + (sectorConcentration[0]?.sector === "Utilities" ? 0.08 : 0.04)), severity: metrics.annualizedVolatility > 0.25 ? "MODERATE" : "LOW" },
      { name: "Liquidity squeeze", impact: -(currentDrawdownValue * 0.6 + (weightedLiquidity != null && weightedLiquidity < 1.1 ? 0.09 : 0.04)), severity: (weightedLiquidity ?? 2) < 1.1 ? "HIGH" : "MODERATE" }
    ],
    changeDiagnostics,
    dataConfidence: {
      overall: confidenceOverall,
      fundamentalsCoverage,
      priceCoverage
    },
    resilienceFactors,
    vulnerabilities
  };
}
