import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function requireUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const supabase = createSupabaseServerClient(token);
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
