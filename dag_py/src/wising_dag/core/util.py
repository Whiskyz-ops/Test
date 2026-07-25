"""Small helpers shared by every domain module — ports of the `num()`/
`safe()` helpers duplicated at the top of most *-nodes.js files."""
from __future__ import annotations

from typing import Any


def num(v: Any) -> float:
    """Port of JS `num(v)`: Number(v), NaN -> 0."""
    if v is None or isinstance(v, bool):
        return 0.0 if v is None else float(v)
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if n != n else n  # n != n is Python's NaN check


def safe(obj: Any, path: str, default: Any = None) -> Any:
    """Port of JS `safe(obj, path, dflt)`: walks a dotted path, returning
    `default` if any level along the way is missing/None."""
    cur = obj
    for part in path.split("."):
        if cur is None:
            return default
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            cur = getattr(cur, part, None)
    return default if cur is None else cur
