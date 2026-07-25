"""
Genuinely zero-dependency entry nodes — the subset of
prototypes/graph-pilot/agg10-nodes.js's node overrides that read only
`ctx` (router/india/us), with no dependency on any other domain's
computation results.

NOTE — scoping correction from the original migration plan: agg10-nodes.js
also defines identityResult/metaResult/residencyModelSliceResult (which
depend on hasUsScopeBoundaryFtc/hasIndiaScopeXbr/indiaDomesticStatusDerived,
defined in xborder-full-nodes.js/findings-nodes.js) and a large glue/override
layer (headlineResult, summaryResult, analyzeResult, and ~15 "boundary"
redefinitions) that depend on deep india/us/crossborder/filings results.
None of that is foundational despite living in the same JS file — it is
ported later, in analyze.py, once those domains exist. Only entityResult,
companyResidencyResult, and treatyModelResult are true leaves and live here.

Ported from agg10-nodes.js lines 87-231 (entityResult, companyResidencyResult,
treatyModelResult only).
"""
from __future__ import annotations

from .graph import NodeDef
from .util import num, safe


def _compute_entity_result(d, ctx):
    india = ctx.get("india")
    us = ctx.get("us")

    india_entity_kind = safe(india, "profile.entity_type", "individual")
    india_is_company = india_entity_kind == "company"
    india_is_firm = india_entity_kind in ("firm", "llp", "local")
    # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6):
    # indiaIsAop/indiaIsTrust have no engine equivalent — DAG-only additions.
    india_is_aop = india_entity_kind == "aop"
    india_is_trust = india_entity_kind == "trust"
    india_layer1_itr = safe(india, "itr_recommendation.form", None)
    if india_layer1_itr == "Unknown":
        india_layer1_itr = None
    india_return_form_crude = (
        "ITR-6" if india_is_company
        else "ITR-7" if india_is_trust
        else "ITR-5" if (india_is_firm or india_is_aop)
        else "ITR-2/3"
    )
    india_return_form = india_layer1_itr or india_return_form_crude

    us_t = safe(us, "profile.tax_entity_type", "individual")
    if us_t == "llc":
        us_t = safe(us, "profile.llc_tax_election", "individual")
    us_is_business = us_t in ("ccorp", "scorp", "partnership", "trust")
    us_is_corp_or_partnership = us_t in ("ccorp", "scorp", "partnership")
    m1 = safe(us, "corporate_financials.schedule_m1", None)
    m1_fields = (
        "net_income_per_books", "federal_tax_expense", "tax_exempt_interest",
        "tax_depreciation_over_book", "meals_disallowed_50", "foreign_taxes_credited",
        "interest_expense_limitation", "other_additions", "other_subtractions",
    )
    m1_has_data = bool(
        us_is_corp_or_partnership and m1 and any(num(m1.get(k)) != 0 for k in m1_fields)
    )
    us_schedule_m1_taxable_income_usd = (
        num(m1.get("net_income_per_books")) + num(m1.get("federal_tax_expense")) +
        num(m1.get("meals_disallowed_50")) + num(m1.get("foreign_taxes_credited")) +
        num(m1.get("interest_expense_limitation")) + num(m1.get("other_additions")) -
        num(m1.get("tax_exempt_interest")) - num(m1.get("tax_depreciation_over_book")) -
        num(m1.get("other_subtractions"))
        if m1_has_data else None
    )

    return {
        "indiaKind": india_entity_kind, "usKind": us_t,
        "indiaIsCompany": india_is_company, "indiaIsFirm": india_is_firm,
        "indiaIsAop": india_is_aop, "indiaIsTrust": india_is_trust,
        "indiaOpt115baa": safe(india, "profile.opt_115baa", False) is True,
        "indiaOpt115bab": safe(india, "profile.opt_115bab", False) is True,
        "indiaOpt115ba": safe(india, "profile.opt_115ba", False) is True,
        "indiaTurnoverLte400cr": safe(india, "profile.turnover_lte_400cr", False) is True,
        "indiaMatBookProfitInr": safe(india, "profile.mat_book_profit", None),
        "indiaIsSection8": safe(india, "profile.is_section_8", False) is True,
        "isCompanyDirector": safe(india, "profile.is_company_director", False) is True,
        "usIsBusiness": us_is_business,
        "usScheduleM1TaxableIncomeUsd": us_schedule_m1_taxable_income_usd,
        "usIncorporatedInUs": safe(us, "profile.incorporated_in_us", None) if us_is_business else None,
        "usIncorporationState": safe(us, "profile.incorporation_state", None) if us_is_business else None,
        "isBusiness": india_is_company or india_is_firm or india_is_aop or india_is_trust or us_is_business,
        "indiaReturnForm": india_return_form,
        "indiaReturnFormIsRecommendation": bool(india_layer1_itr),
        "indiaReturnFormExplanation": safe(india, "itr_recommendation.explanation", None) if india_layer1_itr else None,
        "usReturnForm": (
            "1120" if us_t == "ccorp" else
            "1120-S" if us_t == "scorp" else
            "1065" if us_t == "partnership" else
            "1041" if us_t == "trust" else
            ("1040-NR" if safe(us, "nra_specific.files_form_1040nr", False) is True else "1040")
        ),
    }


def _compute_company_residency_result(d, ctx):
    india = ctx.get("india")
    return {
        "isActiveBusiness": safe(india, "company_residency.is_active_business", False) is True,
        "boardMeetingsOutsideIndia": safe(india, "company_residency.board_meetings_primarily_outside_india", False) is True,
        "keyManagementLocation": safe(india, "company_residency.key_management_location", None),
        "managementDelegatedOutsideIndia": safe(india, "company_residency.management_delegated_outside_india", False) is True,
        "directorsInIndia": num(safe(india, "company_residency.directors_in_india_count", 0)),
        "directorsOutsideIndia": num(safe(india, "company_residency.directors_outside_india_count", 0)),
    }


def _compute_treaty_model_result(d, ctx):
    india = ctx.get("india")
    us = ctx.get("us")
    return {
        "trcStatus": (
            safe(india, "dtaa.trc_status", False) is True or
            safe(india, "compliance_docs.trc.document_uploaded", False) is True
        ),
        "form10fFiled": safe(india, "compliance_docs.form_10f.is_filed", False) is True,
        "treatyResidence": safe(india, "dtaa.dtaa_treaty_residence", "none"),
        "dtaaForcedNr": safe(india, "dtaa.dtaa_forced_nr", False) is True,
        "hasPE": safe(india, "dtaa.has_permanent_establishment_in_india", False) is True,
        "usTreatyResidence": safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
        "files1040nr": safe(us, "nra_specific.files_form_1040nr", False) is True,
        "form8833Implied": safe(us, "us_residency_detail.dtaa_treaty_residence", "none") != "none",
        "chapterXiiaElected": safe(india, "compliance_docs.chapter_xiia_elected", False) is True,
        "tieBreakHome": safe(india, "dtaa.tb_home", None),
        "tieBreakCvi": safe(india, "dtaa.tb_cvi", None),
        "tieBreakAbode": safe(india, "dtaa.tb_abode", None),
        "tieBreakNationality": safe(india, "dtaa.tb_nationality", None),
        "treatyElections": safe(india, "dtaa.treaty_elections", []) or [],
    }


ENTITY_RESULT = NodeDef(
    deps=(), compute=_compute_entity_result,
    layer1_fields=(
        "india.profile.entity_type", "india.itr_recommendation.form", "india.itr_recommendation.explanation",
        "india.profile.opt_115baa", "india.profile.opt_115bab", "india.profile.opt_115ba",
        "india.profile.turnover_lte_400cr", "india.profile.mat_book_profit", "india.profile.is_section_8",
        "india.profile.is_company_director",
        "us.profile.tax_entity_type", "us.profile.llc_tax_election",
        "us.corporate_financials.schedule_m1.net_income_per_books",
        "us.corporate_financials.schedule_m1.federal_tax_expense",
        "us.corporate_financials.schedule_m1.tax_exempt_interest",
        "us.corporate_financials.schedule_m1.tax_depreciation_over_book",
        "us.corporate_financials.schedule_m1.meals_disallowed_50",
        "us.corporate_financials.schedule_m1.foreign_taxes_credited",
        "us.corporate_financials.schedule_m1.interest_expense_limitation",
        "us.corporate_financials.schedule_m1.other_additions",
        "us.corporate_financials.schedule_m1.other_subtractions",
        "us.profile.incorporated_in_us", "us.profile.incorporation_state",
        "us.nra_specific.files_form_1040nr",
    ),
)
COMPANY_RESIDENCY_RESULT = NodeDef(
    deps=(), compute=_compute_company_residency_result,
    layer1_fields=(
        "india.company_residency.is_active_business",
        "india.company_residency.board_meetings_primarily_outside_india",
        "india.company_residency.key_management_location",
        "india.company_residency.management_delegated_outside_india",
        "india.company_residency.directors_in_india_count",
        "india.company_residency.directors_outside_india_count",
    ),
)
TREATY_MODEL_RESULT = NodeDef(
    deps=(), compute=_compute_treaty_model_result,
    layer1_fields=(
        "india.dtaa.trc_status", "india.compliance_docs.trc.document_uploaded",
        "india.compliance_docs.form_10f.is_filed", "india.dtaa.dtaa_treaty_residence",
        "india.dtaa.dtaa_forced_nr", "india.dtaa.has_permanent_establishment_in_india",
        "us.us_residency_detail.dtaa_treaty_residence", "us.nra_specific.files_form_1040nr",
        "india.compliance_docs.chapter_xiia_elected", "india.dtaa.tb_home", "india.dtaa.tb_cvi",
        "india.dtaa.tb_abode", "india.dtaa.tb_nationality", "india.dtaa.treaty_elections",
    ),
)


def build(base):
    """base: NodeRegistry (typically empty at this point). Returns a new
    registry with this module's nodes registered."""
    r = base.extend()
    r.register("entityResult", ENTITY_RESULT)
    r.register("companyResidencyResult", COMPANY_RESIDENCY_RESULT)
    r.register("treatyModelResult", TREATY_MODEL_RESULT)
    return r
