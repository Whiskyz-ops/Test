import pytest

from wising_dag.core.graph import NodeDef, ScopeGateNotInDeps, UndeclaredDepAccess
from wising_dag.core.registry import (
    DuplicateNodeError,
    MissingNodeError,
    NodeRegistry,
    RegistryFrozenError,
)


def test_register_then_resolve():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    r.register("b", NodeDef(deps=("a",), compute=lambda d, ctx: d["a"] + 1))
    r.freeze()
    out = r.resolve(["b"], {})
    assert out.values == {"b": 2}


def test_duplicate_register_raises():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    with pytest.raises(DuplicateNodeError):
        r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 2))


def test_override_replaces_and_requires_reason():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    r.override("a", NodeDef(deps=(), compute=lambda d, ctx: 2), reason="test override")
    r.freeze()
    assert r.resolve(["a"], {}).values == {"a": 2}


def test_override_requires_nonempty_reason():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    with pytest.raises(ValueError):
        r.override("a", NodeDef(deps=(), compute=lambda d, ctx: 2), reason="  ")


def test_override_missing_node_raises():
    r = NodeRegistry()
    with pytest.raises(MissingNodeError):
        r.override("nope", NodeDef(deps=(), compute=lambda d, ctx: 1), reason="whatever")


def test_extend_does_not_share_mutable_state():
    base = NodeRegistry()
    base.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    extended = base.extend()
    extended.register("b", NodeDef(deps=(), compute=lambda d, ctx: 2))
    assert "b" not in base
    assert "b" in extended
    assert "a" in extended


def test_frozen_registry_rejects_further_writes():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    r.freeze()
    with pytest.raises(RegistryFrozenError):
        r.register("b", NodeDef(deps=(), compute=lambda d, ctx: 2))
    with pytest.raises(RegistryFrozenError):
        r.override("a", NodeDef(deps=(), compute=lambda d, ctx: 9), reason="nope, frozen")


def test_freeze_validates_scope_gates():
    r = NodeRegistry()
    r.register("gate", NodeDef(deps=(), compute=lambda d, ctx: True))
    r.register("bad", NodeDef(deps=(), scope_gate="gate", out_of_scope_value=None, compute=lambda d, ctx: 1))
    with pytest.raises(ScopeGateNotInDeps):
        r.freeze()


def test_undeclared_dep_still_guarded_through_registry():
    r = NodeRegistry()
    r.register("a", NodeDef(deps=(), compute=lambda d, ctx: 1))
    r.register("b", NodeDef(deps=(), compute=lambda d, ctx: 2))
    r.register("bad", NodeDef(deps=("a",), compute=lambda d, ctx: d["b"]))
    r.freeze()
    with pytest.raises(UndeclaredDepAccess):
        r.resolve(["bad"], {})
