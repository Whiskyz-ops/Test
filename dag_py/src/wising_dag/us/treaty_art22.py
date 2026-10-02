"""DTAA Art. 22 (teachers and researchers) and the saving clause's
exception for it. Mirror of prototypes/graph-pilot/treaty-art22.js (see its header)."""
from __future__ import annotations

import datetime as _dt
import re

from ..core.util import num


def _ymd(s):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(s or ""))
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def _day_no(y, m, d):
    # Days since 1970-01-01, like JS Date.UTC / 86400000 (rolls over an invalid day the same way).
    base = _dt.date(y, m, 1)
    return (base - _dt.date(1970, 1, 1)).days + (d - 1)


def art22(us, base_year):
    r = ((us or {}).get("us_residency_detail") or {}) if isinstance(us, dict) else {}
    if r.get("article_22_claim") is not True:
        return None
    claimed_usd = max(0.0, num(r.get("article_22_exempt_wages_usd")))
    blocked_by = "citizen" if r.get("is_us_citizen") is True else ("green_card" if r.get("has_green_card") is True else None)
    try:
        y = int(float(base_year)) if base_year else 2026
    except (TypeError, ValueError):
        y = 2026
    y = y or 2026
    a = _ymd(r.get("article_22_arrival_date"))
    fraction, window_end = 1.0, None
    if a:
        start, end = _day_no(y, 1, 1), _day_no(y + 1, 1, 1)
        frm, to = max(start, _day_no(*a)), min(end, _day_no(a[0] + 2, a[1], a[2]))
        fraction = max(0, to - frm) / (end - start)
        window_end = f"{a[0] + 2}-{a[1]:02d}-{a[2]:02d}"
    return {"claimedUsd": claimed_usd, "fraction": fraction, "exemptUsd": 0 if blocked_by else claimed_usd * fraction, "blockedBy": blocked_by,
            "arrivalDate": str(r.get("article_22_arrival_date"))[:10] if a else None, "windowEnd": window_end}


def base_year_of(router, us):
    """The engine's base year (metaResult.baseYear): router first, then the US form's calendar year."""
    r = router if isinstance(router, dict) else {}
    u = us if isinstance(us, dict) else {}
    y = r.get("base_tax_year")
    if y is None:
        y = (u.get("metadata") or {}).get("us_calendar_year")
    if y is None:
        y = 2025
    return int(num(y)) or 2025
