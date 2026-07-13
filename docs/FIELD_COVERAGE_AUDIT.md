# Field Coverage Audit — 13 July 2026

Triggered by a direct question: *"Are you 100% sure the right number reaches the
engine?"* The honest answer at the time was no — every fix up to that point had
been reactive (chasing a reported symptom), not a systematic sweep. This is that
sweep, plus the regression harness needed to keep the answer "yes" going forward.

## Method

1. **Ground truth of what the engine reads.** Every `safe(obj, "path", default)`
   call in `engine/normalize.js` was extracted mechanically (`grep -oE`) into a
   flat list of ~220 field paths — the complete set of data the tax-computation
   engine can possibly see, since `normalize.js` is the only file that reads the
   raw Layer 1 states.
2. **Ground truth of what the forms collect.** The `state`/`usState` object
   literals at the top of `layer1_india.html` / `layer1_us.html` (the full
   schema each form initializes and persists) were read in full and cross-
   referenced against the list above, field by field, by hand — not by grep
   alone. This session's own prior experience (documented in git history)
   showed naive grep produces false positives in both directions: renamed
   local variables and indirection functions can make a live field look dead,
   and vice versa. Every candidate gap below was confirmed by reading the
   actual read/write code, not just counting matches.
3. **Verification.** Every fix was checked two ways: a Node-level regression
   suite (`tests/engine/run.js`, synthetic fixtures with hand-traceable marker
   values, run through `normalize()`/`compute()` and asserted against hand-
   derived expected numbers) and, for the one fix that was pure DOM wiring
   (not engine logic), a real headless-Chromium interaction test confirming
   the browser actually persists and restores the value.

## What this pass covers, and what it doesn't

This was a field-mapping/wiring audit, not a tax-law correctness audit. It
answers "does data the taxpayer enters reach the computation," not "is the
computation itself correct once the data arrives." The latter is
`docs/GAP_TRACKER.md`'s job — 31 buildable-now gaps remain there untouched by
this pass. Coverage here is also not exhaustive: the two Layer 1 forms are
~20,000–30,000 lines each with dozens of income/deduction/credit/compliance
categories. This pass found and fixed every gap the method above surfaced, but
that method has real limits (documented per-finding below) — it is not a proof
that zero gaps remain.

## Findings and fixes

### India (`engine/normalize.js`, `engine/computation.js`)

- **`commodities.transactions` / `unlisted_equity.transactions` never read
  anywhere in the engine.** Layer 1's Commodities module (physical gold/
  silver, Sovereign Gold Bonds, gold ETF/FoF) and Private-Shares-Transferred
  module (unlisted company shares) were fully collected and even rendered
  back onto the form (this session's earlier wiring work made them
  *visible*), but zero code in `normalize.js`/`computation.js`/`conflicts.js`
  ever referenced either field. A real gain here was invisible to tax
  computation regardless of how carefully it was entered. Fixed: both are now
  classified into the existing capital-gains buckets (physical gold/silver →
  general 24-month s.112 threshold; SGB → listed 12-month threshold unless
  redeemed at maturity, which is exempt under s.47(viic); gold ETF/FoF →
  s.50AA always-short-term; unlisted shares → general s.112/s.197 24-month
  threshold). See gap tracker IN-27.
- **8 "Other Sources" fields collected but never read**: gifts above ₹50,000
  (s.56(2)(x)), family pension (net of the s.57(iia) standard deduction),
  spousal income clubbing net of the minor-child exemption, non-exempt LIC
  maturity proceeds, angel-tax share premium, less the local-authority
  exemption, miscellaneous residual income, and — despite being read
  elsewhere for the US cross-border exposure figure — taxable EPF interest/
  NPS withdrawal were never added to India's *own* taxable total. All 8 fed
  the form's own on-page live-preview total (`evaluateSurchargeBuckets`'s
  `otherSourcesAdditions`/`normalSlab`) but were absent from the real engine,
  so the live preview shown on the form and the actual computed tax could
  disagree. Fixed: summed into a new `otherSourcesMisc` bucket using the
  exact same formula the form's own preview uses. See gap tracker IN-28.
- **6 of 11 Chapter VI-A deduction sections never read**: 80DD/80U
  (disability, flat amount by severity), 80DDB (medical treatment, capped by
  patient age band), 80E (education loan interest, uncapped), 80EEA/80EE
  (affordable-home-loan interest, capped by loan-sanction-date window),
  80GGB/80GGC (political donations, uncapped), 80GG (rent paid without HRA,
  the classic 3-way minimum against gross total income). The engine
  previously consumed only 80C/80CCD(1B)/80CCD(2)/80D/80TTA-TTB. Fixed, with
  80GG's income-dependent cap applied inside `computeIndiaTax` where gross
  total income is already available. **Deliberately not fixed**: 80G
  (donations) — each entry needs its own 50%/100%-with/without-qualifying-
  limit categorization and the qualifying-limit categories cap at 10% of
  adjusted gross total income per donation, a genuinely more complex,
  gross-income-dependent computation than the other 6; guessing at it risked
  a wrong number being worse than the honest ₹0 gap. See gap tracker IN-9,
  IN-29.

### US (`engine/normalize.js`, `engine/computation.js`, `layer1_us.html`)

- **Child & Dependent Care Credit read a field name that exists nowhere in
  the form.** The engine read `dependent_care_expenses_usd`; the form's
  `#ded-care` input actually writes `child_and_dependent_care_expenses_usd`.
  The credit computed to $0 for every filer no matter what was entered.
  Fixed. See gap tracker US-19.
- **SE health-insurance (§162(l)) and SE retirement-plan (SEP-IRA/Solo 401k)
  above-the-line deductions collected but never read.** Layer 1's
  `#se-ded-health`/`#se-ded-ret` inputs correctly persisted to
  `income_us_source`; the engine never read either back out, so a
  self-employed filer's AGI was always overstated by the full amount of
  both. Fixed — applied above-the-line alongside student-loan interest and
  half the SE tax deduction. See gap tracker US-20.
- **AMT private-activity-bond interest read the wrong field paths.** The
  engine checked `itemized_deductions_and_credits.private_activity_bond_
  interest_usd` and `amt.private_activity_bond_interest_usd` — neither
  exists. The real path the form's `#amt-private-bond` input writes is
  `amt_inputs.private_activity_bond_interest_usd`. Fixed (old paths kept as
  harmless no-op fallbacks). See gap tracker US-21.
- **The entire "Passive & Other Income" screen (Schedule B/E, 1099-G) had no
  `oninput`/`onchange` handler on most of its inputs at all** — not a
  field-name mismatch like the findings above, but literally no code path
  from the DOM to `usState`. Typing into these fields did nothing, for any
  user, demo profile or real. Confirmed by checking every reference to each
  input's `id`: only the *restore* direction (state → DOM on page load)
  existed; no *save* direction (DOM → state) did. **Fixed for the four
  fields the engine already reads**: US interest (bank + treasury + OID +
  seller-financed summed into the one taxable total the engine reads;
  tax-exempt interest tracked separately and correctly excluded from the
  taxable sum), ordinary dividends, qualified dividends, rental income —
  new `syncUsInterestTotal()` wiring, verified end-to-end with a live
  Chromium interaction test (type → check `localStorage` → reload → confirm
  DOM restoration). Restoring the new interest sub-fields on reload required
  a second fix: `initFromLocalStorage()` merges `income_us_source` via a
  hand-curated field allowlist, not a generic merge, and the four new
  fields weren't in that list — found only by the Playwright test failing
  after the write-side fix already looked correct in isolation. **Still
  entirely unwired** (no `id`, no handler — would need new schema fields and
  engine-side tax treatment decided for each, not just a wiring fix): state/
  local tax refunds, unemployment compensation, alimony received, royalties,
  cancellation of debt, HSA/MSA distributions, misc/gambling income, and a
  Social Security input that duplicates a working field reachable elsewhere
  in the form. See gap tracker US-22.
- **No manual-entry UI exists at all for US capital gains.** The engine reads
  `stcg_us_source_usd`/`ltcg_us_source_usd`, and the form's own restore code
  references `#inc-us-stcg`/`#inc-us-ltcg` — but neither element exists
  anywhere in the DOM. For a real user (as opposed to a hand-authored demo
  profile that injects the field directly), there is currently no way to
  enter US capital gains at all. Not fixed this pass — needs new input
  elements, not just a handler on an existing one. See gap tracker US-23.

## What this pass explicitly did not attempt

- A full field-by-field audit of every deduction/credit sub-category in
  either form (there are dozens; this pass was driven by the read-inventory
  cross-reference, which surfaces *missing* engine reads efficiently but
  doesn't independently re-verify categories that already had a working
  read).
- Re-verifying tax LAW correctness for anything not touched here — that's
  `docs/GAP_TRACKER.md`'s 31 remaining buildable-now items.
- The commodities/unlisted-equity classification rules added here got a
  single verification pass, not the multi-source-verified treatment the
  pre-existing financial-holdings classification received — flagged
  inline in the code and re-flagged here.

## Regression harness

`tests/engine/run.js` (`npm test`) — plain Node, no framework, matching the
engine's own no-bundler philosophy. Two layers:

1. Fixture assertions (`tests/engine/fixtures.js`): synthetic India/US raw
   states with hand-traceable marker values, run through `normalize()`/
   `compute()`, checked against hand-derived expected numbers. Exists
   specifically to catch "field silently never reaches the engine" —
   the exact failure mode every finding above was.
2. Demo-profile smoke test: all 9 `engine/profiles.js` `WISING.PROFILES`
   run through `analyze()` and must not throw or return `NaN`.

20 assertions, all passing as of this commit. This did not exist before this
session — previously every verification in this repo's history was a manual,
one-off browser check with no regression protection against a future edit
reintroducing the same class of bug.
