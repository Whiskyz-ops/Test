"""computeIndiaItrForm — India's 7-form ITR eligibility solver. Port of
prototypes/graph-pilot/itrform-nodes.js.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import format_inr, safe
from . import india_full


def _india_itr_form_result(d, ctx):
    entity = d["indiaEntityTypeRaw"]
    is_ind, is_huf = entity == "individual", entity == "huf"
    is_ror = d["indiaResidencyStatusRawAgg"] == "ROR"
    total_income_inr = d["grossTotalIncomeInrCombined"] or 0

    stcg111a = d["stcgInrBoundary"] or 0
    ltcg112a = d["ltcgInrBoundary"] or 0
    ltcg112 = d["ltcg197InrBoundary"] or 0
    stcg_other = d["stcgSlabInrBoundary"] or 0
    other_capital_gains = stcg111a + ltcg112 + stcg_other
    has_disqualifying_capital_gains = other_capital_gains > 0 or ltcg112a > 125000

    has_foreign_income = (is_ind or is_huf) and d["indiaForeignIncomeDeclaredRaw"] is True
    has_foreign_assets = (is_ind or is_huf) and d["indiaForeignAssetsDeclaredRaw"] is True
    has_crypto = (is_ind or is_huf) and ((d["vdaGainInrBoundary"] or 0) > 0 or (d["capitalGainsComputation"]["vdaSaleConsiderationInr"] or 0) > 0)
    multiple_hp = (d["indiaIncomeModelResult"]["housePropertyCount"] or 0) > 2
    has_high_agri_income = (d["agriculturalIncomeInrAgg"] or 0) > 5000
    has_lottery_or_gaming = (d["specialRate115bbInr"] or 0) > 0
    has_bf_losses = d["indiaHasBroughtForwardLossesRaw"] is True
    has_speculative_or_fno = (d["speculativeIncomeInrAgg"] or 0) != 0 or (d["fnoIncomeInrAgg"] or 0) != 0
    is_director = is_ind and d["indiaIsCompanyDirectorRaw"] is True
    director_unknown = is_ind and not is_director

    disqualifiers = []
    if total_income_inr > 5000000:
        disqualifiers.append(f"Total income exceeds ₹50,00,000 (₹{format_inr(total_income_inr)})")
    if not is_ror:
        disqualifiers.append(f"Not Resident & Ordinarily Resident (status: {d['indiaResidencyStatusRawAgg'] or 'unknown'})")
    if has_disqualifying_capital_gains:
        disqualifiers.append(
            "Capital gains beyond the s.198-only allowance (STCG and/or non-s.198 LTCG present)"
            if other_capital_gains > 0
            else f"LTCG under s.198 exceeds the ₹1,25,000 threshold (₹{format_inr(ltcg112a)})"
        )
    if has_foreign_income:
        disqualifiers.append("Foreign income declared (foreign_income.has_foreign_income)")
    if has_foreign_assets:
        disqualifiers.append("Foreign assets declared (Schedule FA)")
    if has_crypto:
        disqualifiers.append("Crypto/VDA gains or sale activity on file")
    if multiple_hp:
        disqualifiers.append(f"More than 2 house properties ({d['indiaIncomeModelResult']['housePropertyCount']})")
    if has_high_agri_income:
        disqualifiers.append(f"Agricultural income exceeds ₹5,000 (₹{format_inr(d['agriculturalIncomeInrAgg'])})")
    if has_lottery_or_gaming:
        disqualifiers.append("Lottery/betting/online-gaming winnings on file (s.128/194)")
    if has_bf_losses:
        disqualifiers.append("Brought-forward losses on file")
    if has_speculative_or_fno:
        disqualifiers.append("Speculative or F&O business income on file")
    if is_director:
        disqualifiers.append("Company director (profile.is_company_director)")

    is_disqualified = len(disqualifiers) > 0

    bc = d["businessComputation"]
    has_business = bool(bc["indiaHasRegularBooksEntry"] or bc["indiaHasValidPresumptiveEntry"] or (d["fnoIncomeInrAgg"] or 0) != 0 or (d["speculativeIncomeInrAgg"] or 0) != 0)
    has_partner_income = bool(bc["indiaHasPartnerFirmIncome"])
    presumptive_only = (
        bc["indiaHasValidPresumptiveEntry"] is True and not bc["indiaHasRegularBooksEntry"] and
        not has_partner_income and (d["fnoIncomeInrAgg"] or 0) == 0 and (d["speculativeIncomeInrAgg"] or 0) == 0
    )

    if entity == "company":
        if d["indiaIsSection8Raw"]:
            form, explanation = "ITR-7", "For NGOs, Public Charitable Trusts, registered Societies, and Section 8 Companies claiming tax exemptions."
        else:
            form, explanation = "ITR-6", "For Corporate Companies (Private Limited, Public Limited, OPCs) not claiming charitable exemptions."
    elif entity in ("trust", "ngo", "society", "political_party"):
        form, explanation = "ITR-7", "For NGOs, Public Charitable Trusts, registered Societies, and Political Parties claiming tax exemptions under Trust & NGO Tax Exemptions."
    elif entity in ("firm", "aop", "boi", "ajp", "local"):
        if entity == "firm" and not is_disqualified and presumptive_only:
            form, explanation = "ITR-4 (SUGAM)", "For Resident Partnership Firms (excluding LLPs) with total income up to ₹50 Lakhs opting for Presumptive Taxation (44AD, 44ADA, 44AE)."
        else:
            form, explanation = "ITR-5", "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities."
    elif entity == "llp":
        form, explanation = "ITR-5", "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities."
    elif is_ind or is_huf:
        if has_business or has_partner_income:
            if not is_disqualified and presumptive_only and not has_partner_income:
                form, explanation = "ITR-4 (SUGAM)", "For Resident Individuals and HUFs with total income up to ₹50 Lakhs who opt exclusively for the Presumptive Taxation Scheme (44AD/44ADA/44AE)."
            else:
                form, explanation = "ITR-3", "For Individuals and HUFs with Business or Professional Income maintaining books, or receiving remuneration/interest as a partner in a firm. Mandatory if disqualified from ITR-4."
        elif is_ind and not is_disqualified:
            form, explanation = "ITR-1 (SAHAJ)", "For Resident Salaried Individuals with total income up to ₹50 Lakhs (Salary, up to 2 house properties, basic other sources). Restrictions: no foreign assets/income, no capital gains beyond the s.198-only allowance, no directorships."
        else:
            form = "ITR-2"
            explanation = (
                "For Individuals and HUFs not having business/profession income but having Capital Gains, Foreign Income/Assets, multiple properties, or otherwise not qualifying for ITR-1."
                + (f" Disqualified from ITR-1 due to: {'; '.join(disqualifiers)}." if disqualifiers else "")
            )
    else:
        form, explanation = "ITR-2", "Entity type not otherwise classified — defaulting to ITR-2 pending a proper Layer 1 entity-type read."

    return {
        "form": form, "explanation": explanation, "disqualified": is_disqualified, "disqualifiers": disqualifiers,
        "totalIncomeInr": total_income_inr, "directorUnknown": director_unknown,
        "frontendForm": d["indiaLayer1ItrRaw"],
        "frontendExplanation": d["indiaReturnFormExplanationRaw"] if d["indiaLayer1ItrRaw"] else None,
        "matchesFrontend": (d["indiaLayer1ItrRaw"] == form) if d["indiaLayer1ItrRaw"] else None,
    }


def build(base):
    r = india_full.build(base)

    # ---- the one real gap: gross (pre-Chapter-VI-A-deduction) total income --
    r.register("grossTotalIncomeInrV3", NodeDef(
        deps=("normalSlabInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
              "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"),
        compute=lambda d, ctx: (
            d["normalSlabInr"] + d["stcgTaxableInr"] + d["ltcgTaxableInr"] + d["ltcg197TaxableInr"] + d["specialRate115bbInr"] + d["vdaGainInrBoundary"] +
            d["chapterXiiaInvestmentIncomeInrBoundary"] + (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0) +
            (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0)
        ),
    ))
    r.register("grossTotalIncomeInrCombined", NodeDef(
        deps=("isEntityTaxpayer", "grossTotalIncomeInrV3", "entityTaxableInrBoundary"),
        compute=lambda d, ctx: d["entityTaxableInrBoundary"] if d["isEntityTaxpayer"] else d["grossTotalIncomeInrV3"],
    ))

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
    return r
