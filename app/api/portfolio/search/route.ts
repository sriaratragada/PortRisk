import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchQuotes, searchTickers } from "@/lib/market";
import { badRequest, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query) {
    return badRequest("Missing q query param");
  }

  const results = await searchTickers(query);
  const symbols = results.map((result) => result.symbol).filter(Boolean).slice(0, 6);

  let quotesByTicker = new Map<string, Awaited<ReturnType<typeof fetchQuotes>>[number]>();
  if (symbols.length > 0) {
    try {
      const quotes = await fetchQuotes(symbols);
      quotesByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
    } catch {
      quotesByTicker = new Map();
    }
  }

  return json({
    results: results.map((result) => {
      const quote = quotesByTicker.get(result.symbol.toUpperCase());
      return {
        ...result,
        currentPrice: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null
      };
    })
  });
}
