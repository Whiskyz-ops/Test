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
  // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
  // values — additive synonyms for "single_india"/"single_us".
  hasUsScope: {
    deps: ["routerJurisdiction", "routerUsSignal"],
    compute: function (d) {
      return (d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only") ? false :
        (d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only") ? true : d.routerUsSignal;
    }
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

  // §6654 regular method: four equal required instalments (25% each of the
  // lesser safe harbour), withholding treated as paid evenly on the four due
  // dates, and each payment applied to the earliest unpaid instalment — so
  // the penalty runs on the RUNNING shortfall (cumulative required less
  // cumulative paid) from each due date to the next (Apr 15 -> Jun 15 ->
  // Sep 15 -> Jan 15 -> Apr 15: 2, 3, 4, 3 months). An early overpayment
  // covers later instalments; a late one stops the clock only when made.
  // No penalty when this year's tax less withholding is under $1,000
  // (§6654(e)(1)). Rates are the engine's assumed IRS underpayment rates.
  usUnderpaymentPeriods: {
    deps: ["usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"],
    compute: function (d) {
      var est = [d.usEstQ1Usd, d.usEstQ2Usd, d.usEstQ3Usd, d.usEstQ4Usd], rate = [0.07, 0.06, 0.07, 0.07], months = [2, 3, 4, 3];
      var cumRequired = 0, cumPaid = 0;
      return est.map(function (e, i) {
        cumRequired += d.usRequiredUsd / 4; cumPaid += d.usWithholdingTotalUsd / 4 + e;
        return { quarter: i + 1, requiredUsd: d.usRequiredUsd / 4, paidUsd: d.usWithholdingTotalUsd / 4 + e, shortUsd: Math.max(0, cumRequired - cumPaid), rate: rate[i], months: months[i] };
      });
    }
  },
  usUnderpaymentExempt: {
    deps: ["usTotalTaxUsd", "usWithholdingTotalUsd"],
    compute: function (d) { return d.usTotalTaxUsd - d.usWithholdingTotalUsd < 1000; }
  },
  us2210PenaltyUsd: {
    deps: ["hasUsScope", "usUnderpaymentExempt", "usUnderpaymentPeriods"],
    scopeGate: "hasUsScope",
    outOfScopeValue: 0,
    compute: function (d) {
      if (d.usUnderpaymentExempt) return 0;
      return d.usUnderpaymentPeriods.reduce(function (s, p) { return s + p.shortUsd * p.rate * p.months / 12; }, 0);
    }
  },
  shouldFire: {
    deps: ["hasUsScope", "us2210PenaltyUsd"],
    scopeGate: "hasUsScope",
    outOfScopeValue: false,
    compute: function (d) { return d.us2210PenaltyUsd > 0; }
  }
};

module.exports = { NODES: NODES };
