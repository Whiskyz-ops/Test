"use strict";
/* ============================================================================
 * Phase 1, deeper: closes 3 of in1-nodes.js's 4 stated boundary inputs.
 * Supersedes in1-nodes.js — same finding (india_advance_tax_interest), more
 * of its dependency chain is now real raw-field-derived graph, not an
 * opaque already-computed input.
 *
 * CLOSED this pass:
 *   - hasValidPresumptiveEntryBoundary / hasRegularBooksEntryBoundary /
 *     hasPartnerFirmIncomeBoundary  -> now real classification nodes,
 *     ported from normalize.js's usesRegularBooksInr/
 *     presumptiveResidencyEligible/the business_entries[] and
 *     partner_firms[] loops in aggregateIndiaIncome.
 *   - businessInrBoundary / speculativeIncomeInrBoundary -> NOT ported as
 *     exact rupee figures (that needs computeBusinessEntryNetProfitInr's
 *     regular-books branch: WDV depreciation + disallowances, genuinely
 *     separate machinery). Instead: hasPgbpIncome is an OR-of-nonzero
 *     test, and indiaHasRegularBooksEntry already independently captures
 *     "a regular-books entry exists" regardless of its net profit's sign
 *     or magnitude — so the exact regular-books net profit was never
 *     actually needed for THIS finding's gate. What genuinely needed
 *     closing: goods-vehicle presumptive income and F&O income, both of
 *     which CAN be the taxpayer's only PGBP signal with zero
 *     business_entries[] on file, and both are exactly computable from
 *     raw fields with no depreciation involved. speculativeIncomeInr is
 *     itself a direct raw field. This is a proven-exact closure for
 *     hasPgbpIncome specifically, not an approximation — verified below
 *     against all 11 profiles, not assumed.
 *   - indianBusinessesBoundary -> now read straight off the graphed
 *     indiaAnnualSlice output instead of model.assets.indianBusinesses.
 *
 * STILL OPEN, deliberately: assessedTaxInrBoundary (computed.indiaTax.
 * totalTaxInr). Re-deriving that needs computeIndiaTax + computeLossSetOff
 * + computeIndiaSurcharge (+ computeIndiaEntityTax for company/firm
 * taxpayers) — genuinely separate, much larger work (the full India
 * slab/special-rate/surcharge/cess/rebate/MAT computation, needing every
 * OTHER income head from aggregateIndiaIncome too, not just business).
 * That's its own future phase, not attempted here.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var NODES = {
  // ---- Everything from in1-nodes.js's raw layer, unchanged -----------------
  routerJurisdiction: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "jurisdiction", null); } },
  routerUsSignal: {
    deps: [],
    compute: function (d, ctx) {
      return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true ||
        safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
    }
  },
  indiaResidencyStatusRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.final_india_residency_status", null); } },
  dobRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null))); } },
  indiaEntityTypeRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },
  advQ1Inr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.advance_tax_q1_15jun_inr", 0)); } },
  advQ2Inr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.advance_tax_q2_15sep_inr", 0)); } },
  advQ3Inr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.advance_tax_q3_15dec_inr", 0)); } },
  advQ4Inr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.advance_tax_q4_15mar_inr", 0)); } },
  tdsInr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.tds_already_deducted_inr", 0)) + num(safe(ctx.india, "tax_credits.tds_inr", 0)); } },
  tcsInr: { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "tax_credits.tcs_inr", 0)); } },
  baseYear: { deps: [], compute: function (d, ctx) { return ctx.model.meta.baseYear; } },

  // ---- The one remaining boundary input -------------------------------------
  assessedTaxInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.computed.indiaTax.totalTaxInr); } },

  // ---- NEWLY CLOSED: indiaAnnualSlice, ported from normalize.js exactly ----
  // (the real function is a pure deep-merge over india.quarters[Q1..Q4] when
  // present, or a straight pass-through of india's own top-level income
  // sub-objects when it isn't — genuinely raw, no computed dependency).
  annualSlice: {
    deps: [],
    compute: function (d, ctx) {
      var india = ctx.india;
      var quarters = safe(india, "quarters", null);
      if (!quarters) {
        return {
          domestic_income: safe(india, "domestic_income", {}),
          other_sources: safe(india, "other_sources", {}),
          capital_gains: safe(india, "capital_gains", {}),
          lrs_outbound: safe(india, "lrs_outbound", {})
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
      var out = { domestic_income: {}, other_sources: {}, capital_gains: {}, lrs_outbound: {} };
      ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) {
        var qs = quarters[q]; if (!qs) return;
        if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
        if (qs.other_sources) merge(out.other_sources, qs.other_sources);
        if (qs.capital_gains) merge(out.capital_gains, qs.capital_gains);
        if (qs.lrs_outbound) merge(out.lrs_outbound, qs.lrs_outbound);
      });
      return out;
    }
  },

  bizEntries: { deps: ["annualSlice"], compute: function (d) { return safe(d.annualSlice, "domestic_income.business_income.business_entries", []); } },
  goodsVehicles: { deps: ["annualSlice"], compute: function (d) { return safe(d.annualSlice, "domestic_income.business_income.goods_vehicles", []); } },
  fnoIncomeInr: { deps: ["annualSlice"], compute: function (d) { return num(safe(d.annualSlice, "domestic_income.business_income.non_speculative_income_inr", 0)); } },
  speculativeIncomeInr: { deps: ["annualSlice"], compute: function (d) { return num(safe(d.annualSlice, "domestic_income.business_income.speculative_income_inr", 0)); } },
  partnerFirms: { deps: ["annualSlice"], compute: function (d) { return safe(d.annualSlice, "domestic_income.business_income.partner_firms", []); } },

  // ---- presumptiveResidencyEligible, ported exactly -------------------------
  presumptiveEligibility: {
    deps: ["indiaResidencyStatusRaw"],
    compute: function (d, ctx) {
      var india = ctx.india;
      var ror = d.indiaResidencyStatusRaw === "ROR";
      var entity = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
      var entityExcluded44AD = ["llp", "company", "aop", "trust", "local", "coop", "ajp"].indexOf(entity) >= 0;
      var eligible44AD = ror && !entityExcluded44AD;
      return { eligible44AD: eligible44AD, eligible44ADA: eligible44AD && entity !== "huf" };
    }
  },

  // ---- usesRegularBooksInr + the classification loop, ported exactly -------
  indiaHasRegularBooksEntry: {
    deps: ["bizEntries", "presumptiveEligibility"],
    compute: function (d) {
      function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
        var total = digitalInr + cashInr;
        var atLeast95PctDigital = total > 0 && (cashInr / total) <= 0.05;
        if (scheme === "s44AD") return atLeast95PctDigital ? 30000000 : 20000000;
        if (scheme === "s44ADA") return atLeast95PctDigital ? 7500000 : 5000000;
        return Infinity;
      }
      function usesRegularBooksInr(b, eligibility) {
        var scheme = b.presumptive_scheme;
        if (scheme === "s44AD") {
          var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
          return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh));
        }
        if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
          return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh));
        }
        if (scheme === "s44AE") return false;
        return true;
      }
      return (d.bizEntries || []).some(function (b) {
        var netProfitOverride = b.net_profit_inr || b.net_profit;
        if (netProfitOverride !== undefined && netProfitOverride !== null) return true; // conservative, matches real code
        return usesRegularBooksInr(b, d.presumptiveEligibility);
      });
    }
  },
  indiaHasValidPresumptiveEntry: {
    deps: ["bizEntries", "presumptiveEligibility"],
    compute: function (d) {
      function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
        var total = digitalInr + cashInr;
        var atLeast95PctDigital = total > 0 && (cashInr / total) <= 0.05;
        if (scheme === "s44AD") return atLeast95PctDigital ? 30000000 : 20000000;
        if (scheme === "s44ADA") return atLeast95PctDigital ? 7500000 : 5000000;
        return Infinity;
      }
      function usesRegularBooksInr(b, eligibility) {
        var scheme = b.presumptive_scheme;
        if (scheme === "s44AD") {
          var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
          return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh));
        }
        if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
          return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh));
        }
        if (scheme === "s44AE") return false;
        return true;
      }
      return (d.bizEntries || []).some(function (b) {
        var netProfitOverride = b.net_profit_inr || b.net_profit;
        if (netProfitOverride !== undefined && netProfitOverride !== null) return false; // treated as regular-books, matches real code
        return !usesRegularBooksInr(b, d.presumptiveEligibility);
      });
    }
  },

  // ---- partner_firms[] loop, ported exactly ---------------------------------
  indiaHasPartnerFirmIncome: {
    deps: ["partnerFirms"],
    compute: function (d) {
      return (d.partnerFirms || []).some(function (firm) {
        return (num(firm.remuneration_from_entity_inr) + num(firm.interest_on_capital_from_entity_inr)) !== 0;
      });
    }
  },

  // ---- computeGoodsVehiclePresumptiveInr, ported exactly --------------------
  goodsVehicleIncomeInr: {
    deps: ["goodsVehicles"],
    compute: function (d) {
      var total = 0;
      (d.goodsVehicles || []).forEach(function (v) {
        var months = num(v.months_owned);
        if (!(months > 0)) return;
        if (v.vehicle_type === "heavy") total += 1000 * num(v.gvw_tonnes) * months;
        else if (v.vehicle_type === "light") total += 7500 * months;
      });
      return total;
    }
  },

  // ---- hasPgbpIncome, now built from real closed-boundary nodes instead of
  // the old businessInrBoundary/speculativeIncomeInrBoundary opaque inputs.
  // Exact for hasPgbpIncome's OR-of-nonzero purpose (see file header) —
  // verified against production in run-in1-v2.js, not just asserted here.
  hasPgbpIncome: {
    deps: ["indiaHasRegularBooksEntry", "indiaHasValidPresumptiveEntry", "indiaHasPartnerFirmIncome",
      "goodsVehicleIncomeInr", "fnoIncomeInr", "speculativeIncomeInr"],
    compute: function (d) {
      return d.indiaHasRegularBooksEntry || d.indiaHasValidPresumptiveEntry || d.indiaHasPartnerFirmIncome ||
        d.goodsVehicleIncomeInr !== 0 || d.fnoIncomeInr !== 0 || d.speculativeIncomeInr !== 0;
    }
  },

  isResidentIndia: {
    deps: ["indiaResidencyStatusRaw"],
    compute: function (d) { return d.indiaResidencyStatusRaw === "ROR" || d.indiaResidencyStatusRaw === "RNOR"; }
  },
  ageAtFyEnd: {
    deps: ["dobRaw", "baseYear"],
    compute: function (d) {
      if (!d.dobRaw) return null;
      var dob = new Date(d.dobRaw);
      var fyEnd = new Date(d.baseYear + 1, 2, 31);
      return fyEnd.getFullYear() - dob.getFullYear() -
        ((fyEnd.getMonth() < dob.getMonth() || (fyEnd.getMonth() === dob.getMonth() && fyEnd.getDate() < dob.getDate())) ? 1 : 0);
    }
  },
  isIndividualTaxpayer: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "individual"; } },
  indiaIsCompany: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "company"; } },

  advancePaidInr: {
    deps: ["advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"],
    compute: function (d) { return d.advQ1Inr + d.advQ2Inr + d.advQ3Inr + d.advQ4Inr; }
  },

  // ---- indianBusinessesBoundary is GONE — this now reads straight off the
  // graphed annualSlice/bizEntries instead of model.assets.indianBusinesses.
  inTurnoverForAudit: {
    deps: ["bizEntries"],
    compute: function (d) {
      var totalInr = 0, cashInr = 0;
      (d.bizEntries || []).forEach(function (b) {
        var digital = num(b.digital_receipts_inr) + num(b.ada_digital_receipts_inr);
        var cash = num(b.cash_receipts_inr) + num(b.ada_cash_receipts_inr);
        var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (digital + cash);
        totalInr += receipts; cashInr += cash;
      });
      return totalInr > 0 && totalInr > ((cashInr / totalInr) <= 0.05 ? 100000000 : 10000000);
    }
  },
  inIsAuditCase: {
    deps: ["indiaIsCompany", "inTurnoverForAudit"],
    compute: function (d) { return d.indiaIsCompany || d.inTurnoverForAudit; }
  },
  inS424Months: { deps: ["inIsAuditCase"], compute: function (d) { return d.inIsAuditCase ? 7 : 4; } },

  assessedTaxInr: {
    deps: ["assessedTaxInrBoundary", "tdsInr", "tcsInr"],
    compute: function (d) { return Math.max(0, d.assessedTaxInrBoundary - d.tdsInr - d.tcsInr); }
  },

  inAdvTaxObliged: {
    deps: ["assessedTaxInr", "isIndividualTaxpayer", "isResidentIndia", "ageAtFyEnd", "hasPgbpIncome"],
    compute: function (d) {
      if (d.assessedTaxInr < 10000) return false;
      if (d.isIndividualTaxpayer && d.isResidentIndia && d.ageAtFyEnd !== null && d.ageAtFyEnd >= 60 && !d.hasPgbpIncome) return false;
      return true;
    }
  },

  inPurelyPresumptive: {
    deps: ["indiaHasValidPresumptiveEntry", "indiaHasRegularBooksEntry", "indiaHasPartnerFirmIncome"],
    compute: function (d) { return !!(d.indiaHasValidPresumptiveEntry && !d.indiaHasRegularBooksEntry && !d.indiaHasPartnerFirmIncome); }
  },

  s424Inr: {
    deps: ["inAdvTaxObliged", "assessedTaxInr", "advancePaidInr", "inS424Months"],
    compute: function (d) {
      if (!d.inAdvTaxObliged || d.assessedTaxInr <= 0 || d.advancePaidInr >= d.assessedTaxInr * 0.9) return 0;
      return (d.assessedTaxInr - d.advancePaidInr) * 0.01 * d.inS424Months;
    }
  },
  s425Inr: {
    deps: ["inAdvTaxObliged", "assessedTaxInr", "inPurelyPresumptive", "advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"],
    compute: function (d) {
      if (!d.inAdvTaxObliged || d.assessedTaxInr <= 0) return 0;
      var installments = d.inPurelyPresumptive
        ? [{ required: 1.00, paid: d.advQ1Inr + d.advQ2Inr + d.advQ3Inr + d.advQ4Inr, months: 1 }]
        : [
            { required: 0.15, paid: d.advQ1Inr, months: 3 },
            { required: 0.30, paid: d.advQ2Inr, months: 3 },
            { required: 0.30, paid: d.advQ3Inr, months: 3 },
            { required: 0.25, paid: d.advQ4Inr, months: 1 }
          ];
      return installments.reduce(function (sum, q) {
        var shortInr = Math.max(0, d.assessedTaxInr * q.required - q.paid);
        return sum + shortInr * 0.01 * q.months;
      }, 0);
    }
  },

  // "us_only" is the new Layer 0 router's synonym for "single_us" (additive).
  hasIndiaScope: { deps: ["routerJurisdiction"], compute: function (d) { return d.routerJurisdiction !== "single_us" && d.routerJurisdiction !== "us_only"; } },
  totalInterestInr: {
    deps: ["hasIndiaScope", "s424Inr", "s425Inr"],
    scopeGate: "hasIndiaScope",
    outOfScopeValue: 0,
    compute: function (d) { return d.s424Inr + d.s425Inr; }
  },
  shouldFire: {
    deps: ["hasIndiaScope", "totalInterestInr"],
    scopeGate: "hasIndiaScope",
    outOfScopeValue: false,
    compute: function (d) { return d.totalInterestInr > 100; }
  }
};

module.exports = { NODES: NODES };
