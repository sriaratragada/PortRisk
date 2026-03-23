import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { isPortfolioArchived } from "@/lib/portfolio-archive";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { positionSchema } from "@/lib/validation";
import { normalizeBenchmarkSymbol } from "@/lib/benchmarks";
import { fetchHistoricalSeriesResult, fetchSecurityPreview } from "@/lib/market";
import { mapWatchlistItemRow } from "@/lib/research";
import { writeAuditEvent } from "@/lib/audit-events";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  benchmark: z.string().trim().min(1).max(12).optional(),
  positions: z.array(positionSchema).optional()
});

type PortfolioPosition = {
  id?: string;
  ticker: string;
  shares: number;
  avgCost: number;
  assetClass: "equities" | "bonds" | "commodities";
};

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

async function validateBenchmarkSymbol(symbol: string) {
  const normalizedSymbol = normalizeBenchmarkSymbol(symbol);
  const [preview, history] = await Promise.all([
    fetchSecurityPreview(normalizedSymbol),
    fetchHistoricalSeriesResult(normalizedSymbol, "1M")
  ]);

  if (!preview.symbol || history.points.length < 2) {
    throw new Error("Benchmark must be a Yahoo-valid ticker with price history.");
  }

  return normalizedSymbol;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }

  const [
    { data: portfolio, error },
    { data: positions },
    { data: riskScores },
    { data: stressTests },
    { data: auditLogs },
    { data: watchlistItems }
  ] =
    await Promise.all([
      supabase
        .from("Portfolio")
        .select("*")
        .eq("id", portfolioId)
        .eq("userId", auth.user.id)
        .single(),
      supabase.from("Position").select("*").eq("portfolioId", portfolioId).order("ticker", { ascending: true }),
      supabase.from("RiskScore").select("*").eq("portfolioId", portfolioId).order("scoredAt", { ascending: false }).limit(10),
      supabase.from("StressTest").select("*").eq("portfolioId", portfolioId).order("runAt", { ascending: false }).limit(10),
      supabase.from("AuditLog").select("*").eq("portfolioId", portfolioId).eq("userId", auth.user.id).order("timestamp", { ascending: false }).limit(20),
      supabase.from("WatchlistItem").select("*").eq("portfolioId", portfolioId).order("updatedAt", { ascending: false })
    ]);

  if (error || !portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  return json({
    portfolio: {
      ...portfolio,
      positions: positions ?? [],
      riskScores: riskScores ?? [],
      stressTests: stressTests ?? [],
      auditLogs: auditLogs ?? [],
      watchlistItems: (watchlistItems ?? []).map((item) => mapWatchlistItemRow(item))
    }
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const payload = patchSchema.parse(await request.json());
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }

  const [{ data: existingPortfolio, error: existingError }, { data: existingPositions }] = await Promise.all([
    supabase
      .from("Portfolio")
      .select("*")
      .eq("id", portfolioId)
      .eq("userId", auth.user.id)
      .single(),
    supabase.from("Position").select("*").eq("portfolioId", portfolioId)
  ]);

  if (existingError || !existingPortfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const existing = {
    ...existingPortfolio,
    positions: (existingPositions ?? []) as PortfolioPosition[]
  };

  const nextPositions = ((payload.positions ?? existing.positions) as PortfolioPosition[]).map((position) => ({
    ticker: position.ticker.toUpperCase(),
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass
  }));
  let nextBenchmark = existingPortfolio.benchmark;
  if (payload.benchmark) {
    try {
      nextBenchmark = await validateBenchmarkSymbol(payload.benchmark);
    } catch (error) {
      return badRequest(
        error instanceof Error ? error.message : "Benchmark must be a Yahoo-valid ticker.",
        400
      );
    }
  }
  const now = new Date().toISOString();
  const beforePositions = new Map<string, PortfolioPosition>(
    existing.positions.map((position: PortfolioPosition) => [position.ticker.toUpperCase(), position])
  );
  const afterPositions = new Map<string, PortfolioPosition>(
    nextPositions.map((position: PortfolioPosition) => [position.ticker.toUpperCase(), position])
  );

  const { data: portfolio, error: updateError } = await supabase
    .from("Portfolio")
    .update({ name: payload.name ?? existing.name, benchmark: nextBenchmark, updatedAt: now })
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .select()
    .single();

  if (updateError || !portfolio) {
    return badRequest(updateError?.message ?? "Failed to update portfolio", 500);
  }

  if (payload.positions) {
    if (nextPositions.length > 0) {
      const { error: upsertError } = await supabase.from("Position").upsert(
        nextPositions.map((position) => ({
          id:
            existing.positions.find(
              (existingPosition: PortfolioPosition & { id?: string }) =>
                existingPosition.ticker.toUpperCase() === position.ticker.toUpperCase()
            )?.id ?? crypto.randomUUID(),
          portfolioId,
          ticker: position.ticker.toUpperCase(),
          shares: position.shares,
          avgCost: position.avgCost,
          assetClass: position.assetClass,
          updatedAt: now
        })),
        {
          onConflict: "portfolioId,ticker"
        }
      );
      if (upsertError) {
        return badRequest(upsertError.message, 500);
      }
    }

    const removedTickers = existing.positions
      .map((position: PortfolioPosition) => position.ticker.toUpperCase())
      .filter((ticker: string) => !afterPositions.has(ticker));

    if (removedTickers.length > 0) {
      const { error: deleteError } = await supabase
        .from("Position")
        .delete()
        .eq("portfolioId", portfolioId)
        .in("ticker", removedTickers);
      if (deleteError) {
        return badRequest(deleteError.message, 500);
      }
    }
  }

  const auditEvents = [];
  for (const [ticker, before] of beforePositions.entries()) {
    if (!afterPositions.has(ticker)) {
      auditEvents.push({
        actionType: "POSITION_REMOVED" as const,
        beforeState: before,
        afterState: {}
      });
      continue;
    }

    const after = afterPositions.get(ticker)!;
    if (before.shares !== after.shares || before.avgCost !== after.avgCost) {
      auditEvents.push({
        actionType: "POSITION_RESIZED" as const,
        beforeState: before,
        afterState: after
      });
    }
  }

  for (const [ticker, after] of afterPositions.entries()) {
    if (!beforePositions.has(ticker)) {
      auditEvents.push({
        actionType: "POSITION_ADDED" as const,
        beforeState: {},
        afterState: after
      });
    }
  }

  if (auditEvents.length === 0) {
    if (payload.benchmark && payload.benchmark !== existingPortfolio.benchmark) {
      auditEvents.push({
        actionType: "PORTFOLIO_BENCHMARK_UPDATED" as const,
        beforeState: { benchmark: existingPortfolio.benchmark },
        afterState: { benchmark: nextBenchmark }
      });
    } else {
      auditEvents.push({
        actionType: "ALLOCATION_COMMITTED" as const,
        beforeState: existing,
        afterState: portfolio
      });
    }
  }

  try {
    await Promise.all(
      auditEvents.map((event) =>
        writeAuditEvent(supabase, {
          request,
          userId: auth.user.id,
          portfolioId,
          actionType: event.actionType,
          beforeState: event.beforeState as Record<string, unknown>,
          afterState: event.afterState as Record<string, unknown>
        })
      )
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  return json({ portfolio });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const supabase = createSupabaseAdminClient();
  if (await isPortfolioArchived(auth.user.id, portfolioId)) {
    return badRequest("Portfolio not found", 404);
  }
  const { data: existing, error } = await supabase
    .from("Portfolio")
    .select("id,name")
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .single();
  if (error || !existing) {
    return badRequest("Portfolio not found", 404);
  }

  const now = new Date().toISOString();

  try {
    await writeAuditEvent(supabase, {
      request,
      userId: auth.user.id,
      portfolioId,
      actionType: "PORTFOLIO_ARCHIVED",
      beforeState: existing as Record<string, unknown>,
      afterState: {
        ...existing,
        status: "ARCHIVED"
      },
      metadata: {
        archivedAt: now
      }
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to write audit log", 500);
  }

  return json({ archived: true });
}
