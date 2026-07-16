"use client";
import { Globe2, Settings } from "lucide-react";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";

// entity_type (India) / resolved tax_entity_type (US) → a short, unambiguous
// label — shown as its own badge pair so the taxpayer TYPE is visible on
// every tab without digging into Residency/Business, and never confusable
// with the client's name/period line next to it.
const INDIA_ENTITY_LABEL = {
  individual: "Individual", huf: "HUF", firm: "Firm", llp: "LLP", company: "Company",
  trust: "Trust", ngo: "NGO", society: "Society", political_party: "Political Party",
  aop: "AOP", boi: "BOI", ajp: "AJP", local: "Local Authority"
};
const US_ENTITY_LABEL = {
  individual: "Individual", ccorp: "C-Corp", scorp: "S-Corp", partnership: "Partnership", trust: "Trust"
};

export default function Header({ region, onRegionChange, clientName, baseYear, entity }) {
  const period = baseYear ? `TY${baseYear}-${String(baseYear + 1).slice(2)} (India) / TY${baseYear} (US)` : CLIENT.period;
  const indiaLabel = entity ? (INDIA_ENTITY_LABEL[entity.indiaKind] || entity.indiaKind) : null;
  // Entity type is one fact about the taxpayer, not two — Layer 1 US's own
  // tax_entity_type field only has a real, deliberately-set value when a
  // SEPARATE US entity (ccorp/scorp/partnership/trust) was actually
  // organized (E.usIsBusiness). Otherwise it just sits at its unset
  // "individual" default, including for taxpayers who are plainly not
  // individuals at all (a company/HUF/firm whose only registration is in
  // India). Showing that default as "US: Individual" next to "India:
  // Company" reads as two conflicting classifications for one taxpayer;
  // mirror India's label instead whenever the US side has no real entity
  // election of its own to show.
  const usLabel = entity
    ? (entity.usIsBusiness ? (US_ENTITY_LABEL[entity.usKind] || entity.usKind)
      : entity.indiaKind !== "individual" ? (INDIA_ENTITY_LABEL[entity.indiaKind] || entity.indiaKind)
      : (US_ENTITY_LABEL[entity.usKind] || entity.usKind))
    : null;
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
        {entity && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0 ml-1" title="Tax entity type — India / US">
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-white/[0.04] border border-line text-body">🇮🇳 {indiaLabel}</span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-white/[0.04] border border-line text-body">🇺🇸 {usLabel}</span>
          </div>
        )}
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
