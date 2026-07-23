"use strict";
/* ============================================================================
 * Phase 1 of the "full DAG" plan: one real finding (india_advance_tax_interest,
 * IN-1 — ss.424/425), end to end, as an actual dependency graph.
 *
 * This goes further than the scope-flag pilot (scope-nodes.js) on purpose —
 * that pilot only graphed the CONSUMPTION side of an already-computed scope
 * flag. This phase also graphs SELECTION: hasIndiaScope/hasUsScope and the
 * residency/age/entity-type facts are derived here straight from raw
 * router/india fields, not read off an already-normalized model.meta. That
 * closes the exact gap a computation-only hybrid leaves open — the
 * "collected but never read" bug class (IN-27/28, US-19..26) lives in
 * field SELECTION, upstream of where a computation-only graph would start.
 *
 * Explicit, stated boundary (not hidden): four facts are taken as
 * already-computed inputs rather than re-derived, because doing so would
 * mean re-deriving normalize.js's quarter-aggregation machinery
 * (indiaAnnualSlice/buildQuarters) and the full India tax computation
 * (computeIndiaTax) — genuinely separate, much larger pieces of work,
 * deliberately left for a later phase:
 *   - assessedTaxInrBoundary      (computeIndiaTax's full liability figure)
 *   - hasValidPresumptiveEntryBoundary / hasRegularBooksEntryBoundary /
 *     hasPartnerFirmIncomeBoundary (business-entry classification, which
 *     runs through the quarterly aggregation layer)
 *   - businessInrBoundary / speculativeIncomeInrBoundary (same reason)
 *   - indianBusinessesBoundary   (business_entries[], same reason)
 * Every other node below reads from genuinely raw router/india fields, or
 * is real logic ported unchanged from conflicts.js's current
 * india_advance_tax_interest block (re-read fresh from source, not from
 * memory, before porting).
 * ==========================================================================*/

function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return dflt;
    cur = cur[parts[i]];
  }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var NODES = {
  // ---- Leaf nodes: genuinely raw router/india fields ----------------------
  routerJurisdiction: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "jurisdiction", null); } },
  routerUsSignal: {
    deps: [],
    compute: function (d, ctx) {
      return num(safe(ctx.router, "us_days", 0)) > 0 ||
        safe(ctx.router, "is_us_citizen", false) === true ||
        safe(ctx.router, "has_green_card", false) === true ||
        safe(ctx.router, "has_us_source_income_or_assets", false) === true;
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

  // ---- Explicit boundary inputs (see file header) --------------------------
  assessedTaxInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.computed.indiaTax.totalTaxInr); } },
  hasValidPresumptiveEntryBoundary: { deps: [], compute: function (d, ctx) { return !!ctx.model.income.india.indiaHasValidPresumptiveEntry; } },
  hasRegularBooksEntryBoundary: { deps: [], compute: function (d, ctx) { return !!ctx.model.income.india.indiaHasRegularBooksEntry; } },
  hasPartnerFirmIncomeBoundary: { deps: [], compute: function (d, ctx) { return !!ctx.model.income.india.indiaHasPartnerFirmIncome; } },
  businessInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.business && ctx.model.income.india.business.inr); } },
  speculativeIncomeInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.speculativeIncomeInr); } },
  indianBusinessesBoundary: { deps: [], compute: function (d, ctx) { return ctx.model.assets.indianBusinesses || []; } },

  // ---- Derived nodes: real logic, ported unchanged from conflicts.js ------
  // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
  // values — additive synonyms for "single_india"/"single_us" (the 12 demo
  // profiles and the fuzzer only ever produce the original strings).
  hasIndiaScope: {
    deps: ["routerJurisdiction"],
    compute: function (d) { return d.routerJurisdiction !== "single_us" && d.routerJurisdiction !== "us_only"; }
  },
  hasUsScope: {
    deps: ["routerJurisdiction", "routerUsSignal"],
    compute: function (d) {
      return (d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only") ? false :
        (d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only") ? true : d.routerUsSignal;
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

  inTurnoverForAudit: {
    deps: ["indianBusinessesBoundary"],
    compute: function (d) {
      var totalInr = 0, cashInr = 0;
      (d.indianBusinessesBoundary || []).forEach(function (b) {
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

  hasPgbpIncome: {
    deps: ["businessInrBoundary", "speculativeIncomeInrBoundary", "hasRegularBooksEntryBoundary", "hasValidPresumptiveEntryBoundary", "hasPartnerFirmIncomeBoundary"],
    compute: function (d) {
      return d.businessInrBoundary !== 0 || d.speculativeIncomeInrBoundary !== 0 ||
        d.hasRegularBooksEntryBoundary || d.hasValidPresumptiveEntryBoundary || d.hasPartnerFirmIncomeBoundary;
    }
  },

  assessedTaxInr: {
    deps: ["assessedTaxInrBoundary", "tdsInr", "tcsInr"],
    compute: function (d) { return Math.max(0, d.assessedTaxInrBoundary - d.tdsInr - d.tcsInr); }
  },

  // s.404 floor + s.207(2) senior carve-out — the actual "first-class
  // symmetry sweep" logic added to conflicts.js earlier this session,
  // ported unchanged.
  inAdvTaxObliged: {
    deps: ["assessedTaxInr", "isIndividualTaxpayer", "isResidentIndia", "ageAtFyEnd", "hasPgbpIncome"],
    compute: function (d) {
      if (d.assessedTaxInr < 10000) return false;
      if (d.isIndividualTaxpayer && d.isResidentIndia && d.ageAtFyEnd !== null && d.ageAtFyEnd >= 60 && !d.hasPgbpIncome) return false;
      return true;
    }
  },

  inPurelyPresumptive: {
    deps: ["hasValidPresumptiveEntryBoundary", "hasRegularBooksEntryBoundary", "hasPartnerFirmIncomeBoundary"],
    compute: function (d) { return !!(d.hasValidPresumptiveEntryBoundary && !d.hasRegularBooksEntryBoundary && !d.hasPartnerFirmIncomeBoundary); }
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

  // ---- Root outputs: gated ONCE, here, on hasIndiaScope. Nothing above
  // this line needed its own scope check — they're all safe to compute
  // regardless (confirmed: computed.indiaTax/model.income.india always
  // exist, just zeroed, for a hasIndiaScope=false taxpayer) — but the
  // finding itself can only ever fire in-scope. ---------------------------
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
