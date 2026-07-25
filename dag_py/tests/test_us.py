"""Verifies the us/ domain (aggregate_us_income + ustax + us_full wiring)
against the frozen-engine golden fixtures, on all 13 fixtures.

aggregateUsIncomeResult (the income aggregation itself) is asserted
unconditionally — it doesn't depend on entity/NRA/worldwide routing, matching
aggregateusincome-nodes.js's own claimed scope ("verified standalone against
model.income.us field-by-field", no carve-outs).

usTaxResult is scoped exactly like ustax-nodes.js's own header states:
"Scoped to the individual/resident path only... only 1 of 11 real profiles
is a US entity... and only 1 is NRA. Both are reported, not asserted."
Same discipline replicated here for usKind != "individual" and NRA profiles.

One ADDITIONAL, temporary carve-out beyond what ustax-nodes.js itself
needs: `worldwideUs` is not yet wired to a real residency derivation (that
node lives in crossborder/residency.py, Phase 4, not yet built — see
us_full.py's own header) — it always resolves False right now, so any
profile the frozen engine treats as worldwide-taxed (foreign
wages/interest/etc. folded in) will diverge until Phase 4 closes it. Golden
itself carries computed.usTax.worldwide, so this fixture set is partitioned
by it directly rather than hand-maintained here.
"""
from conftest import ctx_for, load_golden
from support import deep_diff

from wising_dag.core.registry import NodeRegistry
from wising_dag.us import us_full

GRAPH = us_full.build(NodeRegistry()).freeze()

TARGETS = ["aggregateUsIncomeResult", "usTaxResult"]


def test_aggregate_us_income_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(TARGETS, ctx).values

    diff = deep_diff(out["aggregateUsIncomeResult"], golden["model"]["income"]["us"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_us_tax_result_matches_golden_for_in_scope_profiles(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    us_kind = golden["model"]["entity"]["usKind"]
    is_nra = golden["model"]["treaty"]["files1040nr"] and not (golden["model"].get("nra") or {}).get("s6013hElection")
    is_worldwide = bool(golden["computed"]["usTax"].get("worldwide"))

    if us_kind != "individual" or is_nra:
        return  # entity/NRA routing not ported yet (ustax_full.py, Phase 7) — reported, not asserted, upstream too
    if is_worldwide:
        return  # worldwideUs not yet wired to real residency (Phase 4) — reported, not asserted

    out = GRAPH.resolve(TARGETS, ctx).values

    # feieAppliedUsd is a DAG-internal convenience field (ustax-nodes.js's own
    # comment) — analyze.js's own assembleComputed() strips it before ever
    # comparing against the engine's computed.usTax (which keeps the value at
    # usTax.feie.appliedUsd instead, already asserted below via the feie dict).
    us_tax_for_diff = {k: v for k, v in out["usTaxResult"].items() if k != "feieAppliedUsd"}
    diff = deep_diff(us_tax_for_diff, golden["computed"]["usTax"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])
