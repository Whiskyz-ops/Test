"""Wires aggregate_us_income.py INTO ustax.py's chain — the US mirror of
india_full.py's wiring. Port of prototypes/graph-pilot/us-full-nodes.js.

Only the `incUs` boundary is closed here. The JS source also wires
`worldwideUs` to `residencyResult.us.worldwide` (from residency-nodes.js) —
that node lives in the crossborder/ domain (Phase 4 of this port, not yet
built), so `worldwideUs` stays a boundary stub for now, exactly as
in1_v3.py's boundary nodes stayed stubs until india_full.py closed them.
Documented here rather than silently left unclear: until crossborder/
residency.py exists and overrides it, `worldwideUs` always resolves False
(ctx has no "computed" key), so FEIE and worldwide-taxed foreign income
are not yet reflected in usTaxResult for any profile. This is a known,
temporary, tracked gap — see docs/PYTHON_DAG_MIGRATION_TRACKER.md.

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
from . import aggregate_us_income, ustax

OVERRIDE_REASON = "us-full-nodes.js wiring: redefined to read the merged income subgraph instead of ctx['model']"


def build(base: NodeRegistry) -> NodeRegistry:
    r = base.extend()
    r = aggregate_us_income.build(r)
    r = ustax.build(r)

    r.override("incUs", NodeDef(deps=("aggregateUsIncomeResult",), compute=lambda d, ctx: d["aggregateUsIncomeResult"]), reason=OVERRIDE_REASON)
    return r
