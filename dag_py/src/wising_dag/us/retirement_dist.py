"""US retirement distributions (Form 1099-R) and §72(t). Mirror of
prototypes/graph-pilot/retirement-dist.js (see its header)."""
from __future__ import annotations

import re

from ..core.util import num

PLAN_TYPES = ("ira", "roth_ira", "401k", "pension", "other_plan")
EXCEPTIONS = ("none", "sepp", "separation_age_55", "disability", "death", "medical", "first_home", "education", "birth_adoption", "other")


def _ymd(s):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(s or ""))
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def age_59_half_date(dob_raw):
    d = _ymd(dob_raw)
    if not d:
        return None
    y, m = d[0] + 59, d[1] + 6
    if m > 12:
        m -= 12
        y += 1
    return (y, m, d[2])


def rows(us) -> list:
    ui = ((us or {}).get("income_us_source") or {}) if isinstance(us, dict) else {}
    out = []
    lst = ui.get("retirement_distributions")
    for r in (lst if isinstance(lst, list) else []):
        if not isinstance(r, dict) or r.get("rolled_over") is True or not num(r.get("taxable_usd")) > 0:
            continue
        pt = r.get("payment_type")
        out.append({
            "planType": r.get("plan_type") if r.get("plan_type") in PLAN_TYPES else "other_plan",
            "payerName": r.get("payer_name") or None, "taxableUsd": num(r.get("taxable_usd")),
            "paymentType": "lump_sum" if pt == "lump_sum" else ("periodic" if pt == "periodic" else None),
            "exception": r.get("early_exception") if r.get("early_exception") in EXCEPTIONS else "none",
            "datePaid": r.get("date_paid") or None, "withheldUsd": num(r.get("federal_withheld_usd")), "legacy": False,
        })
    for plan, amt in (("ira", num(ui.get("ira_distributions_usd"))), ("401k", num(ui.get("401k_distributions_usd"))), ("pension", num(ui.get("pension_income_usd")))):
        if amt > 0:
            out.append({"planType": plan, "payerName": None, "taxableUsd": amt, "paymentType": "periodic" if plan == "pension" else None,
                        "exception": "pension_legacy" if plan == "pension" else "none", "datePaid": None, "withheldUsd": 0, "legacy": True})
    return out


def totals(us) -> dict:
    t = {"iraUsd": 0.0, "k401Usd": 0.0, "pensionUsd": 0.0, "otherUsd": 0.0, "totalUsd": 0.0, "lumpSumUsd": 0.0, "periodicUsd": 0.0}
    for r in rows(us):
        k = "iraUsd" if r["planType"] in ("ira", "roth_ira") else "k401Usd" if r["planType"] == "401k" else "pensionUsd" if r["planType"] == "pension" else "otherUsd"
        t[k] += r["taxableUsd"]
        t["totalUsd"] += r["taxableUsd"]
        if r["paymentType"] == "lump_sum":
            t["lumpSumUsd"] += r["taxableUsd"]
        else:
            t["periodicUsd"] += r["taxableUsd"]
    return t


def is_early(r, dob_raw, base_year) -> bool:
    h = age_59_half_date(dob_raw)
    if not h:
        return False
    paid = _ymd(r["datePaid"])
    try:
        yr = int(base_year) if base_year else 2026
    except (TypeError, ValueError):
        yr = 2026
    return (paid < h) if paid else ((yr, 12, 31) < h)


def early_72t_rows(us, dob_raw, base_year) -> list:
    return [r for r in rows(us) if r["exception"] == "none" and is_early(r, dob_raw, base_year)]


def early_72t_base_usd(us, dob_raw, base_year, payment_type=None) -> float:
    total = 0.0
    for r in early_72t_rows(us, dob_raw, base_year):
        if payment_type is None or (r["paymentType"] == "lump_sum") == (payment_type == "lump_sum"):
            total += r["taxableUsd"]
    return total


def excepted_early_usd(us, dob_raw, base_year) -> float:
    return sum(r["taxableUsd"] for r in rows(us) if r["exception"] not in ("none", "pension_legacy") and is_early(r, dob_raw, base_year))


# DTAA Art. 20(1) / §72(t) on a 1040-NR — see retirement-dist.js.
TREATY_EXEMPTS_72T = True


def treaty_periodic_exempt(us, india) -> bool:
    u = ((us or {}).get("nra_specific") or {}) if isinstance(us, dict) else {}
    r = ((us or {}).get("us_residency_detail") or {}) if isinstance(us, dict) else {}
    nra_filer = u.get("files_form_1040nr") is True and r.get("is_us_citizen") is not True and u.get("s6013h_joint_election") is not True
    rd = ((india or {}).get("residency_detail") or {}) if isinstance(india, dict) else {}
    india_resident = rd.get("final_india_residency_status") != "NR"
    return TREATY_EXEMPTS_72T and nra_filer and india_resident


def early_72t_base_after_treaty_usd(us, india, dob_raw, base_year) -> float:
    if treaty_periodic_exempt(us, india):
        return early_72t_base_usd(us, dob_raw, base_year, "lump_sum")
    return early_72t_base_usd(us, dob_raw, base_year)
