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
| 1 | Foundation: resolver, registry, 3 leaf entry nodes, verification pipeline | 🔶 in progress (see below) |
| 2 | `india/` domain | ⬜ not started |
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
