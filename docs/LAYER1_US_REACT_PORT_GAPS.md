# US Layer 1 → React + XState port — status & known gaps

**Status: structurally complete, NOT field-parity-verified.** Built to a 3-day,
full-scope timeline agreed explicitly in exchange for deferring the
verification pass — see the conversation this originated from. Do not point
`monitor-next/lib/dag-adapter.js` or any DAG compute path at this as a
replacement for `layer1_us.html` until the items below are addressed.

## What's real and working

- All 22 wizard steps exist as React components, reachable via the same
  direct-jump/lock-gated navigation as the original (`isStepLocked()`,
  faithfully ported to `lib/layer1-us/machine.js` as XState guards).
- The zustand store (`lib/layer1-us/store.js`) writes to
  `localStorage["wising_us_state"]` (or the `wising_client_<id>_us` scoped
  variant) — the **exact key** `lib/dag-adapter.js`'s `readRaw()` already
  reads, in the same schema shape as `layer1_us.html`'s `usState`. Verified
  end-to-end in a real browser: adding a Schedule C business row and typing
  into it produces the correct nested object under
  `income_us_source.self_employment[]` in localStorage.
- Compiles clean (`next dev`, 572 modules, zero build errors) and renders all
  22 steps without a runtime/console error beyond pre-existing environment
  noise (a tunnel/404 warning present on the *existing* `/` Monitor route
  too, confirmed via the same browser session — not caused by this work).

## Known gaps (fix before treating this as the real thing)

### 1. Schema additions not in the original `usState` literal
`layer1_us.html`'s vanilla-JS wizard writes several repeatable sections via
full-DOM-rescrape sync functions rather than a schema-declared array, so
there was nothing to port verbatim for:
- `income_us_source.w2_wages` (W-2 repeatable — the original calls this
  differently at the point of use; **needs a naming decision**, not just
  acceptance of `w2_wages`).
- `income_us_source.capital_gains_transactions` (manual cap-gains line
  items).

Both were added to `lib/layer1-us/schema.js` post-hoc so the app doesn't
crash, but `dag_py`'s field-path contract has no opinion on these names —
confirm neither collides with something the DAG side expects before this
ships.

### 2. Cross-step field-ownership collision (found and fixed once, but the pattern may recur)
`CapGainsStep.jsx` and `IncomeUsStep.jsx` were built by two different
parallel agents and both initially wrote `has_capital_gains` /
`stcg_us_source_usd` / `ltcg_us_source_usd`. Fixed by making `CapGainsStep`
the sole owner (it live-derives the totals from the transaction list,
mirroring the original's `recalculateCapitalGainsAggregate()`) and making
`IncomeUsStep`'s copy read-only. **This class of bug — two independently-built
steps racing to own the same `usState` path — was only caught because one
agent happened to notice it and flag it in its own report.** A dedicated
pass checking every step against the full field list in `schema.js` for
duplicate ownership has not been done.

### 3. `step-business` — the single largest deferred-logic surface
- `calculateBusinessIncomes()` (1,072 lines in the original, the single
  largest function in `layer1_us.html`) is replaced with a simplified
  per-category placeholder total, explicitly labeled in the UI itself
  ("Simplified from layer1_us.html's calculateBusinessIncomes (1072 lines)
  — full port deferred").
- `addUsBranchRow` (US branches nested under a foreign-parented Schedule
  C/Partnership/S-Corp row, ~715 lines in the original) is **not ported at
  all**.
- Full basis/at-risk/passive-activity-loss/QBI wage-and-UBIA limitation
  logic is not ported.
- The ~25-option NAICS/SSTB dropdown is collapsed to a short list.
- `updateBusinessStepLogic()`'s DOM flexbox section-reordering is replaced
  with a tab UI rather than replicated.

### 4. Other steps with self-reported simplifications
(from the building agents' own summaries — not independently re-verified)
- `RetirementStep`: the SECURE 2.0 RMD auto-calculator (age/balance/IRS
  Uniform Lifetime Table) is replaced with plain editable fields.
- `CapGainsStep`: `isLongTerm()`'s holding-period boundary was implemented
  as a calendar-correct "12 months and a day" check rather than the
  original's literal `365*24*60*60*1000` ms comparison (arguably a
  correctness *improvement*, but it is a deviation from byte-for-byte
  parity — flag if exact-parity-with-the-frozen-source is a requirement
  anywhere downstream). Aggregate totals only sum the new manual-entry
  array, not cross-source amounts from real estate/crypto/QSBS/collectibles
  the way the original's `recalculateCapitalGainsAggregate()` does.
- `NraStep` owns `nra_specific.treaty_rate_claims` (`addTreatyRateRow`);
  confirmed not duplicated in `CapGainsStep` despite both steps being
  adjacent in the original source.

### 5. Group F steps (RealEstate, Passive, Entities, Gifts, Banks) and the
Business step's agent both hit a session rate limit while finishing their
final self-report. **The files themselves exist, pass a syntax check, and
render without runtime errors in the browser smoke test — but their
authoring agents' own "faithfully ported vs. simplified" breakdown was not
fully captured**, unlike every other step. A dedicated read-through of
`EntitiesStep.jsx`, `GiftsStep.jsx`, `RealEstateStep.jsx`, `PassiveStep.jsx`,
and `BanksStep.jsx` against their `layer1_us.html` sources is recommended
before relying on them.

### 6. `BankSyncStep.jsx` was hand-written (not agent-built) as a faithful but
intentionally shallow port — the original's Plaid-connect and
statement-upload sections are non-functional UI theater in the source too
(no real backend), ported the same way. Only the "US Bank Interest" field
writes to real schema (`income_us_source.interest_us_bank_usd`); routing/
account numbers are local component state, matching that no `dag_py` node
reads them.

### 7. Not ported at all
- **Cross-jurisdiction hydration**: the original's `initFromLocalStorage()`
  reads `wising_layer1_india_state` and translates India-side fields (e.g.
  INR bank balances → USD) when `router.jurisdiction === "dual"`. This
  React port has no equivalent — it only reads/writes its own
  `wising_us_state` key. For a dual-jurisdiction taxpayer this is a real
  feature gap, not a simplification.
- Any required-field / step-completion validation. (This matches the
  original, which also has none — not a regression, just noting it wasn't
  added as new behavior either.)
- `SUPERSET_SCHEMA_TEMPLATE` reconciliation (the original file's second,
  ~1,450-line duplicate schema definition) — not attempted; `schema.js` is
  built from `usState` only.

## What "verification" would actually mean before this ships

1. Resolve the `w2_wages` naming decision and reconcile against whatever
   `dag_py`/JS-DAG field paths actually expect for W-2 data (unclear from
   the current schema alone — the original never declared this array).
2. Grep every `setField`/`addRow` path across all 22 files against
   `schema.js` and `dag_py`'s `layer1_fields` tuples for silent mismatches,
   the same way the CapGains/IncomeUs collision was found by luck.
3. For every persona/fixture already used elsewhere in this repo's parity
   harnesses (`prototypes/graph-pilot/run-js-dag-vs-py-dag.js`,
   `dag_py/tests/`), fill out this React form to match, export via
   `OutputStep`'s JSON dump, diff against the same persona's known-good
   `layer1_us.html`-produced state, and diff the resulting DAG tax output.
4. Decide on `SUPERSET_SCHEMA_TEMPLATE` reconciliation and cross-jurisdiction
   hydration before treating this as a drop-in replacement.
