import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { badRequest, json } from "@/lib/http";
import { hydratePortfolioRisk } from "@/lib/portfolio";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== expected) {
    return badRequest("Unauthorized", 401);
  }

  const limited = await enforceRateLimit("cron", "default");
  if (limited) {
    return limited;
  }

  const portfolioId = request.nextUrl.searchParams.get("portfolioId");
  if (!portfolioId) {
    return badRequest("Missing portfolioId");
  }

  const supabase = createSupabaseAdminClient();
  const { data: portfolio, error } = await supabase
    .from("Portfolio")
    .select("id, userId, positions:Position(*)")
    .eq("id", portfolioId)
    .single();
  if (error || !portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  const positions = portfolio.positions.map((position) => ({
    ticker: position.ticker,
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass as "equities" | "bonds" | "commodities"
  }));
  const hydrated = await hydratePortfolioRisk(positions);

  await supabase.channel(`portfolio:${portfolioId}`).send({
    type: "broadcast",
    event: "price-update",
    payload: {
      portfolioId,
      holdings: hydrated.holdings,
      metrics: hydrated.metrics,
      updatedAt: new Date().toISOString()
    }
  });

  return json({
    broadcast: true,
    holdings: hydrated.holdings.length,
    riskTier: hydrated.metrics.riskTier
  });
}
