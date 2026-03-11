import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { positionSchema } from "@/lib/validation";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  positions: z.array(positionSchema).optional()
});

type PortfolioPosition = {
  ticker: string;
  shares: number;
  avgCost: number;
  assetClass: "equities" | "bonds" | "commodities";
};

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const supabase = createSupabaseAdminClient();

  const [{ data: portfolio, error }, { data: positions }, { data: riskScores }, { data: stressTests }, { data: auditLogs }] =
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
      supabase.from("AuditLog").select("*").eq("portfolioId", portfolioId).eq("userId", auth.user.id).order("timestamp", { ascending: false }).limit(20)
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
      auditLogs: auditLogs ?? []
    }
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const payload = patchSchema.parse(await request.json());
  const supabase = createSupabaseAdminClient();

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
  const beforePositions = new Map<string, PortfolioPosition>(
    existing.positions.map((position: PortfolioPosition) => [position.ticker.toUpperCase(), position])
  );
  const afterPositions = new Map<string, PortfolioPosition>(
    nextPositions.map((position: PortfolioPosition) => [position.ticker.toUpperCase(), position])
  );

  const { data: portfolio, error: updateError } = await supabase
    .from("Portfolio")
    .update({ name: payload.name ?? existing.name })
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .select()
    .single();

  if (updateError || !portfolio) {
    return badRequest(updateError?.message ?? "Failed to update portfolio", 500);
  }

  if (payload.positions) {
    const { error: deleteError } = await supabase.from("Position").delete().eq("portfolioId", portfolioId);
    if (deleteError) {
      return badRequest(deleteError.message, 500);
    }

    if (payload.positions.length > 0) {
      const { error: insertError } = await supabase.from("Position").insert(
        payload.positions.map((position) => ({
          portfolioId,
          ticker: position.ticker.toUpperCase(),
          shares: position.shares,
          avgCost: position.avgCost,
          assetClass: position.assetClass
        }))
      );
      if (insertError) {
        return badRequest(insertError.message, 500);
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
    auditEvents.push({
      actionType: "ALLOCATION_COMMITTED" as const,
      beforeState: existing,
      afterState: portfolio
    });
  }

  const { error: auditError } = await supabase.from("AuditLog").insert(
    auditEvents.map((event) => ({
      userId: auth.user.id,
      portfolioId,
      actionType: event.actionType,
      beforeState: event.beforeState,
      afterState: event.afterState,
      riskTierBefore: null,
      riskTierAfter: null
    }))
  );

  if (auditError) {
    return badRequest(auditError.message, 500);
  }

  return json({ portfolio });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { data: existing, error } = await supabase
    .from("Portfolio")
    .select("id")
    .eq("id", portfolioId)
    .eq("userId", auth.user.id)
    .single();
  if (error || !existing) {
    return badRequest("Portfolio not found", 404);
  }

  const { error: deleteError } = await supabase.from("Portfolio").delete().eq("id", portfolioId);
  if (deleteError) {
    return badRequest(deleteError.message, 500);
  }

  return json({ deleted: true });
}
