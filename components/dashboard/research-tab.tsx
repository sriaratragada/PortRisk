"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  ExternalLink,
  Plus,
  Search,
  Star,
  TrendingUp,
  X
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { WatchlistItem, ResearchInsight } from "@/lib/types";
import {
  PremiumPanel,
  NestedCard,
  SecondaryButton,
  PrimaryButton,
  GhostButton,
  staggerContainer,
  staggerChild
} from "./premium-components";
import { SegmentedControl } from "./pill-navigation";

type ResearchTabProps = {
  watchlist: WatchlistItem[];
  selectedTicker: string | null;
  insight: ResearchInsight | null;
  onSelectTicker: (ticker: string | null) => void;
  onPromote: (ticker: string) => void;
  onAddToWatchlist: () => void;
};

const statusColors: Record<string, string> = {
  NEW: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  RESEARCHING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  READY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  PASSED: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  PROMOTED: "border-violet-500/30 bg-violet-500/10 text-violet-400"
};

// Watchlist row in left panel
function WatchlistRow({
  item,
  isSelected,
  onSelect
}: {
  item: WatchlistItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      variants={staggerChild}
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border px-4 py-3 transition-all duration-200",
        isSelected
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-white/[0.06] bg-black/20 hover:border-white/[0.12] hover:bg-white/[0.02]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-white">
              {item.ticker}
            </span>
            <span className={cn(
              "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              statusColors[item.status] || statusColors.NEW
            )}>
              {item.status}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {item.companyName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {item.conviction > 0 && (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3 w-3",
                    i < item.conviction ? "fill-amber-400 text-amber-400" : "text-zinc-700"
                  )}
                />
              ))}
            </div>
          )}
          <ChevronRight className={cn(
            "h-4 w-4 transition-colors",
            isSelected ? "text-emerald-400" : "text-zinc-600"
          )} />
        </div>
      </div>
      {item.thesis && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
          {item.thesis}
        </p>
      )}
    </motion.button>
  );
}

// News card per spec
function NewsCard({
  title,
  source,
  timestamp,
  url
}: {
  title: string;
  source: string;
  timestamp: string;
  url?: string;
}) {
  return (
    <div className="rounded-lg border-l-2 border-zinc-700 bg-zinc-900/30 px-4 py-3">
      <p className="text-sm font-medium leading-relaxed text-zinc-200">
        {title}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-xs text-zinc-500">{source}</span>
        <span className="text-xs text-zinc-600">•</span>
        <span className="text-xs text-zinc-500">{timestamp}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
          >
            Read <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// Metric display for detail panel
function MetricPair({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
        {label}
      </p>
      <p className="font-mono text-lg font-medium tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

// Bullet list for thesis/catalysts/risks
function BulletList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
        {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Detail panel (right side)
function DetailPanel({
  item,
  insight,
  onPromote,
  onClose
}: {
  item: WatchlistItem;
  insight: ResearchInsight | null;
  onPromote: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-zinc-950/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] font-mono text-sm font-bold text-white">
            {item.ticker.slice(0, 2)}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{item.ticker}</h3>
            <p className="text-sm text-zinc-500">{item.companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.status !== "PROMOTED" && (
            <PrimaryButton onClick={onPromote}>
              <Plus className="h-4 w-4" />
              Promote to Holdings
            </PrimaryButton>
          )}
          <GhostButton onClick={onClose} className="p-2">
            <X className="h-4 w-4" />
          </GhostButton>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          {/* Key metrics */}
          <NestedCard className="p-5">
            <h4 className="mb-4 text-sm font-semibold text-white">Key Metrics</h4>
            <div className="grid grid-cols-3 gap-4">
              <MetricPair label="Sector" value={item.sector || "N/A"} />
              <MetricPair label="Industry" value={item.industry || "N/A"} />
              <MetricPair
                label="Target Price"
                value={item.targetPrice ? formatCurrency(item.targetPrice) : "N/A"}
              />
              <MetricPair
                label="Conviction"
                value={`${item.conviction}/5`}
              />
              <MetricPair label="Source" value={item.sourceLabel || item.sourceType} />
              <MetricPair
                label="Added"
                value={new Date(item.createdAt).toLocaleDateString()}
              />
            </div>
          </NestedCard>

          {/* Thesis */}
          {item.thesis && (
            <div className="space-y-2">
              <h4 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Thesis
              </h4>
              <p className="text-sm leading-relaxed text-zinc-300">
                {item.thesis}
              </p>
            </div>
          )}

          {/* AI Insight */}
          {insight && (
            <NestedCard className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">AI Research Summary</h4>
                <span className={cn(
                  "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium",
                  insight.dataConfidence === "HIGH"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : insight.dataConfidence === "MEDIUM"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
                )}>
                  {insight.dataConfidence} confidence
                </span>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-zinc-300">
                {insight.summary}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Portfolio Fit
                  </p>
                  <p className="text-sm text-zinc-300">{insight.portfolioFit}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Why Now
                  </p>
                  <p className="text-sm text-zinc-300">{insight.whyNow}</p>
                </div>
              </div>
            </NestedCard>
          )}

          {/* Catalysts */}
          {item.catalysts && (
            <BulletList
              title="Catalysts"
              items={item.catalysts.split("\n").filter(Boolean)}
            />
          )}

          {/* Risks */}
          {item.risks && (
            <BulletList
              title="Risks"
              items={item.risks.split("\n").filter(Boolean)}
            />
          )}

          {/* Valuation Notes */}
          {item.valuationNotes && (
            <div className="space-y-2">
              <h4 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Valuation Notes
              </h4>
              <p className="text-sm leading-relaxed text-zinc-300">
                {item.valuationNotes}
              </p>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="space-y-2">
              <h4 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Additional Notes
              </h4>
              <p className="text-sm leading-relaxed text-zinc-300">
                {item.notes}
              </p>
            </div>
          )}

          {/* Sample news section */}
          <div className="space-y-3">
            <h4 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500">
              Related News
            </h4>
            <NewsCard
              title={`${item.companyName} reports quarterly earnings...`}
              source="Reuters"
              timestamp="2 hours ago"
            />
            <NewsCard
              title={`Analyst upgrades ${item.ticker} to outperform...`}
              source="Bloomberg"
              timestamp="1 day ago"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ResearchTab({
  watchlist,
  selectedTicker,
  insight,
  onSelectTicker,
  onPromote,
  onAddToWatchlist
}: ResearchTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredWatchlist = useMemo(() => {
    let result = [...watchlist];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.ticker.toLowerCase().includes(query) ||
          item.companyName.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((item) => item.status === statusFilter);
    }

    return result;
  }, [watchlist, searchQuery, statusFilter]);

  const selectedItem = watchlist.find((item) => item.ticker === selectedTicker);

  const statusOptions = [
    { value: "ALL", label: "All" },
    { value: "NEW", label: "New" },
    { value: "RESEARCHING", label: "Researching" },
    { value: "READY", label: "Ready" }
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid h-[calc(100vh-200px)] min-h-[600px] gap-6 lg:grid-cols-[0.4fr_0.6fr]"
    >
      {/* Left Panel - Watchlist */}
      <motion.div variants={staggerChild}>
        <PremiumPanel
          title="Watchlist"
          subtitle={`${watchlist.length} ideas`}
          className="h-full"
          noPadding
        >
          {/* Filters */}
          <div className="border-b border-white/[0.06] px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search watchlist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/[0.16]"
                />
              </div>
              <SegmentedControl
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 space-y-2 overflow-auto p-4">
            <AnimatePresence mode="popLayout">
              {filteredWatchlist.map((item) => (
                <WatchlistRow
                  key={item.id}
                  item={item}
                  isSelected={item.ticker === selectedTicker}
                  onSelect={() => onSelectTicker(item.ticker)}
                />
              ))}
            </AnimatePresence>

            {filteredWatchlist.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-zinc-600" />
                <h3 className="mt-4 text-lg font-semibold text-white">No ideas found</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  {searchQuery || statusFilter !== "ALL"
                    ? "Try adjusting your filters"
                    : "Add your first research idea"}
                </p>
                <SecondaryButton onClick={onAddToWatchlist} className="mt-4">
                  <Plus className="h-4 w-4" />
                  Add to Watchlist
                </SecondaryButton>
              </div>
            )}
          </div>

          {/* Footer action */}
          {filteredWatchlist.length > 0 && (
            <div className="border-t border-white/[0.06] px-6 py-4">
              <SecondaryButton onClick={onAddToWatchlist} className="w-full">
                <Plus className="h-4 w-4" />
                Add to Watchlist
              </SecondaryButton>
            </div>
          )}
        </PremiumPanel>
      </motion.div>

      {/* Right Panel - Detail View */}
      <motion.div variants={staggerChild}>
        <div className="h-full rounded-xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/50 via-zinc-900/20 to-zinc-950/50 shadow-premium">
          <AnimatePresence mode="wait">
            {selectedItem ? (
              <DetailPanel
                key={selectedItem.ticker}
                item={selectedItem}
                insight={insight}
                onPromote={() => onPromote(selectedItem.ticker)}
                onClose={() => onSelectTicker(null)}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center text-center"
              >
                <div className="rounded-2xl bg-white/[0.04] p-6">
                  <TrendingUp className="h-12 w-12 text-zinc-600" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  Select an idea to research
                </h3>
                <p className="mt-2 max-w-sm text-sm text-zinc-500">
                  Choose a ticker from your watchlist to view detailed research,
                  AI insights, and analysis
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
