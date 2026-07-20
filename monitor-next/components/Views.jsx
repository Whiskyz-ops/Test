"use client";
import { useState, useEffect, useRef } from "react";
import {
  Compass, ScrollText, Scale, CalendarClock, CalendarRange, RefreshCcw, Calculator,
  FolderOpen, Ruler, Landmark, TrendingUp, Building2, Home, Palmtree, BookOpen, Plug,
  Wallet, Receipt, TrendingDown, Globe2, Users, AlertTriangle, Siren, DollarSign, Banknote, PenLine,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { fmtUsd, PAL } from "@/lib/logic";
import CapsuleChart from "@/components/CapsuleChart";

const SEV = { critical: PAL.exposed, warning: PAL.approaching, info: PAL.filing };
const SEV_TEXT = { critical: PAL.redText, warning: PAL.amberText, info: PAL.blueText };
const GREEN = PAL.positive;
const fmtInr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

// Soft rounded card with an optional icon-chip header (the reference language).
const Card = ({ title, sub, children, right, icon }) => (
  <section className="rounded-[26px] bg-surface border border-line shadow-card p-5">
    {title && (
      <div className="flex items-start gap-3 mb-3">
        {icon && <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-[15px] border shrink-0" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>{icon}</span>}
        <div className="flex-1 min-w-0"><h3 className="font-display font-bold text-lg text-head">{title}</h3>{sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}</div>
        {right}
      </div>
    )}
    {children}
  </section>
);
const Empty = ({ children }) => <div className="text-center text-muted text-sm py-10">{children}</div>;
const Ref = ({ children }) => <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.05] border border-line text-muted">{children}</span>;

// Every row in Tax Computation / FTC Reconciliation carries a `trace`: either
// { kind: "source", detail } — pulled from Layer 1 with no material
// computation — or { kind: "calc", formula, parts } — a formula over other
// already-shown numbers. Clicking a row pops this open in place; nothing
// navigates away from the Monitor.
function TracePopup({ trace, fmt, onClose }) {
  const isSource = trace.kind === "source";
  return (
    <div onClick={(e) => e.stopPropagation()}
      className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-line bg-[#161616] shadow-cardhover p-3 text-left">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ background: (isSource ? PAL.positive : PAL.blueText) + "24", color: isSource ? PAL.greenText : PAL.blueText }}>
          {isSource ? "Source" : "Calculated"}
        </span>
        <button onClick={onClose} className="text-muted hover:text-head text-[13px] leading-none px-1">×</button>
      </div>
      {isSource ? (
        <div className="text-[11px] text-body leading-relaxed">{trace.detail}</div>
      ) : (
        <>
          <div className="text-[11px] text-body leading-relaxed">{trace.formula}</div>
          {trace.parts && trace.parts.length > 0 && (
            <div className="space-y-1 border-t border-line mt-2 pt-2">
              {trace.parts.map((part, i) => (
                <div key={i} className="flex justify-between gap-3 text-[11px]">
                  <span className="text-muted">{part.label}</span>
                  <span className="font-mono text-head whitespace-nowrap">{part.display !== undefined ? part.display : (part.amount < 0 ? "(" + fmt(Math.abs(part.amount)) + ")" : fmt(part.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
function TraceRow({ label, valueDisp, color, emphasis, trace, fmt, onJump }) {
  const [open, setOpen] = useState(false);
  const isJumpLink = trace && trace.kind === "holdings" && onJump;
  return (
    <div className="relative">
      <button onClick={() => (isJumpLink ? onJump(trace.section) : setOpen((o) => !o))}
        className={"w-full flex justify-between gap-3 text-[12px] text-left rounded px-1 -mx-1 transition-colors hover:bg-white/[0.06] cursor-pointer " +
          (emphasis ? "border-t border-line pt-1.5 mt-1 font-bold text-head" : "text-body")}>
        <span style={color && !emphasis ? { color } : undefined}>{label}{isJumpLink && <span className="text-muted ml-1" title="Jumps to the income-by-head breakdown below">↗</span>}</span>
        <span className="font-mono" style={color ? { color } : undefined}>{valueDisp}</span>
      </button>
      {open && !isJumpLink && trace && <TracePopup trace={trace} fmt={fmt} onClose={() => setOpen(false)} />}
      {isJumpLink && trace.note && <div className="text-[10px] text-muted mt-0.5 ml-1">{trace.note}</div>}
    </div>
  );
}

// Shared stat card — icon chip + big Manrope number. WISING brand: black card,
// or an emerald-lit featured card when highlighted.
const StatTile = ({ icon, label, value, sub, accent, highlight }) => {
  const numColor = accent || (highlight ? PAL.accent : PAL.head);
  return (
    <div className="rounded-[26px] border shadow-card p-4 hover:shadow-cardhover transition-all"
      style={{ background: highlight ? "linear-gradient(155deg,rgba(52,211,153,0.14),rgba(96,165,250,0.05))" : "#161616", borderColor: highlight ? "rgba(52,211,153,0.32)" : "rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-[14px] border shrink-0" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>{icon}</span>
        <span className="text-[10px] uppercase tracking-widest font-bold flex-1 leading-tight text-muted">{label}</span>
        <span className="text-base leading-none select-none text-muted">⋯</span>
      </div>
      <div className="font-display font-extrabold text-[27px] leading-none tracking-tight" style={{ color: numColor }}>{value}</div>
      {sub && <div className="text-[11px] mt-1.5 text-muted">{sub}</div>}
    </div>
  );
};

// Segmented capsule meter (pill-progress row) — replaces thin bars. Optional
// projPct draws a dashed "projected at current pace" tick (planning-grade).
const SegBar = ({ pct, color, segments = 12, projPct }) => {
  const filled = Math.max(0, Math.min(segments, Math.round((pct || 0) * segments)));
  const showProj = typeof projPct === "number" && projPct > 0;
  const projLeft = Math.min(100, Math.max(0, projPct * 100));
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {Array.from({ length: segments }).map((_, i) => (i < filled
          ? <span key={i} className="h-3 flex-1 rounded-full" style={{ background: color, boxShadow: `0 0 8px -2px ${color}` }} />
          : <span key={i} className="h-3 flex-1 rounded-full border border-dashed" style={{ borderColor: "rgba(255,255,255,0.16)" }} />))}
      </div>
      {showProj && <span className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed pointer-events-none" style={{ left: `calc(${projLeft}% - 1px)`, borderColor: PAL.approaching }} title="projected at current pace" />}
    </div>
  );
};

// Inline chip for section headings (small teal glyph, matches the Monitor header).
const HeadChip = ({ children }) => (
  <span className="inline-flex items-center justify-center align-middle w-9 h-9 rounded-2xl text-[16px] mr-2.5 translate-y-[-2px] text-[#04120f] shadow-[0_6px_18px_-6px_rgba(52,211,153,0.6)]" style={{ background: "linear-gradient(135deg,#34d399,#60a5fa)" }}>{children}</span>
);

/* ============================ CONFLICTS ============================ */
export function ConflictsPanel({ findings }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  if (!findings || !findings.length) return <Empty>No conflicts detected for this taxpayer.</Empty>;
  const counts = { all: findings.length, critical: 0, warning: 0, info: 0 };
  findings.forEach((f) => counts[f.severity]++);
  const shown = findings.filter((f) => filter === "all" || f.severity === filter);
  const chips = [["all", "All"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {chips.map(([id, label]) => {
          const on = filter === id;
          return (
            <button key={id} onClick={() => setFilter(id)}
              className={"inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-[11.5px] font-semibold border transition-all " +
                (on ? "text-[#04120f] border-transparent shadow-[0_5px_16px_-6px_rgba(52,211,153,0.6)]" : "bg-surface border-line text-body hover:border-white/20")}
              style={on ? { background: "linear-gradient(135deg,#34d399,#60a5fa)" } : undefined}>
              {id !== "all" && <span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: SEV[id] }} />}
              {label} <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (on ? "bg-black/20" : "bg-white/10 text-muted")}>{counts[id]}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted">{shown.length} shown · tap a row for detail &amp; action</span>
      </div>
      <div className="space-y-1.5">
        {shown.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="rounded-lg bg-surface border border-line shadow-card overflow-hidden" style={{ borderLeft: `3px solid ${SEV[f.severity]}` }}>
              <button onClick={() => setOpen(isOpen ? null : f.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV[f.severity], boxShadow: `0 0 8px ${SEV[f.severity]}` }} />
                <span className="font-semibold text-[13px] text-head flex-1 truncate">{f.title}</span>
                {f.amountUsd > 0 && <span className="font-mono text-[12px] whitespace-nowrap" style={{ color: SEV_TEXT[f.severity] }}>{fmtUsd(f.amountUsd)}</span>}
                <span className="text-muted text-xs" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>▸</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-0">
                  <div className="text-[12px] text-body leading-relaxed">{f.detail}</div>
                  <div className="text-[12px] text-head mt-2 leading-relaxed"><span className="font-bold" style={{ color: PAL.greenText }}>▸ Action:</span> {f.recommendation}</div>
                  {f.refs && f.refs.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2.5">{f.refs.map((r, j) => <Ref key={j}>{r}</Ref>)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ CHECKS-RUN REGISTRY (CL-1) ============================
 * A collapsed "✓ N checks passed" strip under the Conflicts list. Every
 * finding gate above vanishes silently when it evaluates false — this is
 * the negative-space record that the check actually ran and came back
 * clean, not "never evaluated." DAG mode only: absent (not empty) in
 * Engine mode, since checks-registry-nodes.js has no engine equivalent —
 * see that file's own header for why. */
export function ChecksRegistryPanel({ checks }) {
  const [expanded, setExpanded] = useState(false);
  if (!checks || !checks.length) return null;
  return (
    <div className="rounded-lg bg-surface border border-line shadow-card overflow-hidden mt-3" style={{ borderLeft: `3px solid ${GREEN}` }}>
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />
        <span className="font-semibold text-[13px] text-head flex-1">✓ {checks.length} check{checks.length === 1 ? "" : "s"} passed</span>
        <span className="text-[11px] text-muted">evaluated, no issue found</span>
        <span className="text-muted text-xs" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>▸</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-1">
          {checks.map((c) => (
            <div key={c.id} className="flex items-start gap-2 py-1.5 border-t border-line first:border-t-0 text-[12px]">
              <span className="shrink-0 mt-0.5" style={{ color: GREEN }}>✓</span>
              <div className="min-w-0">
                <span className="font-semibold text-head">{c.label}</span>
                <span className="text-muted"> — {c.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ RESIDENCY ============================ */
export function ResidencyView({ result }) {
  if (!result) return <Empty>Load a client to see residency.</Empty>;
  const r = result.computed.residency, t = result.model.treaty, mon = result.monitoring;
  // Scope — see model.meta.hasIndiaScope/hasUsScope (normalize.js): a
  // taxpayer with no real US-side facts (no days present, no citizenship/
  // green card, no US-source income or assets) is India-only in substance
  // even though Layer 1's own `us` object always exists as a shell so the
  // form doesn't crash if opened. A day-count/qualitative test, a DTAA
  // tie-breaker, TRC/Form 10F, etc. are all meaningless for a country the
  // taxpayer has no real exposure to — show only the country(ies) actually
  // in scope instead of a fabricated dual-jurisdiction picture.
  const meta = result.model.meta || {};
  const hasIndiaScope = meta.hasIndiaScope !== false;
  const hasUsScope = meta.hasUsScope !== false;
  const isDualScope = hasIndiaScope && hasUsScope;
  const residencyEntries = (mon ? mon.residency : []).filter((c) =>
    c.country === "India" ? hasIndiaScope : c.country === "United States" ? hasUsScope : true);
  const stCol = { resident: PAL.exposed, will_flip: PAL.approaching, safe: PAL.positive };
  const Flag = ({ label, s }) => (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="font-display font-bold text-lg text-head mt-1">{s.status || "—"}</div>
      <div className="text-[11px] text-muted mt-1">{s.worldwide ? "Worldwide income taxed" : "Source-income only"}{s.isCitizen ? " · citizen" : ""}</div>
    </div>
  );
  const treatyRow = (label, ok, okText, badText) => (
    <div className="flex items-center justify-between py-1.5 border-b border-line text-[12px]">
      <span className="text-body">{label}</span>
      <span className="font-semibold" style={{ color: ok ? PAL.greenText : PAL.redText }}>{ok ? okText : badText}</span>
    </div>
  );
  return (
    <div className="space-y-6">
      {r.dualResident && <div className="rounded-xl border border-exposed/30 bg-exposed/10 p-3 text-[13px] font-semibold flex items-center gap-2" style={{ color: PAL.redText }}><AlertTriangle size={15} strokeWidth={2.25} className="shrink-0" /> Dual tax residency — resolve the India-US DTAA Article 4 tie-breaker.</div>}
      <div className={"grid grid-cols-1 gap-4" + (isDualScope ? " md:grid-cols-2" : "")}>
        {hasIndiaScope && <Flag label="🇮🇳 India residency" s={r.india} />}
        {hasUsScope && <Flag label="🇺🇸 US residency" s={r.us} />}
      </div>
      <Card icon={<Compass size={16} strokeWidth={2} />} title="Residency Determination" sub="Physical-presence tests for individuals · qualitative tests (incorporation/POEM/control &amp; management) for companies, HUFs, firms, and other entities">
        <div className="space-y-4">
          {residencyEntries.map((c, i) => c.kind === "qualitative" ? (
            <div key={i} className="rounded-2xl bg-white/[0.02] border border-line p-3.5">
              <div className="flex justify-between items-start text-[12px] mb-1.5">
                <span className="font-semibold text-head">{c.flag} {c.country} <span className="text-muted font-normal">· {c.test}</span></span>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: (c.status === "resident" ? PAL.exposed : PAL.positive) + "24", color: c.status === "resident" ? PAL.redText : PAL.greenText }}>{c.status === "resident" ? "Resident" : "Non-resident"}</span>
              </div>
              <ul className="space-y-1 mt-2">
                {c.facts.map((f, j) => <li key={j} className="text-[11px] text-body flex gap-1.5"><span className="text-muted">·</span>{f}</li>)}
              </ul>
              <div className="text-[11px] text-muted mt-2">{c.headline}</div>
            </div>
          ) : (
            <div key={i}>
              <div className="flex justify-between text-[12px] mb-1.5"><span className="font-semibold text-head">{c.flag} {c.country} <span className="text-muted font-normal">· {c.test}</span></span><span className="font-mono" style={{ color: stCol[c.status] }}>{c.days}/{c.threshold}d</span></div>
              <SegBar pct={c.pct} color={stCol[c.status]} projPct={c.threshold ? (c.projectedFullYear || 0) / c.threshold : 0} />
              <div className="text-[11px] text-muted mt-1.5">{c.headline} · <span style={{ color: c.status === "will_flip" ? PAL.amberText : PAL.muted }}>{c.dateLabel}</span></div>
            </div>
          ))}
        </div>
      </Card>
      <div className={"grid grid-cols-1 gap-6" + (isDualScope ? " lg:grid-cols-2" : "")}>
        {/* DTAA relief (Article 4 tie-breaker, TRC, Form 10F, PE, 1040-NR)
            only has meaning where a taxpayer has real exposure in BOTH
            countries — single-jurisdiction taxpayers have no treaty
            position to take. */}
        {isDualScope && (
          <Card icon={<ScrollText size={16} strokeWidth={2} />} title="DTAA Treaty Position" sub="India-US Double Taxation Avoidance Agreement">
            {treatyRow("Article 4 tie-breaker applied", t.treatyResidence !== "none" || t.usTreatyResidence !== "none", "Recorded", "Not applied")}
            {treatyRow("Tax Residency Certificate (TRC)", t.trcStatus, "On file", "Missing")}
            {treatyRow("Form 10F filed", t.form10fFiled, "Filed", "Not filed")}
            {treatyRow("Permanent Establishment in India", !t.hasPE, "None", "Yes — attributable profits")}
            {treatyRow("Files US 1040-NR", true, t.files1040nr ? "Yes" : "No", "")}
            <div className="text-[11px] text-muted mt-3">Treaty residence claimed: <span className="text-body font-mono">{t.treatyResidence !== "none" ? t.treatyResidence : (t.usTreatyResidence !== "none" ? t.usTreatyResidence : "none")}</span></div>
          </Card>
        )}
        <Card icon={<Scale size={16} strokeWidth={2} />} title="Residency & Treaty Conflicts">
          <ConflictsPanel findings={result.findings.filter((f) => f.category === "residency" || f.category === "treaty")} />
          <ChecksRegistryPanel checks={(result.checksRegistry || []).filter((c) => c.category === "residency" || c.category === "treaty")} />
        </Card>
      </div>
    </div>
  );
}


/* ============================ FILINGS ============================ */
/* Which return form applies, and why — click to expand the eligibility
 * reasoning and (where it came from an external rule check, not pure
 * internal math) the dated source citation. */
function ReturnFormCard({ returnForms }) {
  if (!returnForms) return null;
  const Row = ({ jur, form, isRecommendation, trace }) => (
    <div className="flex-1 rounded-xl p-3 bg-white/[0.03] border border-line">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: (jur === "IN" ? PAL.jurIN : PAL.jurUS) + "24", color: jur === "IN" ? PAL.jurIN : PAL.jurUS }}>{jur}</span>
        <span className="font-display font-extrabold text-lg text-head">{form}</span>
        {jur === "IN" && (
          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: (isRecommendation ? PAL.positive : PAL.approaching) + "24", color: isRecommendation ? PAL.greenText : PAL.amberText }}>
            {isRecommendation ? "Checked" : "Fallback — complete Layer 1"}
          </span>
        )}
      </div>
      <TraceRow label="Why this form" valueDisp="Show reasoning ↓" color={PAL.muted} trace={trace} fmt={jur === "IN" ? fmtInr : fmtUsd} />
    </div>
  );
  return (
    <Card icon={<ScrollText size={16} strokeWidth={2} />} title="Return Form" sub="Which form applies on each side, and why — click to see the eligibility check and its source">
      <div className="flex flex-col md:flex-row gap-3">
        <Row jur="IN" form={returnForms.india.form} isRecommendation={returnForms.india.isRecommendation} trace={returnForms.india.trace} />
        <Row jur="US" form={returnForms.us.form} trace={returnForms.us.trace} />
      </div>
    </Card>
  );
}

/* ---- Compliance Calendar helpers (shared by Timeline / Calendar / List) ---- */
const DAY_MS = 86400000;
// Trim the long official label down to something that fits a timeline pin or a
// calendar caption without losing the part that identifies the deadline.
function shortDeadline(name) {
  return name
    .replace(/^India\s+/, "").replace(/^US\s+/, "")
    .replace(/advance tax — /i, "Advance ")
    .replace(/estimated tax — /i, "Est. ")
    .replace(/\s*\(non-audit\)/i, "");
}
const dueText = (x) => (x.status === "passed" ? Math.abs(x.daysUntil) + "d ago" : "in " + x.daysUntil + "d");
const dueColor = (x) => (x.status === "due_soon" ? PAL.amberText : x.status === "passed" ? PAL.muted : PAL.greenText);

// Small shared legend so every view reads the same colour language.
function CalLegend({ jColor }) {
  const Dot = ({ c }) => <span className="w-2 h-2 rounded-full" style={{ background: c }} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[10px] text-muted">
      <span className="inline-flex items-center gap-1.5"><Dot c={jColor.IN} /> India</span>
      <span className="inline-flex items-center gap-1.5"><Dot c={jColor.US} /> United States</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-px h-3" style={{ background: PAL.accent }} /> Today</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PAL.approaching }} /> Due ≤ 30d</span>
      <span className="inline-flex items-center gap-1.5 opacity-50"><Dot c={PAL.muted} /> Passed</span>
    </div>
  );
}

/* Bi-directional timeline: India deadlines pinned above a shared time axis, US
 * below it, with month gridlines and a live "today" marker. Scrolls sideways on
 * narrow screens so the pins never crowd. */
function DeadlineTimeline({ cal, jColor, onSelect }) {
  if (!cal.length) return null;
  const min = new Date(cal[0].date.getTime() - 16 * DAY_MS);
  const max = new Date(cal[cal.length - 1].date.getTime() + 16 * DAY_MS);
  const span = max - min || 1;
  const pos = (d) => ((d - min) / span) * 100;

  const months = [];
  for (let m = new Date(min.getFullYear(), min.getMonth(), 1); m <= max; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(new Date(m));
  const monthLabel = (mm) => mm.toLocaleDateString("en-US", { month: "short" }) + (mm.getMonth() === 0 ? " '" + String(mm.getFullYear()).slice(2) : "");

  const today = new Date();
  const showToday = today >= min && today <= max;
  const inItems = cal.filter((x) => x.jur === "IN");
  const usItems = cal.filter((x) => x.jur === "US");
  const minWidth = Math.max(820, months.length * 80);

  // On mount, bring "today" into view — otherwise a client with mostly-passed
  // deadlines opens scrolled to year-old items instead of what's next.
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !showToday) return;
    const target = (pos(today) / 100) * minWidth - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const PinLabel = ({ x }) => (
    <div className="flex flex-col items-center text-center gap-0.5 py-1" style={{ width: 108 }}>
      <span className="text-[10px] font-semibold leading-tight text-body group-hover:text-head transition-colors"
        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{shortDeadline(x.name)}</span>
      <span className="text-[8px] text-faint whitespace-nowrap">{x.dateLabel}</span>
      <span className="text-[9px] font-mono font-bold whitespace-nowrap" style={{ color: dueColor(x) }}>{dueText(x)}</span>
    </div>
  );
  const Pin = ({ x, dir }) => {
    const col = jColor[x.jur];
    const past = x.status === "passed";
    const ring = x.status === "due_soon" ? PAL.approaching : col;
    const connector = <span className="w-px" style={{ height: 14, background: col, opacity: 0.4 }} />;
    const dot = <span className="w-2.5 h-2.5 rounded-full ring-2 ring-[#161616] shrink-0 transition-transform group-hover:scale-150" style={{ background: col, boxShadow: `0 0 0 3px ${ring}33` }} />;
    return (
      <button type="button" onClick={() => onSelect(x)} title="View details"
        className={"group absolute -translate-x-1/2 flex flex-col items-center p-0 bg-transparent border-0 cursor-pointer focus:outline-none " + (dir === "up" ? "justify-end" : "justify-start")}
        style={{ left: pos(x.date) + "%", [dir === "up" ? "bottom" : "top"]: "50%", opacity: past ? 0.5 : 1 }}>
        {dir === "up" ? <><PinLabel x={x} />{connector}{dot}</> : <>{dot}{connector}<PinLabel x={x} /></>}
      </button>
    );
  };

  return (
    <div>
      <CalLegend jColor={jColor} />
      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="relative" style={{ minWidth, height: 236 }}>
          {months.map((mm, i) => (
            <div key={i} className="absolute top-0 w-px bg-white/[0.035]" style={{ left: pos(mm) + "%", bottom: 20 }} />
          ))}
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.09]" />
          <span className="absolute left-0 top-2 text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: jColor.IN + "24", color: jColor.IN }}>IN</span>
          <span className="absolute left-0 bottom-6 text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: jColor.US + "24", color: jColor.US }}>US</span>
          {showToday && (
            <>
              <div className="absolute top-0 z-10 w-px" style={{ left: pos(today) + "%", bottom: 20, background: PAL.accent, opacity: 0.55 }} />
              <div className="absolute z-20 -translate-x-1/2 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded" style={{ left: pos(today) + "%", top: 0, background: PAL.accent + "22", color: PAL.greenText }}>TODAY</div>
            </>
          )}
          {inItems.map((x, i) => <Pin key={"in" + i} x={x} dir="up" />)}
          {usItems.map((x, i) => <Pin key={"us" + i} x={x} dir="down" />)}
          <div className="absolute left-0 right-0 bottom-0 h-5">
            {months.map((mm, i) => (
              <div key={i} className="absolute -translate-x-1/2 text-[9px] text-faint whitespace-nowrap" style={{ left: pos(mm) + "%" }}>{monthLabel(mm)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Single-month calendar the user pages through with ‹ / › arrows. Opens on the
 * month of the next upcoming deadline; deadline days are highlighted by
 * jurisdiction (with a dot per deadline so days carrying both an IN and a US
 * filing still read clearly) and listed in full below the grid. */
function DeadlineCalendar({ cal, jColor, onSelect }) {
  const today = new Date();
  const toIdx = (y, m) => y * 12 + m;
  const byMonth = new Map();
  cal.forEach((x) => {
    const k = toIdx(x.date.getFullYear(), x.date.getMonth());
    (byMonth.get(k) || byMonth.set(k, []).get(k)).push(x);
  });
  const minIdx = toIdx(cal[0].date.getFullYear(), cal[0].date.getMonth());
  const maxIdx = toIdx(cal[cal.length - 1].date.getFullYear(), cal[cal.length - 1].date.getMonth());
  const clampIdx = (i) => Math.max(minIdx, Math.min(maxIdx, i));
  const todayIdx = toIdx(today.getFullYear(), today.getMonth());
  const next = cal.find((x) => x.status !== "passed");
  const [idx, setIdx] = useState(clampIdx(next ? toIdx(next.date.getFullYear(), next.date.getMonth()) : todayIdx));

  const year = Math.floor(idx / 12), month = idx % 12;
  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" });
  const items = (byMonth.get(idx) || []).slice().sort((a, b) => a.date - b.date);
  const isThisMonth = todayIdx === idx;
  const todayInRange = todayIdx >= minIdx && todayIdx <= maxIdx;

  const WD = ["S", "M", "T", "W", "T", "F", "S"];
  const firstWd = new Date(year, month, 1).getDay();
  const nDays = new Date(year, month + 1, 0).getDate();
  const dayItems = {};
  items.forEach((x) => { (dayItems[x.date.getDate()] = dayItems[x.date.getDate()] || []).push(x); });
  const cells = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let dn = 1; dn <= nDays; dn++) cells.push(dn);

  const NavBtn = ({ dir }) => {
    const disabled = dir < 0 ? idx <= minIdx : idx >= maxIdx;
    return (
      <button aria-label={dir < 0 ? "Previous month" : "Next month"} disabled={disabled}
        onClick={() => setIdx((v) => clampIdx(v + dir))}
        className={"w-8 h-8 rounded-lg flex items-center justify-center border border-line transition " + (disabled ? "opacity-25 cursor-not-allowed text-muted" : "text-body hover:bg-white/[0.06] hover:text-head")}>
        {dir < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    );
  };

  return (
    <div>
      <CalLegend jColor={jColor} />
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-3">
          <NavBtn dir={-1} />
          <div className="text-center">
            <div className="font-display font-bold text-base text-head leading-tight">{monthName} <span className="text-muted font-normal">{year}</span></div>
            {!isThisMonth && todayInRange && (
              <button onClick={() => setIdx(todayIdx)} className="text-[9px] font-bold uppercase tracking-wide hover:underline" style={{ color: PAL.greenText }}>Jump to today</button>
            )}
          </div>
          <NavBtn dir={1} />
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WD.map((w, i) => <div key={i} className="text-[9px] text-faint text-center font-semibold">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dn, i) => {
            if (dn == null) return <div key={i} className="aspect-square" />;
            const dItems = dayItems[dn];
            const isToday = isThisMonth && today.getDate() === dn;
            if (!dItems) {
              return (
                <div key={i} className="aspect-square flex items-center justify-center text-[11px] rounded-lg"
                  style={isToday ? { color: PAL.greenText, boxShadow: `inset 0 0 0 1px ${PAL.accent}66` } : { color: PAL.faint }}>{dn}</div>
              );
            }
            const jurs = Array.from(new Set(dItems.map((x) => x.jur)));
            const past = dItems.every((x) => x.status === "passed");
            const soon = dItems.some((x) => x.status === "due_soon");
            const bg = jurs.length === 1 ? jColor[jurs[0]] + (past ? "14" : "26") : "rgba(255,255,255,0.06)";
            const outline = isToday ? PAL.accent : soon ? PAL.approaching : jurs.length === 1 ? jColor[jurs[0]] + "88" : "rgba(255,255,255,0.22)";
            return (
              <button key={i} type="button" onClick={() => onSelect(dItems[0])} title={dItems.map((x) => x.name + " — " + dueText(x)).join(" · ")}
                className="aspect-square relative flex items-center justify-center rounded-lg text-[11px] font-bold cursor-pointer transition hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-white/40"
                style={{ background: bg, color: past ? PAL.muted : "#fff", boxShadow: `inset 0 0 0 1px ${outline}` }}>
                {dn}
                <span className="absolute bottom-1 flex gap-0.5">
                  {dItems.map((x, k) => <span key={k} className="w-1 h-1 rounded-full" style={{ background: jColor[x.jur], opacity: x.status === "passed" ? 0.5 : 1 }} />)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-1.5">
          {items.length ? items.map((x, i) => (
            <button key={i} type="button" onClick={() => onSelect(x)}
              className={"w-full text-left flex items-center gap-2.5 p-2 rounded-lg transition hover:bg-white/[0.06] focus:outline-none " + (x.status === "passed" ? "opacity-50" : "bg-white/[0.03]")}>
              <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: jColor[x.jur] + "24", color: jColor[x.jur] }}>{x.jur}</span>
              <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold text-head truncate">{x.name}</div><div className="text-[10px] text-muted">{x.dateLabel} · {x.cat}</div></div>
              <span className="text-[11px] font-mono whitespace-nowrap" style={{ color: dueColor(x) }}>{dueText(x)}</span>
            </button>
          )) : <div className="text-center text-muted text-[11px] py-4">No deadlines in {monthName}.</div>}
        </div>
      </div>
    </div>
  );
}

/* The original compact countdown list — kept as a third view. */
function DeadlineList({ cal, jColor, onSelect }) {
  const upcoming = cal.filter((x) => x.status !== "passed");
  const passed = cal.filter((x) => x.status === "passed").slice(-3);
  return (
    <div className="space-y-1.5">
      {upcoming.concat(passed).map((x, i) => {
        const isPast = x.status === "passed";
        return (
          <button key={i} type="button" onClick={() => onSelect(x)}
            className={"w-full text-left flex items-center gap-3 p-2 rounded-lg transition hover:bg-white/[0.06] focus:outline-none " + (isPast ? "opacity-45" : "bg-white/[0.03]")}>
            <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: jColor[x.jur] + "24", color: jColor[x.jur] }}>{x.jur}</span>
            <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold text-head truncate">{x.name}</div><div className="text-[10px] text-muted">{x.dateLabel} · {x.cat}</div></div>
            <div className="text-[11px] font-mono whitespace-nowrap" style={{ color: dueColor(x) }}>{dueText(x)}</div>
          </button>
        );
      })}
    </div>
  );
}

/* Detail popover shown when a deadline is clicked in any of the three views —
 * jurisdiction, form, category, exact date, countdown, and (for filings) the
 * documents that go in with it. Backdrop / × / Esc all close it. */
const CAT_NOTE = {
  "Advance tax": "Advance-tax installment — pay the cumulative percentage of the year's estimated liability by this date to avoid §234B / §234C interest.",
  "Estimated tax": "Quarterly estimated payment to the IRS. Underpaying across the year can trigger a Form 2210 penalty.",
  "Filing": "Return-filing deadline — file the return together with any required disclosures listed below.",
  "Extension": "Extended / belated filing window — the last date to file or revise without forfeiting the position."
};
function DeadlineDetailModal({ x, jColor, docs, returnForms, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const col = jColor[x.jur];
  const past = x.status === "passed";
  const jurName = x.jur === "IN" ? "India" : "United States";
  const isFiling = x.cat === "Filing" || x.cat === "Extension";
  const form = x.jur === "IN" ? returnForms && returnForms.india && returnForms.india.form
    : returnForms && returnForms.us && returnForms.us.form;
  // The deadline carries the exact document IDs filed on that date; show the
  // ones this client actually triggers (required), in catalogue order.
  const docIds = new Set(x.docIds || []);
  const mapsDocs = docIds.size > 0;
  const relatedDocs = docs ? docs.filter((d) => docIds.has(d.id) && d.required) : [];
  const longDate = x.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const countdownWords = past ? Math.abs(x.daysUntil) + " days ago" : "in " + x.daysUntil + " days";
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-line shadow-cardhover p-5" style={{ background: PAL.panel }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: col + "24", color: col }}>{x.jur}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.05] border border-line text-muted">{x.cat}</span>
            {x.status === "due_soon" && <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: PAL.approaching + "22", color: PAL.amberText }}>Due soon</span>}
            {past && <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.05] text-muted">Passed</span>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-head text-lg leading-none px-1 -mt-1">×</button>
        </div>
        <h4 className="font-display font-extrabold text-lg text-head leading-snug">{x.name}</h4>
        <div className="flex items-baseline justify-between gap-3 mt-2 pb-3 border-b border-line">
          <div>
            <div className="text-[12px] text-body">{longDate}</div>
            <div className="text-[10px] text-muted">{jurName}{form && isFiling ? " · " + form : ""}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-[15px]" style={{ color: dueColor(x) }}>{dueText(x)}</div>
            <div className="text-[9px] text-muted">{countdownWords}</div>
          </div>
        </div>
        <p className="text-[11px] text-body leading-relaxed mt-3">{CAT_NOTE[x.cat] || ""}</p>
        {mapsDocs && (
          <div className="mt-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1.5">Filed with this deadline</div>
            {relatedDocs.length ? (
              <div className="space-y-1.5">
                {relatedDocs.map((d) => (
                  <div key={d.id} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: col }} />
                    <div>
                      <div className="text-[11px] font-semibold text-head">{d.name}</div>
                      {d.why && <div className="text-[10px] text-muted leading-snug">{d.why}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-[11px] text-muted">None of this filing’s disclosures are triggered for this client.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ComplianceCalendarCard({ cal, jColor, docs, returnForms }) {
  const [mode, setMode] = useState("timeline");
  const [selected, setSelected] = useState(null);
  const Seg = ({ id, label }) => (
    <button onClick={() => setMode(id)}
      className={"px-2.5 py-1 rounded-lg text-[10px] font-bold transition " + (mode === id ? "text-head" : "text-muted hover:text-body")}
      style={mode === id ? { background: "rgba(255,255,255,0.08)" } : undefined}>{label}</button>
  );
  return (
    <Card icon={<CalendarClock size={16} strokeWidth={2} />} title="Compliance Calendar" sub="Filing & payment deadlines with countdowns · click any deadline for details"
      right={
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white/[0.03] border border-line shrink-0">
          <Seg id="timeline" label="Timeline" />
          <Seg id="calendar" label="Calendar" />
          <Seg id="list" label="List" />
        </div>
      }>
      {!cal.length ? <Empty>No deadlines for this client.</Empty>
        : mode === "timeline" ? <DeadlineTimeline cal={cal} jColor={jColor} onSelect={setSelected} />
        : mode === "calendar" ? <DeadlineCalendar cal={cal} jColor={jColor} onSelect={setSelected} />
        : <DeadlineList cal={cal} jColor={jColor} onSelect={setSelected} />}
      {selected && <DeadlineDetailModal x={selected} jColor={jColor} docs={docs} returnForms={returnForms} onClose={() => setSelected(null)} />}
    </Card>
  );
}

export function FilingsView({ result }) {
  if (!result) return <Empty>Load a client to see filings.</Empty>;
  const cal = result.monitoring ? result.monitoring.calendar.all.slice().sort((a, b) => a.date - b.date) : [];
  const jColor = { US: PAL.jurUS, IN: PAL.jurIN };
  const docs = result.documents.slice().sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  const req = docs.filter((d) => d.required).length;
  return (
    <div className="space-y-6">
      <ReturnFormCard returnForms={result.returnForms} />
      <ComplianceCalendarCard cal={cal} jColor={jColor} docs={result.documents} returnForms={result.returnForms} />
      <Card icon={<FolderOpen size={16} strokeWidth={2} />} title="Documents to File" sub={req + " required · triggered by this taxpayer's cross-border facts"}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {docs.map((d) => (
            <div key={d.id} className={"flex items-start gap-3 p-3 rounded-lg " + (d.required ? "bg-white/[0.03] border border-line" : "opacity-45")}>
              <span className="text-[9px] font-black px-2 py-0.5 rounded mt-0.5" style={{ background: jColor[d.jurisdiction] + "24", color: jColor[d.jurisdiction] }}>{d.jurisdiction}</span>
              <div className="flex-1">
                <div className="text-[12px] font-bold text-head flex items-center gap-2">{d.name}{d.required ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-exposed/15" style={{ color: PAL.redText }}>Required</span> : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-muted">N/A</span>}</div>
                <div className="text-[11px] text-muted">{d.desc}</div>
                {d.required && <div className="text-[11px] text-body mt-0.5">↳ {d.why}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ApportionmentCard({ ap }) {
  if (!ap) return null;
  const Split = ({ title, sub, a, b, aLabel, bLabel }) => (
    <div className="rounded-xl p-3 bg-white/[0.03] border border-line">
      <div className="text-[12px] font-bold text-head">{title}</div>
      <div className="text-[10px] text-muted mb-2">{sub}</div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg p-2" style={{ background: PAL.accent + "14", border: `1px solid ${PAL.accent}33` }}>
          <div className="text-[9px] uppercase tracking-widest text-muted">{aLabel}</div>
          <div className="font-mono text-[13px] text-head">{fmtUsd(a)}</div>
        </div>
        <div className="flex-1 rounded-lg p-2" style={{ background: PAL.filing + "14", border: `1px solid ${PAL.filing}33` }}>
          <div className="text-[9px] uppercase tracking-widest text-muted">{bLabel}</div>
          <div className="font-mono text-[13px] text-head">{fmtUsd(b)}</div>
        </div>
      </div>
    </div>
  );
  return (
    <Card icon={<CalendarRange size={16} strokeWidth={2} />} title="FY ↔ CY Apportionment" sub={"Indian FY straddles two US calendar years — period-matched so FTC lines up both ways · basis: " + ap.basis}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Split title={"🇮🇳 Indian " + ap.fyLabel + " income → US calendar years"} sub={"Q1–Q3 (Apr–Dec) → CY" + ap.cyPrimary + " · Q4 (Jan–Mar) → CY" + ap.cyNext}
          a={ap.indiaToCyPrimaryUsd} b={ap.indiaToCyNextUsd} aLabel={"CY" + ap.cyPrimary} bLabel={"CY" + ap.cyNext} />
        <Split title={"🇺🇸 US CY" + ap.cyPrimary + " income → Indian " + ap.fyLabel} sub={"Apr–Dec (9/12) into this FY · Jan–Mar (3/12) into the next FY"}
          a={ap.usCyToFyPrimaryUsd} b={ap.usCyToFyNextUsd} aLabel={"Into " + ap.fyLabel} bLabel={"Into next FY"} />
      </div>
      <p className="text-[10px] text-muted mt-2">The period-matched figures feed Form 67 (India) and Form 1116 (US) so the credit lands in the right year. Planning-grade — refine with per-transaction dates (Rule 115) at filing.</p>
    </Card>
  );
}

/* Cross-basis: the same income under BOTH countries' own code. */
function ReconciliationCard({ recon }) {
  if (!recon || !recon.rows || !recon.rows.length) return null;
  const Dir = ({ d }) => <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: (d === "IN→US" ? PAL.jurIN : PAL.jurUS) + "24", color: d === "IN→US" ? PAL.accent : PAL.blueText }}>{d}</span>;
  return (
    <Card icon={<Scale size={16} strokeWidth={2} />} title="Cross-Basis Reconciliation" sub="The same income computed under each country's own code — India (Income-tax Act) vs US (IRC). Overlap is what FTC / §90 relieves.">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {["Income head", "India basis", "US basis", "Double-taxed"].map((h, i) => (
                <th key={i} className={"px-2 py-2 text-[10px] uppercase tracking-widest text-muted font-bold " + (i === 0 ? "text-left" : "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recon.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 align-top">
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-[12px] font-semibold text-head">{r.label}</span><Dir d={r.dir} />{r.sameBase && <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-white/[0.06] text-muted" title="Same amount enters both bases — the difference is the rate">same base · rate differs</span>}{r.estimate && <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-approaching/15" style={{ color: PAL.amberText }}>est.</span>}</div>
                  {r.note && <div className="text-[10px] text-muted mt-0.5 max-w-[260px]">{r.note}</div>}
                </td>
                <td className="px-2 py-2.5 text-right"><div className="font-mono text-[12px] text-head">{fmtUsd(r.indiaLawUsd)}</div><div className="text-[9px] text-muted">{r.indiaRule}</div></td>
                <td className="px-2 py-2.5 text-right"><div className="font-mono text-[12px] text-head">{r.usLawUsd > 0 ? fmtUsd(r.usLawUsd) : "—"}</div><div className="text-[9px] text-muted max-w-[200px] ml-auto">{r.usRule}</div></td>
                <td className="px-2 py-2.5 text-right font-mono text-[12px]" style={{ color: r.doublyTaxed ? PAL.redText : PAL.muted }}>{r.doublyTaxed ? fmtUsd(r.overlapUsd) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 py-2.5 text-[11px] font-bold text-body" colSpan={3}>Total overlapping (doubly-taxed) exposure</td>
              <td className="px-2 py-2.5 text-right font-mono text-[13px] font-bold" style={{ color: PAL.redText }}>{fmtUsd(recon.overlapUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {recon.anyEstimate && <p className="text-[10px] text-muted mt-2">Rows marked <span className="font-bold" style={{ color: PAL.amberText }}>est.</span> are planning-grade — refine with line-item inputs (US rental depreciation, cost basis / acquisition-date FX under Rule 115).</p>}
    </Card>
  );
}
function FtcCard({ ftcReport, onJump }) {
  const net = ftcReport.headlineNetDoubleTaxUsd;
  const Block = ({ block }) => (
    <div className="mb-2"><div className="text-[11px] font-bold text-body mb-2">{block.title}</div>
      <div className="space-y-1">{block.rows.map((r, i) => {
        const c = r.warn ? PAL.redText : r.emphasis ? PAL.greenText : PAL.body;
        const disp = r.usd < 0 ? "(" + fmtUsd(Math.abs(r.usd)) + ")" : fmtUsd(r.usd);
        return <TraceRow key={i} label={r.label} valueDisp={disp} color={c} emphasis={r.emphasis || r.warn} trace={r.trace} fmt={fmtUsd} onJump={onJump} />;
      })}</div></div>
  );
  return (
    <Card icon={<RefreshCcw size={16} strokeWidth={2} />} title="FTC Reconciliation">
      <div className={"rounded-xl p-3 mb-4 border " + (net > 0 ? "border-exposed/30 bg-exposed/10" : "border-positive/30 bg-positive/10")}>
        <div className="text-[10px] uppercase tracking-widest text-muted">Net unrelieved double tax</div>
        <div className="font-display font-extrabold text-2xl" style={{ color: net > 0 ? PAL.redText : PAL.greenText }}>{fmtUsd(net)}</div>
      </div>
      <Block block={ftcReport.direction_us_claims_india} />
      <div className="border-t border-line my-3" />
      <Block block={ftcReport.direction_india_relief} />
    </Card>
  );
}
function TaxCard({ taxComputation, fxRate, onJump, hasIndiaScope, hasUsScope }) {
  const Block = ({ block, isInr, accent }) => {
    const fmt = isInr ? fmtInr : fmtUsd;
    return (
      <div className="rounded-xl p-3" style={{ background: accent + "12", border: `1px solid ${accent}33` }}>
        <div className="flex items-center justify-between mb-2"><div className="text-[12px] font-bold text-head">{block.title}</div><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-white/[0.05] border border-line text-muted">eff {Math.round(block.effectiveRate * 100)}%</span></div>
        <div className="space-y-1">{block.rows.map((r, i) => {
          const val = isInr ? r.inr : r.usd; let disp = fmt(Math.abs(val)); if (val < 0) disp = "(" + disp + ")";
          return <TraceRow key={i} label={r.label} valueDisp={disp} emphasis={r.emphasis} trace={r.trace} fmt={fmt} onJump={onJump} />;
        })}</div>
        <div className="text-[10px] text-muted mt-2">≈ {fmtUsd(block.totalUsd)} at {fxRate} INR/USD</div>
      </div>
    );
  };
  // hasIndiaScope/hasUsScope default true when undefined (callers other than
  // ReconciliationView that haven't been made scope-aware yet still get the
  // old always-both-blocks behavior).
  const showIndia = hasIndiaScope !== false, showUs = hasUsScope !== false;
  return (
    <Card icon={<Calculator size={16} strokeWidth={2} />} title="Tax Computation" sub="Planning-grade, from Layer 1">
      {showIndia && <Block block={taxComputation.india} isInr accent={PAL.jurIN} />}
      {showIndia && showUs && <div className="h-3" />}
      {showUs && <Block block={taxComputation.us} accent={PAL.jurUS} />}
      {taxComputation.usState && (
        <>
          <div className="h-3" />
          <Block block={taxComputation.usState} accent={PAL.filing} />
          {taxComputation.usState.basis && <p className="text-[10px] text-muted mt-2">{taxComputation.usState.basis}</p>}
        </>
      )}
    </Card>
  );
}

/* ============================ RECONCILIATION ============================
 * The "how is this number actually computed" surface: FTC reconciliation,
 * the India/US tax computation trace tables, the cross-basis chart/table
 * (same income under each country's own code), FY↔CY apportionment, and the
 * India/US income-by-head breakdown that everything above cross-references.
 * Kept together in one tab since they're all views onto the same underlying
 * reconciliation, not separate concerns. */
export function ReconciliationView({ result, highlight, onHighlightDone, onJump }) {
  useEffect(() => {
    if (!highlight) return;
    const id = highlight === "us" ? "recon-us-income" : "recon-india-income";
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => { if (onHighlightDone) onHighlightDone(); }, 2500);
    return () => clearTimeout(t);
  }, [highlight, onHighlightDone]);
  if (!result) return <Empty>Load a client to see the tax reconciliation.</Empty>;
  const m = result.model, inc = m.income, fx = m.meta.fxRate || 83;
  const inrToUsd = (n) => (n || 0) / fx;
  // Scope — see model.meta.hasIndiaScope/hasUsScope (normalize.js). FTC
  // relief, cross-basis double-taxation overlap, and FY↔CY apportionment
  // are all inherently CROSS-BORDER concepts — meaningless (and, worse,
  // liable to render as a wall of "$0" rows) for a taxpayer with no real
  // exposure in the second country. Hide them outright instead.
  const hasIndiaScope = m.meta.hasIndiaScope !== false;
  const hasUsScope = m.meta.hasUsScope !== false;
  const isDualScope = hasIndiaScope && hasUsScope;

  const isTaxed = (mv) => mv && (mv.usd > 0 || mv.inr > 0);
  const IncomeRow = ({ label, mv, inr, additive }) => (
    <div className={"flex justify-between py-1.5 border-b border-line/60 text-[12px] " + (additive === false ? "opacity-60" : "")}>
      <span className="text-body">{label}</span>
      <span className="font-mono text-head">{inr ? fmtInr(mv.inr) : fmtUsd(mv.usd)}<span className="text-muted ml-2">{inr ? "≈ " + fmtUsd(mv.usd) : ""}</span></span>
    </div>
  );
  const s115a = result.computed.indiaTax.s115a;
  const worldwide = result.computed.residency.us.worldwide;
  const moneyInr = (v) => ({ inr: v || 0, usd: inrToUsd(v || 0) });
  const buildRows = (defs) => defs.filter(([, mv]) => isTaxed(mv)).map(([label, mv, additive]) => ({ label, mv, additive: additive !== false }));
  const rowsTotal = (rows, key) => rows.reduce((s, r) => s + (r.additive ? (r.mv[key] || 0) : 0), 0);

  const indiaRows = buildRows([
    ["Salary", inc.india.salary], ["Business / Profession", inc.india.business], ["House property", inc.india.houseProperty],
    ["Interest", inc.india.interest], ["Dividend", inc.india.dividend],
    ["Other sources (family pension, gifts, misc.)", inc.india.otherSourcesMisc],
    ["Short-term capital gains (unlisted, slab rate)", moneyInr(inc.india.stcgSlabInr)],
    ["Short-term capital gains (s.111A, 20%)", inc.india.stcg],
    ["Long-term capital gains (s.112A, listed equity)", inc.india.ltcg],
    ["Long-term capital gains (s.197, other assets, no exemption)", moneyInr(inc.india.ltcg197Inr)],
    ["VDA / crypto gains (s.115BBH)", moneyInr(inc.india.vdaGainInr)],
    ["Chapter XII-A investment income (s.115E)", moneyInr(inc.india.chapterXiiaInvestmentIncomeInr)],
    ["Winnings / online gaming (s.115BB/115BBJ)", inc.india.specialRate115bb],
    ["Deemed dividend on buyback (s.2(22)(f))", inc.india.deemedDividendBuyback],
    ["Royalty (s.115A, non-resident)", s115a && s115a.royalty ? moneyInr(s115a.royalty.totalInr) : null],
    ["Fees for technical services (s.115A, non-resident)", s115a && s115a.fts ? moneyInr(s115a.fts.totalInr) : null]
  ]);
  const indiaTotalInr = rowsTotal(indiaRows, "inr"), indiaTotalUsd = rowsTotal(indiaRows, "usd");

  const usRows = buildRows([
    ["Wages (W-2)", inc.us.wages], ["Business / Self-employment", inc.us.businessUs], ["Interest", inc.us.interestUs],
    ["Dividends — ordinary", inc.us.ordinaryDividendsUs], ["  — of which qualified", inc.us.qualifiedDividendsUs, false],
    ["Rental", inc.us.rentalUs], ["Retirement (401k/IRA/SS)", inc.us.usRetirementIncome],
    ["Short-term gains", inc.us.stcgUs], ["Long-term gains", inc.us.ltcgUs]
  ].concat(worldwide ? [
    ["Foreign wages (India salary)", inc.us.foreignWages],
    ["Foreign interest (incl. India retirement a/c interest)", inc.us.foreignInterest],
    ["Foreign dividends", inc.us.foreignDividends],
    ["Foreign rental", inc.us.foreignRental],
    ["Foreign pension (incl. India retirement a/c withdrawals)", inc.us.foreignPension],
    ["Foreign short-term gains", inc.us.foreignStcg],
    ["Foreign long-term gains", inc.us.foreignLtcg]
  ] : []));
  const usTotalUsd = rowsTotal(usRows, "usd");

  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Scale size={16} strokeWidth={2} /></HeadChip>Reconciliation</h2><p className="text-muted text-sm mt-2">Income by head first, since that's what everything below is derived from — then Tax Computation, FTC relief, cross-basis overlap, and the FY↔CY apportionment that ties them together.</p></div>

      <div className={"grid grid-cols-1 gap-6" + (isDualScope ? " lg:grid-cols-2" : "")}>
        {hasIndiaScope && (
          <div id="recon-india-income" className={"rounded-[26px] transition-all duration-300 " + (highlight === "india" ? "ring-2 ring-offset-2 ring-offset-[#0a0a0a]" : "")} style={highlight === "india" ? { "--tw-ring-color": PAL.accent, boxShadow: `0 0 0 4px ${PAL.accent}33` } : undefined}>
            <Card title="🇮🇳 India income — by head" sub="From Layer 1 India (₹, with USD equivalent)">
              {indiaRows.length ? indiaRows.map((r, i) => <IncomeRow key={i} label={r.label} mv={r.mv} additive={r.additive} inr />) : <Empty>No India income on file.</Empty>}
              {indiaRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtInr(indiaTotalInr)} <span className="text-muted">≈ {fmtUsd(indiaTotalUsd)}</span></span></div>}
            </Card>
          </div>
        )}
        {hasUsScope && (
          <div id="recon-us-income" className={"rounded-[26px] transition-all duration-300 " + (highlight === "us" ? "ring-2 ring-offset-2 ring-offset-[#0a0a0a]" : "")} style={highlight === "us" ? { "--tw-ring-color": PAL.accent, boxShadow: `0 0 0 4px ${PAL.accent}33` } : undefined}>
            <Card title="🇺🇸 US income — by head" sub="From Layer 1 US (USD)">
              {usRows.length ? usRows.map((r, i) => <IncomeRow key={i} label={r.label} mv={r.mv} additive={r.additive} />) : <Empty>No US income on file.</Empty>}
              {usRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtUsd(usTotalUsd)}</span></div>}
            </Card>
          </div>
        )}
      </div>

      <div className={"grid grid-cols-1 gap-6" + (isDualScope ? " lg:grid-cols-2" : "")}>
        {/* FTC relief only exists where a taxpayer is genuinely exposed to
            BOTH countries — nothing to reconcile for a single-jurisdiction
            taxpayer, so the whole card (not just its numbers) disappears. */}
        {isDualScope && <FtcCard ftcReport={result.ftcReport} onJump={onJump} />}
        <TaxCard taxComputation={result.taxComputation} fxRate={result.model.meta.fxRate} onJump={onJump} hasIndiaScope={hasIndiaScope} hasUsScope={hasUsScope} />
      </div>

      {isDualScope && (
        <>
          {result.computed.reconciliation && result.computed.reconciliation.rows && result.computed.reconciliation.rows.length > 0 && (
            <CapsuleChart rows={result.computed.reconciliation.rows} />
          )}
          <ReconciliationCard recon={result.computed.reconciliation} />
          <ApportionmentCard ap={result.computed.apportionment} />
        </>
      )}
    </div>
  );
}


/* ============================ WITHHOLDING ============================ */
export function WithholdingView({ result }) {
  if (!result) return <Empty>Load a client to see withholding taxes.</Empty>;
  const wh = result.withholding;
  if (!wh) return <Empty>No withholding data for this taxpayer.</Empty>;
  const jColor = { IN: PAL.jurIN, US: PAL.jurUS };
  const fx = (result.model && result.model.meta && result.model.meta.fxRate) || 83;
  const inrToUsd = (n) => (n || 0) / fx;
  const allRows = [...wh.india.rows, ...wh.us.rows];
  const indiaTaxInr = wh.india.rows.reduce((s, r) => s + (r.taxInr || 0), 0);
  const usTaxUsd = wh.us.rows.reduce((s, r) => s + (r.taxUsd || 0), 0);
  const totalWithheldUsd = inrToUsd(indiaTaxInr) + usTaxUsd;

  const Row = ({ r }) => {
    const gross = r.jurisdiction === "IN" ? r.grossInr : r.grossUsd;
    const fmtGross = r.jurisdiction === "IN" ? fmtInr : fmtUsd;
    const tax = r.jurisdiction === "IN" ? r.taxInr : r.taxUsd;
    const gap = r.jurisdiction === "IN" ? r.gapInr : r.gapUsd;
    const hasGap = gap > 1;
    const isEstimate = r.category === "estimate";
    return (
      <div className={"p-3 rounded-lg border " + (hasGap ? "bg-exposed/[0.06] border-exposed/25" : isEstimate ? "bg-approaching/[0.05] border-approaching/25 border-dashed" : "bg-white/[0.03] border-line")}>
        <div className="flex items-start gap-3">
          <span className="text-[9px] font-black px-2 py-0.5 rounded mt-0.5 shrink-0" style={{ background: jColor[r.jurisdiction] + "24", color: jColor[r.jurisdiction] }}>{r.jurisdiction}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[12px] font-bold text-head">{r.label}</div>
              {isEstimate && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: PAL.amberText + "22", color: PAL.amberText }}>Not in totals</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-body">
              {gross != null && <span>Gross: <span className="font-mono text-head">{fmtGross(gross)}</span></span>}
              {r.domesticRatePct != null && <span>Default: <span className="font-mono text-head">{r.domesticRatePct}%</span></span>}
              {r.treatyRatePct != null && <span>Treaty: <span className="font-mono text-head">{r.treatyRatePct}%</span></span>}
              {r.rateAppliedPct != null && <span>Applied: <span className="font-mono" style={{ color: hasGap ? PAL.redText : PAL.greenText }}>{Math.round(r.rateAppliedPct * 10) / 10}%</span></span>}
              <span>{isEstimate ? "Expected" : "Tax"}: <span className="font-mono text-head">{fmtGross(tax)}</span></span>
            </div>
            {r.note && (
              <div className="text-[10.5px] mt-1.5" style={{ color: hasGap ? PAL.redText : isEstimate ? PAL.amberText : PAL.muted }}>
                {r.docsOk === false ? "⚠ " : ""}{r.note}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2"><Ref>{r.citation}</Ref></div>
          </div>
          {hasGap && (
            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase tracking-widest text-muted">Extra cost</div>
              <div className="text-[13px] font-mono font-bold" style={{ color: PAL.redText }}>+{fmtGross(gap)}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ rows, title, sub }) => {
    if (!rows.length) return null;
    return (
      <div className="mb-4 last:mb-0">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10.5px] font-black uppercase tracking-widest text-muted">{title}</div>
          {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
        </div>
        <div className="space-y-2">{rows.map((r) => <Row key={r.id} r={r} />)}</div>
      </div>
    );
  };

  const JurisdictionCard = ({ flag, label, rows, estimateRows, citationLabel }) => {
    if (!rows.length && !(estimateRows || []).length) return null;
    const general = rows.filter((r) => r.category === "general");
    const gaps = rows.filter((r) => r.category === "treaty_gap");
    return (
      <Card icon={<span>{flag}</span>} title={label} sub={rows.length + " income stream(s)"}>
        <Section rows={general} title="Withholding on file" />
        <Section rows={gaps} title={"Treaty elections — " + citationLabel} sub="documentation-dependent" />
        <Section rows={estimateRows || []} title="Statutory estimates" sub="not confirmed, excluded from totals above" />
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card icon={<Receipt size={16} strokeWidth={2} />} title="Withholding Taxes"
        sub="Every rupee/dollar withheld or collected at source — salary/W-2, property, TCS on outbound remittances — for this taxpayer, resident or not, in either country. Treaty-election rows costing extra for missing paperwork are highlighted within; statutory estimates are called out separately.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-1">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-line">
            <div className="text-[9px] uppercase tracking-widest text-muted mb-1">Total withheld</div>
            <div className="text-[20px] font-mono font-bold text-head">{fmtUsd(totalWithheldUsd)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-line">
            <div className="text-[9px] uppercase tracking-widest text-muted mb-1">Avoidable cost (docs)</div>
            <div className="text-[20px] font-mono font-bold" style={{ color: wh.totalGapUsd > 1 ? PAL.redText : PAL.greenText }}>{fmtUsd(wh.totalGapUsd)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-line">
            <div className="text-[9px] uppercase tracking-widest text-muted mb-1">India withheld</div>
            <div className="text-[20px] font-mono font-bold text-head">{fmtInr(indiaTaxInr)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-line">
            <div className="text-[9px] uppercase tracking-widest text-muted mb-1">US withheld</div>
            <div className="text-[20px] font-mono font-bold text-head">{fmtUsd(usTaxUsd)}</div>
          </div>
        </div>
      </Card>

      {wh.india.panAadhaarInoperative && (
        <div className="rounded-2xl border border-exposed/30 bg-exposed/10 p-4">
          <div className="text-[12px] font-bold" style={{ color: PAL.redText }}>⚠ PAN not linked to Aadhaar — PAN is inoperative</div>
          <p className="text-[11.5px] text-body mt-1">Every payer must withhold TDS/TCS at the higher default rate under s.397(2) — generally 20%, or double the normal rate, whichever is higher — REGARDLESS of any rate shown below, including every treaty election. Not reflected in the rows below (Layer 1 doesn't capture how long the PAN stays inoperative), but it overrides all of them while it does.</p>
        </div>
      )}

      {allRows.length === 0 && !(wh.india.estimateRows || []).length && !(wh.us.estimateRows || []).length ? (
        <Card><Empty>No withholding-tax income on file for this taxpayer — nothing to reconcile.</Empty></Card>
      ) : (
        <>
          <JurisdictionCard flag="🇮🇳" label="India" rows={wh.india.rows} estimateRows={wh.india.estimateRows} citationLabel="s.207 / s.159" />
          <JurisdictionCard flag="🇺🇸" label="United States" rows={wh.us.rows} estimateRows={wh.us.estimateRows} citationLabel="FDAP / FIRPTA" />
        </>
      )}
    </div>
  );
}

/* ============================ ACCOUNTS ============================ */
export function AccountsView({ result }) {
  if (!result) return <Empty>Load a client to see accounts.</Empty>;
  const color = { ok: PAL.positive, approaching: PAL.approaching, breached: PAL.exposed };
  const accts = result.model.accounts.accounts || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card icon={<Ruler size={16} strokeWidth={2} />} title="Reporting Limits" sub="FBAR · FATCA 8938 · LRS · FEIE">
        <div className="space-y-4">
          {result.computed.limits.map((g) => (
            <div key={g.id}>
              <div className="flex justify-between text-[11px] mb-1.5"><span className="text-body font-semibold">{g.label}{g.status === "breached" && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-exposed/15" style={{ color: PAL.redText }}>BREACHED</span>}</span><span className="font-mono" style={{ color: color[g.status] }}>{Math.round(g.pct * 100)}%</span></div>
              <SegBar pct={g.pct} color={color[g.status]} projPct={g.projPct} />
              <div className="flex justify-between text-[10px] text-muted mt-1.5"><span>{fmtUsd(g.value)}</span><span>limit {fmtUsd(g.limit)}</span></div>
            </div>
          ))}
        </div>
      </Card>
      <Card icon={<Landmark size={16} strokeWidth={2} />} title="Foreign Accounts" sub={accts.length + " account(s) · drives FBAR / Schedule FA"}>
        {accts.length === 0 ? <Empty>No foreign accounts on file.</Empty> : (
          <div className="space-y-1.5">
            {accts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03]">
                {a.country === "India" ? <span className="text-base">🇮🇳</span> : <Landmark size={15} strokeWidth={2} className="text-muted shrink-0" />}
                <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold text-head truncate">{a.bank}</div><div className="text-[10px] text-muted">{a.type} · {a.country}</div></div>
                <div className="text-[12px] font-mono text-head">{fmtUsd(a.peak.usd)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================ HOLDINGS (income & assets from Layer 1) ======= */
export function HoldingsView({ result }) {
  if (!result) return <Empty>Load a client to see income &amp; holdings.</Empty>;
  const m = result.model, inc = m.income, a = m.assets, fx = m.meta.fxRate || 83;
  const usPerson = result.computed.residency.us.isResident;
  const inrToUsd = (n) => (n || 0) / fx;

  // Securities — US brokerage/investment holdings + Indian funds/equities
  const inSec = ((a.indianSecurities && a.indianSecurities.length ? a.indianSecurities : a.indianMutualFunds) || []).map((s) => ({
    name: s.asset_name || "Holding", type: (s.asset_type || "security").replace(/_/g, " "),
    valueUsd: inrToUsd(s.value_inr || (s.value_usd || 0) * fx), country: "IN",
    pfic: usPerson && /fund|etf|mutual/i.test(s.asset_type || "")
  }));
  const usSec = (a.usSecurities || []).map((s) => ({
    name: s.asset_name || s.institution_name || s.account_type || "US holding",
    type: (s.account_type || s.asset_type || "brokerage").replace(/_/g, " "),
    valueUsd: s.peak_balance_usd || s.market_value_usd || s.value_usd || 0, country: "US", pfic: false
  }));
  const securities = [...usSec, ...inSec];
  const corps = a.usForeignCorps || [];

  // Property — US real estate + Indian property
  const inProp = (a.indianProperties || []).map((p) => ({ name: p.address || "Property", type: p.property_type || "Residential", grossRentUsd: inrToUsd(p.gross_rent_received_inr || p.annual_value_inr || 0), country: "IN", note: p.municipal_taxes_paid_inr ? "municipal tax " + fmtInr(p.municipal_taxes_paid_inr) : "" }));
  const usProp = (a.usProperties || []).filter((p) => !p._hydratedFromIndia).map((p) => ({ name: p.name || p.address || "US property", type: p.property_type || "Residential", grossRentUsd: p.gross_rent_usd || p.rental_income_usd || 0, country: "US", note: p.expenses_usd ? "expenses " + fmtUsd(p.expenses_usd) : "" }));
  const properties = [...usProp, ...inProp];

  // Retirement — US 401k/IRA/Roth contributions (this year) + Indian EPF/PPF/NPS balances
  const usr = a.usRetirement || {};
  const usRet = [["401(k) — employee", usr["401k_employee_contribution_usd"]], ["401(k) — employer match", usr["401k_employer_match_usd"]], ["Roth 401(k)", usr.roth_401k_contribution_usd], ["Traditional IRA", usr.traditional_ira_contribution_usd], ["Roth IRA", usr.roth_ira_contribution_usd], ["SEP / Solo 401(k)", (usr.sep_ira_contribution_usd || 0) + (usr.solo_401k_contribution_usd || 0)], ["HSA", usr.hsa_contribution_usd]]
    .filter(([, v]) => v > 0).map(([l, v]) => ({ label: l, valueUsd: v, country: "US", kind: "contribution" }));
  const inRet = [["EPF (Employees' Provident Fund)", a.epfInr], ["PPF (Public Provident Fund)", a.ppfInr], ["NPS (National Pension System)", a.npsInr]]
    .filter(([, v]) => v > 0).map(([l, v]) => ({ label: l, valueUsd: inrToUsd(v), inr: v, country: "IN", kind: "balance" }));
  const retire = [...usRet, ...inRet];
  const accts = (m.accounts && m.accounts.accounts) || [];

  const secValueUsd = securities.reduce((s, x) => s + x.valueUsd, 0);
  const retireUsd = retire.reduce((s, x) => s + x.valueUsd, 0);
  const acctUsd = accts.reduce((s, x) => s + (x.peak && x.peak.usd || 0), 0);
  const propGrossUsd = properties.reduce((s, p) => s + p.grossRentUsd, 0);

  const HoldTag = ({ color, children }) => <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: color + "24", color }}>{children}</span>;
  const Flag = ({ c }) => <span className="text-[13px]" title={c === "US" ? "United States" : "India"}>{c === "US" ? "🇺🇸" : "🇮🇳"}</span>;

  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Wallet size={16} strokeWidth={2} /></HeadChip>Income &amp; Holdings</h2><p className="text-muted text-sm mt-2">Everything captured in Layer 1 for {m.identity.name} — property, securities, entities and retirement.</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<TrendingUp size={15} strokeWidth={2} />} label="Securities &amp; funds" value={fmtUsd(secValueUsd)} sub={securities.length + " holding(s) · US + India"} accent={PAL.accent} highlight />
        <StatTile icon={<Home size={15} strokeWidth={2} />} label="Property (annual rent)" value={fmtUsd(propGrossUsd)} sub={properties.length + " property(ies)"} />
        <StatTile icon={<Landmark size={15} strokeWidth={2} />} label="Bank balances (peak)" value={fmtUsd(acctUsd)} sub={accts.length + " account(s)"} />
        <StatTile icon={<Palmtree size={15} strokeWidth={2} />} label="Retirement" value={fmtUsd(retireUsd)} sub="401k/IRA · EPF/PPF/NPS" />
      </div>

      <Card icon={<TrendingUp size={16} strokeWidth={2} />} title="Securities &amp; Funds" sub={usPerson ? "US brokerage + Indian funds — Indian funds held by a US person are PFICs (Form 8621)" : "Holdings on file (US + India)"}>
        {securities.length === 0 ? <Empty>No securities on file.</Empty> : (
          <div className="space-y-1.5">
            {securities.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-line">
                <Flag c={s.country} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-head truncate flex items-center gap-2">{s.name}{s.pfic && <HoldTag color={PAL.exposed}>PFIC · 8621</HoldTag>}</div>
                  <div className="text-[10px] text-muted">{s.type}</div>
                </div>
                <div className="text-[12px] font-mono text-head">{fmtUsd(s.valueUsd)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {corps.length > 0 && (
        <Card icon={<Building2 size={16} strokeWidth={2} />} title="Business Entities / Foreign Corporations" sub="Ownership ≥10% → Form 5471 · GILTI / Subpart F">
          <div className="space-y-1.5">
            {corps.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-line">
                <Building2 size={15} strokeWidth={2} className="text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-head truncate flex items-center gap-2">{c.corp_name || "Foreign corporation"}<HoldTag color={PAL.filing}>CFC · 5471</HoldTag></div>
                  <div className="text-[10px] text-muted">{c.country || "—"}</div>
                </div>
                {c.gilti_income_usd > 0 && <div className="text-right"><div className="text-[12px] font-mono text-head">{fmtUsd(c.gilti_income_usd)}</div><div className="text-[9px] text-muted">GILTI inclusion</div></div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<Home size={16} strokeWidth={2} />} title="Property" sub={properties.length + " property(ies) · US + India"}>
          {properties.length === 0 ? <Empty>No property on file.</Empty> : (
            <div className="space-y-1.5">
              {properties.map((p, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-line">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-head flex items-center gap-2"><Flag c={p.country} />{p.name}</div>
                    <div className="text-[12px] font-mono text-head">{fmtUsd(p.grossRentUsd)}<span className="text-[9px] text-muted ml-1">gross rent</span></div>
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{p.type}{p.note ? " · " + p.note : ""}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card icon={<Palmtree size={16} strokeWidth={2} />} title="Retirement Accounts" sub="US 401k/IRA/Roth (this year's contributions) + Indian EPF/PPF/NPS — see the US-treatment note on the Monitor">
          {retire.length === 0 ? <Empty>No retirement balances on file.</Empty> : (
            <div className="space-y-1.5">
              {retire.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-line">
                  <span className="text-[12px] text-body flex items-center gap-2"><Flag c={r.country} />{r.label}{r.kind === "contribution" && <HoldTag color={PAL.muted}>TY contrib</HoldTag>}</span>
                  <span className="text-[12px] font-mono text-head">{r.inr ? fmtInr(r.inr) + " ≈ " : ""}{fmtUsd(r.valueUsd)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}


/* ============================ BUSINESS & ENTITIES ============================ */
export function BusinessView({ result }) {
  if (!result) return <Empty>Load a client to see business entities.</Empty>;
  const m = result.model, u = result.computed.usTax || {};
  const ents = m.assets.businessEntities || [];
  const Flag = ({ c }) => <span className="text-[13px]">{c === "US" ? "🇺🇸" : "🇮🇳"}</span>;
  const Tag = ({ color, children }) => <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: color + "24", color }}>{children}</span>;
  if (!ents.length) {
    return (
      <div className="space-y-6">
        <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Building2 size={16} strokeWidth={2} /></HeadChip>Business &amp; Entities</h2><p className="text-muted text-sm mt-2">Schedule C, K-1, S-corp, C-corp and foreign corporations — with US tax treatment.</p></div>
        <Card icon={<Building2 size={16} strokeWidth={2} />} title="No business entities on file"><Empty>{m.identity.name} has no Schedule C / K-1 / corporate income in Layer 1.</Empty></Card>
      </div>
    );
  }
  const totalUsd = ents.reduce((s, e) => s + (e.incomeUsd || 0), 0);
  const usEnts = ents.filter((e) => e.country === "US");
  const inEnts = ents.filter((e) => e.country === "IN");
  const cfcCount = ents.filter((e) => e.cfc).length;
  const seTax = u.seTaxUsd || 0, qbi = u.qbiDeductionUsd || 0;
  const Row = (e, i) => {
    const fmtRow = e.country === "IN" ? fmtInr : fmtUsd;
    return (
    <div key={e.country + ":" + e.type + ":" + e.name} className="p-3 rounded-lg bg-white/[0.03] border border-line">
      <div className="flex items-center gap-3">
        <Flag c={e.country} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-head truncate flex items-center gap-2 flex-wrap">{e.name}
            {e.se && <Tag color={PAL.approaching}>SE tax</Tag>}
            {e.qbi && <Tag color={PAL.accent}>QBI</Tag>}
            {e.corp && <Tag color={PAL.filing}>C-Corp 21%</Tag>}
            {e.cfc && <Tag color={PAL.exposed}>CFC · 5471</Tag>}
            <Tag color={e.filesOwnReturn ? PAL.blueText : PAL.muted}>{e.filesOwnReturn ? "Files its own return" : "Flows to personal return"}</Tag>
          </div>
          <div className="text-[10px] text-muted">{e.type}{e.gilti > 0 ? " · GILTI " + fmtUsd(e.gilti) : ""}{e.returnForm ? " · " + e.returnForm : ""}</div>
        </div>
        <div className="text-[13px] font-mono text-head whitespace-nowrap shrink-0">{e.inr ? fmtInr(e.inr) + " ≈ " : ""}{fmtUsd(e.incomeUsd)}</div>
      </div>
      {e.calcTrace && (
        <div className="mt-1.5 pl-6">
          <TraceRow label="How this figure was calculated" valueDisp="Show workflow ↓" color={PAL.muted} trace={e.calcTrace} fmt={fmtRow} />
        </div>
      )}
    </div>
    );
  };
  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Building2 size={16} strokeWidth={2} /></HeadChip>Business &amp; Entities</h2><p className="text-muted text-sm mt-2">Every business/entity from Layer 1 — Schedule C, K-1, S-corp, C-corp and foreign corporations — with its US tax treatment.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<Building2 size={15} strokeWidth={2} />} label="Business income" value={fmtUsd(totalUsd)} sub={ents.length + " entity(ies)"} accent={PAL.accent} highlight />
        <StatTile icon={<Receipt size={15} strokeWidth={2} />} label="Self-employment tax" value={fmtUsd(seTax)} sub="Schedule SE" accent={seTax ? PAL.amberText : PAL.muted} />
        <StatTile icon={<TrendingDown size={15} strokeWidth={2} />} label="§199A QBI deduction" value={fmtUsd(qbi)} sub="20% pass-through" accent={qbi ? PAL.greenText : PAL.muted} />
        <StatTile icon={<Globe2 size={15} strokeWidth={2} />} label="Foreign corps (CFC)" value={cfcCount} sub="Form 5471 / GILTI" accent={cfcCount ? PAL.filing : PAL.muted} />
      </div>
      {usEnts.length > 0 && <Card title="🇺🇸 US business & pass-through entities" sub="Schedule C / K-1 / S-corp / C-corp — flows to the 1040 (or 1120 for C-corps)"><div className="space-y-1.5">{usEnts.map(Row)}</div></Card>}
      {inEnts.length > 0 && <Card title="🇮🇳 Indian business entities" sub="PGBP income / foreign corporations"><div className="space-y-1.5">{inEnts.map(Row)}</div></Card>}
      <Card icon={<BookOpen size={16} strokeWidth={2} />} title="How this business income is taxed" sub="Planning-grade — see Filings → Tax Computation for the full numbers">
        <ul className="space-y-1.5 text-[12px] text-body">
          <li><span className="font-bold" style={{ color: PAL.amberText }}>SE tax</span> — Schedule C, farm and general-partnership income pay 15.3% self-employment tax (SS capped at the wage base + Medicare); half is deductible. {seTax > 0 ? "This taxpayer: " + fmtUsd(seTax) + "." : ""}</li>
          <li><span className="font-bold" style={{ color: PAL.accent }}>§199A QBI</span> — pass-through business income gets a 20% deduction (SSTB / income-limit phase-outs apply). {qbi > 0 ? "This taxpayer: " + fmtUsd(qbi) + " deduction." : ""}</li>
          <li><span className="font-bold" style={{ color: PAL.blueText }}>C-Corp</span> — taxed at 21% at the entity (Form 1120); not on the personal return until distributed.</li>
          <li><span className="font-bold" style={{ color: PAL.redText }}>Foreign corp (CFC)</span> — ≥10% US ownership triggers Form 5471; GILTI / Subpart F can accelerate US tax on undistributed profits (see the Monitor conflict).</li>
        </ul>
      </Card>
    </div>
  );
}

/* ============================ CLIENTS (portfolio) ============================ */

/* ============================ CLIENTS (portfolio) ============================ */
export function ClientsView({ clients, activeId, onPick }) {
  if (!clients || !clients.length) return <Empty>Loading clients…</Empty>;
  const totalTax = clients.reduce((a, c) => a + (c.combinedTaxUsd || 0), 0);
  const totalResidual = clients.reduce((a, c) => a + (c.netDoubleTaxUsd || 0), 0);
  const openCritical = clients.reduce((a, c) => a + (c.critical || 0), 0);
  const atRisk = clients.filter((c) => c.healthScore < 50).length;
  const sorted = clients.slice().sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100));
  const healthColor = (h) => (h >= 80 ? PAL.positive : h >= 50 ? PAL.approaching : PAL.exposed);
  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Users size={16} strokeWidth={2} /></HeadChip>Client Portfolio</h2><p className="text-muted text-sm mt-2">Your book of business — cross-border exposure at a glance. Click a client to open their Monitor.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile icon={<Users size={15} strokeWidth={2} />} label="Clients" value={clients.length} highlight />
        <StatTile icon={<AlertTriangle size={15} strokeWidth={2} />} label="At risk" value={atRisk} accent={atRisk ? PAL.redText : PAL.greenText} sub="health < 50" />
        <StatTile icon={<Siren size={15} strokeWidth={2} />} label="Open critical" value={openCritical} accent={openCritical ? PAL.redText : PAL.greenText} sub="conflicts" />
        <StatTile icon={<DollarSign size={15} strokeWidth={2} />} label="Combined tax" value={fmtUsd(totalTax)} sub="IN + US, all clients" />
        <StatTile icon={<TrendingDown size={15} strokeWidth={2} />} label="Residual double tax" value={fmtUsd(totalResidual)} accent={totalResidual ? PAL.redText : PAL.greenText} sub="unrelieved" />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full">
          <thead className="bg-white/[0.02]"><tr>
            {["Client", "Type", "Residency", "Combined tax", "Residual", "Conflicts", "Health", "Next filing", ""].map((h, i) => (
              <th key={i} className={"px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted font-bold " + (["Combined tax", "Residual"].includes(h) ? "text-right" : "text-left")}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} onClick={() => onPick(c.id)} className={"border-t border-line cursor-pointer hover:bg-white/[0.03] " + (activeId === c.id ? "bg-accentSoft" : "")}>
                <td className="px-4 py-3"><div className="text-[13px] font-semibold text-head">{c.label}</div><div className="text-[10px] text-muted truncate max-w-[240px]">{c.story}</div></td>
                <td className="px-4 py-3"><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: (c.isBusiness ? PAL.filing : PAL.accent) + "24", color: c.isBusiness ? PAL.blueText : PAL.accent }}>{c.isBusiness ? "Business" : "Individual"}</span></td>
                <td className="px-4 py-3 text-[12px] text-body">{(c.indiaStatus || "—")}<span className="text-muted"> / </span>{(c.usStatus ? c.usStatus.replace(/_/g, " ") : "—")}{c.dualResident && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-exposed/15" style={{ color: PAL.redText }}>DUAL</span>}</td>
                <td className="px-4 py-3 text-right font-mono text-[12px] text-head">{fmtUsd(c.combinedTaxUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ color: c.netDoubleTaxUsd > 0 ? PAL.redText : PAL.muted }}>{fmtUsd(c.netDoubleTaxUsd)}</td>
                <td className="px-4 py-3 text-[12px]"><span className="font-bold" style={{ color: PAL.redText }}>{c.critical}</span><span className="text-muted"> · </span><span style={{ color: PAL.amberText }}>{c.warning}</span></td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(4, c.healthScore) + "%", background: healthColor(c.healthScore) }} /></div><span className="text-[11px] font-mono" style={{ color: healthColor(c.healthScore) }}>{c.healthScore}</span></div></td>
                <td className="px-4 py-3 text-[11px] text-body">{c.nextDeadline ? c.nextDeadline.dateLabel + " · in " + c.nextDeadline.daysUntil + "d" : "—"}</td>
                <td className="px-4 py-3 text-right"><span className="text-[11px] font-bold text-accent">Open →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// Deliberately-not-computed boundaries (engine's buildScopeNotes) — surfaced
// on the Monitor overview so the professional reading the numbers also sees
// what the numbers deliberately do NOT cover. Pure disclosures.
export function ScopeNotesCard({ notes }) {
  const [open, setOpen] = useState(false);
  if (!notes || !notes.length) return null;
  const excluded = notes.filter((n) => n.kind === "excluded");
  const assurances = notes.filter((n) => n.kind === "assurance");
  const areaColor = { India: PAL.jurIN, "United States": PAL.jurUS, "Cross-border": PAL.filing, App: PAL.muted };
  const Note = ({ n }) => (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-line">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[8.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0" style={{ background: (areaColor[n.area] || PAL.muted) + "22", color: areaColor[n.area] || PAL.muted }}>{n.area}</span>
        <span className="text-[11.5px] font-bold text-head">{n.title}</span>
      </div>
      <p className="text-[10.5px] text-body leading-relaxed">{n.body}</p>
    </div>
  );
  return (
    <Card icon={<Scale size={16} strokeWidth={2} />} title="Deliberately out of scope"
      sub="Boundaries this engine will not cross — judgment calls, separate tax bases, and simulated features — recorded here so a silent number is never mistaken for a complete one">
      <button onClick={() => setOpen(!open)} className="text-[11px] font-bold text-accent hover:underline mb-3">
        {open ? "Hide" : "Show"} {excluded.length} boundar{excluded.length === 1 ? "y" : "ies"}{assurances.length ? " + " + assurances.length + " verified assurance(s)" : ""} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="space-y-2">
          {excluded.map((n) => <Note key={n.id} n={n} />)}
          {assurances.length > 0 && (
            <>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted pt-2">Verified — nothing to do</div>
              {assurances.map((n) => <Note key={n.id} n={n} />)}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================ INTEGRATIONS ============================ */

/* ============================ INTEGRATIONS ============================ */
export function IntegrationsView() {
  const rows = [
    { name: "Trip Log", kind: "Physical presence / day-count", connected: true, icon: Compass },
    { name: "Bank feeds (Plaid)", kind: "FBAR / 8938 balances", connected: true, icon: Landmark },
    { name: "Payroll · 1099 · AIS", kind: "Income", connected: true, icon: Banknote },
    { name: "Brokerage (US)", kind: "Capital gains / dividends", connected: true, icon: TrendingUp },
    { name: "MCA / ITR portal", kind: "Indian entity filings", connected: false, icon: Landmark },
    { name: "DocuSign", kind: "Engagement & TRC docs", connected: false, icon: PenLine }
  ];
  return (
    <Card icon={<Plug size={16} strokeWidth={2} />} title="Integrations" sub="Connected data sources feed the engine daily">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-line">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.05] border border-line text-muted"><r.icon size={16} strokeWidth={2} /></span>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-head">{r.name}</div><div className="text-[11px] text-muted">{r.kind}</div></div>
            {r.connected
              ? <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: "rgba(34,197,94,0.12)", color: PAL.greenText }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: PAL.positive }} /> Connected</span>
              : <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/[0.05] text-body border border-line">Connect</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

