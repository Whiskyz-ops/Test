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


def test_dependency_closure_walks_full_chain():
    r = NodeRegistry()
    r.register("leaf1", NodeDef(deps=(), compute=lambda d, ctx: 1, layer1_fields=("india.a",)))
    r.register("leaf2", NodeDef(deps=(), compute=lambda d, ctx: 2, layer1_fields=("india.b",)))
    r.register("mid", NodeDef(deps=("leaf1", "leaf2"), compute=lambda d, ctx: d["leaf1"] + d["leaf2"]))
    r.register("top", NodeDef(deps=("mid",), compute=lambda d, ctx: d["mid"] * 10))
    r.freeze()

    assert r.dependency_closure("top") == ("leaf1", "leaf2", "mid")
    assert r.dependency_closure("mid") == ("leaf1", "leaf2")
    assert r.dependency_closure("leaf1") == ()


def test_dependency_closure_handles_diamonds_without_duplication():
    # top depends on both mid_a and mid_b, which both depend on shared_leaf —
    # a diamond, not a tree. Must appear once, not be double-counted or loop.
    r = NodeRegistry()
    r.register("shared_leaf", NodeDef(deps=(), compute=lambda d, ctx: 1, layer1_fields=("india.shared",)))
    r.register("mid_a", NodeDef(deps=("shared_leaf",), compute=lambda d, ctx: d["shared_leaf"]))
    r.register("mid_b", NodeDef(deps=("shared_leaf",), compute=lambda d, ctx: d["shared_leaf"]))
    r.register("top", NodeDef(deps=("mid_a", "mid_b"), compute=lambda d, ctx: d["mid_a"] + d["mid_b"]))
    r.freeze()

    closure = r.dependency_closure("top")
    assert closure == ("mid_a", "mid_b", "shared_leaf")
    assert closure.count("shared_leaf") == 1


def test_transitive_layer1_fields_unions_across_the_full_chain():
    r = NodeRegistry()
    r.register("leaf1", NodeDef(deps=(), compute=lambda d, ctx: 1, layer1_fields=("india.deductions.s80C.ppf_inr",)))
    r.register("leaf2", NodeDef(deps=(), compute=lambda d, ctx: 2, layer1_fields=("india.deductions.s80C.elss_inr",)))
    r.register("mid", NodeDef(deps=("leaf1", "leaf2"), compute=lambda d, ctx: d["leaf1"] + d["leaf2"], layer1_fields=()))
    r.register("top", NodeDef(deps=("mid",), compute=lambda d, ctx: d["mid"] * 10))
    r.freeze()

    assert r.transitive_layer1_fields("top") == ("india.deductions.s80C.elss_inr", "india.deductions.s80C.ppf_inr")
    assert r.transitive_layer1_fields("leaf1") == ("india.deductions.s80C.ppf_inr",)


def test_transitive_layer1_fields_empty_for_pure_derivation_with_no_leaves():
    r = NodeRegistry()
    r.register("pure", NodeDef(deps=(), compute=lambda d, ctx: 42))
    r.freeze()
    assert r.transitive_layer1_fields("pure") == ()
