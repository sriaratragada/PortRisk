"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Shield,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskTier } from "@/lib/types";
import {
  PremiumPanel,
  NestedCard,
  SecondaryButton,
  GhostButton,
  TierBadge,
  EventTypeBadge,
  staggerContainer,
  staggerChild
} from "./premium-components";

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

type AuditTabProps = {
  entries: AuditEntry[];
  verification: AuditVerification | null;
  onVerify: () => void;
  isVerifying: boolean;
};

const eventTypeCategories: Record<string, string[]> = {
  "Portfolio": ["PORTFOLIO_CREATED", "PORTFOLIO_UPDATED", "PORTFOLIO_DELETED"],
  "Positions": ["POSITION_ADDED", "POSITION_UPDATED", "POSITION_REMOVED"],
  "Risk": ["RISK_TIER_CHANGED", "RISK_SCORE_UPDATED", "STRESS_TEST_RUN"],
  "Research": ["WATCHLIST_ADDED", "WATCHLIST_PROMOTED", "RESEARCH_GENERATED"],
  "Allocation": ["ALLOCATION_APPLIED", "REBALANCE_EXECUTED"],
  "System": ["USER_LOGIN", "USER_LOGOUT", "SETTINGS_CHANGED"]
};

// Format timestamp for display
function formatTimestamp(timestamp: string): { date: string; time: string } {
  const d = new Date(timestamp);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  };
}

// Format relative time
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTimestamp(timestamp).date;
}

// Filter dropdown
function FilterDropdown({
  label,
  options,
  selected,
  onChange
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
          selected.length > 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-white/[0.08] bg-black/30 text-zinc-400 hover:border-white/[0.16]"
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs">
            {selected.length}
          </span>
        )}
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-white/[0.08] bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-xl"
          >
            {options.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
              >
                <div className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                  selected.includes(option)
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-zinc-600"
                )}>
                  {selected.includes(option) && (
                    <Check className="h-3 w-3 text-black" />
                  )}
                </div>
                {option}
              </button>
            ))}
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="mt-2 w-full rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-white/[0.04]"
              >
                Clear all
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// Timeline entry
function TimelineEntry({
  entry,
  index
}: {
  entry: AuditEntry;
  index: number;
}) {
  const { date, time } = formatTimestamp(entry.timestamp);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className="flex gap-4"
    >
      {/* Timestamp column */}
      <div className="w-20 shrink-0 pt-0.5 text-right">
        <p className="text-xs font-medium text-zinc-400">{date}</p>
        <p className="text-[11px] text-zinc-600">{time}</p>
      </div>

      {/* Timeline line */}
      <div className="relative flex flex-col items-center">
        <div className="h-3 w-3 rounded-full border-2 border-zinc-700 bg-zinc-900" />
        <div className="flex-1 w-px bg-zinc-800" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div
          className={cn(
            "rounded-lg border p-4 transition-colors",
            isExpanded
              ? "border-white/[0.12] bg-white/[0.02]"
              : "border-white/[0.06] bg-black/20 hover:border-white/[0.08]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <EventTypeBadge type={entry.actionType} />
              {entry.riskTierBefore && entry.riskTierAfter && entry.riskTierBefore !== entry.riskTierAfter && (
                <div className="flex items-center gap-1.5">
                  <TierBadge tier={entry.riskTierBefore} size="sm" />
                  <span className="text-zinc-600">→</span>
                  <TierBadge tier={entry.riskTierAfter} size="sm" />
                </div>
              )}
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-180"
              )} />
            </button>
          </div>

          <AnimatePresence>
            {isExpanded && entry.metadata && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  {entry.userEmail && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">User:</span>
                      <span className="text-zinc-300">{entry.userEmail}</span>
                    </div>
                  )}
                  <div className="rounded-lg bg-black/30 p-3">
                    <pre className="overflow-auto text-xs text-zinc-400">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Verification badge
function VerificationStatus({
  verification,
  onVerify,
  isVerifying
}: {
  verification: AuditVerification | null;
  onVerify: () => void;
  isVerifying: boolean;
}) {
  if (!verification) {
    return (
      <SecondaryButton onClick={onVerify} disabled={isVerifying}>
        {isVerifying ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Shield className="h-4 w-4" />
        )}
        Verify Chain
      </SecondaryButton>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        verification.verified
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
      )}>
        {verification.verified ? (
          <>
            <Check className="h-4 w-4" />
            Verified
          </>
        ) : (
          <>
            <X className="h-4 w-4" />
            Chain Broken
          </>
        )}
        <span className="text-zinc-500">({verification.checked} checked)</span>
      </div>
      <GhostButton onClick={onVerify} disabled={isVerifying}>
        <RefreshCw className={cn("h-4 w-4", isVerifying && "animate-spin")} />
      </GhostButton>
    </div>
  );
}

export function AuditTab({
  entries,
  verification,
  onVerify,
  isVerifying
}: AuditTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");

  // Get all unique event types
  const eventTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.actionType));
    return Array.from(types).sort();
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.actionType.toLowerCase().includes(query) ||
          e.userEmail?.toLowerCase().includes(query) ||
          JSON.stringify(e.metadata).toLowerCase().includes(query)
      );
    }

    // Type filter
    if (selectedTypes.length > 0) {
      result = result.filter((e) => selectedTypes.includes(e.actionType));
    }

    // Date filter
    const now = new Date();
    if (dateRange === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      result = result.filter((e) => new Date(e.timestamp) >= today);
    } else if (dateRange === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      result = result.filter((e) => new Date(e.timestamp) >= weekAgo);
    } else if (dateRange === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter((e) => new Date(e.timestamp) >= monthAgo);
    }

    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [entries, searchQuery, selectedTypes, dateRange]);

  const dateRangeOptions = [
    { value: "all" as const, label: "All Time" },
    { value: "today" as const, label: "Today" },
    { value: "week" as const, label: "This Week" },
    { value: "month" as const, label: "This Month" }
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Header with verification */}
      <motion.div variants={staggerChild}>
        <PremiumPanel
          title="Audit Log"
          subtitle={`${entries.length} total events`}
          action={
            <VerificationStatus
              verification={verification}
              onVerify={onVerify}
              isVerifying={isVerifying}
            />
          }
        >
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/[0.16]"
              />
            </div>

            {/* Event type filter */}
            <FilterDropdown
              label="Event Type"
              options={eventTypes}
              selected={selectedTypes}
              onChange={setSelectedTypes}
            />

            {/* Date range */}
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/30 p-1">
              {dateRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    dateRange === option.value
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <NestedCard className="p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Total Events
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                {entries.length}
              </p>
            </NestedCard>
            <NestedCard className="p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Filtered
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
                {filteredEntries.length}
              </p>
            </NestedCard>
            <NestedCard className="p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Risk Changes
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-400">
                {entries.filter((e) => e.riskTierBefore !== e.riskTierAfter && e.riskTierAfter).length}
              </p>
            </NestedCard>
            <NestedCard className="p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                Last Event
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {entries.length > 0 ? formatRelativeTime(entries[0].timestamp) : "—"}
              </p>
            </NestedCard>
          </div>
        </PremiumPanel>
      </motion.div>

      {/* Timeline */}
      <motion.div variants={staggerChild}>
        <PremiumPanel title="Event Timeline" noPadding>
          <div className="max-h-[600px] overflow-auto p-6">
            {filteredEntries.length > 0 ? (
              <div className="space-y-0">
                {filteredEntries.map((entry, index) => (
                  <TimelineEntry key={entry.id} entry={entry} index={index} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-zinc-600" />
                <h3 className="mt-4 text-lg font-semibold text-white">No events found</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  {searchQuery || selectedTypes.length > 0
                    ? "Try adjusting your filters"
                    : "No audit events have been recorded yet"}
                </p>
              </div>
            )}
          </div>
        </PremiumPanel>
      </motion.div>

      {/* Chain verification details */}
      {verification && !verification.verified && (
        <motion.div variants={staggerChild}>
          <PremiumPanel title="Verification Details">
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                <div>
                  <h4 className="font-medium text-rose-400">Chain Integrity Broken</h4>
                  <p className="mt-1 text-sm text-rose-300/80">
                    {verification.reason || "The audit chain integrity check failed."}
                  </p>
                  {verification.firstBrokenEventId && (
                    <p className="mt-2 text-xs text-zinc-500">
                      First broken event: {verification.firstBrokenEventId}
                      {verification.firstBrokenTimestamp && ` at ${formatTimestamp(verification.firstBrokenTimestamp).date}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </PremiumPanel>
        </motion.div>
      )}
    </motion.div>
  );
}
