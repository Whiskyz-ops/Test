"use client";

import { useEffect, useMemo } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, fmtUsd } from "./_ui";

// Source: layer1_us.html panel-step-amt-niit (~line 3557) + recalculateDerivedFields()
// (~line 11288-11500). All fields map to usState.amt_inputs / usState.niit_inputs.
//
// BUG FIX (was: every AMT/NIIT number rendered as a freely-editable NumberInput,
// only recomputed when a manual "Recalculate (simplified)" button was clicked):
// in the ground truth, updateStateField() calls recalculateDerivedFields() on
// EVERY keystroke anywhere in the whole wizard (layer1_us.html:7567-7578), and
// the AMT/NIIT panel itself only has TWO real <input> fields —
// private_activity_bond_interest_usd and minimum_tax_credit_carryforward_usd.
// Everything else in that panel (lbl-amt-iso-pref, lbl-amt-salt-add,
// lbl-amt-regtax, lbl-amt-amti, lbl-amt-due, lbl-niit-magi, lbl-niit-thresh,
// lbl-niit-invest, lbl-niit-due) is a `<strong>`/`<span>` — a read-only
// derived display, never a form control. Rendering them as editable inputs
// let a user type over a computed tax number and have it silently stick
// (never recalculated unless they happened to hit the button), which is
// exactly the kind of value the crossborder engine downstream should not
// trust. Fixed here: those fields are read-only displays that recompute
// live via useEffect, matching the "always derived" behavior of the source.
//
// FLAGGED, not fixed: `niit_inputs.modified_agi_usd` (MAGI) is the one
// exception — in the vanilla app it's populated by calculateEstimatedAgi(),
// a large cross-step function (~11186) that sums income/deduction fields
// from a dozen other steps. That function isn't ported, and this step's
// scope doesn't include the other steps' data plumbing needed to compute a
// real AGI here. Left as a directly-editable input (as before) rather than
// silently defaulting/overwriting it — matches the task's fallback
// instruction ("at minimum leave it editable, don't silently overwrite").
//
// FLAGGED, not fixed (architecture): the React port renders one active step
// component at a time (see app/layer1-us/page.jsx's STEP_COMPONENTS switch),
// unlike the vanilla single-page/hidden-panels app where every panel's JS
// keeps running against a single shared usState. So this step's live
// recompute only runs while the user is actually on this step — e.g. an ISO
// exercise added on the Equity step won't retroactively update the AMT
// numbers shown here until this step is (re)mounted. A true fix needs a
// store-level subscriber outside any single step file, which is out of
// scope for a per-step-file fix.
export default function AmtNiitStep() {
  const { usState, setField } = useUsLayer1Store();
  const amt = usState.amt_inputs;
  const niit = usState.niit_inputs;
  const setAmt = (key) => (val) => setField(`amt_inputs.${key}`, val);
  const setNiit = (key) => (val) => setField(`niit_inputs.${key}`, val);

  const filingStatus = usState.profile.filing_status;
  const isMfj = filingStatus === "mfj";

  const ded = usState.itemized_deductions_and_credits;
  const isoExercises = usState.equity_compensation.iso_exercises || [];
  const src = usState.income_us_source;
  const fsrc = usState.income_foreign_source;

  const isoPrefSum = useMemo(
    () => isoExercises.reduce((sum, ex) => sum + (ex.amt_preference_spread_usd || 0), 0),
    [isoExercises]
  );
  const saltAddback = Math.min(ded.state_and_local_taxes_paid_usd || 0, 40400); // OBBBA SALT cap
  const privateBond = amt.private_activity_bond_interest_usd || 0;

  const standardDeduction = isMfj ? 30000 : 15000;
  const mortgageInterest = ded.mortgage_interest_paid_usd || 0;
  const charity = ded.charitable_contributions_cash_usd || 0;
  const itemizedVal = mortgageInterest + charity + saltAddback;
  const useMode = ded.use_standard_or_itemized;
  const deductionsVal =
    useMode === "itemized" ? itemizedVal : useMode === "standard" ? standardDeduction : Math.max(standardDeduction, itemizedVal);

  // No full AGI computation available in this step's scope (see FLAGGED note
  // above) — approximate via the directly-entered MAGI on the NIIT side,
  // matching the previous port's fallback.
  const agi = niit.modified_agi_usd || 0;
  const estimatedRegTax = Math.max(0, agi - deductionsVal) * 0.22;
  const amti = Math.max(0, agi - (deductionsVal > standardDeduction ? deductionsVal - saltAddback : 0) + isoPrefSum + privateBond);

  const exemptionBase = isMfj ? 133000 : 85000;
  const phaseoutStart = isMfj ? 1140000 : 570000;
  const exemption = amti > phaseoutStart ? Math.max(0, exemptionBase - (amti - phaseoutStart) * 0.25) : exemptionBase;
  const tmt = Math.max(0, amti - exemption) * 0.26;
  const amtDue = Math.max(0, tmt - estimatedRegTax);

  const niitThreshold = isMfj ? 250000 : filingStatus === "mfs" ? 125000 : 200000;
  const nii =
    (src.interest_us_source_usd || 0) +
    (src.ordinary_dividends_us_source_usd || 0) +
    (src.stcg_us_source_usd || 0) +
    (src.ltcg_us_source_usd || 0) +
    (src.rental_income_us_source_usd || 0) +
    (fsrc.foreign_interest_usd || 0) +
    (fsrc.foreign_dividends_usd || 0) +
    (fsrc.foreign_stcg_usd || 0) +
    (fsrc.foreign_ltcg_usd || 0) +
    (fsrc.foreign_rental_income_usd || 0);
  const niitDue = Math.max(0, Math.min(nii, agi - niitThreshold) * 0.038);

  // Persist the derived values into usState so downstream steps / the
  // exported schema JSON see up-to-date numbers, without ever accepting
  // direct user edits to them (mirrors recalculateDerivedFields() always
  // winning over any prior value).
  useEffect(() => {
    if (isoPrefSum !== amt.iso_preference_total_usd) setField("amt_inputs.iso_preference_total_usd", isoPrefSum);
    if (saltAddback !== amt.salt_addback_usd) setField("amt_inputs.salt_addback_usd", saltAddback);
    if (amti !== amt.amti_usd) setField("amt_inputs.amti_usd", amti);
    if (exemption !== amt.amt_exemption_usd) setField("amt_inputs.amt_exemption_usd", exemption);
    if (tmt !== amt.tentative_minimum_tax_usd) setField("amt_inputs.tentative_minimum_tax_usd", tmt);
    if (amtDue !== amt.amt_due_usd) setField("amt_inputs.amt_due_usd", amtDue);
    if (niitThreshold !== niit.niit_threshold_usd) setField("niit_inputs.niit_threshold_usd", niitThreshold);
    if (nii !== niit.net_investment_income_usd) setField("niit_inputs.net_investment_income_usd", nii);
    if (niitDue !== niit.niit_due_usd) setField("niit_inputs.niit_due_usd", niitDue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoPrefSum, saltAddback, amti, exemption, tmt, amtDue, niitThreshold, nii, niitDue]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">AMT & NIIT</h2>
        <p className="text-[11px] text-muted mt-1">
          Alternative Minimum Tax (AMT) preference rules and Net Investment Income Tax (§1411 NIIT) — derived
          automatically from your other entries.
        </p>
      </div>

      <Card title="AMT Preference Adjustments">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadOnlyStat label="ISO Spread Preference (USD)" hint="Derived — sum of AMT preference spreads from Equity Compensation" value={fmtUsd(isoPrefSum)} />
          <ReadOnlyStat label="SALT Addback (USD)" hint="Derived — capped at OBBBA $40,400" value={fmtUsd(saltAddback)} />
          <Field label="Private Activity Bond Interest (USD)">
            <NumberInput
              value={amt.private_activity_bond_interest_usd}
              onChange={setAmt("private_activity_bond_interest_usd")}
            />
          </Field>
          <Field label="Minimum Tax Credit Carryforward (USD)" hint="From prior years">
            <NumberInput
              value={amt.minimum_tax_credit_carryforward_usd}
              onChange={setAmt("minimum_tax_credit_carryforward_usd")}
            />
          </Field>
          <ReadOnlyStat label="AMT Exemption (USD)" hint="Derived" value={fmtUsd(exemption)} />
          <ReadOnlyStat label="Alternative Minimum Taxable Income — AMTI (USD)" hint="Derived" value={fmtUsd(amti)} />
          <ReadOnlyStat label="Estimated Regular Tax (USD)" hint="Derived — not persisted to schema, display only" value={fmtUsd(estimatedRegTax)} />
          <ReadOnlyStat label="Tentative Minimum Tax (USD)" hint="Derived" value={fmtUsd(tmt)} />
        </div>
        <div className="p-3 bg-brandGreen/5 border border-brandGreen/20 rounded-xl flex justify-between items-center text-xs font-mono">
          <span className="text-muted">AMT Owed</span>
          <span className="text-lg font-black text-brandGreen">{fmtUsd(amtDue)}</span>
        </div>
      </Card>

      <Card title="Net Investment Income Tax (§1411 NIIT)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Modified AGI — MAGI (USD)" hint="Full cross-step AGI derivation not ported — enter directly">
            <NumberInput value={niit.modified_agi_usd} onChange={setNiit("modified_agi_usd")} />
          </Field>
          <ReadOnlyStat label="NIIT Filing Threshold (USD)" hint="Derived from filing status: 200K single/HoH, 250K MFJ, 125K MFS" value={fmtUsd(niitThreshold)} />
          <ReadOnlyStat label="Net Investment Income (USD)" hint="Derived — dividends + interest + passive CG + rental" value={fmtUsd(nii)} />
        </div>
        <div className="p-3 bg-brandGreen/5 border border-brandGreen/20 rounded-xl flex justify-between items-center text-xs font-mono">
          <span className="text-muted">Applicable NIIT rate: 3.8% · NIIT Owed</span>
          <span className="text-lg font-black text-brandGreen">{fmtUsd(niitDue)}</span>
        </div>
      </Card>
    </div>
  );
}

function ReadOnlyStat({ label, hint, value }) {
  return (
    <Field label={label} hint={hint}>
      <div className="rounded-lg bg-white/[0.02] border border-line px-3 py-2 text-sm text-head font-mono opacity-80 cursor-not-allowed">
        {value}
      </div>
    </Field>
  );
}
