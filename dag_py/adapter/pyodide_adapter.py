"""The ONLY file in this repository allowed to import `pyodide`/`js` or
touch `window`/`localStorage` — CI-lint-enforced (see
docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 section). Everything under
`wising_dag/**` is pure Python, testable with plain `pytest`, with no
knowledge of running inside a browser at all.

This module is the browser-side entry point: loaded (after
`micropip.install("wising_dag-*.whl")`) by a small bootstrap `<script
type="module">` that runs the Pyodide runtime, imports this file, and calls
`install()` once — after which `window.WISING.analyze`/`window.WISING.normalize`
exist with the exact same call shape `index.html`/`monitor-next/lib/
dag-adapter.js` already use against the JS DAG's own `window.WISING.analyze`,
so neither existing consumer needs to change when the loading mechanism
switches (Phase 8's cutover, gated separately — this file only makes the
swap POSSIBLE, it doesn't flip anything on its own).

`opts`/the return value cross the JS<->Python boundary via
`pyodide.ffi.to_py`/`to_js`. `to_js(..., dict_converter=js.Object.fromEntries)`
is required on the way out — Pyodide's default JS conversion for a Python
`dict` is a JS `Map`, not a plain object, and every existing consumer
(`dag-adapter.js`, any component doing `result.model.entity...`) expects
plain-object property access, not `Map.get()`.
"""
from __future__ import annotations

import js  # noqa: F401  (imported for its side effect of existing — see install())
import pyodide.ffi

from wising_dag import analyze as _analyze
from wising_dag import normalize as _normalize


def _to_py(js_opts):
    return pyodide.ffi.to_py(js_opts) if js_opts is not None else {}


def _to_js(py_value):
    return pyodide.ffi.to_js(py_value, dict_converter=js.Object.fromEntries)


def analyze_for_js(js_opts=None):
    return _to_js(_analyze(_to_py(js_opts)))


def normalize_for_js(js_opts=None):
    return _to_js(_normalize(_to_py(js_opts)))


def install() -> None:
    """Call once after the wheel is loaded — assigns
    `window.WISING.analyze`/`window.WISING.normalize`. Idempotent: safe to
    call again (e.g. after a hot-reload during development)."""
    existing = getattr(js.window, "WISING", None)
    wising = existing if existing is not None else js.Object.new()
    wising.analyze = analyze_for_js
    wising.normalize = normalize_for_js
    js.window.WISING = wising
