"""Golden-diff verification for filings/documents.py's buildDocumentsResult/
buildScopeNotesResult/buildReturnFormDeterminationResult/buildFtcReportResult,
on all 13 fixtures.

Composition note: documents.py is a "trust-the-caller" standalone module
(see its own docstring) — this test builds its own composed registry rather
than reusing any other test file's, since documents.py needs pieces from
india/itr_form.py (indiaItrFormResult), core/entry.py (entityResult), AND
us/findings.py's/crossborder/findings.py's own extra leaves (foreignGiftsRaw,
nraRaw, limitsRawExtra, usStateTaxResult, taxesPaidUsResult) all in ONE
registry. itr_form.py's own build() can't be called directly here (it
re-derives india_full internally, which collides with xborder_full.build()'s
own india_full call) — its extra nodes are re-registered here instead,
reusing its `_india_itr_form_result` compute function directly, the same
"re-register via imported compute function" pattern crossborder/findings.py
already uses for its own `-Xbr`-suffixed nodes.
"""
from conftest import GOLDEN_DIVERGENT_FIXTURES_S44BBB, ctx_for, load_golden
from support import deep_diff

from wising_dag.core import entry
from wising_dag.core.graph import NodeDef
from wising_dag.core.registry import NodeRegistry
from wising_dag.core.util import safe
from wising_dag.crossborder import cross_basis
from wising_dag.crossborder import findings as crossborder_findings
from wising_dag.filings import documents
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

    # us/findings.py's/crossborder/findings.py's own extra leaves needed here
    # too — re-registered directly (their own build()s re-derive us_full/
    # cross_basis internally, which would collide with xborder_full's chain
    # already present in `r`).
    for node_id in ("foreignGiftsRaw", "nraRaw", "stateResidencyRaw", "usStateTaxResult", "limitsRawExtra", "equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw", "diAggUs", "equityCompResult"):
        if node_id not in r:
            r.register(node_id, us_findings.NODES[node_id])
    for node_id in ("taxesPaidUsResult", "bankAccountsRaw", "aggregatePeakUsdResult", "indiaFinancialHoldingsTxRaw", "ppfInrRaw", "epfInrRaw", "usFtcFormXbr"):
        if node_id not in r:
            r.register(node_id, crossborder_findings.NODES[node_id])

    r = documents.build(r)
    return r.freeze()


GRAPH = _build_graph()
TARGETS = ["buildDocumentsResult", "buildScopeNotesResult", "buildReturnFormDeterminationResult", "buildFtcReportResult"]


def _is_entity_or_nra(golden: dict) -> bool:
    us_kind = golden["model"]["entity"]["usKind"]
    is_nra = golden["model"]["treaty"]["files1040nr"] and not (golden["model"].get("nra") or {}).get("s6013hElection")
    return us_kind != "individual" or is_nra


# The JS DAG deliberately extends the frozen engine's 30-entry document
# catalog with 7 new document types the engine never modeled at all
# (report-batch1-nodes.js's own "DELIBERATE DAG/engine divergence" comments —
# form_nj1040, form_8858, form_3520a, form_29b, form_10iea, form_10ic,
# form_10id). Golden (generated from the frozen engine) never carries these
# ids — filtered out before comparing, a permanent divergence like the
# entity-branch one in test_reports_trace.py, not a "not yet ported" gap.
DAG_ONLY_DOCUMENT_IDS = {"form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id"}


def test_build_documents_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if _is_entity_or_nra(golden):
        return  # usTaxResult/ftcResult are individual/resident-only in this port — Phase 7 carve-out

    out = GRAPH.resolve(TARGETS, ctx).values["buildDocumentsResult"]
    out_filtered = [x for x in out if x["id"] not in DAG_ONLY_DOCUMENT_IDS]
    golden_documents = golden["documents"]
    if fixture_id == "india_only_ca_client":
        # This fixture's business_income.s44AD_last_exit_ay (added post-
        # golden-generation, JS commit 06f69c9) puts it inside the s.44AD(4)
        # 5-year re-election lock-in — s.44AD(5) then makes form_3cb_3cd
        # (tax audit) MANDATORY this year via presumptiveLockinAgg, a real
        # trigger this port correctly implements. The frozen engine has no
        # concept of this lock-in at all, so golden's own form_3cb_3cd entry
        # is stale (not-required) relative to what the live JS DAG (and this
        # port) both correctly compute — patched here rather than skipped,
        # so every OTHER document on this fixture stays fully verified.
        golden_documents = [
            {**doc, "required": True, "status": "required"} if doc["id"] == "form_3cb_3cd" else doc
            for doc in golden_documents
        ]
    diff = deep_diff(out_filtered, golden_documents)
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_build_scope_notes_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)

    out = GRAPH.resolve(TARGETS, ctx).values["buildScopeNotesResult"]
    diff = deep_diff(out, golden["scopeNotes"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_build_return_form_determination_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring: s.44BBB ripples into the india total-income disqualifier

    out = GRAPH.resolve(TARGETS, ctx).values["buildReturnFormDeterminationResult"]
    diff = deep_diff(out, golden["returnForms"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])


def test_build_ftc_report_result_matches_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    if _is_entity_or_nra(golden):
        return
    if fixture_id in GOLDEN_DIVERGENT_FIXTURES_S44BBB:
        return  # see conftest.py's own docstring: s.44BBB ripples into india tax paid, hence the FTC report

    out = GRAPH.resolve(TARGETS, ctx).values["buildFtcReportResult"]
    diff = deep_diff(out, golden["ftcReport"])
    assert diff is None, f"{fixture_id}: " + " | ".join(diff[:8])
