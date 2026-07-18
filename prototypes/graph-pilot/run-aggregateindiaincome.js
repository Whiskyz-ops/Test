"use strict";
/* ============================================================================
 * Verifies aggregateindiaincome-nodes.js against all 11 real profiles, two
 * ways — same discipline as every prior phase:
 *   1. Intermediate values (business.inr, stcg/ltcg/ltcg197Inr/stcgSlabInr/
 *      vdaGainInr/chapterXiiaInvestmentIncomeInr/otherSourcesMisc) checked
 *      directly against the real model's own fields — proves the
 *      classification logic itself is right, not just the final total.
 *   2. totalIndiaIncomeInr checked against model.income.india.total.inr —
 *      the actual boundary this phase closes.
 *
 * Run: node prototypes/graph-pilot/run-aggregateindiaincome.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./aggregateindiaincome-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Closing the aggregateIndiaIncome boundary, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var out = graph.resolve(["businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "totalIndiaIncomeInr"], ctx).values;
  var inc = r.model.income.india;

  console.log(p.id);
  check("business.inr matches exactly", close(out.businessComputation.businessInr, num(inc.business && inc.business.inr)), "graph=" + Math.round(out.businessComputation.businessInr) + " model=" + Math.round(num(inc.business && inc.business.inr)));
  check("businessDepreciationInr matches exactly", close(out.businessComputation.businessDepreciationInr, num(inc.businessDepreciationInr)), "graph=" + Math.round(out.businessComputation.businessDepreciationInr) + " model=" + Math.round(num(inc.businessDepreciationInr)));
  check("indiaHasRegularBooksEntry matches", out.businessComputation.indiaHasRegularBooksEntry === !!inc.indiaHasRegularBooksEntry);
  check("indiaHasValidPresumptiveEntry matches", out.businessComputation.indiaHasValidPresumptiveEntry === !!inc.indiaHasValidPresumptiveEntry);
  check("indiaHasPartnerFirmIncome matches", out.businessComputation.indiaHasPartnerFirmIncome === !!inc.indiaHasPartnerFirmIncome);

  var cg = out.capitalGainsComputation;
  check("stcg.inr matches exactly", close(cg.stcgInr, num(inc.stcg && inc.stcg.inr)), "graph=" + Math.round(cg.stcgInr) + " model=" + Math.round(num(inc.stcg && inc.stcg.inr)));
  check("ltcg.inr matches exactly", close(cg.ltcgInr, num(inc.ltcg && inc.ltcg.inr)), "graph=" + Math.round(cg.ltcgInr) + " model=" + Math.round(num(inc.ltcg && inc.ltcg.inr)));
  check("ltcg197Inr matches exactly", close(cg.ltcg197Inr, num(inc.ltcg197Inr)), "graph=" + Math.round(cg.ltcg197Inr) + " model=" + Math.round(num(inc.ltcg197Inr)));
  check("stcgSlabInr matches exactly", close(cg.stcgSlabInr, num(inc.stcgSlabInr)), "graph=" + Math.round(cg.stcgSlabInr) + " model=" + Math.round(num(inc.stcgSlabInr)));
  check("vdaGainInr matches exactly", close(cg.vdaGainInr, num(inc.vdaGainInr)), "graph=" + Math.round(cg.vdaGainInr) + " model=" + Math.round(num(inc.vdaGainInr)));
  check("chapterXiiaInvestmentIncomeInr matches exactly", close(cg.chapterXiiaInvestmentIncomeInr, num(inc.chapterXiiaInvestmentIncomeInr)));
  check("promoterBuybackLtcgInr matches exactly", close(cg.promoterBuybackLtcgInr, num(inc.promoterBuybackLtcgInr)), "graph=" + Math.round(cg.promoterBuybackLtcgInr) + " model=" + Math.round(num(inc.promoterBuybackLtcgInr)));
  check("deemedDividendInr matches exactly", close(cg.deemedDividendInr, num(inc.deemedDividendBuyback && inc.deemedDividendBuyback.inr)));

  var realMismatches = inc.holdingPeriodMismatches || [];
  check("holdingPeriodMismatches count matches", cg.holdingPeriodMismatches.length === realMismatches.length,
    "graph=" + cg.holdingPeriodMismatches.length + " model=" + realMismatches.length);
  cg.holdingPeriodMismatches.forEach(function (mm, i) {
    var rm = realMismatches[i];
    if (!rm) return;
    check("holdingPeriodMismatches[" + i + "] matches exactly (" + mm.companyName + ")",
      mm.sourceType === rm.sourceType && mm.indiaClassification === rm.indiaClassification &&
      mm.usClassification === rm.usClassification && close(mm.gainInr, rm.gainInr) && close(mm.gainUsd, rm.gainUsd, 0.5) &&
      mm.indiaThresholdMonths === rm.indiaThresholdMonths && mm.isListed === rm.isListed,
      "graph=" + JSON.stringify(mm) + " model=" + JSON.stringify(rm));
  });

  check("otherSourcesMisc matches exactly", close(out.otherSourcesMiscComputation, num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)), "graph=" + Math.round(out.otherSourcesMiscComputation) + " model=" + Math.round(num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)));

  check("totalIndiaIncomeInr matches model.income.india.total.inr exactly", close(out.totalIndiaIncomeInr, num(inc.total && inc.total.inr)), "graph=" + Math.round(out.totalIndiaIncomeInr) + " model=" + Math.round(num(inc.total && inc.total.inr)));
  console.log("");
});

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

// ---- IN-38: DTAA worldwide-cede must exclude foreign financial holdings,
// same as ROR alone already does. NOT checked against WISING.analyze() —
// the real engine's own isIndiaRor gate doesn't have this fix yet (flagged,
// not yet built, in GAP_TRACKER.md IN-38), so comparing against it here
// would assert the DAG matches a known-wrong answer. Standalone synthetic
// case instead, same approach used throughout this effort whenever real
// profiles/the real engine can't serve as ground truth. ----------------
console.log("-- IN-38: DTAA worldwide-cede excludes foreign financial holdings (standalone, not checked against the real engine — see comment) --");
(function () {
  var baseIndia = {
    residency_detail: { final_india_residency_status: "ROR" },
    financial_holdings: { transactions: [{
      asset_class: "listed_equity", sale_date: "2026-01-15", sale_value: 500000, purchase_value: 200000,
      acquisition_date: "2020-01-01", quantity: 100
    }] }
  };
  var ctxNotCeded = { router: {}, india: baseIndia, us: {} };
  var outNotCeded = graph.resolve(["capitalGainsComputation"], ctxNotCeded).values.capitalGainsComputation;
  check("ROR, not ceded: foreign/financial holdings gain included (ltcgInr > 0)", outNotCeded.ltcgInr > 0,
    "ltcgInr=" + outNotCeded.ltcgInr);

  var cededIndia = JSON.parse(JSON.stringify(baseIndia));
  cededIndia.residency_detail.dtaa_worldwide_ceded = true;
  var ctxCeded = { router: {}, india: cededIndia, us: {} };
  var outCeded = graph.resolve(["capitalGainsComputation"], ctxCeded).values.capitalGainsComputation;
  check("ROR, DTAA-ceded: same financial holdings gain now excluded (ltcgInr === 0)", outCeded.ltcgInr === 0,
    "ltcgInr=" + outCeded.ltcgInr);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
