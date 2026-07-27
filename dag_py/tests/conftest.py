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

# us_citizen_expat_india's foreign_earned_income.foreign_earned_income_usd
# ($60,241, Screen 3F's own headline "Total Foreign Earned Income" field) was
# never folded into model.income.us.foreignWages by EITHER the frozen engine
# (verified directly in archive/engine-frozen/normalize.js: foreignWages is
# built purely from foreign_wages[], and separately-captured
# model.feie.foreignEarnedIncomeUsd/model.limitsRaw.foreignEarnedIncomeUsd
# are never read by computeUsTax's actual FEIE math) or the DAG port -- a
# real, pre-existing product bug, not a porting mistake, found during the
# Step 7 (FEIE) field-completeness audit: a taxpayer who fills in ONLY this
# screen's headline field (the far more likely real path, since the screen
# exists specifically for this) got a $0 FEIE exclusion AND the excess over
# the FEIE cap silently vanished from taxable income entirely, because
# nothing downstream of foreign_earned_income_usd ever depended on it. Fixed
# in aggregate_us_income.py's foreignWagesUsd (max() against the wage-rows
# total, not +, to avoid double-counting a careful user who filled in both
# screens describing the same salary) -- a deliberate, understood,
# documented improvement beyond the frozen (buggy) reference for this one
# profile's income and everything downstream of it (headline/summary/FTC/
# cross-basis/findings/aggregate income). Every income-touching golden test
# across the suite carves this fixture out, same convention as S44BBB above.
# A second real bug found in the same audit pass -- feieRaw reading dead
# bona_fide_residence/physical_presence booleans instead of the live
# qualification_test enum field, also confirmed present in the frozen
# engine itself -- does NOT need a carve-out here: none of the 13 real
# profiles claim FEIE via a qualification_test the old dead-boolean read
# would have gotten wrong (the one FEIE-claiming profile, this same
# us_citizen_expat_india, sets both the live and dead fields consistently
# in its fixture, so that particular fix is a no-op for golden purposes).
GOLDEN_DIVERGENT_FIXTURES_FEIE_WAGES = {"us_citizen_expat_india"}


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
