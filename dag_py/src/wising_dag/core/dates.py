"""Small date helpers shared by india/us node modules — ports of the
monthsBetween()/date-window helpers duplicated across several *-nodes.js
files. Not a general-purpose date library; only what the tax computations
actually need."""
from __future__ import annotations

from datetime import datetime
from typing import Any


def parse_date(s: Any) -> datetime | None:
    """Port of JS `new Date(str)` for the ISO-ish date strings Layer 1
    actually stores; returns None where JS would produce an Invalid Date."""
    if not s or not isinstance(s, str):
        return None
    text = s.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        try:
            return datetime.strptime(text, "%Y-%m-%d")
        except ValueError:
            return None


def months_between(from_str: Any, to_str: Any) -> float | None:
    """Port of monthsBetween(fromStr, toStr): (b - a) in days / 30.436875."""
    a = parse_date(from_str)
    b = parse_date(to_str)
    if a is None or b is None:
        return None
    return (b - a).total_seconds() / 86400.0 / 30.436875


def is_under_180_days_addition_inr(addition_date_str: Any) -> bool:
    """Port of isUnder180DaysAdditionInr: True if the asset addition falls
    within the last ~180 days of the fiscal year (Oct 4 - Mar 31), which
    triggers half-year depreciation."""
    d = parse_date(addition_date_str)
    if d is None:
        return False
    month, day = d.month, d.day  # Python month is 1-indexed (JS getMonth() is 0-indexed)
    return (month == 10 and day >= 4) or month > 10 or month <= 3
