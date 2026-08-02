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
// FAITHFULLY PORTED (post-hardening-pass — see "BUG FOUND & FIXED" comments
// inline at CorporateProfileBlock/ScheduleLM1M2Block and the `tabs` builder
// in the default export for what was wrong before this pass and how it was
// corrected):
//   - Entity-type-driven PRIMARY-section selection (the CORE branch of
//     updateBusinessStepLogic, layer1_us.html:7307-7455): usState.profile
//     .tax_entity_type (resolved through llc_tax_election when the type is
//     'llc') decides which one subsection is forced open / labeled "PRIMARY
//     ENTITY OPERATIONS", exactly as the original's `type` variable does —
//     but, matching the source, ALL SIX sections (Schedule C, Schedule F,
//     Partnership/S-Corp/C-Corp/Trust) stay visible and independently usable
//     for every entity type. (Earlier in this port's life the tabs were
//     branch-gated on effectiveType and hid every non-primary section —
//     that was a real bug, not a simplification; fixed in this pass.)
//   - corporate_profile (EIN/entity name/domicile/NAICS/foreign-owned flags)
//     is reachable for every non-individual entity type, INCLUDING trust,
//     matching updateProfileVisibility()'s corpProfileFields gating
//     (layer1_us.html:7059-7071). Schedule L/M-1/M-2 is reachable only for
//     the isCorpOrPartnership types (ccorp/scorp/partnership — trust
//     excluded, matching toggleCorporateFinancials(), layer1_us.html:7185-
//     7205, since Form 1041 doesn't file Schedule L/M-1/M-2). Previously
//     BOTH were reachable for 'ccorp' only.
//   - The full field surface for Schedule C (self-employment), Schedule F
//     (farm), Partnership/S-Corp/Trust K-1 boxes, and C-Corp entity
//     financials, keyed off the original's CSS class names (se-*, part-*,
//     scorp-*, ccorp-*, trust-*, farm-*, asset-*, partner-*, sh-*, bene-*)
//     so field coverage matches the source app box-for-box.
//   - Two full nested-repeatable patterns: depreciable assets nested inside
//     a Schedule C business (createAssetRowDOM), and partners nested inside
//     a Partnership K-1 (addPartPartnerRow) — plus the same shareholder/
//     beneficiary nested-repeatable pattern reused for S-Corp, C-Corp, and
//     Trust rows. Verified end-to-end: nested add/edit/remove mutates the
//     PARENT row's array via the store's updateRow(path, index, patch)
//     (immutable shallow-merge), never a sibling top-level array.
//   - corporate_international (FDII/NCTI/Form 5472) is NOT owned here —
//     removed in this pass. It doesn't appear anywhere in
//     panel-step-business (layer1_us.html:2220-2718); the real UI is on
//     panel-step-entities, already ported faithfully by EntitiesStep.jsx.
//     This file previously duplicated that array
//     (corporate_international.form_5472_related_parties) with an
//     INCOMPATIBLE row shape from EntitiesStep.jsx's — a live instance of
//     the cross-step field-ownership collision class of bug flagged as a
//     recurring risk in docs/LAYER1_US_REACT_PORT_GAPS.md item 2.
//
// SIMPLIFIED / DEFERRED (see computeSimplifiedTotals below and the
// "Deferred" footer rendered at the bottom of this step) — genuine
// large-scope deferrals, left as-is per this pass's scope:
//   - calculateBusinessIncomes() (1072 lines) is NOT ported in full. This
//     file computes a SIMPLIFIED top-line net-income figure per entity type
//     (gross receipts minus itemized expenses / COGS, allocated by the
//     taxpayer's K-1 ownership %) — it does NOT implement basis limitation
//     (§704(d)/§465 at-risk), passive-activity-loss (Form 8582) limits, QBI
//     wage/UBIA phase-outs, AMT preference flow-through, or branch
//     consolidation logic the original performs. Checked that it isn't
//     summing the wrong fields (e.g. gross receipts instead of net, or
//     double-counting a K-1/entity total): each entity type's total is
//     revenue minus itemized expenses/COGS (or an explicit Box 1 override),
//     multiplied by the taxpayer's ownership ratio; C-Corp entity-level
//     income and trust-retained income are correctly excluded from the
//     pass-through sum and called out separately in the banner as
//     "not passed through."
//   - updateBusinessStepLogic()'s CSS flexbox re-ordering/relabeling
//     cosmetics are simplified to a tab UI (entity-type's own section
//     brought to the front) rather than literally re-ordering DOM nodes —
//     but, per the fix above, no section is hidden by entity type either
//     way, matching the source.
//   - addUsBranchRow (~715 lines — US branches of a foreign-parented
//     business, nested under Schedule C / Partnership / S-Corp rows) is NOT
//     ported. Deferred entirely; noted inline where it would have appeared.
//   - The ~25-option NAICS/SSTB industry-category dropdown is collapsed to
//     a short representative list + free-text fallback.

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

// BUG FIX (Tier 0 #1, self-employment/Schedule C): the row shape below used
// to nest COGS/expenses under row.cogs{}/row.expenses{} with several field
// names that don't match what either DAG engine reads at all
// (aggregate_us_income.py:55-58 reads cogs_beginning_inventory/
// cogs_purchases/cogs_labor/cogs_materials/cogs_ending_inventory,
// gross_receipts_usd, returns_and_allowances_usd, other_income_usd, and
// expenses_usd — all FLAT top-level scalars) — meaning every Schedule C
// business's net profit silently computed as $0 no matter what the user
// entered. Field names/shape now match layer1_us.html:13569-13658's
// syncSeState() exactly (the ground truth for what the live form actually
// persists), including the two above-the-line-deduction feeder fields
// (se_health_insurance_usd/se_retirement_contrib_usd) that derive.js's
// applyBusinessIncomeDerivations() sums into income_us_source's flat
// se_health_insurance_deduction_usd/se_retirement_deduction_usd — the
// fields ustax.py:661-662 actually reads.
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
    is_specified_service_trade: false,
    gross_receipts_usd: "",
    returns_and_allowances_usd: "",
    other_income_usd: "",
    // expenses_usd is DERIVED (summed from itemized_expenses below) by
    // derive.js on every mutation — never set directly by a field handler.
    expenses_usd: 0,
    itemized_expenses: {
      advertising: "",
      contract_labor: "",
      insurance: "",
      legal_professional: "",
      business_meals: "",
      office_expenses: "",
      rent_lease: "",
      repairs_maintenance: "",
      supplies: "",
      utilities: "",
      taxes_and_licenses: "",
      travel: "",
      commissions: "",
      other: "",
    },
    wages_paid_usd: "",
    se_health_insurance_usd: "",
    se_retirement_contrib_usd: "",
    cogs_method: "cost",
    cogs_beginning_inventory: "",
    cogs_purchases: "",
    cogs_labor: "",
    cogs_materials: "",
    cogs_ending_inventory: "",
    vehicle_miles: "",
    home_office_sqft: "",
    // addUsBranchRow (US branches of a foreign-parented business) deferred
    // entirely — see file header.
    assets: [],
  };
}

function makeFarmRow() {
  return {
    id: uid("farm"),
    // BUG FIX (Tier 0 #1, farm/Schedule F): mirrors the Schedule C fix above
    // — field names/shape now match layer1_us.html:14178-14214's
    // syncFarmState() exactly. aggregate_us_income.py:68-78 reads
    // itemized_income{} (NOT income{}) with these specific box names, and
    // inventory{} (NOT beginning/purchases/ending) only when
    // accounting_method === 'accrual'; expenses_usd is derived (summed from
    // itemized_expenses) by derive.js, same as Schedule C.
    business_name: "",
    ein: "",
    naics_code: "",
    accounting_method: "cash",
    wages_paid_usd: "",
    qbi_eligible: false,
    expenses_usd: 0,
    itemized_income: {
      sales_livestock_produce_raised: "",
      sales_livestock_produce_purchased: "",
      cooperative_distributions: "",
      agricultural_program_payments: "",
      ccc_loans: "",
      crop_insurance_proceeds: "",
      custom_hire_income: "",
      other_income: "",
    },
    itemized_expenses: {
      chemicals: "",
      conservation: "",
      custom_hire: "",
      employee_benefits: "",
      feed: "",
      fertilizers: "",
      freight: "",
      gas_fuel_oil: "",
      insurance: "",
      interest_mortgage: "",
      interest_other: "",
      labor_hired: "",
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
    inventory: { beginning_inventory: "", cost_of_purchases: "", ending_inventory: "" },
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

// BUG FIX (Tier 0 #1, partnership K-1): the row shape used to nest every
// K-1 box under row.k1_boxes.boxN_* AND fabricate a row.revenue{}/
// row.expenses{} pair (gross receipts/COGS/itemized operating expenses) that
// doesn't exist anywhere in the real form's data model at all — confirmed
// against layer1_us.html:14226-14249's normalizePartK1Item() ground truth,
// which has no revenue/expenses fields whatsoever. A K-1 recipient reports
// what's printed on the boxes of the K-1 THEY received; the partnership's
// own revenue/COGS/expenses are that entity's business, not data the
// taxpayer's K-1 carries — so those two nested groups were pure fiction that
// (a) fed the "Box 1" display through a wrong fallback-compute path and (b)
// were never read by either DAG engine no matter what a user entered.
// Every box is now a flat top-level field with real IRS box names, matching
// aggregate_us_income.py:162-168/223-306's actual reads.
function makePartnershipRow() {
  return {
    id: uid("part-k1"),
    business_name: "",
    ein: "",
    naics_code: "",
    industry_category: "",
    partner_type: "limited",
    material_participation: "active",
    active_rental_participant: false,
    tax_basis_usd: "",
    at_risk_basis_usd: "",
    // Box 1-11 (income/gains)
    ordinary_income_usd: "",
    net_rental_real_estate_usd: "",
    other_rental_income_usd: "",
    guaranteed_payments_usd: "",
    interest_income_usd: "",
    ordinary_dividends_usd: "",
    qualified_dividends_usd: "",
    royalties_usd: "",
    stcg_usd: "",
    ltcg_usd: "",
    collectibles_gain_usd: "",
    unrecaptured_1250_gain_usd: "",
    net_sec1231_gain_usd: "",
    other_income_usd: "",
    // Box 12-19 (deductions/credits/other reporting)
    sec179_deduction_usd: "",
    charitable_contributions_usd: "",
    investment_interest_usd: "",
    self_employment_earnings_usd: "",
    credits_usd: "",
    foreign_transactions_usd: "",
    amt_items_usd: "",
    tax_exempt_income_usd: "",
    nondeductible_expenses_usd: "",
    distributions_usd: "",
    qbi_eligible: false,
    is_specified_service_trade: false,
    qbi_wages_usd: "",
    qbi_ubia_usd: "",
    // addUsBranchRow deferred — see file header.
    partners: [],
  };
}

function makeShareholder() {
  return { id: uid("sh"), name: "", tin: "", percent: "", is_taxpayer: false };
}

// BUG FIX (Tier 0 #1, S-corp K-1): same fix pattern as partnership above.
// Field names now match layer1_us.html:15729-15790's syncScorpK1State()
// ground truth exactly. Note box 9 (net Section 1231 gain) is
// `sec1231_gain_usd`, NOT `net_sec1231_gain_usd` — different from
// partnership's box 10 name — matching aggregate_us_income.py:166's own
// fallback chain (`net_sec1231_gain_usd if not None else sec1231_gain_usd`)
// and the real 1120-S K-1 box numbering. The source also collects legacy
// gross_revenue/exp_* fields per row, but getCalculatedOrdinaryIncome()
// (layer1_us.html:7774-7792) only ever falls back to them when a state
// entry with ordinary_income_usd can't be found at all — with the Box 1
// field always present here, ordinary_income_usd is always directly
// entered, so those legacy fields are vestigial and intentionally not
// carried over (never read by either DAG engine).
function makeScorpRow() {
  return {
    id: uid("scorp-k1"),
    business_name: "",
    ein: "",
    naics_code: "",
    industry_category: "",
    material_participation: "active",
    active_rental_participant: false,
    tax_basis_usd: "",
    at_risk_basis_usd: "",
    // Box 1-10 (income/gains)
    ordinary_income_usd: "",
    net_rental_real_estate_usd: "",
    other_rental_income_usd: "",
    interest_income_usd: "",
    ordinary_dividends_usd: "",
    qualified_dividends_usd: "",
    royalties_usd: "",
    stcg_usd: "",
    ltcg_usd: "",
    collectibles_gain_usd: "",
    unrecaptured_1250_gain_usd: "",
    sec1231_gain_usd: "",
    other_income_usd: "",
    // Box 11-16 (deductions/credits/other reporting)
    sec179_deduction_usd: "",
    charitable_contributions_usd: "",
    investment_interest_usd: "",
    credits_usd: "",
    foreign_transactions_usd: "",
    amt_items_usd: "",
    tax_exempt_income_usd: "",
    nondeductible_expenses_usd: "",
    distributions_usd: "",
    qbi_eligible: false,
    is_specified_service_trade: false,
    qbi_wages_usd: "",
    qbi_ubia_usd: "",
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

// BUG FIX (Tier 0 #1, trust/estate K-1): same fix pattern as
// partnership/S-corp above — field names now match
// layer1_us.html:17053-17102's syncTrustK1State() ground truth exactly. Two
// trust-specific quirks vs. the other two K-1 types (both confirmed against
// aggregate_us_income.py:162-168/252/276):
//   - Box 7 (royalty income) is `royalty_income_usd`, NOT `royalties_usd`
//     like partnership/S-corp — the DAG's own fallback chain
//     (`royalties_usd if not None else royalty_income_usd`) exists
//     specifically because trust rows use this different name.
//   - Trust has no guaranteed_payments_usd, sec179_deduction_usd, or
//     qbi_wages_usd/qbi_ubia_usd fields at all — confirmed absent from both
//     the source form and aggregate_us_income.py's own comment ("trusts_
//     estates_k1 has no qbi_wages_usd/qbi_ubia_usd fields on Layer 1 at
//     all").
// The old row.sstb field is renamed is_specified_service_trade (matching
// the SSTB fallback-chain field the DAG actually checks first, and every
// other entity type's field name); the old .fees{}/.k1_boxes{}/.expenses{}
// nesting (with fabricated box-number-mismatched keys — e.g. box8_stcg was
// bound to the actual box 8 ordinary-gain field, not STCG) is flattened to
// match ground truth. gross_revenue/exp_* are collected by the source but
// never feed ordinary_income_usd (always direct Box 1 entry, same
// reasoning as S-corp's makeScorpRow() comment) — intentionally not
// carried over.
function makeTrustRow() {
  return {
    id: uid("trust-k1"),
    business_name: "",
    ein: "",
    industry_category: "",
    trust_type: "complex",
    fiduciary_fees: "",
    professional_fees: "",
    admin_expenses: "",
    ordinary_income_usd: "",
    material_participation: "passive",
    qbi_eligible: false,
    interest_income_usd: "",
    ordinary_dividends_usd: "",
    qualified_dividends_usd: "",
    stcg_usd: "",
    ltcg_usd: "",
    other_rental_income_usd: "",
    royalty_income_usd: "",
    ordinary_gain_usd: "",
    is_specified_service_trade: false,
    active_rental_participant: false,
    net_rental_real_estate_usd: "",
    depreciation_allocation_usd: "",
    beneficiaries: [],
    assets: [],
  };
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

// Matches derive.js's SE_ITEMIZED_EXPENSE_KEYS (the fields DAG-visible
// expenses_usd is actually summed from) plus the labels for display.
const SE_EXPENSE_FIELDS = [
  ["advertising", "Advertising"],
  ["contract_labor", "Contract Labor"],
  ["insurance", "Insurance (Non-Health)"],
  ["legal_professional", "Legal / Professional"],
  ["business_meals", "Business Meals (50%)"],
  ["office_expenses", "Office Expenses"],
  ["rent_lease", "Rent / Lease"],
  ["repairs_maintenance", "Repairs & Maint."],
  ["supplies", "Supplies"],
  ["utilities", "Utilities"],
  ["taxes_and_licenses", "Taxes & Licenses"],
  ["travel", "Travel (No Meals)"],
  ["commissions", "Commissions"],
  ["other", "Other Misc. Expenses"],
];

function seExpenseTotal(row) {
  return SE_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.itemized_expenses?.[k]), 0);
}
function seCogsNet(row) {
  return (
    n(row.cogs_beginning_inventory) +
    n(row.cogs_purchases) +
    n(row.cogs_labor) +
    n(row.cogs_materials) -
    n(row.cogs_ending_inventory)
  );
}
function seNetProfit(row) {
  return (
    n(row.gross_receipts_usd) -
    n(row.returns_and_allowances_usd) +
    n(row.other_income_usd) -
    seCogsNet(row) -
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
                  <CheckField label="SSTB?" value={row.is_specified_service_trade} onChange={(v) => patch({ is_specified_service_trade: v })} />
                </div>
              </div>
            </Acc>

            <Acc title="💰 Revenue & Gross Receipts">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MoneyField label="Gross Receipts (USD)" value={row.gross_receipts_usd} highlight onChange={(v) => patch({ gross_receipts_usd: v })} />
                <MoneyField label="Returns & Allowances (USD)" value={row.returns_and_allowances_usd} onChange={(v) => patch({ returns_and_allowances_usd: v })} />
                <MoneyField label="Other Income (USD)" value={row.other_income_usd} highlight onChange={(v) => patch({ other_income_usd: v })} />
              </div>
              <SectionLabel>Cost of Goods Sold (Part III)</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <SelectField
                  label="Inventory Method"
                  value={row.cogs_method}
                  options={[{ value: "cost", label: "Cost" }, { value: "lower_of_cost_or_market", label: "Lower of Cost or Market" }, { value: "other", label: "Other" }]}
                  onChange={(v) => patch({ cogs_method: v })}
                />
                <MoneyField label="Beginning Inventory" value={row.cogs_beginning_inventory} onChange={(v) => patch({ cogs_beginning_inventory: v })} />
                <MoneyField label="Purchases" value={row.cogs_purchases} onChange={(v) => patch({ cogs_purchases: v })} />
                <MoneyField label="Cost of Labor" value={row.cogs_labor} onChange={(v) => patch({ cogs_labor: v })} />
                <MoneyField label="Materials & Supplies" value={row.cogs_materials} onChange={(v) => patch({ cogs_materials: v })} />
                <MoneyField label="Ending Inventory" value={row.cogs_ending_inventory} onChange={(v) => patch({ cogs_ending_inventory: v })} />
              </div>
            </Acc>

            <Acc title="💳 Expenses (Schedule C Part II)">
              <MoneyGrid group={SE_EXPENSE_FIELDS} values={row.itemized_expenses} onPatch={(p) => patchGroup("itemized_expenses", p)} />
              <div className="text-[11px] text-muted mt-2">Total Expenses: {fmtUsd(row.expenses_usd)}</div>
            </Acc>

            <Acc title="🚗 Additional Deductions">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MoneyField label="W-2 Wages Paid" value={row.wages_paid_usd} onChange={(v) => patch({ wages_paid_usd: v })} />
                <MoneyField label="SE Health Insurance" value={row.se_health_insurance_usd} onChange={(v) => patch({ se_health_insurance_usd: v })} />
                <MoneyField label="SE Retirement Contribution" value={row.se_retirement_contrib_usd} onChange={(v) => patch({ se_retirement_contrib_usd: v })} />
                <MoneyField label="Business Vehicle Miles" value={row.vehicle_miles} onChange={(v) => patch({ vehicle_miles: v })} />
                <MoneyField label="Home Office (sq ft, max 300)" value={row.home_office_sqft} onChange={(v) => patch({ home_office_sqft: v })} />
              </div>
              <div className="text-[11px] text-muted mt-2">
                SE Health Insurance / Retirement feed the flat above-the-line deduction fields on the Income (US) step (summed across every business here).
              </div>
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

// Field names match aggregate_us_income.py:69-77's itemized_income{} reads
// exactly (the DAG-critical set); expense field names match derive.js's
// FARM_ITEMIZED_EXPENSE_KEYS (what expenses_usd is actually summed from).
const FARM_INCOME_FIELDS = [
  ["sales_livestock_produce_raised", "Sale of Livestock/Produce Raised"],
  ["sales_livestock_produce_purchased", "Sale of Items Bought for Resale"],
  ["cooperative_distributions", "Cooperative Distributions"],
  ["agricultural_program_payments", "Agricultural Program Payments"],
  ["ccc_loans", "CCC Loans"],
  ["crop_insurance_proceeds", "Crop Insurance Proceeds"],
  ["custom_hire_income", "Custom Hire Income"],
  ["other_income", "Other Income"],
];
const FARM_EXPENSE_FIELDS = [
  ["chemicals", "Chemicals"],
  ["conservation", "Conservation Expenses"],
  ["custom_hire", "Custom Hire (Paid)"],
  ["employee_benefits", "Employee Benefit Programs"],
  ["feed", "Feed"],
  ["fertilizers", "Fertilizers & Lime"],
  ["freight", "Freight & Trucking"],
  ["gas_fuel_oil", "Gasoline / Fuel / Oil"],
  ["insurance", "Insurance (Other than Health)"],
  ["interest_mortgage", "Interest — Mortgage"],
  ["interest_other", "Interest — Other"],
  ["labor_hired", "Labor Hired"],
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

function farmGrossIncome(row) {
  const inc = row.itemized_income || {};
  let gross = FARM_INCOME_FIELDS.reduce((s, [k]) => s + n(inc[k]), 0);
  if (row.accounting_method === "accrual") {
    const inv = row.inventory || {};
    gross -= n(inv.beginning_inventory) + n(inv.cost_of_purchases) - n(inv.ending_inventory);
  }
  return gross;
}
function farmExpenseTotal(row) {
  return FARM_EXPENSE_FIELDS.reduce((s, [k]) => s + n(row.itemized_expenses?.[k]), 0);
}
function farmNetProfit(row) {
  return farmGrossIncome(row) - farmExpenseTotal(row) - n(row.vehicle_miles) * 0.68 - Math.min(n(row.home_office_sqft), 300) * 5;
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
            title={row.business_name || "Untitled Farm"}
            badge={`Net ${fmtUsd(farmNetProfit(row))}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🚜 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Farm Name" value={row.business_name} onChange={(v) => patch({ business_name: v })} />
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
                <MoneyField label="Wages Paid" value={row.wages_paid_usd} onChange={(v) => patch({ wages_paid_usd: v })} />
                <div className="flex items-end pb-2.5">
                  <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                </div>
              </div>
              {row.accounting_method === "accrual" && (
                <>
                  <SectionLabel>Inventory (Accrual Method)</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <MoneyField label="Beginning Inventory" value={row.inventory.beginning_inventory} onChange={(v) => patchGroup("inventory", { beginning_inventory: v })} />
                    <MoneyField label="Cost of Purchases" value={row.inventory.cost_of_purchases} onChange={(v) => patchGroup("inventory", { cost_of_purchases: v })} />
                    <MoneyField label="Ending Inventory" value={row.inventory.ending_inventory} onChange={(v) => patchGroup("inventory", { ending_inventory: v })} />
                  </div>
                </>
              )}
            </Acc>

            <Acc title="💰 Farm Income (Schedule F Part I)">
              <MoneyGrid group={FARM_INCOME_FIELDS} values={row.itemized_income} onPatch={(p) => patchGroup("itemized_income", p)} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 Farm Expenses (Schedule F Part II)">
              <MoneyGrid group={FARM_EXPENSE_FIELDS} values={row.itemized_expenses} onPatch={(p) => patchGroup("itemized_expenses", p)} cols="md:grid-cols-4" />
              <div className="text-[11px] text-muted mt-2">Total Expenses: {fmtUsd(row.expenses_usd)}</div>
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

// Real IRS Schedule K-1 (Form 1065) box names — matches
// aggregate_us_income.py:162-168/223-306's actual field reads exactly.
const PART_K1_BOXES_CORE = [
  ["net_rental_real_estate_usd", "Net Rental RE (Box 2)"],
  ["other_rental_income_usd", "Other Rental (Box 3)"],
  ["guaranteed_payments_usd", "Guaranteed Pay (Box 4)"],
  ["interest_income_usd", "Bank Interest (Box 5)"],
  ["ordinary_dividends_usd", "Ordinary Divs (Box 6a)"],
  ["qualified_dividends_usd", "Qualified Divs (Box 6b)"],
  ["royalties_usd", "Royalty Income (Box 7)"],
  ["stcg_usd", "STCG (Box 8)"],
  ["ltcg_usd", "LTCG (Box 9a)"],
  ["collectibles_gain_usd", "Collectibles (Box 9b)"],
  ["unrecaptured_1250_gain_usd", "Depr RE (Box 9c)"],
  ["net_sec1231_gain_usd", "Business Assets (Box 10)"],
  ["other_income_usd", "Other Income (Box 11)"],
  ["foreign_transactions_usd", "Foreign Income (Box 16)"],
];
const PART_K1_BOXES_DEDUCT = [
  ["sec179_deduction_usd", "Sec 179 (Box 12)"],
  ["charitable_contributions_usd", "Charitable (Box 13a)"],
  ["investment_interest_usd", "Investment Interest (Box 13h)"],
  ["self_employment_earnings_usd", "SE Earnings (Box 14)"],
  ["credits_usd", "Tax Credits (Box 15)"],
  ["amt_items_usd", "AMT Adj (Box 17)"],
  ["tax_exempt_income_usd", "Tax-Free Income (Box 18a)"],
  ["nondeductible_expenses_usd", "Non-Deductibles (Box 18c)"],
  ["distributions_usd", "Cash Distributed (Box 19)"],
];

// Box 1 (ordinary business income) is the DAG-critical figure —
// aggregate_us_income.py reads it directly (with an ordinary_business_income_usd
// alias this port doesn't use), no revenue-minus-expenses fallback compute:
// K-1 recipients report the box as printed, they don't derive it themselves.
function partOrdinaryIncome(row) {
  return n(row.ordinary_income_usd);
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
        const ratio = taxpayerShareRatio(row.partners);
        const allocated = partOrdinaryIncome(row) * ratio;
        return (
          <RowCard
            key={row.id}
            title={row.business_name || "Untitled Partnership"}
            badge={primary ? "Primary Entity" : `Your Share ${fmtUsd(allocated)}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Partnership Name" value={row.business_name} placeholder="e.g. Apex Partners GP" onChange={(v) => patch({ business_name: v })} />
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
              <div className="flex flex-col gap-2">
                <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                <CheckField label="SSTB?" value={row.is_specified_service_trade} onChange={(v) => patch({ is_specified_service_trade: v })} />
                <CheckField label="Active Rental Participant?" value={row.active_rental_participant} onChange={(v) => patch({ active_rental_participant: v })} />
              </div>
            </Acc>

            <Acc title="💰 K-1 Income Boxes (as reported on your K-1)">
              <MoneyField
                label="Ordinary Business Income / Loss (Box 1)"
                value={row.ordinary_income_usd}
                highlight
                onChange={(v) => patch({ ordinary_income_usd: v })}
              />
              <MoneyGrid group={PART_K1_BOXES_CORE} values={row} onPatch={patch} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 K-1 Deduction / Credit Boxes">
              <MoneyGrid group={PART_K1_BOXES_DEDUCT} values={row} onPatch={patch} cols="md:grid-cols-4" />
              <SectionLabel>§199A QBI Wage/UBIA Limitation (Box 20)</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MoneyField label="QBI W-2 Wages" value={row.qbi_wages_usd} onChange={(v) => patch({ qbi_wages_usd: v })} />
                <MoneyField label="QBI Unadjusted Basis (UBIA)" value={row.qbi_ubia_usd} onChange={(v) => patch({ qbi_ubia_usd: v })} />
              </div>
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

// Real IRS Schedule K-1 (Form 1120-S) box names — matches
// aggregate_us_income.py:162-168/250-309's actual field reads exactly. Box 9
// is sec1231_gain_usd (not net_sec1231_gain_usd, unlike partnership's box
// 10) — see makeScorpRow()'s comment.
const SCORP_K1_BOXES_CORE = [
  ["net_rental_real_estate_usd", "Net Rental RE (Box 2)"],
  ["other_rental_income_usd", "Other Rental (Box 3)"],
  ["interest_income_usd", "Interest Income (Box 4)"],
  ["ordinary_dividends_usd", "Ordinary Divs (Box 5a)"],
  ["qualified_dividends_usd", "Qualified Divs (Box 5b)"],
  ["royalties_usd", "Royalties (Box 6)"],
  ["stcg_usd", "STCG (Box 7)"],
  ["ltcg_usd", "LTCG (Box 8a)"],
  ["collectibles_gain_usd", "Collectibles (Box 8b)"],
  ["unrecaptured_1250_gain_usd", "Unrecap §1250 Gain (Box 8c)"],
  ["sec1231_gain_usd", "Net §1231 Gain (Box 9)"],
  ["other_income_usd", "Other Income (Box 10)"],
  ["foreign_transactions_usd", "Foreign Transactions (Box 14)"],
];
const SCORP_K1_BOXES_DEDUCT = [
  ["sec179_deduction_usd", "Sec 179 (Box 11)"],
  ["charitable_contributions_usd", "Charitable (Box 12a)"],
  ["investment_interest_usd", "Other Deductions (Box 12h)"],
  ["credits_usd", "Credits (Box 13)"],
  ["amt_items_usd", "AMT Items (Box 15)"],
  ["tax_exempt_income_usd", "Tax-Exempt Interest (Box 16a)"],
  ["nondeductible_expenses_usd", "Nondeductible Expenses (Box 16c)"],
  ["distributions_usd", "Distributions (Box 16d)"],
];

function scorpOrdinaryIncome(row) {
  return n(row.ordinary_income_usd);
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
        const ratio = taxpayerShareRatio(row.shareholders);
        const allocated = scorpOrdinaryIncome(row) * ratio;
        return (
          <RowCard
            key={row.id}
            title={row.business_name || "Untitled S-Corporation"}
            badge={primary ? "Primary Entity" : `Your Share ${fmtUsd(allocated)}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="S-Corp Name" value={row.business_name} onChange={(v) => patch({ business_name: v })} />
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
              <div className="flex flex-col gap-2">
                <CheckField label="QBI Eligible?" value={row.qbi_eligible} onChange={(v) => patch({ qbi_eligible: v })} />
                <CheckField label="SSTB?" value={row.is_specified_service_trade} onChange={(v) => patch({ is_specified_service_trade: v })} />
                <CheckField label="Active Rental Participant?" value={row.active_rental_participant} onChange={(v) => patch({ active_rental_participant: v })} />
              </div>
            </Acc>

            <Acc title="💰 K-1 Income Boxes (as reported on your K-1)">
              <MoneyField
                label="Ordinary Business Income / Loss (Box 1)"
                value={row.ordinary_income_usd}
                highlight
                onChange={(v) => patch({ ordinary_income_usd: v })}
              />
              <MoneyGrid group={SCORP_K1_BOXES_CORE} values={row} onPatch={patch} cols="md:grid-cols-4" />
            </Acc>

            <Acc title="💳 K-1 Deduction / Credit Boxes">
              <MoneyGrid group={SCORP_K1_BOXES_DEDUCT} values={row} onPatch={patch} cols="md:grid-cols-4" />
              <SectionLabel>§199A QBI Wage/UBIA Limitation (Box 17)</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MoneyField label="QBI W-2 Wages" value={row.qbi_wages_usd} onChange={(v) => patch({ qbi_wages_usd: v })} />
                <MoneyField label="QBI Unadjusted Basis (UBIA)" value={row.qbi_ubia_usd} onChange={(v) => patch({ qbi_ubia_usd: v })} />
              </div>
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

// BUG FOUND & FIXED: this was previously named CcorpProfileBlock and was
// only reachable from a "ccorp"-only tab. Ground truth
// (layer1_us.html:7185-7205, toggleCorporateFinancials()) gates the
// equivalent `wrapper-corporate-financials` block on
// `isCorpOrPartnership = ['ccorp','scorp','partnership'].includes(type)` —
// i.e. it is shared by all three entity types, not C-Corp-specific. A
// taxpayer whose entity type is 'scorp' or 'partnership' previously had NO
// way to enter corporate_profile (EIN/entity name/domicile/NAICS) or
// Schedule L/M-1/M-2 anywhere in this app. Renamed + regated below (see the
// `tabs` builder in the default export) so all three isCorpOrPartnership
// types can reach it. `CcorpEntitiesBlock` (the repeatable list of *other*
// C-Corp entities under income_us_source.c_corporations_1120) has been
// pulled out into its own tab, since the ground truth's #container-ccorp is
// never hidden by entity type either (see the tabs-visibility bug fixed in
// the default export below).
// Split from a single CorporateFinancialsBlock so the two pieces can be
// gated independently: ground truth shows wrapper-corporate-profile-fields
// (entity name/EIN/NAICS/domicile/foreign flags) for ANY non-individual
// entity type INCLUDING trust (updateProfileVisibility(), layer1_us.html:
// 7059-7071 — `corpProfileFields.style.display = isIndividual ? 'none' :
// 'flex'`, and isIndividual excludes trust), whereas
// wrapper-corporate-financials (Schedule L/M-1/M-2) is gated on
// isCorpOrPartnership specifically (ccorp/scorp/partnership only — Form 1041
// trusts don't file Schedule L/M-1/M-2), per toggleCorporateFinancials()
// (layer1_us.html:7185-7205).
// BUG FIX (field-path collision, found by the step-by-step map audit):
// entity_name/ein/naics_code/date_of_incorporation/is_foreign_owned_25_pct/
// is_foreign_corporation previously wrote to `corporate_profile.*` here.
// The source's ONLY real data-entry point for these 7 fields is
// wrapper-corporate-profile-fields on the Onboarding screen
// (layer1_us.html:775-819), and every one of its inputs goes through
// updateProfileField(field, val) -> `usState.profile[field] = val`. There
// is no second corporate-identity block anywhere in panel-step-business
// (layer1_us.html:2220-2718) — confirmed by grepping the whole source file
// for corp-entity-name/corp-ein/corp-naics/etc., all single hits, all on
// Onboarding. `corporate_profile` as a schema section is dead in the
// source; nothing there ever writes to it. Repointed to `profile.*` so
// this block (wherever it's reachable from in the tab UI) edits the same
// real field OnboardingStep.jsx does, instead of a second, wrong location
// neither the source nor any DAG node reads. `fiscal_year_end` has no
// source counterpart at all (schema-only, kept on corporate_profile as-is
// since there's nowhere else for it to go).
function CorporateProfileBlock() {
  const { usState, setField } = useUsLayer1Store();
  const cp = usState.corporate_profile;
  const profile = usState.profile;
  const set = (path, v) => setField(path, v);

  return (
    <div className="flex flex-col gap-4">
      <RowCard title="Corporate Profile" onRemove={undefined}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField label="Entity Name" value={profile.entity_name} onChange={(v) => set("profile.entity_name", v)} />
          <TextField label="EIN" value={profile.ein} mono placeholder="12-3456789" onChange={(v) => set("profile.ein", v)} />
          <TextField label="NAICS Code" value={profile.naics_code} mono maxLength={6} onChange={(v) => set("profile.naics_code", v)} />
          <DateField label="Date of Incorporation" value={profile.date_of_incorporation} onChange={(v) => set("profile.date_of_incorporation", v)} />
          <TextField label="State of Domicile" value={profile.state_of_domicile} placeholder="DE" onChange={(v) => set("profile.state_of_domicile", v)} />
          <TextField label="Fiscal Year End" value={cp.fiscal_year_end} placeholder="12-31" onChange={(v) => set("corporate_profile.fiscal_year_end", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <CheckField label="≥25% Foreign-Owned" value={profile.is_foreign_owned_25_pct} onChange={(v) => set("profile.is_foreign_owned_25_pct", v)} />
          <CheckField label="Foreign Corporation" value={profile.is_foreign_corporation} onChange={(v) => set("profile.is_foreign_corporation", v)} />
        </div>
      </RowCard>
    </div>
  );
}

function ScheduleLM1M2Block() {
  const { usState, setField } = useUsLayer1Store();
  const cf = usState.corporate_financials;
  const set = (path, v) => setField(path, v);

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}

// BUG FOUND & FIXED: this step previously also rendered a
// "CorporateInternationalBlock" (FDII/NCTI scalars + a Form-5472
// related-parties repeatable) inside the C-Corp tab. Two problems, both
// confirmed against the source:
//   1. None of that content exists anywhere in panel-step-business
//      (layer1_us.html:2220-2718) — the real FDII/NCTI/Form-5472 UI lives in
//      panel-step-business's sibling panel-step-entities (layer1_us.html:
//      3273-3388, the "wrapper-form-5472" accordion), which EntitiesStep.jsx
//      already ports faithfully.
//   2. Both this (now-removed) block and EntitiesStep.jsx wrote to the exact
//      same array path, `corporate_international.form_5472_related_parties`,
//      with two *incompatible* row shapes — this file's
//      `{id, name, country, relationship, ownership_percent}` vs.
//      EntitiesStep's `{related_party_name, country, relationship_type,
//      transaction_type, amount_usd}` (no `id` at all, which this file used
//      as the React list `key`). Rows added on one step rendered as blank
//      fields (and a missing/undefined key) on the other — the exact
//      "two steps racing to own the same usState path" class of bug flagged
//      as a recurring risk in docs/LAYER1_US_REACT_PORT_GAPS.md item 2.
// Fix: deleted this step's copy entirely; EntitiesStep.jsx is the sole owner,
// matching where the source actually places this content.

/* ============================== Trust ===================================== */

// Field names match layer1_us.html:17053-17102's syncTrustK1State() ground
// truth exactly — royalty_income_usd (not royalties_usd) is Box 7, matching
// aggregate_us_income.py:167's fallback chain. Box 1 (ordinary income) is
// its own highlighted field below, not in this grid.
const TRUST_K1_BOXES = [
  ["other_rental_income_usd", "Other Rental Income (Box 3)"],
  ["interest_income_usd", "Interest Income (Box 5)"],
  ["ordinary_dividends_usd", "Ordinary Divs (Box 6a)"],
  ["qualified_dividends_usd", "Qualified Divs (Box 6b)"],
  ["net_rental_real_estate_usd", "Net Rental Real Estate (Box 7)"],
  ["stcg_usd", "Net STCG (Box 8)"],
  ["ordinary_gain_usd", "Ordinary Gain (Box 8)"],
  ["royalty_income_usd", "Royalty Income (Box 9)"],
  ["ltcg_usd", "Net LTCG"],
  ["depreciation_allocation_usd", "Depreciation Allocation (Box 9a)"],
];

// aggregate_us_income.py:252 reads ordinary_income_usd + ordinary_gain_usd
// directly for the pass-through business-income total — no expense-total
// subtraction exists for trust K-1 rows (unlike SE/farm), matching the
// source: a K-1 recipient reports the already-net distributable amount.
function trustNetIncome(row) {
  return n(row.ordinary_income_usd) + n(row.ordinary_gain_usd);
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
        return (
          <RowCard
            key={row.id}
            title={row.business_name || "Untitled Trust/Estate"}
            badge={`Net ${fmtUsd(trustNetIncome(row))}`}
            onRemove={() => removeRow(path, i)}
          >
            <Acc title="🏢 Setup & Profile" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <TextField label="Trust / Estate Name" value={row.business_name} onChange={(v) => patch({ business_name: v })} />
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
                <MoneyField label="Fiduciary Fees" value={row.fiduciary_fees} onChange={(v) => patch({ fiduciary_fees: v })} />
                <MoneyField label="Professional Fees" value={row.professional_fees} onChange={(v) => patch({ professional_fees: v })} />
                <MoneyField label="Admin Expenses" value={row.admin_expenses} onChange={(v) => patch({ admin_expenses: v })} />
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
                  <CheckField label="SSTB?" value={row.is_specified_service_trade} onChange={(v) => patch({ is_specified_service_trade: v })} />
                </div>
                <div className="flex items-end pb-2.5">
                  <CheckField label="Active Rental Participant?" value={row.active_rental_participant} onChange={(v) => patch({ active_rental_participant: v })} />
                </div>
              </div>
            </Acc>

            <Acc title="💰 Income (K-1 Boxes)">
              <MoneyField
                label="Ordinary Business Income (Box 1)"
                value={row.ordinary_income_usd}
                highlight
                onChange={(v) => patch({ ordinary_income_usd: v })}
              />
              <MoneyGrid group={TRUST_K1_BOXES} values={row} onPatch={patch} cols="md:grid-cols-3" />
            </Acc>

            <Acc title="🏗 Capital Assets & Depreciation">
              <AssetsBlock
                assets={row.assets}
                onAdd={() => patch({ assets: [...(row.assets || []), makeAsset()] })}
                onRemove={(ai) => patch({ assets: row.assets.filter((_, idx) => idx !== ai) })}
                onChange={(ai, p) => patch({ assets: row.assets.map((a, idx) => (idx === ai ? { ...a, ...p } : a)) })}
              />
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
  const trustNet = (src.trusts_estates_k1 || []).reduce(
    (s, r) => s + trustNetIncome(r) * taxpayerShareRatio(r.beneficiaries),
    0
  );
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
  // which subsection is PRIMARY (forced open / labeled as the entity's own
  // operations). The original's CSS flexbox re-ordering/relabeling cosmetics
  // are intentionally NOT replicated 1:1 — this uses a header swap + tabbed
  // sections instead (see file header "SIMPLIFIED").
  const selectedType = usState.profile.tax_entity_type || "individual";
  const effectiveType = selectedType === "llc" ? usState.profile.llc_tax_election || "individual" : selectedType;
  const isCorpOrPartnership = ["ccorp", "scorp", "partnership"].includes(effectiveType);

  const totals = useMemo(() => computeSimplifiedTotals(usState), [usState]);

  // BUG FOUND & FIXED: this previously branched on effectiveType and
  // returned ONLY that entity's tab (e.g. effectiveType === "ccorp" showed
  // just the C-Corp + "intl" tabs — no Schedule C, no Farm, no Partnership/
  // S-Corp/Trust K-1s at all). That doesn't match the source: per
  // updateBusinessStepLogic() (layer1_us.html:7307-7455), `type` only picks
  // which container is forced open, locked, and labeled "PRIMARY ENTITY
  // OPERATIONS" (style.order = 1) — every container
  // (#container-sole-prop/farming/partnership/scorp/ccorp/trust) is reset to
  // `style.order = 10` and stays fully visible and independently toggleable
  // regardless of tax_entity_type ("Visibility is now controlled purely by
  // the Business Nature Checklist" per the comment at layer1_us.html:7313).
  // The bug meant e.g. a partnership owner who ALSO has Schedule C
  // consulting income, or receives an S-Corp K-1, had literally no UI path
  // to enter that income — not a numeric simplification, a missing data-entry
  // surface. Fixed by always building all 6 section tabs and only moving the
  // entity-type's own section to the front / marking it primary, matching
  // the source's "one primary, rest still present" behavior.
  const tabs = useMemo(() => {
    const list = [
      { key: "se", label: "Self-Employment (Sch C)", render: () => <SelfEmploymentSection /> },
      { key: "farm", label: "Farming (Sch F)", render: () => <FarmSection /> },
      {
        key: "part",
        label: effectiveType === "partnership" ? "Partnership — Primary Entity" : "Partnership K-1s",
        render: () => <PartnershipSection primary={effectiveType === "partnership"} />,
      },
      {
        key: "scorp",
        label: effectiveType === "scorp" ? "S-Corp — Primary Entity" : "S-Corp K-1s",
        render: () => <ScorpSection primary={effectiveType === "scorp"} />,
      },
      {
        key: "ccorp",
        label: effectiveType === "ccorp" ? "C-Corp — Primary Entity" : "C-Corporations",
        render: () => <CcorpEntitiesBlock />,
      },
      {
        key: "trust",
        label: effectiveType === "trust" ? "Trust — Primary Entity" : "Trust/Estate K-1s",
        render: () => <TrustSection primary={effectiveType === "trust"} />,
      },
    ];
    // corporate_profile (EIN, entity name, domicile, NAICS, foreign flags) —
    // gated on effectiveType !== "individual", matching
    // updateProfileVisibility()'s `corpProfileFields` gating (layer1_us.html
    // :7059-7071), which shows it for ccorp/scorp/partnership/trust alike.
    if (effectiveType !== "individual") {
      list.unshift({
        key: "corpprofile",
        label: "Corporate / Entity Profile",
        render: () => <CorporateProfileBlock />,
      });
    }
    // Schedule L/M-1/M-2 — gated on isCorpOrPartnership specifically
    // (ccorp/scorp/partnership only, not trust — Form 1041 doesn't file
    // Schedule L/M-1/M-2), matching toggleCorporateFinancials()
    // (layer1_us.html:7185-7205). Previously reachable for effectiveType
    // === "ccorp" only.
    if (isCorpOrPartnership) {
      list.unshift({
        key: "corpfin",
        label: "Schedule L / M-1 / M-2 (Corporate Financials)",
        render: () => <ScheduleLM1M2Block />,
      });
    }
    // Bring the entity's own primary section to the front, mirroring the
    // source forcing the primary container (containers.ccorp/scorp/
    // partnership — the repeatable entity-operations block, e.g.
    // #container-ccorp which drives addCcorpRow()/c_corporations_1120, NOT
    // the separate Schedule L/M-1/M-2 block) to style.order = 1.
    const primaryKey = { ccorp: "ccorp", scorp: "scorp", partnership: "part", trust: "trust" }[effectiveType];
    if (primaryKey) {
      const idx = list.findIndex((t) => t.key === primaryKey);
      if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
    }
    return list;
  }, [effectiveType, isCorpOrPartnership]);

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
        flexbox re-ordering is replaced with a tab UI (every section stays visible/usable for every entity
        type, matching the source — only which tab opens first and is labeled "primary" changes) rather than
        literal DOM node re-ordering. FDII/NCTI/Form 5472 fields live on the Foreign Entities step, not here.
      </div>
    </div>
  );
}
