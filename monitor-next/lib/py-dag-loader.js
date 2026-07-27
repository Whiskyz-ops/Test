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
 * Verified against the real, pinned production runtime (Pyodide v0.26.4,
 * genuine Python 3.12.1 in WASM) in an actual Chromium tab — this exact
 * sequence (loadPyodide -> loadPackage(micropip) -> micropip.install(wheel)
 * -> fetch+runPythonAsync(adapter) -> window[NAMESPACE].analyze) was
 * replayed with locally-hosted copies of the Pyodide runtime, micropip, and
 * the wheel (this sandbox has no network route to the jsdelivr CDN this
 * file's own PYODIDE_CDN_BASE points at, so the CDN *fetch* itself is
 * untested — only the mechanism/code path is). That run caught two real
 * bugs, both now fixed: the wheel filename had to be a PEP 427-conformant
 * name for micropip.install(url) to parse it (see
 * scripts/build-dag-wheel.py), and adapter/pyodide_adapter.py's `_to_py`
 * was calling a nonexistent `pyodide.ffi.to_py()` module function instead
 * of the real `<JsProxy>.to_py()` method. See
 * docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 browser-verification
 * section for the full writeup.
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
  // Filename must be a PEP 427-conformant wheel name (name-version-tags.whl):
  // micropip.install(url) parses those straight out of the URL's basename
  // (packaging.utils.parse_wheel_filename) before it ever reads the file's
  // contents, and raises InvalidWheelFilename on a bare "wising_dag.whl" —
  // confirmed by an actual Pyodide-in-Chromium run (see
  // docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 browser-verification
  // section). scripts/build-dag-wheel.py pins this exact filename forever,
  // independent of dag_py/pyproject.toml's real version.
  await micropip.install(assetUrl("dag-py/wising_dag-0.0.0-py3-none-any.whl"));

  const adapterRes = await fetch(assetUrl("dag-py/pyodide_adapter.py"));
  if (!adapterRes.ok) throw new Error("Failed to fetch dag-py/pyodide_adapter.py: " + adapterRes.status);
  const adapterSrc = await adapterRes.text();

  // include_extras=True: window.WISING_PY.analyze resolves checksRegistry/
  // calendarAmounts too (analyze_with_extras — see pyodide_adapter.py's own
  // header), matching lib/dag-adapter.js's own analyzeDag() superset of
  // analyze.js's real output. Without this, the Checks Registry panel and
  // the Compliance Calendar's forward-looking $ amounts would silently go
  // blank under "Python DAG" mode — both features exist in dag_py's own
  // computation (filings/checks_registry.py, filings/calendar_amounts.py),
  // this is purely an adapter-wiring switch.
  await pyodide.runPythonAsync(adapterSrc + `\ninstall(namespace="${NAMESPACE}", include_extras=True)\n`);

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
