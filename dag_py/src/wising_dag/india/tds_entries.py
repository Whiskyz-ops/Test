"""TDS by source, as Form 26AS / AIS lists it. Mirror of
prototypes/graph-pilot/tds-entries.js (see its header)."""
from __future__ import annotations

from ..core.util import num

SOURCES = {
    "salary": {"label": "Salary", "resident": "s.192", "nonResident": "s.192"},
    "interest": {"label": "Interest", "resident": "s.194A", "nonResident": "s.195"},
    "dividend": {"label": "Dividend", "resident": "s.194", "nonResident": "s.195"},
    "rent": {"label": "Rent", "resident": "s.194-I", "nonResident": "s.195"},
    "professional_fees": {"label": "Professional / technical fees", "resident": "s.194J", "nonResident": "s.195"},
    "other": {"label": "Other", "resident": None, "nonResident": "s.195"},
}


def tds_entries(india) -> list:
    tc = (india or {}).get("tax_credits") if isinstance(india, dict) else None
    lst = tc.get("tds_entries") if isinstance(tc, dict) else None
    if not isinstance(lst, list):
        return []
    out = []
    for e in lst:
        if not isinstance(e, dict) or not num(e.get("tds_inr")) > 0:
            continue
        src = e.get("source") if e.get("source") in SOURCES else "other"
        out.append({"source": src, "label": SOURCES[src]["label"], "payerName": e.get("payer_name") or None,
                    "incomeInr": num(e.get("income_inr")) or None, "tdsInr": num(e.get("tds_inr"))})
    return out


def tds_entries_total_inr(india) -> float:
    return sum(e["tdsInr"] for e in tds_entries(india))


def salary_tds_inr(india) -> float:
    return sum(e["tdsInr"] for e in tds_entries(india) if e["source"] == "salary")


def tds_section(source, is_non_resident: bool):
    s = SOURCES.get(source) or SOURCES["other"]
    return s["nonResident"] if is_non_resident else s["resident"]
