import assert from "node:assert/strict";
import test from "node:test";

import { CHART_RANGE_CONFIG } from "../lib/market-config.ts";
import { getRangeFromDays, normalizeTimeSeries, normalizeTwelveQuote } from "../lib/market.ts";

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
