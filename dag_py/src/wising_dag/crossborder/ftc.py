"""computeFtc — the §904-style Form 1116 limitation (US direction) and the
India §159 relief (India direction). Port of
prototypes/graph-pilot/ftc-nodes.js.

All `*_BoundaryFtc` leaves are EXPLICIT BOUNDARY INPUTS (read
`ctx["computed"]...`/`ctx["model"]...`) — overridden by xborder_full.py to
in-graph values, exactly how india_full.py/us_full.py closed their own
boundaries.

DELIBERATE DAG/engine divergence (task #46, multi-country/multi-basket FTC —
docs/GAP_TRACKER.md section W): the frozen engine's computeFtc treats the
ENTIRE US<->India relationship as one undifferentiated number per direction.
Real §904(a) requires the credit to be limited separately BY BASKET (passive
vs. general/active — GILTI/NCTI is its own third basket under
§904(d)(1)(A), already de facto isolated since the §962-elected path never
reaches this file at all, see ustax.py's gilti962TaxUsd), and a real US
taxpayer can owe/pay foreign tax to MORE than one country, all combined onto
the same basket's Form 1116. Both are built here — see
prototypes/graph-pilot/ftc-nodes.js's own header for the full writeup
(reused verbatim, this is a byte-for-byte port).
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import num, safe
from ..india.aggregate_india_income import india_income_basket_split


def _compute_us_basket(foreign_src_gross_usd, feie_excluded_usd, foreign_tax_paid_gross_usd, us_taxable_usd, us_income_tax_usd, zeroed):
    src_gross_usd = 0.0 if zeroed else max(0.0, foreign_src_gross_usd)
    foreign_src_usd = max(0.0, src_gross_usd - feie_excluded_usd)
    creditable_fraction = 0 if zeroed else ((foreign_src_usd / src_gross_usd) if src_gross_usd > 0 else 1)
    # tax_paid_gross_usd is NOT force-zeroed here, matching the original
    # formula's own asymmetry exactly -- only creditable_fraction (already 0
    # above) zeroes tax_paid_usd downstream; tax_disallowed_usd correctly
    # stays the FULL gross tax amount for a zeroed (NRA/no-US-scope)
    # profile, not 0.
    tax_paid_gross_usd = foreign_tax_paid_gross_usd
    tax_paid_usd = tax_paid_gross_usd * creditable_fraction
    tax_disallowed_usd = tax_paid_gross_usd - tax_paid_usd
    limit_fraction = min(1.0, foreign_src_usd / us_taxable_usd) if us_taxable_usd > 0 else 0
    ftc_limit = us_income_tax_usd * limit_fraction
    ftc_allowed = min(tax_paid_usd, ftc_limit)
    carryover = max(0.0, tax_paid_usd - ftc_allowed)
    return {
        "foreignSourceIncomeUsd": foreign_src_usd, "feieExcludedUsd": feie_excluded_usd,
        "foreignTaxPaidGrossUsd": tax_paid_gross_usd, "indiaTaxDisallowedUsd": tax_disallowed_usd,
        "indiaTaxPaidUsd": tax_paid_usd, "limitFraction": limit_fraction, "ftcLimitUsd": ftc_limit,
        "ftcAllowedUsd": ftc_allowed, "carryoverUsd": carryover, "residualDoubleTaxUsd": carryover,
    }


def _sum_other_countries(entries, basket):
    income_usd = 0.0
    tax_paid_usd = 0.0
    for e in entries or []:
        if (e.get("basket") or "general") != basket:
            continue
        income_usd += num(e.get("foreign_source_income_usd"))
        tax_paid_usd += num(e.get("foreign_tax_paid_usd"))
    return {"incomeUsd": income_usd, "taxPaidUsd": tax_paid_usd}


def _india_inr_to_usd(ctx, inr_amount):
    m = safe(ctx, "model.income.india", None)
    if not m or not m["total"]["inr"]:
        return 0.0
    return inr_amount * (m["total"]["usd"] / m["total"]["inr"])


def _ftc_us_direction(d, ctx):
    # usIsNraBoundaryFtc / not hasUsScopeBoundaryFtc: the pre-existing
    # zeroing conditions (XB-24). not usWorldwideBoundaryFtc: a taxpayer can
    # cede US worldwide taxation via TREATY POSITION ALONE (no 1040-NR
    # filing at all), in which case usIsNraBoundaryFtc stays False but
    # compute_us_tax_core has already excluded India-source income from the
    # US taxable base. Without this, Direction 1 had no way to know that
    # happened and still credited Indian tax against US tax that was never
    # levied on that income at all — see run-ftc-correctness.js (ported to
    # Python's own equivalent hand-computed test).
    zeroed = d["usIsNraBoundaryFtc"] or not d["hasUsScopeBoundaryFtc"] or not d["usWorldwideBoundaryFtc"]
    feie_excluded_usd = d["feieExcludedUsdBoundaryFtc"]  # FEIE only ever excludes earned (general-category) income
    us_taxable_usd = d["usTaxableIncomeUsdBoundaryFtc"]
    us_income_tax_usd = d["usIncomeTaxUsdBoundaryFtc"]
    # Same denominator the ORIGINAL single-basket formula used as
    # foreign_src_gross_usd (model.income.india.total.usd, NOT
    # computed.indiaTax.totalIncomeUsd -- a different node, used only by
    # ftcIndiaDirection below) -- indiaPassiveIncomeUsdBoundaryFtc +
    # indiaGeneralIncomeUsdBoundaryFtc === this exactly, by construction.
    india_income_total_usd = d["indiaIncomeTotalUsdBoundaryFtc"]
    india_total_tax_usd = d["indiaTotalTaxUsdBoundaryFtc"]
    # India's own tax allocated to each basket by relative income share —
    # the same proportional-allocation technique the original single-basket
    # formula already used for the FEIE creditableFraction split.
    india_tax_on_passive_usd = india_total_tax_usd * (d["indiaPassiveIncomeUsdBoundaryFtc"] / india_income_total_usd) if india_income_total_usd > 0 else 0
    india_tax_on_general_usd = india_total_tax_usd * (d["indiaGeneralIncomeUsdBoundaryFtc"] / india_income_total_usd) if india_income_total_usd > 0 else 0

    other_passive = _sum_other_countries(d["otherCountryFtcEntriesRaw"], "passive")
    other_general = _sum_other_countries(d["otherCountryFtcEntriesRaw"], "general")

    passive_src_gross_usd = d["indiaPassiveIncomeUsdBoundaryFtc"] + other_passive["incomeUsd"]
    general_src_gross_usd = d["indiaGeneralIncomeUsdBoundaryFtc"] + other_general["incomeUsd"]
    passive_tax_paid_gross_usd = india_tax_on_passive_usd + other_passive["taxPaidUsd"]
    general_tax_paid_gross_usd = india_tax_on_general_usd + other_general["taxPaidUsd"] + d["foreignWagesTaxPaidUsdBoundaryFtc"]

    passive = _compute_us_basket(passive_src_gross_usd, 0, passive_tax_paid_gross_usd, us_taxable_usd, us_income_tax_usd, zeroed)
    general = _compute_us_basket(general_src_gross_usd, feie_excluded_usd, general_tax_paid_gross_usd, us_taxable_usd, us_income_tax_usd, zeroed)

    combined_src_usd = passive["foreignSourceIncomeUsd"] + general["foreignSourceIncomeUsd"]
    return {
        # Combined totals — the REAL basket-separated result (not a re-run
        # of the old single-basket formula): a taxpayer whose passive
        # basket has excess credit can't use it against a general-basket
        # shortfall, so this combined carryover can be HIGHER than the old
        # undifferentiated calc would have shown for the same profile —
        # that's §904(a) working as intended, not a regression.
        "foreignSourceIncomeUsd": combined_src_usd,
        "feieExcludedUsd": feie_excluded_usd,
        "indiaTaxDisallowedUsd": passive["indiaTaxDisallowedUsd"] + general["indiaTaxDisallowedUsd"],
        "taxableIncomeUsd": us_taxable_usd,
        "usIncomeTaxUsd": us_income_tax_usd,
        "indiaTaxPaidUsd": passive["indiaTaxPaidUsd"] + general["indiaTaxPaidUsd"],
        "limitFraction": min(1.0, combined_src_usd / us_taxable_usd) if us_taxable_usd > 0 else 0,
        "ftcLimitUsd": passive["ftcLimitUsd"] + general["ftcLimitUsd"],
        "ftcAllowedUsd": passive["ftcAllowedUsd"] + general["ftcAllowedUsd"],
        "carryoverUsd": passive["carryoverUsd"] + general["carryoverUsd"],
        "residualDoubleTaxUsd": passive["carryoverUsd"] + general["carryoverUsd"],
        "baskets": {"passive": passive, "general": general},
        "otherCountries": d["otherCountryFtcEntriesRaw"],
    }


def _ftc_india_direction(d, ctx):
    worldwide = d["indiaWorldwideBoundaryFtc"]
    foreign_src_india_usd = d["usSourceTotalUsdBoundaryFtc"] if worldwide else 0
    passive_src_usd = d["usPassiveIncomeUsdBoundaryFtc"] if worldwide else 0
    general_src_usd = d["usGeneralIncomeUsdBoundaryFtc"] if worldwide else 0
    india_total_income_usd = d["indiaTotalIncomeUsdBoundaryFtc"]
    india_total_tax_usd = d["indiaTotalTaxUsdBoundaryFtc"]
    us_total_income_usd = d["usTotalIncomeUsdBoundaryFtc"]
    us_income_tax_usd = d["usIncomeTaxUsdBoundaryFtc"]

    def basket(src_usd):
        india_tax_on_foreign_usd = india_total_tax_usd * min(1.0, src_usd / india_total_income_usd) if india_total_income_usd > 0 else 0
        us_tax_on_us_source_usd = us_income_tax_usd * min(1.0, src_usd / us_total_income_usd) if us_total_income_usd > 0 else 0
        relief_allowed = min(us_tax_on_us_source_usd, india_tax_on_foreign_usd)
        return {"foreignSourceIncomeUsd": src_usd, "usTaxOnUsSourceUsd": us_tax_on_us_source_usd, "reliefCapUsd": india_tax_on_foreign_usd, "reliefAllowedUsd": relief_allowed}

    passive = basket(passive_src_usd)
    general = basket(general_src_usd)
    # Combined figures kept as the ORIGINAL single formula (not a sum of the
    # two baskets') — unlike the US direction, India's §90/91 relief is a
    # single per-country credit with no statutory basket limitation of its
    # own, so the pre-existing combined math is still the correct "real"
    # answer; baskets here are additional detail, not a tightened
    # limitation the way §904(a) requires on the US side.
    india_tax_on_foreign_usd = india_total_tax_usd * min(1.0, foreign_src_india_usd / india_total_income_usd) if india_total_income_usd > 0 else 0
    us_tax_on_us_source_usd = us_income_tax_usd * min(1.0, d["usSourceIncomeUsdBoundaryFtc"] / us_total_income_usd) if us_total_income_usd > 0 else 0
    india_relief_allowed = min(us_tax_on_us_source_usd, india_tax_on_foreign_usd)
    return {
        "foreignSourceIncomeUsd": foreign_src_india_usd,
        "usTaxOnUsSourceUsd": us_tax_on_us_source_usd,
        "reliefCapUsd": india_tax_on_foreign_usd,
        "reliefAllowedUsd": india_relief_allowed,
        "baskets": {"passive": passive, "general": general},
    }


def _ftc_result(d, ctx):
    us_residual = d["ftcUsDirection"]["carryoverUsd"]
    india_residual = max(0.0, min(d["ftcIndiaDirection"]["usTaxOnUsSourceUsd"], d["ftcIndiaDirection"]["reliefCapUsd"]) - d["ftcIndiaDirection"]["reliefAllowedUsd"])
    return {
        "us": d["ftcUsDirection"], "india": d["ftcIndiaDirection"],
        "netUnrelievedDoubleTaxUsd": us_residual + india_residual,
    }


NODES = {
    "feieExcludedUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx, "computed.usTax.feie.appliedUsd", None))),
    "usIsNraBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.usTax.isNra", False))),
    "hasUsScopeBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.meta.hasUsScope", None) is not False),
    "indiaIncomeTotalUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.india.total.usd", None)),
    # §904 basket split of India-source income (task #46) — derived via the
    # shared india_income_basket_split() (see import above), so
    # indiaPassiveIncomeUsdBoundaryFtc + indiaGeneralIncomeUsdBoundaryFtc ===
    # indiaIncomeTotalUsdBoundaryFtc above, always.
    "indiaPassiveIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: _india_inr_to_usd(ctx, india_income_basket_split(ctx["model"]["income"]["india"])["passiveInr"])),
    "indiaGeneralIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: _india_inr_to_usd(ctx, india_income_basket_split(ctx["model"]["income"]["india"])["generalInr"])),
    "usTaxableIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.taxableIncomeUsd", None)),
    "usIncomeTaxUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.incomeTaxUsd", None)),
    "usTotalIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.totalIncomeUsd", None)),
    "usSourceIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.usTax.usSourceIncomeUsd", None)),
    "indiaTotalTaxUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.indiaTax.totalTaxUsd", None)),
    "indiaTotalIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "computed.indiaTax.totalIncomeUsd", None)),
    "indiaWorldwideBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.residency.india.worldwide", False))),
    # Reads computed.usTax.worldwide (the already entity/NRA-routing-aware
    # field every usTax result shape carries), NOT
    # computed.residency.us.worldwide directly — that field is an
    # INDIVIDUAL-only concept (citizen/green-card/SPT tests), always False
    # for a real business entity; reading it here would wrongly zero
    # Direction 1 for every entity taxpayer (an entity's own usTax result
    # already declares worldwide=True).
    "usWorldwideBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx, "computed.usTax.worldwide", False))),
    "usSourceTotalUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.us.usSourceTotal.usd", None)),
    # §904 basket split of US-source income (India direction, task #46) —
    # reused for the India §159 relief calc's own basket separation.
    # safe()-guarded: otherOrdinaryIncomeUs is a DAG-only field with no
    # frozen-engine equivalent, absent on the real engine's model.income.us.
    "usPassiveIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: (
        num(safe(ctx, "model.income.us.interestUs.usd", 0)) + num(safe(ctx, "model.income.us.ordinaryDividendsUs.usd", 0)) +
        num(safe(ctx, "model.income.us.ltcgUs.usd", 0)) + num(safe(ctx, "model.income.us.stcgUs.usd", 0)) + num(safe(ctx, "model.income.us.rentalUs.usd", 0))
    )),
    "usGeneralIncomeUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: (
        num(safe(ctx, "model.income.us.wages.usd", 0)) + num(safe(ctx, "model.income.us.businessUs.usd", 0)) +
        num(safe(ctx, "model.income.us.usRetirementIncome.usd", 0)) + num(safe(ctx, "model.income.us.otherOrdinaryIncomeUs.usd", 0))
    )),
    # Multi-country (task #46): the previously-dead foreign_wages[].
    # foreign_tax_paid_usd plus layer1_us.html's new "Other Foreign Tax
    # Credits" section, entered directly by country/basket since this
    # engine only computes India's own tax.
    "foreignWagesTaxPaidUsdBoundaryFtc": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx, "model.income.us.foreignWagesTaxPaidUsd", 0) or 0),
    "otherCountryFtcEntriesRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_tax_credit_other.entries", []) or []),

    "ftcUsDirection": NodeDef(
        deps=("feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc", "usWorldwideBoundaryFtc",
              "indiaPassiveIncomeUsdBoundaryFtc", "indiaGeneralIncomeUsdBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc",
              "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc",
              "foreignWagesTaxPaidUsdBoundaryFtc", "otherCountryFtcEntriesRaw"),
        compute=_ftc_us_direction,
    ),
    "ftcIndiaDirection": NodeDef(
        deps=("indiaWorldwideBoundaryFtc", "usPassiveIncomeUsdBoundaryFtc", "usGeneralIncomeUsdBoundaryFtc", "usSourceTotalUsdBoundaryFtc",
              "indiaTotalIncomeUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc", "usTotalIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc"),
        compute=_ftc_india_direction,
    ),
    "ftcResult": NodeDef(deps=("ftcUsDirection", "ftcIndiaDirection"), compute=_ftc_result),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
