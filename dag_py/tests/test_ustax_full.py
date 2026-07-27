"""Verifies us/ustax_full.py — TAX-7 (computeUsEntityTax)/TAX-8
(computeNraTax) plus usTaxResult's own entity/NRA routing — closing the
gap flagged at the end of Phase 7 ("usTaxResult has no entity/NRA/trust
routing at all").

Golden-pinned, no carve-out needed: the 1 real NRA fixture
(india_ror_us_income) matches golden EXACTLY end-to-end once routed —
usTax/headline/summary/reconciliation/apportionment/monitoring/
taxComputation.us/withholding all diff clean. Verified here so it can't
silently regress.

Golden-pinned, WITH the one documented divergence: the 1 real business-
entity fixture (us_ccorp_indian_sub, C-Corp) has exactly one root-cause
delta — usTaxResult.usSourceIncomeUsd is this port's real Schedule M-1
taxable income vs golden's frozen-engine $0 (a genuine frozen-engine
data-modeling gap: an entity's own aggregateUsIncomeResult is always $0,
since that node is individual-shaped — see ustax_full.py's own header and
docs/GAP_TRACKER.md section H). Pinned here exactly, including its
cascade into headline/summary/apportionment/ftc.india, so the delta can't
silently grow or shrink undetected. Also confirms golden's own
taxComputation.us.rows for this fixture carries the frozen engine's own
"$NaN" bug (same permanent-divergence class as the India entity "₹NaN"
bug, test_reports_trace.py) — proof this port's clean entity-shaped trace
is the deliberate, correct choice, not an oversight.

No fixture at all exercises scorp/partnership/trust usKind, or the
CA/NY/NJ-modeled and TX/WA/other-unmodeled usEntityStateTaxResult
branches — those are pinned with synthetic ctx/d dicts instead, calling
the private compute functions directly (same precedent as
test_filings_assets.py/test_filings_documents.py importing
_india_itr_form_result).
"""
from conftest import ctx_for, load_golden
from support import deep_diff

from wising_dag import analyze
from wising_dag.core.registry import build_full_registry
from wising_dag.us.ustax_full import (
    _nra_tax_result,
    _us_entity_state_tax_result,
    _us_entity_tax_result,
    _us_tax_result_router,
)

GRAPH = build_full_registry()


def _analyze_pinned(fixture_id):
    ctx = ctx_for(fixture_id)
    golden = load_golden(fixture_id)
    opts = {"router": ctx.get("router"), "india": ctx.get("india"), "us": ctx.get("us"), "monitorAsOf": golden["monitoring"]["asOf"]}
    return analyze(opts), golden


# ---- golden-pinned: NRA fixture, full parity, no carve-out --------------

def test_nra_fixture_matches_golden_end_to_end():
    result, golden = _analyze_pinned("india_ror_us_income")
    for path in ("usTax", "headline", "reconciliation", "apportionment"):
        diff = deep_diff(result["computed"][path], golden["computed"][path])
        assert diff is None, f"computed.{path}: " + " | ".join(diff[:8])
    diff = deep_diff(result["summary"], golden["summary"])
    assert diff is None, "summary: " + " | ".join(diff[:8])
    diff = deep_diff(result["taxComputation"]["us"], golden["taxComputation"]["us"])
    assert diff is None, "taxComputation.us: " + " | ".join(diff[:8])
    diff = deep_diff(result["withholding"], golden["withholding"])
    assert diff is None, "withholding: " + " | ".join(diff[:8])

    # bottom-line relief matches exactly; foreignSourceIncomeUsd/reliefCapUsd
    # are display-only intermediates that legitimately diverge — see
    # test_ftc_india_direction_nra_foreign_source_income_divergence below.
    diff = deep_diff(result["computed"]["ftc"]["us"], golden["computed"]["ftc"]["us"])
    assert diff is None, "computed.ftc.us: " + " | ".join(diff[:8])
    assert result["computed"]["ftc"]["india"]["reliefAllowedUsd"] == golden["computed"]["ftc"]["india"]["reliefAllowedUsd"]
    assert result["computed"]["ftc"]["india"]["usTaxOnUsSourceUsd"] == golden["computed"]["ftc"]["india"]["usTaxOnUsSourceUsd"]
    assert result["computed"]["ftc"]["netUnrelievedDoubleTaxUsd"] == golden["computed"]["ftc"]["netUnrelievedDoubleTaxUsd"]


def test_ftc_india_direction_nra_foreign_source_income_divergence():
    """DELIBERATE DAG/engine divergence, same class as the C-Corp
    usSourceIncomeUsd case: the frozen engine's own (non-overridden)
    usSourceTotalUsdBoundaryFtc boundary reads ctx.model.income.us.
    usSourceTotal.usd — a raw aggregate across ALL US income types,
    unaware of NRA taxability. xborder-full-nodes.js's own override
    (mirrored here) narrows this to usTaxResult.usSourceIncomeUsd, which
    for an NRA is only ECI+FDAP — correctly excluding capital gains an
    NRA isn't taxed on at all. For this fixture the excluded amount is
    exactly the $22,000 LTCG on US securities. The bottom-line
    reliefAllowedUsd is unaffected (both cap values exceed
    usTaxOnUsSourceUsd), so this is a cosmetic-only, not a correctness,
    divergence."""
    result, golden = _analyze_pinned("india_ror_us_income")
    mine = result["computed"]["ftc"]["india"]
    gold = golden["computed"]["ftc"]["india"]

    assert gold["foreignSourceIncomeUsd"] - mine["foreignSourceIncomeUsd"] == 22000
    assert mine["foreignSourceIncomeUsd"] == result["computed"]["usTax"]["usSourceIncomeUsd"]
    assert mine["reliefAllowedUsd"] == gold["reliefAllowedUsd"]


# ---- golden-pinned: C-Corp fixture, one documented divergence -----------

def test_ccorp_fixture_us_source_income_is_the_one_documented_divergence():
    result, golden = _analyze_pinned("us_ccorp_indian_sub")
    mine = result["computed"]["usTax"]
    gold = golden["computed"]["usTax"]

    diff = deep_diff({k: v for k, v in mine.items() if k != "usSourceIncomeUsd"}, {k: v for k, v in gold.items() if k != "usSourceIncomeUsd"})
    assert diff is None, "usTax (excl. usSourceIncomeUsd): " + " | ".join(diff[:8])

    assert gold["usSourceIncomeUsd"] == 0  # the frozen-engine data-modeling gap this port deliberately doesn't reproduce
    assert mine["usSourceIncomeUsd"] == mine["taxableIncomeUsd"] == 4260000.0


def test_ccorp_fixture_divergence_cascades_exactly_and_only_as_documented():
    result, golden = _analyze_pinned("us_ccorp_indian_sub")
    delta = result["computed"]["usTax"]["usSourceIncomeUsd"] - golden["computed"]["usTax"]["usSourceIncomeUsd"]
    assert delta == 4260000.0

    assert result["computed"]["headline"]["totalIncomeUsd"] - golden["computed"]["headline"]["totalIncomeUsd"] == delta
    assert result["summary"]["totalIncomeUsd"] - golden["summary"]["totalIncomeUsd"] == delta
    assert result["computed"]["apportionment"]["usCyTotalUsd"] == delta
    assert result["computed"]["apportionment"]["usCyToFyPrimaryUsd"] == round(delta * 9 / 12)
    assert result["computed"]["apportionment"]["usCyToFyNextUsd"] == round(delta * 3 / 12)

    # everything NOT reachable from usSourceIncomeUsd still matches exactly
    for path in ("residency", "limits"):
        diff = deep_diff(result["computed"][path], golden["computed"][path])
        assert diff is None, f"computed.{path}: " + " | ".join(diff[:8])
    diff = deep_diff(result["computed"]["reconciliation"], golden["computed"]["reconciliation"])
    assert diff is None, "reconciliation: " + " | ".join(diff[:8])
    # computed.indiaTax is a deliberately narrower mirror (analyze.js's own
    # assembleComputed) — same established carve-out as test_analyze_golden.py
    shared_keys = set(result["computed"]["indiaTax"]) & set(golden["computed"]["indiaTax"])
    mine_indiatax = {k: result["computed"]["indiaTax"][k] for k in shared_keys}
    gold_indiatax = {k: golden["computed"]["indiaTax"][k] for k in shared_keys}
    diff = deep_diff(mine_indiatax, gold_indiatax)
    assert diff is None, "computed.indiaTax (shared fields): " + " | ".join(diff[:8])


def test_ccorp_fixture_goldens_own_trace_has_the_frozen_engine_nan_bug():
    """Confirms golden's OWN taxComputation.us.rows (generated from the
    frozen engine) falls through to the individual-branch trace builder for
    this entity taxpayer and produces literal "$NaN" — the same permanent-
    divergence class as the already-established India entity "₹NaN" bug.
    This port deliberately builds a clean entity-shaped trace instead (see
    reports/trace.py's _build_tax_computation_us_entity_result)."""
    golden = load_golden("us_ccorp_indian_sub")
    rows_text = " ".join(r["trace"]["formula"] for r in golden["taxComputation"]["us"]["rows"] if r.get("trace", {}).get("formula"))
    assert "$NaN" in rows_text

    result, _ = _analyze_pinned("us_ccorp_indian_sub")
    mine_rows_text = " ".join(r["trace"]["formula"] for r in result["taxComputation"]["us"]["rows"] if r.get("trace", {}).get("formula"))
    assert "NaN" not in mine_rows_text


# ---- synthetic-ctx unit tests: branches no real fixture exercises --------

def _entity_tax(us_kind, entity_result_extra=None, agg_total=0.0, trust_retained=0.0):
    d = {
        "usEntityKind": us_kind,
        "entityResult": {"usScheduleM1TaxableIncomeUsd": None, **(entity_result_extra or {})},
        "aggregateUsIncomeResult": {"total": {"usd": agg_total}},
        "trustRetainedIncomeUsdRaw": trust_retained,
    }
    return _us_entity_tax_result(d, {})


def test_scorp_is_passthrough_with_zero_entity_level_tax():
    r = _entity_tax("scorp", entity_result_extra={"usScheduleM1TaxableIncomeUsd": 500000.0})
    assert r["passthrough"] is True
    assert r["ordinaryTaxUsd"] == 0
    assert r["taxableIncomeUsd"] == 500000.0
    assert "S-Corp" in r["filingStatus"]


def test_partnership_is_passthrough_with_zero_entity_level_tax():
    r = _entity_tax("partnership", entity_result_extra={"usScheduleM1TaxableIncomeUsd": 300000.0})
    assert r["passthrough"] is True
    assert r["ordinaryTaxUsd"] == 0
    assert "Partnership" in r["filingStatus"]


def test_ccorp_taxed_flat_21_percent_on_schedule_m1_income():
    r = _entity_tax("ccorp", entity_result_extra={"usScheduleM1TaxableIncomeUsd": 1000000.0})
    assert r["ordinaryTaxUsd"] == 210000.0
    assert r["passthrough"] is False
    assert r["usSourceIncomeUsd"] == 1000000.0
    assert r["foreignSourceIncomeUsd"] == 0


def test_trust_fully_distributed_has_zero_entity_level_tax():
    r = _entity_tax("trust", agg_total=200000.0, trust_retained=0.0)
    assert r["passthrough"] is True
    assert r["trustDistributedUsd"] == 200000.0
    assert r["trustRetainedUsd"] == 0.0
    assert r["taxableIncomeUsd"] == 0.0
    assert r["ordinaryTaxUsd"] == 0
    assert r["totalIncomeUsd"] == 200000.0  # distributed + retained, the full economic total


def test_trust_retained_income_taxed_at_compressed_1e_brackets():
    r = _entity_tax("trust", agg_total=50000.0, trust_retained=10000.0)
    assert r["passthrough"] is False
    assert r["trustDistributedUsd"] == 50000.0
    assert r["trustRetainedUsd"] == 10000.0
    assert r["totalIncomeUsd"] == 60000.0
    # bracket 1: 3150 @ 10% = 315; bracket 2: (10000-3150) @ 24% = 1644
    assert round(r["ordinaryTaxUsd"], 2) == 1959.0
    assert r["taxableIncomeUsd"] == 10000.0


# ---- usEntityStateTaxResult: no fixture sets state_of_domicile at all ----

def _state_tax(us_kind, state_code, taxable_income_usd=1000000.0):
    d = {
        "usEntityKind": us_kind,
        "usEntityStateOfDomicileRaw": state_code,
        "usEntityTaxResult": {"taxableIncomeUsd": taxable_income_usd},
    }
    return _us_entity_state_tax_result(d, {})


def test_state_tax_none_when_no_state_of_domicile_set():
    assert _state_tax("ccorp", None) is None


def test_state_tax_none_for_individual_kind():
    assert _us_entity_state_tax_result({"usEntityKind": "individual", "usEntityStateOfDomicileRaw": "CA", "usEntityTaxResult": {}}, {}) is None


def test_state_tax_ca_ccorp_modeled_flat_884_percent():
    r = _state_tax("ccorp", "CA", taxable_income_usd=1000000.0)
    assert r["modeled"] is True
    assert r["totalTaxUsd"] == round(1000000.0 * 0.0884)
    assert r["stateName"] == "California"


def test_state_tax_ny_and_nj_ccorp_modeled():
    ny = _state_tax("ccorp", "NY", taxable_income_usd=1000000.0)
    assert ny["modeled"] is True and ny["stateName"] == "New York"
    nj = _state_tax("ccorp", "NJ", taxable_income_usd=1000000.0)
    assert nj["modeled"] is True and nj["stateName"] == "New Jersey"


def test_state_tax_tx_and_wa_explicitly_not_modeled_not_zero():
    tx = _state_tax("ccorp", "TX")
    assert tx["modeled"] is False
    assert "Franchise" in tx["reason"]
    wa = _state_tax("ccorp", "WA")
    assert wa["modeled"] is False
    assert "B&O" in wa["reason"]


def test_state_tax_ccorp_other_state_not_modeled():
    r = _state_tax("ccorp", "FL")
    assert r["modeled"] is False
    assert r["stateName"] is None


def test_state_tax_scorp_partnership_trust_not_modeled():
    for kind in ("scorp", "partnership", "trust"):
        r = _state_tax(kind, "CA")
        assert r["modeled"] is False, kind


# ---- nraTaxResult: FDAP treaty-rate reduction with W-8BEN on file --------

def _nra(eci=30000.0, fdap=10000.0, claims=None, w8ben=False, filing_status="single"):
    d = {
        "usFilingStatusRaw": filing_status,
        "dedUs": {"salt": 0, "mortgageInterest": 0, "charitable": 0, "medical": 0},
        "nraEciIncomeUsdRaw": eci,
        "nraFdapIncomeUsdRaw": fdap,
        "nraRaw": {"treatyRateClaims": claims or [], "submittedW8ben": w8ben},
        "additionalMedicareOwedBoundary": 0,
    }
    return _nra_tax_result(d, {})


def test_nra_fdap_defaults_to_flat_30_percent_without_w8ben():
    r = _nra(fdap=10000.0)
    assert r["nra"]["fdapRate"] == 0.30
    assert r["nra"]["fdapTaxUsd"] == 3000.0


def test_nra_fdap_uses_treaty_rate_when_w8ben_on_file():
    r = _nra(fdap=10000.0, claims=[{"rate": 15, "income_type": "dividends"}], w8ben=True)
    assert r["nra"]["fdapRate"] == 0.15
    assert r["nra"]["fdapTaxUsd"] == 1500.0
    assert r["nra"]["w8benOnFile"] is True
    assert r["nra"]["claimedRate"] == 0.15


def test_nra_treaty_claim_ignored_without_w8ben_on_file():
    r = _nra(fdap=10000.0, claims=[{"rate": 15, "income_type": "dividends"}], w8ben=False)
    assert r["nra"]["fdapRate"] == 0.30  # claim present but not honored — no W-8BEN on file


def test_nra_no_standard_deduction():
    r = _nra(eci=30000.0)
    assert r["deductionMode"] == "itemized (NRA — no standard deduction)"
    assert r["deductionUsd"] == 0  # no itemizable amounts supplied


# ---- usTaxResult router ---------------------------------------------------

def _router(us_kind="individual", files_1040nr=False, s6013h=False, dual_status=None):
    d = {
        "usEntityKind": us_kind,
        "files1040nr": files_1040nr,
        "s6013hElection": s6013h,
        "usEntityTaxResult": "ENTITY_SENTINEL",
        "nraTaxResult": "NRA_SENTINEL",
        "usTaxIndividualResult": "INDIVIDUAL_SENTINEL",
        "usDualStatusResult": dual_status or {"isDualStatusYear": False},
    }
    return _us_tax_result_router(d, {})


def test_router_sends_entity_kinds_to_entity_result():
    for kind in ("ccorp", "scorp", "partnership", "trust"):
        assert _router(us_kind=kind) == "ENTITY_SENTINEL", kind


def test_router_sends_1040nr_filers_to_nra_result():
    assert _router(files_1040nr=True, s6013h=False) == "NRA_SENTINEL"


def test_router_6013h_election_keeps_1040nr_filer_on_individual_path():
    assert _router(files_1040nr=True, s6013h=True) == "INDIVIDUAL_SENTINEL"


def test_router_defaults_to_individual_path():
    assert _router() == "INDIVIDUAL_SENTINEL"


def test_router_dual_status_year_returns_combined_result():
    ds = {"isDualStatusYear": True, "combined": {"totalTaxBeforeFtcUsd": 1234}}
    result = _router(dual_status=ds)
    assert result["totalTaxBeforeFtcUsd"] == 1234
    assert result["dualStatusDetail"] is ds
