"""checksRegistryResult (CL-1) — the "checks-run registry": for every
finding gate in the DAG, an explicit `passed` record when the condition was
evaluated and came back clean, so a professional can tell "checked, found
nothing" apart from "never evaluated." Port of
prototypes/graph-pilot/checks-registry-nodes.js.

DAG-only, no engine equivalent (see the JS source's own header — the
production `archive/engine-frozen/` never gets this field). Re-evaluates
each finding's own gate ONCE more, inverted — reads the SAME already-
computed values every india/us/crossborder findings.py node already reads;
adds zero new raw leaves.

Like reports/assembly.py, this module's `build(base)` only registers its
own node and trusts `base` already carries every dependency listed below —
composing india/findings.py + us/findings.py + crossborder/findings.py +
filings/limits.py into ONE shared registry without duplicate-registering
their common aggregate_india_income/aggregate_us_income base is
`core.registry.build_full_registry()`'s job (Phase 7). Verified here via a
synthetic-dep-bag unit test (tests/test_checks_registry.py).

Scope, deliberately (matches the JS source's own documented scope
decision): a finding that is purely informational and effectively ALWAYS
shows whenever its topic is relevant (`tax_year_mismatch`, `fx_basis`,
`form67_required`, `dtaa_treaty_elections`'s disclosure branch,
`dual_residency_resolved`, `nra_fdap_flat_rate`, the "in use, within cap"
Trump Account branch) isn't included — there's no missing negative-space
signal to fill in for those.
"""
from __future__ import annotations

from ..core.constants import LIMITS
from ..core.graph import NodeDef
from ..core.util import format_usd


def _checks_registry_result(d, ctx):
    fired = {f["id"] for f in (d["findingsAllResult"] or [])}
    checks = []

    def pass_(id_: str, category: str, label: str, detail: str) -> None:
        # Defensive dedup — belt to the suspenders of each check below being
        # the literal inverse of its finding's own gate.
        if id_ in fired:
            return
        checks.append({"id": id_, "category": category, "status": "passed", "label": label, "detail": detail})

    # ---- A: findings-nodes.js -------------------------------------------
    if d["panAadhaarLinkedRaw"] is True:
        pass_("pan_not_linked_aadhaar", "document", "PAN-Aadhaar linked", "PAN is on file as linked to Aadhaar — not inoperative, no s.397(2) higher-TDS override.")
    ftc = d["ftcResult"]
    if d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"]:
        if ftc["us"]["residualDoubleTaxUsd"] <= 1 and not (ftc["us"]["indiaTaxPaidUsd"] > 0 and ftc["us"]["ftcAllowedUsd"] > 0):
            pass_("ftc_gap", "credit", "No FTC shortfall", "No residual double taxation this year — either no Indian tax paid, or the Foreign Tax Credit fully absorbed it within the §904 limitation.")
    if d["usTaxResult"]["amtUsd"] <= 0:
        pass_("amt_applies", "credit", "No AMT exposure", "Tentative minimum tax does not exceed the regular US tax — Form 6251 AMT adds nothing this year.")
    if d["indiaIsCompany"]:
        if not (d["indiaIsIndianCompanyRaw"] is False and d["residencyResult"]["india"]["status"] == "ROR"):
            pass_("entity_dual_residency_poem", "treaty", "No entity-level dual residency", "This company is either Indian-incorporated, or its POEM facts don't resolve it to Indian tax residency — no entity-level Article 4(3) issue.")
    if not d["residencyResult"]["dualResident"]:
        pass_("dual_residency", "treaty", "No dual tax residency", "The taxpayer is resident in at most one of India/US this year — no Article 4 tie-break needed.")

    # ---- B: findings-batch2-nodes.js -------------------------------------
    if d["hasIndiaScopeXbr"] and d["hasUsScopeBoundaryFtc"]:
        recon = d["crossBasisResult"]
        dt_row_count = sum(1 for r in ((recon or {}).get("rows") or []) if r.get("doublyTaxed"))
        if dt_row_count == 0:
            pass_("cross_basis_summary", "income", "No cross-basis double-taxed income heads", "No income head is currently taxed under both India's and the US's codes for the same amount — nothing for the FTC/§159 relief to resolve.")
    if d["indiaItrFormResult"] and d["indiaItrFormResult"].get("matchesFrontend") is not False:
        pass_("india_itr_form_mismatch", "document", "ITR form determination agrees with Layer 1", "WISING's independent eligibility check and Layer 1's own frontend recommendation land on the same ITR form.")
    if (d["specialRate115bbInr"] or 0) <= 1:
        pass_("special_rate_gaming_winnings", "income", "No s.128/194 lottery/gaming winnings", "No flat-30% lottery/gaming/betting winnings on file this year.")
    if (d["unexplained115bbeInrAgg"] or 0) <= 0:
        pass_("s115bbe_unexplained_income", "income", "No unexplained income (s.195)", "No income is recorded as unexplained under s.195 — the flat ~39% no-deduction regime doesn't apply.")
    if d["chapterXiiaElectedRaw"]:
        xiia_holding_count = d["capitalGainsComputation"].get("chapterXiiaSfeaHoldingCount") or 0
        xiia_inv_income_inr = d["capitalGainsComputation"].get("chapterXiiaInvestmentIncomeInr") or 0
        if xiia_holding_count > 0 and xiia_inv_income_inr >= 1:
            pass_("chapter_xiia_elected_no_holdings", "credit", "Chapter XII-A holdings correctly flagged", f"{xiia_holding_count} specified-foreign-exchange-asset holding(s) on file with investment income entered — the election has real holdings and income behind it.")
    else:
        pass_("chapter_xiia_elected_no_holdings", "credit", "Chapter XII-A not elected", "No Chapter XII-A election is on file — the s.217/212 flat-rate NRI regime doesn't apply this year.")

    # ---- C: findings-batch3-nodes.js -------------------------------------
    if d["taxRegime"] == "OLD" and not d["indiaIsCompany"] and not d["indiaIsFirm"] and not d["indiaIsAop"] and not d["indiaIsTrust"]:
        if not ((d["businessComputation"]["businessInr"] or 0) > 0):
            pass_("form_10iea", "document", "Form 10-IEA not required", "Old regime elected, but no business/professional income on file — a salaried/other-income-only filer can choose the old regime on the ITR itself, no Form 10-IEA needed.")
    res = d["residencyResult"]
    if d["hasUsScopeBoundaryFtc"]:
        mf_count = sum(1 for t in (d["indiaFinancialHoldingsTxRaw"] or []) if t.get("asset_type") and "mutual_fund" in str(t["asset_type"]).lower())
        if res["us"]["isResident"] and mf_count == 0:
            pass_("pfic", "entity", "No PFIC exposure", "No Indian mutual fund / ETF holdings on file for this US person — no §1291/Form 8621 exposure.")
        biz_count = len(d["bizEntriesAgg"] or [])
        if res["us"]["isResident"] and not d["viaForeignCorpXbr4"] and biz_count == 0:
            pass_("cfc", "entity", "No CFC exposure", "No foreign-corporation ownership on file for this US person — no Form 5471/GILTI/Subpart F exposure.")
        if not d["viaForeignCorpXbr4"]:
            pass_("transfer_pricing", "document", "No related-party cross-border ownership on file", "No ≥10% cross-border related-entity ownership link on file — s.92-92F/§482 transfer-pricing documentation isn't triggered.")
        if not ((d["epfInrRaw"] > 0 or d["ppfInrRaw"] > 0 or d["npsInrRaw"] > 0) and res["us"]["isResident"]):
            pass_("retirement_mismatch", "retirement", "No India-retirement-account US-mismatch exposure", "Either no EPF/PPF/NPS on file, or this taxpayer isn't a US resident — the India-vs-US retirement-account characterization mismatch doesn't arise.")
        deemed_div_inr = d["capitalGainsComputation"].get("deemedDividendInr") or 0
        if not (deemed_div_inr / 83.0 > 1 and res["us"]["worldwide"]):
            pass_("deemed_dividend_buyback_mismatch", "income", "No deemed-dividend buyback mismatch", "No Oct 2024-Mar 2026 s.2(40)(f) buyback deemed-dividend on file (or no US worldwide exposure) — no India/US characterization mismatch to reconcile.")
        fg = d["foreignGiftsRaw"]
        if not fg["receivedAbove100k"] and not fg["isTrustBeneficiary"]:
            pass_("foreign_gift_3520", "document", "No Form 3520 trigger", "No foreign gift over $100,000 and no foreign-trust-beneficiary status on file — Form 3520 isn't triggered.")
        if not fg["receivedFromCoveredExpatriate"]:
            pass_("covered_expat_gift_tax", "credit", "No §2801 covered-expatriate gift exposure", "No gift/bequest from a covered expatriate on file.")
        se_tax_usd = d["usTaxResult"].get("seTaxUsd") or 0
        salary_usd = (d["salaryInr"] or 0) / 83.0
        business_usd = (d["businessComputation"]["businessInr"] or 0) / 83.0
        has_india_nexus = res["india"]["isResident"] or business_usd > 0 or salary_usd > 0
        if not (se_tax_usd > 1 and has_india_nexus):
            pass_("no_totalization_agreement", "credit", "No uncoordinated SE-tax double coverage this year", "No material US self-employment tax alongside India nexus this year — the missing US-India Totalization Agreement isn't in play.")
        niit_usd = d["usTaxResult"].get("niitUsd") or 0
        addl_med_usd = d["usTaxResult"].get("additionalMedicareUsd") or 0
        if not ((niit_usd > 1 or addl_med_usd > 1) and ftc["us"]["indiaTaxPaidUsd"] > 0):
            pass_("niit_medicare_not_creditable", "credit", "No non-creditable NIIT/Additional Medicare residue", "No material NIIT/Additional Medicare surtax alongside creditable Indian tax this year — nothing stranded outside the FTC mechanism.")
        if not d["nraRaw"]["usRealPropertyDisposed"]:
            pass_("firpta", "document", "No FIRPTA exposure", "No disposition of US real property by a foreign person on file.")
        if not (len(d["nraRaw"]["treatyRateClaims"] or []) > 0 and not d["nraRaw"]["submittedW8ben"]):
            pass_("nra_w8ben_missing", "treaty", "No unsupported treaty-rate claims", "Either no NRA treaty-rate claims are on file, or Form W-8BEN is already on file to support them.")
    has_state_ties = bool(d["stateResidencyRaw"]["primaryState"] or d["stateResidencyRaw"]["domicileDec31"] or d["stateResidencyRaw"]["domicileJan1"] or (d["stateResidencyRaw"]["footprint"] or []))
    if has_state_ties:
        has_federal_treaty_posture = res["dualResident"] or d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none" or d["treatyDtaaForcedNrRaw"]
        if not has_federal_treaty_posture:
            pass_("state_treaty_not_binding", "treaty", "No state-vs-federal-treaty gap to flag", "State residency ties are on file, but there's no federal treaty position for the state test to diverge from.")
    if d["hasPERaw"]:
        business_usd2 = (d["businessComputation"]["businessInr"] or 0) / 83.0
        if not (business_usd2 > 0):
            pass_("pe_article7", "treaty", "PE on file but no attributable business income yet", "A permanent establishment is on file, but no Indian business/professional income is recorded against it this year.")

    # ---- D: findings-batch4-nodes.js -------------------------------------
    claims_treaty = d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none" or \
        d["treatyDtaaForcedNrRaw"] or d["treatyFiles1040nrRaw"] or len(d["treatyElectionsRaw"] or []) > 0
    if claims_treaty and d["treatyTrcStatus"] and d["treatyForm10fFiled"]:
        pass_("treaty_docs_missing", "treaty", "Treaty documentation complete", "A treaty position is claimed, and both TRC and Form 41 are on file to support it.")
    cfl = d["carryForwardLossesMetaRaw"]
    cfl_count = cfl["businessLossCfCount"] + cfl["speculativeLossCfCount"] + cfl["stcgLossCfCount"] + cfl["ltcgLossCfCount"] + cfl["housePropertyLossCfCount"]
    if not d["isEntityTaxpayer"] and not (cfl["hasBroughtForwardLosses"] is True or cfl_count > 0 or cfl["unabsorbedDepreciationCf"] > 0):
        pass_("carry_forward_losses_not_applied", "credit", "No brought-forward losses on file", "No prior-year loss carry-forward is recorded — nothing to set off against this year's income.")

    # ---- E: findings-batch5-nodes.js -------------------------------------
    eq = d["equityCompResult"]
    if not (eq["hasUsEquityComp"] and eq["esopPerquisiteInr"] > 0):
        pass_("equity_comp_sourcing", "income", "No cross-border equity-compensation double-tax risk", "Either no US equity-comp event or no India ESOP/perquisite event is on file for the same year — no unapportioned dual-country taxation of the same award.")
    if eq["isoExerciseCount"] == 0:
        pass_("iso_3921", "document", "No ISO exercises on file", "No incentive-stock-option exercises this year — no Form 3921 to expect.")
    if d["usStateTaxResult"] and d["usStateTaxResult"]["totalTaxUsd"] <= 0:
        # DELIBERATE DAG/engine divergence, mirrors the JS source: distinguishes
        # a genuine no-income-tax state from a state whose bracket computation
        # happened to net to zero.
        detail = (
            f"{d['usStateTaxResult']['stateName']} has no individual income tax at all."
            if d["usStateTaxResult"]["noIncomeTax"] else
            f"State taxable income nets to zero or below at {d['usStateTaxResult']['stateName']}'s own rates after the standard deduction."
        )
        pass_("state_income_tax", "credit", f"{d['usStateTaxResult']['stateName']} state tax: none due", detail)
    if d["hasUsScopeBoundaryFtc"]:
        fbar_peak_usd = d["aggregatePeakUsdResult"]["usd"]
        if fbar_peak_usd < LIMITS["FBAR_AGGREGATE_USD"]:
            pass_("fbar_limit", "limit", "FBAR: not required", f"Aggregate peak balance across foreign accounts is {format_usd(fbar_peak_usd)} — below the {format_usd(LIMITS['FBAR_AGGREGATE_USD'])} reporting threshold.")
    if d["hasIndiaScopeXbr"]:
        lrs_remitted_usd = (d["limitsRawExtra"]["lrsRemittedInr"] or 0) / 83.0
        if lrs_remitted_usd < LIMITS["LRS_ANNUAL_USD"] * 0.8:
            pass_("lrs_limit", "limit", "LRS: well within annual cap", f"Outbound LRS remittances of {format_usd(lrs_remitted_usd)} are under 80% of the {format_usd(LIMITS['LRS_ANNUAL_USD'])} RBI annual cap.")

    # ---- F: findings-batch6-nodes.js --------------------------------------
    routes_away_from_individual = d["usEntityKind"] in ("ccorp", "scorp", "partnership", "trust") or (d["treatyFiles1040nrRaw"] and not d["s6013hElection"])
    if not routes_away_from_individual:
        mismatches = d["capitalGainsComputation"].get("holdingPeriodMismatches") or []
        if len(mismatches) == 0:
            pass_("holding_period_mismatch_", "treaty", "No LTCG/STCG holding-period mismatches", "No foreign capital gain on file where India's and the US's holding-period classifications (long-term vs. short-term) disagree.")

    # ---- G: residency-nodes.js (residencyConsistencyFindings) -------------
    if d["indiaStatusRaw"] is not None and d["indiaDomesticStatusDerived"] == d["indiaStatusRaw"]:
        india_mismatch_id = (
            "residency_status_mismatch_india_company" if d["indiaEntityKindRaw"] == "company" else
            "residency_status_mismatch_india" if d["indiaEntityKindRaw"] == "individual" else
            "residency_status_mismatch_india_entity"
        )
        pass_(india_mismatch_id, "residency", "India residency status matches derivation", "Re-deriving India's domestic residential status from the underlying raw facts reproduces the recorded final_india_residency_status exactly.")
    if d["usEntityKindRaw"] == "individual" and not d["usIsCitizenRaw"] and not d["usHasGreenCardRaw"]:
        understated = d["usDaysCurrentYearRaw"] >= 183 and d["usSptMetRaw"] is False
        overstated = d["usDaysCurrentYearRaw"] < 31 and d["usSptMetRaw"] is True
        if not understated and not overstated:
            pass_("residency_status_understated_us", "residency", "US Substantial Presence Test consistent", "Days-present and the recorded SPT-met flag are consistent with each other — no understatement or overstatement flag.")
    elif d["usEntityKindRaw"] and d["usEntityKindRaw"] != "individual":
        entity_consistent = (d["usIncorporatedInUsRaw"] is True and d["usStatusRaw"] == "DOMESTIC_ENTITY") or \
            (d["usIncorporatedInUsRaw"] is False and d["usStatusRaw"] != "DOMESTIC_ENTITY")
        if entity_consistent:
            pass_("residency_status_understated_us_entity", "residency", "US entity residency status consistent", "incorporated_in_us and the recorded final US entity status agree with each other.")

    # ---- H: report-batch5-nodes.js (5 standalone findings) -----------------
    if not d["in1ShouldFire"]:
        pass_("india_advance_tax_interest", "credit", "No advance-tax interest exposure", "Advance tax paid meets the assessed-tax threshold this year — no ss.424/425 interest.")
    if not d["us1ShouldFire"]:
        pass_("underpayment_2210", "credit", "No estimated-tax underpayment penalty", "Withholding + estimated payments clear a Form 2210 safe harbor (or the balance due is under the $1,000 de minimis).")
    if not d["us5ShouldFire"]:
        pass_("early_withdrawal_penalty_72t", "credit", "No §72(t) early-withdrawal exposure", "No sub-59½ IRA/401(k) distribution on file this year.")
    if not d["scheduleFaInconsistentTrigger"]:
        pass_("schedule_fa_inconsistent", "document", "India/US forms agree on foreign assets", "No contradiction between the India form's foreign-assets answer and the US form's own holdings/income facts.")
    if not (d["scheduleFaInconsistentTrigger"] and d["xb7ShouldFire"]):
        pass_("black_money_act_exposure", "document", "No Black Money Act exposure flagged", "No undisclosed-foreign-asset fact pattern on file this year.")

    return checks


NODES = {
    "checksRegistryResult": NodeDef(
        deps=(
            "findingsAllResult",
            "panAadhaarLinkedRaw", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "ftcResult", "usTaxResult",
            "indiaIsCompany", "indiaIsIndianCompanyRaw", "residencyResult",
            "crossBasisResult", "indiaItrFormResult", "specialRate115bbInr", "unexplained115bbeInrAgg",
            "chapterXiiaElectedRaw",
            "taxRegime", "businessComputation", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "capitalGainsComputation",
            "stateResidencyRaw", "indiaFinancialHoldingsTxRaw", "viaForeignCorpXbr4", "bizEntriesAgg",
            "epfInrRaw", "ppfInrRaw", "npsInrRaw", "foreignGiftsRaw", "nraRaw", "hasPERaw",
            "salaryInr",
            "treatyElectionsRaw", "treatyTrcStatus", "treatyForm10fFiled", "treatyIndiaResidenceRaw",
            "treatyUsResidenceRaw", "treatyDtaaForcedNrRaw", "isEntityTaxpayer", "carryForwardLossesMetaRaw",
            "equityCompResult", "usStateTaxResult", "aggregatePeakUsdResult", "limitsRawExtra",
            "usEntityKind", "treatyFiles1040nrRaw", "s6013hElection",
            "indiaStatusRaw", "indiaDomesticStatusDerived", "indiaEntityKindRaw",
            "usStatusRaw", "usEntityKindRaw", "usIsCitizenRaw", "usHasGreenCardRaw",
            "usDaysCurrentYearRaw", "usSptMetRaw", "usIncorporatedInUsRaw",
            "in1ShouldFire", "us1ShouldFire", "us5ShouldFire", "scheduleFaInconsistentTrigger", "xb7ShouldFire",
        ),
        compute=_checks_registry_result,
    ),
}


def build(base):
    """Registers ONLY `checksRegistryResult` — see module docstring: the
    multi-domain composition `base` needs to already carry is a Phase 7
    (`build_full_registry()`) task."""
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
