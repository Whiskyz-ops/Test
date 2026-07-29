"""The final findings assembly — `findingsAllResult`. Port of
prototypes/graph-pilot/report-batch5-nodes.js's own `findingsAllResult`,
adapted to Phase 5's actual output shape.

The JS source concatenates SIX arrays (`findingsBatch1Result`..
`findingsBatch5Result`, `holdingPeriodMismatchFindingsResult`) plus
`residencyConsistencyFindings` plus 5 standalone split-pattern findings —
build-history artifacts of how findings-nodes.js/findings-batch2..6-nodes.js
were incrementally added over time. Phase 5's domain-split port already
consolidated all of that into three domain results — `findingsIndiaResult`/
`findingsUsResult`/`findingsCrossborderResult` — each of which already
includes its own share of the old batch5/batch6/split-pattern findings (e.g.
`findingsCrossborderResult` already includes `holding_period_mismatch_<N>`/
`schedule_fa_inconsistent`/`black_money_act_exposure`; `findingsIndiaResult`/
`findingsUsResult` already include their own split-pattern finding). So this
file's `findingsAllResult` concatenates 5 lists, not 12.

CLOSED IN PHASE 6: `assets-nodes.js` OVERRIDES the JS source's own
`findingsAllResult` to push two more findings —
`msme_disallowance_s43Bh_india` and `presumptive_lockin_active_india` —
a real 63-vs-61 gap in Phase 5's finding inventory (`test_findings_
domain_split.py`, scoped to report-batch5-nodes.js's own `FINDING_ADD_ORDER`,
61 ids), discovered while scoping Phase 6 (those 2 findings live in a file
Phase 5 never touched). `filings/assets.py` now overrides `findingsAllResult`
the same way `assets-nodes.js` does (`NodeRegistry.override(...)`), adding
both findings — see that file's own header.
"""
from __future__ import annotations

from ..core.graph import NodeDef

# The exact order detectConflicts calls add() in (conflicts.js:97-1544) —
# needed only as a stable-sort TIE-BREAK, matching JS's guaranteed-stable
# Array.sort, port of report-batch5-nodes.js's FINDING_ADD_ORDER.
FINDING_ADD_ORDER = [
    "dual_residency", "dual_residency_resolved", "treaty_docs_missing", "dtaa_treaty_elections",
    "withholding_documentation_gap", "pan_not_linked_aadhaar", "ftc_gap", "ftc_available", "feie_ineligible", "feie_applied",
    "amt_applies", "india_advance_tax_interest", "underpayment_2210", "early_withdrawal_penalty_72t", "iso_3921", "form_10iea",
    "form_1099da_awareness", "state_income_tax", "niit_medicare_not_creditable", "no_totalization_agreement", "pe_article7",
    "entity_dual_residency_poem", "residency_status_dtaa_conflated_india", "residency_status_mismatch_india_company",
    "residency_status_mismatch_india", "residency_status_mismatch_india_entity", "residency_status_understated_us",
    "residency_status_overstated_us", "residency_status_understated_us_entity", "residency_status_overstated_us_entity",
    "chapter_xiia_elected_no_holdings", "chapter_xiia_investment_income_missing", "chapter_xiia_investment_income_computed",
    "special_rate_gaming_winnings", "s115bbe_unexplained_income", "carry_forward_losses_not_applied", "nra_fdap_flat_rate",
    "nra_w8ben_missing", "firpta", "form67_required", "tax_year_mismatch", "fx_basis", "state_treaty_not_binding", "pfic",
    "cfc", "cfc_below_threshold", "transfer_pricing", "retirement_mismatch", "deemed_dividend_buyback_mismatch",
    "promoter_buyback_additional_tax", "holding_period_mismatch_", "schedule_fa_inconsistent", "black_money_act_exposure",
    # itin_application_required (task #47): given an explicit, shared
    # position here identical to report-batch5-nodes.js's own — see that
    # file's comment for why (a real fuzz-corpus tie-break mismatch against
    # fbar_limit, both severity:"critical"/amountUsd:0).
    "itin_application_required",
    "india_itr_form_mismatch", "foreign_gift_3520", "covered_expat_gift_tax", "lrs_limit", "fbar_limit",
    "trump_account_contribution_limit", "equity_comp_sourcing", "cross_basis_summary",
]


def _finding_add_order_index(finding_id: str) -> int:
    if finding_id in FINDING_ADD_ORDER:
        return FINDING_ADD_ORDER.index(finding_id)
    return FINDING_ADD_ORDER.index("holding_period_mismatch_")  # dynamic "holding_period_mismatch_N" suffix


_SEVERITY_WEIGHT = {"critical": 0, "warning": 1, "info": 2}


def _findings_all_result(d, ctx):
    all_findings = list(d["findingsIndiaResult"]) + list(d["indiaResidencyConsistencyFinding"]) + \
        list(d["findingsUsResult"]) + list(d["usResidencyConsistencyFinding"]) + \
        list(d["findingsCrossborderResult"])
    # A pre-sort by FINDING_ADD_ORDER comes first so Python's guaranteed-
    # stable sort reproduces the engine's real tie-break for same-severity/
    # same-amountUsd findings, exactly as report-batch5-nodes.js's own
    # two-pass sort does.
    all_findings.sort(key=lambda f: _finding_add_order_index(f["id"]))
    all_findings.sort(key=lambda f: (_SEVERITY_WEIGHT[f["severity"]], -f["amountUsd"]))
    return all_findings


def _build_tax_computation_result(d, ctx):
    return {"india": d["buildTaxComputationIndiaResult"], "us": d["buildTaxComputationUsResult"], "usState": d["buildTaxComputationUsStateResult"]}


NODES = {
    "findingsAllResult": NodeDef(
        deps=("findingsIndiaResult", "indiaResidencyConsistencyFinding", "findingsUsResult",
              "usResidencyConsistencyFinding", "findingsCrossborderResult"),
        compute=_findings_all_result,
    ),
    "buildTaxComputationResult": NodeDef(
        deps=("buildTaxComputationIndiaResult", "buildTaxComputationUsResult", "buildTaxComputationUsStateResult"),
        compute=_build_tax_computation_result,
    ),
}


def build(base):
    """Registers ONLY `findingsAllResult` — same `build(base)` contract as
    every other module in this port (extend `base`, register this file's own
    nodes). The caller is responsible for `base` already carrying
    `findingsIndiaResult`/`indiaResidencyConsistencyFinding`/
    `findingsUsResult`/`usResidencyConsistencyFinding`/
    `findingsCrossborderResult` — composing india/findings.py + us/findings.py
    + crossborder/findings.py into ONE shared registry without duplicate-
    registering aggregate_india_income/aggregate_us_income (each of those
    three files' own build() independently re-derives its shared base) is
    `core.registry.build_full_registry()`'s job, a Phase 7 task. Verified
    here instead via a synthetic-dep-bag unit test
    (tests/test_reports_assembly.py), same discipline
    black_money_act.py's own boundary stubs used in Phase 4.
    """
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
