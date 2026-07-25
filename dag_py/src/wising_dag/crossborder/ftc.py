"""computeFtc — the §904-style Form 1116 limitation (US direction) and the
India §159 relief (India direction). Port of
prototypes/graph-pilot/ftc-nodes.js.

All ten `*_BoundaryFtc` leaves are EXPLICIT BOUNDARY INPUTS (read
`ctx["computed"]...`/`ctx["model"]...`) — overridden by xborder_full.py to
in-graph values, exactly how india_full.py/us_full.py closed their own
boundaries.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import num, safe


def _ftc_us_direction(d, ctx):
    feie_excluded_usd = d["feieExcludedUsdBoundaryFtc"]
    zeroed = d["usIsNraBoundaryFtc"] or not d["hasUsScopeBoundaryFtc"]
    foreign_src_gross_usd = 0 if zeroed else d["indiaIncomeTotalUsdBoundaryFtc"]
    foreign_src_usd = max(0.0, foreign_src_gross_usd - feie_excluded_usd)
    creditable_fraction = 0 if zeroed else ((foreign_src_usd / foreign_src_gross_usd) if foreign_src_gross_usd > 0 else 1)
    us_taxable_usd = d["usTaxableIncomeUsdBoundaryFtc"]
    us_income_tax_usd = d["usIncomeTaxUsdBoundaryFtc"]
    india_tax_paid_gross_usd = d["indiaTotalTaxUsdBoundaryFtc"]
    india_tax_paid_usd = india_tax_paid_gross_usd * creditable_fraction
    india_tax_disallowed_usd = india_tax_paid_gross_usd - india_tax_paid_usd
    us_limit_fraction = min(1.0, foreign_src_usd / us_taxable_usd) if us_taxable_usd > 0 else 0
    us_ftc_limit = us_income_tax_usd * us_limit_fraction
    us_ftc_allowed = min(india_tax_paid_usd, us_ftc_limit)
    us_carryover = max(0.0, india_tax_paid_usd - us_ftc_allowed)
    return {
        "foreignSourceIncomeUsd": foreign_src_usd, "feieExcludedUsd": feie_excluded_usd,
        "indiaTaxDisallowedUsd": india_tax_disallowed_usd, "taxableIncomeUsd": us_taxable_usd,
        "usIncomeTaxUsd": us_income_tax_usd, "indiaTaxPaidUsd": india_tax_paid_usd,
        "limitFraction": us_limit_fraction, "ftcLimitUsd": us_ftc_limit, "ftcAllowedUsd": us_ftc_allowed,
        "carryoverUsd": us_carryover, "residualDoubleTaxUsd": us_carryover,
    }


def _ftc_india_direction(d, ctx):
    foreign_src_india_usd = d["usSourceTotalUsdBoundaryFtc"] if d["indiaWorldwideBoundaryFtc"] else 0
    india_total_income_usd = d["indiaTotalIncomeUsdBoundaryFtc"]
    india_tax_on_foreign_usd = d["indiaTotalTaxUsdBoundaryFtc"] * min(1.0, foreign_src_india_usd / india_total_income_usd) if india_total_income_usd > 0 else 0
    us_tax_on_us_source_usd = d["usIncomeTaxUsdBoundaryFtc"] * min(1.0, d["usSourceIncomeUsdBoundaryFtc"] / d["usTotalIncomeUsdBoundaryFtc"]) if d["usTotalIncomeUsdBoundaryFtc"] > 0 else 0
    india_relief_allowed = min(us_tax_on_us_source_usd, india_tax_on_foreign_usd)
    return {
        "foreignSourceIncomeUsd": foreign_src_india_usd, "usTaxOnUsSourceUsd": us_tax_on_us_source_usd,
        "reliefCapUsd": india_tax_on_foreign_usd, "reliefAllowedUsd": india_relief_allowed,
    }


def _ftc_result(d, ctx):
    us_residual = d["ftcUsDirection"]["carryoverUsd"]
    india_residual = max(0.0, min(d["ftcIndiaDirection"]["usTaxOnUsSourceUsd"], d["ftcIndiaDirection"]["reliefCapUsd"]) - d["ftcIndiaDirection"]["reliefAllowedUsd"])
    return {
        "us": d["ftcUsDirection"], "india": d["ftcIndiaDirection"],
        "netUnrelievedDoubleTaxUsd": us_residual + india_residual,
    }


NODES = {
    "feieExcludedUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "computed.usTax.feie.appliedUsd", None))),
    "usIsNraBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.usTax.isNra", False))),
    "hasUsScopeBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.meta.hasUsScope", None) is not False),
    "indiaIncomeTotalUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.india.total.usd", None)),
    "usTaxableIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.taxableIncomeUsd", None)),
    "usIncomeTaxUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.incomeTaxUsd", None)),
    "usTotalIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.totalIncomeUsd", None)),
    "usSourceIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.usSourceIncomeUsd", None)),
    "indiaTotalTaxUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.indiaTax.totalTaxUsd", None)),
    "indiaTotalIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.indiaTax.totalIncomeUsd", None)),
    "indiaWorldwideBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.residency.india.worldwide", False))),
    "usSourceTotalUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.us.usSourceTotal.usd", None)),

    "ftcUsDirection": NodeDef(
        deps=("feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc",
              "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc"),
        compute=_ftc_us_direction,
    ),
    "ftcIndiaDirection": NodeDef(
        deps=("indiaWorldwideBoundaryFtc", "usSourceTotalUsdBoundaryFtc", "indiaTotalIncomeUsdBoundaryFtc",
              "indiaTotalTaxUsdBoundaryFtc", "usTotalIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc"),
        compute=_ftc_india_direction,
    ),
    "ftcResult": NodeDef(deps=("ftcUsDirection", "ftcIndiaDirection"), compute=_ftc_result),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
