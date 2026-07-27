"""early_withdrawal_penalty_72t (US-5) — flat 10% early-retirement-
distribution penalty. Port of prototypes/graph-pilot/us5-nodes.js.

`baseYear` is an EXPLICIT BOUNDARY INPUT (reads `ctx["model"]...`) —
closed in `core/orchestration.py`, which overrides it to the real
`metaResult["baseYear"]`. This one was missed in that file's original
closure pass (a distinct id from `baseYearUs`, which WAS closed there from
the start) — found and fixed via `run-js-dag-vs-py-dag.js`'s cross-check
against the real JS DAG (a taxpayer's age at year-end came out one year
too low for any base year other than 2025, the node's own hardcoded
fallback).
"""
from __future__ import annotations

from ..core.dates import parse_date
from ..core.graph import NodeDef
from ..core.util import num, safe


def _router_us_signal(ctx) -> bool:
    router = ctx.get("router")
    return (
        num(safe(router, "us_days", 0)) > 0 or safe(router, "is_us_citizen", False) is True or
        safe(router, "has_green_card", False) is True or safe(router, "has_us_source_income_or_assets", False) is True
    )


def _age_at_year_end_us(d, ctx):
    if not d["dobRaw"]:
        return None
    dob = parse_date(d["dobRaw"])
    if dob is None:
        return None
    base_year = d["baseYear"] or 2025
    year_end = parse_date(f"{base_year}-12-31")  # 31 Dec — US calendar year-end, distinct from IN-1's FY-end
    age = year_end.year - dob.year
    if (year_end.month, year_end.day) < (dob.month, dob.day):
        age -= 1
    return age


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

    "iraDistUsdRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "income_us_source.ira_distributions_usd", 0)), layer1_fields=("us.income_us_source.ira_distributions_usd",)),
    "dist401kUsdRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "income_us_source.401k_distributions_usd", 0)), layer1_fields=("us.income_us_source.401k_distributions_usd",)),
    "dobRaw": NodeDef(
        deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "date_of_birth", safe(ctx.get("india"), "profile.date_of_birth", safe(ctx.get("us"), "profile.date_of_birth", None))),
        layer1_fields=("router.date_of_birth", "india.profile.date_of_birth", "us.profile.date_of_birth"),
    ),
    "baseYear": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.meta.baseYear", None)),

    "earlyDistUsd": NodeDef(deps=("iraDistUsdRaw", "dist401kUsdRaw"), compute=lambda d, ctx: d["iraDistUsdRaw"] + d["dist401kUsdRaw"]),
    "ageAtYearEndUs": NodeDef(deps=("dobRaw", "baseYear"), compute=_age_at_year_end_us),

    "penalty72tUsd": NodeDef(
        deps=("hasUsScope", "earlyDistUsd", "ageAtYearEndUs"), scope_gate="hasUsScope", out_of_scope_value=0,
        compute=lambda d, ctx: d["earlyDistUsd"] * 0.10 if (d["earlyDistUsd"] > 0 and d["ageAtYearEndUs"] is not None and d["ageAtYearEndUs"] < 59) else 0,
    ),
    "shouldFire": NodeDef(
        deps=("hasUsScope", "earlyDistUsd", "ageAtYearEndUs"), scope_gate="hasUsScope", out_of_scope_value=False,
        compute=lambda d, ctx: d["earlyDistUsd"] > 0 and d["ageAtYearEndUs"] is not None and d["ageAtYearEndUs"] < 59,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
