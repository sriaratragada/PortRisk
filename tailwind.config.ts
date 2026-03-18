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
        surface: "#0f1217",
        canvas: "#151a22",
        sidebar: "#0b0f14",
        panel: "#171d26",
        muted: "#111720",
        accent: "#f7f9fc",
        border: "#2a323d",
        success: "#22c55e",
        warning: "#f8cc5c",
        elevated: "#f38d6b",
        danger: "#ef6a70"
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        panel: "0 10px 24px rgba(0, 0, 0, 0.24)",
        shell: "0 18px 36px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
