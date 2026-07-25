"""Closes TAX-7 + TAX-8 — `computeUsEntityTax` and `computeNraTax` — plus
`computeUsTax`'s own routing. Port of prototypes/graph-pilot/ustax-full-nodes.js.

Routing: `usKind` in `{ccorp, scorp, partnership, trust}` -> entity tax;
files 1040-NR without a §6013(h) election -> NRA tax; otherwise -> the
individual path (`us/ustax.py`'s own `usTaxResult`, unchanged).

The routing lives where the JS source's lives: `usTaxResult` is REDEFINED
as the router, with the original individual-path node re-registered as
`usTaxIndividualResult` (captured via `base.get("usTaxResult")` before
overriding — same pattern `filings/assets.py` already uses for its own
`findingsAllResult` override). Every existing consumer resolves
`usTaxResult` by id, so it automatically gets entity/NRA-correct figures
once this module runs — nothing else in this port needs to change. This is
also why this module is composed LAST (after `core/orchestration.py`,
mirroring the JS source's own `require("./agg10-nodes.js")` as its base):
every override here needs `entityResult`/`metaResult` (from
`core/entry.py`/`core/orchestration.py`) already in the registry.

`usEntityKind`/`baseYearUs` — the two boundary stubs `us/ustax.py`'s own
header names, and `us/us_full.py`'s own header explicitly defers to "closed
in ustax_full.py" — are closed HERE (not in `core/orchestration.py`, where
Phase 7 first closed them provisionally), matching that promise and the
JS source's own ownership (`ustax-full-nodes.js` requires `agg10-nodes.js`
specifically to get these two, among others).

`apportionmentResult` is also re-overridden here (not in
`crossborder/apportionment.py`, which stays independently resolvable from
just `{router, india, us}`) — the entity-aware swap
(`d.usTaxResult.isEntity ? d.usTaxResult.usSourceIncomeUsd : ...`) only
makes sense once `usTaxResult` is actually routed, which only happens once
this file's own override above has run.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import num, safe
from . import constants as C
from .ustax import bracket_breakdown, bracket_tax, compute_salt_cap

T = C.US

# Trust/estate ordinary-income brackets (IRC §1(e)) — highly compressed
# relative to the individual brackets (37% starts around $15,650 vs.
# $640,600+ for a single individual). TY2025 figures (Rev. Proc. 2024-40),
# not yet independently re-verified for TY2026 — same "confirm before
# filing" discipline as every other estimated figure in this port.
TRUST_ESTATE_BRACKETS = [[3150, 0.10], [11450, 0.24], [15650, 0.35], [float("inf"), 0.37]]

# DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7 — "US
# state income tax, Phase 2"): computeUsStateTax excludes ALL business
# entities entirely — a real gap this closes for the one case that's
# genuinely tractable at the same "planning-grade, single-state, no
# apportionment" fidelity as the individual brackets. Everything else is
# honestly flagged as unmodeled rather than silently treated as $0.
ENTITY_STATE_CCORP_RATES = {
    "CA": {"rate": 0.0884, "name": "California", "label": "California's flat 8.84% corporate franchise tax rate — excludes the $800 minimum franchise tax and the 10.84% financial-corporation rate"},
    "NY": {"rate": 0.0725, "name": "New York", "label": "New York's 7.25% Article 9-A top-bracket business income base rate — excludes the lower 6.5% bracket (ENI ≤ $5M), the fixed-dollar-minimum tax based on NY receipts, and the MTA surcharge"},
    "NJ": {"rate": 0.09, "name": "New Jersey", "label": "New Jersey's 9% Corporation Business Tax top-bracket rate — excludes the lower 6.5%/7.5% brackets and the temporary 2.5% surtax on income over $1M"},
}
ENTITY_NO_INCOME_TAX_REAL_REGIME = {
    "TX": "Texas has no corporate income tax, but levies its own Franchise (Margin) Tax — a gross-receipts/margin-based tax, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure.",
    "WA": "Washington has no corporate income tax, but levies its own Business & Occupation (B&O) Tax — a gross-receipts tax on most business activity, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure.",
}


def _usd(n: float) -> str:
    return f"${round(n):,}"


def _us_entity_tax_result(d, ctx):
    kind = d["usEntityKind"]
    m1_taxable = d["entityResult"]["usScheduleM1TaxableIncomeUsd"]
    taxable = m1_taxable if m1_taxable is not None else d["aggregateUsIncomeResult"]["total"]["usd"]

    def us_entity_result(taxable_usd, tax, label, passthrough):
        return {
            "filingStatus": label, "isEntity": True, "passthrough": passthrough, "worldwide": True,
            "totalIncomeUsd": taxable_usd, "agiUsd": taxable_usd, "deductionUsd": 0, "deductionMode": "n/a",
            "taxableIncomeUsd": taxable_usd, "ordinaryTaxUsd": tax, "preferentialTaxUsd": 0,
            "incomeTaxUsd": tax, "niitUsd": 0, "additionalMedicareUsd": 0,
            "seTaxUsd": 0, "qbiDeductionUsd": 0, "amtUsd": 0, "creditsUsd": 0,
            "totalTaxBeforeFtcUsd": tax,
            # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H
            # — "entity-agnostic audit"): an entity's own income is Schedule
            # M-1 book-to-tax reconciled (taxable_usd above), a separate
            # figure from the individual-shaped aggregateUsIncomeResult
            # (always $0 for a pure entity) — treating the full taxable_usd
            # as US-source (zero foreign-source) matches worldwide=True's
            # own "tax the whole M-1 figure, no further split" assumption,
            # not a new one. Fixes India's own s.90 FTC relief (which reads
            # this same field) and the FY<->CY apportionment card both
            # silently zeroing out for a US business entity.
            "foreignSourceIncomeUsd": 0,
            "usSourceIncomeUsd": taxable_usd,
            "effectiveRate": (tax / taxable_usd) if taxable_usd > 0 else 0,
        }

    if kind == "ccorp":
        tax = taxable * T["C_CORP_RATE"]
        return us_entity_result(taxable, tax, "C-Corp (1120, 21%)", False)
    if kind == "trust":
        # "taxable" (from aggregateUsIncomeResult, since Schedule M-1 isn't
        # collected for a trust) is effectively the SUM of "Beneficiaries'
        # Share of Income" — income the distribution deduction offsets,
        # taxed on the beneficiaries' own returns instead, not here. Only
        # trustRetainedIncomeUsdRaw (income the trust actually kept) is
        # subject to real entity-level tax, at the compressed §1(e)
        # brackets. totalIncomeUsd/usSourceIncomeUsd still report the FULL
        # economic total (distributed + retained) — cross-border FTC/
        # apportionment consumers want "how much did this entity earn," not
        # "how much is taxed at its level."
        retained_usd = d["trustRetainedIncomeUsdRaw"]
        distributed_usd = taxable
        total_trust_income_usd = distributed_usd + retained_usd
        trust_tax = bracket_tax(retained_usd, TRUST_ESTATE_BRACKETS)
        r = us_entity_result(
            total_trust_income_usd, trust_tax,
            "Trust/Estate (1041)" + (" — retained income at compressed §1(e) rates" if retained_usd > 0 else " · pass-through (fully distributed)"),
            retained_usd <= 0,
        )
        r["taxableIncomeUsd"] = retained_usd
        r["trustDistributedUsd"] = distributed_usd
        r["trustRetainedUsd"] = retained_usd
        r["trustBracketBreakdown"] = bracket_breakdown(retained_usd, TRUST_ESTATE_BRACKETS)
        return r
    return us_entity_result(taxable, 0, ("S-Corp (1120-S)" if kind == "scorp" else "Partnership (1065)") + " · pass-through", True)


def _us_entity_state_tax_result(d, ctx):
    if d["usEntityKind"] == "individual":
        return None
    state_code = d["usEntityStateOfDomicileRaw"]
    if not state_code:
        return None
    kind = d["usEntityKind"]
    base = {"state": state_code, "kind": kind}

    if state_code in ENTITY_NO_INCOME_TAX_REAL_REGIME:
        return {**base, "modeled": False, "stateName": "Texas" if state_code == "TX" else "Washington", "reason": ENTITY_NO_INCOME_TAX_REAL_REGIME[state_code]}
    if kind in ("scorp", "partnership"):
        return {
            **base, "modeled": False, "stateName": None,
            "reason": (
                f"Pass-through at the state level too, same as federal — no entity-level state income tax by default. Not checked here: whether "
                f"{state_code} offers a PTET (pass-through entity tax) election, which shifts state tax liability onto the entity as a federal-SALT-cap workaround."
            ),
        }
    if kind == "trust":
        return {
            **base, "modeled": False, "stateName": None,
            "reason": "State fiduciary income tax has its own throwback/accumulation-distribution rules, materially different from the federal §1(e) brackets computed above — not modeled.",
        }
    # kind == "ccorp" from here
    rate_info = ENTITY_STATE_CCORP_RATES.get(state_code)
    if not rate_info:
        return {**base, "modeled": False, "stateName": None, "reason": f"State-level C-Corp income tax is not modeled for {state_code} — do not assume $0 exposure."}
    taxable_usd = max(0.0, d["usEntityTaxResult"]["taxableIncomeUsd"])
    total_tax_usd = round(taxable_usd * rate_info["rate"])
    return {
        **base, "modeled": True, "stateName": rate_info["name"], "rate": rate_info["rate"], "rateLabel": rate_info["label"],
        "taxableIncomeUsd": taxable_usd, "totalTaxUsd": total_tax_usd,
        "basis": f"TY2025 rates (returns filed 2026); {rate_info['label']}. Single-state, no apportionment (assumes 100% of federal taxable income is allocated to {rate_info['name']}).",
    }


_SEVERITY_WEIGHT = {"critical": 0, "warning": 1, "info": 2}


def _findings_all_result_override(d, ctx, base_compute):
    all_findings = list(base_compute(d, ctx))
    est = d["usEntityStateTaxResult"]
    if est:
        if est["modeled"]:
            all_findings.append({
                "id": "us_entity_state_tax", "severity": "warning", "category": "credit",
                "title": f"{est['stateName']} state entity-level tax: {_usd(est['totalTaxUsd'])} (C-Corp)",
                "detail": (
                    f"{est['stateName']} taxes this entity's own net income at the entity level, separate from and in addition to the 21% federal corporate rate — "
                    f"computed here as {_usd(est['totalTaxUsd'])} on {_usd(est['taxableIncomeUsd'])} of federal taxable income at {est['rateLabel']}."
                ),
                "recommendation": (
                    f"File the entity's {est['stateName']} corporate return (in addition to Form 1120) alongside the federal return. This is a simplified "
                    "top-bracket-rate, single-state estimate — confirm the exact minimum-tax/surtax/apportionment figures with a preparer before relying on it."
                ),
                "amountUsd": est["totalTaxUsd"], "refs": [f"{est['stateName']} corporate income tax", "Form 1120"],
            })
        else:
            all_findings.append({
                "id": "us_entity_state_tax_not_modeled", "severity": "info", "category": "credit",
                "title": f"{est.get('stateName') or est['state']} entity-level state tax exposure — not modeled",
                "detail": est["reason"],
                "recommendation": (
                    f"Confirm this entity's actual state-level tax exposure in {est.get('stateName') or est['state']} with a preparer — "
                    "WISING does not compute it here, and this is NOT a confirmed-zero result."
                ),
                "amountUsd": 0, "refs": [est.get("stateName") or est["state"]],
            })
        all_findings.sort(key=lambda f: (_SEVERITY_WEIGHT[f["severity"]], -f["amountUsd"]))
    return all_findings


def _nra_tax_result(d, ctx):
    status = "mfj" if d["usFilingStatusRaw"] == "mfj" else "single"
    brackets = T["BRACKETS"].get(status, T["BRACKETS"]["single"])
    ded = d["dedUs"]

    eci_usd = d["nraEciIncomeUsdRaw"] or 0
    fdap_usd = d["nraFdapIncomeUsdRaw"] or 0
    claims = d["nraRaw"]["treatyRateClaims"] or []
    claim = claims[0] if claims else None
    claimed_rate = max(0.0, min(1.0, num(claim["rate"]) / 100)) if (claim and claim.get("rate") is not None) else None
    w8ben_on_file = d["nraRaw"]["submittedW8ben"] is True
    fdap_rate = claimed_rate if (w8ben_on_file and claimed_rate is not None) else 0.30

    itemized = min(ded["salt"], compute_salt_cap(eci_usd, status)) + ded["mortgageInterest"] + ded["charitable"] + max(0.0, ded["medical"] - 0.075 * eci_usd)
    taxable_eci_usd = max(0.0, eci_usd - itemized)
    eci_tax_usd = bracket_tax(taxable_eci_usd, brackets)
    eci_bracket_breakdown = bracket_breakdown(taxable_eci_usd, brackets)
    fdap_tax_usd = fdap_usd * fdap_rate
    addl_medicare = d["additionalMedicareOwedBoundary"] or 0
    total_tax = eci_tax_usd + fdap_tax_usd + addl_medicare

    return {
        "filingStatus": status, "worldwide": False, "isNra": True,
        "totalIncomeUsd": eci_usd + fdap_usd,
        "agiUsd": eci_usd, "deductionUsd": itemized, "deductionMode": "itemized (NRA — no standard deduction)",
        "taxableIncomeUsd": taxable_eci_usd,
        "ordinaryTaxUsd": eci_tax_usd, "preferentialTaxUsd": 0, "incomeTaxUsd": eci_tax_usd + fdap_tax_usd,
        "niitUsd": 0, "additionalMedicareUsd": addl_medicare, "seTaxUsd": 0, "qbiDeductionUsd": 0, "amtUsd": 0, "creditsUsd": 0,
        "totalTaxBeforeFtcUsd": total_tax,
        "foreignSourceIncomeUsd": 0,
        "usSourceIncomeUsd": eci_usd + fdap_usd,
        "nra": {
            "eciUsd": eci_usd, "fdapUsd": fdap_usd, "fdapRate": fdap_rate, "eciTaxUsd": eci_tax_usd, "fdapTaxUsd": fdap_tax_usd,
            "taxableEciUsd": taxable_eci_usd, "eciBracketBreakdown": eci_bracket_breakdown,
            "claimedRate": claimed_rate, "w8benOnFile": w8ben_on_file, "incomeType": (claim.get("income_type") if claim else None) or None,
        },
        "feie": {"claimed": False, "eligible": False, "taxHomeAbroad": False, "testMet": False, "reasons": [], "appliedUsd": 0},
        "effectiveRate": (total_tax / (eci_usd + fdap_usd)) if (eci_usd + fdap_usd) > 0 else 0,
    }


def _us_tax_result_router(d, ctx):
    ek = d["usEntityKind"]
    if ek in ("ccorp", "scorp", "partnership", "trust"):
        return d["usEntityTaxResult"]
    if d["files1040nr"] and not d["s6013hElection"]:
        return d["nraTaxResult"]
    return d["usTaxIndividualResult"]


def _apportionment_result_entity_aware(d, ctx):
    from ..crossborder.apportionment import _apportionment_result as base_apportionment_result
    base = dict(base_apportionment_result(d, ctx))
    # DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H):
    # apportionmentResult's own usCyTotalUsd reads the individual-shaped
    # aggregateUsIncomeResult.usSourceTotal.usd, always $0 for a US business
    # entity. ENTITY-ONLY swap — usTaxResult.usSourceIncomeUsd legitimately
    # NARROWS below the raw aggregate for an NRA (ECI+FDAP only) or an
    # FEIE-electing individual, both correct pre-existing divergences, not
    # bugs — only the entity case (aggregate always $0, a data-modeling gap)
    # needs the swap.
    if d["usTaxResult"].get("isEntity"):
        us_cy_total = d["usTaxResult"]["usSourceIncomeUsd"]
        base["usCyTotalUsd"] = us_cy_total
        base["usCyToFyPrimaryUsd"] = round(us_cy_total * 9 / 12)
        base["usCyToFyNextUsd"] = round(us_cy_total * 3 / 12)
    return base


OVERRIDE_REASON = "ustax-full-nodes.js wiring: closes computeUsEntityTax/computeNraTax + usTaxResult's own entity/NRA routing, now that entityResult/metaResult are in the registry"


def build(base):
    r = base.extend()

    r.register("trustRetainedIncomeUsdRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "profile.trust_retained_income_usd", 0)), layer1_fields=("us.profile.trust_retained_income_usd",)))
    r.register("usEntityTaxResult", NodeDef(deps=("usEntityKind", "entityResult", "aggregateUsIncomeResult", "trustRetainedIncomeUsdRaw"), compute=_us_entity_tax_result))
    r.register("usEntityStateOfDomicileRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "profile.state_of_domicile", None), layer1_fields=("us.profile.state_of_domicile",)))
    r.register("usEntityStateTaxResult", NodeDef(deps=("usEntityKind", "usEntityStateOfDomicileRaw", "usEntityTaxResult"), compute=_us_entity_state_tax_result))
    r.register("nraTaxResult", NodeDef(
        deps=("nraRaw", "nraFdapIncomeUsdRaw", "nraEciIncomeUsdRaw", "usFilingStatusRaw", "dedUs", "additionalMedicareOwedBoundary"),
        compute=_nra_tax_result,
    ))

    base_findings_all = r.get("findingsAllResult")
    r.override(
        "findingsAllResult",
        NodeDef(deps=base_findings_all.deps + ("usEntityStateTaxResult",), compute=lambda d, ctx: _findings_all_result_override(d, ctx, base_findings_all.compute)),
        reason=OVERRIDE_REASON,
    )

    r.override("usEntityKind", NodeDef(deps=("entityResult",), compute=lambda d, ctx: d["entityResult"]["usKind"]), reason=OVERRIDE_REASON)
    r.override("baseYearUs", NodeDef(deps=("metaResult",), compute=lambda d, ctx: d["metaResult"]["baseYear"]), reason=OVERRIDE_REASON)

    base_us_tax_result = r.get("usTaxResult")
    r.register("usTaxIndividualResult", base_us_tax_result)
    r.override(
        "usTaxResult",
        NodeDef(deps=("usEntityKind", "files1040nr", "s6013hElection", "usEntityTaxResult", "nraTaxResult", "usTaxIndividualResult"), compute=_us_tax_result_router),
        reason=OVERRIDE_REASON,
    )

    r.override(
        "apportionmentResult",
        NodeDef(
            deps=("apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "usTaxResult", "aggregateUsIncomeResult"),
            compute=_apportionment_result_entity_aware,
        ),
        reason=OVERRIDE_REASON,
    )

    # us1ShouldFire (underpayment_2210's own gate, us/us1_penalty_2210.py):
    # once usTotalTaxBeforeFtcUsdBoundary/usAgiUsdBoundary became entity-
    # aware, a US entity with a real balance due and no estimated payments
    # started tripping this gate and firing "underpayment_2210" captioned
    # Form 2210/§6654 — the INDIVIDUAL underpayment penalty, the wrong form
    # for an entity (a corporation's own underpayment penalty is Form 2220/
    # §6655, a different safe-harbor test not modeled here at all). Rather
    # than fabricate a §6655 computation, suppressed entirely for an entity
    # taxpayer — same as agg10-nodes.js's own us1ShouldFire override.
    # Missed in this port until now (found via run-js-dag-vs-py-dag.js's
    # cross-check against the real JS DAG — us_ccorp_indian_sub had one
    # extra finding, underpayment_2210, that the JS DAG correctly suppresses).
    base_us1_should_fire = r.get("us1ShouldFire")
    r.override(
        "us1ShouldFire",
        NodeDef(
            deps=base_us1_should_fire.deps + ("usTaxResult",),
            scope_gate=base_us1_should_fire.scope_gate, out_of_scope_value=base_us1_should_fire.out_of_scope_value,
            compute=lambda d, ctx: False if d["usTaxResult"].get("isEntity") else base_us1_should_fire.compute(d, ctx),
        ),
        reason=OVERRIDE_REASON,
    )

    return r
