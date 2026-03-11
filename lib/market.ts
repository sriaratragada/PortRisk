import type { HistoricalPoint, MarketQuote } from "@/lib/types";

const quoteCache = new Map<string, { expiresAt: number; data: MarketQuote }>();
const historyCache = new Map<string, { expiresAt: number; data: HistoricalPoint[] }>();

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      currency?: string;
    }>;
  };
};

type YahooQuoteRow = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
};

function getQuoteUrl(symbols: string[]) {
  const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  url.searchParams.set("symbols", symbols.join(","));
  return url.toString();
}

function getChartUrl(symbol: string, range: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", "false");
  return url.toString();
}

async function fetchJson<T>(url: string, revalidateSeconds = 60): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: revalidateSeconds }
  });

  if (!response.ok) {
    throw new Error(`Market data request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function toMarketQuote(row: YahooQuoteRow): MarketQuote {
  const price = Number(row.regularMarketPrice ?? 0);
  const previousClose = Number(row.regularMarketPreviousClose ?? price);
  return {
    ticker: String(row.symbol ?? "").toUpperCase(),
    price,
    previousClose,
    changePercent: previousClose === 0 ? 0 : (price - previousClose) / previousClose,
    currency: String(row.currency ?? "USD")
  };
}

export async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const key = symbol.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const payload = await fetchJson<YahooQuoteResponse>(getQuoteUrl([key]));
  const row = payload.quoteResponse?.result?.[0];
  if (!row) {
    throw new Error(`Quote not found for ${key}`);
  }

  const data = toMarketQuote(row);
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
    const payload = await fetchJson<YahooQuoteResponse>(getQuoteUrl(missing));
    const rows = payload.quoteResponse?.result ?? [];
    for (const row of rows) {
      const data = toMarketQuote(row);
      quoteCache.set(data.ticker, {
        expiresAt: Date.now() + 60_000,
        data
      });
    }
  }

  return uniqueSymbols.map((symbol) => {
    const cached = quoteCache.get(symbol)?.data;
    if (!cached) {
      throw new Error(`Quote not found for ${symbol}`);
    }
    return cached;
  });
}

export async function fetchHistoricalCloses(symbol: string, days = 252): Promise<HistoricalPoint[]> {
  const key = `${symbol.toUpperCase()}:${days}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const range = days <= 63 ? "3mo" : days <= 126 ? "6mo" : "1y";
  const payload = await fetchJson<YahooChartResponse>(getChartUrl(symbol.toUpperCase(), range), 300);
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const data = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(),
      close: closes[index]
    }))
    .filter((point): point is { date: string; close: number } => typeof point.close === "number")
    .slice(-days);

  historyCache.set(key, {
    expiresAt: Date.now() + 5 * 60_000,
    data
  });

  return data;
}

export async function searchTickers(query: string) {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "8");
  url.searchParams.set("newsCount", "0");

  const result = await fetchJson<{
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      exchange?: string;
      quoteType?: string;
    }>;
  }>(url.toString(), 60);

  return (result.quotes ?? []).map((quote) => ({
    symbol: quote.symbol ?? "",
    shortname: quote.shortname ?? "",
    exchange: quote.exchange ?? "",
    quoteType: quote.quoteType ?? ""
  }));
}
