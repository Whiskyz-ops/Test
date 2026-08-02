# US Layer 1: step-by-step HTML ↔ React map

A walkable, one-step-at-a-time checklist, in the wizard's own order. Each
entry gives the exact `layer1_us.html` panel range and the corresponding
React file, then lists every known behavior/functionality difference for
that step.

**Provenance tags on each item:**
- `[VERIFIED]` — read directly, this session, against both the live
  `layer1_us.html` source and the current React file/DAG consumer. Not
  inherited from a prior claim.
- `[FROM AUDIT]` — from the 11-agent `LAYER1_US_HTML_REACT_FIELD_AUDIT.md`
  pass, not personally re-checked this session. Every `[FROM AUDIT]` item
  spot-checked so far turned out accurate (zero contradictions across ~15
  direct re-checks) — treat as high-confidence, not unverified.
- `[FIXED]` — confirmed resolved.
- `[NOT YET AUDITED]` — no pass (agent or manual) has gone through this
  step's HTML markup line-by-line yet. Presence of "no known issues" here
  means exactly that, not "confirmed clean."

This is a reorganization of `LAYER1_US_HTML_REACT_FIELD_AUDIT.md`'s Tier
0-2 findings by step, plus fresh direct verification done in the JSON-export
reconciliation pass, not a replacement for it — see that doc for the full
Tier 3 (cosmetic) list and per-agent detail.

---

## 1. Onboarding — `layer1_us.html:628-982` → `OnboardingStep.jsx`

- `[FIXED]` Setup-gate flags (setupW2/setupBiz/etc.) never hydrated from
  real data on reload — `derive.js` gained `deriveSetupFlags()`,
  `store.js`'s `useOnboardingSetup` gained `hydrateFromUsState()`.
- `[FROM AUDIT]` "Initialize Matrix" button doesn't navigate anywhere.
- `[FROM AUDIT]` A whole HOH/QSS filing-status diagnostic sub-feature is
  absent.
- `[FROM AUDIT]` Identity/Corporate-Formation upload dropzone missing.
- `[FROM AUDIT]` §6013(g) election box and NRA option-disabling/relabeling
  are unconditional/static instead of gated — gives actively wrong
  messaging once MFJ is unlocked via election.
- `[FROM AUDIT]` "Confirm intake & proceed" is split into two disconnected
  code paths (one persists state but doesn't navigate, one navigates but
  doesn't persist completion) — source is one function doing both.
- `[VERIFIED]` `metadata.intake_setup` (added to schema.js last pass) has
  zero reader/writer anywhere in `store.js` or `OnboardingStep.jsx` —
  schema shape only.
- `[VERIFIED]` `profile.hoh_marital_override` (added to schema.js last
  pass) has no UI control anywhere.

## 2. Residency — `layer1_us.html:983-1430` → `ProfileStep.jsx`

- `[FROM AUDIT]` Dual-status arrival/departure date fields missing from UI.
- `[FROM AUDIT]` SPT "excluded days" fields missing from UI (acknowledged
  in `derive.js`'s own comments).
- `[VERIFIED]` Even though `dual_status_arrival_date`/
  `dual_status_departure_date`/`us_days_excluded_*` now exist in
  `schema.js` (added last pass), `evaluateResidencyLock()` in `derive.js`
  still doesn't read them — its own inline comments are now stale (say
  the fields "aren't in the canonical schema"). Practical effect:
  `DUAL_STATUS` is only reachable via green-card-surrender or
  first-year-choice, never via the plain SPT pass-through path the source
  supports.
- `[FROM AUDIT]` No Back/Next bar on this step at all.

## 3. State Nexus — `layer1_us.html:1431-1710` → `StateStep.jsx`

- `[VERIFIED]` Community Property alert (`alert-community-property`),
  "Derived State Residency Statuses" summary card
  (`card-state-status-summary`/`renderStateResidencyStatus()`), the CA
  section's dynamic warning alerts (`alert-ca-depart`/`alert-ca-retain` —
  React has the two checkboxes but not the conditional guidance text they
  reveal), the military "MSRRA Tax Protection Active" guidance box
  (`div-mil-guidance`, with its DD 2058/Form DE-4/IT-2104-MS specifics),
  and the corp "State of Formation" readonly field
  (`corp-state-domicile-readonly`) are all confirmed missing from
  `StateStep.jsx` — none render anywhere in the file.
- `[VERIFIED]` The CA card (`div-ca-fields`) is gated in the source —
  `toggleStateSpecificFields()` (`layer1_us.html:8611-8620`) only shows it
  when `primary_state_of_residence === 'CA'` or `previous_state === 'CA'`.
  React's `StateStep.jsx:231` renders it unconditionally for every
  individual filer (`{!isCorp && (...)`).
- `[VERIFIED — bigger than previously documented]` What the existing audit
  called "statutory-residency day tracker for footprint states" is
  actually a whole sub-engine (`div-footprint-statutory-questions`,
  `updateStickyException()` @ `layer1_us.html:8407-8428`,
  `getStateResidencyInfo()`, `renderStateExceptions()`): per-footprint
  "sticky domicile" states (NY/NJ/CT) get inline follow-up
  questions — a foreign-assignment checkbox, a days-in-state input, and a
  live pass/fail safe-harbor alert (e.g. NY's 548-day foreign-assignment
  rule, ≤90 days in-state) — writing into
  `state_residency.sticky_exceptions.<STATE>.*` and mirroring into the
  flat `ny_548_day_rule` field the DAG reads. None of it exists in
  `StateStep.jsx` — this is the actual UI `ny_548_day_rule`/
  `ny_actual_days_present`/`ny_permanent_place_of_abode`/
  `footprint_details`/`sticky_exceptions` (added to `schema.js` last pass,
  confirmed still zero UI) are missing.
- `[VERIFIED — corrects the existing audit]` There is no `div-ny-fields`
  element anywhere in the source's static markup — `toggleStateSpecificFields()`
  references `document.getElementById('div-ny-fields')` (line 8617) but no
  such element exists, so it always resolves to `null` and silently no-ops.
  This is a dead reference in the source itself (same class as the
  already-known dead `step-k1` reference) — porting a literal "NY fields
  block" would be porting a bug, not a feature. The real NY-specific UI is
  the sticky-exceptions sub-engine above, which lives inside the generic
  per-footprint-state area, not a dedicated NY div.
- `[VERIFIED — root cause identified]` Apportionment matrix drops the
  entity's domicile state: source's `syncApportionmentState()`
  (`layer1_us.html:8886-8889`) builds its state list as `physical_states ∪
  economic_states ∪ {profile.state_of_domicile}` — unconditionally
  including the domicile state read from `profile.state_of_domicile`.
  `StateStep.jsx:83`'s `apportionmentStates` only unions
  `physical_states`/`economic_states`, never reading
  `usState.profile.state_of_domicile` at all.
- `[NEW FINDING]` `onPrimaryStateChange()` (`layer1_us.html:8660-8666`)
  auto-sets `dec_31_domicile_state` to match `primary_state_of_residence`
  the first time it's set (if Dec 31 domicile is still empty).
  `StateStep.jsx`'s `setSr("primary_state_of_residence")` handler is a
  plain `setField` call with no such side effect — a user who fills
  Primary State first never gets Dec 31 Domicile auto-populated.
- `[VERIFIED — reclassified]` `dag_py`/JS-DAG read
  `state_residency.ca_safe_harbor_employment_contract`
  (`dag_py/src/wising_dag/us/findings.py:293`,
  `crossborder/findings.py:334`, `findings-batch3-nodes.js:102`), but this
  field doesn't exist in `layer1_us.html`'s own usState literal either —
  confirmed via direct grep, zero hits in the source. This is a DAG-side
  field with no producer in *either* implementation, not a React-port
  regression against the HTML.
- `[FROM AUDIT]` A dead typo in the source itself (`step-prop` instead of
  `step-real-estate` in one lock check) means the *live* HTML app never
  actually locks Real Estate for corp/partnership filers; React uses the
  correct id and does lock it. Genuine behavioral difference — worth a
  product call on which behavior is "correct," not a one-sided bug.

## 4. Bank Sync & Statements — `layer1_us.html:1711-1790` → `BankSyncStep.jsx`

- `[VERIFIED — solid, no open issues]` The Plaid "Link Bank Account" button
  and the statement-upload dropzone are correctly non-functional UI
  theater in React, matching the source exactly (`openPlaidSimulator` is
  a modal mock with no real integration in the source too; the upload
  dropzone is a plain `alert()` there as well). Bank Name/Account
  Type/Routing/Account Number are correctly local-only, non-persisted
  state — the source's own inputs for these have no `id`/`oninput` at
  all, so they never reach `usState` there either. The one field that
  does write real tax data, "US Bank Interest," correctly mirrors into
  `income_us_source.interest_us_bank_usd` and recomputes
  `interest_us_source_usd` from all 4 interest sub-fields exactly like
  the source's `syncUsInterestTotal()` — and since React reads live
  shared-store state instead of doing the source's manual two-way DOM
  mirroring, it's actually more robust against staleness than the
  original.

## 5. Employment Income — `layer1_us.html:1791-1831` → `IncomeUsStep.jsx`

- `[FROM AUDIT]` `wages_w2` naming bug (was `w2_wages`, invisible to both
  DAG engines) — fixed in an earlier pass, not re-verified this session.
- Self-employment/farming full itemized-expense, vehicle-expense, and
  home-office field coverage: `[NOT YET AUDITED]` at the row-shape level
  (see step-business below for the sibling K-1 arrays, which *are*
  verified broken — self-employment/farming likely share some of the same
  row-shape gaps but this hasn't been directly checked here).
- Several capital-gains flag checkboxes (`has_sec_1256`, `has_qsbs`, etc.)
  are rendered on both this step and `CapGainsStep.jsx` — redundant but
  harmless per earlier verification pass.

## 6. Capital Gains & Crypto — `layer1_us.html:1832-2107` → `CapGainsStep.jsx`

- `[FIXED]` Aggregate computation was inverted (summed the itemized list,
  which the source never does) — now derives from the "Manual Entry
  Totals" 4-field block (`cg_manual_*_usd`), matching
  `recalculateCapitalGainsAggregate()` exactly. Itemized list renamed
  `cg_transactions` (was invented as `capital_gains_transactions`).
- `[FROM AUDIT]` No Upload-1099/Broker-Connect tabs.
- `[VERIFIED]` `qsbs_transactions[]`, `collectibles_transactions[]`, and
  `real_estate_transactions[]` (added to schema.js last pass) have no row
  UI anywhere — schema shape only, confirmed by re-reading the fix commit
  (only `cg_transactions`/`cg_manual_*` got UI, these 3 arrays did not).
  This means real_estate/collectibles/qsbs still cannot feed the
  cross-step capital-gains aggregate even now.

## 7. Passive & Other — `layer1_us.html:2108-2219` → `PassiveStep.jsx`

- `[VERIFIED — solid, all 16 fields present and correctly wired]` Every
  field in the source panel is covered: 4 interest sub-fields (with
  `syncUsInterestTotal()`'s roll-up into `interest_us_source_usd` ported
  verbatim), tax-exempt interest, ordinary/qualified dividends, rental
  income + expenses, and all 8 "Other Income" Schedule 1 lines (state/
  local refund, unemployment, Social Security, alimony, royalties,
  cancellation of debt, HSA/MSA distributions, misc other). Confirmed
  against both DAG engines
  (`dag_py/src/wising_dag/us/aggregate_us_income.py:398-400,424`,
  `monitor-next/lib/dag/aggregateusincome-nodes.js:604-606,635`) that all
  7 fields the component's own comment previously flagged as "schema
  gaps" are read under these exact names — that comment was stale (those
  7 fields were added to `schema.js` in the JSON-export reconciliation
  pass) and has been corrected in the file.
- `[VERIFIED — minor, Tier-3-equivalent gap]` The source's 3 "Upload
  1099s / P&L / Year-Round Statements" buttons (decorative
  `triggerBizUpload()` modal, same non-functional category as Bank
  Sync's Plaid/upload UI) aren't ported. No state impact either way.

## 8. Business Ops & K-1s — `layer1_us.html:2220-2718` → `BusinessStep.jsx`

- `[VERIFIED — MOST SEVERE FINDING IN THE PORT]` K-1 rows
  (`partnerships_k1`/`s_corporations_k1`/`trusts_estates_k1`) store data
  nested under `row.k1_boxes.box1_ordinary_income` etc.; both
  `dag_py/src/wising_dag/us/aggregate_us_income.py` and the JS DAG read
  flat top-level fields (`ordinary_income_usd`, `guaranteed_payments_usd`,
  `sec179_deduction_usd`, `qbi_wages_usd`, etc.) directly off each row.
  Different structure *and* different field names. **Every dollar of
  partnership/S-corp/trust K-1 income silently computes to $0.**
- `[VERIFIED]` A fabricated, always-editable "Taxable Income (Computed)"
  field on Schedule M-1 (`BusinessStep.jsx:1664`) has no source
  counterpart and is read by no DAG code.
- `[FROM AUDIT]` "1099 Filing Obligations" panel (wired into 5 entity
  types in the source) entirely absent.
- `[FROM AUDIT]` "Gross Receipts by State"/economic-nexus apportionment
  (6 entity types) entirely absent.
- `[FROM AUDIT]` §199A QBI/UBIA capture fields at the entity level absent.
- `[FROM AUDIT]` The "$250k receipts" gate that should hide Schedule
  L/M-1/M-2 by default is missing — shown unconditionally instead.
- `[FROM AUDIT]` Most of the "Business Compliance & Tax Analyzer" summary
  panel (5 of 6 metrics, all 5 loss-limitation flags) is missing.
- `[FROM AUDIT]` Schedule C's home-office/vehicle-expense section is
  missing (Farm's equivalent *was* ported).
- `[FROM AUDIT]` `addUsBranchRow` (foreign-parented US branches) not
  ported.
- `[FROM AUDIT]` NAICS/SSTB dropdown has 11 options vs. the source's 25.
- Row-shape gap (not in the Tier list, visible directly from the real
  JSON export): source K-1/self-employment/C-corp rows also carry
  `assets[]` (§179 tables), `branches[]` (multi-location), `state_
  allocations[]`, `forms_1099[]`, and full `partners[]`/`shareholders[]`/
  `beneficiaries[]` rosters — none of this row-level detail exists in
  React yet, independent of the box-nesting fix above.

## 9. Foreign Income — `layer1_us.html:2719-2794` → `IncomeForeignStep.jsx`

- `[FROM AUDIT, "confirmed solid"]` No new issues found in the original
  11-agent pass. Not personally re-verified beyond the item below.
- `[VERIFIED — still open]` The "Other Foreign Tax Credits (Additional
  Countries)" card belongs here per source markup
  (`layer1_us.html:2719` `panel-step-income-foreign` wraps it,
  confirmed by direct line-range check) but is still rendered on
  `FtcStep.jsx` instead — `IncomeForeignStep.jsx` only has a comment
  acknowledging the misplacement, no actual UI.

## 10. Equity & Cap Table — `layer1_us.html:2795-2865` → `EquityStep.jsx`

- `[VERIFIED]` ISO/NSO/RSU/ESPP/§83(b) persistence all present and
  correctly wired (`amt_preference_spread_usd`, `ordinary_income_
  recognized_usd`, `gross_income_usd`, `capital_gain_loss_usd`,
  `filing_deadline_date`/`filed_within_30_days` all found with real
  compute + write-back). No open issues found.

## 11. FEIE (Form 2555) — `layer1_us.html:2866-3079` → `FeieStep.jsx`

- `[VERIFIED — still open]` `housing_exclusion_base_usd`/
  `housing_exclusion_cap_usd` are fixed IRS statutory constants in the
  source, never a form input — still rendered as live `NumberInput`s in
  React (`FeieStep.jsx:138,141`).
- `[VERIFIED]` `employer_type` (4-option select: foreign entity/US
  company/foreign affiliate/US gov), `us_abode`, `revoked_past_5_years`
  confirmed zero UI in `FeieStep.jsx`.
- `[VERIFIED — corrects the existing file's own comment]`
  `bona_fide_visa_type` (`layer1_us.html:3030-3031`, "Foreign Visa /
  Residence Status" text input on the bona-fide-residence detail block)
  is also missing — `FeieStep.jsx:117-119`'s own comment claims it "isn't
  part of schema.js's committed shape, so it's intentionally not
  ported," but that's now stale: the field was added to `schema.js` in
  the JSON-export reconciliation pass. It's a genuine gap now, not an
  intentional exclusion.
- `[VERIFIED — precise logic, smaller fix than it looks]` All 3
  conflict-warning banners (`checkFeieConflicts()`,
  `layer1_us.html:8xxx`) are missing, but 2 of the 3 conditions need no
  new schema fields at all:
  - CTC warning: shown whenever `claims_feie` is true. Trivial to add.
  - High-tax-jurisdiction FTC tip: shown when `claims_feie` is true AND
    `tax_home_country` is one of a hardcoded list (`GB/CA/AU/DE/FR/JP/IN`)
    — both already-tracked fields, no new state needed.
  - SE-tax trap: shown when `claims_feie` AND a "Self-Employed
    Freelancer?" checkbox AND NOT a "Certificate of Coverage?" checkbox.
    Confirmed by reading the source directly: **neither checkbox writes
    to any schema field** (`layer1_us.html:2914,2920` — `onchange`
    handlers only call `checkFeieConflicts()`, no `updateStateField`
    call). These are ephemeral, page-local UI state in the source too —
    porting them needs local React state, not new schema fields.
- `[NEW FINDING — React shows a field the source keeps permanently
  hidden]` `physical_presence_start_date`/`physical_presence_end_date`
  inputs are `class="hidden"` in the source's static markup
  (`layer1_us.html:2992,2996`) with nothing anywhere that ever removes
  that class — confirmed by grepping every other reference to
  `feie-phys-start`/`feie-phys-end` (only 2 more hits, both just
  populate the hidden input's `.value` on load, never toggle visibility).
  These 2 fields are genuinely unreachable UI in the live source wizard.
  `FeieStep.jsx:101-106` renders them as live, visible, editable
  `DateInput`s. Not harmful, arguably an improvement (the source's `#feie-
  phys-usdays`/day-tracker bar suggest these dates were meant to drive a
  35-day test-period tracker that never got wired up) — but it is a real
  fidelity deviation from what the source actually shows a user.
- `[FROM AUDIT]` "Upload Travel Log"/"Upload Residence Docs" decorative
  buttons and the Live-API currency-converter widgets (foreign-currency
  amount + auto-convert to USD, on both the earned-income and housing
  fields) are missing — both are non-functional/decorative in the source
  too (Tier-3-equivalent, no state impact).

## 12. Foreign Assets (FBAR/FATCA) — `layer1_us.html:3080-3128` → `BanksStep.jsx`

- `[VERIFIED]` `fbar_aggregate_peak_usd`/`form_8938_required` derivation
  (summing `bank_accounts`/`financial_holdings` peak/last-day balances
  against the MFJ/single thresholds) is correctly implemented, matching
  source logic line-for-line. No issue.
- `[VERIFIED — still open]` New `financial_holdings[]` PFIC rows persist
  `pfic_election: null` on creation (`BanksStep.jsx:149`) while the
  select's displayed value falls back to `"1291"`
  (`BanksStep.jsx:568`) — a display-only fallback, not a real default. Any
  export/DAG path reading the field directly sees a missing election on
  every untouched row.

## 13. Real Estate — `layer1_us.html:3129-3162` → `RealEstateStep.jsx`

- `[VERIFIED]` §1031/§121/`realized_gain_loss_usd` computation all present
  and correctly wired. No open issues found.

## 14. Retirement Accounts — `layer1_us.html:3163-3272` → `RetirementStep.jsx`

- `[VERIFIED — worse than previously documented]` Source derives
  `rmd_required` purely from age (birth year ≥73 in the base year,
  `layer1_us.html:11508-11514`) and **deliberately never sets a dollar
  figure at all** (renders a static "See preparer" label — its own
  comment explains why: no account-balance field exists anywhere to
  compute a real number from). React invented both a manual
  `rmd_required` checkbox (bypassing the age-based derivation entirely)
  and a free-text `rmd_amount_usd` dollar input the source refuses to
  ever produce.

## 15. Foreign Entities — `layer1_us.html:3273-3388` → `EntitiesStep.jsx`

- `[VERIFIED — still open]` `foreign_entities.pfic_holdings[]` (added to
  schema.js last pass) has zero UI anywhere in `EntitiesStep.jsx` —
  confirmed no hits. PFIC data still only lives on `financial_holdings[]`
  (step 12 above) instead, so Form-8621 document logic that reads this
  specific array stays silently empty.
- `[FROM AUDIT, "confirmed solid"]` CFC/GILTI row shape checked as
  correct in the original pass — not personally re-verified.
- `[FROM AUDIT]` Entity-type-dependent label switching ("I own..." vs.
  "The Entity owns...") hardcoded to individual phrasing.
- `[FROM AUDIT]` "Linked Client Profile" picker on foreign-corp rows
  absent.

## 16. Foreign Gifts & Trusts — `layer1_us.html:3389-3439` → `GiftsStep.jsx`

- `[VERIFIED]` Full field set present and correctly wired (donor
  details, related-group classification, covered-expatriate flag, trust
  distribution/3520-A tracking). No open issues found.

## 17. Deductions & Credits — `layer1_us.html:3440-3556` → `DeductionsStep.jsx`

- `[VERIFIED — still open]` `qbi_deduction_eligible`/`qbi_deduction_usd`
  toggle+field pair is completely inert — real QBI is computed entirely
  inside the unported `calculateBusinessIncomes()` logic and never reads
  this field. A preparer can type a number that visibly sits on screen
  and affects nothing.
- `[VERIFIED — still open]` "Educator Expenses" (`educator_expenses_usd`)
  and a decoy "HSA Contributions" (`hsa_contributions_usd`) field bind to
  schema keys the source never exposes to a user at all — the real HSA
  field is the correctly-wired one on the Retirement step.

## 18. AMT & NIIT — `layer1_us.html:3557-3633` → `AmtNiitStep.jsx`

- `[VERIFIED — still open]` `niit_inputs.modified_agi_usd` (MAGI) is
  still a live `NumberInput` (`AmtNiitStep.jsx:158`) — the component's
  own comment (line 26) admits this was "FLAGGED, not fixed." Source
  always derives this value.

## 19. Foreign Tax Credit — `layer1_us.html:3634-3696` → `FtcStep.jsx`

- `[VERIFIED — still open]` Renders the "Other-Country FTC Entries" card
  that belongs on step 9 (Foreign Income) per source markup — see item
  under step 9 above for the full citation.

## 20. Withholding & Estimates — `layer1_us.html:3697-3771` → `WithholdingStep.jsx`

- `[VERIFIED — still open]` `federal_withholding_total_usd`,
  `state_withholding_total_usd`, `additional_medicare_tax_owed_usd`
  (plus `firpta_withholding_usd` on step 21) are all read-only computed
  labels in the source; all remain live `NumberInput`s in React
  (component's own comment at line 8 admits this).

## 21. Form 1040-NR Adjustments — `layer1_us.html:3772-3935` → `NraStep.jsx`

- `[VERIFIED — still open]` React writes `elected_rate`
  (`NraStep.jsx:24,108-109`) on `treaty_rate_claims[]` rows; `dag_py`'s
  `ustax_full.py:382,388,460` and `findings.py:160` all read the flat key
  `rate`. Every user-entered treaty claim is invisible to the FDAP-rate
  computation, so the flat 30% fallback fires regardless of what's
  entered.
- `[VERIFIED — sharper than previously documented]` The source's real
  "Submitted Form W-8BEN?" control (`layer1_us.html:3842-3848`, `#nra-w8ben`
  checkbox) writes the boolean `submitted_w8ben` — confirmed present and
  wired in the source. React has no `submitted_w8ben` UI anywhere; instead
  it renders an entirely different 4-option "W-8BEN Aggregate Status"
  select bound to `w8ben_aggregate_status`. That field IS real in the
  source's schema literal but — confirmed by grepping the whole file —
  has **no matching UI element anywhere in `layer1_us.html`**, dead in the
  source too. So this isn't "wrong enum vs. boolean," it's "React swapped
  a real, wired source control for a different, source-dead one." The
  component's own header comment already knew half of this (that
  `w8ben_aggregate_status` is unwired in the source) but incorrectly
  states `submitted_w8ben` "is NOT part of the canonical schema" — it is
  (`schema.js`'s `nra_specific.submitted_w8ben`, added last pass) — the
  comment is stale/wrong on that point.
- `[VERIFIED]` `nra_specific.has_us_pe` confirmed zero UI — the source's
  "US Permanent Establishment (PE)?" checkbox
  (`layer1_us.html:3835-3841`, `#nra-pe`) has no React counterpart at all.
- `[VERIFIED]` §6013(h) MFJ-unlock badge
  (`layer1_us.html:3809-3811`, `#nra-6013h-unlock-badge`, "✓ §6013(h)
  Active — MFJ Unlocked"), the Form 8833 treaty-disclosure notice
  (`layer1_us.html:3814-3820`, shown when tie-broken to India under
  Article 4), and the "Upload Indian TRC" dropzone
  (`layer1_us.html:3827-3832`, decorative — matches Bank Sync/Passive's
  non-functional upload pattern) are all confirmed missing from
  `NraStep.jsx`.

## 22. Generate Output — `layer1_us.html:3936-3958` → `OutputStep.jsx`

- `[FROM AUDIT]` "Proceed to India Module" cross-jurisdiction routing
  button/gate entirely missing.

---

## Cross-cutting / chrome (not tied to one step)

- `[FROM AUDIT]` `RightPanel.jsx`'s "Estimated AGI" tile actually
  displays `amt_inputs.amti_usd` (AMTI, not AGI) — there's no real AGI
  field in the schema at all. Permanently mislabeled, not just stale.
- `[FROM AUDIT]` Hamburger jurisdiction dropdown, "The Vault" button,
  "Tax Nerd Mode" toggle, the functional tax-year banner, responsive
  mobile stacking, and the gamification widget are all missing from the
  header/shell.
- `[FROM AUDIT]` Right panel's residency-status badge shows abbreviations
  ("RA"/"NRA"/"DUAL") where the source shows full words.
- `[FROM AUDIT]` Entity-type switch away from "individual" doesn't
  force-reset `setupW2`/`setupRetirement`/`setupForeignFeie` — stale
  flags can leave individual-only phases visible for a corp/partnership
  filer.
- `[FROM AUDIT]` The NRA step button isn't hidden for corp/partnership/
  trust filers like the source does.
- `[FROM AUDIT]` `applySpouseUsPersonGating`/
  `applySpouseJointElectionGating`'s reset-on-hide side effects aren't
  ported — values persist silently after their gating condition becomes
  false again.

---

## Coverage summary

| # | Step | Status |
|---|---|---|
| 1 | Onboarding | Open issues (schema-only fields, navigation, disconnected confirm path) |
| 2 | Residency | Open issues (dual-status/excluded-days collected but unused) |
| 3 | State Nexus | Open issues (large — whole sticky-domicile sub-engine, CA gating, 5 missing UI blocks, apportionment domicile-state bug) |
| 4 | Bank Sync | **Solid, no open issues** |
| 5 | Employment Income | Mostly solid; row-shape depth not yet audited |
| 6 | Capital Gains & Crypto | **Fixed** (aggregate inversion); sub-module arrays still schema-only |
| 7 | Passive & Other | **Solid, no open issues** (one minor decorative-upload gap) |
| 8 | Business Ops & K-1s | **Most severe open issue in the port** (K-1 → $0) + large Tier 1 gap |
| 9 | Foreign Income | Solid, one misplaced-card issue |
| 10 | Equity & Cap Table | **Solid, no open issues** |
| 11 | FEIE | Open issues (editable constants, 5 missing fields, 3 missing banners, 2 dates shown that source hides) |
| 12 | Foreign Assets | Solid derivation logic; one PFIC-default bug |
| 13 | Real Estate | **Solid, no open issues** |
| 14 | Retirement | Open issue (fabricated RMD dollar field) |
| 15 | Foreign Entities | Open issue (PFIC array never written) + Tier 1 items |
| 16 | Foreign Gifts & Trusts | **Solid, no open issues** |
| 17 | Deductions & Credits | Open issues (inert QBI toggle, 2 decoy fields) |
| 18 | AMT & NIIT | Open issue (MAGI editable) |
| 19 | Foreign Tax Credit | Open issue (misplaced card, mirrors step 9) |
| 20 | Withholding & Estimates | Open issue (4 fields editable) |
| 21 | Form 1040-NR | Open issues (treaty rate mismatch, real W-8BEN checkbox swapped for a source-dead select, has_us_pe/6013(h) badge/8833 notice/TRC upload all missing) |
| 22 | Generate Output | Open issue (missing India routing) |
