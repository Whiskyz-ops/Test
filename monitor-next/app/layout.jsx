// Brand fonts (Manrope + Cormorant Garamond) embedded as base64 @font-face —
// zero external requests, so it works offline (file://) and on Vercel.
// Regenerated at prebuild.
import "./fonts-embedded.css";
import "./globals.css";

// Vercel Web Analytics — mounted unconditionally (its own script is a no-op
// off Vercel, e.g. the offline file:// double-click build or `npm run serve`)
// so lib/shadow.js's track() calls (docs/PYTHON_DAG_MIGRATION_TRACKER.md's
// Phase 8 promotion-gate telemetry) have somewhere to go once Web Analytics
// is enabled on the Vercel project. Collects only the small, non-taxpayer
// event payload shadow.js sends (sourcePair/source/ok/divergenceCount) — no
// raw profile data, no divergence detail. NOTE: Web Analytics itself is NOT
// yet enabled on the "test" project (Wising team) as of this writing —
// verified via the Vercel API (404 Web Analytics not found) — this only
// wires the client; someone with dashboard access still needs to turn the
// feature on before any events are actually collected.
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "WISING — Monitor",
  description: "Keep track of your exposure around the world."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
