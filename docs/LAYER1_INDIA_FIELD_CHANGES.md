# Layer 1 — India Intake Form: Field Changes

**Target file:** `layer1_india.html`
**Purpose of this document:** a self-contained work order for adding/adjusting fields on the India
intake form, written to be handed to an implementation agent (e.g. Antigravity) with no other
context. It assumes the agent can read the existing file to match conventions but has not seen the
conversation that produced this list.

---

## 0. Context — what this form is and the one hard rule

`layer1_india.html` is a **pure data-collection form**. It is one of two intake forms (the other is
the US form) that write JSON into `localStorage` under the key `wising_layer1_india_state`. A
separate, independent computation engine (`engine/*.js`, not part of this file) reads that JSON,
normalizes it, and performs every tax computation, conflict detection, and cross-border analysis.
**This form does not talk to the engine and should not duplicate what it does.**

### The hard rule for every change below

> **This form collects raw facts only. It must not compute derived tax figures, apply tax-rule
> logic (exemption caps, elections, exclusions), or pre-classify income into tax categories.**
> Every field the user fills in should be something they could read off a document (a contract, a
> broker statement, a payslip) or select from a fixed list — not a number the JAVASCRIPT works out
> for them. All computation belongs in the engine.

Conventions already used in this file that new fields should follow:
- Money fields are suffixed `_inr` (this form is INR-native; the engine converts to USD).
- State is a plain JS object (`state.<section>.<field>`), updated via helper functions such as
  `updateStateField('<section>', '<field>', value)` or section-specific helpers
  (`updateSalaryNum`, `updateCompField`, etc.) — follow whichever pattern the surrounding section
  already uses.
- Repeatable line items (transactions, holdings, business entries) are arrays of objects rendered
  as add/remove "cards," each with its own `sync...State()` function that rebuilds the array from
  the DOM on every change.

---

## 1. Review pass — check for and remove any in-form calculations

Before adding new fields, audit the sections below for JavaScript that computes a *result* rather
than just storing what the user typed, and convert any you find into raw-input-only fields. This
wasn't exhaustively verified on the India side (unlike the US side, where specific instances are
already confirmed — see the companion US document), so treat this as a required check, not an
optional one:

- **`capital_gains` / `financial_holdings` / `commodities` / `unlisted_equity` / `share_buyback`
  transactions** — confirm the form is NOT computing realized gain/loss, applying holding-period
  classification (STCG vs LTCG), or applying any exemption (e.g. grandfathering FMV as of
  31-Jan-2018) beyond storing the raw `fmv_31jan2018_per_unit_inr` figure the user enters. If any
  such computed field exists, remove the computation and keep only the raw inputs (acquisition
  date, purchase value/currency, sale date, sale value/currency, quantity).
- **`surcharge_buckets`** — this section's own docstring in the engine notes it exists "for
  consistency" against the engine's own surcharge recomputation. Confirm the form isn't computing
  the bucketed amounts itself from other entered income — if it's deriving these values rather than
  the user directly entering known bucket totals, flag it for removal/simplification.
- **Any depreciation `asset_blocks` UI** — the rate shown per asset class (e.g. "Residential
  Building (5%)") is a fixed statutory attribute of the category, which is fine to display as a
  label. Confirm the form is not going further and computing the year's depreciation charge
  (opening WDV + additions − disposals × rate) itself — if it is, that computation should move to
  the engine; the form should only collect the block's asset class, opening WDV, additions, and
  disposals for the year.

---

## 2. New section: Company residency (POEM) determination

**Why:** when `profile.entity_type === "company"`, the engine currently assumes the company is an
Indian resident by default. There is no way today for the user to record the facts that actually
determine Place of Effective Management (POEM) under Indian tax law, which matters for:
figuring out whether an Indian-incorporated company is actually resident, and for a new
conflict-detection finding ("does this company's day-to-day control sit outside India even though
it's incorporated here").

**Where:** new sub-section, e.g. `company_residency`, shown only when `profile.entity_type ===
"company"` (mirror the show/hide pattern already used for other conditional sections).

**Fields (all raw facts, no computed POEM conclusion):**

| Field | Type | Notes |
|---|---|---|
| `is_active_business` | boolean | POEM tests differ for an active business vs. a passive/investment company — this is a factual classification the user selects, not a derived one. |
| `board_meetings_primarily_outside_india` | boolean | Where the board of directors physically meets/deliberates most often. |
| `key_management_location` | select: `india` / `outside_india` / `mixed` | Where day-to-day strategic/commercial decisions are actually made. |
| `management_delegated_outside_india` | boolean | Whether day-to-day management is delegated to persons based outside India. |
| `directors_location_split` | text or two numeric fields (`directors_in_india_count`, `directors_outside_india_count`) | Raw headcount, no interpretation. |

Do **not** add a "POEM conclusion" or "residency status" field here — that determination is the
engine's job, exactly like the individual residency wizard already defers the final call to
`residency_detail.final_india_residency_status` while collecting the raw day-count/POEM-style
inputs that feed it.

---

## 3. ESOP: per-grant breakdown (replace the single lump figure)

**Why:** today `domestic_income.salary.esop_perquisite_inr` is a single number for the whole year.
A cross-border conflict-detection finding needs to compare this against the US Layer 1 form's
per-tranche RSU vesting data (which is being updated in the companion US document to add grant
dates) to catch the same multi-year equity award being taxed in full by both countries. A single
annual total can't be matched against dated US tranches.

**Where:** `domestic_income.salary`, replace/augment `esop_perquisite_inr` with a repeatable array,
e.g. `esop_perquisite_events[]`.

**Fields per entry (raw facts the user reads off Form 16 / employer ESOP statement):**

| Field | Type | Notes |
|---|---|---|
| `employer_name` | text | |
| `grant_date` | date | |
| `vesting_date` / `exercise_date` (whichever triggers the perquisite under Indian law for this ESOP) | date | |
| `shares` | number | |
| `fmv_per_share_inr` | number | |
| `exercise_price_per_share_inr` | number | |
| `perquisite_value_inr` | number | **Raw entry, not computed** — same principle as the existing single field: the user types the number from their employer's statement. Do not calculate `(fmv - exercise price) × shares` in JS; if you want a live on-screen preview for the user's convenience while typing, make clear it is a *display hint only* and still require/store the field as a direct value, or simply drop the live preview and keep this a plain input like the current field. |

Keep `esop_perquisite_inr` (annual total) as a derived *display* rollup if useful for the rest of
the form's own summary panel, but the array above is what should be persisted for the engine to
consume — the annual total field, if kept, should not be treated as the source of truth once the
array exists.

---

## 4. Financial holdings: tag NRI "specified foreign exchange asset" status

**Why:** Chapter XII-A (sections 115H/115C under the old 1961 Act — see the numbering note in §6
below) gives an NRI a concessional flat rate on income from specified foreign-exchange assets
(shares in an Indian company acquired in convertible foreign exchange, specified debentures,
deposits with an Indian company, notified Central Government securities). The form currently has
`asset_class` and `purchase_currency` on each `financial_holdings` transaction, which gets partway
there, but doesn't cleanly cover debentures/company-deposits/government-securities as distinct,
identifiable categories, and doesn't let the user affirmatively confirm specified-asset status.

**Where:** `financial_holdings` transactions (the same repeatable array that has `asset_class`,
`purchase_currency`, etc.).

**Fields to add per transaction:**

| Field | Type | Notes |
|---|---|---|
| `is_specified_foreign_exchange_asset` | boolean | User-confirmed flag — not derived from `asset_class`/`purchase_currency` in JS, since the precise statutory categories don't map 1:1 onto the existing asset-class dropdown. |

If practical, also extend the `asset_class` dropdown with explicit options for the categories the
regime actually covers (e.g. `nri_specified_debenture`, `nri_specified_company_deposit`,
`nri_specified_govt_security`) so the flag above has something concrete to hang off — but the
boolean is the minimum needed.

---

## 5. Carry-forward losses — confirm existing coverage is sufficient (no format change expected)

Not a new field request, but worth a verification pass while in this file: the `carry_forward_losses`
section (business/speculative/STCG/LTCG/HP loss carry-forward, unabsorbed depreciation, §79
shareholding-change trigger) already appears comprehensive based on the fields referenced elsewhere
in this codebase's documentation. No changes anticipated here — flagging only so it isn't
accidentally reworked while touching neighboring sections.

---

## 6. Informational note — Income-tax Act, 2025 section renumbering (verify before relabeling)

The Income-tax Act, 1961 was repealed and replaced by the **Income-tax Act, 2025**, effective
1 April 2026. It renumbers most sections (examples confirmed by research: old §87A → new §157;
old §80C → new §123; old §80CCD → new §124; old §80D → new §126; the old alphabetical-suffix
Chapter VI-A scheme like 80C/80CCC/80CCD/80CCE is gone in favor of plain sequential numbers).

**Do not blindly relabel this form's section references based on this note alone** — confirm with a
current CBDT circular or professional source which tax year's *filing* is actually governed by the
new Act (returns for FY2025-26, currently being filed, may still reference the old Act under
transition provisions) before changing any user-facing section citation (e.g. tooltips that say
"u/s 80C" or "Section 87A"). This is flagged here so it isn't missed, not as an instruction to
change labels immediately.

---

## Summary of new fields for a quick implementation checklist

- [ ] `company_residency.*` — new conditional section (5 fields), shown when entity_type is company
- [ ] `domestic_income.salary.esop_perquisite_events[]` — new repeatable array replacing/augmenting the lump ESOP figure
- [ ] `financial_holdings` transactions — add `is_specified_foreign_exchange_asset` boolean (and optionally expand `asset_class` options)
- [ ] Review pass: remove any in-form gain/loss, surcharge-bucket, or depreciation-value calculations per §1
- [ ] No action yet on §6 (Income-tax Act 2025 relabeling) — verification only
