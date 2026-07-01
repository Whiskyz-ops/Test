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
        ink: "#08080a",
        panel: "#111114",
        panel2: "#17171b",
        line: "rgba(255,255,255,0.08)",
        brandGold: "#D4AF37",
        brandCyan: "#06B6D4",
        exposed: "#ef4444",
        approaching: "#f59e0b",
        nexus: "#a855f7"
      }
    }
  },
  plugins: []
};
