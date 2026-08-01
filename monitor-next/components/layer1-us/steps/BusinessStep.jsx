"use client";

// React port of layer1_us.html's Screen 3C-2 ("Business, Self-Employment &
// K-1s" / "Primary Trade or Business & K-1s") — the single largest step in
// the wizard. Source of truth: layer1_us.html:2220-2718 (static shell) plus
// the repeatable-row template-literal functions addSeBusinessRow (~13053),
// addFarmRow (~13735), addPartK1Row/addPartPartnerRow (~14376/14751),
// addScorpK1Row/addScorpShareholderRow (~15221/15542), addCcorpRow/
// addCcorpShareholderRow (~15926/16243), addTrustK1Row/addTrustBeneficiaryRow
// (~16707/16980), addNewAsset/createAssetRowDOM (~11713/12834), and
// calculateBusinessIncomes (~10114, 1072 lines — see the SIMPLIFIED note
// below).
//
// FAITHFULLY PORTED:
//   - Entity-type-driven section gating (the CORE branch of
//     updateBusinessStepLogic, layer1_us.html:7307-7455): which subsection
//     is shown/primary is driven by usState.profile.tax_entity_type
//     (resolved through llc_tax_election when the type is 'llc'), exactly
//     as the original's `type` variable is computed.
//   - The full field surface for Schedule C (self-employment), Schedule F
//     (farm), Partnership/S-Corp/Trust K-1 boxes, and C-Corp entity
//     financials, keyed off the original's CSS class names (se-*, part-*,
//     scorp-*, ccorp-*, trust-*, farm-*, asset-*, partner-*, sh-*, bene-*)
//     so field coverage matches the source app box-for-box.
//   - Two full nested-repeatable patterns: depreciable assets nested inside
//     a Schedule C business (createAssetRowDOM), and partners nested inside
//     a Partnership K-1 (addPartPartnerRow) — plus the same shareholder/
//     beneficiary nested-repeatable pattern reused for S-Corp, C-Corp, and
//     Trust rows.
//
// SIMPLIFIED / DEFERRED (see computeSimplifiedTotals below and the
// "Deferred" footer rendered at the bottom of this step):
//   - calculateBusinessIncomes() (1072 lines) is NOT ported in full. This
//     file computes a SIMPLIFIED top-line net-income figure per entity type
//     (gross receipts minus itemized expenses / COGS, allocated by the
//     taxpayer's K-1 ownership %) — it does NOT implement basis limitation
//     (§704(d)/§465 at-risk), passive-activity-loss (Form 8582) limits, QBI
//     wage/UBIA phase-outs, AMT preference flow-through, or branch
//     consolidation logic the original performs.
//   - updateBusinessStepLogic()'s CSS flexbox re-ordering/relabeling
//     cosmetics are simplified to a single header string swap + a "Primary
//     Entity" badge, rather than literally re-ordering DOM nodes.
//   - addUsBranchRow (~715 lines — US branches of a foreign-parented
//     business, nested under Schedule C / Partnership / S-Corp rows) is NOT
//     ported. Deferred entirely; noted inline where it would have appeared.
//   - The ~25-option NAICS/SSTB industry-category dropdown is collapsed to
//     a short representative list + free-text fallback.
//   - Form 5472 related-party list (corporate_international) is a simple
//     flat repeatable, not the original's fuller related-party form.

import { useMemo, useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

/* ============================== helpers ============================== */

const cx = (...xs) => xs.filter(Boolean).join(" ");

// Numbers are kept as raw strings in state (matches the original's
// formatCurrencyLive-on-blur pattern loosely) and only coerced to a Number
// when totals are computed, so partial input like "12." isn't clobbered.
const n = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const f = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(f) ? f : 0;
};
const fmtUsd = (v) =>
  "$" + n(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

let uidCounter = 0;
const uid = (prefix) => {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
};

/* ============================ primitives =============================== */

const inputCls =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1";

function TextField({ label, value, onChange, placeholder, mono, maxLength }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        className={cx(inputCls, mono && "font-mono")}
        value={value ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MoneyField({ label, value, onChange, placeholder = "0", highlight }) {
  return (
    <div>
      <label className={cx(labelCls, highlight && "text-accent")}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        className={cx(inputCls, "font-mono", highlight && "border-accent/30")}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="date"
        className={cx(inputCls, "font-mono")}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        className={inputCls}
        value={value ?? options[0]?.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckField({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-body uppercase cursor-pointer">
      <input
        type="checkbox"
        className="rounded bg-white/[0.03] border-line text-accent focus:ring-0"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] uppercase tracking-wide text-muted font-semibold border-b border-line pb-1.5 mb-1">
      {children}
    </div>
  );
}

function RemoveBtn({ onClick, title = "Remove" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-red-400/70 hover:text-red-400 font-bold text-xs px-2 py-1 bg-red-400/5 hover:bg-red-400/10 rounded transition-colors shrink-0"
    >
      ✕
    </button>
  );
}

function AddBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold uppercase tracking-wide px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/15 transition-colors"
    >
      {children}
    </button>
  );
}

// <details>/<summary> accordion — mirrors the original's per-card
// accordions (Setup & Profile / Revenue / Expenses / Assets) without
// reimplementing its custom chevron-rotate JS.
function Acc({ title, defaultOpen, children }) {
  return (
    <details
      className="group rounded-xl border border-line bg-white/[0.02]"
      open={defaultOpen}
    >
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none">
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent">
          {title}
        </span>
        <span className="text-muted text-xs transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1 border-t border-line flex flex-col gap-3">
        {children}
      </div>
    </details>
  );
}

function RowCard({ title, badge, onRemove, children }) {
  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-3">
      <div className="flex justify-between items-center pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-head">
            {title}
          </span>
          {badge && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-accent/15 text-accent">
              {badge}
            </span>
          )}
        </div>
        {onRemove && <RemoveBtn onClick={onRemove} />}
      </div>
      {children}
    </div>
  );
}

function NestedRow({ onRemove, children }) {
  return (
    <div className="relative bg-white/[0.02] border border-line rounded-xl p-3 flex flex-col gap-2.5">
      <div className="absolute top-2 right-2">
        <RemoveBtn onClick={onRemove} />
      </div>
      <div className="pr-8 grid grid-cols-1 md:grid-cols-12 gap-2.5">{children}</div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div className="text-[12px] text-muted italic px-1 py-2">{children}</div>
  );
}

/* =========================== row factories ============================= */
// The schema (createDefaultUsState) only declares that these arrays exist —
// not the shape of a row. Shapes below are reverse-engineered from each
// add*Row template's CSS class names in layer1_us.html so field coverage
// matches box-for-box.

const MACRS_CLASSES = [
  { value: "3-year", label: "3-Yr [33.33%]" },
  { value: "5-year", label: "5-Yr [20.00%] (Computers/Vehicles)" },
  { value: "7-year", label: "7-Yr [14.29%] (Furniture/Machinery)" },
  { value: "15-year", label: "15-Yr [5.00%]" },
  { value: "27.5-year", label: "27.5-Yr [3.64%] (Res. Rental)" },
  { value: "39-year", label: "39-Yr [2.56%] (Commercial)" },
  { value: "amortization-15", label: "Amortization [6.67%]" },
];

function makeAsset() {
  return {
    id: uid("asset"),
    name: "",
    class: "5-year",
    placed_in_service_date: "",
    cost: "",
    sec179: "",
    bonus: true,
  };
}

function makeSeRow() {
  return {
    id: uid("se"),
    business_name: "",
    naics_code: "",
    industry_category: "",
    accounting_method: "cash",
    llc_type: "sole_prop",
    tax_election: "disregarded",
    qbi_eligible: false,
    sstb: false,
    gross_receipts_usd: "",
    returns_allowances_usd: "",
    other_income_usd: "",
    cogs: {
      method: "cost",
      beginning_inventory: "",
      purchases: "",
      cost_of_labor: "",
      materials_supplies: "",
      ending_inventory: "",
    },
    expenses: {
      advertising: "",
      contract_labor: "",
      insurance: "",
      legal_professional: "",
      meals_50pct: "",
      office: "",
      rent: "",
      repairs: "",
      supplies: "",
      utilities: "",
      taxes_licenses: "",
      travel: "",
      commissions: "",
      other: "",
      se_health_insurance: "",
      se_retirement: "",
      wages_paid: "",
    },
    // addUsBranchRow (US branches of a foreign-parented business) deferred
    // entirely — see file header.
    assets: [],
  };
}

function makeFarmRow() {
  return {
    id: uid("farm"),
    farm_name: "",
    ein: "",
    naics_code: "",
    accounting_method: "cash",
    wages_paid: "",
    qbi_eligible: false,
    inventory: { beginning: "", purchases: "", ending: "" },
    income: {
      raised: "",
      purchased: "",
      cooperative_distributions: "",
      agricultural_payments: "",
      ccc_loans: "",
      crop_insurance: "",
      custom_hire: "",
      other: "",
    },
    expenses: {
      chemicals: "",
      conservation: "",
      custom_hire: "",
      employee_benefits: "",
      feed: "",
      fertilizer: "",
      freight: "",
      gasoline_fuel: "",
      insurance: "",
      interest_mortgage: "",
      interest_other: "",
      labor: "",
      pension: "",
      rent_machinery: "",
      rent_other: "",
      repairs: "",
      seeds: "",
      storage: "",
      supplies: "",
      taxes: "",
      utilities: "",
      veterinary: "",
      other: "",
    },
    home_office_sqft: "",
    vehicle_miles: "",
  };
}

function makePartner() {
  return {
    id: uid("partner"),
    name: "",
    tin: "",
    type: "limited",
    entity_type: "individual",
    is_taxpayer: false,
    profit_beg: "",
    profit_end: "",
    loss_beg: "",
    loss_end: "",
    capital_beg: "",
    capital_end: "",
    nonrecourse: "",
    qual_nonrecourse: "",
    recourse: "",
  };
}

function makePartnershipRow() {
  return {
    id: uid("part-k1"),
    partnership_name: "",
    ein: "",
    naics_code: "",
    industry_category: "",
    partner_type: "limited",
    material_participation: "active",
    tax_basis_usd: "",
    at_risk_basis_usd: "",
    revenue: { gross_receipts: "", returns_allowances: "", cogs: "", misc_income: "" },
    k1_boxes: {
      box1_ordinary_income: "",
      box2_net_rental_re: "",
      box3_other_rental: "",
      box4_guaranteed_payments: "",
      box5_interest: "",
      box6a_ordinary_dividends: "",
      box6b_qualified_dividends: "",
      box7_royalties: "",
      box8_stcg: "",
      box9a_ltcg: "",
      box9b_collectibles: "",
      box9c_unrecap_1250: "",
      box10_sec1231: "",
      box11_other_income: "",
      box12_sec179: "",
      box13a_charitable: "",
      box13h_investment_interest: "",
      box14_se_earnings: "",
      box15_credits: "",
      box16_foreign: "",
      box17_amt: "",
      box18a_tax_exempt: "",
      box18c_nondeductible: "",
      box19_distributions: "",
    },
    expenses: {
      contract_labor: "",
      legal_professional: "",
      utilities: "",
      insurance: "",
      travel_meals: "",
      office_supplies: "",
      other: "",
      wages: "",
      rent: "",
      repairs: "",
      bad_debts: "",
      taxes_licenses: "",
      interest_paid: "",
      advertising: "",
      employee_benefits: "",
      pension: "",
      depletion: "",
    },
    // addUsBranchRow deferred — see file header.
    partners: [],
  };
}

function makeShareholder() {
  return { id: uid("sh"), name: "", tin: "", percent: "", is_taxpayer: false };
}

function makeScorpRow() {
  return {
    id: uid("scorp-k1"),
    corp_name: "",
    ein: "",
    naics_code: "",
    industry_category: "",
    material_participation: "active",
    tax_basis_usd: "",
    at_risk_basis_usd: "",
    revenue: { gross_receipts: "", returns_allowances: "", cogs: "", misc_income: "" },
    k1_boxes: {
      box1_ordinary_income: "",
      box2_net_rental_re: "",
      box3_other_rental: "",
      box4_interest: "",
      box5a_ordinary_dividends: "",
      box5b_qualified_dividends: "",
      box6_royalties: "",
      box7_stcg: "",
      box8a_ltcg: "",
      box8b_collectibles: "",
      box8c_unrecap_1250: "",
      box9_sec1231: "",
      box10_other_income: "",
      box11_sec179: "",
      box12a_charitable: "",
      box12h_other_deductions: "",
      box13_credits: "",
      box14_foreign: "",
      box15_amt: "",
      box16a_tax_exempt: "",
      box16c_nondeductible: "",
      box16d_distributions: "",
    },
    expenses: {
      contract_labor: "",
      legal_professional: "",
      utilities: "",
      insurance: "",
      travel_meals: "",
      office_supplies: "",
      other: "",
      wages: "",
      officer_comp: "",
      rent: "",
      repairs: "",
      bad_debts: "",
      taxes_licenses: "",
      interest_paid: "",
      advertising: "",
      employee_benefits: "",
      pension: "",
      depletion: "",
    },
    assets: [],
    shareholders: [],
  };
}

function makeCcorpRow() {
  return {
    id: uid("ccorp"),
    entity_name: "",
    ein: "",
    industry_category: "",
    revenue: {
      gross_receipts: "",
      returns_allowances: "",
      cogs: "",
      misc_income: "",
      interest: "",
      dividend: "",
      rental: "",
      royalty: "",
      cap_gains: "",
      asset_sales: "",
    },
    expenses: {
      contract_labor: "",
      legal_professional: "",
      utilities: "",
      insurance: "",
      travel_meals: "",
      office_supplies: "",
      other: "",
      wages: "",
      officer_comp: "",
      repairs: "",
      bad_debts: "",
      rent: "",
      taxes: "",
      advertising: "",
      benefits: "",
      pension: "",
      depletion: "",
      charitable: "",
      interest_paid: "",
      nol_deduction: "",
    },
    assets: [],
    shareholders: [],
  };
}

function makeBeneficiary() {
  return { id: uid("bene"), name: "", tin: "", percent: "", is_taxpayer: false };
}

function makeTrustRow() {
  return {
    id: uid("trust-k1"),
    trust_name: "",
    ein: "",
    industry_category: "",
    trust_type: "complex",
    fees: { fiduciary: "", professional: "", admin: "" },
    k1_boxes: {
      box1_interest: "",
      box3_other_rental: "",
      box5_ordinary_dividends: "",
      box6a_other_income: "",
      box6b_qualified_dividends: "",
      box7_royalty: "",
      box8_stcg: "",
      box9a_ltcg: "",
      box9_ord_gain: "",
    },
    expenses: {
      wages: "",
      contract_labor: "",
      rent: "",
      repairs: "",
      bad_debts: "",
      taxes: "",
      interest_paid: "",
      charity: "",
      advertising: "",
      employee_benefits: "",
      pension: "",
      depletion: "",
      legal_professional: "",
      utilities: "",
      insurance: "",
      travel_meals: "",
      office_supplies: "",
      other: "",
    },
    material_participation: "passive",
    qbi_eligible: false,
    sstb: false,
    beneficiaries: [],
  };
}

function makeRelatedParty() {
  return { id: uid("rp5472"), name: "", country: "", relationship: "", ownership_percent: "" };
}

/* ============================ shared bits ============================== */

const INDUSTRY_OPTIONS = [
  { value: "", label: "-- Select Business Type --" },
  { value: "Retail Stores & E-Commerce", label: "Retail Stores & E-Commerce" },
  { value: "Manufacturing & Wholesaling", label: "Manufacturing & Wholesaling" },
  { value: "Construction Contractors & Builders", label: "Construction Contractors & Builders" },
  { value: "Software, Technology & IT Services", label: "Software, Technology & IT Services" },
  { value: "Real Estate Agents & Landlords (Active)", label: "Real Estate Agents & Landlords (Active)" },
  { value: "Health Services", label: "Health Services (SSTB)" },
  { value: "Law Firms", label: "Law Firms (SSTB)" },
  { value: "Accounting", label: "Accounting (SSTB)" },
  { value: "Consulting", label: "Consulting (SSTB)" },
  { value: "Financial & Brokerage Services", label: "Financial & Brokerage Services (SSTB)" },
  { value: "Other", label: "Other" },
];

function AssetsBlock({ assets, onAdd, onRemove, onChange }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Depreciable Assets (§179 / Bonus / MACRS)
        </span>
        <AddBtn onClick={onAdd}>+ Add Asset</AddBtn>
      </div>
      {(assets || []).length === 0 && <Empty>No depreciable assets added.</Empty>}
      {(assets || []).map((a, ai) => (
        <NestedRow key={a.id} onRemove={() => onRemove(ai)}>
          <div className="md:col-span-5">
            <TextField
              label="Asset Description"
              value={a.name}
              placeholder="e.g. Office Computer, Delivery Van"
              onChange={(v) => onChange(ai, { name: v })}
            />
          </div>
          <div className="md:col-span-4">
            <SelectField
              label="MACRS Category / Class"
              value={a.class}
              options={MACRS_CLASSES}
              onChange={(v) => onChange(ai, { class: v })}
            />
          </div>
          <div className="md:col-span-3">
            <DateField
              label="Date Placed in Service"
              value={a.placed_in_service_date}
              onChange={(v) => onChange(ai, { placed_in_service_date: v })}
            />
          </div>
          <div className="md:col-span-4">
            <MoneyField label="Cost Basis (USD)" value={a.cost} onChange={(v) => onChange(ai, { cost: v })} />
          </div>
          <div className="md:col-span-4">
            <MoneyField
              label="Sec 179 Claim (USD)"
              value={a.sec179}
              onChange={(v) => onChange(ai, { sec179: v })}
            />
          </div>
          <div className="md:col-span-4 flex items-end pb-2">
            <CheckField
              label="Bonus Depr (20%)?"
              value={a.bonus}
              onChange={(v) => onChange(ai, { bonus: v })}
            />
          </div>
        </NestedRow>
      ))}
    </div>
  );
}

function ShareholderLikeBlock({ title, addLabel, rows, onAdd, onRemove, onChange, extraTaxpayerToggle = true }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</span>
        <AddBtn onClick={onAdd}>{addLabel}</AddBtn>
      </div>
      {(rows || []).length === 0 && <Empty>None added yet.</Empty>}
      {(rows || []).map((r, ri) => (
        <div
          key={r.id}
          className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-white/[0.02] border border-line rounded-xl p-3"
        >
          <div className="md:col-span-4">
            <TextField label="Name" value={r.name} placeholder="e.g. Jane Doe" onChange={(v) => onChange(ri, { name: v })} />
          </div>
          <div className="md:col-span-3">
            <TextField label="SSN / TIN" value={r.tin} placeholder="000-00-0000" mono onChange={(v) => onChange(ri, { tin: v })} />
          </div>
          <div className="md:col-span-2">
            <MoneyField label="Ownership %" value={r.percent} placeholder="0" onChange={(v) => onChange(ri, { percent: v })} />
          </div>
          {extraTaxpayerToggle && (
            <div className="md:col-span-2 pb-2.5">
              <CheckField label="Taxpayer (You)" value={r.is_taxpayer} onChange={(v) => onChange(ri, { is_taxpayer: v })} />
            </div>
          )}
          <div className="md:col-span-1 flex justify-end pb-2.5">
            <RemoveBtn onClick={() => onRemove(ri)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Renders a flat grid of MoneyFields from a {key: label} map, bound to a
// nested group object on the row (e.g. row.expenses), via a single patch
// callback. Cuts down repetition across the many ~15-25-field expense/box
// grids each entity type carries.
function MoneyGrid({ group, values, onPatch, cols = "md:grid-cols-4" }) {
  return (
    <div className={cx("grid grid-cols-2", cols, "gap-3")}>
      {group.map(([key, label]) => (
        <MoneyField
          key={key}
          label={label}
          value={values?.[key]}
          onChange={(v) => onPatch({ [key]: v })}
        />
      ))}
    </div>
  );
}

/* ============================ Schedule C =============================== */

const SE_EXPENSE_FIELDS = [
  ["advertising", "Advertising"],
  ["contract_labor", "Contract Labor"],
  ["insurance", "Insurance (Non-Health)"],
  ["legal_professional", "Legal / Professional"],
  ["meals_50pct", "Business Meals (50%)"],
  ["office", "Office Expenses"],
  ["rent", "Rent / Lease"],
  ["repairs", "Repairs & Maint."],
  ["supplies", "Supplies"],
  ["utilities", "Utilities"],
  ["taxes_licenses", "Taxes & Licenses"],
  ["travel", "Travel (No Meals)"],
  ["commissions", "Commissions"],
  ["other", "Other Misc. Expenses"],
  ["se_health_insurance", "SE Health Ins."],
  ["se_retirement", "SE Retirement"],
  ["wages_paid", "W-2 Wages Paid"],
];

function seExpenseTotal(row) {
  return SE_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0);
}
function seCogsNet(row) {
  const c = row.cogs || {};
  return n(c.beginning_inventory) + n(c.purchases) + n(c.cost_of_labor) + n(c.materials_supplies) - n(c.ending_inventory);
}
function seNetProfit(row) {
  return (
    n(row.gross_receipts_usd) -
    n(row.returns_allowances_usd) +
    n(row.other_income_usd) -
    Math.max(seCogsNet(row), 0) -
    seExpenseTotal(row)
  );
}

function SelfEmploymentSection() {
  const { usState, addRow, removeRow, updateRow } = useUsLayer1Store();
  const rows = usState.income_us_source.self_employment || [];
  const path = "income_us_source.self_employment";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-head font-display font-bold text-base">
            🏢 Self-Employment (Schedule C)
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            Sole proprietorships, single-member LLCs, and foreign disregarded entities.
          </div>
        </div>
        <AddBtn onClick={() => addRow(path, makeSeRow())}>+ Add Business</AddBtn>
      </div>
      {rows.length === 0 && <Empty>No self-employment businesses added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        const net = seNetProfit(row);
        return (
          <RowCard
            key={row.id}
            title={row.business_name || "Untitled Business"}
            badge={`Net ${fmtUsd(net)}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField
                    label="Business Name"
                    value={row.business_name}
                    placeholder="e.g. Consulting, E-commerce Store"
                    onChange={(v) => patch({ business_name: v })}
                  />
                </div>
                <TextField label="NAICS / Business Code" value={row.naics_code} placeholder="541511" mono maxLength={6} onChange={(v) => patch({ naics_code: v })} />
                <SelectField label="Business Type" value={row.industry_category} options={INDUSTRY_OPTIONS} onChange={(v) => patch({ industry_category: v })} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SelectField
                  label="Accounting Method"
                  value={row.accounting_method}
                  options={[{ value: "cash", label: "Cash Method" }, { value: "accrual", label: "Accrual Method" }]}
                  onChange={(v) => patch({ accounting_method: v })}
                />
                <SelectField
                  label="LLC Type"
                  value={row.llc_type}
                  options={[
                    { value: "sole_prop", label: "Sole Proprietorship" },
                    { value: "single_member_llc", label: "Single-Member LLC" },
                    { value: "foreign_disregarded", label: "Foreign Disregarded Entity (Form 8858)" },
                  ]}
                  onChange={(v) => patch({ llc_type: v })}
                />
                <SelectField
                  label="Tax Election"
                  value={row.tax_election}
                  options={[
                    { value: "disregarded", label: "Disregarded Entity" },
                    { value: "s_corp", label: "S-Corp Election" },
                    { value: "c_corp", label: "C-Corp Election" },
                  ]}
                  onChange={(v) => patch({ tax_election: v })}
                />
                <div className="flex flex-col gap-2 justify-center">
                  <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                  <CheckField label="SSTB?" value={row.sstb} onChange={(v) => patch({ sstb: v })} />
                </div>
              </div>
            </Acc>

            <Acc title="💰 Revenue & Gross Receipts">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MoneyField label="Gross Receipts (USD)" value={row.gross_receipts_usd} highlight onChange={(v) => patch({ gross_receipts_usd: v })} />
                <MoneyField label="Returns & Allowances (USD)" value={row.returns_allowances_usd} onChange={(v) => patch({ returns_allowances_usd: v })} />
                <MoneyField label="Other Income (USD)" value={row.other_income_usd} highlight onChange={(v) => patch({ other_income_usd: v })} />
              </div>
              <SectionLabel>Cost of Goods Sold (Part III)</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <SelectField
                  label="Inventory Method"
                  value={row.cogs.method}
                  options={[{ value: "cost", label: "Cost" }, { value: "lower_of_cost_or_market", label: "Lower of Cost or Market" }, { value: "other", label: "Other" }]}
                  onChange={(v) => patchGroup("cogs", { method: v })}
                />
                <MoneyField label="Beginning Inventory" value={row.cogs.beginning_inventory} onChange={(v) => patchGroup("cogs", { beginning_inventory: v })} />
                <MoneyField label="Purchases" value={row.cogs.purchases} onChange={(v) => patchGroup("cogs", { purchases: v })} />
                <MoneyField label="Cost of Labor" value={row.cogs.cost_of_labor} onChange={(v) => patchGroup("cogs", { cost_of_labor: v })} />
                <MoneyField label="Materials & Supplies" value={row.cogs.materials_supplies} onChange={(v) => patchGroup("cogs", { materials_supplies: v })} />
                <MoneyField label="Ending Inventory" value={row.cogs.ending_inventory} onChange={(v) => patchGroup("cogs", { ending_inventory: v })} />
              </div>
            </Acc>

            <Acc title="💳 Expenses (Schedule C Part II)">
              <MoneyGrid group={SE_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} />
            </Acc>

            <Acc title="🏗 Capital Assets & Depreciation">
              <AssetsBlock
                assets={row.assets}
                onAdd={() => patch({ assets: [...(row.assets || []), makeAsset()] })}
                onRemove={(ai) => patch({ assets: row.assets.filter((_, idx) => idx !== ai) })}
                onChange={(ai, p) => patch({ assets: row.assets.map((a, idx) => (idx === ai ? { ...a, ...p } : a)) })}
              />
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

/* ============================ Schedule F ================================ */

const FARM_INCOME_FIELDS = [
  ["raised", "Sale of Livestock/Produce Raised"],
  ["purchased", "Sale of Items Bought for Resale"],
  ["cooperative_distributions", "Cooperative Distributions"],
  ["agricultural_payments", "Agricultural Program Payments"],
  ["ccc_loans", "CCC Loans"],
  ["crop_insurance", "Crop Insurance Proceeds"],
  ["custom_hire", "Custom Hire Income"],
  ["other", "Other Income"],
];
const FARM_EXPENSE_FIELDS = [
  ["chemicals", "Chemicals"],
  ["conservation", "Conservation Expenses"],
  ["custom_hire", "Custom Hire (Paid)"],
  ["employee_benefits", "Employee Benefit Programs"],
  ["feed", "Feed"],
  ["fertilizer", "Fertilizers & Lime"],
  ["freight", "Freight & Trucking"],
  ["gasoline_fuel", "Gasoline / Fuel / Oil"],
  ["insurance", "Insurance (Other than Health)"],
  ["interest_mortgage", "Interest — Mortgage"],
  ["interest_other", "Interest — Other"],
  ["labor", "Labor Hired"],
  ["pension", "Pension & Profit-Sharing"],
  ["rent_machinery", "Rent — Machinery"],
  ["rent_other", "Rent — Other"],
  ["repairs", "Repairs & Maintenance"],
  ["seeds", "Seeds & Plants"],
  ["storage", "Storage & Warehousing"],
  ["supplies", "Supplies"],
  ["taxes", "Taxes"],
  ["utilities", "Utilities"],
  ["veterinary", "Veterinary / Breeding / Medicine"],
  ["other", "Other Expenses"],
];

function farmIncomeTotal(row) {
  return FARM_INCOME_FIELDS.reduce((s, [k]) => s + n(row.income?.[k]), 0);
}
function farmExpenseTotal(row) {
  return FARM_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0) + n(row.wages_paid);
}
function farmNetProfit(row) {
  return farmIncomeTotal(row) - farmExpenseTotal(row);
}

function FarmSection() {
  const { usState, addRow, removeRow, updateRow } = useUsLayer1Store();
  const rows = usState.income_us_source.farming_schedule_f || [];
  const path = "income_us_source.farming_schedule_f";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-head font-display font-bold text-base">🚜 Farming (Schedule F)</div>
          <div className="text-[12px] text-muted mt-0.5">Farming operations you materially or passively participate in.</div>
        </div>
        <AddBtn onClick={() => addRow(path, makeFarmRow())}>+ Add Farm</AddBtn>
      </div>
      {rows.length === 0 && <Empty>No farming activity added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        return (
          <RowCard
            key={row.id}
            title={row.farm_name || "Untitled Farm"}
            badge={`Net ${fmtUsd(farmNetProfit(row))}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🚜 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Farm Name" value={row.farm_name} onChange={(v) => patch({ farm_name: v })} />
                </div>
                <TextField label="EIN" value={row.ein} mono placeholder="12-3456789" onChange={(v) => patch({ ein: v })} />
                <TextField label="NAICS Code" value={row.naics_code} mono maxLength={6} onChange={(v) => patch({ naics_code: v })} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SelectField
                  label="Accounting Method"
                  value={row.accounting_method}
                  options={[{ value: "cash", label: "Cash Method" }, { value: "accrual", label: "Accrual Method" }]}
                  onChange={(v) => patch({ accounting_method: v })}
                />
                <MoneyField label="Wages Paid" value={row.wages_paid} onChange={(v) => patch({ wages_paid: v })} />
                <div className="flex items-end pb-2.5">
                  <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                </div>
              </div>
              <SectionLabel>Inventory (Accrual Method)</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MoneyField label="Beginning Inventory" value={row.inventory.beginning} onChange={(v) => patchGroup("inventory", { beginning: v })} />
                <MoneyField label="Purchases" value={row.inventory.purchases} onChange={(v) => patchGroup("inventory", { purchases: v })} />
                <MoneyField label="Ending Inventory" value={row.inventory.ending} onChange={(v) => patchGroup("inventory", { ending: v })} />
              </div>
            </Acc>

            <Acc title="💰 Farm Income (Schedule F Part I)">
              <MoneyGrid group={FARM_INCOME_FIELDS} values={row.income} onPatch={(p) => patchGroup("income", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 Farm Expenses (Schedule F Part II)">
              <MoneyGrid group={FARM_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="🚙 Vehicle & Home Office">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MoneyField label="Business Vehicle Miles" value={row.vehicle_miles} onChange={(v) => patch({ vehicle_miles: v })} />
                <MoneyField label="Home Office Sq Ft" value={row.home_office_sqft} onChange={(v) => patch({ home_office_sqft: v })} />
              </div>
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

/* ========================= Partnership K-1 =============================== */

const PART_K1_BOXES_CORE = [
  ["box2_net_rental_re", "Net Rental RE (Box 2)"],
  ["box3_other_rental", "Other Rental (Box 3)"],
  ["box4_guaranteed_payments", "Guaranteed Pay (Box 4)"],
  ["box5_interest", "Bank Interest (Box 5)"],
  ["box6a_ordinary_dividends", "Ordinary Divs (Box 6a)"],
  ["box6b_qualified_dividends", "Qualified Divs (Box 6b)"],
  ["box7_royalties", "Royalty Income (Box 7)"],
  ["box8_stcg", "STCG (Box 8)"],
  ["box9a_ltcg", "LTCG (Box 9a)"],
  ["box9b_collectibles", "Collectibles (Box 9b)"],
  ["box9c_unrecap_1250", "Depr RE (Box 9c)"],
  ["box10_sec1231", "Business Assets (Box 10)"],
  ["box11_other_income", "Other Income (Box 11)"],
  ["box16_foreign", "Foreign Income (Box 16)"],
];
const PART_K1_BOXES_DEDUCT = [
  ["box12_sec179", "Sec 179 (Box 12)"],
  ["box13a_charitable", "Charitable (Box 13a)"],
  ["box13h_investment_interest", "Investment Interest (Box 13h)"],
  ["box14_se_earnings", "SE Earnings (Box 14)"],
  ["box15_credits", "Tax Credits (Box 15)"],
  ["box17_amt", "AMT Adj (Box 17)"],
  ["box18a_tax_exempt", "Tax-Free Income (Box 18a)"],
  ["box18c_nondeductible", "Non-Deductibles (Box 18c)"],
  ["box19_distributions", "Cash Distributed (Box 19)"],
];
const PART_EXPENSE_FIELDS = [
  ["contract_labor", "Contract Labor"],
  ["legal_professional", "Legal & Professional"],
  ["utilities", "Utilities"],
  ["insurance", "Insurance"],
  ["travel_meals", "Travel & Meals"],
  ["office_supplies", "Office & Supplies"],
  ["wages", "Salaries & Wages"],
  ["rent", "Rent / Lease"],
  ["repairs", "Repairs & Maintenance"],
  ["bad_debts", "Bad Debts"],
  ["taxes_licenses", "Taxes & Licenses"],
  ["interest_paid", "Interest Paid"],
  ["advertising", "Advertising"],
  ["employee_benefits", "Employee Benefits"],
  ["pension", "Pension & Profit-Sharing"],
  ["depletion", "Resource Depletion"],
  ["other", "Other Expenses"],
];

function partExpenseTotal(row) {
  return PART_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0);
}
function partCoreProfit(row) {
  const r = row.revenue || {};
  return n(r.gross_receipts) - n(r.returns_allowances) - n(r.cogs) + n(r.misc_income) - partExpenseTotal(row);
}
// Box 1 (ordinary income) if entered directly overrides the computed
// core-operations profit, mirroring calculatePartCoreProfit()'s
// display-precedence in the original.
function partOrdinaryIncome(row) {
  const box1 = row.k1_boxes?.box1_ordinary_income;
  return box1 !== "" && box1 !== null && box1 !== undefined ? n(box1) : partCoreProfit(row);
}
// Taxpayer's allocation ratio — mirrors calculateBusinessIncomes()'s
// getTaxpayerAllocationRatio() (defaults to 100% with no partners entered).
function taxpayerShareRatio(members) {
  if (!members || members.length === 0) return 1;
  const tp = members.find((m) => m.is_taxpayer);
  if (!tp) return 0;
  const pct = tp.profit_end !== "" && tp.profit_end != null ? n(tp.profit_end) : tp.profit_beg !== "" && tp.profit_beg != null ? n(tp.profit_beg) : (tp.percent !== "" && tp.percent != null ? n(tp.percent) : 100);
  return pct / 100;
}

function PartnershipSection({ primary }) {
  const { usState, addRow, removeRow, updateRow } = useUsLayer1Store();
  const rows = usState.income_us_source.partnerships_k1 || [];
  const path = "income_us_source.partnerships_k1";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-head font-display font-bold text-base">
            🤝 {primary ? "Partnership — Primary Entity Operations" : "Partnership K-1s Received"}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {primary
              ? "Report the partnership's own gross receipts, COGS, and deductions, plus each partner's K-1 allocation."
              : "Partnerships / joint ventures you receive a Schedule K-1 (Form 1065) from."}
          </div>
        </div>
        <AddBtn onClick={() => addRow(path, makePartnershipRow())}>
          + Add {primary ? "Partnership" : "Partnership / Joint Venture (1065 K-1)"}
        </AddBtn>
      </div>
      {rows.length === 0 && <Empty>No partnerships added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        const ratio = taxpayerShareRatio(row.partners);
        const allocated = partOrdinaryIncome(row) * ratio;
        return (
          <RowCard
            key={row.id}
            title={row.partnership_name || "Untitled Partnership"}
            badge={primary ? "Primary Entity" : `Your Share ${fmtUsd(allocated)}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Partnership Name" value={row.partnership_name} placeholder="e.g. Apex Partners GP" onChange={(v) => patch({ partnership_name: v })} />
                </div>
                <TextField label="EIN" value={row.ein} mono placeholder="12-3456789" onChange={(v) => patch({ ein: v })} />
                <TextField label="NAICS Code" value={row.naics_code} mono maxLength={6} onChange={(v) => patch({ naics_code: v })} />
              </div>
              <SelectField label="Business Type" value={row.industry_category} options={INDUSTRY_OPTIONS} onChange={(v) => patch({ industry_category: v })} />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <SelectField
                  label="Partner Type"
                  value={row.partner_type}
                  options={[{ value: "limited", label: "Limited Partner" }, { value: "general", label: "General Partner" }]}
                  onChange={(v) => patch({ partner_type: v })}
                />
                <SelectField
                  label="Material Participation"
                  value={row.material_participation}
                  options={[{ value: "active", label: "Active (Materially Participates)" }, { value: "passive", label: "Passive (Form 8582 limits)" }]}
                  onChange={(v) => patch({ material_participation: v })}
                />
                <MoneyField label="Tax Basis (USD)" value={row.tax_basis_usd} onChange={(v) => patch({ tax_basis_usd: v })} />
                <MoneyField label="At-Risk Basis (USD)" value={row.at_risk_basis_usd} onChange={(v) => patch({ at_risk_basis_usd: v })} />
              </div>
            </Acc>

            <Acc title="💰 Revenue & Income (K-1 Boxes)">
              <SectionLabel>Core Business Operations</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <MoneyField label="Gross Receipts / Sales" value={row.revenue.gross_receipts} onChange={(v) => patchGroup("revenue", { gross_receipts: v })} />
                <MoneyField label="Returns & Allowances" value={row.revenue.returns_allowances} onChange={(v) => patchGroup("revenue", { returns_allowances: v })} />
                <MoneyField label="Cost of Goods Sold" value={row.revenue.cogs} onChange={(v) => patchGroup("revenue", { cogs: v })} />
                <MoneyField label="Misc / Other Income" value={row.revenue.misc_income} onChange={(v) => patchGroup("revenue", { misc_income: v })} />
              </div>
              <MoneyField
                label="Ordinary Business Income (Box 1) — leave blank to auto-compute from operations above"
                value={row.k1_boxes.box1_ordinary_income}
                highlight
                onChange={(v) => patchGroup("k1_boxes", { box1_ordinary_income: v })}
              />
              <SectionLabel>Investments & Asset Sales</SectionLabel>
              <MoneyGrid group={PART_K1_BOXES_CORE} values={row.k1_boxes} onPatch={(p) => patchGroup("k1_boxes", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 Expenses & Deductions (Form 1065)">
              <SectionLabel>Operating Expenses</SectionLabel>
              <MoneyGrid group={PART_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} cols="md:grid-cols-4" />
              <SectionLabel>K-1 Deduction / Credit Boxes</SectionLabel>
              <MoneyGrid group={PART_K1_BOXES_DEDUCT} values={row.k1_boxes} onPatch={(p) => patchGroup("k1_boxes", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="👥 Partners">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Partner Roster (profit/loss/capital % and liability shares)
                </span>
                <AddBtn onClick={() => patch({ partners: [...(row.partners || []), makePartner()] })}>+ Add Partner</AddBtn>
              </div>
              {(row.partners || []).length === 0 && <Empty>No partners added.</Empty>}
              {(row.partners || []).map((p, pi) => {
                const onP = (patchObj) =>
                  patch({ partners: row.partners.map((pp, idx) => (idx === pi ? { ...pp, ...patchObj } : pp)) });
                return (
                  <NestedRow key={p.id} onRemove={() => patch({ partners: row.partners.filter((_, idx) => idx !== pi) })}>
                    <div className="md:col-span-3">
                      <TextField label="Partner Name" value={p.name} placeholder="e.g. John Doe" onChange={(v) => onP({ name: v })} />
                    </div>
                    <div className="md:col-span-2">
                      <TextField label="SSN / TIN" value={p.tin} mono placeholder="000-00-0000" onChange={(v) => onP({ tin: v })} />
                    </div>
                    <div className="md:col-span-3">
                      <SelectField
                        label="General / Limited"
                        value={p.type}
                        options={[
                          { value: "limited", label: "Limited Partner / LLC Member" },
                          { value: "general", label: "General Partner / Managing Member" },
                        ]}
                        onChange={(v) => onP({ type: v })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <SelectField
                        label="Entity Type"
                        value={p.entity_type}
                        options={[
                          { value: "individual", label: "Individual" },
                          { value: "corporation", label: "Corporation" },
                          { value: "partnership", label: "Partnership" },
                          { value: "other", label: "Other" },
                        ]}
                        onChange={(v) => onP({ entity_type: v })}
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end pb-2.5">
                      <CheckField label="Taxpayer (You)" value={p.is_taxpayer} onChange={(v) => onP({ is_taxpayer: v })} />
                    </div>
                    <div className="md:col-span-4">
                      <label className={labelCls}>Profit Share % (Beg / End)</label>
                      <div className="flex gap-1.5">
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="Beg" value={p.profit_beg ?? ""} onChange={(e) => onP({ profit_beg: e.target.value })} />
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="End" value={p.profit_end ?? ""} onChange={(e) => onP({ profit_end: e.target.value })} />
                      </div>
                    </div>
                    <div className="md:col-span-4">
                      <label className={labelCls}>Loss Share % (Beg / End)</label>
                      <div className="flex gap-1.5">
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="Beg" value={p.loss_beg ?? ""} onChange={(e) => onP({ loss_beg: e.target.value })} />
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="End" value={p.loss_end ?? ""} onChange={(e) => onP({ loss_end: e.target.value })} />
                      </div>
                    </div>
                    <div className="md:col-span-4">
                      <label className={labelCls}>Capital Share % (Beg / End)</label>
                      <div className="flex gap-1.5">
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="Beg" value={p.capital_beg ?? ""} onChange={(e) => onP({ capital_beg: e.target.value })} />
                        <input type="text" inputMode="decimal" className={cx(inputCls, "font-mono")} placeholder="End" value={p.capital_end ?? ""} onChange={(e) => onP({ capital_end: e.target.value })} />
                      </div>
                    </div>
                    <div className="md:col-span-4">
                      <MoneyField label="Nonrecourse Liabilities" value={p.nonrecourse} onChange={(v) => onP({ nonrecourse: v })} />
                    </div>
                    <div className="md:col-span-4">
                      <MoneyField label="Qual. Nonrecourse Liabilities" value={p.qual_nonrecourse} onChange={(v) => onP({ qual_nonrecourse: v })} />
                    </div>
                    <div className="md:col-span-4">
                      <MoneyField label="Recourse Liabilities" value={p.recourse} onChange={(v) => onP({ recourse: v })} />
                    </div>
                  </NestedRow>
                );
              })}
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

/* =========================== S-Corp K-1 =================================== */

const SCORP_K1_BOXES_CORE = [
  ["box2_net_rental_re", "Net Rental RE (Box 2)"],
  ["box3_other_rental", "Other Rental (Box 3)"],
  ["box4_interest", "Interest Income (Box 4)"],
  ["box5a_ordinary_dividends", "Ordinary Divs (Box 5a)"],
  ["box5b_qualified_dividends", "Qualified Divs (Box 5b)"],
  ["box6_royalties", "Royalties (Box 6)"],
  ["box7_stcg", "STCG (Box 7)"],
  ["box8a_ltcg", "LTCG (Box 8a)"],
  ["box8b_collectibles", "Collectibles (Box 8b)"],
  ["box8c_unrecap_1250", "Unrecap §1250 Gain (Box 8c)"],
  ["box9_sec1231", "Net §1231 Gain (Box 9)"],
  ["box10_other_income", "Other Income (Box 10)"],
  ["box14_foreign", "Foreign Transactions (Box 14)"],
];
const SCORP_K1_BOXES_DEDUCT = [
  ["box11_sec179", "Sec 179 (Box 11)"],
  ["box12a_charitable", "Charitable (Box 12a)"],
  ["box12h_other_deductions", "Other Deductions (Box 12h)"],
  ["box13_credits", "Credits (Box 13)"],
  ["box15_amt", "AMT Items (Box 15)"],
  ["box16a_tax_exempt", "Tax-Exempt Interest (Box 16a)"],
  ["box16c_nondeductible", "Nondeductible Expenses (Box 16c)"],
  ["box16d_distributions", "Distributions (Box 16d)"],
];
const SCORP_EXPENSE_FIELDS = [
  ["contract_labor", "Contract Labor"],
  ["legal_professional", "Legal & Professional"],
  ["utilities", "Utilities"],
  ["insurance", "Insurance"],
  ["travel_meals", "Travel & Meals"],
  ["office_supplies", "Office & Supplies"],
  ["wages", "Salaries & Wages"],
  ["officer_comp", "Officer Compensation"],
  ["rent", "Rent / Lease"],
  ["repairs", "Repairs & Maintenance"],
  ["bad_debts", "Bad Debts"],
  ["taxes_licenses", "Taxes & Licenses"],
  ["interest_paid", "Interest Paid"],
  ["advertising", "Advertising"],
  ["employee_benefits", "Employee Benefits"],
  ["pension", "Pension & Profit-Sharing"],
  ["depletion", "Resource Depletion"],
  ["other", "Other Expenses"],
];

function scorpExpenseTotal(row) {
  return SCORP_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0);
}
function scorpCoreProfit(row) {
  const r = row.revenue || {};
  return n(r.gross_receipts) - n(r.returns_allowances) - n(r.cogs) + n(r.misc_income) - scorpExpenseTotal(row);
}
function scorpOrdinaryIncome(row) {
  const box1 = row.k1_boxes?.box1_ordinary_income;
  return box1 !== "" && box1 !== null && box1 !== undefined ? n(box1) : scorpCoreProfit(row);
}

function ScorpSection({ primary }) {
  const { usState, addRow, removeRow, updateRow } = useUsLayer1Store();
  const rows = usState.income_us_source.s_corporations_k1 || [];
  const path = "income_us_source.s_corporations_k1";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-head font-display font-bold text-base">
            🏛 {primary ? "S-Corporation — Primary Entity Operations" : "S-Corp K-1s Received"}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {primary
              ? "Report the S-corp's own gross receipts, COGS, and deductions, plus each shareholder's K-1 allocation."
              : "S-Corporations you receive a Schedule K-1 (Form 1120-S) from."}
          </div>
        </div>
        <AddBtn onClick={() => addRow(path, makeScorpRow())}>+ Add {primary ? "S-Corporation" : "S-Corp K-1"}</AddBtn>
      </div>
      {rows.length === 0 && <Empty>No S-corporations added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        const ratio = taxpayerShareRatio(row.shareholders);
        const allocated = scorpOrdinaryIncome(row) * ratio;
        return (
          <RowCard
            key={row.id}
            title={row.corp_name || "Untitled S-Corporation"}
            badge={primary ? "Primary Entity" : `Your Share ${fmtUsd(allocated)}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="S-Corp Name" value={row.corp_name} onChange={(v) => patch({ corp_name: v })} />
                </div>
                <TextField label="EIN" value={row.ein} mono placeholder="12-3456789" onChange={(v) => patch({ ein: v })} />
                <TextField label="NAICS Code" value={row.naics_code} mono maxLength={6} onChange={(v) => patch({ naics_code: v })} />
              </div>
              <SelectField label="Business Type" value={row.industry_category} options={INDUSTRY_OPTIONS} onChange={(v) => patch({ industry_category: v })} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SelectField
                  label="Material Participation"
                  value={row.material_participation}
                  options={[{ value: "active", label: "Active" }, { value: "passive", label: "Passive (Form 8582 limits)" }]}
                  onChange={(v) => patch({ material_participation: v })}
                />
                <MoneyField label="Tax Basis (USD)" value={row.tax_basis_usd} onChange={(v) => patch({ tax_basis_usd: v })} />
                <MoneyField label="At-Risk Basis (USD)" value={row.at_risk_basis_usd} onChange={(v) => patch({ at_risk_basis_usd: v })} />
              </div>
            </Acc>

            <Acc title="💰 Revenue & Income (K-1 Boxes)">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <MoneyField label="Gross Receipts / Sales" value={row.revenue.gross_receipts} onChange={(v) => patchGroup("revenue", { gross_receipts: v })} />
                <MoneyField label="Returns & Allowances" value={row.revenue.returns_allowances} onChange={(v) => patchGroup("revenue", { returns_allowances: v })} />
                <MoneyField label="Cost of Goods Sold" value={row.revenue.cogs} onChange={(v) => patchGroup("revenue", { cogs: v })} />
                <MoneyField label="Misc / Other Income" value={row.revenue.misc_income} onChange={(v) => patchGroup("revenue", { misc_income: v })} />
              </div>
              <MoneyField
                label="Ordinary Business Income (Box 1) — leave blank to auto-compute from operations above"
                value={row.k1_boxes.box1_ordinary_income}
                highlight
                onChange={(v) => patchGroup("k1_boxes", { box1_ordinary_income: v })}
              />
              <MoneyGrid group={SCORP_K1_BOXES_CORE} values={row.k1_boxes} onPatch={(p) => patchGroup("k1_boxes", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 Expenses & Deductions (Form 1120-S)">
              <SectionLabel>Operating Expenses</SectionLabel>
              <MoneyGrid group={SCORP_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} cols="md:grid-cols-4" />
              <SectionLabel>K-1 Deduction / Credit Boxes</SectionLabel>
              <MoneyGrid group={SCORP_K1_BOXES_DEDUCT} values={row.k1_boxes} onPatch={(p) => patchGroup("k1_boxes", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="🏗 Capital Assets & Depreciation">
              <AssetsBlock
                assets={row.assets}
                onAdd={() => patch({ assets: [...(row.assets || []), makeAsset()] })}
                onRemove={(ai) => patch({ assets: row.assets.filter((_, idx) => idx !== ai) })}
                onChange={(ai, p) => patch({ assets: row.assets.map((a, idx) => (idx === ai ? { ...a, ...p } : a)) })}
              />
            </Acc>

            <Acc title="👥 Shareholders">
              <ShareholderLikeBlock
                title="Shareholder Roster (ownership % and K-1 allocation)"
                addLabel="+ Add Shareholder"
                rows={row.shareholders}
                onAdd={() => patch({ shareholders: [...(row.shareholders || []), makeShareholder()] })}
                onRemove={(ri) => patch({ shareholders: row.shareholders.filter((_, idx) => idx !== ri) })}
                onChange={(ri, p) => patch({ shareholders: row.shareholders.map((s, idx) => (idx === ri ? { ...s, ...p } : s)) })}
              />
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

/* ============================= C-Corp ==================================== */

const CCORP_REVENUE_FIELDS = [
  ["gross_receipts", "Gross Receipts / Sales"],
  ["returns_allowances", "Returns & Allowances"],
  ["cogs", "Cost of Goods Sold"],
  ["misc_income", "Misc / Other Income"],
  ["interest", "Interest Income"],
  ["dividend", "Dividend Income"],
  ["rental", "Rental Income"],
  ["royalty", "Royalty Income"],
  ["cap_gains", "Net Capital Gains"],
  ["asset_sales", "Gain on Asset Sales (§1231)"],
];
const CCORP_EXPENSE_FIELDS = [
  ["contract_labor", "Contract Labor"],
  ["legal_professional", "Legal & Professional"],
  ["utilities", "Utilities"],
  ["insurance", "Insurance"],
  ["travel_meals", "Travel & Meals"],
  ["office_supplies", "Office & Supplies"],
  ["wages", "Salaries & Wages"],
  ["officer_comp", "Officer Compensation"],
  ["repairs", "Repairs & Maintenance"],
  ["bad_debts", "Bad Debts"],
  ["rent", "Rent / Lease"],
  ["taxes", "Taxes & Licenses"],
  ["advertising", "Advertising"],
  ["benefits", "Employee Benefits"],
  ["pension", "Pension & Profit-Sharing"],
  ["depletion", "Resource Depletion"],
  ["charitable", "Charitable Contributions"],
  ["interest_paid", "Interest Paid"],
  ["nol_deduction", "NOL Deduction"],
  ["other", "Other Deductions"],
];

function ccorpRevenueTotal(row) {
  const r = row.revenue || {};
  return CCORP_REVENUE_FIELDS.reduce((s, [k]) => s + (k === "returns_allowances" ? -n(r[k]) : n(r[k])), 0);
}
function ccorpExpenseTotal(row) {
  return CCORP_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0);
}
function ccorpTaxableIncome(row) {
  return ccorpRevenueTotal(row) - ccorpExpenseTotal(row);
}

function CcorpEntitiesBlock() {
  const { usState, addRow, removeRow, updateRow } = useUsLayer1Store();
  const rows = usState.income_us_source.c_corporations_1120 || [];
  const path = "income_us_source.c_corporations_1120";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionLabel>C-Corporation Entities (Form 1120, entity-level — not passed through to Form 1040)</SectionLabel>
      </div>
      <div className="flex justify-end -mt-2">
        <AddBtn onClick={() => addRow(path, makeCcorpRow())}>+ Add C-Corporation</AddBtn>
      </div>
      {rows.length === 0 && <Empty>No C-corporation entities added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        return (
          <RowCard
            key={row.id}
            title={row.entity_name || "Untitled C-Corporation"}
            badge={`Taxable Inc. ${fmtUsd(ccorpTaxableIncome(row))}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <TextField label="Entity Name" value={row.entity_name} onChange={(v) => patch({ entity_name: v })} />
                </div>
                <TextField label="EIN" value={row.ein} mono placeholder="12-3456789" onChange={(v) => patch({ ein: v })} />
                <SelectField label="Business Type" value={row.industry_category} options={INDUSTRY_OPTIONS} onChange={(v) => patch({ industry_category: v })} />
              </div>
            </Acc>
            <Acc title="💰 Revenue">
              <MoneyGrid group={CCORP_REVENUE_FIELDS} values={row.revenue} onPatch={(p) => patchGroup("revenue", p)} cols="md:grid-cols-5" />
            </Acc>
            <Acc title="💳 Deductions">
              <MoneyGrid group={CCORP_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} cols="md:grid-cols-4" />
            </Acc>
            <Acc title="🏗 Capital Assets & Depreciation">
              <AssetsBlock
                assets={row.assets}
                onAdd={() => patch({ assets: [...(row.assets || []), makeAsset()] })}
                onRemove={(ai) => patch({ assets: row.assets.filter((_, idx) => idx !== ai) })}
                onChange={(ai, p) => patch({ assets: row.assets.map((a, idx) => (idx === ai ? { ...a, ...p } : a)) })}
              />
            </Acc>
            <Acc title="👥 Shareholders">
              <ShareholderLikeBlock
                title="Shareholder Roster (ownership %)"
                addLabel="+ Add Shareholder"
                rows={row.shareholders}
                onAdd={() => patch({ shareholders: [...(row.shareholders || []), makeShareholder()] })}
                onRemove={(ri) => patch({ shareholders: row.shareholders.filter((_, idx) => idx !== ri) })}
                onChange={(ri, p) => patch({ shareholders: row.shareholders.map((s, idx) => (idx === ri ? { ...s, ...p } : s)) })}
              />
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

function CcorpProfileBlock() {
  const { usState, setField } = useUsLayer1Store();
  const cp = usState.corporate_profile;
  const cf = usState.corporate_financials;
  const set = (path, v) => setField(path, v);

  return (
    <div className="flex flex-col gap-4">
      <RowCard title="Corporate Profile" onRemove={undefined}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField label="Entity Name" value={cp.entity_name} onChange={(v) => set("corporate_profile.entity_name", v)} />
          <TextField label="EIN" value={cp.ein} mono placeholder="12-3456789" onChange={(v) => set("corporate_profile.ein", v)} />
          <TextField label="NAICS Code" value={cp.naics_code} mono maxLength={6} onChange={(v) => set("corporate_profile.naics_code", v)} />
          <DateField label="Date of Incorporation" value={cp.date_of_incorporation} onChange={(v) => set("corporate_profile.date_of_incorporation", v)} />
          <TextField label="State of Domicile" value={cp.state_of_domicile} placeholder="DE" onChange={(v) => set("corporate_profile.state_of_domicile", v)} />
          <TextField label="Fiscal Year End" value={cp.fiscal_year_end} placeholder="12-31" onChange={(v) => set("corporate_profile.fiscal_year_end", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <CheckField label="≥25% Foreign-Owned" value={cp.is_foreign_owned_25_pct} onChange={(v) => set("corporate_profile.is_foreign_owned_25_pct", v)} />
          <CheckField label="Foreign Corporation" value={cp.is_foreign_corporation} onChange={(v) => set("corporate_profile.is_foreign_corporation", v)} />
        </div>
      </RowCard>

      <RowCard title="Schedule L — Balance Sheet" onRemove={undefined}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MoneyField label="Total Assets (Beginning)" value={cf.schedule_l.assets_beginning} onChange={(v) => set("corporate_financials.schedule_l.assets_beginning", v)} />
          <MoneyField label="Total Assets (Ending)" value={cf.schedule_l.assets_ending} onChange={(v) => set("corporate_financials.schedule_l.assets_ending", v)} />
          <div />
          <MoneyField label="Total Liabilities (Beginning)" value={cf.schedule_l.liabilities_beginning} onChange={(v) => set("corporate_financials.schedule_l.liabilities_beginning", v)} />
          <MoneyField label="Total Liabilities (Ending)" value={cf.schedule_l.liabilities_ending} onChange={(v) => set("corporate_financials.schedule_l.liabilities_ending", v)} />
          <div />
          <MoneyField label="Shareholder Equity (Beginning)" value={cf.schedule_l.equity_beginning} onChange={(v) => set("corporate_financials.schedule_l.equity_beginning", v)} />
          <MoneyField label="Shareholder Equity (Ending)" value={cf.schedule_l.equity_ending} onChange={(v) => set("corporate_financials.schedule_l.equity_ending", v)} />
        </div>
      </RowCard>

      <RowCard title="Schedule M-1 — Book/Tax Reconciliation" onRemove={undefined}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MoneyField label="Net Income per Books" value={cf.schedule_m1.net_income_per_books} onChange={(v) => set("corporate_financials.schedule_m1.net_income_per_books", v)} />
          <MoneyField label="Federal Tax Expense" value={cf.schedule_m1.federal_tax_expense} onChange={(v) => set("corporate_financials.schedule_m1.federal_tax_expense", v)} />
          <MoneyField label="Meals Disallowed (50%)" value={cf.schedule_m1.meals_disallowed_50} onChange={(v) => set("corporate_financials.schedule_m1.meals_disallowed_50", v)} />
          <MoneyField label="Tax Depreciation over Book" value={cf.schedule_m1.tax_depreciation_over_book} onChange={(v) => set("corporate_financials.schedule_m1.tax_depreciation_over_book", v)} />
          <MoneyField label="Taxable Income (Computed)" value={cf.schedule_m1.taxable_income} onChange={(v) => set("corporate_financials.schedule_m1.taxable_income", v)} />
        </div>
      </RowCard>

      <RowCard title="Schedule M-2 — Retained Earnings" onRemove={undefined}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MoneyField label="Retained Earnings (Beginning)" value={cf.schedule_m2.retained_earnings_beginning} onChange={(v) => set("corporate_financials.schedule_m2.retained_earnings_beginning", v)} />
          <MoneyField label="Distributions / Dividends Paid" value={cf.schedule_m2.distributions_dividends_paid} onChange={(v) => set("corporate_financials.schedule_m2.distributions_dividends_paid", v)} />
          <MoneyField label="Retained Earnings (Ending)" value={cf.schedule_m2.retained_earnings_ending} onChange={(v) => set("corporate_financials.schedule_m2.retained_earnings_ending", v)} />
        </div>
      </RowCard>

      <CcorpEntitiesBlock />
    </div>
  );
}

function CorporateInternationalBlock() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const ci = usState.corporate_international;
  const path = "corporate_international.form_5472_related_parties";
  const rows = ci.form_5472_related_parties || [];

  return (
    <div className="flex flex-col gap-4">
      <RowCard title="CFC-Adjacent International Fields" onRemove={undefined}>
        <div className="text-[11px] text-muted -mt-1">
          FDII/GILTI-successor (NCTI) inputs for a majority-owned or foreign-owned domestic corporation.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MoneyField
            label="FDII-Eligible Income (Foreign-Derived Deduction Eligible Income)"
            value={ci.fdii_eligible_income}
            onChange={(v) => setField("corporate_international.fdii_eligible_income", v)}
          />
          <MoneyField
            label="NCTI Tested Income (post-OBBBA GILTI successor)"
            value={ci.ncti_tested_income}
            onChange={(v) => setField("corporate_international.ncti_tested_income", v)}
          />
        </div>
      </RowCard>

      <RowCard title="Form 5472 — 25%-Foreign-Owned Related Parties" onRemove={undefined}>
        <div className="flex justify-end -mt-1">
          <AddBtn onClick={() => addRow(path, makeRelatedParty())}>+ Add Related Party</AddBtn>
        </div>
        {rows.length === 0 && <Empty>No related parties added.</Empty>}
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-white/[0.02] border border-line rounded-xl p-3">
            <div className="md:col-span-4">
              <TextField label="Related Party Name" value={r.name} onChange={(v) => updateRow(path, i, { name: v })} />
            </div>
            <div className="md:col-span-3">
              <TextField label="Country" value={r.country} onChange={(v) => updateRow(path, i, { country: v })} />
            </div>
            <div className="md:col-span-3">
              <TextField label="Relationship" value={r.relationship} placeholder="e.g. Parent, Sub" onChange={(v) => updateRow(path, i, { relationship: v })} />
            </div>
            <div className="md:col-span-1">
              <MoneyField label="Own %" value={r.ownership_percent} onChange={(v) => updateRow(path, i, { ownership_percent: v })} />
            </div>
            <div className="md:col-span-1 flex justify-end">
              <RemoveBtn onClick={() => removeRow(path, i)} />
            </div>
          </div>
        ))}
      </RowCard>
    </div>
  );
}

/* ============================== Trust ===================================== */

const TRUST_K1_BOXES = [
  ["box1_interest", "Interest Income (Box 1)"],
  ["box3_other_rental", "Other Rental (Box 3)"],
  ["box5_ordinary_dividends", "Ordinary Divs (Box 5)"],
  ["box6a_other_income", "Other Income (Box 6a)"],
  ["box6b_qualified_dividends", "Qualified Divs (Box 6b)"],
  ["box7_royalty", "Royalties (Box 7)"],
  ["box8_stcg", "STCG (Box 8)"],
  ["box9a_ltcg", "LTCG (Box 9a)"],
  ["box9_ord_gain", "Ordinary Gain (Box 9)"],
];
const TRUST_EXPENSE_FIELDS = [
  ["wages", "Wages"],
  ["contract_labor", "Contract Labor"],
  ["rent", "Rent / Lease"],
  ["repairs", "Repairs"],
  ["bad_debts", "Bad Debts"],
  ["taxes", "Taxes"],
  ["interest_paid", "Interest Paid"],
  ["charity", "Charitable Contributions"],
  ["advertising", "Advertising"],
  ["employee_benefits", "Employee Benefits"],
  ["pension", "Pension & Profit-Sharing"],
  ["depletion", "Resource Depletion"],
  ["legal_professional", "Legal & Professional"],
  ["utilities", "Utilities"],
  ["insurance", "Insurance"],
  ["travel_meals", "Travel & Meals"],
  ["office_supplies", "Office & Supplies"],
  ["other", "Other Expenses"],
];

function trustK1Total(row) {
  const b = row.k1_boxes || {};
  return TRUST_K1_BOXES.reduce((s, [k]) => s + n(b[k]), 0);
}
function trustExpenseTotal(row) {
  const f = row.fees || {};
  return TRUST_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.expenses?.[k]), 0) + n(f.fiduciary) + n(f.professional) + n(f.admin);
}
function trustNetIncome(row) {
  return trustK1Total(row) - trustExpenseTotal(row);
}

function TrustSection({ primary }) {
  const { usState, addRow, removeRow, updateRow, setField } = useUsLayer1Store();
  const rows = usState.income_us_source.trusts_estates_k1 || [];
  const path = "income_us_source.trusts_estates_k1";

  return (
    <div className="flex flex-col gap-4">
      {primary && (
        <RowCard title="Trust — Retained Income" onRemove={undefined}>
          <div className="text-[11px] text-muted -mt-1">
            Income the trust retains (not distributed to beneficiaries) is taxed to the trust itself at
            compressed trust brackets, not passed through on a K-1.
          </div>
          <MoneyField
            label="Trust-Retained Income (USD)"
            value={usState.profile.trust_retained_income_usd}
            onChange={(v) => setField("profile.trust_retained_income_usd", v)}
          />
        </RowCard>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="text-head font-display font-bold text-base">
            📜 {primary ? "Beneficiaries' Share of Income (Form 1041 Schedule K-1)" : "Trust / Estate K-1s Received"}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {primary
              ? "Report income distributed to each beneficiary via Schedule K-1 (Form 1041)."
              : "Trusts and estates you receive a Schedule K-1 (Form 1041) from."}
          </div>
        </div>
        <AddBtn onClick={() => addRow(path, makeTrustRow())}>+ Add {primary ? "Beneficiary" : "Trust/Estate K-1"}</AddBtn>
      </div>
      {rows.length === 0 && <Empty>No trusts/estates added.</Empty>}
      {rows.map((row, i) => {
        const patch = (p) => updateRow(path, i, p);
        const patchGroup = (group, p) => updateRow(path, i, { [group]: { ...row[group], ...p } });
        return (
          <RowCard
            key={row.id}
            title={row.trust_name || "Untitled Trust/Estate"}
            badge={`Net ${fmtUsd(trustNetIncome(row))}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Trust / Estate Name" value={row.trust_name} onChange={(v) => patch({ trust_name: v })} />
                </div>
                <TextField label="EIN" value={row.ein} mono placeholder="12-3456789" onChange={(v) => patch({ ein: v })} />
                <SelectField
                  label="Trust Type"
                  value={row.trust_type}
                  options={[{ value: "simple", label: "Simple Trust" }, { value: "complex", label: "Complex Trust" }, { value: "estate", label: "Estate" }, { value: "grantor", label: "Grantor Trust" }]}
                  onChange={(v) => patch({ trust_type: v })}
                />
              </div>
              <SelectField label="Business Type" value={row.industry_category} options={INDUSTRY_OPTIONS} onChange={(v) => patch({ industry_category: v })} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MoneyField label="Fiduciary Fees" value={row.fees.fiduciary} onChange={(v) => patchGroup("fees", { fiduciary: v })} />
                <MoneyField label="Professional Fees" value={row.fees.professional} onChange={(v) => patchGroup("fees", { professional: v })} />
                <MoneyField label="Admin Expenses" value={row.fees.admin} onChange={(v) => patchGroup("fees", { admin: v })} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SelectField
                  label="Material Participation"
                  value={row.material_participation}
                  options={[{ value: "active", label: "Active" }, { value: "passive", label: "Passive" }]}
                  onChange={(v) => patch({ material_participation: v })}
                />
                <div className="flex items-end pb-2.5">
                  <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                </div>
                <div className="flex items-end pb-2.5">
                  <CheckField label="SSTB?" value={row.sstb} onChange={(v) => patch({ sstb: v })} />
                </div>
              </div>
            </Acc>

            <Acc title="💰 Income (K-1 Boxes)">
              <MoneyGrid group={TRUST_K1_BOXES} values={row.k1_boxes} onPatch={(p) => patchGroup("k1_boxes", p)} cols="md:grid-cols-3" />
            </Acc>

            <Acc title="💳 Expenses (Form 1041)">
              <MoneyGrid group={TRUST_EXPENSE_FIELDS} values={row.expenses} onPatch={(p) => patchGroup("expenses", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="👥 Beneficiaries">
              <ShareholderLikeBlock
                title="Beneficiary Roster (distribution share % and K-1 allocation)"
                addLabel="+ Add Beneficiary"
                rows={row.beneficiaries}
                onAdd={() => patch({ beneficiaries: [...(row.beneficiaries || []), makeBeneficiary()] })}
                onRemove={(ri) => patch({ beneficiaries: row.beneficiaries.filter((_, idx) => idx !== ri) })}
                onChange={(ri, p) => patch({ beneficiaries: row.beneficiaries.map((b, idx) => (idx === ri ? { ...b, ...p } : b)) })}
              />
            </Acc>
          </RowCard>
        );
      })}
    </div>
  );
}

/* ======================= simplified income total ========================= */
//
// SIMPLIFIED PORT of calculateBusinessIncomes() (layer1_us.html:10114,
// 1072 lines). The original performs basis/at-risk limitation, passive
// activity loss (Form 8582) netting, branch consolidation, QBI wage/UBIA
// limits, and AMT preference flow-through per entity before arriving at a
// final pass-through figure. This version sums the obvious top-line number
// per entity (gross receipts minus itemized expenses, or Box 1 ordinary
// income when entered directly) and allocates K-1 entities by the
// taxpayer's ownership % — full fidelity deferred, see the gap report.
function computeSimplifiedTotals(usState) {
  const src = usState.income_us_source;

  const seNet = (src.self_employment || []).reduce((s, r) => s + seNetProfit(r), 0);
  const farmNet = (src.farming_schedule_f || []).reduce((s, r) => s + farmNetProfit(r), 0);

  const partNet = (src.partnerships_k1 || []).reduce(
    (s, r) => s + partOrdinaryIncome(r) * taxpayerShareRatio(r.partners),
    0
  );
  const scorpNet = (src.s_corporations_k1 || []).reduce(
    (s, r) => s + scorpOrdinaryIncome(r) * taxpayerShareRatio(r.shareholders),
    0
  );
  const trustNet = (src.trusts_estates_k1 || []).reduce((s, r) => {
    const total = trustK1Total(r) - trustExpenseTotal(r);
    return s + total * taxpayerShareRatio(r.beneficiaries);
  }, 0);
  const trustRetained = n(usState.profile.trust_retained_income_usd);

  const ccorpEntityNet = (src.c_corporations_1120 || []).reduce((s, r) => s + ccorpTaxableIncome(r), 0);

  const passThroughTotal = seNet + farmNet + partNet + scorpNet + trustNet;

  return { seNet, farmNet, partNet, scorpNet, trustNet, trustRetained, ccorpEntityNet, passThroughTotal };
}

function TotalsBanner({ totals, effectiveType }) {
  const items = [
    ["Self-Employment (Sch C)", totals.seNet],
    ["Farming (Sch F)", totals.farmNet],
    ["Partnership K-1s", totals.partNet],
    ["S-Corp K-1s", totals.scorpNet],
    ["Trust/Estate K-1s (Distributed)", totals.trustNet],
  ];
  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
          Simplified Business Income Total (pass-through to Form 1040)
        </span>
        <span className="text-head font-display font-bold text-lg">{fmtUsd(totals.passThroughTotal)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map(([label, val]) => (
          <div key={label} className="rounded-xl bg-white/[0.02] border border-line px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-muted">{label}</div>
            <div className="text-sm font-mono font-semibold text-body mt-0.5">{fmtUsd(val)}</div>
          </div>
        ))}
      </div>
      {(totals.trustRetained !== 0 || totals.ccorpEntityNet !== 0) && (
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-line text-[11px] text-muted">
          {totals.trustRetained !== 0 && <span>Trust-retained income (not passed through): <span className="text-body font-mono">{fmtUsd(totals.trustRetained)}</span></span>}
          {totals.ccorpEntityNet !== 0 && <span>C-Corp entity-level taxable income (not passed through): <span className="text-body font-mono">{fmtUsd(totals.ccorpEntityNet)}</span></span>}
        </div>
      )}
      <div className="text-[10px] text-muted mt-3">
        Simplified from layer1_us.html's calculateBusinessIncomes() (1072 lines) — full port deferred, see gap report.
      </div>
    </div>
  );
}

/* ================================ main =================================== */

export default function BusinessStep() {
  const { usState } = useUsLayer1Store();
  const [activeTab, setActiveTab] = useState(null);

  // Core branch ported from updateBusinessStepLogic() (layer1_us.html:7307):
  // resolve the effective entity type through the LLC election, then decide
  // which subsections are relevant. The original's CSS flexbox re-ordering/
  // relabeling cosmetics are intentionally NOT replicated 1:1 — this uses a
  // header swap + tabbed sections instead (see file header "SIMPLIFIED").
  const selectedType = usState.profile.tax_entity_type || "individual";
  const effectiveType = selectedType === "llc" ? usState.profile.llc_tax_election || "individual" : selectedType;
  const isCorpOrPartnership = ["ccorp", "scorp", "partnership"].includes(effectiveType);

  const totals = useMemo(() => computeSimplifiedTotals(usState), [usState]);

  const tabs = useMemo(() => {
    if (effectiveType === "ccorp") {
      return [
        { key: "ccorp", label: "C-Corp Entity", render: () => <CcorpProfileBlock /> },
        { key: "intl", label: "Corporate International (CFC-Adjacent)", render: () => <CorporateInternationalBlock /> },
      ];
    }
    if (effectiveType === "partnership") {
      return [{ key: "partnership", label: "Partnership Operations & Partners", render: () => <PartnershipSection primary /> }];
    }
    if (effectiveType === "scorp") {
      return [{ key: "scorp", label: "S-Corp Operations & Shareholders", render: () => <ScorpSection primary /> }];
    }
    if (effectiveType === "trust") {
      return [{ key: "trust", label: "Trust Income & Beneficiaries", render: () => <TrustSection primary /> }];
    }
    // individual / llc-disregarded default
    return [
      { key: "se", label: "Self-Employment (Sch C)", render: () => <SelfEmploymentSection /> },
      { key: "farm", label: "Farming (Sch F)", render: () => <FarmSection /> },
      { key: "part", label: "Partnership K-1s", render: () => <PartnershipSection primary={false} /> },
      { key: "scorp", label: "S-Corp K-1s", render: () => <ScorpSection primary={false} /> },
      { key: "trust", label: "Trust/Estate K-1s", render: () => <TrustSection primary={false} /> },
    ];
  }, [effectiveType]);

  const currentKey = activeTab && tabs.some((t) => t.key === activeTab) ? activeTab : tabs[0]?.key;
  const current = tabs.find((t) => t.key === currentKey);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-head font-display font-bold text-xl">
          {isCorpOrPartnership ? "Screen 3C-2 — Primary Trade or Business & K-1s" : "Screen 3C-2 — Business, Self-Employment & K-1s"}
        </h2>
        <p className="text-[13px] text-muted mt-1">
          {isCorpOrPartnership ? (
            <>
              Report the primary operating income, COGS, and deductions for the entity, as well as K-1
              pass-throughs.{" "}
              <span className="text-amber-400">
                Domestic subsidiaries/joint ventures belong in Investments; foreign subsidiaries belong in
                Foreign Entities.
              </span>
            </>
          ) : (
            "Add any Schedule C, farming, K-1 pass-throughs, or self-employment income you receive."
          )}
        </p>
      </div>

      <TotalsBanner totals={totals} effectiveType={effectiveType} />

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cx(
                "text-[11px] font-semibold uppercase tracking-wide px-3 py-2 rounded-lg border transition-colors",
                t.key === currentKey
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "bg-white/[0.02] border-line text-muted hover:text-body"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {current?.render()}

      <div className="rounded-2xl bg-white/[0.02] border border-line p-4 text-[11px] text-muted leading-relaxed">
        <span className="font-semibold text-body">Deferred vs. the vanilla-JS source (layer1_us.html):</span>{" "}
        addUsBranchRow (US branches of a foreign-parented business, nested under Schedule C/Partnership/S-Corp
        rows, ~715 lines) is not ported; the full basis/at-risk/passive-loss/QBI-limitation logic inside
        calculateBusinessIncomes() (1072 lines) is replaced with the simplified top-line total above; the
        ~25-option NAICS/SSTB dropdown is collapsed to a short list; and updateBusinessStepLogic()'s DOM
        flexbox re-ordering is replaced with tabs rather than replicated literally.
      </div>
    </div>
  );
}
