"use strict";
/* ============================================================================
 * Closes the US mirror of the India tax-computation work: computeUsTax,
 * scoped the same way in1-nodes-v3.js was scoped for computeIndiaTax.
 *
 * EXPLICIT BOUNDARY, same discipline as the India side: aggregateUsIncome's
 * ENTIRE output (model.income.us.*) is read directly rather than
 * re-derived. That function's own real complexity — self-employment MACRS
 * depreciation (computeSelfEmploymentDepreciationPlan, the US-29 build
 * from earlier this session), K-1 passive-box aggregation across three
 * entity types (partnerships/S-corps/trusts, k1PassiveIncomeUsd) — is
 * genuinely separate, large machinery, the direct US analogue of India's
 * business.inr depreciation boundary. A future "close the
 * aggregateUsIncome boundary" phase would mirror the
 * aggregateindiaincome-nodes.js pass.
 *
 * GENUINELY PORTED here, read fresh from source: aggregateUsDeductions
 * (itemized figures + ISO AMT preference computation), computeSaltCap,
 * computeSsTaxableUsd (the full IRS Pub 915 Worksheet 1, transcribed
 * line-for-line in the real code), feieEligibility, bracketTax/
 * bracketBreakdown, and computeUsTax's entire body: AGI assembly
 * (ordinary + preferential + taxable SS + FEIE exclusion), Schedule SE,
 * standard-vs-itemized, OBBBA senior/tips/overtime deductions, QBI
 * (§199A, SSTB phase-out), ordinary + preferential-rate tax, AMT (§55,
 * parallel computation), NIIT (3.8%), additional Medicare, and every
 * credit (child/dependent care, AOTC, Lifetime Learning, CTC + refundable
 * ACTC).
 *
 * Scoped to the individual/resident path only, same as computeUsTax
 * itself routes — verified: only 1 of 11 real profiles is a US entity
 * (us_ccorp_indian_sub, ccorp -> computeUsEntityTax) and only 1 is NRA
 * (india_ror_us_income, files 1040-NR -> computeNraTax). Both are
 * reported, not asserted, in the runner — the same honest pattern as
 * entitytax-nodes.js on the India side.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/* SYS-1 closed 19 Jul 2026: these tables were hand-transcribed copies of
 * engine/constants.js (verified byte-identical by scratchpad check-const.js
 * before this swap). Now the SAME objects, imported — a Union Budget or IRS
 * revenue-procedure edit in constants.js propagates here automatically. */
var CONST = require("./constants.js").CONST;
var T = CONST.TAX.US;
var FEIE_MAX_USD = CONST.LIMITS.FEIE_MAX_USD;
var NIIT_THRESHOLD = CONST.LIMITS.NIIT_THRESHOLD;

function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break; }
  return tax;
}
function bracketBreakdown(amount, slabs) {
  var t = Math.max(0, amount), prev = 0, rows = [];
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { var taxable = Math.min(t, cap) - prev; rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate }); prev = cap; } else break; }
  return rows;
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
function feieEligibility(f) {
  f = f || {};
  var claimed = !!f.claimed || (f.amountClaimedUsd || 0) > 0;
  var home = String(f.taxHomeCountry || "").trim().toLowerCase();
  var taxHomeAbroad = home !== "" && home !== "us" && home !== "usa" && home !== "united states" && home !== "united states of america";
  var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
  var ppMet = !!f.physicalPresence && ppDaysOk;
  var bfMet = !!f.bonaFide;
  // reasons ported too (engine L767-775) — the result's feie block carries
  // them; previously dropped here because computeUsTax's own math never
  // reads them, which left feie.reasons undefined vs the engine's [].
  var reasons = [];
  if (claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
  if (claimed && !bfMet && !ppMet) {
    reasons.push(!f.physicalPresence && !f.bonaFide
      ? "neither the bona-fide-residence nor the physical-presence test is met"
      : (f.physicalPresence && !ppDaysOk
        ? (f.daysInUsTestPeriod + " US days in the test period — over the ~35-day allowance (330 full days abroad required)")
        : "bona-fide-residence test not met"));
  }
  return { claimed: claimed, amountClaimedUsd: f.amountClaimedUsd || 0, taxHomeAbroad: taxHomeAbroad, testMet: bfMet || ppMet, eligible: taxHomeAbroad && (bfMet || ppMet), reasons: reasons };
}

var NODES = {
  // ---- raw leaves for feie/filing status/entity gates ----------------------
  usEntityKind: { deps: [], compute: function (d, ctx) { return ctx.model.entity ? ctx.model.entity.usKind : "individual"; } },
  files1040nr: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "nra_specific.files_form_1040nr", false) === true; } },
  s6013hElection: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "nra_specific.s6013h_joint_election", false) === true; } },
  usFilingStatusRaw: {
    deps: [],
    compute: function (d, ctx) {
      var s = (safe(ctx.us, "profile.filing_status", "single") || "single").toLowerCase();
      if (s === "married_filing_jointly" || s === "mfj") return "mfj";
      if (s === "married_filing_separately" || s === "mfs") return "mfs";
      if (s === "head_of_household" || s === "hoh") return "hoh";
      return "single";
    }
  },
  worldwideUs: { deps: [], compute: function (d, ctx) { return !!(ctx.computed.residency && ctx.computed.residency.us && ctx.computed.residency.us.worldwide); } },
  feieRaw: {
    deps: [],
    compute: function (d, ctx) {
      return {
        claimed: safe(ctx.us, "foreign_earned_income.claims_feie", false) === true,
        amountClaimedUsd: num(safe(ctx.us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        taxHomeCountry: safe(ctx.us, "foreign_earned_income.tax_home_country", ""),
        bonaFide: safe(ctx.us, "foreign_earned_income.bona_fide_residence", false) === true,
        physicalPresence: safe(ctx.us, "foreign_earned_income.physical_presence", false) === true,
        daysInUsTestPeriod: num(safe(ctx.us, "foreign_earned_income.days_in_us_during_test_period", 0))
      };
    }
  },
  feie: { deps: ["feieRaw"], compute: function (d) { return feieEligibility(d.feieRaw); } },

  // ---- EXPLICIT BOUNDARY: aggregateUsIncome's entire output ----------------
  incUs: { deps: [], compute: function (d, ctx) { return ctx.model.income.us; } },

  // ---- aggregateUsDeductions, ported exactly --------------------------------
  dedUs: {
    deps: [],
    compute: function (d, ctx) {
      var us = ctx.us;
      var it = safe(us, "itemized_deductions_and_credits", {});
      var isoAmtPrefUsd = 0;
      (safe(us, "equity_compensation.iso_exercises", []) || []).forEach(function (ex) {
        isoAmtPrefUsd += num(ex.amt_preference_spread_usd != null ? ex.amt_preference_spread_usd : Math.max(0, (num(ex.fmv_at_exercise_usd) - num(ex.strike_price_usd)) * num(ex.shares_exercised)));
      });
      return {
        mode: safe(it, "use_standard_or_itemized", "auto"),
        salt: num(safe(it, "state_and_local_taxes_paid_usd", 0)),
        mortgageInterest: num(safe(it, "mortgage_interest_paid_usd", 0)),
        charitable: num(safe(it, "charitable_contributions_cash_usd", 0)) + num(safe(it, "charitable_contributions_appreciated_usd", 0)),
        medical: num(safe(it, "medical_expenses_usd", 0)),
        studentLoanInterest: num(safe(it, "student_loan_interest_usd", 0)),
        isoAmtPrefUsd: isoAmtPrefUsd,
        amtPrefs: num(safe(us, "amt_inputs.private_activity_bond_interest_usd", 0)) + num(safe(it, "private_activity_bond_interest_usd", 0)) +
          num(safe(it, "amt_preference_spread_usd", 0)) + num(safe(us, "amt.private_activity_bond_interest_usd", 0)) +
          num(safe(us, "amt.amt_preference_spread_usd", 0)) + num(safe(us, "amt_items_usd", 0)) + isoAmtPrefUsd,
        careExpenses: num(safe(it, "child_and_dependent_care_expenses_usd", 0)) || num(safe(it, "dependent_care_expenses_usd", 0)),
        aotc: num(safe(it, "education_credits_aotc_usd", 0)), lifetimeLearning: num(safe(it, "education_credits_llc_usd", 0)),
        dependents: num(safe(us, "profile.dependents_count", 0)) || num(safe(it, "dependents_count", 0)),
        seHealthInsuranceDeductionUsd: num(safe(us, "income_us_source.se_health_insurance_deduction_usd", 0)),
        seRetirementDeductionUsd: num(safe(us, "income_us_source.se_retirement_deduction_usd", 0))
      };
    }
  },
  additionalMedicareOwedBoundary: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.additional_medicare_tax_owed_usd", 0)); } },
  taxpayerDobRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null))); } },
  baseYearUs: { deps: [], compute: function (d, ctx) { return ctx.model.meta.baseYear; } },

  // ---- computeUsTax, ported in full (individual/resident path) -------------
  usTaxResult: {
    deps: ["incUs", "dedUs", "usFilingStatusRaw", "worldwideUs", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs"],
    compute: function (d) {
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
      var fStcg = worldwide ? inc.foreignStcg.usd : 0, fLtcg = worldwide ? inc.foreignLtcg.usd : 0;

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
      var ordinaryBracketBreakdown = bracketBreakdown(ordTaxable, brackets);

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

      return {
        agiUsd: agi, taxableIncomeUsd: taxableIncome, incomeTaxUsd: incomeTax, niitUsd: niit,
        additionalMedicareUsd: addlMedicare, seTaxUsd: seTax, qbiDeductionUsd: qbiDeduction, amtUsd: amtOwed,
        creditsUsd: creditsUsd, totalTaxBeforeFtcUsd: totalTaxBeforeFtc,
        deductionUsd: deduction, deductionMode: usedMode,
        // Added for XBR-2 (ftc-nodes.js wiring) — mirrors the same four
        // fields computeUsTax's own result carries for computeFtc's benefit:
        // totalIncomeUsd (engine L1046), usSourceIncomeUsd (= inc.usSourceTotal
        // .usd, engine L1101), the FEIE amount actually applied (engine's
        // usTax.feie.appliedUsd, flat here), and the worldwide flag.
        totalIncomeUsd: totalIncome, usSourceIncomeUsd: inc.usSourceTotal.usd,
        feieAppliedUsd: feieAppliedUsd, worldwide: worldwide,
        // Added for CFL-7 (buildFtcReport's trace detail) — the ordinary/
        // preferential split computeUsTax's own result carries (engine
        // L289: incomeTax = ordinaryTax + preferentialTax) but this node
        // didn't expose separately until now; incomeTaxUsd above remains
        // their sum, unchanged.
        ordinaryTaxUsd: ordinaryTax, preferentialTaxUsd: preferentialTax,
        // Added for CFL-7 (buildTaxComputation) — every one of these is
        // already computed above as a local variable; this just exposes
        // them, matching the real computeUsTax's own return shape exactly
        // (computation.js:1043-1116) field-for-field. No new logic.
        filingStatus: status,
        ordinaryIncomeUsd: ordinaryIncome, preferentialIncomeUsd: preferentialIncome,
        saltCapUsd: saltCapUsd,
        socialSecurityDetail: {
          grossUsd: grossSsUsd, taxableUsd: taxableSsUsd,
          taxablePct: grossSsUsd > 0 ? taxableSsUsd / grossSsUsd : 0,
          provisionalIncomeUsd: ordinaryIncomeExclSs + preferentialIncome + 0.5 * grossSsUsd + taxExemptInterestUsd,
          baseThresholdUsd: T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single,
          additionalThresholdUsd: T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single
        },
        seniorDeductionUsd: seniorDeductionUsd,
        seniorDetail: { age: taxpayerAge, isSenior: isSenior, fullAmountUsd: T.SENIOR_DEDUCTION_PER_PERSON_USD, phaseoutThresholdUsd: seniorPhaseoutThr },
        tipsDeductionUsd: tipsDeductionUsd,
        overtimeDeductionUsd: overtimeDeductionUsd,
        tipsOvertimeDetail: {
          isMfs: isMfs, qualifiedTipsUsd: qualifiedTipsUsd, qualifiedOvertimeUsd: qualifiedOvertimeUsd,
          tipsMaxUsd: T.TIPS_DEDUCTION_MAX_USD, overtimeMaxUsd: overtimeMaxUsd,
          phaseoutThresholdUsd: tipsOtPhaseoutThr, phaseoutReductionUsd: tipsOtPhaseoutReduction
        },
        ordinaryTaxableUsd: ordTaxable, ordinaryBracketBreakdown: ordinaryBracketBreakdown,
        amtDetail: {
          amtiUsd: amtiUsd, addbackUsd: amtAddback, exemptionFullUsd: amtExFull, exemptionUsd: amtExemption,
          amtBaseUsd: amtBase, preferentialInBaseUsd: prefTaxable, ordinaryAmtBaseUsd: amtOrdBase,
          tmtOrdUsd: tmtOrd, tmtUsd: tmtOrd + preferentialTax, regularTaxUsd: incomeTax
        },
        otherCreditsUsd: otherCreditsUsd,
        ctcDetail: {
          numChildren: numChildrenForCtc, maxTotalUsd: ctcMaxTotalUsd, phaseoutReductionUsd: ctcPhaseoutReductionUsd,
          availableUsd: ctcAvailableUsd, nonRefundableUsd: ctcNonRefundableUsd, refundableUsd: ctcRefundableUsd,
          earnedIncomeUsd: earnedIncomeUsd
        },
        foreignSourceIncomeUsd: fW + fSE + fI + fD + fR + fP + fStcg + fLtcg,
        retirementEpfInterestUsd: worldwide ? (inc.retirementEpfInterestUsd || 0) : 0,
        retirementNpsWithdrawalUsd: worldwide ? (inc.retirementNpsWithdrawalUsd || 0) : 0,
        niitDetail: {
          netInvestmentIncomeUsd: netInvestmentIncome, magiUsd: magi, thresholdUsd: niitThreshold,
          excessUsd: Math.max(0, Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold))),
          rate: T.NIIT_RATE
        },
        feie: {
          claimed: feie.claimed, eligible: feie.eligible, taxHomeAbroad: feie.taxHomeAbroad,
          testMet: feie.testMet, reasons: feie.reasons, appliedUsd: feieAppliedUsd
        },
        effectiveRate: totalIncome > 0 ? totalTaxBeforeFtc / totalIncome : 0
      };
    }
  },

  totalTaxBeforeFtcUsd: { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.totalTaxBeforeFtcUsd; } }
};

module.exports = { NODES: NODES };
