"use client";

import { useMemo } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html panel-step-gifts (layer1_us.html:3389-3437),
// addTrustDetailRow/syncTrustDetailState (layer1_us.html:19686-19806),
// addGiftRow/syncGiftState (layer1_us.html:19808-19938), and
// checkGiftThresholds() (layer1_us.html:23790-23864).
//
// NOTE: `addTrustDetailRow` is the real source of `foreign_trust_details`
// (confirmed by grep — it lives on THIS panel, not step-entities as the
// task brief guessed; see EntitiesStep.jsx's header for the correction).
// The "Foreign Trust Activity" section is always visible in the source (no
// gating checkbox) — `is_us_beneficiary_of_foreign_trust` is a DERIVED
// output (true if any trust-detail row shows a distribution, or any gift
// row is flagged as trust-beneficiary), not an input gate. Ported that way
// here: shown as a read-only computed indicator, not a toggle.
//
// Faithful: gift row fields (donor type/relationship/country/date/amount,
// related group, trust-beneficiary + covered-expatriate flags), trust
// detail row fields (name/country/EIN or ref/relationship, distribution
// date+amount, foreign-grantor-trust + 3520-A-received flags), the
// received_foreign_gifts_above_100k gate on the gift list/add button, and
// the exact per-row / aggregate-by-group Form 3520 threshold warnings
// ($100k single foreign-individual/estate gift, $20,573 single foreign
// corp/partnership gift, same aggregated-by-related-group thresholds,
// foreign-trust-distribution warning, and the $19,000 covered-expatriate
// Section 2801 / Form 708 warning).

const inputCls =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</label>
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

function newGiftRow() {
  return {
    donor_relationship_details: null,
    donor_country: null,
    gift_date: null,
    donor_entity_type: "individual",
    related_group: "none",
    gift_value_usd: null,
    is_beneficiary_of_foreign_trust: false,
    is_gift_from_covered_expatriate: false,
  };
}

function newTrustDetailRow() {
  return {
    trust_name: null,
    trust_country: null,
    trust_ein_or_ref_number: null,
    relationship_to_trust: "beneficiary",
    distribution_date: null,
    distribution_amount_usd: null,
    is_foreign_grantor_trust: false,
    received_3520a_statement: false,
  };
}

// Ported verbatim from checkGiftThresholds() (layer1_us.html:23790-23864).
function computeGiftWarnings(gifts) {
  const groups = {
    A: { total: 0, hasIndividual: false },
    B: { total: 0, hasIndividual: false },
    C: { total: 0, hasIndividual: false },
  };
  let hasTrust = false;
  let hasExpat = false;
  const warnings = [];

  gifts.forEach((g) => {
    if (g.is_beneficiary_of_foreign_trust) hasTrust = true;
    if (g.is_gift_from_covered_expatriate) hasExpat = true;

    const type = (g.donor_entity_type || "").toLowerCase();
    const amount = g.gift_value_usd || 0;
    const group = g.related_group || "none";
    const isIndividual = type === "individual" || type === "estate";

    if (group === "none" || !groups[group]) {
      if (isIndividual && amount > 100000) {
        warnings.push("A single gift from a foreign individual/estate exceeds $100,000. You must file Form 3520.");
      } else if (!isIndividual && amount > 20573) {
        warnings.push("A single gift from a foreign corporation/partnership exceeds $20,573. You must file Form 3520.");
      }
    } else {
      groups[group].total += amount;
      if (isIndividual) groups[group].hasIndividual = true;
    }
  });

  for (const [gName, gData] of Object.entries(groups)) {
    if (gData.total === 0) continue;
    const threshold = gData.hasIndividual ? 100000 : 20573;
    if (gData.total > threshold) {
      const entityTypeStr = gData.hasIndividual ? "individuals/estates" : "corporations/partnerships";
      warnings.push(
        `Aggregate gifts in Group ${gName} exceed the $${threshold.toLocaleString()} threshold for related ${entityTypeStr}. You must file Form 3520.`
      );
    }
  }

  if (hasTrust) {
    warnings.push("Receiving a distribution from a foreign trust triggers Form 3520 and potentially Form 3520-A.");
  }
  if (hasExpat) {
    warnings.push(
      "You have received a gift from a Covered Expatriate. Aggregate amounts exceeding the $19,000 annual exclusion are subject to a 40% transfer tax under Section 2801 (Form 708)."
    );
  }

  return warnings;
}

export default function GiftsStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const fgt = usState.foreign_gifts_and_trusts || {};
  const gifts = fgt.foreign_gifts || [];
  const trustDetails = fgt.foreign_trust_details || [];

  const warnings = useMemo(() => computeGiftWarnings(gifts), [gifts]);

  // Ported from syncTrustDetailState() / syncGiftState()'s roll-up
  // (layer1_us.html:19781-19806, 19909-19938): true if any gift row is
  // flagged as trust-beneficiary OR any trust-detail row shows a real
  // distribution.
  const isUsBeneficiary = useMemo(() => {
    const hasDistribution = trustDetails.some((t) => t.distribution_date || (t.distribution_amount_usd || 0) > 0);
    return hasDistribution || gifts.some((g) => g.is_beneficiary_of_foreign_trust);
  }, [gifts, trustDetails]);

  const hasCoveredExpatGift = gifts.some((g) => g.is_gift_from_covered_expatriate);

  function syncDerivedFlags(nextGifts, nextTrustDetails) {
    const hasDistribution = nextTrustDetails.some((t) => t.distribution_date || (t.distribution_amount_usd || 0) > 0);
    const nextIsBeneficiary = hasDistribution || nextGifts.some((g) => g.is_beneficiary_of_foreign_trust);
    setField("foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust", nextIsBeneficiary);
    setField(
      "foreign_gifts_and_trusts.received_gift_from_covered_expatriate",
      nextGifts.some((g) => g.is_gift_from_covered_expatriate)
    );
  }

  function patchGift(idx, patch) {
    const nextGifts = gifts.map((g, i) => (i === idx ? { ...g, ...patch } : g));
    updateRow("foreign_gifts_and_trusts.foreign_gifts", idx, patch);
    syncDerivedFlags(nextGifts, trustDetails);
  }

  function patchTrustDetail(idx, patch) {
    const nextTrustDetails = trustDetails.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    updateRow("foreign_gifts_and_trusts.foreign_trust_details", idx, patch);
    syncDerivedFlags(gifts, nextTrustDetails);
  }

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-6">
      <div>
        <h2 className="text-head font-display font-bold text-lg">Foreign Gifts &amp; Trusts (Form 3520)</h2>
        <p className="text-muted text-xs mt-1">
          Report gifts received from foreign donors or foreign trust activities.
        </p>
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-body uppercase tracking-wide">
              Foreign Trust Activity (Owner or Beneficiary)
            </span>
            <span className="text-[10px] text-muted">
              Identify each foreign trust you're a grantor/owner of, or received a distribution from, this year.
            </span>
          </div>
          <AddButton onClick={() => addRow("foreign_gifts_and_trusts.foreign_trust_details", newTrustDetailRow())}>
            + Add Trust
          </AddButton>
        </div>

        <div className="flex items-center justify-between p-2 bg-white/[0.02] border border-line rounded-lg">
          <span className="text-[11px] text-muted">US Beneficiary of Foreign Trust? (auto-derived)</span>
          <span className={"text-xs font-black uppercase " + (isUsBeneficiary ? "text-brandGreen" : "text-muted")}>
            {isUsBeneficiary ? "Yes" : "No"}
          </span>
        </div>

        {trustDetails.length === 0 ? (
          <p className="text-xs text-muted">No foreign trusts added yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {trustDetails.map((row, idx) => (
              <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                    🏛️ Trust {idx + 1}
                  </span>
                  <RemoveButton
                    onClick={() => {
                      removeRow("foreign_gifts_and_trusts.foreign_trust_details", idx);
                      syncDerivedFlags(gifts, trustDetails.filter((_, i) => i !== idx));
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Trust Name">
                    <TextInput
                      placeholder="e.g. Sharma Family Trust"
                      value={row.trust_name ?? ""}
                      onChange={(e) => patchTrustDetail(idx, { trust_name: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Trust Country">
                    <TextInput
                      placeholder="e.g. India"
                      value={row.trust_country ?? ""}
                      onChange={(e) => patchTrustDetail(idx, { trust_country: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Trust EIN / Reference Number">
                    <TextInput
                      placeholder="if no EIN, use a reference number"
                      value={row.trust_ein_or_ref_number ?? ""}
                      onChange={(e) => patchTrustDetail(idx, { trust_ein_or_ref_number: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Your Relationship">
                    <SelectInput
                      value={row.relationship_to_trust}
                      onChange={(e) => patchTrustDetail(idx, { relationship_to_trust: e.target.value })}
                    >
                      <option value="beneficiary">Beneficiary</option>
                      <option value="grantor_owner">Grantor/Owner</option>
                      <option value="transferor">Transferor</option>
                    </SelectInput>
                  </Field>
                </div>
                <div className="text-[10px] font-bold text-muted uppercase border-b border-line pb-1">
                  Distribution Received This Year (Form 3520 Part III)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Distribution Date (leave blank if none)">
                    <DateInput
                      value={row.distribution_date ?? ""}
                      onChange={(e) => patchTrustDetail(idx, { distribution_date: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Distribution Amount (USD)">
                    <NumberInput
                      value={row.distribution_amount_usd}
                      onChange={(v) => patchTrustDetail(idx, { distribution_amount_usd: v })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-brandGreen/5 border border-brandGreen/10 rounded-lg">
                  <Checkbox
                    label="Foreign Grantor Trust?"
                    checked={row.is_foreign_grantor_trust}
                    onChange={(v) => patchTrustDetail(idx, { is_foreign_grantor_trust: v })}
                  />
                  <Checkbox
                    label="Received Form 3520-A Beneficiary/Owner Statement?"
                    checked={row.received_3520a_statement}
                    onChange={(v) => patchTrustDetail(idx, { received_3520a_statement: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-body uppercase tracking-wide">Received Foreign Gifts (Any Amount)?</span>
            <span className="text-[10px] text-muted">Aggregated from foreign individuals or corporations.</span>
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch
              checked={fgt.received_foreign_gifts_above_100k}
              onChange={(v) => setField("foreign_gifts_and_trusts.received_foreign_gifts_above_100k", v)}
            />
            {fgt.received_foreign_gifts_above_100k ? (
              <AddButton onClick={() => addRow("foreign_gifts_and_trusts.foreign_gifts", newGiftRow())}>
                + Add Gift
              </AddButton>
            ) : null}
          </div>
        </div>

        {fgt.received_foreign_gifts_above_100k ? (
          <>
            {gifts.length === 0 ? (
              <p className="text-xs text-muted">No gifts added yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {gifts.map((row, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                        🎁 Gift {idx + 1}
                      </span>
                      <RemoveButton
                        onClick={() => {
                          removeRow("foreign_gifts_and_trusts.foreign_gifts", idx);
                          syncDerivedFlags(gifts.filter((_, i) => i !== idx), trustDetails);
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="Donor Entity Type">
                        <SelectInput
                          value={row.donor_entity_type}
                          onChange={(e) => patchGift(idx, { donor_entity_type: e.target.value })}
                        >
                          <option value="individual">Individual</option>
                          <option value="estate">Estate</option>
                          <option value="corporation">Corporation</option>
                          <option value="partnership">Partnership</option>
                          <option value="trust">Trust</option>
                        </SelectInput>
                      </Field>
                      <Field label="Related Group (Optional)">
                        <SelectInput
                          value={row.related_group}
                          onChange={(e) => patchGift(idx, { related_group: e.target.value })}
                        >
                          <option value="none">None (Unrelated)</option>
                          <option value="A">Group A</option>
                          <option value="B">Group B</option>
                          <option value="C">Group C</option>
                        </SelectInput>
                      </Field>
                      <Field label="Donor Name/Relationship">
                        <TextInput
                          placeholder="e.g. Father"
                          value={row.donor_relationship_details ?? ""}
                          onChange={(e) => patchGift(idx, { donor_relationship_details: e.target.value || null })}
                        />
                      </Field>
                      <Field label="Donor Country">
                        <TextInput
                          placeholder="e.g. India"
                          value={row.donor_country ?? ""}
                          onChange={(e) => patchGift(idx, { donor_country: e.target.value || null })}
                        />
                      </Field>
                      <Field label="Date Received">
                        <DateInput
                          value={row.gift_date ?? ""}
                          onChange={(e) => patchGift(idx, { gift_date: e.target.value || null })}
                        />
                      </Field>
                      <Field label="Amount (USD)">
                        <NumberInput
                          value={row.gift_value_usd}
                          onChange={(v) => patchGift(idx, { gift_value_usd: v })}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-brandGreen/5 border border-brandGreen/10 rounded-lg">
                      <Checkbox
                        label="Beneficiary of Foreign Trust?"
                        checked={row.is_beneficiary_of_foreign_trust}
                        onChange={(v) => patchGift(idx, { is_beneficiary_of_foreign_trust: v })}
                      />
                      <Checkbox
                        label="Gift from Covered Expatriate?"
                        checked={row.is_gift_from_covered_expatriate}
                        onChange={(v) => patchGift(idx, { is_gift_from_covered_expatriate: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {warnings.length > 0 ? (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-red-400 text-[11px] font-bold flex flex-col gap-2">
                {warnings.map((w, i) => (
                  <span key={i} className="flex items-start gap-2">
                    <span className="shrink-0">⚠️</span>
                    <span>{w}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {hasCoveredExpatGift ? (
        <p className="text-[10px] text-muted">
          received_gift_from_covered_expatriate is set from the per-row flags above (auto-derived, matches the
          source's roll-up behavior).
        </p>
      ) : null}
    </div>
  );
}
