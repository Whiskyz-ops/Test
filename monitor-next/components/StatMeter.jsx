"use client";
import { PAL } from "@/lib/logic";

// Segmented "pill meter" stat card — the reference's Operations / Data-Transfer
// card translated to WISING dark + teal. Driven by a real engine projection or
// residency budget: big value, a circular % badge, and a row of filled/dashed
// capsules. Tone follows the engine's own status (breached / will_breach / ok).
const SEGMENTS = 10;

function toneOf(status) {
  if (status === "breached") return { fill: PAL.exposed, text: PAL.redText, ring: PAL.exposed };
  if (status === "will_breach") return { fill: PAL.approaching, text: PAL.amberText, ring: PAL.approaching };
  return { fill: PAL.accent, text: PAL.greenText, ring: PAL.accent };
}

// Circular progress badge (clamped ring + % label).
function Ring({ pct, color }) {
  const p = Math.max(0, Math.min(1, pct));
  const R = 15, C = 2 * Math.PI * R;
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
      <svg width="40" height="40" className="-rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3.5" />
        <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p)} />
      </svg>
      <span className="absolute text-[9px] font-bold" style={{ color }}>{Math.round(pct * 100)}%</span>
    </span>
  );
}

export default function StatMeter({ icon, label, value, limit, unit = "$", pct = 0, status = "ok", note, highlight = false }) {
  const tone = toneOf(status);
  const filled = status === "breached" ? SEGMENTS : Math.max(0, Math.min(SEGMENTS, Math.round(pct * SEGMENTS)));
  const fmt = (n) => (unit === "$" ? "$" + Math.round(n).toLocaleString("en-US") : Math.round(n).toLocaleString("en-US") + (unit ? " " + unit : ""));
  return (
    <div className="rounded-[26px] p-5 border shadow-card transition-all hover:shadow-cardhover fade-in"
      style={{
        background: highlight ? "linear-gradient(155deg,rgba(45,212,191,0.16),rgba(52,211,153,0.06))" : "#12151f",
        borderColor: highlight ? "rgba(45,212,191,0.32)" : "rgba(255,255,255,0.07)"
      }}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-[15px] border"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>{icon}</span>
        <span className="text-[13px] font-bold text-head flex-1">{label}</span>
        <span className="text-muted/60 text-lg leading-none tracking-tighter select-none">⋯</span>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div className="font-display font-extrabold text-[38px] leading-none text-head tracking-tight">{fmt(value)}</div>
        <div className="text-[12px] text-muted mb-1.5 flex-1">/ {fmt(limit)}</div>
        <Ring pct={pct} color={tone.ring} />
      </div>
      <div className="flex items-center gap-[5px]">
        {Array.from({ length: SEGMENTS }).map((_, i) =>
          i < filled
            ? <span key={i} className="h-8 flex-1 rounded-full" style={{ background: tone.fill, boxShadow: `0 0 10px -2px ${tone.fill}` }} />
            : <span key={i} className="h-8 flex-1 rounded-full border border-dashed" style={{ borderColor: "rgba(255,255,255,0.16)" }} />
        )}
      </div>
      {note && <div className="text-[10.5px] text-muted mt-3 leading-snug">{note}</div>}
    </div>
  );
}
