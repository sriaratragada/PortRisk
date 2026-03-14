export type RiskTier = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "MAX";
export type {
  ResolvedSector
} from "@/lib/sectors";

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
  currentPrice: number | null;
  currentValue: number | null;
  weight: number | null;
  dailyPnl: number | null;
  dailyPnlPercent: number | null;
  totalGain: number | null;
  totalGainPercent: number | null;
  companyName?: string;
  exchange?: string;
  sector?: import("@/lib/sectors").ResolvedSector;
  industry?: string;
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
  sector: import("@/lib/sectors").ResolvedSector;
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
  industryConcentration: Array<{
    industry: string;
    weight: number;
  }>;
  qualityScores: {
    concentration: number;
    liquidity: number;
    balanceSheet: number;
    profitability: number;
    growth: number;
    downsideRisk: number;
  };
  qualityScoreDetails: {
    concentration: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
    liquidity: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
    balanceSheet: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
    profitability: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
    growth: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
    downsideRisk: {
      score: number;
      band: "Strong" | "Moderate" | "Weak";
      summary: string;
      drivers: string[];
    };
  };
  returnDiagnostics: {
    realizedVolatility: number;
    downsideVolatility: number;
    hitRate: number;
    bestDay: number;
    worstDay: number;
    currentDrawdown: number;
    betaToBenchmark: number;
    correlationToBenchmark: number;
  };
  benchmarkComparison: {
    benchmark: string;
    portfolioReturn: number;
    benchmarkReturn: number;
    excessReturn: number;
  };
  exposureDiagnostics: {
    sectorCount: number;
    industryCount: number;
    growthTilt: "LOW" | "MODERATE" | "HIGH";
    incomeTilt: "LOW" | "MODERATE" | "HIGH";
    defensiveness: "DEFENSIVE" | "NEUTRAL" | "CYCLICAL";
  };
  topRiskContributors: Array<{
    ticker: string;
    companyName: string;
    contribution: number;
    reason: string;
  }>;
  scenarioMatrix: Array<{
    name: string;
    impact: number;
    severity: "LOW" | "MODERATE" | "HIGH";
  }>;
  changeDiagnostics: {
    summary: string;
    trigger: "MARKET_MOVEMENT" | "POSITION_CHANGE" | "MIXED" | "UNKNOWN";
    sharpeDelta: number | null;
    varDelta: number | null;
    drawdownDelta: number | null;
    riskTierChanged: boolean;
  };
  dataConfidence: {
    overall: "HIGH" | "MEDIUM" | "LOW";
    fundamentalsCoverage: number;
    priceCoverage: number;
  };
  resilienceFactors: string[];
  vulnerabilities: string[];
};

export type RiskInsight = {
  summary: string;
  drivers: string[];
  resilienceFactors: string[];
  alerts: Array<{
    severity: "INFO" | "WATCH" | "HIGH";
    message: string;
  }>;
  recommendedActions: string[];
  regimeCommentary: string;
  changeSummary: string;
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  generatedAt: string;
  model: string;
  provider: string;
  source: "AI" | "FALLBACK";
};
