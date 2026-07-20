/* ============================================================================
 * Shadow-mode status pill for the utility bar. Reads the persisted shadow log
 * (lib/shadow.js) and shows, at a glance, whether the DAG silently agreed with
 * the engine on the profile currently loaded — the in-app face of the
 * production differential check. Click to expand the last run's timing and,
 * if any, the recorded divergences.
 *
 * `run` is the latest event record from runShadow() (or null before the first
 * deferred run completes); `log` is the rolling {runs, clean, events} summary.
 * ==========================================================================*/
"use client";
import { useState } from "react";
import { PAL } from "@/lib/logic";

export default function ShadowBadge({ run, log, onClear }) {
  const [open, setOpen] = useState(false);
  if (!run && (!log || !log.runs)) {
    return (
      <span className="font-semibold px-2 py-0.5 rounded-full border" style={{ color: PAL.muted, borderColor: "currentColor", opacity: 0.5 }}>
        ◐ Shadow…
      </span>
    );
  }

  const events = (log && log.events) || [];
  const lastOk = run ? run.ok : (log.lastRun && log.lastRun.ok);
  // A divergence logged earlier this session stays surfaced until the log is
  // cleared — a subsequent clean profile must not quietly hide it. Green only
  // when the latest run matched AND nothing is on the divergence log.
  const ok = lastOk && events.length === 0;
  const style = ok
    ? { color: PAL.greenText, borderColor: PAL.positive + "55", background: PAL.positive + "18" }
    : { color: PAL.redText, borderColor: PAL.exposed + "66", background: PAL.exposed + "22" };
  const label = ok
    ? "◉ Shadow ✓"
    : events.length > 0
      ? "◉ Shadow " + events.length + "⚠"
      : "◉ Shadow " + (run ? run.divergenceCount : (log.lastRun ? log.lastRun.divergenceCount : 0)) + "⚠";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Shadow mode: on every profile the Monitor loads, the DAG runs silently alongside the engine and the full product surface is deep-compared. Green = the DAG-backed Monitor would render identically. A warning count is the number of distinct divergences logged this session (persists until cleared)."
        className="font-semibold px-2 py-0.5 rounded-full border transition-colors"
        style={style}
      >
        {label}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 right-0 w-[420px] max-w-[90vw] rounded-xl border p-3 text-[11px] leading-relaxed shadow-2xl"
          style={{ background: "#0d0d0d", borderColor: PAL.faint + "88", color: PAL.body }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-head">DAG shadow vs. engine</span>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-head">✕</button>
          </div>

          {run && (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
              <span>last: <b style={{ color: ok ? PAL.greenText : PAL.redText }}>{ok ? "identical" : count + " divergence" + (count === 1 ? "" : "s")}</b></span>
              <span>source: <b className="text-body">{run.source}</b></span>
              <span>engine {run.engineMs}ms · DAG {run.dagMs}ms</span>
            </div>
          )}
          {log && log.runs != null && (
            <div className="mb-2 text-faint">
              session: {log.clean}/{log.runs} runs identical · {events.length} distinct divergence signature{events.length === 1 ? "" : "s"} logged
            </div>
          )}

          {run && !run.ok && run.divergences && run.divergences.length > 0 && (
            <div className="mb-2">
              <div className="font-semibold text-redText mb-1">This run</div>
              <ul className="space-y-0.5 max-h-40 overflow-auto font-mono">
                {run.divergences.map((d, i) => (
                  <li key={i} className="break-words">
                    <span className="text-amberText">{d.path}</span>: eng=<span className="text-body">{fmt(d.engine)}</span> dag=<span className="text-body">{fmt(d.dag)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {events.length > 0 && (
            <div className="mb-2">
              <div className="font-semibold text-muted mb-1">Logged this session</div>
              <ul className="space-y-1 max-h-48 overflow-auto">
                {events.slice(0, 12).map((e, i) => (
                  <li key={i} className="border-t pt-1" style={{ borderColor: PAL.faint + "33" }}>
                    <div className="text-faint">{new Date(e.ts).toLocaleTimeString()} · {e.source} · {e.divergenceCount} field{e.divergenceCount === 1 ? "" : "s"}</div>
                    <div className="font-mono text-[10px] text-body break-words">{e.divergences.slice(0, 3).map((d) => d.path).join(", ")}{e.divergences.length > 3 ? " …" : ""}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ok && events.length === 0 && (
            <div className="text-greenText">No divergences recorded this session — the DAG has matched the engine on every profile loaded.</div>
          )}

          <div className="mt-2 pt-2 border-t flex items-center justify-between" style={{ borderColor: PAL.faint + "33" }}>
            <span className="text-faint">persisted to localStorage · survives reloads</span>
            {onClear && <button onClick={onClear} className="text-muted hover:text-redText font-semibold">Clear log</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(v) {
  if (typeof v === "number") return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(v);
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 37) + "…" : v;
  return String(v);
}
