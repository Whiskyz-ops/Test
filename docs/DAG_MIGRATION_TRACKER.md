# DAG Migration Tracker

Tracks parity between `engine/*.js` (production — what `monitor-next` actually
runs) and `prototypes/graph-pilot/` (the dependency-graph rewrite intended to
eventually **replace** the hand-written engine). Companion to
`docs/GAP_TRACKER.md`, which tracks what WISING doesn't model yet regardless
of implementation; this doc tracks a different axis — **of what the engine
already does correctly, how much has been independently re-derived and
verified in the DAG.**

**First written: 18 July 2026**, by direct code comparison (every row below
was verified by reading both the `engine/*.js` function and the
`prototypes/graph-pilot/*.js` node(s) side by side — grep hit-counting alone
was not treated as proof of either coverage or its absence). Re-verify after
every graph-pilot commit that touches a node file, since this document has no
automated check keeping it in sync (see SYS-2).

**Re-verified 19 July 2026:** every `run-*.js` harness under `graph-pilot/`
was personally re-executed (not just cited from its originating commit
message) — `run-aggregateindiaincome.js` 165/165, `run-aggregateusincome.js`
385/385, `run-entitytax.js` 6/6, `run-in1.js`/`-v2`/`-v3` 22/22, 66/66, 8/8,
`run-india-tax-combined.js` 22/22, `run-ustax.js` 81/81, `run.js` 32/32,
`run-batch2.js` 77/77 — all green, no discrepancies from what this doc
already claimed. **This raises confidence in the ✅ rows but does not make
them exhaustive**: every number above is checked against the same 11 demo
profiles, the same ceiling `tests/engine/run.js` (the production suite)
itself has — a real, correct-looking pass count is not proof against an
input combination none of the 11 profiles happen to exercise. Section E's
CFL-6 list (48 findings) also remains a name-level inventory, not a
logic-level one — see its own caveat below.

**Mechanically audited 19 July 2026:** this comparison is no longer
manual-only — `npm run audit:dag` (`scripts/audit/dag-coverage.js`, built the
same day) extracts every quoted `safe()` path and snake_case field read from
every engine function, every `add("id")` finding in conflicts.js, and every
significant numeric literal in the DAG's hand-copied constant tables, and
diffs each against the DAG file(s) this tracker maps that function to. Any
read missing from a ✅-mapped function, any engine function absent from the
script's tracker mapping, or any numeric drift **fails the run** (exit 1) —
so both new engine code and silent constant divergence now get caught
mechanically. Its first run confirmed the tracker's ❌/🔶/📝 rows and the
48-finding CFL-6 count exactly, found **zero numeric drift**, and caught
**8 engine reads inside functions this doc had over-claimed as fully ✅** —
now downgraded and itemized in AGG-1 and TAX-1 below, and recorded in the
script's `knownMissing` lists (remove an entry there only when the DAG
actually ports it).

**TAX-10 closed, and AGG-1 narrowed, 19 July 2026:** `india-full-nodes.js`
and `us-full-nodes.js` now physically wire the two income-aggregation graphs
into their respective tax-computation graphs — the highest-leverage open
item this tracker's own §H called out first. Same pass also closed one of
AGG-1's three recorded side-channels: `capitalGainsComputation` in
`aggregateindiaincome-nodes.js` now builds `holdingPeriodMismatches[]`
inline in the same buy-back/foreign-equity loops normalize.js uses,
verified 179/179 in `run-aggregateindiaincome.js` (3 real mismatches found
in the demo data, not a vacuous pass). `npm run audit:dag` re-run clean
after both changes (`MAP` updated: `compute()` → TAX-10 `"ported"`, AGG-1's
`knownMissing` down to the two remaining side-channels). See TAX-10 and
AGG-1 rows below for detail.

**XBR-1 closed, same day.** `residency-nodes.js` ports `resolveResidency`
in full — verified 132/132 in `run-residency.js` (every field, all 11
profiles, `ctx` deliberately carrying no `model`/`computed` at all). Worth
recording plainly since it changes how the remaining XBR rows should be
read: `resolveResidency()` does **not** itself run any day-count or the
home → CVI → habitual-abode → nationality tie-break cascade. Those are
Layer 1's job entirely (the residency wizard and `evaluateTieBreaker()` in
`layer1_india.html`, outside this engine) — the engine receives their
already-decided conclusions as plain fields
(`residency_detail.final_india_residency_status`,
`dtaa.dtaa_treaty_residence`, etc., confirmed by grep to be raw `safe()`
pass-throughs in `normalize.js:2225-2308`, not derived values).
`resolveResidency()`'s real content is smaller: turn those conclusions into
per-side worldwide-taxation booleans and apply the treaty "who cedes"
consequence. This means the tracker's original 🟡 "New pattern" effort
estimate for XBR-1 was too high — it was 🟢 all along, this file just
hadn't been written yet to prove it — and, more importantly, that **actual
SPT/day-count/tie-break-cascade logic has no home in this engine at all,
DAG or production** — porting it (if ever wanted) would be new scope, not
migration. Wired into `us-full-nodes.js`: `worldwideUs` now reads
`residencyResult.us.worldwide` instead of `ctx.computed.residency.us.worldwide`
— re-verified 81/81 in `run-us-full.js` with `ctx.computed` removed
entirely from the test harness. `npm run audit:dag` re-run clean (`MAP`:
`resolveResidency` → `"ported"`; `normalize()`'s own AGG-10 gap count also
dropped, from 150 to 139 missing reads, since the raw residency/treaty
fields this file reads are no longer nowhere-in-DAG).

**New DAG-only finding added, same day: residency status vs. day-count
consistency.** The residency assessment above surfaced a real product gap
— the engine stores `daysCurrentYear`/`sptMet` right next to the trusted
status and never cross-checks them (`monitoring.js` will render a
progress-bar day count next to a status from an unrelated source with
nothing to catch a contradiction). `residency-nodes.js` now also builds
`residencyConsistencyFindings`, four new finding IDs with no
`engine/conflicts.js` counterpart — see §E-bis below rather than the CFL
table, since there's no engine baseline to be "at parity" with. Verified
149/149 in `run-residency.js` (the original 132 XBR-1 checks, plus 11
real-profile empty-findings checks — true negative — plus 6 synthetic
cases proving each direction fires correctly).

Building this also surfaced a real false positive in `audit:dag`'s own
numeric-drift check: a legal citation ("IRC 7701(b)(3)") embedded in a
finding's prose got flagged as if it were a hand-copied tax constant that
had drifted from `engine/constants.js`. Fixed by excluding quoted-string
contents from that specific scan (`stripStringLiterals` in
`dag-coverage.js`) — legal citations and other prose numbers were never
what SYS-1's drift check was meant to catch (real rate/cap/threshold
tables in this codebase are always bare numeric literals, never inside a
string), and the fix doesn't weaken the check: re-run confirmed zero drift
across every other file, unchanged from before.

**Extended to India company/HUF/firm and the US business-entity case, same
day** — see the four new §E-bis rows below. Stress-testing against the REAL
`layer1_india.html` wizard source (not just the engine, which is all prior
rows in this doc were checked against) surfaced two things — **both closed
the same day, not left as flagged gaps:**

1. `runResidencySolver()` in Layer 1 India is a full ~20-branch statutory
   determination (the 60/182-day tests, 4-year lookback, RNOR sub-status,
   employment/crew and PIO/citizen exceptions, s.6(1A) deemed-residency,
   company POEM) that `normalize.js` reads NONE of — only the final locked
   status string crosses into the engine. Closed by porting the ENTIRE
   function line-by-line (`deriveIndiaDomesticStatus()`/
   `deriveCompanyPoem()` in `residency-nodes.js`), replacing the original
   narrow day-count heuristic outright. See the rewritten first §E-bis row
   below for the full detail and verification approach (real profiles
   couldn't serve as ground truth here — see that row).
2. The India DTAA-taint question (does `final_india_residency_status` mean
   pure domestic-law status, or can it be treaty-tainted?) — resolved by
   tax-law reasoning: domestic residential status is treaty-independent,
   `resolveResidency()`'s existing contract is correct, and Layer 1's live
   wizard conflating the two is the actual bug. See the
   `residency_status_dtaa_conflated_india` row below for how the
   consistency check now diagnoses this specifically rather than either
   suppressing it or mislabeling it as a generic data-entry error.

This is genuinely a different class of gap than everything else in this
doc — it's not "the DAG hasn't ported X yet," it's "the ENGINE has never
read a large piece of what Layer 1 already collects, and it took reading
the frontend source directly, not just `engine/*.js`, to find it." Worth
naming for anyone extending this tracker later: every OTHER row here was
checked against `engine/*.js` only, on the reasonable assumption that the
engine's own inputs are a faithful (if incomplete) subset of what Layer 1
collects. That assumption doesn't always hold, as this found. Still
closer to `GAP_TRACKER.md`'s remit (what Layer 1 collects that the engine
never reads) than this doc's (engine vs. DAG parity) for the underlying
gap in `normalize.js` itself — not in `GAP_TRACKER.md` today, checked —
but the DAG-side consequence (this consistency check) is closed here.

**Status legend:** ✅ ported & verified (diffed against the real function, not
just same-named) · 🟡 partial · 🔶 boundary-only (the DAG *consumes* the
engine's output for this as a `ctx` input rather than re-deriving it — looks
covered from the node list but isn't) · ❌ not ported, no reference anywhere
in `prototypes/graph-pilot/` · 📝 explicitly scoped out (the DAG's own code
comments say so — an honest gap, not an accidental one)

**Migration-effort legend:**
- 🟢 **Straightforward** — a sibling file in `graph-pilot/` already proves the
  exact pattern needed (e.g. another `computeXTax` port, another aggregation
  boundary close).
- 🟡 **New pattern** — nothing in the DAG today looks like this shape yet
  (gauges-with-pace-projection, a 50-plus-rule finding engine, PDF/report
  assembly).
- 🔴 **Structural** — blocked on a design decision (how graphs compose across
  files) rather than on writing more nodes; building more on top of the
  current unwired state compounds the problem in F.

---

## A. Income & deduction aggregation (`engine/normalize.js`)

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| AGG-1 | `aggregateIndiaIncome` | 🟡 | `aggregateindiaincome-nodes.js` | 🟢 | **Downgraded from ✅ on 19 Jul 2026** by `audit:dag`'s first run: the income-figure port is complete and verified (`run-aggregateindiaincome.js` 165/165 across 11 profiles), but the engine function also emitted three **side-channel outputs the DAG didn't read or reproduce**. **One of three closed, same day:** `holdingPeriodMismatches[]` (`original_acquisition_date`/`buyback_date`/`company_name`/`asset_name_or_ticker` reads, normalize.js L719-830 — the India-vs-US LTCG/STCG classification-conflict list behind the `holding_period_mismatch_` finding, CFL-6) is now built inline inside `capitalGainsComputation`'s existing buy-back/foreign-equity loops, verified 179/179 in `run-aggregateindiaincome.js` (count + every field checked against the real array; 3 real mismatches in the demo data — AMZN, NVDA, Nova Systems Pvt Ltd — confirming the pass isn't vacuous). Two remain open: (1) `agricultural_income_inr` → `inc.agriculturalIncomeInr`, the ITR-1 disqualifier `computeIndiaItrForm` (XBR-6) consumes; (2) `unexplained_income_115BBE_inr` → `inc.unexplained115bbeInr`, sole trigger of the `s115bbe_unexplained_income` finding (CFL-6). Both stayed invisible for the same reason the third one did — the 165/179 runner checks cover income figures, not these metadata fields, and each downstream consumer is itself unported. Recorded in `dag-coverage.js`'s `knownMissing` list (now 2 entries, was 6 field-path entries representing the 3 side-channels); remove an entry there only when actually ported. The ~13 internal sub-helpers were additionally confirmed by the mechanical read-diff (now 98/100 reads present; the 2 missing are exactly the two remaining side-channels above). |
| AGG-2 | `aggregateIndiaDeductions` | ✅ | `in1-nodes-v3.js` (`dedS80C`/`dedS80CCD1B`/`dedS80D`/`dedS80TTA_TTB`/`dedS80DD`/`dedS80DDB`/`dedS80U`/`dedS80E`/`dedS80EEA_EE`/`dedS80GGB_GGC`/`dedS80GGRentPaidInr`, ~L235-246) | — | Diffed line-for-line against `normalize.js:1264-1307` — identical field paths, identical caps/flat-amount tables. |
| AGG-3 | `aggregateUsIncome` | ✅ | `aggregateusincome-nodes.js` | — | Full port incl. MACRS/§179/bonus depreciation (`computeAssetDepreciationUsd`), K-1 passive aggregation across all 3 entity types. `run-aggregateusincome.js` personally re-run 19 Jul 2026: **385/385 field checks pass** across all 11 profiles (this number was previously only sourced from the commit message; now independently confirmed). |
| AGG-4 | `aggregateUsDeductions` | ✅ | `ustax-nodes.js` (`dedUs`, ~L165-190) | — | Diffed line-for-line against `normalize.js:1801-1853` — identical, including the ISO-AMT-preference sub-computation. |
| AGG-5 | `aggregateAccounts` | 🔶 | `scope-nodes.js` (`fbarAggregatePeakUsd*`) | 🟢 | Reads `ctx.model.accounts.accounts` — the **engine's own already-aggregated** account list — not re-derived from raw `financial_holdings`/foreign-account form data. The scope-gating logic layered on top of it is real and verified; the aggregation itself is borrowed. |
| AGG-6 | `aggregateTaxesPaid` (TDS/TCS/withholding totals feeding FTC) | ❌ | — | 🟢 | No reference anywhere in `graph-pilot/`. |
| AGG-7 | `aggregateWithholdingDetail` (per-stream withholding rows for the Withholding tab) | ❌ | — | 🟡 | No reference. Feeds UI display, not tax liability directly — lower priority than AGG-6. |
| AGG-8 | `computeLrsTcs` | ❌ | — | 🟢 | No reference. Small, self-contained function — good early pick. |
| AGG-9 | `aggregateEquityComp` (cross-border RSU/ISO/NSO sourcing signal) | ❌ | — | 🟡 | No reference. Feeds `equity_comp_sourcing` finding (CFL, see E) — will naturally get built alongside it. |
| AGG-10 | `normalize()`'s own top-level orchestration (currency assembly, `model.meta`/`model.entity` gates, `sumAllowed`) | 🔶 | *(every node file)* | 🔴 | Each `*-nodes.js` file re-reads a handful of raw `router`/`india`/`us` leaf paths ad hoc (`routerJurisdiction`, `indiaEntityTypeRaw`, etc. — duplicated near-identically across `in1-nodes.js`, `us1-nodes.js`, `xb7-nodes.js`, `ustax-nodes.js`). There is no single ported `normalize` node graph producing one `model` object; every downstream graph still takes slices of the *real* `model`/`computed` as its `ctx` boundary (see TAX-10). |

## B. Core tax computation (`engine/computation.js`)

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| TAX-1 | `computeIndiaTax` (individual/HUF slab path) | ✅ | `in1-nodes-v3.js` | — | Full: new/old regime, §87A rebate, surcharge w/ marginal relief, cess, special CG rates (111A/112/112A/115BB/115BBH), s.115A NR streams. `run-in1-v3.js` personally re-run 19 Jul 2026: **8/8** on the 8 individual/HUF profiles (the 3 company profiles are reported, not asserted, in this same script — see TAX-2/TAX-4 for how those are actually covered). Earlier versions of the same graph (`run-in1.js` 22/22, `run-in1-v2.js` 66/66) also re-run and passing — kept as regression evidence the graph didn't break as it deepened across 3 iterations. **One recorded simplification (found by `audit:dag`, 19 Jul 2026):** the DAG's local `computeS115aStream`/`computeNrInterestTreatment` return only the tax figures (`{totalInr, taxInr}`) — the engine's versions also build a per-election detail array (incl. `e.treaty_article`, rates, docs facts) consumed by the display/withholding layers (CFL-7, unported). Tax numbers match exactly; the `elections[]` metadata does not exist DAG-side. In `knownMissing`. |
| TAX-2 | `computeIndiaEntityTax` (company/firm) | ✅ | `entitytax-nodes.js` | — | Full: 115BAB/115BAA/115BA rate elections, turnover-based default rate, MAT, PE gate for foreign companies. `run-entitytax.js` personally re-run 19 Jul 2026: **6/6** on the company/firm profiles. |
| TAX-3 | `computeIndiaSurcharge`, `computeLossSetOff` (India) | ✅ | `in1-nodes-v3.js` (`lossSetOffV3`, embedded surcharge logic) | — | Embedded rather than standalone nodes, but diffed and verified (covered by the same TAX-1 re-run). |
| TAX-4 | Individual/entity routing (`if (indiaIsCompany \|\| indiaIsFirm) → computeIndiaEntityTax`) | ✅ | `india-tax-combined-nodes.js` | — | The one piece of routing logic that lived only inside `computeIndiaTax`'s own `if` — separately ported and verified against all 11 profiles. `run-india-tax-combined.js` personally re-run 19 Jul 2026: **22/22**, across all 11 profiles with no per-profile branching by the caller (i.e. the graph itself decides individual-vs-entity correctly, not the test). |
| TAX-5 | `computeUsTax` (resident/individual path) | ✅ | `ustax-nodes.js` | — | Full: AGI assembly (ordinary + preferential + taxable SS + FEIE), Schedule SE, std-vs-itemized, OBBBA senior/tips/overtime deductions, QBI (§199A + SSTB), AMT (§55 parallel computation), NIIT, additional Medicare, CTC/ACTC, AOTC/LLC, dependent care credit. `run-ustax.js` personally re-run 19 Jul 2026: **81/81** on resident/individual profiles (entity + NRA profiles reported, not asserted — see TAX-7/TAX-8). |
| TAX-6 | `computeSsTaxableUsd`, `bracketTax`/`bracketBreakdown`, `feieEligibility` | ✅ | `ustax-nodes.js` | — | Full Pub 915 Worksheet 1 transcription, verified against `computeUsTax`'s own copy (covered by the same TAX-5 re-run). |
| TAX-7 | `computeUsEntityTax` (US C-corp/1120) | 📝 | — | 🟡 | `ustax-nodes.js`'s own header comment states this explicitly: "not ported, reporting only." `run-ustax.js` detects the one entity profile (`us_ccorp_indian_sub`) and skips comparison rather than asserting a wrong answer — honest, but the function itself does not exist in the DAG. |
| TAX-8 | `computeNraTax` (1040-NR flat-tax path for NRAs with US-source FDAP) | 📝 | — | 🟡 | Same file, same comment: "not ported, reporting only," for the one NRA profile (`india_ror_us_income`). The `files1040nr` leaf node (`ustax-nodes.js` L133) is defined and then **never used as a dependency anywhere in the file** — a dead flag, consistent with the branch genuinely not existing. |
| TAX-9 | `computeUsStateTax` (CA/NY state income tax) | ❌ | — | 🟢 | **Not scoped out anywhere, not mentioned in `ustax-nodes.js`'s own "what this covers" comment** even though that comment claims to port "`computeUsTax`'s entire body." A real function, called from `compute()` at `computation.js:1798`, whose output (`stateTax`) is part of the production result and drives the `state_income_tax` finding (US-12 in `GAP_TRACKER.md`, already shipped in the engine). Reads as an accidental miss, not a decision — flag this one first if closing gaps in order of "surprise." |
| TAX-10 | Wiring AGG-1/AGG-3's output graphs into TAX-1/TAX-5's tax-computation graphs | ✅ | `india-full-nodes.js`, `us-full-nodes.js` | — | **Closed 19 Jul 2026.** India side: `india-full-nodes.js` merges `aggregateindiaincome-nodes.js` + `in1-nodes-v3.js` + `entitytax-nodes.js` and redefines all 13 explicit boundary nodes (`businessInrBoundaryV3`, `stcgInrBoundary`, `ltcgInrBoundary`, etc., `entityTaxableInrBoundary` included) to read the merged income subgraph's own output nodes instead of `ctx.model.income.india` — confirmed by grep that this leaves ZERO remaining `ctx.model`/`ctx.computed` reads in the individual/HUF or entity path. Verified via `run-india-full.js` with `ctx` deliberately carrying only `{router, india, us}` (no `model`/`computed`, to prove the boundary is actually gone, not just unused): **22/22** across all 11 profiles, both `totalTaxInr` and regime label, including all 3 entity/company profiles (the old `in1-nodes-v3.js`-only runner never covered those). US side: `us-full-nodes.js` merges `aggregateusincome-nodes.js` + `ustax-nodes.js`, redefines the one boundary node `incUs` to read `aggregateUsIncomeResult` — its `compute()` now takes no `ctx` parameter at all, a structural (not just empirical) guarantee. Verified via `run-us-full.js`: **81/81** on the 9 individual/resident profiles, identical to `ustax-nodes.js`'s own pre-wiring result (entity/NRA profiles still reported, not asserted — TAX-7/TAX-8 unchanged). `usEntityKind`/`worldwideUs`/`baseYearUs` deliberately NOT swept into this wiring — entity classification and residency determination are separate machinery (see XBR-1), left as real open boundaries rather than silently absorbed. |

## C. Cross-border reconciliation (`engine/computation.js`, continued)

This is the section the README calls "the main value proposition" (FTC
Reconciliation) and the DAG has made the least progress here of any area.

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| XBR-1 | `resolveResidency` (dual-residency + DTAA Art. 4 tie-breaker) | ✅ | `residency-nodes.js`, wired into `us-full-nodes.js` | — | **Closed 19 Jul 2026** (re-scoped from the 🔶/🟡 the tracker originally guessed — see the dated note above for why). `resolveResidency` doesn't run the tie-break cascade itself; that decision is Layer 1's, handed to the engine as already-resolved fields (`residency_detail.final_india_residency_status`, `dtaa.dtaa_treaty_residence`, etc.). What the function DOES do — turn those into per-side worldwide-taxation booleans, apply the treaty cede consequence (with the US-citizen saving-clause carve-out), and assemble `dualResident`/`tieBreakWinner`/`worldwideOverlap` — is ported in full and verified 132/132 in `run-residency.js` against all 11 profiles, `ctx` carrying no `model`/`computed` at all (a genuine derivation, not a disguised boundary read). `us-full-nodes.js`'s `worldwideUs` now resolves `residencyResult.us.worldwide` instead of reading `computed.residency` — re-verified 81/81 in `run-us-full.js` with `ctx.computed` removed from the harness entirely. India side needed no wiring: `in1-nodes-v3.js`/`entitytax-nodes.js` were already reading India residency status as a raw field, never via `computed.residency`. |
| XBR-2 | `computeFtc` (§904 limitation, both directions, credit pool + carryover) | ❌ | `scope-nodes.js` (`foreignSrcGrossUsd*` — narrow slice only) | 🔴 | The only DAG code touching FTC territory is the XB-24 scope-gating proof, which reproduces one intermediate figure (gross foreign-source income) to demonstrate the gating *pattern* — it was never meant to, and does not, replace `computeFtc`. The §904 basket math, the FTC credit/carryover computation, and the reverse-direction (India §90 relief) computation are 0% ported. Given README's own framing of FTC reconciliation as the headline feature, this is the most consequential gap in the whole tracker. |
| XBR-3 | `mapDoubleTaxedIncome` (per-head doubly-taxed-income breakdown) | ❌ | — | 🟡 | No reference anywhere. |
| XBR-4 | `crossBasis` (income re-computed under the other country's code — the "same income, both codes" reconciliation table) | ❌ | — | 🔴 | No reference. Depends on XBR-2/TAX-9 being closed first to have real figures to reconcile. |
| XBR-5 | `computeApportionment` (FY-vs-CY tax-year apportionment) | ❌ | — | 🟡 | No reference. |
| XBR-6 | `computeIndiaItrForm` (ITR form determination) | ❌ | — | 🟢 | No reference. Small, rule-table-shaped function — good early pick once TAX-1/TAX-4 exist to feed it (they already do). |

## D. Limits & monitoring (`computeLimits` in `computation.js` + all of `monitoring.js`)

Correction to how this looked from the outside: the six gauge **values**
(FBAR/8938/LRS/NRO/FEIE/§530A) are computed by `computeLimits` in
`computation.js:1449`, not in `monitoring.js`. `monitoring.js`'s `monitor()`
(`monitoring.js:33`) is a separate layer that takes `computeLimits`'s gauges
as input and adds pace-projection/compliance-calendar behavior on top. Both
layers are almost entirely unported.

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| LIM-1 | FBAR gauge (`computeLimits`, `computation.js:1462`) | 🔶 | `scope-nodes.js` (`fbarAggregatePeakUsd`) | 🟢 | Only the raw aggregate-peak dollar figure is reproduced (and even that via AGG-5's boundary read, not from raw account data) — not the gauge object itself (status/pct/threshold-cliff note). |
| LIM-2 | Form 8938 gauge | ❌ | — | 🟡 | No reference. Needs the "abroad" §911 test (already computed by `feieEligibility`, which TAX-6 ported) plus the 4-way MFJ/single × US-resident/abroad threshold table. |
| LIM-3 | LRS gauge | ❌ | — | 🟢 | No reference. Depends only on AGG-8 (`computeLrsTcs`, not yet ported). |
| LIM-4 | NRO-repatriation gauge | ❌ | — | 🟢 | No reference. |
| LIM-5 | FEIE-exclusion-used gauge | ❌ | — | 🟢 | No reference, but the hard part (`feieEligibility`) is already ported (TAX-6) — this is close to a pure wiring exercise once picked up. |
| LIM-6 | Trump Account (§530A) contribution-cap gauge | ❌ | — | 🟢 | No reference. |
| LIM-7 | `monitoring.js`'s `monitor()` — pace projections + compliance calendar | ❌ | — | 🟡 | No reference anywhere. Entirely new shape for the DAG (date-arithmetic + progress-fraction nodes, not pure tax math) — nothing in `graph-pilot/` today models this kind of node. |

## E. Conflict / finding rule-book (`engine/conflicts.js`)

`detectConflicts()` (`conflicts.js:67-1447`) is one function containing 53
distinct `add(id, ...)` finding calls — the single largest block of engine
logic by line count, and the other half of the product's value prop
("Conflicts & Mismatches"). Coverage:

| ID | Item | Status | DAG file | Detail |
|---|---|---|---|---|
| CFL-1 | `india_advance_tax_interest` (IN-1) | ✅ | `in1-nodes.js` → `in1-nodes-v2.js` → `in1-nodes-v3.js` | First finding ported, iterated through 3 versions as the graph deepened underneath it. |
| CFL-2 | `underpayment_2210` (US-1) | ✅ | `us1-nodes.js` | US Form 2210 mirror of CFL-1. |
| CFL-3 | `early_withdrawal_penalty_72t` (US-5) | ✅ | `us5-nodes.js` | |
| CFL-4 | `black_money_act_exposure` (XB-7) | ✅ | `xb7-nodes.js` | |
| CFL-5 | `schedule_fa_inconsistent` | ✅ | `xb7-nodes.js` (`scheduleFaInconsistentTrigger`, shared node) | Confirmed by `run-batch2.js`: "matches production's independent `schedule_fa_inconsistent` finding." |
| CFL-6 | **The remaining 48 findings** | ❌ | — | No DAG reference for any of: `amt_applies`, `carry_forward_losses_not_applied`, `cfc`, `cfc_below_threshold`, `chapter_xiia_elected_no_holdings`, `chapter_xiia_investment_income_computed`, `chapter_xiia_investment_income_missing`, `covered_expat_gift_tax`, `cross_basis_summary`, `deemed_dividend_buyback_mismatch`, `dtaa_treaty_elections`, `dual_residency`, `dual_residency_resolved`, `entity_dual_residency_poem`, `equity_comp_sourcing`, `fbar_limit`, `feie_applied`, `feie_ineligible`, `firpta`, `foreign_gift_3520`, `form67_required`, `form_1099da_awareness`, `form_10iea`, `ftc_available`, `ftc_gap`, `fx_basis`, `holding_period_mismatch_`, `india_itr_form_mismatch`, `iso_3921`, `lrs_limit`, `niit_medicare_not_creditable`, `no_totalization_agreement`, `nra_fdap_flat_rate`, `nra_w8ben_missing`, `pan_not_linked_aadhaar`, `pe_article7`, `pfic`, `promoter_buyback_additional_tax`, `retirement_mismatch`, `s115bbe_unexplained_income`, `special_rate_gaming_winnings`, `state_income_tax`, `state_treaty_not_binding`, `tax_year_mismatch`, `transfer_pricing`, `treaty_docs_missing`, `trump_account_contribution_limit`, `withholding_documentation_gap`. **Caveat:** this list was built by extracting every `add("...")` call ID from `conflicts.js` and diffing against every DAG node/file name — a name-level inventory, not a per-finding logic audit (matches the "reported, not asserted" discipline used elsewhere in the DAG's own comments, applied here to the tracker itself). Several of these depend on gaps already listed above being closed first (e.g. `ftc_gap`/`ftc_available` need XBR-2; `state_income_tax` needs TAX-9). |
| CFL-7 | Report-assembly layer: `buildDocuments`, `buildFtcReport`, `buildTaxComputation`, `buildWithholdingSummary`, `buildScopeNotes`, `buildReturnFormDetermination` | ❌ | — | Zero DAG reference. This is the layer that turns computed figures into the `WISING.analyze()` return shape (`{ summary, findings, documents, ftcReport, taxComputation, computed, model }` per `README.md`) — needed for the DAG to be a drop-in replacement even after every finding above is closed. |

### E-bis. New DAG-only findings (no `engine/conflicts.js` counterpart)

Everything in the table above tracks PARITY with an existing engine finding.
This table is different on purpose — it's the one place in this doc for
checks the DAG introduces that production doesn't have at all. Doesn't get
a CFL-N id (there's no engine row to be "at parity" with) and isn't counted
in section G's buildability totals, which are scoped to engine coverage.

| Finding ID | DAG file | Added | Why |
|---|---|---|---|
| `residency_status_mismatch_india` / `_india_company` / `_india_entity` | `residency-nodes.js` (`residencyConsistencyFindings`, via the new `indiaDomesticStatusDerived` node) | 19 Jul 2026, **rewritten same day** | **Supersedes the original narrow day-count heuristic entirely** (the old `residency_status_understated_india`/`_overstated_india`/`_understated_india_company`/`_overstated_india_entity`/`_understated_india_entity` IDs no longer exist). Prompted by "have you considered everything Layer 1 India collects for residency?" — the honest answer was no, and reading `layer1_india.html` directly (not just the engine) surfaced that `runResidencySolver()` (L5717-5919) is a full ~20-branch statutory determination the engine never sees any of, only the final locked status. `deriveIndiaDomesticStatus()` is now a line-by-line port of that ENTIRE function — individual (day-count + 4-year lookback + RNOR sub-status via 9-of-10-years/729-days + employment/crew exception + PIO/citizen visit exception + s.6(1A) deemed-residency), company (incorporation + the POEM "mock rule", ported separately as `deriveCompanyPoem()`), HUF (control-and-management + karta's RNOR sub-status), and firm/LLP/AOP/trust (control-and-management only, no RNOR sub-status — confirmed distinct from HUF by reading the source, not assumed identical). The old hedge ("one exception this engine can't model, verify not wrong") is GONE for India — every fact the real solver reads is now read here too, so a mismatch is a confident finding, not a maybe. **Verification could not use the "exact match against all 11 real profiles" methodology every other phase in this effort relies on** — the fixtures were hand-authored with a chosen final status directly (confirmed: e.g. `foreign_holdco_poem_india`'s own name claims POEM-in-India, but its fixture never sets the `company_residency` facts needed to actually derive that) rather than run through the real wizard, so only 6/11 happen to match and that's reported as informational, not asserted. Real verification instead uses a synthetic case for every one of the 26 status branches (18 individual incl. the no-data default, 4 company, 3 firm/LLP/AOP/trust, 4 HUF — sub-cases combined with 3 mismatch/negative finding cases and 6 unchanged US cases into `run-residency.js`'s 183 total), each checked against the exact path label in the real source, plus 8 more for `deriveCompanyPoem()`'s own branches. |
| `residency_status_dtaa_conflated_india` | `residency-nodes.js` (`residencyConsistencyFindings`) | 19 Jul 2026 | **Resolves the open question this doc flagged earlier the same day** (was: "does `final_india_residency_status` mean pure domestic-law status, or can it be treaty-tainted?"). Resolved by tax-law reasoning, not by picking a side arbitrarily: Indian residential status under s.6 is a domestic-law-only concept; DTAA Article 4 only ever governs which country gets taxing rights under the *treaty*, and only applies once both countries already, independently, consider the person domestically resident — "losing" the tie-break to the US does not stop someone being domestically resident for s.234B/234C advance-tax interest, PAN-Aadhaar linking, Schedule FA disclosure, or any other domestic purpose. `resolveResidency()`'s existing contract (status is treaty-independent; the treaty consequence is applied separately, only to `worldwide`) is therefore the legally correct one — Layer 1's live wizard unconditionally overwriting `final_india_residency_status` to `"NR"` on a US tie-break, for every entity type, is itself the bug. `deriveIndiaDomesticStatus()` deliberately does NOT reproduce that conflation. Rather than gating the mismatch check to suppress firing in this exact situation (which would hide a real, explainable inconsistency), `residencyConsistencyFindings` detects it specifically: when the derived status disagrees with a recorded `"NR"` AND `dtaa_treaty_residence === "us"` or `dtaa_forced_nr === true` is set, it fires this ID instead of the generic mismatch one, naming the DTAA conflation explicitly as the likely cause rather than a vague "data-entry error." Verified with 3 synthetic cases (individual via `dtaa_treaty_residence`, individual via `dtaa_forced_nr`, and company — confirming the override is entity-type-independent, matching the unconditional real source). |
| `residency_status_understated_us` / `_overstated_us` | `residency-nodes.js` (`residencyConsistencyFindings`) | 19 Jul 2026 | Unchanged from the original phase — the US individual SPT day-count check. Confirmed (not assumed) against `layer1_us.html`'s real SPT calculation while doing the India rewrite: `spt_test_met` is computed BEFORE any DTAA/closer-connection/citizen logic runs and is affected only by day-count + `exempt_individual_status` + per-day exclusions, so — unlike the India side — there was no analogous treaty-conflation risk to fix here; these two checks were already reading a pre-override fact, not a post-override one, by original design. Wording tightened to name both real exception categories (exempt-individual status AND separate day-exclusions, e.g. a medical-condition claim) instead of just one, now that both are confirmed against source. |
| `residency_status_understated_us_entity` / `_overstated_us_entity` | `residency-nodes.js` (`residencyConsistencyFindings`) | 19 Jul 2026 | Unchanged from the original phase. Confirmed against the real source (`layer1_us.html:7101`): `final_us_residency_status` for a ccorp/scorp/partnership/trust is only ever `"DOMESTIC_ENTITY"` or `"FOREIGN_ENTITY"`, so any non-`"DOMESTIC_ENTITY"` value is the foreign case. `profile.incorporated_in_us` vs `final_us_residency_status`, both directions exception-free — Layer 1's corporate short-circuit (`layer1_us.html:7099-7126`) sets the status purely from `incorporated_in_us` and returns immediately, before any of the individual SPT/DTAA/citizen logic runs, so (unlike the India side) there's no override path to account for at all. |

## F. Structural risks (not gaps in coverage — risks to the migration itself)

| ID | Item | Severity | Detail |
|---|---|---|---|
| SYS-1 | Constants duplicated, not shared | 🟡 Medium | No file under `prototypes/graph-pilot/` does `require(".../engine/constants.js")` — every tax bracket, cap, and rate (`T.BRACKETS`, `T.SLABS_NEW`, `T.AMT_EXEMPTION`, etc.) is hand-transcribed as a literal object inside each `*-nodes.js` file. Commit messages describe a one-time manual verification ("verified exact against `engine/constants.js` before use") — there is no automated test asserting the two stay in sync. A future Union Budget slab change or an updated §179 cap edited in `constants.js` will **silently** not propagate to the DAG's copies. Recommend converting to a shared import before AGG/TAX rows above multiply the number of files holding a copy. |
| SYS-2 | ~~This tracker itself has no automated freshness check~~ **CLOSED 19 Jul 2026** | — | `scripts/audit/dag-coverage.js` (`npm run audit:dag`, wired into the combined `npm run audit` chain) now performs the comparison mechanically: per-engine-function field-read diff against the mapped DAG file(s), finding-ID diff, numeric-drift check on the DAG's hand-copied constant tables (the automated half of SYS-1's risk), and an engine-function inventory that fails if a new top-level engine function appears without a tracker mapping. Its first run validated every existing row's status, and caught 8 over-claims — see AGG-1 (downgraded to 🟡) and TAX-1's recorded simplification. Residual limit, stated honestly: the script diffs **field reads and constants**, not logic — two functions reading identical fields with different arithmetic would pass it; the `run-*.js` harnesses (11-profile output equality) remain the logic-level check, and the two together still don't equal exhaustive input-space coverage. |

---

## G. Buildability summary

Counted mechanically from every row's own Status cell across A-E (SYS rows in F excluded — they're risks, not coverage gaps; CFL-6 counts as one row here even though it represents 48 individual findings — see its own caveat). Recounted 19 Jul 2026: first after `audit:dag`'s first run moved AGG-1 from ✅ to 🟡, again after TAX-10 closed (❌ → ✅), again after XBR-1 closed (🔶 → ✅).

| Bucket | Count (rows) |
|---|---|
| ✅ Ported & verified | 16 |
| 🟡 Partial (ported with recorded gaps) | 1 (AGG-1) |
| 🔶 Boundary-only (looks covered, isn't) | 3 |
| 📝 Explicitly scoped out (documented) | 2 |
| ❌ Not ported, no DAG reference | 18 (of which CFL-6 alone stands in for 48 individual findings) |
| **Total rows** | **40** |

By subsystem, share of engine logic with zero DAG reference:
- **Income/deduction aggregation (A):** mostly closed — 3 rows ✅ plus AGG-1 🟡 (two specific side-channel reads short of full, down from six), the rest are smaller withholding/equity-comp utility functions.
- **Core tax computation, resident path (B):** essentially closed for individuals — TAX-10 (wiring) is now ✅; the one remaining open item, TAX-9 (state tax), is 🟢 effort rather than a large build.
- **Cross-border reconciliation (C):** the one row that WAS built (XBR-1, residency) is now ✅, but `computeFtc` (XBR-2) — the section carrying the product's headline FTC claim — is still 0% built and is the least-built area in the entire DAG. XBR-1's closure removes what would otherwise have been a real blocker in front of it.
- **Limits & monitoring (D):** ~0% (1 of 7 rows even partially touched).
- **Conflict rule-book (E):** ~9% by finding count (5 of 53).

## H. Suggested closing order

1. ~~**TAX-10 (wire the four existing graphs together)**~~ **CLOSED 19 Jul 2026** — `india-full-nodes.js`/`us-full-nodes.js`, verified 22/22 + 81/81. Was the highest-leverage item (zero new tax logic, turned four standalone proofs into two real chains); do the remaining items below on TOP of the now-wired state, not the old split one.
2. **TAX-9 (`computeUsStateTax`)** — small, self-contained, currently the only *undocumented* gap in an otherwise mostly-complete section; closing it turns B into a genuinely complete section.
3. **AGG-1's two remaining recorded side-channel reads (`agricultural_income_inr`, `unexplained_income_115BBE_inr`) + AGG-6/7/8/9 (remaining `normalize.js` work)** — same shape as the already-closed aggregations, small, no new pattern needed; closing the AGG-1 leftovers also empties its `knownMissing` list in `dag-coverage.js`, restoring that row to a clean ✅ the script enforces. (Its third leftover, `holdingPeriodMismatches[]`, closed 19 Jul 2026 alongside TAX-10.)
4. **LIM-1..6 (limit gauges)** — the underlying math for most of these already exists elsewhere in the DAG (`feieEligibility` for LIM-5, `computeLrsTcs` once AGG-8 lands for LIM-3/4); this is largely wiring, not new tax logic.
5. ~~**XBR-1 (residency tie-breaker) then XBR-2 (`computeFtc`)**~~ **XBR-1 CLOSED 19 Jul 2026** — `residency-nodes.js`, verified 132/132, wired into `us-full-nodes.js` (81/81). Turned out smaller than estimated: `resolveResidency` reads Layer 1's own already-decided conclusions rather than running the tie-break cascade itself (see the dated note near the top of this doc). **XBR-2 (`computeFtc`) is next** and now has a real, non-boundary residency input to build on — this remains the highest-value, highest-effort item left in the whole tracker; closing it is what would let the DAG actually claim the product's headline feature.
6. **CFL-6, in the same priority order `GAP_TRACKER.md` already uses for the underlying tax logic** — a finding is only worth porting once the computation it depends on exists in the DAG; don't port `ftc_gap` before XBR-2, don't port `state_income_tax` before TAX-9. (`holding_period_mismatch_`'s underlying array is now ported — see AGG-1 — but the finding itself, which additionally recomputes `computeUsTax` twice to price the dollar impact, is still unported CFL-6 work. `dual_residency`/`dual_residency_resolved` similarly now have a real, non-boundary `residencyResult` to build on.)
7. **LIM-7 (compliance calendar) and CFL-7 (report assembly)** — last, since both are pure consumers of everything above and represent a genuinely new node shape (dates/formatting rather than tax arithmetic) worth prototyping once there's real output to render.
