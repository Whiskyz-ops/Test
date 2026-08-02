"use client";

import { useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html panel-step-entities (layer1_us.html:3273-3388),
// addCorpRow/syncCorpState (layer1_us.html:19295-19544), and addPartRow/
// syncPartState (layer1_us.html:19546-19684).
//
// CORRECTION vs the task brief: the brief said `addTrustDetailRow` (source
// of `foreign_de_details`) lives on this step and is "misleadingly named"
// FDE data. Grepping the actual panel shows the Disregarded-Entity
// accordion (acc-de, layer1_us.html:3330-3352) has NO row editor at all —
// it only shows a message and a "Go to Business Section" redirect button,
// because FDEs are reported as a branch of the primary business entity.
// `addTrustDetailRow` is real, but it's the Foreign Trust Activity builder
// on panel-step-gifts (layer1_us.html:3402), writing to
// `foreign_gifts_and_trusts.foreign_trust_details` — ported faithfully
// there instead, in GiftsStep.jsx.
//
// SCHEMA GAP: `foreign_entities.foreign_de_details` is declared as an empty
// array in schema.js but the vanilla source never actually populates it
// with structured rows (see above) — there is no ported row shape to copy.
// The row shape below (entity name, country, EIN/ref, functional currency,
// net income/loss) is a reasonable shape defined for this port, not derived
// from source, per the task's fallback instruction for undeclared array
// row shapes.
//
// The Form 5472 related-parties block is similarly a gap: the source only
// captures a single aggregate "Total Intercompany Payments" number into
// `corporate_international.form_5472_related_parties` as a synthetic
// one-item array (`[{amount_usd}]`) — not an actual repeatable UI, even
// though the field name is plural. Built here as a real repeatable list
// with reasonable per-row fields.
//
// BUG FIX (field-path collision + wrong gate, found by the step-by-step
// map audit): this block previously gated its visibility on
// `corporate_profile.is_foreign_owned_25_pct` — wrong on two counts.
// (1) The source's real `is_foreign_owned_25_pct` checkbox
// (layer1_us.html:812, on Onboarding) writes `profile.
// is_foreign_owned_25_pct`, not `corporate_profile.*` (see
// OnboardingStep.jsx's matching fix). (2) More fundamentally, the source
// doesn't gate this section on that flag's value at all —
// `updateProfileVisibility()` (layer1_us.html:7054-7068) shows the whole
// `wrapper-form-5472` container purely based on entity type: `if (type ===
// 'ccorp' && wrapper5472) { wrapper5472.style.display = 'block'; }` —
// C-Corp only, not any corp/partnership. The section's own inner checkbox
// (`form5472-toggle`) only expands/collapses the accordion
// (`onchange="toggleForm5472Section(this.checked)"` — no
// `updateStateField` call at all); it's ephemeral open/close UI state, not
// a persisted flag. Fixed below: the whole block is now gated on entity
// type matching the source, and its accordion state is local `useState`
// (ephemeral, matching the source) instead of a schema-field toggle.

const inputCls =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-muted font-semibold">
        {label}
        {hint ? (
          <span className="block normal-case tracking-normal font-normal text-[10px] text-muted/70 mt-0.5">
            {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

function TextInput(props) {
  return <input type="text" className={inputCls} {...props} />;
}

function NumberInput({ value, onChange, ...rest }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={inputCls + " font-mono"}
      value={value ?? ""}
      onChange={(e) => onChange(parseNum(e.target.value))}
      placeholder="0"
      {...rest}
    />
  );
}

function DateInput(props) {
  return <input type="date" className={inputCls} {...props} />;
}

function SelectInput({ children, ...rest }) {
  return (
    <select className={inputCls} {...rest}>
      {children}
    </select>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer bg-white/[0.02] border border-line rounded-lg px-3 py-2">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-white/[0.03] border-line text-brandGreen focus:ring-brandGreen w-4 h-4"
      />
      <span className="text-[11px] font-semibold text-body">{label}</span>
    </label>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-brandGreen transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
    </label>
  );
}

function AddButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 bg-white/[0.03] hover:bg-brandGreen/10 hover:text-brandGreen border border-line rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-all text-body"
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-red-400/50 hover:text-red-400 font-bold text-xs px-1 transition-colors"
      aria-label="Remove"
    >
      ✕
    </button>
  );
}

function SectionCard({ icon, title, subtitle, formLabel, enabled, onToggle, children }) {
  return (
    <div className="border border-line rounded-2xl bg-white/[0.02] overflow-hidden">
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-4">
          <span className="text-2xl">{icon}</span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-head">{title}</span>
            <span className="text-[10px] text-muted uppercase tracking-widest font-black">{formLabel}</span>
          </div>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      </div>
      {subtitle ? <p className="px-4 pb-3 text-[10px] text-muted -mt-2">{subtitle}</p> : null}
      {enabled ? <div className="p-4 border-t border-line flex flex-col gap-4 bg-black/10">{children}</div> : null}
    </div>
  );
}

function newCorpRow() {
  return {
    corporation_name: null,
    country_of_incorporation: null,
    ownership_percentage: 0,
    tax_year_start: null,
    transition_to_ncti_post_2026: false,
    cfc_status: "non_cfc_holding",
    nature_of_income: "active",
    local_tax_regime: "standard",
    dividends_planned: false,
    sec962_election_planned: false,
    has_constructive_ownership: false,
    has_capital_transfers: false,
    has_related_party_transactions: false,
    tested_income_usd: 0,
    tested_loss_usd: 0,
    subpart_f_income_usd: 0,
    ep_usd: 0,
    foreign_tax_paid_usd: 0,
  };
}

function newPartRow() {
  return {
    partnership_name: null,
    country_of_operations: null,
    ownership_percentage: null,
    form_8865_category: "category_4",
    local_entity_type: "llp",
    check_the_box_election: false,
    has_constructive_ownership: false,
    has_capital_transfers: false,
    has_related_party_transactions: false,
  };
}

function newDeRow() {
  return {
    entity_name: null,
    country: null,
    ein_or_ref_number: null,
    functional_currency: "USD",
    net_income_loss_usd: null,
  };
}

function new5472Row() {
  return {
    related_party_name: null,
    country: null,
    relationship_type: "foreign_parent",
    transaction_type: "other",
    amount_usd: null,
  };
}

export default function EntitiesStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const fe = usState.foreign_entities || {};
  const corps = fe.foreign_corporations || [];
  const parts = fe.foreign_partnerships || [];
  const des = fe.foreign_de_details || [];
  // Matches updateProfileVisibility()'s `type === 'ccorp'` check
  // (layer1_us.html:7058) exactly — C-Corp only, not any
  // corp/partnership, and resolved through the LLC election the same way
  // as everywhere else this pattern appears.
  const profile = usState.profile;
  const resolvedEntityType =
    profile.tax_entity_type === "llc" ? profile.llc_tax_election || "individual" : profile.tax_entity_type;
  const show5472Section = resolvedEntityType === "ccorp";
  const [is5472Open, setIs5472Open] = useState(false);
  const parties5472 = usState.corporate_international?.form_5472_related_parties || [];

  function patchCorp(idx, patch) {
    const merged = { ...corps[idx], ...patch };
    const pct = merged.ownership_percentage || 0;
    updateRow("foreign_entities.foreign_corporations", idx, {
      ...patch,
      cfc_status: pct > 50 ? "controlled_foreign_corporation" : "non_cfc_holding",
    });
  }

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-6">
      <div>
        <h2 className="text-head font-display font-bold text-lg">Foreign Entities</h2>
        <p className="text-muted text-xs mt-1">
          Report interests in foreign corporations (Form 5471), partnerships (Form 8865), or disregarded
          entities (Form 8858).
        </p>
      </div>

      <SectionCard
        icon="🌎"
        title="I own 10% or more of a foreign corporation"
        formLabel="Form 5471"
        enabled={fe.owns_10_percent_foreign_corp}
        onToggle={(v) => setField("foreign_entities.owns_10_percent_foreign_corp", v)}
      >
        <div className="flex justify-end">
          <AddButton onClick={() => addRow("foreign_entities.foreign_corporations", newCorpRow())}>
            + Add Corp
          </AddButton>
        </div>
        {corps.length === 0 ? (
          <p className="text-xs text-muted">No foreign corporations added yet.</p>
        ) : (
          corps.map((row, idx) => {
            const pct = row.ownership_percentage || 0;
            const isCfc = pct > 50;
            return (
              <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                    🏢 Corporation {idx + 1}
                  </span>
                  <RemoveButton onClick={() => removeRow("foreign_entities.foreign_corporations", idx)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Corporation Name">
                    <TextInput
                      placeholder="e.g. India Pvt Ltd"
                      value={row.corporation_name ?? ""}
                      onChange={(e) => patchCorp(idx, { corporation_name: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Country">
                    <TextInput
                      placeholder="e.g. India"
                      value={row.country_of_incorporation ?? ""}
                      onChange={(e) => patchCorp(idx, { country_of_incorporation: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Ownership Percentage (%)">
                    <NumberInput
                      value={row.ownership_percentage}
                      onChange={(v) => patchCorp(idx, { ownership_percentage: v || 0 })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Field label="Tax Year Start">
                    <DateInput
                      value={row.tax_year_start ?? ""}
                      onChange={(e) => patchCorp(idx, { tax_year_start: e.target.value || null })}
                    />
                  </Field>
                  <div className="flex items-center justify-between p-2 bg-white/[0.02] border border-line rounded-lg">
                    <span className="text-[10px] font-black text-muted tracking-wider">CFC Status (Derived)</span>
                    <span className="text-xs font-bold text-brandGreen uppercase">{isCfc ? "YES" : "NO"}</span>
                  </div>
                  <div className="md:col-span-2">
                    <Checkbox
                      label="Post-2026 NCTI Transition?"
                      checked={row.transition_to_ncti_post_2026}
                      onChange={(v) => patchCorp(idx, { transition_to_ncti_post_2026: v })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Nature of Income" hint="Drives GILTI/NCTI vs. Subpart F treatment">
                    <SelectInput
                      value={row.nature_of_income}
                      onChange={(e) => patchCorp(idx, { nature_of_income: e.target.value })}
                    >
                      <option value="active">Active Business (GILTI)</option>
                      <option value="passive">Passive/Investment (Subpart F)</option>
                      <option value="mixed">Mixed</option>
                    </SelectInput>
                  </Field>
                  <Field label="Local Tax Regime" hint="&gt;18.9% may qualify for GILTI High-Tax Exclusion">
                    <SelectInput
                      value={row.local_tax_regime}
                      onChange={(e) => patchCorp(idx, { local_tax_regime: e.target.value })}
                    >
                      <option value="standard">Standard (25% – 30%)</option>
                      <option value="concessional">Concessional (22%)</option>
                      <option value="manufacturing">New Mfg (15%)</option>
                      <option value="zero">Zero / Tax Holiday</option>
                    </SelectInput>
                  </Field>
                  <div className="flex items-end">
                    <Checkbox
                      label="Dividends Planned This Year?"
                      checked={row.dividends_planned}
                      onChange={(v) => patchCorp(idx, { dividends_planned: v })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Tested Income (USD)" hint="§951A(c)(2) — full figure, no QBAI subtraction (OBBBA TY2026)">
                    <NumberInput
                      value={row.tested_income_usd}
                      onChange={(v) => patchCorp(idx, { tested_income_usd: v || 0 })}
                    />
                  </Field>
                  <Field label="Tested Loss (USD)" hint="Positive number; netted across all CFCs">
                    <NumberInput
                      value={row.tested_loss_usd}
                      onChange={(v) => patchCorp(idx, { tested_loss_usd: v || 0 })}
                    />
                  </Field>
                  <Field label="Subpart F Income (USD)" hint="Capped at this entity's own E&P; never gets §250">
                    <NumberInput
                      value={row.subpart_f_income_usd}
                      onChange={(v) => patchCorp(idx, { subpart_f_income_usd: v || 0 })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Earnings & Profits (E&P, USD)" hint="Caps the Subpart F inclusion above">
                    <NumberInput value={row.ep_usd} onChange={(v) => patchCorp(idx, { ep_usd: v || 0 })} />
                  </Field>
                  {row.sec962_election_planned ? (
                    <Field
                      label="Foreign Corporate Tax Paid (USD)"
                      hint="90% becomes creditable deemed-paid FTC against the flat 21% §962 tax (OBBBA TY2026)"
                    >
                      <NumberInput
                        value={row.foreign_tax_paid_usd}
                        onChange={(v) => patchCorp(idx, { foreign_tax_paid_usd: v || 0 })}
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-brandGreen/5 border border-brandGreen/10 rounded-lg">
                  <Checkbox
                    label="Section 962 Election Planned?"
                    checked={row.sec962_election_planned}
                    onChange={(v) => patchCorp(idx, { sec962_election_planned: v })}
                  />
                  <Checkbox
                    label="Constructive/Family Ownership?"
                    checked={row.has_constructive_ownership}
                    onChange={(v) => patchCorp(idx, { has_constructive_ownership: v })}
                  />
                  <Checkbox
                    label="Acquired/Disposed/Capital Injected (Form 926)?"
                    checked={row.has_capital_transfers}
                    onChange={(v) => patchCorp(idx, { has_capital_transfers: v })}
                  />
                  <Checkbox
                    label="Related Party Transactions (Schedule M)?"
                    checked={row.has_related_party_transactions}
                    onChange={(v) => patchCorp(idx, { has_related_party_transactions: v })}
                  />
                </div>
              </div>
            );
          })
        )}
      </SectionCard>

      <SectionCard
        icon="🤝"
        title="I own 10% or more of a foreign partnership"
        formLabel="Form 8865"
        enabled={fe.owns_10_percent_foreign_partnership}
        onToggle={(v) => setField("foreign_entities.owns_10_percent_foreign_partnership", v)}
      >
        <div className="flex justify-end">
          <AddButton onClick={() => addRow("foreign_entities.foreign_partnerships", newPartRow())}>
            + Add Partnership
          </AddButton>
        </div>
        {parts.length === 0 ? (
          <p className="text-xs text-muted">No foreign partnerships added yet.</p>
        ) : (
          parts.map((row, idx) => (
            <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                  🤝 Partnership {idx + 1}
                </span>
                <RemoveButton onClick={() => removeRow("foreign_entities.foreign_partnerships", idx)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Partnership Name">
                  <TextInput
                    placeholder="e.g. Global Venture"
                    value={row.partnership_name ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { partnership_name: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Country of Operations">
                  <TextInput
                    placeholder="e.g. India"
                    value={row.country_of_operations ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { country_of_operations: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Ownership %">
                  <NumberInput
                    value={row.ownership_percentage}
                    onChange={(v) => updateRow("foreign_entities.foreign_partnerships", idx, { ownership_percentage: v })}
                  />
                </Field>
                <Field label="Form 8865 Category">
                  <SelectInput
                    value={row.form_8865_category}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { form_8865_category: e.target.value })
                    }
                  >
                    <option value="category_1">Category 1 (Control Partner)</option>
                    <option value="category_2">Category 2 (U.S. Partner / &gt;10% owned)</option>
                    <option value="category_3">Category 3 (Transferor of Property)</option>
                    <option value="category_4">Category 4 (Minority Partner / &lt;10%)</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-brandGreen/5 border border-brandGreen/10 rounded-lg">
                <Field label="Local Entity Type" hint="Indian LLPs are corps by default — Form 8832 required to elect partnership status">
                  <SelectInput
                    value={row.local_entity_type}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { local_entity_type: e.target.value })
                    }
                  >
                    <option value="llp">Limited Liability Partnership (LLP)</option>
                    <option value="traditional">Traditional Partnership Firm</option>
                    <option value="other">Other Pass-through</option>
                  </SelectInput>
                </Field>
                <div className="flex flex-col gap-2 justify-center">
                  <Checkbox
                    label="Form 8832 Check-the-Box Election Filed?"
                    checked={row.check_the_box_election}
                    onChange={(v) => updateRow("foreign_entities.foreign_partnerships", idx, { check_the_box_election: v })}
                  />
                  <Checkbox
                    label="Constructive/Family Ownership?"
                    checked={row.has_constructive_ownership}
                    onChange={(v) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { has_constructive_ownership: v })
                    }
                  />
                  <Checkbox
                    label="Capital Injected or Withdrawn this year?"
                    checked={row.has_capital_transfers}
                    onChange={(v) => updateRow("foreign_entities.foreign_partnerships", idx, { has_capital_transfers: v })}
                  />
                  <Checkbox
                    label="Related Party Transactions (Schedule M)?"
                    checked={row.has_related_party_transactions}
                    onChange={(v) =>
                      updateRow("foreign_entities.foreign_partnerships", idx, { has_related_party_transactions: v })
                    }
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard
        icon="👻"
        title="I own a foreign disregarded entity"
        formLabel="Form 8858"
        enabled={fe.owns_foreign_disregarded_entity}
        onToggle={(v) => setField("foreign_entities.owns_foreign_disregarded_entity", v)}
      >
        <p className="text-[11px] leading-relaxed text-brandGreen">
          Foreign Disregarded Entities (FDEs) must be reported as a branch/division of your primary entity.
          The source wizard redirects here to the Business step and creates no separate row editor for FDEs;
          this port additionally offers a lightweight FDE profile list below (schema gap — see file header).
        </p>
        <div className="flex justify-end">
          <AddButton onClick={() => addRow("foreign_entities.foreign_de_details", newDeRow())}>+ Add FDE</AddButton>
        </div>
        {des.length === 0 ? (
          <p className="text-xs text-muted">No foreign disregarded entities added yet.</p>
        ) : (
          des.map((row, idx) => (
            <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                  👻 FDE {idx + 1}
                </span>
                <RemoveButton onClick={() => removeRow("foreign_entities.foreign_de_details", idx)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Entity Name">
                  <TextInput
                    value={row.entity_name ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_de_details", idx, { entity_name: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Country">
                  <TextInput
                    value={row.country ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_de_details", idx, { country: e.target.value || null })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="EIN / Reference Number">
                  <TextInput
                    value={row.ein_or_ref_number ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_de_details", idx, { ein_or_ref_number: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Functional Currency">
                  <TextInput
                    value={row.functional_currency ?? ""}
                    onChange={(e) =>
                      updateRow("foreign_entities.foreign_de_details", idx, { functional_currency: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Net Income / (Loss) (USD)">
                  <NumberInput
                    value={row.net_income_loss_usd}
                    onChange={(v) => updateRow("foreign_entities.foreign_de_details", idx, { net_income_loss_usd: v })}
                  />
                </Field>
              </div>
            </div>
          ))
        )}
      </SectionCard>

      {show5472Section && (
      <SectionCard
        icon="🏢"
        title="The Company is 25% or more foreign-owned"
        formLabel="Form 5472 (Inbound)"
        enabled={is5472Open}
        onToggle={setIs5472Open}
      >
        <p className="text-xs text-muted">
          Foreign-owned US corporations must report intercompany transactions with their foreign owners.
        </p>
        <div className="flex justify-end">
          <AddButton onClick={() => addRow("corporate_international.form_5472_related_parties", new5472Row())}>
            + Add Related Party
          </AddButton>
        </div>
        {parties5472.length === 0 ? (
          <p className="text-xs text-muted">No related parties added yet.</p>
        ) : (
          parties5472.map((row, idx) => (
            <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Related Party {idx + 1}
                </span>
                <RemoveButton onClick={() => removeRow("corporate_international.form_5472_related_parties", idx)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Related Party Name">
                  <TextInput
                    value={row.related_party_name ?? ""}
                    onChange={(e) =>
                      updateRow("corporate_international.form_5472_related_parties", idx, {
                        related_party_name: e.target.value || null,
                      })
                    }
                  />
                </Field>
                <Field label="Country">
                  <TextInput
                    value={row.country ?? ""}
                    onChange={(e) =>
                      updateRow("corporate_international.form_5472_related_parties", idx, { country: e.target.value || null })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Relationship">
                  <SelectInput
                    value={row.relationship_type}
                    onChange={(e) =>
                      updateRow("corporate_international.form_5472_related_parties", idx, {
                        relationship_type: e.target.value,
                      })
                    }
                  >
                    <option value="foreign_parent">Foreign Parent</option>
                    <option value="foreign_shareholder_25pct">25%+ Foreign Shareholder</option>
                    <option value="related_foreign_affiliate">Related Foreign Affiliate</option>
                  </SelectInput>
                </Field>
                <Field label="Transaction Type">
                  <SelectInput
                    value={row.transaction_type}
                    onChange={(e) =>
                      updateRow("corporate_international.form_5472_related_parties", idx, {
                        transaction_type: e.target.value,
                      })
                    }
                  >
                    <option value="loans">Loans</option>
                    <option value="royalties">Royalties</option>
                    <option value="management_fees">Management Fees</option>
                    <option value="services">Services</option>
                    <option value="other">Other</option>
                  </SelectInput>
                </Field>
                <Field label="Total Intercompany Amount (USD)">
                  <NumberInput
                    value={row.amount_usd}
                    onChange={(v) =>
                      updateRow("corporate_international.form_5472_related_parties", idx, { amount_usd: v })
                    }
                  />
                </Field>
              </div>
            </div>
          ))
        )}
      </SectionCard>
      )}
    </div>
  );
}
