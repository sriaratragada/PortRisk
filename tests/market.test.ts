import assert from "node:assert/strict";
import test from "node:test";

import { CHART_RANGE_CONFIG } from "../lib/market-config.ts";
import {
  buildSyntheticHistorySeries,
  getRangeFromDays,
  normalizeFmpQuote,
  normalizeTimeSeries,
  normalizeTwelveQuote
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

test("normalizeTwelveQuote derives previous close and change percent", () => {
  const quote = normalizeTwelveQuote(
    "AAPL",
    {
      name: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      close: "210.50",
      previous_close: "205.00"
    },
    {
      companyName: "Apple Inc.",
      mktCap: 1000,
      range: "150-220"
    },
    {
      marketCap: 2000,
      peRatio: 31
    }
  );

  assert.equal(quote.ticker, "AAPL");
  assert.equal(quote.price, 210.5);
  assert.equal(quote.previousClose, 205);
  assert.ok(quote.changePercent > 0);
  assert.equal(quote.marketCap, 2000);
  assert.equal(quote.trailingPE, 31);
  assert.equal(quote.fiftyTwoWeekLow, 150);
  assert.equal(quote.fiftyTwoWeekHigh, 220);
});

test("normalizeFmpQuote preserves quote fallback fields when Twelve Data is unavailable", () => {
  const quote = normalizeFmpQuote(
    "NBIS",
    {
      name: "Nebius Group N.V.",
      exchange: "NASDAQ",
      price: 42.5,
      changesPercentage: 2.5,
      marketCap: 123456789,
      pe: 18,
      yearLow: 10,
      yearHigh: 55
    },
    {
      companyName: "Nebius Group N.V.",
      exchangeShortName: "NASDAQ",
      range: "10-55"
    },
    {
      peRatio: 20
    }
  );

  assert.equal(quote.ticker, "NBIS");
  assert.equal(quote.price, 42.5);
  assert.equal(quote.previousClose, 42.5);
  assert.equal(quote.changePercent, 0.025);
  assert.equal(quote.marketCap, 123456789);
  assert.equal(quote.trailingPE, 18);
  assert.equal(quote.fiftyTwoWeekLow, 10);
  assert.equal(quote.fiftyTwoWeekHigh, 55);
});

test("normalizeTimeSeries drops incomplete rows and normalizes datetimes", () => {
  const points = normalizeTimeSeries({
    values: [
      { datetime: "2026-03-11 15:30:00", close: "101.25" },
      { datetime: "2026-03-11", close: "102.50" },
      { datetime: "2026-03-11 15:35:00" }
    ]
  });

  assert.equal(points.length, 2);
  assert.equal(points[0]?.close, 101.25);
  assert.ok(points[0]?.date.endsWith("Z"));
  assert.equal(points[1]?.close, 102.5);
});

test("buildSyntheticHistorySeries creates range-length flat fallback history", () => {
  const points = buildSyntheticHistorySeries(100, "1M", new Date("2026-03-15T00:00:00.000Z"));

  assert.equal(points.length, CHART_RANGE_CONFIG["1M"].outputsize);
  assert.equal(points[0]?.close, 100);
  assert.equal(points.at(-1)?.close, 100);
  assert.ok((points[0]?.date ?? "") < (points.at(-1)?.date ?? ""));
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
  assert.equal(
    resolveSector({ ticker: "XOM", providerSector: "Energy", providerIndustry: "Oil & Gas Integrated" }),
    "Energy"
  );
  assert.equal(
    resolveSector({ ticker: "PFE", providerSector: "Healthcare", providerIndustry: "Drug Manufacturers - General" }),
    "Healthcare"
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
