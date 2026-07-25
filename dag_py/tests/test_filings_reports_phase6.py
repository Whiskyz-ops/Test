"""Synthetic-dep-bag unit tests for the Phase 6 "trust-the-caller" modules
(filings/limits.py, filings/calendar_amounts.py, filings/checks_registry.py,
reports/assembly.py) — each module's `build(base)` only registers its own
node and expects `base` to already carry every dependency (composing
india/findings.py + us/findings.py + crossborder/findings.py into ONE
shared registry without duplicate-registering their common
aggregate_india_income/aggregate_us_income base is a Phase 7
`build_full_registry()` task — see each module's own docstring). These
tests call each node's `compute(d, ctx)` directly with a hand-built `d`
dict, bypassing graph resolution entirely — a legitimate strategy for a
leaf node whose real dependency graph isn't assembled yet, same discipline
`test_us_penalties.py` established in Phase 3 for boundary-stub nodes.
"""
from wising_dag.filings import calendar_amounts, checks_registry, limits
from wising_dag.reports import assembly


def _finding(id_, severity="warning", amount_usd=0):
    return {"id": id_, "severity": severity, "category": "credit", "title": "t", "detail": "d", "recommendation": "r", "amountUsd": amount_usd, "refs": []}


# ---- reports/assembly.py ---------------------------------------------------

def test_findings_all_result_concatenates_and_sorts_by_severity_then_amount():
    d = {
        "findingsIndiaResult": [_finding("form_10iea", "warning", 0)],
        "indiaResidencyConsistencyFinding": [],
        "findingsUsResult": [_finding("amt_applies", "warning", 500)],
        "usResidencyConsistencyFinding": [],
        "findingsCrossborderResult": [_finding("pfic", "critical", 0)],
    }
    out = assembly.NODES["findingsAllResult"].compute(d, {})
    assert [f["id"] for f in out] == ["pfic", "amt_applies", "form_10iea"]


def test_findings_all_result_empty_when_nothing_fired():
    d = {k: [] for k in ("findingsIndiaResult", "indiaResidencyConsistencyFinding", "findingsUsResult", "usResidencyConsistencyFinding", "findingsCrossborderResult")}
    assert assembly.NODES["findingsAllResult"].compute(d, {}) == []


def test_finding_add_order_index_falls_back_for_dynamic_holding_period_ids():
    assert assembly._finding_add_order_index("holding_period_mismatch_0") == assembly.FINDING_ADD_ORDER.index("holding_period_mismatch_")


# ---- filings/limits.py -----------------------------------------------------

def _limits_dep_bag(**overrides):
    d = {
        "hasUsScopeBoundaryFtc": True, "hasIndiaScopeXbr": True,
        "aggregatePeakUsdResult": {"usd": 5000}, "usFilingStatusRaw": "single",
        "feieLimitsRaw": {"claimed": False, "amountClaimedUsd": 0, "foreignEarnedIncomeUsd": 0, "taxHomeCountry": "", "bonaFide": False, "physicalPresence": False, "daysInUsTestPeriod": 0},
        "limitsRawExtra": {"lrsRemittedInr": 0, "trumpAccountsOpened": False, "trumpAccountsNumChildren": 0, "trumpAccountsSeedEligibleChildren": 0, "trumpAccountsContributionsUsd": 0},
        "nroCumulativeRepatriatedUsdRaw": 0,
    }
    d.update(overrides)
    return d


def test_limits_result_fbar_gauge_breached():
    d = _limits_dep_bag(aggregatePeakUsdResult={"usd": 15000})
    out = limits.NODES["limitsResult"].compute(d, {})
    fbar = next(g for g in out if g["id"] == "fbar")
    assert fbar["status"] == "breached"
    assert fbar["value"] == 15000


def test_limits_result_no_us_gauges_when_out_of_us_scope():
    d = _limits_dep_bag(hasUsScopeBoundaryFtc=False)
    out = limits.NODES["limitsResult"].compute(d, {})
    assert not any(g["id"] in ("fbar", "form8938") for g in out)


def test_limits_result_feie_ineligible_shows_zero_used():
    d = _limits_dep_bag(feieLimitsRaw={"claimed": True, "amountClaimedUsd": 50000, "foreignEarnedIncomeUsd": 50000, "taxHomeCountry": "us", "bonaFide": False, "physicalPresence": False, "daysInUsTestPeriod": 0})
    out = limits.NODES["limitsResult"].compute(d, {})
    feie = next(g for g in out if g["id"] == "feie")
    assert feie["value"] == 0
    assert "NOT eligible" in feie["note"]


def test_limits_result_trump_account_gauge_scales_with_children():
    d = _limits_dep_bag(limitsRawExtra={"lrsRemittedInr": 0, "trumpAccountsOpened": True, "trumpAccountsNumChildren": 2, "trumpAccountsSeedEligibleChildren": 0, "trumpAccountsContributionsUsd": 6000})
    out = limits.NODES["limitsResult"].compute(d, {})
    ta = next(g for g in out if g["id"] == "trump_account")
    assert ta["limit"] == 10000  # 5000 * 2 children
    assert ta["status"] == "ok"


# ---- filings/calendar_amounts.py -------------------------------------------

def test_calendar_amounts_india_not_obliged_has_no_installments():
    d = {
        "hasIndiaScope": True, "hasUsScope": False, "inAdvTaxObliged": False, "inPurelyPresumptive": False,
        "assessedTaxInr": 0, "advQ1Inr": 0, "advQ2Inr": 0, "advQ3Inr": 0, "advQ4Inr": 0,
        "usRequiredUsd": 0, "usWithholdingTotalUsd": 0, "usEstQ1Usd": 0, "usEstQ2Usd": 0, "usEstQ3Usd": 0, "usEstQ4Usd": 0,
        "usTaxResult": {},
    }
    out = calendar_amounts.NODES["calendarAmountsResult"].compute(d, {})
    assert out["india"]["obliged"] is False
    assert out["india"]["installments"] == []


def test_calendar_amounts_india_quarterly_installments_computed():
    d = {
        "hasIndiaScope": True, "hasUsScope": False, "inAdvTaxObliged": True, "inPurelyPresumptive": False,
        "assessedTaxInr": 100000, "advQ1Inr": 5000, "advQ2Inr": 0, "advQ3Inr": 0, "advQ4Inr": 0,
        "usRequiredUsd": 0, "usWithholdingTotalUsd": 0, "usEstQ1Usd": 0, "usEstQ2Usd": 0, "usEstQ3Usd": 0, "usEstQ4Usd": 0,
        "usTaxResult": {},
    }
    out = calendar_amounts.NODES["calendarAmountsResult"].compute(d, {})
    assert out["india"]["obliged"] is True
    q1 = out["india"]["installments"][0]
    assert q1["amountDueInr"] == 100000 * 0.15 - 5000


def test_calendar_amounts_us_skips_entity_taxpayer():
    d = {
        "hasIndiaScope": False, "hasUsScope": True, "inAdvTaxObliged": False, "inPurelyPresumptive": False,
        "assessedTaxInr": 0, "advQ1Inr": 0, "advQ2Inr": 0, "advQ3Inr": 0, "advQ4Inr": 0,
        "usRequiredUsd": 40000, "usWithholdingTotalUsd": 0, "usEstQ1Usd": 0, "usEstQ2Usd": 0, "usEstQ3Usd": 0, "usEstQ4Usd": 0,
        "usTaxResult": {"isEntity": True},
    }
    out = calendar_amounts.NODES["calendarAmountsResult"].compute(d, {})
    assert out["us"]["installments"] == []


# ---- filings/checks_registry.py --------------------------------------------

def _checks_dep_bag(**overrides):
    d = {
        "findingsAllResult": [],
        "panAadhaarLinkedRaw": True, "hasIndiaScopeXbr": True, "hasUsScopeBoundaryFtc": True,
        "ftcResult": {"us": {"residualDoubleTaxUsd": 0, "indiaTaxPaidUsd": 0, "ftcAllowedUsd": 0}},
        "usTaxResult": {"amtUsd": 0, "seTaxUsd": 0, "niitUsd": 0, "additionalMedicareUsd": 0},
        "indiaIsCompany": False, "indiaIsIndianCompanyRaw": True, "residencyResult": {"dualResident": False, "india": {"isResident": True}, "us": {"isResident": False, "worldwide": False}},
        "crossBasisResult": {"rows": []}, "indiaItrFormResult": {"matchesFrontend": True}, "specialRate115bbInr": 0, "unexplained115bbeInrAgg": 0,
        "chapterXiiaElectedRaw": False,
        "taxRegime": "NEW", "businessComputation": {"businessInr": 0}, "indiaIsFirm": False, "indiaIsAop": False, "indiaIsTrust": False,
        "capitalGainsComputation": {"chapterXiiaSfeaHoldingCount": 0, "chapterXiiaInvestmentIncomeInr": 0, "deemedDividendInr": 0, "holdingPeriodMismatches": []},
        "stateResidencyRaw": {"primaryState": None, "domicileDec31": None, "domicileJan1": None, "footprint": []},
        "indiaFinancialHoldingsTxRaw": [], "viaForeignCorpXbr4": False, "bizEntriesAgg": [],
        "epfInrRaw": 0, "ppfInrRaw": 0, "npsInrRaw": 0,
        "foreignGiftsRaw": {"receivedAbove100k": False, "isTrustBeneficiary": False, "receivedFromCoveredExpatriate": False},
        "nraRaw": {"treatyRateClaims": [], "submittedW8ben": False, "usRealPropertyDisposed": False, "firptaWithholdingUsd": 0},
        "hasPERaw": False, "salaryInr": 0,
        "treatyElectionsRaw": [], "treatyTrcStatus": False, "treatyForm10fFiled": False, "treatyIndiaResidenceRaw": "none",
        "treatyUsResidenceRaw": "none", "treatyDtaaForcedNrRaw": False, "isEntityTaxpayer": False,
        "carryForwardLossesMetaRaw": {"hasBroughtForwardLosses": False, "businessLossCfCount": 0, "speculativeLossCfCount": 0, "stcgLossCfCount": 0, "ltcgLossCfCount": 0, "housePropertyLossCfCount": 0, "unabsorbedDepreciationCf": 0},
        "equityCompResult": {"hasUsEquityComp": False, "esopPerquisiteInr": 0, "isoExerciseCount": 0},
        "usStateTaxResult": None, "aggregatePeakUsdResult": {"usd": 0},
        "limitsRawExtra": {"lrsRemittedInr": 0, "trumpAccountsOpened": False},
        "usEntityKind": "individual", "treatyFiles1040nrRaw": False, "s6013hElection": False,
        "indiaStatusRaw": None, "indiaDomesticStatusDerived": None, "indiaEntityKindRaw": "individual",
        "usStatusRaw": None, "usEntityKindRaw": "individual", "usIsCitizenRaw": False, "usHasGreenCardRaw": False,
        "usDaysCurrentYearRaw": 0, "usSptMetRaw": None, "usIncorporatedInUsRaw": None,
        "in1ShouldFire": False, "us1ShouldFire": False, "us5ShouldFire": False,
        "scheduleFaInconsistentTrigger": False, "xb7ShouldFire": False,
    }
    d.update(overrides)
    return d


def test_checks_registry_passes_clean_pan_check():
    d = _checks_dep_bag()
    out = checks_registry.NODES["checksRegistryResult"].compute(d, {})
    ids = {c["id"] for c in out}
    assert "pan_not_linked_aadhaar" in ids
    assert "amt_applies" in ids
    assert "dual_residency" in ids


def test_checks_registry_never_emits_a_passed_entry_for_a_fired_finding():
    d = _checks_dep_bag(findingsAllResult=[_finding("pan_not_linked_aadhaar")], panAadhaarLinkedRaw=False)
    out = checks_registry.NODES["checksRegistryResult"].compute(d, {})
    assert "pan_not_linked_aadhaar" not in {c["id"] for c in out}


def test_checks_registry_skips_pan_check_when_pan_not_linked():
    d = _checks_dep_bag(panAadhaarLinkedRaw=False)
    out = checks_registry.NODES["checksRegistryResult"].compute(d, {})
    assert "pan_not_linked_aadhaar" not in {c["id"] for c in out}
