"""India-domain findings — the 17 findings in test_findings_domain_split.py's
INDIA_FINDING_IDS whose compute() reads only India raw/domain facts (never
residencyResult/ftcResult/apportionmentResult/crossBasisResult/
mapDoubleTaxedIncomeResult directly).

Ports, by JS source file:
  - findings-nodes.js:            pan_not_linked_aadhaar
  - findings-batch2-nodes.js:     india_itr_form_mismatch, s115bbe_unexplained_income,
                                   chapter_xiia_elected_no_holdings,
                                   chapter_xiia_investment_income_missing,
                                   chapter_xiia_investment_income_computed
  - findings-batch3-nodes.js:     form_10iea, promoter_buyback_additional_tax, pe_article7
  - findings-batch4-nodes.js:     dtaa_treaty_elections, carry_forward_losses_not_applied
  - findings-batch5-nodes.js:     lrs_limit
  - in1-nodes.js + report-batch5-nodes.js: india_advance_tax_interest (split pattern)
  - residency-nodes.js's residencyConsistencyFindings (India branch only):
    residency_status_dtaa_conflated_india, residency_status_mismatch_india,
    residency_status_mismatch_india_company, residency_status_mismatch_india_entity

Two deliberate, documented deviations from a literal line-by-line port (both
substitute an india-only equivalent for a JS field that happened to be read
off a crossborder-domain node, so this file has zero crossborder deps):
  - dtaa_treaty_elections's isNrForS115a used JS's `residencyResult.india.status
    === "NR"` (crossborder/residency.py's own derivation) — substituted here
    with in1_v3.py's `isNRV3` (indiaResidencyStatusRawV3 === "NR"), the
    same underlying Layer 1 field read via India's own already-built node.
  - lrs_limit used JS's `hasIndiaScopeXbr` (crossborder/xborder_full.py) —
    substituted here with a fresh, self-contained `hasIndiaScope` raw-leaf
    derivation (same router.jurisdiction facts), mirroring the pattern
    us1_penalty_2210.py/us5_penalty_72t.py/black_money_act.py already use for
    their own standalone hasUsScope/hasIndiaScope leaves.
"""
from __future__ import annotations

from ..core.constants import LIMITS
from ..core.findings import make_finding
from ..core.graph import NodeDef
from ..core.util import format_inr, format_usd, num, safe
from ..crossborder import residency
from . import constants as C
from . import itr_form

S115A_RATES = C.INDIA["S115A_RATES"]


def _bracket_tax(amount: float, slabs: list) -> float:
    t, tax, prev = max(0.0, amount), 0.0, 0.0
    for cap, rate in slabs:
        if t > prev:
            tax += (min(t, cap) - prev) * rate
            prev = cap
        else:
            break
    return tax


def _inr(n: float) -> str:
    """Port of the local `inr(n)` helper duplicated at the top of every
    findings-batchN-nodes.js compute() — format_inr() with the ₹ prefix."""
    return f"₹{format_inr(n)}"


# ---- computeS115aStreamDetailed / computeNrInterestTreatmentDetailed:
# siblings of in1_v3.py's compute_s115a_stream/compute_nr_interest_treatment,
# same math, plus the per-election elections[] detail array.
# Port of findings-batch4-nodes.js's computeS115aStreamDetailed/
# computeNrInterestTreatmentDetailed. ----------------------------------------
def _compute_s115a_stream_detailed(treaty: dict, income_type: str, aggregate_total_inr) -> dict:
    domestic = S115A_RATES[income_type]
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


def _compute_nr_interest_treatment_detailed(treaty: dict, slabs: list, other_slab_income_inr: float, interest_aggregate_inr: float) -> dict:
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
        marginal_slab_tax_inr = _bracket_tax(other_slab_income_inr + interest_aggregate_inr, slabs) - _bracket_tax(other_slab_income_inr + interest_aggregate_inr - amt, slabs)
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


# ---- computeLossSetOffDetailed: sibling of in1_v3.py's compute_loss_set_off,
# same math, plus the used/unused per-category breakdown. Port of
# findings-batch4-nodes.js's computeLossSetOffDetailed. ----------------------
def _compute_loss_set_off_detailed(cfl: dict, buckets: dict) -> dict:
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
        "totalUsedInr": total_used_inr, "totalUnusedInr": total_unused_inr,
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


def _s115a_dividend_detailed(d, ctx):
    if not (d["isNRV3"] and not d["isEntityTaxpayer"]):
        return None
    return _compute_s115a_stream_detailed({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "dividend", d["dividendInr"])


def _s115a_royalty_detailed(d, ctx):
    if not (d["isNRV3"] and not d["isEntityTaxpayer"]):
        return None
    return _compute_s115a_stream_detailed({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "royalty", None)


def _s115a_fts_detailed(d, ctx):
    if not (d["isNRV3"] and not d["isEntityTaxpayer"]):
        return None
    return _compute_s115a_stream_detailed({"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]}, "fts", None)


def _nr_interest_detailed(d, ctx):
    if not d["isNRV3"] or d["isEntityTaxpayer"]:
        return None
    other_slab_income_inr = d["salaryInr"] + d["businessInrBoundaryV3"] + d["housePropertyInr"] + d["deemedDividendBuybackInrBoundary"] + d["otherSourcesMiscInrBoundary"]
    return _compute_nr_interest_treatment_detailed(
        {"trcStatus": d["treatyTrcStatus"], "form10fFiled": d["treatyForm10fFiled"], "treatyElections": d["treatyElectionsRaw"]},
        d["slabs"], other_slab_income_inr, d["interestInr"],
    )


def _loss_set_off_detailed(d, ctx):
    business_inr_raw = d["businessInrBoundaryV3"]
    unabsorbed_dep_this_year_inr = min(d["businessDepreciationInrBoundary"], -business_inr_raw) if business_inr_raw < 0 else 0
    cfl_for_set_off = {
        "businessLossAvailableInr": d["cflBusinessInr"], "speculativeLossAvailableInr": d["cflSpeculativeInr"],
        "stcgLossAvailableInr": d["cflStcgInr"], "ltcgLossAvailableInr": d["cflLtcgInr"],
        "housePropertyLossAvailableInr": d["cflHousePropertyInr"],
        "unabsorbedDepreciationCf": d["cflUnabsorbedDepreciationInr"] + unabsorbed_dep_this_year_inr,
    }
    nr_interest_slab_eligible_inr = d["nrInterest"]["slabEligibleInr"] if d["nrInterest"] else 0
    return _compute_loss_set_off_detailed(cfl_for_set_off, {
        "businessInr": max(0.0, business_inr_raw),
        "housePropertyInr": d["housePropertyInr"],
        "otherNormalInr": d["deemedDividendBuybackInrBoundary"] + d["otherSourcesMiscInrBoundary"] + (
            nr_interest_slab_eligible_inr if d["isNRV3"] else d["interestInr"] + d["dividendInr"]
        ),
        "stcgInr": d["stcgInrBoundary"], "stcgSlabInr": d["stcgSlabInrBoundary"], "ltcgGrossInr": d["ltcgInrBoundary"],
        "ltcg197Inr": d["ltcg197InrBoundary"], "speculativeInr": max(0.0, d["speculativeIncomeInrBoundaryV3"]),
    })


def _promoter_buyback_detail(d, ctx):
    T = C.INDIA
    PROMOTER_TARGET_NON_CORP = T["PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE"]
    PROMOTER_TARGET_CORP = T["PROMOTER_BUYBACK_TARGET_RATE_CORPORATE"]
    is_corporate_promoter = d["indiaEntityTypeRawV3"] == "company"
    target_rate = PROMOTER_TARGET_CORP if is_corporate_promoter else PROMOTER_TARGET_NON_CORP
    ltcg_gain_inr = d["promoterBuybackLtcgInrBoundary"] or 0
    stcg_gain_inr = d["promoterBuybackStcgInrBoundary"] or 0
    ltcg_additional_inr = max(0.0, ltcg_gain_inr) * max(0.0, target_rate - T["LTCG_112_RATE"])
    stcg_additional_inr = max(0.0, stcg_gain_inr) * max(0.0, target_rate - T["STCG_111A_RATE"])
    additional_tax_inr = ltcg_additional_inr + stcg_additional_inr
    if additional_tax_inr <= 0:
        return None
    surcharge_inr = additional_tax_inr * T["PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE"]
    cess_inr = (additional_tax_inr + surcharge_inr) * T["CESS_RATE"]
    return {
        "isCorporatePromoter": is_corporate_promoter, "targetRate": target_rate, "ltcgGainInr": ltcg_gain_inr, "stcgGainInr": stcg_gain_inr,
        "additionalTaxInr": additional_tax_inr, "surchargeInr": surcharge_inr, "cessInr": cess_inr,
        "totalExtraTaxInr": additional_tax_inr + surcharge_inr + cess_inr,
    }


# ---- IN-1: advance-tax interest (ss.424/425) — the "split pattern" finding.
# Port of in1-nodes.js + report-batch5-nodes.js's indiaAdvanceTaxInterestFinding.
# assessedTaxInrBoundary/hasValidPresumptiveEntryBoundary/hasRegularBooksEntry
# Boundary/hasPartnerFirmIncomeBoundary/businessInrBoundary/speculativeIncome
# InrBoundary/indianBusinessesBoundary were in1-nodes.js's own v1-era
# EXPLICIT BOUNDARY INPUTS (read ctx["model"]/ctx["computed"]...) — but
# in1-nodes.js is dead build history (never required by the live production
# graph.js chain; only run-in1.js's standalone runner uses it), and
# agg10-nodes.js already closed all 6 of these against real in-graph
# equivalents that live entirely within the india domain (businessComputation/
# speculativeIncomeInrAgg/totalTaxInrCombined/annualSliceAgg). Closed the
# same way here, directly, rather than left open — see the NODES dict below.
# routerJurisdiction/routerUsSignal/hasIndiaScope are a fresh, self-contained
# leaf trio (not shared with xborder_full.py's routerJurisdictionXB/
# hasIndiaScopeXbr) — same standalone-file convention those three US files
# already established. -----------------------------
def _router_us_signal(ctx) -> bool:
    router = ctx.get("router")
    return (
        num(safe(router, "us_days", 0)) > 0 or safe(router, "is_us_citizen", False) is True or
        safe(router, "has_green_card", False) is True or safe(router, "has_us_source_income_or_assets", False) is True
    )


def _in_turnover_for_audit(d, ctx):
    total_inr, cash_inr = 0.0, 0.0
    for b in d["indianBusinessesBoundary"] or []:
        digital = num(b.get("digital_receipts_inr")) + num(b.get("ada_digital_receipts_inr"))
        cash = num(b.get("cash_receipts_inr")) + num(b.get("ada_cash_receipts_inr"))
        receipts = num(b.get("gross_receipts_inr")) or num(b.get("turnover_inr")) or (digital + cash)
        total_inr += receipts
        cash_inr += cash
    if total_inr <= 0:
        return False
    threshold = 100000000 if (cash_inr / total_inr) <= 0.05 else 10000000
    return total_inr > threshold


def _age_at_fy_end(d, ctx):
    from ..core.dates import parse_date
    if not d["dobRawIn1"]:
        return None
    dob = parse_date(d["dobRawIn1"])
    if dob is None:
        return None
    fy_end_year, fy_end_month, fy_end_day = (d["baseYearIn1"] or 2025) + 1, 3, 31
    age = fy_end_year - dob.year
    if (fy_end_month, fy_end_day) < (dob.month, dob.day):
        age -= 1
    return age


def _s424_inr(d, ctx):
    if not d["inAdvTaxObliged"] or d["assessedTaxInr"] <= 0 or d["advancePaidInr"] >= d["assessedTaxInr"] * 0.9:
        return 0.0
    return (d["assessedTaxInr"] - d["advancePaidInr"]) * 0.01 * d["inS424Months"]


def _s425_inr(d, ctx):
    if not d["inAdvTaxObliged"] or d["assessedTaxInr"] <= 0:
        return 0.0
    if d["inPurelyPresumptive"]:
        installments = [{"required": 1.00, "paid": d["advQ1Inr"] + d["advQ2Inr"] + d["advQ3Inr"] + d["advQ4Inr"], "months": 1}]
    else:
        installments = [
            {"required": 0.15, "paid": d["advQ1Inr"], "months": 3},
            {"required": 0.30, "paid": d["advQ2Inr"], "months": 3},
            {"required": 0.30, "paid": d["advQ3Inr"], "months": 3},
            {"required": 0.25, "paid": d["advQ4Inr"], "months": 1},
        ]
    total = 0.0
    for q in installments:
        short_inr = max(0.0, d["assessedTaxInr"] * q["required"] - q["paid"])
        total += short_inr * 0.01 * q["months"]
    return total


NODES = {
    # ---- raw leaves not read by any earlier-closed phase --------------------
    "panAadhaarLinkedRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.pan_aadhaar_linked", None), layer1_fields=("india.profile.pan_aadhaar_linked",)),
    "chapterXiiaElectedRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "compliance_docs.chapter_xiia_elected", False) is True, layer1_fields=("india.compliance_docs.chapter_xiia_elected",)),
    "hasPERaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.has_permanent_establishment_in_india", False) is True, layer1_fields=("india.dtaa.has_permanent_establishment_in_india",)),

    # ---- dtaa_treaty_elections/carry_forward_losses_not_applied detail nodes
    "s115aDividendDetailed": NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"), compute=_s115a_dividend_detailed),
    "s115aRoyaltyDetailed": NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=_s115a_royalty_detailed),
    "s115aFtsDetailed": NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=_s115a_fts_detailed),
    "nrInterestDetailed": NodeDef(
        deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
              "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"),
        compute=_nr_interest_detailed,
    ),
    "lossSetOffDetailed": NodeDef(
        deps=("businessInrBoundaryV3", "businessDepreciationInrBoundary", "cflBusinessInr", "cflSpeculativeInr", "cflStcgInr", "cflLtcgInr",
              "cflHousePropertyInr", "cflUnabsorbedDepreciationInr", "housePropertyInr", "isNRV3", "nrInterest",
              "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr", "dividendInr",
              "stcgInrBoundary", "stcgSlabInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "speculativeIncomeInrBoundaryV3"),
        compute=_loss_set_off_detailed,
    ),
    "carryForwardLossesMetaRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "hasBroughtForwardLosses": safe(ctx.get("india"), "carry_forward_losses.has_brought_forward_losses", None),
            "businessLossCfCount": len(safe(ctx.get("india"), "carry_forward_losses.business_loss_cf", []) or []),
            "speculativeLossCfCount": len(safe(ctx.get("india"), "carry_forward_losses.speculative_loss_cf", []) or []),
            "stcgLossCfCount": len(safe(ctx.get("india"), "carry_forward_losses.stcg_loss_cf", []) or []),
            "ltcgLossCfCount": len(safe(ctx.get("india"), "carry_forward_losses.ltcg_loss_cf", []) or []),
            "housePropertyLossCfCount": len(safe(ctx.get("india"), "carry_forward_losses.house_property_loss_cf", []) or []),
            "unabsorbedDepreciationCf": num(safe(ctx.get("india"), "carry_forward_losses.unabsorbed_depreciation_cf", 0)),
        },
        layer1_fields=(
            "india.carry_forward_losses.has_brought_forward_losses", "india.carry_forward_losses.business_loss_cf",
            "india.carry_forward_losses.speculative_loss_cf", "india.carry_forward_losses.stcg_loss_cf",
            "india.carry_forward_losses.ltcg_loss_cf", "india.carry_forward_losses.house_property_loss_cf",
            "india.carry_forward_losses.unabsorbed_depreciation_cf",
        ),
    ),

    # ---- promoter_buyback_additional_tax detail node -------------------------
    "promoterBuybackDetail": NodeDef(deps=("indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"), compute=_promoter_buyback_detail),

    # ---- IN-1 advance-tax-interest chain (self-contained, deferred boundary) -
    "routerJurisdictionIn1": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "jurisdiction", None), layer1_fields=("router.jurisdiction",)),
    "routerUsSignalIn1": NodeDef(deps=(), compute=lambda d, ctx: _router_us_signal(ctx), layer1_fields=("router.us_days", "router.is_us_citizen", "router.has_green_card", "router.has_us_source_income_or_assets")),
    "hasIndiaScope": NodeDef(deps=("routerJurisdictionIn1",), compute=lambda d, ctx: d["routerJurisdictionIn1"] not in ("single_us", "us_only")),
    "dobRawIn1": NodeDef(
        deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "date_of_birth", safe(ctx.get("india"), "profile.date_of_birth", safe(ctx.get("us"), "profile.date_of_birth", None))),
        layer1_fields=("router.date_of_birth", "india.profile.date_of_birth", "us.profile.date_of_birth"),
    ),
    "advQ1Inr": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.advance_tax_q1_15jun_inr", 0)), layer1_fields=("india.tax_credits.advance_tax_q1_15jun_inr",)),
    "advQ2Inr": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.advance_tax_q2_15sep_inr", 0)), layer1_fields=("india.tax_credits.advance_tax_q2_15sep_inr",)),
    "advQ3Inr": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.advance_tax_q3_15dec_inr", 0)), layer1_fields=("india.tax_credits.advance_tax_q3_15dec_inr",)),
    "advQ4Inr": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.advance_tax_q4_15mar_inr", 0)), layer1_fields=("india.tax_credits.advance_tax_q4_15mar_inr",)),
    "tdsInrIn1": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.tds_already_deducted_inr", 0)) + num(safe(ctx.get("india"), "tax_credits.tds_inr", 0)), layer1_fields=("india.tax_credits.tds_already_deducted_inr", "india.tax_credits.tds_inr")),
    "tcsInrIn1": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "tax_credits.tcs_inr", 0)), layer1_fields=("india.tax_credits.tcs_inr",)),
    "baseYearIn1": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.meta.baseYear", None)),

    # These six were originally in1-nodes.js's own v1-era boundary stubs
    # (reading ctx["model"]/ctx["computed"], which don't exist in this app's
    # real {router, india, us} ctx shape at all — in1-nodes.js is dead build
    # history, never required by the live production chain). agg10-nodes.js
    # closed all of them against the now-existing in-graph equivalents
    # (its own header: "the four original finding graphs' v1-era boundaries
    # ... all 16 closed here"); every one of those 6 closures reads only
    # already-available india-domain nodes (businessComputation/
    # speculativeIncomeInrAgg/totalTaxInrCombined/annualSliceAgg, all
    # present by the time this build() runs, since itr_form.build()/
    # india_full.build() already ran above) — no cross-domain composition
    # needed, so closed here directly rather than deferred to Phase 7.
    "assessedTaxInrBoundary": NodeDef(deps=("totalTaxInrCombined",), compute=lambda d, ctx: num(d["totalTaxInrCombined"])),
    "hasValidPresumptiveEntryBoundary": NodeDef(deps=("businessComputation",), compute=lambda d, ctx: d["businessComputation"]["indiaHasValidPresumptiveEntry"] is True),
    "hasRegularBooksEntryBoundary": NodeDef(deps=("businessComputation",), compute=lambda d, ctx: d["businessComputation"]["indiaHasRegularBooksEntry"] is True),
    "hasPartnerFirmIncomeBoundary": NodeDef(deps=("businessComputation",), compute=lambda d, ctx: d["businessComputation"]["indiaHasPartnerFirmIncome"] is True),
    "businessInrBoundaryIn1": NodeDef(deps=("businessComputation",), compute=lambda d, ctx: num(d["businessComputation"]["businessInr"])),
    "speculativeIncomeInrBoundaryIn1": NodeDef(deps=("speculativeIncomeInrAgg",), compute=lambda d, ctx: num(d["speculativeIncomeInrAgg"])),
    # normalize.js L2551: assets.indianBusinesses = annual.domestic_income.business_income.business_entries
    "indianBusinessesBoundary": NodeDef(deps=("annualSliceAgg",), compute=lambda d, ctx: safe(d["annualSliceAgg"].get("domestic_income") or {}, "business_income.business_entries", [])),

    "isResidentIndiaIn1": NodeDef(deps=("indiaResidencyStatusRawV3",), compute=lambda d, ctx: d["indiaResidencyStatusRawV3"] in ("ROR", "RNOR")),
    "ageAtFyEndIn1": NodeDef(deps=("dobRawIn1", "baseYearIn1"), compute=_age_at_fy_end),
    "isIndividualTaxpayerIn1": NodeDef(deps=("indiaEntityTypeRaw",), compute=lambda d, ctx: d["indiaEntityTypeRaw"] == "individual"),

    "advancePaidInr": NodeDef(deps=("advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"), compute=lambda d, ctx: d["advQ1Inr"] + d["advQ2Inr"] + d["advQ3Inr"] + d["advQ4Inr"]),
    "inTurnoverForAudit": NodeDef(deps=("indianBusinessesBoundary",), compute=_in_turnover_for_audit),
    "inIsAuditCase": NodeDef(deps=("indiaIsCompany", "inTurnoverForAudit"), compute=lambda d, ctx: d["indiaIsCompany"] or d["inTurnoverForAudit"]),
    "inS424Months": NodeDef(deps=("inIsAuditCase",), compute=lambda d, ctx: 7 if d["inIsAuditCase"] else 4),

    "hasPgbpIncome": NodeDef(
        deps=("businessInrBoundaryIn1", "speculativeIncomeInrBoundaryIn1", "hasRegularBooksEntryBoundary", "hasValidPresumptiveEntryBoundary", "hasPartnerFirmIncomeBoundary"),
        compute=lambda d, ctx: d["businessInrBoundaryIn1"] != 0 or d["speculativeIncomeInrBoundaryIn1"] != 0 or d["hasRegularBooksEntryBoundary"] or d["hasValidPresumptiveEntryBoundary"] or d["hasPartnerFirmIncomeBoundary"],
    ),
    "assessedTaxInr": NodeDef(deps=("assessedTaxInrBoundary", "tdsInrIn1", "tcsInrIn1"), compute=lambda d, ctx: max(0.0, d["assessedTaxInrBoundary"] - d["tdsInrIn1"] - d["tcsInrIn1"])),
    "inAdvTaxObliged": NodeDef(
        deps=("assessedTaxInr", "isIndividualTaxpayerIn1", "isResidentIndiaIn1", "ageAtFyEndIn1", "hasPgbpIncome"),
        compute=lambda d, ctx: False if d["assessedTaxInr"] < 10000 else (
            False if (d["isIndividualTaxpayerIn1"] and d["isResidentIndiaIn1"] and d["ageAtFyEndIn1"] is not None and d["ageAtFyEndIn1"] >= 60 and not d["hasPgbpIncome"]) else True
        ),
    ),
    "inPurelyPresumptive": NodeDef(
        deps=("hasValidPresumptiveEntryBoundary", "hasRegularBooksEntryBoundary", "hasPartnerFirmIncomeBoundary"),
        compute=lambda d, ctx: bool(d["hasValidPresumptiveEntryBoundary"] and not d["hasRegularBooksEntryBoundary"] and not d["hasPartnerFirmIncomeBoundary"]),
    ),
    "s424Inr": NodeDef(deps=("inAdvTaxObliged", "assessedTaxInr", "advancePaidInr", "inS424Months"), compute=_s424_inr),
    "s425Inr": NodeDef(deps=("inAdvTaxObliged", "assessedTaxInr", "inPurelyPresumptive", "advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"), compute=_s425_inr),
    "totalInterestInrIn1": NodeDef(deps=("hasIndiaScope", "s424Inr", "s425Inr"), scope_gate="hasIndiaScope", out_of_scope_value=0, compute=lambda d, ctx: d["s424Inr"] + d["s425Inr"]),
    "in1ShouldFire": NodeDef(deps=("hasIndiaScope", "totalInterestInrIn1"), scope_gate="hasIndiaScope", out_of_scope_value=False, compute=lambda d, ctx: d["totalInterestInrIn1"] > 100),
}


def _findings_india_result(d, ctx):
    findings = []

    # -- pan_not_linked_aadhaar (findings-nodes.js, conflicts.js:254-273) -----
    if d["panAadhaarLinkedRaw"] is False:
        findings.append(make_finding(
            "pan_not_linked_aadhaar", "critical", "document",
            "PAN not linked to Aadhaar — PAN is inoperative, higher TDS/TCS applies",
            "Layer 1 records the PAN as NOT linked to Aadhaar. Under Rule 114AAA an unlinked PAN is treated as inoperative — "
            "every payer must withhold TDS/TCS at the higher default rate u/s 397(2) (generally 20%, or double the "
            "normal TCS rate, whichever is higher) as if no PAN had been furnished at all, REGARDLESS of any lower slab, "
            "special, or DTAA treaty rate that would otherwise apply — including the treaty elections above, if any. "
            "Refunds are also withheld while the PAN remains inoperative, and interest keeps accruing for that period.",
            "Link PAN to Aadhaar (paying the applicable late fee) before relying on any withholding-rate, refund, or treaty-"
            "election figure on this page — every number computed here assumes a valid, operative PAN.",
            0, ["s.397(2)", "Rule 114AAA", "PAN inoperative"],
        ))

    # -- india_itr_form_mismatch (findings-batch2-nodes.js, conflicts.js:1389-1411) --
    itr_m = d["indiaItrFormResult"]
    if itr_m and itr_m["matchesFrontend"] is False:
        findings.append(make_finding(
            "india_itr_form_mismatch", "warning", "document",
            f"ITR form disagreement: WISING computes {itr_m['form']}, Layer 1 says {itr_m['frontendForm']}",
            "WISING's own independent eligibility check (income thresholds, residency, capital gains, foreign assets/income, "
            f"crypto, house-property count, brought-forward losses, speculative/F&O income) computes {itr_m['form']}. "
            f"Layer 1 India's own recommendation, last computed client-side, was {itr_m['frontendForm']} "
            f"(\"{itr_m.get('frontendExplanation') or 'no explanation on file'}\"). Common causes: Layer 1's client-side check ran "
            "before a later edit (its recommendation is only recomputed when the eligibility function re-runs, not on every "
            "field change), or a genuine difference in what each side reads (see computeIndiaItrForm's header comment for three "
            "confirmed Layer 1 field bugs this backend check deliberately doesn't inherit).",
            f"Trust WISING's {itr_m['form']} unless you can identify a specific reason Layer 1's client-side check is right and "
            "this backend computation is wrong — re-running Layer 1's eligibility check (revisit the Review/Summary step) after "
            "any income or residency edit is the most common fix.",
            0, ["ITR eligibility", itr_m["form"], itr_m["frontendForm"]],
        ))

    # -- s115bbe_unexplained_income (findings-batch2-nodes.js, conflicts.js:936-956) --
    if (d["unexplained115bbeInrAgg"] or 0) > 0:
        findings.append(make_finding(
            "s115bbe_unexplained_income", "critical", "income",
            "Unexplained income on file (s.195) — not reflected in the India tax computed above",
            f"{_inr(d['unexplained115bbeInrAgg'])} is recorded as unexplained "
            "income under s.195. This carries a flat ~39% effective rate (30% tax + 25% surcharge + 4% cess, per Finance "
            "Act 2026) and — unlike any other provision — denies every deduction, exemption, and loss set-off with no "
            "exceptions. The India tax figure above does not include this; it needs to be added separately.",
            "Compute the s.195 addition separately at the full ~39% effective rate before relying on the India tax total "
            "above, and confirm the source of these funds is genuinely unexplained rather than misclassified income that "
            "belongs under a normal head.",
            0, ["s.195"],
        ))

    # -- 4g. CHAPTER XII-A elected (findings-batch2-nodes.js, conflicts.js:856-912) --
    cg = d["capitalGainsComputation"]
    xiia_holding_count = cg.get("chapterXiiaSfeaHoldingCount") or 0
    xiia_inv_income_inr = cg.get("chapterXiiaInvestmentIncomeInr") or 0
    if d["chapterXiiaElectedRaw"] and xiia_holding_count == 0:
        findings.append(make_finding(
            "chapter_xiia_elected_no_holdings", "warning", "credit",
            "Chapter XII-A elected, but no Financial Holdings transaction is marked as a specified foreign-exchange asset",
            "The Layer 1 Chapter XII-A election is on, but none of the Financial Holdings transactions on file are flagged "
            "as \"Specified Foreign Exchange Asset (NRI)\" — s.217/212's flat-rate regime only applies to shares/debentures/"
            "deposits/government securities actually purchased in convertible foreign exchange. Either a specified holding "
            "exists but wasn't flagged (so its capital gains and investment income are being computed under ordinary rules "
            "instead), or the election isn't actually needed this year.",
            "If a specified holding exists, mark it \"Specified Foreign Exchange Asset\" on its Financial Holdings entry so "
            "it gets the correct s.217/212 treatment. If none exists, consider whether the election is still needed.",
            0, ["s.217", "s.212", "Chapter XII-A"],
        ))
    elif d["chapterXiiaElectedRaw"] and xiia_holding_count > 0 and xiia_inv_income_inr < 1:
        findings.append(make_finding(
            "chapter_xiia_investment_income_missing", "warning", "credit",
            f"Chapter XII-A elected, {xiia_holding_count} specified holding(s) on file — but no investment income entered for any of them",
            f"The Layer 1 Chapter XII-A election is on, and {xiia_holding_count} Financial Holdings transaction(s) are marked as a "
            "specified foreign-exchange asset — but none of them has an \"Investment Income This Year\" figure entered. A specified "
            "debenture or deposit almost always earns some interest, and specified shares may pay dividends; if any of these holdings "
            "did, that income is taxed at a flat 20% under s.217/212 (s.115E(1)(a)) — separate from, and in addition to, any capital "
            "gains already reflected below.",
            "Check each specified holding for interest/dividend actually received this year and enter it in the \"Investment Income "
            "This Year\" field — if genuinely none was received (e.g. a zero-coupon instrument still accruing, or shares that paid no "
            "dividend), no action needed.",
            0, ["s.217", "s.212", "Chapter XII-A", "s.115E"],
        ))
    elif d["chapterXiiaElectedRaw"] and xiia_inv_income_inr > 0:
        findings.append(make_finding(
            "chapter_xiia_investment_income_computed", "info", "credit",
            f"Chapter XII-A investment income of {_inr(xiia_inv_income_inr)} included at the flat 20% rate",
            f"Interest/dividend entered against your Chapter XII-A specified holdings ({_inr(xiia_inv_income_inr)} total) is taxed "
            "at the flat 20% s.217/212 (s.115E(1)(a)) rate in the India tax computed below — no Chapter VI-A deductions or basic "
            "exemption apply to this slice, per Chapter XII-A's own rules.",
            "Confirm this figure covers ALL specified holdings' interest/dividend for the year, not just some of them.",
            0, ["s.217", "s.212", "Chapter XII-A", "s.115E"],
        ))

    # -- 4c4. FORM 10-IEA (findings-batch3-nodes.js, conflicts.js:573-588) -----
    # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6): widened
    # to also exclude AOP/Trust — must stay in sync with checks-registry's gate.
    if d["taxRegime"] == "OLD" and (d["businessComputation"]["businessInr"] or 0) > 0 and not d["indiaIsCompany"] and not d["indiaIsFirm"] and not d["indiaIsAop"] and not d["indiaIsTrust"]:
        findings.append(make_finding(
            "form_10iea", "warning", "document",
            "Form 10-IEA required to elect the old regime with business/professional income",
            "The old tax regime is selected and business/professional (PGBP) income is on file. Unlike a salary-only filer, an "
            "assessee with PGBP income can't just choose the old regime on the ITR itself — Form 10-IEA must be filed by the "
            "s.139(1) due date, and once withdrawn from the old regime this way, old-regime eligibility is gone for good "
            "except for those without PGBP income.",
            "File Form 10-IEA before the ITR due date. Confirm this taxpayer hasn't already exercised and withdrawn the "
            "election in a prior year, which would make the old regime unavailable regardless of what's chosen this year.",
            0, ["Form 10-IEA", "s.115BAC(6)"],
        ))

    # -- 10b2. PROMOTER ADDITIONAL TAX ON BUYBACK GAINS (findings-batch3-nodes.js, conflicts.js:1248-1269) --
    pb = None if (d["indiaIsCompany"] or d["indiaIsFirm"] or d["indiaIsAop"] or d["indiaIsTrust"]) else d["promoterBuybackDetail"]
    if pb and pb["totalExtraTaxInr"] > 1:
        findings.append(make_finding(
            "promoter_buyback_additional_tax", "warning", "income",
            f"Promoter additional tax on buy-back gains — {_inr(pb['additionalTaxInr'] + pb['surchargeInr'] + pb['cessInr'])} on top of ordinary capital-gains tax",
            f"As a promoter (s.69(2)(b)) on this buy-back, the ordinary {'12.5% LTCG' if pb['ltcgGainInr'] > 0 else '20% STCG'} "
            f"tax on the gain is not the end of it: an additional tax brings the combined rate to "
            f"{round(pb['targetRate'] * 100)}% ({'corporate promoter' if pb['isCorporatePromoter'] else 'non-corporate promoter'}"
            "), and a further 12% surcharge applies on that additional tax specifically — irrespective of total income. "
            f"Additional tax: {_inr(pb['additionalTaxInr'])}; surcharge: {_inr(pb['surchargeInr'])}; cess: {_inr(pb['cessInr'])}.",
            "Confirm promoter status (direct/indirect >10% shareholding, or Companies Act/SEBI promoter designation) is "
            "correct before relying on this — the additional tax and surcharge do not apply to non-promoter shareholders "
            "in the same buy-back at all.",
            pb["totalExtraTaxInr"] / 83, ["s.69(2)(b)", "Promoter additional tax", "Share buyback"],
        ))

    # -- 4f. PERMANENT ESTABLISHMENT — ARTICLE 7 (findings-batch3-nodes.js, conflicts.js:681-699) --
    business_usd = (d["businessComputation"]["businessInr"] or 0) / 83
    if d["hasPERaw"] and business_usd > 0:
        findings.append(make_finding(
            "pe_article7", "warning", "treaty",
            "Permanent establishment in India — Article 7 business profits survive the tie-breaker",
            f"A permanent establishment in India is on file alongside {format_usd(business_usd)}"
            " of Indian business/professional income. Even where the DTAA Article 4 tie-breaker resolves general treaty "
            "residence away from India, Article 7 still gives India the right to tax profits ATTRIBUTABLE to that PE — the "
            "tie-breaker result doesn't exempt PE profits the way it can exempt other income categories.",
            "Confirm profit attribution to the PE (functions/assets/risks, arm's-length pricing) separately from the general "
            "residency analysis, and don't assume a 'ceded' India residence removes India's claim on PE-sourced business profits.",
            0, ["DTAA Art. 7", "Permanent establishment"],
        ))

    # -- 3b. DTAA TREATY RATE ELECTIONS ON FILE (findings-batch4-nodes.js, conflicts.js:145-224) --
    treaty_elections = d["treatyElectionsRaw"]
    if len(treaty_elections) > 0:
        is_nr_for_s115a = d["isNRV3"]  # see module docstring: substitutes crossborder's residencyResult.india.status === "NR"
        docs_shortfall = []
        if not d["treatyTrcStatus"]:
            docs_shortfall.append("TRC (IRS Form 6166)")
        if not d["treatyForm10fFiled"]:
            docs_shortfall.append("Form 41")
        s115a_by_type = {"dividend": d["s115aDividendDetailed"], "royalty": d["s115aRoyaltyDetailed"], "fts": d["s115aFtsDetailed"]}
        nr_interest_elections = (d["nrInterestDetailed"] or {}).get("elections") or []
        interest_seen = 0
        type_seen = {"dividend": 0, "royalty": 0, "fts": 0}
        computed_s115a_types = {"dividend": True, "royalty": True, "fts": True}
        election_parts = []
        for e in treaty_elections:
            if not e or not e.get("income_type"):
                continue
            pct = f"{round(e['elected_rate'] * 100)}%" if e.get("elected_rate") is not None else "unset rate"
            amt_inr = num(e.get("amount_inr"))
            amt_str = f" on {_inr(amt_inr)}" if amt_inr > 1 else " (no amount entered)"
            if not is_nr_for_s115a:
                computed_tag = " [not applied — taxpayer is not NR, see below]"
            elif e["income_type"] == "capital_gains":
                computed_tag = " [not applied — no special treaty rate under Art. 13 for capital gains]"
            elif amt_inr <= 1:
                computed_tag = " [not applied — no amount entered against this election]"
            elif e["income_type"] == "interest":
                ie = nr_interest_elections[interest_seen] if interest_seen < len(nr_interest_elections) else None
                interest_seen += 1
                if not ie:
                    computed_tag = " [not applied]"
                elif ie["outcome"] == "denied_no_docs":
                    computed_tag = " [election denied — TRC/Form 41 missing, ordinary slab rates apply to this slice instead]"
                elif ie["outcome"] == "treaty_beats_slab":
                    computed_tag = " [elected rate applied — beats the marginal slab rate this slice would otherwise cost]"
                else:
                    computed_tag = " [not applied — the marginal slab rate on this slice is already cheaper than the elected treaty rate]"
            elif computed_s115a_types.get(e["income_type"]):
                stream = s115a_by_type.get(e["income_type"])
                idx = type_seen[e["income_type"]]
                type_seen[e["income_type"]] += 1
                se = (stream.get("elections") or [None])[idx] if stream and idx < len(stream.get("elections") or []) else None
                domestic = S115A_RATES.get(e["income_type"])
                compare_dom = f" (vs {round(domestic * 100)}% domestic s.207 rate)" if domestic is not None else ""
                if not se:
                    computed_tag = " [not applied]" + compare_dom
                elif se["outcome"] == "denied_no_docs":
                    computed_tag = f" [election denied — domestic {round(domestic * 100)}% rate applied instead, TRC/Form 41 missing]"
                elif se["outcome"] == "elected_rate_applied":
                    computed_tag = f" [elected rate applied to the India tax above{compare_dom}]"
                else:
                    computed_tag = f" [domestic {round(domestic * 100)}% rate applied instead — it's more beneficial than the elected rate]"
            else:
                computed_tag = " [not applied]"
            article = f" ({e['treaty_article']})" if e.get("treaty_article") else ""
            election_parts.append(f"{e['income_type']} @ {pct}{article}{amt_str}{computed_tag}")

        findings.append(make_finding(
            "dtaa_treaty_elections", "warning" if docs_shortfall else "info", "treaty",
            f"{len(election_parts)} DTAA treaty rate election(s) on file",
            "Layer 1 records a claimed treaty rate on the following India-source income stream(s): " + "; ".join(election_parts) + "." +
            (
                " This taxpayer is resident (not NR) under India's own domestic law, so s.207 and every election above "
                "has NO effect regardless of income type; residents are taxed on this income at slab rates instead. If the "
                "taxpayer is genuinely meant to be NR, check the residency determination; if not, these elections are moot."
                if not is_nr_for_s115a else
                " Dividend, royalty and FTS elections are compared against the flat domestic s.207 rate (s.159, whichever "
                "is lower). Interest is different — ordinary NRO interest isn't actually s.207 income (that concessional "
                "rate is narrow, foreign-currency-borrowing interest only), so it's slab-rate income by default, and an "
                "election only helps when the flat treaty rate beats the marginal slab rate on that specific slice. Capital-"
                "gains elections are NOT applied — Art. 13 itself provides no special treaty rate, domestic law governs "
                "regardless (see Part H)."
            ) +
            (
                (" Layer 1 does NOT show " + " or ".join(docs_shortfall) + " on file — every one of these elections is at risk of "
                 "being denied and defaulting back to slab/domestic rates without it.") if docs_shortfall else ""
            ),
            ("Obtain " + " and ".join(docs_shortfall) + " before relying on any of these elected rates — without it, the payer/"
             "assessing officer can withhold or assess at the full domestic rate shown above instead.") if docs_shortfall else
            "Confirm each elected rate against the current India-US DTAA text for that article — TRC and Form 41 are on file, "
            "but that alone doesn't verify the specific article/rate claimed is correct for this income stream.",
            0, ["DTAA treaty election", "s.207", "s.159", "s.159(8)"],
        ))

    # -- 4g4. CARRY-FORWARD LOSSES — NOW ACTUALLY SET OFF (findings-batch4-nodes.js, conflicts.js:958-1013) --
    cfl = d["carryForwardLossesMetaRaw"]
    cfl_count = cfl["businessLossCfCount"] + cfl["speculativeLossCfCount"] + cfl["stcgLossCfCount"] + cfl["ltcgLossCfCount"] + cfl["housePropertyLossCfCount"]
    lso = None if d["isEntityTaxpayer"] else d["lossSetOffDetailed"]
    if lso and (cfl["hasBroughtForwardLosses"] is True or cfl_count > 0 or cfl["unabsorbedDepreciationCf"] > 0):
        applied_parts = []
        if lso["used"]["businessInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['businessInr'])} business loss vs. business income")
        if lso["used"]["stcgSlabInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['stcgSlabInr'])} STCG loss vs. slab-rate STCG (s.69 unlisted buy-back)")
        if lso["used"]["stcgInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['stcgInr'])} STCG loss vs. STCG")
        if lso["used"]["ltcgFromStcgLossInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['ltcgFromStcgLossInr'])} STCG loss vs. LTCG")
        if lso["used"]["ltcgInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['ltcgInr'])} LTCG loss vs. LTCG")
        if lso["used"]["housePropertyInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['housePropertyInr'])} house-property loss vs. house-property income")
        if lso["used"]["unabsorbedDepreciationInr"] > 1:
            applied_parts.append(f"{_inr(lso['used']['unabsorbedDepreciationInr'])} unabsorbed depreciation")

        unused_parts = []
        if lso["unused"]["businessInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['businessInr'])} business loss (no business income left to absorb it)")
        if lso["unused"]["stcgInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['stcgInr'])} STCG loss")
        if lso["unused"]["ltcgInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['ltcgInr'])} LTCG loss")
        if lso["unused"]["housePropertyInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['housePropertyInr'])} house-property loss")
        if lso["unused"]["speculativeInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['speculativeInr'])} speculative loss (not modeled — see note)")
        if lso["unused"]["unabsorbedDepreciationInr"] > 1:
            unused_parts.append(f"{_inr(lso['unused']['unabsorbedDepreciationInr'])} unabsorbed depreciation")

        if lso["totalUsedInr"] > 1 and lso["totalUnusedInr"] <= 1:
            findings.append(make_finding(
                "carry_forward_losses_not_applied", "info", "credit",
                "Brought-forward losses fully set off this year",
                "All eligible prior-year losses were absorbed against this year's income: " + "; ".join(applied_parts) +
                ". The India tax computed above already reflects this — no residual carry-forward remains.",
                "Confirm the set-off is reported correctly on Schedule CFL/BFLA of the ITR, matching the ordering above.",
                0, ["Loss carry-forward", "s.110", "s.112", "s.111"],
            ))
        elif lso["totalUsedInr"] > 1:
            findings.append(make_finding(
                "carry_forward_losses_not_applied", "warning", "credit",
                "Brought-forward losses partially set off — some still carrying forward",
                "Applied this year: " + "; ".join(applied_parts) + ". Still carrying forward (no matching current-year income "
                "to absorb it, or — for speculative loss — not modeled at all): " + "; ".join(unused_parts) + ".",
                "Track the unused amounts on Schedule CFL for future years (subject to the 8-year limit, indefinite for "
                "unabsorbed depreciation), and confirm speculative-income figures separately since WISING doesn't model that bucket.",
                0, ["Loss carry-forward", "s.110", "s.112", "s.111"],
            ))
        else:
            findings.append(make_finding(
                "carry_forward_losses_not_applied", "warning", "credit",
                "Brought-forward losses on file — none could be set off against this year's income",
                "Prior-year losses are recorded (" + "; ".join(unused_parts) + "), but there is no matching current-year income "
                "in the same head(s) to absorb any of it — the India tax computed above is correct as-is; these losses simply "
                "carry forward untouched.",
                "Track these on Schedule CFL for a future year with matching income (subject to the 8-year limit for capital/"
                "business losses, indefinite for unabsorbed depreciation).",
                0, ["Loss carry-forward", "s.110", "s.112", "s.111"],
            ))

    # -- 11. LRS LIMIT MONITORING (findings-batch5-nodes.js, conflicts.js:1446-1457) --
    LRS_ANNUAL_USD = LIMITS["LRS_ANNUAL_USD"]
    if d["hasIndiaScope"]:
        lrs_remitted_inr = num(safe(d["annualSliceAgg"], "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)) or num(safe(ctx.get("india"), "lrs_outbound.total_lrs_remitted_this_fy_inr", 0))
        lrs_value_usd = lrs_remitted_inr / 83
        pct = (lrs_value_usd / LRS_ANNUAL_USD) if LRS_ANNUAL_USD > 0 else 0
        status = "breached" if pct >= 1 else ("approaching" if pct >= 0.8 else "ok")
        if status != "ok":
            findings.append(make_finding(
                "lrs_limit", "critical" if status == "breached" else "warning", "limit",
                "LRS remittance " + ("limit breached" if status == "breached" else "approaching limit"),
                f"Outbound LRS remittances of {format_usd(lrs_value_usd)} are at {round(pct * 100)}"
                "% of the USD 250,000 RBI annual cap.",
                ("A breach can attract RBI scrutiny and AD-bank refusal. Verify remittances across all banks (the cap is per-PAN, not per-account) and document the source of funds."
                 if status == "breached" else
                 "Monitor remaining headroom for the rest of the financial year; TCS at 20% applies above ₹10 lakh."),
                0, ["RBI LRS", "TCS u/s 394(1)"],
            ))

    # -- india_advance_tax_interest (in1-nodes.js + report-batch5-nodes.js, conflicts.js:452-463) --
    if d["in1ShouldFire"]:
        in_adv_interest_inr = d["totalInterestInrIn1"]
        findings.append(make_finding(
            "india_advance_tax_interest", "warning", "credit",
            f"Advance-tax interest exposure — ss.424/425 ({_inr(in_adv_interest_inr)})",
            f"Advance tax paid ({_inr(d['advancePaidInr'])}) falls short of the assessed tax ({_inr(d['assessedTaxInr'])}"
            f") this year. At 1%/month simple interest: {_inr(d['s424Inr'])} under s.424 (shortfall below the 90% floor, "
            f"{d['inS424Months']} months to the {'audit-case (31 Oct)' if d['inIsAuditCase'] else 'non-audit (31 Jul)'}"
            f" due date) + {_inr(d['s425Inr'])} under s.425 ("
            + ("single 15-Mar installment shortfall — presumptive-scheme filers owe 100% in one installment, s.425 proviso" if d["inPurelyPresumptive"] else "quarter-by-quarter installment shortfalls")
            + "). Both keep accruing past the due date until actually paid — this is the exposure AS OF the due date, not a final number.",
            "Pay the shortfall before filing to stop s.424 interest accruing further; s.425's quarter-by-quarter amount is "
            "fixed once the year ends and doesn't grow. If the year isn't over yet, revise the remaining installment(s) upward.",
            in_adv_interest_inr / 83, ["s.424", "s.425", "1%/month simple interest"],
        ))

    return findings


# ---- residency-consistency (India branch only) — port of residency-nodes.js's
# residencyConsistencyFindings (India-side branch, conflicts.js has no
# counterpart — DAG-only). US branch lives in us/findings.py. --------------
def _india_residency_consistency_finding(d, ctx):
    if d["indiaStatusRaw"] is None or d["indiaDomesticStatusDerived"] == d["indiaStatusRaw"]:
        return []
    treaty_override_active = d["treatyIndiaResidenceRaw"] == "us" or d["treatyDtaaForcedNrRaw"] is True
    entity_label = (
        "" if d["indiaEntityKindRaw"] == "individual" else
        " (company)" if d["indiaEntityKindRaw"] == "company" else
        " (HUF)" if d["indiaEntityKindRaw"] == "huf" else f" ({d['indiaEntityKindRaw']})"
    )
    if treaty_override_active and d["indiaStatusRaw"] == "NR" and d["indiaDomesticStatusDerived"] != "NR":
        return [make_finding(
            "residency_status_dtaa_conflated_india", "warning", "residency",
            f"India residential status may be conflated with the DTAA treaty tie-break{entity_label}",
            f"Based on the residency facts on file, this taxpayer's India DOMESTIC-LAW status under s.6 should be "
            f"{d['indiaDomesticStatusDerived']}, but the recorded final_india_residency_status is NR. The DTAA Article 4 tie-break "
            f"is recorded as resolving to the US (dtaa_treaty_residence = \"us\""
            + (" / dtaa_forced_nr = true" if d["treatyDtaaForcedNrRaw"] else "") +
            "). Layer 1's residency wizard used to overwrite the domestic status field itself whenever the treaty tie-break "
            "resolved away from India — but under Indian law, residential status (ROR/RNOR/NR) is a purely domestic-law "
            "determination, unaffected by any treaty. \"Losing\" the Article 4 tie-breaker doesn't make someone stop being "
            "domestically resident — it only changes worldwide-taxation scope for treaty purposes (already handled correctly, "
            "separately, elsewhere in this computation). This finding is the domestic-status side of that same fact pattern, "
            "surfaced because the two concepts appear to have been conflated in what was recorded for this profile.",
            "For domestic-law purposes (advance-tax interest under s.234B/234C, PAN-Aadhaar linking, Schedule FA "
            f"disclosure, TDS rates on India-source payments), this taxpayer's status should likely be treated as "
            f"{d['indiaDomesticStatusDerived']}, with the treaty position tracked separately as a worldwide-taxation election, not "
            "as a change to the underlying residential status.",
            0, ["s.6", "DTAA Art. 4"],
        )]
    finding_id = (
        "residency_status_mismatch_india_company" if d["indiaEntityKindRaw"] == "company" else
        "residency_status_mismatch_india" if d["indiaEntityKindRaw"] == "individual" else
        "residency_status_mismatch_india_entity"
    )
    return [make_finding(
        finding_id, "warning", "residency",
        f"India residency status may not match the facts on file{entity_label} — derived {d['indiaDomesticStatusDerived']}, recorded {d['indiaStatusRaw']}",
        "Re-deriving India's residential-status determination from the same raw facts Layer 1's own wizard uses "
        "(day-count, the 4-year lookback, RNOR sub-status conditions, employment/PIO-visit exceptions, s.6(1A) deemed-"
        f"residency, incorporation/POEM, or control-and-management, depending on entity type) produces "
        f"{d['indiaDomesticStatusDerived']}, but the recorded final_india_residency_status is {d['indiaStatusRaw']}.",
        "Re-run the Layer 1 India residency wizard, or verify the underlying residency facts were entered "
        "consistently — this looks like a wizard or data-entry error.",
        0, ["s.6"],
    )]


NODES["findingsIndiaResult"] = NodeDef(
    deps=("panAadhaarLinkedRaw", "indiaItrFormResult", "unexplained115bbeInrAgg", "capitalGainsComputation", "chapterXiiaElectedRaw",
          "taxRegime", "businessComputation", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust",
          "promoterBuybackDetail", "hasPERaw",
          "treatyElectionsRaw", "treatyTrcStatus", "treatyForm10fFiled", "isNRV3",
          "s115aDividendDetailed", "s115aRoyaltyDetailed", "s115aFtsDetailed", "nrInterestDetailed",
          "carryForwardLossesMetaRaw", "isEntityTaxpayer", "lossSetOffDetailed",
          "hasIndiaScope", "annualSliceAgg",
          "in1ShouldFire", "totalInterestInrIn1", "advancePaidInr", "assessedTaxInr", "s424Inr", "inS424Months", "inIsAuditCase", "s425Inr", "inPurelyPresumptive"),
    compute=_findings_india_result,
)
NODES["indiaResidencyConsistencyFinding"] = NodeDef(
    deps=("indiaStatusRaw", "indiaEntityKindRaw", "indiaDomesticStatusDerived", "treatyIndiaResidenceRaw", "treatyDtaaForcedNrRaw"),
    compute=_india_residency_consistency_finding,
)

ALL_FINDING_IDS = (
    "pan_not_linked_aadhaar", "india_itr_form_mismatch", "s115bbe_unexplained_income",
    "chapter_xiia_elected_no_holdings", "chapter_xiia_investment_income_missing", "chapter_xiia_investment_income_computed",
    "form_10iea", "promoter_buyback_additional_tax", "pe_article7", "dtaa_treaty_elections",
    "carry_forward_losses_not_applied", "lrs_limit", "india_advance_tax_interest",
    "residency_status_dtaa_conflated_india", "residency_status_mismatch_india_company",
    "residency_status_mismatch_india", "residency_status_mismatch_india_entity",
)


def build(base):
    r = itr_form.build(base)
    r = residency.build(r)
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
