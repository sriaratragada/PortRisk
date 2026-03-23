import assert from "node:assert/strict";
import test from "node:test";

import { buildAllocationRecommendationSet } from "../lib/allocation-recommendations.ts";
import type { HistoricalPoint, HoldingSnapshot, PositionInput } from "../lib/types.ts";

function buildSeries(base: number, drift: number, amplitude: number, length = 90): HistoricalPoint[] {
  const points: HistoricalPoint[] = [];
  let close = base;
  for (let day = 0; day < length; day += 1) {
    const wave = Math.sin(day / 7) * amplitude;
    close *= 1 + drift + wave;
    points.push({
      date: new Date(Date.UTC(2025, 0, day + 1)).toISOString(),
      close: Number(close.toFixed(6))
    });
  }
  return points;
}

const HOLDINGS: HoldingSnapshot[] = [
  {
    ticker: "AAPL",
    shares: 12,
    avgCost: 170,
    currentPrice: 210,
    currentValue: 2520,
    weight: 0.34,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    totalGain: 0,
    totalGainPercent: 0,
    sector: "Technology"
  },
  {
    ticker: "MSFT",
    shares: 8,
    avgCost: 330,
    currentPrice: 430,
    currentValue: 3440,
    weight: 0.26,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    totalGain: 0,
    totalGainPercent: 0,
    sector: "Technology"
  },
  {
    ticker: "JPM",
    shares: 10,
    avgCost: 170,
    currentPrice: 190,
    currentValue: 1900,
    weight: 0.16,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    totalGain: 0,
    totalGainPercent: 0,
    sector: "Banks & Insurance"
  },
  {
    ticker: "UNH",
    shares: 4,
    avgCost: 480,
    currentPrice: 520,
    currentValue: 2080,
    weight: 0.14,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    totalGain: 0,
    totalGainPercent: 0,
    sector: "Healthcare"
  },
  {
    ticker: "CAT",
    shares: 5,
    avgCost: 280,
    currentPrice: 320,
    currentValue: 1600,
    weight: 0.1,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    totalGain: 0,
    totalGainPercent: 0,
    sector: "Industrials"
  }
];

const POSITIONS: PositionInput[] = HOLDINGS.map((holding) => ({
  ticker: holding.ticker,
  shares: holding.shares,
  avgCost: holding.avgCost,
  assetClass: "equities"
}));

const SERIES_BY_SYMBOL = new Map<string, HistoricalPoint[]>([
  ["SPY", buildSeries(100, 0.00055, 0.0012)],
  ["AAPL", buildSeries(110, 0.0009, 0.0016)],
  ["MSFT", buildSeries(115, 0.0008, 0.0013)],
  ["JPM", buildSeries(95, 0.00045, 0.0011)],
  ["UNH", buildSeries(120, 0.0005, 0.001)],
  ["CAT", buildSeries(90, 0.00048, 0.00115)]
]);

test("buildAllocationRecommendationSet is deterministic and constraint-compliant", async () => {
  const fetcher = async (symbol: string, range: "1Y") => ({
    symbol,
    range,
    points: SERIES_BY_SYMBOL.get(symbol) ?? [],
    dataState: "live" as const,
    asOf: "2026-03-20T00:00:00.000Z",
    provider: "Yahoo Finance" as const
  });

  const first = await buildAllocationRecommendationSet({
    positions: POSITIONS,
    holdings: HOLDINGS,
    benchmark: "SPY",
    range: "1Y",
    historyFetcher: fetcher
  });
  const second = await buildAllocationRecommendationSet({
    positions: POSITIONS,
    holdings: HOLDINGS,
    benchmark: "SPY",
    range: "1Y",
    historyFetcher: fetcher
  });

  assert.equal(first.recommendationState, "available");
  assert.equal(first.recommendations.length, 3);
  assert.deepEqual(first, second);

  for (const recommendation of first.recommendations) {
    const totalWeight = recommendation.weights.reduce(
      (sum, row) => sum + row.targetWeight,
      0
    );
    assert.ok(Math.abs(totalWeight - 1) < 1e-6);
    for (const row of recommendation.weights) {
      assert.ok(row.targetWeight >= -1e-9);
      assert.ok(row.targetWeight <= 0.25 + 1e-9);
    }

    const sectorTotals = new Map<string, number>();
    for (const row of recommendation.weights) {
      sectorTotals.set(
        row.sector,
        (sectorTotals.get(row.sector) ?? 0) + row.targetWeight
      );
    }
    for (const total of sectorTotals.values()) {
      assert.ok(total <= 0.4 + 1e-9);
    }

    assert.ok(recommendation.expected.annualVolatility != null);
    assert.ok(recommendation.expected.annualReturn != null);
    assert.ok(recommendation.expected.sharpe != null);
    const expectedSharpe =
      ((recommendation.expected.annualReturn ?? 0) - 0.045) /
      Math.max(recommendation.expected.annualVolatility ?? 1, 1e-9);
    assert.ok(
      Math.abs((recommendation.expected.sharpe ?? 0) - expectedSharpe) < 1e-6
    );
  }
});
