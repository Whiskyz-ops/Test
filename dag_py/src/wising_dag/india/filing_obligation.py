"""indiaFilingObligationResult — is an Indian income-tax return compulsory
for this tax year, and why. Port of prototypes/graph-pilot/
india-filing-obligation.js (keep the two identical — npm run
compare:js-vs-py-dag and monitor-next/test-map-parity.mjs check it); that
file's header has the rules, sources and what isn't modelled.

DAG-only Monitor extra, same precedent as checksRegistry / calendarAmounts:
returned only by analyze_with_extras() as `indiaFilingObligation`.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import format_inr, num, safe
from . import constants as C

T = C.INDIA

ALWAYS = ("company", "firm", "llp")
NOT_MODELLED = [
    "Savings-account deposits of ₹50 lakh or more, current-account deposits above ₹1 crore, foreign travel above ₹2 lakh and electricity above ₹1 lakh also make a return compulsory — not collected on the forms"
]
_NOT_GENERAL = ("professional", "partner_in_firm", "fno_trader", "intraday_trader")


def _receipts_split(entries, natures):
    professional_only = "professional" in natures and not any(n not in _NOT_GENERAL for n in natures)
    out = {"businessInr": 0.0, "professionInr": 0.0}
    for b in entries or []:
        digital = num(b.get("digital_receipts_inr")) + num(b.get("ada_digital_receipts_inr"))
        cash = num(b.get("cash_receipts_inr")) + num(b.get("ada_cash_receipts_inr"))
        receipts = num(b.get("gross_receipts_inr")) or num(b.get("turnover_inr")) or (digital + cash)
        professional = b.get("presumptive_scheme") == "s44ADA" or (professional_only and b.get("presumptive_scheme") != "s44AD")
        out["professionInr" if professional else "businessInr"] += receipts
    return out


def _india_filing_obligation_result(d, ctx):
    entity = d["indiaEntityTypeRaw"] or "individual"
    status = d["indiaResidencyStatusRawAgg"]
    resident = status in ("ROR", "RNOR")
    age = d["ageAtFyEndIn1"]
    new_act = d["baseYearIn1"] >= 2026
    section = "s.263(1)(a)" if new_act else "s.139(1)"
    rule = "Rule 163" if new_act else "Rule 12AB"
    gross = num(d["grossTotalIncomeInrCombined"])
    paid = d["taxesPaidIndiaResult"]
    tds_tcs = num(paid["tds"]["inr"]) + num(paid["tcs"]["inr"])
    # Age concessions are for a resident individual only (not an HUF).
    senior = entity == "individual" and resident and age is not None and age >= 60

    if d["isNew"]:
        basic = T["SLABS_NEW"][0][0]
    else:
        basic = 500000 if (senior and age >= 80) else 300000 if senior else T["SLABS_OLD"][0][0]
    tds_threshold = 50000 if senior else 25000

    out = {
        "required": False, "reasons": [], "notes": [], "notModelled": list(NOT_MODELLED),
        "section": section, "rule": rule, "grossTotalIncomeInr": gross, "basicExemptionInr": basic,
        "tdsTcsInr": tds_tcs, "tdsTcsThresholdInr": tds_threshold,
    }
    if not d["hasIndiaScope"]:
        return out

    def add(code, text):
        out["reasons"].append({"code": code, "text": text})

    if entity in ALWAYS:
        add("entity", f"Every company and firm must file ({section}), whatever its income")
    else:
        flat = (
            (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) +
            (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0) + (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0)
        )
        flat_only = bool(d["isNRV3"] and flat > 0 and gross - flat <= 1 and tds_tcs >= num(d["totalTaxInrCombined"]))
        if flat_only:
            out["notes"].append("Only flat-rate dividend / interest / royalty / technical-fee income with tax fully deducted: the income test doesn't apply to a non-resident (s.115A(5))")
        elif gross > basic:
            add("income", f"Income before deductions ₹{format_inr(gross)} is above the ₹{format_inr(basic)} basic exemption ({section})")
        if status == "ROR" and d["indiaForeignAssetsDeclaredRaw"] is True:
            add("foreign_assets", f"Resident and ordinarily resident with assets outside India — a return (with Schedule FA) is compulsory whatever the income ({section})")
        if not out["reasons"]:
            if tds_tcs >= tds_threshold:
                add("tds_tcs", f"TDS + TCS of ₹{format_inr(tds_tcs)} is ₹{format_inr(tds_threshold)} or more ({rule})")
                if flat_only:
                    out["notes"].append("Whether s.115A(5) overrides the TDS test is unsettled — CA to confirm")
            natures = safe(ctx.get("india"), "domestic_income.business_income.nature_of_business", []) or []
            r = _receipts_split(d["indianBusinessesBoundary"], natures)
            if r["businessInr"] > 6000000:
                add("business_turnover", f"Business turnover ₹{format_inr(r['businessInr'])} is above ₹60,00,000 ({rule})")
            if r["professionInr"] > 1000000:
                add("professional_receipts", f"Professional receipts ₹{format_inr(r['professionInr'])} are above ₹10,00,000 ({rule})")
    out["required"] = len(out["reasons"]) > 0
    return out


NODES = {
    "indiaFilingObligationResult": NodeDef(
        deps=("hasIndiaScope", "indiaEntityTypeRaw", "indiaResidencyStatusRawAgg", "isNRV3", "ageAtFyEndIn1", "baseYearIn1", "isNew",
              "grossTotalIncomeInrCombined", "taxesPaidIndiaResult", "totalTaxInrCombined", "indiaForeignAssetsDeclaredRaw",
              "s115aDividend", "s115aRoyalty", "s115aFts", "nrInterest", "indianBusinessesBoundary"),
        compute=_india_filing_obligation_result,
        layer1_fields=("india.domestic_income.business_income.nature_of_business",),
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
