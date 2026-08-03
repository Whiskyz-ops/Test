"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html:2719-2792 ("Screen 3D — Foreign-Source
// Income"). Ported: the six income_foreign_source scalars, the
// addForeignWagesRow()/syncForeignWagesState() repeatable list
// (income_foreign_source.foreign_wages), the
// addSec988Row()/syncSec988State() repeatable list
// (income_foreign_source.section_988_gains_losses), and the
// addOtherCountryFtcRow()/syncOtherCountryFtcState() repeatable list
// (foreign_tax_credit_other.entries).
//
// BUG FIX (found by the step-by-step map audit): the "Other Foreign Tax
// Credits (Additional Countries)" card (layer1_us.html:2778-2786) closes
// out this exact panel — confirmed by reading straight through to
// layer1_us.html:2792-2795, where panel-step-income-foreign's closing
// </div> is immediately followed by "STEP 5: EQUITY COMPENSATION", not a
// new FTC panel. It was previously rendered on FtcStep.jsx instead (a
// different, later step, panel-step-ftc at layer1_us.html:3634) — this
// file only had a comment acknowledging the misplacement. Moved here to
// match the source; removed from FtcStep.jsx.

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? null : n;
}

const input = "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";
const label = "block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1";
const sectionLabel = "text-[11px] uppercase tracking-wide text-muted font-semibold";
const card = "rounded-2xl bg-surface border border-line shadow-card p-4";
const nestedCard = "bg-white/[0.02] border border-line rounded-xl p-3";

const SCALAR_FIELDS = [
  { key: "foreign_interest_usd", title: "Foreign Interest (USD)", hint: "Includes NRO/NRE account interest." },
  { key: "foreign_dividends_usd", title: "Foreign Dividends (USD)" },
  { key: "foreign_stcg_usd", title: "Foreign Short-Term Capital Gains (USD)", hint: "Held <= 1 year." },
  { key: "foreign_ltcg_usd", title: "Foreign Long-Term Capital Gains (USD)", hint: "Sec. 54-style relief may apply abroad." },
  { key: "foreign_rental_income_usd", title: "Foreign Rental Income (Gross USD)" },
  { key: "foreign_pension_income_usd", title: "Foreign Pension / Social Security (USD)" },
];

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

function ForeignWageRow({ row, index, onChange, onRemove }) {
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen flex items-center gap-1 pr-6">
        💼 Foreign Wage Details
      </span>
      <p className="text-[10px] text-muted -mt-1">
        Working abroad? You may qualify for the Foreign Earned Income Exclusion (Form 2555, Sec. 911) or Foreign
        Tax Credit (Form 1116, Sec. 901) to avoid double taxation.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pr-6">
        <div>
          <label className={label}>Country (ISO)</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. IN"
            value={row.country || ""}
            onChange={(e) => onChange(index, { country: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Employer Name</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. Infosys"
            value={row.employer_name || ""}
            onChange={(e) => onChange(index, { employer_name: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Gross Wages (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.gross_wages_usd ?? ""}
            onChange={(e) => onChange(index, { gross_wages_usd: parseNum(e.target.value) })}
          />
        </div>
        <div>
          <label className={label}>Foreign Taxes Paid (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.foreign_tax_paid_usd ?? ""}
            onChange={(e) => onChange(index, { foreign_tax_paid_usd: parseNum(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

function Sec988Row({ row, index, onChange, onRemove }) {
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen flex items-center gap-1 pr-6">
        💱 Section 988 FX Details
      </span>
      <p className="text-[10px] text-muted -mt-1">
        Foreign currency exchange gains/losses (Sec. 988(a)(1)(A)) are generally taxed as ORDINARY income or loss,
        not capital gains.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pr-6">
        <div>
          <label className={label}>Description</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. INR FX conversion"
            value={row.description || ""}
            onChange={(e) => onChange(index, { description: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            className={input}
            value={row.transaction_date || ""}
            onChange={(e) => onChange(index, { transaction_date: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Base Currency</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. INR"
            value={row.base_currency || ""}
            onChange={(e) => onChange(index, { base_currency: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Realized Gain / Loss (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.realized_gain_loss_usd ?? ""}
            onChange={(e) => onChange(index, { realized_gain_loss_usd: parseNum(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

const OTHER_FTC_BASKETS = [
  { value: "general", label: "General (wages/business/pension)" },
  { value: "passive", label: "Passive (interest/dividends/rents/cap gains)" },
];

function OtherCountryFtcRow({ row, index, onChange, onRemove }) {
  return (
    <div className={nestedCard + " relative"}>
      <RemoveButton onClick={() => onRemove(index)} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pr-6">
        <div>
          <label className={label}>Country (ISO)</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. GB"
            value={row.country || ""}
            onChange={(e) => onChange(index, { country: e.target.value.toUpperCase() })}
          />
        </div>
        <div>
          <label className={label}>§904 Basket</label>
          <select
            className={input}
            value={row.basket || "general"}
            onChange={(e) => onChange(index, { basket: e.target.value })}
          >
            {OTHER_FTC_BASKETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Foreign-Source Income (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.foreign_source_income_usd ?? ""}
            onChange={(e) => onChange(index, { foreign_source_income_usd: parseNum(e.target.value) })}
          />
        </div>
        <div>
          <label className={label}>Foreign Tax Paid (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.foreign_tax_paid_usd ?? ""}
            onChange={(e) => onChange(index, { foreign_tax_paid_usd: parseNum(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

export default function IncomeForeignStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const fs = usState.income_foreign_source;
  const wages = fs.foreign_wages || [];
  const sec988 = fs.section_988_gains_losses || [];
  const otherFtc = usState.foreign_tax_credit_other?.entries || [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display font-bold text-head uppercase tracking-wide">
          Foreign-Source Income
        </h2>
        <p className="text-xs text-muted mt-1">
          Worldwide income reporting. This step is generally locked for filers taxed only as Non-Resident Aliens.
        </p>
      </div>

      {/* Foreign wages */}
      <div className={card + " flex flex-col gap-4"}>
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className={sectionLabel}>Foreign Employment / Wages</span>
          <button
            type="button"
            onClick={() =>
              addRow("income_foreign_source.foreign_wages", {
                country: "",
                employer_name: "",
                gross_wages_usd: null,
                foreign_tax_paid_usd: null,
              })
            }
            className="px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
          >
            + Add foreign wage
          </button>
        </div>
        {wages.length === 0 && (
          <div className="text-center text-muted text-xs py-6 border border-dashed border-line rounded-xl">
            No foreign wages entered.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {wages.map((row, i) => (
            <ForeignWageRow
              key={i}
              row={row}
              index={i}
              onChange={(idx, patch) => updateRow("income_foreign_source.foreign_wages", idx, patch)}
              onRemove={(idx) => removeRow("income_foreign_source.foreign_wages", idx)}
            />
          ))}
        </div>
      </div>

      {/* Passive foreign income scalars */}
      <div className={card + " grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {SCALAR_FIELDS.map((f) => (
          <div key={f.key}>
            <label className={label + " flex items-center gap-1"}>
              {f.title}
              {f.hint && <span className="text-[9px] px-1 bg-white/10 text-muted rounded normal-case font-normal">{f.hint}</span>}
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              className={input}
              value={fs[f.key] ?? ""}
              onChange={(e) => setField(`income_foreign_source.${f.key}`, parseNum(e.target.value))}
            />
          </div>
        ))}
      </div>

      {/* Section 988 currency gains/losses */}
      <div className={card + " flex flex-col gap-4"}>
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className={sectionLabel}>Section 988 Currency Gains &amp; Losses</span>
          <button
            type="button"
            onClick={() =>
              addRow("income_foreign_source.section_988_gains_losses", {
                description: "",
                transaction_date: null,
                base_currency: "",
                realized_gain_loss_usd: null,
              })
            }
            className="px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
          >
            + Add transaction
          </button>
        </div>
        {sec988.length === 0 && (
          <div className="text-center text-muted text-xs py-6 border border-dashed border-line rounded-xl">
            No Section 988 transactions entered.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {sec988.map((row, i) => (
            <Sec988Row
              key={i}
              row={row}
              index={i}
              onChange={(idx, patch) => updateRow("income_foreign_source.section_988_gains_losses", idx, patch)}
              onRemove={(idx) => removeRow("income_foreign_source.section_988_gains_losses", idx)}
            />
          ))}
        </div>
      </div>

      {/* Other-Country FTC entries */}
      <div className={card + " flex flex-col gap-4"}>
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className={sectionLabel}>Other Foreign Tax Credits (Additional Countries)</span>
          <button
            type="button"
            onClick={() =>
              addRow("foreign_tax_credit_other.entries", {
                country: "",
                basket: "general",
                foreign_source_income_usd: null,
                foreign_tax_paid_usd: null,
              })
            }
            className="px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
          >
            + Add country
          </button>
        </div>
        <p className="text-[10px] text-muted -mt-1">
          The foreign-income fields above are assumed India-source. If you also have foreign-source income/tax from a
          THIRD country, make sure that income is ALSO reflected above (or in Foreign Wages) so it&apos;s taxed —
          this section only feeds the Foreign Tax Credit LIMITATION, it doesn&apos;t add income to your return, the
          same way Form 1116 itself works.
          <span className="nerd-text">
            §904(d) baskets: Passive (interest/dividends/rents/capital gains) vs General (wages/business/pension).
            This engine only computes India&apos;s own tax — foreign tax paid to any OTHER country must be entered
            directly, not computed.
          </span>
        </p>
        {otherFtc.length === 0 && (
          <div className="text-center text-muted text-xs py-6 border border-dashed border-line rounded-xl">
            No entries added yet.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {otherFtc.map((row, i) => (
            <OtherCountryFtcRow
              key={i}
              row={row}
              index={i}
              onChange={(idx, patch) => updateRow("foreign_tax_credit_other.entries", idx, patch)}
              onRemove={(idx) => removeRow("foreign_tax_credit_other.entries", idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
