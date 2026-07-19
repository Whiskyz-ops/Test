"use strict";
/* ============================================================================
 * CFL-6's last finding: holding_period_mismatch_ (dynamically suffixed per
 * mismatch, e.g. holding_period_mismatch_0, _1, ...).
 *
 * Structurally different from every other CFL-6 batch: not a new
 * derivation from already-available facts, but a genuine "what-if"
 * recompute — the engine's own version (conflicts.js:1271-1326) clones
 * `model`, overrides `income.us.foreignLtcg`/`foreignStcg` with the
 * mismatched transaction's gain added on top, and calls the REAL
 * `computeUsTax` twice (once per classification), diffing
 * `totalTaxBeforeFtcUsd`.
 *
 * ustax-nodes.js's usTaxResult node (TAX-5, closed, verified 81/81) is
 * ALREADY a pure function of one resolved-deps bag `d` — deps: incUs,
 * dedUs, usFilingStatusRaw, worldwideUs, feie, additionalMedicareOwed
 * Boundary, taxpayerDobRaw, baseYearUs — with zero further node resolution
 * inside its compute() body. That means the exact same computation can be
 * extracted into a standalone, PARAMETERIZED function (computeUsTaxCore
 * below — a byte-for-byte copy of usTaxResult's compute body, with two
 * added params folded in at the exact point the engine's clone-and-
 * override touches: fLtcg/fStcg) and called twice per mismatch using the
 * SAME already-resolved `d` bag — no need to re-run graph.resolve() a
 * second time with a different ctx, since d.incUs.foreignLtcg/foreignStcg
 * are themselves already a genuine from-scratch AGG-3 derivation (not a
 * ctx.model boundary read — us-full-nodes.js redefines incUs to
 * aggregateUsIncomeResult), matching the engine's semantics exactly:
 * override = base + mm.gainUsd, same as the engine's
 * `(base.foreignLtcg ? base.foreignLtcg.usd : 0) + mm.gainUsd`.
 *
 * Verified in run-findings6.js: exact dynamic-ID-set match (not just a
 * fixed list — mismatch count varies per profile) against
 * detectConflicts()'s real findings array for all 11 real profiles, plus
 * full detail-text comparison for every finding that DOES fire.
 * ==========================================================================*/
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

var findingsBatch5Nodes = require("./findings-batch5-nodes.js").NODES;
var NODES = {};
Object.keys(findingsBatch5Nodes).forEach(function (k) { NODES[k] = findingsBatch5Nodes[k]; });

// ---- computeUsTaxCore: byte-for-byte copy of ustax-nodes.js's usTaxResult
// compute() body (computation.js's computeUsTax, individual/resident path),
// parameterized with extraLtcgUsd/extraStcgUsd added at the exact point the
// engine's own clone-and-override touches (fLtcg/fStcg). Everything else is
// unchanged from the already-verified usTaxResult. -------------------------
/* SYS-1: verified-identical copies replaced by the shared import. */
var CONST_B6 = require("../../engine/constants.js").CONST;
var T = CONST_B6.TAX.US;
var FEIE_MAX_USD = CONST_B6.LIMITS.FEIE_MAX_USD;
var NIIT_THRESHOLD = CONST_B6.LIMITS.NIIT_THRESHOLD;

function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break; }
  return tax;
}
function computeSaltCap(agi, status) {
  var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
  var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
  var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
  return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
}
function computeSsTaxableUsd(grossSsUsd, otherAgiExclSs, taxExemptInterestUsd, status) {
  if (grossSsUsd <= 0) return 0;
  var baseAmt = T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single;
  var addlAmt = T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single;
  var line2 = 0.5 * grossSsUsd;
  var line5 = line2 + Math.max(0, otherAgiExclSs) + Math.max(0, taxExemptInterestUsd);
  var line7 = Math.max(0, line5 - baseAmt);
  if (line7 <= 0) return 0;
  var line8 = Math.max(0, addlAmt - baseAmt);
  var line9 = Math.min(line7, line8);
  var line10 = line7 - line9;
  var line11 = 0.5 * line9;
  var line12 = Math.min(line2, line11);
  var line13 = T.SS_TAXABLE_TIER2_RATE * line10;
  var line14 = line12 + line13;
  var line15 = T.SS_TAXABLE_TIER2_RATE * grossSsUsd;
  return Math.min(line14, line15);
}

function computeUsTaxCore(d, extraLtcgUsd, extraStcgUsd) {
  var inc = d.incUs, ded = d.dedUs, status = d.usFilingStatusRaw, worldwide = d.worldwideUs, feie = d.feie;
  var brackets = T.BRACKETS[status] || T.BRACKETS.single;

  var fW = worldwide ? inc.foreignWages.usd : 0;
  var fSE = worldwide ? inc.foreignSelfEmployment.usd : 0;
  var feieAppliedUsd = 0;
  if (worldwide && feie.claimed && feie.eligible && (fW + fSE) > 0) {
    var feieEarnedBaseUsd = fW + fSE;
    var feieBase = feie.amountClaimedUsd > 0 ? feie.amountClaimedUsd : feieEarnedBaseUsd;
    feieAppliedUsd = Math.min(feieEarnedBaseUsd, feieBase, FEIE_MAX_USD);
    var feieAppliedToWagesUsd = Math.min(fW, feieAppliedUsd);
    fW = fW - feieAppliedToWagesUsd;
    fSE = fSE - (feieAppliedUsd - feieAppliedToWagesUsd);
  }
  var fI = worldwide ? inc.foreignInterest.usd : 0, fD = worldwide ? inc.foreignDividends.usd : 0;
  var fR = worldwide ? inc.foreignRental.usd : 0, fP = worldwide ? inc.foreignPension.usd : 0;
  // Same "clone and override" the engine's withForeignCg does — the
  // mismatch gain is ADDED on top of whatever's already in foreignStcg/
  // foreignLtcg, not a replacement (conflicts.js:1294/1296).
  var fStcg = worldwide ? inc.foreignStcg.usd + (extraStcgUsd || 0) : 0;
  var fLtcg = worldwide ? inc.foreignLtcg.usd + (extraLtcgUsd || 0) : 0;

  var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);
  var ordinaryIncomeExclSs = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0) + inc.interestUs.usd + fI +
    nonQualDivUs + fD + inc.stcgUs.usd + fStcg + inc.rentalUs.usd + fR + fP +
    (inc.usRetirementIncomeExclSs ? inc.usRetirementIncomeExclSs.usd : (inc.usRetirementIncome ? inc.usRetirementIncome.usd : 0));
  var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;

  var grossSsUsd = (inc.socialSecurityUs && inc.socialSecurityUs.usd) || 0;
  var taxExemptInterestUsd = (inc.taxExemptInterestUs && inc.taxExemptInterestUs.usd) || 0;
  var taxableSsUsd = computeSsTaxableUsd(grossSsUsd, ordinaryIncomeExclSs + preferentialIncome, taxExemptInterestUsd, status);

  var ordinaryIncome = ordinaryIncomeExclSs + taxableSsUsd;
  var totalIncome = ordinaryIncome + preferentialIncome;

  var seNet = (inc.seEarningsUsd || 0) * T.SE_NET_FACTOR;
  var ssWagesAlready = inc.medicareWages || inc.wages.usd || 0;
  var ssBaseRemaining = Math.max(0, T.SS_WAGE_BASE_USD - ssWagesAlready);
  var seTax = seNet > 0 ? (T.SE_RATE_SS * Math.min(seNet, ssBaseRemaining) + T.SE_RATE_MEDICARE * seNet) : 0;
  var halfSeDeduction = seTax / 2;

  var seHealthDeduction = Math.min(ded.seHealthInsuranceDeductionUsd || 0, Math.max(0, seNet));
  var adjustments = Math.min(ded.studentLoanInterest, 2500) + halfSeDeduction + seHealthDeduction + (ded.seRetirementDeductionUsd || 0);
  var agi = Math.max(0, totalIncome - adjustments);

  var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
  var saltCapUsd = computeSaltCap(agi, status);
  var itemized = Math.min(ded.salt, saltCapUsd) + ded.mortgageInterest + ded.charitable + Math.max(0, ded.medical - 0.075 * agi);
  var deduction = ded.mode === "itemized" ? itemized : ded.mode === "standard" ? standard : Math.max(standard, itemized);

  var taxpayerAge = null;
  if (d.taxpayerDobRaw) { var dobYear = new Date(d.taxpayerDobRaw).getFullYear(); if (!isNaN(dobYear)) taxpayerAge = (d.baseYearUs || 2025) - dobYear; }
  var isSenior = taxpayerAge !== null && taxpayerAge >= T.SENIOR_DEDUCTION_MIN_AGE && status !== "mfs";
  var seniorPhaseoutThr = T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD[status] || T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD.single;
  var seniorDeductionUsd = isSenior ? Math.max(0, Math.round(T.SENIOR_DEDUCTION_PER_PERSON_USD - T.SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(0, agi - seniorPhaseoutThr))) : 0;

  var isMfs = status === "mfs";
  var tipsOtPhaseoutThr = T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD[status] || T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD.single;
  var tipsOtPhaseoutReduction = Math.ceil(Math.max(0, agi - tipsOtPhaseoutThr) / 1000) * T.TIPS_OVERTIME_PHASEOUT_PER_1000_USD;
  var qualifiedTipsUsd = isMfs ? 0 : (inc.qualifiedTipsUsd || 0);
  var qualifiedOvertimeUsd = isMfs ? 0 : (inc.qualifiedOvertimeUsd || 0);
  var tipsDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedTipsUsd, T.TIPS_DEDUCTION_MAX_USD) - tipsOtPhaseoutReduction));
  var overtimeMaxUsd = T.OVERTIME_DEDUCTION_MAX_USD[status] || T.OVERTIME_DEDUCTION_MAX_USD.single;
  var overtimeDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedOvertimeUsd, overtimeMaxUsd) - tipsOtPhaseoutReduction));

  var taxableBeforeQbi = Math.max(0, agi - deduction - seniorDeductionUsd - tipsDeductionUsd - overtimeDeductionUsd);

  var qbi = inc.qbiIncomeUsd || 0;
  var qbiThr = T.QBI_THRESHOLD[status] || T.QBI_THRESHOLD.single;
  var qbiPhase = T.QBI_PHASEIN[status] || T.QBI_PHASEIN.single;
  var qbiFrac = 1;
  if (inc.qbiIsSSTB) {
    if (taxableBeforeQbi >= qbiThr + qbiPhase) qbiFrac = 0;
    else if (taxableBeforeQbi > qbiThr) qbiFrac = 1 - (taxableBeforeQbi - qbiThr) / qbiPhase;
  }
  var qbiDeduction = T.QBI_RATE * qbi * qbiFrac;
  qbiDeduction = Math.max(0, Math.round(Math.min(qbiDeduction, T.QBI_RATE * Math.max(0, taxableBeforeQbi - preferentialIncome))));

  var taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction);
  var prefTaxable = Math.min(preferentialIncome, taxableIncome);
  var ordTaxable = taxableIncome - prefTaxable;

  var ordinaryTax = bracketTax(ordTaxable, brackets);

  var lb = T.LTCG_BRACKETS[status] || T.LTCG_BRACKETS.single;
  var start = ordTaxable;
  var amt0 = Math.max(0, Math.min(lb.br0 - start, prefTaxable));
  var remAfter0 = prefTaxable - amt0;
  var amt15 = Math.max(0, Math.min(lb.br15 - Math.max(start, lb.br0), remAfter0));
  var amt20 = remAfter0 - amt15;
  var preferentialTax = amt15 * 0.15 + amt20 * 0.20;

  var incomeTax = ordinaryTax + preferentialTax;

  var netInvestmentIncome = inc.interestUs.usd + fI + inc.ordinaryDividendsUs.usd + fD + inc.capitalGainsUs.usd + fStcg + fLtcg + inc.rentalUs.usd + fR;
  var niitThreshold = NIIT_THRESHOLD[status] || 200000;
  var niit = T.NIIT_RATE * Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold));

  var addlMedicare = d.additionalMedicareOwedBoundary;

  var usedMode = (ded.mode === "itemized" || ded.mode === "standard") ? ded.mode : (itemized > standard ? "itemized" : "standard");
  var amtAddback = usedMode === "standard" ? deduction : Math.min(ded.salt, saltCapUsd);
  var amtiUsd = Math.max(0, taxableIncome + amtAddback + (ded.amtPrefs || 0));
  var amtExFull = T.AMT_EXEMPTION[status] || T.AMT_EXEMPTION.single;
  var amtPhase = T.AMT_PHASEOUT[status] || T.AMT_PHASEOUT.single;
  var amtExemption = Math.max(0, amtExFull - T.AMT_PHASEOUT_RATE * Math.max(0, amtiUsd - amtPhase));
  var amtBase = Math.max(0, amtiUsd - amtExemption);
  var amtOrdBase = Math.max(0, amtBase - prefTaxable);
  var amtBrk = status === "mfs" ? T.AMT_RATE_BREAK / 2 : T.AMT_RATE_BREAK;
  var tmtOrd = amtOrdBase <= amtBrk ? amtOrdBase * T.AMT_RATE_LOW : amtBrk * T.AMT_RATE_LOW + (amtOrdBase - amtBrk) * T.AMT_RATE_HIGH;
  var amtOwed = Math.max(0, Math.round(tmtOrd + preferentialTax - incomeTax));

  var magi = agi;
  var eduLo = status === "mfj" ? 160000 : 80000, eduHi = status === "mfj" ? 180000 : 90000;
  var eduPhase = magi <= eduLo ? 1 : (magi >= eduHi ? 0 : 1 - (magi - eduLo) / (eduHi - eduLo));
  var careCap = (ded.dependents >= 2 ? 6000 : 3000);
  var childCareCredit = 0.20 * Math.min(ded.careExpenses || 0, careCap);
  var aotcCredit = Math.min(ded.aotc || 0, 2500 * Math.max(1, ded.dependents || 1)) * eduPhase;
  var llcCredit = Math.min(ded.lifetimeLearning || 0, 2000) * eduPhase;
  var otherCreditsUsd = Math.min(Math.round(childCareCredit + aotcCredit + llcCredit), Math.round(incomeTax));

  var numChildrenForCtc = ded.dependents || 0;
  var ctcPhaseoutThr = T.CTC_PHASEOUT_THRESHOLD_USD[status] || T.CTC_PHASEOUT_THRESHOLD_USD.single;
  var ctcMaxTotalUsd = T.CTC_PER_CHILD_USD * numChildrenForCtc;
  var ctcPhaseoutReductionUsd = Math.ceil(Math.max(0, agi - ctcPhaseoutThr) / 1000) * T.CTC_PHASEOUT_PER_1000_USD;
  var ctcAvailableUsd = Math.max(0, ctcMaxTotalUsd - ctcPhaseoutReductionUsd);
  var remainingTaxAfterOtherCredits = Math.max(0, Math.round(incomeTax) - otherCreditsUsd);
  var ctcNonRefundableUsd = Math.min(ctcAvailableUsd, remainingTaxAfterOtherCredits);
  var ctcUnusedUsd = ctcAvailableUsd - ctcNonRefundableUsd;
  var earnedIncomeUsd = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0);
  var actcCapUsd = Math.min(T.CTC_REFUNDABLE_MAX_PER_CHILD_USD * numChildrenForCtc, T.CTC_REFUNDABLE_RATE * Math.max(0, earnedIncomeUsd - T.CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD));
  var ctcRefundableUsd = Math.round(Math.max(0, Math.min(ctcUnusedUsd, actcCapUsd)));
  var creditsUsd = otherCreditsUsd + ctcNonRefundableUsd + ctcRefundableUsd;

  var totalTaxBeforeFtc = incomeTax + niit + addlMedicare + seTax + amtOwed - creditsUsd;

  return { totalTaxBeforeFtcUsd: totalTaxBeforeFtc };
}

// ---- the finding, ported in full --------------------------------------
NODES.holdingPeriodMismatchFindingsResult = {
  deps: ["capitalGainsComputation", "incUs", "dedUs", "usFilingStatusRaw", "worldwideUs", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs"],
  compute: function (d) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }
    var holdingMismatches = d.capitalGainsComputation.holdingPeriodMismatches || [];
    holdingMismatches.forEach(function (mm, mi) {
      var asLtcg = computeUsTaxCore(d, mm.gainUsd, 0);
      var asStcg = computeUsTaxCore(d, 0, mm.gainUsd);
      var deltaUsd = asStcg.totalTaxBeforeFtcUsd - asLtcg.totalTaxBeforeFtcUsd;
      if (Math.abs(deltaUsd) < 1) return;
      var correctIsLtcg = mm.usClassification === "ltcg";
      var assetLabel = mm.sourceType === "buyback" ? "buy-back" : "foreign equity holding";
      var ltcgSection = mm.isListed ? "s.198" : "s.197";
      add("holding_period_mismatch_" + mi, "warning", "treaty",
        mm.companyName + " " + assetLabel + ": " + Math.round(mm.monthsHeld) + " months held — India says " + mm.indiaClassification.toUpperCase() +
        ", US says " + mm.usClassification.toUpperCase() + " (" + usd(Math.abs(deltaUsd)) + " at stake)",
        "This " + (mm.isListed ? "listed" : "unlisted") + " " + assetLabel + " was held " + Math.round(mm.monthsHeld) + " months. India requires " +
        "more than " + mm.indiaThresholdMonths + " months for LTCG on " + (mm.isListed ? "listed" : "unlisted") + " shares, so this is " +
        mm.indiaClassification.toUpperCase() + " there (taxed " + (mm.indiaClassification === "ltcg" ? "at 12.5%, " + ltcgSection + (mm.isListed ? " (₹1,25,000 exemption pool)" : " (no exemption, taxable from ₹1)") : (mm.isListed ? "at 20%, s.196" : "at your India slab rate")) +
        "). The US requires only more than 12 months for LTCG on any asset — no listed/unlisted distinction — so the SAME gain is " +
        mm.usClassification.toUpperCase() + " under US rules. Recomputed your actual US return both ways: treated as LTCG, US tax is " +
        usd(asLtcg.totalTaxBeforeFtcUsd) + "; treated as STCG (ordinary rates), US tax is " + usd(asStcg.totalTaxBeforeFtcUsd) + " — a difference of " +
        usd(Math.abs(deltaUsd)) + ".",
        correctIsLtcg
          ? "Report this gain as LONG-TERM on the US return (Schedule D) even though it's short-term in India — using India's " +
            "label on the US foreign-capital-gains input would cost roughly " + usd(Math.abs(deltaUsd)) + " in overpaid US tax."
          : "Report this gain as SHORT-TERM on the US return even though it's long-term in India — using India's label on the US " +
            "foreign-capital-gains input would understate US tax by roughly " + usd(Math.abs(deltaUsd)) + ".",
        Math.abs(deltaUsd), ["Holding period", ltcgSection + " vs IRC §1222", mm.sourceType === "buyback" ? "Share buyback" : "Foreign equity"]);
    });
    return findings;
  }
};

module.exports = { NODES: NODES };
