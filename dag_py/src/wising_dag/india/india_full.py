"""Wires aggregate_india_income.py's income/capital-gains boundary closer
INTO in1_v3.py's + entity_tax.py's tax-computation chains. Port of
prototypes/graph-pilot/india-full-nodes.js.

Every EXPLICIT BOUNDARY node in in1_v3.py and entity_tax.py is
DELIBERATELY REDEFINED here — same node id, new deps/compute — to read
from the merged income subgraph's own output nodes instead of
`ctx["model"]...`. After this module, the India tax chain has ZERO
remaining ctx["model"] reads: raw router/india JSON goes in, the full
India tax total comes out, entirely inside the graph.

NOTE: prototypes/graph-pilot/india-tax-combined-nodes.js is NOT ported —
it defines the exact same v3+entity NODES plus the same 3 routing-gate
overrides (isEntityTaxpayer/totalTaxInrCombined/regimeCombined) as this
file, and in the live JS graph its contribution is always overwritten by
india-full-nodes.js's version anyway (report-batch4-nodes.js's merge order
comment: "batch3 FIRST, batch2's chain SECOND... batch2's lineage carries
india-full-nodes.js's IN-GRAPH overrides"). It is fully redundant for
anything that reaches the final analyze() output.
"""
from __future__ import annotations

from ..core.registry import NodeRegistry
from ..core.graph import NodeDef
from . import aggregate_india_income, entity_tax, in1_v3

OVERRIDE_REASON = "india-full-nodes.js wiring: redefined to read the merged income subgraph instead of ctx['model']"


def build(base: NodeRegistry) -> NodeRegistry:
    r = base.extend()
    r = aggregate_india_income.build(r)
    r = in1_v3.build(r)
    r = entity_tax.build(r)

    r.override("businessInrBoundaryV3", NodeDef(deps=("businessComputation",), compute=lambda d, ctx: d["businessComputation"]["businessInr"]), reason=OVERRIDE_REASON)
    r.override("businessDepreciationInrBoundary", NodeDef(deps=("businessComputation",), compute=lambda d, ctx: d["businessComputation"]["businessDepreciationInr"]), reason=OVERRIDE_REASON)
    r.override("speculativeIncomeInrBoundaryV3", NodeDef(deps=("speculativeIncomeInrAgg",), compute=lambda d, ctx: d["speculativeIncomeInrAgg"]), reason=OVERRIDE_REASON)
    r.override("stcgInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["stcgInr"]), reason=OVERRIDE_REASON)
    r.override("ltcgInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["ltcgInr"]), reason=OVERRIDE_REASON)
    r.override("ltcg197InrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["ltcg197Inr"]), reason=OVERRIDE_REASON)
    r.override("stcgSlabInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["stcgSlabInr"]), reason=OVERRIDE_REASON)
    r.override("vdaGainInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["vdaGainInr"]), reason=OVERRIDE_REASON)
    r.override("chapterXiiaInvestmentIncomeInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["chapterXiiaInvestmentIncomeInr"]), reason=OVERRIDE_REASON)
    r.override("deemedDividendBuybackInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["deemedDividendInr"]), reason=OVERRIDE_REASON)
    r.override("promoterBuybackLtcgInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["promoterBuybackLtcgInr"]), reason=OVERRIDE_REASON)
    r.override("promoterBuybackStcgInrBoundary", NodeDef(deps=("capitalGainsComputation",), compute=lambda d, ctx: d["capitalGainsComputation"]["promoterBuybackStcgInr"]), reason=OVERRIDE_REASON)
    r.override("otherSourcesMiscInrBoundary", NodeDef(deps=("otherSourcesMiscComputation",), compute=lambda d, ctx: d["otherSourcesMiscComputation"]), reason=OVERRIDE_REASON)
    r.override("entityTaxableInrBoundary", NodeDef(deps=("totalIndiaIncomeInr",), compute=lambda d, ctx: d["totalIndiaIncomeInr"]), reason=OVERRIDE_REASON)

    # ---- routing gate ---------------------------------------------------------
    # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6):
    # widened to include AOP/BOI and Trust/NGO/Political Party.
    r.register("isEntityTaxpayer", NodeDef(
        deps=("indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust"),
        compute=lambda d, ctx: d["indiaIsCompany"] or d["indiaIsFirm"] or d["indiaIsAop"] or d["indiaIsTrust"],
    ))
    r.register("totalTaxInrCombined", NodeDef(
        deps=("isEntityTaxpayer", "totalTaxInrV3", "totalTaxInrEntity"),
        compute=lambda d, ctx: d["totalTaxInrEntity"] if d["isEntityTaxpayer"] else d["totalTaxInrV3"],
    ))
    r.register("regimeCombined", NodeDef(
        deps=("isEntityTaxpayer", "taxRegime", "entityTaxResult"),
        compute=lambda d, ctx: d["entityTaxResult"]["regime"] if d["isEntityTaxpayer"] else d["taxRegime"],
    ))
    return r
