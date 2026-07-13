"use client";
import { useState, useEffect } from "react";
import {
  Compass, ScrollText, Scale, CalendarClock, CalendarRange, RefreshCcw, Calculator,
  FolderOpen, Ruler, Landmark, TrendingUp, Building2, Home, Palmtree, BookOpen, Plug,
  Wallet, Receipt, TrendingDown, Globe2, Users, AlertTriangle, Siren, DollarSign, Banknote, PenLine
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

/* ============================ RESIDENCY ============================ */
export function ResidencyView({ result }) {
  if (!result) return <Empty>Load a client to see residency.</Empty>;
  const r = result.computed.residency, t = result.model.treaty, mon = result.monitoring;
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Flag label="🇮🇳 India residency" s={r.india} />
        <Flag label="🇺🇸 US residency" s={r.us} />
      </div>
      <Card icon={<Compass size={16} strokeWidth={2} />} title="Residency Day-Counters" sub="Physical-presence tests · projections at current pace">
        <div className="space-y-4">
          {(mon ? mon.residency : []).map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-[12px] mb-1.5"><span className="font-semibold text-head">{c.flag} {c.country} <span className="text-muted font-normal">· {c.test}</span></span><span className="font-mono" style={{ color: stCol[c.status] }}>{c.days}/{c.threshold}d</span></div>
              <SegBar pct={c.pct} color={stCol[c.status]} projPct={c.threshold ? (c.projectedFullYear || 0) / c.threshold : 0} />
              <div className="text-[11px] text-muted mt-1.5">{c.headline} · <span style={{ color: c.status === "will_flip" ? PAL.amberText : PAL.muted }}>{c.dateLabel}</span></div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<ScrollText size={16} strokeWidth={2} />} title="DTAA Treaty Position" sub="India-US Double Taxation Avoidance Agreement">
          {treatyRow("Article 4 tie-breaker applied", t.treatyResidence !== "none" || t.usTreatyResidence !== "none", "Recorded", "Not applied")}
          {treatyRow("Tax Residency Certificate (TRC)", t.trcStatus, "On file", "Missing")}
          {treatyRow("Form 10F filed", t.form10fFiled, "Filed", "Not filed")}
          {treatyRow("Permanent Establishment in India", !t.hasPE, "None", "Yes — attributable profits")}
          {treatyRow("Files US 1040-NR", true, t.files1040nr ? "Yes" : "No", "")}
          <div className="text-[11px] text-muted mt-3">Treaty residence claimed: <span className="text-body font-mono">{t.treatyResidence !== "none" ? t.treatyResidence : (t.usTreatyResidence !== "none" ? t.usTreatyResidence : "none")}</span></div>
        </Card>
        <Card icon={<Scale size={16} strokeWidth={2} />} title="Residency & Treaty Conflicts">
          <ConflictsPanel findings={result.findings.filter((f) => f.category === "residency" || f.category === "treaty")} />
        </Card>
      </div>
    </div>
  );
}

/* ============================ FILINGS ============================ */
export function FilingsView({ result }) {
  if (!result) return <Empty>Load a client to see filings.</Empty>;
  const cal = result.monitoring ? result.monitoring.calendar.all.slice().sort((a, b) => a.date - b.date) : [];
  const upcoming = cal.filter((x) => x.status !== "passed");
  const passed = cal.filter((x) => x.status === "passed").slice(-3);
  const jColor = { US: PAL.jurUS, IN: PAL.jurIN };
  const docs = result.documents.slice().sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  const req = docs.filter((d) => d.required).length;
  return (
    <div className="space-y-6">
      <Card icon={<CalendarClock size={16} strokeWidth={2} />} title="Compliance Calendar" sub="Filing & payment deadlines with countdowns">
        <div className="space-y-1.5">
          {upcoming.concat(passed).map((x, i) => {
            const isPast = x.status === "passed";
            const due = isPast ? Math.abs(x.daysUntil) + "d ago" : "in " + x.daysUntil + "d";
            const dueColor = x.status === "due_soon" ? PAL.amberText : (isPast ? PAL.muted : PAL.greenText);
            return (
              <div key={i} className={"flex items-center gap-3 p-2 rounded-lg " + (isPast ? "opacity-45" : "bg-white/[0.03]")}>
                <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: jColor[x.jur] + "24", color: jColor[x.jur] }}>{x.jur}</span>
                <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold text-head truncate">{x.name}</div><div className="text-[10px] text-muted">{x.dateLabel} · {x.cat}</div></div>
                <div className="text-[11px] font-mono whitespace-nowrap" style={{ color: dueColor }}>{due}</div>
              </div>
            );
          })}
        </div>
      </Card>
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

/* FY ↔ CY tax-year apportionment. */
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
function TaxCard({ taxComputation, fxRate, onJump }) {
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
  return (
    <Card icon={<Calculator size={16} strokeWidth={2} />} title="Tax Computation" sub="Planning-grade, from Layer 1">
      <Block block={taxComputation.india} isInr accent={PAL.jurIN} />
      <div className="h-3" />
      <Block block={taxComputation.us} accent={PAL.jurUS} />
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
    ["Short-term capital gains", inc.india.stcg], ["Long-term capital gains", inc.india.ltcg],
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
      <div><h2 className="font-display font-extrabold text-2xl text-head"><HeadChip><Scale size={16} strokeWidth={2} /></HeadChip>Reconciliation</h2><p className="text-muted text-sm mt-2">The same income under each country's own code — Tax Computation, FTC relief, cross-basis overlap, and the FY↔CY apportionment that ties them together.</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FtcCard ftcReport={result.ftcReport} onJump={onJump} />
        <TaxCard taxComputation={result.taxComputation} fxRate={result.model.meta.fxRate} onJump={onJump} />
      </div>

      {result.computed.reconciliation && result.computed.reconciliation.rows && result.computed.reconciliation.rows.length > 0 && (
        <CapsuleChart rows={result.computed.reconciliation.rows} />
      )}
      <ReconciliationCard recon={result.computed.reconciliation} />
      <ApportionmentCard ap={result.computed.apportionment} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="recon-india-income" className={"rounded-[26px] transition-all duration-300 " + (highlight === "india" ? "ring-2 ring-offset-2 ring-offset-[#0a0a0a]" : "")} style={highlight === "india" ? { "--tw-ring-color": PAL.accent, boxShadow: `0 0 0 4px ${PAL.accent}33` } : undefined}>
          <Card title="🇮🇳 India income — by head" sub="From Layer 1 India (₹, with USD equivalent)">
            {indiaRows.length ? indiaRows.map((r, i) => <IncomeRow key={i} label={r.label} mv={r.mv} additive={r.additive} inr />) : <Empty>No India income on file.</Empty>}
            {indiaRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtInr(indiaTotalInr)} <span className="text-muted">≈ {fmtUsd(indiaTotalUsd)}</span></span></div>}
          </Card>
        </div>
        <div id="recon-us-income" className={"rounded-[26px] transition-all duration-300 " + (highlight === "us" ? "ring-2 ring-offset-2 ring-offset-[#0a0a0a]" : "")} style={highlight === "us" ? { "--tw-ring-color": PAL.accent, boxShadow: `0 0 0 4px ${PAL.accent}33` } : undefined}>
          <Card title="🇺🇸 US income — by head" sub="From Layer 1 US (USD)">
            {usRows.length ? usRows.map((r, i) => <IncomeRow key={i} label={r.label} mv={r.mv} additive={r.additive} />) : <Empty>No US income on file.</Empty>}
            {usRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtUsd(usTotalUsd)}</span></div>}
          </Card>
        </div>
      </div>
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
  const Row = (e, i) => (
    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-line">
      <Flag c={e.country} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-head truncate flex items-center gap-2 flex-wrap">{e.name}
          {e.se && <Tag color={PAL.approaching}>SE tax</Tag>}
          {e.qbi && <Tag color={PAL.accent}>QBI</Tag>}
          {e.corp && <Tag color={PAL.filing}>C-Corp 21%</Tag>}
          {e.cfc && <Tag color={PAL.exposed}>CFC · 5471</Tag>}
        </div>
        <div className="text-[10px] text-muted">{e.type}{e.gilti > 0 ? " · GILTI " + fmtUsd(e.gilti) : ""}</div>
      </div>
      <div className="text-[13px] font-mono text-head whitespace-nowrap">{e.inr ? fmtInr(e.inr) + " ≈ " : ""}{fmtUsd(e.incomeUsd)}</div>
    </div>
  );
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
