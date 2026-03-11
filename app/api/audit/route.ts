import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const limited = await enforceRateLimit(auth.user.id, "default");
  if (limited) {
    return limited;
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const actionType = request.nextUrl.searchParams.get("actionType") ?? undefined;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    return badRequest("Invalid pagination");
  }

  const where = {
    userId: auth.user.id,
    actionType,
    timestamp: {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined
    }
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ]);

  return json({
    items,
    page,
    pageSize,
    total,
    explainAnalyze: [
      "EXPLAIN ANALYZE SELECT * FROM \"AuditLog\" WHERE \"userId\" = $1 ORDER BY \"timestamp\" DESC LIMIT $2 OFFSET $3;",
      "EXPLAIN ANALYZE SELECT * FROM \"RiskScore\" WHERE \"portfolioId\" = $1 ORDER BY \"scoredAt\" DESC LIMIT $2;"
    ]
  });
}
