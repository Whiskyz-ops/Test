"use client";
import { PAL } from "@/lib/logic";

// Live what-if controls — regime, FX rate, FEIE — that re-run the DAG
// instantly (docs/DAG_MIGRATION_TRACKER.md's FX threading + the plain
// tax_regime/claims_feie input reads every DAG node already had). Only
// meaningful in DAG mode: the legacy hand-written engine (engine/*.js) has
// no override plumbing and is out of scope for this feature, so the bar
// disables itself (with an explanatory title) when the Engine/DAG pill is
// set to "Engine".
export default function WhatIfBar({ regime, onRegimeChange, fxRate, onFxRateChange, feieClaimed, onFeieChange, active, onReset, disabled }) {
  const btn = (isActive) => ({
    color: isActive ? "#04120f" : PAL.body,
    background: isActive ? "linear-gradient(135deg,#34d399,#60a5fa)" : "transparent",
    borderColor: isActive ? "transparent" : "currentColor"
  });

  return (
    <div
      className="mb-6 rounded-2xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-3"
      style={{ borderColor: active ? PAL.accent + "55" : "rgba(255,255,255,0.08)", background: active ? PAL.accent + "0d" : "transparent", opacity: disabled ? 0.45 : 1 }}
      title={disabled ? "What-if controls need DAG mode — switch the ⚙ Engine/DAG pill to DAG to use them." : undefined}
    >
      <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: active ? PAL.greenText : PAL.muted }}>
        What if…
      </span>

      {/* India tax regime */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted">Regime</span>
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
          {["NEW", "OLD"].map((r) => (
            <button
              key={r}
              disabled={disabled}
              onClick={() => onRegimeChange(r)}
              className="px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed"
              style={btn(regime === r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* FX rate slider */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted">FX ₹/$</span>
        <input
          type="range" min="70" max="100" step="0.5" value={fxRate}
          disabled={disabled}
          onChange={(e) => onFxRateChange(Number(e.target.value))}
          className="w-28 accent-emerald-400 disabled:cursor-not-allowed"
        />
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: PAL.head, minWidth: "3.2em" }}>
          ₹{fxRate.toFixed(1)}
        </span>
      </div>

      {/* FEIE claim toggle */}
      <label className="flex items-center gap-2 cursor-pointer" style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
        <span className="text-[12px] text-muted">Claim FEIE</span>
        <input
          type="checkbox" checked={!!feieClaimed} disabled={disabled}
          onChange={(e) => onFeieChange(e.target.checked)}
          className="w-4 h-4 accent-emerald-400 disabled:cursor-not-allowed"
        />
      </label>

      <button
        onClick={onReset}
        disabled={disabled || !active}
        className="ml-auto text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: PAL.body, borderColor: "currentColor" }}
      >
        ↺ Reset
      </button>
    </div>
  );
}
