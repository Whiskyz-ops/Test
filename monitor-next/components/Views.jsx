"use client";
import { useState } from "react";
import { fmtUsd } from "@/lib/logic";

const SEV = { critical: "#ef4444", warning: "#f59e0b", info: "#06B6D4" };
const fmtInr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const Card = ({ title, sub, children, right }) => (
  <section className="rounded-2xl bg-panel border border-line p-5">
    {title && (
      <div className="flex items-start justify-between mb-3">
        <div><h3 className="font-display font-bold text-lg">{title}</h3>{sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}</div>
        {right}
      </div>
    )}
    {children}
  </section>
);
const Empty = ({ children }) => <div className="text-center text-white/40 text-sm py-10">{children}</div>;

/* ============================ CONFLICTS (Monitor home) ============================ */
export function ConflictsPanel({ findings }) {
  const [open, setOpen] = useState(null);        // one expanded at a time; collapsed by default
  const [filter, setFilter] = useState("all");
  if (!findings || !findings.length) return <Empty>No conflicts detected for this taxpayer.</Empty>;

  const counts = { all: findings.length, critical: 0, warning: 0, info: 0 };
  findings.forEach((f) => counts[f.severity]++);
  const shown = findings.filter((f) => filter === "all" || f.severity === filter);
  const chips = [["all", "All"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]];

  return (
    <div>
      {/* filter chips — scannable summary */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {chips.map(([id, label]) => {
          const active = filter === id;
          const c = id === "all" ? "#fff" : SEV[id];
          return (
            <button key={id} onClick={() => setFilter(id)}
              className={"px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors " + (active ? "bg-white/10 border-white/20 text-white" : "border-line text-white/50 hover:text-white/80")}>
              {id !== "all" && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: c }} />}
              {label} <span className="opacity-60">{counts[id]}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-white/35">{shown.length} shown · tap a row for detail &amp; action</span>
      </div>

      <div className="space-y-1.5">
        {shown.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="rounded-lg bg-panel border border-line overflow-hidden" style={{ borderLeft: `3px solid ${SEV[f.severity]}` }}>
              <button onClick={() => setOpen(isOpen ? null : f.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV[f.severity] }} />
                <span className="font-semibold text-[13px] flex-1 truncate">{f.title}</span>
                {f.amountUsd > 0 && <span className="font-mono text-[12px] whitespace-nowrap" style={{ color: SEV[f.severity] }}>{fmtUsd(f.amountUsd)}</span>}
                <span className="text-white/25 text-xs" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>▸</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-0">
                  <div className="text-[12px] text-white/55 leading-relaxed">{f.detail}</div>
                  <div className="text-[12px] text-white/80 mt-2 leading-relaxed"><span className="text-emerald-400 font-bold">▸ Action:</span> {f.recommendation}</div>
                  {f.refs && f.refs.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2.5">{f.refs.map((r, j) => <span key={j} className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/5 text-white/45">{r}</span>)}</div>}
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
  const stCol = { resident: "#ef4444", will_flip: "#f59e0b", safe: "#10B981" };
  const Flag = ({ jur, label, s }) => (
    <div className="rounded-xl bg-white/[0.03] border border-line p-4">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-display font-bold text-lg mt-1">{s.status || "—"}</div>
      <div className="text-[11px] text-white/50 mt-1">{s.worldwide ? "Worldwide income taxed" : "Source-income only"}{s.isCitizen ? " · citizen" : ""}</div>
    </div>
  );
  const treatyRow = (label, ok, okText, badText) => (
    <div className="flex items-center justify-between py-1.5 border-b border-line/60 text-[12px]">
      <span className="text-white/60">{label}</span>
      <span className={ok ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{ok ? okText : badText}</span>
    </div>
  );
  return (
    <div className="space-y-6">
      {r.dualResident && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-300 font-semibold">
          ⚠ Dual tax residency — resolve the India-US DTAA Article 4 tie-breaker.
        </div>
      )}
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
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="font-semibold">{c.flag} {c.country} <span className="text-white/40 text-[11px]">· {c.test}</span></span>
                  <span className="font-mono" style={{ color: stCol[c.status] }}>{c.days}/{c.threshold}d</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: stCol[c.status] }} /></div>
                <div className="text-[11px] text-white/50 mt-0.5">{c.headline} · {c.dateLabel}</div>
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
          <div className="text-[11px] text-white/40 mt-3">Treaty residence claimed: <span className="text-white/70 font-mono">{t.treatyResidence !== "none" ? t.treatyResidence : (t.usTreatyResidence !== "none" ? t.usTreatyResidence : "none")}</span></div>
        </Card>
        <Card title="Residency & Treaty Conflicts">
          <ConflictsPanel findings={result.findings.filter((f) => f.category === "residency" || f.category === "treaty")} />
        </Card>
      </div>
    </div>
  );
}

/* ============================ FILINGS (calendar + FTC + tax) ============================ */
export function FilingsView({ result }) {
  if (!result) return <Empty>Load a client to see filings.</Empty>;
  const cal = result.monitoring ? result.monitoring.calendar.all.slice().sort((a, b) => a.date - b.date) : [];
  const upcoming = cal.filter((x) => x.status !== "passed");
  const passed = cal.filter((x) => x.status === "passed").slice(-3);
  const jColor = { US: "#06B6D4", IN: "#D4AF37" };
  return (
    <div className="space-y-6">
      <Card title="Compliance Calendar" sub="Filing & payment deadlines with countdowns">
        <div className="space-y-1.5">
          {upcoming.concat(passed).map((x, i) => {
            const isPast = x.status === "passed";
            const due = isPast ? Math.abs(x.daysUntil) + "d ago" : "in " + x.daysUntil + "d";
            const dueColor = x.status === "due_soon" ? "#f59e0b" : (isPast ? "#6b7280" : "#10B981");
            return (
              <div key={i} className={"flex items-center gap-3 p-2 rounded-lg " + (isPast ? "opacity-40" : "bg-white/[0.03]")}>
                <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: jColor[x.jur] + "22", color: jColor[x.jur] }}>{x.jur}</span>
                <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold text-white/85 truncate">{x.name}</div><div className="text-[10px] text-white/40">{x.dateLabel} · {x.cat}</div></div>
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
    </div>
  );
}
function FtcCard({ ftcReport }) {
  const net = ftcReport.headlineNetDoubleTaxUsd;
  const Block = ({ block }) => (
    <div className="mb-2"><div className="text-[11px] font-bold text-white/70 mb-2">{block.title}</div>
      <div className="space-y-1">{block.rows.map((r, i) => {
        const cls = r.warn ? "text-red-400" : r.emphasis ? "text-emerald-400" : "text-white/60";
        return <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis || r.warn ? "font-bold" : "")}><span className={r.emphasis || r.warn ? cls : "text-white/55"}>{r.label}</span><span className={"font-mono " + cls}>{fmtUsd(r.usd)}</span></div>;
      })}</div></div>
  );
  return (
    <Card title="FTC Reconciliation">
      <div className={"rounded-xl p-3 mb-4 border " + (net > 0 ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10")}>
        <div className="text-[10px] uppercase tracking-widest text-white/50">Net unrelieved double tax</div>
        <div className="font-display font-extrabold text-2xl" style={{ color: net > 0 ? "#ef4444" : "#10b981" }}>{fmtUsd(net)}</div>
      </div>
      <Block block={ftcReport.direction_us_claims_india} />
      <div className="border-t border-line my-3" />
      <Block block={ftcReport.direction_india_relief} />
    </Card>
  );
}
function TaxCard({ taxComputation, fxRate }) {
  const Block = ({ block, isInr, accent }) => (
    <div className="rounded-xl p-3" style={{ background: accent + "0d", border: `1px solid ${accent}26` }}>
      <div className="flex items-center justify-between mb-2"><div className="text-[12px] font-bold text-white/80">{block.title}</div><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-white/8 text-white/45">eff {Math.round(block.effectiveRate * 100)}%</span></div>
      <div className="space-y-1">{block.rows.map((r, i) => {
        const val = isInr ? r.inr : r.usd; let disp = isInr ? fmtInr(Math.abs(val)) : fmtUsd(Math.abs(val)); if (val < 0) disp = "(" + disp + ")";
        return <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis ? "border-t border-white/10 pt-1.5 mt-1 font-bold text-white" : "")}><span className={r.emphasis ? "text-white" : "text-white/55"}>{r.label}</span><span className={"font-mono " + (r.emphasis ? "text-white" : "text-white/60")}>{disp}</span></div>;
      })}</div>
      <div className="text-[10px] text-white/35 mt-2">≈ {fmtUsd(block.totalUsd)} at {fxRate} INR/USD</div>
    </div>
  );
  return (
    <Card title="Tax Computation" sub="Planning-grade, from Layer 1">
      <Block block={taxComputation.india} isInr accent="#D4AF37" />
      <div className="h-3" />
      <Block block={taxComputation.us} accent="#06B6D4" />
    </Card>
  );
}

/* ============================ DOCUMENTS ============================ */
export function DocumentsView({ result }) {
  if (!result) return <Empty>Load a client to see documents.</Empty>;
  const jColor = { US: "#06B6D4", IN: "#D4AF37" };
  const docs = result.documents.slice().sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  const req = docs.filter((d) => d.required).length;
  return (
    <Card title="Documents to File" sub={req + " required · triggered by this taxpayer's cross-border facts"}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {docs.map((d) => (
          <div key={d.id} className={"flex items-start gap-3 p-3 rounded-lg " + (d.required ? "bg-white/[0.03] border border-line" : "opacity-40")}>
            <span className="text-[9px] font-black px-2 py-0.5 rounded mt-0.5" style={{ background: jColor[d.jurisdiction] + "22", color: jColor[d.jurisdiction] }}>{d.jurisdiction}</span>
            <div className="flex-1">
              <div className="text-[12px] font-bold flex items-center gap-2">{d.name}{d.required ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Required</span> : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/8 text-white/40">N/A</span>}</div>
              <div className="text-[11px] text-white/45">{d.desc}</div>
              {d.required && <div className="text-[11px] text-white/55 mt-0.5">↳ {d.why}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ ACCOUNTS (limits + foreign accounts) ============================ */
export function AccountsView({ result }) {
  if (!result) return <Empty>Load a client to see accounts.</Empty>;
  const color = { ok: "#10B981", approaching: "#f59e0b", breached: "#ef4444" };
  const accts = result.model.accounts.accounts || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Reporting Limits" sub="FBAR · FATCA 8938 · LRS · FEIE">
        <div className="space-y-4">
          {result.computed.limits.map((g) => {
            const pct = Math.min(100, Math.round(g.pct * 100));
            return (
              <div key={g.id}>
                <div className="flex justify-between text-[11px] mb-1"><span className="text-white/70 font-semibold">{g.label}{g.status === "breached" && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">BREACHED</span>}</span><span className="font-mono" style={{ color: color[g.status] }}>{Math.round(g.pct * 100)}%</span></div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: color[g.status] }} /></div>
                <div className="flex justify-between text-[10px] text-white/40 mt-1"><span>{fmtUsd(g.value)}</span><span>limit {fmtUsd(g.limit)}</span></div>
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
                <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold truncate">{a.bank}</div><div className="text-[10px] text-white/40">{a.type} · {a.country}</div></div>
                <div className="text-[12px] font-mono text-white/80">{fmtUsd(a.peak.usd)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================ CLIENTS (portfolio landing) ============================ */
export function ClientsView({ clients, activeId, onPick }) {
  if (!clients || !clients.length) return <Empty>Loading clients…</Empty>;
  // Portfolio rollups across the whole book of business.
  const totalTax = clients.reduce((a, c) => a + (c.combinedTaxUsd || 0), 0);
  const totalResidual = clients.reduce((a, c) => a + (c.netDoubleTaxUsd || 0), 0);
  const openCritical = clients.reduce((a, c) => a + (c.critical || 0), 0);
  const atRisk = clients.filter((c) => c.healthScore < 50).length;
  const sorted = clients.slice().sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)); // most-at-risk first

  const Kpi = ({ label, value, accent, sub }) => (
    <div className="rounded-2xl bg-panel border border-line p-4">
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{label}</div>
      <div className="font-display font-extrabold text-2xl" style={{ color: accent || "#fff" }}>{value}</div>
      {sub && <div className="text-[11px] text-white/45 mt-1">{sub}</div>}
    </div>
  );
  const healthColor = (h) => (h >= 80 ? "#10B981" : h >= 50 ? "#f59e0b" : "#ef4444");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-extrabold text-2xl">Client Portfolio</h2>
        <p className="text-white/45 text-sm mt-1">Your book of business — cross-border exposure at a glance. Click a client to open their Monitor.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Clients" value={clients.length} />
        <Kpi label="At risk" value={atRisk} accent={atRisk ? "#ef4444" : "#10B981"} sub="health < 50" />
        <Kpi label="Open critical" value={openCritical} accent={openCritical ? "#ef4444" : "#10B981"} sub="conflicts" />
        <Kpi label="Combined tax" value={fmtUsd(totalTax)} sub="IN + US, all clients" />
        <Kpi label="Residual double tax" value={fmtUsd(totalResidual)} accent={totalResidual ? "#ef4444" : "#10B981"} sub="unrelieved" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full">
          <thead className="bg-white/[0.02]">
            <tr>
              {["Client", "Type", "Residency", "Combined tax", "Residual", "Conflicts", "Health", "Next filing", ""].map((h, i) => (
                <th key={i} className={"px-4 py-2.5 text-[10px] uppercase tracking-widest text-white/40 font-bold " + (["Combined tax", "Residual"].includes(h) ? "text-right" : "text-left")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isActive = activeId === c.id;
              return (
                <tr key={c.id} onClick={() => onPick(c.id)} className={"border-t border-line cursor-pointer hover:bg-white/[0.03] " + (isActive ? "bg-brandCyan/5" : "")}>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold">{c.label.replace(/^🏢\s*/, "")}</div>
                    <div className="text-[10px] text-white/40 truncate max-w-[240px]">{c.story}</div>
                  </td>
                  <td className="px-4 py-3"><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: c.isBusiness ? "rgba(168,85,247,.16)" : "rgba(6,182,212,.14)", color: c.isBusiness ? "#d8b4fe" : "#67e8f9" }}>{c.isBusiness ? "Business" : "Individual"}</span></td>
                  <td className="px-4 py-3 text-[12px] text-white/70">{(c.indiaStatus || "—")}<span className="text-white/30"> / </span>{(c.usStatus ? c.usStatus.replace(/_/g, " ") : "—")}{c.dualResident && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400">DUAL</span>}</td>
                  <td className="px-4 py-3 text-right font-mono text-[12px]">{fmtUsd(c.combinedTaxUsd)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ color: c.netDoubleTaxUsd > 0 ? "#ef4444" : "#9ca3af" }}>{fmtUsd(c.netDoubleTaxUsd)}</td>
                  <td className="px-4 py-3 text-[12px]"><span className="text-red-400 font-bold">{c.critical}</span><span className="text-white/30"> · </span><span className="text-amber-400">{c.warning}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(4, c.healthScore) + "%", background: healthColor(c.healthScore) }} /></div>
                      <span className="text-[11px] font-mono" style={{ color: healthColor(c.healthScore) }}>{c.healthScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-white/60">{c.nextDeadline ? c.nextDeadline.dateLabel + " · in " + c.nextDeadline.daysUntil + "d" : "—"}</td>
                  <td className="px-4 py-3 text-right"><span className="text-[11px] font-bold text-brandCyan">Open →</span></td>
                </tr>
              );
            })}
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
            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold">{r.name}</div><div className="text-[11px] text-white/45">{r.kind}</div></div>
            {r.connected
              ? <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected</span>
              : <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 text-white/50 border border-line">Connect</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
