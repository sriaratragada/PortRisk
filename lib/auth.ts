import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseRouteHandlerClient, createSupabaseServerComponentClient } from "@/lib/supabase-server";
import { ensureAppUserRecord } from "@/lib/user";

export async function requireUser() {
  const supabase = createSupabaseRouteHandlerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    };
  }

  return { user: data.user };
}

export async function getServerUser() {
  const supabase = createSupabaseServerComponentClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }

  return data.user ?? null;
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }

  await ensureAppUserRecord(user);
  return user;
}

export function getUserDisplayName(user: User) {
  return user.email?.split("@")[0] ?? "Operator";
}
