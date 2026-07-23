"use strict";
/* ============================================================================
 * Verifies in1-nodes-v3.js's totalTaxInrV3 against the real
 * computed.indiaTax.totalTaxInr, for all 11 real profiles. Individual/HUF
 * profiles must match exactly (that's the actual claim of this phase).
 * Company profiles (india_pvt_ltd, us_ccorp_indian_sub,
 * foreign_holdco_poem_india) are reported, not asserted — they use
 * computeIndiaEntityTax, deliberately not ported this pass (see file
 * header of in1-nodes-v3.js).
 *
 * Run: node prototypes/graph-pilot/run-in1-v3.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./in1-nodes-v3.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Phase 1, last boundary: the full India tax computation, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var isEntity = !!(r.model.entity && (r.model.entity.indiaIsCompany || r.model.entity.indiaIsFirm));
  var out = graph.resolve(["totalTaxInrV3", "totalIncomeInrV3", "deductionsInrV3"], ctx).values;
  var realTotalTaxInr = r.computed.indiaTax.totalTaxInr;

  console.log(p.id + (isEntity ? " (COMPANY — computeIndiaEntityTax not ported, reporting only)" : ""));
  console.log("  graph totalTaxInr=" + Math.round(out.totalTaxInrV3) + " | production totalTaxInr=" + Math.round(realTotalTaxInr) +
    " | diff=" + Math.round(out.totalTaxInrV3 - realTotalTaxInr));
  if (isEntity) {
    console.log("");
    return;
  }
  check("totalTaxInr matches production exactly (within ₹5 rounding)", close(out.totalTaxInrV3, realTotalTaxInr));
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (individual/HUF profiles only — 3 company profiles reported above, not asserted)");
process.exit(fail > 0 ? 1 : 0);
