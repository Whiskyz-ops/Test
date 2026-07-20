"use strict";
/* ============================================================================
 * RANDOMIZED DIFFERENTIAL HARNESS — the answer to "you only tested 12 fixtures;
 * what about a totally different profile a real user types in?"
 *
 * Generates large numbers of valid-but-NOVEL Layer 0/1 profiles the 12
 * hand-authored fixtures never covered, runs BOTH the production engine
 * (engine/*.js, the source of truth) and the DAG (the full routed chain,
 * ustax-full-nodes.js) over each, and deep-compares the ENTIRE product
 * surface the Monitor consumes — every finding, the FTC report, the tax
 * computation, withholding, documents, monitoring, summary, plus every
 * derived model/computed block. Any value divergence is a real bug.
 *
 * How the profiles are generated (two independent sources of novelty):
 *   1. CROSS-BREEDING — router / india / us drawn from three INDEPENDENTLY
 *      chosen fixtures. 12^3 = 1728 base combinations none of the fixtures
 *      had (e.g. a US-C-corp `us` block under an India-only `router`).
 *   2. STRUCTURAL MUTATION — K random edits per profile: flip a boolean,
 *      zero/scale/negate a number, swap an enum string to another value
 *      that key is seen to take across the fixtures (kept in-vocabulary so
 *      the profile stays plausible), delete an optional key, or
 *      duplicate/drop an array element. Mutations hit branch conditions the
 *      fixtures pin to one value.
 *
 * Deterministic + reproducible: a master seed (argv[2] or time-based) drives
 * a seeded PRNG; every failing profile is dumped to scratch as JSON so it
 * can be replayed / minimized / promoted to a permanent fixture. Re-running
 * with the same seed reproduces the exact same run.
 *
 * Categories reported:
 *   - VALUE DIVERGENCE (both ran, outputs differ)  <- the real prize
 *   - DAG-ONLY THROW    (engine ok, DAG threw)      <- real DAG bug
 *   - ENGINE-ONLY THROW (DAG ok, engine threw)      <- DAG more tolerant; noted
 *   - both threw                                    <- agreement, skipped
 *
 * Usage: node prototypes/graph-pilot/run-fuzz-differential.js [iterations] [seed]
 * ==========================================================================*/
var path = require("path");
var fs = require("fs");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./ustax-full-nodes.js").NODES;
var graph = createGraph(NODES);

var ITERATIONS = parseInt(process.argv[2], 10) || 3000;
var SEED = process.argv[3] != null ? (parseInt(process.argv[3], 10) >>> 0) : (Date.now() >>> 0);
var FIXED_ASOF_TS = Date.UTC(2026, 6, 15, 12, 0, 0); // pin "now" so monitoring dates are deterministic on both sides
var SCRATCH = "/tmp/claude-0/-home-user-Test/da747a60-be20-5c98-8464-f502f0d5878a/scratchpad";

/* ---- seeded PRNG (mulberry32) — deterministic + replayable -------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- harvest per-leaf-key value pools from all bases -------------------- */
var BASES = [WISING.SAMPLE].concat(WISING.PROFILES.map(function (p) { return { router: p.router, india: p.india, us: p.us }; }));
var stringPools = {}; // leafKey -> Set of string values seen
var numberPools = {}; // leafKey -> array of numbers seen
function harvest(node, key) {
  if (node == null) return;
  if (typeof node === "string") { (stringPools[key] = stringPools[key] || new Set()).add(node); return; }
  if (typeof node === "number") { (numberPools[key] = numberPools[key] || []).push(node); return; }
  if (Array.isArray(node)) { node.forEach(function (x) { harvest(x, key); }); return; }
  if (typeof node === "object") { Object.keys(node).forEach(function (k) { harvest(node[k], k); }); }
}
BASES.forEach(function (b) { harvest(b, "$root"); });
Object.keys(stringPools).forEach(function (k) { stringPools[k] = Array.from(stringPools[k]); });

/* ---- generator ---------------------------------------------------------- */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Collect every mutable path in a tree as we walk, so we can pick random targets.
function collectPaths(node, prefix, out) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    out.push({ container: node, isArray: true, prefix: prefix });
    node.forEach(function (x, i) { collectPaths(x, prefix + "[" + i + "]", out); });
    return;
  }
  Object.keys(node).forEach(function (k) {
    out.push({ container: node, key: k, prefix: prefix + "." + k });
    collectPaths(node[k], prefix + "." + k, out);
  });
}

function mutateValue(v, key, rnd) {
  if (typeof v === "boolean") return !v;
  if (typeof v === "number") {
    var pick = rnd();
    if (pick < 0.15) return 0;
    if (pick < 0.30) return -v;
    if (pick < 0.45) return v * [0.1, 0.5, 2, 10, 100][Math.floor(rnd() * 5)];
    if (pick < 0.60 && numberPools[key] && numberPools[key].length) return numberPools[key][Math.floor(rnd() * numberPools[key].length)];
    if (pick < 0.75) return Math.floor(rnd() * 50000000); // fresh large magnitude (hits surcharge/bracket bands)
    if (pick < 0.85) return v + (rnd() - 0.5) * v;         // small perturbation
    return Math.floor(rnd() * 400);                         // small count (days, children, %)
  }
  if (typeof v === "string") {
    var pool = stringPools[key];
    if (pool && pool.length > 1) return pool[Math.floor(rnd() * pool.length)];
    return rnd() < 0.3 ? "" : v;
  }
  return v;
}

function generate(rnd) {
  // 1. cross-breed router/india/us from independent bases
  var profile = {
    router: clone(BASES[Math.floor(rnd() * BASES.length)].router),
    india: clone(BASES[Math.floor(rnd() * BASES.length)].india),
    us: clone(BASES[Math.floor(rnd() * BASES.length)].us)
  };
  // 2. apply K structural mutations
  var K = 1 + Math.floor(rnd() * 12);
  for (var i = 0; i < K; i++) {
    var paths = [];
    collectPaths(profile, "$", paths);
    if (!paths.length) break;
    var target = paths[Math.floor(rnd() * paths.length)];
    var action = rnd();
    if (target.isArray) {
      var arr = target.container;
      if (arr.length && action < 0.4) arr.splice(Math.floor(rnd() * arr.length), 1);            // drop element
      else if (arr.length && action < 0.7) arr.push(clone(arr[Math.floor(rnd() * arr.length)])); // duplicate element
      // else leave (shuffle would need element-level; drop/dup already reorders effect)
    } else {
      var k = target.key, cur = target.container[k];
      if (action < 0.12 && cur !== undefined) delete target.container[k];            // drop optional key
      else if (cur !== null && typeof cur !== "object") target.container[k] = mutateValue(cur, k, rnd); // mutate leaf
      else if (cur === null && stringPools[k]) target.container[k] = stringPools[k][Math.floor(rnd() * stringPools[k].length)]; // fill a null
    }
  }
  return profile;
}

/* ---- comparison --------------------------------------------------------- */
function isNum(x) { return typeof x === "number"; }
// Directional deep compare: for every value the ENGINE produced, the DAG must
// match (±2 for money, NaN-parity). Extra DAG-only keys are ignored (e.g.
// usTaxResult.feieAppliedUsd, a documented adapter-stripped convenience field).
function diff(label, eng, dag, out, depth) {
  if (out.length >= 12 || depth > 40) return;
  if (eng === null || eng === undefined) {
    if (!(dag === null || dag === undefined)) out.push(label + ": engine=" + JSON.stringify(eng) + " dag=" + short(dag));
    return;
  }
  if (dag === null || dag === undefined) { out.push(label + ": engine=" + short(eng) + " dag=" + JSON.stringify(dag)); return; }
  if (isNum(eng) && isNum(dag)) {
    if (isNaN(eng) && isNaN(dag)) return;
    if (Math.abs(eng - dag) > 2) out.push(label + ": engine=" + eng + " dag=" + dag);
    return;
  }
  if (eng instanceof Date || dag instanceof Date) {
    var et = +new Date(eng), dt = +new Date(dag);
    // Two Invalid Dates agree (e.g. a degenerate mutated base_tax_year makes
    // BOTH engine and DAG emit invalid calendar dates — that's the DAG
    // faithfully reproducing the engine, not a divergence). Mirrors the
    // NaN-number parity above.
    if (!(isNaN(et) && isNaN(dt)) && et !== dt) out.push(label + ": engine=" + eng + " dag=" + dag);
    return;
  }
  if (Array.isArray(eng)) {
    if (!Array.isArray(dag)) { out.push(label + ": engine=array dag=" + typeof dag); return; }
    if (eng.length !== dag.length) { out.push(label + ".length: engine=" + eng.length + " dag=" + dag.length); return; }
    for (var i = 0; i < eng.length && out.length < 12; i++) diff(label + "[" + i + "]", eng[i], dag[i], out, depth + 1);
    return;
  }
  if (typeof eng === "object") {
    if (typeof dag !== "object") { out.push(label + ": engine=object dag=" + typeof dag); return; }
    Object.keys(eng).forEach(function (k) { diff(label + "." + k, eng[k], dag[k], out, depth + 1); });
    return;
  }
  if (eng !== dag) out.push(label + ": engine=" + JSON.stringify(eng) + " dag=" + JSON.stringify(dag));
}
function short(x) { var s = JSON.stringify(x); return s && s.length > 80 ? s.slice(0, 80) + "…" : s; }

// engine analyze result field  ->  DAG resolved node
var MAP = [
  ["findings", "findingsAllResult", function (v) { return (v || []).map(function (f) { return { id: f.id, severity: f.severity, amountUsd: f.amountUsd }; }); }],
  ["documents", "buildDocumentsResult"],
  ["ftcReport", "buildFtcReportResult"],
  ["taxComputation", "buildTaxComputationResult"],
  ["withholding", "buildWithholdingSummaryResult"],
  ["scopeNotes", "buildScopeNotesResult"],
  ["returnForms", "buildReturnFormDeterminationResult"],
  ["monitoring", "monitorResult"],
  ["summary", "summaryResult"],
  ["model.income.india", "indiaIncomeModelResult"],
  ["model.income.us", "aggregateUsIncomeResult"],
  ["model.entity", "entityResult"],
  ["model.meta", "metaResult"],
  ["model.treaty", "treatyModelResult"],
  ["computed.indiaTax.totalTaxInr", "totalTaxInrCombined"],
  ["computed.usTax", "usTaxResult", null, function (v) { var c = Object.assign({}, v); delete c.feieAppliedUsd; return c; }],
  ["computed.ftc", "ftcResult"],
  ["computed.reconciliation", "crossBasisResult"],
  ["computed.doubleTax", "mapDoubleTaxedIncomeResult"],
  ["computed.apportionment", "apportionmentResult"],
  ["computed.residency", "residencyResult"],
  ["computed.indiaItrForm", "indiaItrFormResult"],
  ["computed.headline", "headlineResult"],
  ["computed.limits", "limitsResult"]
];
var TARGET_NODES = MAP.map(function (m) { return m[1]; });

function getPath(obj, dotted) {
  return dotted.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
}

/* ---- run ---------------------------------------------------------------- */
var rndMaster = mulberry32(SEED);
var stats = { pass: 0, valueDiverge: 0, dagThrow: 0, engineThrow: 0, bothThrow: 0 };
var firstFailures = [];

console.log("Randomized differential harness — engine vs DAG");
console.log("iterations=" + ITERATIONS + "  seed=" + SEED + "  (replay: node run-fuzz-differential.js " + ITERATIONS + " " + SEED + ")\n");

for (var it = 0; it < ITERATIONS; it++) {
  // Per-iteration PRNG derived from master, so each profile is independently reproducible.
  var rnd = mulberry32((SEED ^ Math.imul(it + 1, 0x9E3779B1)) >>> 0);
  var profile = generate(rnd);

  var engRes = null, engErr = null, dagVals = null, dagErr = null;
  try { engRes = WISING.analyze({ router: profile.router, india: profile.india, us: profile.us, asOf: new Date(FIXED_ASOF_TS) }); }
  catch (e) { engErr = e; }
  try {
    var ctx = { router: profile.router, india: profile.india, us: profile.us, monitorAsOfBoundary: FIXED_ASOF_TS };
    dagVals = graph.resolve(TARGET_NODES, ctx).values;
  } catch (e) { dagErr = e; }

  if (engErr && dagErr) { stats.bothThrow++; continue; }
  if (engErr && !dagErr) { stats.engineThrow++; continue; }
  if (!engErr && dagErr) {
    stats.dagThrow++;
    recordFailure("DAG-ONLY THROW", it, profile, [dagErr.message + "\n" + (dagErr.stack || "").split("\n").slice(0, 4).join("\n")]);
    continue;
  }

  // both ran — deep compare the whole product surface
  var diffs = [];
  MAP.forEach(function (m) {
    if (diffs.length >= 12) return;
    var engField = m[0], dagNode = m[1], engXform = m[2], dagXform = m[3];
    var e = getPath(engRes, engField);
    var d = dagVals[dagNode];
    if (engXform) { e = engXform(e); d = engXform(d); }
    if (dagXform) { d = dagXform(d); }
    diff(engField, e, d, diffs, 0);
  });

  if (diffs.length) { stats.valueDiverge++; recordFailure("VALUE DIVERGENCE", it, profile, diffs); }
  else stats.pass++;
}

function recordFailure(kind, it, profile, details) {
  if (firstFailures.length < 8) {
    var file = SCRATCH + "/fuzz-fail-" + kind.replace(/[^a-z]+/gi, "-").toLowerCase() + "-it" + it + ".json";
    try { fs.writeFileSync(file, JSON.stringify({ kind: kind, seed: SEED, iteration: it, details: details, profile: profile }, null, 2)); } catch (e) {}
    firstFailures.push({ kind: kind, it: it, details: details, file: file });
  }
}

console.log("=== RESULTS ===");
console.log("  passed (identical):    " + stats.pass);
console.log("  VALUE DIVERGENCE:      " + stats.valueDiverge + "   <- real DAG/engine mismatch");
console.log("  DAG-ONLY THROW:        " + stats.dagThrow + "   <- real DAG bug");
console.log("  engine-only throw:     " + stats.engineThrow + "   (DAG more tolerant; informational)");
console.log("  both threw (agree):    " + stats.bothThrow);
console.log("  total:                 " + ITERATIONS);

if (firstFailures.length) {
  console.log("\n=== FIRST " + firstFailures.length + " FAILURE(S) (full profile JSON saved for replay) ===");
  firstFailures.forEach(function (f) {
    console.log("\n[" + f.kind + "] iteration " + f.it + "  -> " + f.file);
    f.details.slice(0, 8).forEach(function (d) { console.log("    " + d); });
  });
}

var realBugs = stats.valueDiverge + stats.dagThrow;
console.log("\n" + (realBugs === 0
  ? "NO DIVERGENCES across " + ITERATIONS + " randomized profiles — engine and DAG agree on every one."
  : realBugs + " REAL divergence(s) found — see saved profiles above."));
process.exit(realBugs > 0 ? 1 : 0);
