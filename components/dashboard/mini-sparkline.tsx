"use client";

import { motion } from "framer-motion";

const data = [20, 25, 22, 30, 28, 35, 32, 40, 38, 45, 42, 50, 48, 55, 52, 58, 60, 57, 62, 65];

export function MiniSparkline() {
  const width = 400;
  const height = 60;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * height * 0.85 - height * 0.05
  }));

  const pathD = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(199 89% 60%)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="hsl(199 89% 60%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaD}
        fill="url(#sparkFill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke="hsl(199 89% 60%)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      <motion.circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill="hsl(199 89% 60%)"
        initial={{ scale: 0 }}
        animate={{ scale: [1, 1.4, 1] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
      />
    </svg>
  );
}
