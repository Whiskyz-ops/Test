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
              <Field label="Days in US During Test Period" hint="max 35 allowed">
                <NumberInput
                  value={f.days_in_us_during_test_period}
                  onChange={set("days_in_us_during_test_period")}
                />
              </Field>
              <Field label="US Business Days" hint="Income earned on these days is US-sourced, disqualified from FEIE">
                <NumberInput value={f.us_business_days} onChange={set("us_business_days")} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4">
              <Field label="Bona Fide Residence Start Date">
                <DateInput value={f.bona_fide_residence_start_date} onChange={set("bona_fide_residence_start_date")} />
              </Field>
              <Field label="Days in US During Test Period">
                <NumberInput
                  value={f.days_in_us_during_test_period}
                  onChange={set("days_in_us_during_test_period")}
                />
              </Field>
              <Field label="US Business Days">
                <NumberInput value={f.us_business_days} onChange={set("us_business_days")} />
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
