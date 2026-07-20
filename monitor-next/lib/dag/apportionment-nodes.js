"use strict";
/* ============================================================================
 * Closes XBR-2..6's first row: computeApportionment (FY-vs-CY tax-year
 * apportionment) — the FIRST of the five cross-border reconciliation
 * functions ported, picked first because it's the only one of the five with
 * zero remaining blockers once AGG-1/AGG-3 exist (see the 19 Jul 2026
 * scoping note in docs/DAG_MIGRATION_TRACKER.md, section C).
 *
 * Read fresh from source before writing graph code: computeApportionment()
 * (computation.js:1616-1644) reads ONLY model.meta.baseYear,
 * model.periods.indiaQuarterlyUsd, model.income.india.total.usd, and
 * model.income.us.usSourceTotal.usd — no residency/indiaTax/usTax/other-XBR
 * dependency at all, unlike what the tracker's original (now-corrected)
 * "depends on XBR-2/TAX-9" note implied for a NEIGHBORING row.
 *
 * baseYear and indiaQuarterlyUsd are raw facts (normalize.js:2229,
 * 2235-2249) — read here directly from ctx.router/ctx.us/ctx.india, same
 * "genuine derivation, not a disguised boundary read" discipline used by
 * every other from-scratch phase in this effort (XBR-1, AGG-1, AGG-3),
 * rather than reading ctx.model.meta.baseYear the way ustax-nodes.js's
 * baseYearUs boundary node does (that one stays a boundary on purpose,
 * per us-full-nodes.js's own header — entity/base-year classification is
 * separate machinery from income aggregation).
 *
 * indiaFyTotalUsd/usCyTotalUsd reuse the already-closed AGG-1/AGG-3 income
 * totals instead of re-deriving income classification from scratch —
 * merges in aggregateindiaincome-nodes.js and aggregateusincome-nodes.js
 * (confirmed collision-free by inspection: 18 + 13 node names, zero
 * overlap), same "wire the already-built pieces together" shape as
 * india-full-nodes.js/us-full-nodes.js, just without any boundary override
 * needed here (this file only ADDS nodes on top, it doesn't need to
 * redefine anything either merged file already exposes).
 *
 * Verified in run-apportionment.js: exact match against computed.apportionment
 * for all 11 real profiles, ctx carrying only {router, india, us} — no
 * model/computed at all.
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

var incomeNodesIndia = require("./aggregateindiaincome-nodes.js").NODES;
var incomeNodesUs = require("./aggregateusincome-nodes.js").NODES;

var NODES = {};
[incomeNodesIndia, incomeNodesUs].forEach(function (src) {
  Object.keys(src).forEach(function (k) {
    if (NODES[k]) throw new Error("Unexpected node name collision on merge: '" + k + "' — resolve before combining.");
    NODES[k] = src[k];
  });
});

// ---- raw leaves: baseYear, India FY quarterly USD (normalize.js:2229, 2235-2249) --
NODES.apportionmentBaseYearRaw = {
  deps: [],
  compute: function (d, ctx) {
    return num(safe(ctx.router, "base_tax_year", safe(ctx.us, "metadata.us_calendar_year", 2025))) || 2025;
  }
};
NODES.apportionmentIndiaQuarterlyUsdRaw = {
  deps: [],
  compute: function (d, ctx) {
    var q = safe(ctx.india, "quarters", null);
    if (!q) return null;
    return ["Q1", "Q2", "Q3", "Q4"].map(function (k) {
      var qd = q[k] || {}, di = qd.domestic_income || {}, os = qd.other_sources || {}, cg = qd.capital_gains || {};
      return inrToUsd(
        num(safe(di, "salary.taxable_salary_inr", 0)) + num(safe(di, "salary.gross_salary_inr", 0)) +
        num(safe(os, "interest_inr", 0)) + num(safe(os, "dividend_inr", 0)) +
        num(safe(cg, "stcg_111a_inr", 0)) + num(safe(cg, "ltcg_112a_inr", 0)),
        ctx
      );
    });
  }
};

// ---- India FY total, in USD — reuses the already-closed AGG-1 boundary --
NODES.indiaTotalIncomeUsdForApportionment = {
  deps: ["totalIndiaIncomeInr"],
  compute: function (d, ctx) { return inrToUsd(d.totalIndiaIncomeInr, ctx); }
};

// ---- computeApportionment, ported in full ---------------------------------
NODES.apportionmentResult = {
  deps: ["apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "aggregateUsIncomeResult"],
  compute: function (d) {
    var baseYear = d.apportionmentBaseYearRaw;
    var q = d.apportionmentIndiaQuarterlyUsdRaw;
    var hasQ = !!(q && q.some(function (x) { return x > 0; }));
    var indiaFyTotal = d.indiaTotalIncomeUsdForApportionment;
    var primaryShare, nextShare;
    if (hasQ) {
      var qTot = (q[0] + q[1] + q[2] + q[3]) || indiaFyTotal || 1;
      primaryShare = (q[0] + q[1] + q[2]) / qTot;
      nextShare = q[3] / qTot;
    } else {
      primaryShare = 0.75; nextShare = 0.25; // 9 months (Apr-Dec) vs 3 (Jan-Mar)
    }
    var usCyTotal = d.aggregateUsIncomeResult.usSourceTotal.usd;
    return {
      basis: hasQ ? "Indian quarterly data" : "even-earning assumption (Apr–Dec vs Jan–Mar)",
      fyLabel: "FY " + baseYear + "–" + String(baseYear + 1).slice(2),
      cyPrimary: baseYear, cyNext: baseYear + 1,
      indiaFyTotalUsd: indiaFyTotal,
      indiaToCyPrimaryUsd: Math.round(indiaFyTotal * primaryShare),
      indiaToCyNextUsd: Math.round(indiaFyTotal * nextShare),
      primaryShare: primaryShare, nextShare: nextShare,
      usCyTotalUsd: usCyTotal,
      usCyToFyPrimaryUsd: Math.round(usCyTotal * 9 / 12),
      usCyToFyNextUsd: Math.round(usCyTotal * 3 / 12)
    };
  }
};

module.exports = { NODES: NODES };
