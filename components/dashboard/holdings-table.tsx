"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { HoldingSnapshot } from "@/lib/types";
import {
  PremiumPanel,
  SecondaryButton,
  GhostButton,
  DangerButton,
  PnLCell,
  staggerContainer,
  staggerChild
} from "./premium-components";

type SortField = "ticker" | "shares" | "avgCost" | "currentPrice" | "currentValue" | "dailyPnl" | "totalGain" | "weight";
type SortDirection = "asc" | "desc";

type HoldingsTableProps = {
  holdings: HoldingSnapshot[];
  onEdit?: (ticker: string, field: string, value: number) => void;
  onDelete?: (ticker: string) => void;
  onAddHolding?: () => void;
};

// Sortable column header
function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  align = "left"
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort === field;

  return (
    <th
      className={cn(
        "sticky top-0 z-10 cursor-pointer select-none border-b border-white/[0.06] bg-black/40 px-4 py-3.5 backdrop-blur-md transition-colors hover:bg-white/[0.02]",
        align === "right" ? "text-right" : "text-left"
      )}
      onClick={() => onSort(field)}
    >
      <div className={cn(
        "flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500",
        align === "right" && "justify-end"
      )}>
        <span>{label}</span>
        <div className="flex flex-col">
          <ChevronUp
            className={cn(
              "h-3 w-3 -mb-1 transition-colors",
              isActive && currentDirection === "asc" ? "text-white" : "text-zinc-700"
            )}
          />
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-colors",
              isActive && currentDirection === "desc" ? "text-white" : "text-zinc-700"
            )}
          />
        </div>
      </div>
    </th>
  );
}

// Inline edit cell
function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  format = "number"
}: {
  value: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: number) => void;
  onCancel: () => void;
  format?: "number" | "currency" | "percent";
}) {
  const [editValue, setEditValue] = useState(value.toString());

  const formattedValue = useMemo(() => {
    switch (format) {
      case "currency":
        return formatCurrency(value);
      case "percent":
        return formatPercent(value);
      default:
        return value.toFixed(2);
    }
  }, [value, format]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const num = parseFloat(editValue);
      if (!isNaN(num)) {
        onSave(num);
      }
    } else if (e.key === "Escape") {
      onCancel();
      setEditValue(value.toString());
    }
  };

  if (isEditing) {
    return (
      <input
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const num = parseFloat(editValue);
          if (!isNaN(num)) {
            onSave(num);
          } else {
            onCancel();
          }
        }}
        autoFocus
        className="w-full rounded-md border border-emerald-500/50 bg-black/50 px-2 py-1 font-mono text-sm text-white outline-none ring-2 ring-emerald-500/20"
      />
    );
  }

  return (
    <span
      className="cursor-pointer rounded px-1 py-0.5 font-mono tabular-nums transition-colors hover:bg-white/[0.04]"
      onClick={onStartEdit}
    >
      {formattedValue}
    </span>
  );
}

// Holdings row with animations
function HoldingRow({
  holding,
  index,
  editingCell,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete
}: {
  holding: HoldingSnapshot;
  index: number;
  editingCell: { ticker: string; field: string } | null;
  onStartEdit: (ticker: string, field: string) => void;
  onSaveEdit: (ticker: string, field: string, value: number) => void;
  onCancelEdit: () => void;
  onDelete?: (ticker: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isPositivePnL = (holding.dailyPnl ?? 0) >= 0;
  const isPositiveTotal = (holding.totalGain ?? 0) >= 0;

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="group border-b border-white/[0.04] transition-colors duration-200 hover:bg-white/[0.02]"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Ticker */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold text-white">
            {holding.ticker.slice(0, 2)}
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-white">{holding.ticker}</p>
            <p className="max-w-[120px] truncate text-xs text-zinc-500">
              {holding.companyName || holding.ticker}
            </p>
          </div>
        </div>
      </td>

      {/* Shares */}
      <td className="px-4 py-3.5 text-right">
        <EditableCell
          value={holding.shares}
          isEditing={editingCell?.ticker === holding.ticker && editingCell?.field === "shares"}
          onStartEdit={() => onStartEdit(holding.ticker, "shares")}
          onSave={(value) => onSaveEdit(holding.ticker, "shares", value)}
          onCancel={onCancelEdit}
        />
      </td>

      {/* Avg Cost */}
      <td className="px-4 py-3.5 text-right">
        <EditableCell
          value={holding.avgCost}
          isEditing={editingCell?.ticker === holding.ticker && editingCell?.field === "avgCost"}
          onStartEdit={() => onStartEdit(holding.ticker, "avgCost")}
          onSave={(value) => onSaveEdit(holding.ticker, "avgCost", value)}
          onCancel={onCancelEdit}
          format="currency"
        />
      </td>

      {/* Current Price */}
      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-white">
        {formatCurrency(holding.currentPrice)}
      </td>

      {/* Current Value */}
      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-white">
        {formatCurrency(holding.currentValue)}
      </td>

      {/* P&L */}
      <td className="px-4 py-3.5 text-right">
        <PnLCell
          value={holding.dailyPnl ?? 0}
          percent={holding.dailyPnlPercent ?? undefined}
        />
      </td>

      {/* Total Gain */}
      <td className="px-4 py-3.5 text-right">
        <span className={cn(
          "font-mono tabular-nums",
          isPositiveTotal ? "text-emerald-400" : "text-rose-400"
        )}>
          {formatCurrency(holding.totalGain ?? 0)}
          <span className="ml-1 text-zinc-500">
            ({isPositiveTotal ? "+" : ""}{formatPercent(holding.totalGainPercent ?? 0)})
          </span>
        </span>
      </td>

      {/* Weight */}
      <td className="px-4 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500/60"
              style={{ width: `${(holding.weight ?? 0) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right font-mono text-sm tabular-nums text-zinc-400">
            {formatPercent(holding.weight ?? 0)}
          </span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1"
            >
              <button
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                onClick={() => onStartEdit(holding.ticker, "shares")}
              >
                <Pencil className="h-4 w-4" />
              </button>
              {onDelete && (
                <button
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  onClick={() => onDelete(holding.ticker)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </td>
    </motion.tr>
  );
}

export function HoldingsTable({
  holdings,
  onEdit,
  onDelete,
  onAddHolding
}: HoldingsTableProps) {
  const [sortField, setSortField] = useState<SortField>("weight");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCell, setEditingCell] = useState<{ ticker: string; field: string } | null>(null);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }, [sortField]);

  const filteredAndSortedHoldings = useMemo(() => {
    let result = [...holdings];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (h) =>
          h.ticker.toLowerCase().includes(query) ||
          (h.companyName?.toLowerCase().includes(query) ?? false)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case "ticker":
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case "shares":
          aVal = a.shares;
          bVal = b.shares;
          break;
        case "avgCost":
          aVal = a.avgCost;
          bVal = b.avgCost;
          break;
        case "currentPrice":
          aVal = a.currentPrice ?? 0;
          bVal = b.currentPrice ?? 0;
          break;
        case "currentValue":
          aVal = a.currentValue ?? 0;
          bVal = b.currentValue ?? 0;
          break;
        case "dailyPnl":
          aVal = a.dailyPnl ?? 0;
          bVal = b.dailyPnl ?? 0;
          break;
        case "totalGain":
          aVal = a.totalGain ?? 0;
          bVal = b.totalGain ?? 0;
          break;
        case "weight":
          aVal = a.weight ?? 0;
          bVal = b.weight ?? 0;
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [holdings, searchQuery, sortField, sortDirection]);

  const handleStartEdit = (ticker: string, field: string) => {
    setEditingCell({ ticker, field });
  };

  const handleSaveEdit = (ticker: string, field: string, value: number) => {
    onEdit?.(ticker, field, value);
    setEditingCell(null);
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  // Summary stats
  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
  const totalDailyPnl = holdings.reduce((sum, h) => sum + (h.dailyPnl ?? 0), 0);
  const totalGain = holdings.reduce((sum, h) => sum + (h.totalGain ?? 0), 0);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <PremiumPanel
        title="Holdings"
        subtitle={`${holdings.length} positions`}
        action={
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-48 rounded-lg border border-white/[0.08] bg-black/30 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/[0.16] focus:ring-2 focus:ring-white/[0.08]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {onAddHolding && (
              <SecondaryButton onClick={onAddHolding}>
                <Plus className="h-4 w-4" />
                Add
              </SecondaryButton>
            )}
          </div>
        }
        noPadding
      >
        {/* Summary bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-6 py-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">Total Value</p>
              <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-white">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.06]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">Daily P&L</p>
              <p className={cn(
                "mt-0.5 font-mono text-lg font-semibold tabular-nums",
                totalDailyPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {totalDailyPnl >= 0 ? "+" : ""}{formatCurrency(totalDailyPnl)}
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.06]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">Total Gain</p>
              <p className={cn(
                "mt-0.5 font-mono text-lg font-semibold tabular-nums",
                totalGain >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {totalGain >= 0 ? "+" : ""}{formatCurrency(totalGain)}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr>
                <SortableHeader
                  label="Ticker"
                  field="ticker"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Shares"
                  field="shares"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Avg Cost"
                  field="avgCost"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Current"
                  field="currentPrice"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Value"
                  field="currentValue"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="P&L"
                  field="dailyPnl"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Total Gain"
                  field="totalGain"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Weight"
                  field="weight"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <th className="sticky top-0 z-10 w-20 border-b border-white/[0.06] bg-black/40 px-4 py-3.5 backdrop-blur-md" />
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedHoldings.map((holding, index) => (
                <HoldingRow
                  key={holding.ticker}
                  holding={holding}
                  index={index}
                  editingCell={editingCell}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedHoldings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-12 w-12 text-zinc-600" />
            <h3 className="mt-4 text-lg font-semibold text-white">No holdings found</h3>
            <p className="mt-2 text-sm text-zinc-500">
              {searchQuery
                ? "Try adjusting your search query"
                : "Add your first holding to get started"}
            </p>
          </div>
        )}
      </PremiumPanel>
    </motion.div>
  );
}
