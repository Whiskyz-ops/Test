import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
PROFILES_DIR = FIXTURES_DIR / "profiles"
GOLDEN_FIXTURES_DIR = FIXTURES_DIR / "golden" / "fixtures"

ALL_FIXTURE_IDS = sorted(p.stem for p in PROFILES_DIR.glob("*.json"))


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
