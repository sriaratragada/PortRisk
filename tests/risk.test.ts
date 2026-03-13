import test from "node:test";
import assert from "node:assert/strict";
import {
  annualizeReturns,
  buildHoldingSnapshots,
  calculateMaximumDrawdown,
  calculateSharpeRatio,
  calculateVaR95,
  classifyRiskTier,
  computeDailyReturns,
  monteCarloDrawdownProbability
} from "../lib/risk.ts";

test("computeDailyReturns derives daily percentage changes", () => {
  const returns = computeDailyReturns([100, 102, 99.96]);
  assert.equal(returns.length, 2);
  assert.ok(Math.abs(returns[0] - 0.02) < 1e-10);
  assert.ok(Math.abs(returns[1] + 0.02) < 1e-10);
});

test("calculateSharpeRatio annualizes return and volatility", () => {
  const dailyReturns = [0.001, 0.002, -0.0005, 0.0015, 0.0007];
  const result = calculateSharpeRatio(dailyReturns);
  assert.ok(result.annualizedReturn > 0);
  assert.ok(result.annualizedStd > 0);
  assert.ok(Number.isFinite(result.sharpe));
});

test("calculateMaximumDrawdown finds peak-to-trough decline", () => {
  const maxDrawdown = calculateMaximumDrawdown([100, 120, 115, 90, 95, 130]);
  assert.ok(Math.abs(maxDrawdown - 0.25) < 1e-10);
});

test("calculateVaR95 returns percentage and dollar terms", () => {
  const { var95, var95Amount } = calculateVaR95([0.01, -0.02, 0.015, -0.01], 100000);
  assert.ok(var95 > 0);
  assert.equal(var95Amount, var95 * 100000);
});

test("classifyRiskTier maps threshold bands correctly", () => {
  assert.equal(classifyRiskTier(1.7, 0.08, 0.03), "LOW");
  assert.equal(classifyRiskTier(1.2, 0.15, 0.08), "MODERATE");
  assert.equal(classifyRiskTier(0.7, 0.3, 0.12), "ELEVATED");
  assert.equal(classifyRiskTier(0.2, 0.4, 0.25), "HIGH");
});

test("monteCarloDrawdownProbability returns bounded horizon probabilities", () => {
  const probabilities = monteCarloDrawdownProbability([0.001, -0.002, 0.0015, 0.0002], 0.1, [63, 126], 150);
  assert.ok(probabilities[63] >= 0 && probabilities[63] <= 1);
  assert.ok(probabilities[126] >= 0 && probabilities[126] <= 1);
});

test("annualizeReturns multiplies mean daily return by trading days", () => {
  const result = annualizeReturns([0.001, 0.002, 0.003]);
  assert.equal(result, 0.002 * 252);
});

test("buildHoldingSnapshots preserves saved holdings when quotes are unavailable", () => {
  const holdings = buildHoldingSnapshots(
    [{ ticker: "AAPL", shares: 10, avgCost: 100, assetClass: "equities" }],
    {}
  );

  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.ticker, "AAPL");
  assert.equal(holdings[0]?.shares, 10);
  assert.equal(holdings[0]?.avgCost, 100);
  assert.equal(holdings[0]?.currentPrice, null);
  assert.equal(holdings[0]?.currentValue, null);
  assert.equal(holdings[0]?.weight, null);
});
