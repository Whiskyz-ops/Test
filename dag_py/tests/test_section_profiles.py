"""Per-section test profiles (fixtures/section-profiles/): one small client
per Layer 1 form section, run through the full engine and checked against
hand-computed figures. The JS engine runs the same files
(scripts/check-section-profiles.js); see that file's header."""
import json
import re
from pathlib import Path

import pytest

from wising_dag import analyze

DIR = Path(__file__).parent / "fixtures" / "section-profiles"
PROFILES = sorted((json.loads(p.read_text()) for p in DIR.glob("*.json")), key=lambda p: p["id"])


def _pick(obj, path):
    cur = obj
    for seg in re.findall(r"[^.\[\]]+(?:\[[^\]]*\])?", path):
        if cur is None:
            return None
        m = re.match(r"^([^\[]+)(?:\[([^=\]]+)=([^\]]*)\])?$", seg)
        cur = cur.get(m.group(1)) if isinstance(cur, dict) else None
        if m.group(2) is not None:
            cur = next((x for x in (cur or []) if isinstance(x, dict) and _js_str(x.get(m.group(2))) == m.group(3)), None)
    return cur


def _js_str(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


@pytest.mark.parametrize("profile", PROFILES, ids=[p["id"] for p in PROFILES])
def test_section_profile(profile):
    opts = {"router": profile.get("router") or {}, "india": profile.get("india") or {}, "us": profile.get("us") or {}}
    if profile.get("monitorAsOf"):
        opts["monitorAsOf"] = profile["monitorAsOf"]
    r = analyze(opts)
    problems = []
    for e in profile["expect"]:
        got = _pick(r, e["path"])
        tol = e.get("tol", 1)
        if isinstance(e["value"], (int, float)) and not isinstance(e["value"], bool):
            ok = isinstance(got, (int, float)) and not isinstance(got, bool) and abs(got - e["value"]) <= tol
        else:
            ok = got == e["value"]
        if not ok:
            problems.append(f"{e['path']}: expected {e['value']!r}, engine {got!r} ({e['why']})")
    assert not problems, "\n".join(problems)
