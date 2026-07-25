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


def format_inr(n: float) -> str:
    """Port of `Math.round(n).toLocaleString("en-IN")`: Indian digit
    grouping (last 3 digits, then pairs) — e.g. 5000000 -> "50,00,000",
    not the Western "5,000,000" Python's `:,` format would produce."""
    rounded = round(n)
    sign = "-" if rounded < 0 else ""
    s = str(abs(int(rounded)))
    if len(s) <= 3:
        return sign + s
    last3 = s[-3:]
    rest = s[:-3]
    parts: list[str] = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.insert(0, rest)
    return sign + ",".join(parts) + "," + last3


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
