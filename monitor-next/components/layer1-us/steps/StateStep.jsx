"use client";

import { useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, Field, NumberInput, DateInput, StateSelect, ToggleRow, Checkbox, AddButton } from "./_ui";

// Source: layer1_us.html panel-step-state (~line 1431) + addFootprintState()
// (~8143), addCorpFootprintState / syncApportionmentState (~8850). Two
// wrappers in the original are toggled by entity type
// (wrapper-individual-state-nexus vs wrapper-corporate-state-nexus) — here
// both render, gated the same way isStepLocked's isCorpOrPartnership check
// does, off usState.profile directly (no machine.js dependency needed).
function isCorpOrPartnershipEntity(profile) {
  const effective = profile.tax_entity_type === "llc" ? profile.llc_tax_election : profile.tax_entity_type;
  return ["ccorp", "scorp", "partnership"].includes(effective);
}

function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brandGreen/10 border border-brandGreen/30 rounded-lg text-[11px] font-bold text-brandGreen">
      {children}
      <button type="button" onClick={onRemove} className="text-brandGreen/60 hover:text-red-400 transition-colors font-black leading-none">
        ×
      </button>
    </span>
  );
}

export default function StateStep() {
  const { usState, setField, addRow, removeRow } = useUsLayer1Store();
  const sr = usState.state_residency;
  const cn = usState.corp_state_nexus;
  const setSr = (key) => (val) => setField(`state_residency.${key}`, val);
  const setCn = (key) => (val) => setField(`corp_state_nexus.${key}`, val);

  const [footprintPick, setFootprintPick] = useState("");
  const [physicalPick, setPhysicalPick] = useState("");
  const [economicPick, setEconomicPick] = useState("");

  const isCorp = isCorpOrPartnershipEntity(usState.profile);

  function addFootprint() {
    if (!footprintPick || (sr.total_states_footprint || []).includes(footprintPick)) return;
    addRow("state_residency.total_states_footprint", footprintPick);
    setFootprintPick("");
  }
  function removeFootprint(code) {
    const idx = (sr.total_states_footprint || []).indexOf(code);
    if (idx >= 0) removeRow("state_residency.total_states_footprint", idx);
  }

  function addPhysical() {
    if (!physicalPick || (cn.physical_states || []).includes(physicalPick)) return;
    addRow("corp_state_nexus.physical_states", physicalPick);
    setPhysicalPick("");
  }
  function removePhysical(code) {
    const idx = (cn.physical_states || []).indexOf(code);
    if (idx >= 0) removeRow("corp_state_nexus.physical_states", idx);
  }
  function addEconomic() {
    if (!economicPick || (cn.economic_states || []).includes(economicPick)) return;
    addRow("corp_state_nexus.economic_states", economicPick);
    setEconomicPick("");
  }
  function removeEconomic(code) {
    const idx = (cn.economic_states || []).indexOf(code);
    if (idx >= 0) removeRow("corp_state_nexus.economic_states", idx);
  }

  const apportionmentStates = Array.from(new Set([...(cn.physical_states || []), ...(cn.economic_states || [])]));
  const apportionmentTotal = Object.values(cn.apportionment_factors || {}).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">State Residency & Tax</h2>
        <p className="text-[11px] text-muted mt-1">
          Specify your US state tax footprint and exit / statutory residency tests.
        </p>
      </div>

      <Card title="Year-Start & Year-End Permanent Home">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Where were you living on January 1?">
            <StateSelect value={sr.jan_1_domicile_state} onChange={setSr("jan_1_domicile_state")} />
          </Field>
          <Field label="Where were you living on December 31?">
            <StateSelect value={sr.dec_31_domicile_state} onChange={setSr("dec_31_domicile_state")} />
          </Field>
        </div>

        <Field label="All states where you lived, worked, or earned income this year">
          <div className="flex gap-2">
            <div className="flex-1">
              <StateSelect value={footprintPick} onChange={setFootprintPick} />
            </div>
            <AddButton onClick={addFootprint} />
          </div>
        </Field>
        <div className="flex flex-wrap gap-2 min-h-[24px]">
          {(sr.total_states_footprint || []).length === 0 && (
            <span className="text-[11px] text-muted italic">No footprint states added yet.</span>
          )}
          {(sr.total_states_footprint || []).map((code) => (
            <Chip key={code} onRemove={() => removeFootprint(code)}>
              {code}
            </Chip>
          ))}
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Primary State of Residence" hint="Your true, permanent home on Dec 31">
            <StateSelect value={sr.primary_state_of_residence} onChange={setSr("primary_state_of_residence")} />
          </Field>
          <ToggleRow
            label="Did you move to a different state this year?"
            sub="Triggers part-year resident returns in both states."
            checked={sr.moved_states_this_year}
            onChange={setSr("moved_states_this_year")}
          />
        </div>

        {sr.moved_states_this_year && (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="State you moved FROM">
                <StateSelect value={sr.previous_state} onChange={setSr("previous_state")} />
              </Field>
              <Field label="Date of move" hint="Required for part-year allocation">
                <DateInput value={sr.move_date} onChange={setSr("move_date")} />
              </Field>
              <Field label="Days spent in your new (current) state">
                <NumberInput value={sr.state_days_in_current_state} onChange={setSr("state_days_in_current_state")} placeholder="e.g. 180" />
              </Field>
            </div>

            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col gap-3">
              <span className="text-[11px] uppercase tracking-wide text-amber-400 font-semibold">
                Nexus of Life — Audit Defence
              </span>
              <p className="text-[11px] text-muted leading-relaxed">
                When you leave a high-tax state, auditors check where your family actually lives, not just your lease date.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="State where your kids go to school">
                  <StateSelect value={sr.dependents_school_state} onChange={setSr("dependents_school_state")} />
                </Field>
                <Field label="State of your main bank & doctor">
                  <StateSelect
                    value={sr.primary_bank_and_medical_nexus_state}
                    onChange={setSr("primary_bank_and_medical_nexus_state")}
                  />
                </Field>
                <Field label="State of car registration & driver's license">
                  <StateSelect value={sr.vehicles_registered_state} onChange={setSr("vehicles_registered_state")} />
                </Field>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <ToggleRow
          label="Active-duty military member or military spouse?"
          sub="Under MSRRA, you can keep your home-state residency regardless of where orders station you."
          checked={sr.active_duty_military_or_spouse}
          onChange={setSr("active_duty_military_or_spouse")}
        />
        {sr.active_duty_military_or_spouse && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4">
            <Field label="Legal Home State of Record (Domicile)">
              <StateSelect value={sr.military_home_state_of_record} onChange={setSr("military_home_state_of_record")} />
            </Field>
            <Field label="Current Duty-Station State">
              <StateSelect value={sr.military_duty_station_state} onChange={setSr("military_duty_station_state")} />
            </Field>
          </div>
        )}
      </Card>

      <Card title="California FTB — Domicile & Exit Planning" sub="California aggressively audits departing residents.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 p-3 bg-white/[0.02] border border-line rounded-xl">
            <span className="text-xs font-bold text-head">Are you planning to leave California?</span>
            <Checkbox
              checked={sr.ca_planning_departure}
              onChange={setSr("ca_planning_departure")}
              label="Triggers the CA domicile-exit planning workflow."
            />
          </div>
          <div className="flex flex-col gap-2 p-3 bg-white/[0.02] border border-line rounded-xl">
            <span className="text-xs font-bold text-head">Still own CA property or hold CA voter registration?</span>
            <Checkbox
              checked={sr.ca_retains_property_or_voter_reg}
              onChange={setSr("ca_retains_property_or_voter_reg")}
              label="Strong sign the FTB will contest your non-residency."
            />
          </div>
        </div>
      </Card>

      {isCorp && (
        <Card title="Corporate / Entity State Nexus" sub="Domicile inherited from Profile; physical, economic, and apportionment factors below.">
          <div className="flex flex-col gap-2">
            <Field label="Physical Presence Nexus" hint="Offices, inventory, W-2 employees (incl. remote)">
              <div className="flex gap-2">
                <div className="flex-1">
                  <StateSelect value={physicalPick} onChange={setPhysicalPick} />
                </div>
                <AddButton onClick={addPhysical} />
              </div>
            </Field>
            <div className="flex flex-wrap gap-2 min-h-[24px]">
              {(cn.physical_states || []).map((code) => (
                <Chip key={code} onRemove={() => removePhysical(code)}>
                  {code}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Field label="Economic Nexus (Sales Thresholds)" hint="Usually $100k or 200 transactions">
              <div className="flex gap-2">
                <div className="flex-1">
                  <StateSelect value={economicPick} onChange={setEconomicPick} />
                </div>
                <AddButton onClick={addEconomic} />
              </div>
            </Field>
            <div className="flex flex-wrap gap-2 min-h-[24px]">
              {(cn.economic_states || []).map((code) => (
                <Chip key={code} onRemove={() => removeEconomic(code)}>
                  {code}
                </Chip>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-4 flex flex-col gap-3">
            <ToggleRow
              label="Does the entity operate in multiple states?"
              sub="Requires calculating sales/property/payroll factors to apportion income."
              checked={cn.needs_apportionment}
              onChange={setCn("needs_apportionment")}
            />
            <ToggleRow
              label="Has Remote Workers?"
              checked={cn.has_remote_workers}
              onChange={setCn("has_remote_workers")}
            />

            {cn.needs_apportionment && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                  Gross Receipts by State (Single Sales Factor Apportionment)
                </span>
                {apportionmentStates.length === 0 && (
                  <div className="text-xs text-muted text-center py-4">No nexus states selected yet.</div>
                )}
                <div className="flex flex-col gap-2">
                  {apportionmentStates.map((code) => (
                    <div key={code} className="flex items-center justify-between gap-3 p-2.5 bg-white/[0.02] border border-line rounded-lg">
                      <span className="text-xs font-bold text-head w-12">{code}</span>
                      <div className="flex-1">
                        <NumberInput
                          value={(cn.apportionment_factors || {})[code] ?? null}
                          onChange={(v) => setField(`corp_state_nexus.apportionment_factors.${code}`, v || 0)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-2 pt-2 border-t border-line">
                  <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Total US Gross Receipts</span>
                  <span className="text-sm font-mono font-bold text-head">
                    ${Math.round(apportionmentTotal).toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
