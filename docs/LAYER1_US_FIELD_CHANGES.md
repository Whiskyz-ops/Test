# Layer 1 — US Intake Form: Field Changes

**Target file:** `layer1_us.html`
**Purpose of this document:** a self-contained work order for adding/adjusting fields on the US
intake form, written to be handed to an implementation agent (e.g. Antigravity) with no other
context. It assumes the agent can read the existing file to match conventions but has not seen the
conversation that produced this list.

---

## 0. Context — what this form is and the one hard rule

`layer1_us.html` is a **pure data-collection form**. It is one of two intake forms (the other is
the India form) that write JSON into `localStorage` under the key `wising_us_state`. A separate,
independent computation engine (`engine/*.js`, not part of this file) reads that JSON, normalizes
it, and performs every tax computation, conflict detection, and cross-border analysis. **This form
does not talk to the engine and should not duplicate what it does.**

### The hard rule for every change below

> **This form collects raw facts only. It must not compute derived tax figures, apply tax-rule
> logic (exemption caps, elections, exclusions), or pre-classify income into tax categories.**
> Every field the user fills in should be something they could read off a document (a W-2, a
> brokerage 1099, a K-1) or select from a fixed list — not a number the JAVASCRIPT works out for
> them. All computation belongs in the engine.

Conventions already used in this file that new fields should follow:
- Money fields are suffixed `_usd` (this form is USD-native).
- State is a plain JS object (`usState.<section>.<field>`), updated via
  `updateStateField('<section>', '<field>', value)`.
- Repeatable line items (ISO/NSO/RSU events, properties, foreign corporations, financial holdings)
  are arrays of objects rendered as add/remove "cards," each with its own `sync...State()`
  function that rebuilds the array from the DOM on every change.

---

## 1. Remove existing in-form calculations (confirmed present — this is not speculative)

Unlike the India form, these were directly confirmed in the current source and need to be fixed,
not just reviewed:

### 1a. ISO exercises (`equity_compensation.iso_exercises[]`)
Currently `syncIsoState()` computes `amt_preference_spread_usd = Math.max(0, (fmv - strike) *
shares)` in JavaScript and stores the *result*.
**Change:** keep `strike_price_usd`, `fmv_at_exercise_usd`, `shares_exercised` as the stored raw
inputs. Either drop `amt_preference_spread_usd` from the stored object entirely (the engine can
compute it from the three raw inputs), or, if a live on-screen number is useful for the user while
they type, compute it only for **display** and do not persist it as if it were an entered fact.

### 1b. NSO exercises (`equity_compensation.nso_exercises[]`)
Same pattern: `syncNsoState()` computes and stores `ordinary_income_recognized_usd = Math.max(0,
(fmv - strike) * shares)`.
**Change:** same treatment as 1a — raw `strike_price_usd`/`fmv_at_exercise_usd`/`shares_exercised`
only; drop or demote the computed field.

### 1c. RSU vestings (`equity_compensation.rsu_vestings[]`)
`syncRsuState()` computes and stores `gross_income_usd = fmv_at_vest_usd * shares_vested`.
**Change:** same treatment — keep `fmv_at_vest_usd` and `shares_vested` as raw inputs, drop or
demote `gross_income_usd`. (Also see §3 below — this array needs new fields added at the same
time, so do this cleanup as part of that change, not separately.)

### 1d. Real estate property transactions (`real_estate.properties[]`)
`syncPropertiesState()` does more than compute a number — it **applies tax elections itself**:
it computes `rawGain = price - basis`, then if `s121_exclusion_claimed` is checked it subtracts the
§121 primary-residence exclusion limit ($250k/$500k by filing status, with the $500k figure
hardcoded in the JS), and if `s1031_like_kind_exchange` is checked it zeroes the gain entirely —
storing the final result as `realized_gain_loss_usd`.
**Change:** keep the raw inputs only — `acquisition_date`, `sale_date`, `cost_basis_usd`,
`sale_price_usd`, and the two boolean election flags (`s121_exclusion_claimed`,
`s1031_like_kind_exchange`). Remove the gain calculation and the exclusion-amount/zeroing logic
from this file entirely; the engine must apply §121/§1031 treatment, including the correct
current-law exclusion limits (do not assume the $250k/$500k figures are still correct without
checking — but that check belongs in `engine/constants.js`, not here).

### 1e. FEIE housing exclusion (`foreign_earned_income.*`)
The form stores `housing_exclusion_base_usd` (hardcoded `21264`) and `housing_exclusion_cap_usd`
(hardcoded `39870`) as if they were user data, computes `foreign_housing_exclusion_usd` from them
and `foreign_housing_expenses_usd`, and even subtracts the result from a locally-tracked `agi`
figure inside the form.
**Change:** keep only `foreign_housing_expenses_usd` as a raw user-entered input (what they
actually spent on foreign housing). Remove `housing_exclusion_base_usd`, `housing_exclusion_cap_usd`,
`foreign_housing_exclusion_usd`, and the AGI adjustment from this file — the base/cap amounts are
statutory figures that change periodically and belong in `engine/constants.js`, and the exclusion
computation (plus the no-double-dip interaction with the base FEIE amount) belongs in
`engine/computation.js` alongside the existing FEIE logic.

### 1f. NRA ECI/FDAP classification (`nra_specific.us_eci_income_usd` / `us_fdap_income_usd`)
The form currently sums wages + self-employment into `us_eci_income_usd`, and interest + ordinary
dividends + rental into `us_fdap_income_usd`, as a derived classification step.
**Change:** this one is lower priority to rip out immediately since the underlying raw amounts
(wages, self-employment, interest, dividends, rental) are already separately captured elsewhere on
this form — the classification is arguably just a convenience rollup rather than new information.
If time allows, remove these two derived fields and let the engine do the ECI/FDAP classification
directly from the underlying line items; if not, at minimum do not add any *new* logic of this kind
elsewhere in the form.

---

## 2. New section: GILTI / CFC inputs

**Why:** `foreign_entities.foreign_corporations[]` currently carries little beyond name/country/
ownership%, and is auto-populated from Indian business data with a placeholder
`gilti_income_usd = net_profit_inr / 83` and a hardcoded `subpart_f_income_usd: 0` — neither of
which is real user-entered data. The engine has no way to compute an actual GILTI/Subpart F
inclusion without the real inputs.

**Where:** `foreign_entities.foreign_corporations[]`, add fields to each entry (remove the
`gilti_income_usd`/`subpart_f_income_usd` placeholder auto-fill logic — leave those fields blank/
null on auto-hydration from the India side rather than guessing a value):

| Field | Type | Notes |
|---|---|---|
| `tested_income_usd` | number | The CFC's net income computed under US tax principles for the year — a figure the preparer supplies, not derived here. |
| `qbai_usd` | number | Qualified Business Asset Investment — average adjusted basis of depreciable tangible property. |
| `e_and_p_usd` | number | Earnings & profits. |
| `subpart_f_income_usd` | number | Passive/foreign-personal-holding-company-type income — raw entry, remove the hardcoded `0`. |
| `foreign_tax_paid_by_cfc_usd` | number | Needed for the §960 indirect credit and the GILTI high-tax exclusion test. |

---

## 3. Equity compensation: cross-border sourcing data

**Why:** to support a conflict-detection finding that catches the same multi-year equity award
being fully taxed by both India (as an ESOP perquisite) and the US (as RSU-vest/NSO-exercise
ordinary income), the engine needs grant dates and a workday split — not just amounts.

**Where:** `equity_compensation.rsu_vestings[]`, `equity_compensation.iso_exercises[]`,
`equity_compensation.nso_exercises[]` — add to each entry:

| Field | Type | Notes |
|---|---|---|
| `grant_date` | date | RSU vestings don't currently have this at all; ISO exercises already do — add it to RSU and NSO for consistency. |
| `total_workdays_during_vesting_period` | number | Total workdays between grant and vest/exercise. |
| `workdays_in_india_during_vesting_period` | number | Subset of the above physically worked in India. Raw counts — do not compute a sourcing percentage in this file. |

---

## 4. Real estate: depreciable basis for ongoing rental holdings

**Why:** `real_estate.properties[]` today is oriented entirely toward a sale/disposition record
(acquisition date, cost basis, sale price — see §1d above). For a property still being rented
(`transaction_type === "holding"`), there's no way to capture what's needed to compute an ongoing
annual depreciation deduction.

**Where:** `real_estate.properties[]`, add fields (relevant when `transaction_type === "holding"`):

| Field | Type | Notes |
|---|---|---|
| `depreciable_basis_usd` | number | Building basis only (land is not depreciable). |
| `land_value_usd` | number | Separated out so the engine isn't left guessing the building/land split. |
| `placed_in_service_date` | date | When the property was placed in rental service (starts the depreciation clock; may differ from `acquisition_date`). |

Do not compute or store an annual depreciation amount here — that's MACRS/straight-line logic that
belongs in `engine/computation.js`.

---

## 5. New section: OBBBA temporary provisions (2025–2028)

**Why:** the One Big Beautiful Bill Act (signed July 2025) added several temporary individual
deductions that this form currently has no fields for at all.

**Where:** new fields, plausibly a new `obbba_temporary_deductions` section, or alongside the most
relevant existing sections (wages for tips/overtime, itemized deductions for the auto loan
interest, profile for senior status) — pick whichever fits the form's existing organization better:

| Field | Type | Notes |
|---|---|---|
| `qualified_tips_usd` | number | Tips received in an occupation on the IRS's published list as of 12/31/2024. Raw amount only — do not apply the $25,000 cap or the MAGI phase-out here. |
| `qualified_overtime_pay_usd` | number | The FLSA-required "half" premium portion of overtime pay only (not the full overtime wage). Raw amount — not available for MFS filers, but that's a filing-status gate the engine should enforce, not this form. |
| `new_auto_loan_interest_usd` | number | Interest paid on a **new** loan for a vehicle with final assembly in the US. |
| `vehicle_final_assembly_in_us` | boolean | Eligibility fact paired with the above — without this, the engine can't tell if the loan qualifies. |

**Senior deduction (age 65+):** before adding a new field, check whether `profile.date_of_birth`
already exists for the primary filer and add a matching `spouse_date_of_birth` field if the spouse's
DOB isn't already captured somewhere (needed because the deduction is tested per-qualifying-spouse
under MFJ). If both DOBs are already available elsewhere on the form, no new field is needed here —
the engine can derive age-eligibility itself. Do not add a "senior deduction amount" field; that's
computed, not collected.

---

## 6. Verify — figures that must NOT be hardcoded into this form

While making the changes above, check the rest of the file for any other place that hardcodes a
tax-law figure that changes periodically (deduction caps, exemption amounts, credit phase-outs,
percentage rates) the way the FEIE housing base/cap and the §121 exclusion limit were. If found,
strip the hardcoded figure and keep only the underlying raw fact — the actual number belongs in
`engine/constants.js` so it can be updated in one place per tax year.

---

## Summary of changes for a quick implementation checklist

- [ ] §1a–1c: remove computed `amt_preference_spread_usd` / `ordinary_income_recognized_usd` / `gross_income_usd` from ISO/NSO/RSU — keep raw strike/FMV/shares only
- [ ] §1d: remove gain calculation + §121/§1031 application from `real_estate.properties[]` — keep raw dates/basis/price + election checkboxes only
- [ ] §1e: remove hardcoded FEIE housing base/cap and the computed exclusion/AGI adjustment — keep only raw `foreign_housing_expenses_usd`
- [ ] §1f: (lower priority) remove derived `us_eci_income_usd` / `us_fdap_income_usd` rollups
- [ ] §2: add GILTI/CFC fields (`tested_income_usd`, `qbai_usd`, `e_and_p_usd`, `subpart_f_income_usd`, `foreign_tax_paid_by_cfc_usd`) to `foreign_corporations[]`; remove the placeholder auto-fill guess
- [ ] §3: add `grant_date` (RSU/NSO) and workday-split fields to ISO/NSO/RSU entries
- [ ] §4: add `depreciable_basis_usd`, `land_value_usd`, `placed_in_service_date` to rental `real_estate.properties[]` entries
- [ ] §5: add OBBBA temporary-provision fields (tips, overtime, auto loan interest + eligibility); confirm spouse DOB is captured for the senior deduction
- [ ] §6: sweep for any other hardcoded tax-law figures and strip them
