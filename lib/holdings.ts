import type { HoldingSnapshot, PositionInput } from "@/lib/types";

export function buildFallbackHoldings(positions: PositionInput[]) {
  return positions.map<HoldingSnapshot>((position) => ({
    ...position,
    assetClass: position.assetClass ?? "equities",
    currentPrice: null,
    currentValue: null,
    weight: null,
    dailyPnl: null,
    dailyPnlPercent: null,
    totalGain: null,
    totalGainPercent: null
  }));
}
