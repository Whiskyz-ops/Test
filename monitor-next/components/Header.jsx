"use client";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";

export default function Header({ region, onRegionChange }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl">Monitor</h1>
        <p className="text-white/45 text-sm mt-1">Keep track of your cross-border tax exposure — residency, reporting limits &amp; filings.</p>
        <p className="text-[12px] text-white/55 mt-1">
          Client <span className="font-semibold text-white/80">{CLIENT.name}</span>
          <span className="text-white/30"> · {CLIENT.period}</span>
        </p>
      </div>

      <div className="relative">
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          className="appearance-none bg-panel2 border border-line rounded-xl pl-4 pr-10 py-2.5 text-sm font-semibold text-white/85 hover:border-white/20 focus:outline-none focus:border-brandCyan cursor-pointer"
        >
          {REGION_FILTERS.map((r) => (
            <option key={r} value={r} className="bg-panel text-white">
              {r === "United States" ? "United States (drill to states)" : r}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">▾</span>
      </div>
    </div>
  );
}
