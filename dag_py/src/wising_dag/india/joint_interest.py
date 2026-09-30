"""Audit row F8 — India bank accounts / FDs held jointly with the spouse.
Mirror of prototypes/graph-pilot/joint-account.js (see its header for the
rule 37BA(2) TDS-credit rule)."""
from __future__ import annotations

from ..core.util import num, safe


def joint_account_interest_share_inr(os_, india=None) -> float:
    """Audit row F8: interest on accounts / FDs held jointly with the spouse is
    taxed to whoever's money it is — the full interest credited times this
    person's share of the money deposited (100 when not entered)."""
    total = num(safe(os_, "joint_account_interest_inr", 0))
    if not total > 0:
        return 0.0
    return total * joint_account_share_pct(india, os_) / 100


def joint_account_share_pct(india, os_=None) -> float:
    # A percentage is never summed across quarterly slices: the profile's own
    # other_sources value first.
    pct = safe(india, "other_sources.joint_account_own_share_percent", None)
    if pct is None and os_ is not None:
        pct = safe(os_, "joint_account_own_share_percent", None)
    try:
        pct = float(pct) if pct not in (None, "") else 100.0
    except (TypeError, ValueError):
        pct = 100.0
    if pct != pct or pct in (float("inf"), float("-inf")):
        pct = 100.0
    return min(100.0, max(0.0, pct))


def joint_account_tds_credit_inr(india) -> float:
    """TDS on joint-account interest: by share once the rule 37BA(2)
    declaration is filed; otherwise all of it to the first holder."""
    tds = num(safe(india, "tax_credits.joint_account_tds_inr", 0))
    if not tds > 0:
        return 0.0
    declared = safe(india, "tax_credits.joint_account_tds_37ba_declared", None) is True
    first = safe(india, "tax_credits.joint_account_first_holder", None)
    if not declared and first == "self":
        return tds
    if not declared and first == "spouse":
        return 0.0
    return tds * joint_account_share_pct(india) / 100
