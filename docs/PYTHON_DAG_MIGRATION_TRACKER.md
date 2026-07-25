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
| 3 | `us/` domain | ⬜ not started |
| 4 | `crossborder/` domain + fuzz corpus | ⬜ not started |
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
