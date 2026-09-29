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
