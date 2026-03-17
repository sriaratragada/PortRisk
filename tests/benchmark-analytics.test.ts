import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBenchmarkAnalyticsFromData
} from "../lib/benchmark-analytics.ts";
import {
  defaultBenchmarkForPortfolio
} from "../lib/benchmarks.ts";

test("defaultBenchmarkForPortfolio maps strategy sleeves to expected benchmarks", () => {
  assert.equal(defaultBenchmarkForPortfolio("Growth"), "QQQ");
  assert.equal(defaultBenchmarkForPortfolio("Income"), "SCHD");
  assert.equal(defaultBenchmarkForPortfolio("Balanced"), "AOR");
  assert.equal(defaultBenchmarkForPortfolio("Defensive/Conservative"), "AGG");
  assert.equal(defaultBenchmarkForPortfolio("Speculative"), "ARKK");
  assert.equal(defaultBenchmarkForPortfolio("Custom Sleeve"), "SPY");
  assert.equal(defaultBenchmarkForPortfolio("Anything", "vti"), "VTI");
});

test("buildBenchmarkAnalyticsFromData computes deterministic benchmark stats and attribution", () => {
  const analytics = buildBenchmarkAnalyticsFromData({
    benchmark: "QQQ",
    portfolioSeries: [
      { date: "2026-01-01T00:00:00.000Z", value: 100 },
      { date: "2026-01-02T00:00:00.000Z", value: 110 },
      { date: "2026-01-03T00:00:00.000Z", value: 108 }
    ],
    benchmarkSeries: [
      { date: "2026-01-01T00:00:00.000Z", close: 100 },
      { date: "2026-01-02T00:00:00.000Z", close: 104 },
      { date: "2026-01-03T00:00:00.000Z", close: 106 }
    ],
    holdings: [
      {
        ticker: "AAPL",
        companyName: "Apple Inc.",
        sector: "Technology",
        shares: 60,
        points: [
          { date: "2026-01-01T00:00:00.000Z", close: 1 },
          { date: "2026-01-02T00:00:00.000Z", close: 1.15 },
          { date: "2026-01-03T00:00:00.000Z", close: 1.2 }
        ]
      },
      {
        ticker: "MSFT",
        companyName: "Microsoft Corporation",
        sector: "Software",
        shares: 40,
        points: [
          { date: "2026-01-01T00:00:00.000Z", close: 1 },
          { date: "2026-01-02T00:00:00.000Z", close: 0.98 },
          { date: "2026-01-03T00:00:00.000Z", close: 0.9 }
        ]
      }
    ],
    dataState: "live",
    asOf: "2026-01-03T00:00:00.000Z",
    provider: "Yahoo Finance"
  });

  assert.equal(analytics.benchmark, "QQQ");
  assert.ok(Math.abs((analytics.portfolioReturn ?? 0) - 0.08) < 1e-10);
  assert.ok(Math.abs((analytics.benchmarkReturn ?? 0) - 0.06) < 1e-10);
  assert.ok(Math.abs((analytics.excessReturn ?? 0) - 0.02) < 1e-10);
  assert.equal(analytics.holdingAttribution.length, 2);
  assert.equal(analytics.holdingAttribution[0]?.ticker, "AAPL");
  assert.ok(Math.abs((analytics.holdingAttribution[0]?.contribution ?? 0) - 0.12) < 1e-10);
  assert.equal(analytics.sectorAttribution[0]?.sector, "Technology");
  assert.ok(Math.abs((analytics.sectorAttribution[0]?.contribution ?? 0) - 0.12) < 1e-10);
  assert.equal(analytics.relativeMode, "return_only");
  assert.equal(analytics.benchmarkAvailable, true);
  assert.equal(analytics.provider, "Yahoo Finance");
});
