import type { ChartRange } from "@/lib/types";

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
