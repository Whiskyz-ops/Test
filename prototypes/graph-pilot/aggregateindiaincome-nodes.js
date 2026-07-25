"use strict";
/* ============================================================================
 * Closes the LAST boundary across this whole effort: aggregateIndiaIncome's
 * capital-gains/business-income classification — the 800+ lines deferred,
 * stated explicitly, in every prior phase (IN-1, the full India tax
 * computation, computeIndiaEntityTax).
 *
 * Ported in full, read fresh from source before writing graph code, not
 * from memory: business.inr's EXACT depreciation-adjusted value (WDV
 * block-of-assets, half-year convention, s.32(1)(iia) additional
 * depreciation, s.40(a)/s.40A(3)/s.43B(h) disallowances), the complete
 * capital-gains classification (buy-back pre/post-Oct2024, foreign equity
 * >24mo, financial_holdings across GROUP_A/C/D/E/G/XII-A, commodities,
 * unlisted equity), and otherSourcesMisc's full formula.
 *
 * holdingPeriodMismatches (flagged as an open gap during the "have you
 * considered everything" audit) is now also ported — the buy-back and
 * foreign-equity loops in capitalGainsComputation build this array
 * alongside their existing gain totals, matching normalize.js's own
 * interleaving exactly (same loop, same push() calls). It's a raw side-
 * output only: the actual holding_period_mismatch_* FINDING in
 * conflicts.js additionally calls the real computeUsTax twice per mismatch
 * to price the dollar impact — that recompute-and-diff step is not part of
 * this boundary and stays out of scope here, same as every other finding
 * built on top of a closed boundary in this effort.
 *
 * Self-contained — does not import in1-nodes-v2.js/v3.js, to avoid
 * cross-file dependency-ordering assumptions; some nodes here duplicate
 * logic already proven in earlier phases (annualSlice, business-entry
 * classification), re-verified here independently rather than trusted by
 * reference.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function monthsBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  var a = new Date(fromStr), b = new Date(toStr);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return ((b - a) / (1000 * 60 * 60 * 24)) / 30.436875;
}
/* SYS-1: shared import (promoted into constants.js from normalize-local). */
var CONST_AGGIN = require("./constants.js").CONST;
var ASSET_CLASS_RATES_INDIA = CONST_AGGIN.TAX.INDIA.ASSET_CLASS_RATES_INDIA;
function isUnder180DaysAdditionInr(additionDateStr) {
  if (!additionDateStr) return false;
  var d = new Date(additionDateStr);
  if (isNaN(d.getTime())) return false;
  var month = d.getMonth(), date = d.getDate();
  return (month === 9 && date >= 4) || month > 9 || month <= 2;
}
function computeAssetBlockNormalDepreciationInr(block) {
  var rate = ASSET_CLASS_RATES_INDIA[block.asset_class];
  if (!rate) return 0;
  var opening = num(block.opening_wdv_inr), additions = num(block.additions_during_year_inr), sale = num(block.sale_consideration_inr);
  var wdvBeforeDep = opening + additions - sale;
  if (wdvBeforeDep <= 0) return 0;
  var halfYear = additions > 0 && isUnder180DaysAdditionInr(block.addition_date);
  if (!halfYear) return wdvBeforeDep * rate;
  var fullRateBase = Math.max(0, opening - sale);
  var saleAgainstAdditions = Math.max(0, sale - opening);
  var halfRateBase = Math.max(0, additions - saleAgainstAdditions);
  return Math.min(wdvBeforeDep, fullRateBase * rate + halfRateBase * rate * 0.5);
}
function additionalDepreciationEligibleInr(india, entry) {
  var entityType = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
  var isCompany = entityType === "company";
  var isConcessionalCompany = isCompany && (safe(india, "profile.opt_115baa", false) === true || safe(india, "profile.opt_115bab", false) === true || safe(india, "profile.opt_115ba", false) === true);
  var isNewRegimeIndHuf = (entityType === "individual" || entityType === "huf") && (safe(india, "profile.tax_regime", "NEW") || "NEW").toUpperCase() !== "OLD";
  var regimeDisallows = isConcessionalCompany || isNewRegimeIndHuf;
  var hasMfgOrPowerGen = entry.business_code === "01000" || entry.business_code === "power_gen";
  return hasMfgOrPowerGen && !regimeDisallows;
}
function computeAssetBlockAdditionalDepreciationInr(block, india, entry) {
  if (block.asset_class !== "plant_machinery_general" || block.is_new_manufacturing_asset !== true) return 0;
  var additions = num(block.additions_during_year_inr);
  if (additions <= 0) return 0;
  if (!additionalDepreciationEligibleInr(india, entry)) return 0;
  var rate = isUnder180DaysAdditionInr(block.addition_date) ? 0.10 : 0.20;
  return additions * rate;
}
function aggregateEntryDepreciationInr(entryIdx, assetBlocks, india, entry) {
  var total = 0;
  (assetBlocks || []).forEach(function (block) {
    if (block.unit_biz_idx !== entryIdx) return;
    total += computeAssetBlockNormalDepreciationInr(block);
    total += computeAssetBlockAdditionalDepreciationInr(block, india, entry);
  });
  return total;
}
function computeMsmeDisallowanceInr(entryIdx, msmePayables) {
  var total = 0, today = new Date(); today.setHours(0, 0, 0, 0);
  (msmePayables || []).forEach(function (m) {
    if (m.unit_biz_idx !== entryIdx) return;
    var amt = num(m.amount_inr);
    if (!m.invoice_date || amt <= 0) return;
    var invDate = new Date(m.invoice_date); invDate.setHours(0, 0, 0, 0);
    if (isNaN(invDate.getTime())) return;
    var dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + (m.has_written_agreement === true ? 45 : 15));
    var refDate = m.payment_date ? new Date(m.payment_date) : today;
    refDate.setHours(0, 0, 0, 0);
    if (refDate > dueDate) total += amt;
  });
  return total;
}
function aggregateEntryDisallowancesInr(entryIdx, exp, msmePayables) {
  var s40aI = num(exp.payments_to_non_residents_no_tds_inr);
  var s40aIa = Math.round(num(exp.payments_to_residents_no_tds_inr) * 0.30);
  var s40A3 = num(exp.total_cash_payments_exceeding_limit_inr) + num(exp.total_cash_payments_exceeding_35k_inr);
  var s43Bh = computeMsmeDisallowanceInr(entryIdx, msmePayables);
  return s40aI + s40aIa + s40A3 + s43Bh;
}
function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
  var total = digitalInr + cashInr;
  var atLeast95PctDigital = total > 0 && (cashInr / total) <= 0.05;
  if (scheme === "s44AD") return atLeast95PctDigital ? 30000000 : 20000000;
  if (scheme === "s44ADA") return atLeast95PctDigital ? 7500000 : 5000000;
  return Infinity;
}
function usesRegularBooksInr(b, eligibility) {
  var scheme = b.presumptive_scheme;
  if (scheme === "s44AD") { var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr); return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh)); }
  if (scheme === "s44ADA") { var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr); var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh); return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)); }
  if (scheme === "s44AE") return false;
  return true;
}
function computeBusinessEntryNetProfitInr(b, eligibility, depreciationInr, disallowancesInr) {
  eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
  var scheme = b.presumptive_scheme;
  var adaReceipts;
  if (scheme === "s44AD") {
    var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
    if (eligibility.eligible44AD && dig44AD + csh44AD <= presumptiveCeilingInr("s44AD", dig44AD, csh44AD)) return dig44AD * 0.06 + csh44AD * 0.08;
  } else if (scheme === "s44ADA") {
    var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
    adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
    if (eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)) return adaReceipts * 0.50;
  } else if (scheme === "s44AE") return null;
  var exp = b.expenses || {};
  var pfEsiDeductibleInr = exp.employer_pf_esi_paid_before_due_date === true ? num(exp.employer_pf_esi_contribution_inr) : 0;
  var deductibleBeforeDisallowances = num(exp.rent_for_business_premises_inr) + num(exp.repairs_maintenance_inr) +
    num(exp.employee_salary_wages_inr) + num(exp.employee_bonus_commission_inr) + num(exp.interest_on_borrowed_capital_inr) +
    num(exp.insurance_premium_inr) + num(exp.bad_debts_written_off_inr) + num(exp.other_business_expenses_inr) +
    num(exp.ca_professional_fees_inr) + pfEsiDeductibleInr;
  var deductible = Math.max(0, deductibleBeforeDisallowances - num(disallowancesInr));
  var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
  var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) ||
    (scheme === "s44AD" ? (dig + csh) : 0) || (scheme === "s44ADA" ? adaReceipts : 0);
  return receipts - deductible - num(depreciationInr);
}
function computeGoodsVehiclePresumptiveInr(vehicles) {
  var total = 0;
  (vehicles || []).forEach(function (v) {
    var months = num(v.months_owned);
    if (!(months > 0)) return;
    if (v.vehicle_type === "heavy") total += 1000 * num(v.gvw_tonnes) * months;
    else if (v.vehicle_type === "light") total += 7500 * months;
  });
  return total;
}
function toInrAtCurrency(amount, currency, usdToInrRate) {
  var amt = num(amount);
  if (!currency || currency === "INR") return amt;
  if (currency === "USD") return amt * usdToInrRate;
  return null;
}
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(inr, ctx) { return num(inr) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js

var GROUP_A_CLASSES = CONST_AGGIN.TAX.INDIA.CG_GROUP_A_CLASSES;
var GROUP_C_CLASSES = CONST_AGGIN.TAX.INDIA.CG_GROUP_C_CLASSES;
var S50AA_UNLISTED_DEBT_CUTOFF = "2024-07-23";

var NODES = {
  // ---- annual slice (re-verified independently, same logic as XB-25's port) ----
  annualSliceAgg: {
    deps: [],
    compute: function (d, ctx) {
      var india = ctx.india;
      var quarters = safe(india, "quarters", null);
      if (!quarters) return { domestic_income: safe(india, "domestic_income", {}), other_sources: safe(india, "other_sources", {}), capital_gains: safe(india, "capital_gains", {}), lrs_outbound: safe(india, "lrs_outbound", {}) };
      function merge(target, source) {
        for (var k in source) {
          if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
          var sv = source[k];
          if (sv === null || sv === undefined) continue;
          if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
          else if (typeof sv === "boolean") target[k] = target[k] || sv;
          else if (Array.isArray(sv)) { if (!Array.isArray(target[k])) target[k] = []; sv.forEach(function (el, i) { if (el && typeof el === "object") { target[k][i] = target[k][i] || {}; merge(target[k][i], el); } else if (target[k].indexOf(el) < 0) { target[k].push(el); } }); }
          else if (typeof sv === "object") { target[k] = target[k] || {}; merge(target[k], sv); }
          else { target[k] = sv; }
        }
        return target;
      }
      var out = { domestic_income: {}, other_sources: {}, capital_gains: {}, lrs_outbound: {} };
      ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) { var qs = quarters[q]; if (!qs) return; if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income); if (qs.other_sources) merge(out.other_sources, qs.other_sources); if (qs.capital_gains) merge(out.capital_gains, qs.capital_gains); if (qs.lrs_outbound) merge(out.lrs_outbound, qs.lrs_outbound); });
      return out;
    }
  },
  diAgg: { deps: ["annualSliceAgg"], compute: function (d) { return d.annualSliceAgg.domestic_income || {}; } },
  osAgg: { deps: ["annualSliceAgg"], compute: function (d) { return d.annualSliceAgg.other_sources || {}; } },
  cgAgg: { deps: ["annualSliceAgg"], compute: function (d) { return d.annualSliceAgg.capital_gains || {}; } },
  bizEntriesAgg: { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "business_income.business_entries", []); } },
  bizAssetBlocksAgg: { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "business_income.asset_blocks", []); } },
  bizMsmePayablesAgg: { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "business_income.msme_payables", []); } },
  goodsVehiclesAgg: { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "business_income.goods_vehicles", []); } },
  partnerFirmsAgg: { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "business_income.partner_firms", []); } },
  fnoIncomeInrAgg: { deps: ["diAgg"], compute: function (d) { return num(safe(d.diAgg, "business_income.non_speculative_income_inr", 0)); } },
  speculativeIncomeInrAgg: { deps: ["diAgg"], compute: function (d) { return num(safe(d.diAgg, "business_income.speculative_income_inr", 0)); } },
  // Closes AGG-1's last recorded knownMissing side-channel (normalize.js
  // L731) — used only by computeIndiaItrForm's (XBR-6) >Rs5,000 ITR-1/4
  // disqualifier, not otherwise taxed by this engine (agricultural income
  // is exempt under s.10(1)).
  agriculturalIncomeInrAgg: { deps: ["diAgg"], compute: function (d) { return num(safe(d.diAgg, "agricultural_income_inr", 0)); } },

  // Closes AGG-1's LAST remaining knownMissing side-channel (normalize.js
  // L1303) — needed for CFL-6 batch 2's s115bbe_unexplained_income finding.
  unexplained115bbeInrAgg: { deps: ["osAgg"], compute: function (d) { return num(safe(d.osAgg, "unexplained_income_115BBE_inr", 0)); } },

  indiaResidencyStatusRawAgg: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.final_india_residency_status", null); } },
  // IN-38: the DTAA Article 4 tie-break to the US doesn't change domestic
  // residential status (s.6) — see residency-nodes.js's file header for the
  // full reasoning — but it DOES mean worldwide income is outside India's
  // tax net under the treaty. Read here so capitalGainsComputation's
  // isIndiaRor gate (below) can exclude foreign financial holdings for a
  // treaty-ceding taxpayer without relying on the (now-fixed) status-
  // conflation bug that used to achieve this by accident.
  indiaDtaaWorldwideCededAgg: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.dtaa_worldwide_ceded", false) === true; } },
  presumptiveEligibilityAgg: {
    deps: ["indiaResidencyStatusRawAgg"],
    compute: function (d, ctx) {
      var india = ctx.india;
      var ror = d.indiaResidencyStatusRawAgg === "ROR";
      var entity = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
      var entityExcluded44AD = ["llp", "company", "aop", "trust", "local", "coop", "ajp"].indexOf(entity) >= 0;
      var eligible44AD = ror && !entityExcluded44AD;
      // indiaStatus/entityType/rorFails added for assets-nodes.js's
      // businessEntryIncomeTrace port (normalize.js L279-282) — previously
      // dropped since aggregateIndiaIncome's own totals never read them,
      // only a trace-display consumer needs the precise "why" facts.
      return { eligible44AD: eligible44AD, eligible44ADA: eligible44AD && entity !== "huf", indiaStatus: d.indiaResidencyStatusRawAgg, entityType: entity, rorFails: !ror };
    }
  },

  // ---- EXACT business.inr, with real WDV depreciation + disallowances ----
  businessComputation: {
    deps: ["bizEntriesAgg", "presumptiveEligibilityAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg", "goodsVehiclesAgg", "fnoIncomeInrAgg", "partnerFirmsAgg"],
    compute: function (d, ctx) {
      var india = ctx.india;
      var businessInr = 0, businessDepreciationInr = 0;
      var indiaHasRegularBooksEntry = false, indiaHasValidPresumptiveEntry = false;
      (d.bizEntriesAgg || []).forEach(function (b, idx) {
        var netProfitInr = b.net_profit_inr || b.net_profit;
        if (netProfitInr === undefined || netProfitInr === null) {
          var isRegularBooks = usesRegularBooksInr(b, d.presumptiveEligibilityAgg);
          if (isRegularBooks) indiaHasRegularBooksEntry = true; else indiaHasValidPresumptiveEntry = true;
          var entryDepreciationInr = isRegularBooks ? aggregateEntryDepreciationInr(idx, d.bizAssetBlocksAgg, india, b) : 0;
          var entryDisallowancesInr = isRegularBooks ? aggregateEntryDisallowancesInr(idx, b.expenses || {}, d.bizMsmePayablesAgg) : 0;
          netProfitInr = computeBusinessEntryNetProfitInr(b, d.presumptiveEligibilityAgg, entryDepreciationInr, entryDisallowancesInr);
          businessDepreciationInr += entryDepreciationInr;
        } else { indiaHasRegularBooksEntry = true; }
        businessInr += num(netProfitInr);
      });
      businessInr += computeGoodsVehiclePresumptiveInr(d.goodsVehiclesAgg);
      businessInr += d.fnoIncomeInrAgg;
      var indiaHasPartnerFirmIncome = false;
      (d.partnerFirmsAgg || []).forEach(function (firm) {
        var firmIncomeInr = num(firm.remuneration_from_entity_inr) + num(firm.interest_on_capital_from_entity_inr);
        if (firmIncomeInr !== 0) indiaHasPartnerFirmIncome = true;
        businessInr += firmIncomeInr;
      });
      return { businessInr: businessInr, businessDepreciationInr: businessDepreciationInr, indiaHasRegularBooksEntry: indiaHasRegularBooksEntry, indiaHasValidPresumptiveEntry: indiaHasValidPresumptiveEntry, indiaHasPartnerFirmIncome: indiaHasPartnerFirmIncome };
    }
  },

  // ---- capital gains: buy-back + foreign equity + financial holdings +
  // commodities + unlisted equity, ported in full -----------------------
  capitalGainsComputation: {
    deps: ["indiaResidencyStatusRawAgg", "indiaDtaaWorldwideCededAgg", "cgAgg", "osAgg", "diAgg"],
    compute: function (d, ctx) {
      var india = ctx.india, os = d.osAgg, annualCg = d.cgAgg;
      var USD_TO_INR = fxRate(ctx);
      var buybackTxs = safe(india, "share_buyback.transactions", []) || [];
      var deemedDividendInr = num(safe(os, "deemed_dividend_from_buyback_inr", 0));
      var buybackLtcgInr = num(safe(annualCg, "buyback_ltcg_inr", 0));
      var buybackStcgInr = num(safe(annualCg, "buyback_stcg_inr", 0));
      var buybackStcgSlabInr = num(safe(os, "buyback_stcg_slab_inr", 0));
      var buybackLtcg197Inr = 0, promoterBuybackLtcgInr = 0, promoterBuybackStcgInr = 0;
      var holdingPeriodMismatches = [];
      buybackTxs.forEach(function (bb) {
        if (bb.buyback_pre_or_post_oct2024 === "post_oct2024") { deemedDividendInr += num(bb.consideration_received_inr); }
        else if (bb.buyback_pre_or_post_oct2024 === "capital_gains_era") {
          var g = num(bb.capital_gain_or_loss);
          if (bb.gain_classification === "ltcg") {
            if (bb.is_listed) buybackLtcgInr += g; else buybackLtcg197Inr += g;
            if (bb.is_promoter && g > 0) promoterBuybackLtcgInr += g;
          } else if (bb.gain_classification === "stcg") {
            buybackStcgInr += g;
            if (bb.is_promoter && g > 0) promoterBuybackStcgInr += g;
          } else if (bb.gain_classification === "stcg_slab") { buybackStcgSlabInr += g; }

          var bbMonths = monthsBetween(bb.original_acquisition_date, bb.buyback_date);
          if (bbMonths !== null && g > 0 && bb.gain_classification) {
            var bbUsClassification = bbMonths > 12 ? "ltcg" : "stcg";
            var bbIndiaClassification = bb.gain_classification === "ltcg" ? "ltcg" : "stcg";
            if (bbUsClassification !== bbIndiaClassification) {
              holdingPeriodMismatches.push({
                companyName: bb.company_name || "Unnamed company", isListed: !!bb.is_listed, monthsHeld: bbMonths,
                gainInr: g, gainUsd: inrToUsd(g, ctx), indiaClassification: bbIndiaClassification, usClassification: bbUsClassification,
                indiaThresholdMonths: bb.is_listed ? 12 : 24, sourceType: "buyback"
              });
            }
          }
        }
      });

      // IN-38: ROR alone isn't enough — a domestically-ROR taxpayer who
      // ceded worldwide taxation via a DTAA Article 4 tie-break to the US
      // shouldn't have foreign financial holdings taxed by India either.
      // IN-39: this gate applies ONLY to foreign_equity_unlisted (foreign
      // holdings, in scope only for ROR/non-ceded worldwide taxation).
      // India-registered instruments (listed_equity, mutual funds, bonds,
      // etc., below) are India-source under s.9(1)(i) and stay taxable
      // regardless of residency/treaty status — a separate, deliberately
      // UNGATED read, matching normalize.js's own two-reads structure
      // (~809-811 gated, ~995 ungated). Sharing one gated array between
      // both loops used to wrongly zero out domestic holdings for any
      // non-ROR (or DTAA-ceded) taxpayer.
      var isIndiaRor = d.indiaResidencyStatusRawAgg === "ROR" && !d.indiaDtaaWorldwideCededAgg;
      var foreignFinancialHoldingsTxs = isIndiaRor ? (safe(india, "financial_holdings.transactions", []) || []) : [];
      var foreignEquityLtcg197Inr = 0, foreignEquityStcgSlabInr = 0;
      foreignFinancialHoldingsTxs.forEach(function (tx) {
        if (tx.asset_class !== "foreign_equity_unlisted") return;
        if (!tx.sale_date || tx.sale_value === null || tx.sale_value === undefined || tx.sale_value === "") return;
        var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
        var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
        if (saleInr === null || purchaseInr === null) return;
        var months = monthsBetween(tx.acquisition_date, tx.sale_date);
        if (months === null) return;
        var g = saleInr - purchaseInr - num(tx.transfer_expenses);
        var feIndiaClassification = months > 24 ? "ltcg" : "stcg";
        if (feIndiaClassification === "ltcg") foreignEquityLtcg197Inr += g; else foreignEquityStcgSlabInr += g;
        if (g > 0) {
          var feUsClassification = months > 12 ? "ltcg" : "stcg";
          if (feUsClassification !== feIndiaClassification) {
            holdingPeriodMismatches.push({
              companyName: tx.asset_name_or_ticker || "Unnamed foreign holding", isListed: false, monthsHeld: months,
              gainInr: g, gainUsd: inrToUsd(g, ctx), indiaClassification: feIndiaClassification, usClassification: feUsClassification,
              indiaThresholdMonths: 24, sourceType: "foreign_equity"
            });
          }
        }
      });

      var chapterXiiaElected = safe(india, "compliance_docs.chapter_xiia_elected", false) === true;
      var otherLtcg198Inr = 0, otherStcg20Inr = 0, otherLtcg197Inr = 0, otherStcgSlabInr = 0, vdaGainInr = 0, vdaSaleConsiderationInr = 0;
      var chapterXiiaInvestmentIncomeInr = 0, chapterXiiaSfeaHoldingCount = 0;
      (safe(india, "financial_holdings.transactions", []) || []).forEach(function (tx) {
        var cls = tx.asset_class;
        if (!cls || cls === "foreign_equity_unlisted") return;
        if (chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true) {
          chapterXiiaSfeaHoldingCount += 1;
          var invIncomeInr = toInrAtCurrency(tx.investment_income_this_year, tx.investment_income_currency || "INR", USD_TO_INR);
          if (invIncomeInr !== null) chapterXiiaInvestmentIncomeInr += num(invIncomeInr);
        }
        if (cls === "nri_specified_company_deposit") return;
        if (!tx.sale_date || tx.sale_value === null || tx.sale_value === undefined || tx.sale_value === "") return;
        var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
        var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
        if (saleInr === null || purchaseInr === null) return;
        if (cls === "vda_crypto") {
          vdaSaleConsiderationInr += saleInr;
          var vg = saleInr - purchaseInr - num(tx.transfer_expenses);
          if (vg > 0) vdaGainInr += vg;
          return;
        }
        if ((cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") && tx.nri_exit_type !== "sold_to_third_party") return;
        var months = monthsBetween(tx.acquisition_date, tx.sale_date);
        if (months === null) return;
        var costBasisInr = purchaseInr;
        if ((cls === "listed_equity" || cls === "equity_mutual_fund") && tx.fmv_31jan2018_per_unit_inr && tx.quantity) {
          var fmvTotalInr = num(tx.fmv_31jan2018_per_unit_inr) * num(tx.quantity);
          costBasisInr = Math.max(purchaseInr, Math.min(fmvTotalInr, saleInr));
        }
        var g2 = saleInr - costBasisInr - num(tx.transfer_expenses);
        var isChapterXiiaListedEquity = cls === "listed_equity" && chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true;
        if (cls === "debt_mutual_fund_post_apr23") { otherStcgSlabInr += g2; }
        else if (cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") {
          if (tx.stt_paid !== false) { if (months > 12) otherLtcg197Inr += g2; else otherStcgSlabInr += g2; }
          else if (tx.sale_date >= S50AA_UNLISTED_DEBT_CUTOFF) { otherStcgSlabInr += g2; }
          else if (months > 24) { otherLtcg197Inr += g2; } else { otherStcgSlabInr += g2; }
        } else if (isChapterXiiaListedEquity && months > 12) { otherLtcg197Inr += g2; }
        else if (isChapterXiiaListedEquity) { otherStcg20Inr += g2; }
        else if (GROUP_A_CLASSES.indexOf(cls) !== -1 && tx.stt_paid !== false) { if (months > 12) otherLtcg198Inr += g2; else otherStcg20Inr += g2; }
        else if (GROUP_A_CLASSES.indexOf(cls) !== -1) { if (months > 12) otherLtcg197Inr += g2; else otherStcgSlabInr += g2; }
        else if (cls === "bond_listed") { if (months > 12) otherLtcg197Inr += g2; else otherStcgSlabInr += g2; }
        else if (GROUP_C_CLASSES.indexOf(cls) !== -1) { if (months > 24) otherLtcg197Inr += g2; else otherStcgSlabInr += g2; }
      });

      var commodityLtcg197Inr = 0, commodityStcgSlabInr = 0;
      (safe(india, "commodities.transactions", []) || []).forEach(function (tx) {
        if (tx.is_maturity_redemption === true) return;
        if (!tx.sale_date || tx.sale_value === null || tx.sale_value === undefined || tx.sale_value === "") return;
        var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
        var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
        if (saleInr === null || purchaseInr === null) return;
        var months = monthsBetween(tx.acquisition_date, tx.sale_date);
        if (months === null) return;
        var g3 = saleInr - purchaseInr;
        var ctype = tx.commodity_type;
        if (ctype === "gold_etf" || ctype === "gold_fund_of_funds") { commodityStcgSlabInr += g3; }
        else if (ctype === "sovereign_gold_bond_original" || ctype === "sovereign_gold_bond_secondary") { if (months > 12) commodityLtcg197Inr += g3; else commodityStcgSlabInr += g3; }
        else { if (months > 24) commodityLtcg197Inr += g3; else commodityStcgSlabInr += g3; }
      });

      var unlistedEquityLtcg197Inr = 0, unlistedEquityStcgSlabInr = 0;
      (safe(india, "unlisted_equity.transactions", []) || []).forEach(function (tx) {
        if (!tx.sale_date || tx.sale_price_per_share === null || tx.sale_price_per_share === undefined || tx.sale_price_per_share === "") return;
        var shares = num(tx.number_of_shares);
        if (!(shares > 0)) return;
        var saleInr = toInrAtCurrency(num(tx.sale_price_per_share) * shares, tx.sale_price_per_share_currency, USD_TO_INR);
        var purchaseInr;
        if (tx.original_investment_currency && tx.original_investment_currency !== "INR" && tx.original_cost_in_foreign_currency != null) {
          purchaseInr = toInrAtCurrency(num(tx.original_cost_in_foreign_currency), tx.original_investment_currency, USD_TO_INR);
        } else { purchaseInr = toInrAtCurrency(num(tx.cost_per_share) * shares, tx.cost_per_share_currency, USD_TO_INR); }
        if (saleInr === null || purchaseInr === null) return;
        var months = monthsBetween(tx.acquisition_date, tx.sale_date);
        if (months === null) return;
        var g4 = saleInr - purchaseInr;
        if (months > 24) unlistedEquityLtcg197Inr += g4; else unlistedEquityStcgSlabInr += g4;
      });

      var stcgInr = num(safe(d.diAgg, "capital_gains.short_term_15_pct", 0)) + num(safe(annualCg, "stcg_111a_inr", 0)) + buybackStcgInr + otherStcg20Inr;
      var ltcgInr = num(safe(annualCg, "ltcg_112a_inr", 0)) + buybackLtcgInr + otherLtcg198Inr;
      var ltcg197Inr = buybackLtcg197Inr + foreignEquityLtcg197Inr + otherLtcg197Inr + commodityLtcg197Inr + unlistedEquityLtcg197Inr;
      var stcgSlabInr = buybackStcgSlabInr + foreignEquityStcgSlabInr + otherStcgSlabInr + commodityStcgSlabInr + unlistedEquityStcgSlabInr;

      return {
        stcgInr: stcgInr, ltcgInr: ltcgInr, ltcg197Inr: ltcg197Inr, stcgSlabInr: stcgSlabInr,
        vdaGainInr: vdaGainInr, vdaSaleConsiderationInr: vdaSaleConsiderationInr,
        chapterXiiaInvestmentIncomeInr: chapterXiiaInvestmentIncomeInr,
        chapterXiiaSfeaHoldingCount: chapterXiiaSfeaHoldingCount,
        deemedDividendInr: deemedDividendInr, promoterBuybackLtcgInr: promoterBuybackLtcgInr, promoterBuybackStcgInr: promoterBuybackStcgInr,
        holdingPeriodMismatches: holdingPeriodMismatches
      };
    }
  },

  // ---- otherSourcesMisc, full formula -------------------------------------
  otherSourcesMiscComputation: {
    deps: ["osAgg", "diAgg"],
    compute: function (d) {
      var os = d.osAgg;
      // s.56(2)(x) exemption: a gift received on the occasion of marriage,
      // or from a specified relative, is entirely exempt -- not merely
      // "under 50k". Layer 1 collects the amount AND these two checkboxes;
      // previously only the amount was ever read, so a preparer had no way
      // to tell the engine an entered gift was exempt other than deleting
      // the amount (losing the recordkeeping too).
      var giftsExempt = !!safe(os, "gifts_exemption_marriage", false) || !!safe(os, "gifts_exemption_relative", false);
      var giftsAbove50kInr = giftsExempt ? 0 : num(safe(os, "gifts_above_50k_inr", 0));
      var familyPensionGrossInr = num(safe(os, "family_pension_gross_inr", 0));
      var familyPensionNetInr = Math.max(0, familyPensionGrossInr - Math.min(15000, Math.round(familyPensionGrossInr / 3)));
      return giftsAbove50kInr + familyPensionNetInr + num(safe(os, "spousal_clubbing_s64_inr", 0)) -
        num(safe(os, "minor_child_exemption_inr", 0)) + num(safe(os, "lic_maturity_inr", 0)) +
        num(safe(os, "angel_tax_premium_inr", 0)) - num(safe(os, "local_authority_s10_20_inr", 0)) +
        num(safe(os, "miscellaneous_income_inr", 0)) + num(safe(os, "taxable_epf_interest_inr", 0)) + num(safe(os, "taxable_nps_withdrawal_inr", 0));
    }
  },

  // ---- final total, matching aggregateIndiaIncome's own formula exactly ---
  totalIndiaIncomeInr: {
    deps: ["businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "diAgg", "osAgg"],
    compute: function (d, ctx) {
      var india = ctx.india;
      var di = d.diAgg;
      var salaryInr = num(safe(di, "salary.taxable_salary_inr", null)) || num(safe(di, "salary.gross_salary_inr", 0));
      var hpProps = safe(di, "house_property.properties", []) || [];
      var housePropertyInr = hpProps.reduce(function (s, p) { return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0); }, 0);
      var os = d.osAgg;
      var interestInr = num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) + num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) + num(safe(di, "other_sources.interest_inr", 0));
      var dividendInr = num(safe(os, "dividend_inr", 0));
      var specialRate115bbInr = num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
      var bc = d.businessComputation, cg = d.capitalGainsComputation;
      return salaryInr + bc.businessInr + housePropertyInr + interestInr + dividendInr + cg.stcgInr + cg.ltcgInr +
        specialRate115bbInr + cg.deemedDividendInr + cg.stcgSlabInr + cg.ltcg197Inr + cg.vdaGainInr +
        cg.chapterXiiaInvestmentIncomeInr + d.otherSourcesMiscComputation;
    }
  },

  /* Built for the monitor-next integration (not a tracker row — every field
   * here already exists as a verified computation elsewhere in this file;
   * this only ASSEMBLES them into the exact shape aggregateIndiaIncome
   * itself returns, normalize.js L1304-1336, money-object fields included —
   * the India-side mirror of aggregateUsIncomeResult, which already has
   * this treatment). Every field name/derivation below is copied directly
   * from that return statement; verified field-for-field against the real
   * model.income.india in run-aggregateindiaincome.js. */
  indiaIncomeModelResult: {
    deps: ["businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "diAgg", "osAgg",
      "fnoIncomeInrAgg", "speculativeIncomeInrAgg"],
    compute: function (d, ctx) {
      function m(inr) { return { inr: inr, usd: inr / fxRate(ctx) }; }

      var di = d.diAgg, os = d.osAgg;
      var salaryInr = num(safe(di, "salary.taxable_salary_inr", null)) || num(safe(di, "salary.gross_salary_inr", 0));
      var hpProps = safe(di, "house_property.properties", []) || [];
      var housePropertyInr = hpProps.reduce(function (s, p) { return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0); }, 0);
      var interestInr = num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) + num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) + num(safe(di, "other_sources.interest_inr", 0));
      var dividendInr = num(safe(os, "dividend_inr", 0));
      var specialRate115bbInr = num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
      var agriculturalIncomeInr = num(safe(di, "agricultural_income_inr", 0));
      var unexplained115bbeInr = num(safe(os, "unexplained_income_115BBE_inr", 0));

      var bc = d.businessComputation, cg = d.capitalGainsComputation;
      var total = salaryInr + bc.businessInr + housePropertyInr + interestInr + dividendInr + cg.stcgInr + cg.ltcgInr +
        specialRate115bbInr + cg.deemedDividendInr + cg.stcgSlabInr + cg.ltcg197Inr + cg.vdaGainInr +
        cg.chapterXiiaInvestmentIncomeInr + d.otherSourcesMiscComputation;

      return {
        salary: m(salaryInr), business: m(bc.businessInr), businessDepreciationInr: bc.businessDepreciationInr,
        businessFnoIncomeInr: d.fnoIncomeInrAgg, speculativeIncomeInr: d.speculativeIncomeInrAgg,
        housePropertyCount: hpProps.length, agriculturalIncomeInr: agriculturalIncomeInr,
        indiaHasRegularBooksEntry: bc.indiaHasRegularBooksEntry, indiaHasValidPresumptiveEntry: bc.indiaHasValidPresumptiveEntry,
        indiaHasPartnerFirmIncome: bc.indiaHasPartnerFirmIncome,
        houseProperty: m(housePropertyInr),
        interest: m(interestInr), dividend: m(dividendInr), otherSourcesMisc: m(d.otherSourcesMiscComputation),
        stcg: m(cg.stcgInr), ltcg: m(cg.ltcgInr), ltcg197Inr: cg.ltcg197Inr,
        capitalGains: m(cg.stcgInr + cg.ltcgInr + cg.ltcg197Inr),
        specialRate115bb: m(specialRate115bbInr),
        deemedDividendBuyback: m(cg.deemedDividendInr),
        stcgSlabInr: cg.stcgSlabInr,
        vdaGainInr: cg.vdaGainInr,
        vdaSaleConsiderationInr: cg.vdaSaleConsiderationInr,
        chapterXiiaInvestmentIncomeInr: cg.chapterXiiaInvestmentIncomeInr,
        chapterXiiaSfeaHoldingCount: cg.chapterXiiaSfeaHoldingCount,
        promoterBuybackLtcgInr: cg.promoterBuybackLtcgInr,
        promoterBuybackStcgInr: cg.promoterBuybackStcgInr,
        holdingPeriodMismatches: cg.holdingPeriodMismatches,
        unexplained115bbeInr: unexplained115bbeInr,
        total: m(total)
      };
    }
  }
};

module.exports = { NODES: NODES };
