"""US retirement distributions (Form 1099-R) and §72(t). Mirror of
prototypes/graph-pilot/retirement-dist.js (see its header)."""
from __future__ import annotations

import datetime as _dt
import re

from ..core.util import js_round, num
from .irs_interest import interest as irs_interest
from .sepp_calc import differs as sepp_differs, required as sepp_required

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


def sepp_window_end(r, dob_raw):
    st = _ymd(r.get("sepp_start_date"))
    if not st:
        return None
    five = (st[0] + 5, st[1], st[2])
    h = age_59_half_date(dob_raw)
    return h if h and five < h else five


def _fmt_date(d):
    return f"{d[0]}-{d[1]:02d}-{d[2]:02d}" if d else None


def to_ymd(v):
    """[y, m, d] (UTC) from a date, datetime, ISO string or [y, m, d] — see retirement-dist.js toYmd."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        return tuple(v)
    if isinstance(v, _dt.datetime):
        v = v.astimezone(_dt.timezone.utc) if v.tzinfo else v
        return (v.year, v.month, v.day)
    if isinstance(v, _dt.date):
        return (v.year, v.month, v.day)
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(v))
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def as_of_from_ctx(ctx):
    v = ctx.get("monitorAsOfBoundary") if isinstance(ctx, dict) else None
    return to_ymd(v if v is not None else _dt.datetime.now(_dt.timezone.utc))


def _sepp_payments(r, year) -> list:
    lst = r.get("sepp_payments")
    out = []
    for p in (lst if isinstance(lst, list) else []):
        d = _ymd(p.get("date")) if isinstance(p, dict) else None
        a = num(p.get("amount_usd")) if isinstance(p, dict) else 0
        if d and d[0] == year and a > 0:
            out.append({"date": d, "amountUsd": a})
    out.sort(key=lambda p: p["date"])
    return out


def _row_taxable_usd(r, year) -> float:
    if num(r.get("taxable_usd")) > 0:
        return num(r.get("taxable_usd"))
    if r.get("early_exception") != "sepp":
        return 0
    total = 0.0
    for p in _sepp_payments(r, year):
        total += p["amountUsd"]
    return total


def sepp_analysis(r, dob_raw, base_year, as_of=None) -> dict:
    """Everything about one SEPP row for this tax year — see retirement-dist.js."""
    try:
        year = int(base_year) if base_year else 2026
    except (TypeError, ValueError):
        year = 2026
    today = to_ymd(as_of)
    calc = sepp_required(r, dob_raw, year)
    pays = _sepp_payments(r, year)
    if r.get("rolled_over") is True:
        paid_usd = 0
    elif pays:
        paid_usd = 0.0
        for p in pays:
            paid_usd += p["amountUsd"]
    else:
        paid_usd = num(r.get("taxable_usd"))
    st = _ymd(r.get("sepp_start_date"))
    first_year = bool(st) and st[0] == year
    req = calc["annualUsd"]
    tol = max(2, req * 0.001) if req is not None else 0
    over = req is not None and paid_usd > req + tol
    under = req is not None and paid_usd < req - tol
    year_over = today is None or (year, 12, 31) < today
    exhausted = r.get("sepp_account_exhausted") is True
    death_or_disability = r.get("sepp_change_reason") in ("death", "disability")
    employer_plan = r.get("plan_type") in ("401k", "pension", "other_plan")
    not_qualified = employer_plan and r.get("sepp_separated_from_service") is False
    separation_unknown = employer_plan and r.get("sepp_separated_from_service") is not True and r.get("sepp_separated_from_service") is not False
    mismatch = over or (under and year_over and not exhausted)
    short_so_far = under and not year_over and not exhausted
    auto_break = mismatch and not first_year and not death_or_disability
    marked = r.get("sepp_broken") is True and not death_or_disability and not exhausted
    over_date = None
    if over and pays:
        cum = 0.0
        for p in pays:
            cum += p["amountUsd"]
            if cum > req + tol:
                over_date = p["date"]
                break
    change = _ymd(r.get("sepp_change_date")) or (
        (over_date or ((year, 12, 31) if under else None) or _ymd(r.get("date_paid")) or (year, 12, 31)) if marked or auto_break else None)
    end = sepp_window_end(r, dob_raw)
    modified = (marked or auto_break) and change is not None
    broken = modified and (end is None or change < end)
    broken_this_year = broken and change[0] == year
    broken_earlier = broken and change[0] < year
    rec = (_sepp_recapture(r, calc, dob_raw, change) if broken_this_year
           else {"baseUsd": 0.0, "scheduleSource": None, "schedule": [], "interestUsd": 0, "interestStatus": None, "assumedRates": False, "yearsBeforeRates": []})
    period_over = bool(end and today and not today < end)
    hist_sched, hist_source = (rec["schedule"], rec["scheduleSource"]) if broken_this_year else _sepp_schedule(r, calc, dob_raw, year)
    history = [{"year": x["year"], "amountUsd": x["amountUsd"], "recaptureUsd": js_round(x["amountUsd"] * 10) / 100 if broken_this_year else None,
                "interestUsd": x.get("interestUsd") if broken_this_year else None} for x in hist_sched]
    history.append({"year": year, "amountUsd": paid_usd, "recaptureUsd": None, "interestUsd": None, "current": True})
    if not_qualified:
        status = "not_qualified"
    elif broken_this_year or broken_earlier:
        status = "broken"
    elif death_or_disability and r.get("sepp_broken") is True:
        status = "ended_exempt"
    elif exhausted:
        status = "exhausted"
    elif period_over:
        status = "period_ended"
    elif req is None:
        status = "unchecked"
    elif (mismatch and first_year) or (calc["rate"] and calc["rate"]["over"]) or (short_so_far and today and not today < (year, 11, 16)):
        status = "off_schedule"
    else:
        status = "on_track"
    return {"payerName": r.get("payer_name") or None, "planType": r.get("plan_type") or None, "calc": calc, "paidUsd": paid_usd,
            "startBalanceUsd": num(r.get("sepp_start_balance_usd")) or None, "balanceUsd": num(r.get("sepp_balance_usd")) or None,
            "payments": [{"date": _fmt_date(p["date"]), "amountUsd": p["amountUsd"]} for p in pays],
            "history": history, "historySource": hist_source,
            "requiredUsd": req, "remainingUsd": max(0, js_round((req - paid_usd) * 100) / 100) if req is not None else None,
            "shortSoFar": short_so_far, "over": over,
            "firstYear": first_year, "mismatch": mismatch, "autoBreak": auto_break, "status": status,
            "exhausted": exhausted, "changeReason": r.get("sepp_change_reason") if death_or_disability else None, "employerPlan": employer_plan,
            "notQualified": not_qualified, "separationUnknown": separation_unknown, "asOf": _fmt_date(today), "startDate": _fmt_date(st),
            "marked": marked, "changeDate": _fmt_date(change), "changeYear": change[0] if change else None,
            "periodEnd": _fmt_date(end), "missingStartDate": end is None,
            "age59HalfDate": _fmt_date(age_59_half_date(dob_raw)), "fiveYearDate": _fmt_date((st[0] + 5, st[1], st[2])) if st else None,
            "afterPeriod": modified and not broken,
            "brokenThisYear": broken_this_year, "brokenEarlier": broken_earlier,
            "priorPaymentsUsd": rec["baseUsd"], "schedule": rec["schedule"], "scheduleSource": rec["scheduleSource"], "interestUsd": rec["interestUsd"],
            "interestStatus": rec["interestStatus"], "assumedRates": rec["assumedRates"], "yearsBeforeRates": rec["yearsBeforeRates"],
            "interestTo": _fmt_date((change[0] + 1, 4, 15)) if broken_this_year else None,
            "losesException": not_qualified or broken_earlier or broken_this_year}


def _sepp_schedule(r, calc, dob_raw, until_year):
    """Earlier years' SEPP payments — see retirement-dist.js seppSchedule."""
    schedule, source, by, h, st = [], None, r.get("sepp_prior_payments_by_year"), age_59_half_date(dob_raw), _ymd(r.get("sepp_start_date"))
    if isinstance(by, dict):
        for y, a in by.items():
            try:
                n = int(y)
            except (TypeError, ValueError):
                continue
            if n < until_year and num(a) > 0:
                schedule.append({"year": n, "amountUsd": num(a)})
        if schedule:
            source = "entered"
    if not source and st and calc["annualUsd"] is not None and not calc["usesRmd"]:
        for y in range(st[0], until_year):
            if not h or (y, 12, 31) < h:
                schedule.append({"year": y, "amountUsd": calc["annualUsd"]})
        if schedule:
            source = "method"
    schedule.sort(key=lambda x: x["year"])
    return schedule, source


def _sepp_recapture(r, calc, dob_raw, change) -> dict:
    """The earlier payments, year by year, and the recapture interest — see retirement-dist.js seppRecapture."""
    schedule, source = _sepp_schedule(r, calc, dob_raw, change[0])
    total_sum = 0.0
    for x in schedule:
        total_sum += x["amountUsd"]
    total = max(0.0, num(r.get("sepp_prior_payments_usd")))
    base_usd = total if total > 0 else total_sum
    out = {"baseUsd": base_usd, "scheduleSource": source, "schedule": schedule, "interestUsd": 0, "interestStatus": "no_schedule",
           "assumedRates": False, "yearsBeforeRates": []}
    if not schedule:
        return out
    if abs(total_sum - base_usd) > max(2 * len(schedule), base_usd * 0.001):
        out["interestStatus"] = "schedule_differs"
        return out
    to_date, total_interest = (change[0] + 1, 4, 15), 0.0
    for x in schedule:
        res = irs_interest(x["amountUsd"] * 0.10, (x["year"] + 1, 4, 15), to_date)
        x["interestUsd"] = res["interestUsd"]
        if res["beforeTable"]:
            out["yearsBeforeRates"].append(x["year"])
        else:
            total_interest += res["interestUsd"]
        if res["assumedAfter"]:
            out["assumedRates"] = True
    out["interestUsd"] = js_round(total_interest * 100) / 100
    out["interestStatus"] = "before_rates" if out["yearsBeforeRates"] else "computed"
    return out


def _sepp_lost(r, dob_raw, base_year, as_of=None) -> bool:
    return r.get("early_exception") == "sepp" and sepp_analysis(r, dob_raw, base_year, as_of)["losesException"]


def _treaty_periodic(r) -> bool:
    return r["paymentType"] != "lump_sum" and not r["seppBroken"]


def rows(us, dob_raw=None, base_year=None, as_of=None) -> list:
    try:
        yr = int(base_year) if base_year else 2026
    except (TypeError, ValueError):
        yr = 2026
    ui = ((us or {}).get("income_us_source") or {}) if isinstance(us, dict) else {}
    out = []
    lst = ui.get("retirement_distributions")
    for r in (lst if isinstance(lst, list) else []):
        if not isinstance(r, dict) or r.get("rolled_over") is True or not _row_taxable_usd(r, yr) > 0:
            continue
        pt = r.get("payment_type")
        out.append({
            "planType": r.get("plan_type") if r.get("plan_type") in PLAN_TYPES else "other_plan",
            "payerName": r.get("payer_name") or None, "taxableUsd": _row_taxable_usd(r, yr),
            "paymentType": "lump_sum" if pt == "lump_sum" else ("periodic" if pt == "periodic" else None),
            "exception": "none" if _sepp_lost(r, dob_raw, base_year, as_of) else (r.get("early_exception") if r.get("early_exception") in EXCEPTIONS else "none"),
            "seppBroken": _sepp_lost(r, dob_raw, base_year, as_of),
            "datePaid": r.get("date_paid") or None, "withheldUsd": num(r.get("federal_withheld_usd")), "legacy": False,
        })
    for plan, amt in (("ira", num(ui.get("ira_distributions_usd"))), ("401k", num(ui.get("401k_distributions_usd"))), ("pension", num(ui.get("pension_income_usd")))):
        if amt > 0:
            out.append({"planType": plan, "payerName": None, "taxableUsd": amt, "paymentType": "periodic" if plan == "pension" else None,
                        "exception": "pension_legacy" if plan == "pension" else "none", "seppBroken": False, "datePaid": None, "withheldUsd": 0, "legacy": True})
    return out


def totals(us, dob_raw=None, base_year=None, as_of=None) -> dict:
    t = {"iraUsd": 0.0, "k401Usd": 0.0, "pensionUsd": 0.0, "otherUsd": 0.0, "totalUsd": 0.0, "lumpSumUsd": 0.0, "periodicUsd": 0.0}
    for r in rows(us, dob_raw, base_year, as_of):
        k = "iraUsd" if r["planType"] in ("ira", "roth_ira") else "k401Usd" if r["planType"] == "401k" else "pensionUsd" if r["planType"] == "pension" else "otherUsd"
        t[k] += r["taxableUsd"]
        t["totalUsd"] += r["taxableUsd"]
        if _treaty_periodic(r):
            t["periodicUsd"] += r["taxableUsd"]
        else:
            t["lumpSumUsd"] += r["taxableUsd"]
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


def early_72t_rows(us, dob_raw, base_year, as_of=None) -> list:
    return [r for r in rows(us, dob_raw, base_year, as_of) if r["exception"] == "none" and is_early(r, dob_raw, base_year)]


def early_72t_base_usd(us, dob_raw, base_year, payment_type=None, as_of=None) -> float:
    total = 0.0
    for r in early_72t_rows(us, dob_raw, base_year, as_of):
        if payment_type is None or (not _treaty_periodic(r)) == (payment_type == "lump_sum"):
            total += r["taxableUsd"]
    return total


def excepted_early_usd(us, dob_raw, base_year, as_of=None) -> float:
    return sum(r["taxableUsd"] for r in rows(us, dob_raw, base_year, as_of) if r["exception"] not in ("none", "pension_legacy") and is_early(r, dob_raw, base_year))


# DTAA Art. 20(1) / §72(t) on a 1040-NR — see retirement-dist.js.
# Confirmed by the CPA (2 Oct 2026) — see retirement-dist.js.
TREATY_EXEMPTS_72T = True


def treaty_periodic_exempt(us, india) -> bool:
    u = ((us or {}).get("nra_specific") or {}) if isinstance(us, dict) else {}
    r = ((us or {}).get("us_residency_detail") or {}) if isinstance(us, dict) else {}
    nra_filer = u.get("files_form_1040nr") is True and r.get("is_us_citizen") is not True and u.get("s6013h_joint_election") is not True
    rd = ((india or {}).get("residency_detail") or {}) if isinstance(india, dict) else {}
    india_resident = rd.get("final_india_residency_status") != "NR"
    return TREATY_EXEMPTS_72T and nra_filer and india_resident


def early_72t_base_after_treaty_usd(us, india, dob_raw, base_year, as_of=None) -> float:
    if treaty_periodic_exempt(us, india):
        return early_72t_base_usd(us, dob_raw, base_year, "lump_sum", as_of)
    return early_72t_base_usd(us, dob_raw, base_year, None, as_of)


def sepp_status(us, dob_raw, base_year, as_of=None) -> dict:
    ui = ((us or {}).get("income_us_source") or {}) if isinstance(us, dict) else {}
    lst = ui.get("retirement_distributions")
    out = {"recaptureBaseUsd": 0.0, "interestUsd": 0.0, "rows": []}
    for r in (lst if isinstance(lst, list) else []):
        if not isinstance(r, dict) or r.get("early_exception") != "sepp":
            continue
        a = sepp_analysis(r, dob_raw, base_year, as_of)
        out["rows"].append(a)
        if a["brokenThisYear"]:
            out["recaptureBaseUsd"] += a["priorPaymentsUsd"]
            out["interestUsd"] += a["interestUsd"]
    return out


def sepp_recapture_base_usd(us, dob_raw=None, base_year=None, as_of=None) -> float:
    return sepp_status(us, dob_raw, base_year, as_of)["recaptureBaseUsd"]


def additional_tax_72t_usd(us, india, dob_raw, base_year, as_of=None) -> float:
    sepp = sepp_status(us, dob_raw, base_year, as_of)
    return (early_72t_base_after_treaty_usd(us, india, dob_raw, base_year, as_of) + sepp["recaptureBaseUsd"]) * 0.10 + sepp["interestUsd"]


def sepp_tracker(ctx) -> dict | None:
    """The Monitor's SEPP tracker — see retirement-dist.js seppTracker."""
    router, india, us = ctx.get("router") or {}, ctx.get("india") or {}, ctx.get("us") or {}
    dob = router.get("date_of_birth")
    if dob is None:
        dob = (india.get("profile") or {}).get("date_of_birth")
    if dob is None:
        dob = (us.get("profile") or {}).get("date_of_birth")
    from .treaty_art22 import base_year_of
    by = base_year_of(ctx.get("router"), ctx.get("us"))
    st = sepp_status(ctx.get("us"), dob, by, as_of_from_ctx(ctx))
    return {"taxYear": by, "series": st["rows"]} if st["rows"] else None


def fmt2(x) -> str:
    """Dollars and cents by integer cents — see retirement-dist.js fmt2."""
    c = int(js_round(abs(x) * 100))
    return ("-$" if x < 0 else "$") + f"{c // 100:,}" + "." + f"{c % 100:02d}"


def _ctx_dob(ctx):
    router, india, us = ctx.get("router") or {}, ctx.get("india") or {}, ctx.get("us") or {}
    dob = router.get("date_of_birth")
    if dob is None:
        dob = (india.get("profile") or {}).get("date_of_birth")
    if dob is None:
        dob = (us.get("profile") or {}).get("date_of_birth")
    return dob


def form_5329(ctx) -> dict:
    """Form 5329 trigger and line-4 explanation — see retirement-dist.js form5329."""
    from .treaty_art22 import base_year_of
    dob, by, as_of = _ctx_dob(ctx), base_year_of(ctx.get("router"), ctx.get("us")), as_of_from_ctx(ctx)
    tax_usd = additional_tax_72t_usd(ctx.get("us"), ctx.get("india"), dob, by, as_of)
    excepted_usd = excepted_early_usd(ctx.get("us"), dob, by, as_of)
    st = sepp_status(ctx.get("us"), dob, by, as_of)
    lines = []
    for a in [a for a in st["rows"] if a["brokenThisYear"]]:
        lines.append((a["payerName"] or "SEPP series") + ": substantially equal periodic payments begun " + (a["startDate"] or "(start date not entered)")
                     + ", modified " + a["changeDate"] + " (before " + (a["periodEnd"] or "the end of the required period") + ").")
        if a["schedule"] and a["interestStatus"] in ("computed", "before_rates"):
            lines.append("Year | SEPP payments | 10% additional tax | Interest to " + a["interestTo"])
            s = t = n = 0.0
            for x in a["schedule"]:
                s += x["amountUsd"]
                t += x["amountUsd"] * 0.10
                n += x.get("interestUsd") or 0
                lines.append(f"{x['year']} | {fmt2(x['amountUsd'])} | {fmt2(x['amountUsd'] * 0.10)} | "
                             + ("not computed (before 2017)" if x.get("interestUsd") is None else fmt2(x["interestUsd"])))
            lines.append(f"Total | {fmt2(s)} | {fmt2(t)} | {fmt2(n)}")
        else:
            lines.append("Earlier SEPP payments before 59½ (total; no yearly amounts): " + fmt2(a["priorPaymentsUsd"]) + " | 10%: "
                         + fmt2(a["priorPaymentsUsd"] * 0.10) + " | interest not computed")
        lines.append("Recapture tax: 10% of " + fmt2(a["priorPaymentsUsd"]) + " = " + fmt2(a["priorPaymentsUsd"] * 0.10) + ", plus interest "
                     + fmt2(a["interestUsd"]) + " = " + fmt2(a["priorPaymentsUsd"] * 0.10 + a["interestUsd"]) + ".")
    if lines:
        lines.append("Interest: IRS underpayment rate (IRC §6621(a)(2)), compounded daily (§6622), on each year's 10% from 15 April of the following year to the due date of this return.")
    return {"required": tax_usd > 0 or excepted_usd > 0, "taxUsd": tax_usd, "exceptedUsd": excepted_usd,
            "attachment": ("Form 5329, line 4 — recapture tax under IRC §72(t)(4)\n" + "\n".join(lines)) if lines else None}


def additional_tax_72t_parts(ctx, treaty) -> dict:
    """The §72(t) additional tax split into its parts — see retirement-dist.js additionalTax72tParts."""
    from .treaty_art22 import base_year_of
    dob, by, as_of = _ctx_dob(ctx), base_year_of(ctx.get("router"), ctx.get("us")), as_of_from_ctx(ctx)
    early_base = early_72t_base_after_treaty_usd(ctx.get("us"), ctx.get("india"), dob, by, as_of) if treaty else early_72t_base_usd(ctx.get("us"), dob, by, None, as_of)
    st = sepp_status(ctx.get("us"), dob, by, as_of)
    return {"earlyBaseUsd": early_base, "earlyUsd": early_base * 0.10, "recaptureBaseUsd": st["recaptureBaseUsd"], "recaptureUsd": st["recaptureBaseUsd"] * 0.10,
            "interestUsd": st["interestUsd"], "series": [a for a in st["rows"] if a["brokenThisYear"]]}
