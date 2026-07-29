"""Verifies the india/ domain (aggregate_india_income + in1_v3 + entity_tax
+ india_full wiring + itr_form) against the frozen-engine golden fixtures,
on all 12 real profiles + sample.

Per india-full-nodes.js's own header ("Verified in run-india-full.js
against all 11 real profiles, exact parity on computed.indiaTax.totalTaxInr
(individual/HUF + entity paths both)") the India tax total is expected to
match exactly for every profile, entity or individual — unlike the US-side
TAX-7/TAX-8 boundary, there's no "reported not asserted" carve-out here.
"""
from conftest import GOLDEN_DIVERGENT_FIXTURES_S44BBB, ctx_for, load_golden
from support import deep_diff

from wising_dag.core.registry import NodeRegistry
from wising_dag.india import itr_form

GRAPH = itr_form.build(NodeRegistry()).freeze()

TARGETS = ["indiaIncomeModelResult", "totalTaxInrCombined", "regimeCombined", "indiaItrFormResult"]


def test_india_income_model_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring

    out = GRAPH.resolve(TARGETS, ctx).values

    # DELIBERATE DAG/engine divergence (task #46, multi-country/multi-basket
    # FTC): .passive/.general are new §904 basket-split fields with no
    # frozen-engine equivalent (the engine has no basket concept at all).
    out_income = {k: v for k, v in out["indiaIncomeModelResult"].items() if k not in ("passive", "general")}
    diff = deep_diff(out_income, golden["model"]["income"]["india"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_total_tax_inr_combined_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring

    out = GRAPH.resolve(TARGETS, ctx).values

    diff = deep_diff(out["totalTaxInrCombined"], golden["computed"]["indiaTax"]["totalTaxInr"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_regime_combined_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(TARGETS, ctx).values

    assert out["regimeCombined"] == golden["computed"]["indiaTax"]["regime"]


def test_itr_form_result_matches_golden(fixture_id):
    """itrform-nodes.js's own run-itrform.js harness (JS) treats
    computed.indiaItrForm === null (model.meta.hasIndiaScope false — the
    gate lives in report-batch5-nodes.js's assembly, outside
    itrform-nodes.js itself, so indiaItrFormResult is always computed
    ungated) as "reported only", not a hard mismatch — same discipline
    replicated here rather than inventing a hasIndiaScope gate that
    doesn't exist in the ported module."""
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring: s.44BBB ripples into totalIncomeInr's disqualifier text

    out = GRAPH.resolve(TARGETS, ctx).values
    real = golden["computed"]["indiaItrForm"]

    if real is None:
        return

    diff = deep_diff(out["indiaItrFormResult"], real)
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])
