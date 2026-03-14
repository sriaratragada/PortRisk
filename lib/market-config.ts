import type { ChartRange } from "@/lib/types";

export const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
export const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

export const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
export const FMP_API_KEY = process.env.FMP_API_KEY;

export const CHART_RANGE_CONFIG: Record<
  ChartRange,
  { interval: string; outputsize: number; revalidateSeconds: number }
> = {
  "1D": { interval: "5min", outputsize: 78, revalidateSeconds: 60 },
  "1W": { interval: "1h", outputsize: 40, revalidateSeconds: 120 },
  "1M": { interval: "1day", outputsize: 30, revalidateSeconds: 300 },
  "3M": { interval: "1day", outputsize: 90, revalidateSeconds: 300 },
  "1Y": { interval: "1day", outputsize: 252, revalidateSeconds: 900 },
  "5Y": { interval: "1week", outputsize: 260, revalidateSeconds: 1800 },
  MAX: { interval: "1month", outputsize: 600, revalidateSeconds: 3600 }
};

export function assertProviderKey(name: "TWELVE_DATA_API_KEY" | "FMP_API_KEY", value?: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
