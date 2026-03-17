import type { WatchlistItem } from "@/lib/types";

const WATCHLIST_STATUS_ORDER: WatchlistItem["status"][] = [
  "NEW",
  "RESEARCHING",
  "READY",
  "PASSED",
  "PROMOTED"
];

export function sortWatchlistItems(
  items: WatchlistItem[],
  sortBy: "updated" | "conviction" | "marketCap",
  marketCapByTicker: Map<string, number | null>
) {
  return items.slice().sort((left, right) => {
    const statusDelta =
      WATCHLIST_STATUS_ORDER.indexOf(left.status) - WATCHLIST_STATUS_ORDER.indexOf(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    if (sortBy === "conviction" && right.conviction !== left.conviction) {
      return right.conviction - left.conviction;
    }

    if (sortBy === "marketCap") {
      const rightCap = marketCapByTicker.get(right.ticker.toUpperCase()) ?? -Infinity;
      const leftCap = marketCapByTicker.get(left.ticker.toUpperCase()) ?? -Infinity;
      if (rightCap !== leftCap) {
        return rightCap - leftCap;
      }
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
