# US Layer 1: HTML ↔ React exhaustive field/behavior audit

**Purpose**: answer, exhaustively, whether the React port
(`monitor-next/app/layer1-us/`) contains everything present in the source
`layer1_us.html`, control-by-control and field-by-field — not a structural
diff (24k lines of imperative HTML/JS vs. declarative React isn't a
meaningful line-by-line comparison), but a full inventory of every input,
select, toggle, button, and visibility rule in the source, checked against
the port.

**Method**: 11 agents, each briefed to read the actual full source (not
summaries, not the prior `LAYER1_US_REACT_PORT_GAPS.md` pass's conclusions)
for an assigned slice: 9 covered HTML↔React parity per step/shell area, 1
covered the JS gating/visibility engine vs. the React state layer
(`machine.js`/`store.js`/`derive.js`), and 1 covered `schema.js`'s field
names against what the Python DAG (`dag_py/src/wising_dag/**`) and the JS
DAG (`monitor-next/lib/dag/**`) actually read.

**Verdict: NOT ready to replace `layer1_us.html`.** This pass found new,
previously-undocumented bugs in nearly every step, including at least one
that zeroes out a whole category of income for a real filer type. Task
tracked separately: replacement is blocked pending fixes and user
sign-off.

---

## Tier 0 — Data-corrupting bugs (silently wrong output, not just missing UI)

1. **K-1 income is invisible to both DAG engines for partnership/S-corp/trust
   filers.** `BusinessStep.jsx`'s K-1 row factories store data as nested
   `row.k1_boxes.boxN_*`; both `dag_py/src/wising_dag/us/aggregate_us_income.py`
   and the JS DAG read flat top-level fields (`ordinary_business_income_usd`,
   `guaranteed_payments_usd`, `sec179_deduction_usd`, `interest_income_usd`,
   `stcg_usd`/`ltcg_usd`, `qbi_wages_usd`, etc.). The source HTML itself uses
   the flat names — this is a React-port regression, not a pre-existing gap.
   **Every dollar of partnership/S-corp/trust K-1 income computes to $0.**
2. **Capital-gains total computation is inverted.** The source's
   `recalculateCapitalGainsAggregate()` never reads the manual per-transaction
   list — it only sums the (also-missing in React) manual ST/LT aggregate
   boxes plus the QSBS/collectibles/real-estate/crypto sub-module arrays.
   React derives the tax-facing STCG/LTCG totals *only* from the per-transaction
   list — the one path that works in React is the one the source ignores,
   and the paths the source actually uses don't exist in React yet.
3. **Schedule M-1 drops 5 of 9 fields the DAG sums.** `schema.js` only
   declares 4 of the 9 M-1 keys `dag_py/src/wising_dag/core/entry.py` needs
   (`tax_exempt_interest`, `foreign_taxes_credited`,
   `interest_expense_limitation`, `other_additions`, `other_subtractions` are
   missing) — silently treated as $0 for every corporate/partnership filer.
4. **NRA treaty-rate claims are silently ignored.** `NraStep.jsx` writes
   `elected_rate`; `dag_py`'s `ustax_full.py`/`findings.py` read `rate`. FDAP
   income always falls back to the flat 30% rate regardless of what a user
   enters.
5. **NRA W-8BEN status field mismatch.** React writes an enum
   `w8ben_aggregate_status`; the DAG reads a boolean `submitted_w8ben` that no
   component ever writes. `w8benOnFile` is always `False` — the 30% FDAP
   fallback fires and a `nra_w8ben_missing` critical finding is raised even
   when the real facts say otherwise.
6. **QSBS (§1202) and collectibles (28%-capped) capital gains can never get
   their special treatment.** `dag_py` expects
   `income_us_source.collectibles_transactions[]` and `.qsbs_transactions[]`;
   neither exists anywhere in `schema.js` — only dead flags
   (`has_collectibles`/`has_qsbs`) that nothing downstream reads.
7. **CA safe-harbor and NY/NJ/CT statutory-residency day-count logic is
   silently mis-derived.** `dag_py` reads
   `state_residency.ca_safe_harbor_employment_contract` and a
   `footprint_details.NY.{days,ppa}` structure; neither exists in `schema.js`.
8. **Newly-added PFIC holding rows persist `pfic_election: null`** while the
   UI displays a "Section 1291 (Default)" fallback label — any DAG/export
   path reading the field directly (no `|| "1291"` fallback) sees a missing
   election on every untouched PFIC row, unlike the source which always
   captures the real selected value on creation.
9. **`foreign_entities.pfic_holdings[]`** (read by `filings/documents.py` and
   `filings/assets.py` for Form 8621 counts) is never written — PFIC data
   lives only on `financial_holdings[]` instead, so Form-8621 document logic
   is silently empty.
10. **"Estimated AGI" on the persistent right panel displays the wrong
    field** — `RightPanel.jsx` shows `amt_inputs.amti_usd` (AMTI) under the
    "Estimated AGI" label. There is no real AGI field in the schema at all;
    this isn't a stale value, it's a permanently mislabeled, semantically
    wrong number on every load.
11. **Reloading the page (or loading a persona/profile with real data) resets
    all onboarding-gate flags to hidden/locked**, even when the underlying
    data says otherwise. The source explicitly re-derives each setup
    checkbox from real data on load (its own comment cites a real incident:
    "confirmed via a real profile diff that omitting this silently dropped a
    trust K-1's $4,900"). React's setup-flag store is hard-coded `false` on
    creation and is never hydrated from `loadFromStorage()` or persona-prefill.
12. **NIIT MAGI (`modified_agi_usd`) is still freely editable**, one of the
    AMT/NIIT fields the doc claims were all fixed to read-only — the source
    always derives this value; React lets a preparer overwrite it.
13. **Federal/State Withholding, Additional Medicare, ECI, and FDAP** are all
    read-only computed labels in the source; all four are editable
    `NumberInput`s in React (`WithholdingStep.jsx`, `NraStep.jsx`) — the same
    "editable fake-computed-field" bug class documented as fixed for AMT/NIIT,
    recurring in three more steps.
14. **A fabricated, always-editable "Taxable Income (Computed)" field on
    Schedule M-1`** (`BusinessStep.jsx`) has no HTML counterpart and is read
    by no DAG code — same bug class as #13, appearing a second time.
15. **Two invented editable "constants"**: `housing_exclusion_base_usd` /
    `housing_exclusion_cap_usd` on `FeieStep.jsx` are fixed IRS statutory
    values in the source (`$21,264`/`$39,870`, hardcoded, never a form
    input) — React lets a user override them, producing a housing exclusion
    the source could never allow.
16. **A completely inert QBI toggle/field pair** on `DeductionsStep.jsx`
    (`qbi_deduction_eligible`/`qbi_deduction_usd`) — the real QBI deduction is
    computed entirely inside the unported `calculateBusinessIncomes()` and
    never reads this field. A preparer can type a number here that visibly
    sits on screen and affects nothing.
17. **Two more dead invented fields**: "Educator Expenses" and a decoy "HSA
    Contributions" input on `DeductionsStep.jsx` bind to schema keys the
    source never exposes to a user at all (the real HSA field is a
    different, correctly-wired field on the Retirement step).

## Tier 1 — Whole sub-features/modules missing

- **CapGainsStep**: no Upload-1099/Broker-Connect tabs, no QSBS/Collectibles/
  Real-Estate/Crypto sub-modules with their own row lists, no manual ST/LT
  aggregate boxes (see Tier 0 #2 — this is also the root cause of the
  inversion bug).
- **BusinessStep**: "1099 Filing Obligations" panel (wired into 5 entity
  types in the source) entirely absent; "Gross Receipts by State"/economic-
  nexus apportionment (6 entity types) entirely absent; §199A QBI/UBIA
  capture fields at the entity level absent; the "$250k receipts" gate that
  should hide Schedule L/M-1/M-2 by default is missing (shown unconditionally
  instead); most of the "Business Compliance & Tax Analyzer" summary panel
  (5 of 6 metrics, all 5 loss-limitation flags) is missing; Schedule C's
  home-office/vehicle-expense section is missing (oddly, Farm's equivalent
  *was* ported); `addUsBranchRow` (foreign-parented US branches) not ported;
  NAICS/SSTB dropdown is 11 options vs. the source's 25.
- **Onboarding/Profile**: no working "advance to next step" click-path (the
  "Initialize Matrix" button doesn't navigate; Profile has no Back/Next bar
  at all); a whole HOH/QSS filing-status diagnostic sub-feature is absent;
  Identity/Corporate-Formation upload dropzone missing; dual-status
  arrival/departure date fields missing; SPT "excluded days" fields missing
  (acknowledged in `derive.js`, real gap regardless); §6013(g) election box
  and the NRA option-disabling/relabeling are unconditional/static instead of
  gated, and give actively wrong messaging once MFJ is unlocked via election.
- **StateStep**: Community Property alert, statutory-residency day tracker
  for footprint states, "Derived State Residency Statuses" summary card, CA
  section shown to every filer instead of gated by state, CA warning-alert
  text, military guidance box, corp "State of Formation" readonly field, and
  the apportionment matrix silently drops the entity's domicile state from
  the gross-receipts list — all missing.
- **FeieStep**: `employer_type`, `us_abode`, `revoked_past_5_years`,
  `bona_fide_visa_type` fields, the self-employment/COC checkboxes, and all
  three conflict-warning banners (CTC conflict, high-tax-jurisdiction FTC
  tip, SE-tax trap) are missing.
- **Chrome/shell**: hamburger jurisdiction dropdown, "The Vault" button, "Tax
  Nerd Mode" toggle, the functional tax-year banner (base/US tax year +
  filing season for cross-border sessions — not decorative), responsive
  mobile stacking, and the gamification widget are all missing. Right
  panel's residency-status badge shows abbreviations ("RA"/"NRA"/"DUAL")
  where the source shows full words ("RESIDENT ALIEN" etc.) — the earlier
  gaps doc's own "verified live" claim on this exact point was checked
  against the wrong string.
- **Retirement**: RMD gap is worse than previously documented — the source
  has *no input controls at all* (derives `rmd_required` from birth date
  only, deliberately never fabricates a dollar amount); React invented both
  a checkbox and a free-text dollar field from scratch.
- **Entities**: entity-type-dependent label switching ("I own..." vs. "The
  Entity owns...") is hardcoded to individual phrasing; "Linked Client
  Profile" picker on foreign-corp rows is absent.
- **NRA**: §6013(h) MFJ-unlock badge, Form 8833 treaty-disclosure notice,
  Indian TRC upload zone, `has_us_pe` field (also missing from schema) are
  all missing.
- **Output**: the "Proceed to India Module" cross-jurisdiction routing
  button/gate is entirely missing (the concrete manifestation of the
  already-known "cross-jurisdiction hydration not ported" gap).
- **Misplaced feature**: the "Other-Country FTC Entries" card is implemented
  on `FtcStep.jsx` but belongs on the Foreign Income step per the source
  (`layer1_us.html:2778-2786`, inside `panel-step-income-foreign`) —
  confirmed directly against source after two agents disagreed.

## Tier 2 — Gating/state-management logic gaps (behavior, not fields)

- Entity-type switch away from "individual" doesn't force-reset
  `setupW2`/`setupRetirement`/`setupForeignFeie` — stale flags can leave
  individual-only phases visible for a corp/partnership filer.
- The NRA step button isn't hidden for corp/partnership/trust filers like
  the source does.
- `applySpouseUsPersonGating`/`applySpouseJointElectionGating`'s
  reset-on-hide side effects aren't ported — values persist silently after
  their gating condition becomes false again.
- "Confirm intake & proceed" is split into two disconnected code paths (one
  persists state but doesn't navigate, the other navigates but doesn't
  persist the completion flag) — the source is one function that does both.
- A dead typo in the source (`step-prop` instead of `step-real-estate`)
  means the live HTML app never actually locks Real Estate for
  corp/partnership filers; React uses the correct id and does lock it — a
  genuine behavioral difference worth a product call, not a bug in either
  direction on its own.

## Tier 3 — Cosmetic/lower-severity text & UX divergences
(full detail in each agent's report; not reproduced here — mostly warning-copy
wording, decorative upload buttons never wired to state even in the source,
and a few widget-type changes like select-vs-checkbox for boolean flags)

---

## What's already confirmed solid (no new issues found)
IncomeForeignStep, EquityStep (all four previously-reported persistence bugs
confirmed genuinely fixed), the CFC/GILTI row shape in EntitiesStep, the core
phase/step gating architecture (`isPhaseVisible`/`isStepButtonVisible` vs.
`toggleGroup`/`toggleBtn` — 7-of-11 phase gating and the 6 nested step-button
gates all verified line-for-line correct), the centralized residency-lock
recompute (`applyDerivations()` + live `getLockContext()` reads, no stale
synced copy), and the OR-bug fix for §6013(g)/(h) MFJ unlocking.

## Next steps
1. Fix Tier 0 items first — several are silent data-loss/miscalculation bugs,
   not just missing UI.
2. Re-run targeted spot-checks after fixes (not a full re-audit) on touched
   steps.
3. Task #12 (replace `layer1_us.html` with the React port) stays blocked
   until the user confirms satisfaction against this list.

## Fix progress

- **[FIXED]** Tier 0 #11 (onboarding setup-gate flags never hydrated from
  real data on reload). `derive.js` gained `deriveSetupFlags()` (ported from
  `layer1_us.html:20738-20828`); `store.js`'s `useOnboardingSetup` gained a
  `hydrateFromUsState()` action wired into `replaceAll` and, via a
  post-mount `useEffect` in `page.jsx`, into initial load. Verified live in
  headless Chromium: real underlying data reopens gated phases on reload,
  blank state still hides them, manual toggles and persona prefill both
  still work, zero hydration/console errors.

- **[FIXED — independently confirmed via a real HTML export]** Tier 0 #2
  (capital-gains total computation inverted) and #3 (Schedule M-1 drops 5 of
  9 fields). A user-supplied real `buildSupersetSchema()` JSON export from
  the live `layer1_us.html` wizard was diffed field-by-field against
  `schema.js`, independently landing on the same two bugs this audit already
  had on file, plus a broader top-level schema gap (60 missing scalar/
  section fields — see below) this method surfaced that static reading
  hadn't caught yet.
  - `schema.js`: added `income_us_source.cg_transactions` (the source's real
    itemized-list path — previously invented as `capital_gains_transactions`,
    a name no DAG node or the source itself uses) and all 6
    `cg_manual_st/lt_proceeds/basis_usd` + `cg_manual_stcg/ltcg_usd` fields;
    added Schedule M-1's missing `tax_exempt_interest`/`other_additions`/
    `other_subtractions`/`interest_expense_limitation`/`foreign_taxes_credited`.
  - `CapGainsStep.jsx`: added the missing "Manual Entry Totals" 4-input block
    (ST/LT proceeds & basis) matching the source's `syncCgManualState()`
    exactly, and switched `stcg_us_source_usd`/`ltcg_us_source_usd` to derive
    from those manual totals instead of summing the itemized transaction
    list — matching `recalculateCapitalGainsAggregate()`'s real logic (which
    never reads the itemized list at all). The itemized list is now correctly
    display/export-only, same as the source. Full cross-step aggregation
    (folding in real_estate/collectibles/qsbs/crypto on top) still doesn't
    exist as a layer — same limitation noted elsewhere in this doc.
  - **Additional schema-only fixes from the export diff, not previously on
    this list**: `profile`/`corporate_profile` both restored to carry their
    full duplicated identity-field set (`entity_name`/`ein`/
    `date_of_incorporation`/`naics_code`/`is_foreign_owned_25_pct`/
    `is_foreign_corporation`/`state_of_domicile`, matching the source's own
    duplication — a prior pass had over-consolidated `state_of_domicile` off
    `corporate_profile` entirely); added `profile.hoh_marital_override`;
    added new top-level `config: { base_year }`; added `metadata.intake_setup`
    (a persisted snapshot of the 7 setup flags the source writes on every
    gate change — schema shape only, `store.js` doesn't populate/restore it
    yet); added `foreign_entities.has_pfics`/`pfic_holdings[]` schema shape
    (Tier 0 #9 above already flags this array isn't *written* anywhere yet —
    this just gives it a declared default); added
    `foreign_earned_income.physical_presence`/`bona_fide_residence`/
    `bona_fide_visa_type`/`employer_type`/`us_abode`/`revoked_past_5_years`
    (Tier 1's FeieStep gap already flagged these as missing from the UI —
    this adds the schema shape); added `nra_specific.has_us_pe`/
    `submitted_w8ben` (Tier 0 #5 and the NRA Tier 1 item already flag these
    as unwired — schema shape now exists for both); added
    `state_residency.ny_548_day_rule`/`ny_actual_days_present`/
    `ny_permanent_place_of_abode`/`footprint_details`/`sticky_exceptions`
    (Tier 0 #7's `footprint_details.NY.*` gap — schema shape now declared,
    UI/DAG-node wiring still open); added `us_residency_detail`'s
    `dual_status_arrival_date`/`dual_status_departure_date`/
    `us_days_excluded_current/minus_1/minus_2`/`us_days_excluded_reason`
    (Tier 1's "dual-status arrival/departure date fields missing" — schema
    shape now exists, UI still open).
  - Confirmed 2 apparent gaps from the export diff were false positives (the
    export just omitted them, not a React port gap):
    `retirement_accounts.hsa_coverage_type` and
    `foreign_tax_credit_other.entries` both exist correctly in `schema.js`
    already and are declared identically in `layer1_us.html`'s own usState
    literal.
  - The array-*row-shape* gap (K-1 rosters, self-employment/business branch
    structures, Section 179 asset tables, per-form-1099 tracking — Tier 0 #1
    and the Tier 1 BusinessStep items) is untouched by this pass. The export
    diff shows it's the single largest remaining gap by field count, far
    larger than everything above combined — it corroborates Tier 0 #1 at
    much higher resolution rather than adding a new finding.

- **[FIXED]** Tier 0 #1 (K-1/business income invisible to both DAG engines),
  full scope — self-employment, farm, partnership K-1, S-corp K-1, and
  trust/estate K-1 (all 5 business-income row types `BusinessStep.jsx`
  owns). Ground truth for every field name/shape was read directly from
  `layer1_us.html`'s actual sync functions (`syncSeState()` ~13569,
  `syncFarmState()` ~14148, `syncPartK1State()`/`normalizePartK1Item()`
  ~14226, `syncScorpK1State()`/`normalizeScorpK1Item()` ~15112/15729,
  `syncTrustK1State()`/`normalizeTrustK1Item()` ~16608/17053) and
  cross-checked against `aggregate_us_income.py`'s actual reads — not
  inferred from either side alone.
  - **Self-employment**: `makeSeRow()`/`SelfEmploymentSection()` rewritten to
    flat top-level `gross_receipts_usd`/`returns_and_allowances_usd`/
    `other_income_usd`/`cogs_beginning_inventory`/`cogs_purchases`/
    `cogs_labor`/`cogs_materials`/`cogs_ending_inventory`/`wages_paid_usd`/
    `se_health_insurance_usd`/`se_retirement_contrib_usd`/`vehicle_miles`/
    `home_office_sqft`/`is_specified_service_trade`, plus a derived
    `expenses_usd` (summed from `itemized_expenses{}`).
  - **Farm**: `makeFarmRow()`/`FarmSection()` rewritten to
    `itemized_income{}` (not `income{}`) and `inventory{}` with
    DAG-matching key names, flat `wages_paid_usd`, derived `expenses_usd`.
  - **Partnership/S-corp/trust K-1**: the fabricated `row.revenue{}`/
    `row.expenses{}` pair — confirmed to not exist anywhere in the real
    form's data model, since a K-1 recipient reports box values printed on
    the K-1 they received, not the underlying entity's own revenue/COGS —
    removed entirely; every K-1 box is now a flat top-level field with real
    IRS box names (`ordinary_income_usd`, `guaranteed_payments_usd`,
    `sec179_deduction_usd`, `interest_income_usd`, `stcg_usd`/`ltcg_usd`,
    `qbi_wages_usd`/`qbi_ubia_usd`, etc.), matching
    `aggregate_us_income.py`'s exact field reads including its two
    per-entity fallback-chain quirks (S-corp box 9 is `sec1231_gain_usd`,
    not `net_sec1231_gain_usd`; trust box 7 royalty is `royalty_income_usd`,
    not `royalties_usd`).
  - **New derivation layer**: `derive.js` gained
    `applyBusinessIncomeDerivations()` (self-employment/farm `expenses_usd`
    summed from `itemized_expenses{}` on every mutation, plus the
    self-employment above-the-line health-insurance/retirement-deduction
    sum-into-`income_us_source.se_health_insurance_deduction_usd`/
    `se_retirement_deduction_usd` pattern ported from
    `layer1_us.html:13638-13658`'s own documented past bug-fix comment) —
    wired into `applyDerivations()` so it runs on every store mutation,
    matching the existing residency-lock derivation's "always runs"
    architecture rather than being computed ad hoc in a component.
  - **Verified live** (Playwright + `dag_py`): each of the 5 row types
    filled independently and cross-checked against a hand calculation run
    through `aggregate_us_income.py`'s real functions
    (self-employment $93,232 net profit; farm $42,114; partnership $24,000
    business-income contribution + QBI wages/UBIA; S-corp $29,500; trust
    $10,500) — all matched exactly. A combined test with all 5 types filled
    in one session showed the DAG's `businessUsUsd` correctly summing to
    $105,000 (previously would have been ~$0 for at least 4 of the 5
    types) and a full `compute_us_tax_core` pass completing without error.
    `dag_py` pytest 591/591 still green (no DAG-engine code touched this
    pass — React-port-only fix).
  - Intentionally deferred (documented in code comments, not silently
    dropped): `addUsBranchRow` (US branches nested under these rows, ~715
    lines in the source); S-corp/trust's legacy `gross_revenue`/`exp_*`
    fields, confirmed vestigial since `ordinary_income_usd` is always
    directly entered via the Box 1 field in both the source and this port;
    partnership/S-corp K-1's `partner_ein`/`partnership_ein`/liabilities/
    profit-loss-percentage fields (not DAG-critical, redundant with the
    existing `partners[]`/`shareholders[]` sub-roster).
