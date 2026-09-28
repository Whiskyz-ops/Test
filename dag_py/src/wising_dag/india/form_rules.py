"""Rules for Layer 1 India inputs the engine used to ignore — mirrors the JS
DAG exactly (in1-nodes-v3.js s80gDeductionInr / sumAllowed / dedS80D /
indiaSelfSeniorV3, aggregateindiaincome-nodes.js esopPerquisiteInr,
india-compliance.js trcOnFile)."""
from __future__ import annotations

import re
from datetime import datetime

from ..core.util import num, safe
from . import constants as C

T = C.INDIA


def esop_perquisite_inr(sal) -> float:
    total = safe(sal, "esop_perquisite_inr", None)
    if total is not None and total != "" and num(total) != 0:
        return num(total)
    return sum(num((ev or {}).get("perquisite_value_inr")) for ev in (safe(sal, "esop_perquisite_events", []) or []))


def s80g_deduction_inr(items, adjusted_gti_inr) -> float:
    no100 = no50 = lim100 = lim50 = 0.0
    for it in items or []:
        a = num((it or {}).get("donation_amount_inr"))
        if not a > 0:
            continue
        c = it.get("category")
        if c == "100_percent_no_limit":
            no100 += a
        elif c == "50_percent_no_limit":
            no50 += a
        elif c == "100_percent_with_qualifying_limit":
            lim100 += a
        elif c == "50_percent_with_qualifying_limit":
            lim50 += a
    limit = max(0.0, adjusted_gti_inr) * T["S80G_QUALIFYING_LIMIT_RATE"]
    q100 = min(lim100, limit)
    q50 = min(lim50, limit - q100)
    return no100 + 0.5 * no50 + q100 + 0.5 * q50


def loss_origin_fy_start(e):
    raw = (e or {}).get("fy") if (e or {}).get("fy") is not None else (e or {}).get("assessment_year")
    m = re.search(r"(19|20)\d{2}", "" if raw is None else str(raw))
    if not m:
        return None
    y = int(m.group(0))
    return y - 1 if re.search(r"\bAY", str(raw), re.I) else y


def self_senior(ctx) -> bool:
    dob = safe(ctx.get("router"), "date_of_birth", safe(ctx.get("india"), "profile.date_of_birth", None))
    if not dob:
        return False
    try:
        b = datetime.fromisoformat(str(dob)[:10])
    except ValueError:
        return False
    fy_end_year = int(num(safe(ctx.get("router"), "base_tax_year", 0)) or 2026) + 1
    return fy_end_year - b.year - (1 if b.month > 3 else 0) >= 60  # age on 31 March of the year's end


def dedS80D(d, ctx) -> float:
    x = safe(ctx.get("india"), "deductions.s80D", {}) or {}
    caps = T["S80D_CAPS"]
    parents_senior = x.get("parents_are_senior") is True
    chk_self = min(num(x.get("self_family_preventive_checkup_inr")), caps["preventiveCheckup"])
    chk_par = min(num(x.get("parents_preventive_checkup_inr")), caps["preventiveCheckup"] - chk_self)
    par_med = num(x.get("parents_medical_expenditure_inr")) if parents_senior and x.get("parents_has_health_insurance") is False else 0
    return (min(num(x.get("self_family_premium_inr")) + chk_self, caps["selfSenior"] if d["indiaSelfSeniorV3"] else caps["selfNonSenior"]) +
            min(num(x.get("parents_premium_inr")) + chk_par + par_med, caps["parentsSenior"] if parents_senior else caps["parentsNonSenior"]))


def trc_covers_year(india, router) -> bool:
    trc = safe(india, "compliance_docs.trc", {}) or {}
    fy = int(num((router or {}).get("base_tax_year") if isinstance(router, dict) else 0) or 2026)
    fy_start, fy_end = f"{fy}-04-01", f"{fy + 1}-03-31"
    if trc.get("validity_end_date") and str(trc["validity_end_date"]) < fy_start:
        return False
    if trc.get("validity_start_date") and str(trc["validity_start_date"]) > fy_end:
        return False
    return True


def trc_on_file(india, router) -> bool:
    flag = safe(india, "dtaa.trc_status", False) is True or safe(india, "compliance_docs.trc.document_uploaded", False) is True
    return flag and trc_covers_year(india, router)


# Advance-tax interest (s.424/s.425 of the 2025 Act; ss.234B/234C of 1961) —
# see india-compliance.js: cumulative instalments (15/45/75/100%), 12%/36%
# safe harbours, presumptive = 100% by 15 March, Rule 119A rounding.
_ADV_TAX_SCHEDULE = ((0.15, 0.12, 3), (0.45, 0.36, 3), (0.75, None, 3), (1.00, None, 1))


def _floor100(x):
    return (max(0.0, x) // 100) * 100


def advance_tax_shortfalls(assessed_tax_inr, paid_by_quarter, purely_presumptive):
    paid = [num(x) for x in paid_by_quarter]
    if purely_presumptive:
        total = sum(paid)
        return [{"quarter": "single", "requiredPct": 1.00, "cumPaidInr": total, "shortInr": max(0.0, assessed_tax_inr - total), "months": 1}]
    out, cum_paid = [], 0.0
    for i, (cum, safe_pct, months) in enumerate(_ADV_TAX_SCHEDULE):
        cum_paid += paid[i]
        short = 0.0 if safe_pct is not None and cum_paid >= safe_pct * assessed_tax_inr else max(0.0, cum * assessed_tax_inr - cum_paid)
        out.append({"quarter": i + 1, "requiredPct": cum, "cumPaidInr": cum_paid, "shortInr": short, "months": months})
    return out


def interest_234c(assessed_tax_inr, paid_by_quarter, purely_presumptive):
    if not assessed_tax_inr > 0:
        return 0.0
    return sum(_floor100(q["shortInr"]) * 0.01 * q["months"] for q in advance_tax_shortfalls(assessed_tax_inr, paid_by_quarter, purely_presumptive))


def interest_234b(assessed_tax_inr, advance_paid_inr, months):
    if not assessed_tax_inr > 0 or advance_paid_inr >= assessed_tax_inr * 0.9:
        return 0.0
    return _floor100(assessed_tax_inr - advance_paid_inr) * 0.01 * months
