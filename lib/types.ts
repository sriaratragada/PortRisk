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
  shortName?: string;
  longName?: string;
  exchange?: string;
  marketCap?: number;
  trailingPE?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
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
  totalGain: number;
  totalGainPercent: number;
  companyName?: string;
  exchange?: string;
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

export type CompanyDetail = {
  ticker: string;
  companyName: string;
  exchange: string;
  currentPrice: number;
  currency: string;
  marketCap?: number;
  sector?: string;
  industry?: string;
  website?: string;
  employeeCount?: number;
  summary?: string;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  beta?: number;
  profitMargins?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  returnOnEquity?: number;
  totalCash?: number;
  totalDebt?: number;
  freeCashflow?: number;
  operatingCashflow?: number;
  targetMeanPrice?: number;
  chart: HistoricalPoint[];
};

export type RiskReport = {
  portfolioId: string;
  summary: string;
  sectorConcentration: Array<{
    sector: string;
    weight: number;
  }>;
  singleNameConcentration: Array<{
    ticker: string;
    companyName: string;
    weight: number;
  }>;
  marketContext: {
    benchmark: string;
    trailingReturn: number;
    trend: "BULLISH" | "NEUTRAL" | "BEARISH";
    volatility: number;
    summary: string;
  };
  balanceSheetSignals: Array<{
    ticker: string;
    companyName: string;
    signal: string;
    severity: "INFO" | "WATCH" | "HIGH";
  }>;
  resilienceFactors: string[];
  vulnerabilities: string[];
};
