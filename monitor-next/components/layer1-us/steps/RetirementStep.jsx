"use client";

import { useUsLayer1Store } from "../../../lib/layer1-us/store";

// Ported from layer1_us.html's `panel-step-retirement`
// (layer1_us.html:3163-3270). All fields map 1:1 onto
// `usState.retirement_accounts`, which already exists in full in schema.js
// — no schema gap here (unlike IncomeUsStep's W-2 array).
//
// SIMPLIFIED: the original panel's "SECURE Act 2.0 RMD Calculator" summary
// card (layer1_us.html:3248-3264, `#lbl-rmd-req` / `#lbl-rmd-amt`) is an
// auto-derived read-only display fed by a recalculation pass elsewhere in
// the vanilla-JS file (age vs. RMD start age, prior-year-end account
// balance, IRS Uniform Lifetime Table divisor) that isn't reachable from
// this component in isolation. This port keeps `rmd_required` /
// `rmd_amount_usd` as plain editable fields instead of a derived display.

const num = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
};

function Card({ title, children, accent }) {
  return (
    <section className={`rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-4${accent ? " border-l-2 border-l-brandGreen" : ""}`}>
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">{title}</span>
      {children}
    </section>
  );
}

function LabeledNumber({ label, hint, value, onChange, placeholder = "0" }) {
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
        onChange={(e) => onChange(num(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none focus:border-brandGreen/50"
      />
    </div>
  );
}

function LabeledSelect({ label, hint, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
        {label}
        {hint ? (
          <span className="block text-[10px] normal-case tracking-normal text-muted/70 font-normal mt-0.5">{hint}</span>
        ) : null}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50"
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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

function ExposureBadge({ tone, children }) {
  const palette = {
    red: "bg-red-500/10 text-red-400 border-red-500/30",
    gold: "bg-amber-400/10 text-amber-300 border-amber-400/30",
    neutral: "bg-white/5 text-muted border-line",
  };
  return (
    <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-semibold ${palette[tone] || palette.neutral}`}>
      {children}
    </span>
  );
}

// 2026 contribution-limit figures (IRS Notice 2025-67 / Rev. Proc. 2025-19),
// mirrored from dag_py/src/wising_dag/us/us5_penalty_72t.py's
// ELECTIVE_DEFERRAL_LIMIT / IRA_CONTRIBUTION_LIMIT / HSA_CONTRIBUTION_LIMIT
// field definitions — inline helper text only, not enforced/validated here.
const LIMIT_402G = "2026 §402(g) elective deferral limit: $24,500 base + $8,000 catch-up (age 50-59 or 64+) + $11,250 SECURE 2.0 super catch-up (age 60-63).";
const LIMIT_IRA = "2026 IRA contribution limit: $7,500 base + $1,100 catch-up (age 50+) = $8,600.";
const LIMIT_HSA = "2026 §223 HSA limit: $4,400 self-only / $8,750 family, + $1,000 catch-up (age 55+).";

export default function RetirementStep() {
  const { usState, setField } = useUsLayer1Store();
  const ret = usState.retirement_accounts;
  const set = (field, value) => setField(`retirement_accounts.${field}`, value);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display font-bold text-head">Retirement Accounts</h2>
        <p className="text-sm text-muted mt-1">
          US retirement contributions, employer-plan details, RMD status, and Indian retirement instruments held
          for US reporting purposes.
        </p>
      </div>

      {/* US Retirement & Savings Contributions */}
      <Card title="US Retirement & Savings Contributions" accent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledNumber
            label="Traditional IRA (USD)"
            hint={LIMIT_IRA}
            value={ret.traditional_ira_contribution_usd}
            onChange={(v) => set("traditional_ira_contribution_usd", v)}
          />
          <LabeledNumber
            label="Roth IRA (USD)"
            hint={`${LIMIT_IRA} Shared with the Traditional IRA limit across both account types.`}
            value={ret.roth_ira_contribution_usd}
            onChange={(v) => set("roth_ira_contribution_usd", v)}
          />
          <div className="flex items-center">
            <CheckRow checked={ret.backdoor_roth_executed} onChange={(v) => set("backdoor_roth_executed", v)} label="Backdoor Roth Executed?" sublabel="Nondeductible traditional IRA contribution converted to Roth" />
          </div>

          <LabeledNumber
            label="401(k) Employee Contribution (USD)"
            hint={LIMIT_402G}
            value={ret["401k_employee_contribution_usd"]}
            onChange={(v) => set("401k_employee_contribution_usd", v)}
          />
          <LabeledNumber
            label="401(k) Employer Match (USD)"
            hint="Not counted against the employee §402(g) elective-deferral limit."
            value={ret["401k_employer_match_usd"]}
            onChange={(v) => set("401k_employer_match_usd", v)}
          />
          <LabeledNumber
            label="Roth 401(k) Contribution (USD)"
            hint={`${LIMIT_402G} Shares the same aggregate limit as the pre-tax 401(k) employee contribution.`}
            value={ret.roth_401k_contribution_usd}
            onChange={(v) => set("roth_401k_contribution_usd", v)}
          />

          <LabeledNumber label="HSA Contributions (USD)" hint={LIMIT_HSA} value={ret.hsa_contribution_usd} onChange={(v) => set("hsa_contribution_usd", v)} />
          <LabeledSelect
            label="HDHP Coverage Type (§223 HSA limit)"
            value={ret.hsa_coverage_type}
            onChange={(v) => set("hsa_coverage_type", v)}
            options={[
              { value: "self_only", label: "Self-only" },
              { value: "family", label: "Family" },
            ]}
          />
          <LabeledNumber label="Solo 401(k) (USD)" hint="Combined employee + employer contribution for self-employed filers." value={ret.solo_401k_contribution_usd} onChange={(v) => set("solo_401k_contribution_usd", v)} />

          <LabeledNumber label="SEP IRA (USD)" hint="Lesser of 25% of net SE earnings or the annual SEP limit." value={ret.sep_ira_contribution_usd} onChange={(v) => set("sep_ira_contribution_usd", v)} />
        </div>
      </Card>

      {/* RMD */}
      <Card title="Required Minimum Distributions (RMD)">
        <div className="flex flex-col gap-3">
          <CheckRow checked={ret.rmd_required} onChange={(v) => set("rmd_required", v)} label="RMD Required This Year?" sublabel="SECURE 2.0 Act — required beginning age depends on birth year" />
          {ret.rmd_required ? (
            <LabeledNumber label="RMD Amount (USD)" value={ret.rmd_amount_usd} onChange={(v) => set("rmd_amount_usd", v)} />
          ) : null}
        </div>
      </Card>

      {/* Indian Retirement Accounts */}
      <Card title="Indian Retirement Accounts (for US Reporting)">
        <p className="text-xs text-muted -mt-1">
          Cross-border India/US instruments with distinct US tax treatment — reported here for FBAR/FATCA and trust
          classification purposes, not as US-deductible retirement contributions.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
              <span>Indian EPF Balance (USD)</span>
              <ExposureBadge tone="red">No Deferral</ExposureBadge>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={ret.indian_epf_balance_usd === null || ret.indian_epf_balance_usd === undefined ? "" : ret.indian_epf_balance_usd}
              onChange={(e) => set("indian_epf_balance_usd", num(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none focus:border-brandGreen/50"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
              <span>Indian PPF Balance (USD)</span>
              <ExposureBadge tone="gold">Trust Review</ExposureBadge>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={ret.indian_ppf_balance_usd === null || ret.indian_ppf_balance_usd === undefined ? "" : ret.indian_ppf_balance_usd}
              onChange={(e) => set("indian_ppf_balance_usd", num(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none focus:border-brandGreen/50"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
              <span>Indian NPS Balance (USD)</span>
              <ExposureBadge tone="neutral">Filing Flag</ExposureBadge>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={ret.indian_nps_balance_usd === null || ret.indian_nps_balance_usd === undefined ? "" : ret.indian_nps_balance_usd}
              onChange={(e) => set("indian_nps_balance_usd", num(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none focus:border-brandGreen/50"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
