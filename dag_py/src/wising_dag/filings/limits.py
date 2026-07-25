"""limitsResult (LIM-2/4/5) — the six Monitor gauge cards (fbar, form8938,
lrs, nro_repatriation, feie, trump_account). Port of
prototypes/graph-pilot/limits-nodes.js.

Deferred from Phase 4 (crossborder/) purely for organizational reasons —
all of its real dependencies (`aggregatePeakUsdResult`, `limitsRawExtra`,
`hasUsScopeBoundaryFtc`, `hasIndiaScopeXbr`) already exist, ported in
Phase 4/5's crossborder/us findings modules. `feieEligibilityFull()` in the
JS source is byte-identical to `us/ustax.py`'s `feie_eligibility()` (already
includes `reasons[]`, unlike the note in the Phase 5 tracker about the
US-side port needing a sibling for that — it never did) — reused directly
rather than re-derived.
"""
from __future__ import annotations

from ..core.constants import LIMITS
from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import num, safe
from ..us.ustax import feie_eligibility

L = LIMITS


def _gauge(gauges: list, id_: str, label: str, value_usd: float, limit_usd: float, unit: str = "USD", note: str = "") -> None:
    pct = (value_usd / limit_usd) if limit_usd > 0 else 0
    status = "breached" if pct >= 1 else ("approaching" if pct >= 0.8 else "ok")
    gauges.append({"id": id_, "label": label, "value": value_usd, "limit": limit_usd, "pct": pct, "status": status, "unit": unit, "note": note})


def _limits_result(d, ctx):
    gauges: list = []
    scope_has_us = d["hasUsScopeBoundaryFtc"]
    scope_has_india = d["hasIndiaScopeXbr"]
    aggregate_peak_usd = d["aggregatePeakUsdResult"]["usd"]

    if scope_has_us:
        _gauge(gauges, "fbar", "FBAR (FinCEN 114) aggregate", aggregate_peak_usd, L["FBAR_AGGREGATE_USD"], "USD",
               "Threshold is a cliff: any breach = full reporting of every foreign account.")

    is_mfj = d["usFilingStatusRaw"] == "mfj"
    feie_el = feie_eligibility(d["feieLimitsRaw"])
    abroad = feie_el["taxHomeAbroad"] and feie_el["testMet"]
    tbl_key = ("ABROAD_MFJ" if is_mfj else "ABROAD_SINGLE") if abroad else ("US_RESIDENT_MFJ" if is_mfj else "US_RESIDENT_SINGLE")
    tbl = L["FORM_8938"][tbl_key]
    if scope_has_us:
        _gauge(gauges, "form8938", "Form 8938 (FATCA) any-time", aggregate_peak_usd, tbl["anyTime"], "USD",
               "Threshold shown is the 'any time during year' figure for your status/residence.")

    if scope_has_india:
        _gauge(gauges, "lrs", "LRS outbound remittance", d["limitsRawExtra"]["lrsRemittedInr"] / fx_rate(ctx), L["LRS_ANNUAL_USD"], "USD",
               "RBI cap is per individual per financial year; TCS applies above ₹10L.")

    if scope_has_india and d["nroCumulativeRepatriatedUsdRaw"] > 0:
        _gauge(gauges, "nro_repatriation", "NRO repatriation (this FY)", d["nroCumulativeRepatriatedUsdRaw"], L["NRO_REPATRIATION_ANNUAL_USD"], "USD",
               "RBI ceiling on NRO-account repatriation abroad, separate from and in addition to the LRS cap above — each "
               "repatriation needs its own Form 15CA/15CB (Form 145/146 from TY2026-27).")

    if feie_el["claimed"] or d["feieLimitsRaw"]["foreignEarnedIncomeUsd"] > 0:
        if feie_el["eligible"]:
            feie_used = min(d["feieLimitsRaw"]["amountClaimedUsd"] or d["feieLimitsRaw"]["foreignEarnedIncomeUsd"], L["FEIE_MAX_USD"])
            note = "Excluded foreign earned income cannot also generate FTC — §911 no-double-dip applied."
        else:
            feie_used = 0
            note = (f"FEIE claimed but NOT eligible ({'; '.join(feie_el['reasons'])}) — exclusion set to $0."
                    if feie_el["claimed"] else "Not claimed.")
        _gauge(gauges, "feie", "FEIE exclusion used", feie_used, L["FEIE_MAX_USD"], "USD", note)

    if d["limitsRawExtra"]["trumpAccountsOpened"]:
        ta_children = max(1, d["limitsRawExtra"]["trumpAccountsNumChildren"] or 1)
        _gauge(gauges, "trump_account", "Trump Account (§530A) annual contributions", d["limitsRawExtra"]["trumpAccountsContributionsUsd"],
               L["TRUMP_ACCOUNT_ANNUAL_CAP_USD"] * ta_children, "USD",
               f"Cap is {L['TRUMP_ACCOUNT_ANNUAL_CAP_USD']:,}/child/year, combined across all contributors (parents, family, "
               f"employer) — shown here as the aggregate across {round(ta_children)} child(ren).")

    return gauges


NODES = {
    "feieLimitsRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "claimed": safe(ctx.get("us"), "foreign_earned_income.claims_feie", False) is True,
            "amountClaimedUsd": num(safe(ctx.get("us"), "foreign_earned_income.feie_amount_claimed_usd", 0)),
            "foreignEarnedIncomeUsd": num(safe(ctx.get("us"), "foreign_earned_income.foreign_earned_income_usd", 0)),
            "taxHomeCountry": safe(ctx.get("us"), "foreign_earned_income.tax_home_country", ""),
            "bonaFide": safe(ctx.get("us"), "foreign_earned_income.bona_fide_residence", False) is True,
            "physicalPresence": safe(ctx.get("us"), "foreign_earned_income.physical_presence", False) is True,
            "daysInUsTestPeriod": num(safe(ctx.get("us"), "foreign_earned_income.days_in_us_during_test_period", 0)),
        },
        layer1_fields=(
            "us.foreign_earned_income.claims_feie", "us.foreign_earned_income.feie_amount_claimed_usd",
            "us.foreign_earned_income.foreign_earned_income_usd", "us.foreign_earned_income.tax_home_country",
            "us.foreign_earned_income.bona_fide_residence", "us.foreign_earned_income.physical_presence",
            "us.foreign_earned_income.days_in_us_during_test_period",
        ),
    ),
    "nroCumulativeRepatriatedUsdRaw": NodeDef(
        deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "nro_repatriation.cumulative_repatriated_usd_this_fy", 0)),
        layer1_fields=("india.nro_repatriation.cumulative_repatriated_usd_this_fy",),
    ),
    "limitsResult": NodeDef(
        deps=("hasUsScopeBoundaryFtc", "hasIndiaScopeXbr", "aggregatePeakUsdResult", "usFilingStatusRaw",
              "feieLimitsRaw", "limitsRawExtra", "nroCumulativeRepatriatedUsdRaw"),
        compute=_limits_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
