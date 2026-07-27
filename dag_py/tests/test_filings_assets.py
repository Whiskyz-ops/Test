"""Golden-diff verification for filings/assets.py's assetsModelResult
(model.assets), plus synthetic-dep-bag unit tests for the two pieces that
can't be exercised through a composed registry yet: msmeDisallowanceTotalAgg
and the findingsAllResult override (both need `bizMsmePayablesAgg` combined
with findingsIndiaResult/findingsUsResult/findingsCrossborderResult in ONE
registry — the same india+us+crossborder composition Phase 5/6 defer to
Phase 7's build_full_registry(), see reports/assembly.py's own docstring).

Composition note: same "trust-the-caller" standalone-registry approach as
test_filings_documents.py — reused and extended here, since assets.py needs
everything documents.py needs (indianMutualFundsResult, presumptiveLockinAgg)
PLUS usForeignCorpsRaw/usOwns10PctForeignCorpRaw/usSecuritiesBoundary/uiAgg/
usBusinessDepreciationPlan/bizEntriesAgg/bizAssetBlocksAgg/bizMsmePayablesAgg/
presumptiveEligibilityAgg/partnerFirmsAgg/indiaEntityTypeRaw/indianBusinesses
Boundary/totalIncomeInrV3/taxRegime. `assets.build()` also OVERRIDES
findingsAllResult (must already exist to satisfy NodeRegistry.override()'s
precondition) — a trivial stub is registered here purely to satisfy that
structural precondition; the override's real behavior is verified separately
below via a synthetic-dep-bag test, not through this registry.
"""
from conftest import GOLDEN_DIVERGENT_FIXTURES_S44BBB, ctx_for, load_golden
from support import deep_diff

from wising_dag.core import entry
from wising_dag.core.graph import NodeDef
from wising_dag.core.registry import NodeRegistry
from wising_dag.core.util import safe
from wising_dag.crossborder import cross_basis
from wising_dag.crossborder import findings as crossborder_findings
from wising_dag.filings import assets, documents
from wising_dag.india.itr_form import _india_itr_form_result
from wising_dag.us import findings as us_findings


def _build_graph():
    r = cross_basis.build(NodeRegistry())

    r.register("grossTotalIncomeInrV3", NodeDef(
        deps=("normalSlabInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
              "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"),
        compute=lambda d, ctx: (
            d["normalSlabInr"] + d["stcgTaxableInr"] + d["ltcgTaxableInr"] + d["ltcg197TaxableInr"] + d["specialRate115bbInr"] + d["vdaGainInrBoundary"] +
            d["chapterXiiaInvestmentIncomeInrBoundary"] + (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0) +
            (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0)
        ),
    ))
    r.register("grossTotalIncomeInrCombined", NodeDef(deps=("isEntityTaxpayer", "grossTotalIncomeInrV3", "entityTaxableInrBoundary"), compute=lambda d, ctx: d["entityTaxableInrBoundary"] if d["isEntityTaxpayer"] else d["grossTotalIncomeInrV3"]))
    r.register("indiaForeignIncomeDeclaredRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "foreign_income.has_foreign_income", None)))
    r.register("indiaForeignAssetsDeclaredRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "foreign_assets.has_foreign_assets", None)))
    r.register("indiaHasBroughtForwardLossesRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "carry_forward_losses.has_brought_forward_losses", None)))
    r.register("indiaIsCompanyDirectorRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.is_company_director", False) is True))
    r.register("indiaIsSection8Raw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.is_section_8", False) is True))
    r.register("indiaLayer1ItrRaw", NodeDef(deps=(), compute=lambda d, ctx: (lambda v: None if v == "Unknown" else v)(safe(ctx.get("india"), "itr_recommendation.form", None))))
    r.register("indiaReturnFormExplanationRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "itr_recommendation.explanation", None)))
    r.register("indiaItrFormResult", NodeDef(
        deps=("indiaEntityTypeRaw", "indiaResidencyStatusRawAgg", "grossTotalIncomeInrCombined",
              "stcgInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "stcgSlabInrBoundary",
              "indiaForeignIncomeDeclaredRaw", "indiaForeignAssetsDeclaredRaw",
              "vdaGainInrBoundary", "capitalGainsComputation", "totalIndiaIncomeInr",
              "agriculturalIncomeInrAgg", "specialRate115bbInr", "indiaHasBroughtForwardLossesRaw",
              "speculativeIncomeInrAgg", "fnoIncomeInrAgg", "indiaIsCompanyDirectorRaw",
              "businessComputation", "indiaIncomeModelResult", "indiaIsSection8Raw",
              "indiaLayer1ItrRaw", "indiaReturnFormExplanationRaw"),
        compute=_india_itr_form_result,
    ))

    r = entry.build(r)

    for node_id in ("foreignGiftsRaw", "nraRaw", "stateResidencyRaw", "usStateTaxResult", "limitsRawExtra", "equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw", "equityCompResult"):
        if node_id not in r:
            r.register(node_id, us_findings.NODES[node_id])
    for node_id in ("taxesPaidUsResult", "bankAccountsRaw", "aggregatePeakUsdResult", "indiaFinancialHoldingsTxRaw", "ppfInrRaw", "epfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg", "usFtcFormXbr"):
        if node_id not in r:
            r.register(node_id, crossborder_findings.NODES[node_id])

    r = documents.build(r)

    # assets.py-only additions not already reachable from the chain above.
    r.register("usSecuritiesBoundary", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "financial_holdings", []) or []))
    r.register("indianBusinessesBoundary", NodeDef(
        deps=("annualSliceAgg",), compute=lambda d, ctx: safe(d["annualSliceAgg"].get("domestic_income") or {}, "business_income.business_entries", []),
    ))
    # Trivial stub purely to satisfy NodeRegistry.override()'s "must already
    # exist" precondition inside assets.build() — the real findingsAllResult
    # composition (india+us+crossborder findings.py together) is a Phase 7
    # task; the override's real behavior is verified separately below via a
    # synthetic-dep-bag test, not exercised through this registry at all.
    r.register("findingsAllResult", NodeDef(deps=(), compute=lambda d, ctx: []))

    r = assets.build(r)
    return r.freeze()


GRAPH = _build_graph()


def _is_entity_or_nra(golden: dict) -> bool:
    us_kind = golden["model"]["entity"]["usKind"]
    is_nra = golden["model"]["treaty"]["files1040nr"] and not (golden["model"].get("nra") or {}).get("s6013hElection")
    return us_kind != "individual" or is_nra


def test_assets_model_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if _is_entity_or_nra(golden):
        return  # usTaxResult-derived pieces (usBusinessDepreciationPlan's SE/K-1 flows) are individual/resident-only in this port — Phase 7 carve-out
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring: s.44BBB ripples into assetsModelResult's india income figures

    out = GRAPH.resolve(["assetsModelResult"], ctx).values["assetsModelResult"]
    golden_assets = dict(golden["model"]["assets"])
    # entityGraph is genuinely new (docs/BUSINESS_ENTITY_ARCHITECTURE.md §6) —
    # no engine equivalent, so golden (generated from the frozen engine) never
    # carries it (always null). Permanent divergence, not a coverage gap —
    # sanity-checked separately below instead of golden-diffed.
    out_without_entity_graph = {k: v for k, v in out.items() if k != "entityGraph"}
    golden_assets.pop("entityGraph", None)
    diff = deep_diff(out_without_entity_graph, golden_assets)
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])

    graph = out["entityGraph"]
    assert isinstance(graph["entities"], list) and len(graph["entities"]) >= 1
    assert graph["entities"][0]["id"] in ("root", "root_in", "root_us")
    for e in graph["edges"]:
        assert e["from"] and e["to"] and "trace" in e


def _finding(id_, severity="warning", amount_usd=0):
    return {"id": id_, "severity": severity, "category": "credit", "title": "t", "detail": "d", "recommendation": "r", "amountUsd": amount_usd, "refs": []}


def test_msme_disallowance_total_agg_sums_overdue_invoices_only():
    ctx = {"monitorAsOfBoundary": "2026-07-25T00:00:00+00:00"}
    d = {
        "bizMsmePayablesAgg": [
            {"unit_biz_idx": 0, "amount_inr": 100000, "invoice_date": "2026-01-01", "has_written_agreement": False},  # overdue (15-day window, no payment_date -> today)
            {"unit_biz_idx": 0, "amount_inr": 50000, "invoice_date": "2026-07-20", "has_written_agreement": True},  # not yet overdue (45-day window)
            {"unit_biz_idx": 1, "amount_inr": 0, "invoice_date": "2026-01-01", "has_written_agreement": False},  # zero amount, skipped
        ],
    }
    out = assets.NODES["msmeDisallowanceTotalAgg"].compute(d, ctx)
    assert out == {"totalInr": 100000, "overdueCount": 1}


def test_msme_disallowance_total_agg_empty_when_nothing_overdue():
    ctx = {"monitorAsOfBoundary": "2026-07-25T00:00:00+00:00"}
    assert assets.NODES["msmeDisallowanceTotalAgg"].compute({"bizMsmePayablesAgg": []}, ctx) == {"totalInr": 0.0, "overdueCount": 0}


def test_findings_all_result_override_adds_msme_finding():
    ctx = {"monitorAsOfBoundary": "2026-07-25T00:00:00+00:00"}
    d = {
        "msmeDisallowanceTotalAgg": {"totalInr": 100000, "overdueCount": 1},
        "presumptiveLockinAgg": {"lockInActive": False, "yearsRemaining": 0, "exitYear": None},
        "totalIncomeInrV3": 0, "taxRegime": "NEW",
        "hasUsScope": False, "electiveDeferralExcessUsd": 0, "electiveDeferralAggregateUsd": 0, "electiveDeferralLimitUsd": 24500,
        "iraContributionExcessUsd": 0, "iraContributionAggregateUsd": 0, "iraContributionLimitUsd": 7500,
        "retirementAccountsRaw": {}, "rmdRequired": False, "ageAtYearEndUs": None,
        "equityCompRaw": {},
    }
    out = assets._findings_all_result_override(d, ctx, lambda d, ctx: [_finding("pan_not_linked_aadhaar")])
    ids = [f["id"] for f in out]
    assert "msme_disallowance_s43Bh_india" in ids
    assert "pan_not_linked_aadhaar" in ids


def test_findings_all_result_override_adds_lockin_finding_with_mandatory_audit():
    ctx = {"monitorAsOfBoundary": "2026-07-25T00:00:00+00:00"}
    d = {
        "msmeDisallowanceTotalAgg": {"totalInr": 0, "overdueCount": 0},
        "presumptiveLockinAgg": {"lockInActive": True, "yearsRemaining": 2, "exitYear": 2023, "currentAyStart": 2026},
        "totalIncomeInrV3": 800000, "taxRegime": "NEW",
        "hasUsScope": False, "electiveDeferralExcessUsd": 0, "electiveDeferralAggregateUsd": 0, "electiveDeferralLimitUsd": 24500,
        "iraContributionExcessUsd": 0, "iraContributionAggregateUsd": 0, "iraContributionLimitUsd": 7500,
        "retirementAccountsRaw": {}, "rmdRequired": False, "ageAtYearEndUs": None,
        "equityCompRaw": {},
    }
    out = assets._findings_all_result_override(d, ctx, lambda d, ctx: [])
    lockin_finding = next(f for f in out if f["id"] == "presumptive_lockin_active_india")
    assert lockin_finding["severity"] == "critical"
    assert "mandatory" in lockin_finding["detail"].lower()


def test_findings_all_result_override_noop_when_nothing_triggers():
    ctx = {"monitorAsOfBoundary": "2026-07-25T00:00:00+00:00"}
    d = {
        "msmeDisallowanceTotalAgg": {"totalInr": 0, "overdueCount": 0},
        "presumptiveLockinAgg": {"lockInActive": False, "yearsRemaining": 0, "exitYear": None},
        "totalIncomeInrV3": 0, "taxRegime": "NEW",
        "hasUsScope": False, "electiveDeferralExcessUsd": 0, "electiveDeferralAggregateUsd": 0, "electiveDeferralLimitUsd": 24500,
        "iraContributionExcessUsd": 0, "iraContributionAggregateUsd": 0, "iraContributionLimitUsd": 7500,
        "retirementAccountsRaw": {}, "rmdRequired": False, "ageAtYearEndUs": None,
        "equityCompRaw": {},
    }
    base = [_finding("pan_not_linked_aadhaar")]
    out = assets._findings_all_result_override(d, ctx, lambda d, ctx: base)
    assert out == base
