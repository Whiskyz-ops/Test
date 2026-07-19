"use strict";
/* ============================================================================
 * Verifies report-batch5-nodes.js (CFL-7 batch 5, the last: analyze()) —
 * the FULL WISING.analyze() return shape assembled from the graph, against
 * all 11 real profiles.
 *
 * findings is compared by ID (sorted), not array position — detectConflicts's
 * internal call order was never a contract any earlier CFL-6 runner relied
 * on either; every one of them compared findings by ID against
 * WISING.analyze()'s own findings[].
 *
 * taxComputation.us and ftcReport are reported-not-asserted for the 2
 * US-entity/NRA profiles — the same TAX-7/TAX-8 boundary every earlier
 * batch runner already established (usTaxResult only covers the
 * resident/individual path). Every other field, including
 * taxComputation.india/usState, documents, withholding, scopeNotes,
 * returnForms, model, computed, monitoring, and summary, is asserted
 * unconditionally for all 11 profiles.
 *
 * Run: node prototypes/graph-pilot/run-analyze.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch5-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function deepEqual(a, b, path) {
  path = path || "$";
  if (typeof a === "number" && typeof b === "number") return close(a, b, 1) ? null : [path + ": " + a + " !== " + b];
  if (a === b) return null;
  if (a == null || b == null) return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [path + ": array length/type mismatch (" + JSON.stringify(a) + " vs " + JSON.stringify(b) + ")"];
    var diffs = [];
    for (var i = 0; i < a.length; i++) { var d = deepEqual(a[i], b[i], path + "[" + i + "]"); if (d) diffs = diffs.concat(d); }
    return diffs.length ? diffs : null;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
    var odiffs = [];
    keys.forEach(function (k) { var d = deepEqual(a[k], b[k], path + "." + k); if (d) odiffs = odiffs.concat(d); });
    return odiffs.length ? odiffs : null;
  }
  return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
}
function byId(arr) { return arr.slice().sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; }); }

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed, monitoringBoundary: r.monitoring };

  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  console.log(p.id + (isUsEntity ? " (US ENTITY — taxComputation.us/ftcReport not in-graph, reporting only)" : isNra ? " (NRA — taxComputation.us/ftcReport not in-graph, reporting only)" : ""));

  var out = graph.resolve(["analyzeResult"], ctx).values.analyzeResult;

  check("model matches exactly", out.model === r.model);
  check("computed matches exactly", out.computed === r.computed);

  // Same TAX-7/TAX-8 boundary run-findings.js already established: ftc_gap/
  // ftc_available/amt_applies all depend on usTaxResult, which doesn't cover
  // the US-entity/NRA path — reported, not asserted, for those 2 profiles.
  var usTaxDependentIds = ["ftc_gap", "ftc_available", "amt_applies"];
  var mineFindings = out.findings, realFindings = r.findings;
  if (isUsEntity || isNra) {
    mineFindings = mineFindings.filter(function (f) { return usTaxDependentIds.indexOf(f.id) === -1; });
    realFindings = realFindings.filter(function (f) { return usTaxDependentIds.indexOf(f.id) === -1; });
    console.log("    (reported, not asserted) ftc_gap/ftc_available/amt_applies would diverge here — usTaxResult only covers the resident/individual path");
  }
  var findingsDiff = deepEqual(byId(mineFindings), byId(realFindings));
  check("findings match exactly (by ID, order-independent)", !findingsDiff, findingsDiff && findingsDiff.slice(0, 6).join(" | "));

  var docsDiff = deepEqual(out.documents, r.documents);
  check("documents match exactly", !docsDiff, docsDiff && docsDiff.slice(0, 4).join(" | "));

  if (isUsEntity || isNra) {
    console.log("    (reported, not asserted) ftcReport and taxComputation.us would diverge here — usTaxResult only covers the resident/individual path");
  } else {
    var ftcDiff = deepEqual(out.ftcReport, r.ftcReport);
    check("ftcReport matches exactly", !ftcDiff, ftcDiff && ftcDiff.slice(0, 4).join(" | "));
    var usDiff = deepEqual(out.taxComputation.us, r.taxComputation.us);
    check("taxComputation.us matches exactly", !usDiff, usDiff && usDiff.slice(0, 4).join(" | "));
  }
  var indiaDiff = deepEqual(out.taxComputation.india, r.taxComputation.india);
  check("taxComputation.india matches exactly", !indiaDiff, indiaDiff && indiaDiff.slice(0, 4).join(" | "));
  var usStateDiff = deepEqual(out.taxComputation.usState, r.taxComputation.usState);
  check("taxComputation.usState matches exactly", !usStateDiff, usStateDiff && usStateDiff.slice(0, 4).join(" | "));

  var whDiff = deepEqual(out.withholding, r.withholding);
  check("withholding matches exactly", !whDiff, whDiff && whDiff.slice(0, 4).join(" | "));

  var scopeDiff = deepEqual(out.scopeNotes, r.scopeNotes);
  check("scopeNotes match exactly", !scopeDiff, scopeDiff && scopeDiff.slice(0, 4).join(" | "));

  var returnFormsDiff = deepEqual(out.returnForms, r.returnForms);
  check("returnForms match exactly", !returnFormsDiff, returnFormsDiff && returnFormsDiff.slice(0, 4).join(" | "));

  check("monitoring matches exactly", out.monitoring === r.monitoring);

  var summaryDiff = deepEqual(out.summary, r.summary);
  check("summary matches exactly", !summaryDiff, summaryDiff && summaryDiff.slice(0, 6).join(" | "));

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
