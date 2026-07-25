"""Golden-diff verification for the Phase 5 findings domain-split
(india/findings.py + us/findings.py + crossborder/findings.py) — every
finding each domain fires for a fixture must exact-match (id/severity/
category/title/detail/recommendation/amountUsd/refs) a same-id entry in
golden's `findings` array. No false positives are tolerated.

Coverage carve-outs (documented, not silently skipped — same discipline as
test_us.py/test_crossborder.py):
  - usTaxResult (used by amt_applies, feie_*, state_income_tax,
    underpayment_2210, early_withdrawal_penalty_72t, niit_medicare_not_
    creditable, no_totalization_agreement, holding_period_mismatch_*, and
    every US-figure embedded in a crossborder finding's detail text) is the
    individual/resident-only node — usKind != "individual" or NRA profiles
    are excluded from the affected findings' coverage, same carve-out
    test_us.py already applies to usTaxResult itself.
  - tax_year_mismatch depends on apportionmentResultBoundary, an EXPLICIT
    BOUNDARY INPUT (reads ctx["computed"]["apportionment"], which doesn't
    exist in the {router, india, us} ctx these fixtures use) — deferred to
    Phase 7's analyze() assembly, same as every other *Boundary node in this
    port. Never fires here; excluded from coverage rather than asserted.
  - findings whose amountUsd is a bool 0/int 0 vs golden's float 0 compare
    equal via support.deep_diff's numeric-tolerance path — no special
    handling needed.

This test does NOT yet assert "every golden finding that SHOULD fire, did
fire" (a completeness check) — only "everything fired is correct" (a
soundness check). Completeness verification is deferred to Phase 7's
test_analyze_golden.py, once usTaxResult's entity/NRA routing and
apportionmentResultBoundary are both closed and the full 61-finding set can
be compared id-set-for-id-set against golden without carve-outs.
"""
from conftest import ctx_for, load_golden
from support import deep_diff

from wising_dag.core.registry import NodeRegistry
from wising_dag.crossborder import findings as crossborder_findings
from wising_dag.india import findings as india_findings
from wising_dag.us import findings as us_findings

INDIA_GRAPH = india_findings.build(NodeRegistry()).freeze()
US_GRAPH = us_findings.build(NodeRegistry()).freeze()
CROSSBORDER_GRAPH = crossborder_findings.build(NodeRegistry()).freeze()

INDIA_TARGETS = ["findingsIndiaResult", "indiaResidencyConsistencyFinding"]
US_TARGETS = ["findingsUsResult", "usResidencyConsistencyFinding"]
CROSSBORDER_TARGETS = ["findingsCrossborderResult"]

# Findings whose text embeds a usTaxResult figure (individual/resident-only
# node) — excluded from coverage for usKind != "individual" or NRA profiles.
# ftc_gap/ftc_available are included here because ftcResult's own US-side
# boundary wiring reads usTaxResult too (crossborder/ftc.py) — the exact
# same carve-out test_crossborder.py's own test_ftc_result_matches_golden
# already applies to ftcResult itself.
US_TAX_RESULT_DEPENDENT_IDS = {
    "amt_applies", "feie_ineligible", "feie_applied", "state_income_tax",
    "underpayment_2210", "early_withdrawal_penalty_72t",
    "niit_medicare_not_creditable", "no_totalization_agreement",
    "ftc_gap", "ftc_available",
}

# early_withdrawal_penalty_72t's own age computation depends on baseYearUs,
# an EXPLICIT BOUNDARY INPUT (reads ctx["model"]["meta"]["baseYear"]) —
# always None under ctx_for()'s {router, india, us} shape (no "model" key),
# so it falls back to a hardcoded 2025 default that can be off by one from
# golden's real base year. Same already-documented gap as
# test_us_penalties.py's own explicit-ctx tests for this exact node.
ALWAYS_SKIP_IDS = {"early_withdrawal_penalty_72t"}


def _is_entity_or_nra(golden: dict) -> bool:
    us_kind = golden["model"]["entity"]["usKind"]
    is_nra = golden["model"]["treaty"]["files1040nr"] and not (golden["model"].get("nra") or {}).get("s6013hElection")
    return us_kind != "individual" or is_nra


def _golden_by_id(golden: dict) -> dict:
    by_id: dict[str, list[dict]] = {}
    for f in golden["findings"]:
        by_id.setdefault(f["id"], []).append(f)
    return by_id


def _assert_fired_findings_match_golden(fired: list[dict], golden_by_id: dict, fixture_id: str, skip_ids: set[str]):
    for f in fired:
        base_id = f["id"].rsplit("_", 1)[0] if f["id"].startswith("holding_period_mismatch_") else f["id"]
        if base_id in skip_ids:
            continue
        candidates = golden_by_id.get(f["id"])
        assert candidates, f"{fixture_id}: fired {f['id']!r} but golden has no finding with that id"
        # holding_period_mismatch_<N> ids are positional per-mismatch — match
        # by id since the index is assigned in the same enumeration order.
        best_diff = None
        for cand in candidates:
            diff = deep_diff(f, cand)
            if diff is None:
                best_diff = None
                break
            best_diff = diff
        assert best_diff is None, f"{fixture_id}: {f['id']} mismatch: " + " | ".join(best_diff[:6])


def test_india_findings_match_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    golden_by_id = _golden_by_id(golden)

    values = INDIA_GRAPH.resolve(INDIA_TARGETS, ctx).values
    fired = values["findingsIndiaResult"] + values["indiaResidencyConsistencyFinding"]

    skip_ids = ALWAYS_SKIP_IDS | (US_TAX_RESULT_DEPENDENT_IDS if _is_entity_or_nra(golden) else set())
    _assert_fired_findings_match_golden(fired, golden_by_id, fixture_id, skip_ids)


def test_us_findings_match_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    golden_by_id = _golden_by_id(golden)

    values = US_GRAPH.resolve(US_TARGETS, ctx).values
    fired = values["findingsUsResult"] + values["usResidencyConsistencyFinding"]

    skip_ids = ALWAYS_SKIP_IDS | (US_TAX_RESULT_DEPENDENT_IDS if _is_entity_or_nra(golden) else set())
    _assert_fired_findings_match_golden(fired, golden_by_id, fixture_id, skip_ids)


def test_crossborder_findings_match_golden(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    golden_by_id = _golden_by_id(golden)

    fired = CROSSBORDER_GRAPH.resolve(CROSSBORDER_TARGETS, ctx).values["findingsCrossborderResult"]

    skip_ids = ALWAYS_SKIP_IDS | set(US_TAX_RESULT_DEPENDENT_IDS) | {"tax_year_mismatch"}
    if _is_entity_or_nra(golden):
        skip_ids |= {"holding_period_mismatch"}
    _assert_fired_findings_match_golden(fired, golden_by_id, fixture_id, skip_ids)
