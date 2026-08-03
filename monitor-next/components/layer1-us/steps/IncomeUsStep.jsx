"use client";

import { useUsLayer1Store } from "../../../lib/layer1-us/store";

// Ported from layer1_us.html's `panel-step-income-us` (employment/W-2 upload
// zone, layer1_us.html:1791-1829) plus the `income_us_source` scalar fields
// that live on the `panel-step-capgains` and `panel-step-passive` panels
// (layer1_us.html:1832-2217) — those panels write into the SAME
// `usState.income_us_source` object this step owns in the React port, so
// per the task brief they're consolidated onto this one screen instead of
// re-split across three.
//
// NAMING BUG FIXED (verification pass): this component previously read/
// wrote `income_us_source.w2_wages`, a name that collides with nothing the
// DAG expects. Both DAG engines hardcode `income_us_source.wages_w2[]`
// (dag_py/src/wising_dag/us/aggregate_us_income.py:174,605-612 and
// us5_penalty_72t.py:87,90,135,138; monitor-next/lib/dag/us5-nodes.js:87,159
// and aggregateusincome-nodes.js:398) — every W-2 a user entered under the
// old name was silently invisible to tax computation (wages, withholding,
// everything derived from W-2 data). Renamed to `wages_w2` to match
// schema.js and both DAG engines exactly.

const num = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
};

function Card({ title, headerRight, children }) {
  return (
    <section className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">{title}</span>
        {headerRight}
      </div>
      {children}
    </section>
  );
}

function MasterToggle({ checked, onChange, label = "Enabled" }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line accent-brandGreen"
      />
      <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</span>
    </label>
  );
}

function LabeledNumber({ label, hint, value, onChange, placeholder = "0", readOnly = false }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
        {label}
        {hint ? (
          <span className="block text-[10px] normal-case tracking-normal text-muted/70 font-normal mt-0.5">{hint}</span>
        ) : null}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={value === null || value === undefined ? "" : value}
        onChange={readOnly ? undefined : (e) => onChange(num(e.target.value))}
        readOnly={readOnly}
        placeholder={placeholder}
        className={
          "w-full rounded-lg border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none " +
          (readOnly ? "bg-white/[0.01] text-muted cursor-not-allowed" : "bg-white/[0.03] focus:border-brandGreen/50")
        }
      />
    </div>
  );
}

function LabeledText({ label, hint, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
        {label}
        {hint ? (
          <span className="block text-[10px] normal-case tracking-normal text-muted/70 font-normal mt-0.5">{hint}</span>
        ) : null}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50"
      />
    </div>
  );
}

function CheckRow({ checked, onChange, label, sublabel }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-line cursor-pointer hover:border-brandGreen/30 transition-colors">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line accent-brandGreen shrink-0"
      />
      <span className="flex flex-col">
        <span className="text-sm text-body">{label}</span>
        {sublabel ? <span className="text-[11px] text-muted mt-0.5">{sublabel}</span> : null}
      </span>
    </label>
  );
}

function AddButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start px-3 py-1.5 rounded-lg bg-white/[0.03] border border-line text-[11px] uppercase tracking-wide font-semibold text-brandGreen hover:bg-brandGreen/10 hover:border-brandGreen/40 transition-colors"
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick, title = "Remove" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm leading-none"
    >
      ×
    </button>
  );
}

// ---- W-2 row default shapes (mirrors layer1_us.html's syncW2sState()) -----

function newW2Row() {
  return {
    employer_name: null,
    employer_street: null,
    employer_city: null,
    employer_state: null,
    employer_zip: null,
    wages_box1_usd: null,
    qualified_tip_income_usd: null,
    qualified_overtime_premium_usd: null,
    tax_details_collapsed_by_default: {
      employer_ein: null,
      control_number: null,
      federal_tax_withheld_usd: null,
      ss_wages_box3_usd: null,
      ss_tax_withheld_usd: null,
      medicare_wages_box5_usd: null,
      medicare_tax_withheld_usd: null,
      ss_tips_box7_usd: null,
      allocated_tips_box8_usd: null,
      dependent_care_benefits_box10_usd: null,
      nonqualified_plans_box11_usd: null,
    },
    is_statutory_employee: false,
    has_retirement_plan: false,
    has_third_party_sick_pay: false,
    has_state_taxes: false,
    state_and_local_taxes: [],
    has_special_box12_benefits: false,
    box_12_benefits: [],
    box_14_other: [],
  };
}

function newW2StateRow() {
  return {
    state_code_box15: null,
    state_wages_box16_usd: null,
    state_tax_withheld_box17_usd: null,
    local_wages_box18_usd: null,
    local_tax_withheld_box19_usd: null,
    locality_name_box20: null,
  };
}

function newW2CodeRow() {
  return { code: null, amount_usd: null };
}

function newCryptoRow() {
  return {
    asset_name: null,
    acquisition_date: null,
    sale_date: null,
    acquisition_cost_usd: null,
    sale_proceeds_usd: null,
    realized_gain_loss_usd: 0,
  };
}

// ---- W-2 nested row editor -------------------------------------------------

function W2RowEditor({ index, row }) {
  const { updateRow } = useUsLayer1Store();
  const path = "income_us_source.wages_w2";

  const patch = (p) => updateRow(path, index, p);
  const patchTax = (p) =>
    patch({ tax_details_collapsed_by_default: { ...row.tax_details_collapsed_by_default, ...p } });

  const stateRows = row.state_and_local_taxes || [];
  const box12 = row.box_12_benefits || [];
  const box14 = row.box_14_other || [];

  const setStateRow = (i, p) =>
    patch({ state_and_local_taxes: stateRows.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const addStateRow = () => patch({ state_and_local_taxes: [...stateRows, newW2StateRow()] });
  const removeStateRow = (i) => patch({ state_and_local_taxes: stateRows.filter((_, idx) => idx !== i) });

  const setBox12Row = (i, p) => patch({ box_12_benefits: box12.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const addBox12Row = () => patch({ box_12_benefits: [...box12, newW2CodeRow()] });
  const removeBox12Row = (i) => patch({ box_12_benefits: box12.filter((_, idx) => idx !== i) });

  const setBox14Row = (i, p) => patch({ box_14_other: box14.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const addBox14Row = () => patch({ box_14_other: [...box14, newW2CodeRow()] });
  const removeBox14Row = (i) => patch({ box_14_other: box14.filter((_, idx) => idx !== i) });

  const { removeRow } = useUsLayer1Store();

  return (
    <div className="relative rounded-xl bg-white/[0.02] border border-line p-4 flex flex-col gap-4">
      <RemoveButton onClick={() => removeRow(path, index)} title="Remove W-2" />
      <div className="text-[11px] uppercase tracking-wide text-brandGreen font-semibold">
        W-2 #{index + 1}
        {row.employer_name ? <span className="text-muted normal-case tracking-normal font-normal"> — {row.employer_name}</span> : null}
      </div>

      {/* Basics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LabeledText label="Employer Name" value={row.employer_name} onChange={(v) => patch({ employer_name: v })} placeholder="e.g. Acme Corp" />
        <LabeledNumber
          label="Wages (Box 1)"
          hint="IRC §61 gross income — above-the-line deductions applied separately."
          value={row.wages_box1_usd}
          onChange={(v) => patch({ wages_box1_usd: v })}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <LabeledText label="Employer Address" value={row.employer_street} onChange={(v) => patch({ employer_street: v })} placeholder="123 Main St" />
        </div>
        <LabeledText label="City" value={row.employer_city} onChange={(v) => patch({ employer_city: v })} placeholder="e.g. New York" />
        <div className="grid grid-cols-2 gap-2">
          <LabeledText label="State" value={row.employer_state} onChange={(v) => patch({ employer_state: v })} placeholder="NY" />
          <LabeledText label="ZIP" value={row.employer_zip} onChange={(v) => patch({ employer_zip: v })} placeholder="10001" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LabeledNumber
          label="Qualified Tip Income"
          hint="Included in Box 1 — voluntary tips, occupation customarily tipped as of 12/31/2024."
          value={row.qualified_tip_income_usd}
          onChange={(v) => patch({ qualified_tip_income_usd: v })}
        />
        <LabeledNumber
          label="Qualified Overtime Premium Pay"
          hint="Included in Box 1 — FLSA §7 half-time premium only."
          value={row.qualified_overtime_premium_usd}
          onChange={(v) => patch({ qualified_overtime_premium_usd: v })}
        />
      </div>

      {/* Federal / FICA */}
      <div className="border-t border-line pt-3 flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">Federal Taxes &amp; Boxes 2-11</span>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <LabeledText label="Employer EIN" value={row.tax_details_collapsed_by_default.employer_ein} onChange={(v) => patchTax({ employer_ein: v })} placeholder="XX-XXXXXXX" />
          <LabeledText label="Control Number (Box d)" value={row.tax_details_collapsed_by_default.control_number} onChange={(v) => patchTax({ control_number: v })} placeholder="Optional" />
          <LabeledNumber label="Federal Tax Withheld" value={row.tax_details_collapsed_by_default.federal_tax_withheld_usd} onChange={(v) => patchTax({ federal_tax_withheld_usd: v })} />
          <LabeledNumber label="Social Security Wages" value={row.tax_details_collapsed_by_default.ss_wages_box3_usd} onChange={(v) => patchTax({ ss_wages_box3_usd: v })} />
          <LabeledNumber label="Social Security Tax Withheld" value={row.tax_details_collapsed_by_default.ss_tax_withheld_usd} onChange={(v) => patchTax({ ss_tax_withheld_usd: v })} />
          <LabeledNumber label="Medicare Wages" value={row.tax_details_collapsed_by_default.medicare_wages_box5_usd} onChange={(v) => patchTax({ medicare_wages_box5_usd: v })} />
          <LabeledNumber label="Medicare Tax Withheld" value={row.tax_details_collapsed_by_default.medicare_tax_withheld_usd} onChange={(v) => patchTax({ medicare_tax_withheld_usd: v })} />
          <LabeledNumber label="Social Security Tips" value={row.tax_details_collapsed_by_default.ss_tips_box7_usd} onChange={(v) => patchTax({ ss_tips_box7_usd: v })} />
          <LabeledNumber label="Allocated Tips" value={row.tax_details_collapsed_by_default.allocated_tips_box8_usd} onChange={(v) => patchTax({ allocated_tips_box8_usd: v })} />
          <LabeledNumber label="Dependent Care Benefits" value={row.tax_details_collapsed_by_default.dependent_care_benefits_box10_usd} onChange={(v) => patchTax({ dependent_care_benefits_box10_usd: v })} />
          <LabeledNumber label="Nonqualified Plans" value={row.tax_details_collapsed_by_default.nonqualified_plans_box11_usd} onChange={(v) => patchTax({ nonqualified_plans_box11_usd: v })} />
        </div>
      </div>

      {/* Status flags */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <CheckRow checked={row.is_statutory_employee} onChange={(v) => patch({ is_statutory_employee: v })} label="Statutory Employee" />
        <CheckRow checked={row.has_retirement_plan} onChange={(v) => patch({ has_retirement_plan: v })} label="Retirement Plan (Box 13)" />
        <CheckRow checked={row.has_third_party_sick_pay} onChange={(v) => patch({ has_third_party_sick_pay: v })} label="3rd-Party Sick Pay" />
      </div>

      {/* State / local taxes */}
      <div className="border-t border-line pt-3 flex flex-col gap-3">
        <CheckRow
          checked={row.has_state_taxes}
          onChange={(v) => {
            patch({ has_state_taxes: v });
            if (v && stateRows.length === 0) addStateRow();
          }}
          label="Has State or Local Taxes (Boxes 15-20)"
        />
        {row.has_state_taxes ? (
          <div className="flex flex-col gap-2">
            {stateRows.map((sr, i) => (
              <div key={i} className="relative grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-black/20 p-3 rounded-lg border border-line">
                <RemoveButton onClick={() => removeStateRow(i)} title="Remove state row" />
                <LabeledText label="State" value={sr.state_code_box15} onChange={(v) => setStateRow(i, { state_code_box15: v })} placeholder="e.g. CA" />
                <LabeledNumber label="State Wages" value={sr.state_wages_box16_usd} onChange={(v) => setStateRow(i, { state_wages_box16_usd: v })} />
                <LabeledNumber label="State Tax Withheld" value={sr.state_tax_withheld_box17_usd} onChange={(v) => setStateRow(i, { state_tax_withheld_box17_usd: v })} />
                <LabeledNumber label="Local Wages" value={sr.local_wages_box18_usd} onChange={(v) => setStateRow(i, { local_wages_box18_usd: v })} />
                <LabeledNumber label="Local Tax Withheld" value={sr.local_tax_withheld_box19_usd} onChange={(v) => setStateRow(i, { local_tax_withheld_box19_usd: v })} />
                <LabeledText label="Locality Name" value={sr.locality_name_box20} onChange={(v) => setStateRow(i, { locality_name_box20: v })} placeholder="e.g. NYC" />
              </div>
            ))}
            <AddButton onClick={addStateRow}>+ Add State/Local Tax Row</AddButton>
          </div>
        ) : null}
      </div>

      {/* Box 12 / Box 14 */}
      <div className="border-t border-line pt-3 flex flex-col gap-3">
        <CheckRow
          checked={row.has_special_box12_benefits}
          onChange={(v) => patch({ has_special_box12_benefits: v })}
          label="Add Benefits / Special Status (Boxes 12-14)"
        />
        {row.has_special_box12_benefits ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-muted">Box 12 — single/double letter code (A-HH) and amount.</span>
              <p className="text-[10px] text-muted -mt-1">
                💡 Keep an eye out for Box 12 — codes like D, E, or W can instantly unlock tax savings!
                <span className="nerd-text">
                  Codes D/E indicate Sec. 402(g) elective deferrals. Code W represents Sec. 223 HSA contributions.
                </span>
              </p>
              {box12.map((br, i) => (
                <div key={i} className="relative grid grid-cols-1 md:grid-cols-2 gap-2 items-end bg-black/20 p-3 rounded-lg border border-line">
                  <RemoveButton onClick={() => removeBox12Row(i)} title="Remove Box 12 row" />
                  <LabeledText label="Code" value={br.code} onChange={(v) => setBox12Row(i, { code: v })} placeholder="e.g. D" />
                  <LabeledNumber label="Amount" value={br.amount_usd} onChange={(v) => setBox12Row(i, { amount_usd: v })} />
                </div>
              ))}
              <AddButton onClick={addBox12Row}>+ Add Box 12 Benefit</AddButton>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-muted">Box 14 — custom codes (e.g. CA CASDI, Union Dues).</span>
              {box14.map((br, i) => (
                <div key={i} className="relative grid grid-cols-1 md:grid-cols-2 gap-2 items-end bg-black/20 p-3 rounded-lg border border-line">
                  <RemoveButton onClick={() => removeBox14Row(i)} title="Remove Box 14 row" />
                  <LabeledText label="Box 14 Code/Desc" value={br.code} onChange={(v) => setBox14Row(i, { code: v })} placeholder="e.g. CASDI" />
                  <LabeledNumber label="Amount" value={br.amount_usd} onChange={(v) => setBox14Row(i, { amount_usd: v })} />
                </div>
              ))}
              <AddButton onClick={addBox14Row}>+ Add Box 14 (Other)</AddButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---- Crypto nested row editor ---------------------------------------------

function CryptoRowEditor({ index, row }) {
  const { updateRow, removeRow } = useUsLayer1Store();
  const path = "income_us_source.crypto_transactions";

  const patch = (p) => {
    const next = { ...row, ...p };
    const cost = next.acquisition_cost_usd || 0;
    const proceeds = next.sale_proceeds_usd || 0;
    next.realized_gain_loss_usd = proceeds - cost;
    updateRow(path, index, next);
  };

  return (
    <div className="relative rounded-xl bg-white/[0.02] border border-line p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <RemoveButton onClick={() => removeRow(path, index)} title="Remove crypto transaction" />
      <LabeledText label="Asset Name" value={row.asset_name} onChange={(v) => patch({ asset_name: v })} placeholder="e.g. BTC" />
      <LabeledText label="Date Acquired" type="date" value={row.acquisition_date} onChange={(v) => patch({ acquisition_date: v })} />
      <LabeledText label="Date Sold" type="date" value={row.sale_date} onChange={(v) => patch({ sale_date: v })} />
      <LabeledNumber label="Acquisition Cost (USD)" value={row.acquisition_cost_usd} onChange={(v) => patch({ acquisition_cost_usd: v })} />
      <LabeledNumber label="Sale Proceeds (USD)" value={row.sale_proceeds_usd} onChange={(v) => patch({ sale_proceeds_usd: v })} />
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Realized Gain/Loss (USD)</label>
        <input
          type="text"
          disabled
          value={(row.realized_gain_loss_usd ?? 0).toFixed ? row.realized_gain_loss_usd.toFixed(2) : row.realized_gain_loss_usd ?? 0}
          className="w-full rounded-lg bg-white/[0.02] border border-line px-3 py-2 text-sm text-muted font-mono cursor-not-allowed"
        />
      </div>
    </div>
  );
}

export default function IncomeUsStep() {
  const { usState, setField, addRow } = useUsLayer1Store();
  const income = usState.income_us_source;
  const set = (field, value) => setField(`income_us_source.${field}`, value);

  // BUG FIX (verification pass): this card duplicates PassiveStep's
  // Schedule B interest fields (see the file-header note — three screens,
  // IncomeUsStep/PassiveStep/BankSyncStep, all write income_us_bank_usd
  // et al. into the same income_us_source object). PassiveStep already
  // recomputes interest_us_source_usd on every sub-field edit, mirroring
  // the source's syncUsInterestTotal() (layer1_us.html:8632-8646). This
  // card's plain `set()` calls did not, so interest_us_source_usd (which
  // feeds AGI/AMTI/NIIT) went stale for anyone who entered interest here
  // instead of on the Passive Income screen. setInterestComponent()
  // restores the same auto-sum the other two screens now share; the
  // separate "Total (Override)" field below still lets a user hand-enter
  // a different total on purpose.
  function setInterestComponent(field, value) {
    const next = { ...income, [field]: value };
    const bank = next.interest_us_bank_usd || 0;
    const treasury = next.interest_us_treasury_usd || 0;
    const oid = next.interest_us_oid_usd || 0;
    const priv = next.interest_us_private_usd || 0;
    set(field, value);
    setField("income_us_source.interest_us_source_usd", bank + treasury + oid + priv);
  }

  const w2Rows = income.wages_w2 || [];
  const cryptoRows = income.crypto_transactions || [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display font-bold text-head">US-Source Income</h2>
        <p className="text-sm text-muted mt-1">
          Employment (W-2), interest, dividends, capital gains, crypto, rental, royalty, pass-through, and
          retirement-distribution income sourced in the United States.
        </p>
      </div>

      {/* Employment Income (W-2) */}
      <Card
        title="Employment Income (W-2 & Paystubs)"
        headerRight={<MasterToggle checked={income.has_employment_income} onChange={(v) => set("has_employment_income", v)} />}
      >
        {income.has_employment_income ? (
          <div className="flex flex-col gap-3">
            {w2Rows.length === 0 ? (
              <p className="text-sm text-muted">No W-2s added yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {w2Rows.map((row, i) => (
                  <W2RowEditor key={i} index={i} row={row} />
                ))}
              </div>
            )}
            <AddButton onClick={() => addRow("income_us_source.wages_w2", newW2Row())}>+ Add W-2</AddButton>
          </div>
        ) : (
          <p className="text-sm text-muted">Toggle on if you have wage/salary employment income.</p>
        )}
      </Card>

      {/* Interest & Dividends */}
      <Card title="Interest & Dividends (Schedule B)">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <LabeledNumber label="Interest — Banks & Brokerages" hint="Box 1 of Form 1099-INT" value={income.interest_us_bank_usd} onChange={(v) => setInterestComponent("interest_us_bank_usd", v)} />
          <LabeledNumber label="Interest — US Treasuries" hint="Box 3 (exempt from state tax)" value={income.interest_us_treasury_usd} onChange={(v) => setInterestComponent("interest_us_treasury_usd", v)} />
          <LabeledNumber label="Interest — Private / OID" hint="Box 1 or Form 1099-OID" value={income.interest_us_oid_usd} onChange={(v) => setInterestComponent("interest_us_oid_usd", v)} />
          <LabeledNumber label="Interest — Private / Seller Fin." hint="Private loan / P2P interest" value={income.interest_us_private_usd} onChange={(v) => setInterestComponent("interest_us_private_usd", v)} />
          <LabeledNumber label="Tax-Exempt Interest" hint="Box 8 of 1099-INT — municipal bonds, recordkeeping only" value={income.interest_us_exempt_usd} onChange={(v) => set("interest_us_exempt_usd", v)} />
          <LabeledNumber label="Total US-Source Interest (Override)" hint="Aggregate override; leave blank to auto-sum the above" value={income.interest_us_source_usd} onChange={(v) => set("interest_us_source_usd", v)} />
          <LabeledNumber label="US Ordinary Dividends" hint="Box 1a of Form 1099-DIV" value={income.ordinary_dividends_us_source_usd} onChange={(v) => set("ordinary_dividends_us_source_usd", v)} />
          <LabeledNumber label="US Qualified Dividends" hint="Box 1b of Form 1099-DIV" value={income.qualified_dividends_us_source_usd} onChange={(v) => set("qualified_dividends_us_source_usd", v)} />
        </div>
      </Card>

      {/* Capital Gains & flags */}
      {/* Ownership fix (integration pass): CapGainsStep.jsx is the live
          computed source of truth for has_capital_gains/stcg_us_source_usd/
          ltcg_us_source_usd (it derives them from the manual transaction
          list via a useEffect, mirroring the original's
          recalculateCapitalGainsAggregate()). This card used to also own a
          MasterToggle + editable STCG/LTCG numbers, which raced with that
          effect and got silently overwritten on every CapGainsStep mount.
          Now read-only here; the elections/flags below (wash sale, 1256,
          QSBS, etc.) still live in income_us_source and stay editable. */}
      <Card
        title="Capital Gains & Investment Flags"
        sub="STCG/LTCG totals are computed on the Capital Gains screen from your transaction list."
      >
        {income.has_capital_gains ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LabeledNumber label="Short-Term Capital Gains (Net)" hint="Read-only — set on the Capital Gains screen" value={income.stcg_us_source_usd} onChange={() => {}} readOnly />
              <LabeledNumber label="Long-Term Capital Gains (Net)" hint="Read-only — set on the Capital Gains screen" value={income.ltcg_us_source_usd} onChange={() => {}} readOnly />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <CheckRow checked={income.stocks_needs_wash_sale_reconciliation} onChange={(v) => set("stocks_needs_wash_sale_reconciliation", v)} label="Needs Wash Sale Reconciliation" sublabel="Broker 1099-B wash-sale adjustments require manual review" />
              <CheckRow checked={income.has_sec_1256} onChange={(v) => set("has_sec_1256", v)} label="Section 1256 Contracts" sublabel="Futures, options, forex — 60/40 blended rate" />
              <CheckRow checked={income.has_qof_rollover} onChange={(v) => set("has_qof_rollover", v)} label="Qualified Opportunity Fund Rollover" sublabel="Sec. 1400Z-2 gain deferral election" />
              <CheckRow checked={income.has_qsbs} onChange={(v) => set("has_qsbs", v)} label="Qualified Small Business Stock (QSBS)" sublabel="Sec. 1202 gain exclusion" />
              <CheckRow checked={income.has_installment_sale} onChange={(v) => set("has_installment_sale", v)} label="Installment Sale" sublabel="Sec. 453 deferred gain recognition" />
              <CheckRow checked={income.has_collectibles} onChange={(v) => set("has_collectibles", v)} label="Collectibles / Precious Metals" sublabel="28% maximum rate under Sec. 408(m)" />
              <CheckRow checked={income.has_real_estate} onChange={(v) => set("has_real_estate", v)} label="Real Estate / Property Sold" sublabel="Sec. 121 home sale or investment property disposition" />
              {income.has_real_estate ? (
                <CheckRow checked={income.has_1031_exchange} onChange={(v) => set("has_1031_exchange", v)} label="Like-Kind Exchange (Sec. 1031)" sublabel="Deferred gain on exchanged real property" />
              ) : null}
            </div>

            <div className="border-t border-line pt-3 flex flex-col gap-3">
              <CheckRow checked={income.has_capital_loss_carryovers} onChange={(v) => set("has_capital_loss_carryovers", v)} label="Has Capital Loss Carryovers" sublabel="From a prior-year Schedule D" />
              {income.has_capital_loss_carryovers ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LabeledNumber label="Short-Term Loss Carryover (USD)" value={income.st_loss_carryover_usd} onChange={(v) => set("st_loss_carryover_usd", v)} />
                  <LabeledNumber label="Long-Term Loss Carryover (USD)" value={income.lt_loss_carryover_usd} onChange={(v) => set("lt_loss_carryover_usd", v)} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Toggle on if you sold stocks, funds, real estate, or other capital assets.</p>
        )}
      </Card>

      {/* Crypto */}
      <Card
        title="Crypto & Virtual Assets (VDA)"
        headerRight={<MasterToggle checked={income.has_crypto} onChange={(v) => set("has_crypto", v)} />}
      >
        {income.has_crypto ? (
          <div className="flex flex-col gap-4">
            <CheckRow checked={income.crypto_needs_wash_sale} onChange={(v) => set("crypto_needs_wash_sale", v)} label="Needs Wash Sale Reconciliation" sublabel="Crypto is not currently subject to the IRC §1091 wash-sale rule, but flag if bundled with securities" />
            {cryptoRows.length === 0 ? (
              <p className="text-sm text-muted">No crypto transactions added yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {cryptoRows.map((row, i) => (
                  <CryptoRowEditor key={i} index={i} row={row} />
                ))}
              </div>
            )}
            <AddButton onClick={() => addRow("income_us_source.crypto_transactions", newCryptoRow())}>+ Add Crypto Transaction</AddButton>
          </div>
        ) : (
          <p className="text-sm text-muted">Toggle on if you sold, swapped, or spent crypto/virtual digital assets.</p>
        )}
      </Card>

      {/* Rental, Royalty & Pass-Through */}
      <Card title="Rental, Royalty & Pass-Through Income">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledNumber label="Gross US Rental Earnings" hint="Schedule E" value={income.rental_income_us_source_usd} onChange={(v) => set("rental_income_us_source_usd", v)} />
          {/* BUG FIX (verification pass): was writing royalty_income_us_source_usd,
              a field neither DAG engine reads (dag_py's aggregate_us_income.py:399
              and monitor-next/lib/dag/aggregateusincome-nodes.js:605 both read
              royalties_direct_us_source_usd instead — the original layer1_us.html
              itself never reconciled these two names; its usState literal declares
              one, its DOM handler at layer1_us.html:2196 writes the other). Any
              royalty amount typed here was silently invisible to AGI/tax
              computation. Repointed to the field the DAG actually reads. */}
          <LabeledNumber label="Royalty Income" hint="Schedule E, US-source" value={income.royalties_direct_us_source_usd} onChange={(v) => set("royalties_direct_us_source_usd", v)} />
          <LabeledNumber label="K-1 Pass-Through Income" hint="Aggregate from partnerships/S-corps" value={income.k1_passthrough_income_usd} onChange={(v) => set("k1_passthrough_income_usd", v)} />
        </div>
      </Card>

      {/* Retirement distributions & Social Security */}
      <Card title="Retirement Distributions & Social Security">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledNumber label="IRA Distributions" hint="Form 1099-R" value={income.ira_distributions_usd} onChange={(v) => set("ira_distributions_usd", v)} />
          <LabeledNumber label="401(k) Distributions" hint="Form 1099-R" value={income["401k_distributions_usd"]} onChange={(v) => set("401k_distributions_usd", v)} />
          <LabeledNumber label="Social Security Benefits" hint="Box 5 of Form SSA-1099" value={income.social_security_benefits_usd} onChange={(v) => set("social_security_benefits_usd", v)} />
        </div>
      </Card>

      {/* Self-employment related deductions */}
      <Card title="Self-Employment Related Deductions">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LabeledNumber label="Self-Employed Health Insurance Deduction" value={income.se_health_insurance_deduction_usd} onChange={(v) => set("se_health_insurance_deduction_usd", v)} />
          <LabeledNumber label="Self-Employed Retirement Deduction" value={income.se_retirement_deduction_usd} onChange={(v) => set("se_retirement_deduction_usd", v)} />
        </div>
      </Card>
    </div>
  );
}

// (Former SCHEMA GAP note removed — `income_us_source.wages_w2` is now
// declared in schema.js's createDefaultUsState() under its correct,
// DAG-matching name. See file header comment.)
