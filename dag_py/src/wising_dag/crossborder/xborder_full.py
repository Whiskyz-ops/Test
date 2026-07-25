"""The full cross-border graph: india_full + us_full + ftc merged into one
registry, with every one of ftc.py's ten `*_BoundaryFtc` leaves redefined
to in-graph values. Port of prototypes/graph-pilot/xborder-full-nodes.js.

After this module, the product's headline number — net unrelieved double
tax across both directions — is computed end-to-end from raw Layer 1 form
data: India income → India tax (individual OR entity, routed) → US income
→ US federal tax → residency (worldwide flags, derived not read) → FTC
both directions → netUnrelievedDoubleTaxUsd.

Remaining ctx dependencies after this module (same as the JS source):
`usEntityKind`/`baseYearUs` (both still read `ctx["model"]` — deferred to
Phase 7, same as ustax.py's own header documents).
"""
from __future__ import annotations

from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.registry import NodeRegistry
from ..core.util import num, safe
from ..india import india_full
from ..us import us_full
from . import ftc

OVERRIDE_REASON = "xborder-full-nodes.js wiring: redefined FTC boundaries to in-graph values"


def build(base: NodeRegistry) -> NodeRegistry:
    r = base.extend()
    r = india_full.build(r)
    r = us_full.build(r)
    r = ftc.build(r)

    # ---- scope leaves (mirror normalize()'s scopeHasUs) ---------------------
    r.register("routerJurisdictionXB", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("router"), "jurisdiction", None), layer1_fields=("router.jurisdiction",)))
    r.register("routerUsSignalXB", NodeDef(
        deps=(),
        compute=lambda d, ctx: (
            num(safe(ctx.get("router"), "us_days", 0)) > 0 or safe(ctx.get("router"), "is_us_citizen", False) is True or
            safe(ctx.get("router"), "has_green_card", False) is True or safe(ctx.get("router"), "has_us_source_income_or_assets", False) is True
        ),
        layer1_fields=("router.us_days", "router.is_us_citizen", "router.has_green_card", "router.has_us_source_income_or_assets"),
    ))

    r.override("hasUsScopeBoundaryFtc", NodeDef(
        deps=("routerJurisdictionXB", "routerUsSignalXB"),
        compute=lambda d, ctx: (
            False if d["routerJurisdictionXB"] in ("single_india", "india_only") else
            True if d["routerJurisdictionXB"] in ("single_us", "us_only") else d["routerUsSignalXB"]
        ),
    ), reason=OVERRIDE_REASON)
    r.override("feieExcludedUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["feieAppliedUsd"] or 0), reason=OVERRIDE_REASON)
    r.override("usIsNraBoundaryFtc", NodeDef(
        deps=("usEntityKind", "files1040nr", "s6013hElection"),
        compute=lambda d, ctx: d["usEntityKind"] not in ("ccorp", "scorp", "partnership", "trust") and d["files1040nr"] and not d["s6013hElection"],
    ), reason=OVERRIDE_REASON)
    r.override("indiaIncomeTotalUsdBoundaryFtc", NodeDef(deps=("totalIndiaIncomeInr",), compute=lambda d, ctx: d["totalIndiaIncomeInr"] / fx_rate(ctx)), reason=OVERRIDE_REASON)
    r.override("usTaxableIncomeUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["taxableIncomeUsd"]), reason=OVERRIDE_REASON)
    r.override("usIncomeTaxUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["incomeTaxUsd"]), reason=OVERRIDE_REASON)
    r.override("usTotalIncomeUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["totalIncomeUsd"]), reason=OVERRIDE_REASON)
    r.override("usSourceIncomeUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["usSourceIncomeUsd"]), reason=OVERRIDE_REASON)
    r.override("indiaTotalTaxUsdBoundaryFtc", NodeDef(deps=("totalTaxInrCombined",), compute=lambda d, ctx: d["totalTaxInrCombined"] / fx_rate(ctx)), reason=OVERRIDE_REASON)
    r.override("indiaTotalIncomeUsdBoundaryFtc", NodeDef(
        deps=("isEntityTaxpayer", "totalIncomeInrV3", "entityTaxableInrBoundary"),
        compute=lambda d, ctx: (d["entityTaxableInrBoundary"] if d["isEntityTaxpayer"] else d["totalIncomeInrV3"]) / fx_rate(ctx),
    ), reason=OVERRIDE_REASON)
    r.override("indiaWorldwideBoundaryFtc", NodeDef(deps=("residencyResult",), compute=lambda d, ctx: bool(d["residencyResult"]["india"]["worldwide"])), reason=OVERRIDE_REASON)
    r.override("usSourceTotalUsdBoundaryFtc", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: d["usTaxResult"]["usSourceIncomeUsd"]), reason=OVERRIDE_REASON)

    # Companion to hasUsScopeBoundaryFtc above — port of findings-nodes.js's
    # hasIndiaScopeXbr, added here (not in crossborder/findings.py) because
    # it's shared scope infrastructure consumed by findings across all three
    # domains (e.g. india/findings.py's lrs_limit), not a crossborder-only
    # concept itself.
    r.register("hasIndiaScopeXbr", NodeDef(
        deps=("routerJurisdictionXB",),
        compute=lambda d, ctx: d["routerJurisdictionXB"] not in ("single_us", "us_only"),
    ))

    return r
