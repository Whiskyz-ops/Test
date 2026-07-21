"use strict";
/* ============================================================================
 * Verifies report-batch3-nodes.js (CFL-7 batch 3: buildTaxComputation's
 * `india` section — both the individual/HUF slab path and the company/firm
 * entity path).
 *
 * Compares against WISING.analyze()'s taxComputation.india field directly
 * (structural deep-equal, not a findings array) — same pattern as
 * run-report1.js/run-report2.js.
 *
 * Run: node prototypes/graph-pilot/run-report3.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch3-nodes.js").NODES;
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

  var isIndiaEntity = !!(r.model.entity && (r.model.entity.indiaIsCompany || r.model.entity.indiaIsFirm));
  console.log(p.id + (isIndiaEntity ? " (INDIA ENTITY — DELIBERATE DAG/engine divergence, docs/GAP_TRACKER.md section H)" : ""));

  var out = graph.resolve(["buildTaxComputationIndiaResult"], ctx).values.buildTaxComputationIndiaResult;
  if (isIndiaEntity) {
    // The engine's own trace text interpolates an undefined individual-only
    // field into a formula string here (a literal "₹NaN" — see
    // report-batch3-nodes.js's file header), so byte-identical comparison
    // is not the goal for this profile: the DAG's own genuine entity row
    // set is asserted directly instead of diffed against the engine.
    var hasNan = JSON.stringify(r.taxComputation.india).indexOf("NaN") >= 0;
    check("engine's own trace confirms the known ₹NaN divergence", hasNan, hasNan ? null : "engine no longer produces ₹NaN — re-check whether this override is still needed");
    var dagHasNan = JSON.stringify(out).indexOf("NaN") >= 0;
    check("DAG output has no NaN (genuine entity row set)", !dagHasNan, dagHasNan ? "DAG still produced NaN" : null);
    check("DAG totalUsd matches engine's own total (same entityTaxResult, different trace prose only)", close(out.totalUsd, r.taxComputation.india.totalUsd, 1));
  } else {
    var diff = deepEqual(out, r.taxComputation.india);
    check("taxComputation.india matches exactly", !diff, diff && diff.slice(0, 8).join(" | "));
  }

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
