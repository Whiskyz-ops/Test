"""Shared FX-rate resolution — port of prototypes/graph-pilot/fx-util.js.

Default matches archive/engine-frozen/constants.js's CONST.FX.INR_PER_USD
(83.0 INR/USD). ctx.fx_rate_override (set by the what-if tool) re-prices
every INR<->USD conversion in the graph from this one place; with no
override present, behavior is byte-identical to the bare literal.
"""
from __future__ import annotations

DEFAULT_FX_RATE = 83.0


def fx_rate(ctx: dict) -> float:
    v = ctx.get("fxRateOverride") if ctx else None
    if v is None:
        return DEFAULT_FX_RATE
    try:
        n = float(v)
    except (TypeError, ValueError):
        return DEFAULT_FX_RATE
    return n if n > 0 else DEFAULT_FX_RATE
