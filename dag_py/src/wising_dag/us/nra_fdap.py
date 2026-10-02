"""Per-income-type FDAP for a 1040-NR filer, shared by ustax_full.py
(nraTaxResult) and findings.py (nraFdapDetail) so the tax, the withholding
summary and the finding read the same rates."""
from __future__ import annotations

from ..core.util import num


def nra_fdap_breakdown(fdap_usd, agg, royalties_usd, rental_elected, claims, w8ben, treaty_resident=True, exempt_interest_usd=0):
    # treaty_resident: False only when Layer 1 India records the client as NOT
    # resident in India — then no India-US treaty benefit applies at all.
    treaty_resident = treaty_resident is not False
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
        return rate_for[t] if (treaty_resident and w8ben and t in rate_for) else 0.30

    # Tax a missing W-8BEN costs: the claimed rate is denied, 30% applies.
    def gap(t, base):
        return base * (0.30 - rate_for[t]) if (treaty_resident and not w8ben and t in rate_for) else 0

    def usd(v):
        return num(v["usd"]) if v else 0

    interest_usd = usd(agg.get("interestUs"))
    exempt_int_usd = min(max(0.0, num(exempt_interest_usd)), interest_usd)
    typed = [
        {"type": "dividends", "baseUsd": usd(agg.get("ordinaryDividendsUs")), "rate": rate("dividend"), "basis": "Art. 10"},
        {"type": "interest_exempt", "baseUsd": exempt_int_usd, "rate": 0, "basis": "IRC §871(i)/(h): bank-deposit and portfolio (incl. Treasury) interest exempt for a non-resident alien"},
        {"type": "interest", "baseUsd": interest_usd - exempt_int_usd, "rate": rate("interest"), "basis": "Art. 11"},
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
    # DTAA Art. 20 covers pensions (periodic payments) only — see nra-fdap-util.js.
    lump_sum_usd = min(pension_usd, num(agg.get("usRetirementLumpSumUsd")))
    periodic_usd = pension_usd - lump_sum_usd
    extra = [
        {"type": "social_security", "baseUsd": 0.85 * ss_usd, "rate": 0.30, "basis": "§871(a)(3): 85% taxable at 30%; DTAA Art. 20(2)"},
        ({"type": "pensions", "baseUsd": periodic_usd, "rate": 0, "basis": "DTAA Art. 20(1): periodic pensions taxable only in India"} if treaty_resident
         else {"type": "pensions", "baseUsd": periodic_usd, "rate": 0.30, "basis": "30% — not resident in India, so DTAA Art. 20(1) doesn't apply"}),
        {"type": "retirement_lump_sum", "baseUsd": lump_sum_usd, "rate": 0.30, "basis": "30% — a lump-sum withdrawal isn't a pension (periodic payments) under DTAA Art. 20"},
    ]
    rows = [r for r in typed + extra if r["baseUsd"] > 0]
    claim_type = {"dividends": "dividend", "interest": "interest", "royalties": "royaltie"}
    for r in rows:
        r["taxUsd"] = r["baseUsd"] * r["rate"]
    gap_usd = sum(gap(claim_type[r["type"]], r["baseUsd"]) for r in rows if r["type"] in claim_type)
    lump = [r for r in rows if r["type"] not in ("social_security", "pensions", "retirement_lump_sum")]
    lump_base = sum(r["baseUsd"] for r in lump)
    lump_tax = sum(r["taxUsd"] for r in lump)
    return {
        "rows": rows, "fdapTaxUsd": lump_tax, "effectiveRate": (lump_tax / lump_base) if lump_base > 0 else None,
        "socialSecurityTaxableUsd": 0.85 * ss_usd, "socialSecurityTaxUsd": 0.85 * ss_usd * 0.30,
        "pensionUsd": periodic_usd if treaty_resident else 0, "pensionTaxUsd": (0 if treaty_resident else 0.30 * periodic_usd) + 0.30 * lump_sum_usd,
        "pensionTaxableUsd": (0 if treaty_resident else periodic_usd) + lump_sum_usd, "gapUsd": gap_usd,
    }


def nra_exempt_interest_usd(us):
    """US interest a non-resident alien owes no US tax on (bank deposits,
    §871(i)(2)(A); portfolio incl. Treasury interest, §871(h)) from Layer 1
    US's own interest split. Mirrors nra-fdap-util.js."""
    ui = (us or {}).get("income_us_source") or {}
    return min(num(ui.get("interest_us_bank_usd")) + num(ui.get("interest_us_treasury_usd")), num(ui.get("interest_us_source_usd")))


def nra_interest_split_recorded(us):
    ui = (us or {}).get("income_us_source") or {}
    return any(num(ui.get(k)) > 0 for k in ("interest_us_bank_usd", "interest_us_treasury_usd", "interest_us_oid_usd", "interest_us_private_usd"))
