"use client";

import { useEffect } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, fmtUsd } from "./_ui";

// Source: layer1_us.html panel-step-withholding (~line 3697). All fields map
// to usState.withholding_and_estimated.
//
// BUG FIX (editable-instead-of-derived-readonly, found by the step-by-step
// map audit): federal_withholding_total_usd/state_withholding_total_usd/
// additional_medicare_tax_owed_usd are read-only `<strong>` labels in the
// source (layer1_us.html:3703-3713,3756-3762), derived from
// income_us_source.wages_w2[] every time recalculateDerivedFields() runs
// (layer1_us.html:11288-11318) — never form inputs. This component
// previously rendered all three as freely-editable NumberInputs, reasoning
// the W-2 data was "out of scope" — it isn't; wages_w2[] lives on the same
// shared usState this component already reads. Fixed: derived live via
// useEffect, matching the source's derivation exactly (federal = sum of
// each W-2's federal_tax_withheld_usd; state = sum of state_tax_withheld_
// box17_usd across W-2s with has_state_taxes; Additional Medicare Tax =
// 0.9% of (summed medicare_wages_box5_usd - filing-status threshold)).
//
// firpta_withholding_usd (on NraStep.jsx, not this step) is genuinely a
// plain user-entered field in the source (layer1_us.html:3927,
// #nra-firpta-amt — a real <input>, not a derived label) — an earlier pass
// of this audit incorrectly lumped it in with these 3; it needs no fix.
export default function WithholdingStep() {
  const { usState, setField } = useUsLayer1Store();
  const w = usState.withholding_and_estimated;
  const wages = usState.income_us_source.wages_w2 || [];
  const filingStatus = usState.profile.filing_status;
  const set = (key) => (val) => setField(`withholding_and_estimated.${key}`, val);

  let federalWithholding = 0;
  let stateWithholding = 0;
  let medicareWages = 0;
  wages.forEach((row) => {
    const adv = row.tax_details_collapsed_by_default || {};
    federalWithholding += adv.federal_tax_withheld_usd || 0;
    medicareWages += adv.medicare_wages_box5_usd || 0;
    if (row.has_state_taxes && row.state_and_local_taxes) {
      row.state_and_local_taxes.forEach((st) => {
        stateWithholding += st.state_tax_withheld_box17_usd || 0;
      });
    }
  });
  const medicareThreshold = filingStatus === "mfj" ? 250000 : filingStatus === "mfs" ? 125000 : 200000;
  const additionalMedicareTax = Math.max(0, (medicareWages - medicareThreshold) * 0.009);

  useEffect(() => {
    if (federalWithholding !== w.federal_withholding_total_usd) {
      setField("withholding_and_estimated.federal_withholding_total_usd", federalWithholding);
    }
    if (stateWithholding !== w.state_withholding_total_usd) {
      setField("withholding_and_estimated.state_withholding_total_usd", stateWithholding);
    }
    const roundedMedicare = Number(additionalMedicareTax.toFixed(2));
    if (roundedMedicare !== w.additional_medicare_tax_owed_usd) {
      setField("withholding_and_estimated.additional_medicare_tax_owed_usd", roundedMedicare);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [federalWithholding, stateWithholding, additionalMedicareTax]);

  const totalPaid =
    (w.federal_withholding_total_usd || 0) +
    (w.state_withholding_total_usd || 0) +
    (w.estimated_tax_q1_apr15_usd || 0) +
    (w.estimated_tax_q2_jun15_usd || 0) +
    (w.estimated_tax_q3_sep15_usd || 0) +
    (w.estimated_tax_q4_jan15_usd || 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">Withholding & Estimated Tax</h2>
        <p className="text-[11px] text-muted mt-1">
          Specify payments already credited to the IRS (W-2 withholding and quarterly estimated payments).
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadOnlyStat label="Federal Withholding Total (USD)" hint="Derived — sum of federal_tax_withheld_usd across your W-2s" value={fmtUsd(w.federal_withholding_total_usd)} />
          <ReadOnlyStat label="State Withholding Total (USD)" hint="Derived — sum of state_tax_withheld_box17_usd across your W-2s" value={fmtUsd(w.state_withholding_total_usd)} />
        </div>
      </Card>

      <Card title="Estimated Quarterly Tax Payments (IRS Form 1040-ES)">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Q1 Payment" hint="Apr 15">
            <NumberInput value={w.estimated_tax_q1_apr15_usd} onChange={set("estimated_tax_q1_apr15_usd")} />
          </Field>
          <Field label="Q2 Payment" hint="Jun 15">
            <NumberInput value={w.estimated_tax_q2_jun15_usd} onChange={set("estimated_tax_q2_jun15_usd")} />
          </Field>
          <Field label="Q3 Payment" hint="Sep 15">
            <NumberInput value={w.estimated_tax_q3_sep15_usd} onChange={set("estimated_tax_q3_sep15_usd")} />
          </Field>
          <Field label="Q4 Payment" hint="Jan 15">
            <NumberInput value={w.estimated_tax_q4_jan15_usd} onChange={set("estimated_tax_q4_jan15_usd")} />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Prior Year Total Tax Owed (USD)" hint="Used for the 110%/100% safe-harbor test">
            <NumberInput value={w.prior_year_total_tax_usd} onChange={set("prior_year_total_tax_usd")} />
          </Field>
          <ReadOnlyStat label="Additional Medicare Tax Owed (USD)" hint="Derived — 0.9% on Medicare wages > $200K single / $250K MFJ / $125K MFS" value={fmtUsd(w.additional_medicare_tax_owed_usd)} />
        </div>
      </Card>

      <div className="p-3 bg-black/20 border border-line rounded-xl flex justify-between items-center text-xs font-mono">
        <span className="text-muted">Total Payments Credited (all rows above)</span>
        <span className="text-lg font-black text-brandGreen">{fmtUsd(totalPaid)}</span>
      </div>
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
