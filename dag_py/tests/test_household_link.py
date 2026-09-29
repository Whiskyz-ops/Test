"""Spouse link check (docs/HOUSEHOLD_DESIGN.md step 1): Python and JS
(prototypes/graph-pilot/household-link.js) must give the same answer on
every case, and match the hand-written expectation."""
import json
import pathlib
import subprocess

import pytest

from wising_dag.household.link import check_household_link

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "dag_py/tests/fixtures/household-link-cases.json").read_text())


def _js_results():
    script = (
        "const L=require(" + json.dumps(str(ROOT / "prototypes/graph-pilot/household-link.js")) + ");"
        "const cases=require(" + json.dumps(str(ROOT / "dag_py/tests/fixtures/household-link-cases.json")) + ");"
        "process.stdout.write(JSON.stringify(cases.map(c=>L.checkHouseholdLink(c.a,c.b))));"
    )
    return json.loads(subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True).stdout)


JS = _js_results()


@pytest.mark.parametrize("i", range(len(CASES)), ids=[c["name"] for c in CASES])
def test_household_link(i):
    case = CASES[i]
    py = check_household_link(case["a"], case["b"])
    exp = case["expect"]
    assert py["linked"] == exp["linked"]
    assert [e["code"] for e in py["errors"]] == exp["codes"]
    assert py["tiers"] == exp["tiers"]
    assert py == JS[i], "JS and Python disagree"
