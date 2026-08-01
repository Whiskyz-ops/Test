"use client";

import { useEffect } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html:1832-2107 ("Screen 3C-2 — Capital Gains &
// Crypto"). Source functions ported: addUSCapGainsRow('cg', ...) /
// syncUSCapGainsState('cg') for the itemized entry list, syncCgManualState()
// (layer1_us.html:6118-6131) for the separate 4-field "Manual Entry" totals
// tab, and the isLongTerm() split from recalculateCapitalGainsAggregate()
// (layer1_us.html:11249-11286).
//
// NAMING FIX (real HTML-export comparison): this component previously wrote
// the itemized list to a self-invented `income_us_source.
// capital_gains_transactions` path. schema.js now declares the source's real
// path, `income_us_source.cg_transactions` — corrected below.
//
// BEHAVIOR FIX (real HTML-export comparison, confirms the "no cross-step
// capital-gains aggregation" audit finding): reading
// recalculateCapitalGainsAggregate() line by line shows it does NOT sum
// cg_transactions (the itemized list below) at all — it only rolls up
// real_estate.properties/real_estate_transactions, collectibles_transactions,
// qsbs_transactions, crypto_transactions, and the cg_manual_stcg_usd/
// cg_manual_ltcg_usd scalars. Those manual scalars are themselves NOT derived
// from cg_transactions either — they come from 4 separate flat total inputs
// on the source's "Manual Entry" tab (cg-manual-st-proceeds/st-basis/
// lt-proceeds/lt-basis). This component previously summed the itemized list
// straight into stcg_us_source_usd/ltcg_us_source_usd, which doesn't match
// the source's actual aggregation semantics at all. Fixed: the itemized list
// is now display/export-only (matching the source, where it's genuinely not
// part of the tax aggregate), and a real "Manual Entry Totals" block feeds
// cg_manual_*_usd, mirroring syncCgManualState() exactly. The full aggregate
// (adding real_estate/collectibles/qsbs/crypto on top of the manual totals)
// still doesn't exist as a cross-step layer in this React port — this
// component can only write the manual-entry portion of it, same limitation
// as before, now at least computing that portion correctly.
//
// *** CROSS-STEP CONFLICT — RESOLVED (verification pass) ***: this comment
// previously described IncomeUsStep.jsx ALSO rendering has_capital_gains /
// stcg_us_source_usd / ltcg_us_source_usd as directly-editable fields,
// racing this step's useEffect below. Verified current: IncomeUsStep.jsx's
// "Capital Gains & Investment Flags" card now renders those two totals
// read-only (`readOnly` + no-op onChange, sourced from this step's
// live-computed value) and does not set has_capital_gains anywhere — this
// step's <select> below is the sole writer. The has_sec_1256 / has_qsbs /
// has_collectibles / stocks_needs_wash_sale_reconciliation /
// crypto_needs_wash_sale / has_qof_rollover / has_1031_exchange /
// has_installment_sale / has_capital_loss_carryovers / st_loss_carryover_usd
// / lt_loss_carryover_usd flags ARE still duplicated on IncomeUsStep's same
// card (both components render editable controls for them) — that's
// harmless today since both write straight through to the same store path
// with no derived/computed value to race, but it's redundant UI surface
// worth consolidating onto one step.

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
  // BUG FIX (verification pass): `gain` above was computed for on-screen
  // display only and never written back to the row via `onChange`/
  // `updateRow`, unlike the original's syncUSCapGainsState()
  // (layer1_us.html:6093-6106), which always persists
  // `realized_gain_loss_usd` onto each transaction. The aggregate
  // stcg_us_source_usd/ltcg_us_source_usd totals were still correct (the
  // parent recomputes them straight from proceeds - cost_basis), but the
  // per-row field itself silently never reached the store/localStorage —
  // undefined forever, even after a save/reload, and invisible to anything
  // (e.g. the Review & Export step's JSON dump) that reads the transaction
  // list itself rather than the aggregate. wrappedOnChange persists it on
  // every field edit, same as the sibling CryptoRowEditor in
  // IncomeUsStep.jsx already does correctly.
  const wrappedOnChange = (idx, patch) => {
    const next = { ...row, ...patch };
    const nextGain = (parseNum(next.sale_proceeds_usd) || 0) - (parseNum(next.cost_basis_usd) || 0);
    onChange(idx, { ...patch, realized_gain_loss_usd: nextGain });
  };
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
            onChange={(e) => wrappedOnChange(index, { asset_name: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Date Acquired</label>
          <input
            type="date"
            className={input}
            value={row.acquisition_date || ""}
            onChange={(e) => wrappedOnChange(index, { acquisition_date: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Date Sold</label>
          <input
            type="date"
            className={input}
            value={row.sale_date || ""}
            onChange={(e) => wrappedOnChange(index, { sale_date: e.target.value })}
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
            onChange={(e) => wrappedOnChange(index, { cost_basis_usd: parseNum(e.target.value) })}
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
            onChange={(e) => wrappedOnChange(index, { sale_proceeds_usd: parseNum(e.target.value) })}
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
  const transactions = src.cg_transactions || [];

  // Manual Entry Totals tab (layer1_us.html's cg-manual-st-proceeds/
  // st-basis/lt-proceeds/lt-basis inputs) — syncCgManualState()
  // (layer1_us.html:6118-6131), the ONLY manual-entry source
  // recalculateCapitalGainsAggregate() actually reads. Derived stcg/ltcg are
  // computed live rather than stored separately-then-read, but written back
  // to cg_manual_stcg_usd/cg_manual_ltcg_usd on every change exactly like
  // the source does.
  const manualStcg = (parseNum(src.cg_manual_st_proceeds_usd) || 0) - (parseNum(src.cg_manual_st_basis_usd) || 0);
  const manualLtcg = (parseNum(src.cg_manual_lt_proceeds_usd) || 0) - (parseNum(src.cg_manual_lt_basis_usd) || 0);

  useEffect(() => {
    if (src.cg_manual_stcg_usd !== manualStcg) setField("income_us_source.cg_manual_stcg_usd", manualStcg);
    if (src.cg_manual_ltcg_usd !== manualLtcg) setField("income_us_source.cg_manual_ltcg_usd", manualLtcg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualStcg, manualLtcg]);

  // Live aggregate write-back. Matches recalculateCapitalGainsAggregate()'s
  // manual-entry term (`stcg = manualStcg; ltcg = manualLtcg;`) only — the
  // real_estate/collectibles/qsbs/crypto terms it also sums belong to other
  // steps and there is no cross-step aggregation layer yet (see file-header
  // note). cg_transactions (the itemized list below) is correctly NOT
  // summed here, matching the source.
  useEffect(() => {
    if (src.stcg_us_source_usd !== manualStcg) setField("income_us_source.stcg_us_source_usd", manualStcg);
    if (src.ltcg_us_source_usd !== manualLtcg) setField("income_us_source.ltcg_us_source_usd", manualLtcg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualStcg, manualLtcg]);

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
              STCG: <span className="text-head">{fmtUsd(manualStcg)}</span>
            </span>
            <span className="text-muted">
              LTCG: <span className="text-head">{fmtUsd(manualLtcg)}</span>
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
                  onChange={(idx, patch) => updateRow("income_us_source.cg_transactions", idx, patch)}
                  onRemove={(idx) => removeRow("income_us_source.cg_transactions", idx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                addRow("income_us_source.cg_transactions", {
                  asset_name: "",
                  acquisition_date: null,
                  sale_date: null,
                  cost_basis_usd: null,
                  sale_proceeds_usd: null,
                  realized_gain_loss_usd: 0,
                })
              }
              className="self-start px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-line"
            >
              + Add CG Entry
            </button>
          </div>
        )}

        {hasCapGains && (
          <div className="flex flex-col gap-3 pt-3 border-t border-line">
            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
              Manual Entry Totals (aggregate ST/LT proceeds &amp; basis)
            </span>
            <p className="text-[10px] text-muted -mt-2">
              Ported from the source&apos;s separate &quot;Manual Entry&quot; tab — flat totals, not tied to the
              itemized transactions above. This is the figure that actually feeds your Schedule D short/long-term
              capital gain totals.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={label}>Short-Term Proceeds (USD)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={input}
                  placeholder="0"
                  value={src.cg_manual_st_proceeds_usd ?? ""}
                  onChange={(e) => setField("income_us_source.cg_manual_st_proceeds_usd", parseNum(e.target.value))}
                />
              </div>
              <div>
                <label className={label}>Short-Term Basis (USD)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={input}
                  placeholder="0"
                  value={src.cg_manual_st_basis_usd ?? ""}
                  onChange={(e) => setField("income_us_source.cg_manual_st_basis_usd", parseNum(e.target.value))}
                />
              </div>
              <div>
                <label className={label}>Long-Term Proceeds (USD)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={input}
                  placeholder="0"
                  value={src.cg_manual_lt_proceeds_usd ?? ""}
                  onChange={(e) => setField("income_us_source.cg_manual_lt_proceeds_usd", parseNum(e.target.value))}
                />
              </div>
              <div>
                <label className={label}>Long-Term Basis (USD)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={input}
                  placeholder="0"
                  value={src.cg_manual_lt_basis_usd ?? ""}
                  onChange={(e) => setField("income_us_source.cg_manual_lt_basis_usd", parseNum(e.target.value))}
                />
              </div>
            </div>
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
