"use strict";
/* ============================================================================
 * Verifies report-batch1-nodes.js (CFL-7 batch 1: buildDocuments,
 * buildScopeNotes, buildReturnFormDetermination, buildFtcReport) against
 * all 11 real profiles.
 *
 * Unlike every CFL-6 runner, this compares against WISING.analyze()'s own
 * documents/scopeNotes/returnForms/ftcReport fields directly — NOT
 * findings — via a generic deep-equal (these are structural report
 * objects, not a findings array to filter by ID).
 *
 * Run: node prototypes/graph-pilot/run-report1.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch1-nodes.js").NODES;
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

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["buildDocumentsResult", "buildScopeNotesResult", "buildReturnFormDeterminationResult", "buildFtcReportResult"], ctx).values;

  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  console.log(p.id + (isUsEntity ? " (US ENTITY — ftcReport not in-graph, reporting only)" : isNra ? " (NRA — ftcReport not in-graph, reporting only)" : ""));

  // DAG-only documents (docs/GAP_TRACKER.md section H.7/H.13, 21-22 Jul
  // 2026): no engine equivalent for any of these — see
  // findings-batch5-nodes.js's usStateTaxResult and report-batch1-nodes.js's
  // DOCUMENTS_CATALOG comments.
  var DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id"];
  var docsForDiff = out.buildDocumentsResult.filter(function (x) { return DAG_ONLY_DOC_IDS.indexOf(x.id) === -1; });
  var docDiff = deepEqual(docsForDiff, r.documents);
  check("documents matches exactly (" + r.documents.length + " entries, " + r.documents.filter(function (x) { return x.required; }).length + " required)", !docDiff, docDiff && docDiff.slice(0, 3).join(" | "));

  var scopeDiff = deepEqual(out.buildScopeNotesResult, r.scopeNotes);
  check("scopeNotes matches exactly (" + r.scopeNotes.length + " notes)", !scopeDiff, scopeDiff && scopeDiff.slice(0, 3).join(" | "));

  var formsDiff = deepEqual(out.buildReturnFormDeterminationResult, r.returnForms);
  check("returnForms matches exactly", !formsDiff, formsDiff && formsDiff.slice(0, 3).join(" | "));

  // ftcReport is built on usTaxResult's liability figures — same TAX-7/
  // TAX-8 scope boundary as every prior batch's amt_applies/ftc_gap/etc:
  // the DAG only computes the resident/individual US tax path, so for a
  // US-entity or NRA profile this report is genuinely wrong, not a DAG
  // bug — reported, not asserted, same discipline as run-xborder-full.js.
  if (isUsEntity || isNra) {
    console.log("    (reported, not asserted) ftcReport would diverge here — usTaxResult only covers the resident/individual path");
  } else {
    var ftcDiff = deepEqual(out.buildFtcReportResult, r.ftcReport);
    check("ftcReport matches exactly", !ftcDiff, ftcDiff && ftcDiff.slice(0, 5).join(" | "));
  }

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
