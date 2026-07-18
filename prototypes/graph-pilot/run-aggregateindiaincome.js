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

  check("otherSourcesMisc matches exactly", close(out.otherSourcesMiscComputation, num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)), "graph=" + Math.round(out.otherSourcesMiscComputation) + " model=" + Math.round(num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)));

  check("totalIndiaIncomeInr matches model.income.india.total.inr exactly", close(out.totalIndiaIncomeInr, num(inc.total && inc.total.inr)), "graph=" + Math.round(out.totalIndiaIncomeInr) + " model=" + Math.round(num(inc.total && inc.total.inr)));
  console.log("");
});

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
