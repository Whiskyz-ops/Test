"use strict";
/* ============================================================================
 * Phase 1 proof: run in1-nodes.js's graph against all 11 real demo profiles
 * and cross-check every number against the REAL, already-shipped
 * india_advance_tax_interest finding's actual output — not internal
 * consistency, exact parity with production.
 *
 * NOT wired into engine/ or tests/engine/run.js — a pilot, not a
 * replacement. Run: node prototypes/graph-pilot/run-in1.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./in1-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Phase 1: india_advance_tax_interest as a real end-to-end graph, " +
  "run against all " + WISING.PROFILES.length + " real demo profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var out = graph.resolve(["hasIndiaScope", "shouldFire", "totalInterestInr"], ctx).values;

  var realFinding = (r.findings || []).filter(function (f) { return f.id === "india_advance_tax_interest"; })[0];
  var realInterestInr = realFinding ? Math.round(realFinding.amountUsd * 83) : 0;

  console.log(p.id + " (hasIndiaScope=" + out.hasIndiaScope + ")");
  console.log("  graph: shouldFire=" + out.shouldFire + " totalInterestInr=" + Math.round(out.totalInterestInr) +
    " | production: fired=" + (!!realFinding) + " amountInr=" + realInterestInr);

  check("graph's shouldFire matches whether production actually fired the finding",
    out.shouldFire === !!realFinding);
  check("graph's totalInterestInr matches production's exact finding amount (within ₹5 rounding)",
    close(out.totalInterestInr, realInterestInr),
    "graph=" + Math.round(out.totalInterestInr) + " prod=" + realInterestInr);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
