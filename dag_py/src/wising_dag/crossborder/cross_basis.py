"""crossBasis — the "same income, both codes" reconciliation table. Port
of prototypes/graph-pilot/crossbasis-nodes.js. Built on double_tax.py (a
strict superset of xborder_full.py).
"""
from __future__ import annotations

from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.registry import NodeRegistry
from ..core.util import format_inr, safe
from . import double_tax


def _usd_label(n: float) -> str:
    return f"${round(n):,}"


def _cross_basis_result(d, ctx):
    rows = []
    # .get(), not [...] — entity/NRA usTaxResult branches (us/ustax_full.py)
    # carry no feieAppliedUsd field at all; JS's bare property read is
    # forgiving (undefined || 0), Python's [...] is not.
    feie_applied = d["usTaxResult"].get("feieAppliedUsd") or 0
    us_ww, in_ww = d["residencyResult"]["us"]["worldwide"], d["residencyResult"]["india"]["worldwide"]
    via_foreign_corp = d["viaForeignCorpXbr4"]
    # in1_v3.py's taxRegime already normalizes to uppercase (no engine-style
    # lowercase-comparison bug to fix here — see file header).
    std_ded_inr = 50000 if d["taxRegime"] == "OLD" else 75000
    std_ded_usd = std_ded_inr / fx_rate(ctx)
    std_ded_label = f"₹{format_inr(std_ded_inr)}"

    def row(o: dict) -> None:
        o["indiaLawUsd"] = round(o.get("indiaLawUsd") or 0)
        o["usLawUsd"] = round(o.get("usLawUsd") or 0)
        o["doublyTaxed"] = o["indiaLawUsd"] > 0 and o["usLawUsd"] > 0
        o["overlapUsd"] = min(o["indiaLawUsd"], o["usLawUsd"]) if o["doublyTaxed"] else 0
        rows.append(o)

    salary_usd = float(d["salaryInr"]) / fx_rate(ctx)
    business_usd = float(d["businessComputation"]["businessInr"]) / fx_rate(ctx)
    house_property_usd = float(d["housePropertyInr"]) / fx_rate(ctx)
    interest_usd = float(d["interestInr"]) / fx_rate(ctx)
    dividend_usd = float(d["dividendInr"]) / fx_rate(ctx)
    capital_gains_usd = float(d["indiaCapitalGainsInrXbr3"]) / fx_rate(ctx)
    us = d["aggregateUsIncomeResult"]

    if us_ww:
        if salary_usd > 0:
            gross_wage = salary_usd + std_ded_usd
            row({
                "head": "salary", "label": "Salary / Wages", "dir": "IN→US", "source": "India",
                "indiaLawUsd": salary_usd, "usLawUsd": max(0.0, gross_wage - feie_applied),
                "indiaRule": f"Net of {std_ded_label} std deduction · slab ≤ 30%",
                "usRule": (f"Gross less FEIE {_usd_label(feie_applied)}" if feie_applied > 0 else "Gross wage; no std deduction") + " · brackets ≤ 37%",
            })
        if business_usd > 0:
            if via_foreign_corp:
                row({
                    "head": "business", "label": "Business / Professional", "dir": "IN→US", "source": "India",
                    "indiaLawUsd": business_usd, "usLawUsd": 0,
                    "indiaRule": "PGBP net · Indian depreciation",
                    "usRule": "Held via Indian company → not personal income; taxed via CFC/GILTI (Form 5471)",
                    "note": "See the Form 5471 finding.",
                })
            else:
                row({
                    "head": "business", "label": "Business / Professional", "dir": "IN→US", "source": "India",
                    "indiaLawUsd": business_usd, "usLawUsd": business_usd, "estimate": True,
                    "indiaRule": "PGBP net · Indian depreciation", "usRule": "Schedule C net · US depreciation (MACRS)",
                    "note": "US net approximated at Indian net — diverges with US depreciation schedule.",
                })
        if house_property_usd > 0:
            nav = house_property_usd
            row({
                "head": "rental", "label": "House property / Rental", "dir": "IN→US", "source": "India",
                "indiaLawUsd": nav * 0.70, "usLawUsd": nav * 0.55, "estimate": True,
                "indiaRule": "NAV less 30% std deduction (s.24a)",
                "usRule": "Gross less actual expenses + straight-line depreciation (27.5y)",
                "note": "US net is planning-grade — refine with the property's depreciable basis.",
            })
        if interest_usd > 0:
            row({"head": "interest", "label": "Interest", "dir": "IN→US", "source": "India", "indiaLawUsd": interest_usd, "usLawUsd": interest_usd, "sameBase": True, "indiaRule": "Slab ≤ 30%", "usRule": "Ordinary ≤ 37% (passive FTC basket)"})
        if dividend_usd > 0:
            row({"head": "dividend", "label": "Dividend", "dir": "IN→US", "source": "India", "indiaLawUsd": dividend_usd, "usLawUsd": dividend_usd, "sameBase": True, "indiaRule": "Slab ≤ 30%", "usRule": "Qualified 15–20% if treaty + holding, else ordinary"})
        if capital_gains_usd > 0:
            row({
                "head": "capgains", "label": "Capital gains", "dir": "IN→US", "source": "India",
                "indiaLawUsd": capital_gains_usd, "usLawUsd": capital_gains_usd, "sameBase": True, "estimate": True,
                "indiaRule": "LTCG 12.5% / STCG slab · Indian holding periods",
                "usRule": "LTCG 0/15/20% (>1y) / STCG ordinary · USD cost basis",
                "note": "Same gain; the US recomputes on USD cost basis + acquisition-date FX (Rule 115).",
            })

    if in_ww:
        if us["wages"]["usd"] > 0:
            row({"head": "us_salary", "label": "US Salary / Wages", "dir": "US→IN", "source": "US", "indiaLawUsd": max(0.0, us["wages"]["usd"] - std_ded_usd), "usLawUsd": us["wages"]["usd"], "indiaRule": f"Less {std_ded_label} std deduction · slab ≤ 30%", "usRule": "Gross wage · brackets ≤ 37%"})
        if us["rentalUs"]["usd"] > 0:
            row({
                "head": "us_rental", "label": "US House property / Rental", "dir": "US→IN", "source": "US",
                "indiaLawUsd": us["rentalUs"]["usd"] * 1.15, "usLawUsd": us["rentalUs"]["usd"], "estimate": True,
                "indiaRule": "NAV less 30% only — US depreciation added back", "usRule": "Net after expenses + depreciation",
                "note": "India disallows US depreciation and grants only the 30% deduction, so its base is higher.",
            })
        if us["interestUs"]["usd"] > 0:
            row({"head": "us_interest", "label": "US Interest", "dir": "US→IN", "source": "US", "indiaLawUsd": us["interestUs"]["usd"], "usLawUsd": us["interestUs"]["usd"], "sameBase": True, "indiaRule": "Slab ≤ 30%", "usRule": "Ordinary ≤ 37%"})
        if us["ordinaryDividendsUs"]["usd"] > 0:
            row({"head": "us_dividend", "label": "US Dividend", "dir": "US→IN", "source": "US", "indiaLawUsd": us["ordinaryDividendsUs"]["usd"], "usLawUsd": us["ordinaryDividendsUs"]["usd"], "sameBase": True, "indiaRule": "Slab ≤ 30%", "usRule": "Qualified 15–20% / ordinary"})
        if us["capitalGainsUs"]["usd"] > 0:
            row({"head": "us_capgains", "label": "US Capital gains", "dir": "US→IN", "source": "US", "indiaLawUsd": us["capitalGainsUs"]["usd"], "usLawUsd": us["capitalGainsUs"]["usd"], "sameBase": True, "estimate": True, "indiaRule": "STCG slab / LTCG per Indian buckets", "usRule": "LTCG 0/15/20% / STCG ordinary"})

    overlap_usd = sum(r["overlapUsd"] for r in rows)
    any_estimate = any(r.get("estimate") for r in rows)
    return {"rows": rows, "overlapUsd": overlap_usd, "feieAppliedUsd": feie_applied, "anyEstimate": any_estimate}


def build(base: NodeRegistry) -> NodeRegistry:
    r = double_tax.build(base)

    r.register("usOwns10PctForeignCorpRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_entities.owns_10_percent_foreign_corp", False) is True, layer1_fields=("us.foreign_entities.owns_10_percent_foreign_corp",)))
    r.register("usForeignCorpsRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_entities.foreign_corporations", []) or [], layer1_fields=("us.foreign_entities.foreign_corporations",)))
    r.register("viaForeignCorpXbr4", NodeDef(deps=("usOwns10PctForeignCorpRaw", "usForeignCorpsRaw"), compute=lambda d, ctx: d["usOwns10PctForeignCorpRaw"] or len(d["usForeignCorpsRaw"]) > 0))

    r.register("crossBasisResult", NodeDef(
        deps=("usTaxResult", "residencyResult", "viaForeignCorpXbr4", "taxRegime",
              "salaryInr", "businessComputation", "housePropertyInr", "interestInr", "dividendInr", "indiaCapitalGainsInrXbr3",
              "aggregateUsIncomeResult"),
        compute=_cross_basis_result,
    ))
    return r
