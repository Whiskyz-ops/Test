"use client";

import { useEffect, useMemo } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html:1832-2107 ("Screen 3C-2 — Capital Gains &
// Crypto"). Source functions ported: addUSCapGainsRow('cg', ...) /
// syncUSCapGainsState('cg') for the manual entry list, plus the
// isLongTerm() split from recalculateCapitalGainsAggregate()
// (layer1_us.html:11250).
//
// SCHEMA GAP: schema.js's income_us_source has stcg_us_source_usd /
// ltcg_us_source_usd scalar totals but no line-item array for manual
// capital-gains entries (the vanilla source wrote these to
// `usState.income_us_source.cg_transactions`, a key schema.js never
// declared). This component adds+owns a new array at
// `income_us_source.capital_gains_transactions` for that purpose. Flagging
// per the task brief — this path is not in createDefaultUsState() and
// callers reading usState should treat it as possibly undefined.
//
// ALSO NOTE: the original's recalculateCapitalGainsAggregate() rolls
// manual entries, real_estate, collectibles, QSBS, and crypto ALL into the
// same stcg_us_source_usd/ltcg_us_source_usd scalars. Those other source
// arrays (real_estate.properties, income_us_source.crypto_transactions,
// and the never-schema'd qsbs/collectibles transaction lists) belong to
// other steps. This component can only see its own
// capital_gains_transactions array, so the totals it writes here reflect
// manual entries ONLY — a real simplification vs. the original's
// cross-step aggregate. Whichever step/effect owns real_estate and crypto
// will stomp these same two scalar fields when it recalculates; there is
// no cross-step aggregation layer in this React port yet.

// isLongTerm(): ported per task spec as a 12-months-and-a-day / 366-day
// class boundary (add one calendar year to the acquisition date, sold
// date must be strictly after that) rather than the vanilla source's
// simpler `(sold - acq) > 365 * 24 * 60 * 60 * 1000` literal. This is
// actually closer to the real IRC Sec. 1222 rule (long-term requires
// holding for MORE than one year) and handles leap years correctly,
// where the source's fixed-365-days-in-ms version can misclassify a
// same-calendar-date-next-year sale spanning a leap day.
function isLongTerm(acqStr, soldStr) {
  if (!acqStr || !soldStr) return false;
  const acq = new Date(acqStr);
  const sold = new Date(soldStr);
  if (Number.isNaN(acq.getTime()) || Number.isNaN(sold.getTime())) return false;
  const oneYearOut = new Date(acq);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  return sold.getTime() > oneYearOut.getTime();
}

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

function CapGainRow({ row, index, onChange, onRemove }) {
  const lt = isLongTerm(row.acquisition_date, row.sale_date);
  const gain = (parseNum(row.sale_proceeds_usd) || 0) - (parseNum(row.cost_basis_usd) || 0);
  return (
    <div className={nestedCard + " flex flex-col gap-3 relative"}>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-2 right-2 text-red-400/60 hover:text-red-400 text-sm font-bold px-1"
        aria-label="Remove entry"
      >
        ×
      </button>
      <div className="flex items-center gap-2 pr-6">
        <span
          className={
            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded " +
            (lt ? "bg-brandGreen/15 text-brandGreen" : "bg-amber-500/15 text-amber-400")
          }
        >
          {lt ? "Long-Term" : "Short-Term"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Asset / Security Description</label>
          <input
            type="text"
            className={input}
            placeholder="e.g. AAPL"
            value={row.asset_name || ""}
            onChange={(e) => onChange(index, { asset_name: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Date Acquired</label>
          <input
            type="date"
            className={input}
            value={row.acquisition_date || ""}
            onChange={(e) => onChange(index, { acquisition_date: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Date Sold</label>
          <input
            type="date"
            className={input}
            value={row.sale_date || ""}
            onChange={(e) => onChange(index, { sale_date: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-6">
        <div>
          <label className={label}>Cost Basis (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.cost_basis_usd ?? ""}
            onChange={(e) => onChange(index, { cost_basis_usd: parseNum(e.target.value) })}
          />
        </div>
        <div>
          <label className={label}>Sale Proceeds (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className={input}
            placeholder="0"
            value={row.sale_proceeds_usd ?? ""}
            onChange={(e) => onChange(index, { sale_proceeds_usd: parseNum(e.target.value) })}
          />
        </div>
        <div>
          <label className={label + " text-brandGreen"}>Realized Gain / Loss</label>
          <input type="text" disabled className={input + " opacity-60 font-mono"} value={fmtUsd(gain)} />
        </div>
      </div>
    </div>
  );
}

const FLAG_FIELDS = [
  { key: "has_qsbs", title: "QSBS (Sec. 1202) shares sold", hint: "Private company shares eligible for the qualified small-business-stock gain exclusion." },
  { key: "has_collectibles", title: "Collectibles / precious metals sold", hint: "Taxed at a special 28% max rate instead of ordinary LTCG rates." },
  { key: "has_sec_1256", title: "Section 1256 contracts (futures, options, etc.)", hint: "Marked-to-market, 60% long-term / 40% short-term blended treatment." },
  { key: "stocks_needs_wash_sale_reconciliation", title: "Stock wash sales need reconciliation", hint: "Disallowed losses from repurchasing substantially identical stock within 30 days." },
  { key: "crypto_needs_wash_sale", title: "Crypto wash-sale-style reconciliation needed", hint: "No statutory wash-sale rule for crypto today, but flagged for planning purposes." },
  { key: "has_qof_rollover", title: "Qualified Opportunity Fund (QOF) rollover", hint: "Sec. 1400Z-2 gain deferral election into a QOF." },
  { key: "has_1031_exchange", title: "Sec. 1031 like-kind exchange", hint: "Real property exchanges only, post-TCJA." },
  { key: "has_installment_sale", title: "Installment sale (Sec. 453)", hint: "Gain recognized as payments are received rather than at closing." },
  { key: "has_capital_loss_carryovers", title: "Capital loss carryovers from a prior year", hint: "Short-term / long-term loss carried forward from a prior return." },
];

export default function CapGainsStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const src = usState.income_us_source;
  const transactions = src.capital_gains_transactions || [];

  const totals = useMemo(() => {
    let stcg = 0;
    let ltcg = 0;
    for (const t of transactions) {
      const gain = (parseNum(t.sale_proceeds_usd) || 0) - (parseNum(t.cost_basis_usd) || 0);
      if (isLongTerm(t.acquisition_date, t.sale_date)) ltcg += gain;
      else stcg += gain;
    }
    return { stcg, ltcg };
  }, [transactions]);

  // Live aggregate write-back, mirroring recalculateCapitalGainsAggregate()
  // for the manual-entry slice only (see file-header note on the schema
  // gap / cross-step aggregation caveat).
  useEffect(() => {
    if (src.stcg_us_source_usd !== totals.stcg) setField("income_us_source.stcg_us_source_usd", totals.stcg);
    if (src.ltcg_us_source_usd !== totals.ltcg) setField("income_us_source.ltcg_us_source_usd", totals.ltcg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.stcg, totals.ltcg]);

  const hasCapGains = !!src.has_capital_gains;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display font-bold text-head uppercase tracking-wide">
          Capital Gains &amp; Investments
        </h2>
        <p className="text-xs text-muted mt-1">
          Stock, RSU, QSBS, real estate, collectibles, and crypto sales flow into your Schedule D. Connect a
          brokerage or 1099-B upload elsewhere in the wizard, or enter transactions manually below.
        </p>
      </div>

      {/* RSU cost-basis guardrail — ported verbatim from the source warning banner */}
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
        <span className="text-red-400 mt-0.5">⚠️</span>
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">
            Tech Equity Warning: RSU Cost Basis
          </span>
          <span className="text-[10px] text-red-200/70 mt-1">
            Brokerages (E*TRADE, Fidelity) often report a <strong>$0 cost basis</strong> for RSUs on your official
            Form 1099-B. If you use this number, you will pay double taxes! You must use the &quot;adjusted cost
            basis&quot; from your Supplemental Information packet.
          </span>
        </div>
      </div>

      {/* Manual capital gains entries */}
      <div className={card + " flex flex-col gap-4"}>
        <div className="flex items-center justify-between border-b border-line pb-2 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <span className={sectionLabel}>Investments &amp; Capital Gains (Form 1099-B)</span>
            <select
              value={hasCapGains ? "true" : "false"}
              onChange={(e) => setField("income_us_source.has_capital_gains", e.target.value === "true")}
              className="bg-white/[0.03] border border-line rounded-lg text-[11px] text-head px-3 py-1.5 focus:outline-none focus:border-brandGreen/50"
            >
              <option value="false">No Transactions</option>
              <option value="true">Yes, Transactions Exist</option>
            </select>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="text-muted">
              STCG: <span className="text-head">{fmtUsd(totals.stcg)}</span>
            </span>
            <span className="text-muted">
              LTCG: <span className="text-head">{fmtUsd(totals.ltcg)}</span>
            </span>
          </div>
        </div>

        {hasCapGains && (
          <div className="flex flex-col gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
              Individual Sale Transactions
            </span>
            {transactions.length === 0 && (
              <div className="text-center text-muted text-xs py-6 border border-dashed border-line rounded-xl">
                No manual entries yet. Add one below, or import via 1099-B / broker connect elsewhere in the wizard.
              </div>
            )}
            <div className="flex flex-col gap-3">
              {transactions.map((row, i) => (
                <CapGainRow
                  key={i}
                  row={row}
                  index={i}
                  onChange={(idx, patch) => updateRow("income_us_source.capital_gains_transactions", idx, patch)}
                  onRemove={(idx) => removeRow("income_us_source.capital_gains_transactions", idx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                addRow("income_us_source.capital_gains_transactions", {
                  asset_name: "",
                  acquisition_date: null,
                  sale_date: null,
                  cost_basis_usd: null,
                  sale_proceeds_usd: null,
                })
              }
              className="self-start px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
            >
              + Add CG Entry
            </button>
          </div>
        )}
      </div>

      {/* Flags & elections */}
      <div className={card + " flex flex-col gap-4"}>
        <span className={sectionLabel}>Flags, Elections &amp; Carryovers</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FLAG_FIELDS.map((f) => (
            <label
              key={f.key}
              className={nestedCard + " flex items-start gap-3 cursor-pointer"}
            >
              <input
                type="checkbox"
                checked={!!src[f.key]}
                onChange={(e) => setField(`income_us_source.${f.key}`, e.target.checked)}
                className="mt-0.5 rounded bg-white/[0.03] border-line text-brandGreen focus:ring-0"
              />
              <span className="flex flex-col">
                <span className="text-xs font-semibold text-head">{f.title}</span>
                <span className="text-[10px] text-muted mt-0.5">{f.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {src.has_capital_loss_carryovers && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-line">
            <div className="pt-3">
              <label className={label}>Short-Term Loss Carryover (USD)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className={input}
                value={src.st_loss_carryover_usd ?? ""}
                onChange={(e) => setField("income_us_source.st_loss_carryover_usd", parseNum(e.target.value))}
              />
            </div>
            <div className="pt-3">
              <label className={label}>Long-Term Loss Carryover (USD)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className={input}
                value={src.lt_loss_carryover_usd ?? ""}
                onChange={(e) => setField("income_us_source.lt_loss_carryover_usd", parseNum(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
