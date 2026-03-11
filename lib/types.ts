export type RiskTier = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type PositionInput = {
  ticker: string;
  shares: number;
  avgCost: number;
  assetClass?: "equities" | "bonds" | "commodities";
};

export type MarketQuote = {
  ticker: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: string;
};

export type HistoricalPoint = {
  date: string;
  close: number;
};

export type HoldingSnapshot = PositionInput & {
  currentPrice: number;
  currentValue: number;
  weight: number;
  dailyPnl: number;
  dailyPnlPercent: number;
};

export type RiskMetrics = {
  sharpe: number;
  maxDrawdown: number;
  var95: number;
  var95Amount: number;
  drawdownProb3m: number;
  drawdownProb6m: number;
  drawdownProb12m: number;
  riskTier: RiskTier;
  summary: string;
  portfolioValue: number;
  annualizedReturn: number;
  annualizedVolatility: number;
};
