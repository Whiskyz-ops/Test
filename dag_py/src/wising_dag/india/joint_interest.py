"""Audit row F8 — interest on bank accounts / FDs held jointly with the spouse.
Mirror of jointAccountInterestShareInr (aggregateindiaincome-nodes.js,
in1-nodes-v3.js)."""
from __future__ import annotations

from ..core.util import num, safe


def joint_account_interest_share_inr(os_, india=None) -> float:
    """Audit row F8: interest on accounts / FDs held jointly with the spouse is
    taxed to whoever's money it is — the full interest credited times this
    person's share of the money deposited (100 when not entered)."""
    total = num(safe(os_, "joint_account_interest_inr", 0))
    if not total > 0:
        return 0.0
    # A percentage is never summed across quarterly slices: the profile's own
    # other_sources value first.
    pct = safe(india, "other_sources.joint_account_own_share_percent", None)
    if pct is None:
        pct = safe(os_, "joint_account_own_share_percent", None)
    try:
        pct = float(pct) if pct not in (None, "") else 100.0
    except (TypeError, ValueError):
        pct = 100.0
    if pct != pct or pct in (float("inf"), float("-inf")):
        pct = 100.0
    return total * min(100.0, max(0.0, pct)) / 100
