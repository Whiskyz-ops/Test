"""Income from house property (India, ss.22-24 + s.71(3A)) — mirrors
prototypes/graph-pilot/house-property.js exactly (see its header for the rules
and the legacy-field fallbacks)."""
from __future__ import annotations

HP_SOP_INTEREST_CAP_INR = 200000
HP_LOSS_SETOFF_CAP_INR = 200000
HP_STANDARD_DEDUCTION_RATE = 0.30


def _has(v) -> bool:
    if v is None or v == "":
        return False
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _num(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def compute_house_property(props, opts: dict | None = None) -> dict:
    opts = opts or {}
    no_new_regime_benefits = opts.get("isNewRegime") is True and opts.get("isIndividualOrHuf") is not False
    sop_interest_inr = 0.0
    other_inr = 0.0
    for p in props or []:
        if not isinstance(p, dict):
            continue
        has_gav = _has(p.get("gross_annual_value_inr")) or _has(p.get("annual_value_inr")) or _has(p.get("gross_rent_received_inr"))
        if not has_gav and _has(p.get("net_income_inr")):
            other_inr += _num(p.get("net_income_inr"))
            continue
        share = (min(100.0, max(0.0, _num(p.get("co_owner_share_percent")))) / 100
                 if p.get("financial_values_represent") == "TOTAL_PROPERTY" and _has(p.get("co_owner_share_percent")) else 1.0)
        interest_inr = (_num(p.get("interest_on_borrowed_capital_inr")) + _num(p.get("pre_construction_interest_inr"))) * share
        use = p.get("property_use") or ("LOP" if has_gav else "SOP")
        if use == "SOP":
            sop_interest_inr += interest_inr
            continue
        if _has(p.get("gross_annual_value_inr")) or not _has(p.get("annual_value_inr")):
            gav_inr = _num(p.get("gross_annual_value_inr")) if _has(p.get("gross_annual_value_inr")) else _num(p.get("gross_rent_received_inr"))
            nav_inr = gav_inr - _num(p.get("municipal_taxes_paid_inr"))
        else:
            nav_inr = _num(p.get("annual_value_inr"))
        nav_inr = max(0.0, nav_inr) * share
        other_inr += nav_inr - HP_STANDARD_DEDUCTION_RATE * nav_inr - interest_inr
    sop_deduction_inr = 0.0 if no_new_regime_benefits else min(sop_interest_inr, HP_SOP_INTEREST_CAP_INR)
    head_inr = other_inr - sop_deduction_inr
    set_off_cap_inr = 0.0 if no_new_regime_benefits else HP_LOSS_SETOFF_CAP_INR
    income_inr = max(head_inr, -set_off_cap_inr) if head_inr < 0 else head_inr
    return {"incomeInr": income_inr + 0.0, "headInr": head_inr + 0.0, "lossCarriedForwardInr": (income_inr - head_inr) + 0.0}


def us_rules_rental_inr(props) -> float:
    """Mirrors house-property.js usRulesRentalInr: let-out rent less Indian
    property tax and loan interest, no 30%, no deemed rent, no depreciation;
    a net loss counts as 0."""
    net = 0.0
    for p in props or []:
        if not isinstance(p, dict):
            continue
        has_gav = _has(p.get("gross_annual_value_inr")) or _has(p.get("annual_value_inr")) or _has(p.get("gross_rent_received_inr"))
        use = p.get("property_use") or ("LOP" if has_gav else "SOP")
        if use != "LOP":
            continue
        share = (min(100.0, max(0.0, _num(p.get("co_owner_share_percent")))) / 100
                 if p.get("financial_values_represent") == "TOTAL_PROPERTY" and _has(p.get("co_owner_share_percent")) else 1.0)
        rent = (_num(p.get("gross_annual_value_inr")) if _has(p.get("gross_annual_value_inr"))
                else _num(p.get("gross_rent_received_inr")) if _has(p.get("gross_rent_received_inr")) else _num(p.get("annual_value_inr")))
        net += (rent - _num(p.get("municipal_taxes_paid_inr")) - _num(p.get("interest_on_borrowed_capital_inr")) - _num(p.get("pre_construction_interest_inr"))) * share
    return max(0.0, net) + 0.0


def house_property_opts(india) -> dict:
    profile = (india or {}).get("profile") or {} if isinstance(india, dict) else {}
    entity = profile.get("entity_type") or "individual"
    return {
        "isNewRegime": str(profile.get("tax_regime") or "NEW").upper() != "OLD",
        "isIndividualOrHuf": entity in ("individual", "huf"),
    }
