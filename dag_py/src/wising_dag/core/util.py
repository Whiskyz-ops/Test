"""Small helpers shared by every domain module — ports of the `num()`/
`safe()` helpers duplicated at the top of most *-nodes.js files."""
from __future__ import annotations

import math
from typing import Any


def js_round(n: float) -> int:
    """Port of JS `Math.round(n)` — round HALF AWAY FROM ZERO (always
    towards +Infinity on an exact .5, per MDN), NOT Python's builtin
    `round()`, which uses round-half-to-even ("banker's rounding"). The two
    only diverge on an exact .5 boundary (`round(14636.5) == 14636` in
    Python vs `Math.round(14636.5) == 14637` in JS) — rare for a tax
    computation's output, but real: found via a hand-authored trust-
    retained-income fixture (`dag_py/tests/fixtures/manual-cases/`) whose
    bracket tax landed exactly on .5, previously never hit by any fixture
    or fuzz-corpus profile. Every currency-display helper in this port
    (`format_usd`/`format_inr` below, and their many per-file `_usd`/`_inr`
    duplicates) must round through this, not the bare builtin, to match
    JS's actual rounding behavior exactly. `math.floor(n + 0.5)` is the
    textbook "round half up" formula, and it happens to reproduce
    `Math.round`'s specific "always towards +Infinity on .5" behavior
    exactly for every sign, verified against Node directly."""
    return math.floor(n + 0.5)


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
    rounded = js_round(n)
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


def format_usd(n: float) -> str:
    """Port of `"$" + Math.round(n).toLocaleString("en-US")` — Western
    digit grouping (unlike format_inr's Indian grouping), used for every
    USD amount embedded in finding text."""
    return f"${js_round(n):,}"


def js_num_str(n: float) -> str:
    """Port of JS's implicit Number-to-string coercion (`n + "some text"`,
    template-literal interpolation): JS's `Number.prototype.toString()`
    omits the decimal point entirely for an integer-valued number (`650`,
    never `650.0`), where Python's `str()`/f-string interpolation of a
    `float` always includes one. Both languages otherwise produce the same
    shortest-round-trip decimal digit sequence for a non-integer value
    (`650.38` in both) — found via a fuzz-corpus profile whose mutated
    day-count field landed on a genuine fraction, surfacing this port's
    several `f"{some_float_days_field}"` call sites (day counts, director
    counts) that had never hit a non-integer value before. Not the same bug
    class as `js_round`: those sites (`Math.round(...)` in the JS source)
    need the VALUE rounded; these sites have no `Math.round` in the JS
    source at all — they must show the raw value's own natural string
    form, fractional or not, not a rounded one.

    `None` (JS `null`) maps to the literal string `"null"`, not Python's
    `"None"` — JS's `+`/template-literal string coercion of `null` produces
    `"null"` (found via a fuzz-corpus profile whose asset had no
    `placed_in_service_date`, so `assetRecoveryYearN` legitimately returns
    `null` — a real value, not a crash — and the JS trace label shows
    "yr null" verbatim)."""
    if n is None:
        return "null"
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)


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
