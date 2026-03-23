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

  const portfolioId = request.nextUrl.searchParams.get("portfolioId") ?? undefined;
  if (!portfolioId) {
    return badRequest("Missing portfolioId");
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "1000");
  if (!Number.isFinite(limit) || limit < 1 || limit > 2000) {
    return badRequest("Invalid limit");
  }

  const supabase = createSupabaseAdminClient();
  try {
    const verification = await verifyAuditHashChain(supabase, {
      userId: auth.user.id,
      portfolioId,
      limit
    });
    return json({
      verification
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to verify audit chain", 500);
  }
}
