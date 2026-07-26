"""computeApportionment — FY-vs-CY tax-year apportionment. Port of
prototypes/graph-pilot/apportionment-nodes.js.

Later overridden by an entity-aware version in `us/ustax_full.py`
(`_apportionment_result_entity_aware`, composed after this module) — this
file ports the base, non-entity-aware version, which is what the JS
composition order actually builds first too.
"""
from __future__ import annotations

from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.registry import NodeRegistry
from ..core.util import js_round, num, safe
from ..india import aggregate_india_income
from ..us import aggregate_us_income


def _inr_to_usd(inr, ctx) -> float:
    return num(inr) / fx_rate(ctx)


def _apportionment_india_quarterly_usd_raw(d, ctx):
    q = safe(ctx.get("india"), "quarters", None)
    if not q:
        return None
    out = []
    for k in ("Q1", "Q2", "Q3", "Q4"):
        qd = q.get(k) or {}
        di, os_, cg = qd.get("domestic_income") or {}, qd.get("other_sources") or {}, qd.get("capital_gains") or {}
        out.append(_inr_to_usd(
            num(safe(di, "salary.taxable_salary_inr", 0)) + num(safe(di, "salary.gross_salary_inr", 0)) +
            num(safe(os_, "interest_inr", 0)) + num(safe(os_, "dividend_inr", 0)) +
            num(safe(cg, "stcg_111a_inr", 0)) + num(safe(cg, "ltcg_112a_inr", 0)),
            ctx,
        ))
    return out


def _apportionment_result(d, ctx):
    base_year = d["apportionmentBaseYearRaw"]
    q = d["apportionmentIndiaQuarterlyUsdRaw"]
    has_q = bool(q and any(x > 0 for x in q))
    india_fy_total = d["indiaTotalIncomeUsdForApportionment"]
    if has_q:
        q_tot = (q[0] + q[1] + q[2] + q[3]) or india_fy_total or 1
        primary_share = (q[0] + q[1] + q[2]) / q_tot
        next_share = q[3] / q_tot
    else:
        primary_share, next_share = 0.75, 0.25  # 9 months (Apr-Dec) vs 3 (Jan-Mar)
    us_cy_total = d["aggregateUsIncomeResult"]["usSourceTotal"]["usd"]
    return {
        "basis": "Indian quarterly data" if has_q else "even-earning assumption (Apr–Dec vs Jan–Mar)",
        "fyLabel": f"FY {base_year}–{str(base_year + 1)[2:]}",
        "cyPrimary": base_year, "cyNext": base_year + 1,
        "indiaFyTotalUsd": india_fy_total,
        "indiaToCyPrimaryUsd": js_round(india_fy_total * primary_share),
        "indiaToCyNextUsd": js_round(india_fy_total * next_share),
        "primaryShare": primary_share, "nextShare": next_share,
        "usCyTotalUsd": us_cy_total,
        "usCyToFyPrimaryUsd": js_round(us_cy_total * 9 / 12),
        "usCyToFyNextUsd": js_round(us_cy_total * 3 / 12),
    }


def build(base: NodeRegistry) -> NodeRegistry:
    r = base.extend()
    r = aggregate_india_income.build(r)
    r = aggregate_us_income.build(r)

    r.register("apportionmentBaseYearRaw", NodeDef(
        # int(), not float — this is a literal tax year used in string labels
        # (fyLabel); JS Number() displays a whole value like 2025 without a
        # trailing ".0", so num()'s always-float return needs an explicit
        # int cast here to match, same as every other "year" field in this port.
        deps=(), compute=lambda d, ctx: int(num(safe(ctx.get("router"), "base_tax_year", safe(ctx.get("us"), "metadata.us_calendar_year", 2025))) or 2025),
        layer1_fields=("router.base_tax_year", "us.metadata.us_calendar_year"),
    ))
    r.register("apportionmentIndiaQuarterlyUsdRaw", NodeDef(
        deps=(), compute=_apportionment_india_quarterly_usd_raw,
        layer1_fields=(
            "india.quarters[].domestic_income.salary.taxable_salary_inr", "india.quarters[].domestic_income.salary.gross_salary_inr",
            "india.quarters[].other_sources.interest_inr", "india.quarters[].other_sources.dividend_inr",
            "india.quarters[].capital_gains.stcg_111a_inr", "india.quarters[].capital_gains.ltcg_112a_inr",
        ),
    ))
    r.register("indiaTotalIncomeUsdForApportionment", NodeDef(deps=("totalIndiaIncomeInr",), compute=lambda d, ctx: _inr_to_usd(d["totalIndiaIncomeInr"], ctx)))
    r.register("apportionmentResult", NodeDef(
        deps=("apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "aggregateUsIncomeResult"),
        compute=_apportionment_result,
    ))
    return r
