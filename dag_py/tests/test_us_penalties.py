"""Unit tests (synthetic ctx, not golden-based) for us1_penalty_2210.py and
us5_penalty_72t.py. Both modules still carry unwired boundary stubs
(usTotalTaxBeforeFtcUsdBoundary etc. read ctx["computed"], baseYear reads
ctx["model"] — neither exists yet) — full golden-file verification happens
once a later phase wires them into the complete graph, same as
india/entity_tax.py's entityTaxableInrBoundary wasn't golden-tested until
india_full.py closed it. These tests instead pin down the parts that ARE
independently correct right now: scope routing and the penalty formulas,
using ctx["computed"]/ctx["model"] set explicitly to exercise them.
"""
from wising_dag.core.registry import NodeRegistry
from wising_dag.us import us1_penalty_2210, us5_penalty_72t


def test_has_us_scope_routes_off_router_jurisdiction():
    r = us1_penalty_2210.build(NodeRegistry()).freeze()
    assert r.resolve(["hasUsScope"], {"router": {"jurisdiction": "single_india"}}).values["hasUsScope"] is False
    assert r.resolve(["hasUsScope"], {"router": {"jurisdiction": "india_only"}}).values["hasUsScope"] is False
    assert r.resolve(["hasUsScope"], {"router": {"jurisdiction": "single_us"}}).values["hasUsScope"] is True
    assert r.resolve(["hasUsScope"], {"router": {"jurisdiction": "us_only"}}).values["hasUsScope"] is True


def test_has_us_scope_falls_back_to_us_signal_for_dual_jurisdiction():
    r = us1_penalty_2210.build(NodeRegistry()).freeze()
    ctx = {"router": {"jurisdiction": "dual", "is_us_citizen": True}}
    assert r.resolve(["hasUsScope"], ctx).values["hasUsScope"] is True
    ctx2 = {"router": {"jurisdiction": "dual"}}
    assert r.resolve(["hasUsScope"], ctx2).values["hasUsScope"] is False


def test_2210_penalty_zero_when_balance_due_under_threshold():
    r = us1_penalty_2210.build(NodeRegistry()).freeze()
    ctx = {
        "router": {"jurisdiction": "single_us"},
        "us": {"withholding_and_estimated": {"federal_withholding_total_usd": 50000}},
        "computed": {"usTax": {"totalTaxBeforeFtcUsd": 50500, "agiUsd": 100000}, "ftc": {"us": {"ftcAllowedUsd": 0}}},
    }
    out = r.resolve(["us2210PenaltyUsd", "shouldFire"], ctx).values
    assert out["us2210PenaltyUsd"] == 0
    assert out["shouldFire"] is False


def test_2210_penalty_fires_when_materially_underpaid():
    r = us1_penalty_2210.build(NodeRegistry()).freeze()
    ctx = {
        "router": {"jurisdiction": "single_us"},
        "us": {"withholding_and_estimated": {"federal_withholding_total_usd": 5000}},
        "computed": {"usTax": {"totalTaxBeforeFtcUsd": 50000, "agiUsd": 200000}, "ftc": {"us": {"ftcAllowedUsd": 0}}},
    }
    out = r.resolve(["us2210PenaltyUsd", "shouldFire"], ctx).values
    assert out["shouldFire"] is True
    assert out["us2210PenaltyUsd"] > 0


def test_72t_no_penalty_when_no_early_distributions():
    r = us5_penalty_72t.build(NodeRegistry()).freeze()
    ctx = {
        "router": {"jurisdiction": "single_us", "date_of_birth": "2000-06-15"},
        "us": {"income_us_source": {}},
        "model": {"meta": {"baseYear": 2026}},
    }
    out = r.resolve(["penalty72tUsd", "ageAtYearEndUs", "shouldFire"], ctx).values
    assert out["ageAtYearEndUs"] == 26
    assert out["penalty72tUsd"] == 0
    assert out["shouldFire"] is False


def test_72t_penalty_applies_when_under_59_at_year_end():
    r = us5_penalty_72t.build(NodeRegistry()).freeze()
    ctx = {
        "router": {"jurisdiction": "single_us", "date_of_birth": "2000-06-15"},
        "us": {"income_us_source": {"ira_distributions_usd": 10000, "401k_distributions_usd": 5000}},
        "model": {"meta": {"baseYear": 2026}},
    }
    # age 26 at 2026 year-end (< 59) -> penalty applies
    out = r.resolve(["penalty72tUsd", "shouldFire"], ctx).values
    assert out["shouldFire"] is True
    assert out["penalty72tUsd"] == 1500  # 10% of (10000 + 5000)


def test_72t_penalty_waived_at_59_or_older():
    r = us5_penalty_72t.build(NodeRegistry()).freeze()
    ctx = {
        "router": {"jurisdiction": "single_us", "date_of_birth": "1960-01-01"},
        "us": {"income_us_source": {"ira_distributions_usd": 10000}},
        "model": {"meta": {"baseYear": 2026}},
    }
    out = r.resolve(["penalty72tUsd", "ageAtYearEndUs", "shouldFire"], ctx).values
    assert out["ageAtYearEndUs"] == 66
    assert out["penalty72tUsd"] == 0
    assert out["shouldFire"] is False


def test_out_of_scope_short_circuits_both_modules():
    ctx = {"router": {"jurisdiction": "single_india"}}
    r1 = us1_penalty_2210.build(NodeRegistry()).freeze()
    out1 = r1.resolve(["us2210PenaltyUsd", "shouldFire"], ctx).values
    assert out1 == {"us2210PenaltyUsd": 0, "shouldFire": False}

    r5 = us5_penalty_72t.build(NodeRegistry()).freeze()
    out5 = r5.resolve(["penalty72tUsd", "shouldFire"], ctx).values
    assert out5 == {"penalty72tUsd": 0, "shouldFire": False}
