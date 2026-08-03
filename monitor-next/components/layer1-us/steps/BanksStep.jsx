"use client";

import { useMemo, useEffect } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html panel-step-banks (layer1_us.html:3080-3126),
// its addBankRow/syncBanksState (layer1_us.html:18597-18823), addHoldingRow/
// syncHoldingsState (layer1_us.html:18825-19155), and the FBAR/8938 slice of
// recalculateDerivedFields() (layer1_us.html:11327-11390).
//
// NOTE: `financial_holdings` (the "Other Financial Assets (FATCA/PFIC)"
// list, addHoldingRow) actually lives on THIS panel in the source, not on
// step-passive as the task brief guessed — confirmed by grepping
// panel-step-banks directly (div-holding-list + addHoldingRow are both
// inside it). Rendered here to match reality.
//
// Faithful: bank row fields (name, last-4, type, country, peak/last-day USD,
// ownership type + joint details, institution address, opened/closed
// flags), holding row fields (broker, asset name/class, peak/last-day USD,
// PFIC entity-analyzer inputs for private-equity/indirect holdings,
// ownership/joint/address/income fields), and the FBAR ($10,000 aggregate
// of non-US bank peak balances + FBAR-reportable holdings) / Form 8938
// (filing-status- and abroad-status-dependent thresholds) derivations.
//
// SIMPLIFIED: the source's per-row foreign-currency entry + live Treasury
// year-end FX auto-conversion (autoConvertField, TREASURY_YEAR_END_RATES) is
// dropped — this form takes USD peak/last-day balances directly. The
// AI-document-upload dropzones and linked-client-profile picker are
// decorative/out-of-scope in the source and are omitted here too.

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

function newBankRow() {
  return {
    bank_name: null,
    account_number_last_four: null,
    account_type: "savings",
    country: null,
    peak_balance_usd: null,
    last_day_balance_usd: null,
    ownership_type: "individual",
    joint_owner_count: null,
    is_joint_owner_spouse: false,
    institution_address_street: null,
    institution_address_city: null,
    institution_address_zip: null,
    opened_during_year: false,
    closed_during_year: false,
  };
}

function newHoldingRow() {
  return {
    broker_or_institution: null,
    asset_name: null,
    asset_class: "indian_mutual_fund",
    is_fbar_reportable: true,
    peak_balance_usd: null,
    last_day_balance_usd: null,
    pfic_classification: "standard_foreign_equity",
    pfic_election: null,
    pfic_income_test: false,
    pfic_asset_test: false,
    pfic_finance_except: false,
    ownership_percentage: null,
    ownership_type: "individual",
    joint_owner_count: null,
    is_joint_owner_spouse: false,
    institution_address_street: null,
    institution_address_city: null,
    institution_address_zip: null,
    income_generated_usd: null,
    income_type: "none",
    opened_during_year: false,
    closed_during_year: false,
  };
}

const NON_FBAR_CLASSES = [
  "physical_real_estate",
  "direct_paper_certificates",
  "physical_precious_metals",
  "direct_foreign_currency",
  "collectibles",
  "foreign_social_security",
  "private_equity",
];

// Ported from syncHoldingsState()'s entity analyzer (layer1_us.html:19075-19154).
//
// BUG FIX (found by the step-by-step map audit): source's syncHoldingsState()
// (layer1_us.html:19128) sets `pfic_election: isPfic && select ? select.value
// : null` — the <select>'s DOM `.value` naturally defaults to its first
// `<option>` ("1291") the instant the PFIC election block becomes visible
// (isPfic true), with no user interaction required. React's row creation
// previously left `pfic_election: null` permanently while only the
// *displayed* value fell back to "1291" (a display-only fallback never
// written back to the row) — any export/DAG path reading the field
// directly saw a missing election on every untouched PFIC row. Fixed:
// default it to "1291" the moment isPfic is true and no election is set
// yet, and — matching the source's `: null` branch just as exactly —
// reset it back to null if the row's asset class stops being PFIC-eligible.
function computeHoldingDerived(row) {
  const cls = row.asset_class;
  let isPfic = false;
  if (cls === "indian_mutual_fund" || cls === "foreign_etf") {
    isPfic = true;
  } else if (["private_equity", "indirectly_owned_account"].includes(cls)) {
    if ((row.pfic_income_test || row.pfic_asset_test) && !row.pfic_finance_except) {
      isPfic = true;
    }
  }
  const isFbarReportable = !NON_FBAR_CLASSES.includes(cls);
  return {
    is_fbar_reportable: isFbarReportable,
    pfic_classification: isPfic ? "passive_foreign_investment_company_section_1297" : "standard_foreign_equity",
    pfic_election: isPfic ? row.pfic_election || "1291" : null,
  };
}

function isUsCountry(country) {
  const c = (country || "").trim().toUpperCase();
  return c === "US" || c === "USA" || c === "UNITED STATES";
}

export default function BanksStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const banks = usState.bank_accounts || [];
  const holdings = usState.financial_holdings || [];
  const filingStatus = usState.profile?.filing_status;
  const isAbroad = !!usState.foreign_earned_income?.claims_feie;

  // Ported from recalculateDerivedFields()'s FBAR/8938 block
  // (layer1_us.html:11327-11390).
  const derived = useMemo(() => {
    let fbarSum = 0;
    let fatcaPeakSum = 0;
    let fatcaLastDaySum = 0;

    banks.forEach((acc) => {
      if (!isUsCountry(acc.country)) {
        fbarSum += acc.peak_balance_usd || 0;
        fatcaPeakSum += acc.peak_balance_usd || 0;
        fatcaLastDaySum += acc.last_day_balance_usd || 0;
      }
    });
    holdings.forEach((acc) => {
      if (acc.is_fbar_reportable !== false) {
        fbarSum += acc.peak_balance_usd || 0;
        fatcaPeakSum += acc.peak_balance_usd || 0;
        fatcaLastDaySum += acc.last_day_balance_usd || 0;
      }
    });

    const isMfj = filingStatus === "mfj";
    let req8938;
    if (isAbroad) {
      req8938 = isMfj ? fatcaLastDaySum > 400000 || fatcaPeakSum > 600000 : fatcaLastDaySum > 200000 || fatcaPeakSum > 300000;
    } else {
      req8938 = isMfj ? fatcaLastDaySum > 100000 || fatcaPeakSum > 150000 : fatcaLastDaySum > 50000 || fatcaPeakSum > 75000;
    }

    return { fbarSum, fatcaPeakSum, fatcaLastDaySum, req8938 };
  }, [banks, holdings, filingStatus, isAbroad]);

  // Persist the derived aggregates back into usState, same as the source
  // writing usState.fbar_aggregate_peak_usd / form_8938_required directly.
  useEffect(() => {
    if (usState.fbar_aggregate_peak_usd !== derived.fbarSum) {
      setField("fbar_aggregate_peak_usd", derived.fbarSum);
    }
    if (usState.form_8938_required !== derived.req8938) {
      setField("form_8938_required", derived.req8938);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived.fbarSum, derived.req8938]);

  function patchBank(idx, patch) {
    updateRow("bank_accounts", idx, patch);
  }

  function patchHolding(idx, patch) {
    const merged = { ...holdings[idx], ...patch };
    updateRow("financial_holdings", idx, { ...patch, ...computeHoldingDerived(merged) });
  }

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-6">
      <div>
        <h2 className="text-head font-display font-bold text-lg">Foreign Bank Accounts (FBAR &amp; 8938)</h2>
        <p className="text-muted text-xs mt-1">
          Declare all foreign bank accounts, securities, life insurance, commodities, and other assets here.
          Reportable assets flow to your FBAR and Form 8938 aggregates automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-brandGreen/5 border border-brandGreen/20 rounded-2xl flex justify-between items-center">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-brandGreen font-semibold">
              FBAR Peak Balance (Aggregate)
            </span>
            <span className="block text-xl font-black text-head font-mono mt-1">
              ${derived.fbarSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <span
            className={
              "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest font-mono " +
              (derived.fbarSum > 10000
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-line bg-white/5 text-muted")
            }
          >
            {derived.fbarSum > 10000 ? "FBAR Required (FinCEN 114)" : "FBAR Exempt"}
          </span>
        </div>
        <div className="p-4 bg-brandGreen/5 border border-brandGreen/20 rounded-2xl flex justify-between items-center">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-brandGreen font-semibold">Form 8938 Reporting</span>
            <span className="block text-sm font-bold text-head mt-1">
              {derived.req8938 ? "Form 8938 Required" : "Not Required"}
            </span>
          </div>
          <span
            className={
              "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest font-mono " +
              (derived.req8938
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-line bg-white/5 text-muted")
            }
          >
            {derived.req8938 ? "Required" : "Exempt"}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-muted -mt-3">
        Simplified: uses the source's single-tier threshold rules keyed on filing status (MFJ vs. not) and
        FEIE/abroad status — not the full residency-and-marital-status Form 8938 threshold table.
      </p>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Foreign Bank Accounts</span>
          <AddButton onClick={() => addRow("bank_accounts", newBankRow())}>+ Add Account</AddButton>
        </div>
        {banks.length === 0 ? (
          <p className="text-xs text-muted">No foreign bank accounts added yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {banks.map((row, idx) => (
              <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                    🏦 Account {idx + 1}
                  </span>
                  <RemoveButton onClick={() => removeRow("bank_accounts", idx)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Bank Name">
                    <TextInput
                      placeholder="e.g. HDFC Bank"
                      value={row.bank_name ?? ""}
                      onChange={(e) => patchBank(idx, { bank_name: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Account Number (Last 4)">
                    <TextInput
                      placeholder="1234"
                      value={row.account_number_last_four ?? ""}
                      onChange={(e) => patchBank(idx, { account_number_last_four: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Account Type">
                    <SelectInput
                      value={row.account_type}
                      onChange={(e) => patchBank(idx, { account_type: e.target.value })}
                    >
                      <optgroup label="Standard">
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                        <option value="demand">Demand</option>
                        <option value="deposit">Deposit</option>
                        <option value="time_deposit">Time Deposit</option>
                      </optgroup>
                      <optgroup label="India (NRI) Accounts">
                        <option value="nre_savings">NRE Savings / Checking</option>
                        <option value="nro_savings">NRO Savings / Checking</option>
                        <option value="fcnr_deposit">FCNR (Fixed Deposit)</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="other">Other</option>
                      </optgroup>
                    </SelectInput>
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Country of Account">
                    <TextInput
                      placeholder="e.g. India"
                      value={row.country ?? ""}
                      onChange={(e) => patchBank(idx, { country: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Peak Balance (USD)">
                    <NumberInput value={row.peak_balance_usd} onChange={(v) => patchBank(idx, { peak_balance_usd: v })} />
                  </Field>
                  <Field label="Last Day Balance (USD)">
                    <NumberInput
                      value={row.last_day_balance_usd}
                      onChange={(v) => patchBank(idx, { last_day_balance_usd: v })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Ownership Type">
                    <SelectInput
                      value={row.ownership_type}
                      onChange={(e) => patchBank(idx, { ownership_type: e.target.value })}
                    >
                      <option value="individual">Individual</option>
                      <option value="joint">Joint</option>
                      <option value="signature">Signature Authority</option>
                    </SelectInput>
                  </Field>
                  {row.ownership_type === "joint" ? (
                    <>
                      <Field label="Joint Owner Count">
                        <NumberInput
                          value={row.joint_owner_count}
                          onChange={(v) => patchBank(idx, { joint_owner_count: v })}
                        />
                      </Field>
                      <Field label="Is Joint Owner Spouse?">
                        <SelectInput
                          value={row.is_joint_owner_spouse ? "yes" : "no"}
                          onChange={(e) => patchBank(idx, { is_joint_owner_spouse: e.target.value === "yes" })}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </SelectInput>
                      </Field>
                    </>
                  ) : null}
                </div>
                <Field label="Institution Address">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <TextInput
                      placeholder="Street Address"
                      value={row.institution_address_street ?? ""}
                      onChange={(e) => patchBank(idx, { institution_address_street: e.target.value || null })}
                    />
                    <TextInput
                      placeholder="City"
                      value={row.institution_address_city ?? ""}
                      onChange={(e) => patchBank(idx, { institution_address_city: e.target.value || null })}
                    />
                    <TextInput
                      placeholder="Postal Code"
                      value={row.institution_address_zip ?? ""}
                      onChange={(e) => patchBank(idx, { institution_address_zip: e.target.value || null })}
                    />
                  </div>
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Checkbox
                    label="Account Opened During Year"
                    checked={row.opened_during_year}
                    onChange={(v) => patchBank(idx, { opened_during_year: v })}
                  />
                  <Checkbox
                    label="Account Closed During Year"
                    checked={row.closed_during_year}
                    onChange={(v) => patchBank(idx, { closed_during_year: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
            Other Financial Assets (FATCA/PFIC)
          </span>
          <AddButton
            onClick={() => {
              // Bug fix: the vanilla source's addHoldingRow() immediately
              // calls syncHoldingsState() after appending a row
              // (layer1_us.html:19066), so a freshly-added row's PFIC/FBAR
              // badges are correct from the start (default asset_class
              // "indian_mutual_fund" is PFIC-reportable). Without running
              // computeHoldingDerived() here too, a new row rendered with
              // its untouched defaults showed "Exempt" for both badges
              // until the user edited any field — wrong from creation.
              const base = newHoldingRow();
              addRow("financial_holdings", { ...base, ...computeHoldingDerived(base) });
            }}
          >
            + Add Holding
          </AddButton>
        </div>
        {holdings.length === 0 ? (
          <p className="text-xs text-muted">No other financial holdings added yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {holdings.map((row, idx) => {
              const isPfic = row.pfic_classification === "passive_foreign_investment_company_section_1297";
              const showEntityAnalyzer = ["private_equity", "indirectly_owned_account"].includes(row.asset_class);
              return (
                <div key={idx} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
                      📈 Holding {idx + 1}
                    </span>
                    <RemoveButton onClick={() => removeRow("financial_holdings", idx)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Broker/Institution">
                      <TextInput
                        placeholder="e.g. Zerodha"
                        value={row.broker_or_institution ?? ""}
                        onChange={(e) => patchHolding(idx, { broker_or_institution: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Asset/Fund Name">
                      <TextInput
                        placeholder="e.g. Parag Parikh Flexi Cap"
                        value={row.asset_name ?? ""}
                        onChange={(e) => patchHolding(idx, { asset_name: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Asset Class">
                      <SelectInput
                        value={row.asset_class}
                        onChange={(e) => patchHolding(idx, { asset_class: e.target.value })}
                      >
                        <optgroup label="FBAR Reportable">
                          <option value="indian_mutual_fund">Indian Mutual Fund (PFIC)</option>
                          <option value="foreign_etf">Foreign ETF</option>
                          <option value="foreign_stock">Foreign Stock</option>
                          <option value="securities_account">Securities / Brokerage</option>
                          <option value="commodity_account">Commodity Account</option>
                          <option value="life_insurance">Life Insurance (Cash Value)</option>
                          <option value="annuity_contract">Annuity Contract</option>
                          <option value="foreign_pension">Foreign Pension / Retirement</option>
                          <option value="indirectly_owned_account">Indirectly Owned Account (&gt;50%)</option>
                        </optgroup>
                        <optgroup label="FBAR Exempt (Non-Reportable)">
                          <option value="physical_real_estate">Physical Real Estate</option>
                          <option value="direct_paper_certificates">Direct Paper Certificates</option>
                          <option value="physical_precious_metals">Physical Precious Metals</option>
                          <option value="direct_foreign_currency">Direct Foreign Currency (Cash)</option>
                          <option value="collectibles">Collectibles (Art, Antiques)</option>
                          <option value="foreign_social_security">Foreign Social Security</option>
                          <option value="private_equity">Private Equity / Hedge Fund</option>
                        </optgroup>
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Field label="Peak Balance (USD)">
                      <NumberInput
                        value={row.peak_balance_usd}
                        onChange={(v) => patchHolding(idx, { peak_balance_usd: v })}
                      />
                    </Field>
                    <Field label="Last Day Balance (USD)">
                      <NumberInput
                        value={row.last_day_balance_usd}
                        onChange={(v) => patchHolding(idx, { last_day_balance_usd: v })}
                      />
                    </Field>
                    <Field label="PFIC Status" hint="Auto-derived">
                      <input
                        disabled
                        className={inputCls + " opacity-60"}
                        value={isPfic ? "Reportable (Form 8621)" : "Exempt"}
                      />
                    </Field>
                    <Field label="FBAR Status" hint="Auto-derived">
                      <input
                        disabled
                        className={inputCls + " opacity-60"}
                        value={row.is_fbar_reportable ? "Reportable" : "Exempt"}
                      />
                    </Field>
                  </div>
                  {isPfic ? (
                    <Field label="PFIC Tax Election (Form 8621)">
                      <SelectInput
                        value={row.pfic_election || "1291"}
                        onChange={(e) => patchHolding(idx, { pfic_election: e.target.value })}
                      >
                        <option value="1291">Section 1291 (Default / Excess Distribution)</option>
                        <option value="mtm">Mark-to-Market (MTM)</option>
                        <option value="qef">Qualified Electing Fund (QEF)</option>
                      </SelectInput>
                    </Field>
                  ) : null}

                  {showEntityAnalyzer ? (
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl flex flex-col gap-3">
                      {(row.ownership_percentage || 0) >= 10 ? (
                        <div className="text-[10px] font-bold text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                          ⚠️ Potential CFC (Form 5471) — PFIC overlap exception may apply if US controlled.
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <Field label="Ownership Percentage (%)">
                          <NumberInput
                            value={row.ownership_percentage}
                            onChange={(v) => patchHolding(idx, { ownership_percentage: v })}
                          />
                        </Field>
                        <Field label="Income Test (75%+ Passive)">
                          <SelectInput
                            value={row.pfic_income_test ? "yes" : "no"}
                            onChange={(e) => patchHolding(idx, { pfic_income_test: e.target.value === "yes" })}
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </SelectInput>
                        </Field>
                        <Field label="Asset Test (50%+ Passive)">
                          <SelectInput
                            value={row.pfic_asset_test ? "yes" : "no"}
                            onChange={(e) => patchHolding(idx, { pfic_asset_test: e.target.value === "yes" })}
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </SelectInput>
                        </Field>
                        <Field label="Active Finance Exception">
                          <SelectInput
                            value={row.pfic_finance_except ? "yes" : "no"}
                            onChange={(e) => patchHolding(idx, { pfic_finance_except: e.target.value === "yes" })}
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </SelectInput>
                        </Field>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Income Generated (USD)">
                      <NumberInput
                        value={row.income_generated_usd}
                        onChange={(v) => patchHolding(idx, { income_generated_usd: v })}
                      />
                    </Field>
                    <Field label="Income Type">
                      <SelectInput
                        value={row.income_type}
                        onChange={(e) => patchHolding(idx, { income_type: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="interest">Interest</option>
                        <option value="dividends">Dividends</option>
                        <option value="capital_gains">Capital Gains</option>
                        <option value="royalties">Royalties</option>
                        <option value="other">Other</option>
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Checkbox
                      label="Account Opened During Year"
                      checked={row.opened_during_year}
                      onChange={(v) => patchHolding(idx, { opened_during_year: v })}
                    />
                    <Checkbox
                      label="Account Closed During Year"
                      checked={row.closed_during_year}
                      onChange={(v) => patchHolding(idx, { closed_during_year: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
