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
| 6 | `filings/` + `reports/` | ✅ done (see below) |
| 7 | `analyze()` assembly + Pyodide adapter + wheel | 🟡 infrastructure done, one known gap flagged (closed below, post-Phase-7) |
| — | `usTaxResult` entity/NRA/trust routing (`us/ustax_full.py`) — closes the Phase 7 gap | ✅ done (see below) |
| 8 | Toggle + shadow mode + cutover (production-touching, gated) | 🟡 in progress — JS-DAG-vs-Python-DAG cross-check built and green, trust-retained/state-tax fixture coverage added + a real cross-language rounding bug fixed (see below); live browser wiring + real promotion-gate data not started |

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

## Phase 7 detail (analyze() assembly + Pyodide adapter + wheel, 🟡 infrastructure done — 522 tests green cumulative)

**`core/registry.py`'s `build_full_registry()` — the single composition
point every domain's `build(base)` docstring promised, built.** The hard
part: `india_findings.build()`/`us_findings.build()`/`crossborder_findings.
build()` each independently call their OWN prerequisite chain internally
(`cross_basis.build()` → `xborder_full` → `india_full`/`us_full` → ...) —
calling more than one of those `build()`s on the same registry re-derives
the shared base and hits `DuplicateNodeError`. Solved the way every
composed-registry test file (`test_filings_documents.py`/
`test_filings_assets.py`/`test_reports_trace.py`) already worked around
this for testing purposes, generalized into the one real production path:
call the shared base chain (`cross_basis.build()`) ONCE, then layer in each
domain findings module's own additional nodes directly from its `NODES`
dict (skipping the redundant base-rebuild), in dependency order — itr_form
extras → `core/entry.py` → india findings → us1_penalty_2210/us5_penalty_72t
+ us findings → black_money_act + s115a*DetailedXbr/nraFdapDetail (guarded —
see below) + crossborder findings → `crossborder/apportionment.py` extras →
`reports/assembly.py` → `reports/trace.py` → `filings/limits.py` →
`filings/calendar_amounts.py` → `filings/checks_registry.py` →
`filings/documents.py` → `filings/assets.py` → `filings/monitoring.py`
(new, see below) → `core/orchestration.py` (new, see below). Verified with
zero `DuplicateNodeError`s on the first complete run — 367 nodes before the
final closure layer, 376 after.

One real de-duplication decision this composition forced: `us/findings.py`'s
own `nraRaw`/`nraFdapIncomeUsdRaw`/`nraFdapDetail` and
`crossborder/findings.py`'s OWN separate copies of the same three ids are
NOT identical (the us/findings.py copies are the complete, fixed versions —
see the `nraFdapDetail` bug fix in Phase 6 — the crossborder copies are an
older, narrower duplicate nobody has since touched). `build_full_registry()`
registers `us_findings.NODES` first, then skips crossborder's own
(otherwise-unconditional) re-registration of those same three ids if
already present — the complete versions win, without needing to touch
`crossborder/findings.py`'s own file at all (its own standalone build/tests
are unaffected, since standalone it never has us_findings' copies present
first).

**`filings/monitoring.py` — new, ports `report-batch6-nodes.js`'s LIM-7
monitor layer in full**: `monitorAsOfBoundary` (the explicit "now" boundary
— same architecture rule every other real-wall-clock read in this port
follows), `monitorProgressResult`, `residencyMonitorResult` (day-counters +
predicted "flip" dates for individuals, qualitative fact lists for entities),
`projectionsMonitorResult` (threshold-breach projections off `limitsResult`),
`calendarMonitorResult` (the compliance calendar, entity-aware US filing
dates + India audit-case/presumptive-only s.425 handling, reusing
`india/findings.py`'s already-ported `inIsAuditCase`/`inPurelyPresumptive`
verbatim), `healthAlertsMonitorResult` (score + capped alerts feed), and
`monitorResult`. Unlike the JS source's own `withSyntheticCtx()` technique
(wrap one function body to run against two different ctx shapes — a
JS-only trick with no Python equivalent worth building), every node here
reads its real in-graph deps directly (`entityResult`/`metaResult`/
`residencyModelSliceResult`/`companyResidencyResult`/`residencyResult`/
`limitsResult`/`findingsAllResult`) — there's only ever one ctx shape in
this port.

**`core/orchestration.py` — new, the final closure layer, port of
agg10-nodes.js's `identityResult`/`metaResult`/`residencyModelSliceResult`/
`headlineResult`/`summaryResult` plus its remaining "v1-era boundaries
closed here" overrides**: `usEntityKind` (→ `entityResult["usKind"]`),
`baseYearUs` (→ `metaResult["baseYear"]`), `usTotalTaxBeforeFtcUsdBoundary`/
`usAgiUsdBoundary` (→ `usTaxResult`), `usFtcAllowedUsdBoundary` (→
`ftcResult`), `usSourceTotalUsdBoundary` (→ `aggregateUsIncomeResult`),
`accountsBoundary` (→ `bankAccountsRaw`), and one more found while wiring
this module up that wasn't in agg10-nodes.js's own list at all —
`apportionmentResultBoundary` (crossborder/findings.py's `tax_year_mismatch`
finding boundary, closed to the real `apportionmentResult`,
crossborder/apportionment.py — apportionment.py itself was never wired into
any earlier phase's registry composition, only unit-tested standalone).
Deliberately the LAST module composed — every dep needs the full registry
already assembled.

**`analyze.py` — new, the `analyze(opts) -> dict` / `normalize(opts) -> dict`
pure-function boundary**, port of `analyze.js`. Builds `ctx` from `opts`
exactly as `resolveAll()` does, resolves the same `TARGET_IDS` list against
a module-level, built-once `build_full_registry()` (safe to share across
calls — `NodeRegistry.resolve()`'s `cache`/`in_stack` are always per-call
locals, the property that also keeps a future `adapter/http_adapter.py`
cheap), and assembles the result field-for-field matching `analyze.js`'s
own `assembleModel`/`assembleComputed` plus its `analyzeResult` node's
remaining keys (`findings`/`documents`/`ftcReport`/`taxComputation`/
`withholding`/`scopeNotes`/`returnForms`/`monitoring`/`summary`).

**End-to-end golden verification (`tests/test_analyze_golden.py`, 91 new
tests) — the first test in this port to resolve against the REAL, single,
fully-composed production registry**, not an isolated hand-composed one.
`model.identity`/`model.meta`/`model.residency` match golden EXACTLY across
all 13 fixtures, zero carve-outs needed. `summary`/`monitoring` match once
adjusted for carve-outs already established by name in earlier phases —
nothing new: the entity/NRA `usTaxResult` carve-out (Phase 3), the DAG-only
7-document superset (Phase 6, now also visible inside
`monitoring.calendar.*[].docIds`), and the DAG-only 2 extra findings (Phase
6, `filings/assets.py`) — see the test file's own module docstring for the
full accounting, including the exact `healthScore`/`counts` arithmetic
adjustment each carve-out implies.

**Three real bugs found and fixed while building this verification** (all
newly surfaced by this being the first test to exercise these exact paths
end-to-end — none were reachable from any earlier phase's narrower,
hand-composed test registries):
- `filings/limits.py`'s trump_account gauge note had a stray `$` before
  `TRUMP_ACCOUNT_ANNUAL_CAP_USD` — the JS source's own
  `.toLocaleString("en-US")` never had a currency symbol; nothing before
  this test's `monitoring` comparison exercised that specific gauge's note
  text against golden.
- `filings/monitoring.py` itself shipped with four `"X.0"` vs `"X"`
  float-display bugs (days-of-headroom/days-until-flip counts, India-vs-
  outside director counts, HUF karta's own-presence day count) — the same
  recurring float-vs-int display class this port has hit and fixed several
  times before (`num()` always returns float; JS `Number` auto-stringifies
  a whole-valued float without the trailing `.0`) — fixed with `round()` at
  each embed site, same pattern as every earlier instance.
- `filings/monitoring.py`'s `healthAlertsMonitorResult` also crashed
  outright (`KeyError: 'dateLabel'`) for every entity-taxpayer fixture: the
  JS source reads `r.dateLabel` on a "qualitative" residency entry (entity
  taxpayers never get a `dateLabel` field at all, only "days"-kind entries
  do), which is `undefined` in JS — not a crash. Fixed with `.get()`
  instead of `[...]` at that one read site, reproducing JS's forgiving
  missing-property read rather than Python's strict `KeyError`.

**`adapter/pyodide_adapter.py` — new**, the one file allowed to import
`pyodide`/`js`: wraps `analyze()`/`normalize()` via `pyodide.ffi.to_py`/
`to_js(..., dict_converter=js.Object.fromEntries)` (plain JS objects, not
`Map`s — every existing consumer does `result.model.entity...` property
access) and an idempotent `install()` that assigns
`window.WISING.analyze`/`window.WISING.normalize` — the exact call shape
`index.html`/`monitor-next/lib/dag-adapter.js` already use against the JS
DAG's own `window.WISING.analyze`, so switching the loading mechanism at
Phase 8 cutover won't require touching either consumer. A new guard test
(`tests/test_no_browser_imports.py`, AST-based, 2 tests) enforces the plan's
"nothing under `wising_dag/**` imports pyodide/js/touches window/
localStorage" rule automatically, rather than relying on review discipline —
confirmed clean on the existing codebase before adding the rule.

**Wheel packaging — new**: `scripts/build-dag-wheel.py` (`npm run
build:dag-wheel`) builds `dag_py/` via `pip wheel --no-deps` into
`assets/wising_dag.whl` — the same pipeline slot `scripts/build-dag-bundle.js`
(esbuild) occupies for the JS DAG's own bundle. Verified: builds a
`py3-none-any` pure-Python wheel, confirmed to contain every module
including `analyze.py`/`filings/assets.py`/`core/orchestration.py` by
inspecting the built archive directly.

**NOT verified this phase, explicitly flagged rather than silently
skipped**: an actual browser load of the wheel via Pyodide
(`micropip.install()` → `pyodide_adapter.install()` → confirm
`window.WISING.analyze` works from real JS) — the plan's own "Verification"
section calls for this manual/headless-browser smoke test. Not attempted:
this sandboxed environment has no vendored Pyodide runtime and no network
route to fetch one (`https://cdn.jsdelivr.net/pyodide/...` returns 403
through the environment's proxy) — downloading and committing a multi-MB
WASM runtime speculatively wasn't judged worthwhile either. The Python-side
adapter code is written to the documented Pyodide FFI conventions but is
unverified against a real Pyodide runtime. This is a real open item, not
a formality — flagging it explicitly rather than claiming a smoke test that
didn't happen.

**THE ONE REAL GAP this phase does NOT close, and was never going to in one
sitting**: `us/ustax.py`'s `usTaxResult` still has no entity/NRA/trust
routing at all (`isEntity`/`isNra` are simply absent from its return dict,
not `False`) — the plan's own Phase 7 description calls for "closing...
the entity/NRA/worldwide-income routing gaps carried as carve-outs
throughout usTaxResult-dependent code," and that is genuinely NOT done.
Every override in `core/orchestration.py` that reads `usTaxResult` uses
`.get("isEntity")`/similar defensive reads specifically so they'll pick up
real entity/NRA facts automatically the day that routing exists, with no
further change needed here — but building `computeUsEntityTax`/
`computeUsNraTax`/trust-tax-computation routing itself is a genuinely large,
separate body of work (on the order of Phase 3's own US-domain build), not
a boundary-wiring task like everything else in this phase. Scoped out
explicitly rather than attempted partially or claimed done. The 2
entity/NRA fixtures (of 13) remain correctly carved out at the full
`analyze()` level, same as every earlier phase.

**This gap is now closed — see the `us/ustax_full.py` section below**,
built as a dedicated follow-up immediately after Phase 7 rather than folded
into Phase 8.

## `usTaxResult` entity/NRA/trust routing (`us/ustax_full.py`, 547 tests green cumulative)

Closes the one gap Phase 7 explicitly flagged and scoped out above. Port of
`prototypes/graph-pilot/ustax-full-nodes.js` (418 lines, previously unread
in this entire porting effort despite being named in already-written
docstrings) — TAX-7 (`computeUsEntityTax`), TAX-8 (`computeNraTax`), and
`computeUsTax`'s own routing logic.

**The routing pattern**: `usTaxResult` is REDEFINED as a router, mirroring
how `computed.usTax` is whatever branch the JS engine's own `compute()`
returned. The original individual-path node is re-registered under a new
id, `usTaxIndividualResult` (captured via `base.get("usTaxResult")` before
overriding — the same capture-before-override pattern `filings/assets.py`
already established for its own `findingsAllResult` override). `usTaxResult`
itself becomes: `usEntityKind` in `{ccorp, scorp, partnership, trust}` →
`usEntityTaxResult`; `files1040nr && !s6013hElection` → `nraTaxResult`;
else → `usTaxIndividualResult`. Every existing consumer (FTC boundaries,
findings, headline, reports) resolves `usTaxResult` by id, so all of them
automatically become entity/NRA-correct once this routing exists — no
other file needed to change, by design (confirmed: zero other files
required logic changes, only two needed a strictness fix — see below).

**`usEntityTaxResult` (TAX-7)**: C-Corp taxed flat 21% on Schedule-M1
taxable income; S-Corp/Partnership pass-through ($0 entity-level tax);
Trust splits DISTRIBUTED (taxed on beneficiaries' own returns, not here) vs
RETAINED (taxed at compressed §1(e) brackets) via a new raw field,
`trustRetainedIncomeUsdRaw` (`ctx.us.profile.trust_retained_income_usd`) —
a DAG-only addition closing a real prior gap where a retaining trust was
silently treated as $0 entity tax. DELIBERATE DAG/engine divergence,
documented inline and in `docs/GAP_TRACKER.md` section H: an entity's own
`usSourceIncomeUsd`/`foreignSourceIncomeUsd` are set to the Schedule-M1
`taxable_usd`/`0` (whole M-1 figure treated as US-source) rather than
reading the individual-shaped `aggregateUsIncomeResult` aggregate (always
$0 for a pure entity — a genuine frozen-engine data-modeling gap). Fixing
this at the source closes India's own s.90 FTC relief silently zeroing out
for a US business entity, and the FY↔CY apportionment card showing $0 for
the whole US side.

**`usEntityStateTaxResult` (new)**: US state-level entity tax —
CA (8.84%)/NY (7.25%)/NJ (9.0%) flat top-bracket C-Corp rates modeled;
TX/WA explicitly flagged "NOT no-tax — has its own gross-receipts tax, not
modeled, do NOT assume $0"; S-corp/partnership/trust/every-other-state
flagged "not modeled" (with a PTET-election caveat for pass-throughs).
Feeds a `findingsAllResult` override appending `us_entity_state_tax`
(modeled, warning) or `us_entity_state_tax_not_modeled` (info) findings.
No real fixture sets `us.profile.state_of_domicile` at all (the 1 real
C-Corp fixture only sets `incorporation_state`, a different, unused field),
so this whole node is pinned with synthetic-`d` unit tests instead
(`test_ustax_full.py`) rather than golden fixtures.

**`nraTaxResult` (TAX-8)**: Form 1040-NR — ECI taxed at graduated brackets
after itemized deductions (no standard deduction for NRAs, SALT-capped);
FDAP taxed flat 30% (or a lower W-8BEN treaty rate when `submittedW8ben`
is true and a treaty claim exists). Reuses `us/ustax.py`'s existing
`bracket_tax`/`bracket_breakdown`/`compute_salt_cap` directly, not
re-derived.

**`reports/trace.py`** gained the three missing `buildTaxComputationUsResult`
branches this port's own file had left as an already-documented carve-out
(NRA / trust-distributed-vs-retained / flat-entity-rate), in the same
dispatch order as `report-batch2-nodes.js`'s own known bug fix (SYS-3,
fuzzer-found): `isNra` → ECI/FDAP structure; `isEntity &&
trustBracketBreakdown is not None` → trust split; `isEntity` (else) → flat
entity-rate structure (pass-through label if `passthrough`, else the
computed flat rate).

**Composition**: `ustax_full.build(r)` runs LAST in
`build_full_registry()` (after `core/orchestration.py`), since it depends
on `entityResult`/`metaResult` and re-overrides `usTaxResult`/
`apportionmentResult`/`findingsAllResult`/`usEntityKind`/`baseYearUs` on
top of everything already composed. `usEntityKind`/`baseYearUs` ownership
moved from `core/orchestration.py` (which closed them provisionally in
Phase 7) to here, fulfilling a promise `us/us_full.py`'s own header had
already made ("closed in ustax_full.py") before this module existed.
382 nodes total, zero `DuplicateNodeError`s.

**Three real "JS-forgiving-`undefined`-vs-Python-strict-`KeyError`" bugs
found and fixed**, all newly reachable only once `usTaxResult` started
actually routing to entity/NRA shapes that carry no `feieAppliedUsd` field
at all (§911 FEIE only applies on the individual path) — same recurring
bug class this port has hit before, fixed the same way (`.get(...) or 0`
instead of `[...]`), verified against the real JS source at each site:
`crossborder/xborder_full.py`'s `feieExcludedUsdBoundaryFtc`,
`crossborder/cross_basis.py`'s `_cross_basis_result`.

**Golden verification, `test_ustax_full.py` (25 new tests)**: the 1 real
NRA fixture (`india_ror_us_income`) now matches golden EXACTLY
end-to-end — `usTax`/`headline`/`summary`/`reconciliation`/
`apportionment`/`monitoring`/`taxComputation.us`/`withholding` all diff
clean, no carve-out needed at all anymore (previously fully carved out
since Phase 3). One small, cosmetic-only, DELIBERATE divergence within
`ftc.india`: `foreignSourceIncomeUsd`/`reliefCapUsd` differ by exactly
$22,000 (the NRA's US LTCG, which an NRA isn't taxed on at all) because the
frozen engine's own non-overridden `usSourceTotalUsdBoundaryFtc` boundary
reads a raw, NRA-unaware aggregate (`ctx.model.income.us.usSourceTotal.usd`)
while `xborder-full-nodes.js`'s own override (ported unchanged) correctly
narrows this to `usTaxResult.usSourceIncomeUsd` (ECI+FDAP only for an NRA);
the bottom-line `reliefAllowedUsd` is identical either way since both cap
values exceed it. The 1 real C-Corp fixture (`us_ccorp_indian_sub`) has
exactly the one root-cause divergence Phase 7 already anticipated
(`usSourceIncomeUsd`), cascading predictably and *only* into
`headline.totalIncomeUsd`/`summary.totalIncomeUsd`/
`computed.apportionment.usCy*`/`computed.ftc.india.*` — all pinned exactly
in `test_ustax_full.py` so the delta can't silently grow or shrink.
Also confirmed: golden's OWN `taxComputation.us.rows` for this fixture
contains literal `"$NaN"` strings baked into the trace text — proof the
frozen engine itself falls through to the individual-branch trace builder
for an entity taxpayer and reads undefined fields, the same permanent-
divergence class as the already-established India entity `"₹NaN"` bug
(`test_reports_trace.py`). This port deliberately builds a clean
entity-shaped trace instead, and does not reproduce the bug.

`test_analyze_golden.py`'s own carve-outs were narrowed to match: NRA is no
longer carved out of `headline`/`summary`/`monitoring` (full parity now);
only the true business-entity case still is, with the reason updated to
name the single remaining divergence precisely instead of a blanket
"routing not built yet." `test_us.py`/`test_crossborder.py`/
`test_reports_trace.py` keep their existing entity/NRA carve-outs
unchanged and correctly — those three build narrower, domain-only
registries (`us_full.build()`/`cross_basis.build()`) that don't include
`ustax_full.build()` at all, so `usTaxResult` genuinely isn't routed in
those isolated registries; only `core.registry.build_full_registry()` (and
therefore `analyze()`) has the routing.

## Phase 8 detail (toggle + shadow mode + cutover, 🟡 in progress)

**Scope decision, made explicitly before starting**: Pyodide's async
loading (fetch the runtime, `micropip.install()` the wheel — real
wall-clock time, unlike the JS DAG's synchronous `graph.resolve()`) means a
live "py-dag" third option in `monitor-next/app/page.jsx` would require
converting its recompute paths to be async-aware — a materially bigger,
riskier change to an already-working production file than "add a third
case." On top of that, this sandbox still has no network route to fetch a
real Pyodide runtime (unchanged since Phase 7's own note), so none of that
browser-side wiring could be end-to-end verified here regardless of how
carefully it's written — and the real promotion gate (≥500 profiles/≥14
days of live shadow running, plan §7) can't be satisfied in one sitting no
matter what. Given a live choice between (a) building the full unverifiable
browser wiring now, (b) writing only promotion-gate docs, or (c) building a
testable-today cross-check between the JS DAG and Python DAG first, (c) was
chosen — it validates the actual computation immediately, decoupled from
the separate, still-open browser-loading question, and doesn't touch the
live production `monitor-next` files at all this round.

**`prototypes/graph-pilot/run-js-dag-vs-py-dag.js`** (new, `npm run
compare:js-vs-py-dag`) — runs `WISING.analyze()` (the real JS DAG,
`analyze.js` — NOT `monitor-next/lib/dag-adapter.js`'s narrower
`assembleDag()`/monitor-next-specific `checksRegistry`/`calendarAmounts`
extras, which `analyze.js`/`analyze.py` don't produce at all) and
`dag_py`'s own `analyze()` (via a new one-shot CLI, `dag_py/tools/
analyze_cli.py` — plain CPython, no Pyodide) over the same 53 profiles
(the 13 hand fixtures + the 40-case fuzz corpus), diffing the full
top-level output with **zero known-divergence allowlist to start** —
unlike every other `run-*.js` harness (which all compare against the
FROZEN ENGINE, a comparison with real, catalogued, permanent divergences),
the JS DAG and Python DAG are independent ports of the exact same
source-of-truth and should agree with EACH OTHER exactly. `monitorAsOf` is
pinned identically on both sides (same discipline as every earlier golden
test); JS-side `Date` objects are converted to ISO strings before
comparison so they compare against the Python side's JSON-round-tripped
(already-string) dates on equal footing.

**First run: 40/53 clean, 12 mismatches + 1 crash — all six were real,
independently investigated and fixed, not allowlisted away:**
- **`baseYear`/`baseYearIn1` were NEVER closed** (`us/us5_penalty_72t.py`'s
  age-at-year-end and `india/findings.py`'s age-at-FY-end boundaries,
  both distinct ids from the already-closed `baseYearUs`) — stuck reading
  `ctx["model"]...` (always `None`) forever, silently defaulting to the
  hardcoded `2025` fallback regardless of the real base year. A genuine,
  previously-invisible gap from an earlier phase's closure pass (the JS
  source's own `agg10-nodes.js:316` closes the shared `baseYear` id
  explicitly; this port's `core/orchestration.py` never did). Produced a
  wrong age (off by however many years the real base year differs from
  2025) for §72(t)'s early-withdrawal penalty and India's senior-citizen
  (age ≥60) advance-tax exemption alike — a real, if narrow, dollar-amount
  bug for any TY other than 2025, not just a display issue. Fixed by adding
  both overrides to `core/orchestration.py`, mirroring `baseYearUs`'s own
  precedent exactly.
- **`us/aggregate_us_income.py`'s `baseYearUsAgg` crashed outright**
  (`TypeError: list indices must be integers or slices, not float`) once a
  fuzzer-mutated `us.metadata.us_calendar_year` landed on a non-integer —
  `year_n` (a MACRS table index) inherited the fraction. The real JS source
  has the identical unguarded `num(...) || 2025`, but JS's `table[nonInteger]`
  silently reads `undefined` (→ `NaN` propagating downstream) where
  Python's list index raises — same "JS forgiving vs Python strict" bug
  class this port has hit before, just manifesting as a crash instead of a
  `KeyError` this time. Fixed with an explicit `int()` cast, same precedent
  as `apportionmentBaseYearRaw`.
- **`core/dates.py`'s `parse_date()` couldn't parse a sub-4-digit year**
  (`"895-12-31"` — both `fromisoformat()` and `strptime("%Y-%m-%d")` reject
  it), crashing wherever a fuzzer-mutated year landed under 1000 — JS's
  `new Date()` accepts any year. Fixed by zero-padding a detected 1-3 digit
  leading year to 4 digits before parsing, rather than crashing (matches
  this port's own rule that pathological fuzzer input should degrade
  gracefully, never crash the resolver).
- **ISO date serialization didn't zero-pad below 4 digits either**
  (`datetime.strftime("%Y-...")` is platform/glibc-dependent below 4
  digits — `"895-..."` not `"0895-..."` — while JS's `toISOString()` always
  zero-pads to 4). Fixed in both places this port serializes a `datetime`
  to an ISO string (`dag_py/tools/analyze_cli.py`'s `_json_default`,
  `test_analyze_golden.py`'s `_normalize_dates`) with explicit
  `f"{year:04d}-..."` formatting instead of relying on `strftime`'s `%Y`.
- **`reports/trace.py`'s entity C-Corp trace showed "21.0%" instead of
  "21%"** — the same recurring "JS whole-value Number auto-stringifies
  without a trailing `.0`" display class this port has hit several times
  before, this time in a rate label built from a fresh `round(...)/10`
  computation that hadn't gone through the port's own `_pct_label`-style
  `:g` formatting. Fixed by formatting through `:g`.
- **`filings/documents.py`'s `form_8960` (NIIT) required-gate read the
  wrong constants table** — `core/constants.py`'s `LIMITS` dict never
  carried an `NIIT_THRESHOLD` key at all (only `us/constants.py`'s own
  `NIIT_THRESHOLD`, correctly used by `ustax.py`'s real NIIT computation,
  does), so `LIMITS.get("NIIT_THRESHOLD", {}).get(status, 200000)` silently
  fell back to `{}` → every filing status got the single/HOH $200,000
  threshold instead of MFJ's real $250,000 — wrongly requiring Form 8960
  for an MFJ filer between $200,000–$249,999 with real investment income.
  Fixed by importing the correct table directly, matching `ustax.py`'s own
  precedent.
- **`us1ShouldFire` (the `underpayment_2210` finding's own gate) had no
  entity-aware override at all** — the real JS source's own
  `agg10-nodes.js` deliberately suppresses this finding for a US business
  entity (a corporation's underpayment penalty is Form 2220/§6655, a
  different, unmodeled safe-harbor test — citing Form 2210/§6654 for an
  entity is simply the wrong form/statute), but this port never ported
  that specific override, so the real `us_ccorp_indian_sub` fixture fired
  an extra, wrongly-captioned finding. This one was ALREADY flagged as a
  known, deferred gap earlier in this port's own history (noted, not
  fixed, during the entity/NRA routing work) — closed here with a
  `us1ShouldFire` override in `us/ustax_full.py`, mirroring the JS source's
  own fix exactly. Cascades into `summary.healthScore`/
  `monitoring.health.score` for that one fixture — `test_analyze_golden.py`'s
  own carve-out list updated accordingly (this fixture's health-score
  divergence from golden is now correctly EXPECTED, since the frozen
  engine has no equivalent fix and still fires the finding).

**One real divergence found and left UNFIXED, deliberately** — in the live
JS DAG, not in this Python port: `apportionmentBaseYearRaw`'s real JS
source (`agg10-nodes.js`) reads `num(safe(router, "base_tax_year", ...)) ||
2025` with no `int()` cast, so a fuzzer-mutated non-integer
`router.base_tax_year` (e.g. `3712.07`, from `run-fuzz.js`'s own
numeric-jitter mutator) leaks straight into `fyLabel`/`cyPrimary`/`cyNext`
and any trace text built from them (`"FY 3712.07–13.07"` instead of `"FY
3712–13"`). This port's own `apportionmentBaseYearRaw`
(`crossborder/apportionment.py`) already `int()`-casts (a pre-existing
"no trailing .0" fix, unrelated to this specific bug) and is therefore
immune — a case where this port is MORE correct than the live JS DAG on an
input no real profile ever produces (a real tax year is always a whole
number; only fuzzer mutation reaches this). NOT fixed in
`prototypes/graph-pilot/*.js`: the plan's own explicit cutover timing
keeps the JS DAG "the live, unmodified production compute path through the
entire build" — patching a live production file is a separate, deliberate
decision this pass didn't make, not a side effect of building the
cross-check harness. Allowlisted in `run-js-dag-vs-py-dag.js` itself
(`hasJsFractionalBaseYearBug`), same "investigate, then document" discipline
as every other `run-*.js` harness's own known-divergence list.

**Result after all fixes: 46/53 exact match, 7/53 known (the one
fractional-base-year cause above), 0 mismatches, 0 crashes either
direction.** `cd dag_py && pytest -q` stays at 547/547 green throughout
(one new `test_analyze_golden.py` carve-out needed: `test_monitoring_
matches_golden`'s entity-fixture skip, re-added for the same reason —
`us1ShouldFire`'s fix makes this port correctly diverge from golden's own
`monitoring.health.score` now, where it accidentally matched before by
sharing the same bug).

**NOT done in this first Phase 8 pass, deliberately deferred** (see the
scope decision above): the live `wising_compute_source` 3-way toggle, the
async Pyodide loader, the 3-way `shadow-core.js` extension, an actual
browser/Pyodide smoke test, and any real shadow-mode production data. The
promotion gate (plan §7) remains entirely unstarted — it cannot be
satisfied by anything built in a single sitting, only by real time and
real usage once the live wiring exists.

### Toggle + Pyodide loader (second Phase 8 pass)

Built the pieces deferred above, on explicit instruction to proceed with
the "build it now, unverified" option (the scope decision's option (b) —
see that section for why nothing here can be end-to-end tested against a
real Pyodide runtime in this sandbox).

**The core architectural problem, found before writing any code**:
`adapter/pyodide_adapter.py`'s own `install()` (Phase 7) assigns to
`window.WISING.analyze`/`.normalize` — the SAME global the frozen engine's
own IIFEs (`monitor-next/lib/engine/*.js`) already populate. That's fine
for `index.html`'s standalone prototype (a single compute source, nothing
else touches `window.WISING`), but `monitor-next` already has the engine
living at `window.WISING` AND the JS DAG (imported as plain ES modules,
`lib/dag-adapter.js`, no `window` footprint of its own) side by side — a
Python DAG installed the same way would silently clobber the engine's own
global the instant Pyodide finished booting. Fixed by giving `install()` an
optional `namespace` parameter (default `"WISING"`, so `index.html`'s own
future wiring is unaffected) — `monitor-next`'s own loader calls
`install(namespace="WISING_PY")` instead, landing at a wholly separate
`window.WISING_PY`.

**Static asset serving, not a wheel-in-the-bundle**: `adapter/
pyodide_adapter.py` deliberately lives OUTSIDE `dag_py/src/` (so it's
never accidentally packaged into the wheel — the wheel is pure
`wising_dag/**`, deployment-target-agnostic per Phase 7's own design). The
browser loader needs BOTH the wheel (for `micropip.install()`) and this
adapter's own source text (there being no `import` machinery inside
Pyodide for a file outside the installed wheel — the loader fetches it and
`runPythonAsync`s it directly). New `monitor-next/scripts/sync-dag-py.js`
(wired into `predev`/`prebuild`, same convention as `sync-engine.js`/
`sync-dag.js`) copies both `assets/wising_dag.whl` and `dag_py/adapter/
pyodide_adapter.py` into `monitor-next/public/dag-py/`, so Next's static
export serves them at `/dag-py/wising_dag.whl` and `/dag-py/
pyodide_adapter.py` — fetchable at runtime, not webpack-bundled (unlike
`sync-dag.js`'s own `lib/dag/` copy, which IS `import`ed as ES modules).

**`monitor-next/lib/py-dag-loader.js`** (new) — `initPyDag()`, a memoized
async bootstrap: loads `pyodide.js` from a CDN (`cdn.jsdelivr.net/pyodide/
v0.26.4/full/` — the one version pin to bump later), `loadPyodide()`,
`pyodide.loadPackage("micropip")`, `micropip.install()`s the wheel by URL,
fetches the adapter's source text and `runPythonAsync`s it with
`install(namespace="WISING_PY")` appended. Memoized so the real boot
sequence — seconds on a cold first call — runs at MOST once per page load;
every later caller (a recompute, a Clients-tab refresh, a linked-entity
lookup) awaits the same in-flight or already-resolved promise.
`getPyDagLoadState()` exposes `{state, error}` (`"idle"|"loading"|
"ready"|"error"`) synchronously for UI use without triggering a load.

**`monitor-next/lib/py-dag-adapter.js`** (new) — the async counterpart to
`dag-adapter.js`: `analyzePyDagSource`/`analyzePyDag`/
`monitorSnapshotPyDag`/`analyzeProfileByIdPyDag`/`allClientSummariesPyDag`,
same field contract and same localStorage-backed source resolution
(`readRaw`/`STORAGE_KEYS`, now exported from `dag-adapter.js` so this file
reuses them instead of duplicating the lookup), every export returning a
Promise instead of a bare value. Regime/FX/FEIE what-if overrides are
patched into `india`/`us` client-side exactly like `analyzeDag()` does,
since `wising_dag.analyze()` itself has no what-if-patching concept of its
own — only `router`/`india`/`us`/`monitorAsOf`/`fxRateOverride` cross into
the Python opts dict.

**`monitor-next/app/page.jsx`**: `engineSource` is now 3-way
(`"engine"|"dag"|"py-dag"`, cycled by the same compute-source pill, plus
`?engine=py-dag`). New `pyDagStatus` state
(`"idle"|"loading"|"ready"|"error"`) drives the pill's own label/color
while a py-dag call is in flight or has failed. `recompute()`'s existing
synchronous `dag`/`engine` branches are UNCHANGED; a third branch handles
`py-dag` by awaiting `monitorSnapshotPyDag(...)` and applying the same
`setCountries/setMode/.../setResult` update on resolution — the PREVIOUS
result stays on screen while a py-dag call is in flight rather than
blanking the page, since a cold Pyodide boot can take real time.
`refreshClientSummaries()` gained the same async branch for the Clients
tab. What-if overrides (regime/FX/FEIE) are now enabled for BOTH DAG-family
sources (`engineSource !== "engine"`, previously `=== "dag"` only) — the
Python DAG accepts the exact same override shape. The one deliberate
simplification: `linkedFilings` (the owned-entity Filings-tab roll-up,
docs/GAP_TRACKER.md section H.11) is a synchronous `useMemo` and returns
`[]` for `py-dag` rather than a bigger async-effect rework of an
already-working feature — a secondary convenience, not central to what
this phase is verifying.

**Verification actually performed**: `cd monitor-next && npx next build`
compiles cleanly (webpack/SWC + TypeScript checking + static prerender,
all 4 pages), confirming no syntax/import errors across every new/changed
file. `node test-adapter.mjs`/`node test-shadow.mjs`/`npx vitest run` all
run clean — the SAME 42/3 pre-existing failures already present before
this pass (confirmed by `git stash`-ing every changed file and re-running;
identical failure set both ways), nothing newly broken by the `dag-
adapter.js` export additions. `dag_py`'s own suite stays 547/547, and
`ast.parse()` confirms `adapter/pyodide_adapter.py` is syntactically valid
Python (this file has no pytest coverage at all — it imports `pyodide`/
`js`, neither installed in this sandbox — so a bare syntax check is the
most this environment can verify; it DID catch one real mistake, a
docstring closed one edit too early, before this note was written).

**NOT verified, same unavoidable limitation as Phase 7's own adapter
work**: none of `py-dag-loader.js`'s actual Pyodide calls (`loadPyodide()`,
`micropip.install()`, `runPythonAsync()`) have run against a real runtime
— this sandbox still has no network route to fetch one. Written to the
documented Pyodide browser API, not exercised end-to-end. The toggle
itself is reachable and will render correctly (build-verified); whether a
live Pyodide boot actually succeeds, how long it takes, and whether
`micropip.install()` accepts a same-origin relative wheel URL exactly as
constructed here are all genuinely open questions this pass could not
close.

**Still NOT done as of that pass**: the 3-way `shadow-core.js` extension
(engine vs py-dag, tagged `source_pair`), any real promotion-gate data, and
the actual cutover (flipping the default source).

### Three-way shadow mode (third Phase 8 pass)

Closes the `shadow-core.js` extension deferred above.

**`compareSurface()`/`diff()` needed no change at all** — both already
take any two `analyze()`-shaped results, agnostic to which implementation
produced them; the JS DAG and the Python DAG are independent ports of the
exact same source and share the exact same catalogued divergences from
the engine (confirmed directly by `run-js-dag-vs-py-dag.js`'s own
cross-check), so every existing allowlist (`KNOWN_US_ENTITY_PATHS` etc.)
already applies unchanged to an engine-vs-Python-DAG comparison. The one
real change: `signature(source, divergences)` became
`signature(sourcePair, source, divergences)` — a new
`SOURCE_PAIRS.{ENGINE_VS_JS_DAG,ENGINE_VS_PY_DAG}` constant makes the
dedup key explicit, so an engine-vs-JS-DAG divergence and an
otherwise-identical-looking engine-vs-Python-DAG one on the same profile
are two distinct logged entries, never silently collapsed into one.

**`lib/shadow.js`** gained a second, independent runner: `runShadowPy(source)`
— async counterpart to the existing `runShadow(source)`, calling
`analyzePyDagSource()` (Pyodide) instead of `analyzeDag()` (plain JS), same
error-as-divergence discipline (a thrown side is itself recorded, never
propagated to crash the primary UI). Both legs write into the SAME
persisted log (`localStorage`, `wising_shadow_log`) and share one `events`
array (each entry tagged with its own `sourcePair`), but keep SEPARATE
`lastRun`/`lastRunPy` slots and separate session run/clean counters —
the two legs fire at very different cadences (every recompute vs
opt-in-only), so folding them into one "last run" slot would make the
primary shadow status flicker between two different meanings depending on
whichever fired most recently.

**Deliberately NOT wired to fire automatically just because shadow mode is
on**: unlike the JS-DAG leg (a cheap, synchronous `graph.resolve()` call,
safe on every recompute), the Python-DAG leg boots Pyodide on a cold first
call — real wall-clock time, same cost `py-dag-loader.js`'s own header
already documents. `app/page.jsx` gates it behind a SEPARATE opt-in flag,
`shadowPyOn` (`?shadowPy=1`, independent of the always-on `shadowOn`),
deferred off the render path exactly like the JS-DAG leg already is.

**`components/ShadowBadge.jsx`**: the main pill's color/label still drives
off the JS-DAG leg only (the always-on baseline); a new section in the
expanded panel shows the Python-DAG leg's own last-run status and
divergences whenever it's been enabled and has run at least once, and the
"Logged this session" event list now tags each entry with which pair it
came from. One real pre-existing bug fixed in passing (found while editing
this exact render path for the above): the "last: …" line referenced an
undefined `count` variable — a `ReferenceError` waiting to fire the first
time a real JS-DAG divergence was ever logged and the panel opened. Fixed
to read `run.divergenceCount`, the value that was always intended.

**Verification**: `cd monitor-next && npx next build` compiles clean;
`node test-adapter.mjs`/`node test-shadow.mjs`/`npx vitest run` all show
the identical pre-existing 42/3 failures already present before this
change (re-confirmed the same way as the toggle/loader pass — nothing
newly broken by the `signature()` signature change or the new files).
`test-shadow.mjs` doesn't call `signature()` directly, so that change was
safe to make without touching the test file itself.

**Still NOT done**: any real promotion-gate data (requires actual
production shadow-mode running, which requires the still-unverified live
Pyodide wiring itself to work first) and the actual cutover (flipping the
default source). Both remain future work, and neither can be closed by
anything built in a single sitting.

### Completeness audit + checksRegistry/calendarAmounts wiring (fourth Phase 8 pass)

A full audit of what's pending before the Python DAG could actually
replace the JS DAG — not a build phase, a verification pass. Diffed the
JS DAG's most-composed registry (`checks-registry-nodes.js`'s NODES, 385
node ids) against `build_full_registry()`'s own (382 ids) and traced every
one of the 28 JS-only ids individually (renamed/domain-suffixed leaves,
genuinely dead JS-side code the JS source's own comments already flag as
having no real consumer, or legacy `withSyntheticCtx()` ctx-routing plumbing
whose final output is identical either way — all confirmed, not just
assumed, by reading the real require chain: `analyze.js` -> `assets-
nodes.js` -> `ustax-full-nodes.js` -> `agg10-nodes.js` -> `limits-nodes.js`
-> `report-batch6-nodes.js` -> `report-batch5-nodes.js` -> `in1-nodes.js`/
`xb7-nodes.js`/`us1-nodes.js`/`us5-nodes.js`). Found exactly one real,
actionable gap — closed in this pass — plus a cluster of stale
self-documentation (also cleaned up here) and two already-known,
already-documented items (real fixture coverage for the trust-retained-
income and CA/NY/NJ-state-tax branches; the still-unverified live Pyodide
runtime) that remain open, unchanged.

**The real gap: `checksRegistry`/`calendarAmounts` were never wired into
the Python DAG's browser adapter.** `lib/dag-adapter.js`'s own `analyzeDag()`
does exactly one thing beyond `analyze.js`'s real contract: it separately
resolves `checksRegistryResult`/`calendarAmountsResult` and stitches them
onto the output. Both feed live UI — the Checks Registry panel (Monitor +
Residency tabs) and the Compliance Calendar's forward-looking $ amounts.
`dag_py` already had both computations (`filings/checks_registry.py`,
`filings/calendar_amounts.py`) fully built and correct in the registry —
the gap was purely in the adapter wiring, which only ever called
`window.WISING_PY.analyze()` (mirroring `analyze.js`'s own narrower
contract). Selecting "Python DAG" would have silently blanked the Checks
Registry panel and dropped the calendar's $ amounts.

Closed with a new `wising_dag.analyze.analyze_with_extras(opts)` —
`analyze(opts)` plus `checksRegistry`/`calendarAmounts`, resolved from the
same cached registry via a second, small `_registry().resolve([...])` call
(ctx-building factored out of `_resolve_all` into a shared `_build_ctx`
helper to avoid duplicating that logic). Deliberately NOT added to
`analyze()` itself (which stays a faithful, narrow `analyze.js` port) or to
`__init__.py`'s exports (`wising_dag`'s own public surface stays exactly
`analyze`/`normalize`, as documented) — reachable only via
`wising_dag.analyze.analyze_with_extras`, the same way `checksRegistry`/
`calendarAmounts` are only ever an adapter-layer concern on the JS side too.
`adapter/pyodide_adapter.py`'s `install()` gained an `include_extras: bool`
parameter — `False` (default) installs the plain `analyze` (`index.html`'s
own future wiring keeps byte-for-byte `analyze.js` parity); monitor-next's
`lib/py-dag-loader.js` now calls `install(namespace="WISING_PY",
include_extras=True)`, so `window.WISING_PY.analyze` resolves the extras
automatically — `lib/py-dag-adapter.js` needed no further change at all,
since `analyzePyDag()` already just returns whatever `window.WISING_PY.
analyze()` produces.

**Verified against the real JS DAG, not just unit-tested in isolation**:
`prototypes/graph-pilot/run-js-dag-vs-py-dag.js` gained a second, separate
JS graph (`calendar-amounts-nodes.js`'s NODES — `analyze.js`'s own graph,
via `assets-nodes.js`, doesn't carry `calendarAmountsResult` at all) to
resolve `checksRegistryResult`/`calendarAmountsResult` and merge them into
the JS-side comparison object; `dag_py/tools/analyze_cli.py` switched from
`analyze()` to `analyze_with_extras()` so the Python side always includes
them too. Both keys added to the harness's own `TOP_LEVEL_PATHS`. Result:
still 53/53 (46 exact + the 7 already-known JS-side fractional-base-year
cases) — zero new divergences on `checksRegistry`/`calendarAmounts` across
every real fixture and fuzz-corpus profile. New `dag_py/tests/
test_analyze_with_extras.py` (26 tests) locks in the CONTRACT itself
(`analyze_with_extras()` == `analyze()` plus exactly those two keys, each
matching the underlying node's own value exactly) — the Node harness
already owns cross-JS-parity, so this file doesn't re-check that.

**Stale self-documentation cleaned up** (found while auditing — all
described a real gap AT THE TIME they were written, later closed by
subsequent work, with the original file's own header/comment never
updated to say so): `crossborder/xborder_full.py`, `crossborder/
apportionment.py`, `crossborder/black_money_act.py`, `us/us1_penalty_2210.py`,
`us/us5_penalty_72t.py`, `reports/assembly.py`, `reports/trace.py`. One was
flat-out factually wrong rather than just stale: `india/findings.py`
claimed (in two places) that `in1-nodes.js`/`xb7-nodes.js` are "dead build
history, never required by the live production chain" — tracing the real
require chain during this audit showed both ARE required (via
`report-batch5-nodes.js`, for `india_advance_tax_interest`'s and
`black_money_act_exposure`'s own full finding-object text). The actual
PORTED VALUES were already verified correct regardless (this port reads
the same underlying data these two files do, just via differently-named,
domain-organized nodes) — this was a documentation correction, not a code
fix.

**Confirmed still open, unchanged by this pass** (already known, not
newly discovered): no real fixture or fuzz-corpus profile sets
`state_of_domicile` or a nonzero `trust_retained_income_usd`, so `us/
ustax_full.py`'s CA/NY/NJ-modeled state-tax branch and the trust
retained-income bracket computation are verified only by `test_ustax_full.py`'s
own synthetic unit tests, never cross-checked against the live JS DAG on
a shared input — same limitation already documented in that module's own
section above. The live Pyodide runtime itself remains unverified end-to-
end (no network route to fetch one in this sandbox) — unaffected by
anything in this pass, since it's a browser-loading question entirely
separate from the computation this pass touched.

### Trust-retained/state-tax fixture coverage + a real cross-language rounding bug (fifth Phase 8 pass)

Closed the one item the previous pass left open: added 4 hand-authored
profiles under `dag_py/tests/fixtures/manual-cases/profiles/` —
`us_ccorp_ca_state_tax.json`/`us_ccorp_ny_state_tax.json`/
`us_ccorp_nj_state_tax.json` (clones of `us_ccorp_indian_sub.json` with
`state_of_domicile` set) and `us_trust_retained_income.json` (a
`tax_entity_type: "trust"` profile with a nonzero `trust_retained_income_usd`).
Kept in their own directory, deliberately **not** added to
`dag_py/tests/fixtures/profiles/` — that directory feeds `conftest.py`'s
`ALL_FIXTURE_IDS` parametrization, which several test files use to call
`load_golden(fixture_id)` unconditionally; these 4 synthetic profiles have
no frozen-engine golden file (there's no golden generator step for
hand-authored profiles) and would crash those tests. `run-js-dag-vs-py-dag.js`
gained a `MANUAL_CASES_PROFILES_DIR`, included alongside the fixture/
fuzz-corpus sets with a `manual:` id prefix, so these 4 cases now run
through the live JS-DAG-vs-Python-DAG cross-check on every harness run.

This fixture work surfaced two real bugs, only one of which is a genuine
production defect:

1. **`float('inf')` doesn't round-trip through JSON** — `TRUST_ESTATE_
   BRACKETS`' top bracket (`[float("inf"), 0.37]`) reached a bracket
   breakdown embedded in the harness's JSON payload for the first time
   (no earlier fixture/corpus profile's taxable income ever reached a top
   bracket in a JSON-serialized field). Python's `json.dump()` writes a
   bare `Infinity` token, which is valid per Python's own `json` module
   but not standard JSON — Node's `JSON.parse()` rejected it outright.
   **Test-harness-only, not a real production issue**: the actual browser
   adapter crosses the JS boundary via `pyodide.ffi.to_js`, never through
   a JSON string, so a real `float('inf')` becomes a real JS `Infinity`
   directly. Fixed by sentinel-string substitution on both sides of the
   CLI boundary (`_sanitize_infinities`/`_INFINITY_SENTINEL` in
   `dag_py/tools/analyze_cli.py`, `desanitizeInfinities` in
   `run-js-dag-vs-py-dag.js`) — harness plumbing, no `wising_dag` source
   changed for this one.

2. **JS `Math.round()` vs Python `round()` diverge on an exact `.5` tie —
   a real, previously-undetected bug in the actual computed output.**
   The trust fixture's bracket tax landed on exactly `14636.5`; the JS DAG's
   `usd()` helper (`Math.round`, always rounds ties toward `+Infinity`)
   produced `"$14,637"`, while the Python port's various `round()`-based
   helpers (Python's builtin, round-half-to-even) produced `"$14,636"`.
   Never caught before because no prior fixture or fuzz-corpus profile's
   rounded currency-display value had ever landed exactly on a `.5`
   boundary. This is not a display-only quirk — several files round an
   exact `.5` intermediate value (senior/tips/overtime/QBI deductions, AMT
   owed, non-refundable/refundable credits, apportionment splits, state
   entity tax) that then feeds forward into further arithmetic, so a wrong
   tie-break can shift the real numeric output, not just its last-mile
   formatting.

   Fixed with a new canonical `core/util.py::js_round(n)` —
   `math.floor(n + 0.5)`, verified directly against Node to reproduce
   `Math.round`'s exact "always toward +Infinity on .5" behavior for every
   sign (including the `-0.5` edge case) — and swept every bare `round()`
   call across the port that ports a JS `Math.round()` call over to
   `js_round()` instead: `core/util.py` (`format_inr`/`format_usd`, the
   two shared helpers), plus per-file duplicate `_usd`/`_inr`-style
   helpers and inline `round()` calls in `crossborder/{findings,
   cross_basis,apportionment}.py`, `us/{ustax,ustax_full,findings}.py`,
   `india/{findings,entity_tax,aggregate_india_income}.py`,
   `filings/{documents,assets,monitoring,limits}.py`, and `reports/
   trace.py`. Each site was checked against its `Math.round(...)` origin
   in `prototypes/graph-pilot/*.js` before converting — the one exception
   left as bare `round()` is `reports/trace.py`'s `_pct_label` (`round(rate
   * 100, 2)`), which ports `(rate * 100).toFixed(2)`, a genuinely
   different (2-decimal, not integer) rounding contract, not a
   `Math.round()` site at all. `crossborder/double_tax.py` and `us/
   aggregate_us_income.py` were checked and confirmed to have only
   currency-*conversion* helpers (`_inr_to_usd`), not display-rounding
   ones — no `Math.round` equivalent to fix there.

**Verification**: full `dag_py` pytest suite green (573/573, no
regressions from the `js_round` sweep); `run-js-dag-vs-py-dag.js` green at
57/57 (50 exact matches + the 7 already-known JS-fractional-base-year
cases, zero new mismatches) — the trust fixture's rounding divergence is
gone. Wheel rebuilt (`scripts/build-dag-wheel.py`) and monitor-next's
`public/dag-py/` assets re-synced (`sync-dag-py.js`).

**Still open, unchanged by this pass**: the live Pyodide runtime remains
unverified end-to-end (no network route to fetch one in this sandbox);
real promotion-gate data (requires that live wiring plus actual production
shadow-mode running) is unaffected by anything in this pass.

### JS-DAG-drift audit: `businessComputation` missed a mid-port JS addition (sixth Phase 8 pass)

Direct response to the question "is the JS DAG still getting features added
that the Python port never picked up?" The Python port was NOT built
against one frozen JS snapshot the way the JS DAG itself was built against
the frozen engine — `dag_py`'s domain phases were built in a single day
(2026-07-25) while JS-DAG feature work continued in parallel/interleaved
commits on the same day. The completeness audits in earlier passes (node-ID
diffing against `checks-registry-nodes.js`'s registry) would NOT catch this
class of drift: a node id that exists on both sides, unchanged in name,
but whose JS-side compute body gained new logic AFTER the Python side had
already ported it and was never revisited.

**Method**: cross-referenced every `prototypes/graph-pilot/*-nodes.js`
file's last-commit date against the Python port timestamp of the domain
that ports it. Only 4 node files have a real-logic commit landing ON OR
AFTER Python DAG work began (2026-07-25 03:48): `aggregateusincome-nodes.js`
(03:48, farm depreciation — confirmed already captured, `usBusinessDepreciationPlan`/
`farmNetProfitUsd` present verbatim in `us/aggregate_us_income.py`),
`aggregateindiaincome-nodes.js` (04:18 — **see gap below**),
`report-batch1-nodes.js` (04:18, `form_3cb_3cd`'s presumptive-lock-in
trigger — confirmed already captured in `filings/documents.py`), and
`assets-nodes.js` (05:57 and three earlier same-day commits, entity-graph
`returnForm` threading + edges — confirmed already captured, verified by
diffing `INDIA_KIND_TO_ITR`/`US_KIND_TO_FORM`/`US_K1_KIND_TO_FORM`, every
edge `flow` type, and every entity `kind` value between the current JS
source and `filings/assets.py` byte-for-byte). Every other node file's last
commit predates 2026-07-25 entirely — zero drift risk for the other ~40
files regardless of which Python phase ported them.

**The one real gap found**: `aggregateindiaincome-nodes.js`'s
`businessComputation` (JS commit `3d2a4f0`, "s.44BB/BBB/35AD/115V tonnage
tax", gap tracker IN-26) landed 16 minutes after Python Phase 2 had already
ported `india/aggregate_india_income.py`, and that file was never
revisited for logic since — only the disclosure/finding layer this same
JS commit added (`presumptiveLockinAgg`, the `msme_disallowance_s43Bh_india`/
`presumptive_lockin_active_india` findings) got ported, during the later
Phase 6 `filings/` pass, creating the illusion of full coverage. The actual
income computation never did: `_uses_regular_books_inr`/
`_compute_business_entry_net_profit_inr` had no `s44BB`/`s44BBB` branch (a
non-resident mineral-oil-services / foreign-company civil-construction
presumptive scheme, flat 10% of receipts, no ceiling test) — any such
business entry silently fell through to Regular Books instead, exactly the
bug the JS commit fixed. `_business_computation` also never added s.115V
tonnage-tax income or subtracted the s.35AD specified-business capex
deduction (both gated to `entity == "company" and not NR`, matching the
live form's own "For Indian Companies only" scoping) — both real income
components with zero prior Python equivalent, not just a rounding-scale
gap. This is a genuine, previously-undetected computation bug affecting
the actual tax figure whenever a taxpayer's business entries use these
fields — not caught earlier because no fixture or fuzz-corpus profile
happens to set `presumptive_scheme: "s44BB"/"s44BBB"`,
`tonnage_tax_115V_inr`, or `specified_business_s35AD_inr`.

Fixed by porting the JS diff verbatim: `_uses_regular_books_inr` and
`_compute_business_entry_net_profit_inr` gained the s44BB/s44BBB branches
(flat `js_round((turnover_inr + cash_receipts_inr) * 0.10)`, matching the
JS side's own `Math.round`); `_business_computation` gained a
`tonnage_tax_inr` accumulator per entry and the `entity == "company" and
not is_nr_company` gate that adds it to `businessInr` and subtracts
`specified_business_s35AD_inr`, returning both as new `tonnageTaxInr`/
`s35adDeductionInr` keys (matching the JS return shape) — added
`indiaResidencyStatusRawAgg`/`diAgg` to the node's `deps` (both already
existed as registered nodes) and the three new fields to
`_BUSINESS_COMPUTATION_FIELDS`. Confirmed via `git grep` that
`businessComputation` is defined in exactly one JS file (no later override
recomputes it), so this closes the gap completely, not partially.

Added 2 new manual-cases fixtures exercising the previously-uncovered
branches: `india_company_tonnage_35ad.json` (resident Indian company, a
regular-books entry with `tonnage_tax_115V_inr` plus a top-level
`specified_business_s35AD_inr`) and `india_foreign_nr_s44bbb.json` (an NR
foreign company with an `s44BBB` presumptive entry, `turnover_inr` +
`cash_receipts_inr`). Both cross-checked directly against the live JS DAG
via `run-js-dag-vs-py-dag.js` — **clean match, zero mismatches** — proving
the port now reproduces the JS-side fix exactly, not just plausibly.

**Verification**: `dag_py` pytest 573/573 green; `run-js-dag-vs-py-dag.js`
59/59 (52 exact + the 7 already-known JS-fractional-base-year cases, zero
new mismatches). Wheel rebuilt, monitor-next assets re-synced.

**Methodological takeaway for future passes**: a clean harness run over the
existing fixture/fuzz-corpus set is proof of parity only for the branches
that set of profiles actually exercises — it is not proof of completeness.
This gap survived two prior completeness passes (the node-ID diff and the
checksRegistry/calendarAmounts wiring pass) precisely because 57/57 clean
was mistaken for "nothing left to find." The commit-date cross-reference
method used here (last-JS-touch vs. Python-port-timestamp per node file)
is cheap enough to re-run before every future promotion-gate check, and is
the only method that would have caught this class of drift.

### Seventh Phase 8 pass: re-ran the completeness audit at full depth, no new gaps found

Direct follow-up to the sixth pass's own recommendation — re-ran the same
audit, wider, immediately after fixing the one gap it found, specifically
to check whether that gap was a one-off or a sign of a broader pattern.

- **Fresh full node-registry diff** (`checks-registry-nodes.js`'s NODES,
  385 ids, vs `build_full_registry()`, 382 ids): identical counts and
  identical 28-JS-only/25-Python-only split as the pre-fix audit — the
  `businessComputation` fix touched only a compute body, not the node-id
  shape, so this is the expected result, not a false negative.
- **Re-verified roughly half the 28 "JS-only" ids by direct code reading**
  (not by trusting the earlier pass's conclusions): `indiaOpt115baaRaw`/
  `indiaOpt115babRaw` (renamed without the `Raw` suffix in Python, same
  `entityResult`/`entity_tax.py` values, confirmed via `documents.py`'s own
  `form_10ic`/`form_10id` triggers); `entityFormsResult` (a JS-only
  duplicate of fields `entityResult` already carries — Python correctly
  never duplicated it, confirmed both compute the identical
  `indiaReturnForm`/`usReturnForm` derivation); `black_money_act_exposure`,
  `schedule_fa_inconsistent`, `holding_period_mismatch`,
  `india_advance_tax_interest`, `underpayment_2210`,
  `early_withdrawal_penalty_72t` (all present as full finding objects, not
  just referenced ids); `computedEchoBoundary`/`modelEchoBoundary` (the
  `withSyntheticCtx()`/synthetic-ctx plumbing already documented as
  deliberately unported); `hasUsPeRaw`/`form8938RequiredRaw` (confirmed
  dead by the JS source's OWN comment: "mirrored here only so the audit's
  ...claim is literally true, not because either side has a real
  consumer"); `feieDetailed` (a JS-only node that existed solely to work
  around `usTaxResult.feie` missing a `.reasons[]` field — Python's own
  `feie_eligibility()` includes `reasons[]` directly, so the workaround
  node was never needed, already documented in `us/findings.py`'s own
  header). Every one checked out as accounted for, not missing.
- **Commit-date cross-reference, widened to include the 6 non-`*-nodes.js`
  infrastructure files** (`constants.js`, `fx-util.js`, `analyze.js`,
  `graph.js`, `profiles.js`, `sample-data.js`) on top of all 44 node files
  already checked in the sixth pass: all 6 predate 2026-07-25 (the day
  Python DAG work began) except `profiles.js` (`06f69c9`, already
  confirmed fixture/demo-data-only, no DAG logic) — zero additional drift
  risk found.
- **Harness**: `run-js-dag-vs-py-dag.js` re-run clean at 59/59 (52 exact +
  7 known JS-side cases).

**Conclusion**: as of this pass, there is no known JS DAG functionality —
reachable from `analyze()`'s own `TARGET_IDS`, not just textually present
in a `require()`d file — that is missing from the Python port. The
`businessComputation` gap fixed in the sixth pass was a one-off (a single
node whose logic changed 16 minutes after its domain was ported and was
never revisited), not a symptom of a wider unfixed pattern — confirmed by
directly re-deriving, not re-trusting, the conclusion on a broad sample of
the remaining diff surface. The residual caveats are unchanged from every
earlier pass: this is bounded by what the 59-profile fixture/corpus/
manual-case set actually exercises (a genuinely untested field combination
could still hide something), and the live Pyodide runtime remains
unverified end-to-end for reasons unrelated to computation completeness.

### Eighth Phase 8 pass: fixed the `profiles.js` fixture staleness properly — found a real bug doing it

The seventh pass's own dismissal of `profiles.js` ("already confirmed
fixture/demo-data-only, no DAG logic") was too quick. `profiles.js` gained
real field additions post-port (`06f69c9`, 07:50 on 2026-07-25, after
Python's fixture port at 04:02): `foreign_holdco_poem_india` gained the
s.44BBB/tonnage/s.35AD business entry exercised by the sixth pass's own
manual-cases fixtures, and `india_only_ca_client` gained
`business_income.s44AD_last_exit_ay` (the s.44AD(4) lock-in field) — but
`dag_py`'s own committed copies of these two fixtures were never refreshed
from the live source, so they were silently testing stale data.

**Refreshed properly this time**, not reverted: `node dag_py/tools/
port_profiles.js` (re-dumps `profiles.js` to the committed fixture JSON —
exactly the tool's own documented "rerun when profiles.js changes"
purpose) followed by `node dag_py/tools/generate_golden.js` (regenerates
the frozen-engine golden output the refreshed fixtures need). Confirmed
`generate_golden.js`'s wall-clock-dependent regeneration (no pinned
`monitorAsOf`, unlike the JS harness's own `MONITOR_AS_OF` constant) is
harmless despite touching all 13 golden files' date-derived fields on
every run — `test_analyze_golden.py` re-pins its own `analyze()` call to
whatever `monitoring.asOf` golden embeds, so the comparison stays
internally consistent regardless of real-world regeneration time.

**This surfaced a real, previously-undetected bug, not just a golden
divergence.** `run-js-dag-vs-py-dag.js` on the refreshed `fixture:
india_only_ca_client` case showed an actual JS-DAG-vs-Python-DAG mismatch
(findings count 7 vs 6, `presumptive_lockin_active_india` missing,
`monitoring.health.score` 72 vs 88) — not the "frozen engine doesn't
understand a DAG-only feature" class of divergence the s.44BBB gap was,
but a live disagreement between the two DAGs on the exact same feature.
Root cause: `filings/documents.py`'s `s44adLastExitAyRaw` node read
`ctx.india.presumptive_scheme.s44ad_last_exit_ay` (a path that has never
existed in any real profile — a fabricated field path, not a rename),
while the JS source (`aggregateindiaincome-nodes.js`) reads
`diAgg.business_income.s44AD_last_exit_ay`. Every fixture/corpus profile
until now happened to have this field unset, so `safe(...)` always
returned `None` on both sides and the divergence stayed invisible — this
specific fixture staleness fix is what finally exercised it. Fixed by
correcting the path and `deps` to match the JS source exactly (`deps=
("diAgg",)`, reading `diAgg["business_income"]["s44AD_last_exit_ay"]`).

**Both real gaps this session (the s.44BBB `businessComputation` bug and
this `s44adLastExitAyRaw` path bug) were found via the exact same
mechanism**: real-world fixture/demo data that changed after a domain was
ported, re-exercising a code path no synthetic fuzz-corpus profile ever
happened to hit. This reinforces the seventh pass's own methodological
point from the opposite angle — it's not just "did the JS source change,"
it's "did the DATA actually driving the comparison change too," and both
matter independently.

**Golden-comparison fallout, handled with proper carve-outs, not skips**:
regenerating golden re-exposed the s.44BBB fixture's already-known,
already-documented divergence (`foreign_holdco_poem_india`'s india income
is now correctly ~₹22.85M in the Python port vs golden's stale ~₹67M,
since the frozen engine still has zero concept of s.44BBB and silently
mis-treats that entry as ungated Regular Books) across 12 golden-
comparison tests in 6 files (`test_analyze_golden.py`,
`test_crossborder.py`, `test_filings_assets.py`,
`test_filings_documents.py`, `test_findings.py`, `test_india.py`). Added
one shared `conftest.py` constant, `GOLDEN_DIVERGENT_FIXTURES_S44BBB`
(documented with the full root-cause explanation once, in one place), and
a per-test early-return carve-out in each of the 12 functions — the same
discipline `_is_entity_fixture`/`_is_entity_or_nra` already use elsewhere
in this suite for other permanent divergences, not a new pattern invented
for this. `india_only_ca_client`'s own new divergence (`form_3cb_3cd` now
correctly `required: true` once the lock-in bug above was fixed, vs
golden's stale `false`) got the more surgical treatment instead — a
single-document patch inside `test_build_documents_result_matches_golden`
rather than a whole-test skip, since every other document on that fixture
still needed to stay fully verified.

**Verification**: `dag_py` pytest 573/573 green; `run-js-dag-vs-py-dag.js`
59/59 clean (52 exact + 7 known JS-side cases — the `india_only_ca_client`
mismatch this pass found is gone). `monitor-next`: `next build` clean;
`test-adapter.mjs`/`test-shadow.mjs` at the same pre-existing 42/3 baseline
(no new failures — both remaining divergences are frozen-engine-vs-DAG,
same class already tracked, unrelated to this pass); `vitest` 5/5. Wheel
rebuilt, monitor-next assets re-synced.

**`foreign_holdco_poem_india`'s own carve-out double-checked with the same
rigor, not just asserted** — explicitly requested, since the
`india_only_ca_client` carve-out had turned out to mask a real bug on
first glance. Ran the exact same profile through all three engines
directly: JS DAG (`analyze.js`) and the Python port both compute
₹22,850,000 india business income — an EXACT match, unlike
`india_only_ca_client` where the two DAGs disagreed with each other and
that disagreement was the bug. The frozen engine alone computes
₹67,000,000. This is independently confirmed by `docs/
DAG_MIGRATION_TRACKER.md`'s own §P (written on the JS side when s.44BBB
was first added, entirely predating this session's work): "frozen engine's
total India business income is ₹6,70,00,000 vs. DAG's real ₹2,28,50,000
(s.35AD/tonnage tax never reach the frozen computation at all)" — the
identical split, confirmed from the opposite direction. Unlike the frozen
engine (never edited again, by explicit standing project design — s.44BBB
predates it and always will), there is no fix available or needed here:
the carve-out already in place is the correct, final treatment of a
genuine, permanent, doubly-confirmed divergence, not a bug hiding behind
one.

## Phase 6 detail (filings/ + reports/, ✅ DONE — 429 tests green cumulative)

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

**`reports/trace.py` + `reports/assembly.py`'s `buildTaxComputationResult`
— done** (333 tests green cumulative, 39 new). Ports report-batch2-nodes.js
(`us`/`usState` sections) and report-batch3-nodes.js (`india` section) —
the UI trace/display assembly for the Tax Computation panel.
`buildTaxComputationIndiaResult` ports BOTH the individual/HUF and entity
branches in full (india/entity_tax.py's `entityTaxResult` already existed
from Phase 2, so no carve-out was needed there). `buildTaxComputationUsResult`
ports only the resident/individual branch — the JS source's NRA/entity/trust
branches read `u.isNra`/`u.nra`/`u.trustBracketBreakdown`/`u.passthrough`,
fields this port's `usTaxResult` doesn't carry yet (same entity/NRA-routing
carve-out `test_us.py` already established in Phase 3); since those fields
are simply absent rather than `False`, the individual branch is the only one
ever reached, which is exactly the correct behavior for now.

Two real bugs caught by the new golden-diff tests (`test_reports_trace.py`),
fixed at the source: a missing `₹` prefix (same class of bug Phase 5 already
caught twice — used `core.util.format_inr()` directly instead of a
`₹`-prefixed wrapper; fixed with a local `inr()` helper matching every JS
report-batchN-nodes.js file's own local helper) and a `"2.0"` vs `"2"`
float-display bug in the Child Tax Credit trace's `numChildren` label (same
root cause as Phase 5's `"3.0" vs "3"` director-count bug — `round()` at the
one embed site fixes it).

One DELIBERATE, PERMANENT (not "not yet ported") divergence from golden,
carved out explicitly in `test_reports_trace.py` rather than silently
ignored: for an India entity/company taxpayer, the frozen engine (which
golden is generated from) has an uncorrected bug — it falls through into the
individual/HUF row builder, which reads several entity-shaped fields as
`undefined` and interpolates a literal `"₹NaN"` into the trace text. The JS
DAG's `report-batch3-nodes.js` deliberately built its own entity-specific
row set instead of reproducing that bug (documented in its own file header)
— ported here unchanged. This carve-out is permanent, unlike every other
"deferred to Phase 7" carve-out in this port.

**`filings/documents.py` — done** (385 tests green cumulative, 52 new).
Ports all four functions in `report-batch1-nodes.js` (`buildDocumentsResult`
— the 30-entry document catalog run through a trigger map — plus
`buildScopeNotesResult`/`buildReturnFormDeterminationResult`/
`buildFtcReportResult`, kept together since they live in the same JS file).

The JS source's `entityFormsResult` node is NOT re-derived — it duplicates
`core/entry.py`'s already-ported `entityResult` field-for-field
(`indiaReturnForm`/`usReturnForm`/`indiaOpt115baa`/`indiaOpt115bab`), a
duplication the JS source only carries for build-history reasons (flagged
by the Phase 6 scoping agent, confirmed by direct comparison) — reused
directly instead, avoiding ~15 lines of pointless duplicate logic.
`presumptiveLockinAgg` (the one node needing real wall-clock "now", for the
s.44AD(4) 5-year re-election lock-in) reads `ctx["monitorAsOfBoundary"]`
instead of a bare `datetime.now()`, per this port's own architecture rule.

One real bug caught by the new golden-diff tests, found while composing the
test registry rather than in `documents.py` itself: `us/findings.py`'s
`limitsRawExtra` node was missing the `lrsRemittedInr` field the JS source's
own `limitsRawExtra` carries — silently dropped when Phase 5 ported this
node (an earlier synthetic-dict unit test happened to hand-supply the
field, masking the gap). Fixed by reading `india/aggregate_india_income.py`'s
pure `_annual_slice_agg(ctx)` helper directly (not the `annualSliceAgg`
node itself, which isn't reachable from `us/findings.py`'s own build chain —
same cross-domain-read situation as that file's existing `diAggUs` leaf).

One DELIBERATE, PERMANENT divergence, carved out explicitly in
`test_filings_documents.py`: the JS DAG's document catalog is a strict
superset of the frozen engine's original 30 entries — 7 more
(`form_nj1040`, `form_8858`, `form_3520a`, `form_29b`, `form_10iea`,
`form_10ic`, `form_10id`) were added DAG-only, each with its own "no engine
equivalent" comment in the source. Golden (frozen-engine-generated) never
carries these ids — filtered out before comparing, same permanent-carve-out
discipline as `test_reports_trace.py`'s entity-branch divergence.

**`filings/assets.py` — done** (403 tests green cumulative, 18 new). Ports
`assets-nodes.js` in full: `assetsModelResult` (model.assets — Holdings/
Business tab data), `businessEntitiesResult` (flat per-entity list, reused
wholesale from already-ported india/aggregate_india_income.py + newly-ported
us self-employment/farm net-profit math), and the entity-ownership graph
(`buildEntityGraph`, docs/BUSINESS_ENTITY_ARCHITECTURE.md §6 — genuinely new,
no engine or prior-DAG equivalent). Also closes the 2-extra-findings gap
flagged earlier: `findingsAllResult` is OVERRIDDEN via a real
`NodeRegistry.override(..., reason=...)` call (the base compute is captured
via `base.get("findingsAllResult")` before overriding, structurally the same
shape as the JS source's `baseNodes.findingsAllResult.compute(d, ctx)`
call), adding `msme_disallowance_s43Bh_india`/`presumptive_lockin_active_india`
on top. `msmeDisallowanceTotalAgg` (new node, taxpayer-wide sum of the same
s.43B(h) computation `aggregate_india_income.py`'s per-entry helper already
nets in) reads `ctx["monitorAsOfBoundary"]` instead of bare `datetime.now()`,
same architecture rule `presumptiveLockinAgg` already follows.

**Two real, pre-existing boundary-node bugs found and fixed while scoping
`assets.py`'s deps, both predating Phase 6**: `india/findings.py`'s
`indianBusinessesBoundary` and `crossborder/black_money_act.py`'s
`usSecuritiesBoundary` were ported (Phase 4/5) from `in1-nodes.js`/
`xb7-nodes.js`'s own v1-era stub definitions (reading `ctx["model"]...`,
always `[]`/`None` in this port's real `{router, india, us}` ctx shape) —
but those two source files are **dead build history**, never required by the
live `graph.js` chain (confirmed: only standalone `run-in1.js`/`run-batch2.js`
runners `require()` them). The live definitions are `agg10-nodes.js`'s own
closures, whose header states outright: *"the four original finding graphs'
v1-era boundaries ... all 16 closed here against the now-existing in-graph
equivalents."* Both of these two specifically need nothing outside data
already available within their own file's existing build chain
(`indianBusinessesBoundary` only needs `annualSliceAgg`, already reachable
via `india_full.build()`; `usSecuritiesBoundary` needs nothing but
`ctx["us"]` directly) — so both are closed for real now rather than deferred.
Six sibling IN-1 boundary nodes in `india/findings.py`
(`assessedTaxInrBoundary`, `hasValidPresumptiveEntryBoundary`,
`hasRegularBooksEntryBoundary`, `hasPartnerFirmIncomeBoundary`,
`businessInrBoundaryIn1`, `speculativeIncomeInrBoundaryIn1`) had the exact
same dead-source-file problem and were closed the same way, same commit —
all six resolve entirely within the india domain's own already-built chain
(`businessComputation`/`speculativeIncomeInrAgg`/`totalTaxInrCombined`, all
present by the time `india/findings.py`'s `build()` runs). The remaining
`*Boundary` nodes in `us1_penalty_2210.py`/`black_money_act.py`
(`accountsBoundary`/`usSourceTotalUsdBoundary`) are NOT similarly closed —
those genuinely need cross-domain state (`bankAccountsRaw`,
`aggregateUsIncomeResult`) unavailable until Phase 7's
`build_full_registry()`, a real architectural deferral, not an oversight.
None of the 12 fixtures exercise non-empty `business_entries`/
`financial_holdings` through these specific paths in a way golden would
have caught the bug — confirmed safe via the full suite before and after
(no regressions), same "real bug masked by fixture coverage" pattern Phase 6
already caught once with `limitsRawExtra`.

**A third real, pre-existing bug found the same way, in `us/aggregate_us_income.py`
(Phase 3)**: `farming_schedule_f[]` net profit was read via a phantom
`net_profit_usd` field the live Layer 1 US form never actually writes (only
`itemized_income{}` line items + `expenses_usd`) — so a real farmer's
Schedule F profit silently contributed `$0` to business income, Schedule SE
earnings, AND the QBI base, exactly the bug `aggregateusincome-nodes.js`'s
own header documents having fixed upstream. Fixed by porting
`computeFarmGrossIncomeUsd`/`computeFarmNetProfitUsd`/`farmNetProfitUsd`
alongside the sibling self-employment functions, and renaming
`selfEmploymentDepreciationPlan` → `usBusinessDepreciationPlan` (matching
the JS rename) to combine self-employment AND farm assets into one
taxpayer-wide §179 aggregation pool, keyed `"se{idx}"`/`"farm{idx}"` — real
law caps/phases out §179 across all of a taxpayer's directly-owned active
trades/businesses together, not per-array. Zero of the 12 fixtures carry
`farming_schedule_f` data, so this was silent until traced by hand while
porting `filings/assets.py`'s farm income trace (which needed the combined
depreciation plan); full suite green before and after, confirming no
fixture-visible regression either way.

**`reports/trace.py`'s `buildWithholdingSummaryResult` — done, Phase 6 complete**
(429 tests green cumulative, 26 new). Ports `report-batch4-nodes.js` in full:
the India treaty-gap rows (s.207 dividend/royalty/FTS elections + NRO
interest, gated `!isEntityTaxpayer` same as the engine), the aggregate
TDS/TCS/property-TDS rows, the LRS-TCS/VDA-s.194S/lottery-s.194B estimate
rows, and the US FDAP/FIRPTA/W-2-withholding rows. Two new self-contained
leaves (`withholdingDetailIndiaRaw`/`withholdingDetailUsRaw`) plus one more
real `agg10-nodes.js` closure (`vdaSaleConsiderationInrBoundary`, reading
`capitalGainsComputation` directly) — confirmed via the same require-chain
tracing as the two boundary fixes above that `agg10-nodes.js`'s version (not
`report-batch4-nodes.js`'s own local `ctx.model` stub, dead in the live
graph since `agg10-nodes.js` is required AFTER it and silently wins) is what
actually reaches production.

**Two more real, pre-existing "additive extension never landed" bugs found
finishing this node** (both flagged as needed in `report-batch4-nodes.js`'s
own file header, but the referenced extensions were never actually made to
the Python port when Phase 3/5 shipped these files):
- `crossborder/findings.py`'s `taxesPaidUsResult` only ever returned `total`
  — missing the `withholding`/`priorYearTotalTaxUsd` fields the real
  `findings-batch5-nodes.js` node carries (needed here for the W-2-aggregate
  fallback row, which must use withholding alone, not the combined
  withholding+estimated `total`). Fixed as a real `_taxes_paid_us_result()`
  function, additive only (`total`'s value is unchanged) — confirmed via the
  full suite before/after.
- `us/findings.py`'s `nraFdapDetail` was missing `fdapTaxUsd`/`gapUsd`/
  `claimedRatePctClamped`/`incomeType` — present in the real
  `findings-batch4-nodes.js` node but silently dropped when first ported.
  `crossborder/findings.py` carries its own independent, ALSO-incomplete
  copy of this node (registered locally inside its own `build()`, not
  shared with `us/findings.py`'s `NODES` dict) with just enough fields
  (`gapUsd`) for its own narrow use in the `withholding_documentation_gap`
  finding — left as-is, a known minor duplication, not a functional gap for
  that finding's own purposes, out of scope to consolidate right now.

`docs/BUSINESS_ENTITY_ARCHITECTURE.md`'s `usEntityKind` (needed for
`buildWithholdingSummaryResult`'s NRA-routing recompute) was checked against
the same "is this actually closable now" question the boundary-node bugs
above raised — verdict: NO, leave it deferred. Unlike
`indianBusinessesBoundary`/`usSecuritiesBoundary`, `usEntityKind` isn't a
dead-source-file mistake — `us/ustax.py`'s own docstring already correctly
scopes it as a Phase-7 `ustax_full.py` task, paired with `baseYearUs` (which
genuinely can't close without `metaResult`). Carved out the same way
`test_us.py`/`test_crossborder.py` already carve out every other
`usEntityKind`-dependent path.

Phase 6 is now fully done — every file the plan's package layout listed
under `filings/`/`reports/` except `filings/monitoring.py` and
`summaryResult`/`analyzeResult`, both correctly deferred to Phase 7 (see
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
