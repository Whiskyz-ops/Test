/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Offline-safe premium stacks (no webfonts): SF Pro-class sans on Mac,
        // Segoe UI on Windows; an elegant serif for the WISING wordmark; mono for tags.
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["SF Pro Display", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Iowan Old Style", "Palatino Linotype", "Palatino", "Cormorant Garamond", "Garamond", "Georgia", "serif"],
        mono: ["SF Mono", "ui-monospace", "JetBrains Mono", "Menlo", "Liberation Mono", "monospace"]
      },
      colors: {
        // deep space surfaces (dark)
        ink: "#04060c",
        inkline: "rgba(255,255,255,0.08)",
        canvas: "#05070e",
        surface: "#0c0f18",
        surface2: "#12151f",
        line: "rgba(255,255,255,0.07)",
        // text on dark
        head: "#f3f4f8",
        body: "#c3c7d4",
        muted: "#8a8fa3",
        // WISING signature accent (teal → emerald) + functional/status palette
        accent: "#2dd4bf",
        accent2: "#34d399",
        accentSoft: "rgba(45,212,191,0.12)",
        exposed: "#ef4444",     // red — exposure / fines (from "The Problem")
        approaching: "#f5a623", // amber — approaching (reserved warning)
        filing: "#3b82f6",      // blue — filing-only / tracked (jurisdiction "bridge")
        positive: "#22c55e",    // green — on-track / verified / connected
        navy: "#1b2036"         // map: not tracked
      },
      boxShadow: {
        card: "inset 0 1px 0 rgba(255,255,255,0.035), 0 14px 36px -14px rgba(0,0,0,0.75)",
        cardhover: "inset 0 1px 0 rgba(255,255,255,0.06), 0 22px 52px -16px rgba(0,0,0,0.85)",
        glow: "0 0 0 1px rgba(45,212,191,0.18), 0 0 42px -8px rgba(45,212,191,0.40)"
      }
    }
  },
  plugins: []
};
