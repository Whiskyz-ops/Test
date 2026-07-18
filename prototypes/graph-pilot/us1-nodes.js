"use strict";
/* ============================================================================
 * "Going wider" — finding #2 of the batch: underpayment_2210 (US-1, the
 * direct mirror of Phase 1's india_advance_tax_interest, but on the US
 * side). Chosen specifically to test the OTHER scope flag (hasUsScope, not
 * hasIndiaScope) and a genuinely different shape: two safe harbors (OR,
 * not AND), a prior-year proxy, per-quarter IRS rate table.
 *
 * Same explicit-boundary discipline as Phase 1: usTotalTaxBeforeFtcUsd,
 * agiUsd, and ftcAllowedUsd are deep US-tax/FTC computation outputs, taken
 * as already-computed inputs rather than re-derived (that's
 * computeUsTax/computeFtc's job, a separate future phase). Withholding and
 * estimated-payment figures ARE genuinely raw, simple reads, so those are
 * real leaf nodes here, not boundary inputs.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var NODES = {
  routerJurisdiction: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "jurisdiction", null); } },
  routerUsSignal: {
    deps: [],
    compute: function (d, ctx) {
      return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true ||
        safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
    }
  },
  hasUsScope: {
    deps: ["routerJurisdiction", "routerUsSignal"],
    compute: function (d) { return d.routerJurisdiction === "single_india" ? false : d.routerJurisdiction === "single_us" ? true : d.routerUsSignal; }
  },

  // ---- Genuinely raw leaves: withholding/estimated figures ----------------
  usWithholdingTotalUsd: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.federal_withholding_total_usd", 0)); } },
  usEstQ1Usd: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q1_apr15_usd", 0)); } },
  usEstQ2Usd: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q2_jun15_usd", 0)); } },
  usEstQ3Usd: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q3_sep15_usd", 0)); } },
  usEstQ4Usd: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q4_jan15_usd", 0)); } },
  usPriorYearTaxUsdRaw: { deps: [], compute: function (d, ctx) { var v = safe(ctx.us, "withholding_and_estimated.prior_year_total_tax_usd", null); return v === null ? null : num(v); } },

  // ---- Explicit boundary inputs (deep US-tax/FTC outputs) ------------------
  usTotalTaxBeforeFtcUsdBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.computed.usTax.totalTaxBeforeFtcUsd); } },
  usAgiUsdBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.computed.usTax.agiUsd); } },
  usFtcAllowedUsdBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.computed.ftc.us.ftcAllowedUsd); } },

  usPaidTotalUsd: {
    deps: ["usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"],
    compute: function (d) { return d.usWithholdingTotalUsd + d.usEstQ1Usd + d.usEstQ2Usd + d.usEstQ3Usd + d.usEstQ4Usd; }
  },
  usTotalTaxUsd: {
    deps: ["usTotalTaxBeforeFtcUsdBoundary", "usFtcAllowedUsdBoundary"],
    compute: function (d) { return Math.max(0, d.usTotalTaxBeforeFtcUsdBoundary - d.usFtcAllowedUsdBoundary); }
  },
  usCurrentHarborUsd: { deps: ["usTotalTaxUsd"], compute: function (d) { return d.usTotalTaxUsd * 0.9; } },
  usPriorHarborPct: { deps: ["usAgiUsdBoundary"], compute: function (d) { return d.usAgiUsdBoundary > 150000 ? 1.10 : 1.00; } },
  usPriorHarborUsd: {
    deps: ["usPriorYearTaxUsdRaw", "usPriorHarborPct"],
    compute: function (d) { return d.usPriorYearTaxUsdRaw != null ? d.usPriorYearTaxUsdRaw * d.usPriorHarborPct : null; }
  },
  usRequiredUsd: {
    deps: ["usCurrentHarborUsd", "usPriorHarborUsd"],
    compute: function (d) { return d.usPriorHarborUsd != null ? Math.min(d.usCurrentHarborUsd, d.usPriorHarborUsd) : d.usCurrentHarborUsd; }
  },
  usBalanceDueUsd: { deps: ["usTotalTaxUsd", "usPaidTotalUsd"], compute: function (d) { return d.usTotalTaxUsd - d.usPaidTotalUsd; } },

  us2210PenaltyUsd: {
    deps: ["hasUsScope", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"],
    scopeGate: "hasUsScope",
    outOfScopeValue: 0,
    compute: function (d) {
      if (!(d.usBalanceDueUsd > 1000) || !(d.usPaidTotalUsd < d.usRequiredUsd)) return 0;
      var perQWithholdingUsd = d.usWithholdingTotalUsd / 4;
      var rate = { q1: 0.07, q2: 0.06, q3: 0.07, q4: 0.07 };
      var estByQ = { q1: d.usEstQ1Usd, q2: d.usEstQ2Usd, q3: d.usEstQ3Usd, q4: d.usEstQ4Usd };
      var monthsRemaining = { q1: 12, q2: 10, q3: 7, q4: 3 };
      var penaltyUsd = 0;
      ["q1", "q2", "q3", "q4"].forEach(function (q) {
        var requiredUsd = d.usRequiredUsd / 4;
        var paidUsd = perQWithholdingUsd + estByQ[q];
        var shortUsd = Math.max(0, requiredUsd - paidUsd);
        penaltyUsd += shortUsd * rate[q] * (monthsRemaining[q] / 12);
      });
      return penaltyUsd;
    }
  },
  shouldFire: {
    deps: ["hasUsScope", "us2210PenaltyUsd", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd"],
    scopeGate: "hasUsScope",
    outOfScopeValue: false,
    compute: function (d) { return d.usBalanceDueUsd > 1000 && d.usPaidTotalUsd < d.usRequiredUsd; }
  }
};

module.exports = { NODES: NODES };
