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
 * Two more fixed after that (9, 10) — same family, found once the title/
 * row-count noise above stopped masking them:
 *   9. nra_fdap_flat_rate's title showed "(XX%)" unconditionally; the engine
 *      only shows it when computed.usTax.nra exists (routed to NRA — the
 *      finding itself fires on raw facts regardless of entity routing, an
 *      engine quirk reproduced as-is, not "fixed").
 *   10. buildWithholdingSummaryResult's FDAP row (report-batch4-nodes.js) had
 *      the identical `files1040nr && !s6013h` raw recompute as the FTC
 *      boundary — a US entity with a 1040-NR flag got a phantom FDAP
 *      withholding row the engine never builds.
 *
 * A. holding_period_mismatch_N — FIXED 20 Jul 2026, the deepest instance of
 *    the #4-10 family. WISING.computeInternals.computeUsTax, which the
 *    engine's own what-if recompute calls (conflicts.js:1298), is NOT an
 *    individual-only formula — it's compute()'s own ROUTER (computation.js:
 *    789), dispatching to computeUsEntityTax/computeNraTax BEFORE ever
 *    reaching the individual bracket logic computeUsTaxCore is a copy of.
 *    Neither computeUsEntityTax (a flat rate on Schedule-M1/aggregate
 *    income) nor computeNraTax (ECI/FDAP only) reads foreignLtcg/foreignStcg
 *    AT ALL — so for an entity or NRA taxpayer, the engine's own LTCG-vs-STCG
 *    delta is PROVABLY always exactly 0, and the finding never fires.
 *    computeUsTaxCore had no such routing (extracted before TAX-7/TAX-8
 *    existed), so it always ran the individual formula regardless of entity/
 *    NRA status, producing a real nonzero delta. Fixed by skipping the whole
 *    recompute (holdingPeriodMismatchFindingsResult) when raw routing facts
 *    show the taxpayer routes away from the individual path — same "recompute
 *    from raw facts, safe in both the routed AND isolated chains" discipline
 *    as every other isNra-family fix. Verified: 0 new divergences across 14
 *    seeds × 800 iterations plus one seed × 3000.
 *
 * B and C — the last two items on what was a KNOWN-DIVERGENCE allowlist
 * (same convention as dag-coverage.js's knownMissing) — are ALSO now fixed,
 * 20 Jul 2026, the allowlist is empty, and the fuzzer runs with ZERO known
 * divergences of any kind:
 *   B. dtaa_treaty_elections (CONTENT diff) — FIXED. Same entity/NRA
 *      report-detail family as #4-10: an India entity's dtaa_treaty_elections
 *      was narrating the individual s115a/nrInterest stream's per-election
 *      outcome text, which the engine never builds for an entity at all
 *      (computeIndiaTax short-circuits to computeIndiaEntityTax before
 *      computeS115aStream/computeNrInterestTreatment ever run — computed.
 *      indiaTax.s115a doesn't exist, not just "empty"). s115aDividendDetailed/
 *      s115aRoyaltyDetailed/s115aFtsDetailed/nrInterestDetailed
 *      (findings-batch4-nodes.js) were gated only on isNRV3 (raw individual
 *      residency status), which an entity can carry without ever routing
 *      through the individual computation. Fixed by adding the same
 *      isEntityTaxpayer gate (indiaIsCompany || indiaIsFirm — mirrors
 *      computeIndiaTax's own routing condition exactly) already used
 *      elsewhere in this same file for the analogous US-side bugs. Verified:
 *      0 new divergences across seeds 1784573526 (3000) and 99991 (5000).
 *   C. residency_status_dtaa_conflated_india (CONTENT diff) — FIXED, but not
 *      by porting one side to match the other. The one difference was each
 *      side's `.detail` citing its OWN internal names for an already-correct
 *      mechanism (engine: dtaaWorldwideCeded / the isIndiaRor gate in
 *      aggregateIndiaIncome; DAG: residencyResult.india.worldwide/
 *      cedesViaTreaty) — genuinely unfixable as a byte-for-byte port, since
 *      either direction means one side citing implementation details that
 *      don't exist in its own code. Resolved instead by genericizing the
 *      wording on BOTH sides (engine/conflicts.js and residency-nodes.js) —
 *      "...already handled correctly, separately, elsewhere in this
 *      computation" — true on both sides, and arguably better production
 *      copy besides: those were raw camelCase JS identifiers in a
 *      preparer-facing finding, unlike this engine's actual citation style
 *      elsewhere (s.207, Art. 13 — real statute/treaty references).
 * ftc_gap/underpayment_2210 "diffs" seen in early triage turned out to be
 * pure floating-point representation noise (~1e-11 relative) already inside
 * the tolerant deepEqual's own tolerance — not real, don't reappear here.
 * See docs/DAG_MIGRATION_TRACKER.md SYS-3 for the tracked write-up.
 *
 * Exit code reflects ONLY unknown/new divergences — 0 currently, with an
 * EMPTY allowlist (nothing left to excuse), safe to gate CI on. A genuinely
 * new divergence (a different finding ID, a model/computed/documents/
 * withholding/taxComputation field outside the findings-cascade, or the two
 * "always a real bug" throw categories) fails the run regardless of how small.
 *
 * Run: node prototypes/graph-pilot/run-fuzz.js [--n=3000] [--seed=1]
 *      [--stop-on-first] [--repro=<path to a saved fuzz-failures/*.json>]
 * ==========================================================================*/
var path = require("path");
var fs = require("fs");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./checks-registry-nodes.js").NODES;
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

// ---- KNOWN-DIVERGENCE allowlist — same convention as dag-coverage.js's
// knownMissing: distinguishes a characterized, already-investigated gap from
// a genuinely NEW regression. Extend this list only after actually
// investigating a new mismatch — never to silence a failure you haven't
// looked at. Empty as of 20 Jul 2026: dtaa_treaty_elections fixed (see
// s115a*Detailed/nrInterestDetailed in findings-batch4-nodes.js — they weren't
// gated on India entity/firm routing, so they kept computing real per-election
// outcomes on India-entity fuzz profiles the engine's own computeIndiaTax
// never reaches, since it short-circuits to computeIndiaEntityTax first).
// residency_status_dtaa_conflated_india's one-parenthetical divergence (each
// side citing its own internal names for an already-correct mechanism) was
// resolved by genericizing the wording on both sides — same-day, same fix.
var KNOWN_EXTRA_FINDING_ID = /^$/;
var KNOWN_CONTENT_DIVERGENCE_FINDING_IDS = [];
// Fields that are MECHANICALLY DERIVED from findings[] (severity counts,
// health score, the alerts feed) — only excusable as "known" when the SAME
// comparison also has a known findings-level issue causing them; if one of
// these differs with NO accompanying known findings issue, that's new and
// real. Every other field (model.*, computed.*, documents, returnForms,
// withholding, taxComputation, scopeNotes, ftcReport, and the non-findings-
// derived parts of monitoring/summary) is never excused by this allowlist.
var CASCADE_ONLY_PATHS = ["summary.healthScore", "summary.counts", "monitoring.health", "monitoring.alerts"];

// ---- findings comparison: ID-aware (not blind array deepEqual), so a
// mismatch can be attributed to the SPECIFIC finding ID responsible and
// checked against the allowlist above, instead of a single opaque
// "findings: array length/type" line that both hides and over-reports. -----
function compareFindings(dagFindings, realFindings) {
  var dagById = {}; dagFindings.forEach(function (f) { dagById[f.id] = f; });
  var realById = {}; realFindings.forEach(function (f) { realById[f.id] = f; });
  var allIds = {}; Object.keys(dagById).concat(Object.keys(realById)).forEach(function (id) { allIds[id] = 1; });
  var known = [], unknown = [];
  Object.keys(allIds).sort().forEach(function (id) {
    var inDag = Object.prototype.hasOwnProperty.call(dagById, id);
    var inReal = Object.prototype.hasOwnProperty.call(realById, id);
    if (inDag && !inReal) {
      (KNOWN_EXTRA_FINDING_ID.test(id) ? known : unknown).push("findings: DAG has extra \"" + id + "\", engine doesn't");
    } else if (!inDag && inReal) {
      // Never allowlisted — the DAG silently DROPPING a real finding is
      // always worth seeing, no observed case has ever been this direction.
      unknown.push("findings: engine has \"" + id + "\", DAG doesn't");
    } else {
      var fieldDiffs = deepEqual(dagById[id], realById[id], "findings[" + id + "]", []);
      if (fieldDiffs.length) {
        var bucket = KNOWN_CONTENT_DIVERGENCE_FINDING_IDS.indexOf(id) >= 0 ? known : unknown;
        bucket.push.apply(bucket, fieldDiffs);
      }
    }
  });
  return { known: known, unknown: unknown };
}

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
  "analyzeResult", "checksRegistryResult"
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
  return Object.assign({}, out.analyzeResult, { model: model, computed: computed, checksRegistry: out.checksRegistryResult });
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

  var realDiffs = [], knownDiffs = [];

  // checksRegistryResult (CL-1) has no engine equivalent — nothing to
  // differential-test against real. Its one real invariant, checked here
  // instead: no finding id may EVER appear in both dag.findings (fired) and
  // dag.checksRegistry (checked-clean) on the same profile. A violation
  // here is always a real bug in checks-registry-nodes.js's own pass()
  // conditions (drifted from the finding's actual gate) — always real,
  // never excused by the allowlist.
  var firedIds = {};
  (dag.findings || []).forEach(function (f) { firedIds[f.id] = true; });
  (dag.checksRegistry || []).forEach(function (c) {
    if (firedIds[c.id]) realDiffs.push("checksRegistry: \"" + c.id + "\" is BOTH fired (in findings[]) and reported passed — pass() condition has drifted from its finding's real gate");
  });
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
  //
  // ALWAYS-REAL fields — never excused by the KNOWN-DIVERGENCE allowlist,
  // regardless of what else is going on in this comparison. summary/
  // monitoring are handled separately below, split into their
  // findings-derived (cascade-eligible) and independent (always-real) parts.
  ["model.entity", "model.meta", "model.identity", "model.treaty", "model.residency", "model.companyResidency",
    "model.income.india", "model.income.us", "model.accounts.accounts", "model.assets",
    "computed.indiaTax.totalTaxInr", "computed.indiaTax.totalTaxUsd", "computed.indiaTax.regime",
    "computed.indiaTax.s115a",
    "computed.usTax", "computed.residency", "computed.ftc", "computed.reconciliation",
    "computed.limits", "computed.headline", "computed.apportionment",
    "documents", "returnForms", "withholding", "taxComputation", "scopeNotes",
    "summary.name", "summary.baseYear", "summary.jurisdiction", "summary.hasIndia", "summary.hasUs",
    "summary.indiaQuarterly", "summary.indiaStatus", "summary.usStatus", "summary.dualResident",
    "summary.totalIncomeUsd", "summary.indiaTaxUsd", "summary.usTaxUsd", "summary.netDoubleTaxUsd",
    "summary.requiredDocs", "summary.nextDeadline",
    "monitoring.asOf", "monitoring.simulated", "monitoring.baseYear", "monitoring.progressUS",
    "monitoring.progressIN", "monitoring.residency", "monitoring.projections", "monitoring.calendar"
  ].forEach(function (fieldPath) {
    var parts = fieldPath.split(".");
    var a = dag, b = real;
    parts.forEach(function (k) { a = a && a[k]; b = b && b[k]; });
    deepEqual(a, b, fieldPath, realDiffs);
  });

  var findingsResult = compareFindings(dag.findings, real.findings);
  realDiffs.push.apply(realDiffs, findingsResult.unknown);
  knownDiffs.push.apply(knownDiffs, findingsResult.known);

  // CASCADE_ONLY_PATHS — summary.counts/healthScore, monitoring.health/
  // alerts — are mechanically derived from findings[], so they diverge
  // exactly WHEN a findings issue does. Excusable as known only alongside a
  // known findings issue in this SAME comparison; standing alone (no
  // accompanying known findings issue) they're new and real.
  var cascadeDiffs = [];
  CASCADE_ONLY_PATHS.forEach(function (fieldPath) {
    var parts = fieldPath.split(".");
    var a = dag, b = real;
    parts.forEach(function (k) { a = a && a[k]; b = b && b[k]; });
    deepEqual(a, b, fieldPath, cascadeDiffs);
  });
  if (cascadeDiffs.length) {
    var cascadeBucket = findingsResult.known.length > 0 ? knownDiffs : realDiffs;
    cascadeBucket.push.apply(cascadeBucket, cascadeDiffs);
  }

  // ftcReport genuinely diverges for a taxpayer with no US scope at all
  // (real engine returns null there — not a TAX-7/TAX-8 boundary case,
  // just "nothing to report"); everything else is asserted unconditionally.
  if (real.ftcReport !== null || dag.ftcReport !== null) deepEqual(dag.ftcReport, real.ftcReport, "ftcReport", realDiffs);

  if (!realDiffs.length && !knownDiffs.length) return { status: "match" };
  if (!realDiffs.length) return { status: "known", detail: knownDiffs };

  if (saveOnFail) {
    var file = path.join(FAIL_DIR, "fail-" + Date.now() + "-" + Math.floor(Math.random() * 1e6) + ".json");
    fs.writeFileSync(file, JSON.stringify({ label: label, profile: profile, diffs: realDiffs.slice(0, 30), knownDiffs: knownDiffs.slice(0, 10) }, null, 2));
    return { status: "mismatch", detail: realDiffs, file: file };
  }
  return { status: "mismatch", detail: realDiffs };
}

// ---- --repro mode: replay one saved failure with full diff output --------
if (args.repro) {
  var saved = JSON.parse(fs.readFileSync(args.repro, "utf8"));
  console.log("Reproducing: " + saved.label + " (" + args.repro + ")\n");
  var r = compareOne(saved.label, saved.profile, false);
  console.log("status: " + r.status);
  if (Array.isArray(r.detail)) console.log(r.detail.join("\n"));
  else console.log(r.detail);
  process.exit(r.status === "match" || r.status === "known" ? 0 : 1);
}

// ---- main fuzz loop ---------------------------------------------------------
var rng = mulberry32(SEED);
var stats = { match: 0, known: 0, mismatch: 0, bothThrew: 0, engineThrewDagDidnt: 0, dagThrewEngineDidnt: 0 };
var savedFiles = [];
var stop = false;

console.log("Differential fuzz: engine vs DAG, " + N + " random profiles, seed=" + SEED + "\n");

for (var i = 0; i < N && !stop; i++) {
  var gen = generateProfile(rng);
  var result = compareOne(gen.label, gen.profile, true);
  if (result.status === "match") stats.match++;
  else if (result.status === "known") {
    stats.known++;
    console.log("[" + i + "] known (" + gen.label + "): " + result.detail.slice(0, 4).join(" | ") + (result.detail.length > 4 ? " | ... +" + (result.detail.length - 4) + " more" : ""));
  } else if (result.status === "both-threw") { stats.bothThrew++; }
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

var ran = stats.match + stats.known + stats.mismatch + stats.bothThrew + stats.engineThrewDagDidnt + stats.dagThrewEngineDidnt;
var realFailures = stats.mismatch + stats.engineThrewDagDidnt + stats.dagThrewEngineDidnt;
console.log("\n" + ran + " iterations run (seed=" + SEED + "):");
console.log("  match:                                " + stats.match);
console.log("  known (allowlisted, see file header):  " + stats.known);
console.log("  mismatch (NEW/unknown divergence):     " + stats.mismatch);
console.log("  dag threw, engine didn't:              " + stats.dagThrewEngineDidnt + "  <-- always a real bug");
console.log("  engine threw, dag didn't:              " + stats.engineThrewDagDidnt + "  <-- always a real bug");
console.log("  both threw (pathological input, not a divergence): " + stats.bothThrew);
if (savedFiles.length) console.log("\nFailures saved to fuzz-failures/ — reproduce with: node run-fuzz.js --repro=<path>");
console.log("\n" + (realFailures === 0 ? "PASS" : "FAIL") + " — " + realFailures + " NEW divergence(s) found in " + ran + " random profiles" +
  (stats.known > 0 ? " (" + stats.known + " known/allowlisted, not counted — see run-fuzz.js's file header)" : "") + ".");
process.exit(realFailures > 0 ? 1 : 0);
