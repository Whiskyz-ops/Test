"use strict";
/* ============================================================================
 * Verifies findings-batch4-nodes.js (CFL-6, batch 4: treaty_docs_missing,
 * dtaa_treaty_elections, withholding_documentation_gap,
 * carry_forward_losses_not_applied, feie_ineligible, feie_applied,
 * nra_fdap_flat_rate) against all 11 real profiles.
 *
 * Run: node prototypes/graph-pilot/run-findings4.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./findings-batch4-nodes.js").NODES;
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

var BATCH4_IDS = ["treaty_docs_missing", "dtaa_treaty_elections", "withholding_documentation_gap",
  "carry_forward_losses_not_applied", "feie_ineligible", "feie_applied", "nra_fdap_flat_rate"];

console.log("Closing CFL-6 batch 4 (" + BATCH4_IDS.length + " finding IDs), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch4Result"], ctx).values.findingsBatch4Result;
  var real = r.findings.filter(function (f) { return BATCH4_IDS.indexOf(f.id) !== -1; });

  console.log(p.id);
  check("finding IDs match exactly", JSON.stringify(out.map(function (f) { return f.id; }).sort()) === JSON.stringify(real.map(function (f) { return f.id; }).sort()),
    "graph=" + JSON.stringify(out.map(function (f) { return f.id; })) + " prod=" + JSON.stringify(real.map(function (f) { return f.id; })));
  out.forEach(function (f) {
    var rf = real.filter(function (x) { return x.id === f.id; })[0];
    if (!rf) return;
    check(f.id + " matches exactly (all fields)", findingsEqual(f, rf), "graph=" + JSON.stringify(f) + " prod=" + JSON.stringify(rf));
  });
  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
