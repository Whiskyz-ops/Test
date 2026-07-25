"""underpayment_2210 (US-1) — Form 2210 estimated-tax underpayment penalty.
Port of prototypes/graph-pilot/us1-nodes.js.

`usTotalTaxBeforeFtcUsdBoundary`/`usAgiUsdBoundary`/`usFtcAllowedUsdBoundary`
are EXPLICIT BOUNDARY INPUTS (read `ctx["computed"]...`, which doesn't
exist in the real ctx shape) — closed later once usTaxResult/ftcResult are
wired into the final graph (the Python equivalent of agg10-nodes.js's
`assessedTaxInrBoundary`-style overrides, deferred to Phase 7's analyze()
assembly, same as core/entry.py's own header documents for the India side).
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import num, safe


def _router_us_signal(ctx) -> bool:
    router = ctx.get("router")
    return (
        num(safe(router, "us_days", 0)) > 0 or safe(router, "is_us_citizen", False) is True or
        safe(router, "has_green_card", False) is True or safe(router, "has_us_source_income_or_assets", False) is True
    )


def _us_2210_penalty_usd(d, ctx):
    if not (d["usBalanceDueUsd"] > 1000) or not (d["usPaidTotalUsd"] < d["usRequiredUsd"]):
        return 0.0
    per_q_withholding_usd = d["usWithholdingTotalUsd"] / 4
    rate = {"q1": 0.07, "q2": 0.06, "q3": 0.07, "q4": 0.07}
    est_by_q = {"q1": d["usEstQ1Usd"], "q2": d["usEstQ2Usd"], "q3": d["usEstQ3Usd"], "q4": d["usEstQ4Usd"]}
    months_remaining = {"q1": 12, "q2": 10, "q3": 7, "q4": 3}
    penalty_usd = 0.0
    for q in ("q1", "q2", "q3", "q4"):
        required_usd = d["usRequiredUsd"] / 4
        paid_usd = per_q_withholding_usd + est_by_q[q]
        short_usd = max(0.0, required_usd - paid_usd)
        penalty_usd += short_usd * rate[q] * (months_remaining[q] / 12)
    return penalty_usd


NODES = {
    "routerJurisdiction": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "jurisdiction", None), layer1_fields=("router.jurisdiction",)),
    "routerUsSignal": NodeDef(
        deps=(), compute=lambda d, ctx: _router_us_signal(ctx),
        layer1_fields=("router.us_days", "router.is_us_citizen", "router.has_green_card", "router.has_us_source_income_or_assets"),
    ),
    "hasUsScope": NodeDef(
        deps=("routerJurisdiction", "routerUsSignal"),
        compute=lambda d, ctx: (
            False if d["routerJurisdiction"] in ("single_india", "india_only") else
            True if d["routerJurisdiction"] in ("single_us", "us_only") else d["routerUsSignal"]
        ),
    ),

    "usWithholdingTotalUsd": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.federal_withholding_total_usd", 0)), layer1_fields=("us.withholding_and_estimated.federal_withholding_total_usd",)),
    "usEstQ1Usd": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.estimated_tax_q1_apr15_usd", 0)), layer1_fields=("us.withholding_and_estimated.estimated_tax_q1_apr15_usd",)),
    "usEstQ2Usd": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.estimated_tax_q2_jun15_usd", 0)), layer1_fields=("us.withholding_and_estimated.estimated_tax_q2_jun15_usd",)),
    "usEstQ3Usd": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.estimated_tax_q3_sep15_usd", 0)), layer1_fields=("us.withholding_and_estimated.estimated_tax_q3_sep15_usd",)),
    "usEstQ4Usd": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "withholding_and_estimated.estimated_tax_q4_jan15_usd", 0)), layer1_fields=("us.withholding_and_estimated.estimated_tax_q4_jan15_usd",)),
    "usPriorYearTaxUsdRaw": NodeDef(
        deps=(), compute=lambda d, ctx: (lambda v: None if v is None else num(v))(safe(ctx.get("us"), "withholding_and_estimated.prior_year_total_tax_usd", None)),
        layer1_fields=("us.withholding_and_estimated.prior_year_total_tax_usd",),
    ),

    "usTotalTaxBeforeFtcUsdBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "computed.usTax.totalTaxBeforeFtcUsd", None))),
    "usAgiUsdBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "computed.usTax.agiUsd", None))),
    "usFtcAllowedUsdBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "computed.ftc.us.ftcAllowedUsd", None))),

    "usPaidTotalUsd": NodeDef(
        deps=("usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"),
        compute=lambda d, ctx: d["usWithholdingTotalUsd"] + d["usEstQ1Usd"] + d["usEstQ2Usd"] + d["usEstQ3Usd"] + d["usEstQ4Usd"],
    ),
    "usTotalTaxUsd": NodeDef(deps=("usTotalTaxBeforeFtcUsdBoundary", "usFtcAllowedUsdBoundary"), compute=lambda d, ctx: max(0.0, d["usTotalTaxBeforeFtcUsdBoundary"] - d["usFtcAllowedUsdBoundary"])),
    "usCurrentHarborUsd": NodeDef(deps=("usTotalTaxUsd",), compute=lambda d, ctx: d["usTotalTaxUsd"] * 0.9),
    "usPriorHarborPct": NodeDef(deps=("usAgiUsdBoundary",), compute=lambda d, ctx: 1.10 if d["usAgiUsdBoundary"] > 150000 else 1.00),
    "usPriorHarborUsd": NodeDef(deps=("usPriorYearTaxUsdRaw", "usPriorHarborPct"), compute=lambda d, ctx: d["usPriorYearTaxUsdRaw"] * d["usPriorHarborPct"] if d["usPriorYearTaxUsdRaw"] is not None else None),
    "usRequiredUsd": NodeDef(deps=("usCurrentHarborUsd", "usPriorHarborUsd"), compute=lambda d, ctx: min(d["usCurrentHarborUsd"], d["usPriorHarborUsd"]) if d["usPriorHarborUsd"] is not None else d["usCurrentHarborUsd"]),
    "usBalanceDueUsd": NodeDef(deps=("usTotalTaxUsd", "usPaidTotalUsd"), compute=lambda d, ctx: d["usTotalTaxUsd"] - d["usPaidTotalUsd"]),

    "us2210PenaltyUsd": NodeDef(
        deps=("hasUsScope", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"),
        scope_gate="hasUsScope", out_of_scope_value=0,
        compute=_us_2210_penalty_usd,
    ),
    "shouldFire": NodeDef(
        deps=("hasUsScope", "us2210PenaltyUsd", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd"),
        scope_gate="hasUsScope", out_of_scope_value=False,
        compute=lambda d, ctx: d["usBalanceDueUsd"] > 1000 and d["usPaidTotalUsd"] < d["usRequiredUsd"],
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
