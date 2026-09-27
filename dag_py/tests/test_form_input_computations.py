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


def test_s35_donation_barred_under_new_regime_and_npa_provisions_not_deducted():
    assert _biz({"s35_donation_to_approved_body_inr": 100000}) == 5000000
    assert _biz({"npa_provisions_inr": 100000}) == 5000000


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
