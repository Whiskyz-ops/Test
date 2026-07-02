"use client";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";

export default function Header({ region, onRegionChange, clientName }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-tight text-head">Monitor</h1>
        <p className="text-muted text-sm mt-1.5">Cross-border tax exposure for professionals — residency, reporting limits, filings &amp; FTC.</p>
        <p className="text-[12px] text-body mt-2">
          Client <span className="font-semibold text-head">{clientName || CLIENT.name}</span>
          <span className="text-muted"> · {CLIENT.period}</span>
        </p>
      </div>
      <div className="relative">
        <select value={region} onChange={(e) => onRegionChange(e.target.value)}
          className="appearance-none bg-surface border border-line rounded-xl pl-4 pr-10 py-2.5 text-sm font-semibold text-head shadow-card hover:border-accent/50 focus:outline-none focus:border-accent cursor-pointer">
          {REGION_FILTERS.map((r) => <option key={r} value={r} className="bg-[#0c0f18] text-head">{r === "United States" ? "United States (drill to states)" : r}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
      </div>
    </div>
  );
}
