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
    const missingSections = [
      !detail.sector || !detail.industry ? "profile" : null,
      detail.marketCap == null || detail.trailingPE == null ? "valuation" : null,
      detail.currentRatio == null &&
      detail.quickRatio == null &&
      detail.debtToEquity == null &&
      detail.totalDebt == null &&
      detail.totalCash == null
        ? "balanceSheet"
        : null,
      detail.revenueGrowth == null &&
      detail.earningsGrowth == null &&
      detail.profitMargins == null &&
      detail.returnOnEquity == null
        ? "operatingQuality"
        : null
    ].filter((section): section is string => section !== null);

    return json({
      detail,
      degraded: missingSections.length > 0,
      missingSections
    });
  } catch (error) {
    return json(
      {
        detail: {
          ticker: ticker.toUpperCase(),
          companyName: ticker.toUpperCase(),
          exchange: "N/A",
          currentPrice: null,
          currency: "USD",
          chart: [],
          sector: "ETFs / Funds / Other",
          dataState: "unavailable",
          asOf: null,
          provider: null,
          historyDataState: "unavailable",
          historyAsOf: null,
          historyProvider: null
        },
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to load company detail"
      },
      { status: 200 }
    );
  }
}
