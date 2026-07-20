"use strict";
/* ============================================================================
 * Verifies indiaIncomeModelResult (aggregateindiaincome-nodes.js) — the
 * India-side counterpart to aggregateUsIncomeResult — against the real
 * model.income.india, deep field-by-field, all 11 real profiles.
 *
 * Built for the monitor-next integration: the Monitor's Tax Computation
 * panel (Views.jsx) reads inc.india.{salary,business,houseProperty,
 * interest,dividend,otherSourcesMisc,stcg,ltcg,ltcg197Inr,vdaGainInr,
 * chapterXiiaInvestmentIncomeInr,specialRate115bb,deemedDividendBuyback}
 * directly off model.income — this node is what the DAG adapter feeds it.
 *
 * Run: node prototypes/graph-pilot/run-indiaincomemodel.js
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
function ok(label) { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok(label);
    return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok(label);
    if (Math.abs(a - b) <= 2) return ok(label);
    return bad(label, "graph=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "graph=" + a.length + " prod=" + b.length);
    for (var i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok(label);
  return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

console.log("indiaIncomeModelResult vs real model.income.india — deep, all " + WISING.PROFILES.length + " profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["indiaIncomeModelResult"], ctx).values.indiaIncomeModelResult;
  var before = fail;
  deepCheck("indiaIncome", out, r.model.income.india);
  console.log(p.id + "  " + (fail === before ? "all fields match" : "FAILURES above"));
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
