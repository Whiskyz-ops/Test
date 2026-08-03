"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, TextInput, Select, ToggleRow, Checkbox, RemoveButton, AddButton } from "./_ui";

// Source: layer1_us.html panel-step-ftc (~line 3634), addFtcBasketRow()
// (~19940). One repeatable array here: ftc_inputs.ftc_baskets
// (per-country/basket-type §904 buckets).
//
// BUG FIX (found by the step-by-step map audit): this step previously also
// rendered "Other-Country FTC Entries" (foreign_tax_credit_other.entries,
// addOtherCountryFtcRow() ~17935), but that card actually belongs on the
// Foreign Income step — confirmed by reading straight through
// layer1_us.html:2778-2795: it's the last card inside panel-step-income-
// foreign, closing right before "STEP 5: EQUITY COMPENSATION" starts, well
// before panel-step-ftc begins at :3634. Moved to IncomeForeignStep.jsx to
// match the source; removed here to avoid two components writing the same
// array.
const BASKET_TYPES = [
  { value: "passive", label: "Passive Category Income" },
  { value: "general", label: "General Category Income" },
  { value: "section_901j", label: "Section 901(j) Income" },
  { value: "treaty_resourced", label: "Treaty Resourced Income" },
];

function emptyBasket() {
  return {
    foreign_country: "",
    basket_type: "passive",
    gross_foreign_income_usd: null,
    foreign_taxes_paid_usd: null,
    includes_indian_surcharge_and_cess: false,
  };
}

export default function FtcStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const ftc = usState.ftc_inputs;
  const set = (key) => (val) => setField(`ftc_inputs.${key}`, val);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">Foreign Tax Credit (Form 1116)</h2>
        <p className="text-[11px] text-muted mt-1">
          Claim credits for taxes paid to foreign jurisdictions to avoid double taxation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ToggleRow
          label="Claims Foreign Tax Credit?"
          sub="Requires Form 1116 unless simplified election made."
          checked={ftc.claims_ftc}
          onChange={set("claims_ftc")}
        />
        {ftc.claims_ftc && (
          <ToggleRow
            label="Simplified FTC Election (≤ $300 / $600)?"
            sub="Skip Form 1116 if foreign tax is passive-category only."
            checked={ftc.claims_ftc_simplified_under_300}
            onChange={set("claims_ftc_simplified_under_300")}
          />
        )}
      </div>

      {ftc.claims_ftc && (
        <>
          <div className="text-[11px] text-brandGreen bg-brandGreen/5 border border-brandGreen/20 rounded-xl px-4 py-3 leading-relaxed">
            Tax tip: when entering foreign taxes paid, include Indian Surcharge and the 4% Health & Education Cess in
            your totals, not just the base tax rate — both are creditable foreign taxes under IRC §901.
          </div>

          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ToggleRow
                label="Elect 'Accrued' Method?"
                sub="Recommended for tax-year mismatches (e.g. India Apr–Mar vs US Jan–Dec). Irrevocable election."
                checked={ftc.elect_accrued_method}
                onChange={set("elect_accrued_method")}
              />
              <Field label="Prior Year FTC Carryovers (USD)">
                <NumberInput value={ftc.prior_year_carryovers_usd} onChange={set("prior_year_carryovers_usd")} />
              </Field>
            </div>
          </Card>

          <Card
            title="FTC Baskets (§904 limit system)"
            right={<AddButton label="+ Add Basket" onClick={() => addRow("ftc_inputs.ftc_baskets", emptyBasket())} />}
          >
            <p className="text-[10px] text-muted -mt-1 mb-2">
              💡 Foreign taxes paid can often be credited against your US tax liability (Form 1116) to prevent double
              taxation!
              <span className="nerd-text">
                Under IRC Sec. 904, the credit is limited to the US tax on foreign source income. Baskets must be
                segregated.
              </span>
            </p>
            {(!ftc.ftc_baskets || ftc.ftc_baskets.length === 0) && (
              <div className="text-xs text-muted text-center py-4">No FTC baskets added yet.</div>
            )}
            <div className="flex flex-col gap-3">
              {(ftc.ftc_baskets || []).map((row, i) => (
                <div key={i} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3 relative">
                  <div className="flex justify-end absolute top-2 right-2">
                    <RemoveButton onClick={() => removeRow("ftc_inputs.ftc_baskets", i)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-16">
                    <Field label="Country (ISO)">
                      <TextInput
                        value={row.foreign_country}
                        onChange={(v) => updateRow("ftc_inputs.ftc_baskets", i, { foreign_country: v.toUpperCase() })}
                        placeholder="e.g. IN"
                      />
                    </Field>
                    <Field label="Basket Type">
                      <Select
                        value={row.basket_type}
                        onChange={(v) => updateRow("ftc_inputs.ftc_baskets", i, { basket_type: v })}
                        options={BASKET_TYPES}
                      />
                    </Field>
                    <Field label="Gross Foreign Income (USD)">
                      <NumberInput
                        value={row.gross_foreign_income_usd}
                        onChange={(v) => updateRow("ftc_inputs.ftc_baskets", i, { gross_foreign_income_usd: v })}
                      />
                    </Field>
                    <Field label="Foreign Taxes Paid (USD)">
                      <NumberInput
                        value={row.foreign_taxes_paid_usd}
                        onChange={(v) => updateRow("ftc_inputs.ftc_baskets", i, { foreign_taxes_paid_usd: v })}
                      />
                    </Field>
                  </div>
                  <Checkbox
                    checked={row.includes_indian_surcharge_and_cess}
                    onChange={(v) => updateRow("ftc_inputs.ftc_baskets", i, { includes_indian_surcharge_and_cess: v })}
                    label="Includes Indian Surcharge and 4% Health/Education Cess?"
                  />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
