"""
NodeRegistry — the composition/override mechanism domain modules use to
build up the full node graph.

Replaces the JS pattern (require() an earlier file's NODES, shallow-copy,
sometimes silently overwrite a key, document intent only in a comment) with
something structural: .register() rejects a duplicate id, .override()
requires the id to already exist AND requires a non-empty `reason` string,
so every intentional override is grep-able (`\\.override\\(`) and
self-documenting instead of an implicit last-write-wins.

Each domain module exposes `build(base: NodeRegistry) -> NodeRegistry`;
core.registry.build_full_registry() (added once every domain exists) is the
single place that calls each domain's build() in order and freezes the
result — the whole composition order is visible in one file.
"""
from __future__ import annotations

from .graph import NodeDef, resolve as _resolve, validate_scope_gates, ResolveResult
from .util import num, safe


class DuplicateNodeError(Exception):
    def __init__(self, node_id: str):
        super().__init__(f"'{node_id}' already registered — use .override() if this is intentional")


class MissingNodeError(Exception):
    def __init__(self, node_id: str):
        super().__init__(f"'{node_id}' was never registered — use .register()")


class RegistryFrozenError(Exception):
    def __init__(self):
        super().__init__("registry is frozen — no further register()/override() calls allowed")


class NodeRegistry:
    def __init__(self):
        self._nodes: dict[str, NodeDef] = {}
        self._frozen = False

    def _assert_mutable(self) -> None:
        if self._frozen:
            raise RegistryFrozenError()

    def register(self, node_id: str, node: NodeDef) -> "NodeRegistry":
        self._assert_mutable()
        if node_id in self._nodes:
            raise DuplicateNodeError(node_id)
        self._nodes[node_id] = node
        return self

    def override(self, node_id: str, node: NodeDef, *, reason: str) -> "NodeRegistry":
        self._assert_mutable()
        if node_id not in self._nodes:
            raise MissingNodeError(node_id)
        if not reason or not reason.strip():
            raise ValueError("override() requires a non-empty reason")
        self._nodes[node_id] = node
        return self

    def extend(self) -> "NodeRegistry":
        """Return a new, unfrozen registry seeded with a copy of this
        registry's nodes — the starting point for a domain module's own
        further register()/override() calls. Never shares mutable state
        with `self`."""
        new = NodeRegistry()
        new._nodes = dict(self._nodes)
        return new

    def freeze(self) -> "NodeRegistry":
        validate_scope_gates(self._nodes)
        self._frozen = True
        return self

    def get(self, node_id: str) -> NodeDef | None:
        return self._nodes.get(node_id)

    def __contains__(self, node_id: str) -> bool:
        return node_id in self._nodes

    def resolve(self, target_ids: list[str], ctx: dict) -> ResolveResult:
        return _resolve(self._nodes, target_ids, ctx)

    def dependency_closure(self, node_id: str) -> tuple[str, ...]:
        """Every node id transitively reachable from `node_id` via `deps`
        (not including `node_id` itself). Pure structural walk over deps —
        no ctx, no compute() calls — same static-analysis spirit as the JS
        side's scripts/audit/dag-coverage.js."""
        seen: set[str] = set()

        def walk(nid: str) -> None:
            node = self.get(nid)
            if node is None:
                return
            for dep in node.deps:
                if dep not in seen:
                    seen.add(dep)
                    walk(dep)

        walk(node_id)
        return tuple(sorted(seen))

    def transitive_layer1_fields(self, node_id: str) -> tuple[str, ...]:
        """Every Layer 1 field that feeds into `node_id`, directly or
        through any number of intermediate nodes — the union of
        `layer1_fields` across `node_id` and its full dependency closure.
        This is the "absolute traceability" answer for a derived node deep
        in the graph: no manual deps-walking required, computed once from
        the static graph structure."""
        fields: set[str] = set()
        for nid in (node_id, *self.dependency_closure(node_id)):
            node = self.get(nid)
            if node is not None:
                fields.update(node.layer1_fields)
        return tuple(sorted(fields))


def build_full_registry() -> NodeRegistry:
    """The single composition point every domain's `build(base)` was written
    to defer to — Phase 7 (see docs/PYTHON_DAG_MIGRATION_TRACKER.md). Ports
    the composition ustax-full-nodes.js/assets-nodes.js's own `require()`
    chain performs implicitly (each file blindly copying `baseNodes` then
    layering its own overrides) as something explicit and ordered.

    Each domain's own `build(base)` calls its OWN prerequisite `build()`s
    internally (e.g. `crossborder/findings.py`'s `build()` calls
    `cross_basis.build(base)`, which calls `india_full.build(base)`, ...) —
    calling several of those `build()`s on the SAME registry here would
    re-derive the shared india_full/us_full/xborder_full base repeatedly and
    hit `DuplicateNodeError`. Every domain findings.py file's own docstring
    already documents this as the reason `build_full_registry()` exists.

    So instead of calling `india_findings.build()`/`us_findings.build()`/
    `crossborder_findings.build()` directly, this function calls the ONE
    shared base chain (`cross_basis.build()`, which already covers
    india_full + us_full + ftc + xborder_full's boundary overrides) ONCE,
    then layers in each domain findings module's OWN additional nodes
    directly from its `NODES` dict (skipping the redundant base-rebuild each
    file's own `build()` would otherwise perform) — the same
    "re-register via the module's NODES dict, not build()" pattern
    `tests/test_filings_documents.py`/`test_filings_assets.py`/
    `test_reports_trace.py` already established for testing exactly this
    composition, generalized here into the one real production path.
    """
    from ..crossborder import apportionment, black_money_act, cross_basis
    from ..crossborder import findings as crossborder_findings
    from ..filings import assets, calendar_amounts, checks_registry, documents, limits, monitoring
    from ..india import findings as india_findings
    from ..india.itr_form import _india_itr_form_result
    from ..reports import assembly as reports_assembly
    from ..reports import trace as reports_trace
    from ..us import findings as us_findings
    from ..us import us1_penalty_2210, us5_penalty_72t
    from . import entry, orchestration

    r = cross_basis.build(NodeRegistry())
    r = entry.build(r)

    # ---- india/itr_form.py's own extras (india_full already present via
    # cross_basis -> xborder_full -> india_full) -----------------------------
    r.register("grossTotalIncomeInrV3", NodeDef(
        deps=("normalSlabInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
              "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"),
        compute=lambda d, ctx: (
            d["normalSlabInr"] + d["stcgTaxableInr"] + d["ltcgTaxableInr"] + d["ltcg197TaxableInr"] + d["specialRate115bbInr"] + d["vdaGainInrBoundary"] +
            d["chapterXiiaInvestmentIncomeInrBoundary"] + (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0) +
            (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0)
        ),
    ))
    r.register("grossTotalIncomeInrCombined", NodeDef(deps=("isEntityTaxpayer", "grossTotalIncomeInrV3", "entityTaxableInrBoundary"), compute=lambda d, ctx: d["entityTaxableInrBoundary"] if d["isEntityTaxpayer"] else d["grossTotalIncomeInrV3"]))
    r.register("indiaForeignIncomeDeclaredRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "foreign_income.has_foreign_income", None), layer1_fields=("india.foreign_income.has_foreign_income",)))
    r.register("indiaForeignAssetsDeclaredRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "foreign_assets.has_foreign_assets", None), layer1_fields=("india.foreign_assets.has_foreign_assets",)))
    r.register("indiaHasBroughtForwardLossesRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "carry_forward_losses.has_brought_forward_losses", None), layer1_fields=("india.carry_forward_losses.has_brought_forward_losses",)))
    r.register("indiaIsCompanyDirectorRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.is_company_director", False) is True, layer1_fields=("india.profile.is_company_director",)))
    r.register("indiaIsSection8Raw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.is_section_8", False) is True, layer1_fields=("india.profile.is_section_8",)))
    r.register("indiaLayer1ItrRaw", NodeDef(deps=(), compute=lambda d, ctx: (lambda v: None if v == "Unknown" else v)(safe(ctx.get("india"), "itr_recommendation.form", None)), layer1_fields=("india.itr_recommendation.form",)))
    r.register("indiaReturnFormExplanationRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "itr_recommendation.explanation", None), layer1_fields=("india.itr_recommendation.explanation",)))
    r.register("indiaItrFormResult", NodeDef(
        deps=("indiaEntityTypeRaw", "indiaResidencyStatusRawAgg", "grossTotalIncomeInrCombined",
              "stcgInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "stcgSlabInrBoundary",
              "indiaForeignIncomeDeclaredRaw", "indiaForeignAssetsDeclaredRaw",
              "vdaGainInrBoundary", "capitalGainsComputation", "totalIndiaIncomeInr",
              "agriculturalIncomeInrAgg", "specialRate115bbInr", "indiaHasBroughtForwardLossesRaw",
              "speculativeIncomeInrAgg", "fnoIncomeInrAgg", "indiaIsCompanyDirectorRaw",
              "businessComputation", "indiaIncomeModelResult", "indiaIsSection8Raw",
              "indiaLayer1ItrRaw", "indiaReturnFormExplanationRaw"),
        compute=_india_itr_form_result,
    ))

    # ---- india/findings.py's own NODES (residency.py already present via
    # cross_basis -> xborder_full -> us_full -> residency) -------------------
    for node_id, node in india_findings.NODES.items():
        if node_id not in r:
            r.register(node_id, node)

    # ---- us/findings.py's own extras: us1_penalty_2210.py/us5_penalty_72t.py
    # (both standalone files, "shouldFire" aliased before the generic merge —
    # same handling us/findings.py's own build() uses) then its own NODES ---
    r.register("us1ShouldFire", us1_penalty_2210.NODES["shouldFire"])
    r.register("us5ShouldFire", us5_penalty_72t.NODES["shouldFire"])
    for node_id, node in us1_penalty_2210.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)
    for node_id, node in us5_penalty_72t.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)
    for node_id, node in us_findings.NODES.items():
        if node_id not in r:
            r.register(node_id, node)

    # ---- crossborder/findings.py's own extras: black_money_act.py
    # ("shouldFire" -> xb7ShouldFire, same handling), the s115a*DetailedXbr/
    # nrInterestDetailedXbr re-registrations, nraRaw/nraFdapIncomeUsdRaw/
    # nraFdapDetail (guarded — us/findings.py's own copies, registered just
    # above, already carry the complete field set; skip re-registering the
    # narrower crossborder-local duplicates if so), then its own NODES ------
    r.register("xb7ShouldFire", black_money_act.NODES["shouldFire"])
    for node_id, node in black_money_act.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)
    r.register("s115aDividendDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"), compute=india_findings._s115a_dividend_detailed))
    r.register("s115aRoyaltyDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=india_findings._s115a_royalty_detailed))
    r.register("s115aFtsDetailedXbr", NodeDef(deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"), compute=india_findings._s115a_fts_detailed))
    r.register("nrInterestDetailedXbr", NodeDef(
        deps=("isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
              "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"),
        compute=india_findings._nr_interest_detailed,
    ))
    if "nraRaw" not in r:
        r.register("nraRaw", NodeDef(
            deps=(), compute=lambda d, ctx: {
                "treatyRateClaims": safe(ctx.get("us"), "nra_specific.treaty_rate_claims", []) or [],
                "submittedW8ben": safe(ctx.get("us"), "nra_specific.submitted_w8ben", False) is True,
                "usRealPropertyDisposed": safe(ctx.get("us"), "nra_specific.us_real_property_disposed", False) is True,
                "firptaWithholdingUsd": num(safe(ctx.get("us"), "nra_specific.firpta_withholding_usd", 0)),
            },
            layer1_fields=(
                "us.nra_specific.treaty_rate_claims", "us.nra_specific.submitted_w8ben",
                "us.nra_specific.us_real_property_disposed", "us.nra_specific.firpta_withholding_usd",
            ),
        ))
    if "nraFdapIncomeUsdRaw" not in r:
        r.register("nraFdapIncomeUsdRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "nra_specific.us_fdap_income_usd", 0)), layer1_fields=("us.nra_specific.us_fdap_income_usd",)))
    if "nraFdapDetail" not in r:
        r.register("nraFdapDetail", NodeDef(deps=("nraRaw", "nraFdapIncomeUsdRaw"), compute=us_findings._nra_fdap_detail))
    for node_id, node in crossborder_findings.NODES.items():
        if node_id not in r:
            r.register(node_id, node)

    # ---- crossborder/apportionment.py's own extras (aggregate_india_income/
    # aggregate_us_income already present) -----------------------------------
    r.register("apportionmentBaseYearRaw", NodeDef(
        deps=(), compute=lambda d, ctx: int(num(safe(ctx.get("router"), "base_tax_year", safe(ctx.get("us"), "metadata.us_calendar_year", 2025))) or 2025),
        layer1_fields=("router.base_tax_year", "us.metadata.us_calendar_year"),
    ))
    r.register("apportionmentIndiaQuarterlyUsdRaw", NodeDef(deps=(), compute=apportionment._apportionment_india_quarterly_usd_raw))
    r.register("indiaTotalIncomeUsdForApportionment", NodeDef(deps=("totalIndiaIncomeInr",), compute=lambda d, ctx: apportionment._inr_to_usd(d["totalIndiaIncomeInr"], ctx)))
    r.register("apportionmentResult", NodeDef(
        deps=("apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "aggregateUsIncomeResult"),
        compute=apportionment._apportionment_result,
    ))

    # ---- reports/ + filings/ (each build(base) registers only its own
    # node(s), trusting base already carries every dependency — safe to call
    # directly now that the shared base above covers all of them) -----------
    r = reports_assembly.build(r)
    r = reports_trace.build(r)
    r = limits.build(r)
    r = calendar_amounts.build(r)
    r = checks_registry.build(r)
    r = documents.build(r)
    r = assets.build(r)
    r = monitoring.build(r)

    # ---- the final closure layer (identity/meta/residencySlice/headline/
    # summary + the remaining v1-era boundary overrides) ---------------------
    r = orchestration.build(r)

    return r.freeze()
