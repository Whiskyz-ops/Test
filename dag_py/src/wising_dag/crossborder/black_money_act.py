"""black_money_act_exposure (XB-7) finding. Port of
prototypes/graph-pilot/xb7-nodes.js.

`accountsBoundary`/`usSourceTotalUsdBoundary` are EXPLICIT BOUNDARY INPUTS
(read `ctx["model"]...`) — closed later once filings/assets.py (accounts)
and reports/assembly.py exist (Phase 6/7), same deferred-boundary discipline
used throughout this port; their real agg10-nodes.js closures need
bankAccountsRaw (crossborder/findings.py) / aggregateUsIncomeResult (us
domain), genuinely cross-domain data this file's own build() doesn't compose.

`usSecuritiesBoundary` is NOT one of those — xb7-nodes.js's own v1-era stub
read `ctx["model"].assets.usSecurities`, but that's dead build history
(xb7-nodes.js is never required by the live graph.js chain); agg10-nodes.js's
real closure (`safe(ctx.us, "financial_holdings", [])`) needs nothing but
ctx["us"] itself, so it's ported as a real leaf here rather than deferred.
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


def _bma_asset_value_usd(d, ctx):
    total = sum(h.get("peak_balance_usd") or 0 for h in (d["usSecuritiesBoundary"] or []))
    total += sum((a.get("peak") or {}).get("usd") or 0 for a in (d["accountsBoundary"] or []) if a.get("country") != "India")
    return total


NODES = {
    "routerJurisdiction": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "jurisdiction", None), layer1_fields=("router.jurisdiction",)),
    "routerUsSignal": NodeDef(
        deps=(), compute=lambda d, ctx: _router_us_signal(ctx),
        layer1_fields=("router.us_days", "router.is_us_citizen", "router.has_green_card", "router.has_us_source_income_or_assets"),
    ),
    "hasIndiaScope": NodeDef(deps=("routerJurisdiction",), compute=lambda d, ctx: d["routerJurisdiction"] not in ("single_us", "us_only")),
    "hasUsScope": NodeDef(
        deps=("routerJurisdiction", "routerUsSignal"),
        compute=lambda d, ctx: (
            False if d["routerJurisdiction"] in ("single_india", "india_only") else
            True if d["routerJurisdiction"] in ("single_us", "us_only") else d["routerUsSignal"]
        ),
    ),

    "indiaResidencyStatusRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.final_india_residency_status", None), layer1_fields=("india.residency_detail.final_india_residency_status",)),
    "indiaForeignAssetsDeclaredRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "foreign_assets.has_foreign_assets", None), layer1_fields=("india.foreign_assets.has_foreign_assets",)),

    "accountsBoundary": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.accounts.accounts", None) or []),
    "usSourceTotalUsdBoundary": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "model.income.us.usSourceTotal.usd", None))),
    "usSecuritiesBoundary": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "financial_holdings", []) or [], layer1_fields=("us.financial_holdings",)),

    "isIndiaRor": NodeDef(deps=("indiaResidencyStatusRaw",), compute=lambda d, ctx: d["indiaResidencyStatusRaw"] == "ROR"),
    "usHasForeignToIndiaAssets": NodeDef(
        deps=("accountsBoundary", "usSourceTotalUsdBoundary"),
        compute=lambda d, ctx: any(a.get("country") != "India" for a in d["accountsBoundary"]) or d["usSourceTotalUsdBoundary"] > 0,
    ),

    "scheduleFaInconsistentTrigger": NodeDef(
        deps=("isIndiaRor", "indiaForeignAssetsDeclaredRaw", "usHasForeignToIndiaAssets"),
        compute=lambda d, ctx: d["isIndiaRor"] and d["indiaForeignAssetsDeclaredRaw"] is False and d["usHasForeignToIndiaAssets"],
    ),

    "bmaAssetValueUsd": NodeDef(
        deps=("scheduleFaInconsistentTrigger", "usSecuritiesBoundary", "accountsBoundary"),
        scope_gate="scheduleFaInconsistentTrigger", out_of_scope_value=0,
        compute=_bma_asset_value_usd,
    ),
    "bmaMaxTotalUsd": NodeDef(
        deps=("scheduleFaInconsistentTrigger", "bmaAssetValueUsd"),
        scope_gate="scheduleFaInconsistentTrigger", out_of_scope_value=0,
        compute=lambda d, ctx: (lambda tax: tax + tax * 3)(d["bmaAssetValueUsd"] * 0.30),
    ),
    "shouldFire": NodeDef(
        deps=("scheduleFaInconsistentTrigger", "bmaAssetValueUsd"),
        scope_gate="scheduleFaInconsistentTrigger", out_of_scope_value=False,
        compute=lambda d, ctx: d["bmaAssetValueUsd"] > 0,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
