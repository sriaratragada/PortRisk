import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limited = await enforceRateLimit(auth.user.id, "default");
  if (limited) {
    return limited;
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const actionType = request.nextUrl.searchParams.get("actionType") ?? undefined;
  const portfolioId = request.nextUrl.searchParams.get("portfolioId") ?? undefined;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    return badRequest("Invalid pagination");
  }

  const where = {
  };
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("AuditLog")
    .select("*", { count: "exact" })
    .eq("userId", auth.user.id)
    .order("timestamp", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (actionType) query = query.eq("actionType", actionType);
  if (portfolioId) query = query.eq("portfolioId", portfolioId);
  if (from) query = query.gte("timestamp", from);
  if (to) query = query.lte("timestamp", to);

  const { data: items, count, error } = await query;
  if (error) {
    return badRequest(error.message, 500);
  }

  return json({
    items: items ?? [],
    page,
    pageSize,
    total: count ?? 0,
    explainAnalyze: [
      "EXPLAIN ANALYZE SELECT * FROM \"AuditLog\" WHERE \"userId\" = $1 ORDER BY \"timestamp\" DESC LIMIT $2 OFFSET $3;",
      "EXPLAIN ANALYZE SELECT * FROM \"RiskScore\" WHERE \"portfolioId\" = $1 ORDER BY \"scoredAt\" DESC LIMIT $2;"
    ]
  });
}
