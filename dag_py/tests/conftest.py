import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
PROFILES_DIR = FIXTURES_DIR / "profiles"
GOLDEN_FIXTURES_DIR = FIXTURES_DIR / "golden" / "fixtures"

ALL_FIXTURE_IDS = sorted(p.stem for p in PROFILES_DIR.glob("*.json"))

# foreign_holdco_poem_india's business_entries[] gained a real s.44BBB
# (foreign-company civil-construction presumptive scheme) entry plus
# tonnage_tax_115V_inr/specified_business_s35AD_inr (JS commit 3d2a4f0,
# gap tracker IN-26) after this profile's golden was first generated. The
# frozen engine (archive/engine-frozen — permanently frozen, no s.44BBB/
# tonnage/s.35AD support at all) silently treats that entry as ungated
# Regular Books with zero recognized expenses, wildly overstating india
# business income; the Python port (matching the JS DAG's own fix)
# correctly applies the flat 10% presumptive rate instead. A large,
# understood, permanent golden divergence on this one fixture's india-side
# income and everything downstream of it — not a Python bug. Every india-
# income-touching golden test across the suite carves this fixture out.
GOLDEN_DIVERGENT_FIXTURES_S44BBB = {"foreign_holdco_poem_india"}


def load_profile(fixture_id: str) -> dict:
    return json.loads((PROFILES_DIR / f"{fixture_id}.json").read_text())


def load_golden(fixture_id: str) -> dict:
    return json.loads((GOLDEN_FIXTURES_DIR / f"{fixture_id}.json").read_text())


def ctx_for(fixture_id: str) -> dict:
    p = load_profile(fixture_id)
    return {"router": p.get("router"), "india": p.get("india"), "us": p.get("us")}


@pytest.fixture(params=ALL_FIXTURE_IDS)
def fixture_id(request) -> str:
    return request.param
