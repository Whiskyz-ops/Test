"use client";

import { useUsLayer1Store } from "@/lib/layer1-us/store";

// React port of layer1_us.html panel-step-passive (layer1_us.html:2108-2217).
//
// CORRECTION vs the task brief: the task guessed this step held
// `financial_holdings` / FATCA brokerage-holdings data. Grepping the actual
// panel shows that's wrong — panel-step-passive is Schedule B/E/1 aggregate
// income entry (interest, dividends, rental, "other income"), all scalar
// fields under `income_us_source`. The real `addHoldingRow` /
// `financial_holdings` UI lives in panel-step-banks instead (see
// BanksStep.jsx, which renders it there to match the actual source).
//
// Faithful port: all fields below mirror layer1_us.html's oninput handlers
// 1:1, including syncUsInterestTotal()'s roll-up of the four interest
// sub-fields into `interest_us_source_usd`.
//
// SCHEMA GAP: several fields this panel writes are NOT pre-declared in
// schema.js's income_us_source block (only interest_us_bank_usd,
// interest_us_treasury_usd, interest_us_oid_usd, interest_us_private_usd,
// interest_us_exempt_usd, interest_us_source_usd, ordinary/qualified
// dividends, rental_income_us_source_usd, and social_security_benefits_usd
// are declared). The following are written under the exact dotted paths
// the vanilla source uses, but are gaps against schema.js:
//   - income_us_source.rental_expenses_us_source_usd
//   - income_us_source.state_local_tax_refund_usd
//   - income_us_source.unemployment_compensation_usd
//   - income_us_source.alimony_received_usd
//   - income_us_source.royalties_direct_us_source_usd (schema.js separately
//     declares `royalty_income_us_source_usd`, a different key — the source
//     file itself never reconciled these two names; ported as-is)
//   - income_us_source.cancellation_of_debt_usd
//   - income_us_source.hsa_msa_distributions_usd
//   - income_us_source.misc_other_income_usd
// The store's setField/getAtPath work fine against undeclared keys (they
// just won't pre-exist until first write), so this is functional, not
// broken — flagged per the task's instructions as a gap to reconcile in
// schema.js later.

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

function SectionLabel({ children }) {
  return <div className="text-[11px] uppercase tracking-wide text-muted font-semibold border-b border-line pb-2">{children}</div>;
}

export default function PassiveStep() {
  const { usState, setField } = useUsLayer1Store();
  const inc = usState.income_us_source || {};

  function setIncome(key, value) {
    setField(`income_us_source.${key}`, value);
  }

  function NumberField(key, label, hint) {
    return (
      <Field label={label} hint={hint}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          className={inputCls + " font-mono"}
          value={inc[key] ?? ""}
          onChange={(e) => setIncome(key, parseNum(e.target.value))}
        />
      </Field>
    );
  }

  // Ported verbatim from syncUsInterestTotal() (layer1_us.html:8632-8646).
  function setInterestComponent(key, value) {
    const next = { ...inc, [key]: value };
    const bank = next.interest_us_bank_usd || 0;
    const treasury = next.interest_us_treasury_usd || 0;
    const oid = next.interest_us_oid_usd || 0;
    const priv = next.interest_us_private_usd || 0;
    setIncome(key, value);
    setField("income_us_source.interest_us_source_usd", bank + treasury + oid + priv);
  }

  function InterestField(key, label, hint) {
    return (
      <Field label={label} hint={hint}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          className={inputCls + " font-mono"}
          value={inc[key] ?? ""}
          onChange={(e) => setInterestComponent(key, parseNum(e.target.value))}
        />
      </Field>
    );
  }

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-6">
      <div>
        <h2 className="text-head font-display font-bold text-lg">Passive & Other Income</h2>
        <p className="text-muted text-xs mt-1">
          Provide your Interest, Dividends, Rental earnings, and miscellaneous Schedule 1 income.
        </p>
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <SectionLabel>Interest &amp; Dividends (Schedule B)</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {InterestField("interest_us_bank_usd", "Interest — Banks & Brokerages", "Box 1 of 1099-INT")}
          {InterestField("interest_us_treasury_usd", "Interest — US Treasuries", "Box 3 (Exempt from State tax)")}
          {InterestField("interest_us_oid_usd", "Interest — Private / OID", "Box 1 or Form 1099-OID")}
          {InterestField("interest_us_private_usd", "Interest — Private / Seller Fin.", "Private loan / P2P interest")}
          <div className="col-span-1 md:col-span-4 border-t border-line pt-3">
            {NumberField(
              "interest_us_exempt_usd",
              "Tax-Exempt Interest (USD)",
              "Box 8 of Form 1099-INT (e.g. Municipal Bonds) — not federally taxable, recordkeeping only"
            )}
          </div>
          {NumberField("ordinary_dividends_us_source_usd", "US Ordinary Dividends (USD)", "Box 1a of Form 1099-DIV")}
          {NumberField("qualified_dividends_us_source_usd", "US Qualified Dividends (USD)", "Box 1b of Form 1099-DIV")}
        </div>
        <div className="text-[10px] text-muted">
          Total interest (auto-summed): <span className="font-mono text-body">{(inc.interest_us_source_usd || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <SectionLabel>Real Estate Rental Income (Schedule E)</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {NumberField("rental_income_us_source_usd", "Gross US Rental Earnings (USD)")}
          {NumberField("rental_expenses_us_source_usd", "Total Rental Expenses (USD)", "Schema gap — see file header")}
        </div>
      </div>

      <div className="p-4 bg-white/[0.02] border border-line rounded-2xl flex flex-col gap-4">
        <SectionLabel>Other Income (Schedule 1 &amp; 1099-G/SSA)</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {NumberField(
            "state_local_tax_refund_usd",
            "State / Local Tax Refunds (1099-G)",
            "Box 2 — taxable only under the tax-benefit rule; not modeled, recordkeeping only. Schema gap."
          )}
          {NumberField("unemployment_compensation_usd", "Unemployment Compensation (1099-G)", "Box 1. Schema gap.")}
          {NumberField("social_security_benefits_usd", "Social Security Benefits (SSA-1099)", "Box 5 of Form SSA-1099")}
          {NumberField("alimony_received_usd", "Alimony Received", "Only for divorces finalized before 2019. Schema gap.")}
          {NumberField("royalties_direct_us_source_usd", "Royalties (Schedule E)", "Box 2 of Form 1099-MISC. Schema gap.")}
          {NumberField("cancellation_of_debt_usd", "Cancellation of Debt (1099-C)", "Box 2. Schema gap.")}
          {NumberField(
            "hsa_msa_distributions_usd",
            "HSA/MSA Distributions (1099-SA)",
            "Box 1 — taxable only for the non-qualified portion; not modeled, recordkeeping only. Schema gap."
          )}
          {NumberField("misc_other_income_usd", "Misc Income (Gambling, Prizes) (USD)", "Form W-2G or other untaxed awards. Schema gap.")}
        </div>
      </div>
    </div>
  );
}
