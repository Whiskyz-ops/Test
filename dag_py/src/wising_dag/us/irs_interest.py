"""Interest on a deferred tax at the IRS underpayment rate, compounded daily.
Mirror of prototypes/graph-pilot/irs-interest.js (see its header)."""
from __future__ import annotations

import datetime as _dt

from ..core.util import js_round

# Underpayment rate (%), by year, quarters 1-4 (IRS "Quarterly interest rates", 2 Oct 2026).
RATES = {
    2017: [4.0, 4.0, 4.0, 4.0],
    2018: [4.0, 5.0, 5.0, 5.0],
    2019: [6.0, 6.0, 5.0, 5.0],
    2020: [5.0, 5.0, 3.0, 3.0],
    2021: [3.0, 3.0, 3.0, 3.0],
    2022: [3.0, 4.0, 5.0, 6.0],
    2023: [7.0, 7.0, 7.0, 8.0],
    2024: [8.0, 8.0, 8.0, 8.0],
    2025: [7.0, 7.0, 7.0, 7.0],
    2026: [7.0, 6.0, 7.0, 7.0],
}
FIRST_YEAR, LAST_YEAR = 2017, 2026


def _leap(y):
    return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0


def interest(principal, frm, to) -> dict:
    if not principal > 0:
        return {"interestUsd": 0, "beforeTable": False, "assumedAfter": False}
    if frm[0] < FIRST_YEAR:
        return {"interestUsd": None, "beforeTable": True, "assumedAfter": False}
    d, end, bal, assumed = _dt.date(*frm), _dt.date(*to), principal, False
    one = _dt.timedelta(days=1)
    while d < end:
        if d.year > LAST_YEAR:
            rate, assumed = RATES[LAST_YEAR][3], True
        else:
            rate = RATES[d.year][(d.month - 1) // 3]
        bal = bal * (1 + rate / 100 / (366 if _leap(d.year) else 365))
        d += one
    return {"interestUsd": js_round((bal - principal) * 100) / 100, "beforeTable": False, "assumedAfter": assumed}
