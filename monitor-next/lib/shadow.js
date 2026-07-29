/* ============================================================================
 * SHADOW MODE — client-side runner + persistent log.
 *
 * Runs the engine (primary, served to the UI) and a shadow implementation
 * over the SAME real profile with a SINGLE pinned "now", deep-compares the
 * whole product surface (lib/shadow-core.js), and records any divergence to
 * localStorage so it survives reloads and can be surfaced in-app. This is the
 * production counterpart to the offline fuzzer: it watches the profiles real
 * users actually load, catching any field the fuzzer's generator never reached.
 *
 * TWO independent legs, both non-blocking by contract (callers invoke them
 * from a deferred tick — requestIdleCallback/setTimeout — AFTER the primary
 * result is already on screen, so neither ever sits on the render path):
 *
 *   - runShadow(source): engine vs the JS DAG (lib/dag-adapter.js). Cheap
 *     and synchronous under the hood (a plain graph.resolve() call) — safe
 *     to run on every recompute, and does, same as before this file grew a
 *     second leg.
 *   - runShadowPy(source): engine vs the Python DAG (lib/py-dag-adapter.js,
 *     via Pyodide). NOT cheap on a cold first call — booting Pyodide and
 *     installing the wheel takes real wall-clock time (lib/py-dag-loader.js's
 *     own header) — so this is opt-in, never fired automatically just
 *     because shadow mode is on. Callers (app/page.jsx) gate it behind an
 *     explicit signal (?shadowPy=1, or the user having already selected
 *     "Python DAG" as the primary source, in which case Pyodide is booting
 *     anyway).
 *
 * Both legs share the same persisted log (LOG_KEY), each event tagged with
 * its own sourcePair (lib/shadow-core.js's SOURCE_PAIRS) so a consumer can
 * tell which comparison a given divergence came from. lastRun/lastRunPy are
 * kept as SEPARATE slots (not one shared "last run") since the two legs fire
 * at very different cadences — every recompute vs only when explicitly
 * enabled — and folding them into one slot would make "the" shadow status
 * flicker between two different meanings depending on which one fired most
 * recently.
 * ==========================================================================*/
"use client";

import { getWISING } from "./wising.js";
import { analyzeDag } from "./dag-adapter.js";
import { analyzePyDagSource } from "./py-dag-adapter.js";
import { compareSurface, signature, SOURCE_PAIRS } from "./shadow-core.js";
import { track } from "@vercel/analytics";

const LOG_KEY = "wising_shadow_log";
const MAX_EVENTS = 100;

// Session run/clean counters live in module memory, not localStorage: every
// recompute fires a deferred runShadow, and under React Strict Mode's
// double-invoke several land in quick succession — a localStorage
// read-increment-write would race and lose counts. The persisted half is only
// what must survive a reload: the last run's status and the deduped divergence
// events. JS is single-threaded, so these increments are exact. Separate
// counters per leg — see this file's own header for why they're not merged.
let sessionRuns = 0;
let sessionClean = 0;
let sessionRunsPy = 0;
let sessionCleanPy = 0;

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function emptyPersisted() {
  return { lastRun: null, lastRunPy: null, events: [] };
}

function readPersisted() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(LOG_KEY);
    if (!raw) return emptyPersisted();
    return Object.assign(emptyPersisted(), JSON.parse(raw));
  } catch (e) { return emptyPersisted(); }
}

function savePersisted(p) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(LOG_KEY, JSON.stringify(p)); } catch (e) {}
}

// Public view: persisted {lastRun, lastRunPy, events} merged with the
// in-memory counters (both legs').
export function getShadowLog() {
  const p = readPersisted();
  return {
    lastRun: p.lastRun, lastRunPy: p.lastRunPy, events: p.events,
    runs: sessionRuns, clean: sessionClean,
    runsPy: sessionRunsPy, cleanPy: sessionCleanPy
  };
}

export function clearShadowLog() {
  sessionRuns = 0; sessionClean = 0; sessionRunsPy = 0; sessionCleanPy = 0;
  savePersisted(emptyPersisted());
  return getShadowLog();
}

function sourceLabel(source) {
  if (source === "demo" || source === "live") return source;
  if (source && typeof source === "object") return source.__label || "custom";
  return "unknown";
}

// Resolve a source into the {router, india, us} the engine's analyze() takes.
// "live"/{} → localStorage-backed (analyzeDag's readRaw and the engine's own
// loadRawStates both read the same keys), so we pass through opts unchanged.
function engineOpts(source, W) {
  if (source === "demo") return { router: W.SAMPLE.router, india: W.SAMPLE.india, us: W.SAMPLE.us };
  if (source === "live") return {};
  if (source && typeof source === "object") return source;
  return {};
}

// Shared "did the two sides throw / diverge, build the record" logic —
// both legs feed it the same shape ({ eng, engErr, other, otherErr, t0, t1,
// t2 }), only the timing-field NAMES in the returned record differ
// (engineMs/dagMs — an established, already-consumed shape ShadowBadge.jsx
// reads — vs engineMs/pyDagMs for the new leg).
function buildDivergences(eng, engErr, other, otherErr) {
  if (engErr || otherErr) {
    return [{
      path: "<throw>",
      engine: engErr ? "THREW: " + engErr.message : "ok",
      dag: otherErr ? "THREW: " + otherErr.message : "ok"
    }];
  }
  return compareSurface(eng, other);
}

// Central telemetry (docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 8
// promotion gate — ≥500 profiles / ≥14 days of live shadow running):
// getShadowLog()'s own {runs, clean, runsPy, cleanPy} are per-browser
// (module memory + localStorage), never aggregated across real users, so
// the gate could never actually be MEASURED no matter how long shadow mode
// ran. This sends one small, non-taxpayer event per comparison to Vercel
// Web Analytics's custom-events API (queryable via Vercel's own dashboard
// or API once enabled) — counts and a clean/dirty boolean only, NEVER
// rec.divergences (diff strings can embed real computed figures, e.g.
// "$.computed.usTax.agiUsd: 50000 != 49000" — exactly the kind of thing
// that must not leave the browser). track() itself already no-ops safely
// if Web Analytics isn't enabled/injected (window.va is undefined) or the
// call is off-Vercel entirely (e.g. the offline file:// build) — wrapped in
// try/catch anyway, matching this file's own "a shadow-mode failure must
// never affect the primary UI" rule.
function reportTelemetry(sourcePair, rec) {
  try {
    track("shadow_compare", { sourcePair, source: rec.source, ok: rec.ok, divergenceCount: rec.divergenceCount });
  } catch (e) {}
}

function recordEvent(sourcePair, rec) {
  const p = readPersisted();
  const slot = sourcePair === SOURCE_PAIRS.ENGINE_VS_PY_DAG ? "lastRunPy" : "lastRun";
  p[slot] = { ts: rec.ts, source: rec.source, ok: rec.ok, divergenceCount: rec.divergenceCount, engineMs: rec.engineMs, dagMs: rec.dagMs, sourcePair };
  if (!rec.ok) {
    const sig = signature(sourcePair, rec.source, rec.divergences);
    const events = (p.events || []).filter((e) => e.sig !== sig);
    events.unshift({ sig, ts: rec.ts, source: rec.source, sourcePair, divergenceCount: rec.divergenceCount, divergences: rec.divergences });
    p.events = events.slice(0, MAX_EVENTS);
  }
  savePersisted(p);
  reportTelemetry(sourcePair, rec);
}

/* Run one shadow comparison: engine vs the JS DAG. Returns the event record
 * (also persisted): { ts, source, sourcePair, ok, divergences, engineMs, dagMs }
 * Returns null if the engine isn't loaded yet. Never throws — a shadow crash
 * must not take down the primary UI, so a thrown DAG/engine is itself recorded
 * as a divergence rather than propagated. */
export function runShadow(source) {
  const W = getWISING();
  if (!W || !W.analyze) return null;

  const asOfTs = Date.now();
  const opts = engineOpts(source, W);

  let eng = null, engErr = null, dag = null, dagErr = null;
  const t0 = now();
  try { eng = W.analyze(Object.assign({}, opts, { asOf: new Date(asOfTs) })); }
  catch (e) { engErr = e; }
  const t1 = now();
  try { dag = analyzeDag(Object.assign({}, opts, { monitorAsOf: asOfTs })); }
  catch (e) { dagErr = e; }
  const t2 = now();

  const divergences = buildDivergences(eng, engErr, dag, dagErr);
  const rec = {
    ts: asOfTs, source: sourceLabel(source), sourcePair: SOURCE_PAIRS.ENGINE_VS_JS_DAG,
    ok: divergences.length === 0, divergences: divergences.slice(0, 40), divergenceCount: divergences.length,
    engineMs: +(t1 - t0).toFixed(2), dagMs: +(t2 - t1).toFixed(2)
  };

  sessionRuns += 1;
  if (rec.ok) sessionClean += 1;
  recordEvent(SOURCE_PAIRS.ENGINE_VS_JS_DAG, rec);

  if (!rec.ok && typeof console !== "undefined") {
    console.warn(
      "[shadow] engine⇔JS-DAG divergence on '" + rec.source + "' (" + rec.divergenceCount + "):",
      rec.divergences
    );
  }
  return rec;
}

/* Async counterpart to runShadow(): engine vs the Python DAG (Pyodide).
 * Same record shape, tagged sourcePair: SOURCE_PAIRS.ENGINE_VS_PY_DAG.
 * NEVER call this unconditionally on every recompute — see this file's own
 * header for why (a cold Pyodide boot is not cheap). Resolves to null if the
 * engine isn't loaded yet; never rejects — a thrown Python DAG/engine is
 * itself recorded as a divergence, same discipline as runShadow(). */
export async function runShadowPy(source) {
  const W = getWISING();
  if (!W || !W.analyze) return null;

  const asOfTs = Date.now();
  const opts = engineOpts(source, W);

  let eng = null, engErr = null, py = null, pyErr = null;
  const t0 = now();
  try { eng = W.analyze(Object.assign({}, opts, { asOf: new Date(asOfTs) })); }
  catch (e) { engErr = e; }
  const t1 = now();
  try { py = await analyzePyDagSource(source, { monitorAsOf: asOfTs }); }
  catch (e) { pyErr = e; }
  const t2 = now();

  const divergences = buildDivergences(eng, engErr, py, pyErr);
  const rec = {
    ts: asOfTs, source: sourceLabel(source), sourcePair: SOURCE_PAIRS.ENGINE_VS_PY_DAG,
    ok: divergences.length === 0, divergences: divergences.slice(0, 40), divergenceCount: divergences.length,
    // engineMs/dagMs (not engineMs/pyDagMs) — ShadowBadge.jsx's own display
    // reads these two field names regardless of which leg's record it's
    // showing; "dagMs" here just means "the shadow side's own time," Python
    // in this record's case, same convention runShadow() already
    // established for the JS DAG.
    engineMs: +(t1 - t0).toFixed(2), dagMs: +(t2 - t1).toFixed(2)
  };

  sessionRunsPy += 1;
  if (rec.ok) sessionCleanPy += 1;
  recordEvent(SOURCE_PAIRS.ENGINE_VS_PY_DAG, rec);

  if (!rec.ok && typeof console !== "undefined") {
    console.warn(
      "[shadow] engine⇔Python-DAG divergence on '" + rec.source + "' (" + rec.divergenceCount + "):",
      rec.divergences
    );
  }
  return rec;
}
