"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, TextInput, Select, ToggleRow, RemoveButton, AddButton, fmtUsd } from "./_ui";

// Source: layer1_us.html panel-step-nra (~line 3772), addTreatyRateRow()
// (~line 6154), syncTreatyRates() (~line 6133). Fields map to
// usState.nra_specific. Only relevant when final_us_residency_status ===
// "NON_RESIDENT_ALIEN" (see machine.js isStepLocked) — page-level wiring
// handles that gate, this component renders unconditionally.
//
// FIELD-MISMATCH BUG (confirmed via the step-by-step map audit): the source
// wires a REAL "Submitted Form W-8BEN?" checkbox (layer1_us.html:3842-3848,
// #nra-w8ben) writing the boolean `nra_specific.submitted_w8ben` — added to
// schema.js in the JSON-export reconciliation pass, so it IS part of the
// canonical schema now. This component instead renders a 4-option
// "W-8BEN Aggregate Status" select bound to `w8ben_aggregate_status`, a
// field that only exists in the source's default-value literal with no
// matching UI control anywhere in layer1_us.html (confirmed dead there
// too). Net effect: the real, wired source control (`submitted_w8ben`) has
// no UI here at all, and dag_py/js-dag both read `submitted_w8ben`
// directly, so `w8benOnFile` is always false regardless of what's entered
// in the select below. Not yet fixed — flagged for the next pass rather
// than fixed inline here to avoid touching this step mid-audit.
//
// The source ALSO wires a "US Permanent Establishment (PE)?" checkbox
// (layer1_us.html:3835-3841, #nra-pe -> nra_specific.has_us_pe) that has no
// UI in this file at all.
const TREATY_INCOME_TYPES = [
  { value: "dividends", label: "Dividends (Art. 10)" },
  { value: "interest", label: "Interest (Art. 11)" },
  { value: "royalties", label: "Royalties & FTS (Art. 12)" },
];

function emptyTreatyRow() {
  return { income_type: "", elected_rate: "", treaty_article: "" };
}

export default function NraStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const nra = usState.nra_specific;
  const set = (key) => (val) => setField(`nra_specific.${key}`, val);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">NRA / 1040-NR</h2>
        <p className="text-[11px] text-muted mt-1">
          Configure elections for Non-Resident Aliens, including ECI vs FDAP income and treaty claims.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ToggleRow
          label="Filing Form 1040-NR?"
          sub="Check if filing a non-resident return."
          checked={nra.files_form_1040nr}
          onChange={set("files_form_1040nr")}
        />
        <ToggleRow
          label="Form W-7 ITIN Application Filed?"
          sub="Required if filing without an SSN."
          checked={nra.form_w7_itin_application_filed}
          onChange={set("form_w7_itin_application_filed")}
        />
      </div>

      <Card title="§6013(h) Joint Return Election" sub="Unlocks MFJ filing status for an NRA married to a US citizen/resident.">
        <ToggleRow
          label="Joint Election with US Citizen/RA Spouse"
          sub="Allows an NRA married to a US citizen or resident to elect a joint return for the year they marry — treated as a resident alien for the full year."
          checked={nra.s6013h_joint_election}
          onChange={set("s6013h_joint_election")}
        />
        {/* Electing joint treatment lists the spouse on the return too — IRC
            §6109 requires their own SSN/ITIN, same as the primary taxpayer's
            own ID. Source: layer1_us.html's "nra-spouse-id-type" select. */}
        <Field label="Spouse's Taxpayer ID Type">
          <Select
            value={nra.spouse_ssn_or_itin_type}
            onChange={set("spouse_ssn_or_itin_type")}
            options={[
              { value: "none", label: "None (Requires ITIN Form W-7)" },
              { value: "ssn", label: "SSN (Social Security Number)" },
              { value: "itin", label: "ITIN (Individual Taxpayer ID)" },
              { value: "atin", label: "ATIN (Adoption Taxpayer ID)" },
            ]}
          />
        </Field>
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="W-8BEN Aggregate Status">
            <Select
              value={nra.w8ben_aggregate_status}
              onChange={set("w8ben_aggregate_status")}
              options={[
                { value: "none", label: "None filed" },
                { value: "submitted", label: "Submitted to all payers" },
                { value: "partial", label: "Submitted to some payers" },
                { value: "expired", label: "Expired — needs renewal" },
              ]}
            />
          </Field>
          <Field label="Effectively Connected Income — ECI (USD)" hint="Graduated rates; US W-2 wages + US business">
            <NumberInput value={nra.us_eci_income_usd} onChange={set("us_eci_income_usd")} />
          </Field>
          <Field label="FDAP Income (USD)" hint="Flat 30% or treaty rate, reported on Form 1042-S">
            <NumberInput value={nra.us_fdap_income_usd} onChange={set("us_fdap_income_usd")} />
          </Field>
        </div>
      </Card>

      <Card
        title="Form 1042-S / Treaty Tax Rates (FDAP)"
        right={<AddButton label="+ Add Stream" onClick={() => addRow("nra_specific.treaty_rate_claims", emptyTreatyRow())} />}
      >
        {(!nra.treaty_rate_claims || nra.treaty_rate_claims.length === 0) && (
          <div className="text-xs text-muted text-center py-4">No treaty rate claims added yet.</div>
        )}
        <div className="flex flex-col gap-2">
          {(nra.treaty_rate_claims || []).map((row, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end p-3 bg-white/[0.02] border border-line rounded-xl">
              <Field label="Income Type">
                <Select
                  value={row.income_type}
                  onChange={(v) => updateRow("nra_specific.treaty_rate_claims", i, { income_type: v })}
                  options={TREATY_INCOME_TYPES}
                  placeholder="Select..."
                />
              </Field>
              <Field label="Elected Rate">
                <TextInput
                  value={row.elected_rate}
                  onChange={(v) => updateRow("nra_specific.treaty_rate_claims", i, { elected_rate: v })}
                  placeholder="e.g. 15%"
                />
              </Field>
              <Field label="Treaty Article">
                <TextInput
                  value={row.treaty_article}
                  onChange={(v) => updateRow("nra_specific.treaty_rate_claims", i, { treaty_article: v })}
                  placeholder="e.g. 10(2)"
                />
              </Field>
              <RemoveButton onClick={() => removeRow("nra_specific.treaty_rate_claims", i)} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToggleRow
            label="US Real Property Disposed (FIRPTA)?"
            sub="Triggers Form 8288 15% withholding."
            checked={nra.us_real_property_disposed}
            onChange={set("us_real_property_disposed")}
          />
          {nra.us_real_property_disposed && (
            <Field label="FIRPTA Withholding Amount (USD)">
              <NumberInput value={nra.firpta_withholding_usd} onChange={set("firpta_withholding_usd")} />
            </Field>
          )}
        </div>
        <ToggleRow
          label="LRS Investor?"
          sub="Indian resident investing in US stocks via RBI's Liberalised Remittance Scheme — no US return required, withholding only."
          checked={nra.is_lrs_investor}
          onChange={set("is_lrs_investor")}
        />
      </Card>

      <div className="p-3 bg-black/20 border border-line rounded-xl text-xs flex flex-wrap gap-x-6 gap-y-2 font-mono">
        <span className="text-muted">
          ECI: <strong className="text-brandGreen">{fmtUsd(nra.us_eci_income_usd)}</strong>
        </span>
        <span className="text-muted">
          FDAP: <strong className="text-brandGreen">{fmtUsd(nra.us_fdap_income_usd)}</strong>
        </span>
      </div>
    </div>
  );
}
