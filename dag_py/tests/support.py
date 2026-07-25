"""Deep-equal comparator matching the tolerance discipline of the JS
run-*.js harnesses (prototypes/graph-pilot/run-report1.js etc.): numbers
within an absolute tolerance of 1 compare equal (INR/USD rounding noise),
everything else must match exactly. Returns a list of diff-description
strings, or None if equal."""
from __future__ import annotations

from typing import Any


def _close(a: float, b: float, tol: float = 1.0) -> bool:
    return abs(a - b) <= tol


def deep_diff(a: Any, b: Any, path: str = "$") -> list[str] | None:
    if isinstance(a, bool) or isinstance(b, bool):
        if a is b:
            return None
        return [f"{path}: {a!r} != {b!r}"]
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return None if _close(float(a), float(b)) else [f"{path}: {a} != {b}"]
    if a is None or b is None:
        return None if a == b else [f"{path}: {a!r} != {b!r}"]
    if isinstance(a, list) or isinstance(b, list):
        if not isinstance(a, list) or not isinstance(b, list) or len(a) != len(b):
            return [f"{path}: array length/type mismatch ({a!r} vs {b!r})"]
        diffs: list[str] = []
        for i, (x, y) in enumerate(zip(a, b)):
            d = deep_diff(x, y, f"{path}[{i}]")
            if d:
                diffs += d
        return diffs or None
    if isinstance(a, dict) or isinstance(b, dict):
        if not isinstance(a, dict) or not isinstance(b, dict):
            return [f"{path}: {a!r} != {b!r} (dict type mismatch)"]
        diffs = []
        for k in sorted(set(a) | set(b)):
            d = deep_diff(a.get(k), b.get(k), f"{path}.{k}")
            if d:
                diffs += d
        return diffs or None
    if a == b:
        return None
    return [f"{path}: {a!r} != {b!r}"]
