/* ============================================================================
 * Async counterpart to lib/dag-adapter.js — same field-by-field contract
 * (window.WISING.analyze()'s model/computed/findings/... shape, PLUS
 * checksRegistry/calendarAmounts — see below), same localStorage-backed
 * "demo"/"live"/{router,india,us} source resolution, but calling into the
 * Python DAG (dag_py/) via Pyodide instead of the JS DAG's own synchronous
 * graph.resolve(). Every export here returns a Promise — the one
 * unavoidable difference lib/py-dag-loader.js's own header explains
 * (Pyodide boot + wheel install take real wall-clock time, unlike a
 * synchronous JS function call).
 *
 * checksRegistry/calendarAmounts (CL-1/CL-2, DAG-only, no engine
 * equivalent — same as this file's own dag-adapter.js counterpart) come
 * through automatically: py-dag-loader.js installs `window.WISING_PY.
 * analyze` with `include_extras=True` (pyodide_adapter.py's own
 * analyze_with_extras), so `analyzePyDag()` below is a plain pass-through
 * of whatever that already includes — no separate resolve call needed
 * here, unlike dag-adapter.js's own analyzeDag() (which builds its model/
 * computed from a hand-composed graph.resolve() list and has to ask for
 * checksRegistryResult/calendarAmountsResult explicitly).
 *
 * Verified end-to-end against a real Pyodide runtime — see
 * py-dag-loader.js's own header and docs/PYTHON_DAG_MIGRATION_TRACKER.md's
 * Phase 8 browser-verification sections for how (a real Chromium tab
 * driving this actual app, with the jsdelivr CDN fetch alone substituted
 * for a local mirror of the same pinned Pyodide version — every line of
 * this file and its callers ran unmodified).
 * ==========================================================================*/
"use client";

import { readRaw, STORAGE_KEYS } from "./dag-adapter.js";
import { countriesFromEngine } from "./wising.js";
import { initPyDag } from "./py-dag-loader.js";

// "demo" | "live" | {router,india,us} — same source contract as
// analyzeDagSource()/analyzeSource(), async because initPyDag() is.
export async function analyzePyDagSource(source, overrides) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (source === "demo") {
    if (!W) return null;
    return analyzePyDag(Object.assign({ router: W.SAMPLE.router, india: W.SAMPLE.india, us: W.SAMPLE.us }, overrides));
  }
  if (source === "live") return analyzePyDag(Object.assign({}, overrides));
  if (source && typeof source === "object") return analyzePyDag(Object.assign({}, source, overrides));
  return null;
}

// analyzeDag's own {regimeOverride,feieOverride,monitorAsOf,fxRateOverride}
// shape, passed straight through to wising_dag.analyze()'s own opts dict
// (analyze.py accepts the same keys the JS DAG's analyze() ctx-building
// does — router/india/us/monitorAsOf/fxRateOverride. The regime/FEIE
// overrides are applied client-side here first, same as analyzeDag() does,
// since analyze.py itself has no what-if-patching concept of its own).
export async function analyzePyDag(opts) {
  opts = opts || {};
  await initPyDag();

  const router = readRaw(STORAGE_KEYS.ROUTER, opts.router);
  let india = readRaw(STORAGE_KEYS.INDIA, opts.india);
  let us = readRaw(STORAGE_KEYS.US, opts.us);
  if (opts.regimeOverride !== undefined) {
    india = Object.assign({}, india, { profile: Object.assign({}, india && india.profile, { tax_regime: opts.regimeOverride }) });
  }
  if (opts.feieOverride !== undefined) {
    us = Object.assign({}, us, { foreign_earned_income: Object.assign({}, us && us.foreign_earned_income, { claims_feie: opts.feieOverride }) });
  }

  const pyOpts = { router, india, us };
  if (opts.monitorAsOf !== undefined) {
    pyOpts.monitorAsOf = opts.monitorAsOf instanceof Date ? opts.monitorAsOf.toISOString() : opts.monitorAsOf;
  }
  if (opts.fxRateOverride !== undefined) pyOpts.fxRateOverride = opts.fxRateOverride;

  // window.WISING_PY.analyze is a plain JS function by the time initPyDag()
  // resolves (pyodide_adapter.py's analyze_for_js, wrapped through
  // pyodide.ffi.to_js) — called exactly like window.WISING.analyze, no
  // Pyodide-specific ceremony needed at the call site.
  const W_PY = window.WISING_PY;
  return W_PY.analyze(pyOpts);
}

// Python-DAG-backed counterpart to monitorSnapshotDag() — same
// {result, countries, healthScore, clientName, baseYear} shape, async.
export async function monitorSnapshotPyDag(source, overrides) {
  const result = await analyzePyDagSource(source, overrides);
  if (!result) return null;
  return {
    result,
    countries: countriesFromEngine(result),
    healthScore: result.summary.healthScore,
    clientName: result.summary.name,
    baseYear: result.summary.baseYear
  };
}

// Python-DAG-backed counterpart to analyzeProfileByIdDag() — used for the
// linked-entity Filings-tab roll-up (docs/GAP_TRACKER.md section H.11).
export async function analyzeProfileByIdPyDag(id) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.PROFILES) return null;
  const p = W.PROFILES.find((x) => x.id === id);
  if (!p) return null;
  return analyzePyDag({ router: p.router, india: p.india, us: p.us });
}

async function summarizePy(id, label, story, tags, raw, isRegistryClient) {
  let r;
  try { r = await analyzePyDag(raw); } catch (e) { return null; }
  const s = r.summary;
  return {
    id, label, story, tags, isRegistryClient: !!isRegistryClient,
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

// Python-DAG-backed counterpart to allClientSummariesDag() — every demo
// profile + registry client, resolved in parallel (each is an independent
// Pyodide call sharing the one already-booted runtime, not a fresh boot
// per client).
export async function allClientSummariesPyDag() {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.PROFILES) return [];
  await initPyDag();
  const demoPromises = W.PROFILES.map((p) => summarizePy(p.id, p.label, p.story, p.tags, { router: p.router, india: p.india, us: p.us }));
  const registryList = W.ClientRegistry ? W.ClientRegistry.list() : [];
  const registryPromises = registryList.map((c) => {
    const raw = W.ClientRegistry.getRawState(c.id);
    return summarizePy(c.id, c.label || "New client", "Added by this practice — not a demo profile.", ["live"], raw, true);
  });
  const [demo, registry] = await Promise.all([Promise.all(demoPromises), Promise.all(registryPromises)]);
  return demo.filter(Boolean).concat(registry.filter(Boolean));
}
