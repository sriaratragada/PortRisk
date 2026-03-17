import { z } from "zod";

export const assetClassSchema = z.enum(["equities", "bonds", "commodities"]);

export const positionSchema = z.object({
  ticker: z.string().trim().min(1).max(12),
  shares: z.number().positive(),
  avgCost: z.number().positive(),
  assetClass: assetClassSchema.optional().default("equities")
});

export const portfolioCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  benchmark: z.string().trim().min(1).max(12).optional(),
  positions: z.array(positionSchema).default([])
});

export const riskScoreSchema = z.object({
  portfolioId: z.string().uuid().optional(),
  positions: z.array(positionSchema).optional(),
  drawdownThreshold: z.number().min(0.01).max(0.9).default(0.15),
  persist: z.boolean().default(true)
});

export const stressSchema = z.object({
  portfolioId: z.string().uuid(),
  scenarioName: z.string().min(1),
  customShocks: z
    .object({
      equities: z.number(),
      bonds: z.number(),
      commodities: z.number()
    })
    .optional()
});

export const riskInsightSchema = z.object({
  portfolioId: z.string().uuid(),
  refresh: z.boolean().optional().default(true),
  persist: z.boolean().optional().default(true)
});

export const watchlistStatusSchema = z.enum([
  "NEW",
  "RESEARCHING",
  "READY",
  "PASSED",
  "PROMOTED"
]);

export const researchSourceTypeSchema = z.enum(["manual", "related", "screener", "trending"]);

export const watchlistCreateSchema = z.object({
  ticker: z.string().trim().min(1).max(12),
  sourceType: researchSourceTypeSchema.optional().default("manual"),
  sourceLabel: z.string().trim().min(1).max(64).optional().default("Manual search")
});

export const watchlistUpdateSchema = z.object({
  status: watchlistStatusSchema.optional(),
  conviction: z.number().int().min(1).max(5).optional(),
  targetPrice: z.number().positive().nullable().optional(),
  thesis: z.string().max(4000).optional(),
  catalysts: z.string().max(4000).optional(),
  risks: z.string().max(4000).optional(),
  valuationNotes: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional()
});

export const researchInsightSchema = z.object({
  ticker: z.string().trim().min(1).max(12),
  watchlistItemId: z.string().uuid().optional(),
  sourceType: researchSourceTypeSchema.optional()
});
