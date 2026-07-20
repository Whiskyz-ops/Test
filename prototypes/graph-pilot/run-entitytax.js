"use strict";
/* ============================================================================
 * Verifies entitytax-nodes.js against all 11 real profiles. The 3 company
 * profiles (india_pvt_ltd, us_ccorp_indian_sub, foreign_holdco_poem_india)
 * must now hit exact parity — this is the boundary run-in1-v3.js reported
 * as open. The 8 individual/HUF profiles are checked too, informationally,
 * to confirm this graph correctly does NOT try to model them (their
 * numbers won't match — computeIndiaEntityTax is never the function that
 * ran for them in production; the individual slab path already closed in
 * in1-nodes-v3.js is what applies).
 *
 * Run: node prototypes/graph-pilot/run-entitytax.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./entitytax-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Closing computeIndiaEntityTax, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var isEntity = !!(r.model.entity && (r.model.entity.indiaIsCompany || r.model.entity.indiaIsFirm));
  var out = graph.resolve(["totalTaxInrEntity", "entityTaxResult"], ctx).values;
  var realTotalTaxInr = r.computed.indiaTax.totalTaxInr;
  var realRegime = r.computed.indiaTax.regime;

  console.log(p.id + (isEntity ? " (COMPANY/FIRM)" : " (individual/HUF — informational only)"));
  console.log("  graph: totalTaxInr=" + Math.round(out.totalTaxInrEntity) + " regime=\"" + out.entityTaxResult.regime + "\"" +
    " matApplied=" + out.entityTaxResult.matApplied);
  console.log("  production: totalTaxInr=" + Math.round(realTotalTaxInr) + " regime=\"" + realRegime + "\"");

  if (!isEntity) { console.log(""); return; }

  check("totalTaxInr matches production exactly (within ₹5 rounding)", close(out.totalTaxInrEntity, realTotalTaxInr));
  check("regime label matches production exactly", out.entityTaxResult.regime === realRegime);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (company/firm profiles only)");
process.exit(fail > 0 ? 1 : 0);
