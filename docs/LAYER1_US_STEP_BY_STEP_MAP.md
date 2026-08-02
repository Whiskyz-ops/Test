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

**Re-verification note (2026-08-02):** `layer1_us.html` is under active,
concurrent maintenance by other sessions on this shared branch — it is
NOT a frozen file. A full re-check against the current HEAD found the
static panel markup this map is built on (`panel-step-*` div positions,
and every specific field/control cited inside a panel) completely
stable — zero drift — but several deeper JS-function line citations had
shifted by small amounts (7-24 lines) from insertions elsewhere in the
`<script>` block, and one function (`updateProfileVisibility`) was
renamed to `updateEntitiesStepLogic` with identical logic. All citations
below have been corrected to match the current file as of this
re-verification pass. On the React side: every step file this map marks
"solid, no open issues" was checked against its git history and
confirmed untouched since its original audit (either by me or predating
this map entirely) — the only exceptions are `NraStep.jsx`/`schema.js`,
which gained a new, genuinely-additional `spouse_ssn_or_itin_type` field
(noted under §21) from a concurrent commit, and the 3 files I fixed
myself (`OnboardingStep.jsx`/`BusinessStep.jsx`/`EntitiesStep.jsx`).

---

## 1. Onboarding — `layer1_us.html:628-982` → `OnboardingStep.jsx`

- `[FIXED]` Setup-gate flags (setupW2/setupBiz/etc.) never hydrated from
  real data on reload — `derive.js` gained `deriveSetupFlags()`,
  `store.js`'s `useOnboardingSetup` gained `hydrateFromUsState()`.
- `[FIXED]` All 7 corporate-identity fields
  (`entity_name`/`ein`/`date_of_incorporation`/`state_of_domicile`/
  `naics_code`/`is_foreign_corporation`/`is_foreign_owned_25_pct`) have
  exactly ONE real data-entry point in the entire source —
  `layer1_us.html:775-819`, the "wrapper-corporate-profile-fields" block
  on this exact Onboarding screen — and every one of its 7 inputs is wired
  through `updateProfileField(field, val)`
  (`layer1_us.html`'s definition: `usState.profile[field] = val`), i.e.
  **all 7 write to `profile.*`, not `corporate_profile.*`**. Confirmed by
  grepping the entire file for `corp-entity-name`/`corp-ein`/`corp-naics`/
  etc. — this is the only occurrence, no second corporate-identity block
  exists anywhere else in the source (the visually-similar `.scorp-ein`/
  `.ccorp-ein`/`.scorp-naics` hits elsewhere are unrelated per-row fields
  on individual K-1/C-corp entries inside `income_us_source.*_k1[]`, not
  this top-level section). `corporate_profile` as a schema section is
  **entirely dead in the source** — nothing ever writes to it.
  `OnboardingStep.jsx:356-406` got 6 of these 7 fields wrong, writing to
  `corporate_profile.*` (only `state_of_domicile` correctly targeted
  `profile.state_of_domicile`). `BusinessStep.jsx` also had a second,
  entirely fabricated corporate-identity block (`CorporateProfileBlock`,
  no HTML counterpart anywhere) that ALSO wrote the same 6 fields to
  `corporate_profile.*`. **Fixed in both files**: all 6 fields now read/
  write `profile.*` in `OnboardingStep.jsx` and in `BusinessStep.jsx`'s
  `CorporateProfileBlock` (the duplicate UI surface itself was left in
  place — that's a separate redundancy concern from the field-path bug —
  but it now edits the same real field Onboarding does instead of a
  second, wrong location). Verified live in headless Chromium: filling
  Entity Name/EIN on Onboarding and checking "≥25% foreign-owned" now
  write to `profile.entity_name`/`profile.ein`/
  `profile.is_foreign_owned_25_pct`, with `corporate_profile`'s copies of
  all three staying `null`/`false`. No live DAG node reads either path
  for these 6 fields, so this had no live tax-output impact — it was a
  data-fidelity bug, not a miscalculation.
- `[VERIFIED — NEW FINDING, explains the "two disconnected code paths"
  claim precisely]` There are **two different "confirm and proceed"
  buttons rendered simultaneously** for this step. `OnboardingStep.jsx`
  itself renders "Initialize Matrix" (matching the source's button
  label/position, `:468-478`) but its `onClick` only calls
  `setField("metadata.intake_completed", true)` — no navigation.
  Separately, `page.jsx:146-154` renders its own step-specific footer
  button labeled "Start Intake →" that correctly dispatches
  `CONFIRM_INTAKE` to the XState machine, which both sets
  `intakeCompleted` AND navigates (`machine.js:182-186`). So the working
  path exists, just not on the button that visually matches the source —
  a user is shown two buttons, one of which (the one styled/positioned
  like the source's) silently does nothing but flip a flag.
- `[VERIFIED]` A whole HOH/QSS filing-status diagnostic sub-feature is
  confirmed absent: the generic "Filing Status Conflict" banner
  (`layer1_us.html:692-698`, `#filing-diagnostic-warning`, dynamically
  populated) and the "Special Rules for Married Persons" HOH-override
  sub-selector (`:700-712`, `#hoh-edge-cases`/`prof-hoh-override`, 3
  options + a dynamic explanation box) have no React counterpart —
  matches `profile.hoh_marital_override` (added to schema.js last pass)
  having zero UI, confirmed again here.
- `[VERIFIED]` Identity/Corporate-Formation upload dropzone
  (`layer1_us.html:989-992` area, label swaps between "Upload Identity
  Document"/"Upload Corporate Formation Document" based on entity type)
  confirmed missing — not decorative-only in the source this time (worth
  double-checking on a future pass whether it's wired to anything beyond
  the label swap, but the dropzone itself is absent from React either
  way).
- `[FROM AUDIT]` §6013(g) election box and NRA option-disabling/relabeling
  are unconditional/static instead of gated — gives actively wrong
  messaging once MFJ is unlocked via election.
- `[VERIFIED]` `metadata.intake_setup` (added to schema.js last pass) has
  zero reader/writer anywhere in `store.js` or `OnboardingStep.jsx` —
  schema shape only.

## 2. Residency — `layer1_us.html:983-1430` → `ProfileStep.jsx`

Overall much more complete than previously documented — full read confirms
the visa-status select, citizenship/green-card block, entire §877A
covered-expatriate test block, the whole SPT stay tracker (including the
live-computed formula/status card), exempt-individual sub-flow (student/
scholar overrides), first-year-choice election, §6013(g) election, and the
Article 4 DTAA tie-breaker wizard (4 sequential tests, correctly
progressive-reveal) are ALL present and correctly wired, matching the
source field-for-field. Only 2 real gaps found:
- `[VERIFIED]` `dual_status_arrival_date`/`dual_status_departure_date`
  (`layer1_us.html:1211-1223`, "Dual-Status Mechanics" — always-visible,
  not gated behind anything) have zero UI. These are the ONE thing keeping
  `evaluateResidencyLock()` from ever resolving to `DUAL_STATUS` via the
  plain SPT pass-through path (it's only reachable today via green-card
  surrender or first-year-choice) — `derive.js`'s own comments
  acknowledging this gap are stale now that the fields exist in
  `schema.js` (added last pass).
- `[VERIFIED]` The 4 "Excluded Days" inputs + exception-reason select
  (`layer1_us.html:1244-1267`, inside the SPT tracker card, also
  always-visible) writing `us_days_excluded_current/minus_1/minus_2/
  reason` have zero UI — same status.
- `[VERIFIED — minor]` The decorative "Upload Identity Document" dropzone
  (`layer1_us.html:989-994`, non-functional in the source too) isn't
  ported — same low-priority category as Bank Sync/Passive's missing
  upload buttons.
- `[CORRECTED — the existing audit's claim was wrong]` "No Back/Next bar
  on this step at all" isn't accurate: `page.jsx:134-166` renders a
  shared Back/Next footer under every step's `<ActiveComponent />`,
  ProfileStep included — confirmed by reading `page.jsx` directly during
  the Onboarding audit. What's actually different from the source is
  structural, not missing: the source puts Back/Next buttons inside each
  panel individually, React centralizes them into one shared footer
  component instead. Not a gap.

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
  `toggleStateSpecificFields()` (`layer1_us.html:8623-8633`) only shows it
  when `primary_state_of_residence === 'CA'` or `previous_state === 'CA'`.
  React's `StateStep.jsx:231` renders it unconditionally for every
  individual filer (`{!isCorp && (...)`).
- `[VERIFIED — bigger than previously documented]` What the existing audit
  called "statutory-residency day tracker for footprint states" is
  actually a whole sub-engine (`div-footprint-statutory-questions`,
  `updateStickyException()` @ `layer1_us.html:8419-8442`,
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
  references `document.getElementById('div-ny-fields')` (line 8629) but no
  such element exists, so it always resolves to `null` and silently no-ops.
  This is a dead reference in the source itself (same class as the
  already-known dead `step-k1` reference) — porting a literal "NY fields
  block" would be porting a bug, not a feature. The real NY-specific UI is
  the sticky-exceptions sub-engine above, which lives inside the generic
  per-footprint-state area, not a dedicated NY div.
- `[VERIFIED — root cause identified]` Apportionment matrix drops the
  entity's domicile state: source's `renderCorporateApportionmentMatrix()`
  (`layer1_us.html:8884-8891` — this logic lives in the matrix-rendering
  function, not `syncApportionmentState()`, which only handles a single
  per-state input update; corrected attribution) builds its state list as
  `physical_states ∪ economic_states ∪ {profile.state_of_domicile}` —
  unconditionally including the domicile state read from
  `profile.state_of_domicile`. A second function,
  `renderCorporateNexusStatus()` (`layer1_us.html:8941-8945`), reads the
  same field to populate the "State of Formation" readonly display (see
  §3's missing-UI-blocks item above). `StateStep.jsx:83`'s
  `apportionmentStates` only unions `physical_states`/`economic_states`,
  never reading `usState.profile.state_of_domicile` at all.
- `[NEW FINDING]` `onPrimaryStateChange()` (`layer1_us.html:8672-8678`)
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

- `[VERIFIED]` The source panel is genuinely tiny (just 40 lines) — only a
  master toggle + dynamic W-2 list + 2 decorative upload buttons.
  Self-employment/farming/K-1 arrays are NOT on this step at all —
  confirmed they live entirely on `panel-step-business`
  (`layer1_us.html:2220-2718`), so that row-shape audit belongs under
  Business Ops (§8) below, not here.
- `[VERIFIED]` `wages_w2` naming fix confirmed still correct.
- `[VERIFIED — essentially complete]` Re-checked the full W-2 row shape
  field-by-field against the real JSON export: employer name/address (4
  fields), wages + qualified tip/overtime, the full federal/FICA box
  breakdown (11 fields incl. EIN/control number), statutory-employee/
  retirement-plan/sick-pay flags, state-and-local-taxes[] (6 fields/row),
  and box_12_benefits[]/box_14_other[] (2 fields/row each) are ALL
  present and correctly wired in `IncomeUsStep.jsx`. This is one of the
  most complete row-shape ports in the app — no gaps found.
- `[VERIFIED — minor]` The 2 decorative "Upload Latest Paystub"/"Upload
  Official W-2" buttons (`layer1_us.html:1812-1819`, `triggerW2Upload()`)
  aren't ported — same low-priority category as other missing decorative
  upload affordances elsewhere in the app.
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

- `[FIXED]` K-1 rows (`partnerships_k1`/`s_corporations_k1`/
  `trusts_estates_k1`/`c_corporations_1120`/farming) previously stored
  data nested under `row.k1_boxes.box1_ordinary_income` etc. while both
  DAG engines read flat top-level fields — every dollar of partnership/
  S-corp/trust K-1 income silently computed to $0. Fixed for all 5 row
  types: rows now use flat `ordinary_income_usd`/`guaranteed_payments_usd`/
  etc. matching `dag_py/src/wising_dag/us/aggregate_us_income.py` and the
  JS DAG directly (confirmed by re-reading `BusinessStep.jsx` — no more
  `k1_boxes` writes, flat fields throughout). Was the most severe finding
  in the whole port.
- `[VERIFIED — still open]` A fabricated, always-editable "Taxable Income
  (Computed)" field on Schedule M-1 (`BusinessStep.jsx:1692`, shifted
  again by the field-path-collision fix's own header comment but still
  present, still unchanged in behavior) has no source counterpart and is
  read by no DAG code.
- `[FIXED since the audit — reclassified]` §199A QBI/UBIA capture fields
  ARE now present, at least on K-1 rows — `qbi_wages_usd`/`qbi_ubia_usd`
  `MoneyField`s confirmed on both `partnerships_k1` and `s_corporations_k1`
  row editors (`BusinessStep.jsx:1255-1256,1455-1456`), landed alongside
  the K-1 box-mapping fix. Not verified at the top-level Schedule C/entity
  level, only on K-1 rows — worth a follow-up check.
- `[FIXED since the audit — reclassified]` Schedule C's home-office/
  vehicle-expense fields ARE now present (`BusinessStep.jsx:962-973`,
  "Additional Deductions" accordion — `vehicle_miles`/`home_office_sqft`).
  Simplified vs. the source's richer model (source has a nested
  `vehicle_expenses{}` with 5 sub-fields — biz/commuting/personal miles +
  written-evidence flag — and a `home_office{}` with both office and
  total home sqft; React has 2 flat fields), but no longer absent as the
  audit claimed.
- `[VERIFIED — still open]` The component's own header comment
  (`BusinessStep.jsx:1-85`) is unusually thorough and self-flags 3 genuine
  deferrals directly: `calculateBusinessIncomes()`'s basis/§465-at-risk/
  passive-activity-loss/QBI-phase-out/AMT-flowthrough logic is
  deliberately simplified to a top-line net-income figure;
  `addUsBranchRow` (foreign-parented US branches) is deliberately not
  ported; the NAICS/SSTB dropdown is deliberately collapsed from the
  source's real 25 options (16 non-SSTB + 9 SSTB, confirmed by counting
  `layer1_us.html:13091-13118`'s actual `<option>` tags) to a shorter
  list + free-text fallback.
- `[VERIFIED — still open]` "1099 Filing Obligations" panel (source has
  it at `layer1_us.html:14612`/`16117`, wired into multiple entity types)
  confirmed still entirely absent — zero hits for `1099`/`forms_1099` in
  `BusinessStep.jsx`.
- `[VERIFIED — still open]` The "Gross Receipts by State (Apportionment)"
  panel confirmed still entirely absent at the row level — zero hits for
  `state_allocations` in `BusinessStep.jsx`. Note this is distinct from
  `corp_state_nexus`'s apportionment matrix on StateStep (§3 above, which
  IS implemented) — this is a separate, per-row `state_allocations[]`
  field on each individual self-employment/K-1/C-corp row
  (`layer1_us.html:13263,13936,14623,15416,16128,16900` — present for
  every entity type in the source), still missing here.
- `[VERIFIED — still open]` The "$250k receipts" gate
  (`layer1_us.html:2263-2266`, "Did the entity have Total Receipts and
  Total Assets LESS than $250,000?") is a SEPARATE gate from the
  entity-type gating the header comment says was fixed — this is a
  receipts-threshold gate deciding whether Schedule L/M-1/M-2 should be
  skipped by default even for an in-scope entity type. No hits for
  `250,000`/`250000` in `BusinessStep.jsx` — still shown unconditionally
  once entity-type gating allows it.
- `[VERIFIED — still open]` "Business Compliance & Tax Analyzer" summary
  panel (`layer1_us.html:2608-2610`) confirmed still absent — zero hits
  for that string in `BusinessStep.jsx`.
- Row-shape gap (not in the Tier list, visible directly from the real
  JSON export): source K-1/self-employment/C-corp rows also carry
  `assets[]` (§179 tables), `branches[]` (multi-location), `forms_1099[]`,
  and full `partners[]`/`shareholders[]`/`beneficiaries[]` rosters — none
  of this row-level detail exists in React yet, independent of the
  box-nesting fix above.

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
  (`layer1_us.html:2994,2998`) with nothing anywhere that ever removes
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
  `layer1_us.html:11501-11507`) and **deliberately never sets a dollar
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
- `[VERIFIED]` Entity-type-dependent label switching confirmed hardcoded:
  source's `updateEntitiesStepLogic()` (`layer1_us.html:7044-7069` —
  renamed from `updateProfileVisibility()` at some point after this was
  first audited; identical logic, confirmed by re-reading the current
  function body) swaps all 3 accordion labels ("I own..." → "The Entity
  owns...") when `tax_entity_type`/`llc_tax_election` resolves to
  ccorp/scorp/partnership; `EntitiesStep.jsx:252,413,520` hardcode the
  individual phrasing always.
- `[VERIFIED]` "Linked Client Profile" picker on foreign-corp rows
  confirmed absent — no hits for `linked_client_id` anywhere in
  `EntitiesStep.jsx`.
- `[FIXED]` The Form 5472 (Inbound) section's visibility gate was wrong
  on two independent levels. (1) In the source, the whole section is
  only ever shown for C-Corps specifically (`layer1_us.html:7058`, inside
  `updateEntitiesStepLogic()` — line number unchanged from when this was
  fixed, re-confirmed current: `if (type === 'ccorp' && wrapper5472) {
  wrapper5472.style.display = 'block'; }` — not scorp/partnership, just
  ccorp) — `EntitiesStep.jsx`'s
  old `is5472` wasn't entity-type-gated at all. (2) What it was gated on
  instead — `corporate_profile.is_foreign_owned_25_pct` — was the wrong
  storage path (same bug as §1's Onboarding fix). Fixed: the section is
  now wrapped in an entity-type check (`resolvedEntityType === "ccorp"`,
  resolved through the LLC election the same way as elsewhere in this
  port) matching the source exactly, and its own accordion open/close is
  local `useState` instead of a schema-field toggle — matching the
  source's inner `form5472-toggle`, which the source itself never wires
  to any `updateStateField` call (confirmed by reading it: `onchange`
  only calls `toggleForm5472Section(this.checked)`, no state write —
  it's ephemeral open/close UI, not a persisted flag, in the source
  too). Verified live in headless Chromium: the section shows for a
  C-Corp with the foreign-owned checkbox set, and stays hidden for an
  S-Corp with the same checkbox set — confirming the gate is genuinely
  entity-type-driven now, not just always-on. The row UI itself, once
  visible, is reasonable — actually richer than the source's single flat
  "Total Intercompany Payments" number input, since it captures
  per-party country/amount detail.

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
  "Submitted Form W-8BEN?" control (`layer1_us.html:3857`, `#nra-w8ben`
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
  (`layer1_us.html:3850`, `#nra-pe`) has no React counterpart at all.
- `[VERIFIED]` §6013(h) MFJ-unlock badge
  (`layer1_us.html:3808-3810`, `#nra-6013h-unlock-badge`, "✓ §6013(h)
  Active — MFJ Unlocked"), the Form 8833 treaty-disclosure notice
  (`layer1_us.html:3825-3831`, shown when tie-broken to India under
  Article 4), and the "Upload Indian TRC" dropzone
  (`layer1_us.html:3838-3843`, decorative — matches Bank Sync/Passive's
  non-functional upload pattern) are all confirmed missing from
  `NraStep.jsx`.
- `[NEW — landed via a concurrent commit, already correctly ported]` The
  source gained a "Spouse's Taxpayer ID Type" select right after the
  §6013(h) badge (`layer1_us.html:3812-3819`, `#nra-spouse-id-type` →
  `nra_specific.spouse_ssn_or_itin_type`, 4 options matching the primary
  taxpayer's own ID-type select) — this is what pushed the badge/PE/
  W-8BEN citations above down by ~10-15 lines. `NraStep.jsx` already has
  a matching `spouse_ssn_or_itin_type` field with the same 4 options
  (confirmed present) — this one arrived and was ported together by the
  other session's work, not a gap.

## 22. Generate Output — `layer1_us.html:3936-3958` → `OutputStep.jsx`

- `[VERIFIED]` `copySchema()`/`downloadSchema()` correctly ported.
- `[VERIFIED — deeper than a missing button]` The "Proceed to India
  Module" button's visibility gate (`layer1_us.html:20515-20528`,
  `initFromLocalStorage()`) reads `routerState.primary_jurisdiction ===
  'cross_border'` off a *separate* localStorage blob
  (`window.WISING.ClientRegistry.storageKeyFor('ROUTER')`) written by a
  sibling "Layer 0" jurisdiction-router module entirely outside this
  app's own `usState`. This confirms the gap is architectural, not just
  a missing button — porting it needs this React app to read a
  cross-module storage key nothing here currently touches. Same function
  also confirms where `config.base_year` (added to `schema.js` last
  pass) actually comes from: the router state, not user input on this
  screen.
- `[VERIFIED — minor]` The decorative "Complete Wizard & lock" button
  (`layer1_us.html:3966`, just an `alert()` in the source too) isn't
  ported either — low priority, matches other missing decorative
  affordances.

---

## Cross-cutting / chrome (not tied to one step)

- `[VERIFIED — still open]` `RightPanel.jsx:121` still labels
  `amt_inputs.amti_usd` (AMTI, not AGI) as "Estimated AGI" — no real AGI
  field exists anywhere in `schema.js`. Permanently mislabeled, not just
  stale.
- `[VERIFIED — still open]` Hamburger jurisdiction dropdown, "The Vault"
  button, and "Tax Nerd Mode" toggle confirmed still missing — zero hits
  for any of those strings in `Layer1UsHeader.jsx`.
- `[VERIFIED — still open, extra detail]` The tax-year banner is more
  than decorative in the source: `initFromLocalStorage()`
  (`layer1_us.html:20515-20539`) populates it with the base tax year read
  from the cross-module router state (see Generate Output §22 above) plus
  the derived US tax year range and filing-season year — same
  cross-module-storage dependency as the "Proceed to India Module"
  button, so porting this properly needs the same architectural piece.
- `[VERIFIED — still open]` Right panel's residency-status badge
  (`RightPanel.jsx:28-30`) still shows abbreviations ("RA"/"NRA"/"DUAL")
  where the source shows full words — confirmed directly, not inherited
  from the prior claim.
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
| 1 | Onboarding | Corporate-identity field-path bug **fixed** (both Onboarding and BusinessStep); dead "Initialize Matrix" button, HOH/QSS sub-feature, upload dropzone still open |
| 2 | Residency | Much more complete than documented — only dual-status dates + excluded-days UI missing (both prominent, always-visible in source) |
| 3 | State Nexus | Open issues (large — whole sticky-domicile sub-engine, CA gating, 5 missing UI blocks, apportionment domicile-state bug) |
| 4 | Bank Sync | **Solid, no open issues** |
| 5 | Employment Income | **Solid, no open issues** (W-2 row shape essentially complete; self-employment/farming live on Business Ops instead) |
| 6 | Capital Gains & Crypto | **Fixed** (aggregate inversion); sub-module arrays still schema-only |
| 7 | Passive & Other | **Solid, no open issues** (one minor decorative-upload gap) |
| 8 | Business Ops & K-1s | K-1 → $0 bug **fixed**; QBI/UBIA + home-office/vehicle also fixed since the audit; 1099 panel, state_allocations, $250k gate, Analyzer panel still open |
| 9 | Foreign Income | Solid, one misplaced-card issue |
| 10 | Equity & Cap Table | **Solid, no open issues** |
| 11 | FEIE | Open issues (editable constants, 5 missing fields, 3 missing banners, 2 dates shown that source hides) |
| 12 | Foreign Assets | Solid derivation logic; one PFIC-default bug |
| 13 | Real Estate | **Solid, no open issues** |
| 14 | Retirement | Open issue (fabricated RMD dollar field) |
| 15 | Foreign Entities | Form 5472 gate **fixed** (both stacked bugs); PFIC array never written, label switching, Linked Client picker still open |
| 16 | Foreign Gifts & Trusts | **Solid, no open issues** |
| 17 | Deductions & Credits | Open issues (inert QBI toggle, 2 decoy fields) |
| 18 | AMT & NIIT | Open issue (MAGI editable) |
| 19 | Foreign Tax Credit | Open issue (misplaced card, mirrors step 9) |
| 20 | Withholding & Estimates | Open issue (4 fields editable) |
| 21 | Form 1040-NR | Open issues (treaty rate mismatch, real W-8BEN checkbox swapped for a source-dead select, has_us_pe/6013(h) badge/8833 notice/TRC upload all missing) |
| 22 | Generate Output | Open issue (India routing needs a cross-module storage read, architectural not cosmetic) |
