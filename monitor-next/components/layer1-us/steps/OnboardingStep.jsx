"use client";

import { useMemo } from "react";
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

function ToggleRow({ title, sub, checked, onChange }) {
  return (
    <div className={nestedCard + " flex items-center justify-between"}>
      <div className="flex flex-col pr-3">
        <span className="text-xs font-bold text-head">{title}</span>
        {sub && <span className="text-[9px] text-muted mt-0.5">{sub}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function OnboardingStep() {
  const { usState, setField, addRow, removeRow, updateRow } = useUsLayer1Store();
  const setup = useOnboardingSetup();
  const profile = usState.profile;
  // Residency status is always fresh here regardless of step order — see
  // lib/layer1-us/derive.js's applyDerivations(), called by store.js after
  // every mutation.
  const isNra = usState.us_residency_detail.final_us_residency_status === "NON_RESIDENT_ALIEN";
  const {
    setupW2, setupBiz, setupProp, setupRetirement, setupEquity,
    setupPassiveAny, setupForeignAny, setFlag,
    setupForeignAssets: foreignAssets, setupForeignFeie: foreignFeie,
    setupForeignEntities: foreignEntities, setupForeignGifts: foreignGifts,
    setupPassiveIntDiv: passiveIntDiv, setupPassiveCapGains: passiveCapGains,
  } = setup;
  // BUG FIX: these 6 nested flags used to be local useState, invisible
  // outside this component — the sidebar's per-step visibility (which
  // steps show inside the "International"/"Investments" phase groups,
  // layer1_us.html:6309-6314's toggleBtn calls) and machine.js's guards
  // need to read them too, so they now live in the same shared
  // useOnboardingSetup store as the 7 top-level flags (see store.js).
  const setForeignAssets = (v) => setFlag("setupForeignAssets", v);
  const setForeignFeie = (v) => setFlag("setupForeignFeie", v);
  const setForeignEntities = (v) => setFlag("setupForeignEntities", v);
  const setForeignGifts = (v) => setFlag("setupForeignGifts", v);
  const setPassiveIntDiv = (v) => setFlag("setupPassiveIntDiv", v);
  const setPassiveCapGains = (v) => setFlag("setupPassiveCapGains", v);

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

  // ── Filing status / SSN / dependents / Trump Accounts handlers (moved
  // from ProfileStep.jsx during the chrome/structure verification pass —
  // this content is on the Onboarding "Financial Life Snapshot" screen in
  // the real source, layer1_us.html:673-772, not on the Residency step). ──
  function handleFilingStatusChange(newVal) {
    if (isNra) {
      const mfjUnlocked =
        usState.us_residency_detail.s6013g_joint_election === true ||
        usState.nra_specific?.s6013h_joint_election === true;
      const forbidden = newVal === "hoh" || newVal === "qss" || (newVal === "mfj" && !mfjUnlocked);
      if (forbidden) return; // reject — leave select at its current value
    }
    setField("profile.filing_status", newVal);
  }

  // spouse-is-us-person gating (applySpouseUsPersonGating @ layer1_us.html:9545)
  const spouseGateEnabled = ["mfj", "mfs", "hoh"].includes(profile.filing_status) || isNra;

  function addTrumpChild() {
    addRow("profile.trump_accounts_children", { contribution_usd: 0, born_2025_2028: false });
  }
  function removeTrumpChild(i) {
    removeRow("profile.trump_accounts_children", i);
    syncTrumpDerived(profile.trump_accounts_children.filter((_, idx) => idx !== i));
  }
  function updateTrumpChild(i, patch) {
    updateRow("profile.trump_accounts_children", i, patch);
    const next = profile.trump_accounts_children.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    syncTrumpDerived(next);
  }
  // Keeps the legacy aggregate fields derived from the per-child array
  // (syncTrumpChildrenDerived @ layer1_us.html:6976).
  function syncTrumpDerived(list) {
    setField("profile.trump_accounts_num_children", list.length);
    setField("profile.trump_accounts_children_born_2025_2028", list.filter((c) => c.born_2025_2028).length);
    setField("profile.trump_accounts_total_contributions_usd", list.reduce((sum, c) => sum + (c.contribution_usd || 0), 0));
  }

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
        <div className="flex flex-col gap-4">
          <div>
            <label className={label}>Filing Status</label>
            <select className={selectCls} value={profile.filing_status}
              onChange={(e) => handleFilingStatusChange(e.target.value)}>
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly (MFJ)</option>
              <option value="mfs">Married Filing Separately (MFS)</option>
              <option value="hoh">Head of Household (HOH)</option>
              <option value="qss">Qualifying Surviving Spouse (QSS)</option>
            </select>
            {isNra && (
              <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
                <span className="text-amber-400 text-sm mt-0.5 shrink-0">⚠️</span>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">NRA Filing Restriction Active</span>
                  <span className="text-[9px] text-amber-200/70 leading-relaxed">
                    As a <strong>Non-Resident Alien</strong>, you may only file as <strong>Single</strong> or <strong>MFS</strong>. Filing Jointly (MFJ) requires a special IRS election to treat your spouse as a US resident for tax purposes. HOH &amp; QSS are unavailable to NRAs.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={label}>Taxpayer ID Type</label>
            <select className={selectCls} value={profile.ssn_or_itin_type}
              onChange={(e) => setField("profile.ssn_or_itin_type", e.target.value)}>
              <option value="none">None (Requires ITIN Form W-7 / ATIN Form W-7A)</option>
              <option value="ssn">SSN (Social Security Number)</option>
              <option value="itin">ITIN (Individual Taxpayer ID)</option>
              <option value="atin">ATIN (Adoption Taxpayer ID)</option>
            </select>
          </div>
          {profile.ssn_or_itin_type !== "none" && (
            <div>
              <label className={label}>SSN, ITIN or ATIN Number</label>
              <input type="text" className={input + " font-mono"} placeholder="000-00-0000"
                value={profile.ssn_or_itin || ""} onChange={(e) => setField("profile.ssn_or_itin", e.target.value)} />
            </div>
          )}
          <div>
            <label className={label}>Dependents Count</label>
            <input type="text" inputMode="numeric" className={input + " font-mono"} placeholder="0"
              value={profile.dependents_count ?? 0}
              onChange={(e) => setField("profile.dependents_count", parseInt(e.target.value, 10) || 0)} />

            <ToggleRow title="Sharing dependents with an ex-spouse?"
              sub="Are you releasing or claiming a child tax benefit using a formal agreement (like Form 8332)?"
              checked={!!profile.form_8332_active}
              onChange={(v) => setField("profile.form_8332_active", v)} />
          </div>

          {spouseGateEnabled && (
            <ToggleRow title="Spouse is a US Person?" sub="Determines election eligibility for joint filing."
              checked={!!profile.spouse_is_us_person} onChange={(v) => setField("profile.spouse_is_us_person", v)} />
          )}

          {/* ── Trump Accounts (§530A) repeatable child rows (addTrumpChildRow @ layer1_us.html:6947) ── */}
          <div className={nestedCard + " flex flex-col gap-3 border-brandGreen/20"}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-head">Trump Accounts (§530A) Opened?</span>
                <span className="text-[9px] text-brandGreen/70">Did you establish Family Tax Accounts for any dependents?</span>
              </div>
              <Toggle checked={!!profile.trump_accounts_opened}
                onChange={(v) => setField("profile.trump_accounts_opened", v)} />
            </div>
            {profile.trump_accounts_opened && (
              <div className="flex flex-col gap-3 mt-1">
                <div className="p-2.5 rounded-lg bg-brandGreen/5 border border-brandGreen/15 text-[9px] text-muted leading-relaxed">
                  The $5,000/year contribution cap applies <strong>per child</strong> (combined across all contributors), not as a family-wide total. Enter each child&apos;s account separately. A $1,000 one-time federal seed applies automatically for children born 2025-2028, separate from this cap.
                </div>
                <div className="flex flex-col gap-2">
                  {(profile.trump_accounts_children || []).map((child, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 bg-black/20 border border-line rounded-xl">
                      <span className="text-[9px] font-black text-muted w-14 shrink-0">Child {i + 1}</span>
                      <input type="text" inputMode="numeric" placeholder="Contribution this year (USD)"
                        className={input + " font-mono py-1.5"}
                        value={child.contribution_usd || ""}
                        onChange={(e) => updateTrumpChild(i, { contribution_usd: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })} />
                      <label className="flex items-center gap-1.5 shrink-0 cursor-pointer" title="Born 2025-2028 — eligible for the $1,000 federal seed">
                        <input type="checkbox" checked={!!child.born_2025_2028}
                          onChange={(e) => updateTrumpChild(i, { born_2025_2028: e.target.checked })}
                          className="rounded bg-black/50 border-white/20 text-brandGreen focus:ring-0" />
                        <span className="text-[8px] text-brandGreen/70 uppercase tracking-wider">Born<br />&apos;25-&apos;28</span>
                      </label>
                      <button type="button" onClick={() => removeTrumpChild(i)} className="text-red-400/50 hover:text-red-400 font-bold px-1 shrink-0">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addTrumpChild}
                  className="self-start px-3 py-1.5 bg-white/5 hover:bg-brandGreen/20 hover:text-brandGreen text-muted text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">
                  + Add Child
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Corporate profile fields (layer1_us.html:775-819) ──
        // BUG FIX (field-path collision, found by the step-by-step map
        // audit): the source wires every one of these 7 inputs through
        // updateProfileField(field, val), i.e. `usState.profile[field] =
        // val` (layer1_us.html:775-819 + the function's own definition) —
        // ALL 7 write to `profile.*`, not `corporate_profile.*`.
        // `corporate_profile` as a schema section is entirely dead in the
        // source; nothing ever writes to it. This component previously got
        // 6 of 7 fields wrong (only state_of_domicile correctly targeted
        // `profile.state_of_domicile`) — corrected below to match the
        // source's actual field paths exactly.
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Entity Name</label>
              <input type="text" className={input} placeholder="Acme Corp"
                value={usState.profile.entity_name || ""}
                onChange={(e) => setField("profile.entity_name", e.target.value)} />
            </div>
            <div>
              <label className={label}>EIN (Employer ID)</label>
              <input type="text" className={input + " font-mono"} placeholder="XX-XXXXXXX"
                value={usState.profile.ein || ""}
                onChange={(e) => setField("profile.ein", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Date of Incorporation</label>
              <input type="date" className={input}
                value={usState.profile.date_of_incorporation || ""}
                onChange={(e) => setField("profile.date_of_incorporation", e.target.value)} />
            </div>
            <div>
              <label className={label}>State of Domicile</label>
              <input type="text" className={input} placeholder="e.g. Delaware"
                value={usState.profile.state_of_domicile || ""}
                onChange={(e) => setField("profile.state_of_domicile", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>NAICS Code</label>
            <input type="text" className={input + " font-mono"} placeholder="e.g. 541511 (Custom Computer Programming)"
              value={usState.profile.naics_code || ""}
              onChange={(e) => setField("profile.naics_code", e.target.value)} />
          </div>
          <div className={nestedCard + " flex flex-col gap-3 border-brandGreen/20"}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0 bg-white/[0.03] border-line rounded text-brandGreen focus:ring-brandGreen"
                checked={!!usState.profile.is_foreign_corporation}
                onChange={(e) => setField("profile.is_foreign_corporation", e.target.checked)} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-head">Is this a Foreign Corporation?</span>
                <span className="text-[10px] text-muted">Check this if the entity is incorporated outside the US and is filing Form 1120-F.</span>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 shrink-0 bg-white/[0.03] border-line rounded text-brandGreen focus:ring-brandGreen"
                checked={!!usState.profile.is_foreign_owned_25_pct}
                onChange={(e) => setField("profile.is_foreign_owned_25_pct", e.target.checked)} />
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

      {/* BUG FIX (found by the step-by-step map audit): the source has
          exactly ONE intake-confirm control for this screen — "Initialize
          Matrix" (layer1_us.html:973-977), which calls
          confirmIntakeAndProceed() (layer1_us.html:6477-6482): sets
          usState.metadata.intake_completed = true, then navigates to the
          Residency step. This file previously rendered its own inline copy
          of that button here, but its onClick only set the flag — no
          navigation — while page.jsx's step-onboarding-only footer button
          ("Start Intake →") already dispatches CONFIRM_INTAKE and
          correctly navigates, making it the real, working equivalent (the
          source's other steps all use this same "action button in the
          generic footer" pattern too — Onboarding's inline button was the
          odd one out, not a second real control). A user was shown two
          buttons for one action, one of which silently did nothing. Fixed
          by removing the dead duplicate here; machine.js's CONFIRM_INTAKE
          handler was also fixed separately to actually write
          metadata.intake_completed (it previously only updated an
          XState-internal context flag, never the real schema field). */}
    </div>
  );
}
