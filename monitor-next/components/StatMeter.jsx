"use client";
import { PAL } from "@/lib/logic";

// Segmented "pill meter" stat card — WISING brand (black card, or an emerald-lit
// featured card when highlighted). Big Manrope value, a circular % badge, a row
// of filled/dashed capsules, and — when the engine projects a year-end figure —
// a dashed "projected at current pace" tick (planning-grade, clearly labelled;
// the filled capsules are the real current value, the tick is the estimate).
const SEGMENTS = 10;

function toneOf(status) {
  if (status === "breached") return { fill: PAL.exposed, text: PAL.redText, ring: PAL.exposed };
  if (status === "will_breach") return { fill: PAL.approaching, text: PAL.amberText, ring: PAL.approaching };
  return { fill: PAL.accent, text: PAL.accent, ring: PAL.accent };
}

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

export default function StatMeter({ icon, label, value, limit, unit = "$", pct = 0, status = "ok", note, highlight = false, projPct, projLabel }) {
  const tone = toneOf(status);
  const filled = status === "breached" ? SEGMENTS : Math.max(0, Math.min(SEGMENTS, Math.round(pct * SEGMENTS)));
  const fmt = (n) => (unit === "$" ? "$" + Math.round(n).toLocaleString("en-US") : Math.round(n).toLocaleString("en-US") + (unit ? " " + unit : ""));
  const numColor = highlight && status === "ok" ? PAL.accent : PAL.head;
  const showProj = typeof projPct === "number" && projPct > 0 && status !== "breached";
  const projLeft = Math.min(100, Math.max(0, projPct * 100));
  return (
    <div className="rounded-[26px] p-5 border shadow-card transition-all hover:shadow-cardhover fade-in"
      style={{
        background: highlight ? "linear-gradient(155deg,rgba(52,211,153,0.16),rgba(96,165,250,0.05))" : "#161616",
        borderColor: highlight ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.08)"
      }}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-[15px] border"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>{icon}</span>
        <span className="text-[13px] font-bold flex-1 text-head">{label}</span>
        <span className="text-lg leading-none tracking-tighter select-none text-muted">⋯</span>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div className="font-display font-extrabold text-[38px] leading-none tracking-tight" style={{ color: numColor }}>{fmt(value)}</div>
        <div className="text-[12px] mb-2 flex-1 text-muted">/ {fmt(limit)}</div>
        <Ring pct={pct} color={tone.ring} />
      </div>
      <div className="relative">
        <div className="flex items-center gap-[5px]">
          {Array.from({ length: SEGMENTS }).map((_, i) =>
            i < filled
              ? <span key={i} className="h-8 flex-1 rounded-full" style={{ background: tone.fill, boxShadow: `0 0 10px -2px ${tone.fill}` }} />
              : <span key={i} className="h-8 flex-1 rounded-full border border-dashed" style={{ borderColor: "rgba(255,255,255,0.16)" }} />
          )}
        </div>
        {showProj && (
          <span className="absolute -top-1 bottom-[-1px] w-0 border-l-2 border-dashed pointer-events-none"
            style={{ left: `calc(${projLeft}% - 1px)`, borderColor: PAL.approaching }} title="projected at current pace" />
        )}
      </div>
      {showProj && projLabel && <div className="text-[10px] mt-2 font-semibold" style={{ color: PAL.amberText }}>◆ {projLabel}</div>}
      {note && <div className="text-[10.5px] mt-2 leading-snug text-muted">{note}</div>}
    </div>
  );
}
