"use strict";
/* ============================================================================
 * Verifies xborder-full-nodes.js — the product's headline FTC numbers
 * computed end-to-end from raw Layer 1 form data, as one graph.
 *
 * The strictest ctx of any runner in this effort: model carries ONLY
 * {entity, meta} (the two tracked AGG-10 boundaries). No model.income at
 * all — not poisoned, absent. No computed at all. If any node anywhere in
 * the merged graph still reads engine-aggregated income, engine-computed
 * tax, or engine-resolved residency, it fails loudly here.
 *
 * Asserted: every field of computed.ftc (11 US + 4 India + net) on every
 * profile whose US-side tax the DAG computes (individual/resident). The
 * US-entity profile and the NRA profile are reported, not asserted —
 * their US tax comes from computeUsEntityTax/computeNraTax (TAX-7/TAX-8,
 * scoped out), so their FTC would be built on a tax figure the DAG
 * doesn't produce. India-side-only entity profiles (Indian companies with
 * no US activity) ARE asserted — the India entity path is fully in-graph.
 *
 * Run: node prototypes/graph-pilot/run-xborder-full.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./xborder-full-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) {
  if (typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b)) return true;
  return Math.abs(a - b) <= (tol || 2);
}

var US_FIELDS = ["foreignSourceIncomeUsd", "feieExcludedUsd", "indiaTaxDisallowedUsd", "taxableIncomeUsd",
  "usIncomeTaxUsd", "indiaTaxPaidUsd", "limitFraction", "ftcLimitUsd", "ftcAllowedUsd", "carryoverUsd", "residualDoubleTaxUsd"];
var INDIA_FIELDS = ["foreignSourceIncomeUsd", "usTaxOnUsSourceUsd", "reliefCapUsd", "reliefAllowedUsd"];

console.log("Full cross-border graph: raw form data -> both incomes -> both taxes -> residency -> FTC, all " + WISING.PROFILES.length + " profiles.");
console.log("ctx.model carries ONLY {entity, meta}; no income, no computed.\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = {
    router: p.router, india: p.india, us: p.us,
    model: { entity: r.model.entity, meta: r.model.meta }
  };
  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  var out = graph.resolve(["ftcResult"], ctx).values.ftcResult;
  var real = r.computed.ftc;

  console.log(p.id +
    (isUsEntity ? " (US ENTITY — US tax not in-graph, reporting only)" : isNra ? " (NRA — US tax not in-graph, reporting only)" : "") +
    "  net double tax: graph=$" + Math.round(out.netUnrelievedDoubleTaxUsd) + " | production=$" + Math.round(real.netUnrelievedDoubleTaxUsd));

  if (isUsEntity || isNra) { console.log(""); return; }

  US_FIELDS.forEach(function (f) {
    check("us." + f, close(out.us[f], real.us[f], f === "limitFraction" ? 0.0001 : 2),
      "graph=" + out.us[f] + " prod=" + real.us[f]);
  });
  INDIA_FIELDS.forEach(function (f) {
    check("india." + f, close(out.india[f], real.india[f]),
      "graph=" + out.india[f] + " prod=" + real.india[f]);
  });
  check("netUnrelievedDoubleTaxUsd", close(out.netUnrelievedDoubleTaxUsd, real.netUnrelievedDoubleTaxUsd),
    "graph=" + out.netUnrelievedDoubleTaxUsd + " prod=" + real.netUnrelievedDoubleTaxUsd);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (individual/resident + India-entity profiles asserted; US-entity and NRA reported only)");
process.exit(fail > 0 ? 1 : 0);
