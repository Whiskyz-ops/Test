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
| AGG-1 | `aggregateIndiaIncome` | 🟡 | `aggregateindiaincome-nodes.js` | 🟢 | **Downgraded from ✅ on 19 Jul 2026** by `audit:dag`'s first run: the income-figure port is complete and verified (`run-aggregateindiaincome.js` 165/165 across 11 profiles), but the engine function also emits three **side-channel outputs the DAG never reads or reproduces**: (1) `agricultural_income_inr` → `inc.agriculturalIncomeInr`, the ITR-1 disqualifier `computeIndiaItrForm` (XBR-6) consumes; (2) `unexplained_income_115BBE_inr` → `inc.unexplained115bbeInr`, sole trigger of the `s115bbe_unexplained_income` finding (CFL-6); (3) the whole `holdingPeriodMismatches[]` build (`original_acquisition_date`/`buyback_date`/`company_name`/`asset_name_or_ticker` reads, normalize.js L719-830) — the India-vs-US LTCG/STCG classification-conflict list behind the `holding_period_mismatch_` finding (CFL-6). These stayed invisible precisely because the 165 runner checks cover income figures, not metadata fields, and every downstream consumer is itself unported — the exact blind-spot class a runner-only verification can't catch. Recorded in `dag-coverage.js`'s `knownMissing` list; remove entries there only when actually ported. The ~13 internal sub-helpers were additionally confirmed by the mechanical read-diff (94/100 reads present; the 6 missing are exactly the side-channels above). |
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
| TAX-10 | Wiring AGG-1/AGG-3's output graphs into TAX-1/TAX-5's tax-computation graphs | ❌ | — | 🔴 | Both income-aggregation graphs and both tax-computation graphs exist as **separate, unconnected** node sets today. `ustax-nodes.js` still takes `model.income.us` as a `ctx` boundary rather than resolving `aggregateusincome-nodes.js`'s own `aggregateUsIncomeResult` node; same on the India side. Stated as open work in the most recent commit (`1a2ef92`) — restated here so it's tracked in one place rather than only in a commit message. This is the single highest-leverage item: closing it turns four standalone proofs into one real replacement chain for `normalize()` + `computeIndiaTax`/`computeUsTax` combined. |

## C. Cross-border reconciliation (`engine/computation.js`, continued)

This is the section the README calls "the main value proposition" (FTC
Reconciliation) and the DAG has made the least progress here of any area.

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| XBR-1 | `resolveResidency` (dual-residency + DTAA Art. 4 tie-breaker) | 🔶 | `ustax-nodes.js` (`worldwideUs` reads `ctx.computed.residency.us.worldwide`) | 🟡 | Every DAG node that needs a residency fact reads it from the **real engine's own already-resolved** `computed.residency` — the tie-breaker logic itself (home/CVI/habitual-abode cascade) has never been re-derived in the DAG. |
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

## F. Structural risks (not gaps in coverage — risks to the migration itself)

| ID | Item | Severity | Detail |
|---|---|---|---|
| SYS-1 | Constants duplicated, not shared | 🟡 Medium | No file under `prototypes/graph-pilot/` does `require(".../engine/constants.js")` — every tax bracket, cap, and rate (`T.BRACKETS`, `T.SLABS_NEW`, `T.AMT_EXEMPTION`, etc.) is hand-transcribed as a literal object inside each `*-nodes.js` file. Commit messages describe a one-time manual verification ("verified exact against `engine/constants.js` before use") — there is no automated test asserting the two stay in sync. A future Union Budget slab change or an updated §179 cap edited in `constants.js` will **silently** not propagate to the DAG's copies. Recommend converting to a shared import before AGG/TAX rows above multiply the number of files holding a copy. |
| SYS-2 | ~~This tracker itself has no automated freshness check~~ **CLOSED 19 Jul 2026** | — | `scripts/audit/dag-coverage.js` (`npm run audit:dag`, wired into the combined `npm run audit` chain) now performs the comparison mechanically: per-engine-function field-read diff against the mapped DAG file(s), finding-ID diff, numeric-drift check on the DAG's hand-copied constant tables (the automated half of SYS-1's risk), and an engine-function inventory that fails if a new top-level engine function appears without a tracker mapping. Its first run validated every existing row's status, and caught 8 over-claims — see AGG-1 (downgraded to 🟡) and TAX-1's recorded simplification. Residual limit, stated honestly: the script diffs **field reads and constants**, not logic — two functions reading identical fields with different arithmetic would pass it; the `run-*.js` harnesses (11-profile output equality) remain the logic-level check, and the two together still don't equal exhaustive input-space coverage. |

---

## G. Buildability summary

Counted mechanically from every row's own Status cell across A-E (SYS rows in F excluded — they're risks, not coverage gaps; CFL-6 counts as one row here even though it represents 48 individual findings — see its own caveat). Recounted 19 Jul 2026 after `audit:dag`'s first run moved AGG-1 from ✅ to 🟡.

| Bucket | Count (rows) |
|---|---|
| ✅ Ported & verified | 14 |
| 🟡 Partial (ported with recorded gaps) | 1 (AGG-1) |
| 🔶 Boundary-only (looks covered, isn't) | 4 |
| 📝 Explicitly scoped out (documented) | 2 |
| ❌ Not ported, no DAG reference | 19 (of which CFL-6 alone stands in for 48 individual findings) |
| **Total rows** | **40** |

By subsystem, share of engine logic with zero DAG reference:
- **Income/deduction aggregation (A):** mostly closed — 3 rows ✅ plus AGG-1 🟡 (six specific side-channel reads short of full), the rest are smaller withholding/equity-comp utility functions.
- **Core tax computation, resident path (B):** essentially closed for individuals — the two open items (TAX-9 state tax, TAX-10 wiring) are both 🟢/🔴 rather than large builds.
- **Cross-border reconciliation (C):** ~0% — the section carrying the product's headline FTC claim is the least-built area in the entire DAG.
- **Limits & monitoring (D):** ~0% (1 of 7 rows even partially touched).
- **Conflict rule-book (E):** ~9% by finding count (5 of 53).

## H. Suggested closing order

1. **TAX-10 (wire the four existing graphs together)** — highest leverage, zero new tax logic, turns four standalone proofs into one real chain. Do this before adding more nodes on top of the current split state (F/SYS-1 risk grows with every file added on the wrong side of this).
2. **TAX-9 (`computeUsStateTax`)** — small, self-contained, currently the only *undocumented* gap in an otherwise mostly-complete section; closing it turns B into a genuinely complete section.
3. **AGG-1's six recorded side-channel reads + AGG-6/7/8/9 (remaining `normalize.js` work)** — same shape as the already-closed aggregations, small, no new pattern needed; closing the AGG-1 leftovers also empties its `knownMissing` list in `dag-coverage.js`, restoring that row to a clean ✅ the script enforces. |
4. **LIM-1..6 (limit gauges)** — the underlying math for most of these already exists elsewhere in the DAG (`feieEligibility` for LIM-5, `computeLrsTcs` once AGG-8 lands for LIM-3/4); this is largely wiring, not new tax logic.
5. **XBR-1 (residency tie-breaker) then XBR-2 (`computeFtc`)** — in that order, since FTC computation depends on a real (not boundary-read) residency determination. This is the highest-value, highest-effort pair in the whole tracker — closing it is what would let the DAG actually claim the product's headline feature.
6. **CFL-6, in the same priority order `GAP_TRACKER.md` already uses for the underlying tax logic** — a finding is only worth porting once the computation it depends on exists in the DAG; don't port `ftc_gap` before XBR-2, don't port `state_income_tax` before TAX-9.
7. **LIM-7 (compliance calendar) and CFL-7 (report assembly)** — last, since both are pure consumers of everything above and represent a genuinely new node shape (dates/formatting rather than tax arithmetic) worth prototyping once there's real output to render.
