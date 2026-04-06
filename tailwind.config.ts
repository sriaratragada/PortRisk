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
        border: "hsl(var(--border))",
        "border-subtle": "hsl(var(--border-subtle))",
        "border-strong": "hsl(var(--border-strong))",
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
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        positive: "hsl(var(--positive))",
        "positive-foreground": "hsl(var(--positive-foreground))",
        warning: "hsl(var(--warning))",
        elevated: "hsl(var(--elevated-risk))",
        surface: "hsl(var(--surface))",
        "surface-raised": "hsl(var(--surface-raised))",
        "surface-elevated": "hsl(var(--surface-elevated))",
        "surface-overlay": "hsl(var(--surface-overlay))",
        canvas: "hsl(var(--surface-raised))",
        sidebar: "hsl(var(--sidebar-background))",
        panel: "hsl(var(--surface))",
        success: "hsl(var(--positive))",
        danger: "hsl(var(--destructive))",
        // Specific gain/loss colors per spec
        gain: "#10b981",
        loss: "#f43f5e"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        data: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        // Typography system per spec
        "display": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "heading-lg": ["32px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "heading-md": ["24px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-sm": ["18px", { lineHeight: "1.4", letterSpacing: "-0.005em", fontWeight: "600" }],
        "body": ["15px", { lineHeight: "1.5", fontWeight: "400" }],
        "label": ["13px", { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "500" }]
      },
      boxShadow: {
        // Premium shadows per spec
        "premium": "0 0 0 1px rgba(255, 255, 255, 0.03), 0 25px 50px -12px rgba(0, 0, 0, 0.4)",
        "premium-hover": "0 8px 30px rgb(0, 0, 0, 0.4)",
        "panel": "0 10px 24px rgba(0, 0, 0, 0.24)",
        "shell": "0 18px 36px rgba(0, 0, 0, 0.35)",
        "glow-emerald": "0 0 20px rgba(16, 185, 129, 0.15)",
        "glow-rose": "0 0 20px rgba(244, 63, 94, 0.15)",
        "inner-highlight": "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)"
      },
      borderRadius: {
        "xl": "12px",
        "lg": "var(--radius)",
        "md": "calc(var(--radius) - 2px)",
        "sm": "calc(var(--radius) - 4px)"
      },
      spacing: {
        // Card padding per spec
        "card-x": "24px",
        "card-y": "20px"
      },
      transitionTimingFunction: {
        // Apple-like easing
        "apple": "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      transitionDuration: {
        "250": "250ms",
        "400": "400ms"
      },
      animation: {
        "page-enter": "page-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        "stagger": "stagger-fade-in 0.3s ease-out forwards",
        "number-tick": "number-tick 0.3s cubic-bezier(0.22, 1, 0.36, 1)"
      },
      keyframes: {
        "page-enter": {
          "from": { opacity: "0", transform: "translateY(8px)" },
          "to": { opacity: "1", transform: "translateY(0)" }
        },
        "stagger-fade-in": {
          "from": { opacity: "0", transform: "translateY(4px)" },
          "to": { opacity: "1", transform: "translateY(0)" }
        },
        "number-tick": {
          "from": { opacity: "0", transform: "translateY(-8px)" },
          "to": { opacity: "1", transform: "translateY(0)" }
        }
      },
      backgroundImage: {
        // Card gradients per spec
        "card-gradient": "linear-gradient(to bottom right, rgb(24 24 27 / 0.5), rgb(9 9 11 / 0.5))",
        "card-gradient-nested": "linear-gradient(to bottom right, rgb(24 24 27 / 0.3), rgb(9 9 11 / 0.3))",
        "card-gradient-subtle": "linear-gradient(to bottom right, rgb(24 24 27 / 0.4), rgb(9 9 11 / 0.4))"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
