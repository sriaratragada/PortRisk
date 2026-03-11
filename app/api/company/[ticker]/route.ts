import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { fetchCompanyDetail } from "@/lib/market";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ ticker: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { ticker } = await context.params;
  if (!ticker) {
    return badRequest("Missing ticker");
  }

  try {
    const detail = await fetchCompanyDetail(ticker);
    return json({ detail });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to load company detail", 500);
  }
}
