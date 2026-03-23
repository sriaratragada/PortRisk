import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyAuditHashChain } from "@/lib/audit-events";

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
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const severity = request.nextUrl.searchParams.get("severity") ?? undefined;
  const outcome = request.nextUrl.searchParams.get("outcome") ?? undefined;
  const reasonCode = request.nextUrl.searchParams.get("reasonCode") ?? undefined;
  const requestId = request.nextUrl.searchParams.get("requestId") ?? undefined;
  const verifiedOnly = request.nextUrl.searchParams.get("verifiedOnly") === "1";
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    return badRequest("Invalid pagination");
  }

  if (verifiedOnly && !portfolioId) {
    return badRequest("verifiedOnly requires portfolioId");
  }

  const supabase = createSupabaseAdminClient();
  let verification = null;
  if (verifiedOnly) {
    try {
      verification = await verifyAuditHashChain(supabase, {
        userId: auth.user.id,
        portfolioId
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Audit verification failed", 500);
    }
  }

  if (verifiedOnly && verification && !verification.verified) {
    return json({
      items: [],
      page,
      pageSize,
      total: 0,
      verification,
      explainAnalyze: [
        "EXPLAIN ANALYZE SELECT * FROM \"AuditLog\" WHERE \"userId\" = $1 ORDER BY \"timestamp\" DESC LIMIT $2 OFFSET $3;",
        "EXPLAIN ANALYZE SELECT * FROM \"RiskScore\" WHERE \"portfolioId\" = $1 ORDER BY \"scoredAt\" DESC LIMIT $2;"
      ]
    });
  }

  let query = supabase
    .from("AuditLog")
    .select("*", { count: "exact" })
    .eq("userId", auth.user.id)
    .order("timestamp", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (actionType) query = query.eq("actionType", actionType);
  if (portfolioId) query = query.eq("portfolioId", portfolioId);
  if (category) query = query.eq("category", category);
  if (severity) query = query.eq("severity", severity);
  if (outcome) query = query.eq("outcome", outcome);
  if (reasonCode) query = query.eq("reasonCode", reasonCode);
  if (requestId) query = query.eq("requestId", requestId);
  if (verifiedOnly) query = query.not("eventHash", "is", null);
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
    verification,
    explainAnalyze: [
      "EXPLAIN ANALYZE SELECT * FROM \"AuditLog\" WHERE \"userId\" = $1 ORDER BY \"timestamp\" DESC LIMIT $2 OFFSET $3;",
      "EXPLAIN ANALYZE SELECT * FROM \"RiskScore\" WHERE \"portfolioId\" = $1 ORDER BY \"scoredAt\" DESC LIMIT $2;"
    ]
  });
}
