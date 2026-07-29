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

// ---- Home-office (simplified §280A method) / vehicle-mileage (standard
// mileage rate) deduction, self-employment + Schedule F -----------------
// Both fields (top-level self_employment[]/farming_schedule_f[]
// vehicle_miles/home_office_sqft) are already collected by layer1_us.html
// and already summed up from each business's branches[] by the live
// form's own syncSeState()/syncFarmState() — but neither ever fed any real
// tax computation: the form's own local "Active Business Income Before
// Section 179" preview (used only for that one screen's own §179 income-
// limit display) computed vehDed/hoDed the same way below, but that
// computation never propagated into expenses_usd or any exported field
// the DAG reads, so businessUs/seEarnings/QBI were all silently short by
// the full deduction amount for any real filer using either method.
// Standard mileage rate (2026, matches the rate the raw form's own
// preview calculation already hardcodes — reused for internal consistency
// rather than sourcing a second, possibly-divergent figure).
var US_STANDARD_MILEAGE_RATE_USD = 0.68;
// IRS simplified home-office method (§280A safe harbor, Rev. Proc.
// 2013-13): flat $5/sqft, capped at 300 sqft ($1,500 max) — real,
// unchanging law, not a per-year figure.
var US_HOME_OFFICE_RATE_USD_PER_SQFT = 5;
var US_HOME_OFFICE_MAX_SQFT = 300;
function vehicleDeductionUsd(x) { return num(x.vehicle_miles) * US_STANDARD_MILEAGE_RATE_USD; }
function homeOfficeDeductionUsd(x) { return Math.min(num(x.home_office_sqft), US_HOME_OFFICE_MAX_SQFT) * US_HOME_OFFICE_RATE_USD_PER_SQFT; }
function vehicleAndHomeOfficeDeductionUsd(x) { return vehicleDeductionUsd(x) + homeOfficeDeductionUsd(x); }

function computeSelfEmploymentNetProfitUsd(s) {
  var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
  var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
  return grossProfit + num(s.other_income_usd) - num(s.expenses_usd) - vehicleAndHomeOfficeDeductionUsd(s);
}
function selfEmploymentNetProfitUsd(s, depreciationUsd) {
  var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
  if (explicit !== undefined && explicit !== null) return num(explicit);
  return computeSelfEmploymentNetProfitUsd(s) - num(depreciationUsd || 0);
}
/* farming_schedule_f mirrors self-employment's own phantom-field bug:
 * gross_income_usd/net_profit_usd are never actually written by the live
 * form (syncFarmState only ever persists the itemized_income{} line-item
 * breakdown plus expenses_usd — verified by direct grep, zero hits for
 * `net_profit_usd` anywhere in layer1_us.html), so a real farmer's Schedule
 * F profit previously computed to $0 for both regular tax (it never even
 * reached businessUs below) AND Schedule SE. Real gross income is the sum
 * of itemized_income{}'s line items; accrual-method filers additionally net
 * the cost-of-purchases/inventory swing the same way self-employment's own
 * COGS fields do (cash-method, the Layer 1 default, doesn't track this
 * inventory block at all — hidden unless accounting_method is 'accrual'). */
function computeFarmGrossIncomeUsd(f) {
  var inc = safe(f, "itemized_income", {}) || {};
  var gross = num(inc.sales_livestock_produce_raised) + num(inc.sales_livestock_produce_purchased) +
    num(inc.cooperative_distributions) + num(inc.agricultural_program_payments) + num(inc.ccc_loans) +
    num(inc.crop_insurance_proceeds) + num(inc.custom_hire_income) + num(inc.other_income);
  if (f.accounting_method === "accrual") {
    var inv = safe(f, "inventory", {}) || {};
    gross -= (num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory));
  }
  return gross;
}
function computeFarmNetProfitUsd(f) { return computeFarmGrossIncomeUsd(f) - num(f.expenses_usd) - vehicleAndHomeOfficeDeductionUsd(f); }
function farmNetProfitUsd(f, depreciationUsd) {
  if (f.net_profit_usd !== undefined && f.net_profit_usd !== null) return num(f.net_profit_usd);
  if (f.gross_income_usd !== undefined && f.gross_income_usd !== null) return num(f.gross_income_usd) - num(f.expenses_usd) - vehicleAndHomeOfficeDeductionUsd(f) - num(depreciationUsd || 0);
  return computeFarmNetProfitUsd(f) - num(depreciationUsd || 0);
}
// ---- Capital-gains special character: §1(h)(4) collectibles (28%-capped
// rate) and §1202 QSBS exclusion (task #43 follow-up). Both were
// deliberately deferred alongside the Step 13/14 capital-gains wiring:
// "Collectibles (28% special rate) and QSBS (§1202 exclusion, up to
// $10M/10x-basis) are aggregated as ordinary LTCG — a documented
// simplification... pending a real special-rate computation" (the raw
// form's own recalculateCapitalGainsAggregate() comment, layer1_us.html).
// That function folds both into the flat ltcg_us_source_usd field before
// it's ever saved, so this DAG reads collectibles_transactions[]/
// qsbs_transactions[] directly (the same arrays the raw form's own
// aggregation reads) to recover the character the flat field lost.
//
// §1250 unrecaptured-depreciation recapture (the third item in the same
// deferred list) is NOT built here: it needs the seller's ACCUMULATED
// DEPRECIATION on the specific property sold, and neither
// real_estate.properties[] nor real_estate_transactions[] collects that
// anywhere on Layer 1 — confirmed by direct grep, not assumed. Computing
// it would mean inventing a number Layer 1 never asked for, the same
// discipline this codebase already applies to GILTI/Subpart-F (flagged,
// not guessed) — tracked as a genuine gap (missing data), not built.
function isLongTermUsCg(acqStr, soldStr) {
  if (!acqStr || !soldStr) return false;
  var acq = new Date(acqStr), sold = new Date(soldStr);
  if (isNaN(acq) || isNaN(sold)) return false;
  return (sold - acq) > (365 * 24 * 60 * 60 * 1000);
}
function holdingYearsUsCg(acqStr, soldStr) {
  var acq = new Date(acqStr), sold = new Date(soldStr);
  if (isNaN(acq) || isNaN(sold)) return 0;
  return (sold - acq) / (365.25 * 24 * 60 * 60 * 1000);
}
function collectiblesAggregate(ui) {
  var ltcg = 0;
  (safe(ui, "collectibles_transactions", []) || []).forEach(function (t) {
    // Short-term collectibles gain has no special rate at all (ordinary
    // STCG, same as any other short-term asset) — already correctly
    // included in the flat stcg_us_source_usd field, nothing to pull out.
    if (isLongTermUsCg(t.acquisition_date, t.sale_date)) ltcg += num(t.realized_gain_loss_usd);
  });
  return ltcg;
}
function qsbsAggregate(ui, qsbsConst) {
  var totalGain = 0, excludedGain = 0;
  (safe(ui, "qsbs_transactions", []) || []).forEach(function (t) {
    var gain = num(t.realized_gain_loss_usd);
    totalGain += gain;
    if (gain <= 0) return; // losses: no exclusion mechanics, flow through as ordinary LTCG (already in the flat field)
    var years = holdingYearsUsCg(t.acquisition_date, t.sale_date);
    var acqDate = new Date(t.acquisition_date);
    var isObbba = !isNaN(acqDate.getTime()) && acqDate >= new Date(qsbsConst.QSBS_OBBBA_EFFECTIVE_DATE);
    var pct = 0;
    if (isObbba) {
      qsbsConst.QSBS_OBBBA_TIERS.forEach(function (tier) { if (years >= tier.years && pct < tier.pct) pct = tier.pct; });
    } else if (years >= 5) {
      pct = 1.0; // pre-OBBBA cliff: 100% if held 5+ years (assumes stock acquired after 27 Sep 2010)
    }
    if (pct <= 0) return;
    var basis = num(t.cost_basis_usd);
    var cap = Math.max(isObbba ? qsbsConst.QSBS_OBBBA_CAP_USD : qsbsConst.QSBS_PRE_OBBBA_CAP_USD, basis * 10);
    excludedGain += Math.min(gain, cap) * pct;
  });
  excludedGain = Math.min(excludedGain, Math.max(0, totalGain));
  return { totalGainUsd: totalGain, excludedGainUsd: excludedGain, taxableGainUsd: totalGain - excludedGain };
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

var CONST_CFC = require("./constants.js").CONST;
var T_CFC = CONST_CFC.TAX.US;

/* Phase 7 (XB-14) — GILTI/NCTI + Subpart F quantification. computeCfcInclusion
 * is a duplicated-down copy of the raw foreign-corporations leaf (see
 * usForeignCorpsRawForIncome below) so aggregateUsIncomeResult, assembled in
 * THIS bottom-layer file, can depend on it without a circular require on
 * crossbasis-nodes.js (which sits above this file in both run-analyze.js's
 * and run-fuzz.js's require chains, and holds its own independent copy of
 * usForeignCorpsRaw for crossBasisResult's own purposes).
 *
 * Documented simplifications (also surfaced in the "cfc" finding text,
 * findings-batch3-nodes.js):
 *  - No QBAI collection — correct per OBBBA TY2026 (10% exclusion eliminated).
 *  - No PTEP distribution-year tracking.
 *  - CFC-status threshold stays the pre-existing single-owner >50% test
 *    (independently re-derived from ownership_percentage here, not trusted
 *    off a possibly-stale persisted cfc_status) — a known simplification of
 *    the real aggregate US-shareholder test, not fixed here.
 *  - Subpart F capped at each CFC's own entered E&P — simplification of full
 *    §952(c) mechanics (qualified deficits, CFC chains, etc. not modeled).
 *  - No state-tax conformity modeling for GILTI/NCTI.
 *  - No §954(b)(4) high-tax exclusion election modeled.
 *  - §962-elected inclusion not run through NIIT (Reg. §1.1411-10(c) would
 *    generally include it absent an election out) — same simplification
 *    already applied to otherOrdinaryIncomeUs.
 *  - §962 election modeled per-CFC, matching real law (each CFC may elect
 *    separately) — read off each foreign_corporations[] entry independently.
 */
function computeCfcInclusion(corps) {
  var nonElected = { testedIncome: 0, testedLoss: 0, subpartF: 0 };
  var elected = { testedIncome: 0, testedLoss: 0, subpartF: 0, foreignTaxPaid: 0 };
  var perCfcTrace = [];
  (corps || []).forEach(function (c) {
    var ownPct = num(c.ownership_percentage);
    var isCfc = ownPct > 50;
    if (!isCfc) return; // sub-CFC-threshold holdings: no §951/951A inclusion (existing cfc_below_threshold finding)
    var frac = Math.max(0, Math.min(1, ownPct / 100));
    var testedIncomeUsd = Math.max(0, num(c.tested_income_usd)) * frac;
    var testedLossUsd = Math.max(0, num(c.tested_loss_usd)) * frac;
    var epUsd = Math.max(0, num(c.ep_usd)) * frac;
    var subpartFRawUsd = Math.max(0, num(c.subpart_f_income_usd)) * frac;
    var subpartFUsd = Math.min(subpartFRawUsd, epUsd); // §952(c) E&P cap
    var elect = c.sec962_election_planned === true;
    var bucket = elect ? elected : nonElected;
    bucket.testedIncome += testedIncomeUsd;
    bucket.testedLoss += testedLossUsd;
    bucket.subpartF += subpartFUsd;
    if (elect) elected.foreignTaxPaid += Math.max(0, num(c.foreign_tax_paid_usd)) * frac;
    perCfcTrace.push({
      name: c.corporation_name || null, ownershipPct: ownPct, sec962Elected: elect,
      testedIncomeUsd: testedIncomeUsd, testedLossUsd: testedLossUsd, subpartFIncludedUsd: subpartFUsd,
      subpartFCappedByEp: subpartFRawUsd > epUsd
    });
  });

  // True §951A(c)(2) aggregate: summed across ALL non-elected (resp.
  // elected) CFCs BEFORE the $0 floor — never floored per-CFC then summed,
  // which would produce a materially different (wrong) answer whenever one
  // CFC has a loss and another has income.
  var nonElectedNctiUsd = Math.max(0, nonElected.testedIncome - nonElected.testedLoss);
  var electedNctiUsd = Math.max(0, elected.testedIncome - elected.testedLoss);

  var nonElectedOrdinaryInclusionUsd = nonElectedNctiUsd + nonElected.subpartF;

  var sec250DeductionUsd = T_CFC.NCTI_SECTION_250_RATE * electedNctiUsd; // NCTI portion only, never Subpart F
  var sec962TaxableBaseUsd = Math.max(0, electedNctiUsd - sec250DeductionUsd) + elected.subpartF;
  var sec962GrossTaxUsd = T_CFC.C_CORP_RATE * sec962TaxableBaseUsd;
  var sec962CreditableFtcUsd = Math.min(sec962GrossTaxUsd, T_CFC.NCTI_DEEMED_PAID_FTC_RATE * elected.foreignTaxPaid);
  var sec962NetTaxUsd = Math.max(0, sec962GrossTaxUsd - sec962CreditableFtcUsd);

  return {
    hasAnyCfc: perCfcTrace.length > 0,
    nonElectedOrdinaryInclusionUsd: nonElectedOrdinaryInclusionUsd,
    nonElectedNctiUsd: nonElectedNctiUsd, nonElectedSubpartFUsd: nonElected.subpartF,
    electedPool: {
      nctiUsd: electedNctiUsd, subpartFUsd: elected.subpartF,
      sec250DeductionUsd: sec250DeductionUsd, taxableBaseUsd: sec962TaxableBaseUsd,
      grossTaxUsd: sec962GrossTaxUsd, foreignTaxPaidUsd: elected.foreignTaxPaid,
      creditableFtcUsd: sec962CreditableFtcUsd, netTaxUsd: sec962NetTaxUsd
    },
    perCfcTrace: perCfcTrace
  };
}

var NODES = {
  // Duplicated from crossbasis-nodes.js's usForeignCorpsRaw (deps:[] raw
  // leaf, harmless redefinition — see chain-topology note above).
  usForeignCorpsRawForIncome: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.foreign_corporations", []) || []; } },
  cfcInclusionResult: { deps: ["usForeignCorpsRawForIncome"], compute: function (d) { return computeCfcInclusion(d.usForeignCorpsRawForIncome); } },

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
  // Step 7 (FEIE)'s own headline "Total Foreign Earned Income" field
  // (#feie-earned-income -> foreign_earned_income.foreign_earned_income_usd)
  // -- was read NOWHERE except a local UI-preview label, so a user who
  // filled in ONLY this field (the far more likely real path, since this
  // screen exists specifically for FEIE) got a $0 exclusion AND the excess
  // over the FEIE cap silently vanished from taxable income entirely
  // (computeUsTaxCore's exclusion math is gated on foreignWagesUsd +
  // foreignSelfEmploymentUsd being > 0, which stayed 0 with nothing in
  // this field's own array).
  feieEarnedIncomeUsdRaw: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "foreign_earned_income.foreign_earned_income_usd", 0)); } },

  foreignWagesUsd: {
    deps: ["fiAgg", "feieEarnedIncomeUsdRaw"],
    // gross_wages_usd is the field name syncForeignWagesState() (layer1_us.
    // html) actually writes for every foreign-wage row added through the
    // live form -- confirmed by grep, this was previously missing from the
    // fallback chain entirely, so every foreign wage entry ever made
    // through the live UI silently computed to $0 (only profiles.js's
    // hand-authored fixtures, which use wages_usd directly, ever exercised
    // a nonzero value here).
    compute: function (d) {
      var wageRowsTotal = (safe(d.fiAgg, "foreign_wages", []) || []).reduce(function (s, w) { return s + num(w.gross_wages_usd || w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd || 0); }, 0);
      // max(), not +, so a user who carefully filled in both this and the
      // FEIE screen's field describing the same real-world salary isn't
      // double-counted; a user who only filled in one of the two loses
      // nothing either way.
      return Math.max(wageRowsTotal, d.feieEarnedIncomeUsdRaw);
    }
  },

  // Combines self-employment AND farming_schedule_f assets into ONE
  // taxpayer-wide §179 aggregation pool (real law caps/phases out §179
  // across ALL of a taxpayer's directly-owned active trades/businesses
  // together, not per-array) — keyed "se"+idx / "farm"+idx so callers can
  // look up either. K-1/1120 asset rows are deliberately NOT folded in:
  // those entities' reported income already reflects the ENTITY's own
  // depreciation before flow-through (Box 1 is already net of regular/bonus
  // depreciation; only §179 is separately stated, as sec179_deduction_usd),
  // so a second per-asset computation against a K-1 recipient's own copy of
  // the entity's asset list would double-count. Farm has no such risk — a
  // directly-owned trade/business with its own real gross-receipts/expenses
  // derivation (computeFarmNetProfitUsd), not a pass-through entity's
  // already-net distributive share, so it's treated exactly like self-
  // employment. Named usBusinessDepreciationPlan (was
  // selfEmploymentDepreciationPlan before farm was folded in).
  usBusinessDepreciationPlan: {
    deps: ["uiAgg", "baseYearUsAgg"],
    compute: function (d) {
      var businesses = [];
      (safe(d.uiAgg, "self_employment", []) || []).forEach(function (s, idx) {
        var assets = (s.assets || []).slice();
        (s.branches || []).forEach(function (br) { assets = assets.concat(br.assets || []); });
        businesses.push({ key: "se" + idx, grossReceiptsMinusExpensesUsd: computeSelfEmploymentNetProfitUsd(s), assets: assets });
      });
      (safe(d.uiAgg, "farming_schedule_f", []) || []).forEach(function (f, idx) {
        var assets = (f.assets || []).slice();
        (f.branches || []).forEach(function (br) { assets = assets.concat(br.assets || []); });
        businesses.push({ key: "farm" + idx, grossReceiptsMinusExpensesUsd: computeFarmNetProfitUsd(f), assets: assets });
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
    deps: ["uiAgg", "usBusinessDepreciationPlan", "baseYearUsAgg"],
    compute: function (d) {
      var ui = d.uiAgg, seDeprPlan = d.usBusinessDepreciationPlan;
      var businessUs = num(safe(ui, "business_income_usd", 0));
      (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) { businessUs += num(c.taxable_income_usd || c.net_income_usd || 0); });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
        businessUs += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) + num(k.guaranteed_payments_usd || 0) - num(k.sec179_deduction_usd || 0);
      });
      var foreignSelfEmployment = 0;
      (safe(ui, "self_employment", []) || []).forEach(function (s, idx) {
        var deprUsd = seDeprPlan.byBusiness["se" + idx] ? seDeprPlan.byBusiness["se" + idx].totalUsd : 0;
        var netUsd = selfEmploymentNetProfitUsd(s, deprUsd);
        if (s.llc_type === "foreign_disregarded") foreignSelfEmployment += netUsd; else businessUs += netUsd;
      });
      (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { businessUs += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0); });
      (safe(ui, "trusts_estates_k1", []) || []).forEach(function (t) { businessUs += num(t.ordinary_income_usd || 0) + num(t.ordinary_gain_usd || 0); });
      // farming_schedule_f previously never reached businessUs (actual
      // taxable income) at all — only seEarnings (Schedule SE base) even
      // attempted to read it, and only via the phantom net_profit_usd
      // field. A real farmer's Schedule F profit silently contributed $0 to
      // both regular tax AND self-employment tax.
      (safe(ui, "farming_schedule_f", []) || []).forEach(function (f, idx) {
        var deprUsd = seDeprPlan.byBusiness["farm" + idx] ? seDeprPlan.byBusiness["farm" + idx].totalUsd : 0;
        businessUs += farmNetProfitUsd(f, deprUsd);
      });

      var seEarnings = 0;
      (safe(ui, "self_employment", []) || []).forEach(function (s, idx) {
        var deprUsd = seDeprPlan.byBusiness["se" + idx] ? seDeprPlan.byBusiness["se" + idx].totalUsd : 0;
        seEarnings += selfEmploymentNetProfitUsd(s, deprUsd);
      });
      (safe(ui, "farming_schedule_f", []) || []).forEach(function (f, idx) {
        var deprUsd = seDeprPlan.byBusiness["farm" + idx] ? seDeprPlan.byBusiness["farm" + idx].totalUsd : 0;
        seEarnings += farmNetProfitUsd(f, deprUsd);
      });

      var qbiIncome = seEarnings, sstb = false;
      (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { qbiIncome += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0); });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { qbiIncome += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) - num(k.sec179_deduction_usd || 0); });
      (safe(ui, "trusts_estates_k1", []) || []).forEach(function (t) { qbiIncome += num(t.ordinary_income_usd || 0); });
      [].concat(safe(ui, "self_employment", []) || [], safe(ui, "s_corporations_k1", []) || [], safe(ui, "partnerships_k1", []) || [], safe(ui, "trusts_estates_k1", []) || [], safe(ui, "farming_schedule_f", []) || [])
        .forEach(function (x) { if (x && (x.is_specified_service_trade === true || x.is_sstb === true || x.sstb === true)) sstb = true; });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
        var box14a = k.self_employment_earnings_usd;
        if (box14a === null || box14a === undefined || box14a === "") box14a = num(k.guaranteed_payments_usd || 0) + (k.partner_type === "general" ? num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) : 0);
        seEarnings += num(box14a);
      });

      // §199A W-2 wage / UBIA limitation base (task #42 follow-up): K-1 Box
      // 20 qbi_wages_usd/qbi_ubia_usd (partnerships_k1/s_corporations_k1)
      // and self-employment/farm wages_paid_usd, collected but never read
      // before this. trusts_estates_k1 has no qbi_wages_usd/qbi_ubia_usd
      // fields on Layer 1 at all (matches layer1_us.html's own reference
      // preview calculation, which passes a literal 0 for trust K-1 wages/
      // UBIA) -- not modeled, not a gap introduced here. Self-employment/
      // farm likewise have no UBIA field (only wages_paid_usd) -- mirrors
      // the same reference calculation exactly.
      var qbiWages = 0, qbiUbia = 0;
      (safe(ui, "self_employment", []) || []).forEach(function (s) { qbiWages += num(s.wages_paid_usd); });
      (safe(ui, "farming_schedule_f", []) || []).forEach(function (f) { qbiWages += num(f.wages_paid_usd); });
      (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { qbiWages += num(k.qbi_wages_usd); qbiUbia += num(k.qbi_ubia_usd); });
      (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { qbiWages += num(s.qbi_wages_usd); qbiUbia += num(s.qbi_ubia_usd); });

      return {
        businessUsUsd: businessUs, foreignSelfEmploymentUsd: foreignSelfEmployment, seEarningsUsd: seEarnings,
        qbiIncomeUsd: Math.max(0, qbiIncome), qbiIsSSTB: sstb, qbiWagesUsd: qbiWages, qbiUbiaUsd: qbiUbia
      };
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
      // "Other Income (Schedule 1 & 1099-G/SSA)" card (layer1_us.html's Step
      // 15) -- 6 of its 8 fields (all but the state-refund box and the
      // HSA/MSA-distribution box) previously had no id/oninput/onchange at
      // all, pure static HTML; same class of bug as the Capital Gains
      // "Manual Entry" tab. State refunds need the SS111 tax-benefit-rule
      // test (was last year's SALT deduction actually itemized AND did it
      // produce a tax benefit?) that this model has no prior-year data to
      // apply, and HSA/MSA distributions are only taxable to the extent NOT
      // used for qualified medical expenses -- a split this model doesn't
      // track -- so both remain deliberately unwired rather than guessed at.
      var otherOrdinaryIncomeUsUsd = num(safe(ui, "unemployment_compensation_usd", 0)) +
        num(safe(ui, "alimony_received_usd", 0)) + num(safe(ui, "royalties_direct_us_source_usd", 0)) +
        num(safe(ui, "cancellation_of_debt_usd", 0)) + num(safe(ui, "misc_other_income_usd", 0));
      // Capital-gains special character (task #43 follow-up): the flat
      // ltcg_us_source_usd field already includes collectibles + QSBS gain
      // (folded in by the raw form's own recalculateCapitalGainsAggregate()
      // before it's ever saved) — pulled back out here so each gets its own
      // real §1(h)(4)/§1202 treatment instead of plain 0/15/20% LTCG. The
      // QSBS-EXCLUDED portion is removed entirely (never taxed anywhere);
      // the QSBS-TAXABLE remainder stays in ltcgUsUsd as ordinary LTCG
      // (correct for the common post-2010/OBBBA 100%-exclusion-tier case —
      // the pre-2010 50%-exclusion regime's own 28%-rate treatment on its
      // non-excluded half isn't modeled, an honest simplification given how
      // unlikely a 2026 return is to involve stock that old).
      var collectiblesLtcgUsd = collectiblesAggregate(ui);
      var qsbs = qsbsAggregate(ui, CONST_AGGUS.TAX.US);
      var ltcgFlatUsd = num(safe(ui, "ltcg_us_source_usd", 0));
      var ltcgAdjustedUsd = ltcgFlatUsd - collectiblesLtcgUsd - qsbs.excludedGainUsd;
      return {
        taxExemptInterestUsUsd: num(safe(ui, "interest_us_exempt_usd", 0)),
        interestUsUsd: num(safe(ui, "interest_us_source_usd", 0)) + k1.interestUsd,
        ordinaryDividendsUsUsd: num(safe(ui, "ordinary_dividends_us_source_usd", 0)) + k1.ordDivUsd,
        qualifiedDividendsUsUsd: num(safe(ui, "qualified_dividends_us_source_usd", 0)) + k1.qualDivUsd,
        ltcgUsUsd: ltcgAdjustedUsd + k1.ltcgUsd,
        collectiblesLtcgUsd: collectiblesLtcgUsd,
        qsbsExcludedGainUsd: qsbs.excludedGainUsd,
        qsbsTaxableGainUsd: qsbs.taxableGainUsd,
        stcgUsUsd: num(safe(ui, "stcg_us_source_usd", 0)) + k1.stcgUsd,
        // Rental expenses (layer1_us.html's own "Total Rental Expenses"
        // field) previously had no id/handler either -- gross rent was
        // always taxed in full with zero expense deduction possible.
        rentalUsUsd: Math.max(0, num(safe(ui, "rental_income_us_source_usd", 0)) - num(safe(ui, "rental_expenses_us_source_usd", 0))) + k1.rentalUsd,
        otherOrdinaryIncomeUsUsd: otherOrdinaryIncomeUsUsd,
        foreignInterestUsd: num(safe(fi, "foreign_interest_usd", 0)),
        foreignDividendsUsd: num(safe(fi, "foreign_dividends_usd", 0)),
        foreignRentalUsd: num(safe(fi, "foreign_rental_income_usd", 0)),
        foreignPensionUsd: num(safe(fi, "foreign_pension_income_usd", 0)),
        foreignStcgUsd: num(safe(fi, "foreign_stcg_usd", 0)),
        foreignLtcgUsd: num(safe(fi, "foreign_ltcg_usd", 0)),
        // IRC 988(a)(1): foreign-currency gain/loss is ORDINARY (not
        // capital), reported on layer1_us.html's "Section 988 Currency
        // Gains & Losses" list (syncSec988State()) but never previously
        // read anywhere -- every row a user added there had zero effect on
        // their computed tax. Can be negative (a net loss).
        section988GainLossUsd: (safe(fi, "section_988_gains_losses", []) || []).reduce(function (s, t) { return s + num(t.realized_gain_loss_usd); }, 0)
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
    deps: ["wagesComputation", "foreignWagesUsd", "businessAndSeComputation", "retirementComputation", "directIncomeComputation", "epfNpsCrossBorder", "cfcInclusionResult"],
    compute: function (d, ctx) {
      var w = d.wagesComputation, biz = d.businessAndSeComputation, ret = d.retirementComputation, di = d.directIncomeComputation, epf = d.epfNpsCrossBorder;
      var cfc = d.cfcInclusionResult;
      var foreignInterest = di.foreignInterestUsd + epf.taxableEpfInterestUsd;
      var foreignPension = di.foreignPensionUsd + epf.taxableNpsWithdrawalUsd;

      var usSourceTotal = w.wagesUsd + biz.businessUsUsd + di.interestUsUsd + di.ordinaryDividendsUsUsd + di.ltcgUsUsd + di.stcgUsUsd + di.rentalUsUsd + ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd + di.otherOrdinaryIncomeUsUsd;
      // The elected pool's pre-tax NCTI/Subpart F is intentionally NOT added
      // here — it flows through cfcElectedPool into computeUsTaxCore's own
      // flat-tax add-on instead, mirroring how AMT/NIIT amounts don't appear
      // in this aggregate either.
      var foreignSourceTotal = d.foreignWagesUsd + biz.foreignSelfEmploymentUsd + foreignInterest + di.foreignDividendsUsd + di.foreignRentalUsd + foreignPension + di.foreignStcgUsd + di.foreignLtcgUsd + di.section988GainLossUsd + cfc.nonElectedOrdinaryInclusionUsd;

      return {
        wages: m(w.wagesUsd, ctx), businessUs: m(biz.businessUsUsd, ctx), w2Withholding: w.w2WithholdingUsd, w2Employers: w.w2Employers, medicareWages: w.medicareWagesUsd,
        qualifiedTipsUsd: w.qualifiedTipsUsd, qualifiedOvertimeUsd: w.qualifiedOvertimeUsd,
        seEarningsUsd: biz.seEarningsUsd, qbiIncomeUsd: biz.qbiIncomeUsd, qbiIsSSTB: biz.qbiIsSSTB,
        qbiWagesUsd: biz.qbiWagesUsd, qbiUbiaUsd: biz.qbiUbiaUsd,
        usRetirementIncome: m(ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd, ctx),
        usRetirementIncomeExclSs: m(ret.usRetirementIncomeExclSsUsd, ctx),
        retirementDistributionsSubjectTo72tUsd: ret.retirementDistributionsSubjectTo72tUsd,
        socialSecurityUs: m(ret.socialSecurityUsUsd, ctx),
        taxExemptInterestUs: m(di.taxExemptInterestUsUsd, ctx),
        interestUs: m(di.interestUsUsd, ctx), ordinaryDividendsUs: m(di.ordinaryDividendsUsUsd, ctx), qualifiedDividendsUs: m(di.qualifiedDividendsUsUsd, ctx),
        ltcgUs: m(di.ltcgUsUsd, ctx), stcgUs: m(di.stcgUsUsd, ctx), capitalGainsUs: m(di.ltcgUsUsd + di.stcgUsUsd, ctx), rentalUs: m(di.rentalUsUsd, ctx),
        collectiblesLtcgUsd: di.collectiblesLtcgUsd, qsbsExcludedGainUsd: di.qsbsExcludedGainUsd, qsbsTaxableGainUsd: di.qsbsTaxableGainUsd,
        otherOrdinaryIncomeUs: m(di.otherOrdinaryIncomeUsUsd, ctx),
        foreignWages: m(d.foreignWagesUsd, ctx), foreignSelfEmployment: m(biz.foreignSelfEmploymentUsd, ctx),
        foreignInterest: m(foreignInterest, ctx), foreignDividends: m(di.foreignDividendsUsd, ctx),
        foreignRental: m(di.foreignRentalUsd, ctx), foreignPension: m(foreignPension, ctx),
        foreignStcg: m(di.foreignStcgUsd, ctx), foreignLtcg: m(di.foreignLtcgUsd, ctx),
        foreignCapitalGains: m(di.foreignStcgUsd + di.foreignLtcgUsd, ctx),
        foreignSection988GainLoss: m(di.section988GainLossUsd, ctx),
        cfcNonElectedInclusionUs: m(cfc.nonElectedOrdinaryInclusionUsd, ctx),
        cfcElectedPool: cfc.electedPool,       // raw numbers, not money-converted — consumed directly by computeUsTaxCore
        cfcPerEntityTrace: cfc.perCfcTrace,    // for the findings/entity-graph consumers
        retirementEpfInterestUsd: epf.taxableEpfInterestUsd, retirementNpsWithdrawalUsd: epf.taxableNpsWithdrawalUsd,
        usSourceTotal: m(usSourceTotal, ctx), foreignSourceTotal: m(foreignSourceTotal, ctx),
        total: m(usSourceTotal + foreignSourceTotal, ctx)
      };
    }
  }
};

module.exports = {
  NODES: NODES,
  // SYS-1-style shared export: assets-nodes.js's businessEntitiesResult
  // used to hand-copy these exact functions rather than requiring them —
  // the copy silently missed the vehicle-mileage/home-office deduction
  // added here (task #41) until a differential-harness run against a
  // manual case caught the resulting JS-internal mismatch (businessUs vs
  // businessEntities disagreeing on the same self-employment entry).
  // Reusing the single definition removes that drift risk entirely,
  // matching the precedent already established for CONST.TAX.US_SEC179_*/
  // US_BONUS_*/US_MACRS_* above.
  computeSelfEmploymentNetProfitUsd: computeSelfEmploymentNetProfitUsd,
  selfEmploymentNetProfitUsd: selfEmploymentNetProfitUsd,
  computeFarmGrossIncomeUsd: computeFarmGrossIncomeUsd,
  computeFarmNetProfitUsd: computeFarmNetProfitUsd,
  farmNetProfitUsd: farmNetProfitUsd,
  vehicleDeductionUsd: vehicleDeductionUsd,
  homeOfficeDeductionUsd: homeOfficeDeductionUsd,
  vehicleAndHomeOfficeDeductionUsd: vehicleAndHomeOfficeDeductionUsd
};
