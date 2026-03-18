"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  index: number;
};

export function FeatureCard({ icon: Icon, title, description, index }: FeatureCardProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-surface-bright/60 p-4 shadow-lg shadow-black/30">
      <div className="absolute inset-0 opacity-50">
        <div className="absolute inset-0 grid-pattern" />
      </div>
      <div className="relative z-10 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
              className="h-1 w-1 rounded-full bg-primary animate-pulse-glow"
            />
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
