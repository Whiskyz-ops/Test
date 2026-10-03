"use client";
/* SEPP tracker (§72(t)(2)(A)(iv) series of substantially equal periodic
 * payments): a one-line-per-series strip on the Monitor screen and a full
 * card per series in Holdings. Data: result.model.assets.seppTracker, built
 * by the engine (prototypes/graph-pilot/retirement-dist.js seppTracker /
 * seppAnalysis) — every figure here is the engine's; this file only lays it
 * out. Shown only when the client has a SEPP. */
import { CalendarClock } from "lucide-react";
import { fmtUsd, PAL } from "@/lib/logic";

const METHOD = { rmd: "RMD method", amortization: "Fixed amortization", annuitization: "Fixed annuitization" };
const TABLE = { single: "Single Life", uniform: "Uniform Lifetime", joint: "Joint and Last Survivor" };
const STATUS = {
  on_track: { label: "On track", fg: PAL.greenText, bg: "rgba(52,211,153,0.12)", bd: "rgba(52,211,153,0.35)" },
  off_schedule: { label: "Off schedule", fg: PAL.amberText, bg: "rgba(245,166,35,0.12)", bd: "rgba(245,166,35,0.4)" },
  broken: { label: "Broken", fg: PAL.redText, bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.4)" },
  period_ended: { label: "Period ended", fg: PAL.blueText, bg: "rgba(96,165,250,0.12)", bd: "rgba(96,165,250,0.35)" },
  unchecked: { label: "Not checked", fg: PAL.muted, bg: "rgba(255,255,255,0.05)", bd: "rgba(255,255,255,0.12)" }
};
const usd2 = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return d + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + y;
};
// Whole years and months from `from` to `to` (YYYY-MM-DD).
function countdown(from, to) {
  if (!from || !to) return null;
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return null;
  const y = Math.floor(months / 12), mo = months % 12;
  return [y ? y + (y === 1 ? " yr" : " yrs") : null, mo ? mo + " mo" : null].filter(Boolean).join(" ") || "under 1 month";
}
const who = (s) => s.payerName || "SEPP series";

export function SeppBadge({ status }) {
  const st = STATUS[status] || STATUS.unchecked;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap"
    style={{ color: st.fg, background: st.bg, borderColor: st.bd }}>{st.label}</span>;
}

// What the status means right now, in one phrase.
function statusLine(s) {
  if (s.status === "broken") {
    return s.brokenThisYear
      ? "changed " + fmtDate(s.changeDate) + " — recapture " + fmtUsd(s.priorPaymentsUsd * 0.1) + " + " + fmtUsd(s.interestUsd) + " interest"
      : "broken in " + s.changeYear + " — no exception for this year's payments";
  }
  if (s.status === "period_ended") return "required period ended " + fmtDate(s.periodEnd) + " — free to change";
  if (s.status === "unchecked") return "inputs missing to work out the required amount";
  if (s.over) return "over the required amount";
  if (s.shortSoFar) return fmtUsd(s.remainingUsd) + " still to take by 31 Dec";
  return "on schedule";
}
function safeLine(s) {
  if (!s.periodEnd || s.status === "broken" || s.status === "period_ended") return null;
  const c = countdown(s.asOf, s.periodEnd);
  return "safe to change after " + fmtDate(s.periodEnd) + (c ? " (" + c + ")" : "");
}

/* Monitor screen: one line per series, under the Household card. */
export function SeppStrip({ tracker, onOpen }) {
  if (!tracker || !tracker.series || !tracker.series.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={14} strokeWidth={2} style={{ color: PAL.accent2 }} />
        <span className="text-[11px] uppercase tracking-widest font-bold text-muted">SEPP series · {tracker.taxYear}</span>
      </div>
      <div className="space-y-1.5">
        {tracker.series.map((s, i) => (
          <button key={i} type="button" onClick={onOpen} title="Open the full SEPP card in Holdings"
            className="w-full text-left flex flex-wrap items-center gap-x-2 gap-y-1 p-2.5 rounded-lg bg-white/[0.03] border border-line hover:bg-white/[0.06]">
            <span className="text-[12px] font-semibold text-head">{who(s)}</span>
            <span className="text-[11px] text-muted">· {METHOD[s.calc.method] || "Method not set"}</span>
            {s.requiredUsd != null && <span className="text-[11px] text-body">· {fmtUsd(s.requiredUsd)} required · {fmtUsd(s.paidUsd)} paid</span>}
            <SeppBadge status={s.status} />
            <span className="text-[11px] text-body">{statusLine(s)}</span>
            {safeLine(s) && <span className="text-[11px] text-muted">· {safeLine(s)}</span>}
            <span className="ml-auto text-[11px] font-semibold" style={{ color: PAL.blueText }}>View →</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const Row = ({ label, value, strong }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 border-b border-line last:border-0">
    <span className="text-[12px] text-muted">{label}</span>
    <span className={"text-[12px] font-mono text-right " + (strong ? "text-head font-bold" : "text-body")}>{value}</span>
  </div>
);
const Section = ({ title, children }) => (
  <div className="rounded-xl bg-white/[0.03] border border-line p-3">
    <div className="text-[10px] uppercase tracking-widest font-bold text-muted mb-1.5">{title}</div>
    {children}
  </div>
);

// How the required amount was worked out (same wording as the engine's alert).
function workingLine(s) {
  const c = s.calc;
  if (c.annualUsd == null) return "Can't be worked out yet — missing: " + c.missing.join(", ").replace(/_/g, " ");
  const ages = "age " + c.age + (c.beneficiaryAge != null ? " and " + c.beneficiaryAge : "");
  if (c.factorKind === "life_expectancy") return fmtUsd(s.balanceUsd) + " ÷ " + c.factor.toFixed(1) + " (" + TABLE[c.table] + ", " + ages + ") = " + usd2(c.annualUsd);
  if (c.factorKind === "amortization") return fmtUsd(s.startBalanceUsd) + " amortized over " + c.lifeExpectancy.toFixed(1) + " years at " + c.rate.pct + "% (factor " + c.factor.toFixed(4) + ", " + TABLE[c.table] + ", " + ages + ") = " + usd2(c.annualUsd);
  return fmtUsd(s.startBalanceUsd) + " ÷ annuity factor " + c.factor.toFixed(4) + " (IRS mortality rates, " + ages + ", " + c.rate.pct + "%) = " + usd2(c.annualUsd);
}

function SeriesCard({ s, taxYear }) {
  const c = s.calc, recapTotal = s.brokenThisYear ? s.priorPaymentsUsd * 0.1 + (s.interestUsd || 0) : 0;
  return (
    <section className="rounded-[26px] bg-surface border border-line shadow-card p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-9 h-9 rounded-2xl flex items-center justify-center border shrink-0" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>
          <CalendarClock size={16} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-lg text-head">SEPP — {who(s)}</h3>
          <p className="text-[11px] text-muted mt-0.5">Substantially equal periodic payments (§72(t)(2)(A)(iv), Notice 2022-6) · {statusLine(s)}</p>
        </div>
        <SeppBadge status={s.status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section title="Setup">
          <Row label="Method" value={(METHOD[c.method] || "—") + (c.switchedToRmd ? " → switched once to RMD" : "")} />
          <Row label="Life-expectancy table" value={TABLE[c.table] || "—"} />
          <Row label="Started" value={fmtDate(s.startDate)} />
          {c.usesRmd ? <Row label="Balance, 31 Dec last year" value={s.balanceUsd ? fmtUsd(s.balanceUsd) : "—"} />
            : <Row label="Starting balance" value={s.startBalanceUsd ? fmtUsd(s.startBalanceUsd) : "—"} />}
          {!c.usesRmd && <Row label="Interest rate" value={c.rate ? c.rate.pct + "% (limit " + c.rate.limitPct + "%)" : "—"} />}
          <p className="text-[11px] text-body mt-2">{workingLine(s)}</p>
        </Section>
        <Section title={"This year (" + taxYear + ") · as of " + fmtDate(s.asOf)}>
          <Row label="Required for the year" value={s.requiredUsd != null ? usd2(s.requiredUsd) : "—"} />
          <Row label="Paid so far" value={usd2(s.paidUsd)} strong />
          {s.requiredUsd != null && (s.over
            ? <Row label="Over the required amount by" value={usd2(s.paidUsd - s.requiredUsd)} />
            : <Row label="Still to take by 31 Dec" value={usd2(s.remainingUsd)} />)}
          {s.payments && s.payments.length > 0 && (
            <div className="mt-2 space-y-0.5">{s.payments.map((p, i) => (
              <div key={i} className="flex justify-between text-[11px] text-muted"><span>{fmtDate(p.date)}</span><span className="font-mono">{usd2(p.amountUsd)}</span></div>
            ))}</div>
          )}
        </Section>
        <Section title="Required period (§72(t)(4))">
          <Row label="Five years from the first payment" value={fmtDate(s.fiveYearDate)} />
          <Row label="Age 59½" value={fmtDate(s.age59HalfDate)} />
          <Row label="Series must hold until (the later)" value={fmtDate(s.periodEnd)} strong />
          {safeLine(s) && <p className="text-[11px] mt-2" style={{ color: PAL.blueText }}>{safeLine(s)[0].toUpperCase() + safeLine(s).slice(1)}</p>}
          {s.status !== "broken" && s.status !== "period_ended" && (
            <p className="text-[11px] text-muted mt-1">Until then, any extra withdrawal, a different amount, a rollover or transfer out, or stopping early ends the series and recaptures the 10% on every payment so far, plus interest.</p>
          )}
        </Section>
        <Section title={"History" + (s.historySource === "method" ? " (earlier years at the method's amount)" : "")}>
          {(!s.history || s.history.length === 0) ? <p className="text-[11px] text-muted">No years on file.</p> : (
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted"><th className="text-left font-semibold py-1">Year</th><th className="text-right font-semibold">Paid</th>
                {s.brokenThisYear && <><th className="text-right font-semibold">10%</th><th className="text-right font-semibold">Interest</th></>}</tr></thead>
              <tbody>{s.history.map((h, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 text-body">{h.year}{h.current ? " (so far)" : ""}</td>
                  <td className="text-right font-mono text-body">{usd2(h.amountUsd)}</td>
                  {s.brokenThisYear && <><td className="text-right font-mono text-body">{h.recaptureUsd != null ? usd2(h.recaptureUsd) : "—"}</td>
                    <td className="text-right font-mono text-body">{h.interestUsd != null ? usd2(h.interestUsd) : "—"}</td></>}
                </tr>
              ))}</tbody>
            </table>
          )}
          {s.brokenThisYear && (
            <p className="text-[11px] mt-2" style={{ color: PAL.redText }}>
              Recapture {usd2(s.priorPaymentsUsd * 0.1)} + interest {usd2(s.interestUsd || 0)} = {usd2(recapTotal)} on Form 5329 line 4
              {s.interestTo ? " (interest to " + fmtDate(s.interestTo) + ")" : ""}; this year's payments lose the exception too.
            </p>
          )}
        </Section>
      </div>
    </section>
  );
}

/* Holdings: the full card, one per series. */
export function SeppCards({ tracker }) {
  if (!tracker || !tracker.series || !tracker.series.length) return null;
  return <div id="sepp-tracker" className="space-y-4">{tracker.series.map((s, i) => <SeriesCard key={i} s={s} taxYear={tracker.taxYear} />)}</div>;
}
