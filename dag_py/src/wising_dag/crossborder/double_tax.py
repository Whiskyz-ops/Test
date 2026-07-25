"""mapDoubleTaxedIncome — per-head doubly-taxed-income breakdown. Port of
prototypes/graph-pilot/doubletax-nodes.js. Built on xborder_full.py (both
countries' income + residency in one registry).
"""
from __future__ import annotations

from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.registry import NodeRegistry
from . import xborder_full


def _inr_to_usd(inr, ctx) -> float:
    return float(inr) / fx_rate(ctx)


def _map_double_taxed_income_result(d, ctx):
    items = []
    us_worldwide = d["residencyResult"]["us"]["worldwide"]
    us = d["aggregateUsIncomeResult"]

    def pair(label, india_inr, us_money, note=""):
        india_usd = _inr_to_usd(india_inr, ctx)
        us_usd = us_money["usd"] if us_money else 0
        in_exposed = india_usd > 0
        us_exposed = us_usd > 0
        doubly_taxed = in_exposed and (us_worldwide or us_exposed)
        if in_exposed or us_exposed:
            items.append({"label": label, "indiaUsd": india_usd, "usUsd": us_usd, "doublyTaxed": doubly_taxed, "note": note})

    pair("Salary / Wages (India-source)", d["salaryInr"], us["foreignWages"],
         "Indian employment income is foreign-source for the US; creditable via Form 1116 general basket.")
    pair("Business / Professional income", d["businessComputation"]["businessInr"], us["foreignSelfEmployment"],
         "Indian business profits may also flow through GILTI/Subpart F if held via a corp (Form 5471).")
    pair("House property / Rental (India)", d["housePropertyInr"], us["foreignRental"],
         "Indian rent: net-of-expense basis differs (IN 30% standard deduction vs US actual + depreciation).")
    pair("Interest income", d["interestInr"], us["foreignInterest"],
         "Passive basket for US FTC; India taxes at slab rate.")
    pair("Dividend income", d["dividendInr"], us["foreignDividends"],
         "Indian dividends taxable in shareholder's hands; US qualified-dividend rate may differ.")
    pair("Capital gains", d["indiaCapitalGainsInrXbr3"], us["foreignCapitalGains"],
         "STCG/LTCG holding-period and rate definitions differ between IN and US.")

    total_doubly_taxed_usd = sum(max(it["indiaUsd"], it["usUsd"]) if it["doublyTaxed"] else 0 for it in items)
    return {"items": items, "totalDoublyTaxedUsd": total_doubly_taxed_usd}


def build(base: NodeRegistry) -> NodeRegistry:
    r = xborder_full.build(base)

    r.register("indiaCapitalGainsInrXbr3", NodeDef(
        deps=("capitalGainsComputation",),
        compute=lambda d, ctx: d["capitalGainsComputation"]["stcgInr"] + d["capitalGainsComputation"]["ltcgInr"] + d["capitalGainsComputation"]["ltcg197Inr"],
    ))
    r.register("mapDoubleTaxedIncomeResult", NodeDef(
        deps=("salaryInr", "businessComputation", "housePropertyInr", "interestInr", "dividendInr",
              "indiaCapitalGainsInrXbr3", "aggregateUsIncomeResult", "residencyResult"),
        compute=_map_double_taxed_income_result,
    ))
    return r
