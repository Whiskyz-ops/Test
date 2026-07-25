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
| 5 | `findings/` domain-split | ⬜ not started |
| 6 | `filings/` + `reports/` | ⬜ not started |
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
