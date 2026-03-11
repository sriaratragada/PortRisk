import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchTickers } from "@/lib/market";
import { badRequest, json } from "@/lib/http";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query) {
    return badRequest("Missing q query param");
  }

  const results = await searchTickers(query);
  return json({ results });
}
