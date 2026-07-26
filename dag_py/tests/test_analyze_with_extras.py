"""Verifies `wising_dag.analyze.analyze_with_extras()` — the monitor-next-
adapter-only superset of `analyze()` that adds `checksRegistry`/
`calendarAmounts` (CL-1/CL-2, no engine equivalent — mirrors `lib/
dag-adapter.js`'s own `analyzeDag()`, which resolves `checksRegistryResult`/
`calendarAmountsResult` on top of `analyze.js`'s real output the exact same
way). Not re-verifying JS parity here — that's `prototypes/graph-pilot/
run-js-dag-vs-py-dag.js`'s own job (`npm run compare:js-vs-py-dag`), and it
already covers `checksRegistry`/`calendarAmounts` across all 13 fixtures +
the 40-case fuzz corpus. This file locks in the CONTRACT instead: the
result is exactly `analyze()`'s own dict plus those two extra keys, and
each extra key matches the registry's own `checksRegistryResult`/
`calendarAmountsResult` node value exactly (no reshaping in between).
"""
from conftest import ctx_for

from wising_dag import analyze
from wising_dag.analyze import _registry, analyze_with_extras


def test_analyze_with_extras_is_analyze_plus_two_keys(fixture_id):
    ctx = ctx_for(fixture_id)
    opts = {"router": ctx.get("router"), "india": ctx.get("india"), "us": ctx.get("us"), "monitorAsOf": "2026-07-25T12:00:00.000Z"}

    base = analyze(opts)
    extended = analyze_with_extras(opts)

    assert set(extended.keys()) == set(base.keys()) | {"checksRegistry", "calendarAmounts"}
    for k in base:
        assert extended[k] == base[k], f"{fixture_id}: analyze_with_extras()[{k!r}] diverged from analyze()[{k!r}]"


def test_analyze_with_extras_matches_the_underlying_nodes_directly(fixture_id):
    ctx = ctx_for(fixture_id)
    opts = {"router": ctx.get("router"), "india": ctx.get("india"), "us": ctx.get("us"), "monitorAsOf": "2026-07-25T12:00:00.000Z"}

    extended = analyze_with_extras(opts)
    node_ctx = {"router": opts["router"], "india": opts["india"], "us": opts["us"], "monitorAsOfBoundary": opts["monitorAsOf"]}
    raw = _registry().resolve(["checksRegistryResult", "calendarAmountsResult"], node_ctx).values

    assert extended["checksRegistry"] == raw["checksRegistryResult"]
    assert extended["calendarAmounts"] == raw["calendarAmountsResult"]
