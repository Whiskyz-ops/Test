"""Household calculation (docs/HOUSEHOLD_DESIGN.md step 3): the Python
analyze_household must match prototypes/graph-pilot/household.js on every
case, and the probe couple must match the hand-worked numbers."""
import json
import math
import pathlib
import subprocess

import pytest

from wising_dag.analyze import analyze
from wising_dag.household.calc import analyze_household, split_joint_us_tax

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES_PATH = ROOT / "dag_py/tests/fixtures/household-cases.json"
CASES = json.loads(CASES_PATH.read_text())


def _js_results():
    g = str(ROOT / "prototypes/graph-pilot") + "/"
    script = (
        "global.WISING={};const G=" + json.dumps(g) + ";process.chdir(G);require(G+'profiles.js');"
        "const A=require(G+'analyze.js'),H=require(G+'household.js');"
        "const cases=require(" + json.dumps(str(CASES_PATH)) + ");"
        "process.stdout.write(JSON.stringify(cases.map(c=>H.analyzeHousehold(c.a,c.b,A.analyze))));"
    )
    return json.loads(subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True).stdout)


JS = _js_results()


def _close(x, y, path="") -> list:
    if isinstance(x, dict) and isinstance(y, dict):
        if set(x) != set(y):
            return [path + ": keys " + str(sorted(set(x) ^ set(y)))]
        return [d for k in x for d in _close(x[k], y[k], path + "." + k)]
    if isinstance(x, list) and isinstance(y, list):
        if len(x) != len(y):
            return [path + ": length"]
        return [d for i in range(len(x)) for d in _close(x[i], y[i], path + "[" + str(i) + "]")]
    if isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool):
        return [] if math.isclose(x, y, rel_tol=1e-9, abs_tol=1e-6) else [path + ": " + str(x) + " != " + str(y)]
    return [] if x == y else [path + ": " + repr(x) + " != " + repr(y)]


@pytest.mark.parametrize("i", range(len(CASES)), ids=[c["name"] for c in CASES])
def test_js_and_python_agree(i):
    py = analyze_household(CASES[i]["a"], CASES[i]["b"], analyze)
    diff = _close(py, JS[i])
    assert not diff, diff[:5]


def test_probe_couple_hand_numbers():
    h = analyze_household(CASES[0]["a"], CASES[0]["b"], analyze)
    a, b = h["spouses"]
    # Client alone: India tax from their own $50,000 only (was Rs 54,26,850 with the spouse's W-2 pooled).
    assert round(a["indiaTaxUsd"] * 83) == 834600
    # Separate-return taxes (2026 MFS brackets, $16,100 standard deduction):
    # 33,900 taxable -> 1,240 + 12% x 21,500 = 3,820; 133,900 -> 5,800 + 22% x 55,300 + 24% x 28,200 = 24,734.
    assert a["separateReturnIncomeTaxUsd"] == 3820 and b["separateReturnIncomeTaxUsd"] == 24734
    # Joint: 200,000 - 32,200 = 167,800 -> 11,600 + 22% x 67,000 = 26,340.
    assert h["jointUs"]["incomeTaxUsd"] == 26340
    assert math.isclose(a["usTaxShareUsd"], 26340 * 3820 / (3820 + 24734))
    # All the client's income is US-source, so Indian relief is the full share (under the Indian tax cap).
    assert math.isclose(a["indiaReliefHouseholdUsd"], a["usTaxShareUsd"])


def test_blocked_link_returns_errors():
    h = analyze_household(CASES[3]["a"], CASES[3]["b"], analyze)
    assert h["blocked"] and [e["code"] for e in h["errors"]] == ["half_link"]


def test_split_method_a_zero_tax_is_even():
    s = split_joint_us_tax(1000, 0, 0)
    assert s["shareA"] == 0.5 and s["aUsd"] == 500


def _joint_us(case, persons_from_own=True):
    from wising_dag.household.calc import _person_figures, joint_profile
    a, b = case["a"], case["b"]
    persons = [_person_figures(analyze({"router": a["router"], "india": a["india"], "us": a["us"]})),
               _person_figures(analyze({"router": b["router"], "india": b["india"], "us": b["us"]}))] if persons_from_own else None
    return analyze(joint_profile(a, b, persons))["computed"]["usTax"]


def test_joint_se_tax_uses_each_spouses_own_wage_base():
    # Rohan: $158,000 wages leave $26,500 of his $184,500 cap; Priya's $90,000
    # W-2 must not use it up (IRC s.1402(b)). Joint SE tax = Rohan's own.
    case = [c for c in CASES if c["name"].startswith("Rohan & Priya")][0]
    rohan_alone = analyze({"router": case["a"]["router"], "india": case["a"]["india"], "us": case["a"]["us"]})["computed"]["usTax"]["seTaxUsd"]
    assert math.isclose(_joint_us(case)["seTaxUsd"], rohan_alone)
    assert _joint_us(case, persons_from_own=False)["seTaxUsd"] < rohan_alone - 3000  # the pooled bug, kept for contrast


def test_joint_senior_deduction_counts_both_spouses():
    import copy
    case = copy.deepcopy(CASES[0])
    case["a"]["router"]["date_of_birth"] = "1955-01-01"
    case["b"]["router"]["date_of_birth"] = "1956-01-01"
    u = _joint_us(case)
    # AGI 200,000: each $6,000 less 6% x (200,000 - 150,000) = 3,000; two spouses -> 6,000 (s.151(d)(5)(C)).
    assert u["seniorDeductionUsd"] == 6000
    assert u["seniorDetail"]["spouseSenior"] is True


@pytest.mark.parametrize("i", [0, 1, 4], ids=["probe couple", "Rohan + spouse", "Rohan & Priya"])
def test_joint_return_same_from_either_spouse(i):
    # Both spouses' Reconciliation tabs show one joint return.
    ab = analyze_household(CASES[i]["a"], CASES[i]["b"], analyze)
    ba = analyze_household(CASES[i]["b"], CASES[i]["a"], analyze)
    assert not _close(ab["jointUs"], ba["jointUs"])
    assert math.isclose(ab["spouses"][0]["usTaxShareUsd"], ba["spouses"][1]["usTaxShareUsd"])


def test_joint_return_keeps_both_spouses_treaty_elections():
    # The lead spouse's treaty section is used, but the other spouse's treaty
    # elections carry their own Indian income (Rohan's Rs 4,00,000 royalty
    # was dropped when Priya, with an empty treaty section, led the return).
    from wising_dag.household.calc import joint_profile
    lead = {"id": "p", "india": {"dtaa": {"dtaa_treaty_residence": "none"}}, "us": {}}
    other = {"id": "r", "india": {"dtaa": {"dtaa_treaty_residence": "US", "treaty_elections": [{"income_type": "royalty", "amount_inr": 400000}]}}, "us": {}}
    j = joint_profile(lead, other)
    assert j["india"]["dtaa"]["dtaa_treaty_residence"] == "none"
    assert j["india"]["dtaa"]["treaty_elections"] == [{"income_type": "royalty", "amount_inr": 400000}]


def test_mehta_household_joint_tax():
    case = next(c for c in CASES if c["name"].startswith("Rohan & Priya Mehta"))
    h = analyze_household(case["a"], case["b"], analyze)
    # Joint regular income tax on the couple's combined return, including
    # Rohan's Indian royalty entered only as a treaty election.
    assert round(h["jointUs"]["incomeTaxUsd"]) == 87212
