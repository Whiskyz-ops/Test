/* ============================================================================
 * SHADOW MODE — client-side runner + persistent log.
 *
 * Runs the engine (primary, served to the UI) and the DAG (silent shadow) over
 * the SAME real profile with a SINGLE pinned "now", deep-compares the whole
 * product surface (lib/shadow-core.js), and records any divergence to
 * localStorage so it survives reloads and can be surfaced in-app. This is the
 * production counterpart to the offline fuzzer: it watches the profiles real
 * users actually load, catching any field the fuzzer's generator never reached.
 *
 * Non-blocking by contract: callers invoke runShadow() from a deferred tick
 * (requestIdleCallback / setTimeout) AFTER the engine result is already on
 * screen, so the shadow comparison never sits on the render path.
 * ==========================================================================*/
"use client";

import { getWISING } from "./wising.js";
import { analyzeDag } from "./dag-adapter.js";
import { compareSurface, signature } from "./shadow-core.js";

const LOG_KEY = "wising_shadow_log";
const MAX_EVENTS = 100;

// Session run/clean counters live in module memory, not localStorage: every
// recompute fires a deferred runShadow, and under React Strict Mode's
// double-invoke several land in quick succession — a localStorage
// read-increment-write would race and lose counts. The persisted half is only
// what must survive a reload: the last run's status and the deduped divergence
// events. JS is single-threaded, so these increments are exact.
let sessionRuns = 0;
let sessionClean = 0;

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function emptyPersisted() {
  return { lastRun: null, events: [] };
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

// Public view: persisted {lastRun, events} merged with the in-memory counters.
export function getShadowLog() {
  const p = readPersisted();
  return { lastRun: p.lastRun, events: p.events, runs: sessionRuns, clean: sessionClean };
}

export function clearShadowLog() {
  sessionRuns = 0; sessionClean = 0;
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

/* Run one shadow comparison. Returns the event record (also persisted):
 *   { ts, source, ok, divergences, engineMs, dagMs }
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

  let divergences;
  if (engErr || dagErr) {
    // One side threw and the other didn't (or both) — that IS the divergence.
    divergences = [{
      path: "<throw>",
      engine: engErr ? "THREW: " + engErr.message : "ok",
      dag: dagErr ? "THREW: " + dagErr.message : "ok"
    }];
  } else {
    divergences = compareSurface(eng, dag);
  }

  const rec = {
    ts: asOfTs,
    source: sourceLabel(source),
    ok: divergences.length === 0,
    divergences: divergences.slice(0, 40),
    divergenceCount: divergences.length,
    engineMs: +(t1 - t0).toFixed(2),
    dagMs: +(t2 - t1).toFixed(2)
  };

  record(rec);

  if (!rec.ok && typeof console !== "undefined") {
    console.warn(
      "[shadow] engine⇔DAG divergence on '" + rec.source + "' (" + rec.divergenceCount + "):",
      rec.divergences
    );
  }
  return rec;
}

// Bump the in-memory counters; persist lastRun plus, for a diverging run, a
// deduped event (a signature collapses repeated loads of the same diverging
// profile into one entry, newest-first, capped).
function record(rec) {
  sessionRuns += 1;
  if (rec.ok) sessionClean += 1;

  const p = readPersisted();
  p.lastRun = { ts: rec.ts, source: rec.source, ok: rec.ok, divergenceCount: rec.divergenceCount, engineMs: rec.engineMs, dagMs: rec.dagMs };
  if (!rec.ok) {
    const sig = signature(rec.source, rec.divergences);
    const events = (p.events || []).filter((e) => e.sig !== sig);
    events.unshift({ sig, ts: rec.ts, source: rec.source, divergenceCount: rec.divergenceCount, divergences: rec.divergences });
    p.events = events.slice(0, MAX_EVENTS);
  }
  savePersisted(p);
}
