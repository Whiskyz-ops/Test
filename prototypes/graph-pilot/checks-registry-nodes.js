"use strict";
/* ============================================================================
 * CL-1 (docs/GAP_TRACKER.md, section F): the "checks-run registry."
 *
 * Every finding gate in this DAG (findings-nodes.js through
 * findings-batch6-nodes.js, residency-nodes.js, report-batch5-nodes.js's
 * five standalone findings) currently behaves the same way the engine's own
 * detectConflicts() does: when the condition evaluates false, the finding
 * simply never gets pushed — there is no record anywhere that the check
 * even ran. A professional running a known-answer test (a client whose
 * facts they already understand) can't tell "checked, genuinely clean"
 * apart from "never evaluated" — the worst possible answer to that test,
 * and, per GAP_TRACKER's own framing, a real malpractice-defense gap: this
 * is also the pro's workpaper trail that a check was actually performed.
 *
 * DELIBERATELY BUILT DAG-ONLY, PER EXPLICIT INSTRUCTION (20 Jul 2026): the
 * production engine (engine/*.js) is NOT touched by this file or anything
 * it depends on. This means the DAG is now, by design, feature-AHEAD of the
 * engine — monitor-next's "Engine" fallback mode will never show this
 * panel, only "DAG" mode will (checksRegistry is simply absent from
 * lib/wising.js's return shape). That's an intentional, accepted asymmetry,
 * not an oversight: see DAG_MIGRATION_TRACKER.md's CL-1 entry for the
 * reasoning (the DAG is now the default; new work lands there directly
 * instead of engine-first-then-port).
 *
 * Because there's no engine equivalent, run-fuzz.js's differential
 * comparison never reads this field at all (nothing to diverge against) —
 * verified separately by a NEW, DAG-internal-only harness, run-
 * checksregistry.js, whose one real invariant is: no finding ID may EVER
 * appear in both `findingsAllResult` (fired) and this registry's passed
 * list (checked-clean) on the same profile — the two are a strict
 * partition, never overlapping, checked programmatically, not by eye.
 *
 * Design, chosen specifically to avoid re-deriving (and risking drift from)
 * any of the ~60 existing finding conditions: this node reads the SAME
 * already-computed values every findings-batchN node already reads (zero
 * new raw leaves — every value here is already collected for some other,
 * already-verified purpose) and evaluates each check's condition ONCE more,
 * inverted. It does NOT touch, wrap, or modify a single existing findings
 * node — this file only adds a new node to the graph.
 *
 * Scope, deliberately: not literally all ~60 finding IDs are included below.
 * A finding that is purely informational and effectively ALWAYS shows
 * whenever its topic is relevant (tax_year_mismatch, fx_basis, form67_
 * required, dtaa_treaty_elections's disclosure branch, dual_residency_
 * resolved, nra_fdap_flat_rate, the "in use, within cap" Trump Account
 * branch) isn't a "silent pass" candidate at all — there's no missing
 * negative-space signal to fill in, since its absence already unambiguously
 * means "topic not relevant here," not "checked, found nothing." Only
 * gates where a real, meaningful "evaluated and came back clean" state
 * exists are included — the genuine CL-1 target.
 * ==========================================================================*/
var baseNodes = require("./assets-nodes.js").NODES;
var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }

NODES.checksRegistryResult = {
  deps: [
    "findingsAllResult",
    // A
    "panAadhaarLinkedRaw", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "ftcResult", "usTaxResult",
    "indiaIsCompany", "indiaIsIndianCompanyRaw", "residencyResult",
    // B
    "crossBasisResult", "indiaItrFormResult", "specialRate115bbInr", "unexplained115bbeInrAgg",
    "chapterXiiaElectedRaw",
    // C
    "taxRegime", "businessComputation", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "capitalGainsComputation",
    "stateResidencyRaw", "indiaFinancialHoldingsTxRaw", "viaForeignCorpXbr4", "bizEntriesAgg",
    "epfInrRaw", "ppfInrRaw", "npsInrRaw", "foreignGiftsRaw", "nraRaw", "hasPERaw",
    "salaryInr",
    // D
    "treatyElectionsRaw", "treatyTrcStatus", "treatyForm10fFiled", "treatyIndiaResidenceRaw",
    "treatyUsResidenceRaw", "treatyDtaaForcedNrRaw", "isEntityTaxpayer", "carryForwardLossesMetaRaw",
    // E
    "equityCompResult", "usStateTaxResult", "aggregatePeakUsdResult", "limitsRawExtra",
    // F
    "usEntityKind", "treatyFiles1040nrRaw", "s6013hElection",
    // G
    "indiaStatusRaw", "indiaDomesticStatusDerived", "indiaEntityKindRaw",
    "usStatusRaw", "usEntityKindRaw", "usIsCitizenRaw", "usHasGreenCardRaw",
    "usDaysCurrentYearRaw", "usSptMetRaw", "usIncorporatedInUsRaw",
    // H
    "in1ShouldFire", "us1ShouldFire", "us5ShouldFire", "scheduleFaInconsistentTrigger", "xb7ShouldFire"
  ],
  compute: function (d) {
    var fired = {};
    (d.findingsAllResult || []).forEach(function (f) { fired[f.id] = true; });
    var checks = [];
    // Never emits a passed entry for an ID that also fired this run — a
    // defensive dedup, not the primary correctness mechanism (each pass()
    // call below is written as the literal inverse of its finding's own
    // gate, so the two should never both be true by construction; this is
    // the belt to that suspenders).
    function pass(id, category, label, detail) {
      if (fired[id]) return;
      checks.push({ id: id, category: category, status: "passed", label: label, detail: detail });
    }

    // ---- A: findings-nodes.js -------------------------------------------
    if (d.panAadhaarLinkedRaw === true) {
      pass("pan_not_linked_aadhaar", "document", "PAN-Aadhaar linked", "PAN is on file as linked to Aadhaar — not inoperative, no s.397(2) higher-TDS override.");
    }
    var ftc = d.ftcResult;
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc) {
      if (ftc.netUnrelievedDoubleTaxUsd <= 1 && !(ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0)) {
        pass("ftc_gap", "credit", "No FTC shortfall", "No residual double taxation this year — either no Indian tax paid, or the Foreign Tax Credit fully absorbed it within the §904 limitation.");
      }
    }
    if (d.usTaxResult.amtUsd <= 0) {
      pass("amt_applies", "credit", "No AMT exposure", "Tentative minimum tax does not exceed the regular US tax — Form 6251 AMT adds nothing this year.");
    }
    if (d.indiaIsCompany) {
      if (!(d.indiaIsIndianCompanyRaw === false && d.residencyResult.india.status === "ROR")) {
        pass("entity_dual_residency_poem", "treaty", "No entity-level dual residency", "This company is either Indian-incorporated, or its POEM facts don't resolve it to Indian tax residency — no entity-level Article 4(3) issue.");
      }
    }
    if (!d.residencyResult.dualResident) {
      pass("dual_residency", "treaty", "No dual tax residency", "The taxpayer is resident in at most one of India/US this year — no Article 4 tie-break needed.");
    }

    // ---- B: findings-batch2-nodes.js ------------------------------------
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc) {
      var recon = d.crossBasisResult;
      var dtRowCount = ((recon && recon.rows) || []).filter(function (r) { return r.doublyTaxed; }).length;
      if (dtRowCount === 0) {
        pass("cross_basis_summary", "income", "No cross-basis double-taxed income heads", "No income head is currently taxed under both India's and the US's codes for the same amount — nothing for the FTC/§159 relief to resolve.");
      }
    }
    if (d.indiaItrFormResult && d.indiaItrFormResult.matchesFrontend !== false) {
      pass("india_itr_form_mismatch", "document", "ITR form determination agrees with Layer 1", "WISING's independent eligibility check and Layer 1's own frontend recommendation land on the same ITR form.");
    }
    if ((d.specialRate115bbInr || 0) <= 1) {
      pass("special_rate_gaming_winnings", "income", "No s.128/194 lottery/gaming winnings", "No flat-30% lottery/gaming/betting winnings on file this year.");
    }
    if ((d.unexplained115bbeInrAgg || 0) <= 0) {
      pass("s115bbe_unexplained_income", "income", "No unexplained income (s.195)", "No income is recorded as unexplained under s.195 — the flat ~39% no-deduction regime doesn't apply.");
    }
    if (d.chapterXiiaElectedRaw) {
      var xiiaHoldingCount = d.capitalGainsComputation.chapterXiiaSfeaHoldingCount || 0;
      var xiiaInvIncomeInr = d.capitalGainsComputation.chapterXiiaInvestmentIncomeInr || 0;
      if (xiiaHoldingCount > 0 && xiiaInvIncomeInr >= 1) {
        pass("chapter_xiia_elected_no_holdings", "credit", "Chapter XII-A holdings correctly flagged", xiiaHoldingCount + " specified-foreign-exchange-asset holding(s) on file with investment income entered — the election has real holdings and income behind it.");
      }
    } else {
      pass("chapter_xiia_elected_no_holdings", "credit", "Chapter XII-A not elected", "No Chapter XII-A election is on file — the s.217/212 flat-rate NRI regime doesn't apply this year.");
    }

    // ---- C: findings-batch3-nodes.js ------------------------------------
    // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21
    // Jul 2026): widened to also exclude AOP/Trust — Form 10-IEA is an
    // individual/HUF election mechanism; an AOP/Trust wouldn't file it
    // either, same as a company/firm (see entitytax-nodes.js's file header).
    if (d.taxRegime === "OLD" && !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust) {
      if (!((d.businessComputation.businessInr || 0) > 0)) {
        pass("form_10iea", "document", "Form 10-IEA not required", "Old regime elected, but no business/professional income on file — a salaried/other-income-only filer can choose the old regime on the ITR itself, no Form 10-IEA needed.");
      }
    }
    var res = d.residencyResult;
    if (d.hasUsScopeBoundaryFtc) {
      var mfCount = (d.indiaFinancialHoldingsTxRaw || []).filter(function (t) { return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0; }).length;
      if (res.us.isResident && mfCount === 0) {
        pass("pfic", "entity", "No PFIC exposure", "No Indian mutual fund / ETF holdings on file for this US person — no §1291/Form 8621 exposure.");
      }
      var bizCount = (d.bizEntriesAgg || []).length;
      if (res.us.isResident && !d.viaForeignCorpXbr4 && bizCount === 0) {
        pass("cfc", "entity", "No CFC exposure", "No foreign-corporation ownership on file for this US person — no Form 5471/GILTI/Subpart F exposure.");
      }
      if (!d.viaForeignCorpXbr4) {
        pass("transfer_pricing", "document", "No related-party cross-border ownership on file", "No ≥10% cross-border related-entity ownership link on file — s.92-92F/§482 transfer-pricing documentation isn't triggered.");
      }
      if (!((d.epfInrRaw > 0 || d.ppfInrRaw > 0 || d.npsInrRaw > 0) && res.us.isResident)) {
        pass("retirement_mismatch", "retirement", "No India-retirement-account US-mismatch exposure", "Either no EPF/PPF/NPS on file, or this taxpayer isn't a US resident — the India-vs-US retirement-account characterization mismatch doesn't arise.");
      }
      var deemedDivInr = d.capitalGainsComputation.deemedDividendInr || 0;
      if (!(deemedDivInr / 83.0 > 1 && res.us.worldwide)) {
        pass("deemed_dividend_buyback_mismatch", "income", "No deemed-dividend buyback mismatch", "No Oct 2024-Mar 2026 s.2(40)(f) buyback deemed-dividend on file (or no US worldwide exposure) — no India/US characterization mismatch to reconcile.");
      }
      var fg = d.foreignGiftsRaw;
      if (!fg.receivedAbove100k && !fg.isTrustBeneficiary) {
        pass("foreign_gift_3520", "document", "No Form 3520 trigger", "No foreign gift over $100,000 and no foreign-trust-beneficiary status on file — Form 3520 isn't triggered.");
      }
      if (!fg.receivedFromCoveredExpatriate) {
        pass("covered_expat_gift_tax", "credit", "No §2801 covered-expatriate gift exposure", "No gift/bequest from a covered expatriate on file.");
      }
      var seTaxUsd = d.usTaxResult.seTaxUsd || 0;
      var salaryUsd = (d.salaryInr || 0) / 83.0;
      var businessUsd = (d.businessComputation.businessInr || 0) / 83.0;
      var hasIndiaNexus = res.india.isResident || businessUsd > 0 || salaryUsd > 0;
      if (!(seTaxUsd > 1 && hasIndiaNexus)) {
        pass("no_totalization_agreement", "credit", "No uncoordinated SE-tax double coverage this year", "No material US self-employment tax alongside India nexus this year — the missing US-India Totalization Agreement isn't in play.");
      }
      var niitUsd = d.usTaxResult.niitUsd || 0, addlMedUsd = d.usTaxResult.additionalMedicareUsd || 0;
      if (!((niitUsd > 1 || addlMedUsd > 1) && ftc.us.indiaTaxPaidUsd > 0)) {
        pass("niit_medicare_not_creditable", "credit", "No non-creditable NIIT/Additional Medicare residue", "No material NIIT/Additional Medicare surtax alongside creditable Indian tax this year — nothing stranded outside the FTC mechanism.");
      }
      if (!(d.nraRaw.usRealPropertyDisposed)) {
        pass("firpta", "document", "No FIRPTA exposure", "No disposition of US real property by a foreign person on file.");
      }
      if (!((d.nraRaw.treatyRateClaims || []).length > 0 && !d.nraRaw.submittedW8ben)) {
        pass("nra_w8ben_missing", "treaty", "No unsupported treaty-rate claims", "Either no NRA treaty-rate claims are on file, or Form W-8BEN is already on file to support them.");
      }
    }
    var hasStateTies = !!(d.stateResidencyRaw.primaryState || d.stateResidencyRaw.domicileDec31 || d.stateResidencyRaw.domicileJan1 || (d.stateResidencyRaw.footprint || []).length > 0);
    if (hasStateTies) {
      var hasFederalTreatyPosture = res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none" || d.treatyDtaaForcedNrRaw;
      if (!hasFederalTreatyPosture) {
        pass("state_treaty_not_binding", "treaty", "No state-vs-federal-treaty gap to flag", "State residency ties are on file, but there's no federal treaty position for the state test to diverge from.");
      }
    }
    if (d.hasPERaw) {
      var businessUsd2 = (d.businessComputation.businessInr || 0) / 83.0;
      if (!(businessUsd2 > 0)) {
        pass("pe_article7", "treaty", "PE on file but no attributable business income yet", "A permanent establishment is on file, but no Indian business/professional income is recorded against it this year.");
      }
    }

    // ---- D: findings-batch4-nodes.js -------------------------------------
    var claimsTreaty = d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none" ||
      d.treatyDtaaForcedNrRaw || d.treatyFiles1040nrRaw || (d.treatyElectionsRaw || []).length > 0;
    if (claimsTreaty && d.treatyTrcStatus && d.treatyForm10fFiled) {
      pass("treaty_docs_missing", "treaty", "Treaty documentation complete", "A treaty position is claimed, and both TRC and Form 41 are on file to support it.");
    }
    var cfl = d.carryForwardLossesMetaRaw;
    var cflCount = cfl.businessLossCfCount + cfl.speculativeLossCfCount + cfl.stcgLossCfCount + cfl.ltcgLossCfCount + cfl.housePropertyLossCfCount;
    if (!d.isEntityTaxpayer && !(cfl.hasBroughtForwardLosses === true || cflCount > 0 || cfl.unabsorbedDepreciationCf > 0)) {
      pass("carry_forward_losses_not_applied", "credit", "No brought-forward losses on file", "No prior-year loss carry-forward is recorded — nothing to set off against this year's income.");
    }

    // ---- E: findings-batch5-nodes.js -------------------------------------
    var eq = d.equityCompResult;
    if (!(eq.hasUsEquityComp && eq.esopPerquisiteInr > 0)) {
      pass("equity_comp_sourcing", "income", "No cross-border equity-compensation double-tax risk", "Either no US equity-comp event or no India ESOP/perquisite event is on file for the same year — no unapportioned dual-country taxation of the same award.");
    }
    if (eq.isoExerciseCount === 0) {
      pass("iso_3921", "document", "No ISO exercises on file", "No incentive-stock-option exercises this year — no Form 3921 to expect.");
    }
    if (d.usStateTaxResult && d.usStateTaxResult.totalTaxUsd <= 0) {
      pass("state_income_tax", "credit", d.usStateTaxResult.stateName + " state tax: none due", "State taxable income nets to zero or below at " + d.usStateTaxResult.stateName + "'s own rates after the standard deduction.");
    }
    if (d.hasUsScopeBoundaryFtc) {
      var LIM = require("../../engine/constants.js").CONST.LIMITS;
      var fbarPeakUsd = d.aggregatePeakUsdResult.usd;
      if (fbarPeakUsd < LIM.FBAR_AGGREGATE_USD) {
        pass("fbar_limit", "limit", "FBAR: not required", "Aggregate peak balance across foreign accounts is " + usd(fbarPeakUsd) + " — below the " + usd(LIM.FBAR_AGGREGATE_USD) + " reporting threshold.");
      }
    }
    if (d.hasIndiaScopeXbr) {
      var LIM2 = require("../../engine/constants.js").CONST.LIMITS;
      var lrsRemittedUsd = (d.limitsRawExtra.lrsRemittedInr || 0) / 83.0;
      if (lrsRemittedUsd < LIM2.LRS_ANNUAL_USD * 0.8) {
        pass("lrs_limit", "limit", "LRS: well within annual cap", "Outbound LRS remittances of " + usd(lrsRemittedUsd) + " are under 80% of the " + usd(LIM2.LRS_ANNUAL_USD) + " RBI annual cap.");
      }
    }

    // ---- F: findings-batch6-nodes.js --------------------------------------
    var routesAwayFromIndividual = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) >= 0 ||
      (d.treatyFiles1040nrRaw && !d.s6013hElection);
    if (!routesAwayFromIndividual) {
      var mismatches = (d.capitalGainsComputation.holdingPeriodMismatches || []);
      if (mismatches.length === 0) {
        pass("holding_period_mismatch_", "treaty", "No LTCG/STCG holding-period mismatches", "No foreign capital gain on file where India's and the US's holding-period classifications (long-term vs. short-term) disagree.");
      }
    }

    // ---- G: residency-nodes.js (residencyConsistencyFindings) -------------
    if (d.indiaStatusRaw != null && d.indiaDomesticStatusDerived === d.indiaStatusRaw) {
      var indiaMismatchId = d.indiaEntityKindRaw === "company" ? "residency_status_mismatch_india_company" :
        (d.indiaEntityKindRaw === "individual" ? "residency_status_mismatch_india" : "residency_status_mismatch_india_entity");
      pass(indiaMismatchId, "residency", "India residency status matches derivation", "Re-deriving India's domestic residential status from the underlying raw facts reproduces the recorded final_india_residency_status exactly.");
    }
    if (d.usEntityKindRaw === "individual" && !d.usIsCitizenRaw && !d.usHasGreenCardRaw) {
      var understated = d.usDaysCurrentYearRaw >= 183 && d.usSptMetRaw === false;
      var overstated = d.usDaysCurrentYearRaw < 31 && d.usSptMetRaw === true;
      if (!understated && !overstated) {
        pass("residency_status_understated_us", "residency", "US Substantial Presence Test consistent", "Days-present and the recorded SPT-met flag are consistent with each other — no understatement or overstatement flag.");
      }
    } else if (d.usEntityKindRaw && d.usEntityKindRaw !== "individual") {
      var entityConsistent = (d.usIncorporatedInUsRaw === true && d.usStatusRaw === "DOMESTIC_ENTITY") ||
        (d.usIncorporatedInUsRaw === false && d.usStatusRaw !== "DOMESTIC_ENTITY");
      if (entityConsistent) {
        pass("residency_status_understated_us_entity", "residency", "US entity residency status consistent", "incorporated_in_us and the recorded final US entity status agree with each other.");
      }
    }

    // ---- H: report-batch5-nodes.js (5 standalone findings) ----------------
    if (!d.in1ShouldFire) {
      pass("india_advance_tax_interest", "credit", "No advance-tax interest exposure", "Advance tax paid meets the assessed-tax threshold this year — no ss.424/425 interest.");
    }
    if (!d.us1ShouldFire) {
      pass("underpayment_2210", "credit", "No estimated-tax underpayment penalty", "Withholding + estimated payments clear a Form 2210 safe harbor (or the balance due is under the $1,000 de minimis).");
    }
    if (!d.us5ShouldFire) {
      pass("early_withdrawal_penalty_72t", "credit", "No §72(t) early-withdrawal exposure", "No sub-59½ IRA/401(k) distribution on file this year.");
    }
    if (!d.scheduleFaInconsistentTrigger) {
      pass("schedule_fa_inconsistent", "document", "India/US forms agree on foreign assets", "No contradiction between the India form's foreign-assets answer and the US form's own holdings/income facts.");
    }
    if (!(d.scheduleFaInconsistentTrigger && d.xb7ShouldFire)) {
      pass("black_money_act_exposure", "document", "No Black Money Act exposure flagged", "No undisclosed-foreign-asset fact pattern on file this year.");
    }

    return checks;
  }
};

module.exports = { NODES: NODES };
