"use strict";
/* ============================================================================
 * Differential test: JS DAG (this directory) vs Python DAG (dag_py/),
 * calling WISING.analyze() on both sides over every profile dag_py already
 * has committed (the 13 hand-authored fixtures + the 40-case seeded fuzz
 * corpus) — 53 profiles total, no new generation here.
 *
 * Distinct from every other run-*.js harness in this migration, which all
 * compare the JS DAG against the FROZEN ENGINE (archive/engine-frozen/) —
 * a comparison with real, catalogued, permanent divergences (docs/
 * GAP_TRACKER.md section H/D: the engine's own data-modeling gaps the DAG
 * deliberately doesn't reproduce, e.g. an entity's usSourceIncomeUsd, or
 * the frozen engine's "$NaN"/"₹NaN" trace bugs for an entity taxpayer).
 * THIS comparison has none of that built in on purpose: both the JS DAG
 * and dag_py/ are independent ports of the exact same source-of-truth
 * (ustax-full-nodes.js and friends), so on a faithful port they should
 * agree with EACH OTHER exactly, with zero allowlist — a stronger,
 * more direct check than "both individually match the (still-buggy-in-
 * places) engine" would be. This is the first real cross-check between the
 * two implementations since dag_py/'s Phase 7 (analyze() assembly) and the
 * subsequent us/ustax_full.py entity/NRA/trust routing work landed.
 *
 * Calls WISING.analyze() directly (analyze.js — the real DAG-package
 * boundary dag_py/'s own analyze.py ports field-for-field), NOT monitor-
 * next's lib/dag-adapter.js / this directory's own run-fuzz.js assembleDag()
 * helper — those two add monitor-next-specific extras (checksRegistry,
 * calendarAmounts) that analyze.js itself (and therefore dag_py/analyze.py)
 * doesn't produce at all, so comparing against analyze.js's own real output
 * is the correct apples-to-apples contract, not a narrower approximation
 * of it.
 *
 * Python side runs under plain CPython (dag_py/tools/analyze_cli.py) — NOT
 * Pyodide. No live browser/Pyodide runtime is fetchable in this sandbox
 * (see docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 section); this
 * harness deliberately validates the computation itself first, decoupled
 * from that separate, still-open browser-loading question.
 *
 * Run: node prototypes/graph-pilot/run-js-dag-vs-py-dag.js
 * Options: --verbose (print every profile's status, not just failures)
 * ==========================================================================*/
var path = require("path");
var fs = require("fs");
var spawnSync = require("child_process").spawnSync;

global.window = global;
require("./analyze.js");
var WISING = global.WISING;

var args = {};
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});
var VERBOSE = !!args.verbose;

// Fixed reference instant, pinned on BOTH sides, so monitoring's date-
// derived fields (asOf, calendar daysUntil, projection breach dates) compare
// fairly instead of drifting by the few ms between the two calls — same
// discipline as dag-adapter.js's own monitorAsOf pinning and dag_py's
// test_analyze_golden.py.
var MONITOR_AS_OF = "2026-07-25T12:00:00.000Z";

var REPO_ROOT = path.join(__dirname, "..", "..");
var DAG_PY_FIXTURES_DIR = path.join(REPO_ROOT, "dag_py", "tests", "fixtures", "profiles");
var FUZZ_CORPUS_PROFILES_DIR = path.join(REPO_ROOT, "dag_py", "tests", "fixtures", "golden", "fuzz-corpus", "profiles");
var ANALYZE_CLI = path.join(REPO_ROOT, "dag_py", "tools", "analyze_cli.py");

function loadProfilesFromDir(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return f.endsWith(".json"); }).sort().map(function (f) {
    var raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    return { id: prefix + f.replace(/\.json$/, ""), profile: raw };
  });
}

var CASES = loadProfilesFromDir(DAG_PY_FIXTURES_DIR, "fixture:").concat(loadProfilesFromDir(FUZZ_CORPUS_PROFILES_DIR, "corpus:"));

// ---- JS side: WISING.analyze() directly, then dates -> ISO strings so they
// compare against the Python side's JSON-round-tripped (already-string)
// dates on equal footing, rather than "JS Date vs Python string" always
// mismatching regardless of actual value. -----------------------------------
function datesToIso(node) {
  if (node instanceof Date) return isNaN(+node) ? null : node.toISOString();
  if (Array.isArray(node)) return node.map(datesToIso);
  if (node && typeof node === "object") {
    var out = {};
    Object.keys(node).forEach(function (k) { out[k] = datesToIso(node[k]); });
    return out;
  }
  return node;
}

function runJsDag(profile) {
  var out = WISING.analyze({ router: profile.router, india: profile.india, us: profile.us, monitorAsOf: MONITOR_AS_OF });
  return datesToIso(out);
}

// ---- Python side: one-shot subprocess per profile (dag_py/tools/
// analyze_cli.py — plain CPython, no Pyodide). ~70ms/call measured
// standalone; fine for the ~50-profile set this harness runs over. ---------
function runPyDag(profile) {
  var input = JSON.stringify({ router: profile.router, india: profile.india, us: profile.us, monitorAsOf: MONITOR_AS_OF });
  var res = spawnSync("python3", [ANALYZE_CLI], { input: input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error("analyze_cli.py exited " + res.status + ": " + (res.stderr || "").slice(0, 2000));
  return JSON.parse(res.stdout);
}

// ---- deep-equal: same tolerant-numeric/array/object shape as run-fuzz.js's
// own deepEqual (kept in sync there), minus the Date special-case (both
// sides are now plain ISO strings by the time this runs). No DAG_ONLY_KEYS
// skip-list here — both sides ARE the DAG, so there's no "engine has no
// equivalent" key to excuse; a key present on one side and not the other is
// itself a real divergence in this comparison. ------------------------------
function close(a, b) { var tol = Math.max(2, Math.abs(b) * 1e-6); return Math.abs(a - b) <= tol; }
function deepEqual(a, b, p, diffs) {
  p = p || "$"; diffs = diffs || [];
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return diffs;
    if (isNaN(a) && isNaN(b)) return diffs;
    if (!close(a, b)) diffs.push(p + ": " + a + " !== " + b);
    return diffs;
  }
  if (a === b) return diffs;
  if (a == null && b == null) return diffs;
  if (a == null || b == null) { diffs.push(p + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); return diffs; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { diffs.push(p + ": array length/type (" + (Array.isArray(a) ? a.length : typeof a) + " vs " + (Array.isArray(b) ? b.length : typeof b) + ")"); return diffs; }
    for (var i = 0; i < a.length; i++) deepEqual(a[i], b[i], p + "[" + i + "]", diffs);
    return diffs;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {}; Object.keys(a).forEach(function (k) { keys[k] = 1; }); Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) { deepEqual(a[k], b[k], p + "." + k, diffs); });
    return diffs;
  }
  diffs.push(p + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b));
  return diffs;
}

var TOP_LEVEL_PATHS = [
  "model", "computed", "findings", "documents", "ftcReport", "taxComputation",
  "withholding", "scopeNotes", "returnForms", "monitoring", "summary"
];

// ---- ONE known, investigated, JS-DAG-only bug, not a Python defect ------
// apportionmentBaseYearRaw's real JS source (agg10-nodes.js) reads
// `num(safe(router, "base_tax_year", ...)) || 2025` with NO int cast — a
// fuzzer-mutated router.base_tax_year that lands on a non-integer (e.g.
// "base_tax_year: 3712.07" from the numeric-jitter mutator) leaks straight
// into fyLabel/cyPrimary/cyNext and any trace text built from them. This
// port's own apportionmentBaseYearRaw (crossborder/apportionment.py)
// explicitly int()-casts (a deliberate, pre-existing "no trailing .0"
// fix — see that file's own comment), which also happens to make it
// immune to this fractional-year bug entirely. NOT fixed in the live JS
// DAG here: prototypes/graph-pilot/*.js stays the unmodified production
// compute path through this build (see the plan's own explicit cutover
// timing) — fixing a live-production file is a separate, deliberate
// decision, not a side effect of building this cross-check harness.
// Unreachable on any real profile (a real tax year is always a whole
// number) — only ever produced by run-fuzz.js's own numeric mutation.
function hasJsFractionalBaseYearBug(js) {
  var label = js && js.computed && js.computed.apportionment && js.computed.apportionment.fyLabel;
  return typeof label === "string" && /\d\.\d/.test(label);
}
var KNOWN_JS_FRACTIONAL_BASEYEAR_PATHS = ["computed.apportionment.fyLabel", "findings", "taxComputation.us"];
function pathMatchesKnown(p, prefixes) {
  return prefixes.some(function (prefix) { return p === prefix || p.indexOf(prefix + ".") === 0 || p.indexOf(prefix + "[") === 0; });
}

function compareOne(caseItem) {
  var jsThrew = null, pyThrew = null, js, py;
  try { js = runJsDag(caseItem.profile); } catch (e) { jsThrew = e; }
  try { py = runPyDag(caseItem.profile); } catch (e) { pyThrew = e; }
  if (jsThrew && pyThrew) return { status: "both-threw", detail: jsThrew.message + " | " + pyThrew.message };
  if (jsThrew && !pyThrew) return { status: "js-threw-py-didnt", detail: jsThrew.message + "\n" + jsThrew.stack };
  if (!jsThrew && pyThrew) return { status: "py-threw-js-didnt", detail: pyThrew.message };

  var diffs = [];
  TOP_LEVEL_PATHS.forEach(function (k) { deepEqual(js[k], py[k], k, diffs); });
  // Top-level key-set parity — a key present on one side and absent on the
  // other is a real divergence too, not just mismatched values within a
  // shared key.
  var jsKeys = Object.keys(js), pyKeys = Object.keys(py);
  jsKeys.filter(function (k) { return pyKeys.indexOf(k) === -1; }).forEach(function (k) { diffs.push("$: JS has top-level key \"" + k + "\", Python doesn't"); });
  pyKeys.filter(function (k) { return jsKeys.indexOf(k) === -1; }).forEach(function (k) { diffs.push("$: Python has top-level key \"" + k + "\", JS doesn't"); });

  var known = [], real = [];
  if (hasJsFractionalBaseYearBug(js)) {
    diffs.forEach(function (d) {
      var p = d.slice(0, d.search(/: /));
      (pathMatchesKnown(p, KNOWN_JS_FRACTIONAL_BASEYEAR_PATHS) ? known : real).push(d);
    });
  } else {
    real = diffs;
  }

  if (!real.length && !known.length) return { status: "match" };
  if (!real.length) return { status: "known", detail: known };
  return { status: "mismatch", detail: real };
}

console.log("JS DAG vs Python DAG: " + CASES.length + " profiles (13 fixtures + " + (CASES.length - 13) + " fuzz-corpus cases), monitorAsOf=" + MONITOR_AS_OF + "\n");

var stats = { match: 0, known: 0, mismatch: 0, bothThrew: 0, jsThrewPyDidnt: 0, pyThrewJsDidnt: 0 };
var failed = [];

CASES.forEach(function (c) {
  var r = compareOne(c);
  if (r.status === "match") {
    stats.match++;
    if (VERBOSE) console.log("[match] " + c.id);
  } else if (r.status === "known") {
    stats.known++;
    console.log("[known: JS fractional-base-year bug] " + c.id + ": " + r.detail.slice(0, 4).join(" | ") + (r.detail.length > 4 ? " | ... +" + (r.detail.length - 4) + " more" : ""));
  } else if (r.status === "both-threw") {
    stats.bothThrew++;
    console.log("[both-threw] " + c.id + ": " + r.detail);
  } else if (r.status === "js-threw-py-didnt") {
    stats.jsThrewPyDidnt++;
    failed.push(c.id);
    console.log("[JS THREW, PYTHON DIDN'T] " + c.id + ": " + r.detail);
  } else if (r.status === "py-threw-js-didnt") {
    stats.pyThrewJsDidnt++;
    failed.push(c.id);
    console.log("[PYTHON THREW, JS DIDN'T] " + c.id + ": " + r.detail);
  } else {
    stats.mismatch++;
    failed.push(c.id);
    console.log("[MISMATCH] " + c.id + " (" + r.detail.length + " diffs): " + r.detail.slice(0, 10).join(" | ") + (r.detail.length > 10 ? " | ... +" + (r.detail.length - 10) + " more" : ""));
  }
});

console.log("\n" + JSON.stringify(stats, null, 2));
if (failed.length) {
  console.log("\nFailed cases: " + failed.join(", "));
  process.exit(1);
}
console.log("\nAll " + CASES.length + " profiles: JS DAG === Python DAG.");
