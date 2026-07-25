"""calendarAmountsResult (CL-2) — forward-looking ₹/$ figures for the
Compliance Calendar's advance-tax/estimated-tax rows. Port of
prototypes/graph-pilot/calendar-amounts-nodes.js.

Reuses india/findings.py's IN-1 chain (`inAdvTaxObliged`/`inPurelyPresumptive`/
`assessedTaxInr`/`advQ1Inr`..`advQ4Inr`) and us/findings.py's US1 chain
(`usRequiredUsd`/`usWithholdingTotalUsd`/`usEstQ1Usd`..`usEstQ4Usd`) — same
per-quarter shortfall math as `india_advance_tax_interest`/
`underpayment_2210`, read PROSPECTIVELY instead of retrospectively. India is
gated on `inAdvTaxObliged` (below the s.404 ₹10,000 floor there's no
obligation at all — `installments` is `[]`, not a list of zeros). US has no
equivalent blanket exemption, EXCEPT for a US entity taxpayer (§6654's
individual-only structure doesn't apply to a corporation's own §6655 regime)
— `installments` is `[]` for that case too.
"""
from __future__ import annotations

from ..core.graph import NodeDef


def _calendar_amounts_result(d, ctx):
    india = {"obliged": False, "purelyPresumptive": bool(d["inPurelyPresumptive"]), "installments": []}
    if d["hasIndiaScope"] and d["inAdvTaxObliged"]:
        india["obliged"] = True
        if d["inPurelyPresumptive"]:
            paid_total = d["advQ1Inr"] + d["advQ2Inr"] + d["advQ3Inr"] + d["advQ4Inr"]
            india["installments"] = [{
                "quarter": "single", "requiredPct": 1.00, "paidInr": paid_total,
                "amountDueInr": max(0.0, d["assessedTaxInr"] * 1.00 - paid_total),
            }]
        else:
            quarters = [
                {"quarter": 1, "requiredPct": 0.15, "paidInr": d["advQ1Inr"]},
                {"quarter": 2, "requiredPct": 0.30, "paidInr": d["advQ2Inr"]},
                {"quarter": 3, "requiredPct": 0.30, "paidInr": d["advQ3Inr"]},
                {"quarter": 4, "requiredPct": 0.25, "paidInr": d["advQ4Inr"]},
            ]
            india["installments"] = [
                {**q, "amountDueInr": max(0.0, d["assessedTaxInr"] * q["requiredPct"] - q["paidInr"])} for q in quarters
            ]

    us = {"requiredUsd": 0, "installments": []}
    if d["hasUsScope"] and not d["usTaxResult"].get("isEntity"):
        us["requiredUsd"] = d["usRequiredUsd"]
        per_q_withholding_usd = d["usWithholdingTotalUsd"] / 4
        est_by_q = {1: d["usEstQ1Usd"], 2: d["usEstQ2Usd"], 3: d["usEstQ3Usd"], 4: d["usEstQ4Usd"]}
        us["installments"] = []
        for q in (1, 2, 3, 4):
            required_usd = d["usRequiredUsd"] / 4
            paid_usd = per_q_withholding_usd + est_by_q[q]
            us["installments"].append({"quarter": q, "requiredUsd": required_usd, "paidUsd": paid_usd, "amountDueUsd": max(0.0, required_usd - paid_usd)})

    return {"india": india, "us": us}


NODES = {
    "calendarAmountsResult": NodeDef(
        deps=("hasIndiaScope", "hasUsScope", "inAdvTaxObliged", "inPurelyPresumptive", "assessedTaxInr",
              "advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr",
              "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd", "usTaxResult"),
        compute=_calendar_amounts_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
