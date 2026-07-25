"""computeIndiaTax (individual/HUF slab path). Port of
prototypes/graph-pilot/in1-nodes-v3.js.

The "*BoundaryV3"/"*Boundary" nodes here are EXPLICIT BOUNDARY INPUTS (read
`ctx["model"]...`, which does not exist in the real `{router, india, us}`
ctx shape) — none of them are ever actually resolved as-is; india_full.py
overrides all of them to read from the merged aggregate-income subgraph
instead, exactly mirroring india-full-nodes.js's own overrides of the same
node ids.
"""
from __future__ import annotations

from ..core.dates import parse_date
from ..core.graph import NodeDef
from ..core.util import num, safe
from . import constants as C

T = C.INDIA
S80DD_U_FLAT = C.INDIA["S80DD_U_FLAT_INR"]
S80DDB_CAP = C.INDIA["S80DDB_CAP_INR"]


def _s80eea_ee_cap_inr(sanction_date) -> float:
    if not sanction_date:
        return 0.0
    d = parse_date(sanction_date)
    if d is None:
        return 0.0
    if parse_date("2016-04-01") <= d <= parse_date("2017-03-31"):
        return 50000.0
    if parse_date("2019-04-01") <= d <= parse_date("2022-03-31"):
        return 150000.0
    return 0.0


def bracket_tax(amount: float, slabs: list) -> float:
    t, tax, prev = max(0.0, amount), 0.0, 0.0
    for cap, rate in slabs:
        if t > prev:
            tax += (min(t, cap) - prev) * rate
            prev = cap
        else:
            break
    return tax


def bracket_breakdown(amount: float, slabs: list) -> list[dict]:
    t, prev, rows = max(0.0, amount), 0.0, []
    for cap, rate in slabs:
        if t > prev:
            taxable = min(t, cap) - prev
            rows.append({"from": prev, "to": cap, "rate": rate, "taxable": taxable, "tax": taxable * rate})
            prev = cap
        else:
            break
    return rows


def compute_india_surcharge(tax_base: float, total_income: float, is_new: bool, slabs: list, special_tax: float) -> float:
    if total_income > 50000000:
        rate, threshold = (T["SURCHARGE_NEW_MAX"] if is_new else 0.37), 50000000
    elif total_income > 20000000:
        rate, threshold = 0.25, 20000000
    elif total_income > 10000000:
        rate, threshold = 0.15, 10000000
    elif total_income > 5000000:
        rate, threshold = 0.10, 5000000
    else:
        return 0.0
    capped_rate = min(rate, T["SURCHARGE_CG_DIV_CAP"])
    non_special_tax = max(0.0, tax_base - special_tax)
    surcharge = non_special_tax * rate + special_tax * capped_rate
    tax_at_threshold = bracket_tax(threshold, slabs)
    cap = tax_at_threshold + (total_income - threshold)
    if tax_base + surcharge > cap:
        surcharge = max(0.0, cap - tax_base)
    return surcharge


def compute_loss_set_off(cfl: dict, buckets: dict) -> dict:
    business_inr = buckets["businessInr"]
    house_property_inr = buckets["housePropertyInr"]
    other_normal_inr = buckets["otherNormalInr"]
    stcg_inr = buckets["stcgInr"]
    ltcg_gross_inr = buckets["ltcgGrossInr"]
    speculative_inr = max(0.0, buckets.get("speculativeInr") or 0)
    stcg_slab_inr = buckets.get("stcgSlabInr") or 0
    ltcg197_inr = buckets.get("ltcg197Inr") or 0

    business_loss_used = min(cfl.get("businessLossAvailableInr") or 0, business_inr)
    business_inr -= business_loss_used
    business_loss_unused = (cfl.get("businessLossAvailableInr") or 0) - business_loss_used

    hp_loss_used = min(cfl.get("housePropertyLossAvailableInr") or 0, house_property_inr)
    house_property_inr -= hp_loss_used
    hp_loss_unused = (cfl.get("housePropertyLossAvailableInr") or 0) - hp_loss_used

    stcg_loss_avail = cfl.get("stcgLossAvailableInr") or 0
    stcg_loss_used_vs_stcg_slab = min(stcg_loss_avail, stcg_slab_inr)
    stcg_slab_inr -= stcg_loss_used_vs_stcg_slab
    stcg_loss_after_slab = stcg_loss_avail - stcg_loss_used_vs_stcg_slab
    stcg_loss_used_vs_stcg = min(stcg_loss_after_slab, stcg_inr)
    stcg_inr -= stcg_loss_used_vs_stcg
    stcg_loss_after_flat = stcg_loss_after_slab - stcg_loss_used_vs_stcg
    stcg_loss_used_vs_ltcg197 = min(stcg_loss_after_flat, ltcg197_inr)
    ltcg197_inr -= stcg_loss_used_vs_ltcg197
    stcg_loss_after_ltcg197 = stcg_loss_after_flat - stcg_loss_used_vs_ltcg197
    stcg_loss_used_vs_ltcg198 = min(stcg_loss_after_ltcg197, ltcg_gross_inr)
    ltcg_gross_inr -= stcg_loss_used_vs_ltcg198
    stcg_loss_unused = stcg_loss_after_ltcg197 - stcg_loss_used_vs_ltcg198
    stcg_loss_used_vs_ltcg = stcg_loss_used_vs_ltcg197 + stcg_loss_used_vs_ltcg198

    ltcg_loss_avail = cfl.get("ltcgLossAvailableInr") or 0
    ltcg_loss_used_vs197 = min(ltcg_loss_avail, ltcg197_inr)
    ltcg197_inr -= ltcg_loss_used_vs197
    ltcg_loss_after197 = ltcg_loss_avail - ltcg_loss_used_vs197
    ltcg_loss_used_vs198 = min(ltcg_loss_after197, ltcg_gross_inr)
    ltcg_gross_inr -= ltcg_loss_used_vs198
    ltcg_loss_unused = ltcg_loss_after197 - ltcg_loss_used_vs198
    ltcg_loss_used = ltcg_loss_used_vs197 + ltcg_loss_used_vs198

    speculative_loss_avail = cfl.get("speculativeLossAvailableInr") or 0
    speculative_loss_used = min(speculative_loss_avail, speculative_inr)
    speculative_inr -= speculative_loss_used
    speculative_loss_unused = speculative_loss_avail - speculative_loss_used

    dep_remaining = cfl.get("unabsorbedDepreciationCf") or 0
    used = min(dep_remaining, business_inr); business_inr -= used; dep_remaining -= used
    used = min(dep_remaining, house_property_inr); house_property_inr -= used; dep_remaining -= used
    used = min(dep_remaining, stcg_slab_inr); stcg_slab_inr -= used; dep_remaining -= used
    used = min(dep_remaining, stcg_inr); stcg_inr -= used; dep_remaining -= used
    used = min(dep_remaining, ltcg197_inr); ltcg197_inr -= used; dep_remaining -= used
    used = min(dep_remaining, ltcg_gross_inr); ltcg_gross_inr -= used; dep_remaining -= used
    used = min(dep_remaining, other_normal_inr); other_normal_inr -= used; dep_remaining -= used
    used = min(dep_remaining, speculative_inr); speculative_inr -= used; dep_remaining -= used
    dep_used = (cfl.get("unabsorbedDepreciationCf") or 0) - dep_remaining

    total_used_inr = (
        business_loss_used + hp_loss_used + stcg_loss_used_vs_stcg_slab + stcg_loss_used_vs_stcg +
        stcg_loss_used_vs_ltcg + ltcg_loss_used + speculative_loss_used + dep_used
    )
    total_unused_inr = business_loss_unused + hp_loss_unused + stcg_loss_unused + ltcg_loss_unused + speculative_loss_unused + dep_remaining

    return {
        "businessInr": business_inr, "housePropertyInr": house_property_inr, "otherNormalInr": other_normal_inr,
        "stcgInr": stcg_inr, "stcgSlabInr": stcg_slab_inr, "ltcgGrossInr": ltcg_gross_inr, "ltcg197Inr": ltcg197_inr,
        "speculativeInr": speculative_inr, "totalUsedInr": total_used_inr, "totalUnusedInr": total_unused_inr,
        "unused": {
            "businessInr": business_loss_unused, "housePropertyInr": hp_loss_unused,
            "stcgInr": stcg_loss_unused, "ltcgInr": ltcg_loss_unused,
            "speculativeInr": speculative_loss_unused, "unabsorbedDepreciationInr": dep_remaining,
        },
        "used": {
            "businessInr": business_loss_used, "housePropertyInr": hp_loss_used,
            "stcgSlabInr": stcg_loss_used_vs_stcg_slab, "stcgInr": stcg_loss_used_vs_stcg,
            "ltcgFromStcgLossInr": stcg_loss_used_vs_ltcg, "ltcgInr": ltcg_loss_used,
            "speculativeInr": speculative_loss_used, "unabsorbedDepreciationInr": dep_used,
        },
    }


def compute_s115a_stream(treaty: dict, income_type: str, aggregate_total_inr) -> dict:
    domestic = T["S115A_RATES"][income_type]
    docs_ok = treaty["trcStatus"] and treaty["form10fFiled"]
    has_aggregate = aggregate_total_inr is not None
    remaining_inr = aggregate_total_inr if has_aggregate else 0
    claimed_inr, tax_inr = 0.0, 0.0
    elections = []
    for e in treaty.get("treatyElections") or []:
        if not e or e.get("income_type") != income_type:
            continue
        raw = num(e.get("amount_inr"))
        amt = min(raw, max(0.0, remaining_inr)) if has_aggregate else raw
        elected_rate = float(e["elected_rate"]) if e.get("elected_rate") is not None else None
        rate = min(domestic, elected_rate) if (docs_ok and elected_rate is not None) else domestic
        election_tax_inr = amt * rate
        claimed_inr += amt
        tax_inr += election_tax_inr
        elections.append({
            "article": e.get("treaty_article"), "requestedAmountInr": raw, "appliedAmountInr": amt,
            "electedRate": elected_rate, "domesticRate": domestic, "rateApplied": rate, "taxInr": election_tax_inr,
            "outcome": (
                "denied_no_docs" if not docs_ok else
                ("elected_rate_applied" if (elected_rate is not None and elected_rate < domestic) else "domestic_rate_wins")
            ),
        })
        if has_aggregate:
            remaining_inr -= amt
    uncaptured_inr = max(0.0, remaining_inr) if has_aggregate else 0.0
    uncaptured_tax_inr = uncaptured_inr * domestic
    tax_inr += uncaptured_tax_inr
    total_inr = aggregate_total_inr if has_aggregate else claimed_inr
    return {
        "totalInr": total_inr, "taxInr": tax_inr, "claimedInr": claimed_inr, "uncapturedInr": uncaptured_inr,
        "uncapturedTaxInr": uncaptured_tax_inr, "elections": elections,
        "domesticRate": domestic, "effectiveRate": (tax_inr / total_inr) if total_inr > 0 else domestic,
    }


def compute_nr_interest_treatment(treaty: dict, slabs: list, other_slab_income_inr: float, interest_aggregate_inr: float) -> dict:
    docs_ok = treaty["trcStatus"] and treaty["form10fFiled"]
    remaining_inr = interest_aggregate_inr
    elections = []
    carved_out_inr, carved_out_tax_inr = 0.0, 0.0
    for e in treaty.get("treatyElections") or []:
        if not e or e.get("income_type") != "interest":
            continue
        raw = num(e.get("amount_inr"))
        amt = min(raw, max(0.0, remaining_inr))
        if amt <= 0:
            continue
        remaining_inr -= amt
        elected_rate = float(e["elected_rate"]) if e.get("elected_rate") is not None else None
        can_elect = docs_ok and elected_rate is not None
        marginal_slab_tax_inr = bracket_tax(other_slab_income_inr + interest_aggregate_inr, slabs) - bracket_tax(other_slab_income_inr + interest_aggregate_inr - amt, slabs)
        treaty_tax_inr = amt * elected_rate if can_elect else None
        carved_out = can_elect and treaty_tax_inr < marginal_slab_tax_inr
        if carved_out:
            carved_out_inr += amt
            carved_out_tax_inr += treaty_tax_inr
        elections.append({
            "article": e.get("treaty_article"), "requestedAmountInr": raw, "appliedAmountInr": amt,
            "electedRate": elected_rate, "marginalSlabTaxInr": marginal_slab_tax_inr, "treatyTaxInr": treaty_tax_inr,
            "carvedOut": carved_out,
            "outcome": (
                "denied_no_docs" if not docs_ok else
                ("no_rate" if elected_rate is None else ("treaty_beats_slab" if carved_out else "slab_beats_treaty"))
            ),
        })
    uncaptured_inr = max(0.0, remaining_inr)
    return {
        "totalInr": interest_aggregate_inr, "slabEligibleInr": interest_aggregate_inr - carved_out_inr,
        "carvedOutInr": carved_out_inr, "carvedOutTaxInr": carved_out_tax_inr,
        "uncapturedInr": uncaptured_inr, "elections": elections,
    }


def _sum_allowed(arr) -> float:
    total = 0.0
    for e in arr or []:
        v = e.get("final_allowed_amount_inr") if (e and e.get("final_allowed_amount_inr") is not None) else num(e.get("amount_inr") if e else None)
        total += num(v)
    return total


def _india_annual_slice_v3(india):
    from .aggregate_india_income import _merge_quarters
    quarters = safe(india, "quarters", None)
    if not quarters:
        return {"domestic_income": safe(india, "domestic_income", {}) or {}, "other_sources": safe(india, "other_sources", {}) or {}}
    out = {"domestic_income": {}, "other_sources": {}}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs = quarters.get(q)
        if not qs:
            continue
        if qs.get("domestic_income"):
            _merge_quarters(qs["domestic_income"], out["domestic_income"])
        if qs.get("other_sources"):
            _merge_quarters(qs["other_sources"], out["other_sources"])
    return out


def _house_property_inr(hp_props) -> float:
    return sum(
        num(p.get("annual_value_inr") or p.get("gross_annual_value_inr") or p.get("net_income_inr") or p.get("gross_rent_received_inr") or 0)
        for p in hp_props
    )


def _loss_set_off_v3(d, ctx):
    business_inr_raw = d["businessInrBoundaryV3"]
    unabsorbed_dep_this_year_inr = min(d["businessDepreciationInrBoundary"], -business_inr_raw) if business_inr_raw < 0 else 0
    cfl_for_set_off = {
        "businessLossAvailableInr": d["cflBusinessInr"], "speculativeLossAvailableInr": d["cflSpeculativeInr"],
        "stcgLossAvailableInr": d["cflStcgInr"], "ltcgLossAvailableInr": d["cflLtcgInr"],
        "housePropertyLossAvailableInr": d["cflHousePropertyInr"],
        "unabsorbedDepreciationCf": d["cflUnabsorbedDepreciationInr"] + unabsorbed_dep_this_year_inr,
    }
    nr_interest_slab_eligible_inr = d["nrInterest"]["slabEligibleInr"] if d["nrInterest"] else 0
    return compute_loss_set_off(cfl_for_set_off, {
        "businessInr": max(0.0, business_inr_raw),
        "housePropertyInr": d["housePropertyInr"],
        "otherNormalInr": d["deemedDividendBuybackInrBoundary"] + d["otherSourcesMiscInrBoundary"] + (
            nr_interest_slab_eligible_inr if d["isNRV3"] else d["interestInr"] + d["dividendInr"]
        ),
        "stcgInr": d["stcgInrBoundary"], "stcgSlabInr": d["stcgSlabInrBoundary"], "ltcgGrossInr": d["ltcgInrBoundary"],
        "ltcg197Inr": d["ltcg197InrBoundary"], "speculativeInr": max(0.0, d["speculativeIncomeInrBoundaryV3"]),
    })


def _deductions_inr_v3(d, ctx):
    if d["isNew"]:
        return d["dedS80CCD2Employer"] or 0
    caps = T["DEDUCTION_CAPS_OLD"]
    s80gg_inr = (
        max(0.0, min(d["dedS80GGRentPaidInr"] - 0.10 * d["normalSlabInr"], 60000, 0.25 * d["normalSlabInr"]))
        if d["dedS80GGRentPaidInr"] > 0 else 0
    )
    return (
        min(d["dedS80C"], caps["s80C"]) + min(d["dedS80CCD1B"], caps["s80CCD1B"]) +
        min(d["dedS80D"], caps["s80D_self"] + caps["s80D_parents_senior"]) + (d["dedS80CCD2Employer"] or 0) +
        min(d["dedS80TTA_TTB"], 10000) + (d["dedS80DD"] or 0) + (d["dedS80DDB"] or 0) + (d["dedS80U"] or 0) +
        (d["dedS80E"] or 0) + (d["dedS80EEA_EE"] or 0) + (d["dedS80GGB_GGC"] or 0) + s80gg_inr
    )


def _promoter_buyback_extra_tax_inr(d, ctx):
    is_corporate_promoter = d["indiaEntityTypeRawV3"] == "company"
    promoter_target_rate = T["PROMOTER_BUYBACK_TARGET_RATE_CORPORATE"] if is_corporate_promoter else T["PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE"]
    ltcg_additional_inr = max(0.0, d["promoterBuybackLtcgInrBoundary"]) * max(0.0, promoter_target_rate - T["LTCG_112A_RATE"])
    stcg_additional_inr = max(0.0, d["promoterBuybackStcgInrBoundary"]) * max(0.0, promoter_target_rate - T["STCG_111A_RATE"])
    additional_tax_inr = ltcg_additional_inr + stcg_additional_inr
    surcharge_inr = additional_tax_inr * T["PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE"]
    cess_inr = (additional_tax_inr + surcharge_inr) * T["CESS_RATE"]
    return additional_tax_inr + surcharge_inr + cess_inr


NODES = {
    # ---- raw leaves ----------------------------------------------------------
    "annualSliceV3": NodeDef(deps=(), compute=lambda d, ctx: _india_annual_slice_v3(ctx.get("india"))),
    "salaryInr": NodeDef(deps=("annualSliceV3",), compute=lambda d, ctx: num(safe(d["annualSliceV3"]["domestic_income"], "salary.taxable_salary_inr", None)) or num(safe(d["annualSliceV3"]["domestic_income"], "salary.gross_salary_inr", 0))),
    "housePropertyInr": NodeDef(deps=("annualSliceV3",), compute=lambda d, ctx: _house_property_inr(safe(d["annualSliceV3"]["domestic_income"], "house_property.properties", []) or [])),
    "interestInr": NodeDef(deps=("annualSliceV3",), compute=lambda d, ctx: (
        num(safe(d["annualSliceV3"]["other_sources"], "interest_savings_inr", 0)) + num(safe(d["annualSliceV3"]["other_sources"], "interest_fd_rd_inr", 0)) +
        num(safe(d["annualSliceV3"]["other_sources"], "interest_bonds_inr", 0)) + num(safe(d["annualSliceV3"]["other_sources"], "interest_on_it_refund_inr", 0)) +
        num(safe(d["annualSliceV3"]["domestic_income"], "other_sources.interest_inr", 0))
    )),
    "dividendInr": NodeDef(deps=("annualSliceV3",), compute=lambda d, ctx: num(safe(d["annualSliceV3"]["other_sources"], "dividend_inr", 0))),
    "specialRate115bbInr": NodeDef(deps=("annualSliceV3",), compute=lambda d, ctx: (
        num(safe(d["annualSliceV3"]["other_sources"], "winnings_lottery_gaming_inr", 0)) + num(safe(d["annualSliceV3"]["other_sources"], "online_gaming_winnings_inr", 0))
    )),
    "taxRegime": NodeDef(deps=(), compute=lambda d, ctx: (safe(ctx.get("india"), "profile.tax_regime", "NEW") or "NEW").upper()),
    "indiaResidencyStatusRawV3": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.final_india_residency_status", None)),
    "indiaEntityTypeRawV3": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.entity_type", "individual")),

    # ---- deductions -----------------------------------------------------------
    "dedS80C": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: num(x.get("epf_employee_inr")) + num(x.get("ppf_inr")) + num(x.get("elss_inr")) + num(x.get("life_insurance_premium_inr")) + num(x.get("principal_home_loan_inr")) + num(x.get("tuition_fees_inr")) + num(x.get("nsc_inr")) + num(x.get("tax_saving_fd_inr")) + num(x.get("sukanya_samriddhi_inr")))(safe(ctx.get("india"), "deductions.s80C", {}) or {})),
    "dedS80CCD1B": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80CCD_1B.nps_additional_inr", 0))),
    "dedS80CCD2Employer": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "domestic_income.salary.employer_nps_contribution_inr", 0))),
    "dedS80D": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: num(x.get("self_family_premium_inr")) + num(x.get("parents_premium_inr")))(safe(ctx.get("india"), "deductions.s80D", {}) or {})),
    "dedS80TTA_TTB": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80TTA_TTB.savings_interest_inr", 0))),
    "dedS80DD": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: (S80DD_U_FLAT.get(x.get("disability_percentage")) or 0) if x.get("has_disabled_dependents") is True else 0)(safe(ctx.get("india"), "deductions.s80DD", {}) or {})),
    "dedS80DDB": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: min(num(x.get("medical_expenses_inr")), S80DDB_CAP.get(x.get("patient_category")) or S80DDB_CAP["normal"]) if x.get("has_specified_diseases_treatment") is True else 0)(safe(ctx.get("india"), "deductions.s80DDB", {}) or {})),
    "dedS80U": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: (S80DD_U_FLAT.get(x.get("disability_percentage")) or 0) if x.get("has_self_disability") is True else 0)(safe(ctx.get("india"), "deductions.s80U", {}) or {})),
    "dedS80E": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80E.education_loan_interest_inr", 0))),
    "dedS80EEA_EE": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: min(num(x.get("affordable_home_loan_interest_inr")), _s80eea_ee_cap_inr(x.get("loan_sanction_date"))))(safe(ctx.get("india"), "deductions.s80EEA_EE", {}) or {})),
    "dedS80GGB_GGC": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80ggb_ggc_political_donation_inr", 0))),
    "dedS80GGRentPaidInr": NodeDef(deps=(), compute=lambda d, ctx: (lambda x: num(x.get("rent_paid_inr")) if x.get("has_rent_paid_no_hra") is True else 0)(safe(ctx.get("india"), "deductions.s80GG", {}) or {})),

    # ---- carry-forward losses ---------------------------------------------
    "cflBusinessInr": NodeDef(deps=(), compute=lambda d, ctx: _sum_allowed(safe(ctx.get("india"), "carry_forward_losses.business_loss_cf", []))),
    "cflSpeculativeInr": NodeDef(deps=(), compute=lambda d, ctx: _sum_allowed(safe(ctx.get("india"), "carry_forward_losses.speculative_loss_cf", []))),
    "cflStcgInr": NodeDef(deps=(), compute=lambda d, ctx: _sum_allowed(safe(ctx.get("india"), "carry_forward_losses.stcg_loss_cf", []))),
    "cflLtcgInr": NodeDef(deps=(), compute=lambda d, ctx: _sum_allowed(safe(ctx.get("india"), "carry_forward_losses.ltcg_loss_cf", []))),
    "cflHousePropertyInr": NodeDef(deps=(), compute=lambda d, ctx: _sum_allowed(safe(ctx.get("india"), "carry_forward_losses.house_property_loss_cf", []))),
    "cflUnabsorbedDepreciationInr": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "carry_forward_losses.unabsorbed_depreciation_cf", 0))),

    # ---- treaty --------------------------------------------------------------
    "treatyTrcStatus": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.trc_status", False) is True or safe(ctx.get("india"), "compliance_docs.trc.document_uploaded", False) is True),
    "treatyForm10fFiled": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "compliance_docs.form_10f.is_filed", False) is True),
    "treatyElectionsRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.treaty_elections", []) or []),

    # ---- EXPLICIT BOUNDARY INPUTS — overridden by india_full.py ------------
    "businessInrBoundaryV3": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.business.inr", None))),
    "businessDepreciationInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.businessDepreciationInr", None))),
    "speculativeIncomeInrBoundaryV3": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.speculativeIncomeInr", None))),
    "stcgInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.stcg.inr", None))),
    "ltcgInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.ltcg.inr", None))),
    "ltcg197InrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.ltcg197Inr", None))),
    "stcgSlabInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.stcgSlabInr", None))),
    "vdaGainInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.vdaGainInr", None))),
    "chapterXiiaInvestmentIncomeInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.chapterXiiaInvestmentIncomeInr", None))),
    "deemedDividendBuybackInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.deemedDividendBuyback.inr", None))),
    "promoterBuybackLtcgInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.promoterBuybackLtcgInr", None))),
    "promoterBuybackStcgInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.promoterBuybackStcgInr", None))),
    "otherSourcesMiscInrBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.india.otherSourcesMisc.inr", None))),

    # ---- computeIndiaTax (individual/HUF path only) ---------------------------
    "isNew": NodeDef(deps=("taxRegime",), compute=lambda d, ctx: d["taxRegime"] != "OLD"),
    "slabs": NodeDef(deps=("isNew",), compute=lambda d, ctx: T["SLABS_NEW"] if d["isNew"] else T["SLABS_OLD"]),
    "isNRV3": NodeDef(deps=("indiaResidencyStatusRawV3",), compute=lambda d, ctx: d["indiaResidencyStatusRawV3"] == "NR"),

    "nrInterest": NodeDef(
        deps=("isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
              "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"),
        compute=lambda d, ctx: (
            None if not d["isNRV3"] else
            compute_nr_interest_treatment(
                {"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]},
                d["slabs"],
                d["salaryInr"] + d["businessInrBoundaryV3"] + d["housePropertyInr"] + d["deemedDividendBuybackInrBoundary"] + d["otherSourcesMiscInrBoundary"],
                d["interestInr"],
            )
        ),
    ),
    "s115aDividend": NodeDef(
        deps=("isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"),
        compute=lambda d, ctx: compute_s115a_stream({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "dividend", d["dividendInr"]) if d["isNRV3"] else None,
    ),
    "s115aRoyalty": NodeDef(
        deps=("isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"),
        compute=lambda d, ctx: compute_s115a_stream({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "royalty", None) if d["isNRV3"] else None,
    ),
    "s115aFts": NodeDef(
        deps=("isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"),
        compute=lambda d, ctx: compute_s115a_stream({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "fts", None) if d["isNRV3"] else None,
    ),

    "lossSetOffV3": NodeDef(
        deps=("businessInrBoundaryV3", "businessDepreciationInrBoundary", "cflBusinessInr", "cflSpeculativeInr", "cflStcgInr", "cflLtcgInr",
              "cflHousePropertyInr", "cflUnabsorbedDepreciationInr", "housePropertyInr", "isNRV3", "nrInterest",
              "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr", "dividendInr",
              "stcgInrBoundary", "stcgSlabInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "speculativeIncomeInrBoundaryV3"),
        compute=_loss_set_off_v3,
    ),

    "normalSlabInr": NodeDef(deps=("salaryInr", "lossSetOffV3"), compute=lambda d, ctx: d["salaryInr"] + d["lossSetOffV3"]["businessInr"] + d["lossSetOffV3"]["housePropertyInr"] + d["lossSetOffV3"]["otherNormalInr"] + d["lossSetOffV3"]["stcgSlabInr"] + d["lossSetOffV3"]["speculativeInr"]),

    "deductionsInrV3": NodeDef(
        deps=("isNew", "dedS80CCD2Employer", "dedS80C", "dedS80CCD1B", "dedS80D", "dedS80TTA_TTB", "dedS80DD", "dedS80DDB",
              "dedS80U", "dedS80E", "dedS80EEA_EE", "dedS80GGB_GGC", "dedS80GGRentPaidInr", "normalSlabInr"),
        compute=_deductions_inr_v3,
    ),
    "totalNormalInr": NodeDef(deps=("normalSlabInr", "deductionsInrV3"), compute=lambda d, ctx: max(0.0, d["normalSlabInr"] - d["deductionsInrV3"])),

    "stcgTaxableInr": NodeDef(deps=("lossSetOffV3",), compute=lambda d, ctx: d["lossSetOffV3"]["stcgInr"]),
    "ltcgTaxableInr": NodeDef(deps=("lossSetOffV3",), compute=lambda d, ctx: max(0.0, d["lossSetOffV3"]["ltcgGrossInr"] - T["LTCG_112A_EXEMPT_INR"])),
    "ltcg197TaxableInr": NodeDef(deps=("lossSetOffV3",), compute=lambda d, ctx: max(0.0, d["lossSetOffV3"]["ltcg197Inr"])),
    "special115bbTaxInr": NodeDef(deps=("specialRate115bbInr",), compute=lambda d, ctx: d["specialRate115bbInr"] * T["RATE_115BB"]),
    "vdaTaxInr": NodeDef(deps=("vdaGainInrBoundary",), compute=lambda d, ctx: d["vdaGainInrBoundary"] * T["RATE_115BBH"]),
    "chapterXiiaInvestmentIncomeTaxInr": NodeDef(deps=("chapterXiiaInvestmentIncomeInrBoundary",), compute=lambda d, ctx: d["chapterXiiaInvestmentIncomeInrBoundary"] * T["RATE_115E_INVESTMENT_INCOME"]),

    "capEligibleSpecialTaxInr": NodeDef(
        deps=("stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "s115aDividend"),
        compute=lambda d, ctx: d["stcgTaxableInr"] * T["STCG_111A_RATE"] + d["ltcgTaxableInr"] * T["LTCG_112A_RATE"] + d["ltcg197TaxableInr"] * T["LTCG_112A_RATE"] + (d["s115aDividend"]["taxInr"] if d["s115aDividend"] else 0),
    ),
    "specialTaxInrV3": NodeDef(
        deps=("capEligibleSpecialTaxInr", "special115bbTaxInr", "vdaTaxInr", "chapterXiiaInvestmentIncomeTaxInr", "nrInterest", "s115aRoyalty", "s115aFts"),
        compute=lambda d, ctx: d["capEligibleSpecialTaxInr"] + d["special115bbTaxInr"] + d["vdaTaxInr"] + d["chapterXiiaInvestmentIncomeTaxInr"] + (d["nrInterest"]["carvedOutTaxInr"] if d["nrInterest"] else 0) + (d["s115aRoyalty"]["taxInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["taxInr"] if d["s115aFts"] else 0),
    ),

    "slabTaxInr": NodeDef(deps=("totalNormalInr", "slabs"), compute=lambda d, ctx: bracket_tax(d["totalNormalInr"], d["slabs"])),

    "totalIncomeInrV3": NodeDef(
        deps=("totalNormalInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
              "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"),
        compute=lambda d, ctx: (
            d["totalNormalInr"] + d["stcgTaxableInr"] + d["ltcgTaxableInr"] + d["ltcg197TaxableInr"] + d["specialRate115bbInr"] + d["vdaGainInrBoundary"] +
            d["chapterXiiaInvestmentIncomeInrBoundary"] + (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0) +
            (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0)
        ),
    ),

    "isIndividualV3": NodeDef(deps=("indiaEntityTypeRawV3",), compute=lambda d, ctx: d["indiaEntityTypeRawV3"] == "individual"),
    "rebateInrV3": NodeDef(
        deps=("isIndividualV3", "isNRV3", "totalNormalInr", "isNew", "slabTaxInr"),
        compute=lambda d, ctx: (
            min(d["slabTaxInr"], (T["REBATE_87A_NEW"] if d["isNew"] else T["REBATE_87A_OLD"])["maxRebate"])
            if (d["isIndividualV3"] and not d["isNRV3"] and d["totalNormalInr"] <= (T["REBATE_87A_NEW"] if d["isNew"] else T["REBATE_87A_OLD"])["incomeCap"])
            else 0
        ),
    ),
    "taxAfterRebateInr": NodeDef(deps=("slabTaxInr", "rebateInrV3", "specialTaxInrV3"), compute=lambda d, ctx: max(0.0, d["slabTaxInr"] - d["rebateInrV3"]) + d["specialTaxInrV3"]),
    "surchargeInrV3": NodeDef(
        deps=("taxAfterRebateInr", "totalIncomeInrV3", "isNew", "slabs", "capEligibleSpecialTaxInr"),
        compute=lambda d, ctx: compute_india_surcharge(d["taxAfterRebateInr"], d["totalIncomeInrV3"], d["isNew"], d["slabs"], d["capEligibleSpecialTaxInr"]),
    ),
    "cessInrV3": NodeDef(deps=("taxAfterRebateInr", "surchargeInrV3"), compute=lambda d, ctx: (d["taxAfterRebateInr"] + d["surchargeInrV3"]) * T["CESS_RATE"]),

    "promoterBuybackExtraTaxInr": NodeDef(
        deps=("indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"),
        compute=_promoter_buyback_extra_tax_inr,
    ),

    "totalTaxInrV3": NodeDef(
        deps=("taxAfterRebateInr", "surchargeInrV3", "cessInrV3", "promoterBuybackExtraTaxInr"),
        compute=lambda d, ctx: d["taxAfterRebateInr"] + d["surchargeInrV3"] + d["cessInrV3"] + d["promoterBuybackExtraTaxInr"],
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
