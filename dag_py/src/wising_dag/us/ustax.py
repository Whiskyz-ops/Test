"""computeUsTax — individual/resident path. Port of
prototypes/graph-pilot/ustax-nodes.js.

`usEntityKind`/`worldwideUs`/`incUs`/`baseYearUs` are EXPLICIT BOUNDARY
INPUTS (read `ctx["model"]...`/`ctx["computed"]...`, which don't exist in
the real `{router, india, us}` ctx shape) — overridden by us_full.py
(incUs, worldwideUs) and ustax_full.py (usEntityKind, baseYearUs, via
agg10/core.entry's entityResult/metaResult), mirroring india_full.py's
same pattern.
"""
from __future__ import annotations

from ..core.dates import parse_date
from ..core.graph import NodeDef
from ..core.util import js_num_str, js_round, num, safe
from . import constants as C

T = C.US
FEIE_MAX_USD = C.FEIE_MAX_USD
NIIT_THRESHOLD = C.NIIT_THRESHOLD


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


def compute_salt_cap(agi: float, status: str) -> float:
    base = T["SALT_CAP_BASE_USD"].get(status, T["SALT_CAP_BASE_USD"]["single"])
    threshold = T["SALT_CAP_PHASEOUT_THRESHOLD_USD"].get(status, T["SALT_CAP_PHASEOUT_THRESHOLD_USD"]["single"])
    reduced = base - T["SALT_CAP_PHASEOUT_RATE"] * max(0.0, agi - threshold)
    return max(T["SALT_CAP_FLOOR_USD"], min(base, reduced))


def compute_ss_taxable_usd(gross_ss_usd: float, other_agi_excl_ss: float, tax_exempt_interest_usd: float, status: str) -> float:
    if gross_ss_usd <= 0:
        return 0.0
    base_amt = T["SS_PROVISIONAL_INCOME_BASE_USD"].get(status, T["SS_PROVISIONAL_INCOME_BASE_USD"]["single"])
    addl_amt = T["SS_PROVISIONAL_INCOME_ADDITIONAL_USD"].get(status, T["SS_PROVISIONAL_INCOME_ADDITIONAL_USD"]["single"])
    line2 = 0.5 * gross_ss_usd
    line5 = line2 + max(0.0, other_agi_excl_ss) + max(0.0, tax_exempt_interest_usd)
    line7 = max(0.0, line5 - base_amt)
    if line7 <= 0:
        return 0.0
    line8 = max(0.0, addl_amt - base_amt)
    line9 = min(line7, line8)
    line10 = line7 - line9
    line11 = 0.5 * line9
    line12 = min(line2, line11)
    line13 = T["SS_TAXABLE_TIER2_RATE"] * line10
    line14 = line12 + line13
    line15 = T["SS_TAXABLE_TIER2_RATE"] * gross_ss_usd
    return min(line14, line15)


def feie_eligibility(f: dict | None) -> dict:
    f = f or {}
    claimed = bool(f.get("claimed")) or (f.get("amountClaimedUsd") or 0) > 0
    home = str(f.get("taxHomeCountry") or "").strip().lower()
    tax_home_abroad = home != "" and home not in ("us", "usa", "united states", "united states of america")
    pp_days_ok = (f.get("daysInUsTestPeriod") or 0) <= 35
    pp_met = bool(f.get("physicalPresence")) and pp_days_ok
    bf_met = bool(f.get("bonaFide"))
    reasons = []
    if claimed and not tax_home_abroad:
        reasons.append("no foreign tax home entered" if home == "" else "tax home is in the US")
    if claimed and not bf_met and not pp_met:
        if not f.get("physicalPresence") and not f.get("bonaFide"):
            reasons.append("neither the bona-fide-residence nor the physical-presence test is met")
        elif f.get("physicalPresence") and not pp_days_ok:
            reasons.append(f"{js_num_str(f.get('daysInUsTestPeriod'))} US days in the test period — over the ~35-day allowance (330 full days abroad required)")
        else:
            reasons.append("bona-fide-residence test not met")
    return {
        "claimed": claimed, "amountClaimedUsd": f.get("amountClaimedUsd") or 0, "taxHomeAbroad": tax_home_abroad,
        "testMet": bf_met or pp_met, "eligible": tax_home_abroad and (bf_met or pp_met), "reasons": reasons,
    }


def _feie_raw(d, ctx):
    # qualification_test is the field layer1_us.html's #feie-test <select>
    # actually writes ("physical_presence" | "bona_fide_residence") --
    # bona_fide_residence/physical_presence booleans were previously read
    # instead, which nothing in the live form has ever set, so FEIE
    # eligibility silently computed false (and the exclusion $0) regardless
    # of what a user selected. Legacy boolean fields kept as a fallback for
    # any saved data/fixtures using that shape directly.
    us = ctx.get("us")
    qual_test = safe(us, "foreign_earned_income.qualification_test", None)
    return {
        "claimed": safe(us, "foreign_earned_income.claims_feie", False) is True,
        "amountClaimedUsd": num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        "taxHomeCountry": safe(us, "foreign_earned_income.tax_home_country", ""),
        "bonaFide": qual_test == "bona_fide_residence" or safe(us, "foreign_earned_income.bona_fide_residence", False) is True,
        "physicalPresence": qual_test == "physical_presence" or safe(us, "foreign_earned_income.physical_presence", False) is True,
        "daysInUsTestPeriod": num(safe(us, "foreign_earned_income.days_in_us_during_test_period", 0)),
    }


def compute_us_tax_core(inc, ded, status, worldwide, feie, additional_medicare_owed_boundary, taxpayer_dob_raw, base_year_us):
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
    f_stcg = inc["foreignStcg"]["usd"] if worldwide else 0
    f_ltcg = inc["foreignLtcg"]["usd"] if worldwide else 0
    # IRC 988(a)(1): foreign-currency gain/loss is ORDINARY (not capital).
    f_988 = (inc["foreignSection988GainLoss"]["usd"] if inc.get("foreignSection988GainLoss") else 0) if worldwide else 0

    non_qual_div_us = max(0.0, inc["ordinaryDividendsUs"]["usd"] - inc["qualifiedDividendsUs"]["usd"])
    ordinary_income_excl_ss = (
        inc["wages"]["usd"] + f_w + f_se + (inc.get("businessUs", {}).get("usd", 0) if inc.get("businessUs") else 0) + inc["interestUs"]["usd"] + f_i +
        non_qual_div_us + f_d + inc["stcgUs"]["usd"] + f_stcg + inc["rentalUs"]["usd"] + f_r + f_p + f_988 +
        (inc["usRetirementIncomeExclSs"]["usd"] if inc.get("usRetirementIncomeExclSs") else (inc.get("usRetirementIncome", {}).get("usd", 0) if inc.get("usRetirementIncome") else 0))
    )
    preferential_income = inc["ltcgUs"]["usd"] + f_ltcg + inc["qualifiedDividendsUs"]["usd"]

    gross_ss_usd = (inc.get("socialSecurityUs") or {}).get("usd", 0) or 0
    tax_exempt_interest_usd = (inc.get("taxExemptInterestUs") or {}).get("usd", 0) or 0
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

    standard = T["STD_DEDUCTION"].get(status, T["STD_DEDUCTION"]["single"])
    salt_cap_usd = compute_salt_cap(agi, status)
    itemized = min(ded["salt"], salt_cap_usd) + ded["mortgageInterest"] + ded["charitable"] + max(0.0, ded["medical"] - 0.075 * agi)
    deduction = itemized if ded["mode"] == "itemized" else standard if ded["mode"] == "standard" else max(standard, itemized)

    taxpayer_age = None
    if taxpayer_dob_raw:
        dob = parse_date(taxpayer_dob_raw)
        if dob is not None:
            taxpayer_age = (base_year_us or 2025) - dob.year
    is_senior = taxpayer_age is not None and taxpayer_age >= T["SENIOR_DEDUCTION_MIN_AGE"] and status != "mfs"
    senior_phaseout_thr = T["SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD"].get(status, T["SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD"]["single"])
    senior_deduction_usd = max(0.0, js_round(T["SENIOR_DEDUCTION_PER_PERSON_USD"] - T["SENIOR_DEDUCTION_PHASEOUT_RATE"] * max(0.0, agi - senior_phaseout_thr))) if is_senior else 0

    is_mfs = status == "mfs"
    tips_ot_phaseout_thr = T["TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD"].get(status, T["TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD"]["single"])
    import math
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

    ordinary_tax = bracket_tax(ord_taxable, brackets)
    ordinary_bracket_breakdown = bracket_breakdown(ord_taxable, brackets)

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

    addl_medicare = additional_medicare_owed_boundary

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

    total_tax_before_ftc = income_tax + niit + addl_medicare + se_tax + amt_owed - credits_usd

    return {
        "agiUsd": agi, "taxableIncomeUsd": taxable_income, "incomeTaxUsd": income_tax, "niitUsd": niit,
        "additionalMedicareUsd": addl_medicare, "seTaxUsd": se_tax, "qbiDeductionUsd": qbi_deduction, "amtUsd": amt_owed,
        "creditsUsd": credits_usd, "totalTaxBeforeFtcUsd": total_tax_before_ftc,
        "deductionUsd": deduction, "deductionMode": used_mode,
        "totalIncomeUsd": total_income, "usSourceIncomeUsd": inc["usSourceTotal"]["usd"],
        "feieAppliedUsd": feie_applied_usd, "worldwide": worldwide,
        "ordinaryTaxUsd": ordinary_tax, "preferentialTaxUsd": preferential_tax,
        "filingStatus": status,
        "ordinaryIncomeUsd": ordinary_income, "preferentialIncomeUsd": preferential_income,
        "saltCapUsd": salt_cap_usd,
        "socialSecurityDetail": {
            "grossUsd": gross_ss_usd, "taxableUsd": taxable_ss_usd,
            "taxablePct": (taxable_ss_usd / gross_ss_usd) if gross_ss_usd > 0 else 0,
            "provisionalIncomeUsd": ordinary_income_excl_ss + preferential_income + 0.5 * gross_ss_usd + tax_exempt_interest_usd,
            "baseThresholdUsd": T["SS_PROVISIONAL_INCOME_BASE_USD"].get(status, T["SS_PROVISIONAL_INCOME_BASE_USD"]["single"]),
            "additionalThresholdUsd": T["SS_PROVISIONAL_INCOME_ADDITIONAL_USD"].get(status, T["SS_PROVISIONAL_INCOME_ADDITIONAL_USD"]["single"]),
        },
        "seniorDeductionUsd": senior_deduction_usd,
        "seniorDetail": {"age": taxpayer_age, "isSenior": is_senior, "fullAmountUsd": T["SENIOR_DEDUCTION_PER_PERSON_USD"], "phaseoutThresholdUsd": senior_phaseout_thr},
        "tipsDeductionUsd": tips_deduction_usd,
        "overtimeDeductionUsd": overtime_deduction_usd,
        "tipsOvertimeDetail": {
            "isMfs": is_mfs, "qualifiedTipsUsd": qualified_tips_usd, "qualifiedOvertimeUsd": qualified_overtime_usd,
            "tipsMaxUsd": T["TIPS_DEDUCTION_MAX_USD"], "overtimeMaxUsd": overtime_max_usd,
            "phaseoutThresholdUsd": tips_ot_phaseout_thr, "phaseoutReductionUsd": tips_ot_phaseout_reduction,
        },
        "ordinaryTaxableUsd": ord_taxable, "ordinaryBracketBreakdown": ordinary_bracket_breakdown,
        "amtDetail": {
            "amtiUsd": amti_usd, "addbackUsd": amt_addback, "exemptionFullUsd": amt_ex_full, "exemptionUsd": amt_exemption,
            "amtBaseUsd": amt_base, "preferentialInBaseUsd": pref_taxable, "ordinaryAmtBaseUsd": amt_ord_base,
            "tmtOrdUsd": tmt_ord, "tmtUsd": tmt_ord + preferential_tax, "regularTaxUsd": income_tax,
        },
        "otherCreditsUsd": other_credits_usd,
        "ctcDetail": {
            "numChildren": num_children_for_ctc, "maxTotalUsd": ctc_max_total_usd, "phaseoutReductionUsd": ctc_phaseout_reduction_usd,
            "availableUsd": ctc_available_usd, "nonRefundableUsd": ctc_non_refundable_usd, "refundableUsd": ctc_refundable_usd,
            "earnedIncomeUsd": earned_income_usd,
        },
        "foreignSourceIncomeUsd": f_w + f_se + f_i + f_d + f_r + f_p + f_stcg + f_ltcg + f_988,
        "retirementEpfInterestUsd": (inc.get("retirementEpfInterestUsd") or 0) if worldwide else 0,
        "retirementNpsWithdrawalUsd": (inc.get("retirementNpsWithdrawalUsd") or 0) if worldwide else 0,
        "niitDetail": {
            "netInvestmentIncomeUsd": net_investment_income, "magiUsd": magi, "thresholdUsd": niit_threshold,
            "excessUsd": max(0.0, min(max(0.0, net_investment_income), max(0.0, agi - niit_threshold))),
            "rate": T["NIIT_RATE"],
        },
        "feie": {
            "claimed": feie["claimed"], "eligible": feie["eligible"], "taxHomeAbroad": feie["taxHomeAbroad"],
            "testMet": feie["testMet"], "reasons": feie["reasons"], "appliedUsd": feie_applied_usd,
        },
        "effectiveRate": (total_tax_before_ftc / total_income) if total_income > 0 else 0,
    }


NODES = {
    "usEntityKind": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.entity.usKind", None) or "individual"),
    "files1040nr": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "nra_specific.files_form_1040nr", False) is True, layer1_fields=("us.nra_specific.files_form_1040nr",)),
    "s6013hElection": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "nra_specific.s6013h_joint_election", False) is True, layer1_fields=("us.nra_specific.s6013h_joint_election",)),
    "usFilingStatusRaw": NodeDef(
        deps=(),
        compute=lambda d, ctx: (lambda s: (
            "mfj" if s in ("married_filing_jointly", "mfj") else
            "mfs" if s in ("married_filing_separately", "mfs") else
            "hoh" if s in ("head_of_household", "hoh") else
            "single"
        ))((safe(ctx.get("us"), "profile.filing_status", "single") or "single").lower()),
        layer1_fields=("us.profile.filing_status",),
    ),
    "worldwideUs": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.residency.us.worldwide", False))),
    "feieRaw": NodeDef(
        deps=(),
        compute=_feie_raw,
        layer1_fields=(
            "us.foreign_earned_income.claims_feie", "us.foreign_earned_income.feie_amount_claimed_usd",
            "us.foreign_earned_income.tax_home_country", "us.foreign_earned_income.qualification_test",
            "us.foreign_earned_income.bona_fide_residence",
            "us.foreign_earned_income.physical_presence", "us.foreign_earned_income.days_in_us_during_test_period",
        ),
    ),
    "feie": NodeDef(deps=("feieRaw",), compute=lambda d, ctx: feie_eligibility(d["feieRaw"])),

    "incUs": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.us", None)),

    "dedUs": NodeDef(
        deps=(),
        compute=lambda d, ctx: (lambda us, it: {
            "mode": safe(it, "use_standard_or_itemized", "auto"),
            "salt": num(safe(it, "state_and_local_taxes_paid_usd", 0)),
            "mortgageInterest": num(safe(it, "mortgage_interest_paid_usd", 0)),
            "charitable": num(safe(it, "charitable_contributions_cash_usd", 0)) + num(safe(it, "charitable_contributions_appreciated_usd", 0)),
            "medical": num(safe(it, "medical_expenses_usd", 0)),
            "studentLoanInterest": num(safe(it, "student_loan_interest_usd", 0)),
            "isoAmtPrefUsd": sum(
                num(ex.get("amt_preference_spread_usd")) if ex.get("amt_preference_spread_usd") is not None else max(0.0, (num(ex.get("fmv_at_exercise_usd")) - num(ex.get("strike_price_usd"))) * num(ex.get("shares_exercised")))
                for ex in (safe(us, "equity_compensation.iso_exercises", []) or [])
            ),
            "amtPrefs": (
                num(safe(us, "amt_inputs.private_activity_bond_interest_usd", 0)) + num(safe(it, "private_activity_bond_interest_usd", 0)) +
                num(safe(it, "amt_preference_spread_usd", 0)) + num(safe(us, "amt.private_activity_bond_interest_usd", 0)) +
                num(safe(us, "amt.amt_preference_spread_usd", 0)) + num(safe(us, "amt_items_usd", 0)) +
                sum(
                    num(ex.get("amt_preference_spread_usd")) if ex.get("amt_preference_spread_usd") is not None else max(0.0, (num(ex.get("fmv_at_exercise_usd")) - num(ex.get("strike_price_usd"))) * num(ex.get("shares_exercised")))
                    for ex in (safe(us, "equity_compensation.iso_exercises", []) or [])
                )
            ),
            "careExpenses": num(safe(it, "child_and_dependent_care_expenses_usd", 0)) or num(safe(it, "dependent_care_expenses_usd", 0)),
            "aotc": num(safe(it, "education_credits_aotc_usd", 0)), "lifetimeLearning": num(safe(it, "education_credits_llc_usd", 0)),
            "dependents": num(safe(us, "profile.dependents_count", 0)) or num(safe(it, "dependents_count", 0)),
            "seHealthInsuranceDeductionUsd": num(safe(us, "income_us_source.se_health_insurance_deduction_usd", 0)),
            "seRetirementDeductionUsd": num(safe(us, "income_us_source.se_retirement_deduction_usd", 0)),
        })(ctx.get("us"), safe(ctx.get("us"), "itemized_deductions_and_credits", {}) or {}),
        layer1_fields=(
            "us.itemized_deductions_and_credits.use_standard_or_itemized", "us.itemized_deductions_and_credits.state_and_local_taxes_paid_usd",
            "us.itemized_deductions_and_credits.mortgage_interest_paid_usd", "us.itemized_deductions_and_credits.charitable_contributions_cash_usd",
            "us.itemized_deductions_and_credits.charitable_contributions_appreciated_usd", "us.itemized_deductions_and_credits.medical_expenses_usd",
            "us.itemized_deductions_and_credits.student_loan_interest_usd",
            "us.equity_compensation.iso_exercises[].amt_preference_spread_usd", "us.equity_compensation.iso_exercises[].fmv_at_exercise_usd",
            "us.equity_compensation.iso_exercises[].strike_price_usd", "us.equity_compensation.iso_exercises[].shares_exercised",
            "us.amt_inputs.private_activity_bond_interest_usd", "us.itemized_deductions_and_credits.private_activity_bond_interest_usd",
            "us.itemized_deductions_and_credits.amt_preference_spread_usd", "us.amt.private_activity_bond_interest_usd",
            "us.amt.amt_preference_spread_usd", "us.amt_items_usd",
            "us.itemized_deductions_and_credits.child_and_dependent_care_expenses_usd", "us.itemized_deductions_and_credits.dependent_care_expenses_usd",
            "us.itemized_deductions_and_credits.education_credits_aotc_usd", "us.itemized_deductions_and_credits.education_credits_llc_usd",
            "us.profile.dependents_count", "us.itemized_deductions_and_credits.dependents_count",
            "us.income_us_source.se_health_insurance_deduction_usd", "us.income_us_source.se_retirement_deduction_usd",
        ),
    ),
    "additionalMedicareOwedBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.additional_medicare_tax_owed_usd", 0)), layer1_fields=("us.withholding_and_estimated.additional_medicare_tax_owed_usd",)),
    "taxpayerDobRaw": NodeDef(
        deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "date_of_birth", safe(ctx.get("india"), "profile.date_of_birth", safe(ctx.get("us"), "profile.date_of_birth", None))),
        layer1_fields=("router.date_of_birth", "india.profile.date_of_birth", "us.profile.date_of_birth"),
    ),
    "baseYearUs": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.meta.baseYear", None)),

    "usTaxResult": NodeDef(
        deps=("incUs", "dedUs", "usFilingStatusRaw", "worldwideUs", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs"),
        compute=lambda d, ctx: compute_us_tax_core(
            d["incUs"], d["dedUs"], d["usFilingStatusRaw"], d["worldwideUs"], d["feie"],
            d["additionalMedicareOwedBoundary"], d["taxpayerDobRaw"], d["baseYearUs"],
        ),
    ),
    "totalTaxBeforeFtcUsd": NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["totalTaxBeforeFtcUsd"]),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
