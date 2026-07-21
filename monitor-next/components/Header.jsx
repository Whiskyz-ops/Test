"use client";
import { Globe2, Settings } from "lucide-react";
import { REGION_FILTERS, CLIENT } from "@/lib/mockData";
import { PAL } from "@/lib/logic";

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

export default function Header({ region, onRegionChange, clientName, baseYear, entity, scope, presentationMode, onTogglePresentation }) {
  // Scope is the ENGINE's own determination of which country a taxpayer is
  // actually exposed in — see model.meta.hasIndiaScope/hasUsScope
  // (normalize.js) — derived from real reported facts (days present,
  // citizenship/green-card, US-source income/assets), not merely from
  // whether Layer 1's `india`/`us` object exists in the bundle (both always
  // exist as a shell so neither form crashes if opened). Default to both
  // in scope so this degrades to the old always-dual behavior before a
  // result has loaded.
  const hasIndiaScope = scope ? scope.hasIndiaScope !== false : true;
  const hasUsScope = scope ? scope.hasUsScope !== false : true;
  const periodParts = [];
  if (baseYear && hasIndiaScope) periodParts.push(`TY${baseYear}-${String(baseYear + 1).slice(2)} (India)`);
  if (baseYear && hasUsScope) periodParts.push(`TY${baseYear} (US)`);
  const period = periodParts.length ? periodParts.join(" / ") : CLIENT.period;
  const indiaLabel = entity ? (INDIA_ENTITY_LABEL[entity.indiaKind] || entity.indiaKind) : null;
  const usLabel = entity ? (US_ENTITY_LABEL[entity.usKind] || entity.usKind) : null;
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
          <div className="hidden md:flex items-center gap-1.5 shrink-0 ml-1" title="Tax entity type — only the country(ies) this taxpayer is actually in scope for">
            {hasIndiaScope && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-white/[0.04] border border-line text-body">🇮🇳 {indiaLabel}</span>}
            {hasUsScope && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-white/[0.04] border border-line text-body">🇺🇸 {usLabel}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <button onClick={onTogglePresentation}
          title={presentationMode ? "Presentation mode is ON — engineering controls (compute-source pill, shadow-diff badge, raw intake-form links) are hidden. Click to show them again." : "Presentation mode — hides engineering-only controls for a client-facing or recorded view."}
          className={"w-10 h-10 rounded-2xl border flex items-center justify-center shadow-card transition-colors " + (presentationMode ? "" : "bg-surface text-muted hover:text-head hover:border-accent/40")}
          style={presentationMode ? { color: PAL.greenText, borderColor: PAL.positive + "55", background: PAL.positive + "18" } : undefined}
        ><Settings size={16} strokeWidth={2} /></button>
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
