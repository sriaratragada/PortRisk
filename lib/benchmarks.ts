export const DEFAULT_BENCHMARK = "SPY";

export const BENCHMARK_PRESETS = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "VTI",
  "SCHD",
  "AGG",
  "AOR",
  "ARKK"
] as const;

export type BenchmarkPreset = (typeof BENCHMARK_PRESETS)[number];

export const PORTFOLIO_TEMPLATE_BENCHMARKS = [
  { name: "Growth", benchmark: "QQQ" },
  { name: "Income", benchmark: "SCHD" },
  { name: "Balanced", benchmark: "AOR" },
  { name: "Defensive/Conservative", benchmark: "AGG" },
  { name: "Speculative", benchmark: "ARKK" }
] as const;

export function normalizeBenchmarkSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function isBenchmarkPreset(symbol: string): symbol is BenchmarkPreset {
  return BENCHMARK_PRESETS.includes(normalizeBenchmarkSymbol(symbol) as BenchmarkPreset);
}

export function inferBenchmarkFromPortfolioName(name: string) {
  const lower = name.trim().toLowerCase();
  if (lower.includes("growth")) return "QQQ";
  if (lower.includes("income")) return "SCHD";
  if (lower.includes("balanced")) return "AOR";
  if (lower.includes("defensive") || lower.includes("conservative")) return "AGG";
  if (lower.includes("speculative")) return "ARKK";
  return DEFAULT_BENCHMARK;
}

export function defaultBenchmarkForPortfolio(name: string, benchmark?: string | null) {
  if (benchmark && benchmark.trim()) {
    return normalizeBenchmarkSymbol(benchmark);
  }
  return inferBenchmarkFromPortfolioName(name);
}
