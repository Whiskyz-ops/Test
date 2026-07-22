"use strict";
/* ============================================================================
 * Verifies report-batch6-nodes.js (LIM-7: monitor()) against all 11 real
 * profiles.
 *
 * ctx.monitorAsOfBoundary is pinned to the real WISING.analyze() call's own
 * r.monitoring.asOf — monitor()'s "today" is a genuine caller-supplied
 * instant (new Date() when absent), not derivable from model/computed, so
 * two independent `new Date()` calls could in principle race a day
 * boundary. Pinning makes the comparison exact regardless of when this
 * script runs.
 *
 * deepEqual here has one addition over every earlier run-report*.js
 * runner: Date objects have zero own enumerable keys, so the generic
 * object-comparison branch would treat any two Date instances as
 * trivially equal — silently useless for a monitoring layer that's
 * mostly dates. Compared via getTime() instead.
 *
 * Run: node prototypes/graph-pilot/run-monitor.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch6-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function deepEqual(a, b, path) {
  path = path || "$";
  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b) + " (Date type mismatch)"];
    return a.getTime() === b.getTime() ? null : [path + ": " + a.toISOString() + " !== " + b.toISOString()];
  }
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

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = {
    router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed,
    monitorAsOfBoundary: r.monitoring.asOf
  };

  console.log(p.id);

  var out = graph.resolve(["monitorResult"], ctx).values.monitorResult;
  // form_nj1040 (docs/GAP_TRACKER.md section H.7, 21 Jul 2026) and form_8858
  // (section H.13, 22 Jul 2026): new DAG-only documents bundled into the US
  // filing deadline's docIds — no engine equivalent for either. Shallow-copy
  // just the calendar rows (not a full JSON clone, which would turn Date
  // objects into strings and break deepEqual's Date handling).
  var DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id"];
  var outForDiff = Object.assign({}, out, {
    calendar: Object.assign({}, out.calendar, {
      all: out.calendar.all.map(function (row) { return Array.isArray(row.docIds) ? Object.assign({}, row, { docIds: row.docIds.filter(function (id) { return DAG_ONLY_DOC_IDS.indexOf(id) === -1; }) }) : row; }),
      upcoming: out.calendar.upcoming.map(function (row) { return Array.isArray(row.docIds) ? Object.assign({}, row, { docIds: row.docIds.filter(function (id) { return DAG_ONLY_DOC_IDS.indexOf(id) === -1; }) }) : row; })
    })
  });
  var diff = deepEqual(outForDiff, r.monitoring);
  check("monitoring matches exactly", !diff, diff && diff.slice(0, 10).join(" | "));

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
