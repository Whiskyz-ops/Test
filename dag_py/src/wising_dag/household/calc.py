"""analyze_household(a, b, analyze_fn) — mirrors prototypes/graph-pilot/household.js.

Runs the unchanged single-client engine on each spouse's own profile, on each
spouse as a separate filer (split method A weights) and on the merged joint
US return; splits the joint regular income tax by method A and recomputes each
spouse's Indian relief with their share. See household.js for the full notes.
"""
from __future__ import annotations

import copy
import math

from .link import check_household_link

US_IDENTITY = {"profile", "us_residency_detail", "state_residency", "metadata", "nra_specific"}
INDIA_IDENTITY = {"profile", "residency_detail", "dtaa", "metadata", "compliance_docs"}


def _clone(v):
    return copy.deepcopy(v)


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def merge_value(x, y, key=None):
    if y is None:
        return _clone(x)
    if x is None:
        return _clone(y)
    if _is_num(x) and _is_num(y):
        return x + y
    if isinstance(x, bool) and isinstance(y, bool):
        return x or y
    if isinstance(x, list) and isinstance(y, list):
        if key == "quarters":
            return [merge_value(x[i] if i < len(x) else None, y[i] if i < len(y) else None) for i in range(max(len(x), len(y)))]
        return _clone(x) + _clone(y)
    if isinstance(x, dict) and isinstance(y, dict):
        o = {k: merge_value(x[k], y.get(k), k) for k in x}
        for k in y:
            if k not in x:
                o[k] = _clone(y[k])
        return o
    return _clone(x)


def _merge_section(x, y, identity):
    x, y = x or {}, y or {}
    o = {k: (_clone(x[k]) if k in identity else merge_value(x[k], y.get(k), k)) for k in x}
    for k in y:
        if k not in x:
            o[k] = _clone(y[k])
    return o


def _dep(c) -> float:
    v = ((c.get("us") or {}).get("profile") or {}).get("dependents_count") or 0
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0
    return f if math.isfinite(f) else 0


def _dob_of(c):
    return (((c.get("router") or {}).get("date_of_birth")) or (((c.get("india") or {}).get("profile") or {}).get("date_of_birth"))
            or (((c.get("us") or {}).get("profile") or {}).get("date_of_birth")) or None)


def _person_figures(r) -> dict:
    u = (((r or {}).get("model") or {}).get("income") or {}).get("us") or {}
    return {"seEarningsUsd": _n(u.get("seEarningsUsd")), "seEarningsFromIndiaUsd": _n(u.get("seEarningsFromIndiaUsd")),
            "medicareWagesUsd": _n(u.get("medicareWages")) or _n((u.get("wages") or {}).get("usd"))}


def _is_nra_us(c) -> bool:
    r = (c.get("us") or {}).get("us_residency_detail") or {}
    if r.get("is_us_citizen") is True or r.get("has_green_card") is True:
        return False
    return r.get("final_us_residency_status") == "NON_RESIDENT_ALIEN"


def _joint_lead_first(a, b) -> bool:
    na, nb = _is_nra_us(a), _is_nra_us(b)
    if na != nb:
        return not na
    return str(a.get("id")) <= str(b.get("id"))


def joint_profile(a, b, persons=None) -> dict:
    us = _merge_section(a.get("us"), b.get("us"), US_IDENTITY)
    us.setdefault("profile", {})
    us["profile"]["filing_status"] = "mfj"
    deps = _dep(a) + _dep(b)
    us["profile"]["dependents_count"] = int(deps) if float(deps).is_integer() else deps
    us["profile"]["spouse_date_of_birth"] = _dob_of(b)
    us["profile"]["spouse_is_blind"] = (((b.get("us") or {}).get("profile") or {}).get("is_blind")) is True
    if persons:
        us["household_persons"] = persons
    india = _merge_section(a.get("india"), b.get("india"), INDIA_IDENTITY)
    # The treaty section is the lead spouse's (residence, tie-breaker), but
    # each spouse's treaty elections carry their own Indian income (e.g. a
    # royalty entered only there): the joint return keeps both.
    ea = (((a.get("india") or {}).get("dtaa") or {}).get("treaty_elections")) or []
    eb = (((b.get("india") or {}).get("dtaa") or {}).get("treaty_elections")) or []
    if ea or eb:
        india["dtaa"] = dict(india.get("dtaa") or _clone(((b.get("india") or {}).get("dtaa")) or {}))
        india["dtaa"]["treaty_elections"] = _clone(ea) + _clone(eb)
    return {"router": _clone(a.get("router") or {}), "india": india, "us": us}


def _with_status(c, status):
    us = _clone(c.get("us") or {})
    us.setdefault("profile", {})
    us["profile"]["filing_status"] = status
    return {"router": _clone(c.get("router") or {}), "india": _clone(c.get("india") or {}), "us": us}


def _own(c):
    return {"router": _clone(c.get("router") or {}), "india": _clone(c.get("india") or {}), "us": _clone(c.get("us") or {})}


def split_joint_us_tax(joint_tax_usd, separate_tax_a_usd, separate_tax_b_usd) -> dict:
    """Decision 1 (docs/HOUSEHOLD_DESIGN.md section 8) — method A, confirmed by the CA 30 Sep 2026; the one function to change if that is ever revisited."""
    total = separate_tax_a_usd + separate_tax_b_usd
    share_a = separate_tax_a_usd / total if total > 0 else 0.5
    return {"method": "A", "methodLabel": "in proportion to the US tax each spouse would owe filing separately",
            "shareA": share_a, "shareB": 1 - share_a, "aUsd": joint_tax_usd * share_a, "bUsd": joint_tax_usd * (1 - share_a)}


def _n(v) -> float:
    return v if _is_num(v) and math.isfinite(v) else 0


def _spouse_name(c, r) -> str:
    nm = ((r or {}).get("summary") or {}).get("name")
    if nm and nm != "Unnamed Taxpayer":
        return nm
    return ((c.get("router") or {}).get("full_name")) or (((c.get("us") or {}).get("profile") or {}).get("full_name")) or c.get("id")


def analyze_household(a, b, analyze_fn) -> dict:
    check = check_household_link(a, b)
    if not check["linked"]:
        return {"linked": False, "blocked": True, "errors": []}
    if check["errors"]:
        return {"linked": True, "blocked": True, "errors": check["errors"], "status": check["status"]}

    own_a, own_b = analyze_fn(_own(a)), analyze_fn(_own(b))
    status = check["status"]
    spouses = []
    for c, r in ((a, own_a), (b, own_b)):
        u, fi = r["computed"]["usTax"], r["computed"]["ftc"]["india"]
        spouses.append({
            "id": c.get("id"), "name": _spouse_name(c, r),
            "indiaTaxUsd": _n(r["computed"]["indiaTax"]["totalTaxUsd"]),
            "indiaReliefCapUsd": _n(fi["reliefCapUsd"]),
            "indiaReliefSingleProfileUsd": _n(fi["reliefAllowedUsd"]),
            "usSourceFraction": min(1, _n(u["usSourceIncomeUsd"]) / _n(u["totalIncomeUsd"])) if _n(u["totalIncomeUsd"]) > 0 else 0,
            "ownReturnIncomeTaxUsd": _n(u["incomeTaxUsd"]),
            "ownReturnTotalTaxUsd": _n(u["totalTaxBeforeFtcUsd"]),
        })
    out = {"linked": True, "blocked": False, "errors": [], "status": status, "spouses": spouses, "jointUs": None, "split": None}

    if status == "mfs":
        for s in spouses:
            s["usTaxShareUsd"] = s["ownReturnIncomeTaxUsd"]
            s["indiaReliefHouseholdUsd"] = s["indiaReliefSingleProfileUsd"]
        return out

    sep_a, sep_b = analyze_fn(_with_status(a, "mfs")), analyze_fn(_with_status(b, "mfs"))
    # Same joint return from either spouse's page — see household.js.
    pa, pb = _person_figures(own_a), _person_figures(own_b)
    joint = analyze_fn(joint_profile(a, b, [pa, pb]) if _joint_lead_first(a, b) else joint_profile(b, a, [pb, pa]))
    ju, jf = joint["computed"]["usTax"], joint["computed"]["ftc"]["us"]
    india_tax_paid = _n(own_a["computed"]["ftc"]["us"]["indiaTaxPaidUsd"]) + _n(own_b["computed"]["ftc"]["us"]["indiaTaxPaidUsd"])
    out["jointUs"] = {
        "incomeTaxUsd": _n(ju["incomeTaxUsd"]),
        "totalTaxBeforeFtcUsd": _n(ju["totalTaxBeforeFtcUsd"]),
        "totalIncomeUsd": _n(ju["totalIncomeUsd"]),
        "taxableIncomeUsd": _n(ju["taxableIncomeUsd"]),
        "indiaTaxPaidUsd": india_tax_paid,
        "ftcLimitUsd": _n(jf["ftcLimitUsd"]),
        "ftcAllowedUsd": min(india_tax_paid, _n(jf["ftcLimitUsd"])),
    }
    split = split_joint_us_tax(_n(ju["incomeTaxUsd"]), _n(sep_a["computed"]["usTax"]["incomeTaxUsd"]), _n(sep_b["computed"]["usTax"]["incomeTaxUsd"]))
    out["split"] = split
    spouses[0]["separateReturnIncomeTaxUsd"] = _n(sep_a["computed"]["usTax"]["incomeTaxUsd"])
    spouses[1]["separateReturnIncomeTaxUsd"] = _n(sep_b["computed"]["usTax"]["incomeTaxUsd"])
    spouses[0]["share"], spouses[1]["share"] = split["shareA"], split["shareB"]
    spouses[0]["usTaxShareUsd"], spouses[1]["usTaxShareUsd"] = split["aUsd"], split["bUsd"]
    for s in spouses:
        s["indiaReliefHouseholdUsd"] = min(s["usTaxShareUsd"] * s["usSourceFraction"], s["indiaReliefCapUsd"])
    return out
