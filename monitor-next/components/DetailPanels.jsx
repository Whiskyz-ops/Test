"use client";
import { useState } from "react";
import { fmtUsd } from "@/lib/logic";

const SEV = { critical: "#ef4444", warning: "#f59e0b", info: "#06B6D4" };
const fmtInr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

/* Everything the old DTAA Bridge showed, folded into the Monitor:
   Conflicts · FTC reconciliation · Tax computation · Documents · Limits. */
export default function DetailPanels({ result }) {
  const [tab, setTab] = useState("conflicts");
  if (!result) return null;
  const { findings, ftcReport, taxComputation, documents, computed, monitoring } = result;
  const counts = result.summary.counts;
  const reqDocs = documents.filter((d) => d.required).length;

  const TABS = [
    { id: "conflicts", label: "Conflicts & Mismatches", badge: counts.critical + counts.warning },
    { id: "ftc", label: "FTC & Tax", badge: null },
    { id: "documents", label: "Documents", badge: reqDocs },
    { id: "limits", label: "Limits", badge: null }
  ];

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2 text-[13px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors " +
              (tab === t.id ? "border-brandCyan text-white" : "border-transparent text-white/45 hover:text-white/75")}>
            {t.label}{t.badge != null && <span className="ml-1.5 opacity-60">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "conflicts" && <Conflicts findings={findings} />}
      {tab === "ftc" && <FtcAndTax ftcReport={ftcReport} taxComputation={taxComputation} fxRate={result.model.meta.fxRate} />}
      {tab === "documents" && <Documents documents={documents} />}
      {tab === "limits" && <Limits limits={computed.limits} residency={monitoring && monitoring.residency} />}
    </section>
  );
}

function Conflicts({ findings }) {
  const [open, setOpen] = useState({});
  if (!findings.length) return <Empty>No conflicts detected.</Empty>;
  return (
    <div className="space-y-3">
      {findings.map((f, i) => {
        const isOpen = open[f.id] ?? (f.severity === "critical" && i < 2);
        return (
          <div key={f.id} onClick={() => setOpen((s) => ({ ...s, [f.id]: !isOpen }))}
            className="rounded-xl bg-panel border border-line p-4 cursor-pointer hover:border-white/20"
            style={{ borderLeft: `3px solid ${SEV[f.severity]}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="font-bold text-sm flex items-center gap-2">
                <span className="text-white/30 text-xs" style={{ transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>▸</span>
                {f.title}
              </div>
              {f.amountUsd > 0 && <div className="font-mono text-sm whitespace-nowrap" style={{ color: SEV[f.severity] }}>{fmtUsd(f.amountUsd)}</div>}
            </div>
            {isOpen && (
              <div className="mt-2">
                <div className="text-[12px] text-white/55 leading-relaxed">{f.detail}</div>
                <div className="text-[12px] text-white/80 mt-2 leading-relaxed"><span className="text-emerald-400 font-bold">▸ Action:</span> {f.recommendation}</div>
                {f.refs && f.refs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {f.refs.map((r, j) => <span key={j} className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white/5 text-white/45">{r}</span>)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FtcAndTax({ ftcReport, taxComputation, fxRate }) {
  const net = ftcReport.headlineNetDoubleTaxUsd;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* FTC */}
      <div className="rounded-2xl bg-panel border border-line p-5">
        <h3 className="font-display font-bold text-lg mb-3">FTC Reconciliation</h3>
        <div className={"rounded-xl p-3 mb-4 border " + (net > 0 ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10")}>
          <div className="text-[10px] uppercase tracking-widest text-white/50">Net unrelieved double tax</div>
          <div className="font-display font-extrabold text-2xl" style={{ color: net > 0 ? "#ef4444" : "#10b981" }}>{fmtUsd(net)}</div>
        </div>
        <FtcBlock block={ftcReport.direction_us_claims_india} />
        <div className="border-t border-line my-3" />
        <FtcBlock block={ftcReport.direction_india_relief} />
      </div>
      {/* Tax computation */}
      <div className="rounded-2xl bg-panel border border-line p-5">
        <h3 className="font-display font-bold text-lg mb-3">Tax Computation</h3>
        <TaxBlock block={taxComputation.india} isInr accent="#D4AF37" fxRate={fxRate} />
        <div className="border-t border-line my-3" />
        <TaxBlock block={taxComputation.us} accent="#06B6D4" fxRate={fxRate} />
      </div>
    </div>
  );
}
function FtcBlock({ block }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-bold text-white/70 mb-2">{block.title}</div>
      <div className="space-y-1">
        {block.rows.map((r, i) => {
          const cls = r.warn ? "text-red-400" : r.emphasis ? "text-emerald-400" : "text-white/60";
          return (
            <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis || r.warn ? "font-bold" : "")}>
              <span className={r.emphasis || r.warn ? cls : "text-white/55"}>{r.label}</span>
              <span className={"font-mono " + cls}>{fmtUsd(r.usd)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function TaxBlock({ block, isInr, accent, fxRate }) {
  return (
    <div className="rounded-xl p-3" style={{ background: accent + "0d", border: `1px solid ${accent}26` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold text-white/80">{block.title}</div>
        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-white/8 text-white/45">eff {Math.round(block.effectiveRate * 100)}%</span>
      </div>
      <div className="space-y-1">
        {block.rows.map((r, i) => {
          const val = isInr ? r.inr : r.usd;
          let disp = isInr ? fmtInr(Math.abs(val)) : fmtUsd(Math.abs(val));
          if (val < 0) disp = "(" + disp + ")";
          return (
            <div key={i} className={"flex justify-between text-[12px] " + (r.emphasis ? "border-t border-white/10 pt-1.5 mt-1 font-bold text-white" : "")}>
              <span className={r.emphasis ? "text-white" : "text-white/55"}>{r.label}</span>
              <span className={"font-mono " + (r.emphasis ? "text-white" : "text-white/60")}>{disp}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-white/35 mt-2">≈ {fmtUsd(block.totalUsd)} at {fxRate} INR/USD</div>
    </div>
  );
}

function Documents({ documents }) {
  const jColor = { US: "#06B6D4", IN: "#D4AF37" };
  const docs = documents.slice().sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {docs.map((d) => (
        <div key={d.id} className={"flex items-start gap-3 p-3 rounded-lg " + (d.required ? "bg-panel border border-line" : "opacity-40")}>
          <span className="text-[9px] font-black px-2 py-0.5 rounded mt-0.5" style={{ background: jColor[d.jurisdiction] + "22", color: jColor[d.jurisdiction] }}>{d.jurisdiction}</span>
          <div className="flex-1">
            <div className="text-[12px] font-bold flex items-center gap-2">{d.name}
              {d.required ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Required</span>
                : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/8 text-white/40">N/A</span>}
            </div>
            <div className="text-[11px] text-white/45">{d.desc}</div>
            {d.required && <div className="text-[11px] text-white/55 mt-0.5">↳ {d.why}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Limits({ limits, residency }) {
  const color = { ok: "#10B981", approaching: "#f59e0b", breached: "#ef4444" };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-panel border border-line p-5">
        <h3 className="font-display font-bold text-lg mb-3">Limit Monitoring</h3>
        <div className="space-y-4">
          {limits.map((g) => {
            const pct = Math.min(100, Math.round(g.pct * 100));
            return (
              <div key={g.id}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white/70 font-semibold">{g.label}{g.status === "breached" && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">BREACHED</span>}</span>
                  <span className="font-mono" style={{ color: color[g.status] }}>{Math.round(g.pct * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: color[g.status] }} /></div>
                <div className="flex justify-between text-[10px] text-white/40 mt-1"><span>{fmtUsd(g.value)}</span><span>limit {fmtUsd(g.limit)}</span></div>
              </div>
            );
          })}
        </div>
      </div>
      {residency && residency.length > 0 && (
        <div className="rounded-2xl bg-panel border border-line p-5">
          <h3 className="font-display font-bold text-lg mb-3">Residency Day-Counters</h3>
          <div className="space-y-4">
            {residency.map((r, i) => {
              const stC = { resident: "#ef4444", will_flip: "#f59e0b", safe: "#10B981" };
              const pct = Math.min(100, Math.round(r.pct * 100));
              return (
                <div key={i}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="font-semibold">{r.flag} {r.country} <span className="text-white/40 text-[11px]">· {r.test}</span></span>
                    <span className="font-mono" style={{ color: stC[r.status] }}>{r.days}/{r.threshold}d</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: stC[r.status] }} /></div>
                  <div className="text-[11px] text-white/50 mt-0.5">{r.headline} · {r.dateLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }) { return <div className="text-center text-white/40 text-sm py-10">{children}</div>; }
