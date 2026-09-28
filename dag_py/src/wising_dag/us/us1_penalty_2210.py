"""underpayment_2210 (US-1) — Form 2210 estimated-tax underpayment penalty.
Port of prototypes/graph-pilot/us1-nodes.js.

`usTotalTaxBeforeFtcUsdBoundary`/`usAgiUsdBoundary`/`usFtcAllowedUsdBoundary`
are EXPLICIT BOUNDARY INPUTS (read `ctx["computed"]...`, which doesn't
exist in the real ctx shape) — closed in `core/orchestration.py`, which
overrides all three to the real `usTaxResult`/`ftcResult` values now that
both are in the registry.
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


def _us_underpayment_periods(d, ctx):
    # §6654 regular method on the running shortfall — see us1-nodes.js.
    est = [d["usEstQ1Usd"], d["usEstQ2Usd"], d["usEstQ3Usd"], d["usEstQ4Usd"]]
    rate, months = [0.07, 0.06, 0.07, 0.07], [2, 3, 4, 3]
    cum_required = cum_paid = 0.0
    out = []
    for i, e in enumerate(est):
        cum_required += d["usRequiredUsd"] / 4
        cum_paid += d["usWithholdingTotalUsd"] / 4 + e
        out.append({"quarter": i + 1, "requiredUsd": d["usRequiredUsd"] / 4, "paidUsd": d["usWithholdingTotalUsd"] / 4 + e,
                    "shortUsd": max(0.0, cum_required - cum_paid), "rate": rate[i], "months": months[i]})
    return out


def _us_2210_penalty_usd(d, ctx):
    if d["usUnderpaymentExempt"]:
        return 0.0
    return sum(p["shortUsd"] * p["rate"] * p["months"] / 12 for p in d["usUnderpaymentPeriods"])


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

    "usUnderpaymentPeriods": NodeDef(
        deps=("usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"),
        compute=_us_underpayment_periods,
    ),
    # §6654(e)(1): no penalty when this year's tax less withholding is under $1,000.
    "usUnderpaymentExempt": NodeDef(deps=("usTotalTaxUsd", "usWithholdingTotalUsd"), compute=lambda d, ctx: d["usTotalTaxUsd"] - d["usWithholdingTotalUsd"] < 1000),
    "us2210PenaltyUsd": NodeDef(
        deps=("hasUsScope", "usUnderpaymentExempt", "usUnderpaymentPeriods"),
        scope_gate="hasUsScope", out_of_scope_value=0,
        compute=_us_2210_penalty_usd,
    ),
    "shouldFire": NodeDef(
        deps=("hasUsScope", "us2210PenaltyUsd"),
        scope_gate="hasUsScope", out_of_scope_value=False,
        compute=lambda d, ctx: d["us2210PenaltyUsd"] > 0,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
