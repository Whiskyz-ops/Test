"use strict";
/* ============================================================================
 * Closes the aggregateUsIncome boundary — the US mirror of
 * aggregateindiaincome-nodes.js. Unlike the India capital-gains
 * classification (800+ lines, genuinely deferred permanently as separate
 * work), MACRS/§179/bonus depreciation and K-1 passive-box aggregation
 * turned out dense but fully tractable — no recursion, pure arithmetic
 * once inputs are known, the same shape as India's WDV depreciation work
 * (which WAS fully ported). So this pass genuinely closes both, rather
 * than deferring them again.
 *
 * Ported in full, read fresh from source: computeAssetDepreciationUsd
 * (§179/bonus/MACRS per asset, half-year-convention tables for 3/5/7/15-
 * year property, mid-month straight-line for 27.5/39-year real property),
 * aggregateAssetDepreciationUsd (taxpayer-wide §179 cap/phase-out scaling
 * across every self-employment business), k1PassiveIncomeUsd (interest/
 * dividend/capital-gain/rental boxes, bridging the real per-K1-type field
 * name variants), and the whole of aggregateUsIncome itself — wages
 * (W-2 array), foreign wages, business income (C-corp/3 K-1 types/self-
 * employment), Schedule SE earnings, QBI income + SSTB flag, retirement
 * (IRA/401k/pension/SS kept separate per gap tracker US-2), direct +
 * K-1 interest/dividends/capital gains/rental, foreign-source items, and
 * the India-side EPF/NPS cross-border-taxable amounts.
 *
 * Verified standalone against model.income.us field-by-field, same
 * discipline as the India side — NOT yet wired into ustax-nodes.js's
 * chain (which still reads model.income.us as its own boundary); that
 * physical integration is the natural next step, mirroring
 * india-tax-combined-nodes.js's routing wire-up, not done here.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(inr, ctx) { return num(inr) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js

/* SYS-1: verified-identical copies of CONST.TAX.US_SEC179_* / US_BONUS_* /
 * US_MACRS_* replaced by the shared import. */
var CONST_AGGUS = require("./constants.js").CONST;
var US_SEC179_MAX_USD = CONST_AGGUS.TAX.US_SEC179_MAX_USD;
var US_SEC179_PHASEOUT_THRESHOLD_USD = CONST_AGGUS.TAX.US_SEC179_PHASEOUT_THRESHOLD_USD;
var US_BONUS_DEPRECIATION_RATE = CONST_AGGUS.TAX.US_BONUS_DEPRECIATION_RATE;
var US_MACRS_HALF_YEAR = CONST_AGGUS.TAX.US_MACRS_HALF_YEAR;
var US_MACRS_STRAIGHT_LINE_ANNUAL = CONST_AGGUS.TAX.US_MACRS_STRAIGHT_LINE_ANNUAL;

function computeSelfEmploymentNetProfitUsd(s) {
  var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
  var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
  return grossProfit + num(s.other_income_usd) - num(s.expenses_usd);
}
function selfEmploymentNetProfitUsd(s, depreciationUsd) {
  var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
  if (explicit !== undefined && explicit !== null) return num(explicit);
  return computeSelfEmploymentNetProfitUsd(s) - num(depreciationUsd || 0);
}
function assetRecoveryYearN(asset, baseYear) {
  if (!asset || !asset.placed_in_service_date) return null;
  var d = new Date(asset.placed_in_service_date);
  if (isNaN(d.getTime())) return null;
  var yearN = baseYear - d.getFullYear() + 1;
  return yearN >= 1 ? yearN : null;
}
function straightLineYear1FractionInr(placedInServiceDateStr) {
  var d = new Date(placedInServiceDateStr);
  if (isNaN(d.getTime())) return 1;
  var monthsRemainingInclHalf = (12 - d.getMonth()) - 0.5;
  return Math.max(0, Math.min(1, monthsRemainingInclHalf / 12));
}
function computeAssetDepreciationUsd(asset, baseYear) {
  var cost = num(asset.cost);
  var yearN = assetRecoveryYearN(asset, baseYear);
  var klass = asset.class;
  var isStraightLine = !!US_MACRS_STRAIGHT_LINE_ANNUAL[klass];
  var eligibleForSec179Bonus = !isStraightLine;
  var isCurrentYear = yearN === 1;
  var requestedSec179Usd = (isCurrentYear && eligibleForSec179Bonus) ? Math.min(Math.max(0, num(asset.sec179)), cost) : 0;
  var bonusEligibleBasisUsd = Math.max(0, cost - requestedSec179Usd);
  var bonusUsd = (isCurrentYear && eligibleForSec179Bonus && asset.bonus === true) ? bonusEligibleBasisUsd * US_BONUS_DEPRECIATION_RATE : 0;
  var macrsBasisUsd = Math.max(0, cost - requestedSec179Usd - bonusUsd);
  var macrsUsd = 0;
  if (yearN != null && macrsBasisUsd > 0) {
    if (isStraightLine) {
      var annualRate = US_MACRS_STRAIGHT_LINE_ANNUAL[klass];
      macrsUsd = yearN === 1 ? macrsBasisUsd * annualRate * straightLineYear1FractionInr(asset.placed_in_service_date) : macrsBasisUsd * annualRate;
    } else {
      var table = US_MACRS_HALF_YEAR[klass];
      if (table && yearN <= table.length) macrsUsd = macrsBasisUsd * table[yearN - 1];
    }
  }
  return { cost: cost, yearN: yearN, isCurrentYear: isCurrentYear, class: klass, eligibleForSec179Bonus: eligibleForSec179Bonus, requestedSec179Usd: requestedSec179Usd, bonusUsd: bonusUsd, macrsUsd: macrsUsd };
}
function aggregateAssetDepreciationUsd(businesses, baseYear) {
  var perAsset = [];
  businesses.forEach(function (b) {
    (b.assets || []).forEach(function (a) { perAsset.push({ businessKey: b.key, calc: computeAssetDepreciationUsd(a, baseYear) }); });
  });
  var totalRequestedSec179Usd = perAsset.reduce(function (s, p) { return s + p.calc.requestedSec179Usd; }, 0);
  var totalQualifyingAdditionsUsd = perAsset.reduce(function (s, p) { return s + (p.calc.isCurrentYear && p.calc.eligibleForSec179Bonus ? p.calc.cost : 0); }, 0);
  var phaseoutReductionUsd = Math.max(0, totalQualifyingAdditionsUsd - US_SEC179_PHASEOUT_THRESHOLD_USD);
  var capAfterPhaseoutUsd = Math.max(0, US_SEC179_MAX_USD - phaseoutReductionUsd);
  var preSec179BusinessIncomeUsd = businesses.reduce(function (s, b) {
    var bonusMacrs = perAsset.filter(function (p) { return p.businessKey === b.key; }).reduce(function (s2, p) { return s2 + p.calc.bonusUsd + p.calc.macrsUsd; }, 0);
    return s + (b.grossReceiptsMinusExpensesUsd - bonusMacrs);
  }, 0);
  var allowedSec179AggregateUsd = Math.max(0, Math.min(totalRequestedSec179Usd, capAfterPhaseoutUsd, preSec179BusinessIncomeUsd));
  var scale = totalRequestedSec179Usd > 0 ? (allowedSec179AggregateUsd / totalRequestedSec179Usd) : 0;
  var byBusiness = {};
  perAsset.forEach(function (p) {
    var actualSec179Usd = p.calc.requestedSec179Usd * scale;
    var totalUsd = actualSec179Usd + p.calc.bonusUsd + p.calc.macrsUsd;
    if (!byBusiness[p.businessKey]) byBusiness[p.businessKey] = { totalUsd: 0, assets: [] };
    byBusiness[p.businessKey].totalUsd += totalUsd;
    // assets[] added for assets-nodes.js's businessEntities trace (normalize.js
    // L1600-1603) — previously dropped since nothing here read it.
    byBusiness[p.businessKey].assets.push({
      name: null, class: p.calc.class, yearN: p.calc.yearN, cost: p.calc.cost,
      sec179Usd: actualSec179Usd, bonusUsd: p.calc.bonusUsd, macrsUsd: p.calc.macrsUsd, totalUsd: totalUsd
    });
  });
  return { byBusiness: byBusiness };
}
function k1PassiveIncomeUsd(k) {
  return {
    interestUsd: num(k.interest_income_usd), ordDivUsd: num(k.ordinary_dividends_usd), qualDivUsd: num(k.qualified_dividends_usd),
    stcgUsd: num(k.stcg_usd),
    ltcgUsd: num(k.ltcg_usd) + Math.max(0, num(k.net_sec1231_gain_usd || k.sec1231_gain_usd || 0)),
    rentalUsd: num(k.net_rental_real_estate_usd) + num(k.other_rental_income_usd) + num(k.royalties_usd || k.royalty_income_usd || 0)
  };
}
// moneyFromUsd stand-in — matches the real function exactly (usd + the INR
// equivalent, normalize.js's usdToInr) rather than .usd-only. Originally
// omitted .inr since nothing in THIS file's own computation reads it; added
// for the monitor-next integration, where aggregateUsIncomeResult stands in
// wholesale for model.income.us and arbitrary UI code may read either
// currency off any money object generically. No existing consumer inside
// the DAG reads .inr here, so this is purely additive.
function m(usd, ctx) { return { usd: usd, inr: usd * fxRate(ctx) }; } // rate overridable via ctx.fxRateOverride — see fx-util.js

var NODES = {
  baseYearUsAgg: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "metadata.us_calendar_year", 2025)) || 2025; } },

  uiAgg: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "income_us_source", {}); } },
  fiAgg: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "income_foreign_source", {}); } },

  wagesComputation: {
    deps: ["uiAgg"],
    compute: function (d) {
      var wages = 0, w2with = 0, medicareWages = 0, qualifiedTipsUsd = 0, qualifiedOvertimeUsd = 0;
      var w2Employers = [];
      var w2 = safe(d.uiAgg, "wages_w2", null);
      if (Array.isArray(w2)) {
        w2.forEach(function (w) {
          var wagesUsd = num(w.wages_box1_usd || w.wages_tips_compensation_usd || 0);
          wages += wagesUsd;
          var adv = w.tax_details_collapsed_by_default || w;
          var fedWithUsd = num(adv.federal_tax_withheld_usd || adv.federal_income_tax_withheld_usd || 0);
          w2with += fedWithUsd;
          medicareWages += num(adv.medicare_wages_box5_usd || w.wages_box1_usd || 0);
          qualifiedTipsUsd += num(w.qualified_tip_income_usd || 0);
          qualifiedOvertimeUsd += num(w.qualified_overtime_premium_usd || 0);
          var stateWithUsd = 0;
          (safe(w, "state_and_local_taxes", []) || []).forEach(function (st) { stateWithUsd += num(st.state_tax_withheld_box17_usd || 0); });
          w2Employers.push({ employerName: w.employer_name || null, wagesUsd: wagesUsd, federalWithheldUsd: fedWithUsd, stateWithheldUsd: stateWithUsd });
        });
      }
      return { wagesUsd: wages, w2WithholdingUsd: w2with, w2Employers: w2Employers, medicareWagesUsd: medicareWages, qualifiedTipsUsd: qualifiedTipsUsd, qualifiedOvertimeUsd: qualifiedOvertimeUsd };
    }
  },
  foreignWagesUsd: {
    deps: ["fiAgg"],
    compute: function (d) { return (safe(d.fiAgg, "foreign_wages", []) || []).reduce(function (s, w) { return s + num(w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd || 0); }, 0); }
  },

  selfEmploymentDepreciationPlan: {
    deps: ["uiAgg", "baseYearUsAgg"],
    compute: function (d) {
      var list = safe(d.uiAgg, "self_employment", []) || [];
      var businesses = list.map(function (s, idx) {
        var assets = (s.assets || []).slice();
        (s.branches || []).forEach(function (br) { assets = assets.concat(br.assets || []); });
        return { key: idx, grossReceiptsMinusExpensesUsd: computeSelfEmploymentNetProfitUsd(s), assets: assets };
      });
      return aggregateAssetDepreciationUsd(businesses, d.baseYearUsAgg);
    }
  },

  k1PassiveTotals: {
    deps: ["uiAgg"],
    compute: function (d) {
      var totals = { interestUsd: 0, ordDivUsd: 0, qualDivUsd: 0, stcgUsd: 0, ltcgUsd: 0, rentalUsd: 0 };
      function add(k) { var p = k1PassiveIncomeUsd(k); totals.interestUsd += p.interestUsd; totals.ordDivUsd += p.ordDivUsd; totals.qualDivUsd += p.qualDivUsd; totals.stcgUsd += p.stcgUsd; totals.ltcgUsd += p.ltcgUsd; totals.rentalUsd += p.rentalUsd; }
      (safe(d.uiAgg, "partnerships_k1", []) || []).forEach(add);
      (safe(d.uiAgg, "s_corporations_k1", []) || []).forEach(add);
      (safe(d.uiAgg, "trusts_estates_k1", []) || []).forEach(add);
      return totals;
    }
  },

  businessAndSeComputation: {
    deps: ["uiAgg", "selfEmploymentDepreciationPlan", "baseYearUsAgg"],
    compute: function (d) {
      var ui = d.uiAgg, seDeprPlan = d.selfEmploymentDepreciationPlan;
      var businessUs = num(safe(ui, "business_income_usd", 0));
      (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) { businessUs += num(c.taxable_income_usd || c.net_income_usd || 0); });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
        businessUs += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) + num(k.guaranteed_payments_usd || 0) - num(k.sec179_deduction_usd || 0);
      });
      var foreignSelfEmployment = 0;
      (safe(ui, "self_employment", []) || []).forEach(function (s, idx) {
        var deprUsd = seDeprPlan.byBusiness[idx] ? seDeprPlan.byBusiness[idx].totalUsd : 0;
        var netUsd = selfEmploymentNetProfitUsd(s, deprUsd);
        if (s.llc_type === "foreign_disregarded") foreignSelfEmployment += netUsd; else businessUs += netUsd;
      });
      (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { businessUs += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0); });
      (safe(ui, "trusts_estates_k1", []) || []).forEach(function (t) { businessUs += num(t.ordinary_income_usd || 0) + num(t.ordinary_gain_usd || 0); });

      var seEarnings = 0;
      (safe(ui, "self_employment", []) || []).forEach(function (s, idx) {
        var deprUsd = seDeprPlan.byBusiness[idx] ? seDeprPlan.byBusiness[idx].totalUsd : 0;
        seEarnings += selfEmploymentNetProfitUsd(s, deprUsd);
      });
      (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) { seEarnings += num(s.net_profit_usd || 0); });

      var qbiIncome = seEarnings, sstb = false;
      (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { qbiIncome += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0); });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { qbiIncome += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) - num(k.sec179_deduction_usd || 0); });
      (safe(ui, "trusts_estates_k1", []) || []).forEach(function (t) { qbiIncome += num(t.ordinary_income_usd || 0); });
      [].concat(safe(ui, "self_employment", []) || [], safe(ui, "s_corporations_k1", []) || [], safe(ui, "partnerships_k1", []) || [], safe(ui, "trusts_estates_k1", []) || [])
        .forEach(function (x) { if (x && (x.is_specified_service_trade === true || x.is_sstb === true || x.sstb === true)) sstb = true; });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
        var box14a = k.self_employment_earnings_usd;
        if (box14a === null || box14a === undefined || box14a === "") box14a = num(k.guaranteed_payments_usd || 0) + (k.partner_type === "general" ? num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) : 0);
        seEarnings += num(box14a);
      });

      return { businessUsUsd: businessUs, foreignSelfEmploymentUsd: foreignSelfEmployment, seEarningsUsd: seEarnings, qbiIncomeUsd: Math.max(0, qbiIncome), qbiIsSSTB: sstb };
    }
  },

  retirementComputation: {
    deps: ["uiAgg"],
    compute: function (d) {
      var ui = d.uiAgg;
      var iraDistUsd = num(safe(ui, "ira_distributions_usd", 0));
      var dist401kUsd = num(safe(ui, "401k_distributions_usd", 0));
      var pensionUsd = num(safe(ui, "pension_income_usd", 0));
      var socialSecurityGrossUsd = num(safe(ui, "social_security_benefits_usd", 0));
      return { usRetirementIncomeExclSsUsd: iraDistUsd + dist401kUsd + pensionUsd, socialSecurityUsUsd: socialSecurityGrossUsd, retirementDistributionsSubjectTo72tUsd: iraDistUsd + dist401kUsd };
    }
  },

  directIncomeComputation: {
    deps: ["uiAgg", "fiAgg", "k1PassiveTotals"],
    compute: function (d) {
      var ui = d.uiAgg, fi = d.fiAgg, k1 = d.k1PassiveTotals;
      return {
        taxExemptInterestUsUsd: num(safe(ui, "interest_us_exempt_usd", 0)),
        interestUsUsd: num(safe(ui, "interest_us_source_usd", 0)) + k1.interestUsd,
        ordinaryDividendsUsUsd: num(safe(ui, "ordinary_dividends_us_source_usd", 0)) + k1.ordDivUsd,
        qualifiedDividendsUsUsd: num(safe(ui, "qualified_dividends_us_source_usd", 0)) + k1.qualDivUsd,
        ltcgUsUsd: num(safe(ui, "ltcg_us_source_usd", 0)) + k1.ltcgUsd,
        stcgUsUsd: num(safe(ui, "stcg_us_source_usd", 0)) + k1.stcgUsd,
        rentalUsUsd: num(safe(ui, "rental_income_us_source_usd", 0)) + k1.rentalUsd,
        foreignInterestUsd: num(safe(fi, "foreign_interest_usd", 0)),
        foreignDividendsUsd: num(safe(fi, "foreign_dividends_usd", 0)),
        foreignRentalUsd: num(safe(fi, "foreign_rental_income_usd", 0)),
        foreignPensionUsd: num(safe(fi, "foreign_pension_income_usd", 0)),
        foreignStcgUsd: num(safe(fi, "foreign_stcg_usd", 0)),
        foreignLtcgUsd: num(safe(fi, "foreign_ltcg_usd", 0))
      };
    }
  },

  // ---- India-side EPF/NPS cross-border-taxable amounts — needs India's
  // own annualSlice (quarter-merge), re-derived independently here rather
  // than imported, same "re-verify, don't trust by reference" discipline
  // as every other file in this effort. ------------------------------------
  indiaAnnualSliceForUs: {
    deps: [],
    compute: function (d, ctx) {
      var india = ctx.india;
      var quarters = safe(india, "quarters", null);
      if (!quarters) return { other_sources: safe(india, "other_sources", {}) };
      function merge(target, source) {
        for (var k in source) {
          if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
          var sv = source[k];
          if (sv === null || sv === undefined) continue;
          if (typeof sv === "number") target[k] = (target[k] || 0) + sv; else target[k] = sv;
        }
        return target;
      }
      var out = { other_sources: {} };
      ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) { var qs = quarters[q]; if (qs && qs.other_sources) merge(out.other_sources, qs.other_sources); });
      return out;
    }
  },
  epfNpsCrossBorder: {
    deps: ["indiaAnnualSliceForUs"],
    compute: function (d, ctx) {
      return {
        taxableEpfInterestUsd: inrToUsd(num(safe(d.indiaAnnualSliceForUs.other_sources, "taxable_epf_interest_inr", 0)), ctx),
        taxableNpsWithdrawalUsd: inrToUsd(num(safe(d.indiaAnnualSliceForUs.other_sources, "taxable_nps_withdrawal_inr", 0)), ctx)
      };
    }
  },

  // ---- final assembly, matching aggregateUsIncome's own return object ----
  aggregateUsIncomeResult: {
    deps: ["wagesComputation", "foreignWagesUsd", "businessAndSeComputation", "retirementComputation", "directIncomeComputation", "epfNpsCrossBorder"],
    compute: function (d, ctx) {
      var w = d.wagesComputation, biz = d.businessAndSeComputation, ret = d.retirementComputation, di = d.directIncomeComputation, epf = d.epfNpsCrossBorder;
      var foreignInterest = di.foreignInterestUsd + epf.taxableEpfInterestUsd;
      var foreignPension = di.foreignPensionUsd + epf.taxableNpsWithdrawalUsd;

      var usSourceTotal = w.wagesUsd + biz.businessUsUsd + di.interestUsUsd + di.ordinaryDividendsUsUsd + di.ltcgUsUsd + di.stcgUsUsd + di.rentalUsUsd + ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd;
      var foreignSourceTotal = d.foreignWagesUsd + biz.foreignSelfEmploymentUsd + foreignInterest + di.foreignDividendsUsd + di.foreignRentalUsd + foreignPension + di.foreignStcgUsd + di.foreignLtcgUsd;

      return {
        wages: m(w.wagesUsd, ctx), businessUs: m(biz.businessUsUsd, ctx), w2Withholding: w.w2WithholdingUsd, w2Employers: w.w2Employers, medicareWages: w.medicareWagesUsd,
        qualifiedTipsUsd: w.qualifiedTipsUsd, qualifiedOvertimeUsd: w.qualifiedOvertimeUsd,
        seEarningsUsd: biz.seEarningsUsd, qbiIncomeUsd: biz.qbiIncomeUsd, qbiIsSSTB: biz.qbiIsSSTB,
        usRetirementIncome: m(ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd, ctx),
        usRetirementIncomeExclSs: m(ret.usRetirementIncomeExclSsUsd, ctx),
        retirementDistributionsSubjectTo72tUsd: ret.retirementDistributionsSubjectTo72tUsd,
        socialSecurityUs: m(ret.socialSecurityUsUsd, ctx),
        taxExemptInterestUs: m(di.taxExemptInterestUsUsd, ctx),
        interestUs: m(di.interestUsUsd, ctx), ordinaryDividendsUs: m(di.ordinaryDividendsUsUsd, ctx), qualifiedDividendsUs: m(di.qualifiedDividendsUsUsd, ctx),
        ltcgUs: m(di.ltcgUsUsd, ctx), stcgUs: m(di.stcgUsUsd, ctx), capitalGainsUs: m(di.ltcgUsUsd + di.stcgUsUsd, ctx), rentalUs: m(di.rentalUsUsd, ctx),
        foreignWages: m(d.foreignWagesUsd, ctx), foreignSelfEmployment: m(biz.foreignSelfEmploymentUsd, ctx),
        foreignInterest: m(foreignInterest, ctx), foreignDividends: m(di.foreignDividendsUsd, ctx),
        foreignRental: m(di.foreignRentalUsd, ctx), foreignPension: m(foreignPension, ctx),
        foreignStcg: m(di.foreignStcgUsd, ctx), foreignLtcg: m(di.foreignLtcgUsd, ctx),
        foreignCapitalGains: m(di.foreignStcgUsd + di.foreignLtcgUsd, ctx),
        retirementEpfInterestUsd: epf.taxableEpfInterestUsd, retirementNpsWithdrawalUsd: epf.taxableNpsWithdrawalUsd,
        usSourceTotal: m(usSourceTotal, ctx), foreignSourceTotal: m(foreignSourceTotal, ctx),
        total: m(usSourceTotal + foreignSourceTotal, ctx)
      };
    }
  }
};

module.exports = { NODES: NODES };
