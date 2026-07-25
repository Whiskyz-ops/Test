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
