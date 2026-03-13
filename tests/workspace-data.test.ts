import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackHoldings } from "../lib/holdings.ts";

test("buildFallbackHoldings keeps saved positions visible in an unpriced state", () => {
  const holdings = buildFallbackHoldings([
    { ticker: "MSFT", shares: 5, avgCost: 250, assetClass: "equities" }
  ]);

  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.ticker, "MSFT");
  assert.equal(holdings[0]?.shares, 5);
  assert.equal(holdings[0]?.avgCost, 250);
  assert.equal(holdings[0]?.currentPrice, null);
  assert.equal(holdings[0]?.dailyPnl, null);
  assert.equal(holdings[0]?.totalGain, null);
});
