"""Correctness test for ftc.py's Direction-1 (US Form 1116) FTC gating —
hand-computed against the actual statutory mechanism, NOT against the
frozen-engine golden fixtures (a parity check would pass even if both sides
shared the same bug). Python port of run-ftc-correctness.js.

BUG, FIXED (29 Jul 2026): `zeroed` (ftc.py's _ftc_us_direction) used to read
only usIsNraBoundaryFtc / not hasUsScopeBoundaryFtc — whether the taxpayer
actually filed 1040-NR, or has no US scope at all. It did NOT look at
computed.usTax.worldwide.

A taxpayer can cede US worldwide taxation via TREATY POSITION ALONE
(residency.py's usCedes: treaty_us_residence_raw == "india"), with
worldwide=False, WHILE files_1040nr (and therefore usIsNraBoundaryFtc)
stays False — they never filed as an NRA. Wherever compute_us_tax_core
reads worldwide, it will have already excluded India-source income from
the US taxable base for that person. _ftc_us_direction had no way to know
that happened — it only checked usIsNraBoundaryFtc — so it still treated
the full India income as "foreign-source income relative to a US base that
contains it," when the US base had already excluded it entirely. That let
Indian tax get credited against US tax that was never levied on that
income at all.

Fix: a new usWorldwideBoundaryFtc boundary (mirroring the pre-existing
indiaWorldwideBoundaryFtc), added as a third OR'd condition in `zeroed`.

Case below: a taxpayer whose US taxable base has already excluded their
$50,000 of India-source income (representing the usCedes=true path above),
who never filed 1040-NR. Correct FTC allowed is $0 -- there is no US tax
left on that income to credit against.
"""
from wising_dag.crossborder.ftc import _ftc_us_direction


def _close(a: float, b: float, tol: float = 1.0) -> bool:
    return abs(a - b) <= tol


def test_ftc_us_direction_zeroes_when_worldwide_ceded_without_1040nr():
    out = _ftc_us_direction({
        "feieExcludedUsdBoundaryFtc": 0,
        "usIsNraBoundaryFtc": False,       # never filed 1040-NR -- but worldwide can still be False (usCedes)
        "hasUsScopeBoundaryFtc": True,
        "usWorldwideBoundaryFtc": False,   # ceded via treaty position alone
        "indiaIncomeTotalUsdBoundaryFtc": 50000,
        "indiaPassiveIncomeUsdBoundaryFtc": 0,
        "indiaGeneralIncomeUsdBoundaryFtc": 50000,
        "usTaxableIncomeUsdBoundaryFtc": 100000,   # US base already excludes the $50,000 India income
        "usIncomeTaxUsdBoundaryFtc": 18000,
        "indiaTotalTaxUsdBoundaryFtc": 15000,
        "foreignWagesTaxPaidUsdBoundaryFtc": 0,
        "indiaSalaryOutsideIndiaUsdBoundaryFtc": 0,
        "otherCountryFtcEntriesRaw": [],
    }, None)
    assert _close(out["ftcAllowedUsd"], 0), f"ftcAllowedUsd should be $0, got {out['ftcAllowedUsd']}"


def test_ftc_us_direction_basket_separation_unaffected_by_the_gating_fix():
    # P=$60,000 passive, G=$10,000 general, usTaxableUsd=$50,000,
    # usIncomeTaxUsd=$8,000, India's blended tax on the $70,000 total =
    # $21,000 (30% effective rate, allocated proportionally -- $18,000 to
    # passive, $3,000 to general). Basket-separated: passive alone already
    # exceeds usTaxableUsd, so its own limitFraction caps at 1
    # (ftcLimit=$8,000, ftcAllowed=min($18,000,$8,000)=$8,000,
    # carryover=$10,000); general's limitFraction=0.2 (ftcLimit=$1,600,
    # ftcAllowed=min($3,000,$1,600)=$1,600, carryover=$1,400). Combined:
    # ftcAllowed=$9,600, carryover=$11,400.
    out = _ftc_us_direction({
        "feieExcludedUsdBoundaryFtc": 0,
        "usIsNraBoundaryFtc": False,
        "hasUsScopeBoundaryFtc": True,
        "usWorldwideBoundaryFtc": True,   # ordinary worldwide-taxed case -- this test is about baskets, not the gating fix
        "indiaIncomeTotalUsdBoundaryFtc": 70000,
        "indiaPassiveIncomeUsdBoundaryFtc": 60000,
        "indiaGeneralIncomeUsdBoundaryFtc": 10000,
        "usTaxableIncomeUsdBoundaryFtc": 50000,
        "usIncomeTaxUsdBoundaryFtc": 8000,
        "indiaTotalTaxUsdBoundaryFtc": 21000,
        "foreignWagesTaxPaidUsdBoundaryFtc": 0,
        "indiaSalaryOutsideIndiaUsdBoundaryFtc": 0,
        "otherCountryFtcEntriesRaw": [],
    }, None)
    assert _close(out["baskets"]["passive"]["ftcAllowedUsd"], 8000)
    assert _close(out["baskets"]["general"]["ftcAllowedUsd"], 1600)
    assert _close(out["ftcAllowedUsd"], 9600)
    assert _close(out["carryoverUsd"], 11400)


def test_ftc_us_direction_excludes_india_salary_for_us_performed_work():
    # India income $100,000, all salary (general basket); India tax $30,000.
    # usTaxableUsd=$200,000, usIncomeTaxUsd=$40,000. $40,000 of the salary
    # was earned for work performed in the US (salaryWorkLocation), so it is
    # US-source (IRC 861(a)(3)): out of the general basket, and India's tax
    # on it (30,000 x 40% = $12,000) is not creditable -- a DTAA Art. 16
    # India refund claim instead. General src = $60,000 -> limitFraction 0.3
    # -> ftcLimit $12,000; creditable tax $18,000 -> allowed $12,000,
    # carryover $6,000. (Without sourcing: limit $20,000, allowed $20,000.)
    out = _ftc_us_direction({
        "feieExcludedUsdBoundaryFtc": 0,
        "usIsNraBoundaryFtc": False,
        "hasUsScopeBoundaryFtc": True,
        "usWorldwideBoundaryFtc": True,
        "indiaIncomeTotalUsdBoundaryFtc": 100000,
        "indiaPassiveIncomeUsdBoundaryFtc": 0,
        "indiaGeneralIncomeUsdBoundaryFtc": 100000,
        "usTaxableIncomeUsdBoundaryFtc": 200000,
        "usIncomeTaxUsdBoundaryFtc": 40000,
        "indiaTotalTaxUsdBoundaryFtc": 30000,
        "foreignWagesTaxPaidUsdBoundaryFtc": 0,
        "indiaSalaryOutsideIndiaUsdBoundaryFtc": 40000,
        "otherCountryFtcEntriesRaw": [],
    }, None)
    assert _close(out["usWorkSalaryUsd"], 40000)
    assert _close(out["indiaTaxOnUsWorkSalaryUsd"], 12000)
    assert _close(out["baskets"]["general"]["foreignSourceIncomeUsd"], 60000)
    assert _close(out["ftcLimitUsd"], 12000)
    assert _close(out["ftcAllowedUsd"], 12000)
    assert _close(out["carryoverUsd"], 6000)


def test_ftc_us_direction_excludes_india_tax_on_ror_us_income():
    # India's tax base $150,000 = $100,000 India-source + $50,000 US income
    # India taxes an ROR on; India tax $45,000 -> $15,000 of it falls on the
    # US income (India's s.90 matter), so the US credit sees $30,000. Limit
    # 40,000 x 100/200 = $20,000; allowed $20,000; carryover $10,000.
    # Mirrored in run-ftc-correctness.js.
    out = _ftc_us_direction({
        "feieExcludedUsdBoundaryFtc": 0, "usIsNraBoundaryFtc": False, "hasUsScopeBoundaryFtc": True, "usWorldwideBoundaryFtc": True,
        "indiaIncomeTotalUsdBoundaryFtc": 100000, "indiaPassiveIncomeUsdBoundaryFtc": 0, "indiaGeneralIncomeUsdBoundaryFtc": 100000,
        "usTaxableIncomeUsdBoundaryFtc": 200000, "usIncomeTaxUsdBoundaryFtc": 40000, "indiaTotalTaxUsdBoundaryFtc": 45000,
        "foreignWagesTaxPaidUsdBoundaryFtc": 0, "indiaSalaryOutsideIndiaUsdBoundaryFtc": 0, "otherCountryFtcEntriesRaw": [],
        "usIncomeInIndiaUsdBoundaryFtc": 50000, "indiaTotalIncomeUsdBoundaryFtc": 150000,
    }, None)
    assert _close(out["indiaTaxPaidUsd"], 30000)
    assert _close(out["ftcAllowedUsd"], 20000)
    assert _close(out["carryoverUsd"], 10000)
