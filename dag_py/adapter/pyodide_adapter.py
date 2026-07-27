"""The ONLY file in this repository allowed to import `pyodide`/`js` or
touch `window`/`localStorage` — CI-lint-enforced (see
docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 section). Everything under
`wising_dag/**` is pure Python, testable with plain `pytest`, with no
knowledge of running inside a browser at all.

This module is the browser-side entry point: loaded (after
`micropip.install("wising_dag-*.whl")`) by a small bootstrap `<script
type="module">` that runs the Pyodide runtime, imports this file, and calls
`install()` once — after which `window.WISING.analyze`/`window.WISING.normalize`
exist with the exact same call shape `index.html` already uses against the
JS DAG's own `window.WISING.analyze`, so that consumer needs no change when
its loading mechanism switches (a future, separately-gated cutover — this
file only makes the swap POSSIBLE, it doesn't flip anything on its own).

`install()` takes an optional `namespace` (default `"WISING"`, matching
`index.html`'s single-compute-source page, which has nothing else
attached to `window.WISING`). `monitor-next/lib/py-dag-loader.js` — a
THIRD compute source living alongside the frozen engine (`window.WISING`,
its own IIFEs) and the JS DAG (imported as plain ES modules, no `window`
footprint at all) — calls `install(namespace="WISING_PY")` instead, so it
never clobbers the engine's own `window.WISING.analyze`. Both pages load
this exact same file; only the namespace argument differs.

`opts`/the return value cross the JS<->Python boundary via
`pyodide.ffi.to_py`/`to_js`. `to_js(..., dict_converter=js.Object.fromEntries)`
is required on the way out — Pyodide's default JS conversion for a Python
`dict` is a JS `Map`, not a plain object, and every existing consumer
(`dag-adapter.js`, any component doing `result.model.entity...`) expects
plain-object property access, not `Map.get()`.

`install(..., include_extras=False)`: monitor-next's own loader passes
`include_extras=True`, so `window.WISING_PY.analyze` calls
`wising_dag.analyze.analyze_with_extras` (adds `checksRegistry`/
`calendarAmounts` — the two fields `monitor-next/lib/dag-adapter.js`'s own
`analyzeDag()` augments the JS DAG's real output with, no engine
equivalent — see that function's own docstring) instead of the plain
`analyze()`. `index.html`'s own future wiring keeps the default `False`
(narrow, byte-for-byte `analyze.js` parity, matching what that page's
single compute source has always returned).
"""
from __future__ import annotations

import datetime

import js  # noqa: F401  (imported for its side effect of existing — see install())
import pyodide.ffi

from wising_dag import analyze as _analyze
from wising_dag import normalize as _normalize
from wising_dag.analyze import analyze_with_extras as _analyze_with_extras


def _to_py(js_opts):
    # `to_py()` is a METHOD on the JsProxy object itself, not a module-level
    # `pyodide.ffi.to_py()` function — confirmed against the real, pinned
    # production runtime (Pyodide v0.26.4) in an actual Chromium browser;
    # `pyodide.ffi` only exports the reverse conversion (`to_js`) as a
    # standalone function. See docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7
    # browser-verification section.
    return js_opts.to_py() if js_opts is not None else {}


def _default_converter(value, convert, cache):
    # to_js() has no built-in datetime.datetime -> JS Date conversion — an
    # unrecognized value like this is left as a live PyProxy, whose default
    # JS-side stringification calls back into Python's own str(datetime)
    # ("2025-06-15 00:00:00"), not a usable Date. Confirmed by an actual
    # Pyodide-in-Chromium run against monitor-next's real Filings/Compliance
    # Calendar view: `cal[0].date.getTime()` threw `TypeError: ... is not a
    # function` — every filings/monitoring.py compliance-calendar row is
    # exactly this shape. See docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 8
    # browser-verification section.
    #
    # Built from the (year, month, day, ...) calendar components, NOT
    # value.timestamp() — timestamp() treats a naive datetime as local time
    # in whatever timezone the Pyodide/WASM runtime happens to be configured
    # for, then bakes that into a UTC instant; js.Date.new(y, m0, d, ...)
    # instead reproduces the exact "local calendar date, no timezone
    # conversion at all" semantics the JS DAG's own mdate() uses
    # (`new Date(y, m-1, day)`), so the two sides can never disagree by a
    # day depending on which timezone either runtime happens to be in.
    if isinstance(value, datetime.datetime):
        return js.Date.new(value.year, value.month - 1, value.day, value.hour, value.minute, value.second, value.microsecond // 1000)
    return value


def _to_js(py_value):
    return pyodide.ffi.to_js(py_value, dict_converter=js.Object.fromEntries, default_converter=_default_converter)


def analyze_for_js(js_opts=None):
    return _to_js(_analyze(_to_py(js_opts)))


def analyze_with_extras_for_js(js_opts=None):
    return _to_js(_analyze_with_extras(_to_py(js_opts)))


def normalize_for_js(js_opts=None):
    return _to_js(_normalize(_to_py(js_opts)))


def install(namespace: str = "WISING", include_extras: bool = False) -> None:
    """Call once after the wheel is loaded — assigns
    `window[namespace].analyze`/`window[namespace].normalize`. Idempotent:
    safe to call again (e.g. after a hot-reload during development), and
    safe alongside another, unrelated object already living at
    `window[namespace]` (only `.analyze`/`.normalize` are ever touched)."""
    existing = getattr(js.window, namespace, None)
    target = existing if existing is not None else js.Object.new()
    target.analyze = analyze_with_extras_for_js if include_extras else analyze_for_js
    target.normalize = normalize_for_js
    setattr(js.window, namespace, target)
