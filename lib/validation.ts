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
