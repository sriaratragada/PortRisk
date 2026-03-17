import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackResearchInsight,
  mapWatchlistItemRow
} from "../lib/research.ts";
import { sortWatchlistItems } from "../lib/research-client.ts";
import type { ResearchFeatureBundle, WatchlistItem } from "../lib/types.ts";

test("mapWatchlistItemRow normalizes persisted watchlist rows", () => {
  const mapped = mapWatchlistItemRow({
    id: "item-1",
    portfolioId: "portfolio-1",
    ticker: "nvda",
    companyName: "NVIDIA Corporation",
    exchange: "NasdaqGS",
    quoteType: "EQUITY",
    sector: "Technology",
    industry: "Semiconductors",
    status: "RESEARCHING",
    conviction: 4,
    targetPrice: 160,
    thesis: "AI spend remains durable.",
    catalysts: "Earnings beat",
    risks: "Valuation compression",
    valuationNotes: "Premium multiple",
    notes: "Watch position sizing",
    sourceType: "related",
    sourceLabel: "Related to MSFT",
    createdAt: "2026-03-17T12:00:00.000Z",
    updatedAt: "2026-03-17T12:30:00.000Z"
  });

  assert.equal(mapped.ticker, "NVDA");
  assert.equal(mapped.sector, "Semiconductors");
  assert.equal(mapped.status, "RESEARCHING");
  assert.equal(mapped.conviction, 4);
});

test("sortWatchlistItems respects status ordering before secondary sort", () => {
  const items: WatchlistItem[] = [
    {
      id: "1",
      portfolioId: "p",
      ticker: "MSFT",
      companyName: "Microsoft",
      exchange: "NasdaqGS",
      quoteType: "EQUITY",
      sector: "Software",
      status: "READY",
      conviction: 5,
      targetPrice: null,
      thesis: "",
      catalysts: "",
      risks: "",
      valuationNotes: "",
      notes: "",
      sourceType: "manual",
      sourceLabel: "Manual",
      createdAt: "2026-03-17T12:00:00.000Z",
      updatedAt: "2026-03-17T12:00:00.000Z"
    },
    {
      id: "2",
      portfolioId: "p",
      ticker: "AAPL",
      companyName: "Apple",
      exchange: "NasdaqGS",
      quoteType: "EQUITY",
      sector: "Technology",
      status: "NEW",
      conviction: 2,
      targetPrice: null,
      thesis: "",
      catalysts: "",
      risks: "",
      valuationNotes: "",
      notes: "",
      sourceType: "manual",
      sourceLabel: "Manual",
      createdAt: "2026-03-17T12:00:00.000Z",
      updatedAt: "2026-03-17T11:00:00.000Z"
    },
    {
      id: "3",
      portfolioId: "p",
      ticker: "JPM",
      companyName: "JPMorgan",
      exchange: "NYSE",
      quoteType: "EQUITY",
      sector: "Banks & Insurance",
      status: "NEW",
      conviction: 5,
      targetPrice: null,
      thesis: "",
      catalysts: "",
      risks: "",
      valuationNotes: "",
      notes: "",
      sourceType: "manual",
      sourceLabel: "Manual",
      createdAt: "2026-03-17T12:00:00.000Z",
      updatedAt: "2026-03-17T12:30:00.000Z"
    }
  ];

  const sorted = sortWatchlistItems(items, "conviction", new Map());
  assert.equal(sorted[0]?.ticker, "JPM");
  assert.equal(sorted[1]?.ticker, "AAPL");
  assert.equal(sorted[2]?.ticker, "MSFT");
});

test("buildFallbackResearchInsight returns structured deterministic memo output", () => {
  const bundle: ResearchFeatureBundle = {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NasdaqGS",
    quoteType: "EQUITY",
    sector: "Technology",
    industry: "Consumer Electronics",
    currentPrice: 210,
    marketCap: 3_000_000_000_000,
    trailingPE: 31,
    forwardPE: 28,
    revenueGrowth: 0.08,
    earningsGrowth: 0.11,
    profitMargins: 0.26,
    returnOnEquity: 0.42,
    debtToEquity: 1.5,
    currentRatio: 0.95,
    quickRatio: 0.9,
    changePercent: 0.012,
    benchmark: "QQQ",
    fitScore: 74,
    diversificationImpact: "Technology already exists in the book, but the weight is still moderate enough to absorb a starter position.",
    concentrationImpact: "At an equal-size starter weight of 20%, this name would remain below the current top holding.",
    benchmarkContext: "QQQ skews toward software, semiconductors, and internet platforms. Technology aligns with that benchmark profile.",
    overlapNote: "Technology sits outside the current top sector stack of Healthcare.",
    starterPositionTopHolding: false,
    topSector: "Healthcare",
    topSectorWeight: 0.28,
    topHoldingTicker: "LLY",
    currentPositions: [{ ticker: "LLY", sector: "Healthcare", weight: 0.28 }],
    missingData: [],
    dataConfidence: "HIGH"
  };

  const insight = buildFallbackResearchInsight(bundle);

  assert.equal(insight.ticker, "AAPL");
  assert.equal(insight.fitScore, 74);
  assert.equal(insight.source, "FALLBACK");
  assert.ok(insight.thesis.length >= 2);
  assert.ok(insight.diligenceQuestions.length >= 3);
});
