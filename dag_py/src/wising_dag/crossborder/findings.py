"""Crossborder-domain findings — the 27 findings in
test_findings_domain_split.py's CROSSBORDER_FINDING_IDS whose compute()
reads a crossborder-domain node (residencyResult/ftcResult/
apportionmentResult/crossBasisResult/mapDoubleTaxedIncomeResult) directly,
plus two documented exceptions (see below).

Ports, by JS source file:
  - findings-nodes.js:        ftc_gap, ftc_available, entity_dual_residency_poem,
                               dual_residency, dual_residency_resolved
  - findings-batch2-nodes.js: cross_basis_summary, special_rate_gaming_winnings
  - findings-batch3-nodes.js: form_1099da_awareness, tax_year_mismatch, fx_basis,
                               state_treaty_not_binding, pfic, cfc,
                               cfc_below_threshold, transfer_pricing,
                               retirement_mismatch, deemed_dividend_buyback_mismatch,
                               no_totalization_agreement, niit_medicare_not_creditable
  - findings-batch4-nodes.js: treaty_docs_missing, withholding_documentation_gap
  - findings-batch5-nodes.js: form67_required, fbar_limit, equity_comp_sourcing
  - findings-batch6-nodes.js: holding_period_mismatch_<N> (dynamic template)
  - xb7-nodes.js + report-batch5-nodes.js: schedule_fa_inconsistent,
    black_money_act_exposure (split pattern)

Two deliberate exceptions to the "reads a crossborder-result node directly"
rule, both already decided in test_findings_domain_split.py's classification
and kept consistent here:
  - equity_comp_sourcing's own compute() reads only equityCompResult (a
    US-file-built node — see us/findings.py) — but equityCompResult ITSELF
    mixes India's ESOP perquisite (esopPerquisiteInr) with the US's RSU/NSO
    income (rsuIncomeUsd/nsoIncomeUsd), i.e. the SAME equity award taxed by
    both countries — inherently cross-border in subject matter even though
    the finding's immediate dep isn't literally residencyResult/ftcResult/etc.
  - promoter_buyback_additional_tax/dtaa_treaty_elections/etc. stayed in
    india/findings.py, not here — despite superficially sounding treaty-
    related, they don't read any crossborder-result node.
"""
from __future__ import annotations

import math

from ..core.constants import LIMITS
from ..core.dates import parse_date
from ..core.findings import make_finding
from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import format_inr, js_num_str, js_round, num, safe
from ..india import findings as india_findings
from ..us import constants as US_C
from ..us import findings as us_findings
from . import black_money_act
from . import cross_basis

T = US_C.US
FEIE_MAX_USD = US_C.FEIE_MAX_USD
NIIT_THRESHOLD = US_C.NIIT_THRESHOLD


def _usd(n: float) -> str:
    return f"${js_round(n):,}"


def _inr(n: float) -> str:
    # NOT f"₹{js_round(n):,}" — Python's `:,` format spec is always Western
    # (thousands) grouping; the JS source's own local `inr(n)` helper here
    # is `Math.round(n).toLocaleString("en-IN")`, Indian lakh/crore
    # grouping. A real, pre-existing bug (predates this session's
    # js_round sweep, which only touched the rounding call, not this
    # grouping bug) — invisible on every real fixture/small fuzz-corpus
    # profile whose `withholding_documentation_gap` finding never fired
    # with an India-side gap large enough for the two groupings to visibly
    # differ, only surfaced once the fuzz corpus was scaled up to 300 cases.
    return f"₹{format_inr(n)}"


def _inr_to_usd(v, ctx) -> float:
    return num(v) / fx_rate(ctx)


# ---- describeTieBreak, port of findings-nodes.js's describeTieBreak -------
def _describe_tie_break(home, cvi, abode, nat):
    if home == "india":
        return {"article": "Art. 4(2)(a)", "reason": "permanent home is only in India"}
    if home == "us":
        return {"article": "Art. 4(2)(a)", "reason": "permanent home is only in the US"}
    if home not in ("both", "neither"):
        return None
    if cvi == "india":
        return {"article": "Art. 4(2)(a)", "reason": "centre of vital interests is closer to India"}
    if cvi == "us":
        return {"article": "Art. 4(2)(a)", "reason": "centre of vital interests is closer to the US"}
    if cvi != "tie":
        return None
    if abode == "india":
        return {"article": "Art. 4(2)(b)", "reason": "habitual abode is in India"}
    if abode == "us":
        return {"article": "Art. 4(2)(b)", "reason": "habitual abode is in the US"}
    if abode != "tie":
        return None
    if nat == "india":
        return {"article": "Art. 4(2)(c)", "reason": "Indian national"}
    if nat == "us":
        return {"article": "Art. 4(2)(c)", "reason": "US national"}
    if nat == "tie":
        return {"article": "Art. 4(3)", "reason": "neither permanent home, vital interests, abode nor nationality broke the tie", "mapRequired": True}
    return None


# ---- computeUsTaxCore: parameterized copy of us/ustax.py's
# _compute_us_tax_result (individual-path only), extended with
# extraLtcgUsd/extraStcgUsd added on top of foreignLtcg/foreignStcg — same
# clone-and-override point the frozen engine's own withForeignCg touches.
# Port of findings-batch6-nodes.js's computeUsTaxCore. Only
# totalTaxBeforeFtcUsd is needed by the finding, matching the JS source. ---
def _compute_us_tax_core(d, extra_ltcg_usd: float, extra_stcg_usd: float) -> float:
    inc, ded, status, worldwide, feie = d["incUs"], d["dedUs"], d["usFilingStatusRaw"], d["worldwideUs"], d["feie"]
    brackets = T["BRACKETS"].get(status, T["BRACKETS"]["single"])

    f_w = inc["foreignWages"]["usd"] if worldwide else 0
    f_se = inc["foreignSelfEmployment"]["usd"] if worldwide else 0
    feie_applied_usd = 0.0
    if worldwide and feie["claimed"] and feie["eligible"] and (f_w + f_se) > 0:
        feie_earned_base_usd = f_w + f_se
        feie_base = feie["amountClaimedUsd"] if feie["amountClaimedUsd"] > 0 else feie_earned_base_usd
        feie_applied_usd = min(feie_earned_base_usd, feie_base, FEIE_MAX_USD)
        feie_applied_to_wages_usd = min(f_w, feie_applied_usd)
        f_w = f_w - feie_applied_to_wages_usd
        f_se = f_se - (feie_applied_usd - feie_applied_to_wages_usd)
    f_i = inc["foreignInterest"]["usd"] if worldwide else 0
    f_d = inc["foreignDividends"]["usd"] if worldwide else 0
    f_r = inc["foreignRental"]["usd"] if worldwide else 0
    f_p = inc["foreignPension"]["usd"] if worldwide else 0
    f_stcg = (inc["foreignStcg"]["usd"] + (extra_stcg_usd or 0)) if worldwide else 0
    f_ltcg = (inc["foreignLtcg"]["usd"] + (extra_ltcg_usd or 0)) if worldwide else 0

    non_qual_div_us = max(0.0, inc["ordinaryDividendsUs"]["usd"] - inc["qualifiedDividendsUs"]["usd"])
    ordinary_income_excl_ss = (
        inc["wages"]["usd"] + f_w + f_se + (inc.get("businessUs", {}).get("usd", 0) if inc.get("businessUs") else 0) + inc["interestUs"]["usd"] + f_i +
        non_qual_div_us + f_d + inc["stcgUs"]["usd"] + f_stcg + inc["rentalUs"]["usd"] + f_r + f_p +
        (inc["usRetirementIncomeExclSs"]["usd"] if inc.get("usRetirementIncomeExclSs") else (inc.get("usRetirementIncome", {}).get("usd", 0) if inc.get("usRetirementIncome") else 0))
    )
    preferential_income = inc["ltcgUs"]["usd"] + f_ltcg + inc["qualifiedDividendsUs"]["usd"]

    gross_ss_usd = (inc.get("socialSecurityUs") or {}).get("usd", 0) or 0
    tax_exempt_interest_usd = (inc.get("taxExemptInterestUs") or {}).get("usd", 0) or 0
    from ..us.ustax import compute_ss_taxable_usd
    taxable_ss_usd = compute_ss_taxable_usd(gross_ss_usd, ordinary_income_excl_ss + preferential_income, tax_exempt_interest_usd, status)

    ordinary_income = ordinary_income_excl_ss + taxable_ss_usd
    total_income = ordinary_income + preferential_income

    se_net = (inc.get("seEarningsUsd") or 0) * T["SE_NET_FACTOR"]
    ss_wages_already = inc.get("medicareWages") or inc["wages"]["usd"] or 0
    ss_base_remaining = max(0.0, T["SS_WAGE_BASE_USD"] - ss_wages_already)
    se_tax = (T["SE_RATE_SS"] * min(se_net, ss_base_remaining) + T["SE_RATE_MEDICARE"] * se_net) if se_net > 0 else 0
    half_se_deduction = se_tax / 2

    se_health_deduction = min(ded.get("seHealthInsuranceDeductionUsd") or 0, max(0.0, se_net))
    adjustments = min(ded["studentLoanInterest"], 2500) + half_se_deduction + se_health_deduction + (ded.get("seRetirementDeductionUsd") or 0)
    agi = max(0.0, total_income - adjustments)

    from ..us.ustax import compute_salt_cap
    standard = T["STD_DEDUCTION"].get(status, T["STD_DEDUCTION"]["single"])
    salt_cap_usd = compute_salt_cap(agi, status)
    itemized = min(ded["salt"], salt_cap_usd) + ded["mortgageInterest"] + ded["charitable"] + max(0.0, ded["medical"] - 0.075 * agi)
    deduction = itemized if ded["mode"] == "itemized" else standard if ded["mode"] == "standard" else max(standard, itemized)

    taxpayer_age = None
    if d["taxpayerDobRaw"]:
        dob = parse_date(d["taxpayerDobRaw"])
        if dob is not None:
            taxpayer_age = (d["baseYearUs"] or 2025) - dob.year
    is_senior = taxpayer_age is not None and taxpayer_age >= T["SENIOR_DEDUCTION_MIN_AGE"] and status != "mfs"
    senior_phaseout_thr = T["SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD"].get(status, T["SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD"]["single"])
    senior_deduction_usd = max(0.0, js_round(T["SENIOR_DEDUCTION_PER_PERSON_USD"] - T["SENIOR_DEDUCTION_PHASEOUT_RATE"] * max(0.0, agi - senior_phaseout_thr))) if is_senior else 0

    is_mfs = status == "mfs"
    tips_ot_phaseout_thr = T["TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD"].get(status, T["TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD"]["single"])
    tips_ot_phaseout_reduction = math.ceil(max(0.0, agi - tips_ot_phaseout_thr) / 1000) * T["TIPS_OVERTIME_PHASEOUT_PER_1000_USD"]
    qualified_tips_usd = 0 if is_mfs else (inc.get("qualifiedTipsUsd") or 0)
    qualified_overtime_usd = 0 if is_mfs else (inc.get("qualifiedOvertimeUsd") or 0)
    tips_deduction_usd = 0 if is_mfs else max(0.0, js_round(min(qualified_tips_usd, T["TIPS_DEDUCTION_MAX_USD"]) - tips_ot_phaseout_reduction))
    overtime_max_usd = T["OVERTIME_DEDUCTION_MAX_USD"].get(status, T["OVERTIME_DEDUCTION_MAX_USD"]["single"])
    overtime_deduction_usd = 0 if is_mfs else max(0.0, js_round(min(qualified_overtime_usd, overtime_max_usd) - tips_ot_phaseout_reduction))

    taxable_before_qbi = max(0.0, agi - deduction - senior_deduction_usd - tips_deduction_usd - overtime_deduction_usd)

    qbi = inc.get("qbiIncomeUsd") or 0
    qbi_thr = T["QBI_THRESHOLD"].get(status, T["QBI_THRESHOLD"]["single"])
    qbi_phase = T["QBI_PHASEIN"].get(status, T["QBI_PHASEIN"]["single"])
    qbi_frac = 1.0
    if inc.get("qbiIsSSTB"):
        if taxable_before_qbi >= qbi_thr + qbi_phase:
            qbi_frac = 0.0
        elif taxable_before_qbi > qbi_thr:
            qbi_frac = 1 - (taxable_before_qbi - qbi_thr) / qbi_phase
    qbi_deduction = T["QBI_RATE"] * qbi * qbi_frac
    qbi_deduction = max(0.0, js_round(min(qbi_deduction, T["QBI_RATE"] * max(0.0, taxable_before_qbi - preferential_income))))

    taxable_income = max(0.0, taxable_before_qbi - qbi_deduction)
    pref_taxable = min(preferential_income, taxable_income)
    ord_taxable = taxable_income - pref_taxable

    from ..india.in1_v3 import bracket_tax
    ordinary_tax = bracket_tax(ord_taxable, brackets)

    lb = T["LTCG_BRACKETS"].get(status, T["LTCG_BRACKETS"]["single"])
    start = ord_taxable
    amt0 = max(0.0, min(lb["br0"] - start, pref_taxable))
    rem_after0 = pref_taxable - amt0
    amt15 = max(0.0, min(lb["br15"] - max(start, lb["br0"]), rem_after0))
    amt20 = rem_after0 - amt15
    preferential_tax = amt15 * 0.15 + amt20 * 0.20

    income_tax = ordinary_tax + preferential_tax

    net_investment_income = inc["interestUs"]["usd"] + f_i + inc["ordinaryDividendsUs"]["usd"] + f_d + inc["capitalGainsUs"]["usd"] + f_stcg + f_ltcg + inc["rentalUs"]["usd"] + f_r
    niit_threshold = NIIT_THRESHOLD.get(status, 200000)
    niit = T["NIIT_RATE"] * min(max(0.0, net_investment_income), max(0.0, agi - niit_threshold))

    addl_medicare = d["additionalMedicareOwedBoundary"]

    used_mode = ded["mode"] if ded["mode"] in ("itemized", "standard") else ("itemized" if itemized > standard else "standard")
    amt_addback = deduction if used_mode == "standard" else min(ded["salt"], salt_cap_usd)
    amti_usd = max(0.0, taxable_income + amt_addback + (ded.get("amtPrefs") or 0))
    amt_ex_full = T["AMT_EXEMPTION"].get(status, T["AMT_EXEMPTION"]["single"])
    amt_phase = T["AMT_PHASEOUT"].get(status, T["AMT_PHASEOUT"]["single"])
    amt_exemption = max(0.0, amt_ex_full - T["AMT_PHASEOUT_RATE"] * max(0.0, amti_usd - amt_phase))
    amt_base = max(0.0, amti_usd - amt_exemption)
    amt_ord_base = max(0.0, amt_base - pref_taxable)
    amt_brk = T["AMT_RATE_BREAK"] / 2 if status == "mfs" else T["AMT_RATE_BREAK"]
    tmt_ord = amt_ord_base * T["AMT_RATE_LOW"] if amt_ord_base <= amt_brk else amt_brk * T["AMT_RATE_LOW"] + (amt_ord_base - amt_brk) * T["AMT_RATE_HIGH"]
    amt_owed = max(0.0, js_round(tmt_ord + preferential_tax - income_tax))

    magi = agi
    edu_lo, edu_hi = (160000, 180000) if status == "mfj" else (80000, 90000)
    edu_phase = 1.0 if magi <= edu_lo else (0.0 if magi >= edu_hi else 1 - (magi - edu_lo) / (edu_hi - edu_lo))
    care_cap = 6000 if (ded.get("dependents") or 0) >= 2 else 3000
    child_care_credit = 0.20 * min(ded.get("careExpenses") or 0, care_cap)
    aotc_credit = min(ded.get("aotc") or 0, 2500 * max(1, ded.get("dependents") or 1)) * edu_phase
    llc_credit = min(ded.get("lifetimeLearning") or 0, 2000) * edu_phase
    other_credits_usd = min(js_round(child_care_credit + aotc_credit + llc_credit), js_round(income_tax))

    num_children_for_ctc = ded.get("dependents") or 0
    ctc_phaseout_thr = T["CTC_PHASEOUT_THRESHOLD_USD"].get(status, T["CTC_PHASEOUT_THRESHOLD_USD"]["single"])
    ctc_max_total_usd = T["CTC_PER_CHILD_USD"] * num_children_for_ctc
    ctc_phaseout_reduction_usd = math.ceil(max(0.0, agi - ctc_phaseout_thr) / 1000) * T["CTC_PHASEOUT_PER_1000_USD"]
    ctc_available_usd = max(0.0, ctc_max_total_usd - ctc_phaseout_reduction_usd)
    remaining_tax_after_other_credits = max(0.0, js_round(income_tax) - other_credits_usd)
    ctc_non_refundable_usd = min(ctc_available_usd, remaining_tax_after_other_credits)
    ctc_unused_usd = ctc_available_usd - ctc_non_refundable_usd
    earned_income_usd = inc["wages"]["usd"] + f_w + f_se + (inc.get("businessUs", {}).get("usd", 0) if inc.get("businessUs") else 0)
    actc_cap_usd = min(T["CTC_REFUNDABLE_MAX_PER_CHILD_USD"] * num_children_for_ctc, T["CTC_REFUNDABLE_RATE"] * max(0.0, earned_income_usd - T["CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD"]))
    ctc_refundable_usd = js_round(max(0.0, min(ctc_unused_usd, actc_cap_usd)))
    credits_usd = other_credits_usd + ctc_non_refundable_usd + ctc_refundable_usd

    return income_tax + niit + addl_medicare + se_tax + amt_owed - credits_usd


def _holding_period_mismatch_findings(d, ctx):
    findings = []
    routes_away_from_individual = d["usEntityKind"] in ("ccorp", "scorp", "partnership", "trust") or (d["treatyFiles1040nrRaw"] and not d["s6013hElection"])
    holding_mismatches = [] if routes_away_from_individual else (d["capitalGainsComputation"].get("holdingPeriodMismatches") or [])
    for mi, mm in enumerate(holding_mismatches):
        as_ltcg = _compute_us_tax_core(d, mm["gainUsd"], 0)
        as_stcg = _compute_us_tax_core(d, 0, mm["gainUsd"])
        delta_usd = as_stcg - as_ltcg
        if abs(delta_usd) < 1:
            continue
        correct_is_ltcg = mm["usClassification"] == "ltcg"
        asset_label = "buy-back" if mm.get("sourceType") == "buyback" else "foreign equity holding"
        ltcg_section = "s.198" if mm.get("isListed") else "s.197"
        findings.append(make_finding(
            f"holding_period_mismatch_{mi}", "warning", "treaty",
            f"{mm['companyName']} {asset_label}: {js_round(mm['monthsHeld'])} months held — India says {mm['indiaClassification'].upper()}"
            f", US says {mm['usClassification'].upper()} ({_usd(abs(delta_usd))} at stake)",
            f"This {'listed' if mm.get('isListed') else 'unlisted'} {asset_label} was held {js_round(mm['monthsHeld'])} months. India requires "
            f"more than {mm['indiaThresholdMonths']} months for LTCG on {'listed' if mm.get('isListed') else 'unlisted'} shares, so this is "
            f"{mm['indiaClassification'].upper()} there (taxed "
            + (f"at 12.5%, {ltcg_section}" + (" (₹1,25,000 exemption pool)" if mm.get("isListed") else " (no exemption, taxable from ₹1)")
               if mm["indiaClassification"] == "ltcg" else
               ("at 20%, s.196" if mm.get("isListed") else "at your India slab rate"))
            + f"). The US requires only more than 12 months for LTCG on any asset — no listed/unlisted distinction — so the SAME gain is "
            f"{mm['usClassification'].upper()} under US rules. Recomputed your actual US return both ways: treated as LTCG, US tax is "
            f"{_usd(as_ltcg)}; treated as STCG (ordinary rates), US tax is {_usd(as_stcg)} — a difference of "
            f"{_usd(abs(delta_usd))}.",
            (
                f"Report this gain as LONG-TERM on the US return (Schedule D) even though it's short-term in India — using India's "
                f"label on the US foreign-capital-gains input would cost roughly {_usd(abs(delta_usd))} in overpaid US tax."
                if correct_is_ltcg else
                f"Report this gain as SHORT-TERM on the US return even though it's long-term in India — using India's label on the US "
                f"foreign-capital-gains input would understate US tax by roughly {_usd(abs(delta_usd))}."
            ),
            abs(delta_usd), ["Holding period", f"{ltcg_section} vs IRC §1222", "Share buyback" if mm.get("sourceType") == "buyback" else "Foreign equity"],
        ))
    return findings


def _taxes_paid_us_result(d, ctx):
    we = safe(ctx.get("us"), "withholding_and_estimated", {})
    us_withholding = num(safe(we, "federal_withholding_total_usd", 0))
    us_estimated = sum(num(safe(we, f"estimated_tax_q{n}_{s}_usd", 0)) for n, s in ((1, "apr15"), (2, "jun15"), (3, "sep15"), (4, "jan15")))
    prior_year_total_tax_usd_raw = safe(we, "prior_year_total_tax_usd", None)

    def m(usd):
        return {"usd": usd, "inr": usd * fx_rate(ctx)}

    return {
        "total": m(us_withholding + us_estimated), "withholding": m(us_withholding),
        "priorYearTotalTaxUsd": None if prior_year_total_tax_usd_raw is None else num(prior_year_total_tax_usd_raw),
    }


NODES = {
    "usFtcFormXbr": NodeDef(deps=("usEntityKind",), compute=lambda d, ctx: "Form 1118" if d["usEntityKind"] == "ccorp" else "Form 1116"),

    # ---- tie-break raw leaves (findings-nodes.js) ----------------------------
    "tieBreakHomeRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.tb_home", None), layer1_fields=("india.dtaa.tb_home",)),
    "tieBreakCviRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.tb_cvi", None), layer1_fields=("india.dtaa.tb_cvi",)),
    "tieBreakAbodeRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.tb_abode", None), layer1_fields=("india.dtaa.tb_abode",)),
    "tieBreakNationalityRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.tb_nationality", None), layer1_fields=("india.dtaa.tb_nationality",)),

    # ---- findings-batch3-nodes.js raw leaves ---------------------------------
    "indiaFinancialHoldingsTxRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "financial_holdings.transactions", []) or [], layer1_fields=("india.financial_holdings.transactions",)),
    "epfInrRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80C.epf_employee_inr", 0)), layer1_fields=("india.deductions.s80C.epf_employee_inr",)),
    "ppfInrRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80C.ppf_inr", 0)), layer1_fields=("india.deductions.s80C.ppf_inr",)),
    "npsInrRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0)), layer1_fields=("india.deductions.s80CCC_80CCD1.nps_employee_contribution_inr",)),
    "taxableEpfInterestInrAgg": NodeDef(deps=("osAgg",), compute=lambda d, ctx: num(safe(d["osAgg"], "taxable_epf_interest_inr", 0))),
    "taxableNpsWithdrawalInrAgg": NodeDef(deps=("osAgg",), compute=lambda d, ctx: num(safe(d["osAgg"], "taxable_nps_withdrawal_inr", 0))),
    "stateResidencyRawXbr": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "domicileJan1": safe(ctx.get("us"), "state_residency.jan_1_domicile_state", None),
            "domicileDec31": safe(ctx.get("us"), "state_residency.dec_31_domicile_state", None),
            "primaryState": safe(ctx.get("us"), "state_residency.primary_state_of_residence", None),
            "footprint": safe(ctx.get("us"), "state_residency.total_states_footprint", []) or [],
            "movedStates": safe(ctx.get("us"), "state_residency.moved_states_this_year", False) is True,
            "caSafeHarbor": safe(ctx.get("us"), "state_residency.ca_safe_harbor_employment_contract", False) is True,
            "caRetainsTies": safe(ctx.get("us"), "state_residency.ca_retains_property_or_voter_reg", False) is True,
            # layer1_us.html's live statutory-residency tracker
            # (renderStatutoryCheckers()/updateFootprintDetails()) stores
            # these under the generic per-state state_residency.
            # footprint_details[code].{days,ppa} object (shared by NY/NJ/CT/
            # MA/etc.) -- NOT the flat ny_actual_days_present/
            # ny_permanent_place_of_abode field names this used to read,
            # which nothing in the live form has ever written.
            "nyDaysPresent": num(safe(ctx.get("us"), "state_residency.footprint_details.NY.days", 0)) or num(safe(ctx.get("us"), "state_residency.ny_actual_days_present", 0)),
            "nyPermanentAbode": safe(ctx.get("us"), "state_residency.footprint_details.NY.ppa", False) is True or safe(ctx.get("us"), "state_residency.ny_permanent_place_of_abode", False) is True,
            "ny548DayRule": safe(ctx.get("us"), "state_residency.ny_548_day_rule", False) is True,
        },
        layer1_fields=(
            "us.state_residency.jan_1_domicile_state", "us.state_residency.dec_31_domicile_state",
            "us.state_residency.primary_state_of_residence", "us.state_residency.total_states_footprint",
            "us.state_residency.moved_states_this_year", "us.state_residency.ca_safe_harbor_employment_contract",
            "us.state_residency.ca_retains_property_or_voter_reg", "us.state_residency.ny_actual_days_present",
            "us.state_residency.ny_permanent_place_of_abode", "us.state_residency.ny_548_day_rule",
        ),
    ),

    # ---- form67_required / AGG-6 (findings-batch5-nodes.js) -----------------
    # `withholding`/`priorYearTotalTaxUsd` alongside the pre-existing `total`
    # — the real engine's aggregateTaxesPaid returns withholding and
    # estimated separately; report-batch4-nodes.js's buildWithholdingSummary
    # (reports/trace.py) needs withholding alone for its W-2-aggregate
    # fallback row, not the combined `total` this node originally only
    # exposed. `priorYearTotalTaxUsd` is null (not 0) when never entered —
    # a real "prior year had zero tax" answer must stay distinguishable from
    # "the preparer didn't say."
    "taxesPaidUsResult": NodeDef(deps=(), compute=_taxes_paid_us_result, layer1_fields=(
        "us.withholding_and_estimated.federal_withholding_total_usd",
        "us.withholding_and_estimated.estimated_tax_q1_apr15_usd", "us.withholding_and_estimated.estimated_tax_q2_jun15_usd",
        "us.withholding_and_estimated.estimated_tax_q3_sep15_usd", "us.withholding_and_estimated.estimated_tax_q4_jan15_usd",
        "us.withholding_and_estimated.prior_year_total_tax_usd",
    )),

    # ---- fbar_limit / AGG-5 (findings-batch5-nodes.js) -----------------------
    "bankAccountsRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "india": safe(ctx.get("india"), "bank_accounts", []) or [], "us": safe(ctx.get("us"), "bank_accounts", []) or [],
            "usFormFbar": num(safe(ctx.get("us"), "fbar_aggregate_peak_usd", 0)),
            # layer1_us.html's Step 8 screen covers both bank_accounts AND
            # this financial_holdings list (securities, life insurance,
            # etc.) in one screen; the live UI's own recalc folds both into
            # fbar_aggregate_peak_usd, gated on is_fbar_reportable !== false
            # per row. Read here so aggregateLastDayUsdResult (no equivalent
            # persisted override field) can mirror that same scope.
            "usFinancialHoldings": safe(ctx.get("us"), "financial_holdings", []) or [],
        },
        layer1_fields=("india.bank_accounts", "us.bank_accounts", "us.fbar_aggregate_peak_usd", "us.financial_holdings"),
    ),
    "aggregatePeakUsdResult": NodeDef(
        deps=("bankAccountsRaw", "hasUsScopeBoundaryFtc"),
        compute=lambda d, ctx: (lambda india_accts, us_accts, form_fbar: (
            {"usd": form_fbar} if form_fbar > 0 else
            {"usd": 0} if not d["hasUsScopeBoundaryFtc"] else
            {"usd": sum((b.get("peak_balance_inr") or 0) / fx_rate(ctx) for b in india_accts) if len(india_accts) >= len(us_accts) else
                    sum((b["peak_balance_usd"] if b.get("peak_balance_usd") is not None else (b.get("peak_balance_inr") or 0) / fx_rate(ctx)) for b in us_accts)}
        ))(d["bankAccountsRaw"]["india"], d["bankAccountsRaw"]["us"], d["bankAccountsRaw"]["usFormFbar"]),
    ),
    # Form 8938's reporting threshold is actually TWO independent tests —
    # value on the LAST DAY of the tax year, and the HIGHEST value at any
    # time during the year (LIMITS["FORM_8938"]'s lastDay/anyTime keys) —
    # exceeding EITHER one triggers the filing requirement. layer1_us.html's
    # Step 8 ("Foreign Banks/FBAR") collects last_day_balance_usd on every
    # account row specifically for this, but nothing ever read it: only the
    # peak/anyTime test was ever checked. India's own bank_accounts[] has no
    # last-day-balance concept (out of scope), so this reflects only what
    # Layer 1 US itself collects. Mirrors findings-batch5-nodes.js's
    # aggregateLastDayUsdResult exactly.
    "aggregateLastDayUsdResult": NodeDef(
        deps=("bankAccountsRaw", "hasUsScopeBoundaryFtc"),
        compute=lambda d, ctx: (
            {"usd": 0, "inr": 0} if not d["hasUsScopeBoundaryFtc"] else
            (lambda total: {"usd": total, "inr": total * fx_rate(ctx)})(
                sum((b.get("last_day_balance_usd") or 0) for b in d["bankAccountsRaw"]["us"]) +
                sum((h.get("last_day_balance_usd") or 0) for h in d["bankAccountsRaw"]["usFinancialHoldings"] if h.get("is_fbar_reportable") is not False)
            )
        ),
    ),

    # ---- equity_comp_sourcing (mirrors us/findings.py's equityCompResult
    # build — see module docstring's "two deliberate exceptions"). ------------
    "equityCompRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "equity_compensation", {}) or {}, layer1_fields=("us.equity_compensation",)),
    "esopEventsRaw": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "salary.esop_perquisite_events", []) or []),
    "esopPerquisiteInrRaw": NodeDef(deps=("diAgg",), compute=lambda d, ctx: num(safe(d["diAgg"], "salary.esop_perquisite_inr", 0))),
    "equityCompResult": NodeDef(deps=("equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw"), compute=us_findings._equity_comp_result),

    # ---- apportionmentResult — EXPLICIT BOUNDARY INPUT: apportionment.py's
    # own build() independently re-derives aggregate_india_income/
    # aggregate_us_income on a fresh registry (needed for its Phase-7 entity-
    # aware override), which collides with cross_basis.build()'s chain if
    # composed onto the same registry. Deferred to Phase 7's analyze()
    # assembly, same discipline as every other *Boundary node in this port —
    # see docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 5 section.
    "apportionmentResultBoundary": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.apportionment", None)),
}


def _findings_crossborder_result(d, ctx):
    findings = []

    # -- 4. FTC RECONCILIATION GAP (findings-nodes.js, conflicts.js:275-301) --
    ftc = d["ftcResult"]
    if d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"] and ftc["us"]["residualDoubleTaxUsd"] > 1:
        findings.append(make_finding(
            "ftc_gap", "critical", "credit",
            "Foreign Tax Credit shortfall — residual double taxation",
            f"Indian tax paid ({_usd(ftc['us']['indiaTaxPaidUsd'])}) exceeds the US FTC limitation ({_usd(ftc['us']['ftcLimitUsd'])}"
            f") for this year. {_usd(ftc['us']['residualDoubleTaxUsd'])}"
            " of Indian tax cannot be credited currently and would otherwise be double-taxed.",
            f"{_usd(ftc['us']['carryoverUsd'])} is eligible to carry over under §904(c) (back 1 year / forward 10), but WISING is a "
            f"single-year snapshot — it does NOT persist this carryover across tax years or track it for you. Record "
            f"{_usd(ftc['us']['carryoverUsd'])} on {d['usFtcFormXbr']} Schedule B this year, and re-enter it as prior-year carryover when you "
            "run next year's numbers. Also check whether treaty re-sourcing (Art. 25) could reclassify some income to lift "
            "the limitation — WISING does not test this automatically.",
            ftc["us"]["residualDoubleTaxUsd"], [d["usFtcFormXbr"], "§904(c)"],
        ))
    elif d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"] and ftc["us"]["indiaTaxPaidUsd"] > 0 and ftc["us"]["ftcAllowedUsd"] > 0:
        findings.append(make_finding(
            "ftc_available", "info", "credit",
            "Foreign Tax Credit available and within limit",
            f"Indian tax of {_usd(ftc['us']['indiaTaxPaidUsd'])} is fully creditable against US tax this year ({_usd(ftc['us']['ftcAllowedUsd'])}"
            f" within a {_usd(ftc['us']['ftcLimitUsd'])} limitation).",
            f"Claim on {d['usFtcFormXbr']} (US) and file Form 44 (India) before the ITR due date to preserve symmetric relief.",
            ftc["us"]["ftcAllowedUsd"], [d["usFtcFormXbr"], "Form 44"],
        ))

    # -- 4f2. ENTITY-LEVEL DUAL RESIDENCY (findings-nodes.js, conflicts.js:701-736) --
    if d["indiaIsCompany"] and d["indiaIsIndianCompanyRaw"] is False and d["residencyResult"]["india"]["status"] == "ROR":
        poem_factors = []
        if d["companyBoardOutsideIndiaRaw"]:
            poem_factors.append("board meets primarily outside India")
        if d["companyKeyManagementLocationRaw"]:
            poem_factors.append(f"key management location: {d['companyKeyManagementLocationRaw']}")
        if d["companyDirectorsInIndiaRaw"] or d["companyDirectorsOutsideIndiaRaw"]:
            # JS's Number(3.0) template-literal-stringifies as "3", not
            # "3.0" — but the JS source (findings-nodes.js) has no
            # Math.round here at all, just raw "+" concatenation, so a
            # fuzzer-mutated non-integer input (found via the scaled-up
            # fuzz corpus) legitimately shows its own fractional value on
            # both sides (e.g. "9.26"), not a rounded one. js_num_str
            # matches JS's own Number-to-string coercion exactly, unlike
            # js_round which would silently change the value.
            poem_factors.append(f"{js_num_str(d['companyDirectorsInIndiaRaw'])} director(s) in India vs {js_num_str(d['companyDirectorsOutsideIndiaRaw'])} outside")
        findings.append(make_finding(
            "entity_dual_residency_poem", "warning", "treaty",
            "Foreign-incorporated company with POEM in India — entity-level dual residency",
            "This company is on file as NOT incorporated in India, yet its Place of Effective Management facts"
            + (f" ({'; '.join(poem_factors)})" if poem_factors else "")
            + " resolve it to an Indian tax resident (worldwide income in scope) under s.6(3). Being incorporated elsewhere "
            "means it doesn't stop being resident there either (most countries, including the US, use place-of-incorporation "
            "as their own company-residency test) — so this entity is very likely resident in BOTH countries at once, with no "
            "individual-style Article 4 hierarchy to mechanically resolve it.",
            "Confirm the other country's own company-residency test independently (place of incorporation alone is often "
            "sufficient there) — if it also claims residency, this needs the treaty's company tie-breaker (competent-authority "
            "mutual agreement under Article 4(3)), not a self-service test. Revisit the POEM facts too: 'mostly outside India' "
            "board meetings alone isn't dispositive if commercial decisions are substantively made elsewhere.",
            0, ["DTAA Art. 4(3)", "s.6(3)", "POEM", "Mutual Agreement Procedure"],
        ))

    # -- 1. DUAL RESIDENCY + ARTICLE 4 TIE-BREAKER (findings-nodes.js, conflicts.js:81-125) --
    res = d["residencyResult"]
    if res["dualResident"]:
        tb_winner = d["treatyIndiaResidenceRaw"] if d["treatyIndiaResidenceRaw"] != "none" else (d["treatyUsResidenceRaw"] if d["treatyUsResidenceRaw"] != "none" else None)
        us_tag = "citizen" if res["us"]["isCitizen"] else ("green card" if d["usHasGreenCardRaw"] else "SPT met")
        tb = _describe_tie_break(d["tieBreakHomeRaw"], d["tieBreakCviRaw"], d["tieBreakAbodeRaw"], d["tieBreakNationalityRaw"])
        if not tb_winner:
            if tb and tb.get("mapRequired"):
                findings.append(make_finding(
                    "dual_residency", "critical", "treaty",
                    "Dual tax residency — Article 4(3) Mutual Agreement Procedure required",
                    f"The taxpayer is resident in BOTH India ({res['india']['status'] or 'resident'}) and the US ({us_tag}"
                    f"). The Layer 1 tie-breaker wizard was completed through all four tests — permanent home, centre of vital "
                    f"interests, habitual abode, and nationality — and {tb['reason']}. Article 4(3) hands this to the "
                    "competent authorities (CBDT and the IRS) for a Mutual Agreement Procedure; it cannot be self-resolved.",
                    "File a MAP request (competent authority assistance) with the IRS and/or CBDT rather than re-running the "
                    "wizard — the mechanical tie-breaker has already been exhausted. Both countries continue asserting worldwide "
                    "taxing rights and only partial FTC relief is available until MAP concludes.",
                    d["mapDoubleTaxedIncomeResult"]["totalDoublyTaxedUsd"], ["DTAA Art. 4(3)", "MAP", "Form 8833", "TRC", "Form 41"],
                ))
            else:
                findings.append(make_finding(
                    "dual_residency", "critical", "treaty",
                    "Dual tax residency — Article 4 tie-breaker not yet run",
                    f"The taxpayer is resident in BOTH India ({res['india']['status'] or 'resident'}) and the US ({us_tag}"
                    ") for an overlapping period, and the Layer 1 Article 4 tie-breaker has not been completed. Until it is, both countries assert worldwide taxing rights and only partial FTC relief is available.",
                    "Complete the Layer 1 tie-breaker wizard (permanent home → centre of vital interests → habitual abode → nationality). WISING will then flag Form 8833 (US) and the TRC / Form 41 requirement (India) on the filing checklist for the loser side — actually preparing and filing those remains a manual step.",
                    d["mapDoubleTaxedIncomeResult"]["totalDoublyTaxedUsd"], ["DTAA Art. 4", "Form 8833", "TRC", "Form 41"],
                ))
        else:
            findings.append(make_finding(
                "dual_residency_resolved", "info", "treaty",
                f"Dual residency resolved under DTAA Article 4 → {str(tb_winner).upper()}",
                f"Both India and the US met residency, and the Layer 1 Article 4 tie-breaker resolves treaty residence to "
                f"{str(tb_winner).upper()} for the overlapping period"
                + (f" ({tb['article']}: {tb['reason']})" if tb else "")
                + ". WISING has applied this to the tax and FTC computation below; the loser jurisdiction is taxed on a source basis.",
                f"Keep {'TRC + Form 41 (India) and Form 8833 (US)' if tb_winner == 'india' else 'Form 8833 (US) and TRC + Form 41 (India)'} on file to support the position.",
                0, ["DTAA Art. 4", "Form 41" if tb_winner == "india" else "Form 8833"],
            ))

    # -- cross_basis_summary (findings-batch2-nodes.js, conflicts.js:1505-1524) --
    recon = d["crossBasisResult"]
    dt_rows = [r for r in (recon.get("rows") or []) if r.get("doublyTaxed")]
    if len(dt_rows) > 0:
        findings.append(make_finding(
            "cross_basis_summary", "info", "income",
            f"{len(dt_rows)} income head(s) taxed under both codes — see reconciliation",
            "The same income is taxed in India (its own Act) and the US (the IRC): " + ", ".join(r["label"] for r in dt_rows)
            + f". Overlapping exposure of {_usd(recon['overlapUsd'])} is what the FTC / §159 relief resolves."
            + (" Some heads are planning-grade estimates pending line-item inputs." if recon.get("anyEstimate") else ""),
            f"Open the Cross-Basis Reconciliation on the Filings tab to see each head on both bases, then relieve the overlap via {d['usFtcFormXbr']} (US) / Form 44 (India).",
            recon["overlapUsd"], ["DTAA", d["usFtcFormXbr"], "Form 44"],
        ))

    # -- special_rate_gaming_winnings (findings-batch2-nodes.js, conflicts.js:914-934) --
    special_bb_usd = _inr_to_usd(d["specialRate115bbInr"] or 0, ctx)
    if special_bb_usd > 1:
        findings.append(make_finding(
            "special_rate_gaming_winnings", "warning" if d["residencyResult"]["us"]["worldwide"] else "info", "income",
            f"{_usd(special_bb_usd)} of lottery/gaming winnings — flat 30% (s.128/194), no exemptions",
            "This income is taxed at a flat 30% with no basic exemption threshold, no Chapter VI-A deduction and no §156 "
            "rebate — it's now included in the India tax total and the FTC/double-tax figures above."
            + (" Because the US taxes worldwide income, the same winnings are very likely also US-taxable "
               "as ordinary income — a real double-tax exposure that the general FTC computation only approximates, since it "
               "doesn't specifically match this flat 30% Indian rate against whatever ordinary rate the US applies to it." if d["residencyResult"]["us"]["worldwide"] else ""),
            "Confirm US-side treatment of the same winnings separately from the general FTC computation — a flat-rate/"
            "graduated-rate mismatch on the same income can leave a residual gap the average-rate FTC approximation misses.",
            special_bb_usd, ["s.128", "s.194"],
        ))

    # -- form_1099da_awareness (findings-batch3-nodes.js, conflicts.js:590-605) --
    if (d["capitalGainsComputation"].get("vdaSaleConsiderationInr") or 0) > 0 and d["hasUsScopeBoundaryFtc"]:
        findings.append(make_finding(
            "form_1099da_awareness", "info", "document",
            "Crypto/VDA activity on file — check for US Form 1099-DA broker reporting",
            "Virtual digital asset transactions are recorded on the India side this year. If any of this activity (or other "
            "crypto activity not entered here) ran through a US-regulated broker or exchange, that broker owes the taxpayer "
            "Form 1099-DA — gross-proceeds reporting is mandatory for 2025 transactions, and basis reporting becomes mandatory "
            "for covered assets from 1 Jan 2026. Indian-exchange-only activity has no US 1099-DA angle at all.",
            "Ask whether any crypto activity this year touched a US-based broker/exchange; if so, reconcile against the "
            "1099-DA received before relying on the capital-gains figures shown elsewhere.",
            0, ["Form 1099-DA"],
        ))

    # -- 6. TAX-YEAR / APPORTIONMENT MISMATCH (findings-batch3-nodes.js, conflicts.js:1081-1096) --
    if d["residencyResult"]["dualResident"] or (d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"]):
        ap = d["apportionmentResultBoundary"]
        if ap:
            findings.append(make_finding(
                "tax_year_mismatch", "info", "credit",
                "Tax-year apportionment: Indian FY ↔ US CY (computed)",
                f"India taxes Apr–Mar; the US taxes Jan–Dec. WISING splits the Indian FY across US calendar years — "
                f"{_usd(ap['indiaToCyPrimaryUsd'])} into CY{ap['cyPrimary']} and {_usd(ap['indiaToCyNextUsd'])} into CY{ap['cyNext']}"
                f" ({ap['basis']}) — and apportions the US calendar year into the Indian FY (9/12 + 3/12).",
                f"See the FY ↔ CY Apportionment panel on the Filings tab for the period-matched figures behind Form 44 (India) and {d['usFtcFormXbr']} (US). Planning-grade — refine with per-transaction dates at filing.",
                0, ["Apr 1 – Mar 31 (Tax Year)", "Jan 1 – Dec 31 (Calendar Year)"],
            ))

    # -- 7. FX BASIS MISMATCH (findings-batch3-nodes.js, conflicts.js:1098-1108) --
    if d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"]:
        findings.append(make_finding(
            "fx_basis", "info", "credit",
            "FX conversion basis is an approximation",
            "Cross-border amounts are normalized at a flat 83 INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
            "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
            0, ["Rule 115", "SBI TTBR"],
        ))

    # -- 7b. STATE RESIDENCY — TREATY DOES NOT BIND STATES (findings-batch3-nodes.js, conflicts.js:1110-1139) --
    sr = d["stateResidencyRawXbr"]
    has_state_ties = bool(sr["primaryState"] or sr["domicileDec31"] or sr["domicileJan1"] or (sr["footprint"] or []))
    has_federal_treaty_posture = d["residencyResult"]["dualResident"] or d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none" or d["treatyDtaaForcedNrRaw"]
    if has_state_ties and has_federal_treaty_posture:
        state_note = []
        flag_state = sr["domicileDec31"] or sr["primaryState"] or sr["domicileJan1"]
        if sr["caSafeHarbor"] or sr["caRetainsTies"]:
            state_note.append("California safe-harbor/retained-ties facts are on file — CA is aggressive about domicile and does not allow a credit for foreign tax paid.")
        if sr["ny548DayRule"] or sr["nyPermanentAbode"] or sr["nyDaysPresent"] > 0:
            state_note.append("New York statutory-residency facts are on file (183-day + permanent-abode / 548-day rule) — NY residency is tested independently of the federal position.")
        if sr["movedStates"]:
            state_note.append("A mid-year state move is on file — part-year returns may be due in two states.")
        findings.append(make_finding(
            "state_treaty_not_binding", "warning", "treaty",
            "State tax residency is not resolved by the DTAA / federal treaty position" + (f" ({flag_state})" if flag_state else ""),
            "The India-US treaty and the federal residency determination above bind FEDERAL tax only. "
            + (f"{flag_state} " if flag_state else "The state on file ") + "applies its own domicile or statutory-day residency test, "
            "independent of the Article 4 tie-breaker or any §911/1040NR position. A taxpayer can be a federal treaty "
            "non-resident while remaining a full worldwide-income STATE resident with Indian income fully taxable and "
            + ("no matching relief in some states." if state_note else "little or no state-level foreign tax credit."),
            "Run the state's own residency test (domicile intent + day count) separately from the federal/treaty analysis. "
            + (" ".join(state_note) if state_note else "Check whether the state allows any credit for foreign tax paid — several do not.")
            + " Do not assume the federal treaty position carries over.",
            0, ["State residency", flag_state or "State domicile"],
        ))

    # -- 8. PFIC EXPOSURE (findings-batch3-nodes.js, conflicts.js:1141-1149) --
    mf_count = sum(1 for t in d["indiaFinancialHoldingsTxRaw"] if t.get("asset_type") and "mutual_fund" in str(t["asset_type"]).lower())
    if mf_count > 0 and d["residencyResult"]["us"]["isResident"]:
        findings.append(make_finding(
            "pfic", "critical", "entity",
            "PFIC exposure: Indian mutual funds",
            f"{mf_count} Indian mutual fund / ETF holding(s) detected. For a US person these are Passive Foreign Investment Companies — taxed under the punitive §1291 excess-distribution regime by default, with a separate Form 8621 per fund.",
            "Evaluate a QEF or Mark-to-Market election (must be timely). Many Indian AMCs cannot supply a PFIC Annual Information Statement, which can force the §1291 default — consider restructuring holdings to US-domiciled funds.",
            0, ["Form 8621", "§1291", "QEF / MTM"],
        ))

    # -- 9. CFC / FORM 5471 (findings-batch3-nodes.js, conflicts.js:1151-1172; XB-14 quantification) --
    # ENTITY-ROUTING FIX (29 Jul 2026, ported from the equivalent JS fix):
    # "US person" for CFC purposes isn't just the individual-residency test
    # (residencyResult.us.isResident) — a domestic C-corp/S-corp/partnership/
    # trust can independently own CFC stock with its own §951/951A/Form-5471
    # obligation, same pattern already established for the Form 5471/8621/
    # etc. DOCUMENT triggers (filings/documents.py's is_us_person).
    biz_count = len(d["bizEntriesAgg"])
    is_us_person_for_cfc = d["residencyResult"]["us"]["isResident"] or d["usEntityKind"] in ("ccorp", "scorp", "partnership", "trust")
    is_passthrough_entity = d["usEntityKind"] in ("scorp", "partnership")
    if d["viaForeignCorpXbr4"] and is_us_person_for_cfc:
        cfc = d["cfcInclusionResult"]
        # Only report computed numbers once real financial data has actually
        # been entered for at least one CFC — ownership alone (hasAnyCfc)
        # isn't enough, since every field defaults to 0 and would otherwise
        # print a "$0 inclusion" title indistinguishable from "not entered".
        # Mirrors findings-batch3-nodes.js exactly.
        cfc_has_financials = cfc["nonElectedOrdinaryInclusionUsd"] > 0 or cfc["electedPool"]["nctiUsd"] > 0 or cfc["electedPool"]["subpartFUsd"] > 0
        if cfc["hasAnyCfc"] and cfc_has_financials:
            non_elected_total = cfc["nonElectedOrdinaryInclusionUsd"]
            elected_total = cfc["electedPool"]["netTaxUsd"]
            detail = "Form 5471 applies. "
            if is_passthrough_entity:
                detail += ("This is a pass-through entity: the inclusion is not taxed here — it flows through to the partners'/shareholders' own returns "
                           "(each tested for their own §951A US-shareholder status and, if eligible, their own §962 election), which WISING does not yet "
                           "allocate at the owner level. The figures below are the entity's total inclusion before that allocation. ")
            elif d["usEntityKind"] == "ccorp":
                detail += ("A domestic C-corporation needs no §962 election — §951A inclusion is automatic and is taxed with this return's own income "
                           "(see the Tax Computation panel): the 40% §250 deduction (OBBBA TY2026, NCTI portion only) and 90% deemed-paid FTC apply "
                           "without election. ")
            elif non_elected_total > 0:
                detail += f"Without a §962 election: {_usd(non_elected_total)} of NCTI + Subpart F is included in full as ordinary income (no §250 deduction, no indirect FTC available). "
            if (cfc["electedPool"]["nctiUsd"] + cfc["electedPool"]["subpartFUsd"]) > 0 and not is_passthrough_entity and d["usEntityKind"] != "ccorp":
                detail += (f"With a §962 election: {_usd(cfc['electedPool']['taxableBaseUsd'])} taxable base (after the 40% §250 deduction on the NCTI portion — OBBBA TY2026, "
                           f"Subpart F never gets §250) at a flat 21% rate, less a {_usd(cfc['electedPool']['creditableFtcUsd'])} deemed-paid FTC (90% of foreign tax paid — OBBBA TY2026), "
                           f"net tax {_usd(cfc['electedPool']['netTaxUsd'])}. ")
            detail += ("Documented simplifications: QBAI is not collected (OBBBA TY2026 eliminated the 10% QBAI return exclusion, so it isn't needed for the core inclusion); "
                       "no PTEP/E&P distribution-year tracking; Subpart F capped at each CFC's own entered E&P; no high-tax exclusion election modeled; ownership-based CFC-status "
                       "test is a simplified single->50%-owner test, not the real aggregate US-shareholder test; state conformity to GILTI/NCTI (many states decouple) not modeled.")
            title = f"Controlled Foreign Corporation — NCTI/Subpart F inclusion: {_usd(non_elected_total + elected_total)}"
            if non_elected_total > 0 and (cfc["electedPool"]["nctiUsd"] + cfc["electedPool"]["subpartFUsd"]) > 0:
                title += " (mixed elected/non-elected)"
            findings.append(make_finding(
                "cfc", "warning", "entity", title, detail,
                "File Form 5471 regardless. Confirm each CFC's actual tested income/loss, Subpart F income, E&P and foreign tax paid with the entity's own books before "
                "relying on this for filing — these are preparer-entered estimates, not independently verified.",
                0 if is_passthrough_entity else non_elected_total + elected_total, ["Form 5471", "GILTI/NCTI §951A", "Subpart F", "§962 election", "§250 deduction"],
            ))
        else:
            findings.append(make_finding(
                "cfc", "warning", "entity",
                "Controlled Foreign Corporation — Form 5471 required (GILTI/Subpart F not yet quantified)",
                "Layer 1 records the US person owning ≥10% of a foreign corporation" + (" (Indian company on file)" if biz_count > 0 else "")
                + ", so Form 5471 applies and GILTI / Subpart F can accelerate US tax on undistributed Indian profits before any dividend is paid. "
                "Ownership is on file but no tested income/loss, Subpart F income, or E&P has been entered yet for this entity, so no inclusion amount is computed.",
                "File Form 5471 regardless. Enter the CFC's tested income/loss, Subpart F income and E&P on the Foreign Entities screen to quantify the GILTI/NCTI "
                "and Subpart F inclusion (and evaluate the §962 election).",
                0, ["Form 5471", "GILTI/NCTI §951A", "Subpart F", "§962 election"],
            ))
    elif biz_count > 0 and is_us_person_for_cfc:
        findings.append(make_finding(
            "cfc_below_threshold", "info", "entity",
            "Indian company held below the 10% CFC threshold",
            f"{biz_count} Indian business interest(s) on file, but Layer 1 shows US ownership below 10% — so Form 5471 Category 5 / GILTI do not apply this year.",
            "No 5471 action needed at current ownership. WISING recomputes this every time you re-run the numbers, so update the ownership percentage in Layer 1 as soon as a purchase or reorganization changes it — this isn't monitored in the background.",
            0, ["Form 5471", "10% threshold"],
        ))

    # -- 9b. TRANSFER PRICING (findings-batch3-nodes.js, conflicts.js:1174-1194) --
    if d["viaForeignCorpXbr4"]:
        findings.append(make_finding(
            "transfer_pricing", "warning", "document",
            "Related-party cross-border transactions — transfer pricing documentation may apply",
            "Layer 1 records a related-party cross-border ownership link (US person owning ≥10% of a foreign/Indian corporation). "
            "Any transactions between you and that related entity this year — service fees, cost allocations, loans, guarantees, "
            "IP licensing — must be priced at arm's length under India's s.92-92F and the US's parallel §482 regime. WISING does "
            "NOT evaluate whether pricing is arm's-length; it only flags that the relationship exists.",
            "If related-party cross-border transactions occurred this year, confirm Form 3CEB certification and Rule 10D "
            "documentation requirements (India side) and §482 documentation (US side) with a transfer-pricing specialist — "
            "penalties for missing documentation run 2% of transaction value, up to 200% for concealment.",
            0, ["s.92-92F", "Form 3CEB", "Rule 10D", "§482"],
        ))

    # -- 10. RETIREMENT ACCOUNT TREATMENT MISMATCH (findings-batch3-nodes.js, conflicts.js:1196-1217) --
    if (d["epfInrRaw"] > 0 or d["ppfInrRaw"] > 0 or d["npsInrRaw"] > 0) and d["residencyResult"]["us"]["isResident"]:
        epf_interest_usd = _inr_to_usd(d["taxableEpfInterestInrAgg"] or 0, ctx)
        nps_withdrawal_usd = _inr_to_usd(d["taxableNpsWithdrawalInrAgg"] or 0, ctx)
        has_quantified = epf_interest_usd > 1 or nps_withdrawal_usd > 1
        quantified_parts = []
        if epf_interest_usd > 1:
            quantified_parts.append(f"{_usd(epf_interest_usd)} of EPF interest")
        if nps_withdrawal_usd > 1:
            quantified_parts.append(f"{_usd(nps_withdrawal_usd)} of NPS withdrawal")
        findings.append(make_finding(
            "retirement_mismatch", "warning", "retirement",
            "Indian retirement accounts (EPF / PPF / NPS) are taxed differently by the US",
            "India treats EPF, PPF and NPS as tax-free (or lightly taxed). The US does not automatically agree: the IRS can tax "
            "the interest these accounts earn every year, and may treat PPF like a trust that needs extra forms."
            + (f" Layer 1 already records {' and '.join(quantified_parts)} as taxable this year — WISING "
               "has added that amount to the US taxable income and tax figures shown elsewhere on this page (as ordinary "
               "foreign-source interest/pension), so it isn't just displayed here without effect." if has_quantified else ""),
            "WISING does NOT determine whether a specific account is a treaty-protected pension under DTAA Art. 20, or "
            "whether PPF should be treated as a foreign trust requiring Form 3520/3520-A — those are legal/factual "
            "determinations you need to make yourself; Form 3520 only appears on the filing checklist when the separate "
            "PPF/EPF-plus-US-residency trigger fires, not because this specific check ran. Confirm the treaty-protection "
            "question and trust classification before relying on the totals above.",
            epf_interest_usd + nps_withdrawal_usd, ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"],
        ))

    # -- 10b. DEEMED DIVIDEND ON BUYBACK (findings-batch3-nodes.js, conflicts.js:1219-1246) --
    deemed_div_usd = _inr_to_usd(d["capitalGainsComputation"].get("deemedDividendInr") or 0, ctx)
    if deemed_div_usd > 1 and d["residencyResult"]["us"]["worldwide"]:
        findings.append(make_finding(
            "deemed_dividend_buyback_mismatch", "warning", "income",
            f"{_usd(deemed_div_usd)} share buyback (Oct 2024 - Mar 2026 window) — India taxed it as dividend, the US likely as capital gain",
            "Under s.2(40)(f), buy-backs between 1-Oct-2024 and 31-Mar-2026 were taxed by India as the FULL consideration as "
            "a deemed dividend at slab rates, with the shares' cost basis becoming a capital LOSS rather than reducing the "
            "dividend. The US, by contrast, ordinarily treats a share buyback as a capital transaction — gain or loss "
            "against the shares' cost basis, not dividend income. The same cash is very likely characterized differently "
            "by each country, which can distort both the FTC basket (passive/dividend vs. capital gain) and the true "
            "amount of relief available. (Budget 2026 reversed this for buy-backs on/after 1-Apr-2026 — see s.69 instead.)",
            "Don't assume the general FTC computation resolves this cleanly — confirm how the US side actually reports the "
            "buyback (capital transaction vs. dividend) and reconcile the mismatch explicitly, including the capital loss "
            "India allows on the extinguished shares, which the US computation won't mirror the same way.",
            deemed_div_usd, ["s.2(40)(f)", "Share buyback", "FTC basket"],
        ))

    # -- 4e. NO US-INDIA TOTALIZATION AGREEMENT (findings-batch3-nodes.js, conflicts.js:657-679) --
    se_tax_usd = d["usTaxResult"].get("seTaxUsd") or 0
    salary_usd = _inr_to_usd(d["salaryInr"] or 0, ctx)
    business_usd = _inr_to_usd(d["businessComputation"]["businessInr"] or 0, ctx)
    has_india_nexus = d["residencyResult"]["india"]["isResident"] or business_usd > 0 or salary_usd > 0
    if se_tax_usd > 1 and has_india_nexus:
        findings.append(make_finding(
            "no_totalization_agreement", "warning", "credit",
            "No US–India Totalization Agreement — self-employment tax has no double-coverage relief",
            f"{_usd(se_tax_usd)} of US self-employment tax (Schedule SE) is owed in full. Unlike ~30 countries with a US "
            "Totalization Agreement, India has none — there is no Certificate of Coverage to exempt a self-employed or "
            "seconded worker from social-security-style contributions in both countries, and no credit mechanism folds "
            "Indian PF/social contributions into the US SE tax computation.",
            "Confirm whether Indian-side EPF/social contributions are also being made on the same work; if so this is "
            "uncoordinated double coverage by design (not a filing error) — the only mitigants are entity structuring "
            "(e.g., routing through a foreign corporation to convert SE income to a dividend/salary mix) or accepting the cost.",
            0, ["SE tax", "Schedule SE", "No US-India Totalization Agreement"],
        ))

    # -- 4d. NIIT / ADDITIONAL MEDICARE — NOT OFFSET BY THE FTC (findings-batch3-nodes.js, conflicts.js:633-655) --
    niit_usd = d["usTaxResult"].get("niitUsd") or 0
    addl_med_usd = d["usTaxResult"].get("additionalMedicareUsd") or 0
    if (niit_usd > 1 or addl_med_usd > 1) and d["ftcResult"]["us"]["indiaTaxPaidUsd"] > 0:
        surtax_parts = []
        if niit_usd > 1:
            surtax_parts.append(f"NIIT {_usd(niit_usd)} (§1411, 3.8%)")
        if addl_med_usd > 1:
            surtax_parts.append(f"Additional Medicare {_usd(addl_med_usd)} (§3101(b)(2), 0.9%)")
        findings.append(make_finding(
            "niit_medicare_not_creditable", "warning", "credit",
            "NIIT / Additional Medicare surtaxes are not offset by the Foreign Tax Credit",
            " and ".join(surtax_parts) + " applies on top of regular US income tax. Indian income tax can only credit the "
            "REGULAR US income tax (§901/§904) — these two surtaxes are outside the FTC mechanism entirely, so they stand "
            "as double taxation even when the rest of the Indian tax is fully credited.",
            "There is no credit path for this residue — the only levers are reducing MAGI/net investment income (retirement "
            "contributions, timing) or, for Additional Medicare, W-4 withholding planning. Make sure the client understands "
            "the FTC reconciliation above does not clear this amount.",
            niit_usd + addl_med_usd, ["§1411", "§3101(b)(2)", "Form 8960", "Form 8959"],
        ))

    # -- 3. TREATY BENEFIT CLAIMED WITHOUT TRC / FORM 10F (findings-batch4-nodes.js, conflicts.js:127-143) --
    treaty_elections = d["treatyElectionsRaw"]
    claims_treaty = d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none" or d["treatyDtaaForcedNrRaw"] or d["treatyFiles1040nrRaw"] or len(treaty_elections) > 0
    if claims_treaty and (not d["treatyTrcStatus"] or not d["treatyForm10fFiled"]):
        missing = []
        if not d["treatyTrcStatus"]:
            missing.append("TRC (IRS Form 6166)")
        if not d["treatyForm10fFiled"]:
            missing.append("Form 41")
        findings.append(make_finding(
            "treaty_docs_missing", "critical", "treaty",
            "Treaty relief claimed without supporting documents",
            "A treaty position / DTAA rate is being relied upon, but " + " and ".join(missing)
            + " is not on file. Indian tax authorities will deny treaty relief u/s 159(8) without a valid TRC, and Form 41 is mandatory u/r 75.",
            "Obtain " + " and ".join(missing) + " before filing. For US residents, request Form 6166 from the IRS (Form 8802 application) well in advance — it can take 6–8 weeks.",
            0, ["s.159(8)", "Rule 75 (Income-tax Rules, 2026)", "Form 6166"],
        ))

    # -- 3c2. WITHHOLDING DOCUMENTATION GAP (findings-batch4-nodes.js, conflicts.js:226-252) --
    india_total_gap_inr = 0.0
    if not d["isEntityTaxpayer"]:
        for stream in (d["s115aDividendDetailedXbr"], d["s115aRoyaltyDetailedXbr"], d["s115aFtsDetailedXbr"]):
            if not stream:
                continue
            for e in stream.get("elections") or []:
                docs_ok = e["outcome"] != "denied_no_docs"
                if not docs_ok and e["electedRate"] is not None and e["electedRate"] < e["domesticRate"]:
                    india_total_gap_inr += e["appliedAmountInr"] * (e["domesticRate"] - e["electedRate"])
        if d["nrInterestDetailedXbr"]:
            for e in d["nrInterestDetailedXbr"].get("elections") or []:
                docs_ok = e["outcome"] != "denied_no_docs"
                counterfactual_treaty_tax_inr = e["appliedAmountInr"] * e["electedRate"] if e["electedRate"] is not None else None
                if not docs_ok and counterfactual_treaty_tax_inr is not None and counterfactual_treaty_tax_inr < e["marginalSlabTaxInr"]:
                    india_total_gap_inr += e["marginalSlabTaxInr"] - counterfactual_treaty_tax_inr
    is_nra_for_wh = d["usEntityKind"] not in ("ccorp", "scorp", "partnership", "trust") and d["treatyFiles1040nrRaw"] and not d["s6013hElection"]
    us_total_gap_usd = d["nraFdapDetail"]["gapUsd"] if (is_nra_for_wh and d["nraFdapDetail"]["fdapUsd"] > 0) else 0
    total_gap_usd = _inr_to_usd(india_total_gap_inr, ctx) + us_total_gap_usd
    if total_gap_usd > 1:
        wh_parts = []
        if india_total_gap_inr > 1:
            wh_parts.append(f"{_inr(india_total_gap_inr)} in India (TRC/Form 41)")
        if us_total_gap_usd > 1:
            wh_parts.append(f"{_usd(us_total_gap_usd)} in the US (Form W-8BEN)")
        findings.append(make_finding(
            "withholding_documentation_gap", "critical", "document",
            f"Missing documentation is costing {_usd(total_gap_usd)} in avoidable withholding tax this year",
            "Adding up every income stream where a treaty-reduced rate was claimed but denied for lack of supporting "
            "documentation: " + " + ".join(wh_parts) + f" — {_usd(total_gap_usd)} total, computed directly from the "
            "same rate/amount figures used elsewhere on this page, not estimated. See the Withholding Taxes page for the "
            "full row-by-row breakdown of which income and which document.",
            "File the missing documentation (TRC + Form 41 for India s.159 elections; Form W-8BEN with the US withholding "
            "agent for FDAP) as soon as possible — none of this is lost once filed for a FUTURE payment, but the tax "
            "already withheld/assessed on past payments this year may require a separate refund claim to recover.",
            total_gap_usd, ["Withholding tax", "TRC", "Form 41", "Form W-8BEN"],
        ))

    # -- 5. FORM 44 TIMING (findings-batch5-nodes.js, conflicts.js:1062-1079) --
    if d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"] and (d["aggregateUsIncomeResult"]["foreignSourceTotal"]["usd"] > 0 or d["taxesPaidUsResult"]["total"]["usd"] > 0):
        findings.append(make_finding(
            "form67_required", "info", "document",
            "Form 44 — required for the Indian FTC claim",
            "Foreign income / foreign tax is present, so India requires Form 44 (with Schedule FSI and TR) on or before the ITR due date to allow FTC u/s 90/91.",
            "WISING flags Form 44 (with Schedule FSI/TR) as required on the filing checklist, using the FSI/TR figures already computed above — actually preparing and e-filing it on the income-tax portal ahead of the ITR due date is still a manual step.",
            0, ["Form 44", "Rule 128", "Schedule FSI", "Schedule TR"],
        ))

    # -- 12. FBAR LIMIT BREACH (findings-batch5-nodes.js, conflicts.js:1459-1468) --
    if d["hasUsScopeBoundaryFtc"]:
        fbar_value = d["aggregatePeakUsdResult"]["usd"]
        fbar_limit = LIMITS["FBAR_AGGREGATE_USD"]
        if (fbar_value / fbar_limit if fbar_limit > 0 else 0) >= 1:
            findings.append(make_finding(
                "fbar_limit", "critical", "limit",
                "FBAR threshold breached",
                f"Aggregate peak balance across foreign accounts is {_usd(fbar_value)}"
                ", above the USD 10,000 reporting cliff. EVERY foreign account must be reported, not just those over the limit.",
                "File FinCEN Form 114 by the due date (auto-extended to Oct 15). Non-willful penalties start at ~$10,000 per violation; willful penalties are far higher.",
                0, ["FinCEN 114", "FBAR"],
            ))

    # -- 12b. EQUITY COMPENSATION — CROSS-BORDER SOURCING (findings-batch5-nodes.js, conflicts.js:1506-1528) --
    eq = d["equityCompResult"]
    if eq["hasUsEquityComp"] and eq["esopPerquisiteInr"] > 0:
        findings.append(make_finding(
            "equity_comp_sourcing", "warning", "income",
            "Equity compensation taxed on both sides — cross-border sourcing not applied",
            "Both an India ESOP/perquisite event and a US equity-compensation event (RSU vest / NSO exercise) are on file "
            "for this year. India taxes the ESOP perquisite in full at exercise/allotment (s.17(1)(vi)); the US taxes RSU "
            "vesting / NSO exercise in full as ordinary income in the vesting/exercise year. Absent a workday-based "
            "allocation, the same equity award can be fully taxed by BOTH countries rather than apportioned to where the "
            "services were actually performed during the vesting period.",
            "Reconstruct the vesting-period workday split between India and the US (DTAA Art. 15/16 dependent-personal-"
            "services sourcing) so each country only taxes its proportionate share, then claim FTC/§159 relief on the "
            "genuinely overlapping portion rather than the full award twice.",
            0, ["DTAA Art. 15", "s.17(1)(vi)", "RSU vesting", "NSO exercise"],
        ))

    findings.extend(_holding_period_mismatch_findings(d, ctx))

    # -- schedule_fa_inconsistent (xb7-nodes.js + report-batch5-nodes.js, conflicts.js:1338-1346) --
    if d["scheduleFaInconsistentTrigger"]:
        findings.append(make_finding(
            "schedule_fa_inconsistent", "critical", "document",
            "Layer 1 forms disagree: India form says 'no foreign assets', US form shows foreign holdings",
            "The India intake form explicitly records NO foreign assets, but the US intake form shows US-source income and/or "
            "non-Indian accounts for the same taxpayer — who is an Indian ROR this year and therefore subject to worldwide "
            "Schedule FA disclosure. This is a direct contradiction between the two forms, not just a missing field.",
            "Reconcile the two forms before filing: either the India form's 'no foreign assets' answer needs correcting, or the "
            "US-side accounts/income need to be re-checked. Schedule FA penalties for non-disclosure are severe and independent "
            "of whether any tax is actually due on the asset.",
            0, ["Schedule FA", "Black Money Act"],
        ))

    # -- black_money_act_exposure (xb7-nodes.js + report-batch5-nodes.js, conflicts.js:1375-1385) --
    if d["scheduleFaInconsistentTrigger"] and d["xb7ShouldFire"]:
        bma_tax_usd = d["bmaAssetValueUsd"] * 0.30
        bma_max_penalty_usd = bma_tax_usd * 3
        findings.append(make_finding(
            "black_money_act_exposure", "critical", "document",
            f"Black Money Act 2015 exposure on undisclosed foreign assets — up to {_usd(d['bmaMaxTotalUsd'])} at stake",
            f"{_usd(d['bmaAssetValueUsd'])} of foreign asset value is undisclosed on Schedule FA (same forms-disagree fact as "
            f"above). The Black Money Act imposes a flat 30% tax ({_usd(bma_tax_usd)}) on the asset value PLUS a penalty "
            f"of up to 3x that tax (up to {_usd(bma_max_penalty_usd)}) — up to {_usd(d['bmaMaxTotalUsd'])}"
            " total (120% of the asset's value) — PLUS possible prosecution (up to 10 years' rigorous imprisonment for "
            "willful evasion), independent of and in addition to the monetary exposure.",
            "Correct the Schedule FA disclosure before this compounds further. FAST-DS 2026 (a one-time amnesty window, gap "
            "tracker XB-21) offers a much cheaper cure — 30% tax + 30% penalty (60% total) if the asset/income was never "
            "taxed, or a flat ₹1,00,000 fee if it was bought from already-taxed income or acquired while genuinely NRI.",
            d["bmaMaxTotalUsd"], ["Black Money Act 2015", "s.10", "s.41", "s.51", "Schedule FA"],
        ))

    return findings


NODES["findingsCrossborderResult"] = NodeDef(
    deps=("hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "ftcResult", "usFtcFormXbr",
          "indiaIsCompany", "indiaIsIndianCompanyRaw", "residencyResult",
          "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw",
          "treatyIndiaResidenceRaw", "treatyUsResidenceRaw", "usIsCitizenRaw", "usHasGreenCardRaw",
          "tieBreakHomeRaw", "tieBreakCviRaw", "tieBreakAbodeRaw", "tieBreakNationalityRaw", "mapDoubleTaxedIncomeResult",
          "crossBasisResult", "specialRate115bbInr",
          "capitalGainsComputation", "apportionmentResultBoundary",
          "stateResidencyRawXbr", "treatyDtaaForcedNrRaw",
          "indiaFinancialHoldingsTxRaw", "viaForeignCorpXbr4", "bizEntriesAgg", "cfcInclusionResult",
          "usTaxResult", "salaryInr", "businessComputation",
          "epfInrRaw", "ppfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg",
          "treatyElectionsRaw", "treatyTrcStatus", "treatyForm10fFiled", "treatyFiles1040nrRaw",
          "s115aDividendDetailedXbr", "s115aRoyaltyDetailedXbr", "s115aFtsDetailedXbr", "nrInterestDetailedXbr",
          "isEntityTaxpayer", "usEntityKind", "s6013hElection", "nraFdapDetail",
          "aggregateUsIncomeResult", "taxesPaidUsResult", "aggregatePeakUsdResult",
          "equityCompResult",
          "incUs", "dedUs", "usFilingStatusRaw", "worldwideUs", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs",
          "scheduleFaInconsistentTrigger", "xb7ShouldFire", "bmaAssetValueUsd", "bmaMaxTotalUsd"),
    compute=_findings_crossborder_result,
)

ALL_FINDING_IDS = (
    "ftc_gap", "ftc_available", "entity_dual_residency_poem", "dual_residency",
    "dual_residency_resolved", "cross_basis_summary", "special_rate_gaming_winnings",
    "form_1099da_awareness", "tax_year_mismatch", "fx_basis", "state_treaty_not_binding",
    "pfic", "cfc", "cfc_below_threshold", "transfer_pricing", "retirement_mismatch",
    "deemed_dividend_buyback_mismatch", "no_totalization_agreement",
    "niit_medicare_not_creditable", "treaty_docs_missing", "withholding_documentation_gap",
    "equity_comp_sourcing", "form67_required", "fbar_limit", "holding_period_mismatch",
    "schedule_fa_inconsistent", "black_money_act_exposure",
)


def build(base):
    r = cross_basis.build(base)

    # black_money_act.py is a standalone file (own routerJurisdiction/
    # routerUsSignal/hasIndiaScope/hasUsScope/indiaResidencyStatusRaw raw
    # leaves) — aliased shouldFire -> xb7ShouldFire before the generic merge,
    # same "one genuine, dangerous exception" handling as us/findings.py's
    # us1ShouldFire/us5ShouldFire.
    r.register("xb7ShouldFire", black_money_act.NODES["shouldFire"])
    for node_id, node in black_money_act.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)

    # s115a*Detailed/nrInterestDetailed/nraFdapDetail: this finding needs
    # BOTH the India-side treaty-election detail (built in india/findings.py)
    # and the US-side NRA-FDAP detail (built in us/findings.py) in the SAME
    # registry — re-registered here under an -Xbr suffix (reusing the exact
    # same compute functions) rather than importing india/findings.py's or
    # us/findings.py's full build() chains, which would re-derive
    # aggregate_india_income/aggregate_us_income a second time and collide.
    r.register("s115aDividendDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"), compute=india_findings._s115a_dividend_detailed))
    r.register("s115aRoyaltyDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=india_findings._s115a_royalty_detailed))
    r.register("s115aFtsDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=india_findings._s115a_fts_detailed))
    r.register("nrInterestDetailedXbr", NodeDef(
        deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
              "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"),
        compute=india_findings._nr_interest_detailed,
    ))
    r.register("nraRaw", NodeDef(
        deps=(), compute=lambda d, ctx: {
            "treatyRateClaims": safe(ctx.get("us"), "nra_specific.treaty_rate_claims", []) or [],
            "submittedW8ben": safe(ctx.get("us"), "nra_specific.submitted_w8ben", False) is True,
            "usRealPropertyDisposed": safe(ctx.get("us"), "nra_specific.us_real_property_disposed", False) is True,
            "firptaWithholdingUsd": num(safe(ctx.get("us"), "nra_specific.firpta_withholding_usd", 0)),
        },
        layer1_fields=(
            "us.nra_specific.treaty_rate_claims", "us.nra_specific.submitted_w8ben",
            "us.nra_specific.us_real_property_disposed", "us.nra_specific.firpta_withholding_usd",
        ),
    ))
    r.register("nraFdapIncomeUsdRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "nra_specific.us_fdap_income_usd", 0)), layer1_fields=("us.nra_specific.us_fdap_income_usd",)))
    r.register("nraFdapDetail", NodeDef(
        deps=("nraRaw", "nraFdapIncomeUsdRaw"),
        compute=lambda d, ctx: (lambda claim: {
            "fdapUsd": d["nraFdapIncomeUsdRaw"],
            "fdapRate": (0.30 if not (d["nraRaw"]["submittedW8ben"] and claim and claim.get("rate") is not None) else max(0.0, min(1.0, num(claim["rate"]) / 100))),
            "claimedRate": (claim["rate"] if claim and claim.get("rate") is not None else None),
            "w8benOnFile": d["nraRaw"]["submittedW8ben"],
            "gapUsd": (d["nraFdapIncomeUsdRaw"] * (0.30 - max(0.0, min(1.0, num(claim["rate"]) / 100))) if (claim and claim.get("rate") is not None and not d["nraRaw"]["submittedW8ben"] and max(0.0, min(1.0, num(claim["rate"]) / 100)) < 0.30) else 0),
        })((d["nraRaw"]["treatyRateClaims"] or [None])[0] if d["nraRaw"]["treatyRateClaims"] else None),
    ))

    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
