"use strict";
/* ============================================================================
 * "Going wider" — finding #1: black_money_act_exposure (XB-7). Chosen
 * specifically because it's genuinely cross-border and demonstrates
 * something neither IN-1 nor US-1/US-5 do: scopeGate applied to an
 * ARBITRARY derived boolean, not just the two canonical hasIndiaScope/
 * hasUsScope meta flags. scheduleFaInconsistentTrigger is the SAME
 * condition that also independently drives the real schedule_fa_inconsistent
 * finding in conflicts.js — one shared node, reusable by multiple findings,
 * rather than two copies of the same boolean logic.
 *
 * Note (deliberately not "fixed" here, just tested): the real production
 * code does NOT explicitly check hasIndiaScope/hasUsScope for this finding
 * — it relies entirely on res.india.status === "ROR" plus real non-India
 * signals. hasIndiaScope/hasUsScope are included below as INFORMATIONAL
 * nodes so run-batch2.js can check, empirically, whether this finding ever
 * fires for a taxpayer who isn't genuinely in dual scope by the meta
 * flags' own definition — a real question this pilot can answer, not
 * assume.
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
  hasIndiaScope: { deps: ["routerJurisdiction"], compute: function (d) { return d.routerJurisdiction !== "single_us" && d.routerJurisdiction !== "us_only"; } },
  hasUsScope: {
    deps: ["routerJurisdiction", "routerUsSignal"],
    compute: function (d) {
      return (d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only") ? false :
        (d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only") ? true : d.routerUsSignal;
    }
  },

  indiaResidencyStatusRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.final_india_residency_status", null); } },
  indiaForeignAssetsDeclaredRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "foreign_assets.has_foreign_assets", null); } },

  // ---- Explicit boundary inputs: complex, multi-source aggregates ---------
  accountsBoundary: { deps: [], compute: function (d, ctx) { return ctx.model.accounts.accounts || []; } },
  usSourceTotalUsdBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.us.usSourceTotal && ctx.model.income.us.usSourceTotal.usd); } },
  usSecuritiesBoundary: { deps: [], compute: function (d, ctx) { return ctx.model.assets.usSecurities || []; } },

  isIndiaRor: { deps: ["indiaResidencyStatusRaw"], compute: function (d) { return d.indiaResidencyStatusRaw === "ROR"; } },
  usHasForeignToIndiaAssets: {
    deps: ["accountsBoundary", "usSourceTotalUsdBoundary"],
    compute: function (d) {
      return d.accountsBoundary.some(function (a) { return a.country !== "India"; }) || d.usSourceTotalUsdBoundary > 0;
    }
  },

  // ---- THE SHARED NODE — same condition the real schedule_fa_inconsistent
  // finding uses, built once here rather than re-derived per finding.
  scheduleFaInconsistentTrigger: {
    deps: ["isIndiaRor", "indiaForeignAssetsDeclaredRaw", "usHasForeignToIndiaAssets"],
    compute: function (d) { return d.isIndiaRor && d.indiaForeignAssetsDeclaredRaw === false && d.usHasForeignToIndiaAssets; }
  },

  bmaAssetValueUsd: {
    deps: ["scheduleFaInconsistentTrigger", "usSecuritiesBoundary", "accountsBoundary"],
    scopeGate: "scheduleFaInconsistentTrigger",
    outOfScopeValue: 0,
    compute: function (d) {
      return (d.usSecuritiesBoundary || []).reduce(function (s, h) { return s + (h.peak_balance_usd || 0); }, 0) +
        (d.accountsBoundary || []).filter(function (a) { return a.country !== "India"; })
          .reduce(function (s, a) { return s + ((a.peak && a.peak.usd) || 0); }, 0);
    }
  },
  bmaMaxTotalUsd: {
    deps: ["scheduleFaInconsistentTrigger", "bmaAssetValueUsd"],
    scopeGate: "scheduleFaInconsistentTrigger",
    outOfScopeValue: 0,
    compute: function (d) { var taxUsd = d.bmaAssetValueUsd * 0.30; return taxUsd + taxUsd * 3; }
  },
  shouldFire: {
    deps: ["scheduleFaInconsistentTrigger", "bmaAssetValueUsd"],
    scopeGate: "scheduleFaInconsistentTrigger",
    outOfScopeValue: false,
    compute: function (d) { return d.bmaAssetValueUsd > 0; }
  }
};

module.exports = { NODES: NODES };
