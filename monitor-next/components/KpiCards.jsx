"use client";
import { STATUS, STATUS_META, fmtUsd } from "@/lib/logic";

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
        const meta = c.key === "all" ? { color: "#71717a", soft: "rgba(113,113,122,.14)" } : STATUS_META[c.key];
        const count = kpis[c.key];
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            className={
              "text-left rounded-2xl p-4 border transition-all fade-in " +
              (isActive ? "bg-white/[0.07] border-white/25 shadow-lg" : "bg-panel border-line hover:border-white/20 hover:-translate-y-0.5")
            }
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
              <span className="text-[11px] uppercase tracking-widest text-white/45 font-bold">{c.title}</span>
            </div>
            <div className="font-display font-extrabold text-3xl" style={{ color: c.key === "all" ? "#fff" : meta.color }}>
              {count}
            </div>
            <div className="text-[11px] text-white/40 mt-1 leading-snug">{c.desc}</div>
            {c.key === STATUS.EXPOSED && kpis.totalTax > 0 && (
              <div className="text-[11px] text-white/55 mt-2">
                Est. tax <span className="font-mono text-exposed">{fmtUsd(kpis.totalTax)}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
