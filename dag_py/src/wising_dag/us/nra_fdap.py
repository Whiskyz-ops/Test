"""Per-income-type FDAP for a 1040-NR filer, shared by ustax_full.py
(nraTaxResult) and findings.py (nraFdapDetail) so the tax, the withholding
summary and the finding read the same rates."""
from __future__ import annotations

from ..core.util import num


def nra_fdap_breakdown(fdap_usd, agg, royalties_usd, rental_elected, claims, w8ben):
    """FDAP of a 1040-NR filer, one row per income type (India-US treaty):
    dividends / interest / royalties at the rate claimed for THAT type on a
    W-8BEN (Art. 10/11/12, capped at the 30% statutory rate); gross US rent
    30%; Social Security 85% taxable at 30% (§871(a)(3), Art. 20(2)); periodic
    US pensions / IRA payments taxable only in India (Art. 20(1)) — a $0 row.
    Declared FDAP beyond the typed rows is taxed at 30%; declared FDAP below
    them fills the rows in order. Mirrors
    prototypes/graph-pilot/nra-fdap-util.js."""
    rate_for = {}
    for c in claims or []:
        if not c or c.get("elected_rate") is None or c.get("elected_rate") == "":
            continue
        t = str(c.get("income_type") or "").lower()
        t = t[:-1] if t.endswith("s") else t
        rate_for[t] = max(0.0, min(0.30, num(c["elected_rate"]) / 100))

    def rate(t):
        return rate_for[t] if (w8ben and t in rate_for) else 0.30

    # Tax a missing W-8BEN costs: the claimed rate is denied, 30% applies.
    def gap(t, base):
        return base * (0.30 - rate_for[t]) if (not w8ben and t in rate_for) else 0

    def usd(v):
        return num(v["usd"]) if v else 0

    typed = [
        {"type": "dividends", "baseUsd": usd(agg.get("ordinaryDividendsUs")), "rate": rate("dividend"), "basis": "Art. 10"},
        {"type": "interest", "baseUsd": usd(agg.get("interestUs")), "rate": rate("interest"), "basis": "Art. 11"},
        {"type": "royalties", "baseUsd": num(royalties_usd), "rate": rate("royaltie"), "basis": "Art. 12"},
        {"type": "rent", "baseUsd": 0 if rental_elected else usd(agg.get("rentalUs")), "rate": 0.30, "basis": "gross rent, no treaty reduction"},
    ]
    typed_usd = sum(r["baseUsd"] for r in typed)
    # Declared FDAP below the typed income: fill the rows in order (dividends,
    # interest, royalties, then rent — rent is what a §871(d) net-basis
    # election usually moves to ECI) rather than scaling every row.
    if fdap_usd < typed_usd:
        left = max(0.0, fdap_usd)
        for r in typed:
            r["baseUsd"] = min(r["baseUsd"], left)
            left -= r["baseUsd"]
    elif fdap_usd > typed_usd:
        typed.append({"type": "other", "baseUsd": fdap_usd - typed_usd, "rate": 0.30, "basis": "statutory 30%"})
    ss_usd = usd(agg.get("socialSecurityUs"))
    pension_usd = usd(agg.get("usRetirementIncomeExclSs"))
    extra = [
        {"type": "social_security", "baseUsd": 0.85 * ss_usd, "rate": 0.30, "basis": "§871(a)(3): 85% taxable at 30%; DTAA Art. 20(2)"},
        {"type": "pensions", "baseUsd": pension_usd, "rate": 0, "basis": "DTAA Art. 20(1): periodic pensions taxable only in India"},
    ]
    rows = [r for r in typed + extra if r["baseUsd"] > 0]
    claim_type = {"dividends": "dividend", "interest": "interest", "royalties": "royaltie"}
    for r in rows:
        r["taxUsd"] = r["baseUsd"] * r["rate"]
    gap_usd = sum(gap(claim_type[r["type"]], r["baseUsd"]) for r in rows if r["type"] in claim_type)
    lump = [r for r in rows if r["type"] not in ("social_security", "pensions")]
    lump_base = sum(r["baseUsd"] for r in lump)
    lump_tax = sum(r["taxUsd"] for r in lump)
    return {
        "rows": rows, "fdapTaxUsd": lump_tax, "effectiveRate": (lump_tax / lump_base) if lump_base > 0 else None,
        "socialSecurityTaxableUsd": 0.85 * ss_usd, "socialSecurityTaxUsd": 0.85 * ss_usd * 0.30,
        "pensionUsd": pension_usd, "gapUsd": gap_usd,
    }
