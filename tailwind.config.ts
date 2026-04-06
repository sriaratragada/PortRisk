import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Core backgrounds - warm off-white system
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "bg-hover": "var(--bg-hover)",
        "bg-inset": "var(--bg-inset)",
        
        // Borders
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        "border-accent": "var(--border-accent)",
        
        // Text hierarchy
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-inverse": "var(--text-inverse)",
        
        // Accents
        "accent": "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-muted": "var(--accent-muted)",
        
        // Semantic
        "positive": "var(--positive)",
        "negative": "var(--negative)",
        "neutral": "var(--neutral)",
        
        // Legacy compatibility
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        success: "var(--positive)",
        danger: "var(--negative)",
        warning: "var(--accent)",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Playfair Display", "serif"],
        ui: ["var(--font-sora)", "Sora", "sans-serif"],
        sans: ["var(--font-sora)", "Sora", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        // Typography system per spec
        "page-title": ["28px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "700" }],
        "section-header": ["18px", { lineHeight: "1.3", fontWeight: "600" }],
        "tab-label": ["11px", { lineHeight: "1.4", letterSpacing: "0.12em", fontWeight: "600" }],
        "table-header": ["10px", { lineHeight: "1.4", letterSpacing: "0.14em", fontWeight: "600" }],
        "table-body": ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        "metric-large": ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        "metric-label": ["10px", { lineHeight: "1.4", letterSpacing: "0.12em", fontWeight: "500" }],
        "badge": ["10px", { lineHeight: "1.4", letterSpacing: "0.1em", fontWeight: "500" }],
        "button": ["11px", { lineHeight: "1.4", letterSpacing: "0.1em", fontWeight: "500" }],
        "body-desc": ["13px", { lineHeight: "1.7", fontWeight: "300" }],
      },
      boxShadow: {
        "sm": "var(--shadow-sm)",
        "md": "var(--shadow-md)",
      },
      borderRadius: {
        "sm": "2px",
        "DEFAULT": "4px",
        "md": "4px",
        "lg": "6px",
        "xl": "8px",
      },
      spacing: {
        "topbar": "48px",
        "tabbar": "40px",
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      animation: {
        "tab-enter": "tab-enter 200ms ease-out",
        "tab-exit": "tab-exit 150ms ease-out",
        "modal-enter": "modal-enter 200ms ease-out",
        "modal-exit": "modal-exit 150ms ease-out",
        "kpi-enter": "kpi-enter 300ms ease-out",
        "row-enter": "row-enter 200ms ease-out",
        "shimmer": "shimmer 1.5s infinite",
        "chart-draw": "chart-draw 600ms ease-out",
        "bar-grow": "bar-grow 400ms ease-out",
      },
      keyframes: {
        "tab-enter": {
          "from": { opacity: "0", transform: "translateX(8px)" },
          "to": { opacity: "1", transform: "translateX(0)" }
        },
        "tab-exit": {
          "from": { opacity: "1", transform: "translateX(0)" },
          "to": { opacity: "0", transform: "translateX(-8px)" }
        },
        "modal-enter": {
          "from": { opacity: "0", transform: "scale(0.97)" },
          "to": { opacity: "1", transform: "scale(1)" }
        },
        "modal-exit": {
          "from": { opacity: "1", transform: "scale(1)" },
          "to": { opacity: "0", transform: "scale(0.97)" }
        },
        "kpi-enter": {
          "from": { opacity: "0", transform: "translateY(6px)" },
          "to": { opacity: "1", transform: "translateY(0)" }
        },
        "row-enter": {
          "from": { opacity: "0", transform: "translateY(4px)" },
          "to": { opacity: "1", transform: "translateY(0)" }
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        },
        "chart-draw": {
          "from": { strokeDashoffset: "1000" },
          "to": { strokeDashoffset: "0" }
        },
        "bar-grow": {
          "from": { transform: "scaleX(0)" },
          "to": { transform: "scaleX(1)" }
        },
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
