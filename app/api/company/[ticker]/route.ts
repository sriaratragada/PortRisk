import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { fetchCompanyDetail } from "@/lib/market";
import type { ChartRange } from "@/lib/types";

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

  const range = (request.nextUrl.searchParams.get("range") ?? "1M").toUpperCase() as ChartRange;
  const allowedRanges: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];
  if (!allowedRanges.includes(range)) {
    return badRequest("Invalid range");
  }

  try {
    const detail = await fetchCompanyDetail(ticker, range);
    return json({ detail });
  } catch (error) {
    return json(
      {
        detail: {
          ticker: ticker.toUpperCase(),
          companyName: ticker.toUpperCase(),
          exchange: "N/A",
          currentPrice: 0,
          currency: "USD",
          chart: []
        },
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to load company detail"
      },
      { status: 200 }
    );
  }
}
