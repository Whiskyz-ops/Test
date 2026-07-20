"use strict";
/* ============================================================================
 * Verifies findings-nodes.js (CFL-6, batch 1: pan_not_linked_aadhaar,
 * ftc_gap/ftc_available, amt_applies, entity_dual_residency_poem,
 * dual_residency/dual_residency_resolved) against all 11 real profiles.
 *
 * Checks TWO things per profile, for each of the 7 finding IDs this batch
 * covers: (1) fires/doesn't-fire matches the real engine exactly, (2) when
 * it fires, every field (title/detail/recommendation/amountUsd/refs)
 * matches exactly — not just the id.
 *
 * Run: node prototypes/graph-pilot/run-findings.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./findings-nodes.js").NODES;
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
    if (typeof a[k] === "number") return close(a[k], b[k] || 0);
    return a[k] === b[k];
  });
  return ok && JSON.stringify(a.refs) === JSON.stringify(b.refs);
}

var BATCH1_IDS = ["pan_not_linked_aadhaar", "ftc_gap", "ftc_available", "amt_applies", "entity_dual_residency_poem", "dual_residency", "dual_residency_resolved"];

console.log("Closing CFL-6 batch 1 (" + BATCH1_IDS.length + " finding IDs), run against all " + WISING.PROFILES.length + " real profiles\n");
console.log("US-entity/NRA profiles reported, not asserted, for ftc_gap/ftc_available/amt_applies specifically —");
console.log("same reason run-xborder-full.js does: those three depend on usTaxResult, the DAG's OWN us tax");
console.log("computation, which only covers the resident/individual path (TAX-7/TAX-8 scoped out). The other");
console.log("4 finding IDs in this batch don't depend on usTaxResult, so they're asserted on every profile.\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch1Result"], ctx).values.findingsBatch1Result;
  var real = r.findings.filter(function (f) { return BATCH1_IDS.indexOf(f.id) !== -1; });

  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;
  var usTaxDependentIds = ["ftc_gap", "ftc_available", "amt_applies"];

  console.log(p.id + (isUsEntity ? " (US ENTITY — ftc_gap/ftc_available/amt_applies not in-graph, reporting only)" : isNra ? " (NRA — ftc_gap/ftc_available/amt_applies not in-graph, reporting only)" : ""));

  if (isUsEntity || isNra) {
    var outFiltered = out.filter(function (f) { return usTaxDependentIds.indexOf(f.id) === -1; });
    var realFiltered = real.filter(function (f) { return usTaxDependentIds.indexOf(f.id) === -1; });
    check("finding IDs match exactly (excluding usTaxResult-dependent ones)", JSON.stringify(outFiltered.map(function (f) { return f.id; }).sort()) === JSON.stringify(realFiltered.map(function (f) { return f.id; }).sort()),
      "graph=" + JSON.stringify(outFiltered.map(function (f) { return f.id; })) + " prod=" + JSON.stringify(realFiltered.map(function (f) { return f.id; })));
    outFiltered.forEach(function (f) {
      var rf = realFiltered.filter(function (x) { return x.id === f.id; })[0];
      if (!rf) return;
      check(f.id + " matches exactly (all fields)", findingsEqual(f, rf), "graph=" + JSON.stringify(f) + " prod=" + JSON.stringify(rf));
    });
    var realUsTaxDependent = real.filter(function (f) { return usTaxDependentIds.indexOf(f.id) !== -1; });
    console.log("    (reported, not asserted) production usTaxResult-dependent findings: " + JSON.stringify(realUsTaxDependent.map(function (f) { return f.id; })));
  } else {
    check("finding IDs match exactly", JSON.stringify(out.map(function (f) { return f.id; }).sort()) === JSON.stringify(real.map(function (f) { return f.id; }).sort()),
      "graph=" + JSON.stringify(out.map(function (f) { return f.id; })) + " prod=" + JSON.stringify(real.map(function (f) { return f.id; })));
    out.forEach(function (f) {
      var rf = real.filter(function (x) { return x.id === f.id; })[0];
      if (!rf) return;
      check(f.id + " matches exactly (all fields)", findingsEqual(f, rf), "graph=" + JSON.stringify(f) + " prod=" + JSON.stringify(rf));
    });
  }
  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
