"use client";

import { MiniSparkline } from "@/components/dashboard/mini-sparkline";

export function MockDashboard() {
  return (
    <div className="panel overflow-hidden p-3 shadow-2xl shadow-black/30">
      <div className="mb-3 flex items-center gap-3 border-b border-subtle pb-3">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-positive/60" />
        </div>
        <div className="h-5 w-40 rounded skeleton-shimmer" />
        <div className="ml-auto flex gap-2">
          <div className="h-5 w-16 rounded skeleton-shimmer" />
          <div className="h-5 w-16 rounded skeleton-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-2 space-y-1.5">
          {["Overview", "Holdings", "Risk", "Stress", "Audit"].map((label, i) => (
            <div
              key={label}
              className={`rounded px-2 py-1.5 text-[10px] ${
                i === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="col-span-7 space-y-2">
          <div className="panel-bright p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Portfolio Value
              </span>
              <span className="font-mono-data text-lg font-semibold text-positive">$847.2M</span>
            </div>
            <MiniSparkline />
          </div>

          <div className="panel-bright p-2">
            <div className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Top Holdings
            </div>
            {[{ name: "AAPL", weight: "8.4%", pnl: "+2.31%", risk: "Low" }, { name: "MSFT", weight: "7.1%", pnl: "+1.87%", risk: "Low" }, { name: "NVDA", weight: "6.8%", pnl: "-0.42%", risk: "Med" }, { name: "AMZN", weight: "5.2%", pnl: "+3.14%", risk: "Low" }].map(
              (h) => (
                <div
                  key={h.name}
                  className="flex items-center border-b border-subtle px-1 py-1 text-[10px] last:border-0"
                >
                  <span className="w-12 font-mono-data font-medium">{h.name}</span>
                  <span className="w-12 font-mono-data text-muted-foreground">{h.weight}</span>
                  <span
                    className={`w-14 font-mono-data ${
                      h.pnl.startsWith("+") ? "text-positive" : "text-risk"
                    }`}
                  >
                    {h.pnl}
                  </span>
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 text-[9px] ${
                      h.risk === "Low"
                        ? "bg-positive/10 text-positive"
                        : "bg-yellow-500/10 text-yellow-400"
                    }`}
                  >
                    {h.risk}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="col-span-3 space-y-2">
          {[{ label: "vs Benchmark", value: "+1.24%", positive: true }, { label: "Risk Tier", value: "Moderate", positive: false }, { label: "Concentration", value: "Top 10: 52%", positive: false }, { label: "Biggest Mover", value: "NVDA -4.2%", positive: false }].map(
            (stat) => (
              <div key={stat.label} className="panel-bright p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div
                  className={`mt-0.5 font-mono-data text-xs font-medium ${
                    stat.positive ? "text-positive" : "text-foreground"
                  }`}
                >
                  {stat.value}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
