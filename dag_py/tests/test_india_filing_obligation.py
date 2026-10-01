"""indiaFilingObligationResult against the shared JS / Python cases
(fixtures/india-filing-obligation-cases.json — the JS side runs the same
file in monitor-next/lib/india-filing-obligation.test.js)."""
import json
from pathlib import Path

import pytest

from wising_dag.india.filing_obligation import _india_filing_obligation_result

CASES = json.loads((Path(__file__).parent / "fixtures" / "india-filing-obligation-cases.json").read_text())["cases"]
RENAME = {"ageAtFyEnd": "ageAtFyEndIn1", "baseYear": "baseYearIn1"}


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_case(case):
    d = {RENAME.get(k, k): v for k, v in case["d"].items()}
    ctx = {"india": {"domestic_income": {"business_income": {"nature_of_business": case["natures"]}}}}
    out = _india_filing_obligation_result(d, ctx)
    exp = case["expect"]
    assert out["required"] is exp["required"]
    assert [r["code"] for r in out["reasons"]] == exp["codes"]
    assert len(out["notes"]) == exp["notes"]
    if "textIncludes" in exp:
        assert any(exp["textIncludes"] in r["text"] for r in out["reasons"]), out["reasons"]
