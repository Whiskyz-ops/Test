"use strict";
/* ============================================================================
 * Verifies apportionment-nodes.js (XBR-5, computeApportionment) against all
 * 11 real profiles — full parity, no boundary. ctx deliberately carries ONLY
 * { router, india, us } — no model/computed — to prove this is a genuine
 * derivation, same discipline as run-residency.js/run-aggregateindiaincome.js.
 *
 * Run: node prototypes/graph-pilot/run-apportionment.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./apportionment-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }

console.log("Closing XBR-5 (computeApportionment), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["apportionmentResult"], ctx).values.apportionmentResult;
  var real = r.computed.apportionment;

  console.log(p.id);
  check("basis matches", out.basis === real.basis, "graph=" + out.basis + " prod=" + real.basis);
  check("fyLabel matches", out.fyLabel === real.fyLabel, "graph=" + out.fyLabel + " prod=" + real.fyLabel);
  check("cyPrimary matches", out.cyPrimary === real.cyPrimary);
  check("cyNext matches", out.cyNext === real.cyNext);
  check("indiaFyTotalUsd matches", close(out.indiaFyTotalUsd, real.indiaFyTotalUsd), "graph=" + out.indiaFyTotalUsd + " prod=" + real.indiaFyTotalUsd);
  check("indiaToCyPrimaryUsd matches", close(out.indiaToCyPrimaryUsd, real.indiaToCyPrimaryUsd), "graph=" + out.indiaToCyPrimaryUsd + " prod=" + real.indiaToCyPrimaryUsd);
  check("indiaToCyNextUsd matches", close(out.indiaToCyNextUsd, real.indiaToCyNextUsd), "graph=" + out.indiaToCyNextUsd + " prod=" + real.indiaToCyNextUsd);
  check("primaryShare matches", close(out.primaryShare, real.primaryShare, 0.0001), "graph=" + out.primaryShare + " prod=" + real.primaryShare);
  check("nextShare matches", close(out.nextShare, real.nextShare, 0.0001), "graph=" + out.nextShare + " prod=" + real.nextShare);
  check("usCyTotalUsd matches", close(out.usCyTotalUsd, real.usCyTotalUsd), "graph=" + out.usCyTotalUsd + " prod=" + real.usCyTotalUsd);
  check("usCyToFyPrimaryUsd matches", close(out.usCyToFyPrimaryUsd, real.usCyToFyPrimaryUsd), "graph=" + out.usCyToFyPrimaryUsd + " prod=" + real.usCyToFyPrimaryUsd);
  check("usCyToFyNextUsd matches", close(out.usCyToFyNextUsd, real.usCyToFyNextUsd), "graph=" + out.usCyToFyNextUsd + " prod=" + real.usCyToFyNextUsd);
  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
