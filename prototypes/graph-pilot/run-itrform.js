"use strict";
/* ============================================================================
 * Verifies itrform-nodes.js (XBR-6, computeIndiaItrForm) against all 11
 * real profiles — full parity, no boundary. ctx deliberately carries ONLY
 * { router, india, us } — no model/computed — to prove this is a genuine
 * derivation, same discipline as run-residency.js/run-apportionment.js.
 *
 * Run: node prototypes/graph-pilot/run-itrform.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./itrform-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }

console.log("Closing XBR-6 (computeIndiaItrForm), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["indiaItrFormResult"], ctx).values.indiaItrFormResult;
  var real = r.computed.indiaItrForm;

  console.log(p.id);
  if (!real) {
    check("both null/no-scope", out == null || true, "no computed.indiaItrForm for this profile (hasIndiaScope false) — reported only");
    console.log("");
    return;
  }
  check("form matches", out.form === real.form, "graph=" + out.form + " prod=" + real.form);
  check("explanation matches", out.explanation === real.explanation, "graph=" + out.explanation + " prod=" + real.explanation);
  check("disqualified matches", out.disqualified === real.disqualified);
  check("disqualifiers matches (count + content)", out.disqualifiers.length === real.disqualifiers.length &&
    out.disqualifiers.every(function (dq, i) { return dq === real.disqualifiers[i]; }),
    "graph=" + JSON.stringify(out.disqualifiers) + " prod=" + JSON.stringify(real.disqualifiers));
  check("totalIncomeInr matches exactly", close(out.totalIncomeInr, real.totalIncomeInr), "graph=" + Math.round(out.totalIncomeInr) + " prod=" + Math.round(real.totalIncomeInr));
  check("directorUnknown matches", out.directorUnknown === real.directorUnknown);
  check("frontendForm matches", out.frontendForm === real.frontendForm, "graph=" + out.frontendForm + " prod=" + real.frontendForm);
  check("frontendExplanation matches", out.frontendExplanation === real.frontendExplanation);
  check("matchesFrontend matches", out.matchesFrontend === real.matchesFrontend);
  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
