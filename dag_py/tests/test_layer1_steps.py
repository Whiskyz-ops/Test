from wising_dag.core.layer1_steps import step_for_field


def test_india_deductions_field_maps_to_deductions_step():
    assert step_for_field("india.deductions.s80C.epf_employee_inr") == "step-deductions"


def test_india_two_segment_override_wins_over_top_level_fallback():
    assert step_for_field("india.domestic_income.salary.taxable_salary_inr") == "step-salary"
    assert step_for_field("india.domestic_income.house_property.properties[].annual_value_inr") == "step-hp"
    # domestic_income key with no more-specific override falls back to step-business
    assert step_for_field("india.domestic_income.some_unmapped_subkey") == "step-business"


def test_array_marker_stripped_before_lookup():
    assert step_for_field("india.carry_forward_losses.business_loss_cf[].amount_inr") == "step-credits"


def test_us_field_maps_correctly():
    assert step_for_field("us.nra_specific.files_form_1040nr") == "step-nra"
    assert step_for_field("us.foreign_earned_income.claims_feie") == "step-feie"


def test_unknown_country_or_short_path_returns_none():
    assert step_for_field("router.jurisdiction") is None
    assert step_for_field("india") is None


def test_unmapped_top_level_key_returns_none():
    assert step_for_field("india.some_totally_unknown_section.field") is None
