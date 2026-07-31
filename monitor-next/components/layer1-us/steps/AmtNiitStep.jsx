"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, fmtUsd, AddButton } from "./_ui";

// Source: layer1_us.html panel-step-amt-niit (~line 3557) + calculateAmtAndNiit()
// (~line 11414-11500). All fields map to usState.amt_inputs / usState.niit_inputs.
//
// In the vanilla wizard most of these numbers are auto-derived on every
// keystroke elsewhere in the form (ISO spreads from equity comp, SALT
// addback from deductions, MAGI/NII summed across a dozen income fields).
// This port keeps every field directly editable (they're plain schema
// numbers, not view-only labels) and additionally offers a "Recalculate"
// button per box that runs a SIMPLIFIED version of the original formula
// against whatever's already in usState — flagged, not full fidelity
// (no proration, no multi-year AMT credit interaction, flat 22% regular-tax
// estimate).
export default function AmtNiitStep() {
  const { usState, setField } = useUsLayer1Store();
  const amt = usState.amt_inputs;
  const niit = usState.niit_inputs;
  const setAmt = (key) => (val) => setField(`amt_inputs.${key}`, val);
  const setNiit = (key) => (val) => setField(`niit_inputs.${key}`, val);

  const isMfj = usState.profile.filing_status === "mfj";

  function recalcAmt() {
    const isoPrefSum = (usState.equity_compensation.iso_exercises || []).reduce(
      (sum, ex) => sum + (ex.amt_preference_spread_usd || 0),
      0
    );
    const saltVal = usState.itemized_deductions_and_credits.state_and_local_taxes_paid_usd || 0;
    const saltAddback = Math.min(saltVal, 40400); // OBBBA SALT cap
    const privateBond = amt.private_activity_bond_interest_usd || 0;

    const standardDeduction = isMfj ? 30000 : 15000;
    const mortgageInterest = usState.itemized_deductions_and_credits.mortgage_interest_paid_usd || 0;
    const charity = usState.itemized_deductions_and_credits.charitable_contributions_cash_usd || 0;
    const itemizedVal = mortgageInterest + charity + saltAddback;
    const useMode = usState.itemized_deductions_and_credits.use_standard_or_itemized;
    const deductionsVal = useMode === "itemized" ? itemizedVal : useMode === "standard" ? standardDeduction : Math.max(standardDeduction, itemizedVal);

    // No full AGI computation available in this step's scope — approximate
    // via MAGI already captured on the NIIT side, defaulting to 0.
    const agi = niit.modified_agi_usd || 0;
    const estimatedRegTax = Math.max(0, agi - deductionsVal) * 0.22;
    const amti = Math.max(0, agi - (deductionsVal > standardDeduction ? deductionsVal - saltAddback : 0) + isoPrefSum + privateBond);

    const exemptionBase = isMfj ? 133000 : 85000;
    const phaseoutStart = isMfj ? 1140000 : 570000;
    const exemption = amti > phaseoutStart ? Math.max(0, exemptionBase - (amti - phaseoutStart) * 0.25) : exemptionBase;
    const tmt = Math.max(0, amti - exemption) * 0.26;
    const amtDue = Math.max(0, tmt - estimatedRegTax);

    setField("amt_inputs.iso_preference_total_usd", isoPrefSum);
    setField("amt_inputs.salt_addback_usd", saltAddback);
    setField("amt_inputs.amti_usd", amti);
    setField("amt_inputs.amt_exemption_usd", exemption);
    setField("amt_inputs.tentative_minimum_tax_usd", tmt);
    setField("amt_inputs.amt_due_usd", amtDue);
  }

  function recalcNiit() {
    const filingStatus = usState.profile.filing_status;
    const threshold = isMfj ? 250000 : filingStatus === "mfs" ? 125000 : 200000;
    const agi = niit.modified_agi_usd || 0;
    const src = usState.income_us_source;
    const fsrc = usState.income_foreign_source;
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
    const niitDue = Math.max(0, Math.min(nii, agi - threshold) * 0.038);

    setField("niit_inputs.niit_threshold_usd", threshold);
    setField("niit_inputs.net_investment_income_usd", nii);
    setField("niit_inputs.niit_due_usd", niitDue);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">AMT & NIIT</h2>
        <p className="text-[11px] text-muted mt-1">
          Alternative Minimum Tax (AMT) preference rules and Net Investment Income Tax (§1411 NIIT).
        </p>
      </div>

      <Card
        title="AMT Preference Adjustments"
        right={<AddButton label="Recalculate (simplified)" onClick={recalcAmt} />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="ISO Preference Total (USD)" hint="Sum of AMT preference spreads from equity comp">
            <NumberInput value={amt.iso_preference_total_usd} onChange={setAmt("iso_preference_total_usd")} />
          </Field>
          <Field label="SALT Addback (USD)">
            <NumberInput value={amt.salt_addback_usd} onChange={setAmt("salt_addback_usd")} />
          </Field>
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
          <Field label="AMT Exemption (USD)">
            <NumberInput value={amt.amt_exemption_usd} onChange={setAmt("amt_exemption_usd")} />
          </Field>
          <Field label="Alternative Minimum Taxable Income — AMTI (USD)">
            <NumberInput value={amt.amti_usd} onChange={setAmt("amti_usd")} />
          </Field>
          <Field label="Tentative Minimum Tax (USD)">
            <NumberInput value={amt.tentative_minimum_tax_usd} onChange={setAmt("tentative_minimum_tax_usd")} />
          </Field>
          <Field label="AMT Due (USD)">
            <NumberInput value={amt.amt_due_usd} onChange={setAmt("amt_due_usd")} />
          </Field>
        </div>
        <div className="p-3 bg-brandGreen/5 border border-brandGreen/20 rounded-xl flex justify-between items-center text-xs font-mono">
          <span className="text-muted">AMT Owed</span>
          <span className="text-lg font-black text-brandGreen">{fmtUsd(amt.amt_due_usd)}</span>
        </div>
      </Card>

      <Card
        title="Net Investment Income Tax (§1411 NIIT)"
        right={<AddButton label="Recalculate (simplified)" onClick={recalcNiit} />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Modified AGI — MAGI (USD)">
            <NumberInput value={niit.modified_agi_usd} onChange={setNiit("modified_agi_usd")} />
          </Field>
          <Field label="NIIT Filing Threshold (USD)" hint="200K single / 250K MFJ / 125K MFS">
            <NumberInput value={niit.niit_threshold_usd} onChange={setNiit("niit_threshold_usd")} />
          </Field>
          <Field label="Net Investment Income (USD)" hint="Dividends + interest + passive CG + rental">
            <NumberInput value={niit.net_investment_income_usd} onChange={setNiit("net_investment_income_usd")} />
          </Field>
          <Field label="NIIT Due (USD)">
            <NumberInput value={niit.niit_due_usd} onChange={setNiit("niit_due_usd")} />
          </Field>
        </div>
        <div className="p-3 bg-brandGreen/5 border border-brandGreen/20 rounded-xl flex justify-between items-center text-xs font-mono">
          <span className="text-muted">Applicable NIIT rate: 3.8% · NIIT Owed</span>
          <span className="text-lg font-black text-brandGreen">{fmtUsd(niit.niit_due_usd)}</span>
        </div>
      </Card>
    </div>
  );
}
