/** Tailwind config for the WISING Layer 2 frontend.
 *  Produces a self-contained assets/tailwind.css so the investor demo never
 *  depends on the CDN / venue wifi. Only the Layer 2 pages are scanned; the two
 *  Layer 1 intake forms keep their own CDN setup untouched. */
module.exports = {
  content: ["./index.html", "./router.html", "./dtaa_bridge.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Outfit", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      colors: {
        brandDark: "#0c0c0c",
        brandGray: "#1c1c1c",
        brandGold: "#D4AF37",
        brandRed: "#991B1B",
        brandGreen: "#10B981",
        brandCyan: "#06B6D4"
      },
      letterSpacing: { widest: "0.25em", header: "0.5em" }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};
