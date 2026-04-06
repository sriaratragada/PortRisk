"use client";

// Re-export the premium dashboard as the main Dashboard component
export { PremiumDashboard as Dashboard } from "./dashboard/premium-dashboard";
export type { PremiumDashboardProps as DashboardProps } from "./dashboard/premium-dashboard";

// Also export individual tab components for flexibility
export { OverviewTab } from "./dashboard/overview-tab";
export { HoldingsTable } from "./dashboard/holdings-table";
export { ResearchTab } from "./dashboard/research-tab";
export { RiskTab } from "./dashboard/risk-tab";
export { StressTab } from "./dashboard/stress-tab";
export { AllocationTab } from "./dashboard/allocation-tab";
export { AuditTab } from "./dashboard/audit-tab";
export { PillNavigation } from "./dashboard/pill-navigation";
