import YahooFinance from "yahoo-finance2";
import { fetchCompanyDetail, fetchSecurityPreview } from "@/lib/market";
import { clamp, utcNowIso } from "@/lib/utils";
import { getDefaultSector, resolveSector } from "@/lib/sectors";
import type {
  HoldingSnapshot,
  MarketDataProvider,
  MarketDataState,
  PositionInput,
  ResearchCandidate,
  ResearchFeatureBundle,
  ResearchSourceType,
  ResearchInsight,
  WatchlistItem,
  WatchlistStatus
} from "@/lib/types";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

const FEED_CACHE_TTL_MS = 5 * 60_000;
const feedCache = new Map<
  string,
  {
    expiresAt: number;
    data: {
      generatedAt: string;
      candidates: ResearchCandidate[];
    };
  }
>();

const WATCHLIST_STATUS_ORDER: WatchlistStatus[] = [
  "NEW",
  "RESEARCHING",
  "READY",
  "PASSED",
  "PROMOTED"
];

type ScreenerId =
  | "aggressive_small_caps"
  | "day_gainers"
  | "growth_technology_stocks"
  | "most_actives"
  | "portfolio_anchors"
  | "small_cap_gainers"
  | "undervalued_large_caps"
  | "undervalued_growth_stocks";

type FeedSourceConfig = {
  sourceType: Exclude<ResearchSourceType, "manual">;
  sourceLabel: string;
};

type FeedSymbol = FeedSourceConfig & {
  ticker: string;
  providerScore?: number | null;
};

type PortfolioResearchContext = {
  benchmark: string;
  topHoldingTicker: string | null;
  topWeight: number;
  sectorWeights: Map<string, number>;
  starterWeight: number;
  existingTickers: Set<string>;
};

const BENCHMARK_SCREENER_MAP: Record<string, Array<{ id: ScreenerId; label: string }>> = {
  QQQ: [
    { id: "growth_technology_stocks", label: "Growth technology screen" },
    { id: "most_actives", label: "Most active growth names" }
  ],
  SCHD: [
    { id: "undervalued_large_caps", label: "Quality income screen" },
    { id: "portfolio_anchors", label: "Portfolio anchors" }
  ],
  AOR: [
    { id: "portfolio_anchors", label: "Balanced anchors" },
    { id: "undervalued_large_caps", label: "Balanced value screen" }
  ],
  AGG: [
    { id: "portfolio_anchors", label: "Defensive anchors" },
    { id: "undervalued_large_caps", label: "Stable large caps" }
  ],
  ARKK: [
    { id: "aggressive_small_caps", label: "Speculative growth screen" },
    { id: "growth_technology_stocks", label: "Disruptive growth screen" }
  ],
  SPY: [
    { id: "most_actives", label: "Broad market activity" },
    { id: "undervalued_large_caps", label: "Broad market value screen" }
  ],
  VTI: [
    { id: "most_actives", label: "Broad market activity" },
    { id: "undervalued_large_caps", label: "Broad market value screen" }
  ],
  IWM: [
    { id: "aggressive_small_caps", label: "Small cap screen" },
    { id: "small_cap_gainers", label: "Small cap momentum" }
  ],
  DIA: [
    { id: "portfolio_anchors", label: "Blue chip anchors" },
    { id: "undervalued_large_caps", label: "Industrial value screen" }
  ]
};

const BENCHMARK_STYLE_NOTES: Record<string, { note: string; preferredSectors: string[] }> = {
  QQQ: {
    note: "QQQ skews toward software, semiconductors, and internet platforms.",
    preferredSectors: ["Software", "Semiconductors", "Internet & Digital Platforms", "Technology"]
  },
  SCHD: {
    note: "SCHD favors durable cash generators and lower-beta income names.",
    preferredSectors: ["Consumer Defensive", "Healthcare", "Industrials", "Banks & Insurance", "Energy"]
  },
  AOR: {
    note: "AOR reflects a balanced multi-asset posture with less appetite for concentration.",
    preferredSectors: ["Consumer Defensive", "Healthcare", "Industrials", "Financial Services", "Utilities"]
  },
  AGG: {
    note: "AGG represents a defensive ballast, so equity ideas should earn their risk budget.",
    preferredSectors: ["Consumer Defensive", "Utilities", "Healthcare", "Industrials", "Real Estate"]
  },
  ARKK: {
    note: "ARKK leans into high-duration growth and innovation risk.",
    preferredSectors: ["Software", "Semiconductors", "Internet & Digital Platforms", "Biotechnology"]
  },
  SPY: {
    note: "SPY is a broad US benchmark, so fit depends more on diversification and concentration balance.",
    preferredSectors: []
  },
  VTI: {
    note: "VTI is broad market beta, so ideas should improve concentration and quality rather than crowd it.",
    preferredSectors: []
  },
  IWM: {
    note: "IWM leans smaller-cap and cyclical, so liquidity and downside quality matter more.",
    preferredSectors: ["Industrials", "Consumer Cyclical", "Healthcare", "Technology"]
  },
  DIA: {
    note: "DIA emphasizes established large-cap franchises and steadier quality signals.",
    preferredSectors: ["Industrials", "Financial Services", "Healthcare", "Consumer Defensive"]
  }
};

function readCache<T>(
  cache: Map<string, { expiresAt: number; data: T }>,
  key: string
) {
  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) {
      cache.delete(key);
    }
    return null;
  }
  return cached.data;
}

function writeCache<T>(
  cache: Map<string, { expiresAt: number; data: T }>,
  key: string,
  ttlMs: number,
  data: T
) {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    data
  });
  return data;
}

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

function sortByUpdatedAt<T extends { updatedAt: string }>(rows: T[]) {
  return rows.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function getWatchlistStatusOrder(status: WatchlistStatus) {
  return WATCHLIST_STATUS_ORDER.indexOf(status);
}

export function mapWatchlistItemRow(row: Record<string, unknown>): WatchlistItem {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolioId),
    ticker: normalizeTicker(String(row.ticker)),
    companyName: String(row.companyName ?? row.ticker),
    exchange: String(row.exchange ?? "N/A"),
    quoteType: String(row.quoteType ?? "EQUITY"),
    sector: resolveSector({
      ticker: String(row.ticker),
      providerSector: typeof row.sector === "string" ? row.sector : undefined,
      providerIndustry: typeof row.industry === "string" ? row.industry : undefined,
      quoteType: typeof row.quoteType === "string" ? row.quoteType : undefined
    }),
    industry: typeof row.industry === "string" && row.industry.trim() ? row.industry : undefined,
    status: (row.status as WatchlistStatus) ?? "NEW",
    conviction: typeof row.conviction === "number" ? clamp(Math.round(row.conviction), 1, 5) : 3,
    targetPrice: typeof row.targetPrice === "number" && Number.isFinite(row.targetPrice) ? row.targetPrice : null,
    thesis: typeof row.thesis === "string" ? row.thesis : "",
    catalysts: typeof row.catalysts === "string" ? row.catalysts : "",
    risks: typeof row.risks === "string" ? row.risks : "",
    valuationNotes: typeof row.valuationNotes === "string" ? row.valuationNotes : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    sourceType: (row.sourceType as ResearchSourceType) ?? "manual",
    sourceLabel: typeof row.sourceLabel === "string" && row.sourceLabel.trim() ? row.sourceLabel : "Manual search",
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function buildResearchContext(
  positions: PositionInput[],
  holdings: HoldingSnapshot[],
  benchmark: string
): PortfolioResearchContext {
  const existingTickers = new Set(positions.map((position) => normalizeTicker(position.ticker)));
  const resolvedHoldings = holdings.length > 0 ? holdings : positions.map((position) => ({
    ...position,
    currentPrice: null,
    currentValue: null,
    weight: positions.length > 0 ? 1 / positions.length : 0,
    dailyPnl: null,
    dailyPnlPercent: null,
    totalGain: null,
    totalGainPercent: null,
    sector: resolveSector({
      ticker: position.ticker,
      assetClass: position.assetClass
    })
  })) as HoldingSnapshot[];

  const sectorWeights = new Map<string, number>();
  for (const holding of resolvedHoldings) {
    const sector = holding.sector ?? getDefaultSector();
    const weight =
      holding.weight != null
        ? holding.weight
        : resolvedHoldings.length > 0
          ? 1 / resolvedHoldings.length
          : 0;
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + weight);
  }

  const topHolding = resolvedHoldings
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))[0] ?? null;

  return {
    benchmark: benchmark.trim().toUpperCase(),
    topHoldingTicker: topHolding?.ticker ?? null,
    topWeight: topHolding?.weight ?? 0,
    sectorWeights,
    starterWeight: positions.length > 0 ? 1 / (positions.length + 1) : 0.2,
    existingTickers
  };
}

function inferDataConfidence(input: {
  currentPrice: number | null;
  marketCap?: number;
  sector?: string;
  industry?: string;
  revenueGrowth?: number;
  earningsGrowth?: number;
  profitMargins?: number;
  returnOnEquity?: number;
}) {
  let score = 0;
  if (input.currentPrice != null) score += 1;
  if (input.marketCap != null) score += 1;
  if (input.sector) score += 1;
  if (input.industry) score += 1;
  if (input.revenueGrowth != null) score += 1;
  if (input.earningsGrowth != null) score += 1;
  if (input.profitMargins != null) score += 1;
  if (input.returnOnEquity != null) score += 1;
  if (score >= 6) return "HIGH" as const;
  if (score >= 4) return "MEDIUM" as const;
  return "LOW" as const;
}

function benchmarkStyleNote(benchmark: string, sector: string) {
  const style = BENCHMARK_STYLE_NOTES[benchmark] ?? BENCHMARK_STYLE_NOTES.SPY;
  if (style.preferredSectors.length === 0) {
    return style.note;
  }
  return style.preferredSectors.includes(sector)
    ? `${style.note} ${sector} aligns with that benchmark profile.`
    : `${style.note} ${sector} would diversify away from the benchmark’s usual leadership mix.`;
}

function deterministicFit(input: {
  benchmark: string;
  sourceType: Exclude<ResearchSourceType, "manual">;
  sector: string;
  marketCap?: number;
  changePercent: number | null;
  providerScore?: number | null;
  context: PortfolioResearchContext;
}) {
  const topSectorEntry = [...input.context.sectorWeights.entries()].sort((left, right) => right[1] - left[1])[0];
  const topSector = topSectorEntry?.[0] ?? getDefaultSector();
  const topSectorWeight = topSectorEntry?.[1] ?? 0;
  const sectorWeight = input.context.sectorWeights.get(input.sector) ?? 0;

  let fitScore = 52;
  if (input.sourceType === "related") fitScore += 10;
  if (input.sourceType === "screener") fitScore += 7;
  if (input.sourceType === "trending") fitScore -= 4;
  if (sectorWeight === 0) fitScore += 16;
  else if (sectorWeight < 0.15) fitScore += 6;
  else if (sectorWeight > 0.3) fitScore -= 14;
  if (input.marketCap != null) {
    if (input.marketCap >= 10_000_000_000) fitScore += 8;
    else if (input.marketCap >= 1_000_000_000) fitScore += 3;
    else fitScore -= 4;
  }
  if (input.changePercent != null) {
    const move = Math.abs(input.changePercent);
    if (move <= 0.03) fitScore += 3;
    if (move >= 0.12) fitScore -= 5;
  }
  if (input.providerScore != null) {
    fitScore += clamp(input.providerScore * 20, 0, 8);
  }

  const style = BENCHMARK_STYLE_NOTES[input.benchmark] ?? BENCHMARK_STYLE_NOTES.SPY;
  if (style.preferredSectors.includes(input.sector)) {
    fitScore += 4;
  }
  if (input.sector === topSector && topSectorWeight > 0.35) {
    fitScore -= 8;
  }

  const diversificationImpact =
    sectorWeight === 0
      ? `${input.sector} is not currently represented, so the idea adds a new sector sleeve.`
      : sectorWeight > 0.3
        ? `${input.sector} already dominates the book at ${Math.round(sectorWeight * 100)}%, so the idea deepens concentration.`
        : `${input.sector} already exists in the book, but the weight is still moderate enough to absorb a starter position.`;

  const concentrationImpact =
    input.context.starterWeight > input.context.topWeight
      ? `At an equal-size starter weight of ${Math.round(input.context.starterWeight * 100)}%, this name would become the largest position.`
      : `At an equal-size starter weight of ${Math.round(input.context.starterWeight * 100)}%, this name would remain below the current top holding.`;

  const overlapNote =
    input.sector === topSector
      ? `${input.sector} is already the top portfolio sector at ${Math.round(topSectorWeight * 100)}% weight.`
      : `${input.sector} sits outside the current top sector stack of ${topSector}.`;

  const summary =
    sectorWeight === 0
      ? `Adds ${input.sector} diversification to a ${topSectorWeight > 0 ? `${Math.round(topSectorWeight * 100)}% ${topSector}` : "currently unbuilt"} portfolio core.`
      : `${input.sector} fits best if you want to reinforce existing exposure rather than diversify away from it.`;

  return {
    fitScore: clamp(Math.round(fitScore), 1, 99),
    summary,
    diversificationImpact,
    concentrationImpact,
    overlapNote,
    benchmarkContext: benchmarkStyleNote(input.benchmark, input.sector),
    topSector,
    topSectorWeight
  };
}

function mapResearchSourceLabel(input: FeedSourceConfig) {
  return input.sourceLabel;
}

async function fetchScreenedSymbols(benchmark: string): Promise<FeedSymbol[]> {
  const screeners = BENCHMARK_SCREENER_MAP[benchmark] ?? BENCHMARK_SCREENER_MAP.SPY;
  const results = await Promise.allSettled(
    screeners.map(async (screen) => {
      const response = await yahooFinance.screener({ scrIds: screen.id, count: 6 });
      return (response.quotes ?? [])
        .map((quote) => {
          const symbol = typeof quote.symbol === "string" ? normalizeTicker(quote.symbol) : "";
          if (!symbol) {
            return null;
          }
          return {
            ticker: symbol,
            sourceType: "screener" as const,
            sourceLabel: mapResearchSourceLabel({ sourceType: "screener", sourceLabel: screen.label })
          };
        })
        .flatMap((row) => (row ? [row] : []));
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchRelatedSymbols(seedTickers: string[]): Promise<FeedSymbol[]> {
  if (seedTickers.length === 0) {
    return [];
  }

  const response = await yahooFinance.recommendationsBySymbol(seedTickers.slice(0, 4));
  const rows = Array.isArray(response) ? response : [response];
  return rows.flatMap((entry) =>
    (entry.recommendedSymbols ?? [])
      .map((symbol) => {
        const ticker = typeof symbol.symbol === "string" ? normalizeTicker(symbol.symbol) : "";
        if (!ticker) {
          return null;
        }
        return {
          ticker,
          sourceType: "related" as const,
          sourceLabel: `Related to ${entry.symbol}`,
          providerScore: typeof symbol.score === "number" ? symbol.score : null
        };
      })
      .flatMap((row) => (row ? [row] : []))
  );
}

async function fetchTrendingFeedSymbols(): Promise<FeedSymbol[]> {
  const response = await yahooFinance.trendingSymbols("US", { count: 8, region: "US", lang: "en-US" });
  return (response.quotes ?? [])
    .map((quote) => {
      const ticker = typeof quote.symbol === "string" ? normalizeTicker(quote.symbol) : "";
      if (!ticker) {
        return null;
      }
      return {
        ticker,
        sourceType: "trending" as const,
        sourceLabel: "US trending symbols"
      };
    })
    .flatMap((row) => (row ? [row] : []));
}

function dedupeFeedSymbols(
  rows: FeedSymbol[],
  excludedTickers: Set<string>
) {
  const deduped = new Map<string, FeedSymbol>();
  const sourcePriority: Record<FeedSymbol["sourceType"], number> = {
    related: 3,
    screener: 2,
    trending: 1
  };

  for (const row of rows) {
    if (excludedTickers.has(row.ticker)) {
      continue;
    }
    const existing = deduped.get(row.ticker);
    if (!existing || sourcePriority[row.sourceType] > sourcePriority[existing.sourceType]) {
      deduped.set(row.ticker, row);
    }
  }

  return [...deduped.values()];
}

function sortCandidatesForFeed(candidates: ResearchCandidate[]) {
  return candidates.slice().sort((left, right) => {
    if (right.fitScore !== left.fitScore) {
      return right.fitScore - left.fitScore;
    }
    return (right.marketCap ?? 0) - (left.marketCap ?? 0);
  });
}

export function buildFallbackResearchInsight(bundle: ResearchFeatureBundle): ResearchInsight {
  const qualitySignals = [
    bundle.revenueGrowth != null ? `Revenue growth is ${Math.round(bundle.revenueGrowth * 100)}%.` : null,
    bundle.earningsGrowth != null ? `Earnings growth is ${Math.round(bundle.earningsGrowth * 100)}%.` : null,
    bundle.profitMargins != null ? `Profit margins are ${Math.round(bundle.profitMargins * 100)}%.` : null,
    bundle.returnOnEquity != null ? `Return on equity is ${Math.round(bundle.returnOnEquity * 100)}%.` : null
  ].filter((signal): signal is string => signal !== null);

  return {
    ticker: bundle.ticker,
    summary: `${bundle.companyName} scores ${bundle.fitScore}/100 on deterministic portfolio fit. ${bundle.diversificationImpact}`,
    fitScore: bundle.fitScore,
    portfolioFit: `${bundle.overlapNote} ${bundle.concentrationImpact}`,
    benchmarkContext: bundle.benchmarkContext,
    whyNow:
      bundle.changePercent == null
        ? "Price momentum is unavailable, so the setup should be judged more on portfolio fit and fundamentals."
        : `Recent price move is ${(bundle.changePercent * 100).toFixed(2)}%, so timing should be framed against conviction rather than short-term tape alone.`,
    topConcern:
      bundle.topSectorWeight > 0.35 && bundle.sector === bundle.topSector
        ? `${bundle.sector} already dominates the current portfolio, so this idea would worsen concentration unless it replaces another name.`
        : bundle.dataConfidence === "LOW"
          ? "Yahoo fundamentals coverage is thin, so the diligence burden is higher."
          : "The main question is whether the expected upside justifies the position's incremental risk budget.",
    thesis: [
      `${bundle.companyName} is being evaluated primarily as a ${bundle.sector} addition for a ${bundle.benchmark}-benchmarked portfolio.`,
      bundle.diversificationImpact
    ],
    catalysts: [
      bundle.changePercent != null
        ? `Monitor whether the recent ${(bundle.changePercent * 100).toFixed(2)}% move confirms or fades.`
        : "Monitor price action once Yahoo quote coverage stabilizes.",
      bundle.marketCap != null
        ? `Current market cap of ${Math.round(bundle.marketCap / 1_000_000_000)}B provides size context for position sizing.`
        : "Market-cap context is unavailable and should be verified before sizing."
    ],
    risks: [
      bundle.concentrationImpact,
      bundle.overlapNote
    ],
    valuationFrame:
      bundle.trailingPE != null
        ? `Trailing P/E is ${bundle.trailingPE.toFixed(1)}x. Compare that multiple against peer growth, margins, and the role this name would play in the portfolio.`
        : "Yahoo valuation coverage is incomplete, so valuation should be cross-checked before promotion.",
    diligenceQuestions: [
      `What specific role should ${bundle.ticker} play relative to the current ${bundle.topSector} concentration?`,
      "Is there enough fundamental coverage to support a real thesis rather than a tactical trade?",
      "Would this name still make sense if it started at an equal-size starter allocation?"
    ],
    missingData: bundle.missingData,
    dataConfidence: bundle.dataConfidence,
    generatedAt: utcNowIso(),
    model: "deterministic-fallback",
    provider: "local",
    source: "FALLBACK"
  };
}

export async function buildResearchFeatureBundle(input: {
  ticker: string;
  benchmark: string;
  positions: PositionInput[];
  holdings: HoldingSnapshot[];
  sourceType?: ResearchSourceType;
}) {
  const ticker = normalizeTicker(input.ticker);
  const detail = await fetchCompanyDetail(ticker, "3M");
  const context = buildResearchContext(input.positions, input.holdings, input.benchmark);
  const fit = deterministicFit({
    benchmark: context.benchmark,
    sourceType:
      input.sourceType && input.sourceType !== "manual" ? input.sourceType : "related",
    sector: detail.sector,
    marketCap: detail.marketCap,
    changePercent:
      detail.chart.length >= 2 && detail.chart[0]
        ? detail.chart[detail.chart.length - 1]!.close / detail.chart[0]!.close - 1
        : null,
    providerScore: null,
    context
  });

  const missingData = [
    detail.marketCap == null ? "marketCap" : null,
    detail.trailingPE == null && detail.forwardPE == null ? "valuation" : null,
    detail.revenueGrowth == null && detail.earningsGrowth == null ? "growth" : null,
    detail.profitMargins == null && detail.returnOnEquity == null ? "profitability" : null,
    detail.currentRatio == null && detail.quickRatio == null ? "liquidity" : null
  ].filter((item): item is string => item !== null);

  return {
    ticker,
    companyName: detail.companyName,
    exchange: detail.exchange,
    quoteType: "EQUITY",
    sector: detail.sector,
    industry: detail.industry,
    currentPrice: detail.currentPrice,
    marketCap: detail.marketCap,
    trailingPE: detail.trailingPE,
    forwardPE: detail.forwardPE,
    revenueGrowth: detail.revenueGrowth,
    earningsGrowth: detail.earningsGrowth,
    profitMargins: detail.profitMargins,
    returnOnEquity: detail.returnOnEquity,
    debtToEquity: detail.debtToEquity,
    currentRatio: detail.currentRatio,
    quickRatio: detail.quickRatio,
    changePercent:
      detail.chart.length >= 2 && detail.chart[0]
        ? detail.chart[detail.chart.length - 1]!.close / detail.chart[0]!.close - 1
        : null,
    benchmark: context.benchmark,
    fitScore: fit.fitScore,
    diversificationImpact: fit.diversificationImpact,
    concentrationImpact: fit.concentrationImpact,
    benchmarkContext: fit.benchmarkContext,
    overlapNote: fit.overlapNote,
    starterPositionTopHolding: context.starterWeight > context.topWeight,
    topSector: fit.topSector,
    topSectorWeight: fit.topSectorWeight,
    topHoldingTicker: context.topHoldingTicker,
    currentPositions: input.holdings
      .slice()
      .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
      .slice(0, 5)
      .map((holding) => ({
        ticker: holding.ticker,
        sector: holding.sector ?? getDefaultSector(),
        weight: holding.weight ?? 0
      })),
    missingData,
    dataConfidence: inferDataConfidence({
      currentPrice: detail.currentPrice,
      marketCap: detail.marketCap,
      sector: detail.sector,
      industry: detail.industry,
      revenueGrowth: detail.revenueGrowth,
      earningsGrowth: detail.earningsGrowth,
      profitMargins: detail.profitMargins,
      returnOnEquity: detail.returnOnEquity
    })
  } satisfies ResearchFeatureBundle;
}

export async function generateResearchFeed(input: {
  portfolioId: string;
  benchmark: string;
  positions: PositionInput[];
  holdings: HoldingSnapshot[];
  activeWatchlistTickers?: string[];
  refresh?: boolean;
}) {
  const cacheKey = `${input.portfolioId}:${new Date().toISOString().slice(0, 10)}`;
  if (!input.refresh) {
    const cached = readCache(feedCache, cacheKey);
    if (cached) {
      return cached;
    }
  }

  const benchmark = input.benchmark.trim().toUpperCase();
  const context = buildResearchContext(input.positions, input.holdings, benchmark);
  const excludedTickers = new Set([
    ...context.existingTickers,
    ...(input.activeWatchlistTickers ?? []).map((ticker) => normalizeTicker(ticker))
  ]);
  const seedTickers = input.holdings
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .slice(0, 3)
    .map((holding) => normalizeTicker(holding.ticker));

  const [screened, related, trending] = await Promise.all([
    fetchScreenedSymbols(benchmark).catch(() => []),
    fetchRelatedSymbols(seedTickers.length > 0 ? seedTickers : [benchmark]).catch(() => []),
    fetchTrendingFeedSymbols().catch(() => [])
  ]);

  const feedSymbols = dedupeFeedSymbols([...related, ...screened, ...trending], excludedTickers).slice(0, 12);
  const previews = await Promise.allSettled(
    feedSymbols.map(async (row) => {
      const preview = await fetchSecurityPreview(row.ticker);
      return { row, preview };
    })
  );

  const candidates = previews.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }
    const { row, preview } = result.value;
    const fit = deterministicFit({
      benchmark,
      sourceType: row.sourceType,
      sector: preview.sector,
      marketCap: preview.marketCap,
      changePercent: preview.changePercent ?? null,
      providerScore: row.providerScore,
      context
    });

    const candidate: ResearchCandidate = {
      ticker: preview.symbol,
      companyName: preview.companyName,
      exchange: preview.exchange,
      quoteType: preview.quoteType,
      sector: preview.sector,
      industry: preview.industry,
      currentPrice: preview.currentPrice ?? null,
      changePercent: preview.changePercent ?? null,
      marketCap: preview.marketCap,
      sourceType: row.sourceType,
      sourceLabel: row.sourceLabel,
      fitScore: fit.fitScore,
      deterministicSummary: fit.summary,
      aiSummary: null,
      topConcern:
        fit.topSectorWeight > 0.35 && preview.sector === fit.topSector
          ? `${preview.sector} is already crowded in the portfolio.`
          : null,
      whyNow:
        preview.changePercent != null
          ? `Recent move is ${(preview.changePercent * 100).toFixed(2)}% with a ${row.sourceType} catalyst path.`
          : `This name surfaced from the ${row.sourceLabel.toLowerCase()} pipeline rather than a price trigger.`,
      benchmarkContext: fit.benchmarkContext,
      diversificationImpact: fit.diversificationImpact,
      concentrationImpact: fit.concentrationImpact,
      overlapNote: fit.overlapNote,
      dataConfidence: inferDataConfidence({
        currentPrice: preview.currentPrice ?? null,
        marketCap: preview.marketCap,
        sector: preview.sector,
        industry: preview.industry
      }),
      dataState: preview.dataState,
      asOf: preview.asOf,
      provider: preview.provider
    };

    return [candidate];
  });

  const data = {
    generatedAt: utcNowIso(),
    candidates: sortCandidatesForFeed(candidates)
  };

  return writeCache(feedCache, cacheKey, FEED_CACHE_TTL_MS, data);
}

export function sortWatchlistItems(
  items: WatchlistItem[],
  sortBy: "updated" | "conviction" | "marketCap",
  marketCapByTicker: Map<string, number | null>
) {
  return sortByUpdatedAt(items).sort((left, right) => {
    if (left.status !== right.status) {
      return getWatchlistStatusOrder(left.status) - getWatchlistStatusOrder(right.status);
    }

    if (sortBy === "conviction") {
      if (right.conviction !== left.conviction) {
        return right.conviction - left.conviction;
      }
    }

    if (sortBy === "marketCap") {
      const rightCap = marketCapByTicker.get(right.ticker.toUpperCase()) ?? -Infinity;
      const leftCap = marketCapByTicker.get(left.ticker.toUpperCase()) ?? -Infinity;
      if (rightCap !== leftCap) {
        return rightCap - leftCap;
      }
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
