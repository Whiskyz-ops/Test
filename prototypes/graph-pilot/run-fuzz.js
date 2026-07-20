"use strict";
/* ============================================================================
 * Randomized differential testing: engine vs DAG, at scale, on inputs no
 * hand-authored fixture ever specified.
 *
 * Every other run-*.js harness in this migration compares the DAG against
 * the engine on 12 fixed points (SAMPLE + 11 PROFILES) — hand-authored to
 * exercise specific known scenarios, not to cover the combinatorial space.
 * audit:dag's field-read diff proves both sides read the same INPUT fields;
 * it says nothing about whether the ARITHMETIC applied to those fields
 * agrees on a branch neither fixture ever takes (docs/DAG_MIGRATION_
 * TRACKER.md, SYS-2's own stated caveat). This is the harness that closes
 * most of that gap — not to literal exhaustiveness (the input space is
 * unbounded: hundreds of Layer 1 fields, many with several valid states),
 * but to a much stronger statistical guarantee than any fixed fixture list
 * can offer.
 *
 * Generation strategy: MUTATION-BASED FUZZING FROM REAL SEEDS, not a
 * from-scratch schema-aware generator (which would need every field's valid
 * domain hand-enumerated across hundreds of fields — its own large,
 * bug-prone undertaking). Each iteration:
 *   1. Picks a random base fixture (one of the 12 real ones).
 *   2. With some probability per top-level section, SPLICES that section
 *      in wholesale from a second random donor fixture — this is what
 *      actually produces genuinely novel cross-feature combinations (e.g.
 *      donor A's presumptive-scheme business entries + donor B's carry-
 *      forward losses + donor C's FTC-eligible foreign income + donor D's
 *      treaty election, all on one synthetic taxpayer), not achievable by
 *      per-field jitter alone.
 *   3. Walks the merged tree and mutates individual leaf values: numbers
 *      get scaled/shifted/zeroed, booleans flip, known enum-like strings
 *      (filing_status/entity_type/tax_regime/presumptive_scheme/asset_class)
 *      swap to another valid value, ISO dates jitter by up to ~4 months,
 *      arrays occasionally gain a duplicated entry or lose one.
 *
 * Compared per iteration: the full WISING.analyze() shape — model.* (entity/
 * meta/identity/treaty/residency/companyResidency/income/accounts/assets),
 * computed.* (indiaTax/usTax/residency/ftc/reconciliation/limits/headline/
 * apportionment), findings (sorted by id, full objects), documents,
 * returnForms, withholding, taxComputation, ftcReport, scopeNotes, summary,
 * monitoring (asOf pinned to the real run's own instant, same discipline
 * run-monitor.js established). No US-entity/NRA demotion anywhere — TAX-7/
 * TAX-8 are closed, ustax-full-nodes.js routes all three paths, so every
 * generated profile is asserted in full regardless of entity kind.
 *
 * On mismatch: the exact failing {router, india, us} is written to
 * fuzz-failures/ for reproduction via --repro=<path>. Seeded (mulberry32)
 * for reproducibility — rerun with the same --seed to reproduce a run
 * exactly. Both-sides-threw on the same pathological generated input is
 * logged but NOT counted as a failure (uninteresting: neither side
 * disagrees with the other); one-side-threw-the-other-didn't is a real bug
 * and counted as one.
 *
 * First run (20 Jul 2026) surfaced a family of divergences invisible to
 * every fixed-fixture check, because no combination of the 12 real profiles
 * exercises them. Eight are now FIXED (384 → 33 mismatches per 1000 seeds):
 *
 *   1. residencyModelSliceResult (agg10-nodes.js) carried only 4 of
 *      model.residency.india's 14 fields — no earlier check deep-compared
 *      that sub-object's full shape.
 *   2. in1-nodes-v3.js's salary/houseProperty/interest/dividend/special-rate
 *      leaves read india.domestic_income/other_sources directly, bypassing
 *      the india.quarters merge every other income-head node applies — wrong
 *      for any real quarterly-entry taxpayer, not a fuzzer artifact.
 *   3. itrform-nodes.js's ">2 house properties" ITR disqualifier read a
 *      field (businessComputation.housePropertyCount) that never exists, so
 *      it could never fire on any profile.
 *   4. buildTaxComputationUsResult (report-batch2-nodes.js) built the
 *      individual-shaped trace unconditionally — now handles all three routed
 *      paths (NRA 1040-NR rows; entity title). It was CFL-7 batch 2 code that
 *      predated TAX-7/TAX-8 and was never revisited after routing closed.
 *      Deterministically asserted for all 11 profiles now in run-agg10.js.
 *   5. ftc-nodes.js / xborder-full-nodes.js usIsNraBoundaryFtc recomputed
 *      isNra as `files1040nr && !s6013h`, ignoring that entity routing WINS
 *      over NRA — so a US entity that also carried a 1040-NR flag was wrongly
 *      treated NRA, zeroing foreignSrcGross and disallowing the whole India
 *      FTC. Now recomputes the engine's exact routing condition.
 *   6. dag-adapter.js computed.indiaTax.s115a was ungated on entity — an
 *      India entity mutated to NR status wrongly got the s115a object.
 *   7. feie_ineligible/feie_applied read raw feie facts instead of the routed
 *      usTaxResult.feie the engine reads — fired for entity/NRA wrongly.
 *   8. buildWithholdingSummary India treaty rows + carry_forward_losses_not_
 *      applied + promoter_buyback_additional_tax + withholding_documentation_
 *      gap all read individual-path computed.indiaTax.* fields the entity path
 *      omits — now gated on !isEntityTaxpayer, mirroring the engine.
 *
 * Common root cause for #4-8: report/finding nodes written before TAX-7/TAX-8
 * routing existed, reading an individual-path value (or a from-scratch
 * isNra/feie recompute) instead of the routed result the engine reads.
 * KEY subtlety learned the hard way: nodes resolved in BOTH the full routed
 * chain (fuzzer/app) AND an isolated report-batchN chain (run-analyze/
 * run-monitor, where usTaxResult is the individual-only node) must recompute
 * isNra from RAW routing facts — reading usTaxResult.isNra is correct only in
 * the routed chain and silently wrong in the isolated one.
 *
 * REMAINING (33/1000 at seed=1), characterized, not yet fixed:
 *   A. holding_period_mismatch_N (17) — a genuine numerical divergence in an
 *      INTERNAL what-if recompute: the finding prices each mismatch by running
 *      US tax twice (gain as LTCG vs STCG). The engine uses computeUsTax; the
 *      DAG uses computeUsTaxCore (a copy). On mutated NRA/entity-base profiles
 *      whose individual US tax collapses to ~0, the two disagree (engine
 *      delta 0 → doesn't fire; DAG delta > 1 → fires). The ROUTED computed.usTax
 *      still matches — only this internal individual recompute diverges. A
 *      real, deep bug in the copy on near-zero-tax inputs; distinct from the
 *      gating family above, not a quick fix.
 *   B. dtaa_treaty_elections / ftc_gap / nra_fdap_flat_rate detail-text (16) —
 *      same entity/NRA report-detail family as #4-8, but a same-ID detail-STRING
 *      difference rather than a fired/not-fired count difference (an India
 *      entity's dtaa_treaty_elections narrates "domestic rate applied" from the
 *      individual s115a stream where the engine says "not applied"). Mechanical
 *      but many per-string variants; deferred.
 * See docs/DAG_MIGRATION_TRACKER.md SYS-3 for the tracked write-up.
 *
 * Run: node prototypes/graph-pilot/run-fuzz.js [--n=3000] [--seed=1]
 *      [--stop-on-first] [--repro=<path to a saved fuzz-failures/*.json>]
 * ==========================================================================*/
var path = require("path");
var fs = require("fs");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./assets-nodes.js").NODES;
var graph = createGraph(NODES);
var CONST = require("../../engine/constants.js").CONST;

// ---- CLI args ---------------------------------------------------------------
var args = {};
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});
var N = parseInt(args.n || "3000", 10);
var SEED = parseInt(args.seed || "1", 10);
var STOP_ON_FIRST = !!args["stop-on-first"];
var FAIL_DIR = path.join(__dirname, "fuzz-failures");
fs.mkdirSync(FAIL_DIR, { recursive: true });

// ---- seeded PRNG (mulberry32) — deterministic, reproducible with --seed ----
function mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ---- fixture pool: SAMPLE + all 11 PROFILES, the same 12 every other
// runner in this migration treats as ground truth --------------------------
var FIXTURES = [{ id: "SAMPLE", router: WISING.SAMPLE.router, india: WISING.SAMPLE.india, us: WISING.SAMPLE.us }]
  .concat(WISING.PROFILES.map(function (p) { return { id: p.id, router: p.router, india: p.india, us: p.us }; }));

// ---- known enum-like fields whose value SET actually gates different code
// paths (branching logic) — the highest-leverage fields to swap, since a
// per-field numeric jitter alone can't cross an entity-kind/regime/scheme
// boundary the way swapping these can. -------------------------------------
var ENUM_POOLS = {
  filing_status: ["single", "married_filing_jointly", "married_filing_separately", "head_of_household"],
  entity_type: ["individual", "huf", "firm", "llp", "company", "aop", "trust", "local", "coop", "ajp"],
  tax_entity_type: ["individual", "ccorp", "scorp", "partnership", "trust", "llc"],
  llc_tax_election: ["individual", "ccorp", "scorp", "partnership"],
  tax_regime: ["NEW", "OLD"],
  presumptive_scheme: ["s44AD", "s44ADA", "s44AE"],
  asset_class: Object.keys(CONST.TAX.INDIA.ASSET_CLASS_RATES_INDIA),
  class: Object.keys(CONST.TAX.US_MACRS_HALF_YEAR).concat(Object.keys(CONST.TAX.US_MACRS_STRAIGHT_LINE_ANNUAL)),
  vehicle_type: ["heavy", "light"]
};

// ---- splice: with some probability per top-level section, replace a
// section wholesale with a second random fixture's version — the actual
// source of genuinely novel cross-feature combinations. --------------------
function spliceFixtures(base, donor, rng) {
  var out = clone(base);
  ["india", "us"].forEach(function (side) {
    Object.keys(donor[side] || {}).forEach(function (section) {
      if (rng() < 0.25 && donor[side][section] !== undefined) out[side][section] = clone(donor[side][section]);
    });
  });
  return out;
}

// ---- mutate: walk the tree, perturb leaf values by type/key heuristics ---
function mutateValue(key, val, rng) {
  if (typeof val === "boolean") return rng() < 0.4 ? !val : val;
  if (typeof val === "number") {
    if (rng() < 0.12) return 0;
    if (rng() < 0.15) return Math.round(val * (0.3 + rng() * 3) * 100) / 100;
    if (rng() < 0.1) return Math.round((val + (rng() - 0.5) * Math.max(1000, Math.abs(val) * 2)) * 100) / 100;
    return val;
  }
  if (typeof val === "string") {
    var pool = ENUM_POOLS[key];
    if (pool && rng() < 0.4) return pick(rng, pool);
    if (/date$/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      var d = new Date(val);
      if (!isNaN(d.getTime()) && rng() < 0.3) {
        d.setDate(d.getDate() + Math.floor((rng() - 0.5) * 240));
        return d.toISOString().slice(0, 10);
      }
    }
    return val;
  }
  return val;
}
function mutateTree(node, rng) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) {
    var arr = node.map(function (item) { return mutateTree(item, rng); });
    if (arr.length > 0 && rng() < 0.15) arr.push(clone(arr[Math.floor(rng() * arr.length)]));
    if (arr.length > 1 && rng() < 0.12) arr.splice(Math.floor(rng() * arr.length), 1);
    return arr;
  }
  if (typeof node === "object") {
    var out = {};
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      out[k] = (v !== null && typeof v === "object") ? mutateTree(v, rng) : (rng() < 0.35 ? mutateValue(k, v, rng) : v);
    });
    return out;
  }
  return node;
}

function generateProfile(rng) {
  var base = pick(rng, FIXTURES);
  var donor = pick(rng, FIXTURES);
  var merged = rng() < 0.6 ? spliceFixtures(base, donor, rng) : clone(base);
  var mutated = { router: mutateTree(merged.router, rng), india: mutateTree(merged.india, rng), us: mutateTree(merged.us, rng) };
  return { label: base.id + (donor.id !== base.id ? "+" + donor.id : ""), profile: mutated };
}

// ---- deep-equal, same tolerant-numeric/Date/array/object shape every
// earlier runner in this migration established. -----------------------------
function close(a, b) { var tol = Math.max(2, Math.abs(b) * 1e-6); return Math.abs(a - b) <= tol; }
function deepEqual(a, b, p, diffs) {
  p = p || "$"; diffs = diffs || [];
  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) diffs.push(p + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b) + " (Date type)");
    else if (Math.abs(a - b) >= 1000) diffs.push(p + ": " + a.toISOString() + " !== " + b.toISOString());
    return diffs;
  }
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return diffs; // handles Infinity === Infinity, which Math.abs(a-b) turns into NaN
    if (isNaN(a) && isNaN(b)) return diffs;
    if (!close(a, b)) diffs.push(p + ": " + a + " !== " + b);
    return diffs;
  }
  if (a === b) return diffs;
  // null and undefined are treated as equivalent, same convention every
  // earlier runner in this migration uses (test-adapter.mjs's deepCheck
  // explicitly folds `undefined` to `null` before comparing for exactly
  // this reason — a field genuinely absent on one side and explicit-null
  // on the other isn't a divergence any consumer can observe).
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
function sortedFindings(f) { return (f || []).slice().sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; }); }

// ---- assemble the DAG's output exactly like lib/dag-adapter.js's
// analyzeDag() does (the actual code path the app runs), so this harness
// tests the real assembly, not a re-derived approximation of it. -----------
var RESOLVE_LIST = [
  "entityResult", "metaResult", "identityResult", "treatyModelResult",
  "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
  "aggregateUsIncomeResult", "accountsBoundary", "assetsModelResult",
  "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
  "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
  "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
  "analyzeResult"
];
function assembleDag(profile, monitorAsOfBoundary) {
  var ctx = { router: profile.router, india: profile.india, us: profile.us, monitorAsOfBoundary: monitorAsOfBoundary };
  var out = graph.resolve(RESOLVE_LIST, ctx).values;
  var usTax = Object.assign({}, out.usTaxResult); delete usTax.feieAppliedUsd;
  var model = {
    entity: out.entityResult, meta: out.metaResult, identity: out.identityResult, treaty: out.treatyModelResult,
    residency: out.residencyModelSliceResult, companyResidency: out.companyResidencyResult,
    income: { india: out.indiaIncomeModelResult, us: out.aggregateUsIncomeResult },
    accounts: { accounts: out.accountsBoundary, aggregatePeak: null }, assets: out.assetsModelResult
  };
  var computed = {
    indiaTax: { totalTaxInr: out.totalTaxInrCombined, totalTaxUsd: out.totalTaxInrCombined / CONST.FX.INR_PER_USD, regime: out.regimeCombined, isEntity: out.isEntityTaxpayer, s115a: (out.isNRV3 && !out.isEntityTaxpayer) ? { dividend: out.s115aDividend, royalty: out.s115aRoyalty, fts: out.s115aFts } : null },
    usTax: usTax, residency: out.residencyResult, ftc: out.ftcResult, reconciliation: out.crossBasisResult,
    limits: out.limitsResult, headline: out.headlineResult, apportionment: out.apportionmentResult
  };
  return Object.assign({}, out.analyzeResult, { model: model, computed: computed });
}

function compareOne(label, profile, saveOnFail) {
  var real, dag, realThrew = null, dagThrew = null;
  try { real = WISING.analyze({ router: profile.router, india: profile.india, us: profile.us }); }
  catch (e) { realThrew = e; }
  if (!realThrew) {
    try { dag = assembleDag(profile, real.monitoring.asOf); }
    catch (e) { dagThrew = e; }
  }
  if (realThrew && dagThrew) return { status: "both-threw", detail: realThrew.message + " | " + dagThrew.message };
  if (realThrew && !dagThrew) return { status: "engine-threw-dag-didnt", detail: realThrew.message };
  if (!realThrew && dagThrew) return { status: "dag-threw-engine-didnt", detail: dagThrew.message + "\n" + dagThrew.stack };

  var diffs = [];
  // computed.indiaTax is a DELIBERATE narrow assembly in dag-adapter.js —
  // only these 5 fields, never the full computeIndiaTax()/
  // computeIndiaEntityTax() return shape (that richer detail legitimately
  // lives at taxComputation.india instead, checked separately below,
  // already verified full-object in run-report3.js). Comparing the whole
  // computed.indiaTax object here would be checking the harness's own
  // narrower reshaping against the engine's fuller one — a mismatch that
  // says nothing about the DAG, caught the hard way on run-fuzz.js's own
  // first real run (20 Jul 2026) before this fix.
  // computed.indiaTax.isEntity: dag-adapter.js invents this key for its own
  // convenience (sourced from isEntityTaxpayer) — computeIndiaTax()/
  // computeIndiaEntityTax()'s real return object has no field by this
  // name at all (confirmed: real.computed.indiaTax.isEntity is always
  // undefined), and no UI component reads it (grepped: only .s115a is
  // read off computed.indiaTax anywhere in monitor-next/components).
  // Nothing to differential-test — skipped, not a divergence.
  ["model.entity", "model.meta", "model.identity", "model.treaty", "model.residency", "model.companyResidency",
    "model.income.india", "model.income.us", "model.accounts.accounts", "model.assets",
    "computed.indiaTax.totalTaxInr", "computed.indiaTax.totalTaxUsd", "computed.indiaTax.regime",
    "computed.indiaTax.s115a",
    "computed.usTax", "computed.residency", "computed.ftc", "computed.reconciliation",
    "computed.limits", "computed.headline", "computed.apportionment",
    "documents", "returnForms", "withholding", "taxComputation", "scopeNotes", "summary"
  ].forEach(function (fieldPath) {
    var parts = fieldPath.split(".");
    var a = dag, b = real;
    parts.forEach(function (k) { a = a && a[k]; b = b && b[k]; });
    deepEqual(a, b, fieldPath, diffs);
  });
  deepEqual(sortedFindings(dag.findings), sortedFindings(real.findings), "findings", diffs);
  deepEqual(dag.monitoring, real.monitoring, "monitoring", diffs);
  // ftcReport genuinely diverges for a taxpayer with no US scope at all
  // (real engine returns null there — not a TAX-7/TAX-8 boundary case,
  // just "nothing to report"); everything else is asserted unconditionally.
  if (real.ftcReport !== null || dag.ftcReport !== null) deepEqual(dag.ftcReport, real.ftcReport, "ftcReport", diffs);

  if (diffs.length && saveOnFail) {
    var file = path.join(FAIL_DIR, "fail-" + Date.now() + "-" + Math.floor(Math.random() * 1e6) + ".json");
    fs.writeFileSync(file, JSON.stringify({ label: label, profile: profile, diffs: diffs.slice(0, 30) }, null, 2));
    return { status: "mismatch", detail: diffs, file: file };
  }
  return diffs.length ? { status: "mismatch", detail: diffs } : { status: "match" };
}

// ---- --repro mode: replay one saved failure with full diff output --------
if (args.repro) {
  var saved = JSON.parse(fs.readFileSync(args.repro, "utf8"));
  console.log("Reproducing: " + saved.label + " (" + args.repro + ")\n");
  var r = compareOne(saved.label, saved.profile, false);
  console.log("status: " + r.status);
  if (Array.isArray(r.detail)) console.log(r.detail.join("\n"));
  else console.log(r.detail);
  process.exit(r.status === "match" ? 0 : 1);
}

// ---- main fuzz loop ---------------------------------------------------------
var rng = mulberry32(SEED);
var stats = { match: 0, mismatch: 0, bothThrew: 0, engineThrewDagDidnt: 0, dagThrewEngineDidnt: 0 };
var savedFiles = [];
var stop = false;

console.log("Differential fuzz: engine vs DAG, " + N + " random profiles, seed=" + SEED + "\n");

for (var i = 0; i < N && !stop; i++) {
  var gen = generateProfile(rng);
  var result = compareOne(gen.label, gen.profile, true);
  if (result.status === "match") stats.match++;
  else if (result.status === "both-threw") { stats.bothThrew++; }
  else if (result.status === "engine-threw-dag-didnt") {
    stats.engineThrewDagDidnt++;
    console.log("[" + i + "] ENGINE THREW, DAG DIDN'T (" + gen.label + "): " + result.detail);
    if (STOP_ON_FIRST) stop = true;
  } else if (result.status === "dag-threw-engine-didnt") {
    stats.dagThrewEngineDidnt++;
    console.log("[" + i + "] DAG THREW, ENGINE DIDN'T (" + gen.label + "): " + result.detail);
    if (STOP_ON_FIRST) stop = true;
  } else if (result.status === "mismatch") {
    stats.mismatch++;
    if (result.file) savedFiles.push(result.file);
    console.log("[" + i + "] MISMATCH (" + gen.label + "): " + result.detail.slice(0, 8).join(" | ") + (result.detail.length > 8 ? " | ... +" + (result.detail.length - 8) + " more" : ""));
    if (result.file) console.log("    saved: " + result.file);
    if (STOP_ON_FIRST) stop = true;
  }
  if ((i + 1) % 500 === 0) console.log("  ... " + (i + 1) + "/" + N);
}

var ran = stats.match + stats.mismatch + stats.bothThrew + stats.engineThrewDagDidnt + stats.dagThrewEngineDidnt;
var realFailures = stats.mismatch + stats.engineThrewDagDidnt + stats.dagThrewEngineDidnt;
console.log("\n" + ran + " iterations run (seed=" + SEED + "):");
console.log("  match:                       " + stats.match);
console.log("  mismatch (real divergence):  " + stats.mismatch);
console.log("  dag threw, engine didn't:    " + stats.dagThrewEngineDidnt + "  <-- always a real bug");
console.log("  engine threw, dag didn't:    " + stats.engineThrewDagDidnt + "  <-- always a real bug");
console.log("  both threw (pathological input, not a divergence): " + stats.bothThrew);
if (savedFiles.length) console.log("\nFailures saved to fuzz-failures/ — reproduce with: node run-fuzz.js --repro=<path>");
console.log("\n" + (realFailures === 0 ? "PASS" : "FAIL") + " — " + realFailures + " real divergence(s) found in " + ran + " random profiles.");
process.exit(realFailures > 0 ? 1 : 0);
