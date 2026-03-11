import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function ensureAppUserRecord(user: SupabaseUser) {
  if (!user.email) {
    throw new Error("Authenticated user is missing email");
  }

  const supabase = createSupabaseAdminClient();
  const payload = {
    id: user.id,
    email: user.email
  };
  const { data, error } = await supabase
    .from("User")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
