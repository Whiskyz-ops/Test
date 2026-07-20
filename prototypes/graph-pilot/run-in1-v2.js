"use strict";
/* ============================================================================
 * Verifies in1-nodes-v2.js against all 11 real profiles two ways:
 *   1. Same as Phase 1 — final shouldFire/totalInterestInr vs production's
 *      real, shipped finding output.
 *   2. NEW — each newly-closed intermediate node (indiaHasRegularBooksEntry,
 *      indiaHasValidPresumptiveEntry, indiaHasPartnerFirmIncome, hasPgbpIncome)
 *      checked against the real model's equivalent field directly. This is
 *      the check that actually proves the boundary closure is real: it's
 *      possible for a wrong intermediate derivation to still coincidentally
 *      produce the right final answer on 11 profiles, so the final-output
 *      match alone isn't sufficient evidence.
 *
 * Run: node prototypes/graph-pilot/run-in1-v2.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./in1-nodes-v2.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Phase 1, deeper: 3 of 4 boundary inputs closed, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var out = graph.resolve([
    "shouldFire", "totalInterestInr",
    "indiaHasRegularBooksEntry", "indiaHasValidPresumptiveEntry", "indiaHasPartnerFirmIncome", "hasPgbpIncome"
  ], ctx).values;

  var realFinding = (r.findings || []).filter(function (f) { return f.id === "india_advance_tax_interest"; })[0];
  var realInterestInr = realFinding ? Math.round(realFinding.amountUsd * 83) : 0;
  var inc = r.model.income.india;

  console.log(p.id);

  // ---- Intermediate node checks: THIS is what proves real closure ----------
  check("indiaHasRegularBooksEntry matches the real model field exactly",
    out.indiaHasRegularBooksEntry === !!inc.indiaHasRegularBooksEntry,
    "graph=" + out.indiaHasRegularBooksEntry + " model=" + !!inc.indiaHasRegularBooksEntry);
  check("indiaHasValidPresumptiveEntry matches the real model field exactly",
    out.indiaHasValidPresumptiveEntry === !!inc.indiaHasValidPresumptiveEntry,
    "graph=" + out.indiaHasValidPresumptiveEntry + " model=" + !!inc.indiaHasValidPresumptiveEntry);
  check("indiaHasPartnerFirmIncome matches the real model field exactly",
    out.indiaHasPartnerFirmIncome === !!inc.indiaHasPartnerFirmIncome,
    "graph=" + out.indiaHasPartnerFirmIncome + " model=" + !!inc.indiaHasPartnerFirmIncome);
  var realHasPgbp = (inc.business.inr || 0) !== 0 || (inc.speculativeIncomeInr || 0) !== 0 ||
    !!inc.indiaHasRegularBooksEntry || !!inc.indiaHasValidPresumptiveEntry || !!inc.indiaHasPartnerFirmIncome;
  check("hasPgbpIncome (closed-boundary version) matches the real formula's answer exactly",
    out.hasPgbpIncome === realHasPgbp, "graph=" + out.hasPgbpIncome + " real=" + realHasPgbp);

  // ---- Final-output checks: same as Phase 1, still must hold ---------------
  console.log("  final: graph shouldFire=" + out.shouldFire + " totalInterestInr=" + Math.round(out.totalInterestInr) +
    " | production fired=" + (!!realFinding) + " amountInr=" + realInterestInr);
  check("final shouldFire still matches production", out.shouldFire === !!realFinding);
  check("final totalInterestInr still matches production (within ₹5 rounding)", close(out.totalInterestInr, realInterestInr));
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
