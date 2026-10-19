"""Sale of Indian immovable property under both countries' rules.

Mirrors prototypes/graph-pilot/india-property-sale.js exactly (see that
file's header for the rules). India: full value of consideration (the
stamp-duty value when it is more than 110% of the price), cost (previous
owner's for an inherited property; the 1 Apr 2001 value when higher for an
older purchase), improvements from 1 Apr 2001, long-term after 24 months at
12.5% without indexation (ltcg197 bucket) else slab (stcgSlab), the s.54 /
s.54EC / s.54F reinvestment exemptions, rural agricultural land outside
capital gains, ownership share, buyer TDS credited. US: proceeds and cost at
their own years' Federal Reserve annual-average rates, no stamp-duty rule or
Indian exemption, long-term after 12 months.
"""
from __future__ import annotations

import re

from ..core.dates import months_between
from ..core.fx_util import fx_rate
from ..core.util import format_inr, format_usd, js_round, num

# Indian rupees per US dollar, annual average of daily noon buying rates
# (Federal Reserve G.5A, FRED series AEXINUS; retrieved Oct 2026).
INR_PER_USD_ANNUAL = {
    2001: 47.2200, 2002: 48.6257, 2003: 46.5908, 2004: 45.2610, 2005: 44.0002,
    2006: 45.1861, 2007: 41.1774, 2008: 43.3859, 2009: 48.3324, 2010: 45.6507,
    2011: 46.5782, 2012: 53.3743, 2013: 58.5149, 2014: 60.9953, 2015: 64.1073,
    2016: 67.1572, 2017: 65.0659, 2018: 68.3734, 2019: 70.3777, 2020: 74.1429,
    2021: 73.9351, 2022: 78.5792, 2023: 82.5708, 2024: 83.6566, 2025: 87.1468,
}
FMV_2001_DATE = "2001-04-01"
S54_CAP_INR = 100000000
S54EC_CAP_INR = 5000000
EXEMPTIONS = {
    "Reinvestment in Residential House": "s54",
    "Reinvestment (Invest in NHAI or REC Bonds - Max ₹50L)": "s54ec",
    "Reinvestment (Any Asset to Res. House)": "s54f",
}
EXEMPTION_LABEL = {"s54": "s.54 house reinvestment", "s54ec": "s.54EC bonds", "s54f": "s.54F (any asset to a house)"}


def _has(v) -> bool:
    return v is not None and v != ""


def _year_of(date_str):
    """JS parseInt(String(d || "").slice(0, 4), 10): leading digits only."""
    m = re.match(r"\s*([+-]?\d+)", str(date_str or "")[:4])
    return int(m.group(1)) if m else None


LATEST_TABLE_YEAR = 2025


def inr_per_usd(year, ctx) -> float:
    """The annual table; a later year uses the latest published average (or
    the what-if rate the user set); an earlier one the engine's rate."""
    if year is not None and INR_PER_USD_ANNUAL.get(year):
        return INR_PER_USD_ANNUAL[year]
    if year is not None and year > LATEST_TABLE_YEAR and not (ctx and ctx.get("fxRateOverride")):
        return INR_PER_USD_ANNUAL[LATEST_TABLE_YEAR]
    return fx_rate(ctx)


def _in_table(year) -> bool:
    return year is not None and bool(INR_PER_USD_ANNUAL.get(year))


def _prop_kind(p) -> str:
    """The form saves codes; hand-written profiles may use labels (mirrors JS propKind)."""
    t = str((p or {}).get("property_type") or "").lower()
    if t == "agricultural_rural" or (re.search("agricultural", t) and re.search("rural", t) and not re.search("non-agricultural", t)):
        return "agri_rural"
    if t.startswith("residential"):
        return "residential"
    return "other"


def _is_sold(p) -> bool:
    return bool(p) and (p.get("status") == "sold" or (_has(p.get("sale_date")) and num(p.get("sale_consideration")) > 0))


def _sale_key(p) -> str:
    return "|".join([p.get("address") or "", p.get("sale_date") or "", repr(num(p.get("sale_consideration")))])


def sold_properties(india) -> list:
    out, seen = [], set()

    def add(lst):
        for p in lst or []:
            if not _is_sold(p):
                continue
            k = _sale_key(p)
            if k in seen:
                continue
            seen.add(k)
            out.append(p)

    add(((india or {}).get("property") or {}).get("properties"))
    q = (india or {}).get("quarters")
    if q:
        for k in ("Q1", "Q2", "Q3", "Q4"):
            add((((q.get(k) or {}).get("property")) or {}).get("properties"))
    return out


def _to_inr(amount, currency, year, ctx):
    if not currency or currency == "INR":
        return num(amount)
    if currency == "USD":
        return num(amount) * inr_per_usd(year, ctx)
    return None


def _compute_sale(p, ctx, entity_type):
    inherited = p.get("is_inherited") is True
    acq_date = (p.get("original_owner_acquisition_date") or p.get("acquisition_date")) if inherited else p.get("acquisition_date")
    acq_year, sale_year = _year_of(acq_date), _year_of(p.get("sale_date"))
    share = num(p.get("ownership_percentage")) / 100 if (p.get("is_joint_property") is True and num(p.get("ownership_percentage")) > 0) else 1
    cost_raw = p.get("original_owner_cost") if inherited else p.get("actual_cost")
    cost_cur = p.get("original_owner_cost_currency") if inherited else p.get("actual_cost_currency")
    sale_inr = _to_inr(p.get("sale_consideration"), p.get("sale_consideration_currency"), sale_year, ctx)
    cost_inr = _to_inr(cost_raw, cost_cur, acq_year, ctx)
    label = p.get("address") or ((p.get("property_type") or "Property") + (" sold " + p["sale_date"] if p.get("sale_date") else ""))
    row = {
        "label": label, "propertyType": p.get("property_type") or None, "acquisitionDate": acq_date or None,
        "saleDate": p.get("sale_date") or None, "inherited": inherited, "sharePct": share * 100,
        "tdsInr": num(p.get("buyer_tds_deducted_inr")), "notes": [], "review": [],
    }
    months = months_between(acq_date, p.get("sale_date"))
    if sale_inr is None or cost_inr is None or months is None:
        row["computed"] = False
        row["review"].append("an amount is in a currency other than INR or USD" if (sale_inr is None or cost_inr is None)
                             else "the acquisition or sale date is missing")
        row["india"] = None
        row["us"] = None
        return row
    row["computed"] = True
    row["monthsHeld"] = months

    # ---- India --------------------------------------------------------------
    sdv_inr = num(p.get("stamp_duty_value"))
    fvc_inr = sdv_inr if sdv_inr > 1.1 * sale_inr else sale_inr
    cost_basis = "previous owner's cost" if inherited else "actual cost"
    india_cost_inr = cost_inr
    if acq_date and acq_date < FMV_2001_DATE and num(p.get("pre_2001_fmv_inr")) > india_cost_inr:
        india_cost_inr = num(p.get("pre_2001_fmv_inr"))
        cost_basis = "fair market value on 1 Apr 2001"
    improvements_inr, improvements_usd, improvements_us_ok = 0.0, 0.0, True
    for im in p.get("improvements") or []:
        amt = num((im or {}).get("improvement_cost_inr"))
        if not (amt > 0):
            continue
        d = im.get("improvement_date") or acq_date
        if d and d < FMV_2001_DATE:
            continue
        improvements_inr += amt
        y = _year_of(d)
        if not _in_table(y) and y is not None and y <= 2025:
            improvements_us_ok = False
        improvements_usd += amt / inr_per_usd(y, ctx)
    expenses_inr = num(p.get("transfer_expenses_inr"))
    kind = _prop_kind(p)
    not_capital_asset = kind == "agri_rural"
    term = "LTCG" if months > 24 else "STCG"
    gain_inr = (fvc_inr - expenses_inr - india_cost_inr - improvements_inr) * share
    exempt_key = EXEMPTIONS.get(p.get("cg_exemption_section")) if p.get("cg_exemption_section") else None
    exempt_inr = 0.0
    invest_inr = num(p.get("cg_exempt_invest_amount")) * share
    individual_or_huf = not entity_type or entity_type in ("individual", "huf")
    section = p.get("cg_exemption_section")
    if not not_capital_asset and term == "LTCG" and gain_inr > 0 and section:
        if not exempt_key:
            row["review"].append("the exemption chosen (" + str(section) + ") isn't worked out here")
        elif not individual_or_huf:
            row["review"].append("reinvestment exemptions are only for individuals and HUFs")
        elif exempt_key == "s54" and kind != "residential":
            row["review"].append("s.54 applies only to a residential house sold; for other property it is s.54F")
        elif exempt_key == "s54f" and kind == "residential":
            row["review"].append("s.54F is for assets other than a residential house; for a house it is s.54")
        elif exempt_key == "s54":
            exempt_inr = min(gain_inr, min(invest_inr, S54_CAP_INR))
        elif exempt_key == "s54ec":
            exempt_inr = min(gain_inr, min(invest_inr, S54EC_CAP_INR))
        elif exempt_key == "s54f":
            net_cons_inr = (fvc_inr - expenses_inr) * share
            exempt_inr = min(gain_inr, gain_inr * min(invest_inr, S54_CAP_INR) / net_cons_inr) if net_cons_inr > 0 else 0
    taxable_inr = 0 if not_capital_asset else gain_inr - exempt_inr
    if not_capital_asset:
        row["notes"].append("rural agricultural land is not a capital asset in India — no Indian capital gain")
    row["india"] = {
        "saleInr": sale_inr * share, "stampDutyValueInr": sdv_inr * share, "fullValueInr": fvc_inr * share,
        "stampDutyRuleApplied": fvc_inr != sale_inr,
        "costInr": india_cost_inr * share, "costBasis": cost_basis, "improvementsInr": improvements_inr * share,
        "expensesInr": expenses_inr * share, "term": term, "gainInr": 0 if not_capital_asset else gain_inr,
        "exemption": EXEMPTION_LABEL[exempt_key] if exempt_key else (section or None),
        "exemptInr": exempt_inr, "taxableInr": taxable_inr, "notCapitalAsset": not_capital_asset,
    }

    # ---- US -----------------------------------------------------------------
    us_reason = None
    if inherited:
        us_reason = "an inherited property's US basis is its value at the date of death (IRC §1014), which the form doesn't collect"
    elif acq_year is not None and acq_year < 2001:
        us_reason = "the purchase is before 2001, outside the exchange-rate table"
    elif not improvements_us_ok:
        us_reason = "an improvement is dated before 2001, outside the exchange-rate table"
    if us_reason:
        # Estimate: India's gain (before Indian exemptions) at the sale-year
        # rate, so the sale isn't missing from the US return; flagged.
        row["us"] = None
        est = ((fvc_inr - expenses_inr - india_cost_inr - improvements_inr) * share / inr_per_usd(sale_year, ctx)) if not_capital_asset else gain_inr / inr_per_usd(sale_year, ctx)
        row["usEstimate"] = {"gainUsd": est, "term": "LTCG" if (inherited or months > 12) else "STCG"}
        row["review"].append("US gain not worked out: " + us_reason + " — estimated from India's gain instead")
        return row
    sale_rate, cost_rate = inr_per_usd(sale_year, ctx), inr_per_usd(acq_year, ctx)
    sale_usd = sale_inr / sale_rate
    cost_usd = num(cost_raw) if cost_cur == "USD" else cost_inr / cost_rate
    expenses_usd = expenses_inr / sale_rate
    gain_usd = (sale_usd - expenses_usd - cost_usd - improvements_usd) * share
    row["us"] = {
        "saleUsd": sale_usd * share, "costUsd": cost_usd * share, "improvementsUsd": improvements_usd * share,
        "expensesUsd": expenses_usd * share, "saleRate": sale_rate, "costRate": cost_rate,
        "saleRateFromTable": _in_table(sale_year), "costRateFromTable": cost_cur == "USD" or _in_table(acq_year),
        "term": "LTCG" if months > 12 else "STCG", "gainUsd": gain_usd,
    }
    return row


def property_sales(india, ctx) -> dict:
    entity_type = ((india or {}).get("profile") or {}).get("entity_type")
    rows = [_compute_sale(p, ctx, entity_type) for p in sold_properties(india)]
    out = {"rows": rows, "ltcgInr": 0.0, "stcgInr": 0.0, "tdsInr": 0.0, "usLtcgUsd": 0.0, "usStcgUsd": 0.0, "usMissing": 0}
    for r in rows:
        out["tdsInr"] += r["tdsInr"]
        if r["india"]:
            if r["india"]["term"] == "LTCG":
                out["ltcgInr"] += r["india"]["taxableInr"]
            else:
                out["stcgInr"] += r["india"]["taxableInr"]
        u = r["us"] or r.get("usEstimate")
        if u:
            if u["term"] == "LTCG":
                out["usLtcgUsd"] += u["gainUsd"]
            else:
                out["usStcgUsd"] += u["gainUsd"]
        if not r["us"]:
            out["usMissing"] += 1
    return out


def _inr(n) -> str:
    return "₹" + format_inr(n)


def _rate2(r) -> str:
    return f"{js_round(r * 100) / 100:.2f}"


def _term_word(t) -> str:
    return "long-term" if t == "LTCG" else "short-term"


def property_sale_findings(ps, opts, ctx) -> list:
    out = []
    if not ps or not ps.get("rows"):
        return out
    resident = opts.get("residency") in ("ROR", "RNOR")
    et = opts.get("entityType")
    individual_or_huf = not et or et in ("individual", "huf")
    rows = ps["rows"]
    for i, r in enumerate(rows):
        sfx = "_" + str(i + 1) if len(rows) > 1 else ""
        ind, us = r["india"], r["us"]
        if ind:
            if ind["notCapitalAsset"]:
                rate_txt = "no Indian capital gain (rural agricultural land isn't a capital asset)"
            elif ind["term"] == "LTCG":
                rate_txt = ("long-term (held " + str(js_round(r["monthsHeld"])) + " months, over 24): 12.5% without indexation, "
                            "plus surcharge (capped at 15%) and 4% cess")
            else:
                rate_txt = "short-term (held " + str(js_round(r["monthsHeld"])) + " months, 24 or less): taxed at the slab rates"
            parts = ["Full value of consideration " + _inr(ind["fullValueInr"]) +
                     (" (the stamp-duty value, which is more than 110% of the " + _inr(ind["saleInr"]) + " sale price)" if ind["stampDutyRuleApplied"] else ""),
                     "less cost " + _inr(ind["costInr"]) + " (" + ind["costBasis"] + ")"]
            if ind["improvementsInr"] > 0:
                parts.append("improvements " + _inr(ind["improvementsInr"]))
            if ind["expensesInr"] > 0:
                parts.append("transfer costs " + _inr(ind["expensesInr"]))
            detail = (", ".join(parts) + " = gain " + _inr(ind["gainInr"]) +
                      (" (the client's " + str(js_round(r["sharePct"])) + "% share)" if r["sharePct"] < 100 else "") + ". " +
                      "It is " + rate_txt + "." +
                      (" " + ind["exemption"] + " exempts " + _inr(ind["exemptInr"]) + ", leaving " + _inr(ind["taxableInr"]) + " taxable." if ind["exemptInr"] > 0 else "") +
                      (" The buyer deducted " + _inr(r["tdsInr"]) + " of TDS, credited against the Indian tax." if r["tdsInr"] > 0 else ""))
            rec = []
            if not resident:
                rec.append("As a non-resident, the buyer must deduct TDS on the sale (s.195 of the 1961 Act); without a lower-deduction certificate "
                           "it is usually taken on the whole price, so check Form 26AS / AIS and claim any excess back as a refund in the Indian return")
                rec.append("to move the money abroad, the bank needs Form 15CA (and a CA's Form 15CB); up to US$1 million a financial year can be "
                           "remitted from an NRO account")
                if r["tdsInr"] <= 0 and ind["taxableInr"] > 0:
                    rec.append("no buyer TDS is recorded — confirm what the buyer deducted (Form 16A) before filing")
            elif ind["term"] == "LTCG" and individual_or_huf and r["acquisitionDate"] and r["acquisitionDate"] < "2024-07-23":
                rec.append("as a resident individual / HUF holding property bought before 23 Jul 2024, compare 20% with indexation against 12.5% "
                           "without and use the lower (not worked out here)")
            if ind["term"] == "LTCG" and ind["exemptInr"] == 0 and ind["taxableInr"] > 0 and not ind["notCapitalAsset"]:
                rec.append("the tax can be reduced by reinvesting the gain in another house or in 54EC bonds within the time limits")
            out.append({
                "id": "india_property_sale" + sfx, "severity": "info", "category": "credit",
                "title": "Indian property sold — " + r["label"] + ": India " + _term_word(ind["term"]) + " gain " + _inr(ind["taxableInr"]),
                "detail": detail,
                "recommendation": "; ".join(rec) + "." if rec else "Report the gain in the Indian return's capital-gains schedule.",
                "amountUsd": abs(ind["taxableInr"]) / inr_per_usd(_year_of(r["saleDate"]), ctx) + 0.01,
                "refs": ["Capital gains on immovable property", "s.195 TDS", "Form 15CA / 15CB"],
            })
        if ind and us and opts.get("usWorldwide"):
            india_as_usd = ind["taxableInr"] / us["saleRate"]
            diff = us["gainUsd"] - india_as_usd
            if abs(diff) > max(1000, 0.1 * abs(us["gainUsd"])):
                why = []
                if abs(us["costRate"] - us["saleRate"]) > 0.5:
                    why.append("the rupee moved from " + _rate2(us["costRate"]) + " to " + _rate2(us["saleRate"]) +
                               " per dollar between purchase and sale, so the US cost in dollars is " + format_usd(us["costUsd"]) + " while India's cost is in rupees")
                if ind["stampDutyRuleApplied"]:
                    why.append("India taxes the stamp-duty value, the US the actual price")
                if ind["exemptInr"] > 0:
                    why.append("the Indian exemption (" + ind["exemption"] + ") has no US equivalent")
                if ind["notCapitalAsset"]:
                    why.append("India doesn't tax rural agricultural land; the US does")
                if ind["term"] != us["term"]:
                    why.append("India treats it as " + _term_word(ind["term"]) + " (24-month rule), the US as " + _term_word(us["term"]) + " (12 months)")
                out.append({
                    "id": "india_property_gain_mismatch" + sfx, "severity": "warning", "category": "treaty",
                    "title": "Same property sale, different gains: India " + _inr(ind["taxableInr"]) + " (≈ " + format_usd(india_as_usd) + "), US " + format_usd(us["gainUsd"]),
                    "detail": ("The US taxes this sale too. Under US rules the proceeds are " + format_usd(us["saleUsd"]) + " at " + _rate2(us["saleRate"]) + " ₹/$ (" +
                               (r["saleDate"] or "")[:4] + ("" if us["saleRateFromTable"] else ", the latest published annual average — that year's isn't out yet") +
                               ") and the cost " + format_usd(us["costUsd"]) + ("" if us["costRateFromTable"] else " (estimated rate)") +
                               (", improvements " + format_usd(us["improvementsUsd"]) if us["improvementsUsd"] > 0 else "") +
                               (", selling costs " + format_usd(us["expensesUsd"]) if us["expensesUsd"] > 0 else "") +
                               ", a " + _term_word(us["term"]) + " gain of " + format_usd(us["gainUsd"]) + ". " +
                               ("It differs from India's because " + "; ".join(why) + "." if why else "")),
                    "recommendation": ("Report " + format_usd(us["gainUsd"]) + " on Form 8949 / Schedule D (exchange rates: Federal Reserve annual averages — use the rate on "
                                       "each date if the client has it). Claim the Indian tax on this gain as a foreign tax credit on Form 1116, capped at the US tax on it; "
                                       "the 3.8% net investment income tax can't be offset by it."),
                    "amountUsd": abs(diff),
                    "refs": ["Form 8949", "Schedule D", "Form 1116", "DTAA Art. 13"],
                })
        if r["review"]:
            out.append({
                "id": "india_property_sale_review" + sfx, "severity": "warning", "category": "document",
                "title": "Indian property sale — " + r["label"] + ": part of it isn't worked out",
                "detail": "For this sale " + "; ".join(r["review"]) + ".",
                "recommendation": "Work out the missing part by hand, or complete the Property screen so the engine can.",
                "amountUsd": (abs(ind["taxableInr"]) if ind else num(r["tdsInr"])) / fx_rate(ctx) + 0.02,
                "refs": ["Property screen"],
            })
    return out
