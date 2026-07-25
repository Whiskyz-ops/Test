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
