"""The final closure layer — port of agg10-nodes.js's `identityResult`/
`metaResult`/`residencyModelSliceResult`/`headlineResult`/`summaryResult`
plus its "16 v1-era boundaries closed here" override block (the ones not
already closed elsewhere — see each override's own comment below for why).

Unlike agg10-nodes.js's own `withSyntheticCtx()` technique (wrap the
ORIGINAL ctx.model/ctx.computed-reading function body with a synthetic ctx
assembled from in-graph deps, to reuse one JS function body against two ctx
shapes), this port's nodes read the real in-graph deps directly — there's
only ever one ctx shape here, so the indirection has no purpose.

This is deliberately the LAST module `core.registry.build_full_registry()`
composes: every dep below (`entityResult`, `usTaxResult`, `ftcResult`,
`aggregateUsIncomeResult`, `bankAccountsRaw`, `findingsAllResult`,
`buildDocumentsResult`, `monitorResult`, `apportionmentResult`, ...) must
already be registered.

The `usTaxResult`/`ftcResult`/`aggregateUsIncomeResult`/`bankAccountsRaw`-
dependent boundaries below all genuinely need cross-domain state
unavailable until every domain is composed, unlike the two dead-source-file
bugs fixed in Phase 6 (`indianBusinessesBoundary`/`usSecuritiesBoundary`,
which needed nothing but their own domain's already-built chain).

`usEntityKind`/`baseYearUs` are NOT closed here, on purpose — `us/us_full.py`'s
own header already promises "closed in ustax_full.py", and that module
(composed AFTER this one, since it also redefines `usTaxResult` itself into
an entity/NRA-routing-aware router) is where that promise is kept. Every
override below that reads `usTaxResult` (directly, or via `headlineResult`)
automatically becomes entity/NRA-aware once `us/ustax_full.py` runs, with no
further change needed here — that's the whole point of resolving
`usTaxResult` by id rather than by branch.
"""
from __future__ import annotations

from .fx_util import fx_rate
from .graph import NodeDef
from .util import num, safe

OVERRIDE_REASON = (
    "agg10-nodes.js wiring: closes the remaining v1-era boundaries now that "
    "every domain (india/us/crossborder/filings/reports) is composed into one registry"
)


def _identity_result(d, ctx):
    router, india, us = ctx.get("router"), ctx.get("india"), ctx.get("us")
    return {
        "name": safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
        "dob": safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", None))),
        "usFilingStatus": d["usFilingStatusRaw"],
        "indiaEntityType": safe(india, "profile.entity_type", "individual"),
        "panAadhaarLinked": safe(india, "profile.pan_aadhaar_linked", None),
    }


def _meta_result(d, ctx):
    india, us, router = ctx.get("india"), ctx.get("us"), ctx.get("router")
    scope_has_us, scope_has_india = d["hasUsScopeBoundaryFtc"], d["hasIndiaScopeXbr"]
    return {
        "hasIndia": bool(india) and len(india or {}) > 0,
        "hasUs": bool(us) and len(us or {}) > 0,
        "hasRouter": bool(router) and len(router or {}) > 0,
        "hasIndiaScope": scope_has_india, "hasUsScope": scope_has_us,
        "jurisdiction": "dual" if (scope_has_india and scope_has_us) else ("single_us" if scope_has_us else "single_india"),
        "baseYear": int(num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) or 2025),
        "fxRate": fx_rate(ctx),
        "indiaSchemaVersion": safe(india, "metadata.schema_version", None), "usSchemaVersion": safe(us, "metadata.schema_version", None),
        "indiaQuarterly": bool(safe(india, "quarters", None)),
    }


def _residency_model_slice_result(d, ctx):
    india, us = ctx.get("india"), ctx.get("us")
    return {
        "india": {
            "status": safe(india, "residency_detail.final_india_residency_status", None),
            "daysCurrentYear": num(safe(india, "residency_detail.days_in_india_current_year", 0)),
            "taxRegime": safe(india, "profile.tax_regime", "NEW"),
            "isIndianCompanyFact": safe(india, "residency_detail.is_indian_company", None),
            "indiaWhollyOutsideIndiaFact": safe(india, "residency_detail.is_wholly_outside_india", None),
            "daysPreceding4YearsGte365": safe(india, "residency_detail.days_in_india_preceding_4_years_gte_365", None),
            "employmentOrCrewStatus": safe(india, "residency_detail.employment_or_crew_status", None),
            "cameOnVisitPioCitizen": safe(india, "residency_detail.came_on_visit_to_india_pio_citizen", None),
            "nrYearsLast10Gte9": safe(india, "residency_detail.nr_years_last_10_gte_9", None),
            "daysLast7YearsLte729": safe(india, "residency_detail.days_in_india_last_7_years_lte_729", None),
            "indiaSourceIncomeAbove15L": safe(india, "residency_detail.india_source_income_above_15l", None),
            "liableToTaxElsewhereAsIndianCitizen": safe(india, "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", False) is True,
            "dtaaWorldwideCeded": safe(india, "residency_detail.dtaa_worldwide_ceded", False) is True,
            "domesticStatusDerived": d["indiaDomesticStatusDerived"],
        },
        "us": {
            "status": safe(us, "us_residency_detail.final_us_residency_status", None),
            "isCitizen": safe(us, "us_residency_detail.is_us_citizen", False) is True,
            "hasGreenCard": safe(us, "us_residency_detail.has_green_card", False) is True,
            "sptMet": safe(us, "us_residency_detail.spt_test_met", False) is True,
            "daysCurrentYear": num(safe(us, "us_residency_detail.us_days_current_year", 0)),
        },
    }


def _headline_result(d, ctx):
    # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H, per
    # agg10-nodes.js's own comment): a US business entity's own income is
    # usTaxResult.totalIncomeUsd (Schedule M-1), not the individual-shaped
    # aggregateUsIncomeResult.total.usd (which is $0 for an entity).
    us_total_income_usd = d["usTaxResult"]["totalIncomeUsd"] if d["usTaxResult"].get("isEntity") else d["aggregateUsIncomeResult"]["total"]["usd"]
    return {
        "name": d["identityResult"]["name"], "baseYear": d["metaResult"]["baseYear"], "jurisdiction": d["metaResult"]["jurisdiction"],
        "totalIncomeUsd": us_total_income_usd + d["totalIndiaIncomeInr"] / fx_rate(ctx),
        "indiaTaxUsd": d["totalTaxInrCombined"] / fx_rate(ctx), "usTaxUsd": d["usTaxResult"]["totalTaxBeforeFtcUsd"],
        "combinedTaxBeforeReliefUsd": d["totalTaxInrCombined"] / fx_rate(ctx) + d["usTaxResult"]["totalTaxBeforeFtcUsd"],
        "worldwideOverlap": d["residencyResult"]["worldwideOverlap"], "netUnrelievedDoubleTaxUsd": d["ftcResult"]["netUnrelievedDoubleTaxUsd"],
    }


def _accounts_boundary(d, ctx):
    india_accounts = [
        {
            "bank": b.get("bank_name") or "Indian Bank", "type": b.get("account_type") or "savings",
            "peak": {"inr": num(b.get("peak_balance_inr")), "usd": num(b.get("peak_balance_inr")) / fx_rate(ctx)}, "country": "India",
        }
        for b in d["bankAccountsRaw"]["india"]
    ]
    us_disclosed = [
        {
            "bank": b.get("bank_name") or "Bank", "type": b.get("account_type") or "savings",
            "peak": (
                {"usd": num(b.get("peak_balance_usd")), "inr": num(b.get("peak_balance_usd")) * fx_rate(ctx)}
                if b.get("peak_balance_usd") is not None else
                {"inr": num(b.get("peak_balance_inr")), "usd": num(b.get("peak_balance_inr")) / fx_rate(ctx)}
            ),
            "country": b.get("country") or "India",
        }
        for b in d["bankAccountsRaw"]["us"]
    ]
    return india_accounts if len(india_accounts) >= len(us_disclosed) else us_disclosed


def _summary_result(d, ctx):
    counts = {"critical": 0, "warning": 0, "info": 0}
    for x in d["findingsAllResult"]:
        counts[x["severity"]] += 1
    monitoring = d["monitorResult"]
    return {
        "name": d["identityResult"]["name"], "baseYear": d["metaResult"]["baseYear"], "jurisdiction": d["metaResult"]["jurisdiction"],
        "hasIndia": d["metaResult"]["hasIndia"], "hasUs": d["metaResult"]["hasUs"], "indiaQuarterly": d["metaResult"]["indiaQuarterly"],
        "indiaStatus": d["residencyResult"]["india"]["status"], "usStatus": d["residencyResult"]["us"]["status"],
        "dualResident": d["residencyResult"]["dualResident"],
        "totalIncomeUsd": d["headlineResult"]["totalIncomeUsd"], "indiaTaxUsd": d["headlineResult"]["indiaTaxUsd"],
        "usTaxUsd": d["headlineResult"]["usTaxUsd"], "netDoubleTaxUsd": d["headlineResult"]["netUnrelievedDoubleTaxUsd"],
        "counts": counts, "requiredDocs": sum(1 for doc in d["buildDocumentsResult"] if doc.get("required")),
        "healthScore": monitoring["health"]["score"] if monitoring else None,
        "nextDeadline": monitoring["calendar"]["next"]["dateLabel"] if (monitoring and monitoring["calendar"]["next"]) else None,
    }


NODES = {
    "identityResult": NodeDef(deps=("usFilingStatusRaw",), compute=_identity_result),
    "metaResult": NodeDef(deps=("hasUsScopeBoundaryFtc", "hasIndiaScopeXbr"), compute=_meta_result),
    "residencyModelSliceResult": NodeDef(deps=("indiaDomesticStatusDerived",), compute=_residency_model_slice_result),
    "headlineResult": NodeDef(
        deps=("identityResult", "metaResult", "totalIndiaIncomeInr", "aggregateUsIncomeResult", "totalTaxInrCombined", "usTaxResult", "residencyResult", "ftcResult"),
        compute=_headline_result,
    ),
    "summaryResult": NodeDef(
        deps=("identityResult", "metaResult", "residencyResult", "headlineResult", "monitorResult", "findingsAllResult", "buildDocumentsResult"),
        compute=_summary_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)

    # ---- boundary closures ("agg10-nodes.js's 'direct one-line
    # redefinitions' + 'the four original finding graphs' v1-era boundaries'
    # sections") — every one of these already exists as a ctx["model"]/
    # ctx["computed"]-reading stub somewhere upstream; redefined here to the
    # real in-graph value now that everything needed is finally composed.
    r.override("usTotalTaxBeforeFtcUsdBoundary", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: num(d["usTaxResult"]["totalTaxBeforeFtcUsd"])), reason=OVERRIDE_REASON)
    r.override("usAgiUsdBoundary", NodeDef(deps=("usTaxResult",), compute=lambda d, ctx: num(d["usTaxResult"]["agiUsd"])), reason=OVERRIDE_REASON)
    r.override("usFtcAllowedUsdBoundary", NodeDef(deps=("ftcResult",), compute=lambda d, ctx: num(d["ftcResult"]["us"]["ftcAllowedUsd"])), reason=OVERRIDE_REASON)
    r.override("usSourceTotalUsdBoundary", NodeDef(deps=("aggregateUsIncomeResult",), compute=lambda d, ctx: num(d["aggregateUsIncomeResult"]["usSourceTotal"]["usd"])), reason=OVERRIDE_REASON)
    r.override("accountsBoundary", NodeDef(deps=("bankAccountsRaw",), compute=_accounts_boundary), reason=OVERRIDE_REASON)
    # tax_year_mismatch's own boundary (crossborder/findings.py) — same
    # pattern, closed to the real apportionmentResult (crossborder/
    # apportionment.py) now that it's in the registry too.
    r.override("apportionmentResultBoundary", NodeDef(deps=("apportionmentResult",), compute=lambda d, ctx: d["apportionmentResult"]), reason=OVERRIDE_REASON)
    # us5_penalty_72t.py's "baseYear" (shared id with in1-nodes.js in the JS
    # source — agg10-nodes.js:316's own comment) and india/findings.py's
    # "baseYearIn1" were BOTH missed in this file's original closure pass —
    # left permanently stuck on their ctx["model"]-reading fallback (always
    # None -> the hardcoded 2025 default), silently wrong for any base year
    # other than 2025. Found via run-js-dag-vs-py-dag.js's cross-check
    # against the real JS DAG (a taxpayer age at year-end came out one year
    # too low for TY2026 data) — closed here the same way baseYearUs already
    # is, now that metaResult is available.
    r.override("baseYear", NodeDef(deps=("metaResult",), compute=lambda d, ctx: d["metaResult"]["baseYear"]), reason=OVERRIDE_REASON)
    r.override("baseYearIn1", NodeDef(deps=("metaResult",), compute=lambda d, ctx: d["metaResult"]["baseYear"]), reason=OVERRIDE_REASON)

    return r
