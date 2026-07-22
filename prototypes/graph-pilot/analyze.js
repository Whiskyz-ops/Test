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
 * WISING.compute(model), reconsidered: every real call site in
 * tests/engine/run.js's fixture-assertion layer calls WISING.normalize(raw)
 * then WISING.compute(thatSameModel) — never an independently hand-built
 * model bypassing normalize(). That means compute(model) there is just
 * phase 2 of a normal analyze()-shaped flow on raw {router, india, us}, not
 * a call the DAG structurally can't serve. WISING.analyze(opts) already
 * covers it: read r.model/r.computed from one call instead of two. To make
 * that actually work, model.deductions (india + us) is now assembled too —
 * the one field group those specific fixture assertions read that wasn't
 * needed by dag-adapter.js's own (monitor-next UI-driven) field list.
 * India's 12 s80* deductions are separate raw-fact nodes in in1-nodes-v3.js
 * (no combined node existed); the US side is one already-combined node,
 * dedUs, verified to already match the classic engine's model.deductions.us
 * shape exactly.
 * ==========================================================================*/
(function (root) {
  // Plain relative literals (not path.join(__dirname,...)) so this file is
  // statically analyzable by a bundler (esbuild/webpack) — Node resolves
  // require("./x.js") relative to __dirname the same way regardless, so
  // this is a no-op change for the Node harnesses.
  require("./constants.js");
  require("./sample-data.js");
  require("./profiles.js");

  var WISING = root.WISING = root.WISING || {};
  var createGraph = require("./graph.js").createGraph;
  var fxRate = require("./fx-util.js").fxRate;
  var residencyUtil = require("./residency-nodes.js");
  var NODES = require("./assets-nodes.js").NODES;
  var graph = createGraph(NODES);

  var TARGET_IDS = [
    "entityResult", "metaResult", "identityResult", "treatyModelResult",
    "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
    "aggregateUsIncomeResult", "accountsBoundary", "assetsModelResult",
    "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
    "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
    "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
    "analyzeResult",
    // model.deductions.india — in1-nodes-v3.js's aggregateIndiaDeductions
    // port, one raw-fact node per section (no single combined node exists).
    "dedS80C", "dedS80CCD1B", "dedS80CCD2Employer", "dedS80D", "dedS80TTA_TTB",
    "dedS80DD", "dedS80DDB", "dedS80U", "dedS80E", "dedS80EEA_EE", "dedS80GGB_GGC", "dedS80GGRentPaidInr",
    // model.deductions.us — ustax-nodes.js's dedUs, already one combined node.
    "dedUs",
    // computed.indiaTax.deductionsInr — in1-nodes-v3.js's final combined
    // deduction total (post-caps), read by the same fixture test above.
    "deductionsInrV3"
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
      assets: out.assetsModelResult,
      deductions: {
        india: {
          s80C: out.dedS80C, s80CCD1B: out.dedS80CCD1B, s80CCD2_employer: out.dedS80CCD2Employer,
          s80D: out.dedS80D, s80TTA_TTB: out.dedS80TTA_TTB, s80DD: out.dedS80DD, s80DDB: out.dedS80DDB,
          s80U: out.dedS80U, s80E: out.dedS80E, s80EEA_EE: out.dedS80EEA_EE,
          s80GGB_GGC: out.dedS80GGB_GGC, s80GG_rentPaidInr: out.dedS80GGRentPaidInr
        },
        us: out.dedUs
      }
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
        deductionsInr: out.deductionsInrV3,
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
