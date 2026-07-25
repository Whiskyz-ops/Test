"""Golden-diff verification for reports/trace.py's buildTaxComputation
sub-objects (india/us/usState), on all 13 fixtures.

Carve-outs:
  - us/usState: same entity/NRA + worldwide carve-outs test_us.py already
    established for usTaxResult itself (usTaxResult is the individual/
    resident-only node; worldwideUs isn't wired to real residency in this
    isolated test registry — same reasons, not new ones).
  - india, entity taxpayers only (foreign_holdco_poem_india, india_pvt_ltd,
    us_ccorp_indian_sub): a DELIBERATE, PERMANENT DAG/engine divergence, not
    a "not yet ported" gap — report-batch3-nodes.js's own header explains
    it: the frozen engine (which golden is generated from) falls through
    into the individual/HUF row builder for an entity taxpayer, producing a
    literal "₹NaN" in the trace text (a genuine, uncorrected frozen-engine
    bug). The JS DAG deliberately built its own entity-specific row set
    instead — ported here unchanged. This carve-out will NEVER close by
    porting more of the graph; it's a documented, permanent choice to not
    reproduce the frozen engine's bug.
"""
from conftest import ctx_for, load_golden
from support import deep_diff

from wising_dag.core.registry import NodeRegistry
from wising_dag.india import itr_form
from wising_dag.reports import trace
from wising_dag.us import findings as us_findings
from wising_dag.us import us_full

def _build_graph():
    r = itr_form.build(NodeRegistry())
    r = us_full.build(r)
    r.register("stateResidencyRaw", us_findings.NODES["stateResidencyRaw"])
    r.register("usStateTaxResult", us_findings.NODES["usStateTaxResult"])
    r = trace.build(r)
    return r.freeze()


GRAPH = _build_graph()

TARGETS = ["buildTaxComputationIndiaResult", "buildTaxComputationUsResult", "buildTaxComputationUsStateResult"]


def _is_entity_or_nra(golden: dict) -> bool:
    us_kind = golden["model"]["entity"]["usKind"]
    is_nra = golden["model"]["treaty"]["files1040nr"] and not (golden["model"].get("nra") or {}).get("s6013hElection")
    return us_kind != "individual" or is_nra


def test_build_tax_computation_india_result_matches_golden_for_individual_huf(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    if golden["model"]["entity"].get("isEntity") or golden["computed"]["indiaTax"].get("isEntity"):
        return  # deliberate, permanent divergence — see module docstring

    out = GRAPH.resolve(TARGETS, ctx).values["buildTaxComputationIndiaResult"]
    diff = deep_diff(out, golden["taxComputation"]["india"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:6])


def test_build_tax_computation_us_result_matches_golden_for_in_scope_profiles(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    if _is_entity_or_nra(golden):
        return
    if bool(golden["computed"]["usTax"].get("worldwide")):
        return  # worldwideUs not wired to real residency in this isolated registry

    out = GRAPH.resolve(TARGETS, ctx).values["buildTaxComputationUsResult"]
    diff = deep_diff(out, golden["taxComputation"]["us"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:6])


def test_build_tax_computation_us_state_result_matches_golden_for_in_scope_profiles(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    if _is_entity_or_nra(golden):
        return
    if bool(golden["computed"]["usTax"].get("worldwide")):
        return

    out = GRAPH.resolve(TARGETS, ctx).values["buildTaxComputationUsStateResult"]
    diff = deep_diff(out, golden["taxComputation"]["usState"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:6])
