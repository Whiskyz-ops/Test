"use strict";
/* ============================================================================
 * Phase 1, closing the LAST boundary: assessedTaxInrBoundary
 * (computed.indiaTax.totalTaxInr) — the full India tax computation.
 *
 * True scope, established by reading source before writing a line of graph
 * code (not assumed): aggregateIndiaIncome's capital-gains classification
 * (financial_holdings across 6+ asset groups, Chapter XII-A elections,
 * s.50AA debt-fund rules, buy-back timing, foreign-equity 24mo threshold)
 * is 800+ lines of separately-large, dense tax-law classification — a
 * genuinely different undertaking from "the tax computation" itself.
 * business.inr's EXACT depreciation-adjusted value needs
 * computeBusinessEntryNetProfitInr's regular-books branch (WDV
 * block-of-assets depreciation + disallowances) — also separate, large
 * machinery.
 *
 * SCOPING DECISION for this pass: genuinely close the TAX COMPUTATION
 * MACHINERY — computeLossSetOff, Chapter VI-A deductions, slab tax,
 * special-rate tax, §156 rebate, computeIndiaSurcharge, the s.69(2)(b)
 * promoter buy-back additional tax, and (for the real NR profiles in this
 * demo set) computeNrInterestTreatment/computeS115aStream — for
 * INDIVIDUAL and HUF taxpayers (computeIndiaEntityTax, the company/firm
 * rate schedule, is a separate function with its own MAT/115BAA/115BAB
 * logic, not attempted here). Every income-head figure that classification
 * work would produce (business.inr, businessDepreciationInr,
 * speculativeIncomeInr, stcg/ltcg/ltcg197Inr/stcgSlabInr/vdaGainInr/
 * chapterXiiaInvestmentIncomeInr/deemedDividendBuyback/promoterBuyback*,
 * otherSourcesMisc) is taken as an EXPLICIT boundary input, read straight
 * off the real model.income.india — genuinely exact values, just not
 * re-derived from raw fields in this pass. Salary/houseProperty/interest/
 * dividend/specialRate115bb ARE re-derived from raw fields — confirmed
 * simple, direct reads by checking source first.
 *
 * Verified against all 11 real profiles in run-in1-v3.js: exact parity on
 * computed.indiaTax.totalTaxInr for the 8 individual/HUF profiles;
 * explicitly NOT attempted for the 3 company profiles (india_pvt_ltd,
 * us_ccorp_indian_sub, foreign_holdco_poem_india) — computeIndiaEntityTax
 * stays a boundary for those, reported as such rather than silently
 * skipped.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/* Found by run-fuzz.js (randomized differential testing, 20 Jul 2026): the
 * "confirmed simple, direct reads" claim in the header above was wrong for
 * a taxpayer using Layer 1 India's quarterly entry mode. normalize.js's
 * indiaAnnualSlice (also independently re-derived in aggregateindiaincome-
 * nodes.js's annualSliceAgg, AGG-1) deep-sums india.quarters.Q1-Q4 into the
 * effective domestic_income/other_sources/capital_gains whenever
 * india.quarters is present — the top-level india.domestic_income/
 * other_sources objects become a stale, ignored snapshot at that point.
 * salaryInr/housePropertyInr/interestInr/dividendInr/specialRate115bbInr
 * below read the top-level objects directly, bypassing that merge — wrong
 * for ANY real quarterly-entry taxpayer whose top-level snapshot doesn't
 * exactly equal the true quarterly sum, not just a fuzzer artifact. None of
 * the 11 real profiles combine "quarters present" with a top-level/
 * quarterly-sum mismatch, which is exactly why no earlier fixture-based
 * check (run-in1-v3.js, run-india-tax-combined.js, audit:dag) ever caught
 * it — audit:dag's field-read diff only proves both sides read the same
 * field NAMES, not that they read them off the same effective object.
 * Same merge logic as indiaAnnualSlice/annualSliceAgg, duplicated locally
 * rather than depending on aggregateindiaincome-nodes.js — this file is
 * deliberately self-contained (see the file header's own reasoning for
 * businessComputation etc., same principle). */
function indiaAnnualSliceV3(india) {
  var quarters = safe(india, "quarters", null);
  if (!quarters) {
    return {
      domestic_income: safe(india, "domestic_income", {}),
      other_sources: safe(india, "other_sources", {})
    };
  }
  function merge(target, source) {
    for (var k in source) {
      if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
      var sv = source[k];
      if (sv === null || sv === undefined) continue;
      if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
      else if (typeof sv === "boolean") target[k] = target[k] || sv;
      else if (Array.isArray(sv)) {
        if (!Array.isArray(target[k])) target[k] = [];
        sv.forEach(function (el, i) {
          if (el && typeof el === "object") { target[k][i] = target[k][i] || {}; merge(target[k][i], el); }
          else if (target[k].indexOf(el) < 0) { target[k].push(el); }
        });
      } else if (typeof sv === "object") { target[k] = target[k] || {}; merge(target[k], sv); }
      else { target[k] = sv; }
    }
    return target;
  }
  var out = { domestic_income: {}, other_sources: {} };
  ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) {
    var qs = quarters[q]; if (!qs) return;
    if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
    if (qs.other_sources) merge(out.other_sources, qs.other_sources);
  });
  return out;
}

/* SYS-1 closed 19 Jul 2026: hand-copied tables replaced by the shared
 * import (verified byte-identical against CONST.TAX.INDIA by
 * check-const.js before the swap; S80DD/S80DDB caps were promoted INTO
 * constants.js from normalize.js-local literals in the same pass). */
var CONST = require("./constants.js").CONST;
var T = CONST.TAX.INDIA;
var S80DD_U_FLAT = CONST.TAX.INDIA.S80DD_U_FLAT_INR;
var S80DDB_CAP = CONST.TAX.INDIA.S80DDB_CAP_INR;
function s80eeaEeCapInr(sanctionDate) {
  if (!sanctionDate) return 0;
  var d = new Date(sanctionDate);
  if (isNaN(d.getTime())) return 0;
  if (d >= new Date("2016-04-01") && d <= new Date("2017-03-31")) return 50000;
  if (d >= new Date("2019-04-01") && d <= new Date("2022-03-31")) return 150000;
  return 0;
}
function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) {
    var cap = slabs[i][0], rate = slabs[i][1];
    if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break;
  }
  return tax;
}
function bracketBreakdown(amount, slabs) {
  var t = Math.max(0, amount), prev = 0, rows = [];
  for (var i = 0; i < slabs.length; i++) {
    var cap = slabs[i][0], rate = slabs[i][1];
    if (t > prev) { var taxable = Math.min(t, cap) - prev; rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate }); prev = cap; } else break;
  }
  return rows;
}
function computeIndiaSurcharge(taxBase, totalIncome, isNew, slabs, specialTax) {
  var rate = 0, threshold = 0;
  if (totalIncome > 50000000) { rate = isNew ? T.SURCHARGE_NEW_MAX : 0.37; threshold = 50000000; }
  else if (totalIncome > 20000000) { rate = 0.25; threshold = 20000000; }
  else if (totalIncome > 10000000) { rate = 0.15; threshold = 10000000; }
  else if (totalIncome > 5000000) { rate = 0.10; threshold = 5000000; }
  else return 0;
  var cappedRate = Math.min(rate, T.SURCHARGE_CG_DIV_CAP);
  var nonSpecialTax = Math.max(0, taxBase - specialTax);
  var surcharge = nonSpecialTax * rate + specialTax * cappedRate;
  var taxAtThreshold = bracketTax(threshold, slabs);
  var cap = taxAtThreshold + (totalIncome - threshold);
  if (taxBase + surcharge > cap) surcharge = Math.max(0, cap - taxBase);
  return surcharge;
}
function computeLossSetOff(cfl, buckets) {
  var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
  var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;
  var speculativeInr = Math.max(0, buckets.speculativeInr || 0);
  var stcgSlabInr = buckets.stcgSlabInr || 0;
  var ltcg197Inr = buckets.ltcg197Inr || 0;

  var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
  businessInr -= businessLossUsed;
  var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;

  var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
  housePropertyInr -= hpLossUsed;
  var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;

  var stcgLossAvail = cfl.stcgLossAvailableInr || 0;
  var stcgLossUsedVsStcgSlab = Math.min(stcgLossAvail, stcgSlabInr);
  stcgSlabInr -= stcgLossUsedVsStcgSlab;
  var stcgLossAfterSlab = stcgLossAvail - stcgLossUsedVsStcgSlab;
  var stcgLossUsedVsStcg = Math.min(stcgLossAfterSlab, stcgInr);
  stcgInr -= stcgLossUsedVsStcg;
  var stcgLossAfterFlat = stcgLossAfterSlab - stcgLossUsedVsStcg;
  var stcgLossUsedVsLtcg197 = Math.min(stcgLossAfterFlat, ltcg197Inr);
  ltcg197Inr -= stcgLossUsedVsLtcg197;
  var stcgLossAfterLtcg197 = stcgLossAfterFlat - stcgLossUsedVsLtcg197;
  var stcgLossUsedVsLtcg198 = Math.min(stcgLossAfterLtcg197, ltcgGrossInr);
  ltcgGrossInr -= stcgLossUsedVsLtcg198;
  var stcgLossUnused = stcgLossAfterLtcg197 - stcgLossUsedVsLtcg198;
  var stcgLossUsedVsLtcg = stcgLossUsedVsLtcg197 + stcgLossUsedVsLtcg198;

  var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
  var ltcgLossUsedVs197 = Math.min(ltcgLossAvail, ltcg197Inr);
  ltcg197Inr -= ltcgLossUsedVs197;
  var ltcgLossAfter197 = ltcgLossAvail - ltcgLossUsedVs197;
  var ltcgLossUsedVs198 = Math.min(ltcgLossAfter197, ltcgGrossInr);
  ltcgGrossInr -= ltcgLossUsedVs198;
  var ltcgLossUnused = ltcgLossAfter197 - ltcgLossUsedVs198;
  var ltcgLossUsed = ltcgLossUsedVs197 + ltcgLossUsedVs198;

  var speculativeLossAvail = cfl.speculativeLossAvailableInr || 0;
  var speculativeLossUsed = Math.min(speculativeLossAvail, speculativeInr);
  speculativeInr -= speculativeLossUsed;
  var speculativeLossUnused = speculativeLossAvail - speculativeLossUsed;

  var depRemaining = cfl.unabsorbedDepreciationCf || 0;
  var used;
  used = Math.min(depRemaining, businessInr); businessInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, housePropertyInr); housePropertyInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, stcgSlabInr); stcgSlabInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, stcgInr); stcgInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, ltcg197Inr); ltcg197Inr -= used; depRemaining -= used;
  used = Math.min(depRemaining, ltcgGrossInr); ltcgGrossInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, otherNormalInr); otherNormalInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, speculativeInr); speculativeInr -= used; depRemaining -= used;
  var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;

  var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcgSlab + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + speculativeLossUsed + depUsed;
  var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;

  return { businessInr: businessInr, housePropertyInr: housePropertyInr, otherNormalInr: otherNormalInr,
    stcgInr: stcgInr, stcgSlabInr: stcgSlabInr, ltcgGrossInr: ltcgGrossInr, ltcg197Inr: ltcg197Inr, speculativeInr: speculativeInr,
    totalUsedInr: totalUsedInr, totalUnusedInr: totalUnusedInr,
    unused: {
      businessInr: businessLossUnused, housePropertyInr: hpLossUnused,
      stcgInr: stcgLossUnused, ltcgInr: ltcgLossUnused,
      speculativeInr: speculativeLossUnused, unabsorbedDepreciationInr: depRemaining
    },
    used: {
      businessInr: businessLossUsed, housePropertyInr: hpLossUsed,
      stcgSlabInr: stcgLossUsedVsStcgSlab, stcgInr: stcgLossUsedVsStcg, ltcgFromStcgLossInr: stcgLossUsedVsLtcg, ltcgInr: ltcgLossUsed,
      speculativeInr: speculativeLossUsed, unabsorbedDepreciationInr: depUsed
    } };
}
function computeS115aStream(treaty, incomeType, aggregateTotalInr) {
  var domestic = T.S115A_RATES[incomeType];
  var docsOk = treaty.trcStatus && treaty.form10fFiled;
  var hasAggregate = aggregateTotalInr != null;
  var remainingInr = hasAggregate ? aggregateTotalInr : 0;
  var claimedInr = 0, taxInr = 0;
  var elections = [];
  (treaty.treatyElections || []).forEach(function (e) {
    if (!e || e.income_type !== incomeType) return;
    var raw = num(e.amount_inr);
    var amt = hasAggregate ? Math.min(raw, Math.max(0, remainingInr)) : raw;
    var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
    var rate = (docsOk && electedRate != null) ? Math.min(domestic, electedRate) : domestic;
    var electionTaxInr = amt * rate;
    claimedInr += amt; taxInr += electionTaxInr;
    elections.push({
      article: e.treaty_article || null,
      requestedAmountInr: raw,
      appliedAmountInr: amt,
      electedRate: electedRate,
      domesticRate: domestic,
      rateApplied: rate,
      taxInr: electionTaxInr,
      outcome: !docsOk ? "denied_no_docs" : (electedRate != null && electedRate < domestic ? "elected_rate_applied" : "domestic_rate_wins")
    });
    if (hasAggregate) remainingInr -= amt;
  });
  var uncapturedInr = hasAggregate ? Math.max(0, remainingInr) : 0;
  var uncapturedTaxInr = uncapturedInr * domestic;
  taxInr += uncapturedTaxInr;
  var totalInr = hasAggregate ? aggregateTotalInr : claimedInr;
  return {
    totalInr: totalInr, taxInr: taxInr, claimedInr: claimedInr, uncapturedInr: uncapturedInr,
    uncapturedTaxInr: uncapturedTaxInr, elections: elections,
    domesticRate: domestic, effectiveRate: totalInr > 0 ? taxInr / totalInr : domestic
  };
}
function computeNrInterestTreatment(treaty, slabs, otherSlabIncomeInr, interestAggregateInr) {
  var docsOk = treaty.trcStatus && treaty.form10fFiled;
  var remainingInr = interestAggregateInr;
  var elections = [];
  var carvedOutInr = 0, carvedOutTaxInr = 0;
  (treaty.treatyElections || []).forEach(function (e) {
    if (!e || e.income_type !== "interest") return;
    var raw = num(e.amount_inr);
    var amt = Math.min(raw, Math.max(0, remainingInr));
    if (amt <= 0) return;
    remainingInr -= amt;
    var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
    var canElect = docsOk && electedRate != null;
    var marginalSlabTaxInr = bracketTax(otherSlabIncomeInr + interestAggregateInr, slabs) - bracketTax(otherSlabIncomeInr + interestAggregateInr - amt, slabs);
    var treatyTaxInr = canElect ? amt * electedRate : null;
    var carvedOut = canElect && treatyTaxInr < marginalSlabTaxInr;
    if (carvedOut) { carvedOutInr += amt; carvedOutTaxInr += treatyTaxInr; }
    elections.push({
      article: e.treaty_article || null, requestedAmountInr: raw, appliedAmountInr: amt,
      electedRate: electedRate, marginalSlabTaxInr: marginalSlabTaxInr, treatyTaxInr: treatyTaxInr,
      carvedOut: carvedOut,
      outcome: !docsOk ? "denied_no_docs" : (electedRate == null ? "no_rate" : (carvedOut ? "treaty_beats_slab" : "slab_beats_treaty"))
    });
  });
  var uncapturedInr = Math.max(0, remainingInr);
  return {
    totalInr: interestAggregateInr,
    slabEligibleInr: interestAggregateInr - carvedOutInr,
    carvedOutInr: carvedOutInr, carvedOutTaxInr: carvedOutTaxInr,
    uncapturedInr: uncapturedInr, elections: elections
  };
}

var NODES = {
  // ---- raw leaves: salary/houseProperty/interest/dividend/specialRate115bb
  // — quarterly-merge-aware (indiaAnnualSliceV3 above) since 20 Jul 2026.
  annualSliceV3: { deps: [], compute: function (d, ctx) { return indiaAnnualSliceV3(ctx.india); } },
  salaryInr: { deps: ["annualSliceV3"], compute: function (d) { return num(safe(d.annualSliceV3.domestic_income, "salary.taxable_salary_inr", null)) || num(safe(d.annualSliceV3.domestic_income, "salary.gross_salary_inr", 0)); } },
  housePropertyInr: {
    deps: ["annualSliceV3"],
    compute: function (d) {
      var hpProps = safe(d.annualSliceV3.domestic_income, "house_property.properties", []) || [];
      return hpProps.reduce(function (s, p) { return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0); }, 0);
    }
  },
  interestInr: {
    deps: ["annualSliceV3"],
    compute: function (d) {
      var os = d.annualSliceV3.other_sources;
      return num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) +
        num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) +
        num(safe(d.annualSliceV3.domestic_income, "other_sources.interest_inr", 0));
    }
  },
  dividendInr: { deps: ["annualSliceV3"], compute: function (d) { return num(safe(d.annualSliceV3.other_sources, "dividend_inr", 0)); } },
  specialRate115bbInr: {
    deps: ["annualSliceV3"],
    compute: function (d) {
      var os = d.annualSliceV3.other_sources;
      return num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
    }
  },
  taxRegime: { deps: [], compute: function (d, ctx) { return (safe(ctx.india, "profile.tax_regime", "NEW") || "NEW").toUpperCase(); } },
  indiaResidencyStatusRawV3: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.final_india_residency_status", null); } },
  indiaEntityTypeRawV3: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },

  // ---- deductions (aggregateIndiaDeductions, ported exactly) --------------
  dedS80C: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80C", {}); return num(x.epf_employee_inr) + num(x.ppf_inr) + num(x.elss_inr) + num(x.life_insurance_premium_inr) + num(x.principal_home_loan_inr) + num(x.tuition_fees_inr) + num(x.nsc_inr) + num(x.tax_saving_fd_inr) + num(x.sukanya_samriddhi_inr); } },
  dedS80CCD1B: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80CCD_1B.nps_additional_inr", 0)); } },
  dedS80CCD2Employer: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "domestic_income.salary.employer_nps_contribution_inr", 0)); } },
  dedS80D: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80D", {}); return num(x.self_family_premium_inr) + num(x.parents_premium_inr); } },
  dedS80TTA_TTB: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80TTA_TTB.savings_interest_inr", 0)); } },
  dedS80DD: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80DD", {}); return x.has_disabled_dependents === true ? (S80DD_U_FLAT[x.disability_percentage] || 0) : 0; } },
  dedS80DDB: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80DDB", {}); return x.has_specified_diseases_treatment === true ? Math.min(num(x.medical_expenses_inr), S80DDB_CAP[x.patient_category] || S80DDB_CAP.normal) : 0; } },
  dedS80U: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80U", {}); return x.has_self_disability === true ? (S80DD_U_FLAT[x.disability_percentage] || 0) : 0; } },
  dedS80E: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80E.education_loan_interest_inr", 0)); } },
  dedS80EEA_EE: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80EEA_EE", {}); return Math.min(num(x.affordable_home_loan_interest_inr), s80eeaEeCapInr(x.loan_sanction_date)); } },
  dedS80GGB_GGC: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80ggb_ggc_political_donation_inr", 0)); } },
  dedS80GGRentPaidInr: { deps: [], compute: function (d, ctx) { var x = safe(ctx.india, "deductions.s80GG", {}); return x.has_rent_paid_no_hra === true ? num(x.rent_paid_inr) : 0; } },

  // ---- carry-forward losses (raw, ported exactly) --------------------------
  cflBusinessInr: { deps: [], compute: function (d, ctx) { return sumAllowed(safe(ctx.india, "carry_forward_losses.business_loss_cf", [])); } },
  cflSpeculativeInr: { deps: [], compute: function (d, ctx) { return sumAllowed(safe(ctx.india, "carry_forward_losses.speculative_loss_cf", [])); } },
  cflStcgInr: { deps: [], compute: function (d, ctx) { return sumAllowed(safe(ctx.india, "carry_forward_losses.stcg_loss_cf", [])); } },
  cflLtcgInr: { deps: [], compute: function (d, ctx) { return sumAllowed(safe(ctx.india, "carry_forward_losses.ltcg_loss_cf", [])); } },
  cflHousePropertyInr: { deps: [], compute: function (d, ctx) { return sumAllowed(safe(ctx.india, "carry_forward_losses.house_property_loss_cf", [])); } },
  cflUnabsorbedDepreciationInr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "carry_forward_losses.unabsorbed_depreciation_cf", 0)); } },

  // ---- treaty (raw, ported exactly) -----------------------------------------
  treatyTrcStatus: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.trc_status", false) === true || safe(ctx.india, "compliance_docs.trc.document_uploaded", false) === true; } },
  treatyForm10fFiled: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "compliance_docs.form_10f.is_filed", false) === true; } },
  treatyElectionsRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.treaty_elections", []) || []; } },

  // ---- EXPLICIT BOUNDARY INPUTS: capital-gains classification + exact
  // business.inr — see file header for why these stay boundary this pass.
  businessInrBoundaryV3: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.business && ctx.model.income.india.business.inr); } },
  businessDepreciationInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.businessDepreciationInr); } },
  speculativeIncomeInrBoundaryV3: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.speculativeIncomeInr); } },
  stcgInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.stcg && ctx.model.income.india.stcg.inr); } },
  ltcgInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.ltcg && ctx.model.income.india.ltcg.inr); } },
  ltcg197InrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.ltcg197Inr); } },
  stcgSlabInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.stcgSlabInr); } },
  vdaGainInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.vdaGainInr); } },
  chapterXiiaInvestmentIncomeInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.chapterXiiaInvestmentIncomeInr); } },
  deemedDividendBuybackInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.deemedDividendBuyback && ctx.model.income.india.deemedDividendBuyback.inr); } },
  promoterBuybackLtcgInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.promoterBuybackLtcgInr); } },
  promoterBuybackStcgInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.promoterBuybackStcgInr); } },
  otherSourcesMiscInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.otherSourcesMisc && ctx.model.income.india.otherSourcesMisc.inr); } },

  // ---- computeIndiaTax, ported exactly (individual/HUF path only) ----------
  isNew: { deps: ["taxRegime"], compute: function (d) { return d.taxRegime !== "OLD"; } },
  slabs: { deps: ["isNew"], compute: function (d) { return d.isNew ? T.SLABS_NEW : T.SLABS_OLD; } },
  isNRV3: { deps: ["indiaResidencyStatusRawV3"], compute: function (d) { return d.indiaResidencyStatusRawV3 === "NR"; } },

  nrInterest: {
    deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
      "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"],
    compute: function (d) {
      if (!d.isNRV3) return null;
      var otherSlabIncomeInr = d.salaryInr + d.businessInrBoundaryV3 + d.housePropertyInr + d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary;
      return computeNrInterestTreatment({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, d.slabs, otherSlabIncomeInr, d.interestInr);
    }
  },
  s115aDividend: {
    deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"],
    compute: function (d) { return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "dividend", d.dividendInr) : null; }
  },
  s115aRoyalty: {
    deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
    compute: function (d) { return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "royalty", null) : null; }
  },
  s115aFts: {
    deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
    compute: function (d) { return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "fts", null) : null; }
  },

  lossSetOffV3: {
    deps: ["businessInrBoundaryV3", "businessDepreciationInrBoundary", "cflBusinessInr", "cflSpeculativeInr", "cflStcgInr", "cflLtcgInr",
      "cflHousePropertyInr", "cflUnabsorbedDepreciationInr", "housePropertyInr", "isNRV3", "nrInterest",
      "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr", "dividendInr",
      "stcgInrBoundary", "stcgSlabInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "speculativeIncomeInrBoundaryV3"],
    compute: function (d) {
      var businessInrRaw = d.businessInrBoundaryV3;
      var unabsorbedDepThisYearInr = businessInrRaw < 0 ? Math.min(d.businessDepreciationInrBoundary, -businessInrRaw) : 0;
      var cflForSetOff = {
        businessLossAvailableInr: d.cflBusinessInr, speculativeLossAvailableInr: d.cflSpeculativeInr,
        stcgLossAvailableInr: d.cflStcgInr, ltcgLossAvailableInr: d.cflLtcgInr,
        housePropertyLossAvailableInr: d.cflHousePropertyInr,
        unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr + unabsorbedDepThisYearInr
      };
      var nrInterestSlabEligibleInr = d.nrInterest ? d.nrInterest.slabEligibleInr : 0;
      return computeLossSetOff(cflForSetOff, {
        businessInr: Math.max(0, businessInrRaw),
        housePropertyInr: d.housePropertyInr,
        otherNormalInr: d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary + (d.isNRV3 ? nrInterestSlabEligibleInr : d.interestInr + d.dividendInr),
        stcgInr: d.stcgInrBoundary, stcgSlabInr: d.stcgSlabInrBoundary, ltcgGrossInr: d.ltcgInrBoundary, ltcg197Inr: d.ltcg197InrBoundary,
        speculativeInr: Math.max(0, d.speculativeIncomeInrBoundaryV3)
      });
    }
  },

  normalSlabInr: { deps: ["salaryInr", "lossSetOffV3"], compute: function (d) { return d.salaryInr + d.lossSetOffV3.businessInr + d.lossSetOffV3.housePropertyInr + d.lossSetOffV3.otherNormalInr + d.lossSetOffV3.stcgSlabInr + d.lossSetOffV3.speculativeInr; } },

  deductionsInrV3: {
    deps: ["isNew", "dedS80CCD2Employer", "dedS80C", "dedS80CCD1B", "dedS80D", "dedS80TTA_TTB", "dedS80DD", "dedS80DDB",
      "dedS80U", "dedS80E", "dedS80EEA_EE", "dedS80GGB_GGC", "dedS80GGRentPaidInr", "normalSlabInr"],
    compute: function (d) {
      if (d.isNew) return d.dedS80CCD2Employer || 0;
      var caps = T.DEDUCTION_CAPS_OLD;
      var s80ggInr = d.dedS80GGRentPaidInr > 0
        ? Math.max(0, Math.min(d.dedS80GGRentPaidInr - 0.10 * d.normalSlabInr, 60000, 0.25 * d.normalSlabInr)) : 0;
      return Math.min(d.dedS80C, caps.s80C) + Math.min(d.dedS80CCD1B, caps.s80CCD1B) +
        Math.min(d.dedS80D, caps.s80D_self + caps.s80D_parents_senior) + (d.dedS80CCD2Employer || 0) +
        Math.min(d.dedS80TTA_TTB, 10000) + (d.dedS80DD || 0) + (d.dedS80DDB || 0) + (d.dedS80U || 0) +
        (d.dedS80E || 0) + (d.dedS80EEA_EE || 0) + (d.dedS80GGB_GGC || 0) + s80ggInr;
    }
  },
  totalNormalInr: { deps: ["normalSlabInr", "deductionsInrV3"], compute: function (d) { return Math.max(0, d.normalSlabInr - d.deductionsInrV3); } },

  stcgTaxableInr: { deps: ["lossSetOffV3"], compute: function (d) { return d.lossSetOffV3.stcgInr; } },
  ltcgTaxableInr: { deps: ["lossSetOffV3"], compute: function (d) { return Math.max(0, d.lossSetOffV3.ltcgGrossInr - T.LTCG_112A_EXEMPT_INR); } },
  ltcg197TaxableInr: { deps: ["lossSetOffV3"], compute: function (d) { return Math.max(0, d.lossSetOffV3.ltcg197Inr); } },
  special115bbTaxInr: { deps: ["specialRate115bbInr"], compute: function (d) { return d.specialRate115bbInr * T.RATE_115BB; } },
  vdaTaxInr: { deps: ["vdaGainInrBoundary"], compute: function (d) { return d.vdaGainInrBoundary * T.RATE_115BBH; } },
  chapterXiiaInvestmentIncomeTaxInr: { deps: ["chapterXiiaInvestmentIncomeInrBoundary"], compute: function (d) { return d.chapterXiiaInvestmentIncomeInrBoundary * T.RATE_115E_INVESTMENT_INCOME; } },

  capEligibleSpecialTaxInr: {
    deps: ["stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "s115aDividend"],
    compute: function (d) { return d.stcgTaxableInr * T.STCG_111A_RATE + d.ltcgTaxableInr * T.LTCG_112A_RATE + d.ltcg197TaxableInr * T.LTCG_112A_RATE + (d.s115aDividend ? d.s115aDividend.taxInr : 0); }
  },
  specialTaxInrV3: {
    deps: ["capEligibleSpecialTaxInr", "special115bbTaxInr", "vdaTaxInr", "chapterXiiaInvestmentIncomeTaxInr", "nrInterest", "s115aRoyalty", "s115aFts"],
    compute: function (d) { return d.capEligibleSpecialTaxInr + d.special115bbTaxInr + d.vdaTaxInr + d.chapterXiiaInvestmentIncomeTaxInr + (d.nrInterest ? d.nrInterest.carvedOutTaxInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.taxInr : 0) + (d.s115aFts ? d.s115aFts.taxInr : 0); }
  },

  slabTaxInr: { deps: ["totalNormalInr", "slabs"], compute: function (d) { return bracketTax(d.totalNormalInr, d.slabs); } },

  totalIncomeInrV3: {
    deps: ["totalNormalInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
      "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"],
    compute: function (d) {
      return d.totalNormalInr + d.stcgTaxableInr + d.ltcgTaxableInr + d.ltcg197TaxableInr + d.specialRate115bbInr + d.vdaGainInrBoundary +
        d.chapterXiiaInvestmentIncomeInrBoundary + (d.nrInterest ? d.nrInterest.carvedOutInr : 0) +
        (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0);
    }
  },

  isIndividualV3: { deps: ["indiaEntityTypeRawV3"], compute: function (d) { return d.indiaEntityTypeRawV3 === "individual"; } },
  // Eligibility is tested against totalIncomeInrV3 (every head, incl.
  // special-rate income like LTCG/STCG), not totalNormalInr (slab income
  // only) -- a taxpayer with modest slab income but large LTCG must not
  // qualify for the rebate just because their slab-only income is under the
  // cap. Once real total income exceeds the cap, Finance Act 2025 marginal
  // relief applies: the rebate caps net slab tax at exactly the excess over
  // the threshold (never letting a Re.1 crossing create a full-tax cliff),
  // but only while doing so actually benefits the taxpayer (slabTaxInr >
  // excess) -- see prototypes/graph-pilot/run-in1-v3-marginal-relief.js.
  rebateInrV3: {
    deps: ["isIndividualV3", "isNRV3", "totalIncomeInrV3", "isNew", "slabTaxInr"],
    compute: function (d) {
      if (!d.isIndividualV3 || d.isNRV3) return 0;
      var rebate = d.isNew ? T.REBATE_87A_NEW : T.REBATE_87A_OLD;
      if (d.totalIncomeInrV3 <= rebate.incomeCap) return Math.min(d.slabTaxInr, rebate.maxRebate);
      var excess = d.totalIncomeInrV3 - rebate.incomeCap;
      return Math.max(0, d.slabTaxInr - excess);
    }
  },
  taxAfterRebateInr: { deps: ["slabTaxInr", "rebateInrV3", "specialTaxInrV3"], compute: function (d) { return Math.max(0, d.slabTaxInr - d.rebateInrV3) + d.specialTaxInrV3; } },
  surchargeInrV3: {
    deps: ["taxAfterRebateInr", "totalIncomeInrV3", "isNew", "slabs", "capEligibleSpecialTaxInr"],
    compute: function (d) { return computeIndiaSurcharge(d.taxAfterRebateInr, d.totalIncomeInrV3, d.isNew, d.slabs, d.capEligibleSpecialTaxInr); }
  },
  cessInrV3: { deps: ["taxAfterRebateInr", "surchargeInrV3"], compute: function (d) { return (d.taxAfterRebateInr + d.surchargeInrV3) * T.CESS_RATE; } },

  promoterBuybackExtraTaxInr: {
    deps: ["indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"],
    compute: function (d) {
      var isCorporatePromoter = d.indiaEntityTypeRawV3 === "company";
      var promoterTargetRate = isCorporatePromoter ? T.PROMOTER_BUYBACK_TARGET_RATE_CORPORATE : T.PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE;
      var ltcgAdditionalInr = Math.max(0, d.promoterBuybackLtcgInrBoundary) * Math.max(0, promoterTargetRate - T.LTCG_112A_RATE);
      var stcgAdditionalInr = Math.max(0, d.promoterBuybackStcgInrBoundary) * Math.max(0, promoterTargetRate - T.STCG_111A_RATE);
      var additionalTaxInr = ltcgAdditionalInr + stcgAdditionalInr;
      var surchargeInr = additionalTaxInr * T.PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE;
      var cessInr = (additionalTaxInr + surchargeInr) * T.CESS_RATE;
      return additionalTaxInr + surchargeInr + cessInr;
    }
  },

  totalTaxInrV3: {
    deps: ["taxAfterRebateInr", "surchargeInrV3", "cessInrV3", "promoterBuybackExtraTaxInr"],
    compute: function (d) { return d.taxAfterRebateInr + d.surchargeInrV3 + d.cessInrV3 + d.promoterBuybackExtraTaxInr; }
  }
};

function sumAllowed(arr) {
  return (arr || []).reduce(function (s, e) {
    var v = (e && e.final_allowed_amount_inr != null) ? e.final_allowed_amount_inr : num(e && e.amount_inr);
    return s + num(v);
  }, 0);
}

module.exports = { NODES: NODES };
