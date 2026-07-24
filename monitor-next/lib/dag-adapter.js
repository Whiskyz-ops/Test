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
 *   model.assets                       <- assets-nodes.js assetsModelResult
 *                                          (run-assets.js, 801/801) — the
 *                                          Holdings/Business tabs' own
 *                                          dependency, never built until
 *                                          those two tabs were actually
 *                                          click-tested under DAG mode
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
import { NODES } from "./dag/calendar-amounts-nodes.js";
import { countriesFromEngine } from "./wising.js";
import { fxRate } from "./dag/fx-util.js";

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
export function analyzeDagSource(source, overrides) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (source === "demo") { if (!W) return null; return analyzeDag(Object.assign({ router: W.SAMPLE.router, india: W.SAMPLE.india, us: W.SAMPLE.us }, overrides)); }
  if (source === "live") return analyzeDag(Object.assign({}, overrides));
  if (source && typeof source === "object") return analyzeDag(Object.assign({}, source, overrides));
  return null;
}

export function analyzeDag(opts) {
  opts = opts || {};
  const router = readRaw(STORAGE_KEYS.ROUTER, opts.router);
  let india = readRaw(STORAGE_KEYS.INDIA, opts.india);
  let us = readRaw(STORAGE_KEYS.US, opts.us);
  // What-if regime/FEIE toggles: shallow-clone just the one nested object
  // being patched, never mutate india/us in place — opts.india/opts.us (and
  // readRaw's localStorage-parsed fallback) can be a shared reference (e.g.
  // a profiles.js PROFILES[i] entry, reused across every future analyze()
  // call), so writing into it directly would permanently corrupt that
  // profile for the rest of the session.
  if (opts.regimeOverride !== undefined) {
    india = Object.assign({}, india, { profile: Object.assign({}, india && india.profile, { tax_regime: opts.regimeOverride }) });
  }
  if (opts.feieOverride !== undefined) {
    us = Object.assign({}, us, { foreign_earned_income: Object.assign({}, us && us.foreign_earned_income, { claims_feie: opts.feieOverride }) });
  }
  const ctx = { router, india, us };
  // Shadow mode pins the same "now" on both engine and DAG so monitoring's
  // date-derived fields (asOf, calendar daysUntil, projection breach dates)
  // compare fairly instead of drifting by the few ms between the two calls.
  // Omitted in normal use → the DAG's monitorAsOfBoundary node falls back to
  // new Date(), exactly as before.
  if (opts.monitorAsOf !== undefined) ctx.monitorAsOfBoundary = opts.monitorAsOf;
  // What-if FX slider: ctx.fxRateOverride is read directly (no boundary node
  // needed — fx-util.js's fxRate(ctx) is the single read point every DAG
  // node's INR<->USD conversion goes through). Omitted → defaults to 83.0
  // (fx-util.js's DEFAULT_FX_RATE, matching engine/constants.js).
  if (opts.fxRateOverride !== undefined) ctx.fxRateOverride = opts.fxRateOverride;

  const out = graph.resolve([
    "entityResult", "metaResult", "identityResult", "treatyModelResult",
    "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
    "aggregateUsIncomeResult", "accountsBoundary", "assetsModelResult",
    "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
    "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
    "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
    "analyzeResult", "checksRegistryResult", "calendarAmountsResult"
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
    accounts: { accounts: out.accountsBoundary, aggregatePeak: null },
    assets: out.assetsModelResult
  };
  // feieAppliedUsd is a DAG-internal convenience field (ustax-nodes.js,
  // added so ftc-nodes.js's boundary reads don't need a separate node) —
  // the real engine keeps that value at usTax.feie.appliedUsd instead.
  // Stripped here so this object is byte-exact to the real computed.usTax.
  const usTax = Object.assign({}, out.usTaxResult);
  delete usTax.feieAppliedUsd;

  const computed = {
    indiaTax: {
      totalTaxInr: out.totalTaxInrCombined, totalTaxUsd: out.totalTaxInrCombined / fxRate(ctx),
      regime: out.regimeCombined, isEntity: out.isEntityTaxpayer,
      // computation.js: s115a is the object ONLY for a non-entity NR
      // (computeIndiaTax's `isNR ? {...} : null`); null for a resident
      // individual; and absent entirely on the entity path
      // (computeIndiaEntityTax returns no s115a key at all). The
      // !isEntityTaxpayer guard was missing — an entity mutated to NR
      // residency status made isNRV3 true and wrongly produced the object
      // (found by run-fuzz.js, SYS-3, 20 Jul 2026). null and absent are
      // equivalent to every consumer (Views.jsx gates on truthiness) and to
      // the differential comparators (null == undefined).
      s115a: (out.isNRV3 && !out.isEntityTaxpayer) ? { dividend: out.s115aDividend, royalty: out.s115aRoyalty, fts: out.s115aFts } : null
    },
    usTax,
    residency: out.residencyResult,
    ftc: out.ftcResult,
    reconciliation: out.crossBasisResult,
    limits: out.limitsResult,
    headline: out.headlineResult,
    apportionment: out.apportionmentResult
  };

  // checksRegistry: CL-1 (docs/GAP_TRACKER.md), DAG-only — no engine
  // equivalent, so lib/wising.js's analyzeSource() never sets this key.
  // Consumers should treat its absence as "not available in this mode",
  // not "zero checks ran."
  // calendarAmounts: CL-2, same DAG-only precedent — the forward-looking
  // ₹/$ figure per advance-tax/estimated-tax calendar row.
  return Object.assign({}, out.analyzeResult, {
    model, computed, checksRegistry: out.checksRegistryResult, calendarAmounts: out.calendarAmountsResult
  });
}

// DAG-backed counterpart to lib/wising.js's monitorSnapshot() — same
// {result, countries, healthScore, clientName, baseYear} shape, so any
// caller can switch source functions without touching how the result is
// consumed. countriesFromEngine() is reused as-is: it's a pure derivation
// off the result shape, not engine-specific.
export function monitorSnapshotDag(source, overrides) {
  const result = analyzeDagSource(source, overrides);
  if (!result) return null;
  return {
    result,
    countries: countriesFromEngine(result),
    healthScore: result.summary.healthScore,
    clientName: result.summary.name,
    baseYear: result.summary.baseYear
  };
}

// One demo-profile or registry-client's raw {router,india,us} -> the same
// compact summary shape allClientSummariesDag returns per row. Registry
// clients read via W.ClientRegistry.getRawState(id) (this client's own
// namespaced localStorage keys — see constants.js's ClientRegistry header
// comment) rather than the single shared global slot, so this never
// collides with "Live" mode or any other client. A brand-new client with no
// Layer 0/1 data saved yet still analyzes cleanly (engine/DAG both treat a
// fully blank {router:{},india:{},us:{}} as an "Unnamed Taxpayer" with
// all-zero figures, not a throw) — the try/catch is just cheap insurance
// against genuinely malformed localStorage content, not the expected path.
function summarize(id, label, story, tags, raw, isRegistryClient) {
  let r;
  try { r = analyzeDag(raw); } catch (e) { return null; }
  const s = r.summary;
  return {
    id, label, story, tags, isRegistryClient: !!isRegistryClient,
    // The taxpayer's actual name (router/Layer 1 full_name/entity name) —
    // distinct from `label`, which for demo profiles is a scenario
    // description ("Dual Resident — H-1B"), not a person's name at all. A
    // preparer recognizes a client by name, not by their residency
    // scenario — see ClientRow, which shows this as the primary text.
    name: s.name,
    isBusiness: r.model.entity ? r.model.entity.isBusiness : false,
    indiaStatus: s.indiaStatus, usStatus: s.usStatus, dualResident: s.dualResident,
    totalIncomeUsd: s.totalIncomeUsd, netDoubleTaxUsd: s.netDoubleTaxUsd,
    combinedTaxUsd: (s.indiaTaxUsd || 0) + (s.usTaxUsd || 0),
    critical: s.counts.critical, warning: s.counts.warning,
    requiredDocs: s.requiredDocs, healthScore: s.healthScore,
    nextDeadline: r.monitoring && r.monitoring.calendar.next ? r.monitoring.calendar.next : null
  };
}

// DAG-backed counterpart to lib/wising.js's allClientSummaries() — same
// shape, so ClientsView renders identically regardless of source. Previously
// the Clients tab always ran the real engine here even when the primary
// Monitor was set to DAG mode (analyzeDag was never called from this
// function at all) — the one place in the app that didn't actually route
// through the current engineSource toggle. No overrides applied: the
// portfolio view is each client's own on-file baseline, not the active
// what-if scenario (matching allClientSummaries()'s own behavior).
//
// Also includes every real, professional-added client from the registry
// ("+ Add Client" — docs section on per-client storage isolation) alongside
// the 12 static demo profiles. Each registry client's data is read directly
// from its own namespaced keys, never the shared "Live" slot, so this list
// can never leak one client's numbers into another's row.
export function allClientSummariesDag() {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.PROFILES) return [];
  const demo = W.PROFILES.map((p) => summarize(p.id, p.label, p.story, p.tags, { router: p.router, india: p.india, us: p.us })).filter(Boolean);
  const registry = (W.ClientRegistry ? W.ClientRegistry.list() : []).map((c) => {
    const raw = W.ClientRegistry.getRawState(c.id);
    return summarize(c.id, c.label || "New client", "Added by this practice — not a demo profile.", ["live"], raw, true);
  }).filter(Boolean);
  return demo.concat(registry);
}

// DAG-mode counterpart to lib/wising.js's analyzeProfileById — full
// analyzeDag() result for a specific profile id, regardless of which
// client is currently active. Used to merge a linked (owned) entity's own
// compliance calendar/documents into the active client's Filings tab
// (docs/GAP_TRACKER.md section H.11).
export function analyzeProfileByIdDag(id) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.PROFILES) return null;
  const p = W.PROFILES.find((x) => x.id === id);
  if (!p) return null;
  return analyzeDag({ router: p.router, india: p.india, us: p.us });
}
