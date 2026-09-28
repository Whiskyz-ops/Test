"""Hand-computed figures for inputs Layer 1 India/US collect that the engine
used to mis-handle (27 Sep 2026): house property (ss.22-24, s.71(3A)),
regular-books business expenses (every form expense field, stock, branches,
s.35D/35DDA), a loss never producing negative tax, and India income filled
into US income only once."""
import copy

from conftest import ctx_for
from wising_dag import analyze


def _india_only(**india):
    base = {
        "profile": {"entity_type": "individual", "tax_regime": "NEW"},
        "residency_detail": {"final_india_residency_status": "ROR"},
        "domestic_income": {"salary": {}},
        "other_sources": {},
    }
    for k, v in india.items():
        base[k] = v
    return {"router": {"jurisdiction": "india_only", "entity_type": base["profile"]["entity_type"], "base_tax_year": 2026},
            "india": base, "us": {}}


def _hp(props, regime="NEW", entity="individual", salary=None):
    s = _india_only(profile={"entity_type": entity, "tax_regime": regime})
    s["india"]["domestic_income"] = {"salary": salary or {}, "house_property": {"has_house_property_income": True, "properties": props}}
    r = analyze(s)
    return r["model"]["income"]["india"]["houseProperty"]["inr"], r["computed"]["indiaTax"]["totalTaxInr"]


def test_let_out_property_nav_less_30_percent():
    # (6,00,000 - 30,000) x 70% = 3,99,000
    assert _hp([{"property_use": "LOP", "gross_annual_value_inr": 600000, "municipal_taxes_paid_inr": 30000}])[0] == 399000


def test_let_out_loss_not_set_off_under_new_regime_but_capped_at_2l_under_old():
    prop = [{"property_use": "LOP", "gross_annual_value_inr": 600000, "municipal_taxes_paid_inr": 30000, "interest_on_borrowed_capital_inr": 500000}]
    assert _hp(prop, "NEW")[0] == 0            # s.115BAC(2): no inter-head set-off
    assert _hp(prop, "OLD")[0] == -101000      # 3,99,000 - 5,00,000
    big = [dict(prop[0], interest_on_borrowed_capital_inr=900000)]
    assert _hp(big, "OLD")[0] == -200000       # s.71(3A) cap


def test_self_occupied_interest_capped_at_2l_old_regime_only():
    sop = [{"property_use": "SOP", "interest_on_borrowed_capital_inr": 250000}]
    assert _hp(sop, "OLD")[0] == -200000
    assert _hp(sop, "NEW")[0] == 0
    # 14,50,000 salary (15L - 50k std) less 2L = 12,50,000 -> old-regime tax 1,95,000
    assert _hp(sop, "OLD", salary={"has_salary_income": True, "gross_salary_inr": 1500000})[1] == 195000


def test_co_owner_share_scales_total_property_figures():
    prop = [{"property_use": "LOP", "gross_annual_value_inr": 600000, "co_owner_share_percent": 50, "financial_values_represent": "TOTAL_PROPERTY"}]
    assert _hp(prop)[0] == 210000


def test_company_loss_never_produces_negative_tax():
    prop = [{"property_use": "LOP", "gross_annual_value_inr": 100000, "interest_on_borrowed_capital_inr": 900000}]
    assert _hp(prop, entity="company")[1] == 0


def _biz(expenses=None, **extra):
    entry = {"business_name": "Shop", "presumptive_scheme": "none", "turnover_inr": 5000000, "expenses": expenses or {}}
    entry.update(extra)
    s = _india_only()
    s["india"]["domestic_income"] = {"salary": {}, "business_income": {"has_business_or_fo_income": True, "business_entries": [entry]}}
    r = analyze(s)
    return r["model"]["income"]["india"]["business"]["inr"]


def test_every_form_expense_field_is_deducted():
    assert _biz({"purchases_inr": 3000000, "legal_professional_fees_inr": 200000}) == 1800000
    assert _biz({"shop_rent_inr": 500000}) == 4500000


def test_stock_adjustment():
    # 50L + closing 8L - (opening 5L + purchases 30L + fees 2L) = 21L
    assert _biz({"purchases_inr": 3000000, "legal_professional_fees_inr": 200000,
                 "opening_stock_inr": 500000, "closing_stock_inr": 800000}) == 2100000


def test_tds_default_slice_is_a_disallowance_not_an_extra_expense():
    # 1L expense, all of it paid without TDS: 30% (30,000) disallowed
    assert _biz({"other_business_expenses_inr": 100000, "payments_to_residents_no_tds_inr": 100000}) == 4930000


def test_branch_turnover_and_expenses_count():
    assert _biz(branches=[{"turnover_inr": 2000000, "expenses": {"shop_rent_inr": 500000}}]) == 6500000


def test_s35d_one_fifth_inside_window_only():
    assert _biz({"s35D_total_preliminary_expenses_inr": 500000, "s35D_year_of_commencement": "Tax Year 2024-25"}) == 4900000
    assert _biz({"s35D_total_preliminary_expenses_inr": 500000, "s35D_year_of_commencement": "2019-20"}) == 5000000


def test_s35_donation_barred_under_new_regime_and_npa_provisions_within_cap():
    assert _biz({"s35_donation_to_approved_body_inr": 100000}) == 5000000
    assert _biz({"npa_provisions_inr": 100000}) == 4900000   # within 5% of ₹50L


def test_epf_interest_reaches_us_income_once():
    # Rs 83,000 at the default Rs 83/$ = $1,000 — previously added twice ($2,000)
    ctx = ctx_for("us_citizen_expat_india")
    base = analyze(copy.deepcopy(ctx))["model"]["income"]["us"]["total"]["usd"]
    c = copy.deepcopy(ctx)
    c["india"].pop("quarters", None)
    c["india"]["other_sources"] = dict(c["india"].get("other_sources") or {}, has_other_sources_income=True, taxable_epf_interest_inr=83000)
    delta = analyze(c)["model"]["income"]["us"]["total"]["usd"] - base
    assert abs(delta - 1000) < 0.01


def test_family_pension_fills_us_foreign_pension_gross_not_other_income():
    ctx = ctx_for("greencard_retiree_india")
    us = analyze(copy.deepcopy(ctx))["model"]["income"]["us"]
    assert round(us["foreignPension"]["usd"]) == 7228   # Layer 1 US's own figure wins
    assert us["foreignOtherIncome"]["usd"] == 0          # not counted again as "other"


# ---- form-vs-engine audit, 28 Sep 2026 ------------------------------------

def _old_regime_salaried(**deductions):
    s = _india_only(profile={"entity_type": "individual", "tax_regime": "OLD", "date_of_birth": "1985-01-01"},
                    deductions=deductions)
    s["india"]["domestic_income"] = {"salary": {"has_salary_income": True, "gross_salary_inr": 2050000}}
    return s


def _ded(**deductions):
    return analyze(_old_regime_salaried(**deductions))["computed"]["indiaTax"]["deductionsInr"]


def test_s80cce_bundle_includes_stamp_duty_pension_and_own_nps():
    assert _ded(s80C={"ppf_inr": 100000, "stamp_duty_registration_inr": 30000}) == 130000
    assert _ded(s80C={"ppf_inr": 100000, "stamp_duty_registration_inr": 30000},
                s80CCC_80CCD1={"lic_annuity_premium_inr": 40000}) == 150000   # one ₹1.5L cap


def test_s80d_per_person_caps_checkups_and_senior_parent_medical():
    # self 30k + checkup 5k -> capped 25k; senior uninsured parents' bills 60k -> capped 50k
    assert _ded(s80D={"self_family_premium_inr": 30000, "self_family_preventive_checkup_inr": 5000, "parents_are_senior": True,
                      "parents_has_health_insurance": False, "parents_medical_expenditure_inr": 60000}) == 75000
    s = _old_regime_salaried(s80D={"self_family_premium_inr": 45000})
    s["india"]["profile"]["date_of_birth"] = "1960-01-01"   # senior: ₹50k cap
    assert analyze(s)["computed"]["indiaTax"]["deductionsInr"] == 45000


def test_s80qqb_rrb_capped_at_3l_each():
    assert _ded(s80QQB_inr=400000, s80RRB_inr=100000) == 400000


def test_s80g_qualifying_limit():
    # 50k (100%, no limit) + 50% x min(5L, 10% of ₹20L adjusted GTI)
    assert _ded(s80G=[{"donation_amount_inr": 50000, "category": "100_percent_no_limit"},
                      {"donation_amount_inr": 500000, "category": "50_percent_with_qualifying_limit"}]) == 150000


def test_s41_deemed_business_income():
    s = _old_regime_salaried()
    s["india"]["domestic_income"]["business_income"] = {"has_business_or_fo_income": True, "business_entries": [], "s41_remission_income_inr": 300000}
    assert analyze(s)["model"]["income"]["india"]["business"]["inr"] == 300000


def test_esop_events_count_when_total_left_blank():
    s = _old_regime_salaried()
    s["india"]["domestic_income"]["salary"]["esop_perquisite_events"] = [{"perquisite_value_inr": 600000}]
    assert analyze(s)["model"]["income"]["india"]["salary"]["inr"] == 2600000


def test_brought_forward_loss_expires_after_8_years():
    def tax(origin):
        s = _old_regime_salaried()
        s["india"]["financial_holdings"] = {"has_financial_transactions": True, "transactions": [
            {"asset_class": "listed_equity", "acquisition_date": "2026-01-01", "purchase_value": 100000, "sale_date": "2026-08-01", "sale_value": 400000, "stt_paid": True}]}
        s["india"]["carry_forward_losses"] = {"has_brought_forward_losses": True, "stcg_loss_cf": [{"fy": origin, "amount_inr": 200000}]}
        return analyze(s)["computed"]["indiaTax"]["totalTaxInr"]
    assert round(tax("Tax Year 2022-23")) == 449800   # set off: STCG 1L
    assert round(tax("Tax Year 2015-16")) == 491400   # 11 years old: lapsed, STCG 3L


def test_company_chapter_via_deductions():
    s = _india_only(profile={"entity_type": "company", "tax_regime": "NEW"}, deductions={"s80IAC_inr": 1000000})
    s["india"]["domestic_income"] = {"business_income": {"has_business_or_fo_income": True, "business_entries": [
        {"business_name": "X", "presumptive_scheme": "none", "turnover_inr": 5000000}]}}
    assert round(analyze(s)["computed"]["indiaTax"]["totalTaxInr"]) == 1248000   # 30% x (50L - 10L) + cess


def test_expired_trc_is_not_on_file():
    ctx = copy.deepcopy(ctx_for("us_resident_indian_income"))
    ctx["india"]["compliance_docs"] = dict(ctx["india"].get("compliance_docs") or {}, trc={"document_uploaded": True, "validity_start_date": "2026-04-01", "validity_end_date": "2027-03-31"})
    assert analyze(copy.deepcopy(ctx))["model"]["treaty"]["trcStatus"] is True
    ctx["india"]["compliance_docs"]["trc"]["validity_end_date"] = "2024-03-31"
    assert analyze(ctx)["model"]["treaty"]["trcStatus"] is False


def _us(fid="us_only_cpa_client"):
    return copy.deepcopy(ctx_for(fid))


def test_w2_allocated_tips_and_dependent_care_over_7500():
    base = analyze(_us())["model"]["income"]["us"]["wages"]["usd"]
    c = _us()
    w = c["us"]["income_us_source"]["wages_w2"][0]
    w.setdefault("tax_details_collapsed_by_default", {}).update(allocated_tips_box8_usd=2000, dependent_care_benefits_box10_usd=9000)   # where the form saves them
    assert analyze(c)["model"]["income"]["us"]["wages"]["usd"] - base == 3500


def test_k1_branches_and_owned_ccorp_dividends_count():
    base = analyze(_us())["model"]["income"]["us"]
    c = _us()
    c["us"]["income_us_source"]["partnerships_k1"][0]["branches"] = [{"ordinary_income_usd": 5000}]
    c["us"]["income_us_source"]["c_corporations_1120"] = [{"dividends_paid_usd": 10000, "dividend_type": "qualified"}]
    r = analyze(c)["model"]["income"]["us"]
    assert r["businessUs"]["usd"] - base["businessUs"]["usd"] == 5000
    assert r["ordinaryDividendsUs"]["usd"] - base["ordinaryDividendsUs"]["usd"] == 10000


def test_ftc_baskets_and_prior_carryover_when_no_india_tax():
    c = _us()
    c["us"]["income_foreign_source"] = dict(c["us"].get("income_foreign_source") or {}, foreign_interest_usd=20000)
    c["us"]["ftc_inputs"] = dict(c["us"].get("ftc_inputs") or {}, ftc_baskets=[
        {"foreign_country": "IN", "basket_type": "passive", "gross_foreign_income_usd": 20000, "foreign_taxes_paid_usd": 1000}])
    one = analyze(copy.deepcopy(c))["computed"]["ftc"]["us"]
    assert round(one["ftcAllowedUsd"]) == 1000                 # the basket's own tax
    c["us"]["ftc_inputs"]["prior_year_carryovers_usd"] = 5000
    two = analyze(c)["computed"]["ftc"]["us"]
    assert round(two["ftcAllowedUsd"]) == round(two["ftcLimitUsd"])   # carryover fills the §904 room


def _biz_income(entry, entity="individual"):
    s = _india_only(profile={"entity_type": entity, "tax_regime": "NEW"})
    s["india"]["domestic_income"] = {"salary": {}, "business_income": {"has_business_or_fo_income": True, "business_entries": [entry]}}
    return analyze(s)["model"]["income"]["india"]["business"]["inr"]


def test_s44ad_counts_branch_receipts_and_its_ceiling():
    base = {"presumptive_scheme": "s44AD", "digital_receipts_inr": 1000000, "cash_receipts_inr": 500000}
    assert _biz_income(base) == 100000                                                        # 6% + 8%
    assert _biz_income(dict(base, branches=[{"turnover_inr": 2000000}])) == 260000             # unsplit branch turnover at 8%
    assert _biz_income(dict(base, branches=[{"turnover_inr": 2000000, "digital_receipts_inr": 2000000}])) == 220000
    assert _biz_income(dict(base, branches=[{"digital_receipts_inr": 35000000}])) == 36500000  # over ₹3 Cr: regular books


def test_s44ada_counts_branch_receipts():
    assert _biz_income({"presumptive_scheme": "s44ADA", "gross_receipts_inr": 2000000, "branches": [{"turnover_inr": 1000000}]}) == 1500000


def test_npa_provisions_capped_at_5_percent_of_business_income():
    entry = {"business_code": "banking", "presumptive_scheme": "none", "turnover_inr": 10000000}
    assert _biz_income(dict(entry, expenses={"npa_provisions_inr": 200000}), "company") == 9800000
    assert _biz_income(dict(entry, expenses={"npa_provisions_inr": 1000000}), "company") == 9500000


def test_indian_rent_enters_us_income_under_us_rules():
    # ₹12L rent − ₹60k municipal tax, no Indian 30% deduction: ₹11.4L at ₹83/$
    c = copy.deepcopy(ctx_for("us_resident_indian_income"))
    c["us"]["income_foreign_source"]["foreign_rental_income_usd"] = 0
    c["us"]["income_foreign_source"].pop("foreign_rental_expenses_usd", None)
    r = analyze(c)["model"]["income"]["us"]
    assert r["foreignFromIndia"].get("rental") is True
    assert round(r["foreignRental"]["usd"]) == round(1140000 / 83)


def test_company_card_shows_chapter_via_deductions():
    s = _india_only(profile={"entity_type": "company", "tax_regime": "NEW"}, deductions={"s80IAC_inr": 1000000})
    s["router"]["entity_type"] = "company"
    s["india"]["domestic_income"] = {"business_income": {"has_business_or_fo_income": True, "business_entries": [
        {"business_name": "X", "presumptive_scheme": "none", "turnover_inr": 5000000}]}}
    r = analyze(s)
    rows = {row["label"]: row["inr"] for row in r["taxComputation"]["india"]["rows"]}
    assert rows["Gross total income"] == 5000000
    assert rows["Chapter VI-A deductions"] == -1000000
    assert rows["Taxable income"] == 4000000
    assert r["computed"]["indiaTax"]["deductionsInr"] == 1000000


def test_npa_deduction_shown_on_each_business_card():
    ents = [{"business_name": "A", "business_code": "banking", "presumptive_scheme": "none", "turnover_inr": 10000000, "expenses": {"npa_provisions_inr": 600000}},
            {"business_name": "B", "business_code": "banking", "presumptive_scheme": "none", "turnover_inr": 6000000, "expenses": {"npa_provisions_inr": 200000}}]
    s = _india_only(profile={"entity_type": "company", "tax_regime": "NEW"})
    s["india"]["domestic_income"] = {"business_income": {"has_business_or_fo_income": True, "business_entries": ents}}
    r = analyze(s)
    cards = [x for x in r["model"]["assets"]["businessEntities"] if x["country"] == "IN"]
    assert [round(c["inr"]) for c in cards] == [9400000, 5800000]
    assert round(sum(c["inr"] for c in cards)) == round(r["model"]["income"]["india"]["business"]["inr"])


def test_s80m_uses_the_companys_own_dividends_in_the_full_engine():
    # s.115BAA company: only s.80M survives — dividends passed on (5L), up to dividends received (10L)
    c = copy.deepcopy(ctx_for("india_pvt_ltd"))
    c["india"].pop("quarters", None)
    c["india"]["deductions"] = dict(c["india"].get("deductions") or {}, s80IAC_inr=2000000, s80M={"dividend_inr": 500000})
    c["india"]["other_sources"] = dict(c["india"].get("other_sources") or {}, has_other_sources_income=True, dividend_inr=1000000)
    r = analyze(c)
    assert r["computed"]["indiaTax"]["deductionsInr"] == 500000
    assert {x["label"]: x["inr"] for x in r["taxComputation"]["india"]["rows"]}["Chapter VI-A deductions"] == -500000
