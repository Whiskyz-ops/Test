"use client";
import { STATUS, STATUS_META, PAL, fmtUsd } from "@/lib/logic";

const CARDS = [
  { key: STATUS.EXPOSED, title: "Exposed", desc: "Tax resident · worldwide income taxed · liability accruing" },
  { key: STATUS.APPROACHING, title: "Approaching", desc: "Nearing a residency / reporting threshold" },
  { key: STATUS.NEXUS, title: "Filing-only", desc: "Threshold crossed · filing required · $0 tax" },
  { key: "all", title: "All Jurisdictions", desc: "Total jurisdictions monitored" }
];

export default function KpiCards({ kpis, active, onSelect }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((c) => {
        const meta = c.key === "all" ? { color: PAL.accent } : STATUS_META[c.key];
        const count = kpis[c.key];
        const isActive = active === c.key;
        return (
          <button key={c.key} onClick={() => onSelect(c.key)}
            className={"text-left rounded-2xl p-4 bg-surface border transition-all fade-in " +
              (isActive
                ? "border-accent/50 shadow-cardhover ring-1 ring-accent/25"
                : "border-line shadow-card hover:shadow-cardhover hover:-translate-y-0.5 hover:border-white/15")}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
              <span className="text-[11px] uppercase tracking-widest text-muted font-bold">{c.title}</span>
            </div>
            <div className="font-display font-extrabold text-3xl" style={{ color: c.key === "all" ? PAL.head : meta.color }}>{count}</div>
            <div className="text-[11px] text-muted mt-1 leading-snug">{c.desc}</div>
            {c.key === STATUS.EXPOSED && kpis.totalTax > 0 && (
              <div className="text-[11px] text-body mt-2">Est. tax <span className="font-mono font-semibold" style={{ color: PAL.redText }}>{fmtUsd(kpis.totalTax)}</span></div>
            )}
          </button>
        );
      })}
    </div>
  );
}
