"use client";
import { useState } from "react";
import { PAL, fmtUsd } from "@/lib/logic";

// The reference "Statistics" chart — floating capsules — translated to WISING and
// bound to REAL data: the cross-basis reconciliation (same income head computed
// under India's Income-tax Act vs the US IRC). Two validated series:
//   India basis = #0d9488 · US basis = #3b82f6  (CVD ΔE 62.9, all checks pass)
// Identity is never colour-alone: fixed left/right position per group, a legend,
// hover values, and a table view all carry it.
const S_IN = PAL.seriesIN, S_US = PAL.seriesUS;

function Capsule({ h, color, dim, dot }) {
  if (h <= 0) return <div className="w-6 rounded-full border border-dashed self-end" style={{ height: 26, borderColor: "rgba(255,255,255,0.16)" }} />;
  return (
    <div className="relative w-6 rounded-full self-end" style={{ height: h, background: color, opacity: dim ? 0.42 : 1, boxShadow: dim ? "none" : `0 0 12px -3px ${color}` }}>
      {dot && <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-2.5 h-2.5 rounded-full bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }} />}
    </div>
  );
}

export default function CapsuleChart({ rows = [] }) {
  const [hover, setHover] = useState(-1);
  const [asTable, setAsTable] = useState(false);
  const data = rows.filter((r) => (r.indiaLawUsd || 0) > 0 || (r.usLawUsd || 0) > 0);
  if (!data.length) return null;
  const max = Math.max(...data.map((r) => Math.max(r.indiaLawUsd || 0, r.usLawUsd || 0)));
  const PLOT = 210;
  const maxIdx = data.reduce((mi, r, i) => (Math.max(r.indiaLawUsd || 0, r.usLawUsd || 0) > Math.max(data[mi].indiaLawUsd || 0, data[mi].usLawUsd || 0) ? i : mi), 0);
  const gl = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="rounded-[26px] p-5 border border-line shadow-card" style={{ background: "#0f1220" }}>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-[15px] border" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>📊</span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-head">Cross-basis by income head</div>
          <div className="text-[11px] text-muted">Same income under each country's own code — overlap is what FTC / §90 relieves</div>
        </div>
        <div className="flex items-center gap-3">
          <Legend color={S_IN} label="India basis" />
          <Legend color={S_US} label="US basis" />
          <button onClick={() => setAsTable((v) => !v)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.05] border border-line text-muted hover:text-head hover:border-accent/40">
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-[12px]">
            <thead><tr className="text-[10px] uppercase tracking-wider text-muted border-b border-line">
              <th className="text-left py-2 font-bold">Income head</th><th className="text-right py-2 font-bold" style={{ color: S_IN }}>India basis</th><th className="text-right py-2 font-bold" style={{ color: S_US }}>US basis</th><th className="text-right py-2 font-bold" style={{ color: PAL.redText }}>Double-taxed</th>
            </tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 text-body">{r.label || r.head}</td>
                  <td className="py-2 text-right font-mono text-head">{fmtUsd(r.indiaLawUsd || 0)}</td>
                  <td className="py-2 text-right font-mono text-head">{fmtUsd(r.usLawUsd || 0)}</td>
                  <td className="py-2 text-right font-mono" style={{ color: r.doublyTaxed ? PAL.redText : PAL.muted }}>{r.doublyTaxed ? fmtUsd(r.overlapUsd || 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2 mt-5" onMouseLeave={() => setHover(-1)}>
          {/* y axis */}
          <div className="relative shrink-0 w-10 text-right" style={{ height: PLOT }}>
            {gl.map((g) => (
              <span key={g} className="absolute right-0 text-[9px] text-muted/70 -translate-y-1/2" style={{ top: PLOT * (1 - g) }}>{fmtUsd(max * g).replace("$", "$")}</span>
            ))}
          </div>
          {/* plot */}
          <div className="relative flex-1 min-w-0">
            {gl.map((g) => <div key={g} className="absolute left-0 right-0 border-t border-white/[0.05]" style={{ top: PLOT * (1 - g) }} />)}
            <div className="relative flex items-stretch justify-between" style={{ height: PLOT }}>
              {data.map((r, i) => {
                const hIN = (r.indiaLawUsd || 0) / max * (PLOT - 14);
                const hUS = (r.usLawUsd || 0) / max * (PLOT - 14);
                const active = hover === i, showTag = active || (hover === -1 && i === maxIdx);
                return (
                  <div key={i} className="relative flex-1 flex flex-col justify-end items-center" onMouseEnter={() => setHover(i)}>
                    <div className="flex items-end justify-center gap-1.5 w-full" style={{ height: PLOT }}>
                      <Capsule h={hIN} color={S_IN} dim={hover !== -1 && !active} dot />
                      <Capsule h={hUS} color={S_US} dim={hover !== -1 && !active} dot />
                    </div>
                    {showTag && (
                      <div className="absolute -top-1 z-10 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-cardhover" style={{ background: "#04060c", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <div className="text-head mb-0.5">{r.label || r.head}</div>
                        <div style={{ color: S_IN }}>IN {fmtUsd(r.indiaLawUsd || 0)}</div>
                        <div style={{ color: S_US }}>US {fmtUsd(r.usLawUsd || 0)}</div>
                        {r.doublyTaxed && <div style={{ color: PAL.redText }}>Double-taxed {fmtUsd(r.overlapUsd || 0)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* x labels */}
            <div className="flex items-start justify-between mt-2">
              {data.map((r, i) => (
                <div key={i} className="flex-1 text-center px-0.5">
                  <div className={"text-[10px] leading-tight " + (hover === i ? "text-head font-semibold" : "text-muted")}>{(r.label || r.head).split(" / ")[0]}</div>
                  {r.doublyTaxed && <span className="inline-block mt-1 w-1.5 h-1.5 rounded-full" style={{ background: PAL.exposed }} title="doubly taxed" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="text-[10px] text-muted mt-3">Red dot = income taxed under both codes (relieved by FTC / §90). Full reconciliation in <span className="text-body font-semibold">Filings</span>.</div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-body">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
