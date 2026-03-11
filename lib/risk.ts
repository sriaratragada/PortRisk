import type { HoldingSnapshot, HistoricalPoint, PositionInput, RiskMetrics, RiskTier } from "./types";

const RISK_FREE_RATE = 0.045;
const TRADING_DAYS = 252;

export function computeDailyReturns(closes: number[]) {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const previous = closes[i - 1];
    const current = closes[i];
    if (previous > 0 && current > 0) {
      returns.push(current / previous - 1);
    }
  }
  return returns;
}

export function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function annualizeReturns(dailyReturns: number[]) {
  return mean(dailyReturns) * TRADING_DAYS;
}

export function annualizeVolatility(dailyReturns: number[]) {
  return standardDeviation(dailyReturns) * Math.sqrt(TRADING_DAYS);
}

export function calculateSharpeRatio(dailyReturns: number[]) {
  const annualizedReturn = annualizeReturns(dailyReturns);
  const annualizedStd = annualizeVolatility(dailyReturns);
  const sharpe = annualizedStd === 0 ? 0 : (annualizedReturn - RISK_FREE_RATE) / annualizedStd;

  return { sharpe, annualizedReturn, annualizedStd };
}

export function calculateMaximumDrawdown(closes: number[]) {
  let peak = closes[0] ?? 0;
  let maxDrawdown = 0;

  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
    }
  }

  return Math.abs(maxDrawdown);
}

export function calculateVaR95(dailyReturns: number[], portfolioValue: number) {
  const avg = mean(dailyReturns);
  const std = standardDeviation(dailyReturns);
  const varReturn = Math.abs(avg - 1.645 * std);
  return {
    var95: varReturn,
    var95Amount: portfolioValue * varReturn
  };
}

function randomNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function monteCarloDrawdownProbability(
  dailyReturns: number[],
  drawdownThreshold: number,
  horizons = [63, 126, 252],
  paths = 1000
) {
  const drift = mean(dailyReturns);
  const volatility = standardDeviation(dailyReturns);
  const probabilities: Record<string, number> = {};

  for (const horizon of horizons) {
    let breaches = 0;

    for (let path = 0; path < paths; path += 1) {
      let value = 1;
      let peak = 1;
      let breached = false;

      for (let day = 0; day < horizon; day += 1) {
        const shock = randomNormal();
        value *= Math.exp(drift - 0.5 * volatility ** 2 + volatility * shock);
        peak = Math.max(peak, value);
        const drawdown = 1 - value / peak;
        if (drawdown >= drawdownThreshold) {
          breached = true;
          break;
        }
      }

      if (breached) {
        breaches += 1;
      }
    }

    probabilities[horizon] = breaches / paths;
  }

  return probabilities;
}

export function classifyRiskTier(sharpe: number, maxDrawdown: number, var95: number): RiskTier {
  if (sharpe > 1.5 && maxDrawdown < 0.1 && var95 < 0.05) {
    return "LOW";
  }
  if (sharpe >= 1 && sharpe <= 1.5 && maxDrawdown < 0.2 && var95 < 0.1) {
    return "MODERATE";
  }
  if (sharpe >= 0.5 && sharpe < 1 && maxDrawdown < 0.35 && var95 < 0.2) {
    return "ELEVATED";
  }
  return "HIGH";
}

export function summarizeRiskDrivers(metrics: Pick<RiskMetrics, "sharpe" | "maxDrawdown" | "var95" | "riskTier">) {
  const drivers = [];
  if (metrics.sharpe < 1) drivers.push("risk-adjusted returns are weak");
  if (metrics.maxDrawdown > 0.2) drivers.push("historical drawdowns are materially deep");
  if (metrics.var95 > 0.1) drivers.push("one-day downside risk is elevated");
  if (drivers.length === 0) drivers.push("return quality and downside control are balanced");

  return `${metrics.riskTier} risk: ${drivers.join(", ")}.`;
}

export function buildPortfolioSeries(
  positions: PositionInput[],
  historicalByTicker: Record<string, HistoricalPoint[]>,
  latestPrices: Record<string, number>
) {
  const tickers = positions.map((position) => position.ticker.toUpperCase());
  const minLength = Math.min(
    ...tickers.map((ticker) => historicalByTicker[ticker]?.length ?? 0).filter(Boolean)
  );

  const normalizedSeries = Array.from({ length: minLength }, (_, index) => {
    let value = 0;
    let date = "";
    for (const position of positions) {
      const history = historicalByTicker[position.ticker.toUpperCase()];
      const point = history[history.length - minLength + index];
      date = point.date;
      value += point.close * position.shares;
    }
    return { date, value };
  });

  const portfolioValue = positions.reduce(
    (sum, position) => sum + position.shares * (latestPrices[position.ticker.toUpperCase()] ?? 0),
    0
  );
  const closes = normalizedSeries.map((point) => point.value);
  const dailyReturns = computeDailyReturns(closes);
  const { sharpe, annualizedReturn, annualizedStd } = calculateSharpeRatio(dailyReturns);
  const maxDrawdown = calculateMaximumDrawdown(closes);
  const { var95, var95Amount } = calculateVaR95(dailyReturns, portfolioValue);
  const probability = monteCarloDrawdownProbability(dailyReturns, 0.15);
  const riskTier = classifyRiskTier(sharpe, maxDrawdown, var95);
  const summary = summarizeRiskDrivers({ sharpe, maxDrawdown, var95, riskTier });

  return {
    series: normalizedSeries,
    metrics: {
      sharpe,
      maxDrawdown,
      var95,
      var95Amount,
      drawdownProb3m: probability[63],
      drawdownProb6m: probability[126],
      drawdownProb12m: probability[252],
      riskTier,
      summary,
      portfolioValue,
      annualizedReturn,
      annualizedVolatility: annualizedStd
    } satisfies RiskMetrics
  };
}

export function buildHoldingSnapshots(
  positions: PositionInput[],
  latestPrices: Record<string, number>,
  previousCloseByTicker: Record<string, number>
) {
  const totalValue = positions.reduce(
    (sum, position) => sum + position.shares * (latestPrices[position.ticker.toUpperCase()] ?? 0),
    0
  );

  return positions.map<HoldingSnapshot>((position) => {
    const ticker = position.ticker.toUpperCase();
    const currentPrice = latestPrices[ticker] ?? 0;
    const previousClose = previousCloseByTicker[ticker] ?? currentPrice;
    const currentValue = currentPrice * position.shares;
    const previousValue = previousClose * position.shares;
    const dailyPnl = currentValue - previousValue;
    return {
      ...position,
      ticker,
      assetClass: position.assetClass ?? "equities",
      currentPrice,
      currentValue,
      weight: totalValue === 0 ? 0 : currentValue / totalValue,
      dailyPnl,
      dailyPnlPercent: previousValue === 0 ? 0 : dailyPnl / previousValue
    };
  });
}
