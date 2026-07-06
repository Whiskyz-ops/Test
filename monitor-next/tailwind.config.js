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
        // Design-A skin — warm olive-charcoal surfaces (flat, editorial)
        ink: "#0f110a",
        inkline: "rgba(232,236,214,0.09)",
        canvas: "#13150d",
        surface: "#1a1d13",
        surface2: "#20241a",
        line: "rgba(232,236,214,0.09)",
        // warm text on olive
        head: "#eef0e3",
        body: "#b4b7a6",
        muted: "#84877a",
        // Design-A signature: single sage-lime accent + cream light panel
        accent: "#c2dd8f",
        accent2: "#a9cd76",
        accentSoft: "rgba(194,221,143,0.12)",
        panel: "#e8ecd7",       // cream light-panel (hero stat) — dark text on it
        panelink: "#14160e",
        exposed: "#ef4444",     // red — exposure / fines (reserved status)
        approaching: "#f5a623", // amber — approaching (reserved warning)
        filing: "#3b82f6",      // blue — filing-only / tracked
        positive: "#8fbf5a",    // sage-green — on-track / verified / connected
        navy: "#23271a"         // map: not tracked
      },
      boxShadow: {
        card: "inset 0 1px 0 rgba(232,236,214,0.035), 0 14px 36px -16px rgba(0,0,0,0.7)",
        cardhover: "inset 0 1px 0 rgba(232,236,214,0.06), 0 22px 52px -18px rgba(0,0,0,0.8)",
        glow: "0 0 0 1px rgba(194,221,143,0.18), 0 0 42px -8px rgba(194,221,143,0.35)"
      }
    }
  },
  plugins: []
};
