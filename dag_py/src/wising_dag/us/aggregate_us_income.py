"""aggregateUsIncome — US income aggregation: W-2 wages, MACRS/§179/bonus
depreciation, K-1 passive-box aggregation (partnerships/S-corps/trusts),
Schedule SE earnings, QBI, retirement, direct + foreign-source items, and
the India-side EPF/NPS cross-border-taxable amounts. Port of
prototypes/graph-pilot/aggregateusincome-nodes.js.
"""
from __future__ import annotations

from ..core.dates import parse_date
from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import num, safe
from . import constants as C

US_SEC179_MAX_USD = C.US["US_SEC179_MAX_USD"]
US_SEC179_PHASEOUT_THRESHOLD_USD = C.US["US_SEC179_PHASEOUT_THRESHOLD_USD"]
US_BONUS_DEPRECIATION_RATE = C.US["US_BONUS_DEPRECIATION_RATE"]
US_MACRS_HALF_YEAR = C.US["US_MACRS_HALF_YEAR"]
US_MACRS_STRAIGHT_LINE_ANNUAL = C.US["US_MACRS_STRAIGHT_LINE_ANNUAL"]


def _inr_to_usd(inr, ctx) -> float:
    return num(inr) / fx_rate(ctx)


def _m(usd: float, ctx) -> dict:
    return {"usd": usd, "inr": usd * fx_rate(ctx)}


# ---- Home-office (simplified §280A method) / vehicle-mileage (standard
# mileage rate) deduction, self-employment + Schedule F. Task #41 follow-up
# -- both fields are already collected by layer1_us.html (and already
# summed from each business's branches[] by the live form's own JS) but
# never fed any real tax computation before this. Mirrors
# prototypes/graph-pilot/aggregateusincome-nodes.js exactly, including the
# 0.68/mile rate (matches the raw form's own §179-income-limit preview
# calculation, reused for internal consistency).
US_STANDARD_MILEAGE_RATE_USD = 0.68
US_HOME_OFFICE_RATE_USD_PER_SQFT = 5
US_HOME_OFFICE_MAX_SQFT = 300


def _vehicle_deduction_usd(x: dict) -> float:
    return num(x.get("vehicle_miles")) * US_STANDARD_MILEAGE_RATE_USD


def _home_office_deduction_usd(x: dict) -> float:
    return min(num(x.get("home_office_sqft")), US_HOME_OFFICE_MAX_SQFT) * US_HOME_OFFICE_RATE_USD_PER_SQFT


def _vehicle_and_home_office_deduction_usd(x: dict) -> float:
    return _vehicle_deduction_usd(x) + _home_office_deduction_usd(x)


def _compute_self_employment_net_profit_usd(s: dict) -> float:
    cogs = num(s.get("cogs_beginning_inventory")) + num(s.get("cogs_purchases")) + num(s.get("cogs_labor")) + num(s.get("cogs_materials")) - num(s.get("cogs_ending_inventory"))
    gross_profit = num(s.get("gross_receipts_usd")) - num(s.get("returns_and_allowances_usd")) - cogs
    return gross_profit + num(s.get("other_income_usd")) - num(s.get("expenses_usd")) - _vehicle_and_home_office_deduction_usd(s)


def _self_employment_net_profit_usd(s: dict, depreciation_usd: float) -> float:
    explicit = s.get("self_employment_earnings_usd") if s.get("self_employment_earnings_usd") is not None else s.get("net_profit_usd")
    if explicit is not None:
        return num(explicit)
    return _compute_self_employment_net_profit_usd(s) - num(depreciation_usd or 0)


def _compute_farm_gross_income_usd(f: dict) -> float:
    inc = safe(f, "itemized_income", {}) or {}
    gross = (
        num(inc.get("sales_livestock_produce_raised")) + num(inc.get("sales_livestock_produce_purchased")) +
        num(inc.get("cooperative_distributions")) + num(inc.get("agricultural_program_payments")) + num(inc.get("ccc_loans")) +
        num(inc.get("crop_insurance_proceeds")) + num(inc.get("custom_hire_income")) + num(inc.get("other_income"))
    )
    if f.get("accounting_method") == "accrual":
        inv = safe(f, "inventory", {}) or {}
        gross -= num(inv.get("beginning_inventory")) + num(inv.get("cost_of_purchases")) - num(inv.get("ending_inventory"))
    return gross


def _compute_farm_net_profit_usd(f: dict) -> float:
    return _compute_farm_gross_income_usd(f) - num(f.get("expenses_usd")) - _vehicle_and_home_office_deduction_usd(f)


def _farm_net_profit_usd(f: dict, depreciation_usd: float) -> float:
    if f.get("net_profit_usd") is not None:
        return num(f["net_profit_usd"])
    if f.get("gross_income_usd") is not None:
        return num(f["gross_income_usd"]) - num(f.get("expenses_usd")) - _vehicle_and_home_office_deduction_usd(f) - num(depreciation_usd or 0)
    return _compute_farm_net_profit_usd(f) - num(depreciation_usd or 0)


def _asset_recovery_year_n(asset: dict | None, base_year: int) -> int | None:
    if not asset or not asset.get("placed_in_service_date"):
        return None
    d = parse_date(asset["placed_in_service_date"])
    if d is None:
        return None
    year_n = base_year - d.year + 1
    return year_n if year_n >= 1 else None


def _straight_line_year1_fraction_inr(placed_in_service_date_str) -> float:
    d = parse_date(placed_in_service_date_str)
    if d is None:
        return 1.0
    months_remaining_incl_half = (12 - (d.month - 1)) - 0.5
    return max(0.0, min(1.0, months_remaining_incl_half / 12))


def _compute_asset_depreciation_usd(asset: dict, base_year: int) -> dict:
    cost = num(asset.get("cost"))
    year_n = _asset_recovery_year_n(asset, base_year)
    klass = asset.get("class")
    is_straight_line = bool(US_MACRS_STRAIGHT_LINE_ANNUAL.get(klass))
    eligible_for_sec179_bonus = not is_straight_line
    is_current_year = year_n == 1
    requested_sec179_usd = min(max(0.0, num(asset.get("sec179"))), cost) if (is_current_year and eligible_for_sec179_bonus) else 0
    bonus_eligible_basis_usd = max(0.0, cost - requested_sec179_usd)
    bonus_usd = bonus_eligible_basis_usd * US_BONUS_DEPRECIATION_RATE if (is_current_year and eligible_for_sec179_bonus and asset.get("bonus") is True) else 0
    macrs_basis_usd = max(0.0, cost - requested_sec179_usd - bonus_usd)
    macrs_usd = 0.0
    if year_n is not None and macrs_basis_usd > 0:
        if is_straight_line:
            annual_rate = US_MACRS_STRAIGHT_LINE_ANNUAL[klass]
            macrs_usd = macrs_basis_usd * annual_rate * _straight_line_year1_fraction_inr(asset.get("placed_in_service_date")) if year_n == 1 else macrs_basis_usd * annual_rate
        else:
            table = US_MACRS_HALF_YEAR.get(klass)
            if table and year_n <= len(table):
                macrs_usd = macrs_basis_usd * table[year_n - 1]
    return {"cost": cost, "yearN": year_n, "isCurrentYear": is_current_year, "class": klass, "eligibleForSec179Bonus": eligible_for_sec179_bonus, "requestedSec179Usd": requested_sec179_usd, "bonusUsd": bonus_usd, "macrsUsd": macrs_usd}


def _aggregate_asset_depreciation_usd(businesses: list, base_year: int) -> dict:
    per_asset = []
    for b in businesses:
        for a in b.get("assets") or []:
            per_asset.append({"businessKey": b["key"], "calc": _compute_asset_depreciation_usd(a, base_year)})
    total_requested_sec179_usd = sum(p["calc"]["requestedSec179Usd"] for p in per_asset)
    total_qualifying_additions_usd = sum(p["calc"]["cost"] if (p["calc"]["isCurrentYear"] and p["calc"]["eligibleForSec179Bonus"]) else 0 for p in per_asset)
    phaseout_reduction_usd = max(0.0, total_qualifying_additions_usd - US_SEC179_PHASEOUT_THRESHOLD_USD)
    cap_after_phaseout_usd = max(0.0, US_SEC179_MAX_USD - phaseout_reduction_usd)
    pre_sec179_business_income_usd = 0.0
    for b in businesses:
        bonus_macrs = sum(p["calc"]["bonusUsd"] + p["calc"]["macrsUsd"] for p in per_asset if p["businessKey"] == b["key"])
        pre_sec179_business_income_usd += b["grossReceiptsMinusExpensesUsd"] - bonus_macrs
    allowed_sec179_aggregate_usd = max(0.0, min(total_requested_sec179_usd, cap_after_phaseout_usd, pre_sec179_business_income_usd))
    scale = (allowed_sec179_aggregate_usd / total_requested_sec179_usd) if total_requested_sec179_usd > 0 else 0
    by_business: dict = {}
    for p in per_asset:
        actual_sec179_usd = p["calc"]["requestedSec179Usd"] * scale
        total_usd = actual_sec179_usd + p["calc"]["bonusUsd"] + p["calc"]["macrsUsd"]
        entry = by_business.setdefault(p["businessKey"], {"totalUsd": 0, "assets": []})
        entry["totalUsd"] += total_usd
        entry["assets"].append({
            "name": None, "class": p["calc"]["class"], "yearN": p["calc"]["yearN"], "cost": p["calc"]["cost"],
            "sec179Usd": actual_sec179_usd, "bonusUsd": p["calc"]["bonusUsd"], "macrsUsd": p["calc"]["macrsUsd"], "totalUsd": total_usd,
        })
    return {"byBusiness": by_business}


def _k1_passive_income_usd(k: dict) -> dict:
    return {
        "interestUsd": num(k.get("interest_income_usd")), "ordDivUsd": num(k.get("ordinary_dividends_usd")), "qualDivUsd": num(k.get("qualified_dividends_usd")),
        "stcgUsd": num(k.get("stcg_usd")),
        "ltcgUsd": num(k.get("ltcg_usd")) + max(0.0, num(k.get("net_sec1231_gain_usd") if k.get("net_sec1231_gain_usd") is not None else k.get("sec1231_gain_usd") or 0)),
        "rentalUsd": num(k.get("net_rental_real_estate_usd")) + num(k.get("other_rental_income_usd")) + num(k.get("royalties_usd") if k.get("royalties_usd") is not None else k.get("royalty_income_usd") or 0),
    }


def _wages_computation(d, ctx):
    wages = w2with = medicare_wages = qualified_tips_usd = qualified_overtime_usd = 0.0
    w2_employers = []
    w2 = safe(d["uiAgg"], "wages_w2", None)
    if isinstance(w2, list):
        for w in w2:
            wages_usd = num(w.get("wages_box1_usd") or w.get("wages_tips_compensation_usd") or 0)
            wages += wages_usd
            adv = w.get("tax_details_collapsed_by_default") or w
            fed_with_usd = num(adv.get("federal_tax_withheld_usd") or adv.get("federal_income_tax_withheld_usd") or 0)
            w2with += fed_with_usd
            medicare_wages += num(adv.get("medicare_wages_box5_usd") or w.get("wages_box1_usd") or 0)
            qualified_tips_usd += num(w.get("qualified_tip_income_usd") or 0)
            qualified_overtime_usd += num(w.get("qualified_overtime_premium_usd") or 0)
            state_with_usd = 0.0
            for st in safe(w, "state_and_local_taxes", []) or []:
                state_with_usd += num(st.get("state_tax_withheld_box17_usd") or 0)
            w2_employers.append({"employerName": w.get("employer_name"), "wagesUsd": wages_usd, "federalWithheldUsd": fed_with_usd, "stateWithheldUsd": state_with_usd})
    return {"wagesUsd": wages, "w2WithholdingUsd": w2with, "w2Employers": w2_employers, "medicareWagesUsd": medicare_wages, "qualifiedTipsUsd": qualified_tips_usd, "qualifiedOvertimeUsd": qualified_overtime_usd}


def _us_business_depreciation_plan(d, ctx):
    """Combines self-employment AND farming_schedule_f assets into ONE
    taxpayer-wide s.179 aggregation pool (real law caps/phases out s.179
    across ALL of a taxpayer's directly-owned active trades/businesses
    together, not per-array) — keyed "se{idx}"/"farm{idx}" so callers can
    look up either. K-1/1120 asset rows are deliberately NOT folded in: those
    entities' reported income already reflects the entity's own depreciation
    before flow-through, so a second per-asset computation would double-count.
    """
    businesses = []
    for idx, s in enumerate(safe(d["uiAgg"], "self_employment", []) or []):
        assets = list(s.get("assets") or [])
        for br in s.get("branches") or []:
            assets += br.get("assets") or []
        businesses.append({"key": f"se{idx}", "grossReceiptsMinusExpensesUsd": _compute_self_employment_net_profit_usd(s), "assets": assets})
    for idx, f in enumerate(safe(d["uiAgg"], "farming_schedule_f", []) or []):
        assets = list(f.get("assets") or [])
        for br in f.get("branches") or []:
            assets += br.get("assets") or []
        businesses.append({"key": f"farm{idx}", "grossReceiptsMinusExpensesUsd": _compute_farm_net_profit_usd(f), "assets": assets})
    return _aggregate_asset_depreciation_usd(businesses, d["baseYearUsAgg"])


def _k1_passive_totals(d, ctx):
    totals = {"interestUsd": 0.0, "ordDivUsd": 0.0, "qualDivUsd": 0.0, "stcgUsd": 0.0, "ltcgUsd": 0.0, "rentalUsd": 0.0}

    def add(k):
        p = _k1_passive_income_usd(k)
        for key in totals:
            totals[key] += p[key]

    for k in safe(d["uiAgg"], "partnerships_k1", []) or []:
        add(k)
    for k in safe(d["uiAgg"], "s_corporations_k1", []) or []:
        add(k)
    for k in safe(d["uiAgg"], "trusts_estates_k1", []) or []:
        add(k)
    return totals


def _business_and_se_computation(d, ctx):
    ui, se_depr_plan = d["uiAgg"], d["usBusinessDepreciationPlan"]
    business_us = num(safe(ui, "business_income_usd", 0))
    for c in safe(ui, "c_corporations_1120", []) or []:
        business_us += num(c.get("taxable_income_usd") or c.get("net_income_usd") or 0)
    for k in safe(ui, "partnerships_k1", []) or []:
        business_us += num(k.get("ordinary_business_income_usd") or k.get("ordinary_income_usd") or 0) + num(k.get("guaranteed_payments_usd") or 0) - num(k.get("sec179_deduction_usd") or 0)

    foreign_self_employment = 0.0
    for idx, s in enumerate(safe(ui, "self_employment", []) or []):
        depr_usd = se_depr_plan["byBusiness"].get(f"se{idx}", {}).get("totalUsd", 0)
        net_usd = _self_employment_net_profit_usd(s, depr_usd)
        if s.get("llc_type") == "foreign_disregarded":
            foreign_self_employment += net_usd
        else:
            business_us += net_usd

    for s in safe(ui, "s_corporations_k1", []) or []:
        business_us += num(s.get("ordinary_income_usd") or s.get("scorp_income_usd") or s.get("ordinary_business_income_usd") or 0) - num(s.get("sec179_deduction_usd") or 0)
    for t in safe(ui, "trusts_estates_k1", []) or []:
        business_us += num(t.get("ordinary_income_usd") or 0) + num(t.get("ordinary_gain_usd") or 0)
    # farming_schedule_f previously never reached business_us at all — only
    # a phantom net_profit_usd field (never written by the live form) was
    # even attempted for Schedule SE. A real farmer's Schedule F profit
    # silently contributed $0 to both regular tax AND self-employment tax.
    for idx, f in enumerate(safe(ui, "farming_schedule_f", []) or []):
        depr_usd = se_depr_plan["byBusiness"].get(f"farm{idx}", {}).get("totalUsd", 0)
        business_us += _farm_net_profit_usd(f, depr_usd)

    se_earnings = 0.0
    for idx, s in enumerate(safe(ui, "self_employment", []) or []):
        depr_usd = se_depr_plan["byBusiness"].get(f"se{idx}", {}).get("totalUsd", 0)
        se_earnings += _self_employment_net_profit_usd(s, depr_usd)
    for idx, f in enumerate(safe(ui, "farming_schedule_f", []) or []):
        depr_usd = se_depr_plan["byBusiness"].get(f"farm{idx}", {}).get("totalUsd", 0)
        se_earnings += _farm_net_profit_usd(f, depr_usd)

    qbi_income = se_earnings
    sstb = False
    for s in safe(ui, "s_corporations_k1", []) or []:
        qbi_income += num(s.get("ordinary_income_usd") or s.get("scorp_income_usd") or s.get("ordinary_business_income_usd") or 0) - num(s.get("sec179_deduction_usd") or 0)
    for k in safe(ui, "partnerships_k1", []) or []:
        qbi_income += num(k.get("ordinary_business_income_usd") or k.get("ordinary_income_usd") or 0) - num(k.get("sec179_deduction_usd") or 0)
    for t in safe(ui, "trusts_estates_k1", []) or []:
        qbi_income += num(t.get("ordinary_income_usd") or 0)
    for x in (
        list(safe(ui, "self_employment", []) or []) + list(safe(ui, "s_corporations_k1", []) or []) +
        list(safe(ui, "partnerships_k1", []) or []) + list(safe(ui, "trusts_estates_k1", []) or []) +
        list(safe(ui, "farming_schedule_f", []) or [])
    ):
        if x and (x.get("is_specified_service_trade") is True or x.get("is_sstb") is True or x.get("sstb") is True):
            sstb = True

    for k in safe(ui, "partnerships_k1", []) or []:
        box14a = k.get("self_employment_earnings_usd")
        if box14a in (None, ""):
            box14a = num(k.get("guaranteed_payments_usd") or 0) + (num(k.get("ordinary_business_income_usd") or k.get("ordinary_income_usd") or 0) if k.get("partner_type") == "general" else 0)
        se_earnings += num(box14a)

    # §199A W-2 wage / UBIA limitation base (task #42 follow-up): K-1 Box 20
    # qbi_wages_usd/qbi_ubia_usd (partnerships_k1/s_corporations_k1) and
    # self-employment/farm wages_paid_usd, collected but never read before
    # this. trusts_estates_k1 has no qbi_wages_usd/qbi_ubia_usd fields on
    # Layer 1 at all (matches layer1_us.html's own reference preview calc,
    # which passes a literal 0 for trust K-1 wages/UBIA) -- not a gap
    # introduced here. Self-employment/farm likewise have no UBIA field.
    qbi_wages = 0.0
    qbi_ubia = 0.0
    for s in safe(ui, "self_employment", []) or []:
        qbi_wages += num(s.get("wages_paid_usd"))
    for f in safe(ui, "farming_schedule_f", []) or []:
        qbi_wages += num(f.get("wages_paid_usd"))
    for k in safe(ui, "partnerships_k1", []) or []:
        qbi_wages += num(k.get("qbi_wages_usd"))
        qbi_ubia += num(k.get("qbi_ubia_usd"))
    for s in safe(ui, "s_corporations_k1", []) or []:
        qbi_wages += num(s.get("qbi_wages_usd"))
        qbi_ubia += num(s.get("qbi_ubia_usd"))

    return {
        "businessUsUsd": business_us, "foreignSelfEmploymentUsd": foreign_self_employment, "seEarningsUsd": se_earnings,
        "qbiIncomeUsd": max(0.0, qbi_income), "qbiIsSSTB": sstb, "qbiWagesUsd": qbi_wages, "qbiUbiaUsd": qbi_ubia,
    }


def _retirement_computation(d, ctx):
    ui = d["uiAgg"]
    ira_dist_usd = num(safe(ui, "ira_distributions_usd", 0))
    dist_401k_usd = num(safe(ui, "401k_distributions_usd", 0))
    pension_usd = num(safe(ui, "pension_income_usd", 0))
    social_security_gross_usd = num(safe(ui, "social_security_benefits_usd", 0))
    return {"usRetirementIncomeExclSsUsd": ira_dist_usd + dist_401k_usd + pension_usd, "socialSecurityUsUsd": social_security_gross_usd, "retirementDistributionsSubjectTo72tUsd": ira_dist_usd + dist_401k_usd}


# ---- Capital-gains special character: §1(h)(4) collectibles (28%-capped
# rate) and §1202 QSBS exclusion (task #43 follow-up). Mirrors
# prototypes/graph-pilot/aggregateusincome-nodes.js exactly, including the
# same §1250 unrecaptured-depreciation-recapture omission: no Layer 1
# field collects accumulated depreciation on a sold property, confirmed
# by direct grep, not assumed -- computing it would mean inventing a
# number Layer 1 never asked for, same discipline already applied to
# GILTI/Subpart-F.
def _is_long_term_us_cg(acq_str, sold_str) -> bool:
    acq, sold = parse_date(acq_str), parse_date(sold_str)
    if acq is None or sold is None:
        return False
    return (sold - acq).days > 365


def _holding_years_us_cg(acq_str, sold_str) -> float:
    acq, sold = parse_date(acq_str), parse_date(sold_str)
    if acq is None or sold is None:
        return 0.0
    return (sold - acq).days / 365.25


def _collectibles_aggregate(ui: dict) -> float:
    ltcg = 0.0
    for t in safe(ui, "collectibles_transactions", []) or []:
        # Short-term collectibles gain has no special rate at all (ordinary
        # STCG) -- already correctly included in the flat stcg_us_source_usd
        # field, nothing to pull out.
        if _is_long_term_us_cg(t.get("acquisition_date"), t.get("sale_date")):
            ltcg += num(t.get("realized_gain_loss_usd"))
    return ltcg


def _qsbs_aggregate(ui: dict, qsbs_const: dict) -> dict:
    total_gain = 0.0
    excluded_gain = 0.0
    for t in safe(ui, "qsbs_transactions", []) or []:
        gain = num(t.get("realized_gain_loss_usd"))
        total_gain += gain
        if gain <= 0:
            continue  # losses: no exclusion mechanics, flow through as ordinary LTCG (already in the flat field)
        years = _holding_years_us_cg(t.get("acquisition_date"), t.get("sale_date"))
        acq_date = parse_date(t.get("acquisition_date"))
        obbba_effective = parse_date(qsbs_const["QSBS_OBBBA_EFFECTIVE_DATE"])
        is_obbba = acq_date is not None and acq_date >= obbba_effective
        pct = 0.0
        if is_obbba:
            for tier in qsbs_const["QSBS_OBBBA_TIERS"]:
                if years >= tier["years"] and pct < tier["pct"]:
                    pct = tier["pct"]
        elif years >= 5:
            pct = 1.0  # pre-OBBBA cliff: 100% if held 5+ years (assumes stock acquired after 27 Sep 2010)
        if pct <= 0:
            continue
        basis = num(t.get("cost_basis_usd"))
        cap = max(qsbs_const["QSBS_OBBBA_CAP_USD"] if is_obbba else qsbs_const["QSBS_PRE_OBBBA_CAP_USD"], basis * 10)
        excluded_gain += min(gain, cap) * pct
    excluded_gain = min(excluded_gain, max(0.0, total_gain))
    return {"totalGainUsd": total_gain, "excludedGainUsd": excluded_gain, "taxableGainUsd": total_gain - excluded_gain}


def _direct_income_computation(d, ctx):
    ui, fi, k1 = d["uiAgg"], d["fiAgg"], d["k1PassiveTotals"]
    # "Other Income (Schedule 1 & 1099-G/SSA)" card (Step 15 Layer 1 US
    # audit, 27 Jul 2026) -- 6 of its 8 fields had no id/oninput/onchange at
    # all in the live form, pure static HTML. State refunds (SS111 tax-
    # benefit-rule test needs prior-year itemization data this model doesn't
    # track) and HSA/MSA distributions (only taxable to the extent NOT used
    # for qualified medical expenses, a split this model doesn't track)
    # remain deliberately unwired. Mirrors prototypes/graph-pilot/
    # aggregateusincome-nodes.js exactly.
    other_ordinary_income_us_usd = (
        num(safe(ui, "unemployment_compensation_usd", 0)) + num(safe(ui, "alimony_received_usd", 0)) +
        num(safe(ui, "royalties_direct_us_source_usd", 0)) + num(safe(ui, "cancellation_of_debt_usd", 0)) +
        num(safe(ui, "misc_other_income_usd", 0))
    )
    # Capital-gains special character (task #43 follow-up): the flat
    # ltcg_us_source_usd field already includes collectibles + QSBS gain
    # (folded in by the raw form's own recalculateCapitalGainsAggregate()
    # before it's ever saved) -- pulled back out here so each gets its own
    # real §1(h)(4)/§1202 treatment. The QSBS-EXCLUDED portion is removed
    # entirely; the QSBS-TAXABLE remainder stays as ordinary LTCG.
    collectibles_ltcg_usd = _collectibles_aggregate(ui)
    qsbs = _qsbs_aggregate(ui, C.US)
    ltcg_flat_usd = num(safe(ui, "ltcg_us_source_usd", 0))
    ltcg_adjusted_usd = ltcg_flat_usd - collectibles_ltcg_usd - qsbs["excludedGainUsd"]
    return {
        "taxExemptInterestUsUsd": num(safe(ui, "interest_us_exempt_usd", 0)),
        "interestUsUsd": num(safe(ui, "interest_us_source_usd", 0)) + k1["interestUsd"],
        "ordinaryDividendsUsUsd": num(safe(ui, "ordinary_dividends_us_source_usd", 0)) + k1["ordDivUsd"],
        "qualifiedDividendsUsUsd": num(safe(ui, "qualified_dividends_us_source_usd", 0)) + k1["qualDivUsd"],
        "ltcgUsUsd": ltcg_adjusted_usd + k1["ltcgUsd"],
        "collectiblesLtcgUsd": collectibles_ltcg_usd,
        "qsbsExcludedGainUsd": qsbs["excludedGainUsd"],
        "qsbsTaxableGainUsd": qsbs["taxableGainUsd"],
        "stcgUsUsd": num(safe(ui, "stcg_us_source_usd", 0)) + k1["stcgUsd"],
        # Rental expenses previously had no id/handler either -- gross rent
        # was always taxed in full with zero expense deduction possible.
        "rentalUsUsd": max(0.0, num(safe(ui, "rental_income_us_source_usd", 0)) - num(safe(ui, "rental_expenses_us_source_usd", 0))) + k1["rentalUsd"],
        "otherOrdinaryIncomeUsUsd": other_ordinary_income_us_usd,
        "foreignInterestUsd": num(safe(fi, "foreign_interest_usd", 0)),
        "foreignDividendsUsd": num(safe(fi, "foreign_dividends_usd", 0)),
        "foreignRentalUsd": num(safe(fi, "foreign_rental_income_usd", 0)),
        "foreignPensionUsd": num(safe(fi, "foreign_pension_income_usd", 0)),
        "foreignStcgUsd": num(safe(fi, "foreign_stcg_usd", 0)),
        "foreignLtcgUsd": num(safe(fi, "foreign_ltcg_usd", 0)),
        # IRC 988(a)(1): foreign-currency gain/loss is ORDINARY (not
        # capital), reported on layer1_us.html's "Section 988 Currency
        # Gains & Losses" list (syncSec988State()) but never previously
        # read anywhere. Can be negative (a net loss).
        "section988GainLossUsd": sum(num(t.get("realized_gain_loss_usd")) for t in (safe(fi, "section_988_gains_losses", []) or [])),
    }


def _merge_simple(source: dict, target: dict) -> None:
    for k, sv in source.items():
        if sv is None:
            continue
        target[k] = (target.get(k) or 0) + sv if isinstance(sv, (int, float)) and not isinstance(sv, bool) else sv


def _india_annual_slice_for_us(ctx):
    india = ctx.get("india")
    quarters = safe(india, "quarters", None)
    if not quarters:
        return {"other_sources": safe(india, "other_sources", {}) or {}}
    out = {"other_sources": {}}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs = quarters.get(q)
        if qs and qs.get("other_sources"):
            _merge_simple(qs["other_sources"], out["other_sources"])
    return out


def _epf_nps_cross_border(d, ctx):
    return {
        "taxableEpfInterestUsd": _inr_to_usd(num(safe(d["indiaAnnualSliceForUs"]["other_sources"], "taxable_epf_interest_inr", 0)), ctx),
        "taxableNpsWithdrawalUsd": _inr_to_usd(num(safe(d["indiaAnnualSliceForUs"]["other_sources"], "taxable_nps_withdrawal_inr", 0)), ctx),
    }


def _aggregate_us_income_result(d, ctx):
    w, biz, ret, di, epf = d["wagesComputation"], d["businessAndSeComputation"], d["retirementComputation"], d["directIncomeComputation"], d["epfNpsCrossBorder"]
    foreign_interest = di["foreignInterestUsd"] + epf["taxableEpfInterestUsd"]
    foreign_pension = di["foreignPensionUsd"] + epf["taxableNpsWithdrawalUsd"]

    us_source_total = w["wagesUsd"] + biz["businessUsUsd"] + di["interestUsUsd"] + di["ordinaryDividendsUsUsd"] + di["ltcgUsUsd"] + di["stcgUsUsd"] + di["rentalUsUsd"] + ret["usRetirementIncomeExclSsUsd"] + ret["socialSecurityUsUsd"] + di["otherOrdinaryIncomeUsUsd"]
    foreign_source_total = d["foreignWagesUsd"] + biz["foreignSelfEmploymentUsd"] + foreign_interest + di["foreignDividendsUsd"] + di["foreignRentalUsd"] + foreign_pension + di["foreignStcgUsd"] + di["foreignLtcgUsd"] + di["section988GainLossUsd"]

    return {
        "wages": _m(w["wagesUsd"], ctx), "businessUs": _m(biz["businessUsUsd"], ctx), "w2Withholding": w["w2WithholdingUsd"], "w2Employers": w["w2Employers"], "medicareWages": w["medicareWagesUsd"],
        "qualifiedTipsUsd": w["qualifiedTipsUsd"], "qualifiedOvertimeUsd": w["qualifiedOvertimeUsd"],
        "seEarningsUsd": biz["seEarningsUsd"], "qbiIncomeUsd": biz["qbiIncomeUsd"], "qbiIsSSTB": biz["qbiIsSSTB"],
        "qbiWagesUsd": biz["qbiWagesUsd"], "qbiUbiaUsd": biz["qbiUbiaUsd"],
        "usRetirementIncome": _m(ret["usRetirementIncomeExclSsUsd"] + ret["socialSecurityUsUsd"], ctx),
        "usRetirementIncomeExclSs": _m(ret["usRetirementIncomeExclSsUsd"], ctx),
        "retirementDistributionsSubjectTo72tUsd": ret["retirementDistributionsSubjectTo72tUsd"],
        "socialSecurityUs": _m(ret["socialSecurityUsUsd"], ctx),
        "taxExemptInterestUs": _m(di["taxExemptInterestUsUsd"], ctx),
        "interestUs": _m(di["interestUsUsd"], ctx), "ordinaryDividendsUs": _m(di["ordinaryDividendsUsUsd"], ctx), "qualifiedDividendsUs": _m(di["qualifiedDividendsUsUsd"], ctx),
        "ltcgUs": _m(di["ltcgUsUsd"], ctx), "stcgUs": _m(di["stcgUsUsd"], ctx), "capitalGainsUs": _m(di["ltcgUsUsd"] + di["stcgUsUsd"], ctx), "rentalUs": _m(di["rentalUsUsd"], ctx),
        "collectiblesLtcgUsd": di["collectiblesLtcgUsd"], "qsbsExcludedGainUsd": di["qsbsExcludedGainUsd"], "qsbsTaxableGainUsd": di["qsbsTaxableGainUsd"],
        "otherOrdinaryIncomeUs": _m(di["otherOrdinaryIncomeUsUsd"], ctx),
        "foreignWages": _m(d["foreignWagesUsd"], ctx), "foreignSelfEmployment": _m(biz["foreignSelfEmploymentUsd"], ctx),
        "foreignInterest": _m(foreign_interest, ctx), "foreignDividends": _m(di["foreignDividendsUsd"], ctx),
        "foreignRental": _m(di["foreignRentalUsd"], ctx), "foreignPension": _m(foreign_pension, ctx),
        "foreignStcg": _m(di["foreignStcgUsd"], ctx), "foreignLtcg": _m(di["foreignLtcgUsd"], ctx),
        "foreignCapitalGains": _m(di["foreignStcgUsd"] + di["foreignLtcgUsd"], ctx),
        "foreignSection988GainLoss": _m(di["section988GainLossUsd"], ctx),
        "retirementEpfInterestUsd": epf["taxableEpfInterestUsd"], "retirementNpsWithdrawalUsd": epf["taxableNpsWithdrawalUsd"],
        "usSourceTotal": _m(us_source_total, ctx), "foreignSourceTotal": _m(foreign_source_total, ctx),
        "total": _m(us_source_total + foreign_source_total, ctx),
    }


_WAGES_FIELDS = (
    "us.income_us_source.wages_w2[].wages_box1_usd", "us.income_us_source.wages_w2[].wages_tips_compensation_usd",
    "us.income_us_source.wages_w2[].tax_details_collapsed_by_default.federal_tax_withheld_usd",
    "us.income_us_source.wages_w2[].federal_tax_withheld_usd",
    "us.income_us_source.wages_w2[].tax_details_collapsed_by_default.federal_income_tax_withheld_usd",
    "us.income_us_source.wages_w2[].tax_details_collapsed_by_default.medicare_wages_box5_usd",
    "us.income_us_source.wages_w2[].qualified_tip_income_usd", "us.income_us_source.wages_w2[].qualified_overtime_premium_usd",
    "us.income_us_source.wages_w2[].state_and_local_taxes[].state_tax_withheld_box17_usd",
    "us.income_us_source.wages_w2[].employer_name",
)
_SE_DEPRECIATION_FIELDS = (
    "us.income_us_source.self_employment[].assets[].placed_in_service_date", "us.income_us_source.self_employment[].assets[].class",
    "us.income_us_source.self_employment[].assets[].cost", "us.income_us_source.self_employment[].assets[].sec179",
    "us.income_us_source.self_employment[].assets[].bonus",
    "us.income_us_source.self_employment[].branches[].assets[].placed_in_service_date",
    "us.income_us_source.self_employment[].branches[].assets[].class", "us.income_us_source.self_employment[].branches[].assets[].cost",
    "us.income_us_source.self_employment[].branches[].assets[].sec179", "us.income_us_source.self_employment[].branches[].assets[].bonus",
    "us.income_us_source.self_employment[].cogs_beginning_inventory", "us.income_us_source.self_employment[].cogs_purchases",
    "us.income_us_source.self_employment[].cogs_labor", "us.income_us_source.self_employment[].cogs_materials",
    "us.income_us_source.self_employment[].cogs_ending_inventory", "us.income_us_source.self_employment[].gross_receipts_usd",
    "us.income_us_source.self_employment[].returns_and_allowances_usd", "us.income_us_source.self_employment[].other_income_usd",
    "us.income_us_source.self_employment[].expenses_usd",
    "us.income_us_source.self_employment[].vehicle_miles", "us.income_us_source.self_employment[].home_office_sqft",
    "us.income_us_source.farming_schedule_f[].assets[].placed_in_service_date", "us.income_us_source.farming_schedule_f[].assets[].class",
    "us.income_us_source.farming_schedule_f[].assets[].cost", "us.income_us_source.farming_schedule_f[].assets[].sec179",
    "us.income_us_source.farming_schedule_f[].assets[].bonus",
    "us.income_us_source.farming_schedule_f[].branches[].assets[].placed_in_service_date",
    "us.income_us_source.farming_schedule_f[].branches[].assets[].class", "us.income_us_source.farming_schedule_f[].branches[].assets[].cost",
    "us.income_us_source.farming_schedule_f[].branches[].assets[].sec179", "us.income_us_source.farming_schedule_f[].branches[].assets[].bonus",
    "us.income_us_source.farming_schedule_f[].itemized_income.sales_livestock_produce_raised",
    "us.income_us_source.farming_schedule_f[].itemized_income.sales_livestock_produce_purchased",
    "us.income_us_source.farming_schedule_f[].itemized_income.cooperative_distributions",
    "us.income_us_source.farming_schedule_f[].itemized_income.agricultural_program_payments",
    "us.income_us_source.farming_schedule_f[].itemized_income.ccc_loans",
    "us.income_us_source.farming_schedule_f[].itemized_income.crop_insurance_proceeds",
    "us.income_us_source.farming_schedule_f[].itemized_income.custom_hire_income",
    "us.income_us_source.farming_schedule_f[].itemized_income.other_income",
    "us.income_us_source.farming_schedule_f[].accounting_method", "us.income_us_source.farming_schedule_f[].inventory.beginning_inventory",
    "us.income_us_source.farming_schedule_f[].inventory.cost_of_purchases", "us.income_us_source.farming_schedule_f[].inventory.ending_inventory",
    "us.income_us_source.farming_schedule_f[].expenses_usd", "us.income_us_source.farming_schedule_f[].net_profit_usd",
    "us.income_us_source.farming_schedule_f[].gross_income_usd",
    "us.income_us_source.farming_schedule_f[].vehicle_miles", "us.income_us_source.farming_schedule_f[].home_office_sqft",
)
_K1_PASSIVE_FIELDS = tuple(
    f"us.income_us_source.{group}[].{field}"
    for group in ("partnerships_k1", "s_corporations_k1", "trusts_estates_k1")
    for field in (
        "interest_income_usd", "ordinary_dividends_usd", "qualified_dividends_usd", "stcg_usd", "ltcg_usd",
        "net_sec1231_gain_usd", "sec1231_gain_usd", "net_rental_real_estate_usd", "other_rental_income_usd",
        "royalties_usd", "royalty_income_usd",
    )
)


def build(base):
    r = base.extend()
    # int(), not float — a real calendar year used as a list index
    # (_compute_asset_depreciation_usd's MACRS table lookup) and in string
    # labels; the JS source's own bare `num(...) || 2025` (aggregateusincome-
    # nodes.js) has the same untyped-float shape, but JS's `table[nonInteger]`
    # silently reads `undefined` (-> NaN propagating downstream) where
    # Python's `table[year_n - 1]` raises TypeError on a float index — same
    # "JS forgiving vs Python strict" class this port has hit before, just
    # manifesting as a crash instead of a KeyError this time. A fractional
    # year is nonsensical for a real profile in either case (only reachable
    # via fuzzer numeric-jitter mutation of us.metadata.us_calendar_year) —
    # fixed at the source with an explicit int cast, same precedent as
    # crossborder/apportionment.py's apportionmentBaseYearRaw.
    r.register("baseYearUsAgg", NodeDef(deps=(), compute=lambda d, ctx: int(num(safe(ctx.get("us"), "metadata.us_calendar_year", 2025)) or 2025), layer1_fields=("us.metadata.us_calendar_year",)))
    r.register("uiAgg", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "income_us_source", {})))
    r.register("fiAgg", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "income_foreign_source", {})))

    r.register("wagesComputation", NodeDef(deps=("uiAgg",), compute=_wages_computation, layer1_fields=_WAGES_FIELDS))
    # Step 7 (FEIE)'s own headline "Total Foreign Earned Income" field
    # (#feie-earned-income -> foreign_earned_income.foreign_earned_income_usd)
    # -- was read NOWHERE except a local UI-preview label, so a user who
    # filled in ONLY this field (the far more likely real path, since this
    # screen exists specifically for FEIE) got a $0 exclusion AND the excess
    # over the FEIE cap silently vanished from taxable income entirely
    # (compute_us_tax_core's exclusion math is gated on foreignWagesUsd +
    # foreignSelfEmploymentUsd being > 0, which stayed 0 with nothing in
    # this field's own array).
    r.register("feieEarnedIncomeUsdRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "foreign_earned_income.foreign_earned_income_usd", 0)), layer1_fields=("us.foreign_earned_income.foreign_earned_income_usd",)))
    r.register("foreignWagesUsd", NodeDef(
        deps=("fiAgg", "feieEarnedIncomeUsdRaw"),
        # gross_wages_usd is the field name syncForeignWagesState() (layer1_us.
        # html) actually writes for every foreign-wage row added through the
        # live form -- was missing from the fallback chain entirely, so every
        # foreign wage entry ever made through the live UI silently computed
        # to $0 (only profiles.js's hand-authored fixtures, which use
        # wages_usd directly, ever exercised a nonzero value here). max(),
        # not +, with feieEarnedIncomeUsdRaw so a user who carefully filled
        # in both this list and the FEIE screen's field describing the same
        # real-world salary isn't double-counted.
        compute=lambda d, ctx: max(
            sum(num(w.get("gross_wages_usd") or w.get("wages_usd") or w.get("amount_usd") or w.get("wages_box1_usd") or w.get("wages_tips_compensation_usd") or 0) for w in (safe(d["fiAgg"], "foreign_wages", []) or [])),
            d["feieEarnedIncomeUsdRaw"],
        ),
        layer1_fields=("us.income_foreign_source.foreign_wages[].gross_wages_usd", "us.income_foreign_source.foreign_wages[].wages_usd", "us.income_foreign_source.foreign_wages[].amount_usd", "us.income_foreign_source.foreign_wages[].wages_box1_usd", "us.income_foreign_source.foreign_wages[].wages_tips_compensation_usd"),
    ))

    r.register("usBusinessDepreciationPlan", NodeDef(deps=("uiAgg", "baseYearUsAgg"), compute=_us_business_depreciation_plan, layer1_fields=_SE_DEPRECIATION_FIELDS))
    r.register("k1PassiveTotals", NodeDef(deps=("uiAgg",), compute=_k1_passive_totals, layer1_fields=_K1_PASSIVE_FIELDS))
    r.register("businessAndSeComputation", NodeDef(
        deps=("uiAgg", "usBusinessDepreciationPlan", "baseYearUsAgg"), compute=_business_and_se_computation,
        layer1_fields=(
            "us.income_us_source.business_income_usd",
            "us.income_us_source.c_corporations_1120[].taxable_income_usd", "us.income_us_source.c_corporations_1120[].net_income_usd",
            "us.income_us_source.partnerships_k1[].ordinary_business_income_usd", "us.income_us_source.partnerships_k1[].ordinary_income_usd",
            "us.income_us_source.partnerships_k1[].guaranteed_payments_usd", "us.income_us_source.partnerships_k1[].sec179_deduction_usd",
            "us.income_us_source.partnerships_k1[].self_employment_earnings_usd", "us.income_us_source.partnerships_k1[].partner_type",
            "us.income_us_source.self_employment[].llc_type",
            "us.income_us_source.s_corporations_k1[].ordinary_income_usd", "us.income_us_source.s_corporations_k1[].scorp_income_usd",
            "us.income_us_source.s_corporations_k1[].ordinary_business_income_usd", "us.income_us_source.s_corporations_k1[].sec179_deduction_usd",
            "us.income_us_source.trusts_estates_k1[].ordinary_income_usd", "us.income_us_source.trusts_estates_k1[].ordinary_gain_usd",
            "us.income_us_source.farming_schedule_f[].net_profit_usd",
            "us.income_us_source.self_employment[].is_specified_service_trade", "us.income_us_source.self_employment[].is_sstb", "us.income_us_source.self_employment[].sstb",
            "us.income_us_source.s_corporations_k1[].is_specified_service_trade", "us.income_us_source.s_corporations_k1[].is_sstb", "us.income_us_source.s_corporations_k1[].sstb",
            "us.income_us_source.partnerships_k1[].is_specified_service_trade", "us.income_us_source.partnerships_k1[].is_sstb", "us.income_us_source.partnerships_k1[].sstb",
            "us.income_us_source.trusts_estates_k1[].is_specified_service_trade", "us.income_us_source.trusts_estates_k1[].is_sstb", "us.income_us_source.trusts_estates_k1[].sstb",
            "us.income_us_source.self_employment[].wages_paid_usd", "us.income_us_source.farming_schedule_f[].wages_paid_usd",
            "us.income_us_source.partnerships_k1[].qbi_wages_usd", "us.income_us_source.partnerships_k1[].qbi_ubia_usd",
            "us.income_us_source.s_corporations_k1[].qbi_wages_usd", "us.income_us_source.s_corporations_k1[].qbi_ubia_usd",
        ) + _SE_DEPRECIATION_FIELDS,
    ))
    r.register("retirementComputation", NodeDef(
        deps=("uiAgg",), compute=_retirement_computation,
        layer1_fields=("us.income_us_source.ira_distributions_usd", "us.income_us_source.401k_distributions_usd", "us.income_us_source.pension_income_usd", "us.income_us_source.social_security_benefits_usd"),
    ))
    r.register("directIncomeComputation", NodeDef(
        deps=("uiAgg", "fiAgg", "k1PassiveTotals"), compute=_direct_income_computation,
        layer1_fields=(
            "us.income_us_source.interest_us_exempt_usd", "us.income_us_source.interest_us_source_usd",
            "us.income_us_source.ordinary_dividends_us_source_usd", "us.income_us_source.qualified_dividends_us_source_usd",
            "us.income_us_source.ltcg_us_source_usd", "us.income_us_source.stcg_us_source_usd", "us.income_us_source.rental_income_us_source_usd",
            "us.income_foreign_source.foreign_interest_usd", "us.income_foreign_source.foreign_dividends_usd",
            "us.income_foreign_source.foreign_rental_income_usd", "us.income_foreign_source.foreign_pension_income_usd",
            "us.income_foreign_source.foreign_stcg_usd", "us.income_foreign_source.foreign_ltcg_usd",
            "us.income_us_source.collectibles_transactions[].acquisition_date", "us.income_us_source.collectibles_transactions[].sale_date",
            "us.income_us_source.collectibles_transactions[].realized_gain_loss_usd",
            "us.income_us_source.qsbs_transactions[].acquisition_date", "us.income_us_source.qsbs_transactions[].sale_date",
            "us.income_us_source.qsbs_transactions[].cost_basis_usd", "us.income_us_source.qsbs_transactions[].realized_gain_loss_usd",
        ) + _K1_PASSIVE_FIELDS,
    ))

    r.register("indiaAnnualSliceForUs", NodeDef(deps=(), compute=lambda d, ctx: _india_annual_slice_for_us(ctx)))
    r.register("epfNpsCrossBorder", NodeDef(
        deps=("indiaAnnualSliceForUs",), compute=_epf_nps_cross_border,
        layer1_fields=("india.other_sources.taxable_epf_interest_inr", "india.other_sources.taxable_nps_withdrawal_inr"),
    ))

    r.register("aggregateUsIncomeResult", NodeDef(
        deps=("wagesComputation", "foreignWagesUsd", "businessAndSeComputation", "retirementComputation", "directIncomeComputation", "epfNpsCrossBorder"),
        compute=_aggregate_us_income_result,
    ))
    return r
