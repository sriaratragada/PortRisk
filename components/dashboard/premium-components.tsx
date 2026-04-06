"use client";

import type { ReactNode } from "react";
import { forwardRef } from "react";
import { motion, AnimatePresence, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskTier } from "@/lib/types";

// Animation variants per spec
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25 } }
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.03 } }
};

export const staggerChild = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 }
};

// Premium Panel Component
export function PremiumPanel({
  title,
  subtitle,
  action,
  children,
  className,
  noPadding = false
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <motion.section
      variants={staggerChild}
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-white/[0.08] shadow-premium",
        "bg-gradient-to-br from-zinc-900/50 via-zinc-900/20 to-zinc-950/50",
        className
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
        <div className="space-y-0.5">
          <h3 className="text-heading-sm text-white">{title}</h3>
          {subtitle && (
            <p className="text-[13px] text-zinc-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={cn("min-h-0 flex-1", !noPadding && "px-6 py-5")}>
        {children}
      </div>
    </motion.section>
  );
}

// Glass Card (for modals/popovers)
export function GlassCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 shadow-premium",
        "bg-gradient-to-br from-zinc-900/40 via-zinc-900/20 to-zinc-950/40",
        className
      )}
    >
      {children}
    </div>
  );
}

// Nested Card (reduced opacity per spec)
export function NestedCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06]",
        "bg-gradient-to-br from-zinc-900/30 to-zinc-950/30",
        className
      )}
    >
      {children}
    </div>
  );
}

// Metric Card with sparkline support
export function MetricCard({
  label,
  value,
  change,
  changePercent,
  sparkline,
  className
}: {
  label: string;
  value: string;
  change?: number;
  changePercent?: number;
  sparkline?: ReactNode;
  className?: string;
}) {
  const isPositive = (change ?? 0) >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] p-5",
        "bg-gradient-to-br from-zinc-900/40 via-zinc-900/20 to-zinc-950/40",
        className
      )}
    >
      <p className="text-label text-zinc-500">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-heading-md font-mono tabular-nums text-white">{value}</p>
          {(change !== undefined || changePercent !== undefined) && (
            <p className={cn(
              "mt-1 text-sm font-medium",
              isPositive ? "text-emerald-400" : "text-rose-400"
            )}>
              {isPositive ? "+" : ""}{change !== undefined ? change.toFixed(2) : ""}
              {changePercent !== undefined && ` (${isPositive ? "+" : ""}${(changePercent * 100).toFixed(2)}%)`}
            </p>
          )}
        </div>
        {sparkline && (
          <div className="h-[60px] w-[100px]">
            {sparkline}
          </div>
        )}
      </div>
    </div>
  );
}

// Risk Tier Badge per spec
const tierStyles: Record<RiskTier, string> = {
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  MODERATE: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  ELEVATED: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  HIGH: "border-rose-500/30 bg-rose-500/10 text-rose-400"
};

export function TierBadge({ tier, size = "default" }: { tier: RiskTier; size?: "default" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-semibold",
        tierStyles[tier],
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"
      )}
    >
      {tier}
    </span>
  );
}

// Primary Button per spec
export const PrimaryButton = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button"> & { isLoading?: boolean; children: ReactNode }
>(({ className, isLoading, disabled, children, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2",
        "text-sm font-medium text-black shadow transition-all duration-200",
        "hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
});
PrimaryButton.displayName = "PrimaryButton";

// Secondary Button per spec
export const SecondaryButton = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button"> & { isLoading?: boolean; children: ReactNode }
>(({ className, isLoading, disabled, children, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2",
        "text-sm font-medium text-white transition-all duration-200",
        "hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
});
SecondaryButton.displayName = "SecondaryButton";

// Ghost Button per spec
export const GhostButton = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button"> & { isLoading?: boolean; children: ReactNode }
>(({ className, isLoading, disabled, children, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2",
        "text-sm font-medium text-white transition-all duration-200",
        "hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
});
GhostButton.displayName = "GhostButton";

// Danger/Delete Button
export const DangerButton = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button"> & { isLoading?: boolean; children: ReactNode }
>(({ className, isLoading, disabled, children, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2",
        "text-sm font-medium text-rose-400 transition-all duration-200",
        "hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/20 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
});
DangerButton.displayName = "DangerButton";

// Number Ticker with animation
export function NumberTicker({
  value,
  format = "currency",
  className
}: {
  value: number;
  format?: "currency" | "percent" | "number";
  className?: string;
}) {
  const formatted =
    format === "currency"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
      : format === "percent"
        ? `${(value * 100).toFixed(2)}%`
        : value.toLocaleString();

  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={formatted}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn("inline-block font-mono tabular-nums", className)}
      >
        {formatted}
      </motion.span>
    </AnimatePresence>
  );
}

// Info Pill (small stat display)
export function InfoPill({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-medium tabular-nums",
          tone === "positive" ? "text-emerald-400" : tone === "negative" ? "text-rose-400" : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// Event Type Badge (for audit log)
export function EventTypeBadge({
  type,
  className
}: {
  type: string;
  className?: string;
}) {
  const getTypeStyle = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes("create") || lower.includes("add")) {
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    }
    if (lower.includes("delete") || lower.includes("remove")) {
      return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    }
    if (lower.includes("update") || lower.includes("edit") || lower.includes("change")) {
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    }
    return "border-zinc-700 bg-zinc-800/50 text-zinc-400";
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        getTypeStyle(type),
        className
      )}
    >
      {type}
    </span>
  );
}

// Skeleton Loader per spec
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded skeleton-premium",
        className
      )}
      style={{
        background: "linear-gradient(90deg, rgb(24 24 27) 0%, rgb(39 39 42) 50%, rgb(24 24 27) 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 2s infinite"
      }}
    />
  );
}

// Empty State per spec (no decorative imagery)
export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-12 w-12 text-zinc-600" />
      <h3 className="mt-4 text-heading-sm text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// P&L Cell with bullet indicator
export function PnLCell({
  value,
  percent,
  showBullet = true
}: {
  value: number;
  percent?: number;
  showBullet?: boolean;
}) {
  const isPositive = value >= 0;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 font-mono tabular-nums",
      isPositive ? "text-emerald-400" : "text-rose-400"
    )}>
      {showBullet && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          isPositive ? "bg-emerald-400" : "bg-rose-400"
        )} />
      )}
      {isPositive ? "+" : ""}{new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }).format(value)}
      {percent !== undefined && (
        <span className="text-zinc-500">
          ({isPositive ? "+" : ""}{(percent * 100).toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

// Hover Lift Card Wrapper
export function HoverLiftCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={cn(
        "rounded-xl border border-white/[0.08] shadow-premium",
        "bg-gradient-to-br from-zinc-900/50 via-zinc-900/20 to-zinc-950/50",
        "transition-shadow duration-200 hover:shadow-premium-hover",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
