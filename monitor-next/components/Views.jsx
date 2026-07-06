"use client";
import { useState } from "react";
import { fmtUsd, PAL } from "@/lib/logic";

const SEV = { critical: PAL.exposed, warning: PAL.approaching, info: PAL.filing };
const SEV_TEXT = { critical: PAL.redText, warning: PAL.amberText, info: PAL.blueText };
const GREEN = PAL.positive;
const fmtInr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const Card = ({ title, sub, children, right }) => (
  <section className="rounded-2xl bg-surface border border-line shadow-card p-5">
    {title && (
      <div className="flex items-start justify-between mb-3">
        <div><h3 className="font-display font-bold text-lg text-head">{title}</h3>{sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}</div>
        {right}
      </div>
    )}
    {children}
  </section>
);
const Empty = ({ children }) => <div className="text-center text-muted text-sm py-10">{children}</div>;
const Ref = ({ children }) => <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.05] border border-line text-muted">{children}</span>;

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
              className={"px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors " +
                (on ? "bg-accent text-[#04120f] border-accent" : "bg-surface border-line text-body hover:border-accent/50")}>
              {id !== "all" && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEV[id] }} />}
              {label} <span className="opacity-60">{counts[id]}</span>
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
      {r.dualResident && <div className="rounded-xl border border-exposed/30 bg-exposed/10 p-3 text-[13px] font-semibold" style={{ color: PAL.redText }}>⚠ Dual tax residency — resolve the India-US DTAA Article 4 tie-breaker.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Flag label="🇮🇳 India residency" s={r.india} />
        <Flag label="🇺🇸 US residency" s={r.us} />
      </div>
      <Card title="Residency Day-Counters" sub="Physical-presence tests · projections at current pace">
        <div className="space-y-4">
          {(mon ? mon.residency : []).map((c, i) => {
            const pct = Math.min(100, Math.round(c.pct * 100));
            return (
              <div key={i}>
                <div className="flex justify-between text-[12px] mb-1"><span className="font-semibold text-head">{c.flag} {c.country} <span className="text-muted font-normal">· {c.test}</span></span><span className="font-mono" style={{ color: stCol[c.status] }}>{c.days}/{c.threshold}d</span></div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: stCol[c.status], boxShadow: `0 0 8px ${stCol[c.status]}` }} /></div>
                <div className="text-[11px] text-muted mt-0.5">{c.headline} · {c.dateLabel}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="DTAA Treaty Position" sub="India-US Double Taxation Avoidance Agreement">
          {treatyRow("Article 4 tie-breaker applied", t.treatyResidence !== "none" || t.usTreatyResidence !== "none", "Recorded", "Not applied")}
          {treatyRow("Tax Residency Certificate (TRC)", t.trcStatus, "On file", "Missing")}
          {treatyRow("Form 10F filed", t.form10fFiled, "Filed", "Not filed")}
          {treatyRow("Permanent Establishment in India", !t.hasPE, "None", "Yes — attributable profits")}
          {treatyRow("Files US 1040-NR", true, t.files1040nr ? "Yes" : "No", "")}
          <div className="text-[11px] text-muted mt-3">Treaty residence claimed: <span className="text-body font-mono">{t.treatyResidence !== "none" ? t.treatyResidence : (t.usTreatyResidence !== "none" ? t.usTreatyResidence : "none")}</span></div>
        </Card>
        <Card title="Residency & Treaty Conflicts">
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
  return (
    <div className="space-y-6">
      <Card title="Compliance Calendar" sub="Filing & payment deadlines with countdowns">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FtcCard ftcReport={result.ftcReport} />
        <TaxCard taxComputation={result.taxComputation} fxRate={result.model.meta.fxRate} />
      </div>
      <ReconciliationCard recon={result.computed.reconciliation} />
      <ApportionmentCard ap={result.computed.apportionment} />
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
    <Card title="FY ↔ CY Apportionment" sub={"Indian FY straddles two US calendar years — period-matched so FTC lines up both ways · basis: " + ap.basis}>
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
    <Card title="Cross-Basis Reconciliation" sub="The same income computed under each country's own code — India (Income-tax Act) vs US (IRC). Overlap is what FTC / §90 relieves.">
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
function FtcCard({ ftcReport }) {
  const net = ftcReport.headlineNetDoubleTaxUsd;
  const Block = ({ block }) => (
    <div className="mb-2"><div className="text-[11px] font-bold text-body mb-2">{block.title}</div>
      <div className="space-y-1">{block.rows.map((r, i) => {
        const c = r.warn ? PAL.redText : r.emphasis ? PAL.greenText : PAL.body;
        const disp = r.usd < 0 ? "(" + fmtUsd(Math.abs(r.usd)) + ")" : fmtUsd(r.usd);
        return <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis || r.warn ? "font-bold" : "")}><span style={{ color: c }}>{r.label}</span><span className="font-mono" style={{ color: c }}>{disp}</span></div>;
      })}</div></div>
  );
  return (
    <Card title="FTC Reconciliation">
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
function TaxCard({ taxComputation, fxRate }) {
  const Block = ({ block, isInr, accent }) => (
    <div className="rounded-xl p-3" style={{ background: accent + "12", border: `1px solid ${accent}33` }}>
      <div className="flex items-center justify-between mb-2"><div className="text-[12px] font-bold text-head">{block.title}</div><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-white/[0.05] border border-line text-muted">eff {Math.round(block.effectiveRate * 100)}%</span></div>
      <div className="space-y-1">{block.rows.map((r, i) => {
        const val = isInr ? r.inr : r.usd; let disp = isInr ? fmtInr(Math.abs(val)) : fmtUsd(Math.abs(val)); if (val < 0) disp = "(" + disp + ")";
        return <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis ? "border-t border-line pt-1.5 mt-1 font-bold text-head" : "text-body")}><span>{r.label}</span><span className="font-mono">{disp}</span></div>;
      })}</div>
      <div className="text-[10px] text-muted mt-2">≈ {fmtUsd(block.totalUsd)} at {fxRate} INR/USD</div>
    </div>
  );
  return (
    <Card title="Tax Computation" sub="Planning-grade, from Layer 1">
      <Block block={taxComputation.india} isInr accent={PAL.jurIN} />
      <div className="h-3" />
      <Block block={taxComputation.us} accent={PAL.jurUS} />
    </Card>
  );
}

/* ============================ DOCUMENTS ============================ */
export function DocumentsView({ result }) {
  if (!result) return <Empty>Load a client to see documents.</Empty>;
  const jColor = { US: PAL.jurUS, IN: PAL.jurIN };
  const docs = result.documents.slice().sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  const req = docs.filter((d) => d.required).length;
  return (
    <Card title="Documents to File" sub={req + " required · triggered by this taxpayer's cross-border facts"}>
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
  );
}

/* ============================ ACCOUNTS ============================ */
export function AccountsView({ result }) {
  if (!result) return <Empty>Load a client to see accounts.</Empty>;
  const color = { ok: PAL.positive, approaching: PAL.approaching, breached: PAL.exposed };
  const accts = result.model.accounts.accounts || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Reporting Limits" sub="FBAR · FATCA 8938 · LRS · FEIE">
        <div className="space-y-4">
          {result.computed.limits.map((g) => {
            const pct = Math.min(100, Math.round(g.pct * 100));
            return (
              <div key={g.id}>
                <div className="flex justify-between text-[11px] mb-1"><span className="text-body font-semibold">{g.label}{g.status === "breached" && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-exposed/15" style={{ color: PAL.redText }}>BREACHED</span>}</span><span className="font-mono" style={{ color: color[g.status] }}>{Math.round(g.pct * 100)}%</span></div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: color[g.status], boxShadow: `0 0 8px ${color[g.status]}` }} /></div>
                <div className="flex justify-between text-[10px] text-muted mt-1"><span>{fmtUsd(g.value)}</span><span>limit {fmtUsd(g.limit)}</span></div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Foreign Accounts" sub={accts.length + " account(s) · drives FBAR / Schedule FA"}>
        {accts.length === 0 ? <Empty>No foreign accounts on file.</Empty> : (
          <div className="space-y-1.5">
            {accts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03]">
                <span className="text-base">{a.country === "India" ? "🇮🇳" : "🏦"}</span>
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

  const Tile = ({ label, value, sub, accent }) => (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</div>
      <div className="font-display font-extrabold text-xl" style={{ color: accent || PAL.head }}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
  const isTaxed = (mv) => mv && (mv.usd > 0 || mv.inr > 0);
  const IncomeRow = ({ label, mv, inr }) => (
    <div className="flex justify-between py-1.5 border-b border-line/60 text-[12px]">
      <span className="text-body">{label}</span>
      <span className="font-mono text-head">{inr ? fmtInr(mv.inr) : fmtUsd(mv.usd)}<span className="text-muted ml-2">{inr ? "≈ " + fmtUsd(mv.usd) : ""}</span></span>
    </div>
  );
  const indiaRows = [["Salary", inc.india.salary], ["Business / Profession", inc.india.business], ["House property", inc.india.houseProperty], ["Interest", inc.india.interest], ["Dividend", inc.india.dividend], ["Short-term capital gains", inc.india.stcg], ["Long-term capital gains", inc.india.ltcg]].filter(([, mv]) => isTaxed(mv));
  const usRows = [["Wages (W-2)", inc.us.wages], ["Business / Self-employment", inc.us.businessUs], ["Interest", inc.us.interestUs], ["Dividends — ordinary", inc.us.ordinaryDividendsUs], ["Dividends — qualified", inc.us.qualifiedDividendsUs], ["Rental", inc.us.rentalUs], ["Retirement (401k/IRA/SS)", inc.us.usRetirementIncome], ["Short-term gains", inc.us.stcgUs], ["Long-term gains", inc.us.ltcgUs]].filter(([, mv]) => isTaxed(mv));
  const HoldTag = ({ color, children }) => <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: color + "24", color }}>{children}</span>;
  const Flag = ({ c }) => <span className="text-[13px]" title={c === "US" ? "United States" : "India"}>{c === "US" ? "🇺🇸" : "🇮🇳"}</span>;

  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head">Income &amp; Holdings</h2><p className="text-muted text-sm mt-1">Everything captured in Layer 1 for {m.identity.name} — income by head, property, securities, entities and retirement.</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Securities &amp; funds" value={fmtUsd(secValueUsd)} sub={securities.length + " holding(s) · US + India"} accent={PAL.accent} />
        <Tile label="Property (annual rent)" value={fmtUsd(propGrossUsd)} sub={properties.length + " property(ies)"} />
        <Tile label="Bank balances (peak)" value={fmtUsd(acctUsd)} sub={accts.length + " account(s)"} />
        <Tile label="Retirement" value={fmtUsd(retireUsd)} sub="401k/IRA · EPF/PPF/NPS" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="🇮🇳 India income — by head" sub="From Layer 1 India (₹, with USD equivalent)">
          {indiaRows.length ? indiaRows.map(([l, mv], i) => <IncomeRow key={i} label={l} mv={mv} inr />) : <Empty>No India income on file.</Empty>}
          {indiaRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtInr(inc.india.total.inr)} <span className="text-muted">≈ {fmtUsd(inc.india.total.usd)}</span></span></div>}
        </Card>
        <Card title="🇺🇸 US income — by head" sub="From Layer 1 US (USD)">
          {usRows.length ? usRows.map(([l, mv], i) => <IncomeRow key={i} label={l} mv={mv} />) : <Empty>No US income on file.</Empty>}
          {usRows.length > 0 && <div className="flex justify-between pt-2 mt-1 text-[12px] font-bold text-head"><span>Total</span><span className="font-mono">{fmtUsd(inc.us.total.usd)}</span></div>}
        </Card>
      </div>

      <Card title="Securities &amp; Funds" sub={usPerson ? "US brokerage + Indian funds — Indian funds held by a US person are PFICs (Form 8621)" : "Holdings on file (US + India)"}>
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
        <Card title="Business Entities / Foreign Corporations" sub="Ownership ≥10% → Form 5471 · GILTI / Subpart F">
          <div className="space-y-1.5">
            {corps.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-line">
                <span className="text-base">🏢</span>
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
        <Card title="Property" sub={properties.length + " property(ies) · US + India"}>
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
        <Card title="Retirement Accounts" sub="US 401k/IRA/Roth (this year's contributions) + Indian EPF/PPF/NPS — see the US-treatment note on the Monitor">
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
  const Tile = ({ label, value, sub, accent }) => (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</div>
      <div className="font-display font-extrabold text-xl" style={{ color: accent || PAL.head }}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
  const Flag = ({ c }) => <span className="text-[13px]">{c === "US" ? "🇺🇸" : "🇮🇳"}</span>;
  const Tag = ({ color, children }) => <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: color + "24", color }}>{children}</span>;
  if (!ents.length) {
    return (
      <div className="space-y-6">
        <div><h2 className="font-display font-extrabold text-2xl text-head">Business &amp; Entities</h2><p className="text-muted text-sm mt-1">Schedule C, K-1, S-corp, C-corp and foreign corporations — with US tax treatment.</p></div>
        <Card title="No business entities on file"><Empty>{m.identity.name} has no Schedule C / K-1 / corporate income in Layer 1.</Empty></Card>
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
      <div><h2 className="font-display font-extrabold text-2xl text-head">Business &amp; Entities</h2><p className="text-muted text-sm mt-1">Every business/entity from Layer 1 — Schedule C, K-1, S-corp, C-corp and foreign corporations — with its US tax treatment.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Business income" value={fmtUsd(totalUsd)} sub={ents.length + " entity(ies)"} accent={PAL.accent} />
        <Tile label="Self-employment tax" value={fmtUsd(seTax)} sub="Schedule SE" accent={seTax ? PAL.amberText : PAL.muted} />
        <Tile label="§199A QBI deduction" value={fmtUsd(qbi)} sub="20% pass-through" accent={qbi ? PAL.greenText : PAL.muted} />
        <Tile label="Foreign corps (CFC)" value={cfcCount} sub="Form 5471 / GILTI" accent={cfcCount ? PAL.filing : PAL.muted} />
      </div>
      {usEnts.length > 0 && <Card title="🇺🇸 US business & pass-through entities" sub="Schedule C / K-1 / S-corp / C-corp — flows to the 1040 (or 1120 for C-corps)"><div className="space-y-1.5">{usEnts.map(Row)}</div></Card>}
      {inEnts.length > 0 && <Card title="🇮🇳 Indian business entities" sub="PGBP income / foreign corporations"><div className="space-y-1.5">{inEnts.map(Row)}</div></Card>}
      <Card title="How this business income is taxed" sub="Planning-grade — see Filings → Tax Computation for the full numbers">
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
  const Kpi = ({ label, value, accent, sub }) => (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</div>
      <div className="font-display font-extrabold text-2xl" style={{ color: accent || PAL.head }}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
  const healthColor = (h) => (h >= 80 ? PAL.positive : h >= 50 ? PAL.approaching : PAL.exposed);
  return (
    <div className="space-y-6">
      <div><h2 className="font-display font-extrabold text-2xl text-head">Client Portfolio</h2><p className="text-muted text-sm mt-1">Your book of business — cross-border exposure at a glance. Click a client to open their Monitor.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Clients" value={clients.length} />
        <Kpi label="At risk" value={atRisk} accent={atRisk ? PAL.redText : PAL.greenText} sub="health < 50" />
        <Kpi label="Open critical" value={openCritical} accent={openCritical ? PAL.redText : PAL.greenText} sub="conflicts" />
        <Kpi label="Combined tax" value={fmtUsd(totalTax)} sub="IN + US, all clients" />
        <Kpi label="Residual double tax" value={fmtUsd(totalResidual)} accent={totalResidual ? PAL.redText : PAL.greenText} sub="unrelieved" />
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
                <td className="px-4 py-3"><div className="text-[13px] font-semibold text-head">{c.label.replace(/^🏢\s*/, "")}</div><div className="text-[10px] text-muted truncate max-w-[240px]">{c.story}</div></td>
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
    { name: "Trip Log", kind: "Physical presence / day-count", connected: true, icon: "🧭" },
    { name: "Bank feeds (Plaid)", kind: "FBAR / 8938 balances", connected: true, icon: "🏦" },
    { name: "Payroll · 1099 · AIS", kind: "Income", connected: true, icon: "💵" },
    { name: "Brokerage (US)", kind: "Capital gains / dividends", connected: true, icon: "📈" },
    { name: "MCA / ITR portal", kind: "Indian entity filings", connected: false, icon: "🏛️" },
    { name: "DocuSign", kind: "Engagement & TRC docs", connected: false, icon: "✍️" }
  ];
  return (
    <Card title="Integrations" sub="Connected data sources feed the engine daily">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-line">
            <span className="text-xl">{r.icon}</span>
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
