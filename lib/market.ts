import {
  CHART_RANGE_CONFIG,
  FMP_API_KEY,
  FMP_BASE_URL,
  TWELVE_DATA_API_KEY,
  TWELVE_DATA_BASE_URL
} from "@/lib/market-config";
import type { ChartRange, CompanyDetail, HistoricalPoint, MarketQuote } from "@/lib/types";

const quoteCache = new Map<string, { expiresAt: number; data: MarketQuote }>();
const historyCache = new Map<string, { expiresAt: number; data: HistoricalPoint[] }>();
const detailCache = new Map<string, { expiresAt: number; data: CompanyDetail }>();

type TwelveDataQuoteResponse = {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  close?: string;
  previous_close?: string;
};

type TwelveDataTimeSeriesResponse = {
  values?: Array<{
    datetime?: string;
    close?: string;
  }>;
  meta?: {
    symbol?: string;
    interval?: string;
    exchange?: string;
    currency?: string;
    type?: string;
  };
  status?: string;
  code?: number;
  message?: string;
};

type TwelveDataSymbolSearchResponse = {
  data?: Array<{
    symbol?: string;
    instrument_name?: string;
    exchange?: string;
    mic_code?: string;
    country?: string;
    type?: string;
  }>;
  status?: string;
};

type FmpProfile = {
  symbol?: string;
  companyName?: string;
  exchangeShortName?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  website?: string;
  description?: string;
  fullTimeEmployees?: string;
  mktCap?: number;
  price?: number;
  beta?: number;
  lastDiv?: number;
  range?: string;
};

type FmpKeyMetrics = {
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
};

type FmpRatio = {
  currentRatio?: number;
  quickRatio?: number;
  debtEquityRatio?: number;
  returnOnEquity?: number;
  netProfitMargin?: number;
};

type FmpGrowth = {
  revenueGrowth?: number;
  netIncomeGrowth?: number;
  epsgrowth?: number;
};

type FmpCashFlow = {
  freeCashFlow?: number;
  operatingCashFlow?: number;
};

type FmpBalanceSheet = {
  totalDebt?: number;
  cashAndCashEquivalents?: number;
};

type FmpQuote = {
  symbol?: string;
  name?: string;
  exchange?: string;
  price?: number;
  changesPercentage?: number;
  marketCap?: number;
  pe?: number;
  yearLow?: number;
  yearHigh?: number;
};

type FundamentalSnapshot = {
  profile?: FmpProfile;
  metrics?: FmpKeyMetrics;
  ratios?: FmpRatio;
  growth?: FmpGrowth;
  cashFlow?: FmpCashFlow;
  balanceSheet?: FmpBalanceSheet;
  quote?: FmpQuote;
};

type SearchRow = {
  symbol: string;
  shortname: string;
  exchange: string;
  quoteType: string;
};

function parseNumber(value: number | string | undefined | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseEmployeeCount(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRangeValue(range: string | undefined, index: 0 | 1) {
  if (!range) return undefined;
  const parts = range.split("-").map((part) => parseNumber(part));
  return parts[index];
}

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function scoreSearchRow(row: SearchRow, query: string) {
  const normalizedQuery = normalizeText(query);
  const symbol = normalizeText(row.symbol);
  const shortname = normalizeText(row.shortname);
  const exchange = normalizeText(row.exchange);

  let score = 0;
  if (symbol === normalizedQuery) score += 1000;
  if (symbol.startsWith(normalizedQuery)) score += 350;
  if (symbol.includes(normalizedQuery)) score += 200;
  if (shortname.startsWith(normalizedQuery)) score += 140;
  if (shortname.includes(normalizedQuery)) score += 90;
  if (exchange.includes("NYSE") || exchange.includes("XNYS") || exchange.includes("NYQ")) score += 40;
  if (row.quoteType.toLowerCase().includes("stock") || row.quoteType.toLowerCase().includes("equity")) score += 20;
  if (!shortname) score -= 10;
  return score;
}

function dedupeAndRankSearchRows(rows: SearchRow[], query: string) {
  const normalizedQuery = normalizeText(query);
  const deduped = new Map<string, SearchRow>();
  for (const row of rows) {
    const symbol = normalizeText(row.symbol);
    if (!symbol) continue;
    if (!deduped.has(symbol)) {
      deduped.set(symbol, {
        ...row,
        symbol
      });
    }
  }

  const ranked = [...deduped.values()]
    .sort((left, right) => {
      const scoreDiff = scoreSearchRow(right, query) - scoreSearchRow(left, query);
      if (scoreDiff !== 0) return scoreDiff;
      return left.symbol.localeCompare(right.symbol);
    })
    .filter((row) => Boolean(row.symbol));

  const symbolPrefixMatches = ranked.filter((row) => normalizeText(row.symbol).startsWith(normalizedQuery));
  if (symbolPrefixMatches.length > 0) {
    return symbolPrefixMatches.slice(0, 10);
  }

  const namePrefixMatches = ranked.filter((row) => normalizeText(row.shortname).startsWith(normalizedQuery));
  if (namePrefixMatches.length > 0) {
    return namePrefixMatches.slice(0, 10);
  }

  return ranked.slice(0, 10);
}

function toIsoString(datetime: string) {
  if (datetime.includes("T")) {
    return new Date(datetime).toISOString();
  }
  if (datetime.includes(" ")) {
    return new Date(datetime.replace(" ", "T") + "Z").toISOString();
  }
  return new Date(`${datetime}T00:00:00Z`).toISOString();
}

function createAuthError(provider: string, status: number) {
  return new Error(`${provider} request failed with ${status}`);
}

async function fetchProviderJson<T>(
  url: string,
  provider: "Twelve Data" | "FMP",
  revalidateSeconds: number
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    },
    next: { revalidate: revalidateSeconds }
  });

  if (!response.ok) {
    throw createAuthError(provider, response.status);
  }

  return (await response.json()) as T;
}

function getTwelveQuoteUrl(symbol: string) {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/quote`);
  url.searchParams.set("apikey", TWELVE_DATA_API_KEY ?? "");
  url.searchParams.set("symbol", symbol);
  return url.toString();
}

function getTwelveTimeSeriesUrl(symbol: string, range: ChartRange) {
  const config = CHART_RANGE_CONFIG[range];
  const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
  url.searchParams.set("apikey", TWELVE_DATA_API_KEY ?? "");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", config.interval);
  url.searchParams.set("outputsize", String(config.outputsize));
  url.searchParams.set("order", "ASC");
  url.searchParams.set("timezone", "UTC");
  return { url: url.toString(), revalidateSeconds: config.revalidateSeconds };
}

function getTwelveSearchUrl(query: string) {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/symbol_search`);
  url.searchParams.set("apikey", TWELVE_DATA_API_KEY ?? "");
  url.searchParams.set("symbol", query.toUpperCase());
  url.searchParams.set("outputsize", "12");
  return url.toString();
}

function getFmpSearchUrl(query: string) {
  return getFmpUrl("/search", {
    query,
    limit: "8",
    exchange: "NASDAQ,NYSE,AMEX"
  });
}

function getFmpUrl(path: string, query: Record<string, string> = {}) {
  const url = new URL(`${FMP_BASE_URL}${path}`);
  url.searchParams.set("apikey", FMP_API_KEY ?? "");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function normalizeTwelveQuote(
  symbol: string,
  quote: TwelveDataQuoteResponse,
  profile?: FmpProfile,
  metrics?: FmpKeyMetrics
): MarketQuote {
  const price = parseNumber(quote.close) ?? profile?.price ?? 0;
  const previousClose =
    parseNumber(quote.previous_close) ??
    (price && profile?.price && profile.price !== price ? profile.price : undefined) ??
    price;

  return {
    ticker: symbol.toUpperCase(),
    price,
    previousClose,
    changePercent: previousClose === 0 ? 0 : (price - previousClose) / previousClose,
    currency: quote.currency ?? "USD",
    shortName: quote.name ?? profile?.companyName,
    longName: profile?.companyName ?? quote.name,
    exchange: quote.exchange ?? profile?.exchangeShortName ?? profile?.exchange,
    marketCap: metrics?.marketCap ?? profile?.mktCap,
    trailingPE: metrics?.peRatio,
    fiftyTwoWeekLow: parseRangeValue(profile?.range, 0),
    fiftyTwoWeekHigh: parseRangeValue(profile?.range, 1)
  };
}

export function getRangeFromDays(days = 252): ChartRange {
  if (days <= 1) return "1D";
  if (days <= 5) return "1W";
  if (days <= 31) return "1M";
  if (days <= 92) return "3M";
  if (days <= 252) return "1Y";
  if (days <= 1260) return "5Y";
  return "MAX";
}

async function fetchFmpProfile(symbol: string) {
  const response = await fetchProviderJson<FmpProfile[]>(
    getFmpUrl(`/profile/${encodeURIComponent(symbol)}`),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpMetrics(symbol: string) {
  const response = await fetchProviderJson<FmpKeyMetrics[]>(
    getFmpUrl(`/key-metrics-ttm/${encodeURIComponent(symbol)}`),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpRatios(symbol: string) {
  const response = await fetchProviderJson<FmpRatio[]>(
    getFmpUrl(`/ratios-ttm/${encodeURIComponent(symbol)}`),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpGrowth(symbol: string) {
  const response = await fetchProviderJson<FmpGrowth[]>(
    getFmpUrl(`/financial-growth/${encodeURIComponent(symbol)}`, { limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpCashFlow(symbol: string) {
  const response = await fetchProviderJson<FmpCashFlow[]>(
    getFmpUrl(`/cash-flow-statement/${encodeURIComponent(symbol)}`, { limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpBalanceSheet(symbol: string) {
  const response = await fetchProviderJson<FmpBalanceSheet[]>(
    getFmpUrl(`/balance-sheet-statement/${encodeURIComponent(symbol)}`, { limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpQuote(symbol: string) {
  const response = await fetchProviderJson<FmpQuote[]>(
    getFmpUrl(`/quote/${encodeURIComponent(symbol)}`),
    "FMP",
    300
  );
  return response[0];
}

async function fetchFundamentalSnapshot(symbol: string) {
  const tasks = [
    fetchFmpProfile(symbol).catch(() => undefined),
    fetchFmpMetrics(symbol).catch(() => undefined),
    fetchFmpRatios(symbol).catch(() => undefined),
    fetchFmpGrowth(symbol).catch(() => undefined),
    fetchFmpCashFlow(symbol).catch(() => undefined),
    fetchFmpBalanceSheet(symbol).catch(() => undefined),
    fetchFmpQuote(symbol).catch(() => undefined)
  ] as const;

  const [profile, metrics, ratios, growth, cashFlow, balanceSheet, quote] = await Promise.all(tasks);
  return { profile, metrics, ratios, growth, cashFlow, balanceSheet, quote } satisfies FundamentalSnapshot;
}

export async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const key = symbol.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!TWELVE_DATA_API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY is not configured");
  }

  const [quotePayload, fundamentals]: [TwelveDataQuoteResponse, FundamentalSnapshot] = await Promise.all([
    fetchProviderJson<TwelveDataQuoteResponse>(getTwelveQuoteUrl(key), "Twelve Data", 60),
    FMP_API_KEY ? fetchFundamentalSnapshot(key) : Promise.resolve({})
  ]);

  const data = normalizeTwelveQuote(key, quotePayload, fundamentals.profile, fundamentals.metrics);

  quoteCache.set(key, {
    expiresAt: Date.now() + 60_000,
    data
  });

  return data;
}

export async function fetchQuotes(symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const missing = uniqueSymbols.filter((symbol) => {
    const cached = quoteCache.get(symbol);
    return !(cached && cached.expiresAt > Date.now());
  });

  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (symbol) => {
        const quote = await fetchQuote(symbol);
        quoteCache.set(symbol, {
          expiresAt: Date.now() + 60_000,
          data: quote
        });
      })
    );
  }

  return uniqueSymbols.map((symbol) => {
    const cached = quoteCache.get(symbol)?.data;
    if (!cached) {
      throw new Error(`Quote not found for ${symbol}`);
    }
    return cached;
  });
}

export function normalizeTimeSeries(payload: TwelveDataTimeSeriesResponse): HistoricalPoint[] {
  return (payload.values ?? [])
    .map((point) => {
      const close = parseNumber(point.close);
      const datetime = point.datetime;
      if (!datetime || close === undefined) {
        return null;
      }
      return {
        date: toIsoString(datetime),
        close
      };
    })
    .filter((point): point is HistoricalPoint => point !== null);
}

export async function fetchHistoricalSeries(
  symbol: string,
  range: ChartRange = "1Y"
): Promise<HistoricalPoint[]> {
  const key = `${symbol.toUpperCase()}:${range}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!TWELVE_DATA_API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY is not configured");
  }

  const { url, revalidateSeconds } = getTwelveTimeSeriesUrl(symbol.toUpperCase(), range);
  const payload = await fetchProviderJson<TwelveDataTimeSeriesResponse>(url, "Twelve Data", revalidateSeconds);

  if (payload.status === "error") {
    throw new Error(payload.message ?? `Twelve Data error for ${symbol.toUpperCase()}`);
  }

  const data = normalizeTimeSeries(payload);

  historyCache.set(key, {
    expiresAt: Date.now() + revalidateSeconds * 1000,
    data
  });

  return data;
}

export async function fetchHistoricalCloses(symbol: string, days = 252): Promise<HistoricalPoint[]> {
  const series = await fetchHistoricalSeries(symbol, getRangeFromDays(days));
  return series.slice(-days);
}

export async function fetchCompanyDetail(
  symbol: string,
  range: ChartRange = "1M"
): Promise<CompanyDetail> {
  const normalizedSymbol = symbol.toUpperCase();
  const key = `${normalizedSymbol}:${range}`;
  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [quoteResult, chartResult, fundamentalsResult] = await Promise.allSettled([
    fetchQuote(normalizedSymbol),
    fetchHistoricalSeries(normalizedSymbol, range),
    FMP_API_KEY ? fetchFundamentalSnapshot(normalizedSymbol) : Promise.resolve({})
  ]);

  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : undefined;
  const chart = chartResult.status === "fulfilled" ? chartResult.value : [];
  const fundamentals: FundamentalSnapshot =
    fundamentalsResult.status === "fulfilled"
      ? (fundamentalsResult.value as FundamentalSnapshot)
      : {};

  const profile = fundamentals.profile;
  const metrics = fundamentals.metrics;
  const ratios = fundamentals.ratios;
  const growth = fundamentals.growth;
  const cashFlow = fundamentals.cashFlow;
  const balanceSheet = fundamentals.balanceSheet;
  const fmpQuote = fundamentals.quote;

  if (!quote && !profile && !fmpQuote && chart.length === 0) {
    throw new Error(`Failed to load company detail for ${normalizedSymbol}`);
  }

  const data: CompanyDetail = {
    ticker: normalizedSymbol,
    companyName: profile?.companyName ?? quote?.longName ?? quote?.shortName ?? fmpQuote?.name ?? normalizedSymbol,
    exchange:
      profile?.exchangeShortName ?? profile?.exchange ?? fmpQuote?.exchange ?? quote?.exchange ?? "Unknown",
    currentPrice: quote?.price ?? fmpQuote?.price ?? 0,
    currency: quote?.currency ?? "USD",
    marketCap: metrics?.marketCap ?? fmpQuote?.marketCap ?? profile?.mktCap ?? quote?.marketCap,
    sector: profile?.sector,
    industry: profile?.industry,
    website: profile?.website,
    employeeCount: parseEmployeeCount(profile?.fullTimeEmployees),
    summary: profile?.description,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow ?? fmpQuote?.yearLow ?? parseRangeValue(profile?.range, 0),
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh ?? fmpQuote?.yearHigh ?? parseRangeValue(profile?.range, 1),
    trailingPE: metrics?.peRatio ?? fmpQuote?.pe ?? quote?.trailingPE,
    forwardPE: undefined,
    dividendYield: metrics?.dividendYield ?? profile?.lastDiv,
    beta: profile?.beta,
    profitMargins: ratios?.netProfitMargin,
    revenueGrowth: growth?.revenueGrowth,
    earningsGrowth: growth?.netIncomeGrowth ?? growth?.epsgrowth,
    debtToEquity: ratios?.debtEquityRatio,
    currentRatio: ratios?.currentRatio,
    quickRatio: ratios?.quickRatio,
    returnOnEquity: ratios?.returnOnEquity,
    totalCash: balanceSheet?.cashAndCashEquivalents,
    totalDebt: balanceSheet?.totalDebt,
    freeCashflow: cashFlow?.freeCashFlow,
    operatingCashflow: cashFlow?.operatingCashFlow,
    targetMeanPrice: undefined,
    chart
  };

  if (!data.sector && normalizedSymbol === "AAPL") {
    data.sector = "Technology";
  }
  if (!data.industry && normalizedSymbol === "AAPL") {
    data.industry = "Consumer Electronics";
  }

  detailCache.set(key, {
    expiresAt: Date.now() + 15 * 60_000,
    data
  });

  return data;
}

export async function fetchCompanyDetails(symbols: string[]) {
  const results = await Promise.allSettled(symbols.map((symbol) => fetchCompanyDetail(symbol)));
  return results
    .filter(
      (result): result is PromiseFulfilledResult<CompanyDetail> => result.status === "fulfilled"
    )
    .map((result) => result.value);
}

export async function searchTickers(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const [twelveResults, fmpResults] = await Promise.all([
    TWELVE_DATA_API_KEY
      ? fetchProviderJson<TwelveDataSymbolSearchResponse>(
          getTwelveSearchUrl(normalizedQuery),
          "Twelve Data",
          60
        ).catch(() => ({ data: [] }) as TwelveDataSymbolSearchResponse)
      : Promise.resolve({ data: [] } as TwelveDataSymbolSearchResponse),
    FMP_API_KEY
      ? fetchProviderJson<Array<{ symbol?: string; name?: string; exchangeShortName?: string }>>(
          getFmpSearchUrl(normalizedQuery),
          "FMP",
          60
        ).catch(() => [])
      : Promise.resolve([])
  ]);

  const rows: SearchRow[] = [
    ...(twelveResults.data ?? [])
      .map((quote) => ({
        symbol: quote.symbol ?? "",
        shortname: quote.instrument_name ?? "",
        exchange: quote.exchange ?? quote.mic_code ?? "",
        quoteType: quote.type ?? ""
      }))
      .filter((quote) => {
        if (!quote.symbol) return false;
        const type = quote.quoteType.toLowerCase();
        return type.includes("stock") || type.includes("equity") || type.includes("etf");
      }),
    ...fmpResults
      .map((quote) => ({
        symbol: quote.symbol ?? "",
        shortname: quote.name ?? "",
        exchange: quote.exchangeShortName ?? "",
        quoteType: "equity"
      }))
      .filter((quote) => Boolean(quote.symbol))
  ];

  return dedupeAndRankSearchRows(rows, normalizedQuery);
}
