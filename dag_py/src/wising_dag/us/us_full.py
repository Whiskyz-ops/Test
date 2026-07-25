"""Wires aggregate_us_income.py INTO ustax.py's chain — the US mirror of
india_full.py's wiring. Port of prototypes/graph-pilot/us-full-nodes.js.

Closes both boundaries the JS source closes: `incUs` (to
aggregateUsIncomeResult) and `worldwideUs` (to
residencyResult.us.worldwide, from crossborder/residency.py — mirrors the
JS us-full-nodes.js's own `require("./residency-nodes.js")`; residency.py
is a legitimate cross-domain dependency here, not a layering violation —
DTAA tie-break residency is inherently cross-border, and the JS source
itself pulls it into the US-side wiring file for exactly this reason).

This closes the temporary gap `us_full.py` shipped with in Phase 3
(worldwideUs stayed a boundary stub because crossborder/residency.py
didn't exist yet) — see docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 3
section for that history.

`usEntityKind`/`baseYearUs` (ustax.py's other two boundary stubs) are NOT
closed here either — per ustax-nodes.js's own header, those come from
`model.entity.usKind`/`model.meta.baseYear`, i.e. core/entry.py's
entityResult (already built) and the not-yet-built metaResult — closed in
ustax_full.py (this port's Phase 7 analyze()-assembly equivalent of
agg10-nodes.js's role, mirroring the JS ustax-full-nodes.js's own
`require("./agg10-nodes.js")` composition point).
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.registry import NodeRegistry
from ..crossborder import residency
from . import aggregate_us_income, ustax

OVERRIDE_REASON = "us-full-nodes.js wiring: redefined to read the merged income/residency subgraphs instead of ctx['model']/ctx['computed']"


def build(base: NodeRegistry) -> NodeRegistry:
    r = base.extend()
    r = aggregate_us_income.build(r)
    r = ustax.build(r)
    r = residency.build(r)

    r.override("incUs", NodeDef(deps=("aggregateUsIncomeResult",), compute=lambda d, ctx: d["aggregateUsIncomeResult"]), reason=OVERRIDE_REASON)
    r.override("worldwideUs", NodeDef(deps=("residencyResult",), compute=lambda d, ctx: d["residencyResult"]["us"]["worldwide"]), reason=OVERRIDE_REASON)
    return r
