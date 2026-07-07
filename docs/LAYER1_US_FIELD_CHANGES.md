# Layer 1 — US Intake Form: Field Changes (precise edit locations)

**Target file:** `layer1_us.html` (single-file HTML+JS app, no build step)
**Purpose:** an exact, line-anchored work order for Antigravity. Every item below names the
specific function, state key, and (as of this writing) line number to edit. **Line numbers will
shift after your first edit** — re-locate subsequent items by the function/id name given (e.g.
search for `function syncIsoState`), not by the stale line number, once you've started editing.

---

## 0. The one hard rule

This form only writes JSON to `localStorage['wising_us_state']`. A separate engine
(`engine/*.js`, not in this file) reads that JSON and does 100% of the tax computation. **This form
must collect raw facts only — no computed tax figures, no tax-rule application (exemptions,
elections, exclusions), no income classification.** Section 1 below lists six places where this
rule is currently violated; fix all six as part of this work, not just the new fields in sections
2–5.

Conventions already used in this file — follow them for every new field:
- Money fields end in `_usd`.
- `updateStateField('<section>', '<field>', value)` is the standard setter for simple fields.
- Repeatable rows (ISO/NSO/RSU/property/corp entries) each have: an `add<X>Row(data=null)` function
  that renders a card and pre-fills it if `data` is passed (used when restoring saved state), a
  `sync<X>State()` function bound to every input's `oninput`/`onchange` that rebuilds the whole
  array from the current DOM and writes it to `usState`, and three other places every such array
  appears: (a) the initial `usState = {...}` declaration, (b) the "reset form" function that
  re-initializes `usState`, (c) the "restore from saved JSON" function that copies matching arrays
  out of `savedState`, and (d) the "populate DOM on load" function that calls
  `savedArray.forEach(x => add<X>Row(x))`. **When adding a field to a repeatable row, you must touch
  all four of these**, or the field will silently not survive a save/reload cycle.

---

## 1. Remove six confirmed in-form calculations

### 1a. ISO exercises — `equity_compensation.iso_exercises[]`
- Row renderer: `function addIsoRow(data = null)` at **line 15507**.
- Sync/calc function: `function syncIsoState()` (a few lines after `addIsoRow`, look for
  `document.querySelectorAll('.iso-card')`). It currently does:
  ```js
  const spread = Math.max(0, (fmv - strike) * shares);
  if (div.querySelector('.iso-pref')) div.querySelector('.iso-pref').value = spread.toFixed(2);
  list.push({ ..., amt_preference_spread_usd: spread });
  ```
- **Change:** delete the `spread` calculation and stop pushing `amt_preference_spread_usd` into the
  stored object. Keep `strike_price_usd`, `fmv_at_exercise_usd`, `shares_exercised` as the only
  numeric outputs. If you want to leave the `.iso-pref` on-screen field as a live convenience
  display for the user, that's fine — just don't persist it into `usState`/localStorage as if it
  were entered data.

### 1b. NSO exercises — `equity_compensation.nso_exercises[]`
- Row renderer: `function addNsoRow(data = null)` (immediately follows `addIsoRow`, ~line 15606).
- Sync function: `function syncNsoState()`. Same pattern:
  ```js
  const income = Math.max(0, (fmv - strike) * shares);
  list.push({ ..., ordinary_income_recognized_usd: income });
  ```
- **Change:** same treatment as 1a — drop the computed `ordinary_income_recognized_usd`, keep
  `strike_price_usd`/`fmv_at_exercise_usd`/`shares_exercised` as raw inputs.

### 1c. RSU vestings — `equity_compensation.rsu_vestings[]`
- Row renderer: `function addRsuRow(data = null)` at **line 15699**.
- Sync function: `function syncRsuState()`. Computes `income = fmv * shares` and stores it as
  `gross_income_usd`.
- **Change:** drop the computed `gross_income_usd`; keep `fmv_at_vest_usd`/`shares_vested` as raw.
  **Do this in the same pass as §3 below**, since you're adding new fields to this exact function.

### 1d. Real estate property transactions — `real_estate.properties[]`
- Row renderer: `function addPropertyRow(data = null)` at **line 16460**.
- Sync function: `function syncPropertiesState()` (look for `.property-card`), ~line 16553. It
  currently:
  ```js
  const rawGain = price - basis;
  if (isS1031) finalGain = 0;
  else if (isS121) {
      const limit = usState.profile.filing_status === 'mfj' ? 500000 : 250000;
      finalGain = Math.max(0, rawGain - limit);
  }
  list.push({ ..., realized_gain_loss_usd: finalGain, s121_exclusion_claimed: isS121, s1031_like_kind_exchange: isS1031 });
  ```
  This is worse than 1a–1c: it doesn't just compute a number, it **applies the §121/§1031 tax
  elections itself**, including a hardcoded `$250,000`/`$500,000` exclusion limit.
- **Change:** delete the entire `rawGain`/`finalGain`/`limit` block. Keep only the raw inputs:
  `acquisition_date`, `sale_date`, `cost_basis_usd`, `sale_price_usd`, and the two checkboxes
  (`s121_exclusion_claimed`, `s1031_like_kind_exchange`) as plain booleans with no computed
  consequence in this file. The engine must compute the gain and apply the elections — including
  looking up the current exclusion limit itself rather than trusting a hardcoded figure baked into
  a form.

### 1e. FEIE housing exclusion — `foreign_earned_income.*`
- State init: **lines 4005–4008** — `foreign_housing_expenses_usd: null`,
  `housing_exclusion_base_usd: 21264`, `housing_exclusion_cap_usd: 39870`,
  `foreign_housing_exclusion_usd: 0`. The base/cap are hardcoded statutory figures living in a data
  file, which is exactly the anti-pattern this section is about.
- Input: **line 2844**, `id="feie-housing"`, `oninput="updateStateField(...); calculateFeieExclusion();"`.
- Calc function: `function calculateFeieExclusion()` at **line 6869**. Also referenced at
  **line 8990** (`agi -= usState.foreign_earned_income.foreign_housing_exclusion_usd || 0;` — the
  form is tracking its own AGI approximation, which is itself out of scope for this file) and
  **lines 9109–9115** (recomputes `houseExcl` using the hardcoded base/cap and stores it into
  `foreign_housing_exclusion_usd`).
- Reset block: **lines 17162–17166** re-initializes the same four fields.
- **Change:**
  1. Keep only `foreign_housing_expenses_usd` as a raw, user-entered field.
  2. Delete `housing_exclusion_base_usd`, `housing_exclusion_cap_usd`, `foreign_housing_exclusion_usd`
     from all four locations (init, reset, the calc function, and the AGI line at 8990).
  3. Remove the `calculateFeieExclusion()` call from the `id="feie-housing"` input's `oninput`
     handler (line 2844) — or repurpose the function to update a clearly-labeled "estimate for your
     reference only, not used for filing" display, but do not write its result into persisted state.
  4. The statutory base/cap figures belong in `engine/constants.js`, and the actual exclusion +
     no-double-dip-with-base-FEIE computation belongs in `engine/computation.js`'s existing FEIE
     logic — not in this file.

### 1f. NRA ECI/FDAP classification — `nra_specific.us_eci_income_usd` / `us_fdap_income_usd`
- State init: **line 4106** (`nra_specific: {`), fields at nearby lines (`us_eci_income_usd: 0`,
  `us_fdap_income_usd: 0` — check the object body right after line 4106).
- Calc block: **lines 9229–9256**, under the comment `// 6. NRA ECI & FDAP Mappings`. Sums
  `wages_w2[]` + `self_employment[]` net into `eci`, and `interest_us_source_usd` +
  `ordinary_dividends_us_source_usd` + `rental_income_us_source_usd` into `fdap`, then stores both.
- **Change (lower priority than 1a–1e, but do it if time allows):** the underlying raw amounts
  (wages, self-employment, interest, dividends, rental) are already captured elsewhere on this form
  independently of this block — this classification step is redundant derived data, not new
  information. Remove the block at lines 9229–9256 and the two stored fields; let the engine
  classify ECI vs. FDAP directly from the raw line items it already reads. If you're short on time,
  it's acceptable to leave this one as-is and focus on 1a–1e, which are higher-impact.

---

## 2. New fields: GILTI / CFC inputs on `foreign_entities.foreign_corporations[]`

**Found while locating this section — a schema mismatch you should fix at the same time:** there
are **two different code paths that write into the same `foreign_corporations[]` array with two
different field shapes**:

- The manual-entry UI — `function addCorpRow(data = null)` at **line 16588**, sync function
  `function syncCorpState()` at **line 16658** — produces objects shaped like:
  `{ corporation_name, country_of_incorporation, ownership_percentage, tax_year_start,
  transition_to_ncti_post_2026, cfc_status }`. Note `syncCorpState()` also **derives** `cfc_status`
  in-form (`const isCfc = pct > 50;` at line 16662) — this is itself a violation of the hard rule,
  and also uses the wrong test (US CFC status depends on >50% combined vote/value held by US
  shareholders in aggregate, not a single owner's raw %, and this codebase's own engine uses a 10%
  ownership threshold for Form 5471 purposes elsewhere). **Remove the `isCfc`/`cfc_status`
  derivation** — store `ownership_percentage` as a raw fact and let the engine decide CFC status.

- An auto-hydration bridge (around **lines 17502–17511**, inside the "hydrate India business data
  into US foreign entities" block) pushes objects shaped like: `{ corp_name, country,
  subpart_f_income_usd: 0, gilti_income_usd: (net_profit_inr / 83) }` — **different field names
  entirely**, plus a fabricated `gilti_income_usd` guess using a hardcoded FX rate of 83, and a
  hardcoded `subpart_f_income_usd: 0`.

**Change:**
1. Unify on the manual-entry field names (`corporation_name`, `country_of_incorporation`,
   `ownership_percentage`) — update the auto-hydration block at lines 17502–17511 to use these same
   keys instead of `corp_name`/`country`.
2. Delete the fabricated `gilti_income_usd: (net_profit_inr / 83)` and `subpart_f_income_usd: 0`
   from the auto-hydration block — leave those fields blank so the user is prompted to fill in real
   data, rather than silently seeding a fake number.
3. Add these new fields to the `addCorpRow` card template and to the `syncCorpState()` push object
   (all raw entries):

   | Field | Type |
   |---|---|
   | `tested_income_usd` | number |
   | `qbai_usd` | number |
   | `e_and_p_usd` | number |
   | `subpart_f_income_usd` | number (now a real input, not a hardcoded 0) |
   | `foreign_tax_paid_by_cfc_usd` | number |

4. Update the other three touchpoints for this array: the initial state declaration
   (`foreign_corporations: []` at **line 4036**), the reset function (`foreign_corporations: []` at
   **line 17194**), and the restore-from-saved-JSON line (**line 17664**) — none of these need field
   -level changes since the array is copied wholesale, but confirm they still work once the object
   shape changes.

---

## 3. New fields: equity-comp cross-border sourcing (grant date + workday split)

Add to all three of the row templates/sync functions touched in §1a–1c
(`addIsoRow`/`syncIsoState` line 15507, `addNsoRow`/`syncNsoState` ~15606, `addRsuRow`/`syncRsuState`
line 15699):

| Field | Type | Notes |
|---|---|---|
| `grant_date` | date | ISO exercises already have this (check the existing `.iso-grant` input) — add the equivalent to the NSO and RSU cards, which don't have it today. |
| `total_workdays_during_vesting_period` | number | |
| `workdays_in_india_during_vesting_period` | number | Raw counts only — do not compute a percentage here. |

Remember the four touchpoints rule from §0 for each of these three arrays (init ~line 3987 block,
reset ~line 17145 block, restore ~lines 17658–17661, DOM-populate-on-load loops that call
`addIsoRow`/`addNsoRow`/`addRsuRow`).

---

## 4. New fields: rental-property depreciable basis on `real_estate.properties[]`

Same array as §1d (`addPropertyRow` line 16460, `syncPropertiesState` line 16553), state init at
**line 4014** (`real_estate: {`). The existing card is oriented around a sale/disposition
(`transaction_type` dropdown has `holding`/`sale` per the code at line 16489-16490) — add these
fields, relevant when `transaction_type === "holding"`:

| Field | Type |
|---|---|
| `depreciable_basis_usd` | number |
| `land_value_usd` | number |
| `placed_in_service_date` | date |

Do not compute or display an annual depreciation figure in this file.

---

## 5. New section: OBBBA temporary provisions (2025–2028)

There's no existing section to extend here — build a new one. **Use the FEIE section as your
structural template** (find it via `foreign_earned_income:` at line ~4001 for the state shape, and
the surrounding HTML card starting a bit before line 2844 for the UI pattern): a bordered card with
a header, plain labeled inputs, each wired with `updateStateField('obbba_temporary_deductions',
'<field>', value)`. Add a new top-level state key `obbba_temporary_deductions` (put it near
`itemized_deductions_and_credits`, which starts at **line 4049**, for organizational proximity) —
remember to add it to all four touchpoints (init, reset, restore, DOM-populate — see §0).

| Field | Type | Notes |
|---|---|---|
| `qualified_tips_usd` | number | Raw tips received. No cap/phase-out logic here. |
| `qualified_overtime_pay_usd` | number | The FLSA "half" premium portion only — raw amount. |
| `new_auto_loan_interest_usd` | number | Interest paid on a new loan for a US-assembled vehicle. |
| `vehicle_final_assembly_in_us` | boolean | Paired eligibility fact for the field above. |

**Senior deduction (age 65+):** check whether `profile.date_of_birth` already exists (search for
`'profile', 'date_of_birth'`) and whether a spouse DOB field exists anywhere in `profile`. If a
spouse DOB field is missing, add `spouse_date_of_birth` to `profile` — needed because the deduction
is tested per-qualifying-spouse under MFJ. Do not add a "senior deduction amount" field; that's
computed by the engine.

---

## 6. Final sweep

While you're in this file for the above, grep for any other hardcoded dollar/percentage figures
being used to compute a stored result (the same anti-pattern as the FEIE housing base/cap and the
§121 exclusion limit in §1d/§1e) and flag them even if you don't have time to fix them all — leave
a `// TODO(engine-migration):` comment at each one you don't fix in this pass.

---

## Implementation checklist

- [ ] §1a: `addIsoRow`/`syncIsoState` (~15507) — drop computed `amt_preference_spread_usd`
- [ ] §1b: `addNsoRow`/`syncNsoState` (~15606) — drop computed `ordinary_income_recognized_usd`
- [ ] §1c: `addRsuRow`/`syncRsuState` (15699) — drop computed `gross_income_usd`
- [ ] §1d: `addPropertyRow`/`syncPropertiesState` (16460) — drop gain calc + §121/§1031 application
- [ ] §1e: FEIE housing (2844, 4005–4008, 6869, 8990, 9109–9115, 17162–17166) — drop hardcoded base/cap + computed exclusion + AGI line
- [ ] §1f: NRA ECI/FDAP (4106, 9229–9256) — lower priority, drop derived rollup if time allows
- [ ] §2: unify `foreign_corporations[]` schema (16588/16658 vs. 17502–17511), drop derived `cfc_status` and fabricated GILTI guess, add 5 new GILTI raw-input fields
- [ ] §3: add `grant_date` + workday-split fields to ISO/NSO/RSU rows (all 4 touchpoints each)
- [ ] §4: add `depreciable_basis_usd`/`land_value_usd`/`placed_in_service_date` to `real_estate.properties[]`
- [ ] §5: new `obbba_temporary_deductions` section (tips, overtime, auto loan interest + eligibility); confirm/add spouse DOB
- [ ] §6: sweep + TODO-comment any remaining hardcoded tax-law figures
