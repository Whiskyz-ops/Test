"""Verifies us/ustax_full.py — TAX-7 (computeUsEntityTax)/TAX-8
(computeNraTax) plus usTaxResult's own entity/NRA routing — closing the
gap flagged at the end of Phase 7 ("usTaxResult has no entity/NRA/trust
routing at all").

Golden-pinned, no carve-out needed: the 1 real NRA fixture
(india_ror_us_income) matches golden EXACTLY end-to-end once routed —
usTax/headline/summary/reconciliation/apportionment/monitoring/
taxComputation.us/withholding all diff clean. Verified here so it can't
silently regress.

One exception, in summary.requiredDocs only: this fixture has form_10iea
(DAG-only, no engine equivalent -- old regime + PGBP income) and, as of
task #48 (LRS-investor flag), form_27d (DAG-only -- an on-file LRS
investment remittance above ₹10L) both required, 2 more than golden's own
count. support.py's own numeric _close() tolerance (±1) already silently
absorbed the single form_10iea gap before form_27d existed; the 2-doc
total needs an explicit adjustment below rather than relying on that
tolerance a second time.

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
    _findings_all_result_override,
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

# Art. 21(2) student/business-apprentice standard-deduction support
# (ustax_full.py's _nra_tax_result) added 4 new keys under usTax.nra that
# predate this fixture's golden snapshot — a genuine output-shape addition,
# not a divergence in any EXISTING figure (every pre-existing field below
# still matches golden exactly). Stripped here before the strict diff, same
# carve-out discipline as conftest.py's GOLDEN_DIVERGENT_FIXTURES_* sets,
# and asserted directly afterward instead.
_NRA_ART212_NEW_FIELDS = ("article212Eligible", "article212AmbiguousJ1", "itemizedDeductionUsd", "standardDeductionUsd")


def _strip_nra_art212_fields(us_tax: dict) -> dict:
    stripped = dict(us_tax)
    if isinstance(stripped.get("nra"), dict):
        stripped["nra"] = {k: v for k, v in stripped["nra"].items() if k not in _NRA_ART212_NEW_FIELDS}
    return stripped


def test_nra_fixture_matches_golden_end_to_end():
    result, golden = _analyze_pinned("india_ror_us_income")
    for path in ("usTax", "headline", "reconciliation", "apportionment"):
        mine = _strip_nra_art212_fields(result["computed"][path]) if path == "usTax" else result["computed"][path]
        diff = deep_diff(mine, golden["computed"][path])
        assert diff is None, f"computed.{path}: " + " | ".join(diff[:8])

    # This fixture's visa isn't F-1/J-1 (a US resident with India-source
    # income, not a student), so Art. 21(2) shouldn't auto-apply or flag as
    # ambiguous — confirms the 4 stripped-above fields are absent/False for
    # the right reason here, not just uncompared.
    nra = result["computed"]["usTax"]["nra"]
    assert nra["article212Eligible"] is False
    assert nra["article212AmbiguousJ1"] is False
    # form_10iea (pre-existing, absorbed by support.py's ±1 numeric
    # tolerance until now) + form_27d (task #48) are both DAG-only required
    # docs golden's frozen engine has no concept of -- see this file's own
    # header. Adjust golden's requiredDocs up to compare on equal footing,
    # same discipline as test_analyze_golden.py's own DAG_ONLY_DOCUMENT_IDS
    # adjustment.
    _dag_only_required_docs = sum(1 for d in result["documents"] if d["id"] in ("form_10iea", "form_27d") and d.get("required"))
    golden_summary = dict(golden["summary"])
    golden_summary["requiredDocs"] += _dag_only_required_docs
    diff = deep_diff(result["summary"], golden_summary)
    assert diff is None, "summary: " + " | ".join(diff[:8])
    diff = deep_diff(result["taxComputation"]["us"], golden["taxComputation"]["us"])
    assert diff is None, "taxComputation.us: " + " | ".join(diff[:8])
    diff = deep_diff(result["withholding"], golden["withholding"])
    assert diff is None, "withholding: " + " | ".join(diff[:8])

    # bottom-line relief matches exactly; foreignSourceIncomeUsd/reliefCapUsd
    # are display-only intermediates that legitimately diverge — see
    # test_ftc_india_direction_nra_foreign_source_income_divergence below.
    # baskets/otherCountries (task #46, multi-country/multi-basket FTC): new
    # DAG-only fields, no frozen-engine equivalent.
    mine_ftc_us = {k: v for k, v in result["computed"]["ftc"]["us"].items() if k not in ("baskets", "otherCountries")}
    diff = deep_diff(mine_ftc_us, golden["computed"]["ftc"]["us"])
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

    # cfcNetTaxUsd (entity-routing fix, conftest.py's own
    # GOLDEN_DIVERGENT_FIXTURES_CFC_ENTITY_ROUTING docstring): brand-new
    # field on the ccorp/trust entity-tax result, no frozen-engine
    # equivalent at all (same class as gilti962TaxUsd/cfcDetail on the
    # individual path, already excluded elsewhere) — computes to 0.0 for
    # this fixture regardless (its profile JSON predates Phase 7's real CFC
    # financial fields), but the KEY itself is new either way.
    excl = {"usSourceIncomeUsd", "cfcNetTaxUsd"}
    diff = deep_diff({k: v for k, v in mine.items() if k not in excl}, {k: v for k, v in gold.items() if k not in excl})
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

def _nra(eci=30000.0, fdap=10000.0, claims=None, w8ben=False, filing_status="single", visa_type=None):
    d = {
        "usFilingStatusRaw": filing_status,
        "dedUs": {"salt": 0, "mortgageInterest": 0, "charitable": 0, "medical": 0},
        "nraEciIncomeUsdRaw": eci,
        "nraFdapIncomeUsdRaw": fdap,
        "nraRaw": {"treatyRateClaims": claims or [], "submittedW8ben": w8ben},
        "additionalMedicareOwedBoundary": 0,
        "usVisaTypeRaw": visa_type,
    }
    return _nra_tax_result(d, {})


def test_nra_fdap_defaults_to_flat_30_percent_without_w8ben():
    r = _nra(fdap=10000.0)
    assert r["nra"]["fdapRate"] == 0.30
    assert r["nra"]["fdapTaxUsd"] == 3000.0


def test_nra_fdap_uses_treaty_rate_when_w8ben_on_file():
    r = _nra(fdap=10000.0, claims=[{"elected_rate": 15, "income_type": "dividends"}], w8ben=True)
    assert r["nra"]["fdapRate"] == 0.15
    assert r["nra"]["fdapTaxUsd"] == 1500.0
    assert r["nra"]["w8benOnFile"] is True
    assert r["nra"]["claimedRate"] == 0.15


# ---- nraTaxResult: DTAA Art. 21(2) student/business-apprentice standard
# deduction --------------------------------------------------------------

def test_nra_f1_visa_gets_standard_deduction_when_larger_than_itemized():
    r = _nra(eci=30000.0, visa_type="f1")
    assert r["nra"]["article212Eligible"] is True
    assert r["deductionUsd"] == 16100  # single standard deduction, TY2026
    assert r["deductionMode"].startswith("standard (Art. 21(2)")
    assert r["taxableIncomeUsd"] == 30000.0 - 16100


def test_nra_f1_visa_keeps_itemized_when_larger_than_standard():
    d = {
        "usFilingStatusRaw": "single",
        "dedUs": {"salt": 0, "mortgageInterest": 20000, "charitable": 5000, "medical": 0},
        "nraEciIncomeUsdRaw": 60000.0, "nraFdapIncomeUsdRaw": 0,
        "nraRaw": {"treatyRateClaims": [], "submittedW8ben": False},
        "additionalMedicareOwedBoundary": 0, "usVisaTypeRaw": "f1",
    }
    r = _nra_tax_result(d, {})
    assert r["nra"]["article212Eligible"] is True
    assert r["deductionUsd"] == 25000  # itemized (mortgage + charitable) exceeds the $16,100 standard deduction
    assert r["deductionMode"].startswith("itemized (Art. 21(2)")


def test_nra_non_f1_j1_visa_stays_itemized_only():
    r = _nra(eci=30000.0, visa_type="h1b")
    assert r["nra"]["article212Eligible"] is False
    assert r["nra"]["article212AmbiguousJ1"] is False
    assert r["deductionMode"] == "itemized (NRA — no standard deduction)"


def test_nra_j1_visa_flagged_ambiguous_not_auto_applied():
    r = _nra(eci=30000.0, visa_type="j1")
    assert r["nra"]["article212Eligible"] is False
    assert r["nra"]["article212AmbiguousJ1"] is True
    assert r["deductionMode"] == "itemized (NRA — no standard deduction)"


def test_nra_treaty_claim_ignored_without_w8ben_on_file():
    r = _nra(fdap=10000.0, claims=[{"elected_rate": 15, "income_type": "dividends"}], w8ben=False)
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


# ---- findingsAllResult override: DAG-only NRA additions ------------------
# (nra_eci_fdap_classification_check / treaty_rate_not_recognized /
# nra_article_21_2_standard_deduction / nra_j1_article_21_2_review — see
# ustax_full.py's own "DAG-only additions" comment for why these live here
# instead of us/findings.py's ALL_FINDING_IDS)

def _override_d(**overrides):
    d = {
        "usEntityStateTaxResult": None, "usDualStatusResult": None, "usExpatriationResult": None,
        "usEntityKind": "individual", "treatyFiles1040nrRaw": True, "s6013hElection": False,
        "usTaxResult": {"nra": {"article212Eligible": False, "article212AmbiguousJ1": False}},
        "nraDerivedEciFdapResult": {"derivedEciUsd": 0.0, "derivedFdapUsd": 0.0, "derivedTotalUsd": 0.0},
        "nraEciIncomeUsdRaw": 0, "nraFdapIncomeUsdRaw": 0,
        "nraRaw": {"treatyRateClaims": []},
    }
    d.update(overrides)
    return d


def _override_finding_ids(d):
    return {f["id"] for f in _findings_all_result_override(d, {}, lambda dd, ctx: [])}


def test_nra_classification_check_fires_on_material_gap():
    ids = _override_finding_ids(_override_d(
        nraDerivedEciFdapResult={"derivedEciUsd": 50000.0, "derivedFdapUsd": 20000.0, "derivedTotalUsd": 70000.0},
        nraEciIncomeUsdRaw=30000, nraFdapIncomeUsdRaw=10000,
    ))
    assert "nra_eci_fdap_classification_check" in ids


def test_nra_classification_check_silent_when_totals_match():
    ids = _override_finding_ids(_override_d(
        nraDerivedEciFdapResult={"derivedEciUsd": 30000.0, "derivedFdapUsd": 10000.0, "derivedTotalUsd": 40000.0},
        nraEciIncomeUsdRaw=30000, nraFdapIncomeUsdRaw=10000,
    ))
    assert "nra_eci_fdap_classification_check" not in ids


def test_nra_classification_check_not_fired_when_not_nra():
    ids = _override_finding_ids(_override_d(
        treatyFiles1040nrRaw=False,
        nraDerivedEciFdapResult={"derivedEciUsd": 50000.0, "derivedFdapUsd": 20000.0, "derivedTotalUsd": 70000.0},
    ))
    assert "nra_eci_fdap_classification_check" not in ids


def test_nra_classification_check_not_fired_for_entity():
    ids = _override_finding_ids(_override_d(
        usEntityKind="ccorp",
        nraDerivedEciFdapResult={"derivedEciUsd": 50000.0, "derivedFdapUsd": 20000.0, "derivedTotalUsd": 70000.0},
    ))
    assert "nra_eci_fdap_classification_check" not in ids


def test_treaty_rate_not_recognized_fires_on_unrecognized_rate():
    ids = _override_finding_ids(_override_d(nraRaw={"treatyRateClaims": [{"elected_rate": 20, "income_type": "dividends"}]}))
    assert "treaty_rate_not_recognized" in ids


def test_treaty_rate_not_recognized_silent_on_recognized_general_rate():
    ids = _override_finding_ids(_override_d(nraRaw={"treatyRateClaims": [{"elected_rate": 25, "income_type": "dividends"}]}))
    assert "treaty_rate_not_recognized" not in ids


def test_treaty_rate_not_recognized_silent_on_recognized_reduced_rate():
    ids = _override_finding_ids(_override_d(nraRaw={"treatyRateClaims": [{"elected_rate": 10, "income_type": "interest"}]}))
    assert "treaty_rate_not_recognized" not in ids


def test_treaty_rate_check_skips_unknown_income_type():
    ids = _override_finding_ids(_override_d(nraRaw={"treatyRateClaims": [{"elected_rate": 99, "income_type": "pension"}]}))
    assert "treaty_rate_not_recognized" not in ids


def test_article_21_2_finding_for_eligible_f1():
    ids = _override_finding_ids(_override_d(usTaxResult={
        "nra": {"article212Eligible": True, "article212AmbiguousJ1": False, "standardDeductionUsd": 16100, "itemizedDeductionUsd": 0},
    }))
    assert "nra_article_21_2_standard_deduction" in ids
    assert "nra_j1_article_21_2_review" not in ids


def test_article_21_2_review_finding_for_ambiguous_j1():
    ids = _override_finding_ids(_override_d(usTaxResult={"nra": {"article212Eligible": False, "article212AmbiguousJ1": True}}))
    assert "nra_j1_article_21_2_review" in ids
    assert "nra_article_21_2_standard_deduction" not in ids


def test_article_21_2_no_finding_for_ordinary_nra():
    ids = _override_finding_ids(_override_d())
    assert "nra_article_21_2_standard_deduction" not in ids
    assert "nra_j1_article_21_2_review" not in ids
