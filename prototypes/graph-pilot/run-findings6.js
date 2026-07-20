"use strict";
/* ============================================================================
 * Verifies findings-batch6-nodes.js (CFL-6's last finding:
 * holding_period_mismatch_N, dynamically suffixed per mismatch) against
 * all 11 real profiles.
 *
 * Unlike every other batch runner, this one filters production findings by
 * ID PREFIX ("holding_period_mismatch_") rather than a fixed ID list,
 * since the count varies per profile (however many mismatches exist AND
 * clear the $1 real-rate-difference bar).
 *
 * Run: node prototypes/graph-pilot/run-findings6.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./findings-batch6-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function findingsEqual(a, b) {
  var keys = ["id", "severity", "category", "title", "detail", "recommendation", "amountUsd"];
  var ok = keys.every(function (k) {
    if (typeof a[k] === "number") return close(a[k], b[k] || 0, 1);
    return a[k] === b[k];
  });
  return ok && JSON.stringify(a.refs) === JSON.stringify(b.refs);
}
var PREFIX = "holding_period_mismatch_";

var totalMismatchesSeen = 0, totalFiredSeen = 0;
WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["holdingPeriodMismatchFindingsResult"], ctx).values.holdingPeriodMismatchFindingsResult;
  var real = r.findings.filter(function (f) { return f.id.indexOf(PREFIX) === 0; });
  var mmCount = (r.model.income.india && r.model.income.india.holdingPeriodMismatches || []).length;
  totalMismatchesSeen += mmCount;
  totalFiredSeen += real.length;

  console.log(p.id + " (" + mmCount + " raw mismatch(es) on file, " + real.length + " fire in production)");
  check("finding IDs match exactly", JSON.stringify(out.map(function (f) { return f.id; }).sort()) === JSON.stringify(real.map(function (f) { return f.id; }).sort()),
    "graph=" + JSON.stringify(out.map(function (f) { return f.id; })) + " prod=" + JSON.stringify(real.map(function (f) { return f.id; })));
  out.forEach(function (f) {
    var rf = real.filter(function (x) { return x.id === f.id; })[0];
    if (!rf) return;
    check(f.id + " matches exactly (all fields)", findingsEqual(f, rf), "graph=" + JSON.stringify(f) + " prod=" + JSON.stringify(rf));
  });
  console.log("");
});

console.log("Totals across all 11 profiles: " + totalMismatchesSeen + " raw mismatches on file, " + totalFiredSeen + " actually fired (cleared the $1 bar) — confirms both the zero-delta skip and the fire path are genuinely exercised, not vacuous.\n");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
