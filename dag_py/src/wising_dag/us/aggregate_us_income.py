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


def _compute_self_employment_net_profit_usd(s: dict) -> float:
    cogs = num(s.get("cogs_beginning_inventory")) + num(s.get("cogs_purchases")) + num(s.get("cogs_labor")) + num(s.get("cogs_materials")) - num(s.get("cogs_ending_inventory"))
    gross_profit = num(s.get("gross_receipts_usd")) - num(s.get("returns_and_allowances_usd")) - cogs
    return gross_profit + num(s.get("other_income_usd")) - num(s.get("expenses_usd"))


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
    return _compute_farm_gross_income_usd(f) - num(f.get("expenses_usd"))


def _farm_net_profit_usd(f: dict, depreciation_usd: float) -> float:
    if f.get("net_profit_usd") is not None:
        return num(f["net_profit_usd"])
    if f.get("gross_income_usd") is not None:
        return num(f["gross_income_usd"]) - num(f.get("expenses_usd")) - num(depreciation_usd or 0)
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

    return {"businessUsUsd": business_us, "foreignSelfEmploymentUsd": foreign_self_employment, "seEarningsUsd": se_earnings, "qbiIncomeUsd": max(0.0, qbi_income), "qbiIsSSTB": sstb}


def _retirement_computation(d, ctx):
    ui = d["uiAgg"]
    ira_dist_usd = num(safe(ui, "ira_distributions_usd", 0))
    dist_401k_usd = num(safe(ui, "401k_distributions_usd", 0))
    pension_usd = num(safe(ui, "pension_income_usd", 0))
    social_security_gross_usd = num(safe(ui, "social_security_benefits_usd", 0))
    return {"usRetirementIncomeExclSsUsd": ira_dist_usd + dist_401k_usd + pension_usd, "socialSecurityUsUsd": social_security_gross_usd, "retirementDistributionsSubjectTo72tUsd": ira_dist_usd + dist_401k_usd}


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
    return {
        "taxExemptInterestUsUsd": num(safe(ui, "interest_us_exempt_usd", 0)),
        "interestUsUsd": num(safe(ui, "interest_us_source_usd", 0)) + k1["interestUsd"],
        "ordinaryDividendsUsUsd": num(safe(ui, "ordinary_dividends_us_source_usd", 0)) + k1["ordDivUsd"],
        "qualifiedDividendsUsUsd": num(safe(ui, "qualified_dividends_us_source_usd", 0)) + k1["qualDivUsd"],
        "ltcgUsUsd": num(safe(ui, "ltcg_us_source_usd", 0)) + k1["ltcgUsd"],
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


def _compute_cfc_inclusion(corps: list) -> dict:
    """Phase 7 (XB-14) — GILTI/NCTI + Subpart F quantification. Port of
    aggregateusincome-nodes.js's computeCfcInclusion.

    Documented simplifications (also surfaced in the "cfc" finding text,
    crossborder/findings.py):
     - No QBAI collection — correct per OBBBA TY2026 (10% exclusion eliminated).
     - No PTEP distribution-year tracking.
     - CFC-status threshold stays the pre-existing single-owner >50% test
       (independently re-derived from ownership_percentage here, not trusted
       off a possibly-stale persisted cfc_status) — a known simplification of
       the real aggregate US-shareholder test, not fixed here.
     - Subpart F capped at each CFC's own entered E&P — simplification of full
       §952(c) mechanics (qualified deficits, CFC chains, etc. not modeled).
     - No state-tax conformity modeling for GILTI/NCTI.
     - No §954(b)(4) high-tax exclusion election modeled.
     - §962-elected inclusion not run through NIIT (Reg. §1.1411-10(c) would
       generally include it absent an election out) — same simplification
       already applied to otherOrdinaryIncomeUs.
     - §962 election modeled per-CFC, matching real law (each CFC may elect
       separately) — read off each foreign_corporations[] entry independently.
    """
    non_elected = {"testedIncome": 0.0, "testedLoss": 0.0, "subpartF": 0.0}
    elected = {"testedIncome": 0.0, "testedLoss": 0.0, "subpartF": 0.0, "foreignTaxPaid": 0.0}
    per_cfc_trace = []
    for c in (corps or []):
        own_pct = num(c.get("ownership_percentage"))
        is_cfc = own_pct > 50
        if not is_cfc:
            continue  # sub-CFC-threshold holdings: no §951/951A inclusion (existing cfc_below_threshold finding)
        frac = max(0.0, min(1.0, own_pct / 100))
        tested_income_usd = max(0.0, num(c.get("tested_income_usd"))) * frac
        tested_loss_usd = max(0.0, num(c.get("tested_loss_usd"))) * frac
        ep_usd = max(0.0, num(c.get("ep_usd"))) * frac
        subpart_f_raw_usd = max(0.0, num(c.get("subpart_f_income_usd"))) * frac
        subpart_f_usd = min(subpart_f_raw_usd, ep_usd)  # §952(c) E&P cap
        elect = c.get("sec962_election_planned") is True
        bucket = elected if elect else non_elected
        bucket["testedIncome"] += tested_income_usd
        bucket["testedLoss"] += tested_loss_usd
        bucket["subpartF"] += subpart_f_usd
        if elect:
            elected["foreignTaxPaid"] += max(0.0, num(c.get("foreign_tax_paid_usd"))) * frac
        per_cfc_trace.append({
            "name": c.get("corporation_name") or None, "ownershipPct": own_pct, "sec962Elected": elect,
            "testedIncomeUsd": tested_income_usd, "testedLossUsd": tested_loss_usd, "subpartFIncludedUsd": subpart_f_usd,
            "subpartFCappedByEp": subpart_f_raw_usd > ep_usd,
        })

    # True §951A(c)(2) aggregate: summed across ALL non-elected (resp.
    # elected) CFCs BEFORE the $0 floor — never floored per-CFC then summed,
    # which would produce a materially different (wrong) answer whenever one
    # CFC has a loss and another has income.
    non_elected_ncti_usd = max(0.0, non_elected["testedIncome"] - non_elected["testedLoss"])
    elected_ncti_usd = max(0.0, elected["testedIncome"] - elected["testedLoss"])

    non_elected_ordinary_inclusion_usd = non_elected_ncti_usd + non_elected["subpartF"]

    T = C.US
    sec250_deduction_usd = T["NCTI_SECTION_250_RATE"] * elected_ncti_usd  # NCTI portion only, never Subpart F
    sec962_taxable_base_usd = max(0.0, elected_ncti_usd - sec250_deduction_usd) + elected["subpartF"]
    sec962_gross_tax_usd = T["C_CORP_RATE"] * sec962_taxable_base_usd
    sec962_creditable_ftc_usd = min(sec962_gross_tax_usd, T["NCTI_DEEMED_PAID_FTC_RATE"] * elected["foreignTaxPaid"])
    sec962_net_tax_usd = max(0.0, sec962_gross_tax_usd - sec962_creditable_ftc_usd)

    return {
        "hasAnyCfc": len(per_cfc_trace) > 0,
        "nonElectedOrdinaryInclusionUsd": non_elected_ordinary_inclusion_usd,
        "nonElectedNctiUsd": non_elected_ncti_usd, "nonElectedSubpartFUsd": non_elected["subpartF"],
        "electedPool": {
            "nctiUsd": elected_ncti_usd, "subpartFUsd": elected["subpartF"],
            "sec250DeductionUsd": sec250_deduction_usd, "taxableBaseUsd": sec962_taxable_base_usd,
            "grossTaxUsd": sec962_gross_tax_usd, "foreignTaxPaidUsd": elected["foreignTaxPaid"],
            "creditableFtcUsd": sec962_creditable_ftc_usd, "netTaxUsd": sec962_net_tax_usd,
        },
        "perCfcTrace": per_cfc_trace,
    }


def _aggregate_us_income_result(d, ctx):
    w, biz, ret, di, epf = d["wagesComputation"], d["businessAndSeComputation"], d["retirementComputation"], d["directIncomeComputation"], d["epfNpsCrossBorder"]
    cfc = d["cfcInclusionResult"]
    foreign_interest = di["foreignInterestUsd"] + epf["taxableEpfInterestUsd"]
    foreign_pension = di["foreignPensionUsd"] + epf["taxableNpsWithdrawalUsd"]

    us_source_total = w["wagesUsd"] + biz["businessUsUsd"] + di["interestUsUsd"] + di["ordinaryDividendsUsUsd"] + di["ltcgUsUsd"] + di["stcgUsUsd"] + di["rentalUsUsd"] + ret["usRetirementIncomeExclSsUsd"] + ret["socialSecurityUsUsd"] + di["otherOrdinaryIncomeUsUsd"]
    # The elected pool's pre-tax NCTI/Subpart F is intentionally NOT added
    # here — it flows through cfcElectedPool into compute_us_tax_core's own
    # flat-tax add-on instead, mirroring how AMT/NIIT amounts don't appear
    # in this aggregate either.
    foreign_source_total = d["foreignWagesUsd"] + biz["foreignSelfEmploymentUsd"] + foreign_interest + di["foreignDividendsUsd"] + di["foreignRentalUsd"] + foreign_pension + di["foreignStcgUsd"] + di["foreignLtcgUsd"] + di["section988GainLossUsd"] + cfc["nonElectedOrdinaryInclusionUsd"]

    return {
        "wages": _m(w["wagesUsd"], ctx), "businessUs": _m(biz["businessUsUsd"], ctx), "w2Withholding": w["w2WithholdingUsd"], "w2Employers": w["w2Employers"], "medicareWages": w["medicareWagesUsd"],
        "qualifiedTipsUsd": w["qualifiedTipsUsd"], "qualifiedOvertimeUsd": w["qualifiedOvertimeUsd"],
        "seEarningsUsd": biz["seEarningsUsd"], "qbiIncomeUsd": biz["qbiIncomeUsd"], "qbiIsSSTB": biz["qbiIsSSTB"],
        "usRetirementIncome": _m(ret["usRetirementIncomeExclSsUsd"] + ret["socialSecurityUsUsd"], ctx),
        "usRetirementIncomeExclSs": _m(ret["usRetirementIncomeExclSsUsd"], ctx),
        "retirementDistributionsSubjectTo72tUsd": ret["retirementDistributionsSubjectTo72tUsd"],
        "socialSecurityUs": _m(ret["socialSecurityUsUsd"], ctx),
        "taxExemptInterestUs": _m(di["taxExemptInterestUsUsd"], ctx),
        "interestUs": _m(di["interestUsUsd"], ctx), "ordinaryDividendsUs": _m(di["ordinaryDividendsUsUsd"], ctx), "qualifiedDividendsUs": _m(di["qualifiedDividendsUsUsd"], ctx),
        "ltcgUs": _m(di["ltcgUsUsd"], ctx), "stcgUs": _m(di["stcgUsUsd"], ctx), "capitalGainsUs": _m(di["ltcgUsUsd"] + di["stcgUsUsd"], ctx), "rentalUs": _m(di["rentalUsUsd"], ctx),
        "otherOrdinaryIncomeUs": _m(di["otherOrdinaryIncomeUsUsd"], ctx),
        "foreignWages": _m(d["foreignWagesUsd"], ctx), "foreignSelfEmployment": _m(biz["foreignSelfEmploymentUsd"], ctx),
        "foreignInterest": _m(foreign_interest, ctx), "foreignDividends": _m(di["foreignDividendsUsd"], ctx),
        "foreignRental": _m(di["foreignRentalUsd"], ctx), "foreignPension": _m(foreign_pension, ctx),
        "foreignStcg": _m(di["foreignStcgUsd"], ctx), "foreignLtcg": _m(di["foreignLtcgUsd"], ctx),
        "foreignCapitalGains": _m(di["foreignStcgUsd"] + di["foreignLtcgUsd"], ctx),
        "foreignSection988GainLoss": _m(di["section988GainLossUsd"], ctx),
        "cfcNonElectedInclusionUs": _m(cfc["nonElectedOrdinaryInclusionUsd"], ctx),
        "cfcElectedPool": cfc["electedPool"],       # raw numbers, not money-converted — consumed directly by compute_us_tax_core
        "cfcPerEntityTrace": cfc["perCfcTrace"],    # for the findings/entity-graph consumers
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
        ) + _K1_PASSIVE_FIELDS,
    ))

    r.register("indiaAnnualSliceForUs", NodeDef(deps=(), compute=lambda d, ctx: _india_annual_slice_for_us(ctx)))
    r.register("epfNpsCrossBorder", NodeDef(
        deps=("indiaAnnualSliceForUs",), compute=_epf_nps_cross_border,
        layer1_fields=("india.other_sources.taxable_epf_interest_inr", "india.other_sources.taxable_nps_withdrawal_inr"),
    ))

    # Phase 7 (XB-14): duplicated from crossborder/cross_basis.py's own
    # usForeignCorpsRaw (deps=(), harmless redefinition — Python's NodeRegistry
    # composes everything into one registry via register()/override(), unlike
    # the JS require-chain ordering constraint this duplication works around
    # on that side; kept here anyway for the same single-source-of-truth
    # reason, since these functions are literal line-for-line mirrors of the JS).
    r.register("usForeignCorpsRawForIncome", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_entities.foreign_corporations", []) or []))
    r.register("cfcInclusionResult", NodeDef(
        deps=("usForeignCorpsRawForIncome",), compute=lambda d, ctx: _compute_cfc_inclusion(d["usForeignCorpsRawForIncome"]),
        layer1_fields=(
            "us.foreign_entities.foreign_corporations[].ownership_percentage",
            "us.foreign_entities.foreign_corporations[].tested_income_usd",
            "us.foreign_entities.foreign_corporations[].tested_loss_usd",
            "us.foreign_entities.foreign_corporations[].subpart_f_income_usd",
            "us.foreign_entities.foreign_corporations[].ep_usd",
            "us.foreign_entities.foreign_corporations[].foreign_tax_paid_usd",
            "us.foreign_entities.foreign_corporations[].sec962_election_planned",
            "us.foreign_entities.foreign_corporations[].corporation_name",
        ),
    ))

    r.register("aggregateUsIncomeResult", NodeDef(
        deps=("wagesComputation", "foreignWagesUsd", "businessAndSeComputation", "retirementComputation", "directIncomeComputation", "epfNpsCrossBorder", "cfcInclusionResult"),
        compute=_aggregate_us_income_result,
    ))
    return r
