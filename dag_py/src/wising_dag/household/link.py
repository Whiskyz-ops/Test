"""Spouse link between two clients — mirrors prototypes/graph-pilot/household-link.js.

check_household_link(a, b) takes two clients ({id, router, india, us}; b None
when the linked id doesn't exist) and returns
{linked, status, spouseId, errors: [{code, message}], tiers: {id: "light"|"full"}}.
"""
from __future__ import annotations

import math

LINK_STATUSES = {"mfj", "mfs"}
IDENTITY_SECTIONS = {"profile", "us_residency_detail", "state_residency", "metadata", "nra_specific"}


def _get(o, path, dflt=None):
    cur = o
    for p in path.split("."):
        if not isinstance(cur, dict):
            return dflt
        cur = cur.get(p)
        if cur is None:
            return dflt
    return cur


def _filing_status(c) -> str:
    s = str(_get(c, "us.profile.filing_status", "single") or "single").lower()
    return {"married_filing_jointly": "mfj", "married_filing_separately": "mfs", "head_of_household": "hoh"}.get(s, s)


def _tax_year(c):
    y = _get(c, "router.base_tax_year")
    if y is None:
        y = _get(c, "us.metadata.us_calendar_year")
    return None if y is None else float(y)


def _is_citizen(c) -> bool:
    return _get(c, "us.us_residency_detail.is_us_citizen") is True or _get(c, "router.is_us_citizen") is True


def _is_nra(c) -> bool:
    if _is_citizen(c) or _get(c, "us.us_residency_detail.has_green_card") is True:
        return False
    return _get(c, "us.us_residency_detail.final_us_residency_status") == "NON_RESIDENT_ALIEN" or _get(c, "us.nra_specific.files_form_1040nr") is True


def _has_joint_election(c) -> bool:
    return _get(c, "us.nra_specific.s6013h_joint_election") is True or _get(c, "us.us_residency_detail.s6013g_joint_election") is True


def _any_amount(v) -> bool:
    if v is None or isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return v > 0
    if isinstance(v, str):
        try:
            n = float(v.replace(",", ""))
        except ValueError:
            return False
        return v.strip() != "" and math.isfinite(n) and n > 0
    if isinstance(v, list):
        return any(_any_amount(x) for x in v)
    if isinstance(v, dict):
        return any(_any_amount(x) for x in v.values())
    return False


def spouse_tier(c) -> str:
    j = str(_get(c, "router.primary_jurisdiction", _get(c, "router.jurisdiction", "")) or "")
    india_side = j in ("india", "cross_border", "single_india", "dual") or _any_amount(c.get("india"))
    us = c.get("us") or {}
    us_work = any(k not in IDENTITY_SECTIONS and _any_amount(v) for k, v in us.items())
    return "full" if india_side or us_work else "light"


def _name(c) -> str:
    return _get(c, "router.full_name") or _get(c, "us.profile.full_name") or (c or {}).get("id") or "the spouse"


def _year_str(y) -> str:
    return str(int(y)) if float(y).is_integer() else str(y)


def check_household_link(a: dict, b: dict | None) -> dict:
    spouse_id = _get(a, "us.profile.spouse_client_id")
    out = {"linked": False, "status": _filing_status(a), "spouseId": spouse_id, "errors": [], "tiers": {}}
    if not spouse_id:
        return out
    out["linked"] = True

    def err(code, message):
        out["errors"].append({"code": code, "message": message})

    if spouse_id == a.get("id"):
        err("self_link", "The spouse link points at this client itself.")
        return out
    if not b:
        err("missing_spouse", "The linked spouse profile no longer exists. Re-link or remove the link.")
        return out
    out["tiers"][b["id"]] = spouse_tier(b)

    if _get(b, "us.profile.spouse_client_id") != a.get("id"):
        err("half_link", _name(b) + "'s profile doesn't link back to this client. Both profiles must point at each other.")
    sa, sb = _filing_status(a), _filing_status(b)
    if sa not in LINK_STATUSES:
        err("status_not_married", "Filing status is " + sa.upper() + "; a spouse link needs married filing jointly or separately.")
    elif sa != sb:
        err("status_mismatch", "Filing status differs: " + sa.upper() + " here, " + sb.upper() + " on " + _name(b) + "'s profile.")
    ya, yb = _tax_year(a), _tax_year(b)
    if ya is not None and yb is not None and ya != yb:
        err("year_mismatch", "Tax year differs: " + _year_str(ya) + " here, " + _year_str(yb) + " on " + _name(b) + "'s profile.")
    if sa == "mfj" and sb == "mfj":
        for c in (a, b):
            if _is_nra(c) and not _has_joint_election(a) and not _has_joint_election(b):
                err("nra_spouse_no_election", _name(c) + " is a non-resident alien. A joint return needs the §6013(g) or §6013(h) election (IRC §6013(a)(1)).")
    for c in (a, b):
        if _is_citizen(c) and _get(c, "us.us_residency_detail.final_us_residency_status") == "NON_RESIDENT_ALIEN":
            err("citizen_marked_nra", _name(c) + " is a US citizen but marked non-resident alien. A citizen is always taxed as a US person (DTAA Art. 1(3) saving clause).")
    return out
