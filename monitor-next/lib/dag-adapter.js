/* ============================================================================
 * Bridges lib/dag/*.js (the verified DAG — docs/DAG_MIGRATION_TRACKER.md,
 * 40/40 rows ported) into the same shape lib/wising.js's analyzeSource()
 * returns from the engine, so any Monitor component can consume either
 * source interchangeably.
 *
 * Assembled fields, each an already-verified DAG node (see the cited
 * run-*.js harness for the field-by-field proof against the real engine):
 *   model.entity/meta/identity/treaty  <- agg10-nodes.js       (run-agg10.js)
 *   model.income.india                 <- aggregateindiaincome-nodes.js
 *                                          (run-indiaincomemodel.js, and
 *                                          folded into run-agg10.js)
 *   model.income.us                    <- aggregateusincome-nodes.js
 *                                          (run-aggregateusincome.js, 385/385)
 *   model.residency                    <- agg10-nodes.js residencyModelSliceResult
 *   model.accounts.accounts            <- agg10-nodes.js accountsBoundary
 *   computed.*                         <- ustax-full-nodes.js's analyzeResult
 *                                          chain (indiaTax/usTax/residency/
 *                                          ftc/reconciliation/limits/headline)
 *
 * "use client": the DAG, like the engine, reads window/localStorage at call
 * time (loadRawStates' equivalent — see readRaw below). ESM imports of the
 * DAG's CommonJS files below rely on webpack's standard CJS/ESM interop
 * (named exports from a `module.exports = {...}` file) — the same
 * mechanism Next.js already uses throughout this app's dependency tree.
 * ==========================================================================*/
"use client";

import { createGraph } from "./dag/graph.js";
import { NODES } from "./dag/ustax-full-nodes.js";
import { countriesFromEngine } from "./wising.js";
import { CONST } from "./engine/constants.js";

const graph = createGraph(NODES);

const STORAGE_KEYS = {
  ROUTER: "wising_router_state",
  INDIA: "wising_layer1_india_state",
  US: "wising_us_state"
};

// Mirrors normalize.js's loadRawStates: opts override wins, else localStorage,
// else {} — the one boundary the DAG doesn't derive (AGG-10's documented
// exception; loadRawStates is I/O, not computation, so it has no graph node).
function readRaw(key, override) {
  if (override !== undefined) return override;
  try {
    const raw = typeof window !== "undefined" && window.localStorage && window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

// "demo" | "live" | {router,india,us} — mirrors lib/wising.js's analyzeSource
// contract exactly so callers can swap sources without touching call sites.
export function analyzeDagSource(source) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (source === "demo") { if (!W) return null; return analyzeDag({ router: W.SAMPLE.router, india: W.SAMPLE.india, us: W.SAMPLE.us }); }
  if (source === "live") return analyzeDag({});
  if (source && typeof source === "object") return analyzeDag(source);
  return null;
}

export function analyzeDag(opts) {
  opts = opts || {};
  const router = readRaw(STORAGE_KEYS.ROUTER, opts.router);
  const india = readRaw(STORAGE_KEYS.INDIA, opts.india);
  const us = readRaw(STORAGE_KEYS.US, opts.us);
  const ctx = { router, india, us };
  // Shadow mode pins the same "now" on both engine and DAG so monitoring's
  // date-derived fields (asOf, calendar daysUntil, projection breach dates)
  // compare fairly instead of drifting by the few ms between the two calls.
  // Omitted in normal use → the DAG's monitorAsOfBoundary node falls back to
  // new Date(), exactly as before.
  if (opts.monitorAsOf !== undefined) ctx.monitorAsOfBoundary = opts.monitorAsOf;

  const out = graph.resolve([
    "entityResult", "metaResult", "identityResult", "treatyModelResult",
    "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
    "aggregateUsIncomeResult", "accountsBoundary",
    "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
    "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
    "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
    "analyzeResult"
  ], ctx).values;

  // The same shape r.model/r.computed carries from WISING.analyze() —
  // assembled from the already-verified block nodes above, not re-derived.
  const model = {
    entity: out.entityResult,
    meta: out.metaResult,
    identity: out.identityResult,
    treaty: out.treatyModelResult,
    residency: out.residencyModelSliceResult,
    companyResidency: out.companyResidencyResult,
    income: { india: out.indiaIncomeModelResult, us: out.aggregateUsIncomeResult },
    accounts: { accounts: out.accountsBoundary, aggregatePeak: null }
  };
  // feieAppliedUsd is a DAG-internal convenience field (ustax-nodes.js,
  // added so ftc-nodes.js's boundary reads don't need a separate node) —
  // the real engine keeps that value at usTax.feie.appliedUsd instead.
  // Stripped here so this object is byte-exact to the real computed.usTax.
  const usTax = Object.assign({}, out.usTaxResult);
  delete usTax.feieAppliedUsd;

  const computed = {
    indiaTax: {
      totalTaxInr: out.totalTaxInrCombined, totalTaxUsd: out.totalTaxInrCombined / CONST.FX.INR_PER_USD,
      regime: out.regimeCombined, isEntity: out.isEntityTaxpayer,
      // computation.js: s115a is null entirely for a resident (not NR)
      // taxpayer — matched here rather than an all-null object shape.
      s115a: out.isNRV3 ? { dividend: out.s115aDividend, royalty: out.s115aRoyalty, fts: out.s115aFts } : null
    },
    usTax,
    residency: out.residencyResult,
    ftc: out.ftcResult,
    reconciliation: out.crossBasisResult,
    limits: out.limitsResult,
    headline: out.headlineResult,
    apportionment: out.apportionmentResult
  };

  return Object.assign({}, out.analyzeResult, { model, computed });
}

// DAG-backed counterpart to lib/wising.js's monitorSnapshot() — same
// {result, countries, healthScore, clientName, baseYear} shape, so any
// caller can switch source functions without touching how the result is
// consumed. countriesFromEngine() is reused as-is: it's a pure derivation
// off the result shape, not engine-specific.
export function monitorSnapshotDag(source) {
  const result = analyzeDagSource(source);
  if (!result) return null;
  return {
    result,
    countries: countriesFromEngine(result),
    healthScore: result.summary.healthScore,
    clientName: result.summary.name,
    baseYear: result.summary.baseYear
  };
}
