#!/usr/bin/env python3
"""One-shot CLI wrapper around `wising_dag.analyze.analyze_with_extras()` —
reads a single {router, india, us, monitorAsOf?} JSON object from stdin,
writes the full result (analyze()'s own contract, plus checksRegistry/
calendarAmounts) as JSON to stdout.

Exists so a Node harness (no Pyodide involved — this runs under plain
CPython) can differential-test the Python DAG against the JS DAG per
profile, by spawning this script once per profile — see
prototypes/graph-pilot/run-js-dag-vs-py-dag.js. `analyze()` itself already
runs in well under a second per call; a single stdin/stdout round trip per
profile is simpler and plenty fast for the ~50-profile fixture+corpus set
this harness runs over, no persistent-process protocol needed.

`analyze_with_extras`, not the plain `analyze` — checksRegistry/
calendarAmounts are monitor-next-adapter-only fields (no analyze.js/engine
equivalent — see that function's own docstring), but cross-checking them
against the real JS DAG's own dag-adapter.js-equivalent output is exactly
what this harness is for, so the CLI always includes them; the extra two
keys are simply additional surface run-js-dag-vs-py-dag.js can choose to
compare or ignore.

`monitorAsOf` is passed straight through to `analyze()`'s own opts (an
ISO-8601 string or omitted) so both sides can be pinned to the same
instant for a fair monitoring/calendar comparison, same discipline as
test_analyze_golden.py's own `monitorAsOf` pinning.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from wising_dag.analyze import analyze_with_extras  # noqa: E402


def _json_default(obj):
    if isinstance(obj, datetime):
        # Explicit zero-padded fields, not strftime's platform-dependent %Y
        # (glibc doesn't zero-pad below 4 digits, e.g. year 895 -> "895-...",
        # while JS's toISOString() always zero-pads to 4 -> "0895-...") —
        # only reachable via a fuzzer-mutated year, but the correct ISO-8601
        # format regardless of year magnitude.
        return f"{obj.year:04d}-{obj.month:02d}-{obj.day:02d}T{obj.hour:02d}:{obj.minute:02d}:{obj.second:02d}.{obj.microsecond // 1000:03d}Z"
    raise TypeError(f"not JSON serializable: {type(obj)}")


# Python's json.dump writes a bare `Infinity`/`-Infinity` token for a
# float('inf')/-inf value (e.g. the top bracket's "to" field in
# TRUST_ESTATE_BRACKETS/US ordinary brackets' own bracket_breakdown) — valid
# per Python's own json module, but not standard JSON, so Node's JSON.parse
# rejects it outright. Only ever reached in dag_py's own real output when a
# bracket breakdown's top ("no upper bound") bracket gets embedded verbatim
# (found via the trust-retained-income manual-cases profile — no earlier
# fixture/corpus profile's taxable income ever reached a top bracket in a
# JSON-serialized field). Purely a test-harness/CLI concern, not a real
# production issue: the actual browser adapter (pyodide.ffi.to_js) crosses
# the JS boundary directly, never through a JSON string, so a real
# float('inf') becomes a real JS Infinity with no round-trip needed at all.
# Sanitized here to a string sentinel before dump; run-js-dag-vs-py-dag.js's
# own runPyDag() converts it back after JSON.parse.
_INFINITY_SENTINEL = "__PY_INFINITY__"
_NEG_INFINITY_SENTINEL = "__PY_NEG_INFINITY__"


def _sanitize_infinities(obj):
    if isinstance(obj, float):
        if obj == float("inf"):
            return _INFINITY_SENTINEL
        if obj == float("-inf"):
            return _NEG_INFINITY_SENTINEL
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_infinities(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_infinities(v) for v in obj]
    return obj


def main() -> None:
    opts = json.loads(sys.stdin.read())
    result = analyze_with_extras(opts)
    json.dump(_sanitize_infinities(result), sys.stdout, default=_json_default)


if __name__ == "__main__":
    main()
