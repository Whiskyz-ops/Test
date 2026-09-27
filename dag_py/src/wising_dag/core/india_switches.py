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
    # Capital-gains sub-sections answered "No": the rows stay in the saved data
    # (the form only hides them), so without this a "No" still taxed them.
    for sec_key, flag, rows in (("property", "has_indian_property_transaction", "properties"),
                                ("financial_holdings", "has_financial_transactions", "transactions"),
                                ("commodities", "has_commodity_transactions", "transactions"),
                                ("unlisted_equity", "has_unlisted_equity_transaction", "transactions"),
                                ("share_buyback", "has_buyback_transaction", "transactions")):
        sec = out.get(sec_key)
        if isinstance(sec, dict) and sec.get(flag) is False and isinstance(sec.get(rows), list) and sec[rows]:
            out[sec_key] = {**sec, rows: []}
    return out


_CG_ROW_SECTIONS = (("property", "properties"), ("financial_holdings", "transactions"), ("commodities", "transactions"),
                    ("unlisted_equity", "transactions"), ("share_buyback", "transactions"))


def _drop_capital_gains(slice_):
    """'Any capital gains?' answered No (capital_gains.cg_section_off): every
    capital-gains amount and row is dropped. Mirrors india-switches.js."""
    if not isinstance(slice_, dict):
        return slice_
    out = dict(slice_)
    if isinstance(out.get("capital_gains"), dict):
        out["capital_gains"] = {"has_capital_gains": False, "cg_section_off": True}
    di = out.get("domestic_income")
    if isinstance(di, dict) and di.get("capital_gains"):
        out["domestic_income"] = {**di, "capital_gains": {}}
    for sec_key, rows in _CG_ROW_SECTIONS:
        sec = out.get(sec_key)
        if isinstance(sec, dict) and isinstance(sec.get(rows), list) and sec[rows]:
            out[sec_key] = {**sec, rows: []}
    return out


def apply_india_income_switches(india):
    if not isinstance(india, dict):
        return india
    out = _clean_slice(india)
    quarters = india.get("quarters")
    if isinstance(quarters, dict):
        out["quarters"] = {q: _clean_slice(v) for q, v in quarters.items()}
    cg = india.get("capital_gains")
    if isinstance(cg, dict) and cg.get("cg_section_off") is True:
        out = _drop_capital_gains(out)
        if isinstance(out.get("quarters"), dict):
            out["quarters"] = {q: _drop_capital_gains(v) for q, v in out["quarters"].items()}
    return out
