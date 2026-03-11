import { NextRequest } from "next/server";
import { createSupabaseTokenClient } from "@/lib/supabase-admin";

export async function requireEdgeUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    };
  }

  const supabase = createSupabaseTokenClient(token);
  const { data, error } = await supabase.auth.getUser(token);
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
