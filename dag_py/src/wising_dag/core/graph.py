"""
Dependency-graph resolver — Python port of prototypes/graph-pilot/graph.js.

A node is {deps, scope_gate, out_of_scope_value, compute(d, ctx)}. resolve()
topologically resolves + memoizes, per call (never across calls).

The one piece of real behavior this exists to preserve: when a node declares
scope_gate and that gate resolves False, compute() is NEVER CALLED — the
node's value is out_of_scope_value by construction, so there is no `if` a
future author could forget to write at a call site.

GuardedDeps raises on any dep access outside a node's own declared deps —
the Python equivalent of graph.js's Proxy-based wrapDeps() guard, added
after a real bug where two nodes read undeclared deps and silently got a
default value instead of a loud error.

Nodes read deps via d["depId"] (dict-style), not d.depId — Python has no
clean way to intercept attribute access as cheaply as a JS Proxy intercepts
property access, so this is a deliberate, documented spelling deviation from
the JS call sites.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Callable


class GraphError(Exception):
    """Base class for all graph/resolver errors."""


class UndeclaredDepAccess(GraphError, KeyError):
    def __init__(self, node_id: str, key: str):
        self.node_id = node_id
        self.key = key
        super().__init__(
            f"Node '{node_id}'.compute() accessed '{key}', which isn't in its own "
            f"declared deps. Add '{key}' to this node's deps — or if this was "
            f"accidental, this check just caught a real bug."
        )


class UnknownNode(GraphError):
    def __init__(self, node_id: str):
        self.node_id = node_id
        super().__init__(f"Unknown node '{node_id}'")


class CycleDetected(GraphError):
    def __init__(self, node_id: str):
        self.node_id = node_id
        super().__init__(f"Cycle detected at node '{node_id}'")


class ScopeGateNotInDeps(GraphError):
    def __init__(self, node_id: str, scope_gate: str):
        self.node_id = node_id
        self.scope_gate = scope_gate
        super().__init__(
            f"Node '{node_id}' declares scope_gate '{scope_gate}' but doesn't list "
            f"it in deps — the gate must be an explicit dependency so it resolves "
            f"before the gate check runs."
        )


class GuardedDeps(Mapping):
    """Read-only view over a node's resolved deps that raises
    UndeclaredDepAccess on any key not in the node's own declared deps."""

    __slots__ = ("_values", "_node_id")

    def __init__(self, values: dict[str, Any], node_id: str):
        self._values = values
        self._node_id = node_id

    def __getitem__(self, key: str) -> Any:
        if key not in self._values:
            raise UndeclaredDepAccess(self._node_id, key)
        return self._values[key]

    def __iter__(self):
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def __repr__(self) -> str:
        return f"GuardedDeps({self._node_id!r}, {self._values!r})"


ComputeFn = Callable[[GuardedDeps, dict], Any]
OutOfScopeValue = Any  # a literal value, or a Callable[[GuardedDeps, dict], Any]


@dataclass(frozen=True, slots=True)
class NodeDef:
    deps: tuple[str, ...]
    compute: ComputeFn
    scope_gate: str | None = None
    out_of_scope_value: OutOfScopeValue = None


@dataclass(frozen=True, slots=True)
class ResolveResult:
    values: dict[str, Any]
    all: dict[str, Any]


def resolve(nodes: Mapping[str, NodeDef], target_ids: list[str], ctx: dict) -> ResolveResult:
    """Resolve target_ids against `nodes`. `cache`/`in_stack` are local to
    this call — never shared across calls or stored on any longer-lived
    object — so concurrent resolve() calls against the same node map never
    cross-contaminate each other's memoization."""
    cache: dict[str, Any] = {}
    in_stack: set[str] = set()

    def resolve_one(node_id: str) -> Any:
        if node_id in cache:
            return cache[node_id]
        node = nodes.get(node_id)
        if node is None:
            raise UnknownNode(node_id)
        if node_id in in_stack:
            raise CycleDetected(node_id)
        in_stack.add(node_id)

        dep_values = {dep_id: resolve_one(dep_id) for dep_id in node.deps}
        guarded = GuardedDeps(dep_values, node_id)

        if node.scope_gate is not None and dep_values[node.scope_gate] is False:
            value = (
                node.out_of_scope_value(guarded, ctx)
                if callable(node.out_of_scope_value)
                else node.out_of_scope_value
            )
        else:
            value = node.compute(guarded, ctx)

        cache[node_id] = value
        in_stack.discard(node_id)
        return value

    values = {tid: resolve_one(tid) for tid in target_ids}
    return ResolveResult(values=values, all=cache)


def validate_scope_gates(nodes: Mapping[str, NodeDef]) -> None:
    for node_id, node in nodes.items():
        if node.scope_gate is not None and node.scope_gate not in node.deps:
            raise ScopeGateNotInDeps(node_id, node.scope_gate)
