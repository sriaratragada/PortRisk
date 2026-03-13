import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ARCHIVE_ACTION = "PORTFOLIO_ARCHIVED";

export async function getArchivedPortfolioIds(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("AuditLog")
    .select("portfolioId")
    .eq("userId", userId)
    .eq("actionType", ARCHIVE_ACTION);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.portfolioId).filter(Boolean));
}

export async function isPortfolioArchived(userId: string, portfolioId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("AuditLog")
    .select("id")
    .eq("userId", userId)
    .eq("portfolioId", portfolioId)
    .eq("actionType", ARCHIVE_ACTION)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}
