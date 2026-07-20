"use strict";
/* ============================================================================
 * Closes XBR-3: mapDoubleTaxedIncome (per-head doubly-taxed-income
 * breakdown) — scoped 19 Jul 2026 (docs/DAG_MIGRATION_TRACKER.md, section
 * C): "needs verifying that aggregateusincome-nodes.js exposes the
 * specific US-side foreign* breakouts this reads... before this is a
 * pure port."
 *
 * That verification turned out fully positive: aggregateUsIncomeResult
 * (aggregateusincome-nodes.js, AGG-3, already ✅) already exposes
 * foreignWages/foreignSelfEmployment/foreignRental/foreignInterest/
 * foreignDividends/foreignCapitalGains as named {usd:X} fields, byte-for-
 * byte matching computation.js:1420-1439's field names — zero new US-side
 * work needed. The India-side fields (salary/houseProperty/interest/
 * dividend) are likewise already exposed as raw leaves in in1-nodes-v3.js
 * (salaryInr/housePropertyInr/interestInr/dividendInr, TAX-1 ✅), and
 * business/capitalGains reuse aggregateindiaincome-nodes.js's own
 * already-verified businessComputation.businessInr and
 * capitalGainsComputation's stcgInr+ltcgInr+ltcg197Inr sum (AGG-1 ✅,
 * confirmed exact-match against inc.business.inr/inc.stcg.inr/inc.ltcg.inr/
 * inc.ltcg197Inr in run-aggregateindiaincome.js's own checks).
 *
 * Built on xborder-full-nodes.js (not a smaller merge) because this needs
 * BOTH sides plus residency.us.worldwide (residencyResult, via
 * us-full-nodes.js/residency-nodes.js) in one place — the exact set
 * xborder-full-nodes.js already assembles for XBR-2.
 *
 * Verified in run-doubletax.js: exact match against
 * computed.doubleTax.{items,totalDoublyTaxedUsd} for all 11 real profiles,
 * ctx carrying only {router, india, us} — no model/computed at all.
 * ==========================================================================*/
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(inr, ctx) { return Number(inr) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js

var xborderFullNodes = require("./xborder-full-nodes.js").NODES;

var NODES = {};
Object.keys(xborderFullNodes).forEach(function (k) { NODES[k] = xborderFullNodes[k]; });

// computation.js L1318: capitalGains = addMoney(addMoney(stcg, ltcg), moneyFromInr(ltcg197Inr))
NODES.indiaCapitalGainsInrXbr3 = {
  deps: ["capitalGainsComputation"],
  compute: function (d) { return d.capitalGainsComputation.stcgInr + d.capitalGainsComputation.ltcgInr + d.capitalGainsComputation.ltcg197Inr; }
};

// ---- mapDoubleTaxedIncome, ported in full ----------------------------------
NODES.mapDoubleTaxedIncomeResult = {
  deps: ["salaryInr", "businessComputation", "housePropertyInr", "interestInr", "dividendInr",
    "indiaCapitalGainsInrXbr3", "aggregateUsIncomeResult", "residencyResult"],
  compute: function (d, ctx) {
    var items = [];
    var usWorldwide = d.residencyResult.us.worldwide;
    var us = d.aggregateUsIncomeResult;

    function pair(label, indiaInr, usMoney, note) {
      var indiaUsd = inrToUsd(indiaInr, ctx);
      var usUsd = usMoney ? usMoney.usd : 0;
      var inExposed = indiaUsd > 0;
      var usExposed = usUsd > 0;
      var doublyTaxed = inExposed && (usWorldwide || usExposed);
      if (inExposed || usExposed) {
        items.push({ label: label, indiaUsd: indiaUsd, usUsd: usUsd, doublyTaxed: doublyTaxed, note: note || "" });
      }
    }

    pair("Salary / Wages (India-source)", d.salaryInr, us.foreignWages,
      "Indian employment income is foreign-source for the US; creditable via Form 1116 general basket.");
    pair("Business / Professional income", d.businessComputation.businessInr, us.foreignSelfEmployment,
      "Indian business profits may also flow through GILTI/Subpart F if held via a corp (Form 5471).");
    pair("House property / Rental (India)", d.housePropertyInr, us.foreignRental,
      "Indian rent: net-of-expense basis differs (IN 30% standard deduction vs US actual + depreciation).");
    pair("Interest income", d.interestInr, us.foreignInterest,
      "Passive basket for US FTC; India taxes at slab rate.");
    pair("Dividend income", d.dividendInr, us.foreignDividends,
      "Indian dividends taxable in shareholder's hands; US qualified-dividend rate may differ.");
    pair("Capital gains", d.indiaCapitalGainsInrXbr3, us.foreignCapitalGains,
      "STCG/LTCG holding-period and rate definitions differ between IN and US.");

    var totalDoublyTaxedUsd = items.reduce(function (s, it) {
      return s + (it.doublyTaxed ? Math.max(it.indiaUsd, it.usUsd) : 0);
    }, 0);
    return { items: items, totalDoublyTaxedUsd: totalDoublyTaxedUsd };
  }
};

module.exports = { NODES: NODES };
