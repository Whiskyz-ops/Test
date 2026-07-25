"""Verifies core/entry.py's leaf nodes (entityResult, companyResidencyResult,
treatyModelResult) against the frozen-engine golden fixtures, on all 12 real
profiles + sample.

indiaIsAop/indiaIsTrust are a DELIBERATE DAG-only addition (see
agg10-nodes.js's own header comment, docs/GAP_TRACKER.md section H.6) — the
frozen engine's model.entity never carries them, so they're excluded from
the golden diff and checked separately for internal consistency instead,
mirroring the JS run-*.js harnesses' DAG_ONLY_* exclusion pattern.
"""
from conftest import ctx_for, load_golden
from support import deep_diff

from wising_dag.core.entry import build
from wising_dag.core.registry import NodeRegistry

GRAPH = build(NodeRegistry()).freeze()

DAG_ONLY_ENTITY_FIELDS = ("indiaIsAop", "indiaIsTrust")


def test_entity_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(["entityResult"], ctx).values["entityResult"]

    out_for_diff = {k: v for k, v in out.items() if k not in DAG_ONLY_ENTITY_FIELDS}
    diff = deep_diff(out_for_diff, golden["model"]["entity"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:5])


def test_entity_result_dag_only_fields_are_internally_consistent(fixture_id):
    ctx = ctx_for(fixture_id)
    out = GRAPH.resolve(["entityResult"], ctx).values["entityResult"]

    assert out["indiaIsAop"] == (out["indiaKind"] == "aop")
    assert out["indiaIsTrust"] == (out["indiaKind"] == "trust")


def test_company_residency_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(["companyResidencyResult"], ctx).values["companyResidencyResult"]

    diff = deep_diff(out, golden["model"]["companyResidency"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:5])


def test_treaty_model_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(["treatyModelResult"], ctx).values["treatyModelResult"]

    diff = deep_diff(out, golden["model"]["treaty"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:5])
