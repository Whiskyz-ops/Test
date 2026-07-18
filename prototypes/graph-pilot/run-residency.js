"use strict";
/* ============================================================================
 * Verifies residency-nodes.js against all 11 real profiles — full parity,
 * no boundary. Every field of residencyResult checked directly against the
 * real computed.residency object.
 *
 * ctx deliberately carries ONLY { router, india, us } — no model/computed —
 * to prove this is a genuine derivation, not a disguised boundary read.
 *
 * Run: node prototypes/graph-pilot/run-residency.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./residency-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}

console.log("Closing XBR-1 (resolveResidency), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["residencyResult"], ctx).values.residencyResult;
  var real = r.computed.residency;

  console.log(p.id);
  console.log("    graph: india=" + out.india.status + "/worldwide=" + out.india.worldwide + " us=" + out.us.status + "/worldwide=" + out.us.worldwide +
    " dual=" + out.dualResident + " tieBreak=" + out.tieBreakWinner);

  check("india.status matches", out.india.status === real.india.status, "graph=" + out.india.status + " prod=" + real.india.status);
  check("india.isResident matches", out.india.isResident === real.india.isResident);
  check("india.worldwide matches", out.india.worldwide === real.india.worldwide);
  check("india.cedesViaTreaty matches", out.india.cedesViaTreaty === real.india.cedesViaTreaty);
  check("us.status matches", out.us.status === real.us.status, "graph=" + out.us.status + " prod=" + real.us.status);
  check("us.isResident matches", out.us.isResident === real.us.isResident);
  check("us.worldwide matches", out.us.worldwide === real.us.worldwide);
  check("us.isCitizen matches", out.us.isCitizen === real.us.isCitizen);
  check("us.cedesViaTreaty matches", out.us.cedesViaTreaty === real.us.cedesViaTreaty);
  check("dualResident matches", out.dualResident === real.dualResident);
  check("tieBreakWinner matches", out.tieBreakWinner === real.tieBreakWinner, "graph=" + out.tieBreakWinner + " prod=" + real.tieBreakWinner);
  check("worldwideOverlap matches", out.worldwideOverlap === real.worldwideOverlap);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
