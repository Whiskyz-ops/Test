"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, fmtUsd } from "./_ui";

// Source: layer1_us.html panel-step-withholding (~line 3697). All fields map
// to usState.withholding_and_estimated. federal/state withholding totals and
// additional_medicare_tax_owed_usd are auto-derived elsewhere in the vanilla
// wizard (summed from W-2 rows entered in step-income-us, which is out of
// scope here) — kept as directly editable overrides, per the porting brief.
export default function WithholdingStep() {
  const { usState, setField } = useUsLayer1Store();
  const w = usState.withholding_and_estimated;
  const set = (key) => (val) => setField(`withholding_and_estimated.${key}`, val);

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
          <Field label="Federal Withholding Total (USD)" hint="Derived from W-2s — overridable">
            <NumberInput value={w.federal_withholding_total_usd} onChange={set("federal_withholding_total_usd")} />
          </Field>
          <Field label="State Withholding Total (USD)" hint="Derived from W-2s — overridable">
            <NumberInput value={w.state_withholding_total_usd} onChange={set("state_withholding_total_usd")} />
          </Field>
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
          <Field label="Additional Medicare Tax Owed (USD)" hint="0.9% on wages > $200K single / $250K MFJ — overridable">
            <NumberInput value={w.additional_medicare_tax_owed_usd} onChange={set("additional_medicare_tax_owed_usd")} />
          </Field>
        </div>
      </Card>

      <div className="p-3 bg-black/20 border border-line rounded-xl flex justify-between items-center text-xs font-mono">
        <span className="text-muted">Total Payments Credited (all rows above)</span>
        <span className="text-lg font-black text-brandGreen">{fmtUsd(totalPaid)}</span>
      </div>
    </div>
  );
}
