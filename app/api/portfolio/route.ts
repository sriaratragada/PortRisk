import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json, parseJson } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArchivedPortfolioIds } from "@/lib/portfolio-archive";
import { ensureAppUserRecord } from "@/lib/user";
import { portfolioCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const supabase = createSupabaseAdminClient();
  const [archivedIds, portfolioResult] = await Promise.all([
    getArchivedPortfolioIds(auth.user.id),
    supabase
      .from("Portfolio")
      .select("id,name,updatedAt,positions:Position(id),riskScores:RiskScore(riskTier,scoredAt)")
      .eq("userId", auth.user.id)
      .order("updatedAt", { ascending: false })
  ]);

  const { data: portfolios, error } = portfolioResult;

  if (error) {
    return badRequest(error.message, 500);
  }

  return json({
    portfolios: (portfolios ?? []).filter((portfolio) => !archivedIds.has(portfolio.id))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  await ensureAppUserRecord(auth.user);
  const payload = await parseJson(request, portfolioCreateSchema);
  const positions = payload.positions ?? [];
  const supabase = createSupabaseAdminClient();
  const portfolioId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: portfolio, error } = await supabase
    .from("Portfolio")
    .insert({
      id: portfolioId,
      userId: auth.user.id,
      name: payload.name,
      updatedAt: now
    })
    .select()
    .single();

  if (error || !portfolio) {
    return badRequest(error?.message ?? "Failed to create portfolio", 500);
  }

  if (positions.length > 0) {
    const { error: positionError } = await supabase.from("Position").insert(
      positions.map((position) => ({
        id: crypto.randomUUID(),
        portfolioId: portfolio.id,
        ticker: position.ticker.toUpperCase(),
        shares: position.shares,
        avgCost: position.avgCost,
        assetClass: position.assetClass,
        updatedAt: now
      }))
    );

    if (positionError) {
      return badRequest(positionError.message, 500);
    }
  }

  const { error: auditError } = await supabase.from("AuditLog").insert({
    id: crypto.randomUUID(),
    userId: auth.user.id,
    portfolioId: portfolio.id,
    actionType: "ALLOCATION_COMMITTED",
    beforeState: {},
    afterState: portfolio,
    riskTierBefore: null,
    riskTierAfter: null
  });

  if (auditError) {
    return badRequest(auditError.message, 500);
  }

  return json({ portfolio }, { status: 201 });
}

export async function PATCH() {
  return badRequest("Use /api/portfolio/[portfolioId] for updates", 405);
}
