"use client";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";

// Inline icon "chip" — the reference sets small rounded glyph-chips inside the
// display heading. WISING keeps the teal signature.
function Chip({ children, tone = "teal" }) {
  const bg = tone === "teal" ? "linear-gradient(135deg,#c2dd8f,#a9cd76)" : "#1a1d13";
  const fg = tone === "teal" ? "#04120f" : "#eef0e3";
  return (
    <span className="inline-flex items-center justify-center align-middle mx-1.5 w-11 h-9 rounded-2xl text-[16px] translate-y-[-2px] shadow-[0_6px_20px_-6px_rgba(194,221,143,0.6)]"
      style={{ background: bg, color: fg, border: tone === "teal" ? "none" : "1px solid rgba(255,255,255,0.08)" }}>{children}</span>
  );
}

export default function Header({ region, onRegionChange, clientName }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="font-display font-extrabold text-[40px] leading-[1.05] tracking-tight text-head">
          Monitoring <Chip>🌐</Chip> cross-border<br />
          tax <Chip tone="dark">✦</Chip> exposure
        </h1>
        <p className="text-[12px] text-body mt-3">
          Client <span className="font-semibold text-head">{clientName || CLIENT.name}</span>
          <span className="text-muted"> · {CLIENT.period} · residency, reporting limits, filings &amp; FTC</span>
        </p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <button className="w-11 h-11 rounded-2xl bg-surface border border-line text-muted hover:text-head hover:border-accent/40 flex items-center justify-center text-[15px] shadow-card" title="Settings">⚙</button>
        <div className="relative">
          <select value={region} onChange={(e) => onRegionChange(e.target.value)}
            className="appearance-none bg-surface border border-line rounded-2xl pl-4 pr-10 py-3 text-sm font-semibold text-head shadow-card hover:border-accent/50 focus:outline-none focus:border-accent cursor-pointer">
            {REGION_FILTERS.map((r) => <option key={r} value={r} className="bg-[#1a1d13] text-head">{r === "United States" ? "United States (drill to states)" : r}</option>)}
          </select>
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
        </div>
      </div>
    </div>
  );
}
