"use strict";
/* ============================================================================
 * Standalone WISING.analyze() built entirely from the DAG — no engine/*.js
 * dependency at all. Requiring this file alone gives you a complete WISING
 * global (CONST, PROFILES, analyze, normalize, util) computed purely from
 * ustax-full-nodes.js's merged graph, resolved from bare {router, india, us}
 * — exactly the ctx run-agg10.js already proved sufficient (1290/1290, zero
 * carve-outs, docs/DAG_MIGRATION_TRACKER.md TAX-7/TAX-8).
 *
 * Model/computed assembly is a direct, Node-side port of monitor-next/lib/
 * dag-adapter.js's analyzeDag() — same node-id-to-field mapping, verified
 * there against the real engine already. Uses assets-nodes.js's NODES (the
 * superset that adds assetsModelResult on top of ustax-full-nodes.js's
 * chain — dag-adapter.js needs it for model.assets; run-agg10.js's own
 * narrower target-id list didn't, which is why it gets away with requiring
 * ustax-full-nodes.js directly). Differences from dag-adapter.js:
 *   - Plain CommonJS/global, not "use client"/webpack ESM — this runs
 *     wherever Node's require() does, no bundler needed.
 *   - No localStorage/window fallback — opts.router/india/us are read
 *     directly, matching the classic engine's own WISING.analyze(opts)
 *     calling convention (tests/engine/run.js always passes them explicitly).
 *   - Doesn't port monitorSnapshotDag/allClientSummariesDag/
 *     analyzeProfileByIdDag/countriesFromEngine — those are monitor-next
 *     Monitor-UI conveniences, out of scope for a bare WISING.analyze()
 *     replacement.
 *   - Adds WISING.normalize(opts) (returns just `model`, a free byproduct of
 *     the same assembly analyze() already does) and WISING.util (the two
 *     pure helpers residency-nodes.js already exports) — both real,
 *     achievable pieces of the classic engine's lower-level API.
 *
 * Known, deliberate gap: WISING.compute(model) — the classic engine's
 * second-phase call that takes an already-built model object and continues
 * from there — has no DAG equivalent here. The graph only resolves forward
 * from raw {router, india, us}; there is no node whose input is an
 * arbitrary pre-built model object. tests/engine/run.js's fixture-assertion
 * layer calls WISING.compute() directly on hand-authored synthetic models,
 * which this file cannot serve — only its "demo profile smoke test" layer
 * (WISING.PROFILES + WISING.analyze()) can run against this entry point today.
 * ==========================================================================*/
(function (root) {
  var path = require("path");
  require(path.join(__dirname, "constants.js"));
  require(path.join(__dirname, "sample-data.js"));
  require(path.join(__dirname, "profiles.js"));

  var WISING = root.WISING = root.WISING || {};
  var createGraph = require(path.join(__dirname, "graph.js")).createGraph;
  var fxRate = require(path.join(__dirname, "fx-util.js")).fxRate;
  var residencyUtil = require(path.join(__dirname, "residency-nodes.js"));
  var NODES = require(path.join(__dirname, "assets-nodes.js")).NODES;
  var graph = createGraph(NODES);

  var TARGET_IDS = [
    "entityResult", "metaResult", "identityResult", "treatyModelResult",
    "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
    "aggregateUsIncomeResult", "accountsBoundary", "assetsModelResult",
    "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
    "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
    "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
    "analyzeResult"
  ];

  // Same shape r.model carries from the classic engine's WISING.analyze() —
  // assembled from the already-verified block nodes, not re-derived.
  function assembleModel(out) {
    return {
      entity: out.entityResult,
      meta: out.metaResult,
      identity: out.identityResult,
      treaty: out.treatyModelResult,
      residency: out.residencyModelSliceResult,
      companyResidency: out.companyResidencyResult,
      income: { india: out.indiaIncomeModelResult, us: out.aggregateUsIncomeResult },
      accounts: { accounts: out.accountsBoundary, aggregatePeak: null },
      assets: out.assetsModelResult
    };
  }

  function assembleComputed(out, ctx) {
    // feieAppliedUsd is a DAG-internal convenience field (ustax-nodes.js) —
    // the real engine keeps that value at usTax.feie.appliedUsd instead.
    // Stripped so this object is byte-exact to the real computed.usTax.
    var usTax = Object.assign({}, out.usTaxResult);
    delete usTax.feieAppliedUsd;
    return {
      indiaTax: {
        totalTaxInr: out.totalTaxInrCombined, totalTaxUsd: out.totalTaxInrCombined / fxRate(ctx),
        regime: out.regimeCombined, isEntity: out.isEntityTaxpayer,
        // s115a is the object ONLY for a non-entity NR (computeIndiaTax's
        // `isNR ? {...} : null`); null for a resident individual; absent
        // entirely on the entity path (computeIndiaEntityTax returns no
        // s115a key at all) — null and absent are equivalent to every
        // consumer here (truthiness-gated) and to a deep-equal comparator.
        s115a: (out.isNRV3 && !out.isEntityTaxpayer) ? { dividend: out.s115aDividend, royalty: out.s115aRoyalty, fts: out.s115aFts } : null
      },
      usTax: usTax,
      residency: out.residencyResult,
      ftc: out.ftcResult,
      reconciliation: out.crossBasisResult,
      limits: out.limitsResult,
      headline: out.headlineResult,
      apportionment: out.apportionmentResult
    };
  }

  function resolveAll(opts) {
    opts = opts || {};
    var ctx = { router: opts.router, india: opts.india, us: opts.us };
    if (opts.monitorAsOf !== undefined) ctx.monitorAsOfBoundary = opts.monitorAsOf;
    if (opts.fxRateOverride !== undefined) ctx.fxRateOverride = opts.fxRateOverride;
    return { out: graph.resolve(TARGET_IDS, ctx).values, ctx: ctx };
  }

  function analyze(opts) {
    var r = resolveAll(opts);
    return Object.assign({}, r.out.analyzeResult, {
      model: assembleModel(r.out),
      computed: assembleComputed(r.out, r.ctx)
    });
  }

  function normalize(opts) {
    return assembleModel(resolveAll(opts).out);
  }

  WISING.analyze = analyze;
  WISING.normalize = normalize;
  WISING.util = {
    deriveIndiaDomesticStatus: residencyUtil.deriveIndiaDomesticStatus,
    deriveCompanyPoem: residencyUtil.deriveCompanyPoem
  };

  module.exports = { analyze: analyze, normalize: normalize };
})(typeof window !== "undefined" ? window : globalThis);
