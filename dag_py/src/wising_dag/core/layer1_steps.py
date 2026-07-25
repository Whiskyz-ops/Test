"""
Maps a `layer1_fields` path (e.g. "india.deductions.s80C.epf_employee_inr")
to the Layer 1 intake step it's collected on — the step ids come directly
from the `panel-step-*` DOM ids in layer1_india.html/layer1_us.html.

BEST-EFFORT, NOT DOM-VERIFIED: this maps by JSON namespace (which top-level/
second-level key a field lives under), inferred from step naming and the
node comments already in the ported source — it has not been individually
checked against which panel's HTML inputs actually write each field. Treat
a step answer here as a strong hint for where to look, not a confirmed
fact — same "confirm before relying on it" discipline as every other
estimated mapping in this codebase (GAP_TRACKER.md's `estimate` flag
precedent). If a step turns out wrong for a specific field, fix the entry
here rather than distrusting the mechanism.
"""
from __future__ import annotations

# 2-segment overrides checked first (more specific than the 1-segment table)
# — needed where one top-level JSON key spans multiple Layer 1 steps.
_INDIA_OVERRIDES: dict[str, str] = {
    "domestic_income.salary": "step-salary",
    "domestic_income.house_property": "step-hp",
    "domestic_income.business_income": "step-business",
    "domestic_income.capital_gains": "step-cg",
    "domestic_income.agricultural_income_inr": "step-business",
    "domestic_income.other_sources": "step-os",
}

_INDIA_TOP_LEVEL: dict[str, str] = {
    "profile": "step-profile",
    "residency_detail": "step-snapshot",
    "itr_recommendation": "step-output",
    "dtaa": "step-dtaa",
    "compliance_docs": "step-compliance",
    "bank_accounts": "step-bank",
    "domestic_income": "step-business",  # fallback; see overrides above for the common sub-keys
    "capital_gains": "step-cg",
    "financial_holdings": "step-cg",
    "share_buyback": "step-cg",
    "commodities": "step-cg",
    "unlisted_equity": "step-cg",
    "other_sources": "step-os",
    "deductions": "step-deductions",
    "carry_forward_losses": "step-credits",
    "foreign_income": "step-fa",
    "foreign_assets": "step-fa",
    "company_residency": "step-profile",
}

_US_TOP_LEVEL: dict[str, str] = {
    "profile": "step-profile",
    "us_residency_detail": "step-profile",
    "nra_specific": "step-nra",
    "corporate_financials": "step-entities",
    "income_us_source": "step-income-us",
    "income_foreign_source": "step-income-foreign",
    "foreign_earned_income": "step-feie",
    "withholding_and_estimated": "step-withholding",
    "itemized_deductions_and_credits": "step-deductions",
    "amt_inputs": "step-amt-niit",
    "amt": "step-amt-niit",
    "equity_compensation": "step-equity",
    "state_residency": "step-state",
}


def step_for_field(layer1_field: str) -> str | None:
    """`layer1_field` is a "<country>.<dotted.path>" string as stored on
    NodeDef.layer1_fields. Returns a Layer 1 step id, or None if the field
    isn't recognized (e.g. router.* fields, which aren't collected on
    either country's step wizard) or has no mapping entry yet."""
    parts = layer1_field.split(".")
    if len(parts) < 2:
        return None
    country, rest = parts[0], parts[1:]
    rest = [seg[:-2] if seg.endswith("[]") else seg for seg in rest]

    if country == "india":
        two_seg = ".".join(rest[:2])
        if two_seg in _INDIA_OVERRIDES:
            return _INDIA_OVERRIDES[two_seg]
        return _INDIA_TOP_LEVEL.get(rest[0])
    if country == "us":
        return _US_TOP_LEVEL.get(rest[0])
    return None
