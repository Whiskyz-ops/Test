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

**Follow-up, same session: the engine caught up on the field reads
(GAP_TRACKER.md IN-37), which surfaced a real, live regression in BOTH
the engine and this DAG (IN-38).** `aggregateIndiaIncome`'s (and this
DAG's `aggregateindiaincome-nodes.js`'s own port of it) `isIndiaRor` gate
— the only mechanism that excludes foreign `financial_holdings` from
India's taxable total — checks `status === "ROR"` only, never the treaty-
cede fact. Before the Layer 1 DTAA-conflation fix this was accidentally
masked (status collapsing to `"NR"` on a US tie-break zeroed the gate for
the wrong reason); now that the conflation is fixed on both sides, the
gate needs its own explicit fix, which it didn't have. Closed here in the
DAG (`isIndiaRor = status === "ROR" && !dtaaWorldwideCeded`, a new
`indiaDtaaWorldwideCededAgg` raw leaf reading the same
`residency_detail.dtaa_worldwide_ceded` fact the Layer 1 fix produces).

**Second follow-up, same session: the engine caught up too — both sides
are back in sync.** User instruction: "Yes, close IN-38 in the engine
too." `engine/normalize.js`'s `aggregateIndiaIncome` now carries the same
`isIndiaRor = status === "ROR" && !dtaaWorldwideCeded` fix, gating only
its `foreign_equity_unlisted`-specific read — a separate, deliberately
ungated read of `financial_holdings.transactions` further down handles
India-registered instruments (listed_equity, mutual funds, bonds, etc.),
which stay taxable regardless of residency under s.9(1)(i)'s source rule.
`run-aggregateindiaincome.js`'s IN-38 case is now checked against
`WISING.analyze()` directly (no longer a standalone-only assertion) —
183/183. GAP_TRACKER.md IN-38 marked shipped. Both sides confirmed
matching exactly: ceded → `ltcg197Inr` 0 on both; not ceded → `ltcg197Inr`
3,00,000 on both, for the same synthetic `foreign_equity_unlisted` fact
pattern.

**Third follow-up, same session: a separate, pre-existing DAG-only bug
found while re-verifying the above — fixed, GAP_TRACKER.md IN-39.** The
DAG's `capitalGainsComputation` used to gate its entire
`financialHoldingsTxs` read behind `isIndiaRor` — one shared array fed
BOTH the foreign-holdings loop and the general-classes (listed_equity/
mutual-fund/bond/etc.) loop. The real engine only gates the foreign-
holdings-specific read; its general-classes loop re-reads
`financial_holdings.transactions` a second time, deliberately ungated,
since India-registered instruments are India-source and stay taxable
regardless of residency. Confirmed live before the fix: an NR taxpayer
with a synthetic ₹3,00,000 India-source `listed_equity` LTCG computed
`ltcg197Inr` = 3,00,000 in the engine but 0 in the DAG. This predated this
session's IN-38 work — the shared, gated variable already existed before
the `!dtaaWorldwideCeded` conjunct was added — so IN-38 inherited the
over-gating rather than causing it. Not in the 11-real-profile suite's
coverage (no demo fixture combines non-ROR status with domestic financial
holdings), so `run-aggregateindiaincome.js`'s existing checks never
exercised this path.

User instruction: "Yes, fix IN-39 in the DAG too." Fixed by mirroring
`normalize.js`'s own structure exactly: the gated variable was renamed to
`foreignFinancialHoldingsTxs` and now feeds only the `foreign_equity_
unlisted` loop; the general-classes loop takes its own fresh, always-
ungated `safe(india, "financial_holdings.transactions", [])` read, same
as the engine's second read at `normalize.js` ~995. Verified with a new
`run-aggregateindiaincome.js` case checking the same ₹3,00,000 India-
source `listed_equity` gain across NR, RNOR, and ROR+DTAA-ceded — all
three now match `WISING.analyze()` exactly (previously only plain ROR
matched; the other three wrongly zeroed it). 189/189 on
`run-aggregateindiaincome.js`, 27/27 production suite (unaffected — this
was a DAG-only bug, the engine never had it), `audit:dag` clean. Both
IN-38 and IN-39 are now closed on the DAG side, matching the engine.

**XBR-2 closed, 19 July 2026 (second session pass):** `ftc-nodes.js` ports
`computeFtc` line-for-line — both directions, the FEIE no-double-dip, and
the NRA/no-scope double-zeroing whose fallback leak was the historical
XB-24 bug — verified **176/176** standalone (all 11 profiles, entity + NRA
included, every output field). `xborder-full-nodes.js` then merges
india-full + us-full + ftc and closes all 12 FTC boundary leaves in-graph,
verified **144/144** by `run-xborder-full.js` under the strictest ctx of
any runner: `model` carries only `{entity, meta}` — no `income`, no
`computed`. The product's headline number (net unrelieved double tax) now
computes end-to-end from raw Layer 1 form data. `usTaxResult` gained four
FTC-facing fields (`totalIncomeUsd`/`usSourceIncomeUsd`/`feieAppliedUsd`/
`worldwide`) mirroring the engine result's own. See the XBR-2 row.

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
| AGG-1 | `aggregateIndiaIncome` | ✅ | `aggregateindiaincome-nodes.js` | — | **Downgraded from ✅ on 19 Jul 2026** by `audit:dag`'s first run: the income-figure port was complete and verified (`run-aggregateindiaincome.js` 165/165 across 11 profiles), but the engine function also emitted three **side-channel outputs the DAG didn't read or reproduce**. All three now closed, same day: `holdingPeriodMismatches[]` (`original_acquisition_date`/`buyback_date`/`company_name`/`asset_name_or_ticker` reads, normalize.js L719-830 — the India-vs-US LTCG/STCG classification-conflict list behind the `holding_period_mismatch_` finding, CFL-6) built inline inside `capitalGainsComputation`'s existing buy-back/foreign-equity loops, verified 179/179 (count + every field checked against the real array; 3 real mismatches in the demo data — AMZN, NVDA, Nova Systems Pvt Ltd — confirming the pass isn't vacuous). `agricultural_income_inr` → `inc.agriculturalIncomeInr`, the ITR-1/4 `>₹5,000` disqualifier `computeIndiaItrForm` (XBR-6) consumes — now `agriculturalIncomeInrAgg`, verified 200/200 (was 189/189 before this check was added), since XBR-6 turned out to be its one real consumer. **Last one closed same day, alongside CFL-6 batch 2:** `unexplained_income_115BBE_inr` → `inc.unexplained115bbeInr`, sole trigger of the `s115bbe_unexplained_income` finding — now `unexplained115bbeInrAgg`, verified 222/222 (was 200/200 before this check was added), confirmed genuinely non-vacuous (₹250,000 on `us_resident_indian_income`). While closing this, also exposed a previously-internal-only counter, `chapterXiiaSfeaHoldingCount` (normalize.js L1078/1087, incremented per Chapter XII-A specified-foreign-exchange-asset holding), needed by the three `chapter_xiia_*` findings — added to `capitalGainsComputation`'s return object, verified in the same 222/222 pass. `dag-coverage.js`'s `knownMissing` list for this row is now empty; `audit:dag` confirms zero missing reads. The ~13 internal sub-helpers were additionally confirmed by the mechanical read-diff (100/100 reads present). |
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
| TAX-10 | Wiring AGG-1/AGG-3's output graphs into TAX-1/TAX-5's tax-computation graphs | ✅ | `india-full-nodes.js`, `us-full-nodes.js` | — | **Closed 19 Jul 2026.** India side: `india-full-nodes.js` merges `aggregateindiaincome-nodes.js` + `in1-nodes-v3.js` + `entitytax-nodes.js` and redefines all 13 explicit boundary nodes (`businessInrBoundaryV3`, `stcgInrBoundary`, `ltcgInrBoundary`, etc., `entityTaxableInrBoundary` included) to read the merged income subgraph's own output nodes instead of `ctx.model.income.india` — confirmed by grep that this leaves ZERO remaining `ctx.model`/`ctx.computed` reads in the individual/HUF or entity path. Verified via `run-india-full.js` with `ctx` deliberately carrying only `{router, india, us}` (no `model`/`computed`, to prove the boundary is actually gone, not just unused): **22/22** across all 11 profiles, both `totalTaxInr` and regime label, including all 3 entity/company profiles (the old `in1-nodes-v3.js`-only runner never covered those). US side: `us-full-nodes.js` merges `aggregateusincome-nodes.js` + `ustax-nodes.js`, redefines the one boundary node `incUs` to read `aggregateUsIncomeResult` — its `compute()` now takes no `ctx` parameter at all, a structural (not just empirical) guarantee. Verified via `run-us-full.js`: **90/90** on the 9 individual/resident profiles (entity/NRA profiles still reported, not asserted — TAX-7/TAX-8 unchanged). **Hardened 19 Jul 2026 (second pass):** the no-`ctx`-parameter argument covers `incUs` alone — `ctx.model` must still be passed for the AGG-10 boundaries (`usEntityKind`/`baseYearUs`), leaving `model.income.us` *reachable* by every other node in the merged graph. The runner now POISONS `ctx.model.income.us` to null before resolving (any node anywhere in the chain still reading the engine's aggregate fails loudly instead of passing by luck) and adds a per-profile chain-sanity check that the graph-derived income total equals the engine aggregate it was denied — the same discipline `run-india-full.js` gets for free by passing no `model` at all, applied to the side that can't drop `model` yet. `usEntityKind`/`worldwideUs`/`baseYearUs` deliberately NOT swept into this wiring — entity classification and residency determination are separate machinery (see XBR-1), left as real open boundaries rather than silently absorbed. |

## C. Cross-border reconciliation (`engine/computation.js`, continued)

This is the section the README calls "the main value proposition" (FTC
Reconciliation) and the DAG has made the least progress here of any area.

| ID | Item | Status | DAG file | Effort | Detail |
|---|---|---|---|---|---|
| XBR-1 | `resolveResidency` (dual-residency + DTAA Art. 4 tie-breaker) | ✅ | `residency-nodes.js`, wired into `us-full-nodes.js` | — | **Closed 19 Jul 2026** (re-scoped from the 🔶/🟡 the tracker originally guessed — see the dated note above for why). `resolveResidency` doesn't run the tie-break cascade itself; that decision is Layer 1's, handed to the engine as already-resolved fields (`residency_detail.final_india_residency_status`, `dtaa.dtaa_treaty_residence`, etc.). What the function DOES do — turn those into per-side worldwide-taxation booleans, apply the treaty cede consequence (with the US-citizen saving-clause carve-out), and assemble `dualResident`/`tieBreakWinner`/`worldwideOverlap` — is ported in full and verified 132/132 in `run-residency.js` against all 11 profiles, `ctx` carrying no `model`/`computed` at all (a genuine derivation, not a disguised boundary read). `us-full-nodes.js`'s `worldwideUs` now resolves `residencyResult.us.worldwide` instead of reading `computed.residency` — re-verified 81/81 in `run-us-full.js` with `ctx.computed` removed from the harness entirely. India side needed no wiring: `in1-nodes-v3.js`/`entitytax-nodes.js` were already reading India residency status as a raw field, never via `computed.residency`. |
| XBR-2 | `computeFtc` (§904 limitation, both directions, credit pool + carryover) | ✅ | `ftc-nodes.js` + `xborder-full-nodes.js` | — | **Closed 19 Jul 2026** (separate, parallel session — see the reconciliation note below). `ftc-nodes.js` ports `computeFtc` (computation.js L1319-1402) line-for-line: the US Form 1116 direction (FEIE §911(d)(6) no-double-dip with proportional Indian-tax disallowance, §904-style limit fraction, carryover) and the India §159 relief direction, including the NRA/no-US-scope double-zeroing whose `: 1` fallback leak was the historical XB-24 bug, and the by-construction-zero `indiaResidual` expression kept verbatim rather than "improved". Verified standalone via `run-ftc.js`: **176/176** — all 11 profiles asserted (entity + NRA included, since boundaries there read real engine outputs), every output field (11 US-direction + 4 India-direction + net). Then `xborder-full-nodes.js` merges india-full + us-full + ftc and redefines all 12 FTC boundary leaves to in-graph values — `usTaxResult` (extended with `totalIncomeUsd`/`usSourceIncomeUsd`/`feieAppliedUsd`/`worldwide`, mirroring the engine result's own FTC-facing fields), `totalTaxInrCombined`/`totalIncomeInrV3`/`entityTaxableInrBoundary` (entity-routed, matching engine L517/L720), `totalIndiaIncomeInr`, `aggregateUsIncomeResult.usSourceTotal`, `residencyResult.india.worldwide`, and a router-derived scope node mirroring normalize L2177-2182. Verified via `run-xborder-full.js`: **144/144** — the strictest ctx of any runner (`model` carries ONLY `{entity, meta}`; no `income`, no `computed`), so the product's headline net-unrelieved-double-tax figure now computes end-to-end from raw Layer 1 data (real nonzero matches: $1,068 / $6,389 / $7,177 to the dollar). US-entity + NRA profiles reported, not asserted (their US tax is TAX-7/TAX-8, scoped out); India-entity profiles ARE asserted. This closes exactly the blocker the same-day scoping pass below identified (three `usTaxResult` fields + an explicit NRA-scope decision) — resolved the same way that pass recommended (NRA reported, not asserted). Prior-state note kept for history: before this, the only FTC-adjacent DAG code was the XB-24 scope-gating slice in `scope-nodes.js`. |
| XBR-3 | ~~`mapDoubleTaxedIncome` (per-head doubly-taxed-income breakdown)~~ **CLOSED 19 Jul 2026** | ✅ | `doubletax-nodes.js` | — | Scoped, then built same session (see the dated note below): `mapDoubleTaxedIncome(model, residency)` (computation.js:1407-1444, 38 lines) — 6 declarative `pair()` calls comparing an India-side income head against a US-side "foreign-source counterpart" head, plus one reduce. The scoping pass's "needs verifying" turned out fully positive: `aggregateUsIncomeResult` (`aggregateusincome-nodes.js`, AGG-3 ✅) already exposed every `foreign*` field this reads (`foreignWages`/`foreignSelfEmployment`/`foreignRental`/`foreignInterest`/`foreignDividends`/`foreignCapitalGains`, all byte-for-byte matching field names, as `{usd:X}` money objects) — zero new US-side work needed. India-side fields reuse `in1-nodes-v3.js`'s already-ported raw leaves (`salaryInr`/`housePropertyInr`/`interestInr`/`dividendInr`, TAX-1 ✅) plus `aggregateindiaincome-nodes.js`'s own `businessComputation.businessInr` and a new `indiaCapitalGainsInrXbr3` node (sums `capitalGainsComputation`'s `stcgInr`+`ltcgInr`+`ltcg197Inr`, all three already confirmed exact-match against the real model in `run-aggregateindiaincome.js`'s own checks). Built on `xborder-full-nodes.js` (not a smaller merge) since this needs both countries' income plus `residencyResult.us.worldwide` together — the exact set that file already assembles. Verified in `run-doubletax.js`: **55/55** exact match against `computed.doubleTax.{items,totalDoublyTaxedUsd}` across all 11 real profiles, `ctx` carrying only `{router, india, us}` — no `model`/`computed` at all. Every income head type (salary, business, house property, interest, dividend, capital gains) genuinely appears across the fixtures, not just asserted in the abstract. `audit:dag` confirms mechanically: zero missing field reads once `doubletax-nodes.js` was added to the tracker mapping and `NODE_FILES`. |
| XBR-4 | ~~`crossBasis` (income re-computed under the other country's code — the "same income, both codes" reconciliation table)~~ **CLOSED 19 Jul 2026** | ✅ | `crossbasis-nodes.js` | — | Scoped, then built same session (see the dated note below): `crossBasis(model, residency, usTax)` (computation.js:1514-1605, 92 lines) never reads `ftc` or `stateTax` at all; it's a sibling of XBR-2/XBR-5/XBR-6 in the orchestrator (`compute()`, computation.js:1794-1804), not downstream of any of them (the tracker's original "depends on XBR-2/TAX-9" claim was checked against source and found wrong, same session). Table-driven, 11 `row()` calls behind `if (amount > 0)` guards + 2 reduces, no new tax logic. **A real, separate bug was found while reading this function closely enough to port it — not something the scoping pass caught:** `computation.js:1520` compared `model.residency.india.taxRegime` against lowercase `"old"`, but the field is always stored uppercase (`"OLD"`/`"NEW"`, confirmed in both real profile data and `layer1_india.html`'s own source) — the comparison was always false, so the reconciliation table always used the ₹75,000 NEW-regime standard deduction, even for an OLD-regime taxpayer. Fixed in the engine first, same session (GAP_TRACKER.md IN-41), by normalizing case exactly the way every other read of this field in the engine already does. This DAG port never had the bug in the first place — `in1-nodes-v3.js`'s own `taxRegime` node (TAX-1, reused here) already normalizes to uppercase — so nothing needed changing DAG-side beyond verifying against the now-fixed engine. Built on `doubletax-nodes.js` (a strict superset of `xborder-full-nodes.js` — reuses XBR-3's `indiaCapitalGainsInrXbr3` sum rather than redefining it) plus two new raw leaves (`usOwns10PctForeignCorpRaw`, `usForeignCorpsRaw`, `normalize.js:2552-2553`). Note on `ctx` shape: this is the one XBR-2..6 row that ISN'T a pure `{router, india, us}` derivation — it pulls in `usTaxResult` (for `feieAppliedUsd`), which transitively needs `baseYearUs`/`usEntityKind`, real open boundaries TAX-10's own row already documents — so `ctx.model` carries `{entity, meta}` only, the same shape `run-xborder-full.js` already established for the identical reason. Verified in `run-crossbasis.js`: **69/69** — exact match against `computed.reconciliation.{rows,overlapUsd,feieAppliedUsd,anyEstimate}` across all 11 real profiles (both `IN→US` and `US→IN` directions, all 6 India-side and 5 US-side row types genuinely exercised across the fixtures), plus a synthetic OLD-regime case exercising the IN-41 fix specifically (no real profile combines OLD regime with a salary row under either direction). `audit:dag` confirms mechanically: zero missing field reads once `crossbasis-nodes.js` was added to the tracker mapping and `NODE_FILES`. **This closes the entire XBR-2..6 cluster.** |
| XBR-5 | ~~`computeApportionment` (FY-vs-CY tax-year apportionment)~~ **CLOSED 19 Jul 2026** | ✅ | `apportionment-nodes.js` | — | Scoped, then built same session (see the dated note below): `computeApportionment(model)` (computation.js:1616-1644, 29 lines) was the most self-contained of all five XBR rows — reads ONLY `model.meta.baseYear`, `model.periods.indiaQuarterlyUsd`, `model.income.india.total.usd`, `model.income.us.usSourceTotal.usd`; zero dependency on `residency`/`indiaTax`/`usTax`/any other XBR row. Ported in full: two new raw leaves (`apportionmentBaseYearRaw`, `apportionmentIndiaQuarterlyUsdRaw`) read directly from `ctx.router`/`ctx.us`/`ctx.india`, matching every other from-scratch phase's discipline rather than reading `ctx.model.meta.baseYear` as a boundary (the way `ustax-nodes.js`'s separate `baseYearUs` node does, deliberately — see TAX-10's own note on why that one stays a boundary). India/US FY totals reuse the already-closed AGG-1 (`totalIndiaIncomeInr`, converted to USD) and AGG-3 (`aggregateUsIncomeResult.usSourceTotal.usd`) outputs rather than re-deriving income classification — same "merge the already-built pieces" shape as `india-full-nodes.js`/`us-full-nodes.js`, confirmed collision-free by inspection (18 + 13 node names, zero overlap) before merging. Verified in `run-apportionment.js`: **132/132** exact match against `computed.apportionment` across all 11 real profiles, `ctx` carrying only `{router, india, us}` — no `model`/`computed` at all. Both real branches genuinely exercised, not just asserted: 5 of the 11 profiles have quarterly India data (`basis: "Indian quarterly data"`), 6 fall back to the even-earning assumption — confirmed by checking `computed.apportionment.basis` per profile before treating the 132/132 as meaningful. `audit:dag` confirms mechanically: zero missing field reads once `apportionment-nodes.js` was added to the tracker mapping and `NODE_FILES`. |
| XBR-6 | ~~`computeIndiaItrForm` (ITR form determination)~~ **CLOSED 19 Jul 2026** | ✅ | `itrform-nodes.js` | — | Scoped, then built same session (see the dated note below): `computeIndiaItrForm(model, computed)` (computation.js:1679-1789, 111 lines) — ~12 disqualifier boolean checks + an entity-type cascade, all table-driven. The scoping pass's "one field to verify" turned out to be a real gap, not a rename: `computed.indiaTax.grossTotalIncomeInr` is the PRE-Chapter-VI-A-deduction figure (computation.js L489), while the DAG's already-closed `totalIncomeInrV3` (`in1-nodes-v3.js:365`) is POST-deduction (L440's `totalIncomeInr`) — traced both formulas term-by-term from source and found they differ in exactly one term (`normalSlabInr` vs. `totalNormalInr`), identical otherwise. Closed with two small additions: `grossTotalIncomeInrV3` (a sibling of `totalIncomeInrV3` with that one term swapped) for the individual/HUF path, and `grossTotalIncomeInrCombined` (routes to the already-closed `entityTaxableInrBoundary` for companies/firms, whose own gross figure already equals their taxable figure — no Chapter VI-A deductions ever apply to an entity) for the company/firm path, mirroring the exact `isEntityTaxpayer`-gated pattern `india-full-nodes.js` already used for `totalTaxInrCombined`/`regimeCombined`. Five more small raw leaves round out the fact set (foreign income/assets declared, brought-forward losses, company-director flag, s.115-Section-8 flag, Layer 1's own persisted ITR recommendation for the cross-check fields only). Also closed AGG-1's `agricultural_income_inr` knownMissing side-channel along the way (`agriculturalIncomeInrAgg`, `aggregateindiaincome-nodes.js`) — XBR-6 is its one real consumer, so this was the natural place to close it, not a separate detour. Verified in `run-itrform.js`: **91/91** exact match against `computed.indiaItrForm` across all 11 real profiles (10 India-scoped profiles asserted on every field — form, explanation, disqualifiers list content, `totalIncomeInr`, director-unknown flag, and all three frontend cross-check fields; the 1 non-India-scoped profile confirmed correctly null), `ctx` carrying only `{router, india, us}` — no `model`/`computed` at all. Real branch diversity confirmed, not just asserted: the 10 asserted profiles produce ITR-2, ITR-3, ITR-4 (SUGAM), and ITR-6, with disqualifier counts ranging 0-6. `audit:dag` confirms mechanically: zero missing field reads once `itrform-nodes.js` was added to the tracker mapping and `NODE_FILES`. |

**Scoping pass, 19 Jul 2026 — prompted by "how to correct" the CFL-7
asymmetry surfaced while closing IN-40.** Read `computeFtc`/
`mapDoubleTaxedIncome`/`crossBasis`/`computeApportionment`/
`computeIndiaItrForm` in full from source (not from this doc's own prior
prose) before writing anything above. Two findings worth flagging for
whoever picks this up next:

1. **This doc's own dependency claims were partly wrong.** XBR-4's "depends
   on XBR-2/TAX-9" doesn't hold up — `crossBasis` never reads `ftc` or
   `stateTax`. All five XBR-2..6 functions are siblings called directly
   from `compute()`'s orchestrator (`computation.js:1794-1804`) with only
   `model`/`residency`/`indiaTax`/`usTax` as inputs — all four of which are
   already ✅ ported (XBR-1/TAX-1/TAX-5) except the two specific `usTax`
   fields noted on XBR-2's own row. **They can be built in any order, or in
   parallel — not the sequential chain implied by the old "XBR-2 then
   everything downstream" framing.**
2. **CFL-7 (next section) isn't one monolithic blocker either.** Its 13
   functions are blocked on 4 different, unrelated things — see CFL-7's own
   row for the breakdown. Most of it can be built piecewise alongside
   XBR-2..6 rather than as a single final undertaking after everything else.

Suggested order at the time this was written: **XBR-5 → XBR-6 → XBR-3 →
XBR-4 → XBR-2**, each roughly increasing in the size of its remaining
blocker — then CFL-7's individually-unblocked pieces (`buildScopeNotes`,
`analyze`'s orchestration, `buildReturnFormDetermination`'s US half) as
soon as convenient, with the rest of CFL-7 following each XBR row as it
closes.

**Reconciliation, same day: XBR-5 and XBR-2 closed concurrently by two
separate sessions, out of the suggested order above — expected and fine,
not a conflict.** This session built XBR-5 first, per the plan. A parallel
session picked up XBR-2 directly (skipping XBR-6/XBR-3/XBR-4) and closed
it in full, including the exact `usTaxResult` extension and NRA-scope
decision this scoping pass called for. This is consistent with finding 1
above, not contrary to it — XBR-2..6 have no dependencies on each other,
so any order (including two closing at once, out of sequence, in
different sessions) is safe. Remaining as of this reconciliation: XBR-3,
XBR-4, and CFL-7's still-blocked pieces.

**Second follow-up, same day: XBR-6 closed too (this session, continuing
in order)** — `itrform-nodes.js`, 91/91. See its own row for what the
"one field to verify" turned out to be. Remaining: XBR-3, XBR-4, and
CFL-7's still-blocked pieces.

**Third follow-up, same day: XBR-3 closed too** — `doubletax-nodes.js`,
55/55. The scoping pass's "needs verifying" on the US-side `foreign*`
breakouts turned out fully positive (already exposed, zero new US-side
work) — see its own row. Remaining: XBR-4, and CFL-7's still-blocked
pieces.

**Fourth follow-up, same day: XBR-4 closed — the entire XBR-2..6 cluster
is now ✅.** `crossbasis-nodes.js`, 69/69. Found a genuine, separate bug
while reading `crossBasis` closely enough to port it (not something the
scoping pass caught): a case-sensitivity comparison against
`taxRegime` that was always false for real data. Fixed in the engine
first (GAP_TRACKER.md IN-41, user-authorized: "Yes fix both"), then
verified the DAG — which never had the bug to begin with, since its own
`taxRegime` node already normalized case — matches the corrected engine
exactly, including a synthetic OLD-regime case no real profile exercises.
Remaining in this general area: CFL-7's still-blocked pieces (now further
unblocked — `buildFtcReport` needed XBR-2, closed; `buildReturnFormDetermination`'s
India half needed XBR-6, closed — see CFL-7's own row) and CFL-6's 48
individual findings.

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
| CFL-6 | **The remaining 48 findings — 14 closed (batches 1-2), 34 remain** | 🟡 | `findings-nodes.js` (batch 1), `findings-batch2-nodes.js` (batch 2) | **Batch 1 closed 19 Jul 2026** (`findings-nodes.js`, built on `crossbasis-nodes.js`): `pan_not_linked_aadhaar` (zero computed deps, one raw fact), `amt_applies` (`usTaxResult.amtUsd`, TAX-5/6), `entity_dual_residency_poem` (residency + company-POEM raw leaves already added to `residency-nodes.js` for `deriveCompanyPoem`), `ftc_gap`/`ftc_available` (`ftcResult`, XBR-2), `dual_residency`/`dual_residency_resolved` (`residencyResult` + `doubleTax` from XBR-3 + 4 new tie-break raw leaves `tb_home`/`tb_cvi`/`tb_abode`/`tb_nationality`, `normalize.js:2460-2463`, previously read nowhere in the DAG + `describeTieBreak()` ported verbatim, `conflicts.js:46-61`). Verified in `run-findings.js`: **20/20** — finding-ID-set match plus full detail-text match for every finding that fires, across all 11 real profiles; US-entity/NRA profiles report (not assert) the 3 findings that depend on `usTaxResult` (`ftc_gap`/`ftc_available`/`amt_applies` — same TAX-7/TAX-8 scope limit as `run-xborder-full.js`), the other 4 IDs asserted everywhere. **Batch 2 closed same day** (`findings-batch2-nodes.js`, built by merging `itrform-nodes.js` and `findings-nodes.js` — two independently-diverged branches off the same `india-full-nodes.js` ancestor, safely mergeable via a reference-equality-aware collision check, `NODES[k] !== src[k]` rather than a bare truthiness check, since Node's `require()` cache guarantees any genuinely shared key is the same function reference on both branches — verified empirically first, 106 shared keys, 0 true collisions): `cross_basis_summary` (`crossBasisResult`, XBR-4), `india_itr_form_mismatch` (`indiaItrFormResult`, XBR-6), `special_rate_gaming_winnings` (`specialRate115bbInr` converted to USD + `residencyResult.us.worldwide`), `s115bbe_unexplained_income` (AGG-1's `unexplained115bbeInrAgg`, closed alongside this batch — AGG-1's LAST recorded knownMissing item, now fully closed), and the three `chapter_xiia_*` findings (`chapterXiiaSfeaHoldingCount`, newly exposed on `capitalGainsComputation`'s return object — was computed internally but never returned — plus one new raw leaf `chapterXiiaElectedRaw`). Verified in `run-findings2.js`: **26/26** — 20 checks across the 11 real profiles (full parity asserted everywhere, no US-entity/NRA demotion needed — none of these 7 IDs read `usTaxResult`'s tax-liability figures directly, only `crossBasisResult`'s `feieAppliedUsd` use of it, already proven full-parity-safe in `run-crossbasis.js`) plus 6 checks from 3 permanent synthetic cases for the IDs no real profile happens to exercise (`india_itr_form_mismatch`, `chapter_xiia_investment_income_missing`, `chapter_xiia_investment_income_computed`), each checked against the real engine directly first, same discipline as `run-crossbasis.js`'s IN-41 case. **34 remain**, listed here as the up-to-date "no DAG reference" set: `carry_forward_losses_not_applied`, `cfc`, `cfc_below_threshold`, `covered_expat_gift_tax`, `deemed_dividend_buyback_mismatch`, `dtaa_treaty_elections`, `equity_comp_sourcing`, `fbar_limit`, `feie_applied`, `feie_ineligible`, `firpta`, `foreign_gift_3520`, `form67_required`, `form_1099da_awareness`, `form_10iea`, `fx_basis`, `holding_period_mismatch_`, `iso_3921`, `lrs_limit`, `niit_medicare_not_creditable`, `no_totalization_agreement`, `nra_fdap_flat_rate`, `nra_w8ben_missing`, `pe_article7`, `pfic`, `promoter_buyback_additional_tax`, `retirement_mismatch`, `state_income_tax`, `state_treaty_not_binding`, `tax_year_mismatch`, `transfer_pricing`, `treaty_docs_missing`, `trump_account_contribution_limit`, `withholding_documentation_gap`. **Caveat (unchanged):** built by extracting every `add("...")` call ID and diffing against DAG node names — name-level, not a per-finding logic audit. Known-still-blocked (unchanged from batch 1's scoping, re-confirmed still accurate): `feie_ineligible`/`feie_applied` (DAG's `feieEligibility()` is missing the engine's `reasons[]` detail field); `state_income_tax`/`state_treaty_not_binding` (TAX-9); `withholding_documentation_gap` (AGG-6/7); `equity_comp_sourcing` (AGG-9); `nra_fdap_flat_rate`/`nra_w8ben_missing` (TAX-8, scoped out); `holding_period_mismatch_` (needs a second `computeUsTax` pass to price the dollar impact, not just the array AGG-1 already exposes); `lrs_limit`/`fbar_limit`/`trump_account_contribution_limit` (LIM-1..6, boundary-only); `dtaa_treaty_elections` (needs `computed.indiaTax.s115a`/`nrInterest.elections[]` metadata, TAX-1's own recorded knownMissing gap). No batch-3 candidates scoped yet — the remaining 25 findings not listed above (`carry_forward_losses_not_applied`, `cfc`/`cfc_below_threshold`, `covered_expat_gift_tax`, `deemed_dividend_buyback_mismatch`, `firpta`, `foreign_gift_3520`, `form67_required`, `form_1099da_awareness`, `form_10iea`, `fx_basis`, `iso_3921`, `niit_medicare_not_creditable`, `no_totalization_agreement`, `pe_article7`, `pfic`, `promoter_buyback_additional_tax`, `retirement_mismatch`, `tax_year_mismatch`, `transfer_pricing`, `treaty_docs_missing`) haven't had their dependencies traced yet this session — the next batch needs a fresh scoping pass, not an assumption they're ready. |
| CFL-7 | Report-assembly layer: `buildDocuments`, `buildFtcReport`, `buildTaxComputation`, `buildWithholdingSummary`, `buildScopeNotes`, `buildReturnFormDetermination` | ❌ | — | Zero DAG reference. This is the layer that turns computed figures into the `WISING.analyze()` return shape (`{ summary, findings, documents, ftcReport, taxComputation, computed, model }` per `README.md`) — needed for the DAG to be a drop-in replacement even after every finding above is closed. **Scoped in detail 19 Jul 2026** (see the dated note above the D. header): actually 13 functions across `conflicts.js` (`usFtcForm`, `describeTieBreak`, `indiaBusinessTurnoverInr`, `buildDocuments`, `bracketParts`, `s115aParts`, `nrInterestParts`, `buildFtcReport`, `buildTaxComputation`, `buildWithholdingSummary`, `buildScopeNotes`, `buildReturnFormDetermination`, `analyze`), ~1,016 lines total. Mostly formatting/mapping already-computed numbers into display shapes, not new tax logic — the one real exception is `buildWithholdingSummary`, which derives genuine new dollar figures (the cost of a missing treaty document). No existing DAG file has a trace/display-object pattern to reuse (`{kind:"calc"|"source"|"holdings",...}`) — checked across all 27 `*-nodes.js` files, none exist; first implementer here invents the node shape. Also: `README.md`'s documented `analyze()` return shape is stale — the real function returns 11 top-level keys, not 7 (`withholding`, `scopeNotes`, `returnForms`, `monitoring` are undocumented). **Not one blocker — four independent ones, so this can be built piecewise:** `buildScopeNotes` + `analyze`'s own orchestration + `buildReturnFormDetermination`'s US half are already unblocked today; `buildReturnFormDetermination`'s India half needed only XBR-6 — **now unblocked, XBR-6 closed same day (see its own row)**; `buildFtcReport` needed only XBR-2 — **now unblocked, XBR-2 closed same day (see its own row)**; `s115aParts`/`nrInterestParts`/part of `buildTaxComputation` need the already-recorded `elections[]` metadata gap in TAX-1 closed (not a new blocker, an existing one); `buildWithholdingSummary` (the most expensive single function) needs the unrelated AGG-6/7/8 aggregation work, nothing to do with XBR-2..6. |

### E-bis. New DAG-only findings (no `engine/conflicts.js` counterpart) — *see follow-up below, table title is now historical*

Everything in the table above tracks PARITY with an existing engine finding.
This table is different on purpose — it's the one place in this doc for
checks the DAG introduces that production doesn't have at all. Doesn't get
a CFL-N id (there's no engine row to be "at parity" with) and isn't counted
in section G's buildability totals, which are scoped to engine coverage.

**Follow-up, same session, title no longer literally accurate: all 7
finding IDs in the table below now have a real `engine/conflicts.js`
counterpart too (GAP_TRACKER.md IN-40).** User instruction, after
confirming the strategic reason ("we have to keep engine and DAG as close
to each other as possible until DAG has everything the engine has and is
able to replace it"): ported `deriveIndiaDomesticStatus`/`deriveCompanyPoem`
verbatim into `engine/normalize.js`, and the matching
`residencyConsistencyFindings` logic into `engine/conflicts.js` (new §4f3,
right after `entity_dual_residency_poem`) — same two-tier structure, same
7 finding IDs, same reasoning. Kept as a "DAG-only" table rather than
retitled or moved into section E with new CFL-N rows, because the DAG
built these FIRST — this table is the dated record of that, and rewriting
it to look like parity-with-the-engine-from-day-one would erase real
project history (the engine trusting Layer 1's residency conclusion
blindly, with no independent verification, was a genuine gap this session
found and closed in that order: DAG first, engine second, on explicit
request each time). `scripts/audit/dag-coverage.js`'s `DAG_FINDING_IDS`
map — previously never updated when this table's 4 rows were added,
which showed all 7 IDs as informational "MISSING" in the audit's
finding-ID diff even though the DAG already had them — is now current.
78/78 on the engine's own suite (`tests/engine/run.js`, up from 27 — 37
synthetic branch cases + 13 consistency-finding cases added, real-profile
report matches the DAG's own 6/11), `audit:dag` clean.

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

Counted mechanically from every row's own Status cell across A-E (SYS rows in F excluded — they're risks, not coverage gaps; CFL-6 counts as one row here even though it represents 48 individual findings — see its own caveat). Recounted 19 Jul 2026: first after `audit:dag`'s first run moved AGG-1 from ✅ to 🟡, again after TAX-10 closed (❌ → ✅), again after XBR-1 closed (🔶 → ✅), again after XBR-2 AND XBR-5 both closed the same day (two separate sessions, ❌ → ✅ each — see the reconciliation note in section C; the two closures were counted independently in each session's own pass and need combining here, not treated as one), again after XBR-6 closed (❌ → ✅), again after XBR-3 closed (❌ → ✅), again after XBR-4 closed (❌ → ✅) — **the entire XBR-2..6 cluster is now ✅** — again after CFL-6 batch 1 moved that row from ❌ to 🟡 (7 of 48 individual findings closed; the row itself still counts as one row here, same as AGG-1's convention for a partially-closed row), again after AGG-1's last knownMissing item closed alongside CFL-6 batch 2 (AGG-1 🟡 → ✅, its `knownMissing` list now empty; CFL-6 stays 🟡, now 14 of 48 closed).

| Bucket | Count (rows) |
|---|---|
| ✅ Ported & verified | 22 |
| 🟡 Partial (ported with recorded gaps) | 1 (CFL-6) |
| 🔶 Boundary-only (looks covered, isn't) | 3 |
| 📝 Explicitly scoped out (documented) | 2 |
| ❌ Not ported, no DAG reference | 12 |
| **Total rows** | **40** |

By subsystem, share of engine logic with zero DAG reference:
- **Income/deduction aggregation (A):** mostly closed — 4 rows ✅ including AGG-1 (fully closed 19 Jul 2026, `knownMissing` list now empty), the rest are smaller withholding/equity-comp utility functions.
- **Core tax computation, resident path (B):** essentially closed for individuals — TAX-10 (wiring) is now ✅; the one remaining open item, TAX-9 (state tax), is 🟢 effort rather than a large build.
- **Cross-border reconciliation (C):** **fully closed — the entire XBR-2..6 cluster is ✅** (residency, FTC both directions, double-taxed-income map, apportionment, ITR form, and cross-basis reconciliation, in that closing order). `run-xborder-full.js` proves the net-unrelieved-double-tax figure end-to-end from raw form data. Only CFL-6/CFL-7 (the findings/report layers built ON TOP of this section) remain in this general area — tracked separately in section E.
- **Limits & monitoring (D):** ~0% (1 of 7 rows even partially touched).
- **Conflict rule-book (E):** ~41% by finding count per `audit:dag`'s own mechanical count (24 of 58 — up from 17 before this batch: CFL-1..5's 5, the 8 `residency_status_*` findings — 3 of which the audit script's regex-based scanner can't actually detect as engine-side IDs, since IN-40 constructs them via a ternary rather than a literal string first argument to `add()`, a pre-existing scanner imprecision not fixed here — CFL-6 batch 1's 7, and CFL-6 batch 2's 7). CFL-6 alone still has 34 findings with no DAG reference.

## H. Suggested closing order

1. ~~**TAX-10 (wire the four existing graphs together)**~~ **CLOSED 19 Jul 2026** — `india-full-nodes.js`/`us-full-nodes.js`, verified 22/22 + 81/81. Was the highest-leverage item (zero new tax logic, turned four standalone proofs into two real chains); do the remaining items below on TOP of the now-wired state, not the old split one.
2. **TAX-9 (`computeUsStateTax`)** — small, self-contained, currently the only *undocumented* gap in an otherwise mostly-complete section; closing it turns B into a genuinely complete section.
3. ~~**AGG-1's remaining recorded side-channel reads**~~ **CLOSED 19 Jul 2026** — all three (`holdingPeriodMismatches[]`, `agricultural_income_inr`, `unexplained_income_115BBE_inr`) now ported; `knownMissing` list in `dag-coverage.js` is empty, row is a clean ✅ the script enforces. **AGG-6/7/8/9 (remaining `normalize.js` work)** still open — same shape as the already-closed aggregations, small, no new pattern needed.
4. **LIM-1..6 (limit gauges)** — the underlying math for most of these already exists elsewhere in the DAG (`feieEligibility` for LIM-5, `computeLrsTcs` once AGG-8 lands for LIM-3/4); this is largely wiring, not new tax logic.
5. ~~**XBR-1 (residency tie-breaker) then XBR-2 (`computeFtc`)**~~ **XBR-1 CLOSED 19 Jul 2026** — `residency-nodes.js`, verified 132/132, wired into `us-full-nodes.js` (81/81). Turned out smaller than estimated: `resolveResidency` reads Layer 1's own already-decided conclusions rather than running the tie-break cascade itself (see the dated note near the top of this doc). **Superseded by the item below** — the assumption that XBR-2 is necessarily "next" turned out wrong once XBR-2..6 were scoped in detail (19 Jul 2026): they're independent siblings, not a chain.
5b. ~~**XBR-5 → XBR-6 → XBR-3 → XBR-4 → XBR-2, in that order**~~ **ALL FIVE (XBR-2, XBR-3, XBR-5, XBR-6, XBR-4) CLOSED 19 Jul 2026 — the whole cluster.** `apportionment-nodes.js` (132/132), `itrform-nodes.js` (91/91), `doubletax-nodes.js` (55/55), `crossbasis-nodes.js` (69/69), this session; `ftc-nodes.js`/`xborder-full-nodes.js` (176/176 + 144/144), a parallel session — see the reconciliation note in section C for why closing out of the suggested order isn't a problem: XBR-2..6 are independent siblings. XBR-6's "one field to verify" turned out to be a real, small gap (`grossTotalIncomeInrV3`/`grossTotalIncomeInrCombined`) — closed same session, plus AGG-1's `agricultural_income_inr` knownMissing item as a natural side effect. XBR-3's "needs verifying" turned out fully positive — zero new US-side work. XBR-4 surfaced a genuine, separate engine bug while porting (GAP_TRACKER.md IN-41, a `taxRegime` case-sensitivity comparison always false for real data) — fixed in the engine first, user-authorized, then verified the DAG (which never had the bug) against the corrected engine. **Next up: CFL-6/CFL-7**, both now further unblocked by this cluster closing (see each row's own detail).
6. **CFL-6, in the same priority order `GAP_TRACKER.md` already uses for the underlying tax logic** — a finding is only worth porting once the computation it depends on exists in the DAG; don't port `ftc_gap` before XBR-2, don't port `state_income_tax` before TAX-9. (`holding_period_mismatch_`'s underlying array is now ported — see AGG-1 — but the finding itself, which additionally recomputes `computeUsTax` twice to price the dollar impact, is still unported CFL-6 work. `dual_residency`/`dual_residency_resolved` similarly now have a real, non-boundary `residencyResult` to build on.)
7. ~~**LIM-7 (compliance calendar) and CFL-7 (report assembly) — last**~~ **CFL-7 re-scoped 19 Jul 2026 — not a single "last" item.** Its 13 functions have 4 independent blockers, not one — `buildScopeNotes`, `analyze`'s own orchestration, and `buildReturnFormDetermination`'s US half are unblocked today and can be built alongside item 5b rather than after it; the rest of CFL-7 follows each XBR-2..6 row as it individually closes (see CFL-7's own row in section E for the exact per-function mapping). LIM-7 (compliance calendar) remains last on its own merits — genuinely a new node shape with no upstream dependency on this section.
