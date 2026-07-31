"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html:2795-2863 ("Screen 3E — Equity
// Compensation"). Ported: has_equity_comp gate (toggleEquityCompSections),
// and all five repeatable lists — addIsoRow/syncIsoState,
// addNsoRow/syncNsoState, addRsuRow/syncRsuState, addEsppRow/syncEsppState,
// addS83bRow/syncS83bState — each with the same computed fields the
// vanilla version derives live (AMT preference spread, NSO ordinary
// income, RSU gross income, ESPP qualifying/disqualifying disposition
// split, and the strict 83(b) 30-day filing deadline).
//
// Cross-border note (why this step exists at all here): RSU/ESOP vest and
// exercise events sourced partly to India and partly to the US are the
// core double-taxation conflict the crossborder findings module's
// `equity_comp_sourcing` finding is built to catch — the grant date,
// vest/exercise date, and FMV-at-event fields captured below are exactly
// the inputs that sourcing computation needs.

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function fmtUsd(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const input = "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";
const label = "block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1";
const sectionLabel = "text-[11px] uppercase tracking-wide text-muted font-semibold";
const card = "rounded-2xl bg-surface border border-line shadow-card p-4";
const nestedCard = "bg-white/[0.02] border border-line rounded-xl p-3";

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 right-2 text-red-400/60 hover:text-red-400 text-sm font-bold px-1"
      aria-label="Remove entry"
    >
      ×
    </button>
  );
}

function RowSection({ title, addLabel, onAdd, count, children }) {
  return (
    <div className={card + " flex flex-col gap-4"}>
      <div className="flex items-center justify-between border-b border-line pb-2">
        <span className={sectionLabel}>{title}</span>
        <button
          type="button"
          onClick={onAdd}
          className="px-2.5 py-1 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
        >
          {addLabel}
        </button>
      </div>
      {count === 0 && (
        <div className="text-center text-muted text-xs py-6 border border-dashed border-line rounded-xl">
          No entries yet.
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

// ---- ISO -------------------------------------------------------------
function IsoRow({ row, index, onChange, onRemove }) {
  const strike = parseNum(row.strike_price_usd) || 0;
  const fmv = parseNum(row.fmv_at_exercise_usd) || 0;
  const shares = parseNum(row.shares_exercised) || 0;
  const spread = Math.max(0, (fmv - strike) * shares);
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen pr-6">
        📈 ISO Exercise Details
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Company Name</label>
          <input type="text" className={input} placeholder="e.g. Stripe" value={row.company_name || ""} onChange={(e) => onChange(index, { company_name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Grant Date</label>
          <input type="date" className={input} value={row.grant_date || ""} onChange={(e) => onChange(index, { grant_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Exercise Date</label>
          <input type="date" className={input} value={row.exercise_date || ""} onChange={(e) => onChange(index, { exercise_date: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pr-6">
        <div>
          <label className={label}>Strike Price (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.strike_price_usd ?? ""} onChange={(e) => onChange(index, { strike_price_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>FMV at Exercise (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.fmv_at_exercise_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_exercise_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Shares Exercised</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.shares_exercised ?? ""} onChange={(e) => onChange(index, { shares_exercised: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>AMT Preference (Spread)</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(spread)} />
        </div>
      </div>
    </div>
  );
}

// ---- NSO -------------------------------------------------------------
function NsoRow({ row, index, onChange, onRemove }) {
  const strike = parseNum(row.strike_price_usd) || 0;
  const fmv = parseNum(row.fmv_at_exercise_usd) || 0;
  const shares = parseNum(row.shares_exercised) || 0;
  const income = Math.max(0, (fmv - strike) * shares);
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen pr-6">
        📈 NSO Exercise Details
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Company Name</label>
          <input type="text" className={input} placeholder="e.g. Uber" value={row.company_name || ""} onChange={(e) => onChange(index, { company_name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Exercise Date</label>
          <input type="date" className={input} value={row.exercise_date || ""} onChange={(e) => onChange(index, { exercise_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Shares Exercised</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.shares_exercised ?? ""} onChange={(e) => onChange(index, { shares_exercised: parseNum(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Strike Price (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.strike_price_usd ?? ""} onChange={(e) => onChange(index, { strike_price_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>FMV at Exercise (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.fmv_at_exercise_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_exercise_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>W-2 Ordinary Income (Spread)</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(income)} />
        </div>
      </div>
    </div>
  );
}

// ---- RSU -------------------------------------------------------------
function RsuRow({ row, index, onChange, onRemove }) {
  const fmv = parseNum(row.fmv_at_vest_usd) || 0;
  const shares = parseNum(row.shares_vested) || 0;
  const income = fmv * shares;
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen pr-6">
        📈 RSU Vesting Details
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Company Name</label>
          <input type="text" className={input} placeholder="e.g. Google" value={row.company_name || ""} onChange={(e) => onChange(index, { company_name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Vest Date</label>
          <input type="date" className={input} value={row.vest_date || ""} onChange={(e) => onChange(index, { vest_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Shares Vested</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.shares_vested ?? ""} onChange={(e) => onChange(index, { shares_vested: parseNum(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>FMV at Vest (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.fmv_at_vest_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_vest_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Shares Withheld for Taxes</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.shares_withheld_for_taxes ?? ""} onChange={(e) => onChange(index, { shares_withheld_for_taxes: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>Gross Taxable Income</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(income)} />
        </div>
      </div>
    </div>
  );
}

// ---- ESPP --------------------------------------------------------------
// Mirrors syncEsppState()'s IRC §423 qualifying/disqualifying disposition
// logic exactly: qualifying disposition = held >=2yr from offering date
// AND >=1yr from purchase date; ordinary income = lesser of actual gain
// or the offering-vs-purchase-date FMV spread cap (qualifying) / purchase
// FMV spread cap (disqualifying); remainder is capital gain/loss.
function computeEspp(row) {
  const offeringDate = row.offering_date;
  const purchaseDate = row.purchase_date;
  const saleDate = row.sale_date;
  const fmvOffering = parseNum(row.fmv_at_offering_usd) || 0;
  const fmvPurchase = parseNum(row.fmv_at_purchase_usd) || 0;
  const purchasePrice = parseNum(row.purchase_price_usd) || 0;
  const shares = parseNum(row.shares_purchased) || 0;
  const salePrice = parseNum(row.sale_price_usd) || 0;

  let dispositionType = "held";
  let ordinaryIncomePerShare = 0;
  let capGainPerShare = 0;

  if (saleDate) {
    const actualGainPerShare = salePrice - purchasePrice;
    let isQualifying = false;
    if (offeringDate && purchaseDate) {
      const twoYearsFromOffering = new Date(offeringDate);
      twoYearsFromOffering.setFullYear(twoYearsFromOffering.getFullYear() + 2);
      const oneYearFromPurchase = new Date(purchaseDate);
      oneYearFromPurchase.setFullYear(oneYearFromPurchase.getFullYear() + 1);
      const saleDateObj = new Date(saleDate);
      isQualifying = saleDateObj >= twoYearsFromOffering && saleDateObj >= oneYearFromPurchase;
    }
    dispositionType = isQualifying ? "qualifying" : "disqualifying";
    const ordinaryIncomeCapPerShare = isQualifying ? fmvOffering - purchasePrice : fmvPurchase - purchasePrice;
    ordinaryIncomePerShare = Math.max(0, Math.min(actualGainPerShare, ordinaryIncomeCapPerShare));
    capGainPerShare = actualGainPerShare - ordinaryIncomePerShare;
  }

  return {
    dispositionType,
    ordinaryIncome: ordinaryIncomePerShare * shares,
    capGain: capGainPerShare * shares,
  };
}

const DISPOSITION_LABEL = { held: "Held", qualifying: "Qualifying", disqualifying: "Disqualifying" };

function EsppRow({ row, index, onChange, onRemove }) {
  const { dispositionType, ordinaryIncome, capGain } = computeEspp(row);
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen pr-6">
        📈 ESPP Purchase Details
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Company Name</label>
          <input type="text" className={input} placeholder="e.g. Salesforce" value={row.company_name || ""} onChange={(e) => onChange(index, { company_name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Offering (Grant) Date</label>
          <input type="date" className={input} value={row.offering_date || ""} onChange={(e) => onChange(index, { offering_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Purchase Date</label>
          <input type="date" className={input} value={row.purchase_date || ""} onChange={(e) => onChange(index, { purchase_date: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pr-6">
        <div>
          <label className={label}>FMV at Offering (USD/sh)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.fmv_at_offering_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_offering_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>FMV at Purchase (USD/sh)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.fmv_at_purchase_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_purchase_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Purchase Price Paid (USD/sh)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.purchase_price_usd ?? ""} onChange={(e) => onChange(index, { purchase_price_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Shares Purchased</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.shares_purchased ?? ""} onChange={(e) => onChange(index, { shares_purchased: parseNum(e.target.value) })} />
        </div>
      </div>
      <div className="text-[10px] font-bold text-muted uppercase border-b border-line pb-1 pr-6">
        If Sold This Year
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-6">
        <div>
          <label className={label}>Sale Date (leave blank if still held)</label>
          <input type="date" className={input} value={row.sale_date || ""} onChange={(e) => onChange(index, { sale_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Sale Price (USD/sh)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.sale_price_usd ?? ""} onChange={(e) => onChange(index, { sale_price_usd: parseNum(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label + " text-brandGreen"}>Disposition</label>
          <input type="text" disabled className={input + " opacity-60"} value={DISPOSITION_LABEL[dispositionType]} />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>Ordinary Income (W-2 Portion)</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(ordinaryIncome)} />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>Capital Gain / Loss</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(capGain)} />
        </div>
      </div>
    </div>
  );
}

// ---- 83(b) elections (unvested restricted stock) ----------------------
function s83bDeadline(grantDate) {
  if (!grantDate) return "";
  const g = new Date(grantDate);
  if (Number.isNaN(g.getTime())) return "";
  const d = new Date(g.getTime() + 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

function S83bRow({ row, index, onChange, onRemove }) {
  const deadline = s83bDeadline(row.grant_date);
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen pr-6">
        ⏱️ Section 83(b) Election Details
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Company Name</label>
          <input type="text" className={input} placeholder="e.g. Stealth Startup" value={row.company_name || ""} onChange={(e) => onChange(index, { company_name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Grant Date</label>
          <input
            type="date"
            className={input}
            value={row.grant_date || ""}
            onChange={(e) => {
              const grant_date = e.target.value;
              onChange(index, { grant_date, filing_deadline_date: s83bDeadline(grant_date) });
            }}
          />
        </div>
        <div>
          <label className={label}>Shares Granted</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0" value={row.number_of_shares ?? ""} onChange={(e) => onChange(index, { number_of_shares: parseNum(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pr-6 items-end">
        <div>
          <label className={label}>FMV at Grant (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0.0001" value={row.fmv_at_grant_usd ?? ""} onChange={(e) => onChange(index, { fmv_at_grant_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Purchase Price (USD)</label>
          <input type="text" inputMode="numeric" className={input} placeholder="0.0001" value={row.purchase_price_usd ?? ""} onChange={(e) => onChange(index, { purchase_price_usd: parseNum(e.target.value) })} />
        </div>
        <div>
          <label className={label + " text-red-400"}>Strict 30-Day Deadline</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={deadline || "Derived"} />
        </div>
        <div className="flex items-center justify-between p-2 bg-white/[0.03] border border-line rounded-lg h-[38px]">
          <span className="text-[10px] font-bold text-body">Election Filed?</span>
          <input
            type="checkbox"
            checked={!!row.filed_within_30_days}
            onChange={(e) => onChange(index, { filed_within_30_days: e.target.checked })}
            className="rounded bg-white/[0.03] border-line text-brandGreen focus:ring-0"
          />
        </div>
      </div>
    </div>
  );
}

export default function EquityStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const eq = usState.equity_compensation;
  const has = !!eq.has_equity_comp;

  const iso = eq.iso_exercises || [];
  const nso = eq.nso_exercises || [];
  const rsu = eq.rsu_vestings || [];
  const espp = eq.espp_purchases || [];
  const s83b = eq.unvested_restricted_stock_awards || [];

  const mk = (path) => ({
    onChange: (idx, patch) => updateRow(path, idx, patch),
    onRemove: (idx) => removeRow(path, idx),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display font-bold text-head uppercase tracking-wide">
          Equity Compensation
        </h2>
        <p className="text-xs text-muted mt-1">
          Declare options, RSUs, ESPP purchases, and critical founder Section 83(b) elections. Cross-border
          filers: grant/vest/exercise dates and FMVs entered here drive US-vs-India equity income sourcing.
        </p>
      </div>

      <div className={card + " flex items-center justify-between"}>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-head">Has US / Global Equity Compensation?</span>
          <span className="text-[10px] text-muted">Required to populate exercise spreads and vests.</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={has}
            onChange={(e) => setField("equity_compensation.has_equity_comp", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-white/20 rounded-full peer peer-checked:bg-brandGreen relative transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      {has && (
        <div className="flex flex-col gap-6">
          <RowSection
            title="Incentive Stock Options (ISOs) — AMT Spread Focus"
            addLabel="+ Add exercise"
            count={iso.length}
            onAdd={() =>
              addRow("equity_compensation.iso_exercises", {
                company_name: "",
                grant_date: null,
                exercise_date: null,
                strike_price_usd: null,
                fmv_at_exercise_usd: null,
                shares_exercised: null,
              })
            }
          >
            {iso.map((row, i) => (
              <IsoRow key={i} row={row} index={i} {...mk("equity_compensation.iso_exercises")} />
            ))}
          </RowSection>

          <RowSection
            title="Non-Qualified Stock Options (NSOs)"
            addLabel="+ Add exercise"
            count={nso.length}
            onAdd={() =>
              addRow("equity_compensation.nso_exercises", {
                company_name: "",
                exercise_date: null,
                shares_exercised: null,
                strike_price_usd: null,
                fmv_at_exercise_usd: null,
              })
            }
          >
            {nso.map((row, i) => (
              <NsoRow key={i} row={row} index={i} {...mk("equity_compensation.nso_exercises")} />
            ))}
          </RowSection>

          <RowSection
            title="Restricted Stock Units (RSUs)"
            addLabel="+ Add vest"
            count={rsu.length}
            onAdd={() =>
              addRow("equity_compensation.rsu_vestings", {
                company_name: "",
                vest_date: null,
                shares_vested: null,
                fmv_at_vest_usd: null,
                shares_withheld_for_taxes: null,
              })
            }
          >
            {rsu.map((row, i) => (
              <RsuRow key={i} row={row} index={i} {...mk("equity_compensation.rsu_vestings")} />
            ))}
          </RowSection>

          <RowSection
            title="Employee Stock Purchase Plan (ESPP) Purchases"
            addLabel="+ Add purchase"
            count={espp.length}
            onAdd={() =>
              addRow("equity_compensation.espp_purchases", {
                company_name: "",
                offering_date: null,
                purchase_date: null,
                fmv_at_offering_usd: null,
                fmv_at_purchase_usd: null,
                purchase_price_usd: null,
                shares_purchased: null,
                sale_date: null,
                sale_price_usd: null,
              })
            }
          >
            {espp.map((row, i) => (
              <EsppRow key={i} row={row} index={i} {...mk("equity_compensation.espp_purchases")} />
            ))}
          </RowSection>

          <RowSection
            title="Founder Section 83(b) Elections (Unvested Stock)"
            addLabel="+ Add election"
            count={s83b.length}
            onAdd={() =>
              addRow("equity_compensation.unvested_restricted_stock_awards", {
                company_name: "",
                grant_date: null,
                number_of_shares: null,
                fmv_at_grant_usd: null,
                purchase_price_usd: null,
                filing_deadline_date: null,
                filed_within_30_days: false,
              })
            }
          >
            {s83b.map((row, i) => (
              <S83bRow key={i} row={row} index={i} {...mk("equity_compensation.unvested_restricted_stock_awards")} />
            ))}
          </RowSection>
        </div>
      )}
    </div>
  );
}
