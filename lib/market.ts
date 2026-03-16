import {
  CHART_RANGE_CONFIG,
  FMP_API_KEY,
  FMP_BASE_URL,
  TWELVE_DATA_API_KEY,
  TWELVE_DATA_BASE_URL
} from "@/lib/market-config";
import {
  readHistoryCache,
  readIdentityCache,
  readQuoteCache,
  writeHistoryCache,
  writeIdentityCache,
  writeQuoteCache
} from "@/lib/market-cache";
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

const quoteCache = new Map<string, { expiresAt: number; data: MarketQuote }>();
const historyCache = new Map<string, { expiresAt: number; data: HistoricalSeriesResult }>();
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
  isEtf?: boolean;
  isFund?: boolean;
  isAdr?: boolean;
  isActivelyTrading?: boolean;
};

type FmpKeyMetrics = {
  marketCap?: number;
  peRatio?: number;
  peRatioTTM?: number;
  dividendYield?: number;
  dividendYieldPercentageTTM?: number;
  currentRatio?: number;
  currentRatioTTM?: number;
  returnOnEquity?: number;
  returnOnEquityTTM?: number;
};

type FmpRatio = {
  currentRatio?: number;
  currentRatioTTM?: number;
  quickRatio?: number;
  quickRatioTTM?: number;
  debtEquityRatio?: number;
  debtEquityRatioTTM?: number;
  returnOnEquity?: number;
  returnOnEquityTTM?: number;
  netProfitMargin?: number;
  netProfitMarginTTM?: number;
  priceToEarningsRatioTTM?: number;
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

type FmpHistoricalPoint = {
  date?: string;
  close?: number | string;
};

type FmpHistoricalEodResponse =
  | FmpHistoricalPoint[]
  | {
      historical?: FmpHistoricalPoint[];
    };

type FundamentalSnapshot = {
  profile?: FmpProfile;
  metrics?: FmpKeyMetrics;
  annualMetrics?: FmpKeyMetrics;
  ratios?: FmpRatio;
  annualRatios?: FmpRatio;
  growth?: FmpGrowth;
  cashFlow?: FmpCashFlow;
  balanceSheet?: FmpBalanceSheet;
  quote?: FmpQuote;
};

type FmpSearchSymbol = {
  symbol?: string;
  name?: string;
  exchange?: string;
  exchangeFullName?: string;
  type?: string;
  currency?: string;
};

const COMPANY_DETAIL_OVERRIDES: Record<
  string,
  Partial<Pick<CompanyDetail, "industry" | "companyName" | "exchange">>
> = {
  AAPL: {
    companyName: "Apple Inc.",
    industry: "Consumer Electronics",
    exchange: "NASDAQ"
  },
  MSFT: {
    companyName: "Microsoft Corporation",
    industry: "Software - Infrastructure",
    exchange: "NASDAQ"
  },
  NVDA: {
    companyName: "NVIDIA Corporation",
    industry: "Semiconductors",
    exchange: "NASDAQ"
  },
  AMZN: {
    companyName: "Amazon.com, Inc.",
    industry: "Internet Retail",
    exchange: "NASDAQ"
  },
  GOOGL: {
    companyName: "Alphabet Inc.",
    industry: "Internet Content & Information",
    exchange: "NASDAQ"
  },
  GOOG: {
    companyName: "Alphabet Inc.",
    industry: "Internet Content & Information",
    exchange: "NASDAQ"
  },
  META: {
    companyName: "Meta Platforms, Inc.",
    industry: "Internet Content & Information",
    exchange: "NASDAQ"
  },
  TSLA: {
    companyName: "Tesla, Inc.",
    industry: "Auto Manufacturers",
    exchange: "NASDAQ"
  },
  JPM: {
    companyName: "JPMorgan Chase & Co.",
    industry: "Banks - Diversified",
    exchange: "NYSE"
  }
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

function resolveCompanyOverride(symbol: string) {
  return COMPANY_DETAIL_OVERRIDES[symbol.toUpperCase()];
}

function scoreSearchRow(row: SecuritySearchResult, query: string) {
  const normalizedQuery = normalizeText(query);
  const symbol = normalizeText(row.symbol);
  const shortname = normalizeText(row.companyName);
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

function dedupeAndRankSearchRows(rows: SecuritySearchResult[], query: string) {
  const normalizedQuery = normalizeText(query);
  const deduped = new Map<string, SecuritySearchResult>();
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

  const namePrefixMatches = ranked.filter((row) =>
    normalizeText(row.companyName).startsWith(normalizedQuery)
  );
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

function subtractInterval(date: Date, interval: string, steps: number) {
  const next = new Date(date);
  if (interval.endsWith("min")) {
    next.setUTCMinutes(next.getUTCMinutes() - steps * parseInt(interval, 10));
    return next;
  }
  if (interval.endsWith("h")) {
    next.setUTCHours(next.getUTCHours() - steps * parseInt(interval, 10));
    return next;
  }
  if (interval.endsWith("day")) {
    next.setUTCDate(next.getUTCDate() - steps * parseInt(interval, 10));
    return next;
  }
  if (interval.endsWith("week")) {
    next.setUTCDate(next.getUTCDate() - steps * 7 * parseInt(interval, 10));
    return next;
  }
  if (interval.endsWith("month")) {
    next.setUTCMonth(next.getUTCMonth() - steps * parseInt(interval, 10));
    return next;
  }
  return next;
}

function createAuthError(provider: string, status: number) {
  return new Error(`${provider} request failed with ${status}`);
}

function parseProviderError(payload: unknown, provider: "Twelve Data" | "FMP") {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (provider === "FMP") {
    const message =
      (typeof candidate["Error Message"] === "string" && candidate["Error Message"]) ||
      (typeof candidate.error === "string" && candidate.error) ||
      (typeof candidate.message === "string" && candidate.message);
    if (message) {
      return new Error(message);
    }
  }

  if (
    typeof candidate.status === "string" &&
    candidate.status.toLowerCase() === "error"
  ) {
    const message =
      (typeof candidate.message === "string" && candidate.message) ||
      `${provider} request failed`;
    return new Error(message);
  }

  return null;
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

  const payload = (await response.json()) as T;
  const parsedError = parseProviderError(payload, provider);
  if (parsedError) {
    throw parsedError;
  }
  return payload;
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

function getRangeLookbackDays(range: ChartRange) {
  switch (range) {
    case "1D":
      return 2;
    case "1W":
      return 7;
    case "1M":
      return 31;
    case "3M":
      return 93;
    case "1Y":
      return 366;
    case "5Y":
      return 366 * 5;
    case "MAX":
      return null;
  }
}

function getFmpHistoricalUrl(symbol: string, range: ChartRange) {
  if (range === "1D" || range === "1W") {
    const to = new Date();
    const from = subtractInterval(to, "day", getRangeLookbackDays(range) ?? 7);
    return getFmpUrl(`/historical-chart/1hour`, {
      symbol,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10)
    });
  }

  const lookbackDays = getRangeLookbackDays(range);
  const query: Record<string, string> = { symbol };
  if (lookbackDays != null) {
    const to = new Date();
    const from = subtractInterval(to, "day", lookbackDays);
    query.from = from.toISOString().slice(0, 10);
    query.to = to.toISOString().slice(0, 10);
  }

  return getFmpUrl(`/historical-price-eod/full`, query);
}

function getFmpSearchUrl(query: string) {
  return getFmpUrl("/search-symbol", {
    query,
    limit: "12"
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

function buildQuoteType(input: {
  isEtf?: boolean;
  isFund?: boolean;
  sector?: string;
  type?: string;
}) {
  if (input.isEtf) return "ETF";
  if (input.isFund) return "Fund";
  if (input.type) return input.type;
  if (input.sector) return "Equity";
  return "Security";
}

function buildResolvedSector(input: {
  ticker: string;
  providerSector?: string;
  providerIndustry?: string;
  quoteType?: string;
  assetClass?: string;
}) {
  return resolveSector({
    ticker: input.ticker,
    providerSector: input.providerSector,
    providerIndustry: input.providerIndustry,
    quoteType: input.quoteType,
    assetClass: input.assetClass
  });
}

function buildSecuritySearchRow(
  symbol: string,
  companyName: string,
  exchange: string,
  quoteType: string,
  sector?: SecuritySearchResult["sector"]
): SecuritySearchResult {
  return {
    symbol: symbol.toUpperCase(),
    companyName,
    exchange,
    quoteType,
    sector,
    hasPreviewData: true
  };
}

function firstDefined<T>(...values: Array<T | undefined | null>) {
  for (const value of values) {
    if (value != null) {
      return value;
    }
  }
  return undefined;
}

function isUsableQuote(quote: MarketQuote | null | undefined) {
  return Boolean(quote && Number.isFinite(quote.price) && quote.price > 0);
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
    fiftyTwoWeekHigh: parseRangeValue(profile?.range, 1),
    dataState: "live",
    asOf: new Date().toISOString(),
    provider: "Twelve Data"
  };
}

export function normalizeFmpQuote(
  symbol: string,
  quote?: FmpQuote,
  profile?: FmpProfile,
  metrics?: FmpKeyMetrics
): MarketQuote {
  const price = quote?.price ?? profile?.price ?? 0;
  const trailingPE = firstDefined(
    quote?.pe,
    metrics?.peRatio,
    metrics?.peRatioTTM
  );

  return {
    ticker: symbol.toUpperCase(),
    price,
    previousClose: price,
    changePercent: parseNumber(quote?.changesPercentage) != null
      ? (parseNumber(quote?.changesPercentage) as number) / 100
      : 0,
    currency: "USD",
    shortName: quote?.name ?? profile?.companyName,
    longName: profile?.companyName ?? quote?.name,
    exchange: quote?.exchange ?? profile?.exchangeShortName ?? profile?.exchange,
    marketCap: firstDefined(quote?.marketCap, metrics?.marketCap, profile?.mktCap),
    trailingPE,
    fiftyTwoWeekLow: quote?.yearLow ?? parseRangeValue(profile?.range, 0),
    fiftyTwoWeekHigh: quote?.yearHigh ?? parseRangeValue(profile?.range, 1),
    dataState: "live",
    asOf: new Date().toISOString(),
    provider: "FMP"
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
    getFmpUrl(`/key-metrics-ttm`, { symbol }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpAnnualMetrics(symbol: string) {
  const response = await fetchProviderJson<FmpKeyMetrics[]>(
    getFmpUrl(`/key-metrics`, { symbol, limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpRatios(symbol: string) {
  const response = await fetchProviderJson<FmpRatio[]>(
    getFmpUrl(`/ratios-ttm`, { symbol }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpAnnualRatios(symbol: string) {
  const response = await fetchProviderJson<FmpRatio[]>(
    getFmpUrl(`/ratios`, { symbol, limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpGrowth(symbol: string) {
  const response = await fetchProviderJson<FmpGrowth[]>(
    getFmpUrl(`/financial-growth`, { symbol, limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpCashFlow(symbol: string) {
  const response = await fetchProviderJson<FmpCashFlow[]>(
    getFmpUrl(`/cash-flow-statement`, { symbol, limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpBalanceSheet(symbol: string) {
  const response = await fetchProviderJson<FmpBalanceSheet[]>(
    getFmpUrl(`/balance-sheet-statement`, { symbol, limit: "1" }),
    "FMP",
    900
  );
  return response[0];
}

async function fetchFmpQuote(symbol: string) {
  const response = await fetchProviderJson<FmpQuote[]>(
    getFmpUrl(`/quote`, { symbol }),
    "FMP",
    300
  );
  return response[0];
}

async function fetchFundamentalSnapshot(symbol: string) {
  const tasks = [
    fetchFmpProfile(symbol).catch(() => undefined),
    fetchFmpMetrics(symbol).catch(() => undefined),
    fetchFmpAnnualMetrics(symbol).catch(() => undefined),
    fetchFmpRatios(symbol).catch(() => undefined),
    fetchFmpAnnualRatios(symbol).catch(() => undefined),
    fetchFmpGrowth(symbol).catch(() => undefined),
    fetchFmpCashFlow(symbol).catch(() => undefined),
    fetchFmpBalanceSheet(symbol).catch(() => undefined),
    fetchFmpQuote(symbol).catch(() => undefined)
  ] as const;

  const [profile, metrics, annualMetrics, ratios, annualRatios, growth, cashFlow, balanceSheet, quote] =
    await Promise.all(tasks);
  return {
    profile,
    metrics,
    annualMetrics,
    ratios,
    annualRatios,
    growth,
    cashFlow,
    balanceSheet,
    quote
  } satisfies FundamentalSnapshot;
}

export async function fetchSecurityIdentity(symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const override = resolveCompanyOverride(normalizedSymbol);

  const buildIdentitySnapshot = (fundamentals: FundamentalSnapshot) => {
    const profile = fundamentals.profile;
    const quote = fundamentals.quote;
    const quoteType = buildQuoteType({
      isEtf: profile?.isEtf,
      isFund: profile?.isFund,
      sector: profile?.sector
    });
    const sector = buildResolvedSector({
      ticker: normalizedSymbol,
      providerSector: profile?.sector,
      providerIndustry: profile?.industry ?? override?.industry,
      quoteType
    });

    return {
      symbol: normalizedSymbol,
      companyName: profile?.companyName ?? quote?.name ?? override?.companyName ?? normalizedSymbol,
      exchange:
        profile?.exchangeShortName ?? profile?.exchange ?? quote?.exchange ?? override?.exchange ?? "Unknown",
      quoteType,
      sector,
      industry: profile?.industry ?? override?.industry,
      marketCap: firstDefined(
        fundamentals.metrics?.marketCap,
        fundamentals.annualMetrics?.marketCap,
        quote?.marketCap,
        profile?.mktCap
      ),
      profile,
      metrics: fundamentals.metrics,
      annualMetrics: fundamentals.annualMetrics,
      ratios: fundamentals.ratios,
      annualRatios: fundamentals.annualRatios,
      growth: fundamentals.growth,
      cashFlow: fundamentals.cashFlow,
      balanceSheet: fundamentals.balanceSheet,
      quote
    };
  };

  if (FMP_API_KEY) {
    const fundamentals: FundamentalSnapshot = await fetchFundamentalSnapshot(normalizedSymbol).catch(
      () => ({})
    );
    if (fundamentals.profile || fundamentals.quote) {
      const snapshot = buildIdentitySnapshot(fundamentals);
      await writeIdentityCache(normalizedSymbol, snapshot, fundamentals).catch(() => undefined);
      return snapshot;
    }
  }

  const cached = await readIdentityCache<ReturnType<typeof buildIdentitySnapshot>>(normalizedSymbol).catch(
    () => null
  );
  if (cached) {
    return cached;
  }

  throw new Error(`Failed to load security identity for ${normalizedSymbol}`);
}

export async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const key = symbol.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const identity = await fetchSecurityIdentity(key).catch(() => null);

  let data: MarketQuote | null = null;
  let rawPayload: unknown = null;

  if (TWELVE_DATA_API_KEY) {
    try {
      const quotePayload = await fetchProviderJson<TwelveDataQuoteResponse>(
        getTwelveQuoteUrl(key),
        "Twelve Data",
        60
      );
      const normalized = normalizeTwelveQuote(
        key,
        quotePayload,
        identity?.profile,
        identity?.metrics
      );
      if (isUsableQuote(normalized)) {
        data = normalized;
        rawPayload = quotePayload;
      }
    } catch {
      data = null;
    }
  }

  if (!data && FMP_API_KEY) {
    try {
      const fmpQuote = await fetchFmpQuote(key);
      const normalized = normalizeFmpQuote(key, fmpQuote, identity?.profile, identity?.metrics);
      if (isUsableQuote(normalized)) {
        data = normalized;
        rawPayload = fmpQuote;
      }
    } catch {
      data = null;
    }
  }

  if (!data) {
    data = await readQuoteCache(key);
  }

  if (!data || !isUsableQuote(data)) {
    throw new Error(`Failed to load quote for ${key}`);
  }

  quoteCache.set(key, {
    expiresAt: Date.now() + 60_000,
    data
  });

  if (data.provider !== "cache") {
    await writeQuoteCache(data, rawPayload).catch(() => undefined);
  }

  return data;
}

export async function fetchQuotes(symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const missing = uniqueSymbols.filter((symbol) => {
    const cached = quoteCache.get(symbol);
    return !(cached && cached.expiresAt > Date.now());
  });

  if (missing.length > 0) {
    await Promise.allSettled(
      missing.map(async (symbol) => {
        const quote = await fetchQuote(symbol);
        quoteCache.set(symbol, {
          expiresAt: Date.now() + 60_000,
          data: quote
        });
      })
    );
  }

  const results = await Promise.allSettled(
    uniqueSymbols.map(async (symbol) => {
      const memory = quoteCache.get(symbol)?.data;
      if (memory) return memory;
      return fetchQuote(symbol);
    })
  );

  return results
    .filter((result): result is PromiseFulfilledResult<MarketQuote> => result.status === "fulfilled")
    .map((result) => result.value);
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

function normalizeFmpHistoricalSeries(
  payload: FmpHistoricalEodResponse,
  range: ChartRange
): HistoricalPoint[] {
  const rows = Array.isArray(payload) ? payload : payload.historical ?? [];
  const points = rows
    .map((point) => {
      const close = parseNumber(point.close);
      const date = point.date;
      if (!date || close == null) {
        return null;
      }
      return {
        date: toIsoString(date),
        close
      };
    })
    .filter((point): point is HistoricalPoint => point !== null)
    .sort((left, right) => left.date.localeCompare(right.date));

  const outputsize = CHART_RANGE_CONFIG[range].outputsize;
  return points.slice(-outputsize);
}

async function fetchFmpHistoricalSeries(
  symbol: string,
  range: ChartRange
): Promise<HistoricalSeriesResult> {
  const rawPayload = await fetchProviderJson<FmpHistoricalEodResponse>(
    getFmpHistoricalUrl(symbol.toUpperCase(), range),
    "FMP",
    CHART_RANGE_CONFIG[range].revalidateSeconds
  );
  const points = normalizeFmpHistoricalSeries(rawPayload, range);
  return {
    symbol: symbol.toUpperCase(),
    range,
    points,
    dataState: "live",
    asOf: new Date().toISOString(),
    provider: "FMP"
  };
}

export async function fetchHistoricalSeriesResult(
  symbol: string,
  range: ChartRange = "1Y"
): Promise<HistoricalSeriesResult> {
  const key = `${symbol.toUpperCase()}:${range}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const upperSymbol = symbol.toUpperCase();
  const { url, revalidateSeconds } = getTwelveTimeSeriesUrl(upperSymbol, range);
  let result: HistoricalSeriesResult | null = null;
  let rawPayload: unknown = null;

  if (TWELVE_DATA_API_KEY) {
    try {
      const payload = await fetchProviderJson<TwelveDataTimeSeriesResponse>(
        url,
        "Twelve Data",
        revalidateSeconds
      );

      const points = normalizeTimeSeries(payload);
      if (points.length > 0) {
        result = {
          symbol: upperSymbol,
          range,
          points,
          dataState: "live",
          asOf: new Date().toISOString(),
          provider: "Twelve Data"
        };
        rawPayload = payload;
      }
    } catch {
      result = null;
    }
  }

  if (!result && FMP_API_KEY) {
    try {
      const fmpResult = await fetchFmpHistoricalSeries(upperSymbol, range);
      if (fmpResult.points.length > 0) {
        result = fmpResult;
        rawPayload = fmpResult.points;
      }
    } catch {
      result = null;
    }
  }

  if (!result) {
    result = await readHistoryCache(upperSymbol, range);
  }

  if (!result || result.points.length === 0) {
    return {
      symbol: upperSymbol,
      range,
      points: [],
      dataState: "unavailable",
      asOf: null,
      provider: null
    };
  }

  historyCache.set(key, {
    expiresAt: Date.now() + revalidateSeconds * 1000,
    data: result
  });

  if (result.provider !== "cache") {
    await writeHistoryCache(result, rawPayload).catch(() => undefined);
  }

  return result;
}

export async function fetchHistoricalSeries(
  symbol: string,
  range: ChartRange = "1Y"
): Promise<HistoricalPoint[]> {
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
  const normalizedSymbol = symbol.toUpperCase();
  const key = `${normalizedSymbol}:${range}`;
  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [quoteResult, chartResult, identityResult] = await Promise.allSettled([
    fetchQuote(normalizedSymbol),
    fetchHistoricalSeriesResult(normalizedSymbol, range),
    fetchSecurityIdentity(normalizedSymbol)
  ]);

  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : undefined;
  const history = chartResult.status === "fulfilled" ? chartResult.value : null;
  const chart = history?.points ?? [];
  const identity = identityResult.status === "fulfilled" ? identityResult.value : null;

  if (!quote && !identity && chart.length === 0) {
    throw new Error(`Failed to load company detail for ${normalizedSymbol}`);
  }

  const data: CompanyDetail = {
    ticker: normalizedSymbol,
    companyName: identity?.companyName ?? quote?.longName ?? quote?.shortName ?? normalizedSymbol,
    exchange: identity?.exchange ?? quote?.exchange ?? "Unknown",
    currentPrice: quote?.price ?? null,
    currency: quote?.currency ?? "USD",
    marketCap: identity?.marketCap ?? quote?.marketCap,
    sector: identity?.sector ?? buildResolvedSector({ ticker: normalizedSymbol, quoteType: identity?.quoteType }),
    industry: identity?.industry,
    website: identity?.profile?.website,
    employeeCount: parseEmployeeCount(identity?.profile?.fullTimeEmployees),
    summary: identity?.profile?.description,
    fiftyTwoWeekLow:
      quote?.fiftyTwoWeekLow ??
      identity?.quote?.yearLow ??
      parseRangeValue(identity?.profile?.range, 0),
    fiftyTwoWeekHigh:
      quote?.fiftyTwoWeekHigh ??
      identity?.quote?.yearHigh ??
      parseRangeValue(identity?.profile?.range, 1),
    trailingPE: firstDefined(
      identity?.metrics?.peRatio,
      identity?.metrics?.peRatioTTM,
      identity?.ratios?.priceToEarningsRatioTTM,
      identity?.quote?.pe,
      quote?.trailingPE
    ),
    forwardPE: undefined,
    dividendYield: firstDefined(
      identity?.metrics?.dividendYield,
      identity?.metrics?.dividendYieldPercentageTTM,
      identity?.profile?.lastDiv
    ),
    beta: identity?.profile?.beta,
    profitMargins: firstDefined(
      identity?.ratios?.netProfitMargin,
      identity?.ratios?.netProfitMarginTTM,
      identity?.annualRatios?.netProfitMargin
    ),
    revenueGrowth: identity?.growth?.revenueGrowth,
    earningsGrowth: identity?.growth?.netIncomeGrowth ?? identity?.growth?.epsgrowth,
    debtToEquity: firstDefined(
      identity?.ratios?.debtEquityRatio,
      identity?.ratios?.debtEquityRatioTTM,
      identity?.annualRatios?.debtEquityRatio
    ),
    currentRatio: firstDefined(
      identity?.ratios?.currentRatio,
      identity?.ratios?.currentRatioTTM,
      identity?.metrics?.currentRatio,
      identity?.metrics?.currentRatioTTM,
      identity?.annualRatios?.currentRatio,
      identity?.annualMetrics?.currentRatio
    ),
    quickRatio: firstDefined(
      identity?.ratios?.quickRatio,
      identity?.ratios?.quickRatioTTM,
      identity?.annualRatios?.quickRatio
    ),
    returnOnEquity: firstDefined(
      identity?.ratios?.returnOnEquity,
      identity?.ratios?.returnOnEquityTTM,
      identity?.metrics?.returnOnEquity,
      identity?.metrics?.returnOnEquityTTM,
      identity?.annualRatios?.returnOnEquity,
      identity?.annualMetrics?.returnOnEquity
    ),
    totalCash: identity?.balanceSheet?.cashAndCashEquivalents,
    totalDebt: identity?.balanceSheet?.totalDebt,
    freeCashflow: identity?.cashFlow?.freeCashFlow,
    operatingCashflow: identity?.cashFlow?.operatingCashFlow,
    targetMeanPrice: undefined,
    chart,
    dataState: quote?.dataState ?? "unavailable",
    asOf: quote?.asOf ?? null,
    provider: quote?.provider ?? null,
    historyDataState: history?.dataState ?? "unavailable",
    historyAsOf: history?.asOf ?? null,
    historyProvider: history?.provider ?? null
  };

  detailCache.set(key, {
    expiresAt: Date.now() + 15 * 60_000,
    data
  });

  return data;
}

export async function fetchCompanyDetails(symbols: string[]) {
  const results = await Promise.allSettled(
    symbols.map(async (symbol): Promise<CompanyDetail> => {
      const identity = await fetchSecurityIdentity(symbol);
      return {
        ticker: identity.symbol,
        companyName: identity.companyName,
        exchange: identity.exchange,
        currentPrice: null,
        currency: "USD",
        marketCap: identity.marketCap,
        sector: identity.sector,
        industry: identity.industry,
        website: identity.profile?.website,
        employeeCount: parseEmployeeCount(identity.profile?.fullTimeEmployees),
        summary: identity.profile?.description,
        fiftyTwoWeekLow: identity.quote?.yearLow ?? parseRangeValue(identity.profile?.range, 0),
        fiftyTwoWeekHigh: identity.quote?.yearHigh ?? parseRangeValue(identity.profile?.range, 1),
        trailingPE: firstDefined(
          identity.metrics?.peRatio,
          identity.metrics?.peRatioTTM,
          identity.ratios?.priceToEarningsRatioTTM,
          identity.quote?.pe
        ),
        forwardPE: undefined,
        dividendYield: firstDefined(
          identity.metrics?.dividendYield,
          identity.metrics?.dividendYieldPercentageTTM,
          identity.profile?.lastDiv
        ),
        beta: identity.profile?.beta,
        profitMargins: firstDefined(
          identity.ratios?.netProfitMargin,
          identity.ratios?.netProfitMarginTTM,
          identity.annualRatios?.netProfitMargin
        ),
        revenueGrowth: identity.growth?.revenueGrowth,
        earningsGrowth: identity.growth?.netIncomeGrowth ?? identity.growth?.epsgrowth,
        debtToEquity: firstDefined(
          identity.ratios?.debtEquityRatio,
          identity.ratios?.debtEquityRatioTTM,
          identity.annualRatios?.debtEquityRatio
        ),
        currentRatio: firstDefined(
          identity.ratios?.currentRatio,
          identity.ratios?.currentRatioTTM,
          identity.metrics?.currentRatio,
          identity.metrics?.currentRatioTTM,
          identity.annualRatios?.currentRatio,
          identity.annualMetrics?.currentRatio
        ),
        quickRatio: firstDefined(
          identity.ratios?.quickRatio,
          identity.ratios?.quickRatioTTM,
          identity.annualRatios?.quickRatio
        ),
        returnOnEquity: firstDefined(
          identity.ratios?.returnOnEquity,
          identity.ratios?.returnOnEquityTTM,
          identity.metrics?.returnOnEquity,
          identity.metrics?.returnOnEquityTTM,
          identity.annualRatios?.returnOnEquity,
          identity.annualMetrics?.returnOnEquity
        ),
        totalCash: identity.balanceSheet?.cashAndCashEquivalents,
        totalDebt: identity.balanceSheet?.totalDebt,
        freeCashflow: identity.cashFlow?.freeCashFlow,
        operatingCashflow: identity.cashFlow?.operatingCashFlow,
        targetMeanPrice: undefined,
        chart: [],
        dataState: "unavailable" as const,
        asOf: null,
        provider: null,
        historyDataState: "unavailable" as const,
        historyAsOf: null,
        historyProvider: null
      };
    })
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<CompanyDetail> => result.status === "fulfilled"
    )
    .map((result) => result.value);
}

export async function fetchSecurityPreview(symbol: string): Promise<SecurityPreview> {
  const normalizedSymbol = symbol.toUpperCase();
  const [identityResult, quoteResult] = await Promise.allSettled([
    fetchSecurityIdentity(normalizedSymbol),
    fetchQuote(normalizedSymbol)
  ]);

  if (identityResult.status !== "fulfilled") {
    throw new Error(`Failed to load security preview for ${normalizedSymbol}`);
  }

  const identity = identityResult.value;
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const dataStatus: SecurityPreview["dataStatus"] = quote
    ? "full"
    : identity.companyName
      ? "price_unavailable"
      : "identity_only";

  return {
    symbol: identity.symbol,
    companyName: identity.companyName,
    exchange: identity.exchange,
    quoteType: identity.quoteType,
    sector: identity.sector,
    industry: identity.industry,
    marketCap: identity.marketCap,
    currentPrice: quote?.price ?? null,
    changePercent: quote?.changePercent ?? null,
    dataStatus,
    dataState: quote?.dataState ?? "unavailable",
    asOf: quote?.asOf ?? null,
    provider: quote?.provider ?? null
  };
}

export async function searchTickers(query: string): Promise<SecuritySearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const fmpResults = FMP_API_KEY
    ? await fetchProviderJson<FmpSearchSymbol[]>(
        getFmpSearchUrl(normalizedQuery),
        "FMP",
        60
      ).catch(() => [])
    : [];

  const rows = fmpResults
    .map((quote) => {
      const symbol = quote.symbol?.trim().toUpperCase();
      const companyName = quote.name?.trim() ?? "";
      if (!symbol || !companyName) return null;
      return buildSecuritySearchRow(
        symbol,
        companyName,
        quote.exchange ?? quote.exchangeFullName ?? "US",
        buildQuoteType({ type: quote.type, sector: "equity" })
      );
    })
    .filter((row): row is SecuritySearchResult => row !== null);

  return dedupeAndRankSearchRows(rows, normalizedQuery);
}
