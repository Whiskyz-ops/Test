/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // WISING brand fonts: Manrope for UI text; Cormorant Garamond for the
        // WISING wordmark specifically (confirmed via the site's own computed
        // font-family). Both self-hosted via @fontsource, offline-safe.
        sans: ["Manrope", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Manrope", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Cormorant Garamond", "Palatino Linotype", "Palatino", "Georgia", "serif"],
        mono: ["ui-monospace", "SF Mono", "JetBrains Mono", "Menlo", "monospace"]
      },
      colors: {
        // WISING brand — true black canvas, white ink, emerald + blue accents.
        ink: "#000000",
        inkline: "rgba(255,255,255,0.08)",
        canvas: "#0b0b0b",
        surface: "#161616",
        surface2: "#1e1e1e",
        line: "rgba(255,255,255,0.08)",
        // white ink on black
        head: "#ffffff",
        body: "#c7cbd2",
        muted: "#8b8f99",
        // WISING signature: emerald (#34d399) + blue (#60a5fa)
        accent: "#34d399",
        accent2: "#60a5fa",
        accentSoft: "rgba(52,211,153,0.12)",
        panel: "#161616",       // featured panel (emerald-lit dark, not light)
        panelink: "#ffffff",
        exposed: "#ef4444",     // red — exposure / fines (reserved status)
        approaching: "#f5a623", // amber — approaching (reserved warning)
        filing: "#60a5fa",      // blue — filing-only / tracked (brand blue)
        positive: "#34d399",    // emerald — on-track / verified / connected
        navy: "#1a1a1a"         // map: not tracked
      },
      boxShadow: {
        card: "inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 36px -16px rgba(0,0,0,0.85)",
        cardhover: "inset 0 1px 0 rgba(255,255,255,0.07), 0 22px 52px -18px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(52,211,153,0.2), 0 0 42px -8px rgba(52,211,153,0.4)"
      }
    }
  },
  plugins: []
};
