/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      colors: {
        // glass-black sidebar
        ink: "#0b0a11",
        inkline: "rgba(255,255,255,0.08)",
        // light main surfaces
        canvas: "#f5f5fa",
        surface: "#ffffff",
        surface2: "#fafafd",
        line: "#e9e9f0",
        // text (light theme)
        head: "#191527",
        body: "#413d54",
        muted: "#8b8798",
        // brand + status
        accent: "#6d5ef7",
        accentSoft: "#efedfe",
        exposed: "#ef4d6a",
        approaching: "#d97706",
        filing: "#8b5cf6",
        navy: "#2b2950"
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,15,40,0.05), 0 6px 20px rgba(16,15,40,0.05)",
        cardhover: "0 2px 4px rgba(16,15,40,0.06), 0 12px 32px rgba(16,15,40,0.08)"
      }
    }
  },
  plugins: []
};
