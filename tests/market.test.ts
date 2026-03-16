import assert from "node:assert/strict";
import test from "node:test";

import { CHART_RANGE_CONFIG } from "../lib/market-config.ts";
import {
  getRangeFromDays,
  normalizeYahooChartPoints,
  normalizeYahooQuote
} from "../lib/market.ts";
import { getDefaultSector, resolveSector } from "../lib/sectors.ts";

test("chart range config maps long ranges to slower intervals", () => {
  assert.equal(CHART_RANGE_CONFIG["1D"].interval, "5min");
  assert.equal(CHART_RANGE_CONFIG["1W"].interval, "1h");
  assert.equal(CHART_RANGE_CONFIG["5Y"].interval, "1week");
  assert.equal(CHART_RANGE_CONFIG.MAX.interval, "1month");
});

test("getRangeFromDays preserves existing compatibility mapping", () => {
  assert.equal(getRangeFromDays(1), "1D");
  assert.equal(getRangeFromDays(5), "1W");
  assert.equal(getRangeFromDays(30), "1M");
  assert.equal(getRangeFromDays(120), "1Y");
  assert.equal(getRangeFromDays(500), "5Y");
  assert.equal(getRangeFromDays(3000), "MAX");
});

test("normalizeYahooQuote maps live Yahoo quote fields into app quote shape", () => {
  const quote = normalizeYahooQuote("AAPL", {
    shortName: "Apple Inc.",
    longName: "Apple Inc.",
    fullExchangeName: "NasdaqGS",
    currency: "USD",
    regularMarketPrice: 252.82,
    regularMarketPreviousClose: 250.12,
    regularMarketChangePercent: 1.079,
    marketCap: 3715929735168,
    trailingPE: 32.002533,
    fiftyTwoWeekLow: 164.08,
    fiftyTwoWeekHigh: 260.1,
    regularMarketTime: new Date("2026-03-16T20:00:00.000Z")
  });

  assert.equal(quote.ticker, "AAPL");
  assert.equal(quote.price, 252.82);
  assert.equal(quote.previousClose, 250.12);
  assert.equal(quote.changePercent, 0.01079);
  assert.equal(quote.marketCap, 3715929735168);
  assert.equal(quote.trailingPE, 32.002533);
  assert.equal(quote.exchange, "NasdaqGS");
  assert.equal(quote.provider, "Yahoo Finance");
  assert.equal(quote.dataState, "live");
});

test("normalizeYahooChartPoints drops incomplete rows and keeps the latest 1D session", () => {
  const points = normalizeYahooChartPoints(
    [
      { date: new Date("2026-03-14T19:30:00.000Z"), close: 100 },
      { date: new Date("2026-03-15T14:30:00.000Z"), close: 101.25 },
      { date: new Date("2026-03-15T14:35:00.000Z"), close: 101.5 },
      { date: new Date("2026-03-15T14:40:00.000Z"), close: null }
    ],
    "1D"
  );

  assert.equal(points.length, 2);
  assert.equal(points[0]?.close, 101.25);
  assert.equal(points[1]?.close, 101.5);
  assert.ok(points.every((point) => point.date.startsWith("2026-03-15")));
});

test("resolveSector maps major operating companies into the fixed taxonomy", () => {
  assert.equal(
    resolveSector({ ticker: "AAPL", providerSector: "Technology", providerIndustry: "Consumer Electronics" }),
    "Technology"
  );
  assert.equal(
    resolveSector({ ticker: "NVDA", providerSector: "Technology", providerIndustry: "Semiconductors" }),
    "Semiconductors"
  );
  assert.equal(
    resolveSector({ ticker: "MSFT", providerSector: "Technology", providerIndustry: "Software - Infrastructure" }),
    "Software"
  );
  assert.equal(
    resolveSector({ ticker: "AMZN", providerSector: "Consumer Cyclical", providerIndustry: "Internet Retail" }),
    "Internet & Digital Platforms"
  );
  assert.equal(
    resolveSector({ ticker: "JPM", providerSector: "Financial Services", providerIndustry: "Banks - Diversified" }),
    "Banks & Insurance"
  );
});

test("resolveSector uses deterministic fallback instead of unclassified", () => {
  assert.equal(
    resolveSector({ ticker: "SPY", quoteType: "ETF", providerSector: "", providerIndustry: "" }),
    "ETFs / Funds / Other"
  );
  assert.equal(
    resolveSector({ ticker: "ZZZZ", providerSector: "", providerIndustry: "", assetClass: "commodities" }),
    "ETFs / Funds / Other"
  );
  assert.equal(getDefaultSector(), "ETFs / Funds / Other");
});
