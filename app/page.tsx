import { Dashboard } from "@/components/dashboard";
import { hydratePortfolioRisk } from "@/lib/portfolio";
import { RiskTier } from "@/lib/types";

const demoPositions = [
  { ticker: "AAPL", shares: 45, avgCost: 172.4, assetClass: "equities" as const },
  { ticker: "MSFT", shares: 28, avgCost: 334.8, assetClass: "equities" as const },
  { ticker: "TLT", shares: 60, avgCost: 92.1, assetClass: "bonds" as const },
  { ticker: "GLD", shares: 20, avgCost: 188.3, assetClass: "commodities" as const }
];

function makeFallbackHistory(portfolioValue: number) {
  let peak = portfolioValue * 0.9;
  return Array.from({ length: 12 }, (_, index) => {
    const value = portfolioValue * (0.82 + index * 0.025 + (index % 3) * 0.01);
    peak = Math.max(peak, value);
    return {
      date: new Date(2025, index, 1).toLocaleString("en-US", { month: "short" }),
      value,
      peak,
      drawdown: value - peak
    };
  });
}

export default async function HomePage() {
  try {
    const hydrated = await hydratePortfolioRisk(demoPositions);
    return (
      <Dashboard
        initialPortfolio={{
          id: "demo-portfolio",
          name: "Global Multi-Asset",
          holdings: hydrated.holdings,
          metrics: hydrated.metrics,
          valueHistory: hydrated.series.map((point, index, series) => {
            const peak = Math.max(...series.slice(0, index + 1).map((item) => item.value));
            return {
              date: new Date(point.date).toLocaleString("en-US", {
                month: "short"
              }),
              value: point.value,
              peak,
              drawdown: point.value - peak
            };
          }),
          auditLog: [
            {
              id: "1",
              timestamp: new Date().toISOString(),
              actionType: "RISK_SCORED",
              riskTierBefore: "MODERATE",
              riskTierAfter: hydrated.metrics.riskTier,
              metadata: { source: "live-demo" }
            }
          ]
        }}
      />
    );
  } catch {
    return (
      <Dashboard
        initialPortfolio={{
          id: "demo-portfolio",
          name: "Global Multi-Asset",
          holdings: [
            {
              ticker: "AAPL",
              shares: 45,
              avgCost: 172.4,
              assetClass: "equities",
              currentPrice: 198.21,
              currentValue: 8919.45,
              weight: 0.32,
              dailyPnl: 128.5,
              dailyPnlPercent: 0.0146
            },
            {
              ticker: "MSFT",
              shares: 28,
              avgCost: 334.8,
              assetClass: "equities",
              currentPrice: 415.82,
              currentValue: 11642.96,
              weight: 0.42,
              dailyPnl: -84.12,
              dailyPnlPercent: -0.0071
            },
            {
              ticker: "TLT",
              shares: 60,
              avgCost: 92.1,
              assetClass: "bonds",
              currentPrice: 95.45,
              currentValue: 5727,
              weight: 0.2,
              dailyPnl: 19.8,
              dailyPnlPercent: 0.0035
            },
            {
              ticker: "GLD",
              shares: 20,
              avgCost: 188.3,
              assetClass: "commodities",
              currentPrice: 204.1,
              currentValue: 4082,
              weight: 0.06,
              dailyPnl: 22.2,
              dailyPnlPercent: 0.0055
            }
          ],
          metrics: {
            sharpe: 1.19,
            maxDrawdown: 0.143,
            var95: 0.071,
            var95Amount: 2160,
            drawdownProb3m: 0.18,
            drawdownProb6m: 0.27,
            drawdownProb12m: 0.34,
            riskTier: "MODERATE" as RiskTier,
            summary: "MODERATE risk: return quality is solid, but downside expands under equity-led shocks.",
            portfolioValue: 30371.41,
            annualizedReturn: 0.117,
            annualizedVolatility: 0.061
          },
          valueHistory: makeFallbackHistory(30371.41),
          auditLog: [
            {
              id: "1",
              timestamp: new Date().toISOString(),
              actionType: "POSITION_RESIZED",
              riskTierBefore: "LOW",
              riskTierAfter: "MODERATE",
              metadata: { ticker: "MSFT", reason: "weight rebalance" }
            },
            {
              id: "2",
              timestamp: new Date(Date.now() - 3600_000).toISOString(),
              actionType: "STRESS_TEST_RUN",
              riskTierBefore: "MODERATE",
              riskTierAfter: "HIGH",
              metadata: { scenario: "2008 Financial Crisis" }
            }
          ]
        }}
      />
    );
  }
}
