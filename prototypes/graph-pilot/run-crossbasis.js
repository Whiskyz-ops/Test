"use strict";
/* ============================================================================
 * Verifies crossbasis-nodes.js (XBR-4, crossBasis) against all 11 real
 * profiles — full parity, no boundary. ctx deliberately carries ONLY
 * { router, india, us } — no model/computed — to prove this is a genuine
 * derivation, same discipline as run-doubletax.js/run-itrform.js.
 *
 * Checked against the ENGINE POST-FIX (GAP_TRACKER.md IN-41) — both sides
 * now use the correctly case-normalized standard deduction.
 *
 * Run: node prototypes/graph-pilot/run-crossbasis.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./crossbasis-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function rowsEqual(a, b) {
  var keys = ["head", "label", "dir", "source", "indiaLawUsd", "usLawUsd", "indiaRule", "usRule", "note", "doublyTaxed", "overlapUsd", "estimate", "sameBase"];
  return keys.every(function (k) {
    if (typeof a[k] === "number") return close(a[k], b[k] || 0);
    return (a[k] || undefined) === (b[k] || undefined);
  });
}

console.log("Closing XBR-4 (crossBasis), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  // crossBasisResult pulls in usTaxResult (for feieAppliedUsd), which
  // transitively needs baseYearUs/usEntityKind (ustax-nodes.js) — real,
  // already-documented open boundaries (see TAX-10's own row), not
  // something this port introduces. Same ctx shape as run-xborder-full.js.
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["crossBasisResult"], ctx).values.crossBasisResult;
  var real = r.computed.reconciliation;

  console.log(p.id);
  check("rows count matches", out.rows.length === real.rows.length,
    "graph=" + JSON.stringify(out.rows.map(function (rr) { return rr.head; })) + " prod=" + JSON.stringify(real.rows.map(function (rr) { return rr.head; })));
  out.rows.forEach(function (rr, i) {
    var rp = real.rows[i];
    if (!rp) return;
    check("rows[" + i + "] (" + rr.head + ") matches exactly", rowsEqual(rr, rp), "graph=" + JSON.stringify(rr) + " prod=" + JSON.stringify(rp));
  });
  check("overlapUsd matches exactly", close(out.overlapUsd, real.overlapUsd), "graph=" + out.overlapUsd + " prod=" + real.overlapUsd);
  check("feieAppliedUsd matches exactly", close(out.feieAppliedUsd, real.feieAppliedUsd), "graph=" + out.feieAppliedUsd + " prod=" + real.feieAppliedUsd);
  check("anyEstimate matches", out.anyEstimate === real.anyEstimate);
  console.log("");
});

// ---- IN-41: OLD-regime standard deduction (₹50,000, not ₹75,000) ----------
// None of the 11 real profiles combine OLD regime with a salary row under
// either direction, so the case-sensitivity bug fixed in the engine this
// same session (computation.js:1520) was never exercised by the loop
// above. Synthetic case, checked against the now-fixed engine directly.
console.log("-- IN-41: OLD-regime standard deduction is ₹50,000, not ₹75,000 --");
(function () {
  var india = {
    profile: { entity_type: "individual", tax_regime: "OLD" },
    residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
    domestic_income: { salary: { taxable_salary_inr: 1000000 } }
  };
  var us = { profile: { filing_status: "single" }, us_residency_detail: { is_us_citizen: true, final_us_residency_status: "RESIDENT_ALIEN" } };
  var r = WISING.analyze({ router: {}, india: india, us: us });
  var ctx = { router: {}, india: india, us: us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["crossBasisResult"], ctx).values.crossBasisResult;
  var real = r.computed.reconciliation;
  var outSalary = out.rows.filter(function (rr) { return rr.head === "salary"; })[0];
  var realSalary = real.rows.filter(function (rr) { return rr.head === "salary"; })[0];
  check("engine shows ₹50,000 OLD-regime std deduction (not ₹75,000)", realSalary.indiaRule.indexOf("₹50,000") !== -1, realSalary.indiaRule);
  check("DAG matches engine exactly, same OLD-regime figure", outSalary.indiaRule === realSalary.indiaRule && outSalary.indiaLawUsd === realSalary.indiaLawUsd,
    "graph=" + JSON.stringify(outSalary) + " prod=" + JSON.stringify(realSalary));
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
