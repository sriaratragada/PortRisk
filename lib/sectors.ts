import type { PositionInput } from "@/lib/types";

export const RESOLVED_SECTORS = [
  "Technology",
  "Communication Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Financial Services",
  "Healthcare",
  "Industrials",
  "Energy",
  "Utilities",
  "Real Estate",
  "Basic Materials",
  "Semiconductors",
  "Software",
  "Internet & Digital Platforms",
  "Media & Entertainment",
  "Transportation & Logistics",
  "Aerospace & Defense",
  "Biotechnology",
  "Banks & Insurance",
  "ETFs / Funds / Other"
] as const;

export type ResolvedSector = (typeof RESOLVED_SECTORS)[number];

const DEFAULT_SECTOR: ResolvedSector = "ETFs / Funds / Other";

const INDUSTRY_TO_SECTOR: Record<string, ResolvedSector> = {
  SEMICONDUCTORS: "Semiconductors",
  "SEMICONDUCTOR EQUIPMENT & MATERIALS": "Semiconductors",
  "SOFTWARE - INFRASTRUCTURE": "Software",
  "SOFTWARE - APPLICATION": "Software",
  SOFTWARE: "Software",
  "INTERNET CONTENT & INFORMATION": "Internet & Digital Platforms",
  "INTERNET RETAIL": "Internet & Digital Platforms",
  "ELECTRONIC GAMING & MULTIMEDIA": "Media & Entertainment",
  ENTERTAINMENT: "Media & Entertainment",
  BROADCASTING: "Media & Entertainment",
  "ADVERTISEMENT AGENCIES": "Media & Entertainment",
  BIOTECHNOLOGY: "Biotechnology",
  "DRUG MANUFACTURERS - SPECIALTY & GENERIC": "Biotechnology",
  "DRUG MANUFACTURERS - GENERAL": "Healthcare",
  "MEDICAL DEVICES": "Healthcare",
  "MEDICAL INSTRUMENTS & SUPPLIES": "Healthcare",
  "BANKS - DIVERSIFIED": "Banks & Insurance",
  "BANKS - REGIONAL": "Banks & Insurance",
  "INSURANCE - DIVERSIFIED": "Banks & Insurance",
  "INSURANCE - PROPERTY & CASUALTY": "Banks & Insurance",
  "INSURANCE - LIFE": "Banks & Insurance",
  "ASSET MANAGEMENT": "Banks & Insurance",
  "CAPITAL MARKETS": "Banks & Insurance",
  "CREDIT SERVICES": "Banks & Insurance",
  "AEROSPACE & DEFENSE": "Aerospace & Defense",
  AIRLINES: "Transportation & Logistics",
  RAILROADS: "Transportation & Logistics",
  TRUCKING: "Transportation & Logistics",
  "MARINE SHIPPING": "Transportation & Logistics",
  "INTEGRATED FREIGHT & LOGISTICS": "Transportation & Logistics",
  "AUTO MANUFACTURERS": "Consumer Cyclical",
  "AUTO PARTS": "Consumer Cyclical",
  "HOME IMPROVEMENT RETAIL": "Consumer Cyclical",
  "SPECIALTY RETAIL": "Consumer Cyclical",
  "RESTAURANTS": "Consumer Cyclical",
  "CONSUMER ELECTRONICS": "Technology",
  "DISCOUNT STORES": "Consumer Defensive",
  "HOUSEHOLD & PERSONAL PRODUCTS": "Consumer Defensive",
  "PACKAGED FOODS": "Consumer Defensive",
  BEVERAGES: "Consumer Defensive",
  TOBACCO: "Consumer Defensive",
  "OIL & GAS INTEGRATED": "Energy",
  "OIL & GAS E&P": "Energy",
  "OIL & GAS EQUIPMENT & SERVICES": "Energy",
  "SOLAR": "Energy",
  "BUILDING MATERIALS": "Basic Materials",
  CHEMICALS: "Basic Materials",
  "STEEL": "Basic Materials",
  "COKING COAL": "Basic Materials",
  REIT: "Real Estate",
  "REIT - OFFICE": "Real Estate",
  "REIT - INDUSTRIAL": "Real Estate",
  "REIT - RETAIL": "Real Estate",
  "REIT - RESIDENTIAL": "Real Estate",
  UTILITIES: "Utilities",
  "UTILITIES - REGULATED ELECTRIC": "Utilities",
  "UTILITIES - DIVERSIFIED": "Utilities",
  "UTILITIES - RENEWABLE": "Utilities",
  "SPECIALTY INDUSTRIAL MACHINERY": "Industrials",
  "FARM & HEAVY CONSTRUCTION MACHINERY": "Industrials",
  "ENGINEERING & CONSTRUCTION": "Industrials",
  "CONSULTING SERVICES": "Industrials"
};

const SECTOR_TO_SECTOR: Record<string, ResolvedSector> = {
  TECHNOLOGY: "Technology",
  "COMMUNICATION SERVICES": "Communication Services",
  "CONSUMER CYCLICAL": "Consumer Cyclical",
  "CONSUMER DEFENSIVE": "Consumer Defensive",
  "FINANCIAL SERVICES": "Financial Services",
  HEALTHCARE: "Healthcare",
  INDUSTRIALS: "Industrials",
  ENERGY: "Energy",
  UTILITIES: "Utilities",
  "REAL ESTATE": "Real Estate",
  "BASIC MATERIALS": "Basic Materials",
  FINANCIAL: "Financial Services"
};

const TICKER_OVERRIDES: Record<string, ResolvedSector> = {
  AAPL: "Technology",
  MSFT: "Software",
  NVDA: "Semiconductors",
  AMZN: "Internet & Digital Platforms",
  GOOGL: "Internet & Digital Platforms",
  GOOG: "Internet & Digital Platforms",
  META: "Internet & Digital Platforms",
  TSLA: "Consumer Cyclical",
  JPM: "Banks & Insurance",
  BAC: "Banks & Insurance",
  XOM: "Energy",
  PFE: "Healthcare",
  SPY: "ETFs / Funds / Other",
  QQQ: "ETFs / Funds / Other",
  IWM: "ETFs / Funds / Other"
};

function normalizeKey(value: string | undefined | null) {
  return (value ?? "")
    .trim()
    .replace(/&/g, "AND")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function mapIndustry(industry: string | undefined | null) {
  const key = normalizeKey(industry);
  if (!key) return null;
  if (INDUSTRY_TO_SECTOR[key]) return INDUSTRY_TO_SECTOR[key];
  for (const [pattern, sector] of Object.entries(INDUSTRY_TO_SECTOR)) {
    if (key.includes(pattern)) return sector;
  }
  if (key.includes("ETF") || key.includes("FUND")) return DEFAULT_SECTOR;
  return null;
}

function mapSector(sector: string | undefined | null) {
  const key = normalizeKey(sector);
  if (!key) return null;
  if (SECTOR_TO_SECTOR[key]) return SECTOR_TO_SECTOR[key];
  for (const [pattern, resolved] of Object.entries(SECTOR_TO_SECTOR)) {
    if (key.includes(pattern)) return resolved;
  }
  if (key.includes("TECH")) return "Technology";
  if (key.includes("HEALTH")) return "Healthcare";
  if (key.includes("FINANC")) return "Financial Services";
  if (key.includes("ENER")) return "Energy";
  if (key.includes("UTIL")) return "Utilities";
  if (key.includes("REAL")) return "Real Estate";
  return null;
}

export function resolveSector(input: {
  ticker: string;
  providerSector?: string | null;
  providerIndustry?: string | null;
  quoteType?: string | null;
  assetClass?: PositionInput["assetClass"] | string | null;
}): ResolvedSector {
  const ticker = normalizeKey(input.ticker);
  const industryMatch = mapIndustry(input.providerIndustry);
  if (industryMatch) return industryMatch;

  const sectorMatch = mapSector(input.providerSector);
  if (sectorMatch) return sectorMatch;

  const override = TICKER_OVERRIDES[ticker];
  if (override) return override;

  const quoteType = normalizeKey(input.quoteType);
  if (quoteType.includes("ETF") || quoteType.includes("FUND") || quoteType.includes("MUTUAL")) {
    return DEFAULT_SECTOR;
  }

  const assetClass = normalizeKey(input.assetClass);
  if (assetClass === "BONDS" || assetClass === "COMMODITIES") {
    return DEFAULT_SECTOR;
  }

  return DEFAULT_SECTOR;
}

export function getDefaultSector() {
  return DEFAULT_SECTOR;
}
