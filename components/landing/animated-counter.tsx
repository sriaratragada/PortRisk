"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

type AnimatedCounterProps = {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
};

export function AnimatedCounter({ value, suffix = "", prefix = "", label }: AnimatedCounterProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => {
    if (value >= 100) return Math.round(v).toString();
    if (value >= 10) return v.toFixed(1);
    return v.toFixed(2);
  });

  useEffect(() => {
    const controls = animate(count, value, { duration: 2, ease: "easeOut" });
    return controls.stop;
  }, [count, value]);

  return (
    <div className="text-center">
      <div className="font-mono-data text-xl font-semibold text-foreground">
        {prefix}
        <motion.span>{rounded}</motion.span>
        <span className="ml-0.5 text-sm text-primary/80">{suffix}</span>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
