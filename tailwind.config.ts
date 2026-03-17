import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "#0c1118",
        canvas: "#111925",
        sidebar: "#090d14",
        panel: "#131b27",
        muted: "#101722",
        accent: "#f7f9fc",
        border: "#2a323d",
        success: "#22c55e",
        warning: "#f8cc5c",
        elevated: "#f38d6b",
        danger: "#ef6a70"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        panel: "0 12px 24px rgba(1, 4, 10, 0.28)",
        shell: "0 18px 36px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
