"use client";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { evaluateResidencyLock } from "@/lib/layer1-us/derive";

// Ported from layer1_us.html:3962-4024 ("RIGHT FIXED PANEL: RESIDENCY
// CERTIFICATION & SUMMARY STATUS"). This <aside> sits as a sibling of the
// wizard-panels <section> in the source, not nested inside any one step's
// panel — it's visible on every step, always showing the CURRENT derived
// state. An earlier pass of this port had no equivalent at all; this
// component reads directly off the store (which now keeps
// us_residency_detail.final_us_residency_status fresh via store.js's
// applyDerivations() after every mutation — see lib/layer1-us/derive.js),
// so it's correctly live regardless of which step is active, matching the
// source.
//
// DELIBERATE DEVIATION (explicit product request): the "Try an Example
// Profile" persona-prefill panel (mirrored layer1_us.html:20175+'s
// prefillPersona()) was removed at the user's request — not a fidelity
// bug, an intentional product decision to drop the demo/example-profile
// affordance from this panel.

const LOCK_STYLES = {
  US_CITIZEN: { chip: "text-brandGreen", title: "US Citizen (Worldwide Taxation)" },
  RESIDENT_ALIEN: { chip: "text-emerald-400", title: "Resident Alien" },
  DUAL_STATUS: { chip: "text-amber-400", title: "Dual-Status Taxpayer" },
  NON_RESIDENT_ALIEN: { chip: "text-accent2", title: "Non-Resident Alien" },
  DOMESTIC_ENTITY: { chip: "text-brandGreen", title: "Domestic Entity (US-incorporated)" },
  FOREIGN_ENTITY: { chip: "text-accent2", title: "Foreign Entity (Non-US incorporated)" },
};

// BUG FIX (found by the step-by-step map audit): this badge previously
// showed abbreviations ("RA"/"NRA"/"DUAL") for the individual-filer lock
// values. The source's real behavior (layer1_us.html:9483-9488) is
// `sidebarLock.textContent = lock.replace(/_/g, ' ')` — a mechanical
// underscore-to-space swap on the raw enum value, i.e. "RESIDENT ALIEN" /
// "NON RESIDENT ALIEN" / "DUAL STATUS" / "US CITIZEN", never a shortened
// abbreviation. The entity-filer lock values (DOMESTIC_ENTITY/
// FOREIGN_ENTITY) are the one genuine exception — the source's separate
// corp-entity branch (layer1_us.html:9266) hardcodes just "DOMESTIC"/
// "FOREIGN" there, not the full replace() output — so those 2 stay as
// they were (already correct).
const LOCK_SHORT = {
  US_CITIZEN: "US CITIZEN",
  RESIDENT_ALIEN: "RESIDENT ALIEN",
  DUAL_STATUS: "DUAL STATUS",
  NON_RESIDENT_ALIEN: "NON RESIDENT ALIEN",
  DOMESTIC_ENTITY: "DOMESTIC",
  FOREIGN_ENTITY: "FOREIGN",
};


export default function RightPanel() {
  const usState = useUsLayer1Store((s) => s.usState);
  const details = usState.us_residency_detail;

  const lock = details.final_us_residency_status || "NON_RESIDENT_ALIEN";
  const style = LOCK_STYLES[lock] || LOCK_STYLES.NON_RESIDENT_ALIEN;
  const computed = evaluateResidencyLock(usState);

  const ruleMatched =
    lock === "US_CITIZEN"
      ? "US Citizen (worldwide taxation regardless of residence)"
      : lock === "RESIDENT_ALIEN" && details.has_green_card
        ? "Green Card Test met"
        : lock === "RESIDENT_ALIEN"
          ? "Substantial Presence Test met"
          : lock === "DUAL_STATUS"
            ? "Dual-status year (residency start/end mid-year)"
            : lock === "DOMESTIC_ENTITY"
              ? "Incorporated / organized in the United States"
              : lock === "FOREIGN_ENTITY"
                ? "Not incorporated / organized in the United States"
                : "Non-Resident Alien (SPT not met)";

  const scope =
    lock === "US_CITIZEN" || lock === "RESIDENT_ALIEN" || lock === "DOMESTIC_ENTITY"
      ? "Worldwide Income & Assets (Standard deductions)."
      : lock === "DUAL_STATUS"
        ? "Worldwide income for the resident portion of the year; US-source only for the nonresident portion."
        : "US-Source Income Only (ECI/FDAP split).";

  // BUG FIX (Tier 0 #10): this used to label amt_inputs.amti_usd
  // (Alternative Minimum Taxable Income — AGI minus deductions plus AMT
  // preference addbacks, see AmtNiitStep.jsx's own `amti` derivation) as
  // "Estimated AGI." Those are two different, usually quite different,
  // numbers — not a stale-value issue, a permanently wrong one. There is
  // no derived AGI field anywhere in schema.js; niit_inputs.
  // modified_agi_usd (manually entered, deliberately left editable per
  // AmtNiitStep.jsx's own comment — confirmed zero DAG consumers either
  // way) is the closest real approximation available, so that's what's
  // shown here now, labeled for what it actually is.
  const metrics = [
    { label: "Est. AGI / MAGI (manual entry)", value: usState.niit_inputs.modified_agi_usd },
    { label: "AMT Tentative", value: usState.amt_inputs.tentative_minimum_tax_usd },
    { label: "NIIT Due (3.8%)", value: usState.niit_inputs.niit_due_usd },
    { label: "FBAR Peak Balance", value: usState.fbar_aggregate_peak_usd },
  ];
  const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
      <div className="rounded-2xl bg-surface border border-line p-5 flex flex-col gap-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted">Your Current Residency Status</span>
        <div className="flex flex-col items-center justify-center p-6 bg-accent2/5 border border-accent2/20 rounded-2xl text-center">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Derived status</span>
          <span className={"text-3xl font-black font-display tracking-wider mt-1 " + style.chip}>
            {LOCK_SHORT[lock] || lock}
          </span>
          <span className={"text-[8px] font-black uppercase bg-white/10 border border-white/20 px-2 py-0.5 rounded-full mt-2 tracking-widest " + style.chip}>
            Lock set
          </span>
        </div>
        <div className="text-[10px] text-body space-y-2 border-t border-line pt-3">
          <div>
            <span className="font-bold block uppercase tracking-wide text-[8px] text-muted">Rule Matched:</span>
            <span className={"font-medium " + style.chip}>{ruleMatched}</span>
          </div>
          <div>
            <span className="font-bold block uppercase tracking-wide text-[8px] text-muted">What gets taxed in US?</span>
            <span className="text-body">{scope}</span>
          </div>
          {usState.state_residency.primary_state_of_residence && (
            <div className="border-t border-line pt-3 mt-2">
              <span className="font-bold block uppercase tracking-wide text-[8px] text-muted mb-1">
                State Residency Status:
              </span>
              <div className="text-body">
                {usState.state_residency.primary_state_of_residence} —{" "}
                {usState.state_residency.moved_states_this_year ? "Part-Year Resident" : "Full-Year Resident"}
              </div>
            </div>
          )}
          {computed.spt_test_met !== undefined && (
            <div className="border-t border-line pt-3 mt-2">
              <span className="font-bold block uppercase tracking-wide text-[8px] text-muted">SPT Weighted Days:</span>
              <span className="font-mono text-body">{computed.spt_day_count_weighted ?? 0}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line p-5 flex flex-col gap-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted">Derived Metrics Analyzer</span>
        <div className="space-y-2">
          {metrics.map((m) => (
            <div key={m.label} className="flex justify-between text-xs border-b border-line pb-1">
              <span className="text-muted">{m.label}</span>
              <span className="font-mono text-head">{fmt(m.value)}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-muted/70 leading-relaxed">
          AMT/NIIT/FBAR figures are populated once you visit the AMT & NIIT / Foreign Assets steps — unlike
          residency status, these aren&apos;t yet centrally re-derived on every keystroke everywhere (see
          docs/LAYER1_US_REACT_PORT_GAPS.md).
        </p>
      </div>
    </aside>
  );
}
