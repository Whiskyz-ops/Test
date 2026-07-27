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

    # ---- IRC §402(g) elective-deferral aggregate excess (Step 11 audit) -----
    # layer1_us.html's Step 11 ("Retirement Accounts") collects 401(k)/Roth
    # 401(k)/Solo 401(k) elective-deferral contributions, but none of it was
    # ever read by any DAG node -- feeding nothing downstream at all. Step 5's
    # own W-2 Box 12 codes D/E (401(k)/403(b) traditional deferral) and AA/BB
    # (Roth 401(k)/403(b) deferral) have the exact same problem: collected
    # per-W-2, never read. Both share the SAME §402(g) annual aggregate limit
    # across every plan a person contributes to, so they're combined here.
    # Mirrors prototypes/graph-pilot/us5-nodes.js exactly.
    "w2Box12ElectiveDeferralsUsd": NodeDef(
        deps=(), compute=lambda d, ctx: sum(
            num(b.get("amount_usd")) for w2 in (safe(ctx.get("us"), "income_us_source.wages_w2", []) or [])
            for b in (w2.get("box_12_benefits") or []) if str(b.get("code") or "").strip().lower() in ("d", "e", "aa", "bb")
        ),
        layer1_fields=("us.income_us_source.wages_w2",),
    ),
    "retirementAccountsRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "retirement_accounts", {}) or {}, layer1_fields=("us.retirement_accounts",)),
    "electiveDeferralAggregateUsd": NodeDef(
        deps=("w2Box12ElectiveDeferralsUsd", "retirementAccountsRaw"),
        compute=lambda d, ctx: d["w2Box12ElectiveDeferralsUsd"] + num(d["retirementAccountsRaw"].get("401k_employee_contribution_usd")) +
        num(d["retirementAccountsRaw"].get("roth_401k_contribution_usd")) + num(d["retirementAccountsRaw"].get("solo_401k_contribution_usd")),
    ),
    # 2026 figures (IRS Notice 2025-67 / Rev. Proc. 2025-32): base $24,500;
    # +$8,000 regular catch-up (50-59 and 64+); +$11,250 SECURE 2.0 §109
    # "super catch-up" (60-63 only, reverting to the regular catch-up at 64).
    "electiveDeferralLimitUsd": NodeDef(
        deps=("ageAtYearEndUs",),
        compute=lambda d, ctx: 24500 if (d["ageAtYearEndUs"] is None or d["ageAtYearEndUs"] < 50) else
        (35750 if 60 <= d["ageAtYearEndUs"] <= 63 else 32500),
    ),
    "electiveDeferralExcessUsd": NodeDef(
        deps=("hasUsScope", "electiveDeferralAggregateUsd", "electiveDeferralLimitUsd"), scope_gate="hasUsScope", out_of_scope_value=0,
        compute=lambda d, ctx: max(0, d["electiveDeferralAggregateUsd"] - d["electiveDeferralLimitUsd"]),
    ),

    # ---- IRC §219(b)(5) traditional + Roth IRA combined-contribution excess -
    "iraContributionAggregateUsd": NodeDef(
        deps=("retirementAccountsRaw",),
        compute=lambda d, ctx: num(d["retirementAccountsRaw"].get("traditional_ira_contribution_usd")) + num(d["retirementAccountsRaw"].get("roth_ira_contribution_usd")),
    ),
    # 2026: base $7,500; +$1,100 catch-up (50+, IRS Notice 2025-67).
    "iraContributionLimitUsd": NodeDef(
        deps=("ageAtYearEndUs",),
        compute=lambda d, ctx: 8600 if (d["ageAtYearEndUs"] is not None and d["ageAtYearEndUs"] >= 50) else 7500,
    ),
    "iraContributionExcessUsd": NodeDef(
        deps=("hasUsScope", "iraContributionAggregateUsd", "iraContributionLimitUsd"), scope_gate="hasUsScope", out_of_scope_value=0,
        compute=lambda d, ctx: max(0, d["iraContributionAggregateUsd"] - d["iraContributionLimitUsd"]),
    ),

    # ---- SECURE 2.0 RMD determination (Step 11 audit) ------------------------
    # Determination-only (age test, no fabricated dollar figure) -- no
    # traditional-account BALANCE field exists anywhere in the product, only
    # contribution amounts, so no real RMD $ amount can be computed. Matches
    # the same discipline already applied to the §877A covered-expatriate
    # exit tax.
    "rmdRequired": NodeDef(
        deps=("hasUsScope", "ageAtYearEndUs"), scope_gate="hasUsScope", out_of_scope_value=False,
        compute=lambda d, ctx: d["ageAtYearEndUs"] is not None and d["ageAtYearEndUs"] >= 73,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
