"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import {
  Bell,
  ChevronDown,
  Command,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  User,
  X
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  AllocationRecommendationSet,
  AllocationRecommendationVariant,
  ChartRange,
  HoldingSnapshot,
  ResearchInsight,
  RiskInsight,
  RiskMetrics,
  RiskReport,
  RiskTier,
  WatchlistItem
} from "@/lib/types";
import { pageVariants, staggerContainer, staggerChild, GhostButton, GlassCard, NumberTicker, TierBadge } from "./premium-components";
import { PillNavigation, SidebarNavigation, type TabId } from "./pill-navigation";
import { OverviewTab } from "./overview-tab";
import { HoldingsTable } from "./holdings-table";
import { ResearchTab } from "./research-tab";
import { RiskTab } from "./risk-tab";
import { StressTab } from "./stress-tab";
import { AllocationTab } from "./allocation-tab";
import { AuditTab } from "./audit-tab";

type AuditEntry = {
  id: string;
  timestamp: string;
  actionType: string;
  riskTierBefore: RiskTier | null;
  riskTierAfter: RiskTier | null;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
};

type AuditVerification = {
  verified: boolean;
  checked: number;
  firstBrokenEventId: string | null;
  firstBrokenTimestamp: string | null;
  reason: string | null;
};

type StressResult = {
  scenario: string;
  projectedValue: number;
  valueChange: number;
  percentChange: number;
  recoveryDays: number;
  newRiskTier: RiskTier;
  summary: string;
  impactByHolding?: Array<{
    ticker: string;
    impact: number;
    percentImpact: number;
  }>;
};

type PortfolioData = {
  id: string;
  name: string;
  holdings: HoldingSnapshot[];
  metrics: RiskMetrics | null;
  valueHistory: Array<{ date: string; value: number }>;
  watchlist: WatchlistItem[];
  auditLog: AuditEntry[];
  riskReport: RiskReport | null;
  riskInsight: RiskInsight | null;
  recommendations: AllocationRecommendationSet | null;
};

export type PremiumDashboardProps = {
  initialData: PortfolioData;
  user: {
    id: string;
    email: string;
  };
};

export type { PortfolioData };

// Portfolio selector dropdown
function PortfolioSelector({
  portfolios,
  currentId,
  onSelect
}: {
  portfolios: Array<{ id: string; name: string }>;
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const current = portfolios.find((p) => p.id === currentId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-medium text-white transition-colors hover:border-white/[0.16]"
      >
        <span className="truncate max-w-[150px]">{current?.name || "Portfolio"}</span>
        <ChevronDown className={cn(
          "h-4 w-4 text-zinc-500 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/[0.08] bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-xl"
            >
              {portfolios.map((portfolio) => (
                <button
                  key={portfolio.id}
                  onClick={() => {
                    onSelect(portfolio.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    portfolio.id === currentId
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold">
                    {portfolio.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{portfolio.name}</span>
                </button>
              ))}
              <div className="mt-2 border-t border-white/[0.06] pt-2">
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white">
                  <Plus className="h-4 w-4" />
                  Create Portfolio
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Header bar
function DashboardHeader({
  portfolio,
  user,
  onMenuToggle
}: {
  portfolio: PortfolioData;
  user: { id: string; email: string };
  onMenuToggle: () => void;
}) {
  const portfolioValue = portfolio.metrics?.portfolioValue ?? 0;
  const dailyPnl = portfolio.holdings.reduce((sum, h) => sum + (h.dailyPnl ?? 0), 0);
  const isPositive = dailyPnl >= 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/[0.06] bg-black/40 px-4 backdrop-blur-xl lg:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-black" fill="currentColor">
              <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
            </svg>
          </div>
          <span className="hidden text-lg font-semibold text-white sm:inline">PortRisk</span>
        </div>

        {/* Portfolio selector */}
        <div className="hidden md:block">
          <PortfolioSelector
            portfolios={[{ id: portfolio.id, name: portfolio.name }]}
            currentId={portfolio.id}
            onSelect={() => {}}
          />
        </div>
      </div>

      {/* Center - quick stats */}
      <div className="hidden items-center gap-6 lg:flex">
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Portfolio Value
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-white">
            <NumberTicker value={portfolioValue} format="currency" />
          </p>
        </div>
        <div className="h-8 w-px bg-white/[0.06]" />
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
            Daily P&L
          </p>
          <p className={cn(
            "font-mono text-lg font-semibold tabular-nums",
            isPositive ? "text-emerald-400" : "text-rose-400"
          )}>
            {isPositive ? "+" : ""}<NumberTicker value={dailyPnl} format="currency" />
          </p>
        </div>
        {portfolio.metrics?.riskTier && (
          <>
            <div className="h-8 w-px bg-white/[0.06]" />
            <TierBadge tier={portfolio.metrics.riskTier} />
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Search className="h-5 w-5" />
        </button>
        <button className="relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
        </button>
        <div className="hidden items-center gap-2 border-l border-white/[0.06] pl-3 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-xs font-medium text-white">
            {user.email.slice(0, 2).toUpperCase()}
          </div>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </div>
      </div>
    </header>
  );
}

// Settings panel placeholder
function SettingsTab() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <motion.div
        variants={staggerChild}
        className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/50 via-zinc-900/20 to-zinc-950/50 p-6 shadow-premium"
      >
        <h3 className="text-lg font-semibold text-white">Settings</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Workspace settings and configuration options.
        </p>
      </motion.div>
    </motion.div>
  );
}

export function PremiumDashboard({ initialData, user }: PremiumDashboardProps) {
  const [portfolio, setPortfolio] = useState(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chartRange, setChartRange] = useState<string>("1M");
  const [selectedResearchTicker, setSelectedResearchTicker] = useState<string | null>(null);
  const [researchInsight, setResearchInsight] = useState<ResearchInsight | null>(null);
  const [stressResults, setStressResults] = useState<StressResult[]>([]);
  const [auditVerification, setAuditVerification] = useState<AuditVerification | null>(null);
  const [isPending, startTransition] = useTransition();

  // Real-time updates via Supabase
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const channel = supabase
      .channel(`portfolio:${portfolio.id}`)
      .on("broadcast", { event: "price-update" }, ({ payload }) => {
        setPortfolio((current) => ({
          ...current,
          holdings: payload.holdings ?? current.holdings,
          metrics: payload.metrics ?? current.metrics
        }));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [portfolio.id]);

  // Handlers
  const handleRunStressTest = async (scenario: string): Promise<StressResult> => {
    const response = await fetch("/api/stress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId: portfolio.id, scenarioName: scenario })
    });
    const data = await response.json();
    const result: StressResult = {
      scenario,
      projectedValue: data.projectedValue ?? 0,
      valueChange: (data.projectedValue ?? 0) - (portfolio.metrics?.portfolioValue ?? 0),
      percentChange: data.percentChange ?? -0.15,
      recoveryDays: data.recoveryDays ?? 180,
      newRiskTier: data.newRiskTier ?? "HIGH",
      summary: data.summary ?? "Stress test completed.",
      impactByHolding: data.impactByHolding
    };
    setStressResults((prev) => [result, ...prev.slice(0, 4)]);
    return result;
  };

  const handleApplyAllocation = (variant: AllocationRecommendationVariant) => {
    startTransition(async () => {
      // Apply allocation logic here
      console.log("[v0] Applying allocation variant:", variant);
    });
  };

  const handleVerifyAudit = async () => {
    startTransition(async () => {
      const response = await fetch("/api/audit/verify", { method: "POST" });
      const data = await response.json();
      setAuditVerification(data);
    });
  };

  const handlePromoteToHoldings = (ticker: string) => {
    startTransition(async () => {
      await fetch(`/api/portfolio/${portfolio.id}/watchlist/${ticker}/promote`, {
        method: "POST"
      });
    });
  };

  // Stress test scenarios
  const stressScenarios = [
    "2008 Financial Crisis",
    "2020 COVID Crash",
    "Rising Rate Environment",
    "Tech Selloff"
  ];

  return (
    <div className="flex h-screen flex-col bg-black">
      {/* Header */}
      <DashboardHeader
        portfolio={portfolio}
        user={user}
        onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-white/[0.06] bg-zinc-950 p-4 lg:hidden"
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="text-lg font-semibold text-white">Menu</span>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="rounded-lg p-2 text-zinc-500 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarNavigation
                  activeTab={activeTab}
                  onTabChange={(tab) => {
                    setActiveTab(tab);
                    setIsSidebarOpen(false);
                  }}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop sidebar */}
        <aside className="hidden w-16 shrink-0 border-r border-white/[0.06] bg-zinc-950/50 p-3 lg:block">
          <SidebarNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* Tab navigation for mobile */}
          <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-black/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <PillNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              className="overflow-x-auto"
            />
          </div>

          {/* Tab content */}
          <div className="p-4 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                {activeTab === "overview" && (
                  <OverviewTab
                    metrics={portfolio.metrics}
                    holdings={portfolio.holdings}
                    valueHistory={portfolio.valueHistory}
                    chartRange={chartRange}
                    onChartRangeChange={setChartRange}
                  />
                )}

                {activeTab === "holdings" && (
                  <HoldingsTable
                    holdings={portfolio.holdings}
                    onEdit={(ticker, field, value) => {
                      console.log("[v0] Edit holding:", ticker, field, value);
                    }}
                    onDelete={(ticker) => {
                      console.log("[v0] Delete holding:", ticker);
                    }}
                    onAddHolding={() => {
                      console.log("[v0] Add holding");
                    }}
                  />
                )}

                {activeTab === "research" && (
                  <ResearchTab
                    watchlist={portfolio.watchlist}
                    selectedTicker={selectedResearchTicker}
                    insight={researchInsight}
                    onSelectTicker={setSelectedResearchTicker}
                    onPromote={handlePromoteToHoldings}
                    onAddToWatchlist={() => {
                      console.log("[v0] Add to watchlist");
                    }}
                  />
                )}

                {activeTab === "risk" && (
                  <RiskTab
                    metrics={portfolio.metrics}
                    report={portfolio.riskReport}
                    insight={portfolio.riskInsight}
                    holdings={portfolio.holdings}
                  />
                )}

                {activeTab === "stress" && (
                  <StressTab
                    currentValue={portfolio.metrics?.portfolioValue ?? 0}
                    currentTier={portfolio.metrics?.riskTier ?? null}
                    scenarios={stressScenarios}
                    onRunScenario={handleRunStressTest}
                    stressResults={stressResults}
                  />
                )}

                {activeTab === "allocation" && (
                  <AllocationTab
                    holdings={portfolio.holdings}
                    recommendations={portfolio.recommendations}
                    onApplyAllocation={handleApplyAllocation}
                    isApplying={isPending}
                  />
                )}

                {activeTab === "audit" && (
                  <AuditTab
                    entries={portfolio.auditLog}
                    verification={auditVerification}
                    onVerify={handleVerifyAudit}
                    isVerifying={isPending}
                  />
                )}

                {activeTab === "settings" && <SettingsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
