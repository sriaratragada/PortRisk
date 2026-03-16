import YahooFinance from "yahoo-finance2";
import { CHART_RANGE_CONFIG } from "@/lib/market-config";
import { resolveSector } from "@/lib/sectors";
import type {
  ChartRange,
  CompanyDetail,
  HistoricalPoint,
  HistoricalSeriesResult,
  MarketQuote,
  SecurityPreview,
  SecuritySearchResult
} from "@/lib/types";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

const SEARCH_TTL_MS = 30_000;
const QUOTE_TTL_MS = 30_000;
const SNAPSHOT_TTL_MS = 5 * 60_000;
const DETAIL_TTL_MS = 5 * 60_000;

const searchCache = new Map<string, { expiresAt: number; data: SecuritySearchResult[] }>();
const quoteCache = new Map<string, { expiresAt: number; data: MarketQuote }>();
const historyCache = new Map<string, { expiresAt: number; data: HistoricalSeriesResult }>();
const snapshotCache = new Map<string, { expiresAt: number; data: SecuritySnapshot }>();
const detailCache = new Map<string, { expiresAt: number; data: CompanyDetail }>();

type SecuritySnapshot = {
  symbol: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  currency: string;
  sector: import("@/lib/sectors").ResolvedSector;
  industry?: string;
  website?: string;
  employeeCount?: number;
  summary?: string;
  marketCap?: number;
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
};

type SearchCandidate = {
  symbol: string;
  companyName: string;
  exchange: string;
  quoteType: string;
  providerSector?: string;
  providerIndustry?: string;
};

type YahooQuoteLike = {
  symbol?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
  longName?: string;
  fullExchangeName?: string;
  exchange?: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  quoteType?: string;
  regularMarketTime?: Date;
};

type YahooChartQuoteLike = {
  date?: Date;
  close?: number | null;
};

function normalizeText(value: string | undefined | null) {
  return (value ?? "").trim().toUpperCase();
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIsoString(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function readCache<T>(cache: Map<string, { expiresAt: number; data: T }>, key: string) {
  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) cache.delete(key);
    return null;
  }
  return cached.data;
}

function writeCache<T>(cache: Map<string, { expiresAt: number; data: T }>, key: string, ttlMs: number, data: T) {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    data
  });
  return data;
}

function isSupportedQuoteType(quoteType: string | undefined) {
  return ["EQUITY", "ETF", "MUTUALFUND"].includes(normalizeText(quoteType));
}

function getDisplayExchange(value: unknown, fallback = "N/A") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getSearchCompanyName(candidate: Record<string, unknown>) {
  const shortName =
    typeof candidate.shortname === "string" && candidate.shortname.trim()
      ? candidate.shortname.trim()
      : undefined;
  const longName =
    typeof candidate.longname === "string" && candidate.longname.trim()
      ? candidate.longname.trim()
      : undefined;
  return shortName ?? longName ?? (typeof candidate.symbol === "string" ? candidate.symbol : "Unknown");
}

function buildSearchCandidate(candidate: Record<string, unknown>): SearchCandidate | null {
  if (candidate.isYahooFinance !== true) {
    return null;
  }

  const quoteType = typeof candidate.quoteType === "string" ? candidate.quoteType : "";
  const symbol = typeof candidate.symbol === "string" ? candidate.symbol.trim().toUpperCase() : "";
  if (!symbol || !isSupportedQuoteType(quoteType)) {
    return null;
  }

  return {
    symbol,
    companyName: getSearchCompanyName(candidate),
    exchange: getDisplayExchange(candidate.exchDisp ?? candidate.exchange),
    quoteType,
    providerSector: typeof candidate.sector === "string" ? candidate.sector : undefined,
    providerIndustry: typeof candidate.industry === "string" ? candidate.industry : undefined
  };
}

function scoreSearchRow(row: SecuritySearchResult, query: string) {
  const normalizedQuery = normalizeText(query);
  const symbol = normalizeText(row.symbol);
  const companyName = normalizeText(row.companyName);

  let score = 0;
  if (symbol === normalizedQuery) score += 1000;
  if (symbol.startsWith(normalizedQuery)) score += 400;
  if (companyName.startsWith(normalizedQuery)) score += 180;
  if (symbol.includes(normalizedQuery)) score += 120;
  if (companyName.includes(normalizedQuery)) score += 80;
  if (row.quoteType === "EQUITY") score += 30;
  if (row.exchange.includes("NASDAQ") || row.exchange.includes("NYSE")) score += 20;
  return score;
}

function dedupeAndRankSearchRows(rows: SecuritySearchResult[], query: string) {
  const deduped = new Map<string, SecuritySearchResult>();
  for (const row of rows) {
    if (!deduped.has(row.symbol)) {
      deduped.set(row.symbol, row);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => scoreSearchRow(right, query) - scoreSearchRow(left, query))
    .slice(0, 12);
}

function buildSearchResult(row: SearchCandidate): SecuritySearchResult {
  return {
    symbol: row.symbol,
    companyName: row.companyName,
    exchange: row.exchange,
    quoteType: row.quoteType,
    sector: resolveSector({
      ticker: row.symbol,
      providerSector: row.providerSector,
      providerIndustry: row.providerIndustry,
      quoteType: row.quoteType
    }),
    hasPreviewData: true
  };
}

export function normalizeYahooQuote(symbol: string, quote: YahooQuoteLike): MarketQuote {
  const ticker = symbol.trim().toUpperCase();
  const price = toNumber(quote.regularMarketPrice);
  if (price == null) {
    throw new Error(`Yahoo quote missing price for ${ticker}`);
  }

  const previousClose = toNumber(quote.regularMarketPreviousClose) ?? price;
  const rawChangePercent = toNumber(quote.regularMarketChangePercent);
  const changePercent =
    rawChangePercent != null
      ? Math.abs(rawChangePercent) > 1
        ? rawChangePercent / 100
        : rawChangePercent
      : previousClose === 0
        ? 0
        : price / previousClose - 1;

  return {
    ticker,
    price,
    previousClose,
    changePercent,
    currency: typeof quote.currency === "string" ? quote.currency : "USD",
    shortName: typeof quote.shortName === "string" ? quote.shortName : undefined,
    longName: typeof quote.longName === "string" ? quote.longName : undefined,
    exchange: getDisplayExchange(quote.fullExchangeName ?? quote.exchange, undefined),
    marketCap: toNumber(quote.marketCap),
    trailingPE: toNumber(quote.trailingPE),
    forwardPE: toNumber(quote.forwardPE),
    fiftyTwoWeekLow: toNumber(quote.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: toNumber(quote.fiftyTwoWeekHigh),
    dataState: "live",
    asOf: toIsoString(quote.regularMarketTime ?? new Date()),
    provider: "Yahoo Finance"
  };
}

export function normalizeYahooChartPoints(quotes: YahooChartQuoteLike[], range: ChartRange): HistoricalPoint[] {
  const points = quotes
    .map((point) => {
      const close = toNumber(point.close);
      const date = toIsoString(point.date);
      if (close == null || !date) {
        return null;
      }
      return { date, close };
    })
    .filter((point): point is HistoricalPoint => point !== null)
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  if (range !== "1D" || points.length === 0) {
    return points;
  }

  const latestSession = points[points.length - 1]!.date.slice(0, 10);
  return points.filter((point) => point.date.slice(0, 10) === latestSession);
}

function unavailableHistory(symbol: string, range: ChartRange): HistoricalSeriesResult {
  return {
    symbol: symbol.toUpperCase(),
    range,
    points: [],
    dataState: "unavailable",
    asOf: null,
    provider: null
  };
}

function emptyCompanyDetail(symbol: string): CompanyDetail {
  return {
    ticker: symbol.toUpperCase(),
    companyName: symbol.toUpperCase(),
    exchange: "N/A",
    currentPrice: null,
    currency: "USD",
    sector: resolveSector({ ticker: symbol.toUpperCase() }),
    chart: [],
    dataState: "unavailable",
    asOf: null,
    provider: null,
    historyDataState: "unavailable",
    historyAsOf: null,
    historyProvider: null
  };
}

function getRangeLookbackDays(range: ChartRange) {
  switch (range) {
    case "1D":
      return 7;
    case "1W":
      return 14;
    case "1M":
      return 40;
    case "3M":
      return 100;
    case "1Y":
      return 400;
    case "5Y":
      return 2000;
    case "MAX":
      return 365 * 40;
  }
}

function getYahooInterval(range: ChartRange) {
  switch (range) {
    case "1D":
      return "5m" as const;
    case "1W":
      return "1h" as const;
    case "1M":
    case "3M":
    case "1Y":
      return "1d" as const;
    case "5Y":
      return "1wk" as const;
    case "MAX":
      return "1mo" as const;
  }
}

async function searchCandidates(query: string): Promise<SearchCandidate[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const response = await yahooFinance.search(normalizedQuery, {
    quotesCount: 12,
    newsCount: 0
  });
  return (response.quotes ?? [])
    .map((quote) => buildSearchCandidate(quote as Record<string, unknown>))
    .filter((quote): quote is SearchCandidate => quote !== null);
}

async function findSearchCandidateBySymbol(symbol: string) {
  const candidates = await searchCandidates(symbol);
  const normalizedSymbol = symbol.trim().toUpperCase();
  return (
    candidates.find((candidate) => normalizeText(candidate.symbol) === normalizedSymbol) ?? null
  );
}

async function fetchSecuritySnapshot(symbol: string): Promise<SecuritySnapshot> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cached = readCache(snapshotCache, normalizedSymbol);
  if (cached) {
    return cached;
  }

  const [searchResult, summaryResult] = await Promise.allSettled([
    findSearchCandidateBySymbol(normalizedSymbol),
    yahooFinance.quoteSummary(normalizedSymbol, {
      modules: ["price", "summaryProfile", "financialData", "defaultKeyStatistics", "summaryDetail"]
    })
  ]);

  const candidate = searchResult.status === "fulfilled" ? searchResult.value : null;
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value as Record<string, any> : null;
  const price = summary?.price ?? null;
  const summaryProfile = summary?.summaryProfile ?? null;
  const financialData = summary?.financialData ?? null;
  const defaultKeyStatistics = summary?.defaultKeyStatistics ?? null;
  const summaryDetail = summary?.summaryDetail ?? null;

  const companyName =
    candidate?.companyName ??
    (typeof price?.longName === "string" && price.longName.trim() ? price.longName.trim() : undefined) ??
    (typeof price?.shortName === "string" && price.shortName.trim() ? price.shortName.trim() : undefined) ??
    normalizedSymbol;
  const exchange =
    candidate?.exchange ??
    getDisplayExchange(price?.exchangeName ?? price?.fullExchangeName ?? price?.exchange);
  const quoteType =
    candidate?.quoteType ??
    (typeof price?.quoteType === "string" ? price.quoteType : "EQUITY");

  if (!candidate && !summary) {
    throw new Error(`Yahoo could not resolve ${normalizedSymbol}`);
  }

  const snapshot: SecuritySnapshot = {
    symbol: normalizedSymbol,
    companyName,
    exchange,
    quoteType,
    currency: typeof price?.currency === "string" ? price.currency : "USD",
    sector: resolveSector({
      ticker: normalizedSymbol,
      providerSector: summaryProfile?.sector ?? candidate?.providerSector,
      providerIndustry: summaryProfile?.industry ?? candidate?.providerIndustry,
      quoteType
    }),
    industry:
      typeof summaryProfile?.industry === "string"
        ? summaryProfile.industry
        : candidate?.providerIndustry,
    website: typeof summaryProfile?.website === "string" ? summaryProfile.website : undefined,
    employeeCount: toNumber(summaryProfile?.fullTimeEmployees),
    summary:
      typeof summaryProfile?.longBusinessSummary === "string"
        ? summaryProfile.longBusinessSummary
        : undefined,
    marketCap: toNumber(price?.marketCap ?? financialData?.marketCap),
    trailingPE: toNumber(summaryDetail?.trailingPE ?? defaultKeyStatistics?.trailingPE),
    forwardPE: toNumber(financialData?.forwardPE),
    dividendYield: toNumber(summaryDetail?.dividendYield),
    beta: toNumber(defaultKeyStatistics?.beta ?? summaryDetail?.beta),
    profitMargins: toNumber(financialData?.profitMargins ?? defaultKeyStatistics?.profitMargins),
    revenueGrowth: toNumber(financialData?.revenueGrowth),
    earningsGrowth: toNumber(financialData?.earningsGrowth),
    debtToEquity: toNumber(financialData?.debtToEquity),
    currentRatio: toNumber(financialData?.currentRatio),
    quickRatio: toNumber(financialData?.quickRatio),
    returnOnEquity: toNumber(financialData?.returnOnEquity),
    totalCash: toNumber(financialData?.totalCash),
    totalDebt: toNumber(financialData?.totalDebt),
    freeCashflow: toNumber(financialData?.freeCashflow),
    operatingCashflow: toNumber(financialData?.operatingCashflow),
    targetMeanPrice: toNumber(financialData?.targetMeanPrice)
  };

  return writeCache(snapshotCache, normalizedSymbol, SNAPSHOT_TTL_MS, snapshot);
}

export function getRangeFromDays(days = 252): ChartRange {
  if (days <= 1) return "1D";
  if (days <= 7) return "1W";
  if (days <= 31) return "1M";
  if (days <= 90) return "3M";
  if (days <= 365) return "1Y";
  if (days <= 1825) return "5Y";
  return "MAX";
}

export async function searchTickers(query: string): Promise<SecuritySearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = normalizeText(normalizedQuery);
  const cached = readCache(searchCache, cacheKey);
  if (cached) {
    return cached;
  }

  const rows = (await searchCandidates(normalizedQuery)).map(buildSearchResult);
  return writeCache(searchCache, cacheKey, SEARCH_TTL_MS, dedupeAndRankSearchRows(rows, normalizedQuery));
}

export async function fetchSecurityIdentity(symbol: string) {
  return fetchSecuritySnapshot(symbol);
}

export async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cached = readCache(quoteCache, normalizedSymbol);
  if (cached) {
    return cached;
  }

  const quote = await yahooFinance.quote(normalizedSymbol);
  const normalized = normalizeYahooQuote(normalizedSymbol, quote);
  return writeCache(quoteCache, normalizedSymbol, QUOTE_TTL_MS, normalized);
}

export async function fetchQuotes(symbols: string[]) {
  const results = await Promise.allSettled(
    symbols.map((symbol) => fetchQuote(symbol))
  );

  return results
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .filter((quote, index, all) => all.findIndex((entry) => entry.ticker === quote.ticker) === index);
}

export async function fetchHistoricalSeriesResult(
  symbol: string,
  range: ChartRange
): Promise<HistoricalSeriesResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = `${normalizedSymbol}:${range}`;
  const cached = readCache(historyCache, cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const chart = await yahooFinance.chart(normalizedSymbol, {
      period1: new Date(Date.now() - getRangeLookbackDays(range) * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: getYahooInterval(range)
    });
    const points = normalizeYahooChartPoints(
      Array.isArray(chart.quotes) ? (chart.quotes as YahooChartQuoteLike[]) : [],
      range
    );
    if (points.length === 0) {
      return unavailableHistory(normalizedSymbol, range);
    }

    return writeCache(historyCache, cacheKey, CHART_RANGE_CONFIG[range].revalidateSeconds * 1000, {
      symbol: normalizedSymbol,
      range,
      points,
      dataState: "live",
      asOf: points[points.length - 1]!.date,
      provider: "Yahoo Finance"
    });
  } catch {
    return unavailableHistory(normalizedSymbol, range);
  }
}

export async function fetchHistoricalSeries(symbol: string, range: ChartRange): Promise<HistoricalPoint[]> {
  const result = await fetchHistoricalSeriesResult(symbol, range);
  return result.points;
}

export async function fetchHistoricalCloses(symbol: string, days = 252): Promise<HistoricalPoint[]> {
  const result = await fetchHistoricalSeriesResult(symbol, getRangeFromDays(days));
  return result.points.slice(-days);
}

export async function fetchCompanyDetail(
  symbol: string,
  range: ChartRange = "1M"
): Promise<CompanyDetail> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = `${normalizedSymbol}:${range}`;
  const cached = readCache(detailCache, cacheKey);
  if (cached) {
    return cached;
  }

  const [snapshotResult, quoteResult, historyResult] = await Promise.allSettled([
    fetchSecuritySnapshot(normalizedSymbol),
    fetchQuote(normalizedSymbol),
    fetchHistoricalSeriesResult(normalizedSymbol, range)
  ]);

  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const history = historyResult.status === "fulfilled" ? historyResult.value : unavailableHistory(normalizedSymbol, range);

  if (!snapshot && !quote && history.points.length === 0) {
    throw new Error(`Failed to load company detail for ${normalizedSymbol}`);
  }

  const detail: CompanyDetail = {
    ...emptyCompanyDetail(normalizedSymbol),
    ticker: normalizedSymbol,
    companyName:
      snapshot?.companyName ??
      quote?.longName ??
      quote?.shortName ??
      normalizedSymbol,
    exchange:
      snapshot?.exchange ??
      quote?.exchange ??
      "N/A",
    currentPrice: quote?.price ?? null,
    currency: quote?.currency ?? snapshot?.currency ?? "USD",
    marketCap: quote?.marketCap ?? snapshot?.marketCap,
    sector: snapshot?.sector ?? resolveSector({ ticker: normalizedSymbol }),
    industry: snapshot?.industry,
    website: snapshot?.website,
    employeeCount: snapshot?.employeeCount,
    summary: snapshot?.summary,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
    trailingPE: quote?.trailingPE ?? snapshot?.trailingPE,
    forwardPE: quote?.forwardPE ?? snapshot?.forwardPE,
    dividendYield: snapshot?.dividendYield,
    beta: snapshot?.beta,
    profitMargins: snapshot?.profitMargins,
    revenueGrowth: snapshot?.revenueGrowth,
    earningsGrowth: snapshot?.earningsGrowth,
    debtToEquity: snapshot?.debtToEquity,
    currentRatio: snapshot?.currentRatio,
    quickRatio: snapshot?.quickRatio,
    returnOnEquity: snapshot?.returnOnEquity,
    totalCash: snapshot?.totalCash,
    totalDebt: snapshot?.totalDebt,
    freeCashflow: snapshot?.freeCashflow,
    operatingCashflow: snapshot?.operatingCashflow,
    targetMeanPrice: snapshot?.targetMeanPrice,
    chart: history.points,
    dataState: quote ? "live" : "unavailable",
    asOf: quote?.asOf ?? null,
    provider: quote || snapshot ? "Yahoo Finance" : null,
    historyDataState: history.dataState,
    historyAsOf: history.asOf,
    historyProvider: history.provider
  };

  return writeCache(detailCache, cacheKey, DETAIL_TTL_MS, detail);
}

export async function fetchCompanyDetails(symbols: string[]) {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const [snapshotResult, quoteResult] = await Promise.allSettled([
        fetchSecuritySnapshot(normalizedSymbol),
        fetchQuote(normalizedSymbol)
      ]);
      const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
      const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
      if (!snapshot && !quote) {
        throw new Error(`Failed to load company snapshot for ${normalizedSymbol}`);
      }

      return {
        ...emptyCompanyDetail(normalizedSymbol),
        ticker: normalizedSymbol,
        companyName:
          snapshot?.companyName ??
          quote?.longName ??
          quote?.shortName ??
          normalizedSymbol,
        exchange: snapshot?.exchange ?? quote?.exchange ?? "N/A",
        currentPrice: quote?.price ?? null,
        currency: quote?.currency ?? snapshot?.currency ?? "USD",
        marketCap: quote?.marketCap ?? snapshot?.marketCap,
        sector: snapshot?.sector ?? resolveSector({ ticker: normalizedSymbol }),
        industry: snapshot?.industry,
        website: snapshot?.website,
        employeeCount: snapshot?.employeeCount,
        summary: snapshot?.summary,
        fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
        trailingPE: quote?.trailingPE ?? snapshot?.trailingPE,
        forwardPE: quote?.forwardPE ?? snapshot?.forwardPE,
        dividendYield: snapshot?.dividendYield,
        beta: snapshot?.beta,
        profitMargins: snapshot?.profitMargins,
        revenueGrowth: snapshot?.revenueGrowth,
        earningsGrowth: snapshot?.earningsGrowth,
        debtToEquity: snapshot?.debtToEquity,
        currentRatio: snapshot?.currentRatio,
        quickRatio: snapshot?.quickRatio,
        returnOnEquity: snapshot?.returnOnEquity,
        totalCash: snapshot?.totalCash,
        totalDebt: snapshot?.totalDebt,
        freeCashflow: snapshot?.freeCashflow,
        operatingCashflow: snapshot?.operatingCashflow,
        targetMeanPrice: snapshot?.targetMeanPrice,
        chart: [],
        dataState: quote ? "live" : "unavailable",
        asOf: quote?.asOf ?? null,
        provider: quote || snapshot ? "Yahoo Finance" : null,
        historyDataState: "unavailable",
        historyAsOf: null,
        historyProvider: null
      } satisfies CompanyDetail;
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function fetchSecurityPreview(symbol: string): Promise<SecurityPreview> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const [snapshotResult, quoteResult] = await Promise.allSettled([
    fetchSecuritySnapshot(normalizedSymbol),
    fetchQuote(normalizedSymbol)
  ]);

  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  if (!snapshot) {
    throw new Error(`Yahoo could not validate ${normalizedSymbol}`);
  }

  return {
    symbol: normalizedSymbol,
    companyName: snapshot.companyName,
    exchange: snapshot.exchange,
    quoteType: snapshot.quoteType,
    sector: snapshot.sector,
    industry: snapshot.industry,
    marketCap: quote?.marketCap ?? snapshot.marketCap,
    currentPrice: quote?.price ?? null,
    changePercent: quote?.changePercent ?? null,
    dataStatus: quote ? "full" : "price_unavailable",
    dataState: quote ? "live" : "unavailable",
    asOf: quote?.asOf ?? null,
    provider: quote || snapshot ? "Yahoo Finance" : null
  };
}
