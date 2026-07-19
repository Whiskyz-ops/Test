"use strict";
/* ============================================================================
 * Verifies report-batch4-nodes.js (CFL-7 batch 4: buildWithholdingSummary)
 * against all 11 real profiles.
 *
 * Compares against WISING.analyze()'s withholding field directly
 * (structural deep-equal, not a findings array) — same pattern as
 * run-report1/2/3.js.
 *
 * Run: node prototypes/graph-pilot/run-report4.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch4-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function deepEqual(a, b, path) {
  path = path || "$";
  if (typeof a === "number" && typeof b === "number") return close(a, b, 1) ? null : [path + ": " + a + " !== " + b];
  if (a === b) return null;
  if (a == null || b == null) return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [path + ": array length/type mismatch (" + JSON.stringify(a) + " vs " + JSON.stringify(b) + ")"];
    var diffs = [];
    for (var i = 0; i < a.length; i++) { var d = deepEqual(a[i], b[i], path + "[" + i + "]"); if (d) diffs = diffs.concat(d); }
    return diffs.length ? diffs : null;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
    var odiffs = [];
    keys.forEach(function (k) { var d = deepEqual(a[k], b[k], path + "." + k); if (d) odiffs = odiffs.concat(d); });
    return odiffs.length ? odiffs : null;
  }
  return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
}

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };

  console.log(p.id);

  var out = graph.resolve(["buildWithholdingSummaryResult"], ctx).values.buildWithholdingSummaryResult;
  var diff = deepEqual(out, r.withholding);
  check("withholding matches exactly", !diff, diff && diff.slice(0, 10).join(" | "));

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
