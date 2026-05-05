import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI",
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif",
        ],
      },
      backgroundImage: {
        "grid-slate":
          "linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)",
      },
      boxShadow: {
        "glow-brand": "0 10px 30px -10px rgba(99,102,241,0.45)",
        "glow-pink":  "0 10px 30px -10px rgba(236,72,153,0.45)",
      },
      animation: {
        "gradient-x": "gradient-x 8s ease infinite",
        "fade-in":    "fade-in 0.6s ease-out",
        "fade-up":    "fade-up 0.8s cubic-bezier(.16,1,.3,1) both",
        "scale-in":   "scale-in 0.6s cubic-bezier(.16,1,.3,1) both",
        "float":      "float 6s ease-in-out infinite",
        "spin-slow":  "spin 24s linear infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%":      { "background-position": "100% 50%" },
        },
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-14px)" },
        },
        "pulse-glow": {
          "0%, 100%": { "box-shadow": "0 0 0 0 rgba(99,102,241,0.45)" },
          "50%":      { "box-shadow": "0 0 0 18px rgba(99,102,241,0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
