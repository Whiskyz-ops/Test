"""Layer 1 India's per-head income switches, enforced before the graph runs —
mirrors prototypes/graph-pilot/india-switches.js exactly (see its header):
a head whose switch is explicitly False carries no amounts, at the top level
and in every quarter."""
from __future__ import annotations


def _clean_slice(slice_):
    if not isinstance(slice_, dict):
        return slice_
    out = dict(slice_)
    di = out.get("domestic_income")
    if isinstance(di, dict):
        di = dict(di)
        out["domestic_income"] = di
        sal = di.get("salary")
        if isinstance(sal, dict) and sal.get("has_salary_income") is False:
            di["salary"] = {"has_salary_income": False}
        hp = di.get("house_property")
        if isinstance(hp, dict) and hp.get("has_house_property_income") is False:
            di["house_property"] = {"has_house_property_income": False, "properties": []}
        bi = di.get("business_income")
        if isinstance(bi, dict) and bi.get("has_business_or_fo_income") is False:
            di["business_income"] = {"has_business_or_fo_income": False, "entity_type": bi.get("entity_type")}
        if di.get("has_agricultural_income") is False:
            di["agricultural_income_inr"] = 0
    os_ = out.get("other_sources")
    if isinstance(os_, dict) and os_.get("has_other_sources_income") is False:
        out["other_sources"] = {"has_other_sources_income": False}
    return out


def apply_india_income_switches(india):
    if not isinstance(india, dict):
        return india
    out = _clean_slice(india)
    quarters = india.get("quarters")
    if isinstance(quarters, dict):
        out["quarters"] = {q: _clean_slice(v) for q, v in quarters.items()}
    return out
