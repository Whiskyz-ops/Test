# Python DAG Migration Tracker

Tracks progress replacing `prototypes/graph-pilot/` (the JS DAG, currently
the sole active compute path, running client-side with no backend) with
`dag_py/` (a Python port run via Pyodide, domain-organized instead of
build-history-organized). Companion to `docs/DAG_MIGRATION_TRACKER.md`,
which tracks the earlier engine-vs-JS-DAG parity effort this one continues
one layer up. Plan: `/root/.claude/plans/nested-mapping-dusk.md`.

**The JS DAG stays the live, unmodified production compute path for the
entire build.** Nothing in `index.html` or `monitor-next` changes until
Phase 8's promotion gate is cleared — see the plan's §7 for the concrete
criteria. This tracker exists to make interim progress legible, not to
imply any interim cutover.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: resolver, registry, 3 leaf entry nodes, verification pipeline | ✅ done |
| 2 | `india/` domain | ✅ done (see below) |
| 3 | `us/` domain | ✅ done (see below) |
| 4 | `crossborder/` domain + fuzz corpus | ✅ done (see below) |
| 5 | `findings/` domain-split | ✅ done (see below) |
| 6 | `filings/` + `reports/` | 🟡 in progress (see below) |
| 7 | `analyze()` assembly + Pyodide adapter + wheel | ⬜ not started |
| 8 | Toggle + shadow mode + cutover (production-touching, gated) | ⬜ not started |

## Phase 1 detail (18 modules/files, 73 tests green as of this writing)

- `dag_py/src/wising_dag/core/graph.py` — resolver, direct port of
  `prototypes/graph-pilot/graph.js` (verified line-by-line: `GuardedDeps`
  mirrors `wrapDeps()`'s Proxy guard, `resolve()`'s `cache`/`in_stack` are
  per-call locals, scope-gate short-circuit and cycle detection match).
  12 unit tests (`tests/test_graph.py`), including a concurrency test
  proving `resolve()` is safe under overlapping calls sharing one node map —
  the property backend-portability depends on.
- `dag_py/src/wising_dag/core/registry.py` — `NodeRegistry`
  (`register`/`override`+reason/`extend`/`freeze`), the structural
  replacement for the JS shallow-copy-then-silently-overwrite composition
  pattern. 8 unit tests (`tests/test_registry.py`).
- `dag_py/src/wising_dag/core/fx_util.py` — port of `fx-util.js`.
- `dag_py/src/wising_dag/core/util.py` — `num()`/`safe()`, ports of the
  helpers duplicated at the top of most `*-nodes.js` files.
- `dag_py/src/wising_dag/core/entry.py` — **scoping correction from the
  original plan**: `agg10-nodes.js` was filed as "the foundation" but it
  actually requires `limits-nodes.js`'s full NODES (i.e. nearly the whole
  chain) before applying its overrides. Only 3 of its nodes are genuinely
  zero-dependency: `entityResult`, `companyResidencyResult`,
  `treatyModelResult` — those are what's ported here. `identityResult`/
  `metaResult`/`residencyModelSliceResult` depend on nodes defined in
  `xborder-full-nodes.js`/`findings-nodes.js` and are deferred to Phase 4/5.
  `headlineResult`, `summaryResult`, `analyzeResult`, and ~15 "boundary"
  redefinition nodes depend on deep india/us/crossborder/filings results and
  move to Phase 7, alongside `analyze.py` itself, which is where they
  belong dependency-wise.
- `dag_py/tools/port_profiles.js` — dumps `WISING.PROFILES`/`SAMPLE` (from
  `prototypes/graph-pilot/profiles.js`) to `dag_py/tests/fixtures/profiles/*.json`
  (13 files: 12 named profiles + sample). Rerun only when `profiles.js`
  changes.
- `dag_py/tools/generate_golden.js` — runs the frozen engine (via the
  existing `scripts/engine-frozen.js` loader, reused not reinvented) over
  every fixture, writes full `WISING.analyze()` output to
  `dag_py/tests/fixtures/golden/fixtures/*.json`. One generation covers every
  future phase — later phases slice deeper into the same golden files, no
  regeneration needed until `archive/engine-frozen/**` itself changes
  (declared permanently frozen).
- `dag_py/tests/test_core.py` — the 3 ported leaf nodes checked against
  golden on all 13 fixtures. `indiaIsAop`/`indiaIsTrust` are a documented
  DAG-only addition (`agg10-nodes.js`'s own header, `docs/GAP_TRACKER.md`
  H.6) with no engine equivalent — excluded from the golden diff, checked
  for internal consistency instead (mirrors the JS harnesses'
  `DAG_ONLY_*` exclusion pattern).

Run: `npm run test:dag-py` (or `cd dag_py && pytest`). Regenerate fixtures/
golden with `npm run port:dag-py-profiles` / `npm run golden:dag-py`.

## Traceability layer (added after Phase 2, applies to all future phases)

Every node needs to answer two questions on demand: "which Layer 1
India/US field(s) feed this?" and "which intake step is that field
collected on?" — added as a structural extension, not just comments:

- `NodeDef.layer1_fields` (`dag_py/src/wising_dag/core/graph.py`) — a tuple
  of every individual leaf field a node's `compute()` reads directly, as
  `"<router|india|us>.<dotted.path>"` (array items marked `[]`, e.g.
  `"india.financial_holdings.transactions[].asset_class"`). Full field-level
  granularity, not section-level — e.g. `dedS80C` lists all 9 individual
  `deductions.s80C.*` fields it sums, not just `"india.deductions.s80C"`.
  Pure derivation nodes (no direct Layer 1 read) carry none — their
  provenance is their `deps` chain instead.
- `NodeRegistry.dependency_closure(node_id)` /
  `.transitive_layer1_fields(node_id)` (`core/registry.py`) — pure
  structural walks over `deps` (no ctx, no compute() calls, diamond-safe)
  that compute, for ANY node however deep in the graph, the complete set of
  Layer 1 fields feeding into it — generated from the graph itself, not
  hand-maintained. This is the actual "absolute traceability" answer for a
  derived node like `totalTaxInrCombined`: `transitive_layer1_fields`
  returns all 179 fields across every India Layer 1 step it depends on,
  computed automatically.
- `core/layer1_steps.py`'s `step_for_field()` — maps a `layer1_fields` path
  to its Layer 1 intake step id (the real `panel-step-*` DOM ids from
  `layer1_india.html`/`layer1_us.html`). **Best-effort, not DOM-verified**
  — inferred from JSON namespace and step naming, not checked field-by-field
  against which panel's inputs actually write it. Flagged explicitly in the
  module docstring, same "confirm before relying on it" discipline as every
  other estimated mapping in this codebase.
- `dag_py/tools/layer1_trace_report.py` — CLI: `python dag_py/tools/
  layer1_trace_report.py [node_id ...]` prints deps, own/transitive Layer 1
  fields, and touched steps for any node (or every node with no args).

**Important note on the dependency shape**: this is a DAG, not a tree — a
node like `entityResult` has many consumers across multiple domains
converging on it (a diamond), not one parent. `dependency_closure`/
`transitive_layer1_fields` are diamond-safe (each node visited once); the
composition/build order (`core` → `india`/`us` → `crossborder` → ... )
is the part that's roughly hierarchical, not the node graph itself.

Retrofitted onto `core/entry.py` and all 5 `india/` files (Phase 2, 135
tests still green — this is metadata only, no compute logic changed). Every
future phase adds `layer1_fields` to new leaf nodes as they're written,
not as a follow-up pass.

## Phase 3 detail (us/ domain, 169 tests green cumulative)

Ported `prototypes/graph-pilot/{aggregateusincome,ustax,us-full,us1,us5}-nodes.js`
to `dag_py/src/wising_dag/us/{aggregate_us_income,ustax,us_full,
us1_penalty_2210,us5_penalty_72t}.py` — W-2/K-1/self-employment income
aggregation (MACRS/§179/bonus depreciation, K-1 passive-box aggregation),
the individual/resident computeUsTax (AGI, Schedule SE, QBI, AMT, NIIT,
every credit), and the two "going wider" penalty findings (Form 2210
underpayment, §72(t) early-withdrawal).

Two **deliberate, tracked, temporary** boundary gaps, both because their
closer lives in a domain not yet built:
- `worldwideUs` (us_full.py) is not wired to a real residency derivation
  yet — that node (`residencyResult.us.worldwide`) lives in
  `crossborder/residency.py`, Phase 4. Always resolves `False` for now, so
  FEIE and worldwide-taxed foreign income aren't reflected in `usTaxResult`
  yet. `test_us.py` partitions its fixture set by golden's own
  `computed.usTax.worldwide` flag to skip exactly the affected profiles
  (7 of 13), asserting the other 6 (+ the always-unconditional
  `aggregateUsIncomeResult` check, all 13) exactly.
- `usEntityKind`/`baseYearUs` (ustax.py) and the entity/NRA tax routing
  (`ustax-full-nodes.js`'s `usEntityTaxResult`/`nraTaxResult`/the
  `usTaxResult` router) are deferred to Phase 7's `analyze()` assembly,
  same reasoning as `core/entry.py`'s `agg10-nodes.js` scoping correction —
  `ustax-full-nodes.js` itself composes on top of `agg10-nodes.js`'s fully
  merged graph in the JS source, so it can't be closed before every other
  domain exists either. `test_us.py` skips the 1 entity profile
  (`us_ccorp_indian_sub`) and the 1 NRA profile (`india_ror_us_income`),
  matching `ustax-nodes.js`'s own documented scope exactly ("reported, not
  asserted").
- `us1_penalty_2210.py`/`us5_penalty_72t.py` carry their own unwired
  boundary stubs too (`ctx["computed"].usTax`/`.ftc`, `ctx["model"].meta`) —
  not golden-tested yet (nothing to compare against without the full
  graph); `test_us_penalties.py` instead pins the parts that ARE correct
  now (scope routing, the penalty formulas) with synthetic ctx, the same
  spirit as the core resolver's own unit tests.

One caught-by-testing correction: `feieAppliedUsd` is a DAG-internal
convenience field that `analyze.js`'s own `assembleComputed()` strips
before ever comparing against the engine (which keeps the same value at
`usTax.feie.appliedUsd` instead) — `test_us.py` replicates that exact
strip rather than treating the mismatch as a bug.

## Phase 6 detail (filings/ + reports/, IN PROGRESS — 294 tests green cumulative)

**Scoping correction, found before any code was written**: the plan's guessed
filenames (`documents-nodes.js`, `monitoring-nodes.js`) don't exist. The real
JS sources are `report-batch1-nodes.js` (documents/scopeNotes/returnForms/
ftcReport → `filings/documents.py`) and `report-batch6-nodes.js` (monitoring/
LIM-7 → `filings/monitoring.py`). Phase 6 is also considerably bigger than
the plan assumed: `assets-nodes.js` alone is 972 lines (the entity-ownership
graph + per-entity trace builder), and `report-batch1-nodes.js` is 627.

**A real architectural question, resolved by extending an existing
pattern**: `monitoring.py`'s `monitorProgressResult`/`residencyMonitorResult`/
`projectionsMonitorResult`/`calendarMonitorResult` and `reports/assembly.py`'s
`summaryResult`/`analyzeResult` all read `ctx.model`/`ctx.computed` directly
in the JS source (via `agg10-nodes.js`'s `withSyntheticCtx()` override
wrapper) — but this Python port's `ctx` shape is `{router, india, us,
fxRateOverride?, monitorAsOfBoundary?}`, never `model`/`computed`. Rather
than invent a new resolution for this, it gets the SAME deferred-boundary-
node treatment already used pervasively since Phase 3 (`us1_penalty_2210.py`'s
`usTotalTaxBeforeFtcUsdBoundary`, `black_money_act.py`'s `accountsBoundary`,
etc.) — closed once `metaResult`/`identityResult`/`residencyModelSliceResult`/
`headlineResult` (deferred from `core/entry.py` since Phase 1) and the rest
of the AGG-10 override layer are built in Phase 7's `analyze()` assembly.
**Not yet built this phase**: `filings/monitoring.py` and `summaryResult`/
`analyzeResult` themselves — deliberately left for Phase 7, where the
prerequisite `metaResult`-family nodes actually get built.

**A second real gap, found scoping (not introduced by) Phase 5**:
`assets-nodes.js` OVERRIDES `findingsAllResult` to push 2 more findings —
`msme_disallowance_s43Bh_india` and `presumptive_lockin_active_india` — that
live outside every `findings-batchN-nodes.js` file Phase 5's inventory was
scoped against (`report-batch5-nodes.js`'s own `FINDING_ADD_ORDER`, 61 ids).
The true production count is 63, not 61. Tracked here, not yet closed —
will be ported into `india/findings.py` (or a `filings/assets.py` override,
matching the JS structure) when `filings/assets.py` is built.

**Built and tested this phase** (`reports/assembly.py`'s `findingsAllResult`,
`filings/limits.py`, `filings/calendar_amounts.py`,
`filings/checks_registry.py` — 294 tests green, 13 new):
- `reports/assembly.py`: `findingsAllResult` — concatenates Phase 5's
  consolidated `findingsIndiaResult`/`indiaResidencyConsistencyFinding`/
  `findingsUsResult`/`usResidencyConsistencyFinding`/
  `findingsCrossborderResult` (5 lists, not the JS source's 12 — Phase 5's
  domain-split already absorbed the old batch5/batch6/split-pattern
  findings into those 5), then applies the same `FINDING_ADD_ORDER`
  stable-sort tie-break + severity/amountUsd sort as
  `report-batch5-nodes.js`'s own two-pass sort.
- `filings/limits.py`: `limitsResult` (LIM-2/4/5, all six Monitor gauges:
  fbar/form8938/lrs/nro_repatriation/feie/trump_account) — turned out to
  have zero real blocking dependency once actually traced (all inputs
  already ported in Phase 4/5's crossborder/us modules); deferred from
  Phase 4 purely for organizational reasons, confirmed. Reused `us/ustax.py`'s
  `feie_eligibility()` directly instead of re-deriving JS's
  `feieEligibilityFull()` — already includes `reasons[]`, contrary to a
  stale note in the Phase 5 tracker section claiming the US-side port
  needed a sibling for that.
- `filings/calendar_amounts.py`: `calendarAmountsResult` (CL-2, forward-
  looking ₹/$ figures for the Compliance Calendar) — cleanest file in this
  batch, reuses `india/findings.py`'s IN-1 chain and `us/findings.py`'s US1
  chain verbatim.
- `filings/checks_registry.py`: `checksRegistryResult` (CL-1, the "checks-run
  registry" — explicit `passed` records for findings that were evaluated and
  came back clean) — deps-only port of the ~55-dep node, no new raw leaves.

**Architectural pattern used throughout this phase's 4 modules**: each one's
`build(base)` registers ONLY its own node(s) and trusts `base` already
carries every dependency — composing india/findings.py + us/findings.py +
crossborder/findings.py into ONE shared registry without duplicate-
registering their common `aggregate_india_income`/`aggregate_us_income` base
(each of those three files' own `build()` independently re-derives it) is
explicitly `core.registry.build_full_registry()`'s job, a Phase 7 task per
the plan's own package layout. Verified instead via synthetic-dep-bag unit
tests (`tests/test_filings_reports_phase6.py`) that call each node's
`compute(d, ctx)` directly — same discipline `test_us_penalties.py`
established in Phase 3 for boundary-stub nodes.

One real bug caught by the new tests: `filings/limits.py`'s FEIE gauge read
`core.constants.LIMITS["FEIE_MAX_USD"]`, which didn't exist there (only as a
separate flat name in `us/constants.py`) — added to `core/constants.py`'s
`LIMITS` dict (duplicated value, not moved, since `us/ustax.py`'s own
`FEIE_MAX_USD` import site didn't need the surrounding namespace).

**Not yet done this phase** (real remaining Phase 6 work, not deferred to
Phase 7): `filings/documents.py` (`buildDocumentsResult`, ~140 lines of
`report-batch1-nodes.js`'s 627 — a 30-entry document catalog run through a
trigger map; also carries `buildScopeNotesResult`/
`buildReturnFormDeterminationResult`/`buildFtcReportResult`, folded into
`reports/trace.py` instead per the plan's own filings-vs-reports split);
`filings/assets.py` (`assetsModelResult` + the `findingsAllResult` override,
~700 of 972 lines — the entity-ownership graph/per-entity trace builder,
the single largest remaining file in this port); `reports/trace.py`
(`buildTaxComputationIndiaResult`/`UsResult`/`UsStateResult`/
`WithholdingSummaryResult` — deps-only, one `ctx.model` boundary read to
fix at port time, not defer); `reports/assembly.py`'s `buildTaxComputationResult`
(trivial once `trace.py` exists). `filings/monitoring.py` and
`summaryResult`/`analyzeResult` are correctly deferred to Phase 7 (see
above), not merely postponed.

## Phase 5 detail (findings/ domain-split, 281 tests green cumulative)

Split the 61 findings previously scattered across build-history files
(`findings-nodes.js`, `findings-batch2..6-nodes.js`, `residency-nodes.js`'s
`residencyConsistencyFindings`, and the split-pattern quartet
`in1-nodes.js`/`us1-nodes.js`/`us5-nodes.js`/`xb7-nodes.js` +
`report-batch5-nodes.js`) into `dag_py/src/wising_dag/{india,us,crossborder}/
findings.py` — 17 India, 17 US, 27 crossborder. Per the plan's own
discipline, `tests/test_findings_domain_split.py` was written FIRST (before
any finding was ported), listing the full 61-id inventory and asserting no
id appears twice — the port then proceeded finding-by-finding against that
red test until every module-existence check went green.

**Domain classification rule** (encoded in the pre-port inventory test's
docstring): a finding is "crossborder" if its own `compute()` reads a
crossborder-domain node (`residencyResult`, `ftcResult`, `apportionmentResult`,
`crossBasisResult`, `mapDoubleTaxedIncomeResult`) directly — not merely
because its category label says "treaty" or its subject sounds cross-border.
Two documented exceptions where the rule was overridden by the JS source's
own established split: `equity_comp_sourcing` (crossborder, despite reading
only `equityCompResult` — that node itself mixes India's ESOP perquisite with
the US's RSU/NSO income, the same award taxed by both countries) and
`residencyConsistencyFindings` (one JS node split across two Python files —
the India-branch output goes to `india/findings.py`, the US-branch output to
`us/findings.py`, both built on the same underlying `crossborder/residency.py`
raw+derived facts).

**Two deliberate substitutions**, made to keep `india/findings.py` free of
crossborder deps despite the JS source reading a crossborder node for a fact
India's own domain already carries under a different name: `dtaa_treaty_
elections` substitutes `in1_v3.py`'s `isNRV3` for JS's `residencyResult.india.
status === "NR"`; `lrs_limit` substitutes a fresh self-contained `hasIndiaScope`
leaf for JS's `hasIndiaScopeXbr` (mirroring the standalone-file pattern
`us1_penalty_2210.py`/`us5_penalty_72t.py`/`black_money_act.py` already use).

**New shared infrastructure**: `core/findings.py`'s `make_finding()` replaces
the `add(id, severity, ...)` closure duplicated at the top of every JS
findings-batchN-nodes.js compute function; `core/util.py` gained `format_usd()`
(Western digit grouping, alongside the existing Indian-grouping `format_inr()`);
`core/constants.py` (new) holds `LIMITS` (FBAR/LRS/Trump-Account thresholds) —
genuinely shared across all three domains, so it doesn't live in any one of
them. `us/constants.py` gained the full `US_STATES` table (CA/NY, port of
`findings-batch5-nodes.js`'s TAX-9) plus a DAG-only NJ/no-income-tax-state
extension, carried over verbatim from the JS source's own documented
DAG/engine divergence (`docs/GAP_TRACKER.md` §H.7).

**The 5 split-pattern findings** (`india_advance_tax_interest`,
`underpayment_2210`, `early_withdrawal_penalty_72t`, `schedule_fa_
inconsistent`, `black_money_act_exposure`) reuse already-shipped Phase 3/4
computation nodes (`us1_penalty_2210.py`, `us5_penalty_72t.py`,
`black_money_act.py`) wherever they already existed; only `india_advance_tax_
interest`'s full ss.424/425 computation chain (`in1-nodes.js`) was new —
ported into `india/findings.py` under the same deferred-boundary discipline
(`assessedTaxInrBoundary` etc. read `ctx["computed"]`/`ctx["model"]`, closed
in Phase 7). Each file's own `shouldFire` node (a different fire-condition
per file, same id in every JS source) is aliased to a unique name
(`in1ShouldFire`/`us1ShouldFire`/`us5ShouldFire`/`xb7ShouldFire`) before the
generic node-merge, mirroring `report-batch5-nodes.js`'s own "the one
genuine, dangerous exception" handling.

**`holding_period_mismatch_<N>`** (crossborder, dynamic per-mismatch id)
required porting `computeUsTaxCore` — a parameterized copy of `us/ustax.py`'s
individual-path `_compute_us_tax_result`, extended with `extraLtcgUsd`/
`extraStcgUsd` added on top of `foreignLtcg`/`foreignStcg` at the same point
the frozen engine's own `withForeignCg` clone-and-override touches — run
twice per mismatch (once per classification) against the SAME already-
resolved deps bag, exactly matching the JS source's own approach.

**A real cross-file composition constraint, resolved rather than worked
around**: `crossborder/apportionment.py` independently re-derives
`aggregate_india_income`/`aggregate_us_income` on its own registry (needed
for its Phase-7 entity-aware override), which collides
(`DuplicateNodeError`) if chained onto `cross_basis.build()`'s registry (which
reaches the same two modules transitively via `india_full`/`us_full`).
`tax_year_mismatch` needs both `apportionmentResult` and `crossBasisResult`-
chain facts in the same finding — resolved by treating `apportionmentResult`
as an EXPLICIT BOUNDARY INPUT (`apportionmentResultBoundary`, reads
`ctx["computed"]["apportionment"]`) in `crossborder/findings.py`, same
deferred-boundary discipline as everything else in this port, closed once
Phase 7's `build_full_registry()` composes everything without duplication.
Similarly, `withholding_documentation_gap` needs India's `s115a*Detailed`/
`nrInterestDetailed` nodes (built in `india/findings.py`) AND the US's
`nraFdapDetail` (built in `us/findings.py`) in the SAME registry —
re-registered under an `-Xbr` suffix in `crossborder/findings.py` reusing the
exact same compute functions (`india_findings._s115a_dividend_detailed` etc.),
rather than importing either file's full `build()` chain a second time.

Two real bugs caught by golden-diff testing (`tests/test_findings.py`, new),
fixed at the source:
- Several `_inr()`-shaped detail strings (carry-forward-loss set-off,
  promoter-buyback additional tax, s.195 unexplained income, DTAA election
  amounts) were built with `format_inr()` — Indian digit grouping, but
  missing the JS source's own local `inr(n)` helper's `"₹"` prefix. Added a
  matching `_inr()` wrapper in `india/findings.py` and swapped every call
  site — a straightforward "which helper did the JS source actually use"
  miss, not a computation error.
- `entity_dual_residency_poem`'s POEM-factors sentence embedded raw director
  counts (`num()`-derived, always float in Python) directly in an f-string —
  `"3.0 director(s)"` vs JS's `Number(3.0)` template-literal-stringifying as
  `"3"`. Fixed with an explicit `round()` at the one embed site (both counts
  are always whole numbers by construction).
- `state_income_tax`'s recommendation text dropped a literal comma before
  "and (for California)" that's part of the JS source's static string, not
  its conditional branch — a transcription slip, not a logic error.

**Golden-diff coverage** (`test_findings.py`, all 3 domains × 13 fixtures):
soundness-only for this phase — every finding a domain fires must exact-match
a same-id golden entry; completeness (every golden finding that *should* fire
*did* fire) is deferred to Phase 7's `test_analyze_golden.py`, once entity/NRA
routing and `apportionmentResultBoundary` are both closed and the full 61-id
set can be compared without carve-outs. Carve-outs applied, all already-
established elsewhere in this port: `usTaxResult`-dependent findings
(`amt_applies`, `feie_*`, `state_income_tax`, `underpayment_2210`,
`niit_medicare_not_creditable`, `no_totalization_agreement`, `ftc_gap`/
`ftc_available`, `holding_period_mismatch_*`) skip the 1 US-entity + 1 NRA
profile; `tax_year_mismatch` never fires under the `{router, india, us}` ctx
shape these fixtures use (no `ctx["computed"]`); `early_withdrawal_penalty_
72t` skips all fixtures (its age computation depends on `baseYearUs`, which
resolves `None` → a hardcoded 2025 fallback that can be off-by-one from
golden's real base year — same gap `test_us_penalties.py` already documents
with an explicit-ctx unit test for this exact node).

## Phase 4 detail (crossborder/ domain + fuzz corpus, 236 tests green cumulative)

Ported `prototypes/graph-pilot/{residency,ftc,apportionment,doubletax,
crossbasis,xborder-full,xb7}-nodes.js` to `dag_py/src/wising_dag/
crossborder/{residency,ftc,apportionment,double_tax,cross_basis,
xborder_full,black_money_act}.py` — the DTAA Article 4 tie-breaker +
residency-consistency findings, both FTC directions (§904/Form 1116 and
India §159), FY-vs-CY apportionment, the per-head doubly-taxed-income
breakdown, the full cross-basis reconciliation table, and the Black Money
Act exposure finding.

**This phase closed the Phase 3 `worldwideUs` gap.** `us/us_full.py` now
merges `crossborder/residency.py` and overrides `worldwideUs` to
`residencyResult.us.worldwide` for real — mirroring the JS source's own
`us-full-nodes.js`, which requires `residency-nodes.js` directly (a
legitimate cross-domain import: DTAA residency is inherently cross-border,
even though the file it's needed by is nominally "US-side" wiring).
Verified end-to-end: `usTaxResult.foreignSourceIncomeUsd` now matches
golden exactly for worldwide-taxed profiles, closing the carve-out
`test_us.py` had to add in Phase 3.

**`limits.py` (LIM-2/4/5, `limits-nodes.js`) is NOT ported in this
phase**, correcting the original plan: it `require()`s
`report-batch6-nodes.js`, whose own dependencies
(`aggregatePeakUsdResult`, `limitsRawExtra`, `hasIndiaScopeXbr`) live in
the `filings`/`findings` domains — not built until Phases 5/6. Same
"defer to where its real dependencies live" correction already applied to
`core/entry.py` (Phase 1) and `ustax.py`'s entity routing (Phase 3) —
`limits.py` moves to Phase 6's file list instead of Phase 4's.

Two bugs caught by golden-diff testing, fixed at the source rather than
worked around:
- `apportionmentBaseYearRaw` returned a Python `float` (from `num()`),
  which stringifies as `"2025.0"` inside `fyLabel` (`"FY 2025.0–26.0"` vs
  golden's `"FY 2025–26"`) — JS `Number` has no such artifact for a whole
  value. Fixed with an explicit `int()` cast at the one node that builds a
  string label from it, documented inline as a reusable "watch for this"
  note for any future year-into-string field.
- `cross_basis.py`'s `stdDedLabel` used Python's `:,` (Western grouping)
  for a rupee amount — same class of bug `format_inr()` was built for in
  Phase 2, fixed the same way. (For the two literal values this label ever
  takes, 50000/75000, Western and Indian grouping happen to coincide, so
  this specific case was cosmetic — fixed anyway rather than left as a
  latent bug waiting for a value where they'd diverge.)

`test_crossborder.py` carve-outs mirror the ones already established in
`test_us.py`: `ftcResult`/`crossBasisResult`/`mapDoubleTaxedIncomeResult`
depend on `usTaxResult`, so the 1 US-entity + 1 NRA profile stay
reported-not-asserted until Phase 7; `apportionmentResult`'s later
entity-aware override (`ustax-full-nodes.js`) is likewise deferred, so the
base version ported here is checked only against the 12 individual-usKind
profiles. `black_money_act.py`'s three boundary stubs
(`accountsBoundary`/`usSourceTotalUsdBoundary`/`usSecuritiesBoundary`)
aren't wired into anything yet (their closers live in `filings`/`reports`,
Phase 6/7) — pinned with synthetic-ctx unit tests instead, same discipline
as `test_us_penalties.py`.

**Fuzz corpus**: `run-fuzz.js` gained a `--mode=corpus` flag
(`npm run fuzz:dag-py-corpus`) that reuses the existing seeded
splice/mutate `generateProfile()` machinery to write profile+golden JSON
pairs straight to `dag_py/tests/fixtures/golden/fuzz-corpus/{profiles,
golden}/` — no JS DAG involved, only the frozen engine (already loaded by
this script) runs per generated profile. Generated an initial **40-case**
corpus (seed=1, ~4.7MB), deliberately small rather than the plan's
original 3000: nothing consumes this corpus yet (`test_analyze_golden.py`
doesn't exist until Phase 7, once `analyze.py` does), and 3000 cases at
~120KB/pair (mostly the golden side's full `analyze()` output) would be
~350MB — before there's a consumer to justify committing it. Scaling this
corpus up is a Phase 7 task, done when `test_analyze_golden.py` is built
and can actually exercise it.

**Not yet done in Phase 1** (deliberately deferred, not forgotten): a
CI lint check banning `pyodide`/`js` imports outside `dag_py/adapter/`
(nothing under `dag_py/adapter/` exists yet to violate it against — added
in Phase 7 when the adapter is built) and `dag_py/pyproject.toml`'s actual
wheel build (packaging metadata exists; the build step is a Phase 7 item
since there's nothing worth packaging yet).

## Phase 2 detail (india/ domain, 125 tests green cumulative)

Ported `prototypes/graph-pilot/{aggregateindiaincome,in1-nodes-v3,entitytax,
india-full,itrform}-nodes.js` to `dag_py/src/wising_dag/india/
{aggregate_india_income,in1_v3,entity_tax,india_full,itr_form}.py` — the
full individual/HUF slab computation, company/firm/AOP/trust entity tax,
capital-gains classification (buy-back, foreign equity, financial holdings,
commodities, unlisted equity), WDV depreciation, and the ITR-form eligibility
solver.

- **`india-tax-combined-nodes.js` was deliberately NOT ported.** It builds
  the exact same v3+entity node merge and the same 3 routing-gate overrides
  (`isEntityTaxpayer`/`totalTaxInrCombined`/`regimeCombined`) as
  `india-full-nodes.js`, and in the live JS graph its contribution is always
  overwritten by `india-full-nodes.js`'s version — traced via
  `report-batch4-nodes.js`'s own merge-order comment ("batch3 FIRST, batch2's
  chain SECOND... batch2's lineage carries india-full-nodes.js's IN-GRAPH
  overrides"). Confirmed redundant for anything reaching the final
  `analyze()` output, not ported.
- `core/dates.py` (new, shared infra, not domain logic) — `parse_date()`/
  `months_between()`/`is_under_180_days_addition_inr()`, ports of the
  date-window helpers duplicated across the JS aggregate-income file.
- `core/util.py` gained `format_inr()` — Indian digit grouping (last 3
  digits, then pairs: `5000000` → `"50,00,000"`). Needed because
  `itr_form.py`'s disqualifier messages embed formatted rupee amounts and
  Python's `:,` format produces Western grouping (`"5,000,000"`), which
  would have silently mismatched golden's `toLocaleString("en-IN")` output
  — caught by the golden-diff test, not by inspection.
- `test_india.py`'s ITR-form check replicates a discipline already present
  in the JS harness itself: `run-itrform.js` treats
  `computed.indiaItrForm === null` (the frozen engine's own
  `model.meta.hasIndiaScope` gate, which lives in the report-assembly layer
  outside `itrform-nodes.js`, not in the ported module) as "reported only,"
  not a hard mismatch — same carve-out kept here (`us_only_cpa_client`
  exercises it) rather than inventing a `hasIndiaScope` gate that doesn't
  exist in the module being ported.
- Every other check (`indiaIncomeModelResult`, `totalTaxInrCombined`,
  `regimeCombined`, and the ITR-form result where the engine has an answer
  to compare against) is asserted exactly, on all 13 fixtures, entity and
  individual/HUF paths both — matching `india-full-nodes.js`'s own claimed
  parity scope (no US-side-style TAX-7/TAX-8 carve-out on the India side).
- Known inherited non-determinism, not introduced by the port: MSME
  disallowance timing (`s43Bh`) reads wall-clock "today" when a payable's
  `payment_date` is absent, same as the JS source's own bare `new Date()` —
  pre-existing JS behavior, ported faithfully rather than silently
  "fixed" mid-port.
