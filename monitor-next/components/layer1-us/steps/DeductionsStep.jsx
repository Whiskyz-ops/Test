"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, TextInput, DateInput, Select, ToggleRow } from "./_ui";

// Source: layer1_us.html panel-step-deductions (~line 3440) + updateStateField/
// toggleDeductionsFields/toggle529Fields handlers. All fields below map 1:1 to
// usState.itemized_deductions_and_credits in lib/layer1-us/schema.js.
export default function DeductionsStep() {
  const { usState, setField } = useUsLayer1Store();
  const d = usState.itemized_deductions_and_credits;
  const set = (key) => (val) => setField(`itemized_deductions_and_credits.${key}`, val);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">Deductions & Credits</h2>
        <p className="text-[11px] text-muted mt-1">
          Configure standard vs itemized deductions (SALT, mortgage interest) and claim dependent credits.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Exemptions Choice">
            <Select
              value={d.use_standard_or_itemized}
              onChange={set("use_standard_or_itemized")}
              options={[
                { value: "auto", label: "Auto-Select Largest (Recommended)" },
                { value: "standard", label: "Standard Deduction Only" },
                { value: "itemized", label: "Itemized Deductions (Schedule A)" },
              ]}
            />
          </Field>
          <Field label="SALT Taxes Paid (USD)" hint="OBBBA $40,400 cap">
            <NumberInput value={d.state_and_local_taxes_paid_usd} onChange={set("state_and_local_taxes_paid_usd")} />
          </Field>
          <Field label="Student Loan Interest Paid (USD)" hint="Above-the-line, capped at $2,500">
            <NumberInput value={d.student_loan_interest_usd} onChange={set("student_loan_interest_usd")} />
          </Field>
          <Field label="Educator Expenses (USD)">
            <NumberInput value={d.educator_expenses_usd} onChange={set("educator_expenses_usd")} />
          </Field>
        </div>
      </Card>

      {/* BUG FIX: ground truth's toggleDeductionsFields() (layer1_us.html
          ~9207) hides #div-itemized-fields when use_standard_or_itemized
          === 'standard' (shown for 'auto' and 'itemized'). The port
          previously rendered this card unconditionally, which let users fill
          in Schedule A fields even after explicitly picking "Standard
          Deduction Only" — harmless to computation (the amounts are still
          stored correctly under itemized_deductions_and_credits either way)
          but confusing/misleading UI that the source deliberately avoids. */}
      {d.use_standard_or_itemized !== "standard" && (
        <Card title="Itemized Deduction Detail" sub="Only used if Schedule A itemizing beats the standard deduction.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Mortgage Interest (USD)" hint="Capped at $750K acquisition debt">
              <NumberInput value={d.mortgage_interest_paid_usd} onChange={set("mortgage_interest_paid_usd")} />
            </Field>
            <Field label="Mortgage Acquisition Date">
              <DateInput value={d.mortgage_acquisition_date} onChange={set("mortgage_acquisition_date")} />
            </Field>
            <Field label="Charitable Contributions — Cash (USD)">
              <NumberInput value={d.charitable_contributions_cash_usd} onChange={set("charitable_contributions_cash_usd")} />
            </Field>
            <Field label="Charitable Contributions — Appreciated Assets (USD)">
              <NumberInput
                value={d.charitable_contributions_appreciated_usd}
                onChange={set("charitable_contributions_appreciated_usd")}
              />
            </Field>
            <Field label="Unreimbursed Medical Expenses (USD)">
              <NumberInput value={d.medical_expenses_usd} onChange={set("medical_expenses_usd")} />
            </Field>
            <Field label="Federal Disaster Casualty Loss (USD)">
              <NumberInput value={d.casualty_loss_federal_disaster_usd} onChange={set("casualty_loss_federal_disaster_usd")} />
            </Field>
            <Field label="HSA Contributions (USD)">
              <NumberInput value={d.hsa_contributions_usd} onChange={set("hsa_contributions_usd")} />
            </Field>
          </div>
        </Card>
      )}

      <Card title="Credits & 529 Contributions">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Child Tax Credit Dependents" hint="under 17 with SSN">
            <NumberInput value={d.child_tax_credit_dependents} onChange={set("child_tax_credit_dependents")} />
          </Field>
          <Field label="Other Dependents (Count)">
            <NumberInput value={d.credit_for_other_dependents} onChange={set("credit_for_other_dependents")} />
          </Field>
          <Field label="Child/Dependent Care Expenses (USD)">
            <NumberInput
              value={d.child_and_dependent_care_expenses_usd}
              onChange={set("child_and_dependent_care_expenses_usd")}
            />
          </Field>
          <Field label="American Opportunity Credit (AOTC, USD)">
            <NumberInput value={d.education_credits_aotc_usd} onChange={set("education_credits_aotc_usd")} />
          </Field>
          <Field label="Lifetime Learning Credit (LLC, USD)">
            <NumberInput value={d.education_credits_llc_usd} onChange={set("education_credits_llc_usd")} />
          </Field>
          <div className="flex items-end">
            <ToggleRow
              label="Saver's Credit Eligible?"
              checked={d.saver_credit_eligible}
              onChange={set("saver_credit_eligible")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-line pt-4">
          <ToggleRow
            label="Funded a 529 College Plan?"
            checked={d.funded_529_plan}
            onChange={set("funded_529_plan")}
          />
          {d.funded_529_plan && (
            <>
              <Field label="529 Contributions (USD)">
                <NumberInput value={d["529_contributions_usd"]} onChange={set("529_contributions_usd")} />
              </Field>
              <Field label="State for 529 Deduction">
                <TextInput
                  value={d["529_state_deduction_state"]}
                  onChange={(v) => setField("itemized_deductions_and_credits.529_state_deduction_state", v.toUpperCase())}
                  placeholder="e.g. NY"
                />
              </Field>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-line pt-4">
          <ToggleRow
            label="QBI Deduction Eligible?"
            sub="§199A pass-through income deduction"
            checked={d.qbi_deduction_eligible}
            onChange={set("qbi_deduction_eligible")}
          />
          {d.qbi_deduction_eligible && (
            <Field label="QBI Deduction (USD)" hint="Normally derived from business income — override here if known">
              <NumberInput value={d.qbi_deduction_usd} onChange={set("qbi_deduction_usd")} />
            </Field>
          )}
        </div>
      </Card>
    </div>
  );
}
