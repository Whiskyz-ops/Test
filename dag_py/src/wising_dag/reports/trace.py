"""buildTaxComputation's three sub-objects (`india`/`us`/`usState`) — the
UI display/trace assembly for the Tax Computation panel. Port of
prototypes/graph-pilot/report-batch2-nodes.js (`us`/`usState`) and
report-batch3-nodes.js (`india`).

`buildTaxComputationUsResult` ports only the resident/individual branch —
the JS source's `isNra`/`isEntity`/`trustBracketBreakdown` branches read
fields (`u.isNra`, `u.nra`, `u.trustBracketBreakdown`, `u.passthrough`) this
port's `usTaxResult` (us/ustax.py) doesn't carry yet (entity/NRA routing is
deferred to Phase 7, same carve-out `test_us.py`/`test_crossborder.py`
already established). Since those fields are simply absent here (not
`False`), the individual branch is the only one ever reached — correct
behavior for the individual/resident profiles this port currently handles
correctly, silently wrong for the 1 US-entity + 1 NRA fixture until Phase 7,
same as every other usTaxResult-dependent node in this port.

`buildTaxComputationIndiaResult` ports BOTH branches (individual and
entity) — india/entity_tax.py's `entityTaxResult` already exists and was
verified in Phase 2, so there's no carve-out needed here.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import format_inr, format_usd as usd
from ..india.in1_v3 import bracket_breakdown


def inr(n: float) -> str:
    """Port of the local `inr(n)` helper duplicated at the top of every
    report-batchN-nodes.js compute() — format_inr() with the ₹ prefix."""
    return f"₹{format_inr(n)}"


def _calc(formula, parts=None, citation=None):
    return {"kind": "calc", "formula": formula, "parts": parts or [], "citation": citation}


def _holdings(section, note=None):
    return {"kind": "holdings", "section": section, "note": note}


def _source(detail, citation=None):
    return {"kind": "source", "detail": detail, "citation": citation}


def _pct_label(rate: float) -> str:
    return f"{round(rate * 100, 2):g}%"


def _bracket_parts(breakdown, fmt):
    parts = []
    for b in breakdown or []:
        label = f"{_pct_label(b['rate'])} above {fmt(b['from'])}" if b["to"] == float("inf") else f"{_pct_label(b['rate'])} on {fmt(b['from'])}–{fmt(b['to'])}"
        parts.append({"label": label, "amount": b["tax"]})
    return parts


def _s115a_parts(stream, fmt):
    parts = []
    for e in stream.get("elections") or []:
        art_txt = f" ({e['article']})" if e.get("article") else ""
        if e["outcome"] == "denied_no_docs":
            label = f"Election{art_txt} on {fmt(e['appliedAmountInr'])} denied — TRC/Form 41 missing, domestic {round(e['domesticRate'] * 100)}% applies instead"
        elif e["outcome"] == "elected_rate_applied":
            label = f"Election{art_txt} on {fmt(e['appliedAmountInr'])} @ {round(e['rateApplied'] * 100)}% treaty rate (beats {round(e['domesticRate'] * 100)}% domestic)"
        else:
            label = f"Election{art_txt} on {fmt(e['appliedAmountInr'])} — domestic {round(e['domesticRate'] * 100)}% still wins over the {round(e['electedRate'] * 100)}% elected rate"
        parts.append({"label": label, "amount": e["taxInr"]})
    if stream.get("uncapturedInr", 0) > 1:
        parts.append({"label": f"No election covers {fmt(stream['uncapturedInr'])} — taxed @ {round(stream['domesticRate'] * 100)}% domestic default", "amount": stream["uncapturedTaxInr"]})
    return parts


def _nr_interest_parts(nr_interest, fmt):
    parts = []
    for e in nr_interest.get("elections") or []:
        if not e.get("carvedOut"):
            continue
        art_txt = f" ({e['article']})" if e.get("article") else ""
        parts.append({
            "label": f"Election{art_txt} on {fmt(e['appliedAmountInr'])} @ {round(e['electedRate'] * 100)}% treaty rate (beats the {fmt(e['marginalSlabTaxInr'])} it would have cost at the marginal slab rate)",
            "amount": e["treatyTaxInr"],
        })
    return parts


def _build_tax_computation_india_result(d, ctx):
    is_entity = d["isEntityTaxpayer"]
    if is_entity:
        et = d["entityTaxResult"]
        total_tax_inr = et["totalTaxInr"]
        total_income_inr = d["entityTaxableInrBoundary"]
        total_tax_usd = _fx_convert(total_tax_inr, ctx)
        return {
            "title": f"India income tax — {et['regime']}",
            "currency": "INR",
            "rows": [
                {"label": "Taxable income", "inr": total_income_inr,
                 "trace": _source("India-source income aggregated for this entity — entered on Layer 1 India Business/Company.")},
                {"label": "Tax at entity rate" + (" (MAT/AMT floor applies)" if et["matApplied"] else ""), "inr": et["slabTaxInr"],
                 "trace": (
                     _source("The MAT floor (s.115JB, companies) / AMT floor (s.115JC, firms/LLPs) exceeds the normal-rate tax on this taxable income, so the MAT/AMT floor applies instead — the difference between the two is folded into the surcharge line below.")
                     if et["matApplied"] else
                     _calc(f"Flat statutory rate for {et['regime']} applied to taxable income — no slabs, no Chapter VI-A deductions, no §156 rebate; none of those individual/HUF concepts apply to an entity's own return",
                           [{"label": "Taxable income", "amount": total_income_inr}, {"label": "Tax", "amount": et["slabTaxInr"]}])
                 )},
                {"label": "Surcharge", "inr": et["surchargeInr"],
                 "trace": _source(f"Turnover/income-band surcharge for {et['regime']}" + (", plus the MAT/AMT-vs-normal-tax difference from the row above" if et["matApplied"] else "") + ".")},
                {"label": "Health & education cess (4%)", "inr": et["cessInr"],
                 "trace": _calc("4% of (tax + surcharge)", [{"label": "Tax", "amount": et["slabTaxInr"]}, {"label": "Surcharge", "amount": et["surchargeInr"]}, {"label": "Cess rate", "display": "4%"}])},
                {"label": "Total India tax", "inr": total_tax_inr, "emphasis": True,
                 "trace": _calc("Tax + surcharge + cess", [{"label": "Tax", "amount": et["slabTaxInr"]}, {"label": "Surcharge", "amount": et["surchargeInr"]}, {"label": "Cess", "amount": et["cessInr"]}])},
            ],
            "totalUsd": total_tax_usd,
            "effectiveRate": (total_tax_inr / total_income_inr) if total_income_inr > 0 else 0,
        }

    return _build_tax_computation_india_individual(d, ctx)


DEDUCTION_CAPS_OLD = {"s80C": 150000, "s80CCD1B": 50000, "s80D_self": 25000, "s80D_parents_senior": 50000}


def _build_tax_computation_india_individual(d, ctx):
    regime = d["regimeCombined"]
    gross_total_income_inr = (
        d["normalSlabInr"] + d["lossSetOffV3"]["stcgInr"] + d["ltcgTaxableInr"] + d["ltcg197TaxableInr"] +
        d["specialRate115bbInr"] + d["vdaGainInrBoundary"] + d["chapterXiiaInvestmentIncomeInrBoundary"] +
        (d["nrInterest"]["carvedOutInr"] if d["nrInterest"] else 0) +
        (d["s115aDividend"]["totalInr"] if d["s115aDividend"] else 0) + (d["s115aRoyalty"]["totalInr"] if d["s115aRoyalty"] else 0) + (d["s115aFts"]["totalInr"] if d["s115aFts"] else 0)
    )
    total_income_inr = d["totalIncomeInrV3"]
    total_tax_inr = d["totalTaxInrV3"]
    lso = d["lossSetOffV3"]
    s115a = {"dividend": d["s115aDividend"], "royalty": d["s115aRoyalty"], "fts": d["s115aFts"]} if d["isNRV3"] else None
    nr_interest = d["nrInterest"]

    ltcg_gross_inr_for_note = d["ltcgInrBoundary"] or 0
    ltcg_exempt_gap_inr = max(0.0, ltcg_gross_inr_for_note - (d["ltcgTaxableInr"] or 0))
    india_holdings_note = (
        f"Holdings shows gross LTCG before the s.198 exemption — {inr(ltcg_exempt_gap_inr)} of LTCG is exempt here, so this figure is that much lower."
        if ltcg_exempt_gap_inr > 1 else None
    )

    cfl = {
        "businessLossAvailableInr": d["cflBusinessInr"], "housePropertyLossAvailableInr": d["cflHousePropertyInr"],
        "stcgLossAvailableInr": d["cflStcgInr"], "ltcgLossAvailableInr": d["cflLtcgInr"],
        "unabsorbedDepreciationCf": d["cflUnabsorbedDepreciationInr"],
    }
    loss_row_defs = [
        {"key": "businessInr", "label": "  — brought-forward business loss set off (s.112)", "availableKey": "businessLossAvailableInr", "rule": "Set off only against business income (s.112)"},
        {"key": "housePropertyInr", "label": "  — brought-forward house-property loss set off (s.110)", "availableKey": "housePropertyLossAvailableInr", "rule": "Set off only against house-property income (s.110) — unlike current-year HP loss, brought-forward HP loss can't go inter-head"},
        {"key": "stcgSlabInr", "label": "  — brought-forward STCG loss set off vs current slab-rate STCG (s.111, s.69 unlisted buy-back)", "availableKey": "stcgLossAvailableInr", "rule": "STCG loss is set off against slab-rate STCG first — it's the more tax-expensive bucket to leave un-offset (s.111)"},
        {"key": "stcgInr", "label": "  — brought-forward STCG loss set off vs current STCG (s.111)", "availableKey": "stcgLossAvailableInr", "rule": "STCG loss is set off against current STCG first (s.111)"},
        {"key": "ltcgFromStcgLossInr", "label": "  — brought-forward STCG loss set off vs current LTCG (s.111)", "availableKey": "stcgLossAvailableInr", "rule": "Any STCG loss left after offsetting current STCG can still offset LTCG (s.111)"},
        {"key": "ltcgInr", "label": "  — brought-forward LTCG loss set off vs current LTCG (s.111)", "availableKey": "ltcgLossAvailableInr", "rule": "LTCG loss can only offset LTCG, never STCG (s.111)"},
        {"key": "unabsorbedDepreciationInr", "label": "  — unabsorbed depreciation set off (s.33(11))", "availableKey": "unabsorbedDepreciationCf", "rule": "No time limit; can offset any head except salary (s.33(11))"},
    ]
    if lso and lso["totalUsedInr"] > 1:
        india_gross_rows = [{"label": "Current-year income (before brought-forward loss set-off)", "inr": gross_total_income_inr + lso["totalUsedInr"], "trace": _holdings("india", india_holdings_note)}]
        for dd in loss_row_defs:
            if lso["used"][dd["key"]] > 1:
                india_gross_rows.append({
                    "label": dd["label"], "inr": -lso["used"][dd["key"]],
                    "trace": _calc(dd["rule"] + " — amount used is the lesser of the loss available and the current-year income in that bucket",
                                    [{"label": "Brought-forward loss available", "amount": cfl.get(dd["availableKey"]) or 0}, {"label": "Amount actually set off this year", "amount": lso["used"][dd["key"]]}]),
                })
        india_gross_rows.append({
            "label": "Gross total income (after brought-forward loss set-off)", "inr": gross_total_income_inr,
            "trace": _calc("Current-year income before set-off, less all brought-forward losses set off above",
                            [{"label": "Before set-off", "amount": gross_total_income_inr + lso["totalUsedInr"]}, {"label": "Less: total losses set off", "amount": -lso["totalUsedInr"]}]),
        })
    else:
        india_gross_rows = [{"label": "Gross total income", "inr": gross_total_income_inr, "trace": _holdings("india", india_holdings_note)}]

    india_loss_carry_row = []
    if lso and lso["totalUnusedInr"] > 1:
        india_loss_carry_row = [{
            "label": "Losses carried forward to future years (could not be set off this year)", "inr": lso["totalUnusedInr"],
            "trace": _calc("Brought-forward losses left over after set-off — different loss categories can only offset specific income heads (s.112/110/111/33(11)), so a category with no matching income this year carries forward untouched (8 years for most heads, no limit for unabsorbed depreciation)",
                            [{"label": "Total unused this year", "amount": lso["totalUnusedInr"]}]),
        }]

    ded_india = {"s80C": d["dedS80C"], "s80CCD1B": d["dedS80CCD1B"], "s80D": d["dedS80D"], "s80CCD2_employer": d["dedS80CCD2Employer"], "s80TTA_TTB": d["dedS80TTA_TTB"]}
    if regime == "NEW":
        ded_trace = _calc("New regime allows only the employer's NPS contribution under s.124(2) — s.123/126/124(1B)/153 etc. are not available",
                           [{"label": "Employer NPS contribution (s.124(2))", "amount": ded_india["s80CCD2_employer"] or 0}])
    else:
        ded_trace = _calc("Old regime: s.123 (cap ₹1.5L) + s.124(1B) NPS (cap ₹50k) + s.126 health insurance (cap ₹75k) + employer NPS s.124(2) (uncapped) + s.153 savings interest (cap ₹10k)", [
            {"label": "s.123 (capped ₹1.5L)", "amount": min(ded_india["s80C"] or 0, DEDUCTION_CAPS_OLD["s80C"])},
            {"label": "s.124(1B) NPS (capped ₹50k)", "amount": min(ded_india["s80CCD1B"] or 0, DEDUCTION_CAPS_OLD["s80CCD1B"])},
            {"label": "s.126 health insurance (capped ₹75k)", "amount": min(ded_india["s80D"] or 0, DEDUCTION_CAPS_OLD["s80D_self"] + DEDUCTION_CAPS_OLD["s80D_parents_senior"])},
            {"label": "Employer NPS s.124(2)", "amount": ded_india["s80CCD2_employer"] or 0},
            {"label": "s.153 savings interest (capped ₹10k)", "amount": min(ded_india["s80TTA_TTB"] or 0, 10000)},
        ])
    ded_never_entered = not (ded_india["s80C"] or ded_india["s80CCD1B"] or ded_india["s80D"] or ded_india["s80CCD2_employer"] or ded_india["s80TTA_TTB"])
    ded_caveat = (
        "Deductions weren't entered for this profile — Layer 1 India hides this step under NEW regime, so this OLD-regime figure assumes ₹0 and is understated. Fill in Chapter VI-A on Layer 1 India (regime must be OLD there) for an accurate comparison."
        if (regime == "OLD" and ded_never_entered) else None
    )

    rebate_cap = 60000 if regime == "NEW" else 12500
    s115a_traces = []
    if s115a:
        for k in ("dividend", "royalty", "fts"):
            s = s115a.get(k)
            if s and s["totalInr"] > 1:
                s115a_traces.append({
                    "label": f"  — of which s.207 {k} @ {round(s['effectiveRate'] * 100)}% effective", "inr": s["taxInr"],
                    "trace": _calc(f"Total {k} income of {inr(s['totalInr'])} under s.207 — each DTAA election (s.159) is taxed at whichever is LOWER of the domestic default or the elected treaty rate, and only when TRC/Form 41 are on file; anything not covered by a valid election falls back to the domestic default",
                                    _s115a_parts(s, inr)),
                })
    nr_interest_trace = []
    if nr_interest and nr_interest["carvedOutInr"] > 1:
        nr_interest_trace = [{
            "label": "  — of which DTAA-carved-out interest (Art 11) taxed separately", "inr": nr_interest["carvedOutTaxInr"],
            "trace": _calc("Ordinary NRO interest is slab-rate income for a non-resident by default (s.207's concessional rate doesn't actually cover it — that's narrowly limited to foreign-currency-borrowing interest). A specific claimed amount can still be carved out and taxed at the flat treaty rate instead of slab rates, but only when TRC/Form 41 are on file AND it's actually cheaper than the marginal slab rate on that slice (s.159)",
                            _nr_interest_parts(nr_interest, inr)),
        }]
    ltcg197_trace = []
    ltcg197_taxable_inr = d["ltcg197TaxableInr"] or 0
    if ltcg197_taxable_inr > 1:
        ltcg197_trace = [{
            "label": "  — of which s.197 LTCG @ 12.5% (no exemption)", "inr": ltcg197_taxable_inr * 0.125,
            "trace": _calc("Same 12.5% rate as s.198, but NO ₹1,25,000 exemption — that's textually specific to s.198's listed/STT-paid gains and doesn't pool with s.197, so this whole amount is taxable from the first rupee. Fed by: unlisted buy-back gains, foreign-equity gains (e.g. US stocks), unlisted bonds without STT, non-equity-oriented/non-specified mutual funds (debt MF acquired pre-Apr-2023, 35-65%-equity hybrid funds, international/FoF funds no longer meeting s.50AA's specified-fund test), and Chapter XII-A specified listed equity/debentures/government securities sold to a third party (s.115E's LTCG rate has no exemption either, unlike ordinary s.198) — all held >24 months, or >12 months for a listed bond, specified debenture/govt security, or specified listed equity",
                            [{"label": "s.197 LTCG (after loss set-off)", "amount": ltcg197_taxable_inr}, {"label": "Tax @ 12.5%, no exemption", "amount": ltcg197_taxable_inr * 0.125}]),
        }]
    vda_trace = []
    vda_gain_inr = d["vdaGainInrBoundary"] or 0
    if vda_gain_inr > 1:
        vda_trace = [{
            "label": "  — of which s.115BBH VDA/crypto @ 30% flat", "inr": d["vdaTaxInr"] or 0,
            "trace": _calc("Virtual digital assets (crypto) are taxed at a flat 30% on positive gains only — no LTCG/STCG distinction, no holding-period threshold, no exemption or indexation, and crucially NO loss set-off is allowed at all, not even against a gain from a different VDA in the same year, and no carry-forward. Any losing VDA transaction is simply excluded, never netted against a gain",
                            [{"label": "VDA gains (losses excluded, never netted)", "amount": vda_gain_inr}, {"label": "Tax @ 30% flat", "amount": d["vdaTaxInr"] or 0}]),
        }]

    ded_row = {"label": "Chapter VI-A deductions", "inr": -d["deductionsInrV3"], "trace": ded_trace}
    if ded_caveat:
        ded_row["caveat"] = ded_caveat

    total_normal_inr = d["totalNormalInr"]
    slab_tax_inr = d["slabTaxInr"]
    special_tax_inr = d["specialTaxInrV3"]
    rebate_inr = d["rebateInrV3"]
    surcharge_inr = d["surchargeInrV3"]
    cess_inr = d["cessInrV3"]

    rows = india_gross_rows + [
        ded_row,
        {"label": "Total income", "inr": total_income_inr,
         "trace": _calc("Gross total income less Chapter VI-A deductions", [{"label": "Gross total income", "amount": gross_total_income_inr}, {"label": "Less Chapter VI-A deductions", "amount": -d["deductionsInrV3"]}])},
        {"label": "Tax at slab rates", "inr": slab_tax_inr,
         "trace": _calc(f"Progressive slab-rate tax under the {regime} regime, applied to {inr(total_normal_inr)} of normal-rate income (salary, house property, business, other sources"
                         + (" — including ordinary NRO interest, which is slab-rate income by default; only a DTAA-beneficial slice is carved out separately below" if nr_interest else "")
                         + ", after Chapter VI-A deductions and brought-forward loss set-off). Capital gains and other special-rate income are taxed separately, not at slab rates.",
                         _bracket_parts(d["slabBreakdownV3"], inr))},
        {"label": f"Tax on special-rate income (196/197/198 gains + 115BBH VDA + 128/194 winnings" + (" + s.207 dividend/royalty/FTS" if s115a else "") + (" + DTAA-carved-out interest" if nr_interest and nr_interest["carvedOutInr"] > 1 else "") + ")",
         "inr": special_tax_inr,
         "trace": _calc("s.196 STCG @ 20% + s.198 LTCG @ 12.5% (listed/STT-paid, net of the ₹1,25,000 exemption) + s.197 LTCG @ 12.5% (unlisted/foreign — no exemption, separate section, does not pool with s.198's threshold) + s.115BBH VDA/crypto @ 30% flat (no set-off, ever) + s.128/194 lottery/betting/gaming winnings @ 30% flat, no exemption"
                         + (" + s.207 dividend/royalty/FTS at their own rates" if s115a else "") + (" + any DTAA-carved-out interest at its treaty rate" if nr_interest and nr_interest["carvedOutInr"] > 1 else "") + " (each broken out below)", [])},
    ] + nr_interest_trace + ltcg197_trace + vda_trace + s115a_traces + [
        {"label": "Less §156 rebate", "inr": -rebate_inr,
         "trace": _calc("Only for a resident individual (not NR, not HUF/AOP/BOI/trust) whose normal-rate income is at or below the threshold — lesser of tax at slab rates and the statutory cap",
                         [{"label": "Statutory rebate cap", "amount": rebate_cap}, {"label": "Rebate actually allowed", "amount": rebate_inr}])},
        {"label": "Surcharge", "inr": surcharge_inr,
         "trace": _calc("Progressive surcharge (10%/15%/25%/37% bands by total income) on tax before cess, with marginal relief so the tax increase never exceeds the income increase over the threshold; capital-gains/dividend-type special-rate income is capped at a 15% surcharge rate",
                         [{"label": "Surcharge", "amount": surcharge_inr}])},
        {"label": "Health & education cess (4%)", "inr": cess_inr,
         "trace": _calc("4% of (tax after rebate + surcharge)", [{"label": "Tax after §156 rebate", "amount": slab_tax_inr - rebate_inr + special_tax_inr}, {"label": "Surcharge", "amount": surcharge_inr}, {"label": "Cess rate", "display": "4%"}])},
        {"label": "Total India tax", "inr": total_tax_inr, "emphasis": True,
         "trace": _calc("Tax at slab rates + tax on special-rate income − §156 rebate + surcharge + cess",
                         [{"label": "Tax at slab rates", "amount": slab_tax_inr}, {"label": "Tax on special-rate income", "amount": special_tax_inr}, {"label": "Less §156 rebate", "amount": -rebate_inr}, {"label": "Surcharge", "amount": surcharge_inr}, {"label": "Cess", "amount": cess_inr}])},
    ] + india_loss_carry_row

    return {
        "title": f"India income tax ({regime} regime)",
        "currency": "INR",
        "rows": rows,
        "totalUsd": _fx_convert(total_tax_inr, ctx),
        "effectiveRate": (total_tax_inr / total_income_inr) if total_income_inr > 0 else 0,
    }


def _fx_convert(inr_amount, ctx):
    from ..core.fx_util import fx_rate
    return inr_amount / fx_rate(ctx)


def _build_tax_computation_us_result(d, ctx):
    u = d["usTaxResult"]

    us_holdings_total_usd = d["aggregateUsIncomeResult"]["total"]["usd"]
    feie_applied_usd = (u.get("feie") or {}).get("appliedUsd") or 0
    us_gap_explained_by_feie = abs((us_holdings_total_usd - u["totalIncomeUsd"]) - feie_applied_usd) < 1
    if us_gap_explained_by_feie:
        total_income_trace = _holdings("us", f"Holdings shows gross foreign wages before the §911 FEIE exclusion ({usd(feie_applied_usd)} excluded here), so this figure is that much lower." if feie_applied_usd > 0 else None)
    else:
        total_income_trace = _calc(
            "Ordinary income (wages + business/self-employment + interest + non-qualified dividends + STCG + rental + pension" + (", foreign amounts included since this is worldwide taxation" if u["worldwide"] else "") + ") + preferential income (LTCG + qualified dividends)",
            [{"label": "Ordinary income", "amount": u["ordinaryIncomeUsd"]}, {"label": "Preferential income (LTCG/QDI)", "amount": u["preferentialIncomeUsd"]}],
        )

    rows = [{"label": "Total income" + (" (worldwide)" if u["worldwide"] else " (US-source)"), "usd": u["totalIncomeUsd"], "trace": total_income_trace}]
    if u.get("retirementEpfInterestUsd", 0) > 0:
        rows.append({"label": "  — of which taxable EPF interest (India retirement a/c, worldwide taxation)", "usd": u["retirementEpfInterestUsd"],
                      "trace": _source("Entered directly on Layer 1 India → Other Sources → \"Taxable EPF interest\". Included here because worldwide taxation applies to this taxpayer.")})
    if u.get("retirementNpsWithdrawalUsd", 0) > 0:
        rows.append({"label": "  — of which taxable NPS withdrawal (India retirement a/c, worldwide taxation)", "usd": u["retirementNpsWithdrawalUsd"],
                      "trace": _source("Entered directly on Layer 1 India → Other Sources → \"Taxable NPS withdrawal\". Included here because worldwide taxation applies to this taxpayer.")})

    rows.append({"label": "Adjusted gross income", "usd": u["agiUsd"],
                 "trace": _calc("Total income less above-the-line adjustments (student-loan interest, capped at $2,500, + half of self-employment tax)",
                                 [{"label": "Total income", "amount": u["totalIncomeUsd"]}, {"label": "Less adjustments", "amount": -(u["totalIncomeUsd"] - u["agiUsd"])}])})
    deduction_mode = u["deductionMode"]
    if deduction_mode == "standard":
        deduction_trace_formula = f"Standard deduction for filing status {u['filingStatus'].upper()} — used because it exceeds (or the taxpayer elected) itemizing"
    else:
        deduction_trace_formula = f"Itemized: SALT (capped at {usd(u['saltCapUsd'])} — OBBBA's $40,000 cap, phased down 30¢/$1 of AGI over $500,000, floored at the old $10,000) + mortgage interest + charitable + medical expenses over 7.5% of AGI — used because it exceeds (or the taxpayer elected) the standard deduction"
    rows.append({"label": f"Less {deduction_mode} deduction", "usd": -u["deductionUsd"], "trace": _calc(deduction_trace_formula, [{"label": "Deduction used", "amount": u["deductionUsd"]}])})

    if u["seniorDeductionUsd"] > 0:
        sd = u["seniorDetail"]
        rows.append({"label": "Less senior deduction (OBBBA §70103, age 65+)", "usd": -u["seniorDeductionUsd"],
                      "trace": _calc(f"$6,000 for a taxpayer age 65+ by year end (TY2025-2028, temporary), on top of the standard/itemized deduction either way, phased out 6¢/$1 of AGI over {usd(sd['phaseoutThresholdUsd'])}. Only the primary taxpayer's age is known — Layer 1 collects no spouse DOB, so a second $6,000 for an also-65+ spouse isn't modeled.",
                                      [{"label": "Taxpayer age", "display": f"{sd['age']} years"}, {"label": "Full amount before phase-out", "amount": sd["fullAmountUsd"]}, {"label": "Senior deduction after phase-out", "amount": u["seniorDeductionUsd"]}])})
    if u["tipsDeductionUsd"] > 0:
        td = u["tipsOvertimeDetail"]
        rows.append({"label": "Less \"no tax on tips\" deduction (OBBBA, 2025-2028)", "usd": -u["tipsDeductionUsd"],
                      "trace": _calc(f"Lesser of qualified tip income (already included in Box 1 wages above) or the ${round(td['tipsMaxUsd']):,} flat cap, less $100 per $1,000 of AGI over {usd(td['phaseoutThresholdUsd'])}. Not available at all to MFS filers.",
                                      [{"label": "Qualified tip income (Box 1 subset)", "amount": td["qualifiedTipsUsd"]}, {"label": "Flat cap", "amount": td["tipsMaxUsd"]}, {"label": "Less phase-out reduction", "amount": -td["phaseoutReductionUsd"]}, {"label": "Tips deduction after phase-out", "amount": u["tipsDeductionUsd"]}])})
    if u["overtimeDeductionUsd"] > 0:
        td = u["tipsOvertimeDetail"]
        rows.append({"label": "Less \"no tax on overtime\" deduction (OBBBA, 2025-2028)", "usd": -u["overtimeDeductionUsd"],
                      "trace": _calc(f"Lesser of qualified FLSA §7 overtime premium pay (already included in Box 1 wages above) or the ${round(td['overtimeMaxUsd']):,} cap (filing status {u['filingStatus'].upper()}), less $100 per $1,000 of AGI over {usd(td['phaseoutThresholdUsd'])}. Not available at all to MFS filers.",
                                      [{"label": "Qualified overtime premium (Box 1 subset)", "amount": td["qualifiedOvertimeUsd"]}, {"label": "Cap for this filing status", "amount": td["overtimeMaxUsd"]}, {"label": "Less phase-out reduction", "amount": -td["phaseoutReductionUsd"]}, {"label": "Overtime deduction after phase-out", "amount": u["overtimeDeductionUsd"]}])})
    if u["qbiDeductionUsd"] > 0:
        rows.append({"label": "Less §199A QBI deduction", "usd": -u["qbiDeductionUsd"],
                      "trace": _calc("20% of qualified business income (Sch C/S-corp/partnership pass-through), capped at 20% of (taxable income less net capital gains); phased out for specified service trades above the SSTB income threshold",
                                      [{"label": "QBI deduction", "amount": u["qbiDeductionUsd"]}])})

    taxable_income_formula = "AGI less deduction" + ("".join(
        f" less {label}" for cond, label in [
            (u["seniorDeductionUsd"] > 0, "senior deduction"), (u["tipsDeductionUsd"] > 0, "tips deduction"),
            (u["overtimeDeductionUsd"] > 0, "overtime deduction"), (u["qbiDeductionUsd"] > 0, "§199A QBI deduction"),
        ] if cond
    ))
    taxable_income_parts = [{"label": "AGI", "amount": u["agiUsd"]}, {"label": "Less deduction", "amount": -u["deductionUsd"]}]
    if u["seniorDeductionUsd"] > 0:
        taxable_income_parts.append({"label": "Less senior deduction", "amount": -u["seniorDeductionUsd"]})
    if u["tipsDeductionUsd"] > 0:
        taxable_income_parts.append({"label": "Less tips deduction", "amount": -u["tipsDeductionUsd"]})
    if u["overtimeDeductionUsd"] > 0:
        taxable_income_parts.append({"label": "Less overtime deduction", "amount": -u["overtimeDeductionUsd"]})
    if u["qbiDeductionUsd"] > 0:
        taxable_income_parts.append({"label": "Less QBI deduction", "amount": -u["qbiDeductionUsd"]})
    rows.append({"label": "Taxable income", "usd": u["taxableIncomeUsd"], "trace": _calc(taxable_income_formula, taxable_income_parts)})

    rows.append({"label": "Ordinary-rate tax", "usd": u["ordinaryTaxUsd"],
                 "trace": _calc(f"Progressive federal brackets (10%-37%, filing status {u['filingStatus'].upper()}) applied to ${round(u['ordinaryTaxableUsd']):,} of ordinary taxable income (taxable income less the LTCG/QDI portion, which is taxed separately below)",
                                 _bracket_parts(u["ordinaryBracketBreakdown"], usd))})
    rows.append({"label": "Preferential LTCG/QDI tax", "usd": u["preferentialTaxUsd"], "trace": _calc("0%/15%/20% long-term capital gains brackets, stacked on top of ordinary taxable income", [{"label": "Preferential LTCG/QDI tax", "amount": u["preferentialTaxUsd"]}])})
    niit_detail = u.get("niitDetail")
    rows.append({"label": "Net investment income tax (NIIT, §1411)", "usd": u["niitUsd"],
                 "trace": (_calc("3.8% × NIIT base (see breakdown below)", [{"label": "NIIT base", "amount": niit_detail["excessUsd"]}, {"label": "Rate", "display": "3.8%"}])
                           if u["niitUsd"] > 0 and niit_detail else _calc("Zero — either no net investment income, or MAGI doesn't exceed the filing-status threshold", []))})
    if u["niitUsd"] > 0 and niit_detail:
        rows.append({"label": "  — net investment income (interest/div/cap gains/rental)", "usd": niit_detail["netInvestmentIncomeUsd"],
                      "trace": _source("Interest + dividends + capital gains + rental income (foreign-source included when worldwide taxation applies) — from the income already itemized on Layer 1 India/US.")})
        rows.append({"label": "  — MAGI", "usd": niit_detail["magiUsd"], "trace": _calc("Equal to AGI in this engine's model (no foreign-earned-income-exclusion add-back scenario is modeled)", [{"label": "AGI", "amount": u["agiUsd"]}])})
        rows.append({"label": "  — less filing-status threshold", "usd": -niit_detail["thresholdUsd"], "trace": _source("Statutory NIIT threshold by filing status (§1411(b)) — $200,000 single/HoH, $250,000 MFJ, $125,000 MFS. Not indexed for inflation.")})
        rows.append({"label": f"  — NIIT base (lesser of NII and MAGI-over-threshold) @ {niit_detail['rate'] * 100:.1f}%", "usd": niit_detail["excessUsd"],
                      "trace": _calc("Lesser of net investment income and (MAGI − threshold)", [{"label": "Net investment income", "amount": niit_detail["netInvestmentIncomeUsd"]}, {"label": "MAGI over threshold", "amount": max(0.0, niit_detail["magiUsd"] - niit_detail["thresholdUsd"])}])})

    rows.append({"label": "Additional Medicare tax", "usd": u["additionalMedicareUsd"], "trace": _source("Computed directly on Layer 1 US (Form 8959) and taken as-is — the engine does not recompute it.")})

    if u["seTaxUsd"] > 0:
        rows.append({"label": "Self-employment tax (Schedule SE)", "usd": u["seTaxUsd"],
                      "trace": _calc("92.35% of net SE earnings × (12.4% Social Security, capped by the wage base less W-2 SS wages already taxed, + 2.9% Medicare, uncapped); half of this is an above-the-line deduction", [{"label": "Self-employment tax", "amount": u["seTaxUsd"]}])})

    amt_detail = u.get("amtDetail")
    if u["amtUsd"] > 0 and amt_detail:
        rows.append({"label": "Alternative Minimum Tax (§55)", "usd": u["amtUsd"],
                      "trace": _calc("Tentative minimum tax minus regular tax, when positive (see breakdown below)", [{"label": "Tentative minimum tax", "amount": amt_detail["tmtUsd"]}, {"label": "Less regular tax", "amount": -amt_detail["regularTaxUsd"]}])})
        rows.append({"label": "  — AMTI (taxable income + standard/SALT addback + preference items)", "usd": amt_detail["amtiUsd"],
                      "trace": _calc("Taxable income + disallowed-deduction addback (the full standard deduction, or just the SALT slice if itemized) + AMT preference items (e.g. the ISO exercise bargain-element spread, §56(b)(3))",
                                      [{"label": "Taxable income", "amount": u["taxableIncomeUsd"]}, {"label": "Addback (standard deduction or SALT)", "amount": amt_detail["addbackUsd"]}, {"label": "AMT preference items", "amount": amt_detail["amtiUsd"] - u["taxableIncomeUsd"] - amt_detail["addbackUsd"]}])})
        rows.append({"label": "  — less AMT exemption (phased out above threshold)", "usd": -amt_detail["exemptionUsd"],
                      "trace": _calc("Full statutory exemption reduced 25¢ for every $1 of AMTI above the phase-out threshold", [{"label": "Full exemption", "amount": amt_detail["exemptionFullUsd"]}, {"label": "AMTI", "amount": amt_detail["amtiUsd"]}, {"label": "Exemption after phase-out", "amount": amt_detail["exemptionUsd"]}])})
        rows.append({"label": "  — AMT base", "usd": amt_detail["amtBaseUsd"], "trace": _calc("AMTI less the (phased-out) exemption", [{"label": "AMTI", "amount": amt_detail["amtiUsd"]}, {"label": "Less exemption", "amount": -amt_detail["exemptionUsd"]}])})
        rows.append({"label": "  — tentative minimum tax (26%/28% ordinary + LTCG/QDI at preferential rates)", "usd": amt_detail["tmtUsd"],
                      "trace": _calc("26% (28% above the AMT rate breakpoint) on the ordinary AMT base (AMT base less any LTCG/QDI, which keep their preferential rates) + preferential-rate tax on the LTCG/QDI portion",
                                      [{"label": "Ordinary AMT base", "amount": amt_detail["ordinaryAmtBaseUsd"]}, {"label": "Tax on ordinary AMT base", "amount": amt_detail["tmtOrdUsd"]}, {"label": "Preferential-rate tax (LTCG/QDI, same as above)", "amount": u["preferentialTaxUsd"]}])})
        rows.append({"label": "  — less regular tax (AMT owed = excess of TMT over this)", "usd": -amt_detail["regularTaxUsd"],
                      "trace": _calc("Same as ordinary-rate tax + preferential LTCG/QDI tax shown above", [{"label": "Ordinary-rate tax", "amount": u["ordinaryTaxUsd"]}, {"label": "Preferential LTCG/QDI tax", "amount": u["preferentialTaxUsd"]}])})

    if u["otherCreditsUsd"] > 0:
        rows.append({"label": "Less other non-refundable credits (care/AOTC/LLC)", "usd": -u["otherCreditsUsd"],
                      "trace": _calc("Child/dependent care credit (20% of qualifying expenses, capped) + American Opportunity + Lifetime Learning education credits (both phased out by MAGI) — capped at the tax otherwise due", [{"label": "Credits", "amount": u["otherCreditsUsd"]}])})
    ctc_detail = u.get("ctcDetail")
    if ctc_detail and ctc_detail["availableUsd"] > 0:
        rows.append({"label": "Less Child Tax Credit (§24)", "usd": -(ctc_detail["nonRefundableUsd"] + ctc_detail["refundableUsd"]),
                      "trace": _calc("$2,200/child (TY2025-2028, OBBBA), phased out $50 per $1,000 of AGI over the threshold. The portion that doesn't fit against tax owed is refundable (Additional CTC) up to $1,700/child, capped at 15% of earned income over $2,500. \"Children\" here reuses the same dependents count as the care/AOTC credits above — Layer 1 doesn't separately track qualifying-child ages.",
                                      [{"label": "Number of children (Layer 1 dependents count)", "display": str(round(ctc_detail["numChildren"]))}, {"label": "Max CTC before phase-out", "amount": ctc_detail["maxTotalUsd"]},
                                       {"label": "Phase-out reduction", "amount": -ctc_detail["phaseoutReductionUsd"]}, {"label": "Non-refundable (offsets tax)", "amount": ctc_detail["nonRefundableUsd"]}, {"label": "Refundable (Additional CTC)", "amount": ctc_detail["refundableUsd"]}])})

    rows.append({"label": "Total US tax (pre-FTC)", "usd": u["totalTaxBeforeFtcUsd"], "emphasis": True,
                 "trace": _calc("Income tax (ordinary + preferential) + NIIT + Additional Medicare tax + SE tax + AMT − non-refundable credits",
                                 [{"label": "Income tax (ordinary + preferential)", "amount": u["incomeTaxUsd"]}, {"label": "NIIT", "amount": u["niitUsd"]}, {"label": "Additional Medicare tax", "amount": u["additionalMedicareUsd"]},
                                  {"label": "SE tax", "amount": u["seTaxUsd"]}, {"label": "AMT", "amount": u["amtUsd"]}, {"label": "Less credits", "amount": -u["creditsUsd"]}])})

    return {
        "title": f"US federal income tax ({u['filingStatus'].upper()})",
        "currency": "USD",
        "rows": rows,
        "totalUsd": u["totalTaxBeforeFtcUsd"],
        "effectiveRate": u["effectiveRate"],
    }


def _build_tax_computation_us_state_result(d, ctx):
    st = d["usStateTaxResult"]
    if not st:
        return None
    if st["noIncomeTax"]:
        return {
            "title": f"{st['stateName']} state income tax", "currency": "USD",
            "rows": [{"label": "State income tax", "usd": 0, "emphasis": True, "trace": _source(st["basis"])}],
            "totalUsd": 0, "effectiveRate": 0, "basis": st["basis"],
        }
    rows = [
        {"label": "Federal AGI (starting point)", "usd": st["agiUsd"],
         "trace": _source(f"Same federal AGI computed above — {st['stateName']} taxes a full-year resident's worldwide income, so no separate state-source recomputation is done.")},
        {"label": f"Less {st['stateName']} {st['standardDeductionLabel']}", "usd": -st["standardDeductionUsd"],
         "trace": _source(f"{st['stateName']}'s own {st['standardDeductionLabel']} for {st['filingStatus'].upper()} — separate from, and smaller than, the federal one.")},
    ]
    if st["dependentExemptionUsd"] > 0:
        if st["state"] == "NY":
            rows.append({"label": "Less NY dependent exemption ($1,000/dependent)", "usd": -st["dependentExemptionUsd"], "trace": _source("NY dropped the personal exemption for filer/spouse decades ago; only the $1,000-per-dependent exemption survives.")})
        else:
            rows.append({"label": f"Less {st['dependentExemptionLabel']}", "usd": -st["dependentExemptionUsd"], "trace": _source(f"{st['stateName']}'s per-dependent exemption.")})
    rows.append({"label": "State taxable income", "usd": st["taxableIncomeUsd"],
                 "trace": _calc(f"Federal AGI less the state standard deduction" + (" and dependent exemption" if st["dependentExemptionUsd"] > 0 else ""),
                                 [{"label": "Federal AGI", "amount": st["agiUsd"]}, {"label": "Less standard deduction", "amount": -st["standardDeductionUsd"]}]
                                 + ([{"label": "Less dependent exemption", "amount": -st["dependentExemptionUsd"]}] if st["dependentExemptionUsd"] > 0 else []))})
    rows.append({"label": f"Tax at {st['stateName']} bracket rates", "usd": st["bracketTaxUsd"],
                 "trace": _calc(f"Progressive {st['stateName']} brackets applied to ${round(st['taxableIncomeUsd']):,} of state taxable income", _bracket_parts(st["bracketBreakdown"], usd))})
    if st["surchargeUsd"] > 0:
        rows.append({"label": st["surchargeLabel"], "usd": st["surchargeUsd"],
                      "trace": _calc("1% of state taxable income over $1,000,000 — this threshold is NOT doubled for MFJ", [{"label": "State taxable income over $1,000,000", "amount": max(0.0, st["taxableIncomeUsd"] - 1000000)}, {"label": "Surcharge @ 1%", "amount": st["surchargeUsd"]}])})
    if (st["exemptionCreditUsd"] + st["dependentCreditUsd"]) > 0:
        rows.append({"label": "Less personal/dependent exemption credit", "usd": -(st["exemptionCreditUsd"] + st["dependentCreditUsd"]),
                      "trace": _source("California's personal exemption credit ($153 single/MFS/HOH, $307 MFJ) plus $475 per dependent — a credit against tax, not a deduction from income.")})
    rows.append({"label": f"Total {st['stateName']} tax", "usd": st["totalTaxUsd"], "emphasis": True,
                 "trace": _calc("Bracket tax" + (" + surcharge" if st["surchargeUsd"] > 0 else "") + (" − exemption/dependent credits" if (st["exemptionCreditUsd"] + st["dependentCreditUsd"]) > 0 else ""),
                                 [{"label": "Bracket tax", "amount": st["bracketTaxUsd"]}, {"label": "Surcharge", "amount": st["surchargeUsd"]}, {"label": "Less credits", "amount": -(st["exemptionCreditUsd"] + st["dependentCreditUsd"])}])})
    return {
        "title": f"{st['stateName']} state income tax ({st['formName']}, {st['filingStatus'].upper()})", "currency": "USD",
        "rows": rows, "totalUsd": st["totalTaxUsd"], "effectiveRate": st["effectiveRate"], "basis": st["basis"],
    }


NODES = {
    "slabBreakdownV3": NodeDef(deps=("totalNormalInr", "slabs"), compute=lambda d, ctx: bracket_breakdown(d["totalNormalInr"], d["slabs"])),
    "buildTaxComputationIndiaResult": NodeDef(
        deps=("isEntityTaxpayer", "entityTaxResult", "entityTaxableInrBoundary",
              "regimeCombined", "totalNormalInr", "normalSlabInr", "lossSetOffV3", "cflBusinessInr",
              "cflHousePropertyInr", "cflStcgInr", "cflLtcgInr", "cflUnabsorbedDepreciationInr",
              "ltcgInrBoundary", "ltcgTaxableInr", "deductionsInrV3",
              "dedS80C", "dedS80CCD1B", "dedS80D", "dedS80CCD2Employer", "dedS80TTA_TTB",
              "totalIncomeInrV3", "slabTaxInr", "slabBreakdownV3", "specialTaxInrV3",
              "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3", "nrInterest",
              "ltcg197TaxableInr", "vdaGainInrBoundary", "vdaTaxInr", "specialRate115bbInr", "chapterXiiaInvestmentIncomeInrBoundary",
              "rebateInrV3", "surchargeInrV3", "cessInrV3", "totalTaxInrV3"),
        compute=_build_tax_computation_india_result,
    ),
    "buildTaxComputationUsResult": NodeDef(
        deps=("usTaxResult", "aggregateUsIncomeResult"),
        compute=_build_tax_computation_us_result,
    ),
    "buildTaxComputationUsStateResult": NodeDef(
        deps=("usStateTaxResult",),
        compute=_build_tax_computation_us_state_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
