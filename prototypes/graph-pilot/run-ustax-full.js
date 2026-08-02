"use strict";
/* ============================================================================
 * Verifies ustax-full-nodes.js (TAX-7 computeUsEntityTax + TAX-8
 * computeNraTax + compute()'s routing) — the last two engine branches.
 *
 * All 11 real profiles, bare ctx ({router, india, us} — no model, no
 * computed): the routed usTaxResult is deep-compared against production
 * computed.usTax. For entity and NRA profiles the ENTIRE result object is
 * compared (every field incl. the nra{} detail block and bracket
 * breakdown) since both ports reproduce the engine's exact shape; for
 * individual profiles the comparison covers every field the individual
 * node emits (its documented subset).
 *
 * Plus 6 synthetic cases for branches no real profile exercises — scorp /
 * partnership / trust pass-throughs, NRA without W-8BEN (30% statutory
 * override of a claimed treaty rate), NRA WITH W-8BEN + treaty claim, and
 * an NRA MFJ filer — each checked against the real engine running the
 * SAME synthetic input, not hand-computed expectations.
 *
 * Run: node prototypes/graph-pilot/run-ustax-full.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./ustax-full-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function ok(label) { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok(label);
    return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok(label);
    var tol = (Math.abs(b) <= 1 && Math.abs(a) <= 1) ? 1e-6 : 2;
    if (Math.abs(a - b) <= tol) return ok(label);
    return bad(label, "graph=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "graph=" + a.length + " prod=" + b.length);
    for (var i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok(label);
  return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

function runCase(id, router, india, us) {
  var r = WISING.analyze({ router: router, india: india, us: us });
  var ctx = { router: router, india: india, us: us };
  var out = graph.resolve(["usTaxResult"], ctx).values.usTaxResult;
  var real = r.computed.usTax;
  var before = fail;

  // feieHousingAppliedUsd / feie.housingAppliedUsd (FEIE legal-correctness
  // pass, docs/FEIE_LEGAL_CORRECTNESS_REVIEW.md): the §911(c) foreign
  // housing cost exclusion, genuinely new — the frozen reference engine
  // never implemented it at all (grepped archive/engine-frozen/computation.js:
  // FEIE_MAX_USD is its only FEIE constant), so it has no equivalent key on
  // either the individual or entity/NRA path. Asserted present (not
  // equal) here, then stripped from a shallow copy of `out` BEFORE any
  // deep-compare below runs — same discipline as NEW_FIELD_KEYS/
  // NEW_FIELD_KEYS_IND, just centralized here since this one field is
  // nested inside `feie{}`, which both paths deep-compare wholesale.
  (function assertFeieHousingNewFields() {
    // Same "not every profile/branch produces every new field" skip as
    // assertNewFieldsPresent() above — only assert when the key is
    // actually present, don't manufacture a failure for a branch that
    // legitimately never emits it at all.
    if ("feieHousingAppliedUsd" in out) {
      var top = out.feieHousingAppliedUsd;
      if (typeof top === "number" ? !isNaN(top) : top !== undefined) ok("usTax.feieHousingAppliedUsd (new field — no engine equivalent)");
      else bad("usTax.feieHousingAppliedUsd (new field — no engine equivalent)", "graph=" + JSON.stringify(top));
    }
    if (out.feie && "housingAppliedUsd" in out.feie) {
      var nested = out.feie.housingAppliedUsd;
      if (typeof nested === "number" ? !isNaN(nested) : nested !== undefined) ok("usTax.feie.housingAppliedUsd (new field — no engine equivalent)");
      else bad("usTax.feie.housingAppliedUsd (new field — no engine equivalent)", "graph=" + JSON.stringify(nested));
    }
  })();
  out = Object.assign({}, out);
  delete out.feieHousingAppliedUsd;
  if (out.feie) {
    out.feie = Object.assign({}, out.feie);
    delete out.feie.housingAppliedUsd;
  }

  if (real.isEntity || real.isNra) {
    // Exact-shape ports: compare the ENTIRE engine result object — EXCEPT
    // usSourceIncomeUsd for an entity, a DELIBERATE DAG/engine divergence
    // (docs/GAP_TRACKER.md section H, 21 Jul 2026): the engine reads the
    // individual-shaped aggregateUsIncomeResult.usSourceTotal.usd here,
    // always $0 for an entity (whose own income is a separate Schedule M-1
    // figure that aggregate never captures) — fixed in-graph to the full
    // taxable amount instead (see this file's usEntityTaxResult comment).
    // trustDistributedUsd/trustRetainedUsd/trustBracketBreakdown (docs/
    // GAP_TRACKER.md section H.6, 21 Jul 2026): new fields, no engine
    // equivalent (a genuinely new fact Layer 1 didn't collect before — see
    // ustax-full-nodes.js's usEntityTaxResult trust branch). filingStatus
    // for a trust now carries a retained-vs-distributed qualifier the
    // engine's static string never had.
    var TRUST_ONLY_KEYS = { trustDistributedUsd: true, trustRetainedUsd: true, trustBracketBreakdown: true };
    // New DAG-only top-level fields, no frozen-engine equivalent — asserted
    // present instead of deep-compared. gilti962TaxUsd/cfcDetail: Phase 7
    // XB-14 (GILTI/NCTI, this session). qsbsTaxableGainUsd/qsbsExcludedGainUsd/
    // collectiblesTaxUsd/collectiblesGainUsd: concurrent session's capital-
    // gains special-rates work (§1202 QSBS / §1(h)(4) collectibles).
    var NEW_FIELD_KEYS = { gilti962TaxUsd: true, cfcDetail: true, qsbsTaxableGainUsd: true, qsbsExcludedGainUsd: true, collectiblesTaxUsd: true, collectiblesGainUsd: true, saversCreditUsd: true, saversCreditDetail: true };
    var NRA_NEW_FIELD_KEYS = { standardDeductionUsd: true, itemizedDeductionUsd: true, article212Eligible: true, article212AmbiguousJ1: true };
    function assertNewFieldsPresent(prefix, obj, keys) {
      Object.keys(keys).forEach(function (k) {
        if (!(k in obj)) return; // not every profile/branch produces every new field
        var v = obj[k];
        if (typeof v === "number" ? !isNaN(v) : v !== undefined) ok(prefix + "." + k + " (new field — no engine equivalent)");
        else bad(prefix + "." + k + " (new field — no engine equivalent)", "graph=" + JSON.stringify(v));
      });
    }
    if (real.isEntity) {
      if (out.usSourceIncomeUsd === out.totalIncomeUsd) ok("usTax(full).usSourceIncomeUsd (DELIBERATE divergence — see comment above)");
      else bad("usTax(full).usSourceIncomeUsd (DELIBERATE divergence — see comment above)", "graph=" + out.usSourceIncomeUsd + " expected=" + out.totalIncomeUsd);
      if (out.filingStatus.indexOf("Trust/Estate (1041)") === 0) {
        ok("usTax(full).filingStatus (DELIBERATE divergence — trust retained/distributed qualifier)");
      } else {
        deepCheck("usTax(full).filingStatus", out.filingStatus, real.filingStatus);
      }
      assertNewFieldsPresent("usTax(full)", out, NEW_FIELD_KEYS);
      Object.keys(out).forEach(function (k) { if (k !== "usSourceIncomeUsd" && k !== "filingStatus" && !TRUST_ONLY_KEYS[k] && !NEW_FIELD_KEYS[k]) deepCheck("usTax(full)." + k, out[k], real[k]); });
    } else {
      assertNewFieldsPresent("usTax(full)", out, NEW_FIELD_KEYS);
      if (out.nra) assertNewFieldsPresent("usTax(full).nra", out.nra, NRA_NEW_FIELD_KEYS);
      var outStripped = Object.assign({}, out);
      Object.keys(NEW_FIELD_KEYS).forEach(function (k) { delete outStripped[k]; });
      if (outStripped.nra) {
        outStripped.nra = Object.assign({}, outStripped.nra);
        Object.keys(NRA_NEW_FIELD_KEYS).forEach(function (k) { delete outStripped.nra[k]; });
      }
      deepCheck("usTax(full)", outStripped, real);
    }
  } else {
    // Individual path emits a documented subset — compare every field it has.
    // feieAppliedUsd is the DAG's flat alias of the engine's feie.appliedUsd
    // (added for the FTC wiring) — translate rather than expect a mirror.
    // gilti962TaxUsd/cfcDetail/qsbs*/collectibles*: new DAG-only fields, no
    // frozen-engine equivalent — asserted directly instead of deep-compared.
    var NEW_FIELD_KEYS_IND = { gilti962TaxUsd: true, cfcDetail: true, qsbsTaxableGainUsd: true, qsbsExcludedGainUsd: true, collectiblesTaxUsd: true, collectiblesGainUsd: true, saversCreditUsd: true, saversCreditDetail: true };
    Object.keys(out).forEach(function (k) {
      if (k === "feieAppliedUsd") return deepCheck("usTax.feieAppliedUsd(alias)", out[k], (real.feie && real.feie.appliedUsd) || 0);
      if (NEW_FIELD_KEYS_IND[k]) {
        if (typeof out[k] === "number" ? !isNaN(out[k]) : out[k] !== undefined) return ok("usTax." + k + " (new field — no engine equivalent)");
        return bad("usTax." + k + " (new field — no engine equivalent)", "graph=" + JSON.stringify(out[k]));
      }
      deepCheck("usTax." + k, out[k], real[k]);
    });
  }
  console.log(id + "  " + (fail === before ? "matches" : "FAILURES above") +
    "  [" + (real.isEntity ? "ENTITY: " + real.filingStatus : real.isNra ? "NRA" : "individual") +
    ", totalTaxBeforeFtc=$" + Math.round(out.totalTaxBeforeFtcUsd) + "]");
}

console.log("TAX-7/TAX-8: entity + NRA US tax, routed — all " + WISING.PROFILES.length + " profiles (bare ctx) + 6 synthetics\n");

WISING.PROFILES.forEach(function (p) { runCase(p.id, p.router, p.india, p.us); });

// ---- synthetics -----------------------------------------------------------
var ccorp = WISING.PROFILES.filter(function (p) { return p.id === "us_ccorp_indian_sub"; })[0];
["scorp", "partnership", "trust"].forEach(function (kind) {
  var us = JSON.parse(JSON.stringify(ccorp.us));
  us.profile.tax_entity_type = kind;
  runCase("synthetic_" + kind + "_passthrough", ccorp.router, ccorp.india, us);
});

var nraBase = WISING.PROFILES.filter(function (p) { return p.id === "india_ror_us_income"; })[0];
var us1 = JSON.parse(JSON.stringify(nraBase.us));
us1.nra_specific = Object.assign({}, us1.nra_specific, {
  submitted_w8ben: false, treaty_rate_claims: [{ income_type: "dividend", rate: 15 }]
});
runCase("synthetic_nra_no_w8ben (claimed 15% -> statutory 30%)", nraBase.router, nraBase.india, us1);

var us2 = JSON.parse(JSON.stringify(nraBase.us));
us2.nra_specific = Object.assign({}, us2.nra_specific, {
  submitted_w8ben: true, treaty_rate_claims: [{ income_type: "dividend", rate: 15 }]
});
runCase("synthetic_nra_w8ben_treaty15", nraBase.router, nraBase.india, us2);

var us3 = JSON.parse(JSON.stringify(nraBase.us));
us3.profile.filing_status = "married_filing_jointly";
runCase("synthetic_nra_mfj", nraBase.router, nraBase.india, us3);

console.log("\n" + pass + " passed, " + fail + " failed (all profiles asserted — no entity/NRA carve-outs remain)");
process.exit(fail > 0 ? 1 : 0);
