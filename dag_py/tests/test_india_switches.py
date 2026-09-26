"""Layer 1 India income switches (core/india_switches.py): a head whose switch
is explicitly off carries no amounts, top level and every quarter; a missing
switch leaves data alone."""
from wising_dag.core.india_switches import apply_india_income_switches


def test_switched_off_salary_amounts_are_dropped_in_every_quarter():
    india = {
        "domestic_income": {"salary": {"has_salary_income": False, "gross_salary_inr": 13114000}},
        "quarters": {"Q1": {"domestic_income": {"salary": {"has_salary_income": False, "gross_salary_inr": 13114000}}},
                     "Q2": {"domestic_income": {"salary": {"has_salary_income": True, "gross_salary_inr": 500000}}}},
    }
    out = apply_india_income_switches(india)
    assert out["domestic_income"]["salary"] == {"has_salary_income": False}
    assert out["quarters"]["Q1"]["domestic_income"]["salary"] == {"has_salary_income": False}
    assert out["quarters"]["Q2"]["domestic_income"]["salary"]["gross_salary_inr"] == 500000
    assert india["quarters"]["Q1"]["domestic_income"]["salary"]["gross_salary_inr"] == 13114000  # input not mutated


def test_other_heads_and_missing_switches():
    india = {"domestic_income": {"house_property": {"has_house_property_income": False, "properties": [{"annual_value_inr": 1}]},
                                 "business_income": {"has_business_or_fo_income": False, "entity_type": "individual", "business_entries": [{}]},
                                 "has_agricultural_income": False, "agricultural_income_inr": 9,
                                 "salary": {"gross_salary_inr": 7}},
             "other_sources": {"has_other_sources_income": False, "interest_fd_rd_inr": 5}}
    out = apply_india_income_switches(india)
    assert out["domestic_income"]["house_property"]["properties"] == []
    assert out["domestic_income"]["business_income"] == {"has_business_or_fo_income": False, "entity_type": "individual"}
    assert out["domestic_income"]["agricultural_income_inr"] == 0
    assert out["other_sources"] == {"has_other_sources_income": False}
    assert out["domestic_income"]["salary"]["gross_salary_inr"] == 7  # no switch => unchanged
