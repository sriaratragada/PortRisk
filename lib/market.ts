import type { ChartRange, CompanyDetail, HistoricalPoint, MarketQuote } from "@/lib/types";

const quoteCache = new Map<string, { expiresAt: number; data: MarketQuote }>();
const historyCache = new Map<string, { expiresAt: number; data: HistoricalPoint[] }>();
const detailCache = new Map<string, { expiresAt: number; data: CompanyDetail }>();

const RANGE_CONFIG: Record<
  ChartRange,
  { yahooRange: string; interval: string; revalidateSeconds: number }
> = {
  "1D": { yahooRange: "1d", interval: "5m", revalidateSeconds: 60 },
  "1W": { yahooRange: "5d", interval: "30m", revalidateSeconds: 120 },
  "1M": { yahooRange: "1mo", interval: "1d", revalidateSeconds: 300 },
  "3M": { yahooRange: "3mo", interval: "1d", revalidateSeconds: 300 },
  "1Y": { yahooRange: "1y", interval: "1d", revalidateSeconds: 900 },
  "5Y": { yahooRange: "5y", interval: "1wk", revalidateSeconds: 1800 },
  MAX: { yahooRange: "max", interval: "1mo", revalidateSeconds: 3600 }
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      currency?: string;
      shortName?: string;
      longName?: string;
      fullExchangeName?: string;
      marketCap?: number;
      trailingPE?: number;
      fiftyTwoWeekLow?: number;
      fiftyTwoWeekHigh?: number;
    }>;
  };
};

type YahooQuoteRow = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
  shortName?: string;
  longName?: string;
  fullExchangeName?: string;
  marketCap?: number;
  trailingPE?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
};

type YahooQuoteSummaryResponse = {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: {
        sector?: string;
        industry?: string;
        website?: string;
        longBusinessSummary?: string;
        fullTimeEmployees?: number;
      };
      price?: {
        shortName?: string;
        longName?: string;
        exchangeName?: string;
        regularMarketPrice?: { raw?: number };
        currency?: string;
      };
      summaryDetail?: {
        fiftyTwoWeekLow?: { raw?: number };
        fiftyTwoWeekHigh?: { raw?: number };
        dividendYield?: { raw?: number };
        beta?: { raw?: number };
        trailingPE?: { raw?: number };
        forwardPE?: { raw?: number };
      };
      defaultKeyStatistics?: {
        marketCap?: { raw?: number };
        enterpriseValue?: { raw?: number };
      };
      financialData?: {
        currentRatio?: { raw?: number };
        quickRatio?: { raw?: number };
        debtToEquity?: { raw?: number };
        revenueGrowth?: { raw?: number };
        earningsGrowth?: { raw?: number };
        profitMargins?: { raw?: number };
        returnOnEquity?: { raw?: number };
        totalCash?: { raw?: number };
        totalDebt?: { raw?: number };
        freeCashflow?: { raw?: number };
        operatingCashflow?: { raw?: number };
        targetMeanPrice?: { raw?: number };
      };
    }>;
  };
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

function getChartUrl(symbol: string, range: string, interval: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", "false");
  return url.toString();
}

function getQuoteSummaryUrl(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
  url.searchParams.set(
    "modules",
    "assetProfile,price,summaryDetail,defaultKeyStatistics,financialData"
  );
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
    currency: String(row.currency ?? "USD"),
    shortName: row.shortName,
    longName: row.longName,
    exchange: row.fullExchangeName,
    marketCap: row.marketCap,
    trailingPE: row.trailingPE,
    fiftyTwoWeekLow: row.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: row.fiftyTwoWeekHigh
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

export async function fetchHistoricalSeries(
  symbol: string,
  range: ChartRange = "1Y"
): Promise<HistoricalPoint[]> {
  const key = `${symbol.toUpperCase()}:${range}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const config = RANGE_CONFIG[range];
  const payload = await fetchJson<YahooChartResponse>(
    getChartUrl(symbol.toUpperCase(), config.yahooRange, config.interval),
    config.revalidateSeconds
  );
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const data = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(),
      close: closes[index]
    }))
    .filter((point): point is { date: string; close: number } => typeof point.close === "number");

  historyCache.set(key, {
    expiresAt: Date.now() + config.revalidateSeconds * 1000,
    data
  });

  return data;
}

export async function fetchHistoricalCloses(symbol: string, days = 252): Promise<HistoricalPoint[]> {
  const range: ChartRange =
    days <= 1 ? "1D" : days <= 5 ? "1W" : days <= 31 ? "1M" : days <= 92 ? "3M" : days <= 252 ? "1Y" : days <= 1260 ? "5Y" : "MAX";
  const series = await fetchHistoricalSeries(symbol, range);
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

  const [summaryPayload, quote, chart] = await Promise.all([
    fetchJson<YahooQuoteSummaryResponse>(getQuoteSummaryUrl(normalizedSymbol), 900),
    fetchQuote(normalizedSymbol),
    fetchHistoricalSeries(normalizedSymbol, range)
  ]);

  const summary = summaryPayload.quoteSummary?.result?.[0];
  if (!summary) {
    throw new Error(`Company detail not found for ${normalizedSymbol}`);
  }

  const data: CompanyDetail = {
    ticker: normalizedSymbol,
    companyName:
      summary.price?.longName ??
      summary.price?.shortName ??
      quote.longName ??
      quote.shortName ??
      normalizedSymbol,
    exchange: summary.price?.exchangeName ?? quote.exchange ?? "Unknown",
    currentPrice: summary.price?.regularMarketPrice?.raw ?? quote.price,
    currency: summary.price?.currency ?? quote.currency,
    marketCap: summary.defaultKeyStatistics?.marketCap?.raw ?? quote.marketCap,
    sector: summary.assetProfile?.sector,
    industry: summary.assetProfile?.industry,
    website: summary.assetProfile?.website,
    employeeCount: summary.assetProfile?.fullTimeEmployees,
    summary: summary.assetProfile?.longBusinessSummary,
    fiftyTwoWeekLow: summary.summaryDetail?.fiftyTwoWeekLow?.raw ?? quote.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: summary.summaryDetail?.fiftyTwoWeekHigh?.raw ?? quote.fiftyTwoWeekHigh,
    trailingPE: summary.summaryDetail?.trailingPE?.raw ?? quote.trailingPE,
    forwardPE: summary.summaryDetail?.forwardPE?.raw,
    dividendYield: summary.summaryDetail?.dividendYield?.raw,
    beta: summary.summaryDetail?.beta?.raw,
    profitMargins: summary.financialData?.profitMargins?.raw,
    revenueGrowth: summary.financialData?.revenueGrowth?.raw,
    earningsGrowth: summary.financialData?.earningsGrowth?.raw,
    debtToEquity: summary.financialData?.debtToEquity?.raw,
    currentRatio: summary.financialData?.currentRatio?.raw,
    quickRatio: summary.financialData?.quickRatio?.raw,
    returnOnEquity: summary.financialData?.returnOnEquity?.raw,
    totalCash: summary.financialData?.totalCash?.raw,
    totalDebt: summary.financialData?.totalDebt?.raw,
    freeCashflow: summary.financialData?.freeCashflow?.raw,
    operatingCashflow: summary.financialData?.operatingCashflow?.raw,
    targetMeanPrice: summary.financialData?.targetMeanPrice?.raw,
    chart
  };

  detailCache.set(key, {
    expiresAt: Date.now() + 15 * 60_000,
    data
  });

  return data;
}

export async function fetchCompanyDetails(symbols: string[]) {
  return Promise.all(symbols.map((symbol) => fetchCompanyDetail(symbol)));
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

  return (result.quotes ?? [])
    .map((quote) => ({
      symbol: quote.symbol ?? "",
      shortname: quote.shortname ?? "",
      exchange: quote.exchange ?? "",
      quoteType: quote.quoteType ?? ""
    }))
    .filter((quote) => quote.symbol && quote.quoteType.toLowerCase().includes("equity"))
    .sort((left, right) => {
      const leftPriority = left.exchange.includes("NYQ") || left.exchange.includes("NYSE") ? 0 : 1;
      const rightPriority = right.exchange.includes("NYQ") || right.exchange.includes("NYSE") ? 0 : 1;
      return leftPriority - rightPriority;
    });
}
