/* ============================================================================
 * Pyodide bootstrap for the Python DAG (dag_py/) — the THIRD compute source,
 * alongside the frozen engine (window.WISING, plain IIFEs) and the JS DAG
 * (lib/dag/*.js, imported as plain ES modules, no window footprint at all).
 *
 * Fundamentally different from how the JS DAG got wired in: that one is a
 * synchronous `graph.resolve()` call reachable the instant the page's JS
 * bundle runs. Pyodide is NOT synchronous — fetching the ~10MB WASM runtime
 * and installing the wheel via micropip both take real wall-clock time
 * (seconds on a cold first call), so every consumer of this module works in
 * terms of a Promise, never a bare function call. `initPyDag()` is memoized:
 * the actual boot sequence runs at most once per page load, and every
 * concurrent/later caller awaits the SAME in-flight (or already-resolved)
 * promise rather than re-triggering it.
 *
 * NOT verified against a real Pyodide runtime — this sandbox has no network
 * route to fetch one (confirmed repeatedly throughout this port's own
 * migration tracker, Phase 7 onward). Written to the documented Pyodide
 * browser-loader API (`loadPyodide()`, `pyodide.loadPackage()`,
 * `pyodide.pyimport("micropip")`, `micropip.install()`,
 * `pyodide.runPythonAsync()`), but that is not the same as having actually
 * exercised it end-to-end in a browser. Treat this file with the same
 * caution `docs/PYTHON_DAG_MIGRATION_TRACKER.md`'s Phase 7 section already
 * flags for `adapter/pyodide_adapter.py` itself.
 *
 * PYODIDE_VERSION is the one thing to bump if a newer runtime is wanted —
 * everything else (script URL, indexURL for loadPyodide's own package
 * fetches) derives from it.
 * ==========================================================================*/
"use client";

const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

// window.WISING_PY.analyze/.normalize — a SEPARATE namespace from the
// engine's own window.WISING, so installing the Python DAG never clobbers
// the frozen engine's global (see adapter/pyodide_adapter.py's own header
// for why install() takes a configurable namespace argument for exactly
// this reason).
const NAMESPACE = "WISING_PY";

let _state = "idle"; // "idle" | "loading" | "ready" | "error"
let _error = null;
let _initPromise = null;

export function getPyDagLoadState() {
  return { state: _state, error: _error };
}

function assetUrl(relativePath) {
  // document.baseURI, not a bare relative string — respects next.config.mjs's
  // assetPrefix: "." (relative paths, so the static export works via
  // file:// double-click too), same convention every other same-origin
  // fetch in this app already needs to honor.
  return new URL(relativePath, typeof document !== "undefined" ? document.baseURI : undefined).href;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pyodide-loader="${src}"]`);
    if (existing) {
      if (window.loadPyodide) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Pyodide script: " + src)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.dataset.pyodideLoader = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide script: " + src));
    document.head.appendChild(script);
  });
}

async function bootPyDag() {
  await loadScriptOnce(PYODIDE_CDN_BASE + "pyodide.js");
  if (typeof window.loadPyodide !== "function") {
    throw new Error("pyodide.js loaded but window.loadPyodide is not a function");
  }
  const pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN_BASE });

  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(assetUrl("dag-py/wising_dag.whl"));

  const adapterRes = await fetch(assetUrl("dag-py/pyodide_adapter.py"));
  if (!adapterRes.ok) throw new Error("Failed to fetch dag-py/pyodide_adapter.py: " + adapterRes.status);
  const adapterSrc = await adapterRes.text();

  await pyodide.runPythonAsync(adapterSrc + `\ninstall(namespace="${NAMESPACE}")\n`);

  if (!window[NAMESPACE] || typeof window[NAMESPACE].analyze !== "function") {
    throw new Error(`Pyodide adapter ran but window.${NAMESPACE}.analyze was not installed`);
  }
  return pyodide;
}

// Memoized: the actual boot sequence runs at most once. Every caller
// (recompute(), refreshClientSummaries(), a linked-entity lookup, shadow
// mode's own py-dag leg) awaits this same promise — none of them need to
// know whether Pyodide is already warm, still booting, or hasn't started.
export function initPyDag() {
  if (_initPromise) return _initPromise;
  _state = "loading";
  _error = null;
  _initPromise = bootPyDag()
    .then((pyodide) => {
      _state = "ready";
      return pyodide;
    })
    .catch((err) => {
      _state = "error";
      _error = err;
      // Reset so a later explicit retry (e.g. the user re-selecting
      // "Python DAG" from the compute-source pill) attempts a fresh boot
      // instead of permanently replaying the same rejected promise.
      _initPromise = null;
      throw err;
    });
  return _initPromise;
}
