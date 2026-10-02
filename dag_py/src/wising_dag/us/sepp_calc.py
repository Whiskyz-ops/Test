"""The annual amount a SEPP must pay under the three methods of Notice 2022-6.
Mirror of prototypes/graph-pilot/sepp-calc.js (see its header)."""
from __future__ import annotations

import re

from ..core.util import js_round, num
from . import sepp_tables as T


def _year_of(s):
    m = re.match(r"^(\d{4})-\d{2}-\d{2}", str(s or ""))
    return int(m.group(1)) if m else None


def _cents(x):
    return js_round(x * 100) / 100


def _clamp(a):
    return max(0, min(120, a))


def _blank(v):
    return v is None or v == ""


def life_expectancy(table, age, beneficiary_age):
    if age is None or age < 0:
        return None
    if table == "uniform":
        return T.UNIFORM_FROM_10[_clamp(age) - 10] if age >= 10 else None
    if table == "joint":
        return None if beneficiary_age is None or beneficiary_age < 0 else T.JOINT[_clamp(age)][_clamp(beneficiary_age)]
    return T.SINGLE[_clamp(age)]


def _survival(x, t):
    p = 1.0
    for k in range(t):
        p *= 1 - (T.MORTALITY[x + k] if x + k <= 120 else 1)
    return p


def annuity_factor(age, beneficiary_age, rate):
    v = 1 / (1 + rate)
    f = 0.0
    for t in range(1, 131):
        px = _survival(age, t)
        p = px if beneficiary_age is None else px + _survival(beneficiary_age, t) - px * _survival(beneficiary_age, t)
        if p < 1e-12:
            break
        f += p * v ** t
    return f


def amortization_factor(years, rate):
    return (1 - (1 + rate) ** -years) / rate if rate > 0 else years


def required(r, dob_raw, base_year) -> dict:
    try:
        year = int(base_year) if base_year else 2026
    except (TypeError, ValueError):
        year = 2026
    birth_year, start_year, ben_year = _year_of(dob_raw), _year_of(r.get("sepp_start_date")), _year_of(r.get("sepp_beneficiary_dob"))
    table = r.get("sepp_life_table") if r.get("sepp_life_table") in ("single", "uniform", "joint") else "single"
    method = r.get("sepp_method") if r.get("sepp_method") in ("rmd", "amortization", "annuitization") else None
    use_rmd = method == "rmd" or (method is not None and r.get("sepp_switched_to_rmd") is True)
    out = {"method": method, "usesRmd": bool(use_rmd), "switchedToRmd": method != "rmd" and bool(use_rmd), "annualUsd": None, "factor": None,
           "factorKind": None, "age": None, "beneficiaryAge": None, "table": table, "missing": [], "rate": None}
    if not method:
        out["missing"].append("sepp_method")
        return out
    if birth_year is None:
        out["missing"].append("date_of_birth")
    if table == "joint" and ben_year is None:
        out["missing"].append("sepp_beneficiary_dob")
    basis_year = year if use_rmd else start_year
    if not use_rmd and start_year is None:
        out["missing"].append("sepp_start_date")
    if birth_year is not None and basis_year is not None:
        out["age"] = basis_year - birth_year
    if ben_year is not None and basis_year is not None and table == "joint":
        out["beneficiaryAge"] = basis_year - ben_year
    if not use_rmd:
        pct, fmr = r.get("sepp_interest_rate_pct"), r.get("sepp_federal_midterm_pct")
        if _blank(pct):
            out["missing"].append("sepp_interest_rate_pct")
        else:
            limit = js_round(max(5, 0 if _blank(fmr) else 1.2 * num(fmr)) * 10000) / 10000
            out["rate"] = {"pct": num(pct), "limitPct": limit, "over": num(pct) > limit + 1e-9, "midtermGiven": not _blank(fmr)}
        if not num(r.get("sepp_start_balance_usd")) > 0:
            out["missing"].append("sepp_start_balance_usd")
    elif not num(r.get("sepp_balance_usd")) > 0:
        out["missing"].append("sepp_balance_usd")
    if out["missing"]:
        return out
    if use_rmd or method == "amortization":
        le = life_expectancy(table, out["age"], out["beneficiaryAge"])
        if le is None:
            out["missing"].append("life_expectancy")
            return out
        if use_rmd:
            out["factor"], out["factorKind"], out["annualUsd"] = le, "life_expectancy", _cents(num(r.get("sepp_balance_usd")) / le)
            return out
        out["factor"], out["factorKind"], out["lifeExpectancy"] = amortization_factor(le, out["rate"]["pct"] / 100), "amortization", le
    else:
        out["factor"], out["factorKind"] = annuity_factor(out["age"], out["beneficiaryAge"] if table == "joint" else None, out["rate"]["pct"] / 100), "annuity"
    out["annualUsd"] = _cents(num(r.get("sepp_start_balance_usd")) / out["factor"])
    return out


def differs(paid_usd, required_usd) -> bool:
    return abs(paid_usd - required_usd) > max(2, required_usd * 0.001)
