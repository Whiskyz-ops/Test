# Layer 1 — India Intake Form: Field Changes (precise edit locations)

**Target file:** `layer1_india.html` (single-file HTML+JS app, no build step)
**Purpose:** an exact, line-anchored work order for Antigravity. Every item below names the
specific function, state key, and (as of this writing) line number to edit. **Line numbers will
shift after your first edit** — re-locate subsequent items by the function/id name given, not by
the stale line number, once you've started editing.

---

## 0. The one hard rule

This form only writes JSON to `localStorage['wising_layer1_india_state']`. A separate engine
(`engine/*.js`, not in this file) reads that JSON and does 100% of the tax computation. **This form
must collect raw facts only — no computed tax figures, no tax-rule application, no derived
classifications written into persisted state.** Section 1 checks for and fixes one confirmed
violation; two other candidate areas were checked and found clean (see §1.2/§1.3) — don't
"fix" those, they're already correct.

Conventions already used in this file:
- Money fields end in `_inr`.
- `updateStateField('<section>', '<field>', value)` and section-specific helpers (e.g.
  `updateSalaryNum('<field>', value)`, `updateBizExpense`) are the standard setters.
- Repeatable rows (financial holdings, business entries, asset blocks) follow the same
  add/sync/reset/restore/populate pattern documented in the companion US document — when you touch
  a repeatable array, update all of: the state init, the reset function, the restore-from-saved
  function, and the DOM-populate-on-load loop.
- India income is captured **per-quarter** under `state.quarters.Q1..Q4`, then summed to an annual
  figure by `aggregateAnnualState()`. Any new per-quarter-relevant field needs to be added inside
  the quarter-scaffolding logic too, not just the top-level `state` object — check how existing
  fields near your edit point are scaffolded into `addAssetBlock`'s quarter-propagation loop
  (**lines 8092–8110**) as a working example of the pattern.

---

## 1. Review pass results

### 1.1 CONFIRMED VIOLATION — `evaluateSurchargeBuckets()`
- Function starts at **line 11332**.
- At **lines 11654–11660**, it writes computed, classified totals into persisted state:
  ```js
  state.surcharge_buckets.income_normal_slab_inr         = normalSlab;
  state.surcharge_buckets.income_dividend_inr            = activeDivInt;
  state.surcharge_buckets.income_stcg_111A_inr           = stcg111A;
  state.surcharge_buckets.income_ltcg_112A_inr           = ltcg112A;
  state.surcharge_buckets.income_ltcg_112_inr            = ltcg112;
  state.surcharge_buckets.income_special_115BB_115BBJ_inr = gaming + lotteryWin;
  state.surcharge_buckets.income_special_115A_inr        = special115AIncome;
  ```
  These are derived from other already-collected fields (they aren't new facts the user is
  supplying) — the engine already treats this whole section as non-authoritative (per
  `docs/COVERAGE_AND_ARCHITECTURE.md`: "engine recomputes surcharge itself... Consistency [only]").
- **Change:** this is a cleanup, not urgent (the engine doesn't rely on it), but consistent with the
  hard rule: either remove the write-back into `state.surcharge_buckets.*` and keep the computation
  purely as an internal/local variable for any on-screen preview the surrounding UI shows, or leave
  a `// TODO(engine-migration): derived, not authoritative` comment at lines 11654–11660 if you
  don't have time to fully remove it this pass. Do not let this block any of the higher-priority
  work below.

### 1.2 VERIFIED CLEAN — capital gains / financial holdings transactions
Checked `syncFinancialState()` (around **lines 8833–8850**, look for `.fin-card`) and the
`financial_holdings` transaction shape it pushes: `asset_class`, `quantity`, `acquisition_date`,
`purchase_value`, `purchase_currency`, `fmv_31jan2018_per_unit_inr`, `sale_date`, `sale_value`,
`sale_currency`, `stt_paid`, `transfer_expenses`. **No gain/loss is computed or stored here** — this
is already raw-input-only. No action needed. (This corrects an earlier, less-verified version of
this document that flagged this section as a possible concern.)

### 1.3 VERIFIED CLEAN — depreciation `asset_blocks`
Checked `window.addAssetBlock` (**line 8075**) and the object it pushes (**lines 8080–8090**):
`asset_class`, `opening_wdv_inr`, `additions_during_year_inr`, `addition_date`,
`sale_consideration_inr`, `is_new_manufacturing_asset`, `is_in_notified_backward_area`. **No
depreciation charge is computed or stored here** — the displayed rate label (e.g. "Residential
Building (5%)", see **lines 8238–8248**) is just a static category label, not a live calculation.
No action needed.

---

## 2. New section: Company residency (POEM) determination

**Why:** when the entity-type selector is set to "Company," the engine has no facts to determine
whether the company's Place of Effective Management (POEM) is actually in India — it currently
assumes residency by default. This blocks a conflict-detection finding around Indian-incorporated
companies actually managed from abroad.

**Exact hook:** the entity-type selector is `<select id="biz-entity-type" onchange=
"updateBizEntityType(this.value)">` at **line 1321** (options include `company` at line 1326). The
handler `function updateBizEntityType(val)` at **line 7625** already does "Dynamic UI Morphing" —
it computes `const isCompany = val === 'company';` at **line 7636** and then shows/hides several UI
blocks based on flags like `isCompany`. **Add your new section using this exact same pattern**:
a new HTML block (placed near the other entity-dependent blocks this function already toggles),
shown/hidden by extending the existing `if (isCompany) { ... } else { ... }` logic already present
in this function — do not invent a new toggle mechanism.

**New fields (new sub-section, e.g. `state.company_residency`), all raw facts:**

| Field | Type |
|---|---|
| `is_active_business` | boolean |
| `board_meetings_primarily_outside_india` | boolean |
| `key_management_location` | select: `india` / `outside_india` / `mixed` |
| `management_delegated_outside_india` | boolean |
| `directors_in_india_count` | number |
| `directors_outside_india_count` | number |

Do not add a "POEM conclusion"/residency-status field — that determination belongs to the engine,
the same way the individual residency wizard collects raw day-counts and lets
`residency_detail.final_india_residency_status` be set by the solver rather than by the user
directly (see `runResidencySolver()`, called at **line 7630** inside this same handler, as the
existing example of "collect facts, let a solver decide" to follow).

Add `company_residency: {}` (with the fields above defaulted) to the main `state = {...}`
declaration near the top of the script, alongside other top-level sections like `dtaa` and
`compliance_docs`.

---

## 3. ESOP: per-grant breakdown (replace the single lump figure)

**Why:** `domestic_income.salary.esop_perquisite_inr` is a single annual number. A cross-border
conflict-detection finding needs to match individual ESOP grants against the US form's RSU tranches
(which are gaining `grant_date` fields — see the companion US document §3) to catch the same equity
award being fully taxed by both countries. A single total can't be matched against dated events.

**Exact hook:**
- Current input: **line 2320** (label "ESOP Perquisite"), **line 2330**:
  `<input ... id="sal-esop" oninput="updateSalaryNum('esop_perquisite_inr', this.value)">`.
- State init: **line 4191** — `esop_perquisite_inr: null,` inside the `salary` object.
- DOM-populate reference: **line 12717** — `'sal-esop': sal.esop_perquisite_inr,`.

**Change:** add a new repeatable array `domestic_income.salary.esop_perquisite_events[]` following
the same add/sync-row pattern used elsewhere in this file (e.g. mirror the structure of the
financial-holdings transaction cards at line ~8685). Each entry:

| Field | Type |
|---|---|
| `employer_name` | text |
| `grant_date` | date |
| `vesting_or_exercise_date` | date |
| `shares` | number |
| `fmv_per_share_inr` | number |
| `exercise_price_per_share_inr` | number |
| `perquisite_value_inr` | number — **raw entry** (the value the user reads off their employer's Form 16/ESOP statement); do not compute `(fmv - exercise price) × shares` in JS the way the equivalent US ISO calculation currently does (see companion US doc §1a for why that's being removed there too). |

Keep the existing single `esop_perquisite_inr` field at line 4191 as-is for now if the rest of the
form's own summary panel depends on it, but the new array is what the engine should be pointed at
once it exists — don't remove the old field in the same pass unless you've confirmed nothing else
in this file depends on it.

---

## 4. Financial holdings: tag NRI "specified foreign exchange asset" status

**Why:** Chapter XII-A (old-Act §§115H/115C — see the numbering caution in §6) gives an NRI a
concessional flat rate on specified foreign-exchange assets. The existing `asset_class` dropdown
(financial-holdings card, starting **line 8685**, options beginning **line 8691**) and the
`purchase_currency` field (pushed in `syncFinancialState()`, see the object literal starting
**line 8836**) get partway to identifying eligible assets but don't cleanly cover the statutory
categories (specified debentures, deposits with an Indian company, notified government securities).

**Exact hook:** the same card template at line 8685 and the same `syncFinancialState()` push object
at ~line 8836–8849 (verified clean in §1.2 above — you're adding to it, not fixing a violation).

**Change:** add one field to the card and to the pushed object:

| Field | Type |
|---|---|
| `is_specified_foreign_exchange_asset` | boolean — user-confirmed, not derived from `asset_class`/`purchase_currency` in JS. |

Optionally, if time allows, add explicit `asset_class` dropdown options for the statutory categories
not currently well-represented (e.g. `nri_specified_debenture`, `nri_specified_company_deposit`,
`nri_specified_govt_security`) alongside the existing equity/MF/ETF options at line 8691 onward —
but the boolean flag above is the minimum needed.

---

## 5. Carry-forward losses — no change, just confirming scope

Not touched by this document. The `carry_forward_losses` section already appears comprehensive.
Flagging only so it isn't accidentally reworked while you're editing neighboring sections in §1–§4.

---

## 6. Informational note — Income-tax Act, 2025 renumbering (do not act on this without verification)

The Income-tax Act, 1961 was repealed and replaced by the Income-tax Act, 2025, effective
1 April 2026 (confirmed: old §87A → new §157; old §80C → new §123; old §80CCD → new §124; old §80D →
new §126; the alphabetical-suffix Chapter VI-A scheme is gone in favor of plain sequential
numbers). This form has section-number references in UI labels/tooltips throughout (e.g. "u/s 80C,"
"Section 87A"). **Do not relabel any of these based on this note alone** — confirm with a current
CBDT circular or professional source which tax year's filing is actually governed by the new Act
before changing any citation. Flagged here so it's on record, not as an instruction to act now.

---

## Implementation checklist

- [ ] §1.1: `evaluateSurchargeBuckets()` (11332, writes at 11654–11660) — remove or TODO-flag the derived write-back; not urgent, still open
- [x] §1.2, §1.3: no action — verified clean
- [x] §2: new `company_residency` section (6 fields), hooked into `updateBizEntityType()`'s existing `isCompany` toggle — implemented; engine now reads the raw facts and fires `entity_dual_residency_poem` for a foreign-incorporated company that resolves to ROR
- [x] §3: new `domestic_income.salary.esop_perquisite_events[]` repeatable array (old lump field kept alongside) — implemented; engine prefers the per-grant sum when the array is populated
- [x] §4: `is_specified_foreign_exchange_asset` added to financial-holdings transactions, plus 3 new NRI-specific asset-class dropdown options — implemented (went beyond the minimum ask)
- [x] §5: no action
- [x] §6: no action — verification note only

### Bugs found during implementation review (now fixed)

- The SFEA checkbox's restore-from-saved logic checked a field named `tx.sfea`, but the save path
  writes `is_specified_foreign_exchange_asset` — the checkbox never survived a reload. Fixed to
  reference the correct field name.
- `company_residency` was missing from the top-level saved-state restore block (every other section
  has an explicit `if (savedState.X) Object.assign(...)` line; this one didn't), so all 6 POEM facts
  silently reset to blank on every page reload despite saving to localStorage correctly. Added the
  missing line.

### Separately flagged, not fixed (outside this doc's scope)

The step-wizard's Back/Next button chain has an inconsistency from a step-reordering pass:
`panel-step-business`'s Back button points to `step-deductions` (should be `step-hp`),
`panel-step-deductions`'s Back button points to a `step-income` that no longer has a matching panel,
and `panel-step-os`'s Next button points back to `step-dtaa` instead of forward — together these
leave Deductions/Credits/Output unreachable via the linear Next-button chain (sidebar tabs may still
reach them directly). Not touched since the intended final step order wasn't known.
