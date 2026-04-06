"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  FileText,
  LayoutGrid,
  PieChart,
  Settings,
  Shield,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId =
  | "overview"
  | "holdings"
  | "research"
  | "risk"
  | "stress"
  | "allocation"
  | "audit"
  | "settings";

type TabConfig = {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

const tabs: TabConfig[] = [
  { id: "overview", label: "Overview", shortLabel: "Overview", icon: LayoutGrid },
  { id: "holdings", label: "Holdings", shortLabel: "Holdings", icon: BarChart3 },
  { id: "research", label: "Research", shortLabel: "Research", icon: BookOpen },
  { id: "risk", label: "Risk", shortLabel: "Risk", icon: Shield },
  { id: "stress", label: "Stress Tests", shortLabel: "Stress", icon: Zap },
  { id: "allocation", label: "Allocation", shortLabel: "Alloc", icon: PieChart },
  { id: "audit", label: "Audit Log", shortLabel: "Audit", icon: FileText },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: Settings }
];

export function PillNavigation({
  activeTab,
  onTabChange,
  className
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-white/[0.08] p-1.5 backdrop-blur-xl",
        "bg-zinc-950/80",
        className
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 rounded-lg bg-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10 hidden sm:inline">{tab.shortLabel}</span>
          </button>
        );
      })}
      
      {/* Magnetic underline indicator */}
      <motion.div
        className="absolute bottom-0 left-0 h-[3px] rounded-full bg-white"
        layoutId="underline"
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        style={{ display: "none" }} // Using pill background instead
      />
    </nav>
  );
}

// Compact sidebar navigation for mobile/smaller screens
export function SidebarNavigation({
  activeTab,
  onTabChange,
  className
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "group relative flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200",
              isActive
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-transparent text-zinc-500 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-300"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-indicator"
                className="absolute -left-1 top-2.5 h-5 w-0.5 rounded-full bg-emerald-400"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="h-4 w-4" />
            
            {/* Tooltip */}
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 rounded-lg border border-white/[0.08] bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// Segmented control (iOS style) for sub-navigation
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-zinc-950/80 p-1",
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="segment-indicator"
                className="absolute inset-0 rounded-md bg-white/[0.1]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Chart range selector
export function ChartRangeSelector({
  ranges,
  value,
  onChange,
  className
}: {
  ranges: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-black/30 p-0.5",
        className
      )}
    >
      {ranges.map((range) => {
        const isActive = value === range;

        return (
          <button
            key={range}
            onClick={() => onChange(range)}
            className={cn(
              "relative rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
              isActive
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="range-indicator"
                className="absolute inset-0 rounded-md bg-white/[0.08]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{range}</span>
          </button>
        );
      })}
    </div>
  );
}
