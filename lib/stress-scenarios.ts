export const STRESS_SCENARIOS: Record<
  string,
  { equities: number; bonds: number; commodities: number }
> = {
  "2008 Financial Crisis": { equities: -0.5, bonds: 0.1, commodities: -0.3 },
  "2020 COVID Crash": { equities: -0.34, bonds: 0.08, commodities: -0.2 },
  "Rising Rate Environment": { equities: -0.15, bonds: -0.2, commodities: 0.05 }
};
