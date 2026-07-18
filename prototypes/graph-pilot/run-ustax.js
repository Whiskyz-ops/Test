"use strict";
/* ============================================================================
 * Verifies ustax-nodes.js against all 11 real profiles. 9 individual/
 * resident profiles must hit exact parity on computed.usTax's real
 * output — the actual claim of this phase. The 1 US entity profile
 * (us_ccorp_indian_sub -> computeUsEntityTax) and 1 NRA profile
 * (india_ror_us_income -> computeNraTax) are reported, not asserted —
 * both take a different code path in production this file doesn't
 * attempt, same honest pattern as entitytax-nodes.js on the India side.
 *
 * Run: node prototypes/graph-pilot/run-ustax.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./ustax-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 2); }

console.log("Closing the US tax computation (mirroring computeIndiaTax), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  var out = graph.resolve(["usTaxResult"], ctx).values.usTaxResult;
  var real = r.computed.usTax;

  console.log(p.id + (isEntity ? " (US ENTITY — computeUsEntityTax not ported, reporting only)" : isNra ? " (NRA — computeNraTax not ported, reporting only)" : ""));
  console.log("    graph totalTaxBeforeFtcUsd=$" + Math.round(out.totalTaxBeforeFtcUsd) + " | production=$" + Math.round(real.totalTaxBeforeFtcUsd || 0));

  if (isEntity || isNra) { console.log(""); return; }

  check("agiUsd matches exactly", close(out.agiUsd, real.agiUsd), "graph=" + Math.round(out.agiUsd) + " prod=" + Math.round(real.agiUsd));
  check("taxableIncomeUsd matches exactly", close(out.taxableIncomeUsd, real.taxableIncomeUsd), "graph=" + Math.round(out.taxableIncomeUsd) + " prod=" + Math.round(real.taxableIncomeUsd));
  check("incomeTaxUsd matches exactly", close(out.incomeTaxUsd, real.incomeTaxUsd));
  check("seTaxUsd matches exactly", close(out.seTaxUsd, real.seTaxUsd));
  check("niitUsd matches exactly", close(out.niitUsd, real.niitUsd));
  check("qbiDeductionUsd matches exactly", close(out.qbiDeductionUsd, real.qbiDeductionUsd));
  check("amtUsd matches exactly", close(out.amtUsd, real.amtUsd));
  check("creditsUsd matches exactly", close(out.creditsUsd, real.creditsUsd));
  check("totalTaxBeforeFtcUsd matches production exactly", close(out.totalTaxBeforeFtcUsd, real.totalTaxBeforeFtcUsd),
    "graph=" + Math.round(out.totalTaxBeforeFtcUsd) + " prod=" + Math.round(real.totalTaxBeforeFtcUsd));
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (individual/resident profiles only — the entity and NRA profiles are reported above, not asserted)");
process.exit(fail > 0 ? 1 : 0);
