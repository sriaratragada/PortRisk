import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  ChartRange,
  HistoricalPoint,
  HistoricalSeriesResult,
  MarketQuote
} from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUOTE_STALE_TTL_MS = DAY_MS;
const IDENTITY_STALE_TTL_MS = 30 * DAY_MS;

type QuoteCacheRow = {
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: string;
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  provider: "Twelve Data" | "FMP";
  asOf: string;
  fetchedAt: string;
  rawPayload: unknown;
};

type HistoryCacheRow = {
  symbol: string;
  range: ChartRange;
  series: HistoricalPoint[];
  provider: "Twelve Data" | "FMP";
  asOf: string;
  fetchedAt: string;
  seriesStart: string | null;
  seriesEnd: string | null;
  rawPayload: unknown;
};

type IdentityCacheRow<T> = {
  symbol: string;
  provider: "FMP";
  asOf: string;
  fetchedAt: string;
  data: T;
  rawPayload: unknown;
};

function getCacheClient() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

export function getHistoryStaleTtlMs(range: ChartRange) {
  return range === "1D" || range === "1W" ? DAY_MS : 7 * DAY_MS;
}

function isFreshEnough(timestamp: string | null | undefined, ttlMs: number) {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed <= ttlMs;
}

export async function readQuoteCache(symbol: string): Promise<MarketQuote | null> {
  const supabase = getCacheClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("MarketQuoteCache")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();

  if (error || !data || !isFreshEnough(data.asOf, QUOTE_STALE_TTL_MS)) {
    return null;
  }

  const row = data as QuoteCacheRow;
  return {
    ticker: row.symbol,
    price: row.price,
    previousClose: row.previousClose,
    changePercent: row.changePercent,
    currency: row.currency,
    shortName: row.shortName ?? undefined,
    longName: row.longName ?? undefined,
    exchange: row.exchange ?? undefined,
    marketCap: row.marketCap ?? undefined,
    trailingPE: row.trailingPE ?? undefined,
    fiftyTwoWeekLow: row.fiftyTwoWeekLow ?? undefined,
    fiftyTwoWeekHigh: row.fiftyTwoWeekHigh ?? undefined,
    dataState: "stale",
    asOf: row.asOf,
    provider: "cache"
  };
}

export async function writeQuoteCache(quote: MarketQuote, rawPayload: unknown) {
  const supabase = getCacheClient();
  if (!supabase || quote.provider == null || quote.provider === "cache" || !quote.asOf) return;

  await supabase.from("MarketQuoteCache").upsert(
    {
      symbol: quote.ticker.toUpperCase(),
      price: quote.price,
      previousClose: quote.previousClose,
      changePercent: quote.changePercent,
      currency: quote.currency,
      shortName: quote.shortName ?? null,
      longName: quote.longName ?? null,
      exchange: quote.exchange ?? null,
      marketCap: quote.marketCap ?? null,
      trailingPE: quote.trailingPE ?? null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
      provider: quote.provider,
      asOf: quote.asOf,
      fetchedAt: new Date().toISOString(),
      rawPayload
    },
    { onConflict: "symbol" }
  );
}

export async function readHistoryCache(
  symbol: string,
  range: ChartRange
): Promise<HistoricalSeriesResult | null> {
  const supabase = getCacheClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("MarketHistoryCache")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .eq("range", range)
    .maybeSingle();

  if (error || !data || !isFreshEnough(data.asOf, getHistoryStaleTtlMs(range))) {
    return null;
  }

  const row = data as HistoryCacheRow;
  return {
    symbol: row.symbol,
    range: row.range,
    points: Array.isArray(row.series) ? row.series : [],
    dataState: "stale",
    asOf: row.asOf,
    provider: "cache"
  };
}

export async function writeHistoryCache(result: HistoricalSeriesResult, rawPayload: unknown) {
  const supabase = getCacheClient();
  if (
    !supabase ||
    result.provider == null ||
    result.provider === "cache" ||
    result.points.length === 0 ||
    !result.asOf
  ) {
    return;
  }

  await supabase.from("MarketHistoryCache").upsert(
    {
      symbol: result.symbol.toUpperCase(),
      range: result.range,
      series: result.points,
      provider: result.provider,
      asOf: result.asOf,
      fetchedAt: new Date().toISOString(),
      seriesStart: result.points[0]?.date ?? null,
      seriesEnd: result.points[result.points.length - 1]?.date ?? null,
      rawPayload
    },
    { onConflict: "symbol,range" }
  );
}

export async function readIdentityCache<T>(symbol: string): Promise<T | null> {
  const supabase = getCacheClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("SecurityIdentityCache")
    .select("data,asOf")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();

  if (error || !data || !isFreshEnough(data.asOf, IDENTITY_STALE_TTL_MS)) {
    return null;
  }

  return (data as IdentityCacheRow<T>).data;
}

export async function writeIdentityCache<T>(
  symbol: string,
  data: T,
  rawPayload: unknown
) {
  const supabase = getCacheClient();
  if (!supabase) return;

  await supabase.from("SecurityIdentityCache").upsert(
    {
      symbol: symbol.toUpperCase(),
      provider: "FMP",
      asOf: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      data,
      rawPayload
    },
    { onConflict: "symbol" }
  );
}
