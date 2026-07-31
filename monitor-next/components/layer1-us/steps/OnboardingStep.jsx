"use client";

import { useMemo, useState } from "react";
import { useUsLayer1Store, useOnboardingSetup } from "@/lib/layer1-us/store";

// ── styling helpers (matches the dark-theme Tailwind conventions used
// elsewhere in this app — see components/Views.jsx) ─────────────────────────
const card = "rounded-2xl bg-surface border border-line shadow-card p-4";
const nestedCard = "rounded-2xl bg-white/[0.02] border border-line p-4";
const label = "block text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5";
const input =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";
const selectCls = input + " appearance-none";

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={"relative inline-flex items-center shrink-0 " + (disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}>
      <input type="checkbox" className="sr-only peer" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brandGreen" />
    </label>
  );
}

// ── calculateComplexity() — ported from layer1_us.html:6343-6386. The
// original reads 11 checkbox DOM nodes directly (5 top-level "direct" cards +
// 6 nested items under the International/Investments cards) and maps the
// selected-count to a 0-5 meter level with a quirky, non-linear threshold
// table — ported verbatim rather than "fixed", since downstream nothing
// depends on this beyond the visual meter.
function calculateComplexity(checks) {
  const selectedCount = checks.filter(Boolean).length;
  let meterLevel = 0;
  if (selectedCount >= 1) meterLevel = 1;
  if (selectedCount >= 3) meterLevel = 2;
  if (selectedCount >= 4) meterLevel = 3;
  if (selectedCount >= 6) meterLevel = 4;
  if (selectedCount === 8) meterLevel = 5;
  return meterLevel;
}

const METER_COLORS = ["bg-emerald-500", "bg-brandGreen", "bg-amber-400", "bg-orange-500", "bg-pink-500"];

function ComplexityMeter({ level }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-brandGreen">Estimated Complexity</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={"w-8 h-1.5 rounded-full transition-colors duration-500 " + (i < level ? METER_COLORS[level - 1] : "bg-white/10")} />
        ))}
      </div>
    </div>
  );
}

// A "setup card" — the big clickable scope-selection tiles at the top of the
// step (layer1_us.html:830-968, toggleSetupCard @ 6318).
function SetupCard({ emoji, title, desc, active, onClick, children }) {
  return (
    <div
      onClick={onClick}
      className={
        "flex flex-col gap-3 p-5 rounded-2xl cursor-pointer transition-all duration-300 border " +
        (active ? "border-brandGreen/40 bg-brandGreen/5" : "border-line bg-white/[0.02] hover:bg-white/[0.05]")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">{emoji}</span>
        <div className={"w-4 h-4 rounded-full border flex items-center justify-center transition-colors " + (active ? "bg-brandGreen border-brandGreen" : "border-white/20")}>
          {active && (
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-head uppercase tracking-widest">{title}</span>
        <span className="text-[9px] text-muted leading-relaxed">{desc}</span>
      </div>
      {children}
    </div>
  );
}

function NestedCheck({ checked, onChange, text }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-colors" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="w-3 h-3 bg-black/50 border border-white/20 rounded accent-brandGreen focus:ring-0 cursor-pointer" />
      <span className="text-[9px] text-body">{text}</span>
    </label>
  );
}

export default function OnboardingStep() {
  const { usState, setField } = useUsLayer1Store();
  const setup = useOnboardingSetup();
  const {
    setupW2, setupBiz, setupProp, setupRetirement, setupEquity,
    setupPassiveAny, setupForeignAny, setFlag,
  } = setup;

  // The nested checkboxes under the "International" and "Investments" cards
  // aren't part of the 7-flag onboarding-setup store slice (they roll up
  // into setupForeignAny / setupPassiveAny), so they live as local UI state
  // here — same treatment the original gives them (DOM-only, never
  // persisted to usState or localStorage).
  const [foreignAssets, setForeignAssets] = useState(false);
  const [foreignFeie, setForeignFeie] = useState(false);
  const [foreignEntities, setForeignEntities] = useState(false);
  const [foreignGifts, setForeignGifts] = useState(false);
  const [passiveIntDiv, setPassiveIntDiv] = useState(false);
  const [passiveCapGains, setPassiveCapGains] = useState(false);

  const entityType = usState.profile.tax_entity_type || "individual";
  const llcElection = usState.profile.llc_tax_election || "individual";
  const effectiveType = entityType === "llc" ? llcElection : entityType;
  const isIndividual = ["individual", "sole_prop", "farming"].includes(effectiveType);

  const meterLevel = useMemo(
    () =>
      calculateComplexity([
        setupW2, setupBiz, setupProp, setupRetirement, setupEquity,
        passiveIntDiv, passiveCapGains, foreignAssets, foreignFeie, foreignEntities, foreignGifts,
      ]),
    [setupW2, setupBiz, setupProp, setupRetirement, setupEquity, passiveIntDiv, passiveCapGains, foreignAssets, foreignFeie, foreignEntities, foreignGifts]
  );

  function toggleForeign(next) {
    setFlag("setupForeignAny", next);
    if (!next) {
      setForeignAssets(false);
      setForeignFeie(false);
      setForeignEntities(false);
      setForeignGifts(false);
    }
  }
  function togglePassive(next) {
    setFlag("setupPassiveAny", next);
    if (!next) {
      setPassiveIntDiv(false);
      setPassiveCapGains(false);
    }
  }

  return (
    <div className={card + " flex flex-col gap-8"}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-head tracking-wide uppercase">Financial Life Snapshot</h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Select all scopes that apply to generate your personalized intake matrix. This dynamic matrix will prune irrelevant forms and calculate your estimated tax complexity.
          </p>
        </div>
        <ComplexityMeter level={meterLevel} />
      </div>

      {/* ── Tax Entity Type (layer1_us.html:648-819, updateTaxEntityLogic @ 7059) ── */}
      <div className="flex flex-col gap-1.5">
        <label className={label}>Your Tax Entity Type</label>
        <select
          className={selectCls + " border-brandGreen/40 text-brandGreen font-bold"}
          value={entityType}
          onChange={(e) => setField("profile.tax_entity_type", e.target.value)}
        >
          <option value="individual">Individual / Sole Proprietor (Form 1040)</option>
          <option value="partnership">Multi-Member LLC / Partnership (Form 1065)</option>
          <option value="scorp">S-Corporation (Form 1120-S)</option>
          <option value="ccorp">C-Corporation (Form 1120)</option>
          <option value="trust">Fiduciary Trust / Estate (Form 1041)</option>
          <option value="llc">Limited Liability Company (LLC)</option>
        </select>
        {entityType === "llc" && (
          <div className="flex flex-col gap-1.5 mt-2">
            <label className={label}>LLC IRS Tax Classification Election</label>
            <select
              className={selectCls + " border-brandGreen/40 text-brandGreen font-bold"}
              value={llcElection}
              onChange={(e) => setField("profile.llc_tax_election", e.target.value)}
            >
              <option value="individual">Single-Member LLC / Disregarded Entity (Form 1040)</option>
              <option value="partnership">Multi-Member LLC / Partnership (Form 1065)</option>
              <option value="scorp">S-Corporation Election (Form 1120-S)</option>
              <option value="ccorp">C-Corporation Election (Form 1120)</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Individual-only quick profile fields (layer1_us.html:671-773) ── */}
      {isIndividual ? (
        // Filing status, taxpayer-ID, dependents & Trump-account fields
        // (layer1_us.html:673-772) are rendered in the Profile & Residency
        // step (ProfileStep.jsx) per this port's step assignment — kept out
        // of this panel to avoid a duplicate editable copy of the same
        // schema fields across two components.
        <div className={nestedCard + " text-[10px] text-muted"}>
          Filing status, Taxpayer ID, dependents, and Trump Accounts (§530A) are configured in the next step — <span className="text-body font-semibold">Profile &amp; Residency</span>.
        </div>
      ) : (
        // ── Corporate profile fields (layer1_us.html:775-819) ──
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Entity Name</label>
              <input type="text" className={input} placeholder="Acme Corp"
                value={usState.corporate_profile.entity_name || ""}
                onChange={(e) => setField("corporate_profile.entity_name", e.target.value)} />
            </div>
            <div>
              <label className={label}>EIN (Employer ID)</label>
              <input type="text" className={input + " font-mono"} placeholder="XX-XXXXXXX"
                value={usState.corporate_profile.ein || ""}
                onChange={(e) => setField("corporate_profile.ein", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Date of Incorporation</label>
              <input type="date" className={input}
                value={usState.corporate_profile.date_of_incorporation || ""}
                onChange={(e) => setField("corporate_profile.date_of_incorporation", e.target.value)} />
            </div>
            <div>
              <label className={label}>State of Domicile</label>
              <input type="text" className={input} placeholder="e.g. Delaware"
                value={usState.corporate_profile.state_of_domicile || ""}
                onChange={(e) => setField("corporate_profile.state_of_domicile", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>NAICS Code</label>
            <input type="text" className={input + " font-mono"} placeholder="e.g. 541511 (Custom Computer Programming)"
              value={usState.corporate_profile.naics_code || ""}
              onChange={(e) => setField("corporate_profile.naics_code", e.target.value)} />
          </div>
          <div className={nestedCard + " flex flex-col gap-3 border-brandGreen/20"}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0 bg-white/[0.03] border-line rounded text-brandGreen focus:ring-brandGreen"
                checked={!!usState.corporate_profile.is_foreign_corporation}
                onChange={(e) => setField("corporate_profile.is_foreign_corporation", e.target.checked)} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-head">Is this a Foreign Corporation?</span>
                <span className="text-[10px] text-muted">Check this if the entity is incorporated outside the US and is filing Form 1120-F.</span>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0 bg-white/[0.03] border-line rounded text-brandGreen focus:ring-brandGreen"
                checked={!!usState.corporate_profile.is_foreign_owned_25_pct}
                onChange={(e) => setField("corporate_profile.is_foreign_owned_25_pct", e.target.checked)} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-head">Is this entity 25% or more owned by a foreign person?</span>
                <span className="text-[10px] text-muted">Required for Form 5472 compliance (Inbound Foreign Ownership).</span>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* ── Setup scope cards (layer1_us.html:825-971) ── */}
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-3 border-b border-line pb-2">The Basics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isIndividual && (
              <SetupCard emoji="💼" title="Employment" desc="W-2 Wages or Foreign Salaries." active={setupW2}
                onClick={() => setFlag("setupW2", !setupW2)} />
            )}
            <SetupCard emoji="🌍" title="International" desc="Non-US bank accounts, living abroad, or receiving foreign money." active={setupForeignAny}
              onClick={() => toggleForeign(!setupForeignAny)}>
              {setupForeignAny && (
                <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-line">
                  <NestedCheck checked={foreignAssets} onChange={setForeignAssets} text="Foreign Bank Accounts or Financial Assets" />
                  {isIndividual && (
                    <NestedCheck checked={foreignFeie} onChange={setForeignFeie} text="Lived or worked outside the US" />
                  )}
                  <NestedCheck checked={foreignEntities} onChange={setForeignEntities} text="Own a foreign company or trust" />
                  <NestedCheck checked={foreignGifts} onChange={setForeignGifts} text="Received foreign gift (Any Amount)" />
                </div>
              )}
            </SetupCard>
            {isIndividual && (
              <SetupCard emoji="🏦" title="Retirement" desc="401(k), IRA, EPF/PPF contributions & distros." active={setupRetirement}
                onClick={() => setFlag("setupRetirement", !setupRetirement)} />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-3 border-b border-line pb-2">Business & Income</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SetupCard emoji="🏢" title="Business Ops" desc="C-Corps, S-Corps, LLCs, Sole Proprietors." active={setupBiz}
              onClick={() => setFlag("setupBiz", !setupBiz)} />
            <SetupCard emoji="🏠" title="Real Estate" desc="Rental properties, depreciation, sales." active={setupProp}
              onClick={() => setFlag("setupProp", !setupProp)} />
          </div>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-3 border-b border-line pb-2">Wealth</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SetupCard emoji="📈" title="Investments" desc="Interest from banks, stock dividends, and sales of crypto or shares." active={setupPassiveAny}
              onClick={() => togglePassive(!setupPassiveAny)}>
              {setupPassiveAny && (
                <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-line">
                  <NestedCheck checked={passiveIntDiv} onChange={setPassiveIntDiv} text="Interest, dividends, royalties, or other investments" />
                  <NestedCheck checked={passiveCapGains} onChange={setPassiveCapGains} text="Sold stocks, mutual funds, or crypto" />
                </div>
              )}
            </SetupCard>
            <SetupCard emoji="💰" title="Equity & Cap Table" desc="RSUs, ESPP, ISOs, Section 409A issuance." active={setupEquity}
              onClick={() => setFlag("setupEquity", !setupEquity)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-2 pt-6 border-t border-line">
        <button
          onClick={() => setField("metadata.intake_completed", true)}
          className="px-8 py-3 bg-brandGreen text-black font-black uppercase text-xs tracking-[0.2em] rounded-xl hover:brightness-110 transition-all duration-300 flex items-center gap-3"
        >
          Initialize Matrix
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
