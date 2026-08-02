"use client";

import { useEffect } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, TextInput, DateInput, Select, ToggleRow, fmtUsd } from "./_ui";

// Source: layer1_us.html panel-step-feie (~line 2866) + calculateFeieExclusion()
// (~line 11397). Every field maps to usState.foreign_earned_income
// (schema.js). The 2026 FEIE statutory cap ($132,900 in the source file) is
// approximated here as a constant — the real wizard hardcodes it too, so
// this is a faithful (if not year-indexed) port, flagged below.
const FEIE_STATUTORY_CAP_USD = 132900; // simplified: not year-indexed, matches source's hardcoded constant

export default function FeieStep() {
  const { usState, setField } = useUsLayer1Store();
  const f = usState.foreign_earned_income;
  const set = (key) => (val) => setField(`foreign_earned_income.${key}`, val);

  // Simplified port of calculateFeieExclusion() — the original also folds in
  // days-abroad proration and a handful of conflict warnings (CTC/FTC/SE-tax
  // traps) that live outside this schema section; those are flagged, not
  // ported, per the porting brief.
  useEffect(() => {
    if (!f.claims_feie) return;
    const feieExcl = Math.min(f.foreign_earned_income_usd || 0, FEIE_STATUTORY_CAP_USD);
    const housingExp = f.foreign_housing_expenses_usd || 0;
    const base = f.housing_exclusion_base_usd ?? 21264;
    const cap = f.housing_exclusion_cap_usd ?? 39870;
    const houseExcl = Math.max(0, Math.min(housingExp - base, cap - base));
    if (feieExcl !== f.feie_amount_claimed_usd) setField("foreign_earned_income.feie_amount_claimed_usd", feieExcl);
    if (houseExcl !== f.foreign_housing_exclusion_usd) setField("foreign_earned_income.foreign_housing_exclusion_usd", houseExcl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    f.claims_feie,
    f.foreign_earned_income_usd,
    f.foreign_housing_expenses_usd,
    f.housing_exclusion_base_usd,
    f.housing_exclusion_cap_usd,
  ]);

  // BUG FIX: layer1_us.html's updateResidencyField() (~line 6983) hard-wires
  // foreign_earned_income.days_in_us_during_test_period to always mirror
  // us_residency_detail.us_days_current_year — the #feie-phys-usdays input
  // itself is `readonly`/`pointer-events-none` (line 3002), i.e. this is a
  // derived field, never something the user types into directly on this
  // step. The port previously rendered it as a free-form NumberInput with no
  // link back to the residency step, letting a user's manually-typed value
  // silently diverge from the actual day count computed on Profile &
  // Residency. Mirrored here (best-effort: only while this step is mounted,
  // since the React port renders one active step at a time instead of the
  // vanilla app's single-page/hidden-panels model — see FLAGGED note below).
  const usDaysCurrentYear = usState.us_residency_detail?.us_days_current_year || 0;
  useEffect(() => {
    if (usDaysCurrentYear !== f.days_in_us_during_test_period) {
      setField("foreign_earned_income.days_in_us_during_test_period", usDaysCurrentYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usDaysCurrentYear]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">Foreign Earned Income Exclusion (FEIE)</h2>
        <p className="text-[11px] text-muted mt-1">Configure Form 2555 qualifications for US expats living abroad.</p>
      </div>

      <ToggleRow
        label="Claims Foreign Earned Income Exclusion?"
        sub="Form 2555 — requires physical presence or bona fide residency test."
        checked={f.claims_feie}
        onChange={set("claims_feie")}
      />

      {f.claims_feie && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Qualification Test">
              <Select
                value={f.qualification_test}
                onChange={set("qualification_test")}
                options={[
                  { value: "physical_presence", label: "Physical Presence (330 Days Abroad)" },
                  { value: "bona_fide_residence", label: "Bona Fide Residence (Full Tax Year)" },
                ]}
              />
            </Field>
            <Field label="Tax Home Country (ISO)">
              <TextInput
                value={f.tax_home_country}
                onChange={(v) => setField("foreign_earned_income.tax_home_country", v.toUpperCase())}
                placeholder="e.g. IN or GB"
              />
            </Field>
            <Field label="Total Foreign Earned Income (USD)">
              <NumberInput value={f.foreign_earned_income_usd} onChange={set("foreign_earned_income_usd")} />
            </Field>
          </div>

          {f.qualification_test === "physical_presence" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4">
              <Field label="Physical Presence Test Start Date">
                <DateInput value={f.physical_presence_start_date} onChange={set("physical_presence_start_date")} />
              </Field>
              <Field label="Physical Presence Test End Date">
                <DateInput value={f.physical_presence_end_date} onChange={set("physical_presence_end_date")} />
              </Field>
              <Field label="Days in US During Test Period" hint="max 35 allowed — read-only, sourced from Residency step">
                <div className="rounded-lg bg-white/[0.02] border border-line px-3 py-2 text-sm text-muted font-mono opacity-70 cursor-not-allowed">
                  {f.days_in_us_during_test_period ?? 0}
                </div>
              </Field>
              <Field label="US Business Days" hint="Income earned on these days is US-sourced, disqualified from FEIE">
                <NumberInput value={f.us_business_days} onChange={set("us_business_days")} />
              </Field>
            </div>
          ) : (
            // BUG FIX: ground truth's div-feie-bonafide-details (layer1_us.html
            // ~3023-3041) only shows the start date (+ a bona_fide_visa_type
            // text field, layer1_us.html:3030-3031 — added to schema.js in the
            // JSON-export reconciliation pass but still not rendered here; a
            // real gap, not an intentional exclusion). It does NOT show
            // days_in_us_during_test_period / us_business_days — those belong
            // to the physical-presence test only. The previous version
            // duplicated the physical-presence fields here, which erased the
            // one real distinction the two qualification tests have in this
            // form.
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4">
              <Field label="Bona Fide Residence Start Date" hint="Full tax year residency required">
                <DateInput value={f.bona_fide_residence_start_date} onChange={set("bona_fide_residence_start_date")} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-line pt-4">
            <Field label="Foreign Housing Expenses (USD)">
              <NumberInput value={f.foreign_housing_expenses_usd} onChange={set("foreign_housing_expenses_usd")} />
            </Field>
            <Field label="Housing Exclusion Base (USD)" hint="IRS base amount, overridable">
              <NumberInput value={f.housing_exclusion_base_usd} onChange={set("housing_exclusion_base_usd")} />
            </Field>
            <Field label="Housing Exclusion Cap (USD)" hint="IRS location cap, overridable">
              <NumberInput value={f.housing_exclusion_cap_usd} onChange={set("housing_exclusion_cap_usd")} />
            </Field>
          </div>

          <div className="p-3 bg-black/20 border border-line rounded-xl text-xs flex flex-wrap gap-x-6 gap-y-2 font-mono">
            <span className="text-muted">
              FEIE Exclusion Claimed: <strong className="text-brandGreen">{fmtUsd(f.feie_amount_claimed_usd)}</strong>
            </span>
            <span className="text-muted">
              Foreign Housing Exclusion: <strong className="text-brandGreen">{fmtUsd(f.foreign_housing_exclusion_usd)}</strong>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
