"""WISING.analyze(opts) — the pure-function boundary. Port of
prototypes/graph-pilot/analyze.js.

`analyze(opts)` builds `ctx = {router, india, us, monitorAsOfBoundary?,
fxRateOverride?}` exactly as `analyze.js`'s own `resolveAll()` does, resolves
`TARGET_IDS` against `core.registry.build_full_registry()`, and assembles
the final dict field-for-field matching `analyze.js`'s own
`assembleModel`/`assembleComputed` plus its own `analyzeResult` node
(`report-batch5-nodes.js`) — `findings`/`documents`/`ftcReport`/
`taxComputation`/`withholding`/`scopeNotes`/`returnForms`/`monitoring`/
`summary`, alongside `model`/`computed`.

The registry is built ONCE at import time (module-level `_REGISTRY`, mirroring
`analyze.js`'s own module-level `var graph = createGraph(NODES)`) — safe to
share across calls: `NodeRegistry.resolve()`'s `cache`/`in_stack` are always
local to that one call (see core/graph.py's own docstring), so concurrent
`analyze()` calls never cross-contaminate each other's memoization. This is
also the property that keeps a future server-side `adapter/http_adapter.py`
cheap: the same frozen registry serves every request.

`usTaxResult`'s entity/NRA/trust routing (flagged as the one gap Phase 7
didn't close) is now built — see `us/ustax_full.py`, composed as the final
step of `build_full_registry()`. Cross-checked directly against the real
JS DAG on all 13 fixtures + the 40-case fuzz corpus (`prototypes/graph-
pilot/run-js-dag-vs-py-dag.js`, `npm run compare:js-vs-py-dag`) — see
`docs/PYTHON_DAG_MIGRATION_TRACKER.md` for the full writeup.
"""
from __future__ import annotations

from .core.fx_util import fx_rate
from .core.registry import build_full_registry

_REGISTRY = None


def _registry():
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = build_full_registry()
    return _REGISTRY


TARGET_IDS = [
    "entityResult", "metaResult", "identityResult", "treatyModelResult",
    "residencyModelSliceResult", "companyResidencyResult", "indiaIncomeModelResult",
    "aggregateUsIncomeResult", "accountsBoundary", "assetsModelResult",
    "totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer", "usTaxResult", "residencyResult",
    "ftcResult", "crossBasisResult", "limitsResult", "headlineResult",
    "apportionmentResult", "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3",
    "findingsAllResult", "buildDocumentsResult", "buildFtcReportResult", "buildTaxComputationResult",
    "buildWithholdingSummaryResult", "buildScopeNotesResult", "buildReturnFormDeterminationResult",
    "monitorResult", "summaryResult",
    # model.deductions.india — one raw-fact node per section (no single
    # combined node exists, same as the JS source).
    "dedS80C", "dedS80CCD1B", "dedS80CCD2Employer", "dedS80D", "dedS80TTA_TTB",
    "dedS80DD", "dedS80DDB", "dedS80U", "dedS80E", "dedS80EEA_EE", "dedS80GGB_GGC", "dedS80GGRentPaidInr",
    # model.deductions.us — already one combined node.
    "dedUs",
    # computed.indiaTax.deductionsInr — in1_v3.py's final combined deduction total.
    "deductionsInrV3",
]


def _assemble_model(out: dict) -> dict:
    return {
        "entity": out["entityResult"],
        "meta": out["metaResult"],
        "identity": out["identityResult"],
        "treaty": out["treatyModelResult"],
        "residency": out["residencyModelSliceResult"],
        "companyResidency": out["companyResidencyResult"],
        "income": {"india": out["indiaIncomeModelResult"], "us": out["aggregateUsIncomeResult"]},
        "accounts": {"accounts": out["accountsBoundary"], "aggregatePeak": None},
        "assets": out["assetsModelResult"],
        "deductions": {
            "india": {
                "s80C": out["dedS80C"], "s80CCD1B": out["dedS80CCD1B"], "s80CCD2_employer": out["dedS80CCD2Employer"],
                "s80D": out["dedS80D"], "s80TTA_TTB": out["dedS80TTA_TTB"], "s80DD": out["dedS80DD"], "s80DDB": out["dedS80DDB"],
                "s80U": out["dedS80U"], "s80E": out["dedS80E"], "s80EEA_EE": out["dedS80EEA_EE"],
                "s80GGB_GGC": out["dedS80GGB_GGC"], "s80GG_rentPaidInr": out["dedS80GGRentPaidInr"],
            },
            "us": out["dedUs"],
        },
    }


def _assemble_computed(out: dict, ctx: dict) -> dict:
    # feieAppliedUsd is a DAG-internal convenience field (us/ustax.py) — the
    # real engine keeps that value at usTax.feie.appliedUsd instead. Stripped
    # so this dict is byte-exact to the real computed.usTax.
    us_tax = dict(out["usTaxResult"])
    us_tax.pop("feieAppliedUsd", None)
    return {
        "indiaTax": {
            "totalTaxInr": out["totalTaxInrCombined"], "totalTaxUsd": out["totalTaxInrCombined"] / fx_rate(ctx),
            "regime": out["regimeCombined"], "isEntity": out["isEntityTaxpayer"],
            "deductionsInr": out["deductionsInrV3"],
            # s115a is the object ONLY for a non-entity NR; null for a
            # resident individual; absent entirely on the entity path in the
            # real engine — null and absent are equivalent here.
            "s115a": {"dividend": out["s115aDividend"], "royalty": out["s115aRoyalty"], "fts": out["s115aFts"]} if (out["isNRV3"] and not out["isEntityTaxpayer"]) else None,
        },
        "usTax": us_tax,
        "residency": out["residencyResult"],
        "ftc": out["ftcResult"],
        "reconciliation": out["crossBasisResult"],
        "limits": out["limitsResult"],
        "headline": out["headlineResult"],
        "apportionment": out["apportionmentResult"],
    }


def _resolve_all(opts: dict) -> tuple[dict, dict]:
    opts = opts or {}
    ctx = {"router": opts.get("router"), "india": opts.get("india"), "us": opts.get("us")}
    if opts.get("monitorAsOf") is not None:
        ctx["monitorAsOfBoundary"] = opts["monitorAsOf"]
    if opts.get("fxRateOverride") is not None:
        ctx["fxRateOverride"] = opts["fxRateOverride"]
    out = _registry().resolve(TARGET_IDS, ctx).values
    return out, ctx


def analyze(opts: dict | None = None) -> dict:
    """opts: {router, india, us, monitorAsOf?, fxRateOverride?} -> the full
    WISING.analyze() result dict (model/computed/findings/documents/
    ftcReport/taxComputation/withholding/scopeNotes/returnForms/monitoring/
    summary)."""
    out, ctx = _resolve_all(opts)
    return {
        "findings": out["findingsAllResult"],
        "documents": out["buildDocumentsResult"],
        "ftcReport": out["buildFtcReportResult"],
        "taxComputation": out["buildTaxComputationResult"],
        "withholding": out["buildWithholdingSummaryResult"],
        "scopeNotes": out["buildScopeNotesResult"],
        "returnForms": out["buildReturnFormDeterminationResult"],
        "monitoring": out["monitorResult"],
        "summary": out["summaryResult"],
        "model": _assemble_model(out),
        "computed": _assemble_computed(out, ctx),
    }


def normalize(opts: dict | None = None) -> dict:
    """WISING.normalize(opts) — just `model`, a free byproduct of the same
    assembly analyze() already does."""
    out, _ctx = _resolve_all(opts)
    return _assemble_model(out)
