export type RiskTier = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "MAX";
export type MarketDataState = "live" | "unavailable";
export type MarketDataProvider = "Yahoo Finance" | null;
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
  forwardPE?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type HistoricalPoint = {
  date: string;
  close: number;
};

export type SecuritySearchResult = {
  symbol: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  sector?: import("@/lib/sectors").ResolvedSector;
  hasPreviewData: boolean;
};

export type SecurityPreview = {
  symbol: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  sector: import("@/lib/sectors").ResolvedSector;
  industry?: string;
  marketCap?: number;
  currentPrice?: number | null;
  changePercent?: number | null;
  dataStatus: "full" | "identity_only" | "price_unavailable";
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type WatchlistStatus = "NEW" | "RESEARCHING" | "READY" | "PASSED" | "PROMOTED";
export type ResearchSourceType = "manual" | "related" | "screener" | "trending";

export type WatchlistItem = {
  id: string;
  portfolioId: string;
  ticker: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  sector: import("@/lib/sectors").ResolvedSector;
  industry?: string;
  status: WatchlistStatus;
  conviction: number;
  targetPrice: number | null;
  thesis: string;
  catalysts: string;
  risks: string;
  valuationNotes: string;
  notes: string;
  sourceType: ResearchSourceType;
  sourceLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type ResearchCandidate = {
  ticker: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  sector: import("@/lib/sectors").ResolvedSector;
  industry?: string;
  currentPrice: number | null;
  changePercent: number | null;
  marketCap?: number;
  sourceType: Exclude<ResearchSourceType, "manual">;
  sourceLabel: string;
  fitScore: number;
  deterministicSummary: string;
  aiSummary: string | null;
  topConcern: string | null;
  whyNow: string | null;
  benchmarkContext: string;
  diversificationImpact: string;
  concentrationImpact: string;
  overlapNote: string;
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type ResearchInsight = {
  ticker: string;
  summary: string;
  fitScore: number | null;
  portfolioFit: string;
  benchmarkContext: string;
  whyNow: string;
  topConcern: string;
  thesis: string[];
  catalysts: string[];
  risks: string[];
  valuationFrame: string;
  diligenceQuestions: string[];
  missingData: string[];
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  generatedAt: string;
  model: string;
  provider: string;
  source: "AI" | "FALLBACK";
};

export type ResearchFeatureBundle = {
  ticker: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  sector: string;
  industry?: string;
  currentPrice: number | null;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  profitMargins?: number;
  returnOnEquity?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  changePercent: number | null;
  benchmark: string;
  fitScore: number;
  diversificationImpact: string;
  concentrationImpact: string;
  benchmarkContext: string;
  overlapNote: string;
  starterPositionTopHolding: boolean;
  topSector: string;
  topSectorWeight: number;
  topHoldingTicker: string | null;
  currentPositions: Array<{
    ticker: string;
    sector: string;
    weight: number;
  }>;
  missingData: string[];
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
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
  currentPrice: number | null;
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
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
  historyDataState: MarketDataState;
  historyAsOf: string | null;
  historyProvider: MarketDataProvider;
};

export type HistoricalSeriesResult = {
  symbol: string;
  range: ChartRange;
  points: HistoricalPoint[];
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type BenchmarkAnalytics = {
  benchmark: string;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  trackingDifference: number | null;
  correlation: number | null;
  beta: number | null;
  holdingAttribution: Array<{
    ticker: string;
    companyName: string;
    sector: string;
    startWeight: number | null;
    holdingReturn: number | null;
    contribution: number | null;
  }>;
  sectorAttribution: Array<{
    sector: string;
    weight: number;
    contribution: number;
  }>;
  relativeNotes: string[];
  relativeMode: "return_only" | "sector_relative";
  benchmarkAvailable: boolean;
  benchmarkSectorDataAvailable: boolean;
  dataState: MarketDataState;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type HydratedPortfolioRisk = {
  holdings: HoldingSnapshot[];
  series: Array<{
    date: string;
    value: number;
  }>;
  quotes: MarketQuote[];
  metrics: RiskMetrics | null;
  marketDataState: MarketDataState;
  historySufficient: boolean;
  historyCoverageDays: number;
  asOf: string | null;
  provider: MarketDataProvider;
};

export type RiskReport = {
  portfolioId: string;
  summary: string;
  marketDataState: MarketDataState;
  historySufficient: boolean;
  historyCoverageDays: number;
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
