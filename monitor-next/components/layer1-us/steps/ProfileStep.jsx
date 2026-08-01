"use client";

import { useEffect, useMemo, useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { evaluateResidencyLock } from "@/lib/layer1-us/derive";

// ── styling helpers (matches dark-theme Tailwind conventions — see
// components/Views.jsx) ─────────────────────────────────────────────────────
const card = "rounded-2xl bg-surface border border-line shadow-card p-4";
const nestedCard = "rounded-2xl bg-white/[0.02] border border-line p-4";
const label = "block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5";
const input =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";
const selectCls = input + " appearance-none";

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={"relative inline-flex items-center shrink-0 " + (disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}>
      <input type="checkbox" className="sr-only peer" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brandGreen" />
    </label>
  );
}

function ToggleRow({ title, sub, checked, onChange, disabled }) {
  return (
    <div className={nestedCard + " flex items-center justify-between"}>
      <div className="flex flex-col pr-3">
        <span className="text-xs font-bold text-head">{title}</span>
        {sub && <span className="text-[9px] text-muted mt-0.5">{sub}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}


// evaluateResidencyLock() now lives in lib/layer1-us/derive.js and is
// imported above — store.js's applyDerivations() already calls it after
// every mutation, so us_residency_detail.final_us_residency_status is
// always fresh here without this component needing its own copy.

const LOCK_STYLES = {
  US_CITIZEN: { chip: "bg-brandGreen/10 border-brandGreen/30 text-brandGreen", title: "US Citizen (Worldwide Taxation)" },
  RESIDENT_ALIEN: { chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", title: "Resident Alien" },
  DUAL_STATUS: { chip: "bg-amber-500/10 border-amber-500/30 text-amber-400", title: "Dual-Status Taxpayer" },
  NON_RESIDENT_ALIEN: { chip: "bg-white/5 border-line text-muted", title: "Non-Resident Alien" },
  DOMESTIC_ENTITY: { chip: "bg-brandGreen/10 border-brandGreen/30 text-brandGreen", title: "Domestic Entity (US-incorporated)" },
  FOREIGN_ENTITY: { chip: "bg-white/5 border-line text-muted", title: "Foreign Entity (Non-US incorporated)" },
};

export default function ProfileStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const profile = usState.profile;
  const details = usState.us_residency_detail;

  const selectedType = profile.tax_entity_type || "individual";
  const entityType = selectedType === "llc" ? profile.llc_tax_election || "individual" : selectedType;
  const isIndividual = ["individual", "sole_prop", "farming"].includes(entityType);

  // ── Article 4 tie-breaker wizard — local UI state (transient, mirrors
  // layer1_us.html:1035-1095 / evaluateTieBreaker @ 6767). Only the final
  // winner is persisted, into us_residency_detail.dtaa_treaty_residence.
  const [tbHome, setTbHome] = useState("none");
  const [tbCvi, setTbCvi] = useState("none");
  const [tbAbode, setTbAbode] = useState("none");
  const [tbNationality, setTbNationality] = useState("none");
  const [tieBreakerOpen, setTieBreakerOpen] = useState(false);

  const tieBreaker = useMemo(() => {
    if (tbHome === "india") return { winner: "india", text: "Step 1: Permanent Home is only in India. Tie broken to India." };
    if (tbHome === "us") return { winner: "us", text: "Step 1: Permanent Home is only in the US. Tie broken to United States." };
    if (tbHome === "both" || tbHome === "neither") {
      if (tbCvi === "india") return { winner: "india", text: "Step 2: Centre of Vital Interests is closer to India. Tie broken to India.", showCvi: true };
      if (tbCvi === "us") return { winner: "us", text: "Step 2: Centre of Vital Interests is closer to the US. Tie broken to United States.", showCvi: true };
      if (tbCvi === "tie") {
        if (tbAbode === "india") return { winner: "india", text: "Step 3: Habitual Abode is in India. Tie broken to India.", showCvi: true, showAbode: true };
        if (tbAbode === "us") return { winner: "us", text: "Step 3: Habitual Abode is in the US. Tie broken to United States.", showCvi: true, showAbode: true };
        if (tbAbode === "tie") {
          if (tbNationality === "india") return { winner: "india", text: "Step 4: Legal Nationality is Indian. Tie broken to India.", showCvi: true, showAbode: true, showNat: true };
          if (tbNationality === "us") return { winner: "us", text: "Step 4: Legal Nationality is US. Tie broken to United States.", showCvi: true, showAbode: true, showNat: true };
          if (tbNationality === "tie") return { winner: "none", text: "Step 5: Mutual Agreement Procedure (MAP) required to resolve tie.", showCvi: true, showAbode: true, showNat: true };
          return { winner: "none", text: "", showCvi: true, showAbode: true, showNat: true };
        }
        return { winner: "none", text: "", showCvi: true, showAbode: true };
      }
      return { winner: "none", text: "", showCvi: true };
    }
    return { winner: "none", text: "" };
  }, [tbHome, tbCvi, tbAbode, tbNationality]);

  useEffect(() => {
    if (tieBreaker.winner !== details.dtaa_treaty_residence && (tieBreaker.winner !== "none" || details.dtaa_treaty_residence !== "none")) {
      setField("us_residency_detail.dtaa_treaty_residence", tieBreaker.winner);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieBreaker.winner]);

  // Residency-lock recompute + the NRA filing-status auto-revert both moved
  // to lib/layer1-us/derive.js's applyDerivations(), called centrally by
  // store.js after every mutation (see the ARCHITECTURE FIX note there).
  // us_residency_detail.final_us_residency_status is therefore always
  // current here — no local recompute-and-write-back needed, which also
  // removes the risk this component's own dependency array could miss a
  // field the derivation actually reads (exactly what happened before:
  // `closer_connection_claim` was missing here and silently went stale).
  const computed = useMemo(() => evaluateResidencyLock(usState), [usState]);

  const lock = details.final_us_residency_status || "NON_RESIDENT_ALIEN";
  const lockStyle = LOCK_STYLES[lock] || LOCK_STYLES.NON_RESIDENT_ALIEN;
  const isNra = lock === "NON_RESIDENT_ALIEN";

  // ── NRA filing-status gating (onFilingStatusChange @ layer1_us.html:6652,
  // applyNraFilingStatusGating @ layer1_us.html:9607-9663). Bug fix: this
  // used to check ONLY details.s6013g_joint_election, dropping the original's
  // `election6013g || election6013h` OR — a taxpayer who unlocked MFJ via the
  // §6013(h) election (nra_specific.s6013h_joint_election, set in NraStep)
  // instead of §6013(g) was incorrectly still blocked from selecting MFJ here. ──
  // §877A covered-expatriate test visibility (toggleExitTaxTests @ layer1_us.html:7612)
  const showExitTaxTests = !!(details.has_green_card && details.i407_surrendered_date && (details.green_card_years_held || 0) >= 8);

  // closer-connection-claim eligibility (evaluateUSResidencyLock @ layer1_us.html:9356)
  const closerConnEligible = computed.spt_test_met && (details.us_days_current_year || 0) < 183;

  return (
    <div className={card + " flex flex-col gap-6"}>
      <div>
        <h2 className="text-xl font-display font-bold text-head tracking-wide uppercase">Profile &amp; Residency</h2>
        <p className="text-xs text-muted mt-1">Specify personal details and calendar-year physical presence to resolve the residency lock status.</p>
      </div>

      {/* ── Residency lock status badge ── */}
      <div className={"rounded-2xl border p-5 flex flex-col items-center text-center gap-1 " + lockStyle.chip}>
        <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Residency Lock</span>
        <span className="text-2xl font-display font-black tracking-wide">{lock.replace(/_/g, " ")}</span>
        <span className="text-[10px] opacity-70 mt-1">{lockStyle.title}</span>
      </div>

      {isIndividual ? (
        <>
          {/* Filing status / Taxpayer ID / dependents / spouse-is-US-person /
              Trump Accounts (layer1_us.html:673-772) moved to
              OnboardingStep.jsx — the real source has them on the
              "Financial Life Snapshot" (Onboarding) screen, not here. An
              earlier pass put them on this step instead; corrected during
              the chrome/structure verification pass. */}

          {/* ── US Visa / Immigration Status (layer1_us.html:1128-1141). Bug
              fix: this control and profile.visa_type were entirely absent
              from the port, even though lib/dag/ustax-nodes.js's
              usVisaTypeRaw node reads it to drive Article 21(2) treaty
              eligibility for F-1/J-1 NRAs in nraTaxResult. ── */}
          <div className={nestedCard}>
            <label className={label}>US Visa / Immigration Status</label>
            <select className={selectCls} value={profile.visa_type || "none"}
              onChange={(e) => setField("profile.visa_type", e.target.value)}>
              <option value="none">None / US Citizen / Permanent Resident</option>
              <option value="h1b">H-1B / H-4 (Specialty Occupation)</option>
              <option value="l1">L-1 / L-2 (Intracompany Transferee)</option>
              <option value="f1">F-1 / F-2 (Student)</option>
              <option value="j1">J-1 / J-2 (Exchange Visitor)</option>
              <option value="o1">O-1 / O-2 (Extraordinary Ability)</option>
              <option value="tn">TN / TD (NAFTA Professional)</option>
              <option value="b1b2">B-1 / B-2 (Business/Tourism Visitor)</option>
              <option value="other">Other Non-Immigrant Visa</option>
            </select>
          </div>

          {/* ── Citizenship / green card (layer1_us.html:1126-1179) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleRow title="Are you a US Citizen?" sub="Worldwide taxing rights regardless of stay."
              checked={!!details.is_us_citizen} onChange={(v) => setField("us_residency_detail.is_us_citizen", v)} />
            <ToggleRow title="Hold a US Green Card?" sub="Form I-551 creates tax residency."
              checked={!!details.has_green_card} onChange={(v) => setField("us_residency_detail.has_green_card", v)} />
          </div>

          {details.has_green_card && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>Green Card Grant Date</label>
                <input type="date" className={input} value={details.green_card_grant_date || ""}
                  onChange={(e) => setField("us_residency_detail.green_card_grant_date", e.target.value)} />
              </div>
              <div>
                <label className={label}>Form I-407 Surrender Date (If Expatriated)</label>
                <input type="date" className={input} value={details.i407_surrendered_date || ""}
                  onChange={(e) => setField("us_residency_detail.i407_surrendered_date", e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-red-400 font-semibold mb-1.5">Years Holding GC in last 15 yrs (Exit Tax)</label>
                <input type="text" inputMode="numeric" placeholder="e.g. 8"
                  className={input + " font-mono border-red-500/30"}
                  value={details.green_card_years_held ?? 0}
                  onChange={(e) => setField("us_residency_detail.green_card_years_held", parseInt(e.target.value, 10) || 0)} />
              </div>
            </div>
          )}

          {/* ── §877A covered-expatriate tests (layer1_us.html:1181-1209) ── */}
          {showExitTaxTests && (
            <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4 flex flex-col gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">§877A Covered Expatriate Tests</span>
                <p className="text-[9px] text-muted mt-1 leading-relaxed">A Long-Term Resident (green card held 8+ of the last 15 years) who surrenders it is a &quot;covered expatriate&quot; — subject to §877A mark-to-market exit tax — if ANY ONE of the three tests below is met.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={label}>Net Worth on Expatriation Date (USD)</label>
                  <input type="text" inputMode="numeric" placeholder="e.g. 2500000" className={input + " font-mono"}
                    value={details.expatriation_net_worth_usd || ""}
                    onChange={(e) => setField("us_residency_detail.expatriation_net_worth_usd", parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} />
                  <span className="text-[8px] text-muted block mt-1">Test 1: covered expatriate if ≥ $2,000,000 (fixed, not inflation-adjusted).</span>
                </div>
                <div>
                  <label className={label}>Avg. Annual Net Income Tax, Last 5 Years (USD)</label>
                  <input type="text" inputMode="numeric" placeholder="e.g. 150000" className={input + " font-mono"}
                    value={details.expatriation_avg_net_income_tax_usd || ""}
                    onChange={(e) => setField("us_residency_detail.expatriation_avg_net_income_tax_usd", parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} />
                  <span className="text-[8px] text-muted block mt-1">Test 2: covered expatriate if &gt; $211,000 (2026, inflation-adjusted).</span>
                </div>
              </div>
              <ToggleRow title="Form 8854: Can you certify 5 years of federal tax compliance?"
                sub="Test 3: failure to certify makes you a covered expatriate regardless of net worth or tax liability."
                checked={!!details.form_8854_5yr_compliance_certified}
                onChange={(v) => setField("us_residency_detail.form_8854_5yr_compliance_certified", v)} />
            </div>
          )}

          {/* ── Substantial Presence Test (layer1_us.html:1225-1300) ── */}
          <div className="rounded-2xl bg-white/[0.02] border border-line border-l-2 border-l-brandGreen p-5 flex flex-col gap-4">
            <span className="text-xs font-black uppercase tracking-widest text-brandGreen">Substantial Presence Test (SPT) Stay Tracker</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>Days in US (Current Year)</label>
                <input type="text" inputMode="numeric" placeholder="0" className={input + " font-mono"}
                  value={details.us_days_current_year ?? 0}
                  onChange={(e) => setField("us_residency_detail.us_days_current_year", parseInt(e.target.value, 10) || 0)} />
              </div>
              <div>
                <label className={label}>Days in US (1 Year Prior)</label>
                <input type="text" inputMode="numeric" placeholder="0" className={input + " font-mono"}
                  value={details.us_days_minus_1_year ?? 0}
                  onChange={(e) => setField("us_residency_detail.us_days_minus_1_year", parseInt(e.target.value, 10) || 0)} />
              </div>
              <div>
                <label className={label}>Days in US (2 Years Prior)</label>
                <input type="text" inputMode="numeric" placeholder="0" className={input + " font-mono"}
                  value={details.us_days_minus_2_years ?? 0}
                  onChange={(e) => setField("us_residency_detail.us_days_minus_2_years", parseInt(e.target.value, 10) || 0)} />
              </div>
            </div>

            <div className="p-4 bg-black/20 border border-line rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted">SPT Calculation Formula &amp; Status</span>
                <span className={"text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border " +
                  (computed.spt_test_met ? "bg-brandGreen/20 border-brandGreen/40 text-brandGreen" : "bg-white/5 border-line text-muted")}>
                  {computed.spt_test_met ? "Condition Met (Resident)" : "Condition Not Met (Non-Resident)"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="flex flex-col p-2 bg-white/[0.03] rounded-lg border border-line">
                  <span className="text-[8px] font-bold text-muted uppercase">Current Year (100%)</span>
                  <span className="text-xs font-black text-head font-mono mt-1">{computed.cyDaysCount} days</span>
                </div>
                <div className="flex flex-col p-2 bg-white/[0.03] rounded-lg border border-line">
                  <span className="text-[8px] font-bold text-muted uppercase">1 Yr Prior (1/3)</span>
                  <span className="text-xs font-black text-head font-mono mt-1">{computed.py1DaysCount} days</span>
                </div>
                <div className="flex flex-col p-2 bg-white/[0.03] rounded-lg border border-line">
                  <span className="text-[8px] font-bold text-muted uppercase">2 Yrs Prior (1/6)</span>
                  <span className="text-xs font-black text-head font-mono mt-1">{computed.py2DaysCount} days</span>
                </div>
                <div className="flex flex-col p-2 bg-brandGreen/5 rounded-lg border border-brandGreen/20">
                  <span className="text-[8px] font-black text-brandGreen uppercase">Weighted Total</span>
                  <span className="text-xs font-black text-brandGreen font-mono mt-1">{computed.spt_day_count_weighted.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[9px] text-muted leading-relaxed">
                {details.exempt_individual_status !== "none"
                  ? computed.isExemptCurrentYear
                    ? <>Your physical presence days are excluded from the SPT: <strong>{computed.exemptReason}</strong>. Weighted count is reset to 0.</>
                    : <>Your physical presence days are <strong>INCLUDED</strong> in the SPT: <strong>{computed.exemptReason}</strong>. Weighted stays: <strong>{computed.spt_day_count_weighted.toFixed(2)} days</strong>.</>
                  : computed.spt_test_met
                    ? <>You meet the Substantial Presence Test (Current Year ≥ 31, Weighted ≥ 183 days). Under domestic law, you are a <strong>Resident Alien</strong>.</>
                    : <>You do NOT meet the Substantial Presence Test because {(details.us_days_current_year || 0) < 31 ? "the current year days are less than 31." : "the weighted total is less than 183 days."} Under domestic law, you are a <strong>Non-Resident Alien</strong>.</>}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={label}>Exempt Individual Status (Days don&apos;t count)</label>
                <select className={selectCls} value={details.exempt_individual_status}
                  onChange={(e) => setField("us_residency_detail.exempt_individual_status", e.target.value)}>
                  <option value="none">None (Standard Days Count)</option>
                  <option value="f_student">F Student (5-Year Exemption)</option>
                  <option value="j_scholar">J Scholar/Teacher (2-Year Exemption)</option>
                  <option value="g_diplomat">G Government/Diplomat (A or G Visa)</option>
                  <option value="professional_athlete">Professional Athlete (Charity Event)</option>
                  <option value="medical_condition">Medical Emergency</option>
                  <option value="regular_commuter">Regular Commuter (Canada/Mexico)</option>
                  <option value="in_transit">In Transit (&lt; 24 hours)</option>
                  <option value="crew_member">Crew Member (Foreign Vessel)</option>
                </select>
              </div>
              {closerConnEligible && (
                <div className="flex items-center justify-between p-4 bg-black/20 border border-line rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-head">Closer Connection Claim?</span>
                    <span className="text-[8px] text-muted">Form 8840 (Active if stays &lt; 183 days)</span>
                  </div>
                  <Toggle checked={!!details.closer_connection_claim}
                    onChange={(v) => setField("us_residency_detail.closer_connection_claim", v)} />
                </div>
              )}
            </div>

            {["f_student", "j_scholar"].includes(details.exempt_individual_status) && (
              <div className="p-4 bg-black/20 border border-line rounded-xl flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Year of first entry to US on this visa</label>
                    <input type="text" inputMode="numeric" placeholder="e.g. 2022" className={input + " font-mono"}
                      value={details.exempt_first_year ?? ""}
                      onChange={(e) => setField("us_residency_detail.exempt_first_year", parseInt(e.target.value, 10) || null)} />
                  </div>
                  <div>
                    <label className={label}>Prior years spent in US on this visa</label>
                    <input type="text" inputMode="numeric" placeholder="e.g. 4" className={input + " font-mono"}
                      value={details.exempt_prior_years_count ?? 0}
                      onChange={(e) => setField("us_residency_detail.exempt_prior_years_count", parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
                {details.exempt_individual_status === "f_student" && (
                  <label className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded bg-black/40 border-white/20 text-amber-400 focus:ring-0"
                      checked={!!details.exempt_student_closer_conn_exception}
                      onChange={(e) => setField("us_residency_detail.exempt_student_closer_conn_exception", e.target.checked)} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-amber-400">Extend Student Tax-Exempt Status (Over 5 Years)</span>
                      <span className="text-[8px] text-amber-200/70 leading-relaxed">Must not plan to reside permanently in the US, must have a closer connection to home country, and must file Form 8843.</span>
                    </div>
                  </label>
                )}
                {details.exempt_individual_status === "j_scholar" && (
                  <label className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded bg-black/40 border-white/20 text-amber-400 focus:ring-0"
                      checked={!!details.exempt_scholar_lookback_exception}
                      onChange={(e) => setField("us_residency_detail.exempt_scholar_lookback_exception", e.target.checked)} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-amber-400">Extend Scholar Tax-Exempt Status (Over 2 Years)</span>
                      <span className="text-[8px] text-amber-200/70 leading-relaxed">Qualifies for an exemption extension under lookback rules (e.g. no US tax presence in the last 6 years).</span>
                    </div>
                  </label>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 p-3 bg-black/20 border border-line rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col pr-3">
                    <span className="text-[10px] font-bold text-head">First-Year Choice Election (§7701(b)(4))</span>
                    <span className="text-[8px] text-muted">Arrived mid-year and don&apos;t meet the SPT yet? Elect to pull your residency start date forward — you remain dual-status, not full-year resident.</span>
                  </div>
                  <Toggle checked={!!details.first_year_choice_election}
                    onChange={(v) => {
                      setField("us_residency_detail.first_year_choice_election", v);
                      if (!v) setField("us_residency_detail.first_year_choice_entry_date", null);
                    }} />
                </div>
                {details.first_year_choice_election && (
                  <div className="flex flex-col gap-1 mt-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted">Date you first arrived in the US this year</label>
                    <input type="date" className={input}
                      value={details.first_year_choice_entry_date || ""}
                      onChange={(e) => setField("us_residency_detail.first_year_choice_entry_date", e.target.value || null)} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-black/20 border border-line rounded-xl">
                <div className="flex flex-col pr-3">
                  <span className="text-[10px] font-bold text-head">Non-Resident Spouse Joint Filing Election</span>
                  <span className="text-[8px] text-muted">Elect to treat an NRA spouse as a US Resident to unlock MFJ.</span>
                </div>
                <Toggle checked={!!details.s6013g_joint_election}
                  onChange={(v) => setField("us_residency_detail.s6013g_joint_election", v)} />
              </div>
            </div>

            {details.first_year_choice_election && (
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-[10px] text-blue-100/70 leading-relaxed">
                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-1">First-Year Election Active</span>
                By turning this on, you remain a <strong>dual-status alien</strong> for this year — nonresident (US-source income only) before your entry date, resident (worldwide income) from that date onward. This is a formal IRS election, including losing the standard deduction for the year.
              </div>
            )}
          </div>

          {/* ── DTAA Article 4 tie-breaker (layer1_us.html:1004-1096, evaluateTieBreaker @ 6767) ── */}
          {/* simplified from layer1_us.html:6689-6765 — checkDualResidencyConflict()
              cross-checks a separate India-layer1 localStorage blob to decide when
              to surface this card; that cross-module read is out of scope here, so
              the wizard is offered as an always-available optional expander instead
              of being auto-triggered by a detected India/US dual-residency conflict. */}
          <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-4 flex flex-col gap-3">
            <button type="button" onClick={() => setTieBreakerOpen((o) => !o)} className="flex items-center justify-between text-left">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest font-display">DTAA Article 4 Tie-Breaker (Dual Residency)</span>
                <span className="text-[9px] text-amber-200/60">Only needed if you're also a tax resident of a treaty country (e.g. India) this year.</span>
              </div>
              <span className="text-amber-400 text-xs">{tieBreakerOpen ? "−" : "+"}</span>
            </button>
            {tieBreakerOpen && (
              <div className="flex flex-col gap-3 pt-2 border-t border-amber-500/10">
                <div className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-lg border border-line">
                  <label className="text-[9px] font-bold text-brandGreen uppercase">Step 1: Permanent Home Test</label>
                  <select className={selectCls} value={tbHome} onChange={(e) => setTbHome(e.target.value)}>
                    <option value="none">-- Select --</option>
                    <option value="india">India Only</option>
                    <option value="us">United States Only</option>
                    <option value="both">Both Countries</option>
                    <option value="neither">Neither Country</option>
                  </select>
                </div>
                {tieBreaker.showCvi && (
                  <div className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-lg border border-line">
                    <label className="text-[9px] font-bold text-brandGreen uppercase">Step 2: Centre of Vital Interests</label>
                    <select className={selectCls} value={tbCvi} onChange={(e) => setTbCvi(e.target.value)}>
                      <option value="none">-- Select --</option>
                      <option value="india">Closer to India</option>
                      <option value="us">Closer to United States</option>
                      <option value="tie">Cannot be determined</option>
                    </select>
                  </div>
                )}
                {tieBreaker.showAbode && (
                  <div className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-lg border border-line">
                    <label className="text-[9px] font-bold text-brandGreen uppercase">Step 3: Habitual Abode</label>
                    <select className={selectCls} value={tbAbode} onChange={(e) => setTbAbode(e.target.value)}>
                      <option value="none">-- Select --</option>
                      <option value="india">India</option>
                      <option value="us">United States</option>
                      <option value="tie">Both or Neither</option>
                    </select>
                  </div>
                )}
                {tieBreaker.showNat && (
                  <div className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-lg border border-line">
                    <label className="text-[9px] font-bold text-brandGreen uppercase">Step 4: Nationality</label>
                    <select className={selectCls} value={tbNationality} onChange={(e) => setTbNationality(e.target.value)}>
                      <option value="none">-- Select --</option>
                      <option value="india">Indian Citizen</option>
                      <option value="us">US Citizen</option>
                      <option value="tie">Dual Citizen or Neither</option>
                    </select>
                  </div>
                )}
                {tieBreaker.text && (
                  <div className={"p-3 rounded-xl border font-bold text-[10px] text-center " +
                    (tieBreaker.winner === "india" ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : tieBreaker.winner === "us" ? "border-brandGreen/30 bg-brandGreen/10 text-brandGreen"
                      : "border-line bg-white/[0.03] text-muted")}>
                    {tieBreaker.text}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        // ── Corporate residency determination (layer1_us.html:1100-1124) ──
        <div className={nestedCard + " flex flex-col gap-4 border-l-2 border-l-brandGreen"}>
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-brandGreen">Corporate Residency Determination</span>
            <p className="text-[9px] text-muted mt-1 leading-relaxed">Unlike individuals, corporate tax residency is not based on days spent in the US. It is determined purely by the jurisdiction of incorporation or organization.</p>
          </div>
          <ToggleRow title="Incorporated / Organized in the United States?"
            sub="Yes = Domestic entity. No = Foreign entity with different filing obligations."
            checked={!!profile.incorporated_in_us}
            onChange={(v) => setField("profile.incorporated_in_us", v)} />
          {profile.incorporated_in_us ? (
            <div className="p-3 bg-brandGreen/5 border border-brandGreen/20 rounded-xl">
              <span className="text-[9px] font-black text-brandGreen uppercase tracking-widest">Domestic Entity</span>
              <p className="text-[9px] text-muted mt-1 leading-relaxed">This entity is subject to US tax on its <strong>worldwide income</strong> under the applicable form (1120 / 1120-S / 1065 / 1041).</p>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Foreign Entity</span>
              <p className="text-[9px] text-muted mt-1 leading-relaxed">This entity is only subject to US tax on <strong>US-source income</strong> (ECI / FDAP). Additional foreign reporting may apply.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
