"""monitor() — the "always-on" monitoring layer (LIM-7). Port of
prototypes/graph-pilot/report-batch6-nodes.js.

Four pieces: residency day-counters + a predicted "flip" date, threshold
breach projections off `limitsResult`, a compliance calendar of filing
deadlines with countdowns, and a compliance-health score + capped alerts
feed built from findings + the three pieces above.

Unlike report-batch6-nodes.js's own nodes (which read `ctx.model`/
`ctx.computed` and get closed later by agg10-nodes.js's synthetic-ctx
wrapping — a JS-only technique to reuse one function body against two
different ctx shapes), this port's nodes read the real in-graph deps
directly (`entityResult`/`metaResult`/`residencyModelSliceResult`/
`companyResidencyResult`/`residencyResult`/`limitsResult`/`findingsAllResult`)
— there's no reason to carry the indirection in Python, since there's only
ever one ctx shape here.

`monitorAsOfBoundary` is the one place in this file — same as
`presumptiveLockinAgg`/`msmeDisallowanceTotalAgg` elsewhere in this port —
that reads real wall-clock "now", via `ctx["monitorAsOfBoundary"]` per this
port's architecture rule. Normalized to a naive `datetime` throughout (same
fix this port applied everywhere else date arithmetic meets a possibly
tz-aware "now") since every other date here (`mdate()`-built filing
deadlines) is naive.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..core.graph import NodeDef
from ..core.util import js_num_str, js_round


def _monitor_as_of_boundary(d, ctx):
    now = ctx.get("monitorAsOfBoundary")
    if now is None:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    if isinstance(now, str):
        now = datetime.fromisoformat(now)
    if isinstance(now, datetime) and now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    return now


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _add_days(d: datetime, n: float) -> datetime:
    return d + timedelta(days=n)


def _fmt_date(d: datetime) -> str:
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def _days_between(a: datetime, b: datetime) -> int:
    return js_round((b - a).total_seconds() / 86400)


def _mdate(y: int, m: int, day: int) -> datetime:
    return datetime(y, m, day)


def _monitor_progress_result(d, ctx):
    base_year = d["metaResult"]["baseYear"]
    today = d["monitorAsOfBoundary"]
    cy_start, cy_end = _mdate(base_year, 1, 1), _mdate(base_year, 12, 31)
    fy_start, fy_end = _mdate(base_year, 4, 1), _mdate(base_year + 1, 3, 31)
    sim = 0.62

    def progress(start, end):
        f = (today - start).total_seconds() / (end - start).total_seconds()
        return f if (0.03 < f < 0.98) else sim

    prog_us, prog_in = progress(cy_start, cy_end), progress(fy_start, fy_end)
    simulated = not (((today - cy_start).total_seconds() / (cy_end - cy_start).total_seconds()) > 0.03 and (today - cy_end).total_seconds() < 0)
    return {"baseYear": base_year, "today": today, "cyStart": cy_start, "cyEnd": cy_end, "fyStart": fy_start, "fyEnd": fy_end, "progUS": prog_us, "progIN": prog_in, "simulated": simulated}


# ================= 1. RESIDENCY DAY-COUNTERS =================
def _residency_counter(cfg):
    days, threshold, p = cfg["days"], cfg["threshold"], cfg["prog"]
    already = cfg["isResident"] or days >= threshold
    pace = days / (p * 365)
    res = {
        "kind": "days", "country": cfg["country"], "flag": cfg["flag"], "test": cfg["test"],
        "days": days, "threshold": threshold, "pct": _clamp(days / threshold, 0, 1.5),
        "isResident": already, "projectedFullYear": js_round(days / p if p > 0 else days), "pace": pace,
    }
    if already:
        elapsed_to_cross = (threshold / pace) if pace > 0 else 0
        cross_date = _add_days(cfg["yearStart"], min(365, elapsed_to_cross))
        res["status"] = "resident"
        res["headline"] = "Resident (source basis) — foreign income not taxed here" if cfg.get("worldwide") is False else "Tax resident — worldwide income in scope"
        res["dateLabel"] = f"Crossed ~{_fmt_date(cross_date)}"
    elif res["projectedFullYear"] >= threshold and pace > 0:
        elapsed_needed = (threshold - days) / pace
        res["status"] = "will_flip"
        res["flipDate"] = _add_days(cfg["today"], elapsed_needed)
        res["headline"] = f"{js_num_str(threshold - days)} more days → becomes resident"
        res["dateLabel"] = f"Projected flip ~{_fmt_date(res['flipDate'])} at current pace"
    else:
        res["status"] = "safe"
        res["headline"] = f"Non-resident — {js_num_str(threshold - days)} days of headroom"
        res["dateLabel"] = "Not projected to cross this year"
    return res


def _residency_qualitative(cfg):
    if cfg["isResident"]:
        headline = "Resident (source basis) — foreign income not taxed here" if cfg.get("worldwide") is False else "Tax resident — worldwide income in scope"
    else:
        headline = "Non-resident — this entity type has no day-count or presence test"
    return {
        "kind": "qualitative", "country": cfg["country"], "flag": cfg["flag"], "test": cfg["test"],
        "status": "resident" if cfg["isResident"] else "safe", "isResident": cfg["isResident"],
        "headline": headline, "facts": cfg.get("facts") or [],
    }


def _residency_monitor_result(d, ctx):
    prog = d["monitorProgressResult"]
    e = d["entityResult"]
    residency_slice = d["residencyModelSliceResult"]
    company_residency = d["companyResidencyResult"]
    residency_result = d["residencyResult"]

    india_kind = e["indiaKind"] or "individual"

    if india_kind == "individual":
        india_entry = _residency_counter({
            "country": "India", "flag": "🇮🇳", "test": "≥182 days in the FY",
            "days": residency_slice["india"]["daysCurrentYear"], "threshold": 182, "prog": prog["progIN"],
            "isResident": residency_result["india"]["isResident"], "worldwide": residency_result["india"]["worldwide"],
            "yearStart": prog["fyStart"], "today": prog["today"],
        })
    elif india_kind == "company":
        is_indian_co = residency_slice["india"]["isIndianCompanyFact"]
        cr = company_residency or {}
        co_facts = []
        if is_indian_co is True:
            co_facts.append("Incorporated in India — unconditionally resident regardless of POEM (s.6(3))")
        elif is_indian_co is False:
            co_facts.append("NOT incorporated in India — residency turns on Place of Effective Management (POEM)")
            co_facts.append("Board meets primarily outside India" if cr.get("boardMeetingsOutsideIndia") else "Board meets primarily in India")
            if cr.get("keyManagementLocation"):
                co_facts.append(f"Key management location: {cr['keyManagementLocation']}")
            if cr.get("directorsInIndia") or cr.get("directorsOutsideIndia"):
                co_facts.append(f"{js_num_str(cr.get('directorsInIndia') or 0)} director(s) in India, {js_num_str(cr.get('directorsOutsideIndia') or 0)} outside")
        else:
            co_facts.append("Incorporation status (Indian vs. foreign) not yet answered on Layer 1 India")
        india_entry = _residency_qualitative({
            "country": "India", "flag": "🇮🇳", "test": "Place of Effective Management (POEM) — s.6(3)" if is_indian_co is False else "Incorporation — s.6(3)",
            "isResident": residency_result["india"]["isResident"], "worldwide": residency_result["india"]["worldwide"], "facts": co_facts,
        })
    else:
        wo = residency_slice["india"]["indiaWhollyOutsideIndiaFact"]
        non_ind_facts = [
            "Control & management of its affairs is wholly outside India" if wo is True else
            "Control & management is (at least partly) situated in India" if wo is False else
            "Control & management location not yet answered on Layer 1 India"
        ]
        if india_kind == "huf" and wo is False:
            non_ind_facts.append(f"Karta's own presence this FY ({js_num_str(residency_slice['india']['daysCurrentYear'])} days) still determines ROR vs. RNOR sub-status, separately from the HUF's own residency")
        india_entry = _residency_qualitative({
            "country": "India", "flag": "🇮🇳", "test": "Control & management (s.6(2)/s.6(4)) — not day-count",
            "isResident": residency_result["india"]["isResident"], "worldwide": residency_result["india"]["worldwide"], "facts": non_ind_facts,
        })

    us_is_entity_taxpayer = india_kind != "individual" or e["usIsBusiness"]
    if not us_is_entity_taxpayer:
        us_entry = _residency_counter({
            "country": "United States", "flag": "🇺🇸", "test": "Substantial Presence (≥183 weighted)",
            "days": residency_slice["us"]["daysCurrentYear"], "threshold": 183, "prog": prog["progUS"],
            "isResident": residency_slice["us"]["sptMet"] or residency_slice["us"]["isCitizen"] or residency_slice["us"]["hasGreenCard"],
            "worldwide": residency_result["us"]["worldwide"], "yearStart": prog["cyStart"], "today": prog["today"],
        })
    elif e["usIsBusiness"]:
        inc_us, inc_state = e["usIncorporatedInUs"], e["usIncorporationState"]
        us_facts = []
        if inc_us is True:
            us_facts.append(f"Organized/incorporated in the United States{f' ({inc_state})' if inc_state else ''} — a domestic entity taxed on worldwide income regardless of where it operates")
        elif inc_us is False:
            us_facts.append("NOT organized/incorporated in the United States — a foreign entity for US tax purposes (files Form 1120-F or the analogous foreign-entity return, not modeled here)")
        else:
            us_facts.append("Place of organization/incorporation not yet answered on Layer 1 US")
        us_entry = _residency_qualitative({
            "country": "United States", "flag": "🇺🇸", "test": "Place of organization/incorporation — not a presence test",
            "isResident": inc_us is True, "worldwide": inc_us is True, "facts": us_facts,
        })
    else:
        us_entry = _residency_qualitative({
            "country": "United States", "flag": "🇺🇸", "test": "Place of organization/incorporation — not a presence test",
            "isResident": False, "worldwide": False,
            "facts": ["No US business entity (ccorp/scorp/partnership/trust) organized for this taxpayer on Layer 1 US — a foreign entity for US tax purposes with no day-count or presence test to run"],
        })

    return [us_entry, india_entry]


# ================= 2. THRESHOLD BREACH PROJECTIONS =================
def _projections_monitor_result(d, ctx):
    prog = d["monitorProgressResult"]

    def project(g):
        is_lrs = g["id"] == "lrs"
        p = prog["progIN"] if is_lrs else prog["progUS"]
        year_start = prog["fyStart"] if is_lrs else prog["cyStart"]
        year_len = ((prog["fyEnd"] - prog["fyStart"]).total_seconds() / 86400) if is_lrs else ((prog["cyEnd"] - prog["cyStart"]).total_seconds() / 86400)
        projected = (g["value"] / p) if p > 0 else g["value"]
        out = {
            "id": g["id"], "label": g["label"], "current": g["value"], "limit": g["limit"],
            "pct": g["pct"], "projected": projected, "projPct": (projected / g["limit"]) if g["limit"] > 0 else 0,
            "note": g["note"],
        }
        if g["value"] >= g["limit"]:
            out["status"] = "breached"
            out["dateLabel"] = "Already breached"
        elif projected >= g["limit"] and g["value"] > 0:
            f = (g["limit"] * p) / g["value"]
            out["status"] = "will_breach"
            out["breachDate"] = _add_days(year_start, _clamp(f, 0, 1) * year_len)
            out["dateLabel"] = f"Projected to cross ~{_fmt_date(out['breachDate'])}"
        else:
            out["status"] = "ok"
            out["dateLabel"] = "Within limit at current pace"
        return out

    return [project(g) for g in (d["limitsResult"] or [])]


# ================= 3. COMPLIANCE CALENDAR =================
US_RETURN_DOCS = [
    "fincen_114", "form_8938", "form_1116", "form_2555", "form_8833",
    "form_8621", "form_5471", "form_8865", "form_3520", "form_3520a", "form_1040nr", "form_8960", "form_8959", "form_6251",
    "form_540", "form_it201", "form_nj1040", "form_8858",
]
IN_RETURN_DOCS = ["form_67", "trc", "form_10f", "schedule_fa", "schedule_fsi_tr", "schedule_al", "form_3cb_3cd", "form_3ceb", "form_29b", "form_10iea", "form_10ic", "form_10id"]
US_FILING_DATES = {
    "1120": {"orig": lambda by: _mdate(by + 1, 4, 15), "ext": lambda by: _mdate(by + 1, 10, 15), "label": "US Form 1120 (C-Corp)"},
    "1120-S": {"orig": lambda by: _mdate(by + 1, 3, 15), "ext": lambda by: _mdate(by + 1, 9, 15), "label": "US Form 1120-S (S-Corp)"},
    "1065": {"orig": lambda by: _mdate(by + 1, 3, 15), "ext": lambda by: _mdate(by + 1, 9, 15), "label": "US Form 1065 (Partnership)"},
    "1041": {"orig": lambda by: _mdate(by + 1, 4, 15), "ext": lambda by: _mdate(by + 1, 9, 30), "label": "US Form 1041 (Trust/Estate)"},
    "1040-NR": {"orig": lambda by: _mdate(by + 1, 4, 15), "ext": lambda by: _mdate(by + 1, 10, 15), "label": "US Form 1040-NR + FBAR"},
    "1040": {"orig": lambda by: _mdate(by + 1, 4, 15), "ext": lambda by: _mdate(by + 1, 10, 15), "label": "US Form 1040 + Form 1116 + FBAR"},
}


def _calendar_monitor_result(d, ctx):
    prog = d["monitorProgressResult"]
    base_year, today = prog["baseYear"], prog["today"]

    us_kind = d["entityResult"]["usReturnForm"]
    filing_cfg = US_FILING_DATES.get(us_kind, US_FILING_DATES["1040"])
    us_filing = {"orig": filing_cfg["orig"](base_year), "ext": filing_cfg["ext"](base_year), "label": filing_cfg["label"]}
    us_q4 = {"date": _mdate(base_year, 12, 15), "label": "US estimated tax — Q4 (C-Corp)"} if us_kind == "1120" else {"date": _mdate(base_year + 1, 1, 15), "label": "US estimated tax — Q4"}

    india_is_audit_case = d["inIsAuditCase"]
    if d["viaForeignCorpXbr4"]:
        india_filing = {"date": _mdate(base_year + 1, 11, 30), "label": "India ITR + Form 44 (s.92E/transfer-pricing case)"}
    elif india_is_audit_case:
        india_filing = {"date": _mdate(base_year + 1, 10, 31), "label": "India ITR + Form 44 (audit case)"}
    else:
        india_filing = {"date": _mdate(base_year + 1, 7, 31), "label": "India ITR + Form 44 (non-audit)"}

    if d["inPurelyPresumptive"]:
        india_advance_tax_rows = [
            {"name": "India advance tax — single installment (100%, presumptive scheme)", "jur": "IN", "date": _mdate(base_year + 1, 3, 15), "cat": "Advance tax", "docIds": []},
        ]
    else:
        india_advance_tax_rows = [
            {"name": "India advance tax — Q1 (15%)", "jur": "IN", "date": _mdate(base_year, 6, 15), "cat": "Advance tax", "docIds": []},
            {"name": "India advance tax — Q2 (45%)", "jur": "IN", "date": _mdate(base_year, 9, 15), "cat": "Advance tax", "docIds": []},
            {"name": "India advance tax — Q3 (75%)", "jur": "IN", "date": _mdate(base_year, 12, 15), "cat": "Advance tax", "docIds": []},
            {"name": "India advance tax — Q4 (100%)", "jur": "IN", "date": _mdate(base_year + 1, 3, 15), "cat": "Advance tax", "docIds": []},
        ]

    deadlines = india_advance_tax_rows + [
        {"name": "US estimated tax — Q1", "jur": "US", "date": _mdate(base_year, 4, 15), "cat": "Estimated tax", "docIds": []},
        {"name": "US estimated tax — Q2", "jur": "US", "date": _mdate(base_year, 6, 15), "cat": "Estimated tax", "docIds": []},
        {"name": "US estimated tax — Q3", "jur": "US", "date": _mdate(base_year, 9, 15), "cat": "Estimated tax", "docIds": []},
        {"name": us_q4["label"], "jur": "US", "date": us_q4["date"], "cat": "Estimated tax", "docIds": []},
        {"name": us_filing["label"], "jur": "US", "date": us_filing["orig"], "cat": "Filing", "docIds": US_RETURN_DOCS},
        {"name": india_filing["label"], "jur": "IN", "date": india_filing["date"], "cat": "Filing", "docIds": IN_RETURN_DOCS},
        {"name": "US extended " + us_filing["label"].removeprefix("US ") + " deadline", "jur": "US", "date": us_filing["ext"], "cat": "Extension", "docIds": US_RETURN_DOCS},
        {"name": "India belated / revised ITR", "jur": "IN", "date": _mdate(base_year + 1, 12, 31), "cat": "Extension", "docIds": IN_RETURN_DOCS},
    ]
    meta = d["metaResult"]
    deadlines = [x for x in deadlines if (meta["hasIndiaScope"] is not False if x["jur"] == "IN" else (meta["hasUsScope"] is not False if x["jur"] == "US" else True))]
    for x in deadlines:
        du = _days_between(today, x["date"])
        x["daysUntil"] = du
        x["status"] = "passed" if du < 0 else ("due_soon" if du <= 30 else "upcoming")
        x["dateLabel"] = _fmt_date(x["date"])
    deadlines.sort(key=lambda x: x["date"])

    upcoming = [x for x in deadlines if x["status"] != "passed"]
    next_deadline = upcoming[0] if upcoming else None

    return {"all": deadlines, "upcoming": upcoming, "next": next_deadline}


# ================= 4. HEALTH SCORE + ALERTS =================
def _health_alerts_monitor_result(d, ctx):
    findings, projections = d["findingsAllResult"], d["projectionsMonitorResult"]
    residency, calendar_obj = d["residencyMonitorResult"], d["calendarMonitorResult"]

    counts = {"critical": 0, "warning": 0, "info": 0}
    for f in findings:
        counts[f["severity"]] += 1
    breached_limits = sum(1 for p in projections if p["status"] == "breached")
    will_breach = sum(1 for p in projections if p["status"] == "will_breach")
    overdue_filings = sum(1 for x in calendar_obj["all"] if x["status"] == "passed" and x["cat"] == "Filing")

    score = 100 - 16 * counts["critical"] - 3 * counts["warning"] - 8 * breached_limits - 4 * will_breach
    score = js_round(_clamp(score, 8, 100))
    if score >= 80:
        band = {"label": "Healthy", "color": "#10B981"}
    elif score >= 50:
        band = {"label": "Needs attention", "color": "#D4AF37"}
    else:
        band = {"label": "At risk", "color": "#ef4444"}

    alerts = []
    for f in [x for x in findings if x["severity"] == "critical"][:4]:
        alerts.append({"sev": "critical", "icon": "⛔", "text": f["title"], "meta": (f["refs"][0] if f.get("refs") else "Conflict")})
    for p in projections:
        if p["status"] == "breached":
            alerts.append({"sev": "critical", "icon": "🚨", "text": f"{p['label']} threshold breached", "meta": p["dateLabel"]})
        elif p["status"] == "will_breach":
            alerts.append({"sev": "warning", "icon": "📈", "text": f"{p['label']} on track to breach", "meta": p["dateLabel"]})
    for r in residency:
        if r["status"] == "will_flip":
            alerts.append({"sev": "warning", "icon": "🧭", "text": f"{r['country']} residency approaching", "meta": r["dateLabel"]})
        elif r["status"] == "resident":
            # JS reads r.dateLabel here — undefined (not a crash) for a
            # "qualitative" residency entry (entity taxpayers), which never
            # sets dateLabel at all; .get() reproduces that same forgiving read.
            alerts.append({"sev": "info", "icon": "🌐", "text": f"{r['country']} tax residency active", "meta": r.get("dateLabel")})
    for x in [x for x in calendar_obj["upcoming"] if x["daysUntil"] <= 45][:4]:
        alerts.append({"sev": "warning" if x["daysUntil"] <= 15 else "info", "icon": "📅", "text": f"{x['name']} due", "meta": f"in {x['daysUntil']} days ({x['dateLabel']})"})
    sev_w = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: sev_w[a["sev"]])

    return {
        "health": {"score": score, "band": band, "breachedLimits": breached_limits, "willBreach": will_breach, "overdueFilings": overdue_filings},
        "alerts": alerts[:12],
    }


def _monitor_result(d, ctx):
    prog = d["monitorProgressResult"]
    return {
        "asOf": prog["today"], "simulated": prog["simulated"], "baseYear": prog["baseYear"],
        "progressUS": prog["progUS"], "progressIN": prog["progIN"],
        "residency": d["residencyMonitorResult"], "projections": d["projectionsMonitorResult"],
        "calendar": d["calendarMonitorResult"],
        "health": d["healthAlertsMonitorResult"]["health"], "alerts": d["healthAlertsMonitorResult"]["alerts"],
    }


NODES = {
    "monitorAsOfBoundary": NodeDef(deps=(), compute=_monitor_as_of_boundary),
    "monitorProgressResult": NodeDef(deps=("monitorAsOfBoundary", "metaResult"), compute=_monitor_progress_result),
    "residencyMonitorResult": NodeDef(
        deps=("monitorProgressResult", "entityResult", "residencyModelSliceResult", "companyResidencyResult", "residencyResult"),
        compute=_residency_monitor_result,
    ),
    "projectionsMonitorResult": NodeDef(deps=("monitorProgressResult", "limitsResult"), compute=_projections_monitor_result),
    "calendarMonitorResult": NodeDef(
        deps=("monitorProgressResult", "entityResult", "metaResult", "indiaIsCompany", "inIsAuditCase", "inPurelyPresumptive", "viaForeignCorpXbr4"),
        compute=_calendar_monitor_result,
    ),
    "healthAlertsMonitorResult": NodeDef(
        deps=("findingsAllResult", "projectionsMonitorResult", "residencyMonitorResult", "calendarMonitorResult"),
        compute=_health_alerts_monitor_result,
    ),
    "monitorResult": NodeDef(
        deps=("monitorProgressResult", "residencyMonitorResult", "projectionsMonitorResult", "calendarMonitorResult", "healthAlertsMonitorResult"),
        compute=_monitor_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
