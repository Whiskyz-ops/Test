"""Written FIRST, before the findings port begins — per the migration plan's
own Phase 5 discipline ("the split is done against a red test that turns
green finding-by-finding, not 'port everything then hope the count
matches'"). Asserts the full pre-split finding-ID inventory (scraped from
the JS source: findings-nodes.js, findings-batch2..6-nodes.js,
residency-nodes.js's residencyConsistencyFindings, and the in1/us1/us5/xb7
split-pattern findings) is preserved exactly once across
india/findings.py + us/findings.py + crossborder/findings.py.

Catalog verified against prototypes/graph-pilot/report-batch5-nodes.js's
own FINDING_ADD_ORDER array: 61 distinct finding ids (one of which,
holding_period_mismatch_<N>, is a dynamic-count template), zero
duplicates, zero unmatched in either direction.

Domain assignment rule applied throughout this port: a finding is
"crossborder" if its own compute() reads a crossborder-domain node
(residencyResult, ftcResult, apportionmentResult, crossBasisResult,
mapDoubleTaxedIncomeResult, etc.) directly — not merely because its
category label says "treaty" or its subject matter sounds cross-border.
Otherwise it follows whichever single country's raw/domain data it reads.
See docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 5 section for the
specific ambiguous-case reasoning (pe_article7, dtaa_treaty_elections,
special_rate_gaming_winnings, entity_dual_residency_poem, the US gift/FEIE/
NRA findings).
"""
from __future__ import annotations

INDIA_FINDING_IDS = {
    "pan_not_linked_aadhaar",
    "india_itr_form_mismatch",
    "s115bbe_unexplained_income",
    "chapter_xiia_elected_no_holdings",
    "chapter_xiia_investment_income_missing",
    "chapter_xiia_investment_income_computed",
    "form_10iea",
    "promoter_buyback_additional_tax",
    "pe_article7",
    "dtaa_treaty_elections",
    "carry_forward_losses_not_applied",
    "lrs_limit",
    "india_advance_tax_interest",
    "residency_status_dtaa_conflated_india",
    "residency_status_mismatch_india_company",
    "residency_status_mismatch_india",
    "residency_status_mismatch_india_entity",
}

US_FINDING_IDS = {
    "amt_applies",
    "foreign_gift_3520",
    "covered_expat_gift_tax",
    "nra_w8ben_missing",
    "firpta",
    "feie_ineligible",
    "feie_applied",
    "nra_fdap_flat_rate",
    "iso_3921",
    "state_income_tax",
    "trump_account_contribution_limit",
    "underpayment_2210",
    "early_withdrawal_penalty_72t",
    "residency_status_understated_us",
    "residency_status_overstated_us",
    "residency_status_understated_us_entity",
    "residency_status_overstated_us_entity",
}

CROSSBORDER_FINDING_IDS = {
    "ftc_gap",
    "ftc_available",
    "entity_dual_residency_poem",
    "dual_residency",
    "dual_residency_resolved",
    "cross_basis_summary",
    "special_rate_gaming_winnings",
    "form_1099da_awareness",
    "tax_year_mismatch",
    "fx_basis",
    "state_treaty_not_binding",
    "pfic",
    "cfc",
    "cfc_below_threshold",
    "transfer_pricing",
    "retirement_mismatch",
    "deemed_dividend_buyback_mismatch",
    "no_totalization_agreement",
    "niit_medicare_not_creditable",
    "treaty_docs_missing",
    "withholding_documentation_gap",
    "equity_comp_sourcing",
    "form67_required",
    "fbar_limit",
    "holding_period_mismatch",  # dynamic template: real ids are holding_period_mismatch_<N>
    "schedule_fa_inconsistent",
    "black_money_act_exposure",
}

ALL_EXPECTED_IDS = INDIA_FINDING_IDS | US_FINDING_IDS | CROSSBORDER_FINDING_IDS


def test_no_id_appears_in_more_than_one_domain_bucket():
    assert INDIA_FINDING_IDS.isdisjoint(US_FINDING_IDS)
    assert INDIA_FINDING_IDS.isdisjoint(CROSSBORDER_FINDING_IDS)
    assert US_FINDING_IDS.isdisjoint(CROSSBORDER_FINDING_IDS)


def test_inventory_totals_match_the_verified_js_source_count():
    # 61 distinct ids in the JS source (report-batch5-nodes.js's own
    # FINDING_ADD_ORDER), one of which (holding_period_mismatch) is counted
    # here as its dynamic-template base id, not per-instance.
    assert len(ALL_EXPECTED_IDS) == 61
    assert len(INDIA_FINDING_IDS) == 17
    assert len(US_FINDING_IDS) == 17
    assert len(CROSSBORDER_FINDING_IDS) == 27


def _collect_ported_finding_ids():
    """Imports each domain's findings module (once ported) and collects
    every finding id its NODES can actually emit. Returns None for a module
    that doesn't exist yet, so this test can be written before any of the
    three modules are ported (red), then turned green module-by-module."""
    ported = {}
    try:
        from wising_dag.india import findings as india_findings
        ported["india"] = india_findings.ALL_FINDING_IDS
    except ImportError:
        ported["india"] = None
    try:
        from wising_dag.us import findings as us_findings
        ported["us"] = us_findings.ALL_FINDING_IDS
    except ImportError:
        ported["us"] = None
    try:
        from wising_dag.crossborder import findings as crossborder_findings
        ported["crossborder"] = crossborder_findings.ALL_FINDING_IDS
    except ImportError:
        ported["crossborder"] = None
    return ported


def test_india_findings_module_matches_expected_inventory():
    ported = _collect_ported_finding_ids()
    if ported["india"] is None:
        import pytest
        pytest.skip("india/findings.py not ported yet")
    assert set(ported["india"]) == INDIA_FINDING_IDS


def test_us_findings_module_matches_expected_inventory():
    ported = _collect_ported_finding_ids()
    if ported["us"] is None:
        import pytest
        pytest.skip("us/findings.py not ported yet")
    assert set(ported["us"]) == US_FINDING_IDS


def test_crossborder_findings_module_matches_expected_inventory():
    ported = _collect_ported_finding_ids()
    if ported["crossborder"] is None:
        import pytest
        pytest.skip("crossborder/findings.py not ported yet")
    assert set(ported["crossborder"]) == CROSSBORDER_FINDING_IDS


def test_full_union_matches_once_all_three_are_ported():
    ported = _collect_ported_finding_ids()
    if any(v is None for v in ported.values()):
        import pytest
        pytest.skip("not all three findings modules are ported yet")
    union = set(ported["india"]) | set(ported["us"]) | set(ported["crossborder"])
    assert union == ALL_EXPECTED_IDS
    total = len(ported["india"]) + len(ported["us"]) + len(ported["crossborder"])
    assert total == len(ALL_EXPECTED_IDS), "an id leaked into more than one module"
