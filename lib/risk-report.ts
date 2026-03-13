import { fetchCompanyDetails, fetchHistoricalCloses } from "@/lib/market";
import { annualizeVolatility, computeDailyReturns } from "@/lib/risk";
import type { HoldingSnapshot, RiskMetrics, RiskReport } from "@/lib/types";

function formatName(name: string | undefined, ticker: string) {
  return name?.trim() || ticker;
}

export async function buildRiskReport(
  portfolioId: string,
  holdings: HoldingSnapshot[],
  metrics: RiskMetrics
): Promise<RiskReport> {
  const details = await fetchCompanyDetails(holdings.map((holding) => holding.ticker));
  const detailByTicker = new Map(details.map((detail) => [detail.ticker.toUpperCase(), detail]));

  const sectorWeights = new Map<string, number>();
  for (const holding of holdings) {
    const detail = detailByTicker.get(holding.ticker.toUpperCase());
    const sector = detail?.sector ?? "Unclassified";
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + (holding.weight ?? 0));
  }

  const sectorConcentration = [...sectorWeights.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((left, right) => right.weight - left.weight);

  const singleNameConcentration = holdings
    .map((holding) => {
      const detail = detailByTicker.get(holding.ticker.toUpperCase());
      return {
        ticker: holding.ticker,
        companyName: formatName(detail?.companyName ?? holding.companyName, holding.ticker),
        weight: holding.weight ?? 0
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 5);

  const benchmarkHistory = await fetchHistoricalCloses("SPY", 252);
  const benchmarkReturns = computeDailyReturns(benchmarkHistory.map((point) => point.close));
  const trailingReturn =
    benchmarkHistory.length > 1
      ? benchmarkHistory[benchmarkHistory.length - 1].close / benchmarkHistory[0].close - 1
      : 0;
  const volatility = annualizeVolatility(benchmarkReturns);
  const latestBenchmark = benchmarkHistory[benchmarkHistory.length - 1]?.close ?? 0;
  const avg200 =
    benchmarkHistory.length >= 200
      ? benchmarkHistory.slice(-200).reduce((sum, point) => sum + point.close, 0) / 200
      : latestBenchmark;
  const trend = latestBenchmark > avg200 * 1.02 ? "BULLISH" : latestBenchmark < avg200 * 0.98 ? "BEARISH" : "NEUTRAL";
  const marketContext = {
    benchmark: "SPY",
    trailingReturn,
    trend,
    volatility,
    summary:
      trend === "BULLISH"
        ? "The broad market is trading above its long trend, which supports risk appetite but can mask concentration risk."
        : trend === "BEARISH"
          ? "The broad market is below its long trend, so drawdowns can deepen quickly when concentration is high."
          : "The broad market is trendless, which increases the value of diversification and balance-sheet quality."
  } as const;

  const balanceSheetSignals: RiskReport["balanceSheetSignals"] = [];
  for (const holding of holdings) {
    const detail = detailByTicker.get(holding.ticker.toUpperCase());
    if (!detail) continue;

    const companyName = formatName(detail.companyName, holding.ticker);
    if ((detail.debtToEquity ?? 0) > 150) {
      balanceSheetSignals.push({
        ticker: holding.ticker,
        companyName,
        signal: "Debt-to-equity is elevated.",
        severity: "HIGH"
      });
    }
    if ((detail.currentRatio ?? 2) < 1) {
      balanceSheetSignals.push({
        ticker: holding.ticker,
        companyName,
        signal: "Current ratio is below 1.0, indicating tighter liquidity.",
        severity: "WATCH"
      });
    }
    if ((detail.revenueGrowth ?? 0) < 0 || (detail.earningsGrowth ?? 0) < 0) {
      balanceSheetSignals.push({
        ticker: holding.ticker,
        companyName,
        signal: "Revenue or earnings growth is negative.",
        severity: "WATCH"
      });
    }
    if ((detail.profitMargins ?? 0) < 0.05) {
      balanceSheetSignals.push({
        ticker: holding.ticker,
        companyName,
        signal: "Profit margins are thin versus market leaders.",
        severity: "INFO"
      });
    }
  }

  const vulnerabilities: string[] = [];
  const resilienceFactors: string[] = [];
  if (sectorConcentration[0] && sectorConcentration[0].weight > 0.4) {
    vulnerabilities.push(
      `${sectorConcentration[0].sector} accounts for ${Math.round(sectorConcentration[0].weight * 100)}% of the portfolio.`
    );
  }
  if (singleNameConcentration[0] && singleNameConcentration[0].weight > 0.2) {
    vulnerabilities.push(
      `${singleNameConcentration[0].ticker} is a large single-name position at ${Math.round(singleNameConcentration[0].weight * 100)}% weight.`
    );
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

  const summaryParts = [];
  summaryParts.push(
    `The portfolio is currently classified as ${metrics.riskTier.toLowerCase()} risk with a Sharpe ratio of ${metrics.sharpe.toFixed(2)} and a ${Math.round(metrics.maxDrawdown * 100)}% max drawdown.`
  );
  summaryParts.push(marketContext.summary);
  if (vulnerabilities.length > 0) {
    summaryParts.push(`Primary vulnerabilities: ${vulnerabilities.slice(0, 2).join(" ")}`);
  }
  if (resilienceFactors.length > 0) {
    summaryParts.push(`Offsets to that risk: ${resilienceFactors.slice(0, 2).join(" ")}`);
  }

  return {
    portfolioId,
    summary: summaryParts.join(" "),
    sectorConcentration,
    singleNameConcentration,
    marketContext,
    balanceSheetSignals: balanceSheetSignals.slice(0, 8),
    resilienceFactors,
    vulnerabilities
  };
}
