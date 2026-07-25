import pytest

from wising_dag.core.graph import (
    CycleDetected,
    GuardedDeps,
    NodeDef,
    ScopeGateNotInDeps,
    UndeclaredDepAccess,
    UnknownNode,
    resolve,
    validate_scope_gates,
)


def test_resolves_simple_chain():
    nodes = {
        "a": NodeDef(deps=(), compute=lambda d, ctx: 1),
        "b": NodeDef(deps=("a",), compute=lambda d, ctx: d["a"] + 1),
        "c": NodeDef(deps=("b",), compute=lambda d, ctx: d["b"] + 1),
    }
    out = resolve(nodes, ["c"], {})
    assert out.values == {"c": 3}
    assert out.all == {"a": 1, "b": 2, "c": 3}


def test_memoizes_within_a_single_resolve_call():
    calls = []

    def compute_shared(d, ctx):
        calls.append("shared")
        return 42

    nodes = {
        "shared": NodeDef(deps=(), compute=compute_shared),
        "x": NodeDef(deps=("shared",), compute=lambda d, ctx: d["shared"] + 1),
        "y": NodeDef(deps=("shared",), compute=lambda d, ctx: d["shared"] + 2),
    }
    out = resolve(nodes, ["x", "y"], {})
    assert out.values == {"x": 43, "y": 44}
    assert calls == ["shared"]  # computed once, reused for both x and y


def test_does_not_memoize_across_separate_resolve_calls():
    calls = []

    def compute_a(d, ctx):
        calls.append(1)
        return len(calls)

    nodes = {"a": NodeDef(deps=(), compute=compute_a)}
    r1 = resolve(nodes, ["a"], {})
    r2 = resolve(nodes, ["a"], {})
    assert r1.values["a"] == 1
    assert r2.values["a"] == 2  # fresh cache each call, recomputed


def test_undeclared_dep_access_raises():
    nodes = {
        "a": NodeDef(deps=(), compute=lambda d, ctx: 1),
        "b": NodeDef(deps=(), compute=lambda d, ctx: 2),
        "bad": NodeDef(deps=("a",), compute=lambda d, ctx: d["b"]),  # reads undeclared "b"
    }
    with pytest.raises(UndeclaredDepAccess):
        resolve(nodes, ["bad"], {})


def test_cycle_detected():
    nodes = {
        "a": NodeDef(deps=("b",), compute=lambda d, ctx: d["b"]),
        "b": NodeDef(deps=("a",), compute=lambda d, ctx: d["a"]),
    }
    with pytest.raises(CycleDetected):
        resolve(nodes, ["a"], {})


def test_unknown_node():
    with pytest.raises(UnknownNode):
        resolve({}, ["missing"], {})


def test_scope_gate_short_circuits_compute():
    calls = []

    def compute_gated(d, ctx):
        calls.append(1)
        return "should not run"

    nodes = {
        "gate": NodeDef(deps=(), compute=lambda d, ctx: False),
        "gated": NodeDef(deps=("gate",), scope_gate="gate", out_of_scope_value="OUT_OF_SCOPE", compute=compute_gated),
    }
    out = resolve(nodes, ["gated"], {})
    assert out.values["gated"] == "OUT_OF_SCOPE"
    assert calls == []  # compute() never called


def test_scope_gate_true_runs_compute():
    nodes = {
        "gate": NodeDef(deps=(), compute=lambda d, ctx: True),
        "gated": NodeDef(deps=("gate",), scope_gate="gate", out_of_scope_value="OUT", compute=lambda d, ctx: "IN"),
    }
    out = resolve(nodes, ["gated"], {})
    assert out.values["gated"] == "IN"


def test_out_of_scope_value_can_be_callable():
    nodes = {
        "gate": NodeDef(deps=(), compute=lambda d, ctx: False),
        "gated": NodeDef(
            deps=("gate",), scope_gate="gate",
            out_of_scope_value=lambda d, ctx: "derived-" + str(d["gate"]),
            compute=lambda d, ctx: "unreachable",
        ),
    }
    out = resolve(nodes, ["gated"], {})
    assert out.values["gated"] == "derived-False"


def test_validate_scope_gate_must_be_in_deps():
    nodes = {
        "gate": NodeDef(deps=(), compute=lambda d, ctx: True),
        "bad": NodeDef(deps=(), scope_gate="gate", out_of_scope_value=None, compute=lambda d, ctx: 1),
    }
    with pytest.raises(ScopeGateNotInDeps):
        validate_scope_gates(nodes)


def test_guarded_deps_mapping_protocol():
    g = GuardedDeps({"a": 1, "b": 2}, "node")
    assert g["a"] == 1
    assert dict(g) == {"a": 1, "b": 2}
    assert len(g) == 2
    with pytest.raises(UndeclaredDepAccess):
        g["c"]


def test_concurrent_resolves_do_not_cross_contaminate():
    """Backend-portability guard: resolve() must be safe under concurrent
    calls sharing the same node map with different ctx (core/graph.py's
    cache/in_stack are per-call locals, never shared/global state)."""
    import concurrent.futures

    nodes = {
        "x": NodeDef(deps=(), compute=lambda d, ctx: ctx["n"]),
        "y": NodeDef(deps=("x",), compute=lambda d, ctx: d["x"] * 10),
    }

    def run(n):
        return resolve(nodes, ["y"], {"n": n}).values["y"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(run, range(50)))

    assert results == [n * 10 for n in range(50)]
