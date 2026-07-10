"use client";
import { Globe2, Settings } from "lucide-react";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";

export default function Header({ region, onRegionChange, clientName, baseYear }) {
  const period = baseYear ? `FY${baseYear}-${String(baseYear + 1).slice(2)} / TY${baseYear}` : CLIENT.period;
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-[#04120f] shadow-[0_6px_18px_-6px_rgba(52,211,153,0.55)]"
          style={{ background: "linear-gradient(135deg,#34d399,#60a5fa)" }}><Globe2 size={19} strokeWidth={2} /></span>
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl leading-tight tracking-tight text-head truncate">Cross-Border Monitor</h1>
          <p className="text-[12px] text-muted truncate">
            <span className="font-semibold text-body">{clientName || CLIENT.name}</span> · {period}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <button className="w-10 h-10 rounded-2xl bg-surface border border-line text-muted hover:text-head hover:border-accent/40 flex items-center justify-center shadow-card" title="Settings"><Settings size={16} strokeWidth={2} /></button>
        <div className="relative">
          <select value={region} onChange={(e) => onRegionChange(e.target.value)}
            className="appearance-none bg-surface border border-line rounded-2xl pl-4 pr-9 py-2.5 text-[13px] font-semibold text-head shadow-card hover:border-accent/50 focus:outline-none focus:border-accent cursor-pointer">
            {REGION_FILTERS.map((r) => <option key={r} value={r} className="bg-[#161616] text-head">{r === "United States" ? "United States (drill to states)" : r}</option>)}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
        </div>
      </div>
    </div>
  );
}
