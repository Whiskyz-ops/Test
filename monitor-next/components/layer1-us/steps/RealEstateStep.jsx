"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html panel-step-real-estate (layer1_us.html:3129-3160)
// and its addPropertyRow/syncPropertiesState logic (layer1_us.html:19157-19283).
//
// Faithfully ported: has_real_estate_transaction toggle, per-property
// description, transaction type (holding/purchase/sale), acquisition/sale
// dates, cost basis, sale price, live-computed realized gain/loss (with the
// original's Section 121 primary-residence exclusion math — $250k single /
// $500k MFJ against usState.profile.filing_status — and Section 1031
// like-kind deferral zeroing the gain), and the two election checkboxes.
//
// SIMPLIFIED / ADDED: the source's property row has no rental
// income/expense/depreciation fields at all (those live on the Passive
// Income step as aggregate Schedule E figures, not per-property) — this
// component adds `rental_income_usd`, `rental_expenses_usd`, and
// `depreciation_taken_usd` per property since the task spec asked for them
// and a per-property breakdown is a reasonable superset; they are NOT
// consumed anywhere in layer1_us.html and are flagged here as additions,
// not a port.

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
    <label className="flex items-center justify-between gap-2 cursor-pointer bg-white/[0.02] border border-line rounded-lg px-3 py-2">
      <span className="text-xs text-body">{label}</span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-white/[0.03] border-line text-brandGreen focus:ring-brandGreen w-4 h-4"
      />
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
      className="self-start px-3 py-1.5 bg-white/[0.03] hover:bg-brandGreen/10 hover:text-brandGreen border border-line rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-all text-body"
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

function newPropertyRow() {
  return {
    property_description: null,
    transaction_type: "holding",
    acquisition_date: null,
    sale_date: null,
    cost_basis_usd: null,
    sale_price_usd: null,
    realized_gain_loss_usd: 0,
    s121_exclusion_claimed: false,
    s1031_like_kind_exchange: false,
    // Additions beyond source — see file header note.
    rental_income_usd: null,
    rental_expenses_usd: null,
    depreciation_taken_usd: null,
  };
}

// Ported verbatim from syncPropertiesState() (layer1_us.html:19250-19283).
function computeGain(row, filingStatus) {
  const basis = row.cost_basis_usd || 0;
  const price = row.sale_price_usd || 0;
  const raw = price - basis;
  if (row.s1031_like_kind_exchange) return 0;
  if (row.s121_exclusion_claimed) {
    const limit = filingStatus === "mfj" ? 500000 : 250000;
    return Math.max(0, raw - limit);
  }
  return raw;
}

export default function RealEstateStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const realEstate = usState.real_estate || { has_real_estate_transaction: false, properties: [] };
  const properties = realEstate.properties || [];
  const filingStatus = usState.profile?.filing_status;

  function patchProperty(idx, patch) {
    const merged = { ...properties[idx], ...patch };
    merged.realized_gain_loss_usd = computeGain(merged, filingStatus);
    updateRow("real_estate.properties", idx, merged);
  }

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-6">
      <div>
        <h2 className="text-head font-display font-bold text-lg">Real Estate</h2>
        <p className="text-muted text-xs mt-1">
          Declare property holdings and sales, including cost basis adjustments under regular US rules.
        </p>
      </div>

      <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-line rounded-2xl">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-body">Has Real Estate Transactions?</span>
          <span className="text-[10px] text-muted">
            Select Yes if you purchased, own, or sold property this year.
          </span>
        </div>
        <ToggleSwitch
          checked={realEstate.has_real_estate_transaction}
          onChange={(v) => setField("real_estate.has_real_estate_transaction", v)}
        />
      </div>

      {realEstate.has_real_estate_transaction ? (
        <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
              Real Estate Properties
            </span>
            <AddButton onClick={() => addRow("real_estate.properties", newPropertyRow())}>
              + Add Property
            </AddButton>
          </div>

          {properties.length === 0 ? (
            <p className="text-xs text-muted">No properties added yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {properties.map((row, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white/[0.02] border border-line rounded-xl relative flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                      🏠 Property {idx + 1}
                    </span>
                    <RemoveButton onClick={() => removeRow("real_estate.properties", idx)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Description / Address">
                      <TextInput
                        placeholder="e.g. Bangalore Apartment"
                        value={row.property_description ?? ""}
                        onChange={(e) => patchProperty(idx, { property_description: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Transaction Type">
                      <SelectInput
                        value={row.transaction_type}
                        onChange={(e) => patchProperty(idx, { transaction_type: e.target.value })}
                      >
                        <option value="holding">Holding</option>
                        <option value="purchase">Purchase</option>
                        <option value="sale">Sale</option>
                      </SelectInput>
                    </Field>
                    <Field label="Date Acquired">
                      <DateInput
                        value={row.acquisition_date ?? ""}
                        onChange={(e) => patchProperty(idx, { acquisition_date: e.target.value || null })}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Field label="Date Sold">
                      <DateInput
                        value={row.sale_date ?? ""}
                        onChange={(e) => patchProperty(idx, { sale_date: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Cost Basis §1012 (USD)">
                      <NumberInput
                        value={row.cost_basis_usd}
                        onChange={(v) => patchProperty(idx, { cost_basis_usd: v })}
                      />
                    </Field>
                    <Field label="Sale Price (USD)">
                      <NumberInput
                        value={row.sale_price_usd}
                        onChange={(v) => patchProperty(idx, { sale_price_usd: v })}
                      />
                    </Field>
                    <Field label="Realized Gain / Loss" hint="Auto-computed">
                      <input
                        type="text"
                        disabled
                        className={inputCls + " font-mono opacity-60"}
                        value={(row.realized_gain_loss_usd ?? 0).toFixed ? row.realized_gain_loss_usd.toFixed(2) : row.realized_gain_loss_usd}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Checkbox
                      label="Claim §121 Primary Exclusion ($250k / $500k)?"
                      checked={row.s121_exclusion_claimed}
                      onChange={(v) => patchProperty(idx, { s121_exclusion_claimed: v })}
                    />
                    <Checkbox
                      label="Claim §1031 Like-Kind Exchange?"
                      checked={row.s1031_like_kind_exchange}
                      onChange={(v) => patchProperty(idx, { s1031_like_kind_exchange: v })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-line">
                    <Field label="Rental Income (USD)" hint="Added — not in source, see header note">
                      <NumberInput
                        value={row.rental_income_usd}
                        onChange={(v) => patchProperty(idx, { rental_income_usd: v })}
                      />
                    </Field>
                    <Field label="Rental Expenses (USD)" hint="Added — not in source, see header note">
                      <NumberInput
                        value={row.rental_expenses_usd}
                        onChange={(v) => patchProperty(idx, { rental_expenses_usd: v })}
                      />
                    </Field>
                    <Field label="Depreciation Taken (USD)" hint="Added — not in source, see header note">
                      <NumberInput
                        value={row.depreciation_taken_usd}
                        onChange={(v) => patchProperty(idx, { depreciation_taken_usd: v })}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
