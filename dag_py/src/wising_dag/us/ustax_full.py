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

from ..core.dates import parse_date
from ..core.findings import make_finding
from ..core.graph import NodeDef
from ..core.util import js_num_str, js_round, num, safe
from . import constants as C
from .ustax import bracket_breakdown, bracket_tax, compute_salt_cap, compute_us_tax_core
from .nra_fdap import nra_exempt_interest_usd, nra_fdap_breakdown, nra_interest_split_recorded
from .retirement_dist import additional_tax_72t_usd, as_of_from_ctx
from .treaty_art21 import art21
from .treaty_art22 import art22, base_year_of

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
    "TX": {"name": "Texas", "reason": "Texas has no corporate income tax, but levies its own Franchise (Margin) Tax — a gross-receipts/margin-based tax, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure."},
    "WA": {"name": "Washington", "reason": "Washington has no corporate income tax, but levies its own Business & Occupation (B&O) Tax — a gross-receipts tax on most business activity, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure."},
    "WY": {"name": "Wyoming", "reason": "Wyoming has no corporate income tax, but requires an annual license/report fee based on in-state assets — structurally different from an income tax and not modeled here. Do not assume $0 state cost."},
}
# Delaware is NOT a no-income-tax state (flat 8.7% on DE-apportioned taxable
# income) -- but the single most common Delaware-incorporated shape here is
# a company incorporated in DE while operating (and apportioning income)
# entirely elsewhere, which typically owes $0 DE corporate INCOME tax.
# Separately, EVERY DE corporation owes DE's annual FRANCHISE TAX regardless
# of income or apportionment (Authorized Shares Method or Assumed Par Value
# Capital Method, whichever is lower; $175-$200,000+/year) -- not modeled
# here (would need authorized/issued share counts and gross assets, fields
# this form doesn't collect), and easy to mistake for the income tax this
# note is about, so called out explicitly rather than silently omitted.
ENTITY_DE_INCOME_TAX_NOTE = (
    "Delaware has an 8.7% corporate income tax, but only on income apportioned to Delaware — a company incorporated in DE but "
    "operating elsewhere typically owes little to no DE corporate INCOME tax (not modeled here — do not assume $0 without confirming "
    "DE-source apportionment). Separately, and NOT covered by this note: every Delaware corporation owes Delaware's annual franchise "
    "tax regardless of income (Authorized Shares or Assumed Par Value method, $175 minimum) — track this as its own always-due line item."
)


# XB-6: §877A covered-expatriate determination (Rev. Proc. 2025-32, tax year
# 2026 figures). A Long-Term Resident (green card held 8+ of the last 15
# years, IRC 7701(b)(6)) who surrenders the green card is a "covered
# expatriate" if ANY ONE of three tests is met: net worth >= $2,000,000
# (fixed, not inflation-adjusted since 2008); average annual net income tax
# for the 5 years before expatriation > $211,000 (2025 was $206,000); or
# failure to certify 5 years of federal tax compliance on Form 8854. This
# only determines covered-expatriate STATUS — it deliberately does not
# compute the actual §877A mark-to-market exit tax, which needs a full
# worldwide asset/basis schedule Layer 1 doesn't collect (same judgment as
# the Delaware franchise-tax note above).
EXPATRIATION_LTR_YEARS_THRESHOLD = 8
EXPATRIATION_NET_WORTH_THRESHOLD_USD = 2000000
EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD = 211000  # 2026, Rev. Proc. 2025-32 (2025 was $206,000)
EXPATRIATION_MTM_EXCLUSION_USD = 910000  # 2026, Rev. Proc. 2025-32 (2025 was $890,000)


def _usd(n: float) -> str:
    return f"${js_round(n):,}"


# ENTITY-ROUTING FIX (29 Jul 2026, ported from the equivalent JS fix): the
# comment inside us_entity_result below previously implied GILTI/CFC
# inclusion is never part of an entity's own return — true for an
# S-corp/partnership (passes through to the OWNERS' own returns), but NOT
# true for a C-corp or a trust that is itself the CFC's direct US
# shareholder: §951A inclusion is real gross income to THAT shareholder,
# taxed on its own return. aggregate_us_income.py's cfcInclusionResult now
# force-routes every CFC into the corporate-style §250/FTC pool for a ccorp
# shareholder (no §962 election needed/available for a real corporation);
# wired into the ccorp and trust branches below via cfc_net_tax_usd.
# S-corp/partnership are intentionally left untouched: a real pass-through
# owes no federal entity-level tax on its CFC inclusion either way.
def _us_entity_tax_result(d, ctx):
    kind = d["usEntityKind"]
    m1_taxable = d["entityResult"]["usScheduleM1TaxableIncomeUsd"]
    taxable = m1_taxable if m1_taxable is not None else d["aggregateUsIncomeResult"]["total"]["usd"]
    cfc = d["aggregateUsIncomeResult"].get("cfcElectedPool")
    cfc_net_tax_usd = cfc["netTaxUsd"] if cfc else 0

    def us_entity_result(taxable_usd, tax, label, passthrough):
        return {
            "filingStatus": label, "isEntity": True, "passthrough": passthrough, "worldwide": True,
            "totalIncomeUsd": taxable_usd, "agiUsd": taxable_usd, "deductionUsd": 0, "deductionMode": "n/a",
            "taxableIncomeUsd": taxable_usd, "ordinaryTaxUsd": tax, "preferentialTaxUsd": 0,
            "incomeTaxUsd": tax, "niitUsd": 0, "additionalMedicareUsd": 0,
            "seTaxUsd": 0, "qbiDeductionUsd": 0, "amtUsd": 0, "creditsUsd": 0,
        "collectiblesGainUsd": 0, "collectiblesTaxUsd": 0, "qsbsExcludedGainUsd": 0, "qsbsTaxableGainUsd": 0,
        "saversCreditUsd": 0,
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
        # A domestic C-corp's own §951A inclusion is taxed with the entity's
        # own income as a separate add-on line (cfcElectedPool already
        # applied its own 40% §250 deduction / flat-21% / deemed-paid-FTC
        # math) — same "flat add-on, not blended into the bracket base"
        # pattern compute_us_tax_core uses for an individual's §962-elected
        # gilti_962_tax_usd.
        tax = taxable * T["C_CORP_RATE"] + cfc_net_tax_usd
        r_ccorp = us_entity_result(taxable, tax, "C-Corp (1120, 21%)" + (" + CFC (§951A/NCTI) inclusion" if cfc_net_tax_usd > 0 else ""), False)
        r_ccorp["cfcNetTaxUsd"] = cfc_net_tax_usd
        return r_ccorp
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
        #
        # CFC inclusion: a trust holding CFC stock directly IS itself a
        # §951A "United States shareholder" (unlike an S-corp/partnership).
        # No field splits a GILTI/Subpart F inclusion into distributed-vs-
        # retained the way the trust's other income is split, so — stated
        # simplification, same "explicit boundary, not guessed" discipline
        # as elsewhere — the non-elected inclusion is assumed RETAINED
        # (added to retained_usd before the §1(e) bracket tax). A §962
        # election (per-CFC, same as an individual) adds its own flat
        # add-on tax, same pattern as the ccorp branch above.
        cfc_non_elected_usd = (d["aggregateUsIncomeResult"].get("cfcNonElectedInclusionUs") or {}).get("usd", 0)
        retained_usd = d["trustRetainedIncomeUsdRaw"] + cfc_non_elected_usd
        distributed_usd = taxable
        total_trust_income_usd = distributed_usd + retained_usd
        trust_tax = bracket_tax(retained_usd, TRUST_ESTATE_BRACKETS) + cfc_net_tax_usd
        r = us_entity_result(
            total_trust_income_usd, trust_tax,
            "Trust/Estate (1041)" + (" — retained income at compressed §1(e) rates" if retained_usd > 0 else " · pass-through (fully distributed)"),
            retained_usd <= 0,
        )
        r["taxableIncomeUsd"] = retained_usd
        r["cfcNetTaxUsd"] = cfc_net_tax_usd
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
        info = ENTITY_NO_INCOME_TAX_REAL_REGIME[state_code]
        return {**base, "modeled": False, "stateName": info["name"], "reason": info["reason"]}
    if state_code == "DE" and kind == "ccorp":
        return {**base, "modeled": False, "stateName": "Delaware", "reason": ENTITY_DE_INCOME_TAX_NOTE}
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
    total_tax_usd = js_round(taxable_usd * rate_info["rate"])
    return {
        **base, "modeled": True, "stateName": rate_info["name"], "rate": rate_info["rate"], "rateLabel": rate_info["label"],
        "taxableIncomeUsd": taxable_usd, "totalTaxUsd": total_tax_usd,
        "basis": f"TY2025 rates (returns filed 2026); {rate_info['label']}. Single-state, no apportionment (assumes 100% of federal taxable income is allocated to {rate_info['name']}).",
    }


_SEVERITY_WEIGHT = {"critical": 0, "warning": 1, "info": 2}


def _treaty_findings(d, ctx, is_nra):
    """India-US treaty checks (DAG-only; GAP_TRACKER IN-49). Mirrors
    ustax-full-nodes.js's treatyFindings."""
    out = []
    u = d.get("usTaxResult") or {}
    n = (u.get("nra") or {}) if is_nra else {}
    agg = d.get("aggregateUsIncomeResult") or {}
    res = d.get("residencyResult") or {"india": {}, "us": {}}
    india_status = safe(ctx.get("india"), "residency_detail.final_india_residency_status", None)

    if is_nra and (n.get("pensionTreatyExemptUsd") or 0) > 0 and not (d.get("nraRaw") or {}).get("submittedW8ben"):
        withheld = 0.30 * n["pensionTreatyExemptUsd"]
        out.append(make_finding(
            "us_pension_withholding_no_w8ben", "warning", "treaty",
            f"US pension / IRA payments: about {_usd(withheld)} withheld at 30% although exempt under DTAA Art. 20(1)",
            f"{_usd(n['pensionTreatyExemptUsd'])} of US pension, annuity and IRA payments is on file for a non-resident alien. Periodic pensions paid to a "
            "resident of India are taxable only in India (DTAA Art. 20(1)), so no US tax is computed on them. But without Form W-8BEN claiming the treaty, the "
            f"payer must withhold 30% (IRC §1441) — about {_usd(withheld)} a year held by the IRS until refunded.",
            "Give each plan administrator / IRA custodian Form W-8BEN claiming DTAA Art. 20(1), so future payments are paid without withholding. "
            "Recover what was already withheld by filing Form 1040-NR with the exemption on Schedule OI. Lump-sum distributions aren't \"pensions\" under the "
            "treaty (Art. 20(3) requires periodic payments) and can be taxed by the US — confirm each distribution is periodic.",
            withheld, ["DTAA Art. 20(1)", "Form W-8BEN", "IRC §1441", "Form 1040-NR"],
        ))

    # Joint US return for an Indian resident taxed on worldwide income: the
    # spouse's US income may be in the Indian computation — see
    # ustax-full-nodes.js (audit row G1; interim until spouse profiles link).
    us_source_usd = ((agg.get("usSourceTotal") or {}).get("usd")) or 0
    spouse_linked = bool(safe(ctx.get("us"), "profile.spouse_client_id", None))
    # Linked to the spouse's own profile — see ustax-full-nodes.js.
    if spouse_linked and safe(ctx.get("us"), "profile.filing_status", None) == "mfj" and (res.get("india") or {}).get("worldwide") and us_source_usd > 0:
        out.append(make_finding(
            "joint_return_household_linked", "info", "residency",
            "Joint US return: use the household figures for US tax and Form 44 relief",
            "This client is linked to their spouse's profile. The Indian income here is this client's own. The US tax and Form 44 relief "
            "shown on this client alone use joint-return rates on only this client's income, so they understate both. The household "
            "calculation computes the joint US return from both profiles, splits its tax in proportion to what each spouse would owe filing "
            "separately, and gives this client's relief from their share.",
            "Use the household figures for the Form 44 claim. Keep each spouse's income in their own profile.",
            0, ["Rule 76", "Form 44", "Form 1040 (joint)"],
        ))
    elif (safe(ctx.get("us"), "profile.spouse_has_income_or_filings", None) != "no"
          and safe(ctx.get("us"), "profile.filing_status", None) == "mfj" and (res.get("india") or {}).get("worldwide") and us_source_usd > 0):
        w2_count = len(agg.get("w2Employers") or [])
        two_earner_signs = w2_count >= 2 or (w2_count >= 1 and (agg.get("seEarningsUsd") or 0) > 0)
        out.append(make_finding(
            "joint_return_spouse_income_india", "critical" if two_earner_signs else "warning", "residency",
            "Joint US return: spouse's income is included in this client's Indian computation",
            f"The US intake is a married-filing-jointly return, so it holds both spouses' US income ({_usd(us_source_usd)} in total"
            + ((", from " + (f"{w2_count} W-2s" if w2_count >= 2 else "a W-2 and self-employment") + " — likely both spouses") if two_earner_signs else "")
            + "). India taxes each spouse separately, but WISING can't yet tell which of these items are the spouse's, so all of it is in this "
            "client's Indian income. The Indian tax, the Form 44 relief for US tax and the double-tax figures here may be overstated by the "
            "spouse's share.",
            "Treat the Indian figures as provisional until spouse profiles can be linked. If every US item on this intake is the "
            "client's own (the spouse has no US income), mark this Not applicable. Otherwise compute the Indian return on the client's own US "
            "income, and claim Form 44 relief only for the US tax on that income.",
            0, ["Income-tax Act — individual assessment", "Form 44", "Form 1040 (joint)"],
        ))

    # What is known about the spouse on a joint return — see ustax-full-nodes.js.
    entity_type = safe(ctx.get("us"), "profile.tax_entity_type", "individual") or "individual"
    if safe(ctx.get("us"), "profile.filing_status", None) == "mfj" and entity_type == "individual" and not spouse_linked:
        spouse_answer = safe(ctx.get("us"), "profile.spouse_has_income_or_filings", None)
        w2n = len(agg.get("w2Employers") or [])
        if spouse_answer == "yes":
            out.append(make_finding(
                "joint_return_spouse_profile_missing", "critical", "residency",
                "Joint US return: the spouse's profile isn't linked",
                "The spouse has income, foreign accounts or an Indian return, but no spouse profile is linked. The joint return, the split of "
                "its tax, the Social Security cap per person and each spouse's Indian return can't be computed from this profile alone.",
                "Link the spouse's profile (or create one with + New spouse profile) and enter the spouse's own income there.",
                0, ["Form 1040 (joint)", "IRC §6013"],
            ))
        elif spouse_answer == "no":
            if w2n >= 2:
                out.append(make_finding(
                    "joint_return_spouse_two_earner_signs", "warning", "residency",
                    f"Joint US return: {w2n} W-2s on a profile whose spouse has no income",
                    f"The spouse is recorded as having no income, but this profile has {w2n} W-2s. If any of them is the spouse's, the joint "
                    "return pools both people's wages: the Social Security cap, 401(k) limit and Indian return are then computed as if all of it were this client's.",
                    "Confirm every W-2 is this client's. If one is the spouse's, answer Yes to the spouse question and move it to the spouse's own profile.",
                    0, ["Form 1040 (joint)", "IRC §1402(b)"],
                ))
            sp_res = safe(ctx.get("us"), "profile.spouse_residency_status", None)
            has_election = safe(ctx.get("us"), "nra_specific.s6013h_joint_election", False) is True or safe(ctx.get("us"), "us_residency_detail.s6013g_joint_election", False) is True
            if sp_res == "nonresident_alien" and not has_election:
                out.append(make_finding(
                    "joint_return_nra_spouse_no_election", "critical", "residency",
                    "Joint US return with a non-resident-alien spouse needs the §6013(g)/(h) election",
                    "A joint return isn't allowed when either spouse is a non-resident alien at any time in the year (IRC §6013(a)(1)), unless the "
                    "couple elects to treat the spouse as a US resident. The election brings the spouse's worldwide income, and their foreign accounts, onto the US return.",
                    "Make the §6013(g) (or §6013(h), first year) election with the joint return, or file married filing separately.",
                    0, ["IRC §6013(a)(1)", "IRC §6013(g)", "IRC §6013(h)"],
                ))
            if safe(ctx.get("us"), "profile.spouse_ssn_or_itin_type", None) == "none":
                out.append(make_finding(
                    "joint_return_spouse_id_missing", "warning", "residency",
                    "Joint US return: the spouse has no SSN or ITIN",
                    "Every person listed on the return needs a taxpayer identification number (IRC §6109). Without one the joint return can't be e-filed, "
                    "and the senior, tips and overtime deductions need the spouse's SSN.",
                    "Apply for an ITIN with Form W-7, attached to the joint return, if the spouse can't get an SSN.",
                    0, ["IRC §6109", "Form W-7"],
                ))
        else:
            out.append(make_finding(
                "joint_return_spouse_unknown", "warning", "residency",
                "Joint US return: the spouse's situation isn't recorded",
                "It isn't recorded whether the spouse has income, foreign accounts or an Indian return. If they do and it's entered on this profile, "
                "the joint return pools both people (the Social Security cap, 401(k) limit and Indian return are then wrong); if they don't, the spouse's "
                "date of birth and SSN are still needed on the return.",
                "Answer the spouse question on the US form: No — enter the spouse's details inline; Yes — link the spouse's own profile.",
                0, ["Form 1040 (joint)"],
            ))

    ss_usd = ((agg.get("socialSecurityUs") or {}).get("usd")) or 0
    india_resident = bool((res.get("india") or {}).get("isResident")) or (is_nra and india_status != "NR")
    if ss_usd > 0 and india_resident:
        us_side = (f"As a non-resident alien, 85% of it is taxed by the US at a flat 30% ({_usd(n.get('socialSecurityTaxUsd') or 0)}; the SSA withholds 25.5%)."
                   if is_nra else "It is taxed on the US return like any US recipient's benefits (up to 85% taxable, IRC §86).")
        out.append(make_finding(
            "us_social_security_india_exempt", "info", "treaty",
            f"US Social Security ({_usd(ss_usd)}): taxable only in the US — exempt in India under DTAA Art. 20(2)",
            "US Social Security paid to a resident of India (or to a US citizen) is taxable only in the US (DTAA Art. 20(2)). " + us_side
            + " India must not tax it, so there is no Indian tax against which to credit the US tax either.",
            "In the Indian return, show these benefits as exempt income under the DTAA (the exempt-income schedule, Schedule EI), and claim no "
            "Form 44 foreign tax credit for the US tax on them.",
            0, ["DTAA Art. 20(2)", "Schedule EI", "Form 44"],
        ))

    if safe(ctx.get("us"), "us_residency_detail.is_us_citizen", False) is True:
        blocked = []
        if safe(ctx.get("us"), "nra_specific.files_form_1040nr", False) is True:
            blocked.append("a Form 1040-NR filing")
        if d.get("treatyUsResidenceRaw") == "india":
            blocked.append("an Article 4 tie-break to India on the US side")
        if len(((d.get("nraRaw") or {}).get("treatyRateClaims")) or []) > 0:
            blocked.append("treaty withholding rates on US income")
        if blocked:
            out.append(make_finding(
                "treaty_saving_clause_citizen", "critical", "residency",
                "US citizen: treaty position blocked by the saving clause (DTAA Art. 1(3))",
                "The client is a US citizen, yet the US intake records " + ", ".join(blocked) + ". Under the saving clause (Art. 1(3)) the US taxes its "
                "citizens as if the treaty didn't exist, except for the benefits listed in Art. 1(4) — mainly the foreign tax credit (Art. 25) and US Social "
                "Security being taxable only in the US (Art. 20(2)). WISING has computed US tax on a citizen's Form 1040 basis, ignoring these entries.",
                "File Form 1040 on worldwide income and relieve Indian tax with Form 1116. Remove the 1040-NR / treaty-rate entries, and give US payers "
                "Form W-9, not W-8BEN — a citizen can't certify foreign status.",
                0, ["DTAA Art. 1(3)", "DTAA Art. 1(4)", "Form 1040", "Form 1116", "Form W-9"],
            ))
    elif d.get("usHasGreenCardRaw") and (d.get("treatyUsResidenceRaw") == "india" or d.get("treatyFiles1040nrRaw")
                                         or (res.get("dualResident") and d.get("treatyIndiaResidenceRaw") == "india")):
        out.append(make_finding(
            "greencard_treaty_nonresident", "warning", "residency",
            "Green-card holder taking treaty non-residence — Form 8833 and expatriation consequences",
            "A green-card holder who is also resident in India may be treated as a US non-resident when the Article 4 tie-breaker favours India "
            "(Treas. Reg. §301.7701(b)-7): Form 1040-NR with Form 8833. For a long-term resident (green card in at least 8 of the last 15 years), taking "
            "that position is an expatriation (IRC §7701(b)(6)): the exit tax applies if the client is a covered expatriate (IRC §877A, Form 8854). "
            "Immigration authorities may also treat it as evidence of abandoning permanent residence.",
            "Confirm the years the green card has been held before filing as a treaty non-resident. If 8 or more of the last 15, run the covered-"
            "expatriate tests (the Monitor's expatriation checks) and file Form 8854; otherwise file Form 1040-NR with Form 8833. Take immigration advice first.",
            0, ["DTAA Art. 4", "Treas. Reg. §301.7701(b)-7", "IRC §7701(b)(6)", "IRC §877A", "Form 8833", "Form 8854"],
        ))

    # DTAA Art. 22 teacher / researcher exemption and the saving clause — see ustax-full-nodes.js.
    a22 = art22(ctx.get("us"), base_year_of(ctx.get("router"), ctx.get("us")))
    if a22 and a22["claimedUsd"] > 0:
        a22_window = f" (arrived {a22['arrivalDate']}; the two years end {a22['windowEnd']})" if a22["arrivalDate"] else ""
        if a22["blockedBy"]:
            out.append(make_finding(
                "treaty_article_22_teacher", "warning", "residency",
                "DTAA Art. 22 teaching / research exemption blocked by the saving clause (Art. 1(3))",
                "The client claims the India–US treaty's teacher and researcher exemption on " + _usd(a22["claimedUsd"]) + " of pay, but is a "
                + ("US citizen" if a22["blockedBy"] == "citizen" else "green-card holder") + ". The saving clause lets the US tax its citizens and residents as if the "
                "treaty didn't exist; its exception for Art. 22 (Art. 1(4)(b)) covers only US residents who are neither citizens nor green-card holders. "
                "WISING taxes this pay in full.",
                ("Remove the Art. 22 claim, and any Form 8233 given to the payer; the pay is taxable on Form 1040." if a22["blockedBy"] == "citizen"
                 else "Remove the Art. 22 claim and Form 8233. The only route to it is treaty residence in India under Art. 4 (Form 1040-NR with Form 8833) — for a long-term green-card holder that is an expatriation, so take that advice first."),
                0, ["DTAA Art. 1(3)", "DTAA Art. 1(4)(b)", "DTAA Art. 22"],
            ))
        elif a22["exemptUsd"] > 0:
            out.append(make_finding(
                "treaty_article_22_teacher", "info", "residency",
                "DTAA Art. 22: " + _usd(a22["exemptUsd"]) + " of teaching / research pay exempt from US tax",
                "The client claims the India–US treaty's teacher and researcher exemption on " + _usd(a22["claimedUsd"]) + " of pay" + a22_window
                + ("; " + _usd(a22["exemptUsd"]) + " of it falls within the two years" if a22["fraction"] < 1 else "") + ". "
                + ("As a non-resident alien the client claims it directly. " if is_nra
                   else "As a US resident alien who is neither a citizen nor a green-card holder, the client keeps it under the saving clause's exception (DTAA Art. 1(4)(b)). ")
                + "WISING leaves " + _usd(a22["exemptUsd"]) + " out of US " + ("income." if is_nra else "wages."),
                "Attach Form 8833 (treaty-based return position) and give the payer Form 8233 to stop withholding. The exemption needs the client to "
                "have been resident in India immediately before arriving, and the pay to be for teaching or research at a university or other recognised educational "
                "institution; it ends two years after arrival." + ("" if a22["arrivalDate"] else " Enter the arrival date on Layer 1 US so WISING can apply the two-year limit."),
                0, ["DTAA Art. 22", "DTAA Art. 1(4)(b)", "Form 8833", "Form 8233"],
            ))
        else:
            out.append(make_finding(
                "treaty_article_22_teacher", "warning", "residency",
                "DTAA Art. 22 no longer applies — the two years from arrival ended " + str(a22["windowEnd"]),
                "The client claims the India–US treaty's teacher and researcher exemption on " + _usd(a22["claimedUsd"]) + " of pay" + a22_window
                + ", but none of this tax year falls within the two years Art. 22 allows. WISING taxes this pay in full.",
                "Remove the Art. 22 claim and any Form 8233 with the payer, and check that the employer withholds US tax from now on.",
                0, ["DTAA Art. 22"],
            ))

    # DTAA Art. 21(1) — see ustax-full-nodes.js.
    a21 = art21(ctx.get("us"))
    if a21 and a21["paymentsUsd"] > 0:
        if a21["blockedBy"]:
            out.append(make_finding(
                "treaty_article_21_student", "warning", "residency",
                "DTAA Art. 21(1) student exemption blocked by the saving clause (Art. 1(3))",
                "The client claims the India–US treaty's student and business-apprentice exemption on " + _usd(a21["paymentsUsd"]) + " of payments from "
                "outside the US, but is a " + ("US citizen" if a21["blockedBy"] == "citizen" else "green-card holder") + ". The saving clause's exception for Art. 21 "
                "(Art. 1(4)(b)) covers only US residents who are neither citizens nor green-card holders. WISING taxes these payments as foreign income.",
                "Remove the Art. 21(1) claim; report the payments as foreign income. A foreign tax credit applies to any Indian tax on them.",
                0, ["DTAA Art. 1(3)", "DTAA Art. 1(4)(b)", "DTAA Art. 21(1)"],
            ))
        elif is_nra:
            out.append(make_finding(
                "treaty_article_21_student", "info", "residency",
                "DTAA Art. 21(1) not needed: payments from outside the US aren't US income for a non-resident alien",
                "The client claims the student exemption on " + _usd(a21["paymentsUsd"]) + " of payments from outside the US. As a non-resident alien the "
                "client is taxed only on US-source income, so these payments are outside US tax already, treaty or not.",
                "No treaty claim or Form 8833 is needed for them this year. Keep the claim on file: it matters once the client becomes a US "
                "resident (usually after five calendar years on an F or J visa).",
                0, ["DTAA Art. 21(1)", "IRC §872(a)"],
            ))
        else:
            out.append(make_finding(
                "treaty_article_21_student", "info", "residency",
                "DTAA Art. 21(1): " + _usd(a21["exemptUsd"]) + " of student payments from outside the US exempt from US tax",
                "The client claims the India–US treaty's student and business-apprentice exemption on " + _usd(a21["paymentsUsd"]) + " of payments from "
                "outside the US for maintenance, education or training. As a US resident alien who is neither a citizen nor a green-card holder, the client keeps "
                "it under the saving clause's exception (DTAA Art. 1(4)(b)). WISING leaves these payments out of US income.",
                "Attach Form 8833 (treaty-based return position). The exemption needs the client to have been resident in India immediately "
                "before arriving and to be in the US solely for education or training; it doesn't cover pay for work done in the US.",
                0, ["DTAA Art. 21(1)", "DTAA Art. 1(4)(b)", "Form 8833"],
            ))

    if is_nra:
        rows = n.get("fdapBreakdown") or []
        ex_row = next((r for r in rows if r["type"] == "interest_exempt"), None)
        taxed_row = next((r for r in rows if r["type"] == "interest"), None)
        ui = safe(ctx.get("us"), "income_us_source", {}) or {}
        direct_int_usd = num(ui.get("interest_us_source_usd"))
        other_int_usd = num(ui.get("interest_us_oid_usd")) + num(ui.get("interest_us_private_usd"))
        int_rate = taxed_row["rate"] if taxed_row else 0.30
        if ex_row and ex_row["baseUsd"] > 0:
            out.append(make_finding(
                "nra_us_interest_exempt", "info", "income",
                f"{_usd(ex_row['baseUsd'])} of US bank and Treasury interest is exempt for a non-resident alien",
                "Interest on US bank deposits (IRC §871(i)(2)(A)) and portfolio interest — US Treasuries and registered bonds held at a broker "
                f"(§871(h)) — is not taxed for a non-resident alien, so WISING computes no US tax on {_usd(ex_row['baseUsd'])} (about {_usd(ex_row['baseUsd'] * int_rate)}"
                f" at the {js_round(int_rate * 100)}% it would otherwise carry)."
                + (f" The {_usd(other_int_usd)} of private / OID / seller-financed interest is still taxed: it's portfolio interest only if the debt is "
                   "in registered form and the client doesn't own 10% or more of the borrower." if other_int_usd > 0 else ""),
                "Give each bank and broker Form W-8BEN so they don't apply 24% backup withholding; if they did, claim it back on Form 1040-NR. "
                "Brokerage interest from a company the client owns 10% or more of, or contingent interest, isn't portfolio interest — move it to the private line."
                + (" Confirm whether the private / OID interest qualifies as portfolio interest." if other_int_usd > 0 else ""),
                ex_row["baseUsd"] * int_rate, ["IRC §871(i)(2)(A)", "IRC §871(h)", "Form W-8BEN", "Form 1040-NR"],
            ))
        elif direct_int_usd > 0 and not nra_interest_split_recorded(ctx.get("us")):
            out.append(make_finding(
                "nra_us_interest_exempt", "warning", "income",
                f"US interest of {_usd(direct_int_usd)} taxed at {js_round(int_rate * 100)}% — its type isn't recorded, and bank or Treasury interest would be exempt",
                "A non-resident alien pays no US tax on bank-deposit interest (IRC §871(i)(2)(A)) or portfolio interest such as US Treasuries (§871(h)). "
                "The US intake has only a total for US interest, not the Banks & Brokerages / Treasuries / Private split, so WISING has taxed all "
                f"{_usd(direct_int_usd)} — up to {_usd(direct_int_usd * int_rate)} of US tax that may not be owed.",
                "Enter the US interest by type on the US intake (Banks & Brokerages, US Treasuries, Private / OID, Private / Seller Fin.).",
                direct_int_usd * int_rate, ["IRC §871(i)(2)(A)", "IRC §871(h)", "Form 1040-NR"],
            ))

    if is_nra and (n.get("art15ExemptUsd") or 0) > 0:
        days = js_num_str(n["art15UsDays"])
        out.append(make_finding(
            "nra_art15_services_exempt", "warning", "treaty",
            f"US self-employment income of {_usd(n['art15ExemptUsd'])} treated as exempt — DTAA Art. 15 ({days} US days, no US fixed base)",
            "An Indian resident's income from professional or other independent services is taxable in the US only if they have a fixed base regularly "
            "available there or stay 90 days or more in the year (DTAA Art. 15; business profits likewise need a US permanent establishment, Art. 7). "
            f"With {days} US days and no US fixed base / PE on file, WISING has left {_usd(n['art15ExemptUsd'])} of self-employment "
            f"income out of US tax, saving about {_usd(n.get('art15TaxSavedUsd') or 0)}. India taxes it as the residence country.",
            "Confirm there was no office or other fixed place regularly available in the US and that US days are under 90. Claim the exemption "
            "on Form 1040-NR (Schedule OI) with Form 8833. If either test fails, the income is US-taxable and India gives credit for the US tax (Form 44).",
            n.get("art15TaxSavedUsd") or 0, ["DTAA Art. 15", "DTAA Art. 7", "Form 8833", "Form 1040-NR"],
        ))
    return out


def _findings_all_result_override(d, ctx, base_compute):
    all_findings = list(base_compute(d, ctx))
    est = d["usEntityStateTaxResult"]
    ds = d["usDualStatusResult"]
    if ds and ds["isDualStatusYear"]:
        if ds["hasDates"]:
            period_note = (
                f"Resident from {ds['residencyStartDate'] or 'the start of the year'} through {ds['residencyEndDate'] or 'year-end'} "
                f"({round(ds['residentFraction'] * 100)}% of the year)."
            )
        else:
            period_note = "No residency start/end date was on file, so this defaulted to treating the full year as the resident period — enter the actual date for an accurate split."
        passive_note = ""
        if ds["passiveUsSourceDuringNrUsd"] > 0:
            passive_note = (
                f" Note: {_usd(ds['passiveUsSourceDuringNrUsd'])} of US-source interest/dividends/capital gains falls in the nonresident sub-period and is "
                "NOT included in the total above — classifying it as FDAP (flat 30%/treaty rate), ECI, or exempt requires trade-or-business/treaty facts this "
                "engine doesn't collect for this scenario; confirm its treatment with a preparer."
            )
        all_findings.append({
            "id": "us_dual_status_split_year", "severity": "warning", "category": "residency",
            "title": "Dual-status year — worldwide income taxed only for part of the year, no standard deduction",
            "detail": (
                f"This is a dual-status year: nonresident (US-source income only) for part of the year, resident (worldwide income) for the rest. {period_note} "
                f"Combined tax across both sub-periods: {_usd(ds['combined']['totalTaxBeforeFtcUsd'])}. Per IRS Pub 519, a dual-status alien cannot take the "
                "standard deduction for either sub-period (itemized only, applied here), and most personal credits (child/dependent care, education credits) are "
                "only available for the resident-period portion. Layer 1 collects annual income totals, not date-stamped transactions, so each sub-period's income "
                "is apportioned by day-count against the residency start/end date — the same even-earning assumption already used elsewhere in this engine for "
                f"the India FY/US CY calendar-year split.{passive_note}"
            ),
            "recommendation": (
                "File a dual-status return (Form 1040 + Form 1040-NR as a statement, or vice versa per Pub 519's ordering rules) reflecting the "
                "resident/nonresident split above, and confirm the exact residency start/end date and any uncomputed nonresident-period passive US-source income with a preparer."
            ),
            "amountUsd": ds["combined"]["totalTaxBeforeFtcUsd"], "refs": ["Pub 519", "IRC 7701(b)", "Form 1040-NR"],
        })
    expat = d["usExpatriationResult"]
    if expat and expat["isLtrExpatriating"]:
        if expat["isCoveredExpatriate"]:
            all_findings.append({
                "id": "us_covered_expatriate_exit_tax", "severity": "critical", "category": "residency",
                "title": "§877A covered expatriate — mark-to-market exit tax applies",
                "detail": (
                    f"As a Long-Term Resident (green card held {js_num_str(expat['yearsHeld'])} of the last 15 years) who surrendered the green card, this taxpayer "
                    f"meets at least one of the three covered-expatriate tests: {'; '.join(expat['reasonsMet'])}. Under §877A, a covered expatriate is treated as "
                    f"having sold all worldwide assets for fair market value the day before expatriation, with gain taxed at capital-gains rates after a "
                    f"{_usd(expat['exclusionUsd'])} exclusion (2026, Rev. Proc. 2025-32)."
                ),
                "recommendation": (
                    "File Form 8854 and compute the actual mark-to-market gain from a full asset/basis schedule with a preparer — WISING does not "
                    "collect worldwide asset FMV/basis data and cannot compute the actual exit-tax liability here; this finding only confirms covered-expatriate status applies."
                ),
                "amountUsd": 0, "refs": ["§877A", "Form 8854", "Rev. Proc. 2025-32"],
            })
        else:
            all_findings.append({
                "id": "us_ltr_expatriation_not_covered", "severity": "info", "category": "residency",
                "title": "Long-Term Resident expatriation — not a covered expatriate",
                "detail": (
                    f"This taxpayer held a green card for {js_num_str(expat['yearsHeld'])} of the last 15 years and surrendered it, but none of the three §877A "
                    "covered-expatriate tests appear to be met on the figures entered (net worth, average annual net income tax, Form 8854 certification)."
                ),
                "recommendation": (
                    "Confirm all three figures are accurate and current as of the expatriation date before relying on this — a covered-expatriate "
                    "determination has significant consequences if missed."
                ),
                "amountUsd": 0, "refs": ["§877A", "Form 8854"],
            })
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

    # US withholding on a non-resident alien's W-2 wages for work done
    # outside the US — mirrors ustax-full-nodes.js exactly.
    w2loc = (d.get("aggregateUsIncomeResult") or {}).get("w2WorkLocation")
    if w2loc and w2loc["isNra"] and w2loc["outsideUsWagesUsd"] > 1 and w2loc["federalWithheldOutsideUsUsd"] + w2loc["ficaWithheldOutsideUsUsd"] > 1:
        w2_withheld_usd = w2loc["federalWithheldOutsideUsUsd"] + w2loc["ficaWithheldOutsideUsUsd"]
        us_days = w2loc["usDays"]
        us_days_str = js_num_str(us_days) if us_days is not None else "null"
        # Where the split came from — shown under "Before relying on this amount".
        if w2loc["estimated"]:
            w2_basis = ("- The split is estimated from US days present (" + us_days_str + " ÷ 365) because the W-2's workday fields are blank. "
                        "Enter the client's actual workdays to confirm it.")
        elif us_days == 0:
            w2_basis = "- Based on 0 US days this year. If the client did work while in the US, enter the days on the W-2."
        else:
            w2_basis = None
        all_findings.append(make_finding(
            "us_withholding_outside_us_wages", "critical", "credit",
            "US withholding on wages for work outside the US — " + _usd(w2_withheld_usd) + " to stop and recover",
            _usd(w2loc["outsideUsWagesUsd"]) + " of W-2 wages were earned for work done outside the US (taken to be India). For a US non-resident alien "
            "that isn't US income (IRC §862(a)(3)), yet the employer withheld " + _usd(w2loc["federalWithheldOutsideUsUsd"]) + " of federal tax and " +
            _usd(w2loc["ficaWithheldOutsideUsUsd"]) + " of Social Security / Medicare on it. India taxes the same salary and won't credit US tax that wasn't owed, "
            "so it's taxed twice until recovered.",
            "\n".join(["## Stop the withholding",
                       "- Tell the employer's payroll the client is a non-resident alien working outside the US, so this pay isn't US wages for income-tax withholding or Social Security / Medicare.",
                       "- If the employer can't run non-US payroll, move the client to an Indian entity or an Employer of Record.",
                       "## Recover what's already withheld",
                       "- Same calendar year: the employer can correct and repay over-withheld tax through payroll (Form 941-X for Social Security / Medicare).",
                       "- Federal income tax: file Form 1040-NR showing the wages as foreign-source (an ITIN is needed if the client has no SSN).",
                       "- Social Security / Medicare: claim it from the employer, or from the IRS on Form 843 with the employer's statement if the employer won't repay.",
                       "- No treaty claim is needed: the exemption is the US source rule itself."] + (["## Before relying on this amount", w2_basis] if w2_basis else [])),
            w2_withheld_usd, ["IRC §862(a)(3)", "Form 1040-NR", "Form 843", "Form 941-X"],
        ))

    # DAG-only additions (no JS-source equivalent — deliberately kept OUT of
    # us/findings.py's ALL_FINDING_IDS, which test_findings_domain_split.py
    # pins to the exact 61-id JS-ported catalog; appended here via the same
    # findingsAllResult-override mechanism this function already uses for
    # us_dual_status_split_year/us_entity_state_tax above, matching the
    # precedent filings/assets.py set for its own Phase 6 findings —
    # msme_disallowance_s43Bh_india/presumptive_lockin_active_india — per
    # this file's own module docstring).
    is_nra = d["usEntityKind"] not in ("ccorp", "scorp", "partnership", "trust") and d["treatyFiles1040nrRaw"] and not d["s6013hElection"]
    if is_nra:
        # NRA ECI/FDAP classification cross-check: layer1_us.html's own
        # client-side derivation (updateNraFields()) — which is what
        # nraEciIncomeUsdRaw/nraFdapIncomeUsdRaw actually carry into the tax
        # computed above — only sums W-2 wages + self-employment for ECI and
        # direct interest/dividends/rental for FDAP. Re-derived here from the
        # fuller aggregateUsIncomeResult (K-1 passthrough, C-corp business
        # income, direct-source royalties) purely as a sanity check; does NOT
        # change the tax already computed.
        derived = d["nraDerivedEciFdapResult"]
        declared_eci_usd, declared_fdap_usd = d["nraEciIncomeUsdRaw"] or 0, d["nraFdapIncomeUsdRaw"] or 0
        declared_total_usd = declared_eci_usd + declared_fdap_usd
        delta_usd = derived["derivedTotalUsd"] - declared_total_usd
        materiality_usd = max(100.0, 0.01 * derived["derivedTotalUsd"])
        # Only when Layer 1 saved a split: without one the tax already uses the re-derivation.
        if d.get("nraSplitDeclaredRaw", True) and abs(delta_usd) > materiality_usd:
            eci_delta_usd = derived["derivedEciUsd"] - declared_eci_usd
            fdap_delta_usd = derived["derivedFdapUsd"] - declared_fdap_usd
            all_findings.append(make_finding(
                "nra_eci_fdap_classification_check", "warning", "credit",
                f"NRA ECI/FDAP split may be incomplete — {_usd(abs(delta_usd))} {'not yet classified' if delta_usd > 0 else 'over-counted'} vs. a full income re-derivation",
                f"Layer 1's own ECI/FDAP classification totals {_usd(declared_total_usd)} ({_usd(declared_eci_usd)} ECI + {_usd(declared_fdap_usd)} FDAP), computed there "
                "from W-2 wages + self-employment (ECI) and direct interest/dividends/rental (FDAP) only. Re-deriving from the fuller income aggregation used elsewhere in "
                f"this engine (which additionally folds in K-1 partnership/S-corp/trust passthrough income, C-corp business income, and direct-source royalties) gives "
                f"{_usd(derived['derivedTotalUsd'])} ({_usd(derived['derivedEciUsd'])} ECI + {_usd(derived['derivedFdapUsd'])} FDAP) — a difference of {_usd(eci_delta_usd)} "
                f"in ECI and {_usd(fdap_delta_usd)} in FDAP. The tax computed above still uses Layer 1's own figures, not this re-derivation.",
                "Reconcile the two totals with a preparer before relying on the NRA tax computed above — check especially for K-1s, C-corp/partnership income, or "
                "direct-source royalties that Layer 1's own ECI/FDAP screen may not be picking up.",
                abs(delta_usd), ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"],
            ))

        # India-US DTAA FDAP treaty-rate sanity check against
        # constants.py's INDIA_US_TREATY_FDAP_RATES. Field is elected_rate,
        # not rate — see findings.py's _nra_fdap_detail() comment for why.
        for treaty_claim in (d["nraRaw"]["treatyRateClaims"] or []):
            if not treaty_claim or treaty_claim.get("elected_rate") is None:
                continue
            income_type = treaty_claim.get("income_type")
            table_entry = C.INDIA_US_TREATY_FDAP_RATES.get(income_type) if income_type else None
            if not table_entry:
                continue
            claimed_rate_frac = max(0.0, min(1.0, num(treaty_claim["elected_rate"]) / 100))
            if any(abs(claimed_rate_frac - r) <= C.TREATY_RATE_TOLERANCE for r in table_entry["rates"]):
                continue
            valid_rates_pct = " / ".join(f"{js_round(r * 100)}%" for r in table_entry["rates"])
            all_findings.append(make_finding(
                "treaty_rate_not_recognized", "warning", "treaty",
                f"Claimed treaty rate ({js_round(claimed_rate_frac * 100)}%) doesn't match a recognized India-US DTAA rate for {income_type}",
                f"A {js_round(claimed_rate_frac * 100)}% rate is claimed for {income_type} income, but {table_entry['article']} of the India-US DTAA only provides for "
                f"{valid_rates_pct} ({table_entry['note']}). This doesn't automatically mean the claim is wrong — it may reflect a sub-category this engine doesn't "
                "distinguish — but a rate outside the treaty's own range will not be honored by the IRS as claimed.",
                f"Confirm the {income_type} claim against {table_entry['article']} of the treaty (and the current IRS Publication 901) with a preparer before relying "
                "on the FDAP tax computed above.",
                0, [table_entry["article"], "Form W-8BEN", "Pub. 901"],
            ))

        # DTAA Art. 21(2) — Indian student/business-apprentice standard
        # deduction, computed in _nra_tax_result above.
        nra_detail = d["usTaxResult"].get("nra") or {}
        if nra_detail.get("article212Eligible"):
            uses_standard = nra_detail["standardDeductionUsd"] >= nra_detail["itemizedDeductionUsd"]
            benefit_usd = max(0.0, nra_detail["standardDeductionUsd"] - nra_detail["itemizedDeductionUsd"])
            all_findings.append(make_finding(
                "nra_article_21_2_standard_deduction", "info", "credit",
                f"Art. 21(2) applied — {'standard' if uses_standard else 'itemized'} deduction used on ECI",
                f"As an Indian student/business apprentice on an F-1 visa, Article 21(2) of the India-US DTAA lets this taxpayer use the same deductions a US "
                f"resident could — including the {_usd(nra_detail['standardDeductionUsd'])} standard deduction — instead of the itemized-only rule that otherwise "
                f"applies to NRAs. Itemized deductions here total {_usd(nra_detail['itemizedDeductionUsd'])}, so the "
                + ("standard deduction was used" if uses_standard else "itemized deductions were used since they exceed the standard deduction")
                + (f", saving {_usd(benefit_usd)} of ECI from tax versus the itemized-only default." if benefit_usd > 0 else "."),
                "File Form 8833 to disclose the treaty-based return position (Article 21(2)) alongside Form 1040-NR.",
                benefit_usd, ["Art. 21(2)", "Form 8833", "Form 1040-NR"],
            ))
        elif nra_detail.get("article212AmbiguousJ1"):
            all_findings.append(make_finding(
                "nra_j1_article_21_2_review", "info", "credit",
                "J-1 visa on file — confirm whether Art. 21(2)'s standard-deduction treaty benefit applies",
                "This taxpayer's visa is recorded as J-1, which covers several sub-categories (students, business apprentices, trainees, scholars, professors, "
                "and research scholars). Article 21(2) of the India-US DTAA — which allows the standard deduction instead of the usual NRA itemized-only rule — "
                "applies only to students and business apprentices, not to scholars/professors/researchers (who fall under Article 22 instead, a different, "
                "time-limited exemption). This engine has not assumed eligibility and has computed tax on an itemized-only basis.",
                "Confirm the specific J-1 sub-category with the taxpayer; if student or business apprentice, Article 21(2) may allow the standard deduction "
                "(Form 8833 disclosure required) and could reduce the ECI tax computed above.",
                0, ["Art. 21(2)", "Art. 22", "Form 8833"],
            ))

    all_findings.extend(_treaty_findings(d, ctx, is_nra))

    all_findings.sort(key=lambda f: (_SEVERITY_WEIGHT[f["severity"]], -f["amountUsd"]))
    return all_findings


# US-India DTAA Art. 21(2): a student or business apprentice who is (or
# immediately before visiting the US was) a resident of India may compute
# US tax using the same deductions available to a US citizen/resident,
# including the standard deduction — the one carve-out from the general
# "NRAs get itemized deductions only" rule (IRC 873(b)). layer1_us.html's
# "US Visa / Immigration Status" field (#prof-visa-type) distinguishes F-1
# (unambiguously "Student") from J-1 ("Exchange Visitor", which also covers
# scholars/professors/researchers/trainees under Article 22, NOT eligible
# under Article 21(2)) — so only F-1 is auto-applied; J-1 is surfaced as a
# finding for the preparer to confirm the sub-category rather than guessed.
_ARTICLE_21_2_AUTO_VISA = "f1"
_ARTICLE_21_2_AMBIGUOUS_VISA = "j1"


def _nra_split_declared_raw(d, ctx):
    e = safe(ctx.get("us"), "nra_specific.us_eci_income_usd", None)
    f = safe(ctx.get("us"), "nra_specific.us_fdap_income_usd", None)
    return (e is not None and e != "") or (f is not None and f != "")


def _nra_effective_eci_fdap(d, ctx):
    """The ECI/FDAP split an NRA is taxed on — Layer 1 US's saved split, or,
    when none was saved, the engine's own re-derivation (US rent moved to ECI
    under a §871(d) net-basis election, as the form does). A missing split
    used to mean $0 of income. Mirrors ustax-full-nodes.js."""
    if d["nraSplitDeclaredRaw"]:
        return {"eciUsd": d["nraEciIncomeUsdRaw"] or 0, "fdapUsd": d["nraFdapIncomeUsdRaw"] or 0, "source": "layer1"}
    dv = d["nraDerivedEciFdapResult"]
    rental = num(d["aggregateUsIncomeResult"]["rentalUs"]["usd"]) if safe(ctx.get("us"), "nra_specific.rental_net_basis_election", False) is True else 0
    return {"eciUsd": dv["derivedEciUsd"] + rental, "fdapUsd": dv["derivedFdapUsd"] - rental, "source": "derived"}


# §72(t) on a 1040-NR — see ustax-full-nodes.js's nraAdditionalTax72tUsd.
def _nra_additional_tax_72t_usd(d, ctx):
    return additional_tax_72t_usd(ctx.get("us"), ctx.get("india"), d["taxpayerDobRaw"], d["baseYearUs"] or 2026, as_of_from_ctx(ctx))


def _nra_tax_result(d, ctx):
    # A married NRA files 1040-NR at married-filing-separately rates (joint
    # rates need a §6013(g)/(h) election, which routes to the resident
    # computation instead); anyone else uses single rates.
    status = "mfs" if d["usFilingStatusRaw"] in ("mfj", "mfs") else "single"
    brackets = T["BRACKETS"].get(status, T["BRACKETS"]["single"])
    ded = d["dedUs"]

    split = d.get("nraEffectiveEciFdap") or {"eciUsd": d["nraEciIncomeUsdRaw"] or 0, "fdapUsd": d["nraFdapIncomeUsdRaw"] or 0, "source": "layer1"}
    eci_usd = split["eciUsd"] or 0
    fdap_usd = split["fdapUsd"] or 0
    # India-US treaty benefits need Indian residence — see ustax-full-nodes.js.
    treaty_resident = safe(ctx.get("india"), "residency_detail.final_india_residency_status", None) != "NR"
    # DTAA Art. 15 / Art. 7: self-employment income exempt with no US fixed
    # base / PE and fewer than 90 US days — see ustax-full-nodes.js.
    us_days_art15 = num(safe(ctx.get("us"), "us_residency_detail.us_days_current_year", 0))
    se_usd = num((d.get("aggregateUsIncomeResult") or {}).get("seEarningsUsd"))
    art15_exempt_usd = min(se_usd, eci_usd) if (treaty_resident and safe(ctx.get("us"), "nra_specific.has_us_pe", False) is not True
                                                and us_days_art15 < 90 and se_usd > 0) else 0
    eci_before_art15_usd = eci_usd
    eci_usd -= art15_exempt_usd
    # DTAA Art. 22 — see ustax-full-nodes.js.
    a22 = art22(ctx.get("us"), base_year_of(ctx.get("router"), ctx.get("us")))
    if a22 and split["source"] == "layer1":
        eci_usd -= min(max(0.0, eci_usd), a22["exemptUsd"])
    claims = d["nraRaw"]["treatyRateClaims"] or []
    claim = claims[0] if claims else None
    claimed_rate = max(0.0, min(1.0, num(claim["elected_rate"]) / 100)) if (claim and claim.get("elected_rate") is not None) else None
    w8ben_on_file = d["nraRaw"]["submittedW8ben"] is True
    detail = nra_fdap_breakdown(fdap_usd, d.get("aggregateUsIncomeResult") or {}, d.get("royaltiesDirectUsSourceUsdRaw") or 0,
                                 safe(ctx.get("us"), "nra_specific.rental_net_basis_election", False) is True, claims, w8ben_on_file, treaty_resident, nra_exempt_interest_usd(ctx.get("us")))
    fdap_rate = detail["effectiveRate"] if detail["effectiveRate"] is not None else (claimed_rate if (w8ben_on_file and claimed_rate is not None) else 0.30)

    itemized_usd = min(ded["salt"], compute_salt_cap(eci_usd, status)) + ded["mortgageInterest"] + ded["charitable"] + max(0.0, ded["medical"] - 0.075 * eci_usd)
    visa_type = d["usVisaTypeRaw"]
    article212_eligible = visa_type == _ARTICLE_21_2_AUTO_VISA
    article212_ambiguous_j1 = visa_type == _ARTICLE_21_2_AMBIGUOUS_VISA
    std_deduction_usd = T["STD_DEDUCTION"].get(status, T["STD_DEDUCTION"]["single"])
    if article212_eligible:
        deduction_usd = max(itemized_usd, std_deduction_usd)
        deduction_mode = (
            f"standard (Art. 21(2) — Indian student/business apprentice, {_usd(std_deduction_usd)})" if deduction_usd == std_deduction_usd
            else "itemized (Art. 21(2) — Indian student/business apprentice; itemized exceeds the standard deduction)"
        )
    else:
        deduction_usd = itemized_usd
        deduction_mode = "itemized (NRA — no standard deduction)"

    taxable_eci_usd = max(0.0, eci_usd - deduction_usd)
    eci_tax_usd = bracket_tax(taxable_eci_usd, brackets)
    eci_bracket_breakdown = bracket_breakdown(taxable_eci_usd, brackets)
    fdap_tax_usd = detail["fdapTaxUsd"]
    addl_medicare = d["additionalMedicareOwedBoundary"] or 0
    art15_tax_saved_usd = (bracket_tax(max(0.0, eci_before_art15_usd - deduction_usd), brackets) - eci_tax_usd) if art15_exempt_usd > 0 else 0
    add_72t_usd = d.get("nraAdditionalTax72tUsd") or 0
    total_tax = eci_tax_usd + fdap_tax_usd + detail["socialSecurityTaxUsd"] + detail["pensionTaxUsd"] + addl_medicare + add_72t_usd
    nra_income_usd = eci_usd + fdap_usd + detail["socialSecurityTaxableUsd"] + detail["pensionTaxableUsd"]

    return {
        **({"additionalTax72tUsd": add_72t_usd} if add_72t_usd > 0 else {}),
        "filingStatus": status, "worldwide": False, "isNra": True,
        "totalIncomeUsd": nra_income_usd,
        "agiUsd": eci_usd, "deductionUsd": deduction_usd, "deductionMode": deduction_mode,
        "taxableIncomeUsd": taxable_eci_usd,
        "ordinaryTaxUsd": eci_tax_usd, "preferentialTaxUsd": 0, "incomeTaxUsd": eci_tax_usd + fdap_tax_usd + detail["socialSecurityTaxUsd"] + detail["pensionTaxUsd"],
        "niitUsd": 0, "additionalMedicareUsd": addl_medicare, "seTaxUsd": 0, "qbiDeductionUsd": 0, "amtUsd": 0, "creditsUsd": 0,
        "collectiblesGainUsd": 0, "collectiblesTaxUsd": 0, "qsbsExcludedGainUsd": 0, "qsbsTaxableGainUsd": 0,
        "saversCreditUsd": 0,
        "totalTaxBeforeFtcUsd": total_tax,
        "foreignSourceIncomeUsd": 0,
        "usSourceIncomeUsd": nra_income_usd,
        "nra": {
            "fdapBreakdown": detail["rows"], "socialSecurityTaxableUsd": detail["socialSecurityTaxableUsd"],
            "socialSecurityTaxUsd": detail["socialSecurityTaxUsd"], "pensionTreatyExemptUsd": detail["pensionUsd"],
            "pensionTaxUsd": detail["pensionTaxUsd"], "treatyResident": treaty_resident,
            "art15ExemptUsd": art15_exempt_usd, "art15TaxSavedUsd": art15_tax_saved_usd, "art15UsDays": us_days_art15,
            "splitSource": split["source"],
            "eciUsd": eci_usd, "fdapUsd": fdap_usd, "fdapRate": fdap_rate, "eciTaxUsd": eci_tax_usd, "fdapTaxUsd": fdap_tax_usd,
            "taxableEciUsd": taxable_eci_usd, "eciBracketBreakdown": eci_bracket_breakdown,
            "claimedRate": claimed_rate, "w8benOnFile": w8ben_on_file, "incomeType": (claim.get("income_type") if claim else None) or None,
            "itemizedDeductionUsd": itemized_usd, "standardDeductionUsd": std_deduction_usd,
            "article212Eligible": article212_eligible, "article212AmbiguousJ1": article212_ambiguous_j1, "visaType": visa_type,
        },
        "feie": {"claimed": False, "eligible": False, "taxHomeAbroad": False, "testMet": False, "reasons": [], "appliedUsd": 0},
        "effectiveRate": (total_tax / nra_income_usd) if nra_income_usd > 0 else 0,
    }


def _usd_of(v):
    return v["usd"] if (v and isinstance(v.get("usd"), (int, float))) else 0


def _is_leap_year(y):
    return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0


def _days_in_year(y):
    return 366 if _is_leap_year(y) else 365


def _days_between_inclusive_iso(start_iso, end_iso):
    start = parse_date(start_iso)
    end = parse_date(end_iso)
    return (end - start).days + 1


def _scale_resident_inc(inc, frac):
    def s(v):
        return {"usd": _usd_of(v) * frac}

    return {
        "wages": s(inc["wages"]), "businessUs": s(inc.get("businessUs")), "foreignWages": s(inc["foreignWages"]), "foreignSelfEmployment": s(inc["foreignSelfEmployment"]),
        "interestUs": s(inc["interestUs"]), "ordinaryDividendsUs": s(inc["ordinaryDividendsUs"]), "qualifiedDividendsUs": s(inc["qualifiedDividendsUs"]),
        "stcgUs": s(inc["stcgUs"]), "ltcgUs": s(inc["ltcgUs"]), "capitalGainsUs": s(inc["capitalGainsUs"]), "rentalUs": s(inc["rentalUs"]),
        "foreignInterest": s(inc["foreignInterest"]), "foreignDividends": s(inc["foreignDividends"]), "foreignRental": s(inc["foreignRental"]),
        "foreignPension": s(inc["foreignPension"]), "foreignStcg": s(inc["foreignStcg"]), "foreignLtcg": s(inc["foreignLtcg"]),
        "foreignSection988GainLoss": s(inc.get("foreignSection988GainLoss")), "foreignOtherIncome": s(inc.get("foreignOtherIncome")),
        "usRetirementIncome": s(inc.get("usRetirementIncome")), "usRetirementIncomeExclSs": s(inc.get("usRetirementIncomeExclSs")),
        "socialSecurityUs": s(inc.get("socialSecurityUs")), "taxExemptInterestUs": s(inc.get("taxExemptInterestUs")),
        "seEarningsUsd": (inc.get("seEarningsUsd") or 0) * frac, "seEarningsFromIndiaUsd": (inc.get("seEarningsFromIndiaUsd") or 0) * frac,
        "medicareWages": (inc.get("medicareWages") or 0) * frac,
        "qualifiedTipsUsd": (inc.get("qualifiedTipsUsd") or 0) * frac, "qualifiedOvertimeUsd": (inc.get("qualifiedOvertimeUsd") or 0) * frac,
        "qbiIncomeUsd": (inc.get("qbiIncomeUsd") or 0) * frac, "qbiIsSSTB": inc.get("qbiIsSSTB"),
        "qbiWagesUsd": (inc.get("qbiWagesUsd") or 0) * frac, "qbiUbiaUsd": (inc.get("qbiUbiaUsd") or 0) * frac,
        "collectiblesLtcgUsd": (inc.get("collectiblesLtcgUsd") or 0) * frac,
        "qsbsExcludedGainUsd": (inc.get("qsbsExcludedGainUsd") or 0) * frac, "qsbsTaxableGainUsd": (inc.get("qsbsTaxableGainUsd") or 0) * frac,
        "retirementEpfInterestUsd": (inc.get("retirementEpfInterestUsd") or 0) * frac, "retirementNpsWithdrawalUsd": (inc.get("retirementNpsWithdrawalUsd") or 0) * frac,
        "usSourceTotal": s(inc["usSourceTotal"]),
        # Phase 7 (XB-14): the full CFC-year inclusion is applied entirely to
        # the resident sub-period, NOT day-count apportioned like the income
        # items above — a CFC's own tax year is a discrete inclusion event
        # (virtually always closing within the resident period in a real
        # dual-status case), not a continuously-accruing amount. Documented
        # simplification, same disclosure style as passiveUsSourceDuringNrUsd.
        # Mirrors ustax-full-nodes.js exactly.
        "cfcNonElectedInclusionUs": {"usd": _usd_of(inc.get("cfcNonElectedInclusionUs"))},
        "cfcElectedPool": inc.get("cfcElectedPool") or None,
    }


def _scale_nonresident_inc(inc, frac):
    def s(v):
        return {"usd": _usd_of(v) * frac}

    zero = {"usd": 0}
    eci_usd = s(inc["wages"])["usd"] + s(inc.get("businessUs"))["usd"] + s(inc["rentalUs"])["usd"]
    return {
        "wages": s(inc["wages"]), "businessUs": s(inc.get("businessUs")), "rentalUs": s(inc["rentalUs"]),
        "foreignWages": zero, "foreignSelfEmployment": zero, "interestUs": zero, "ordinaryDividendsUs": zero, "qualifiedDividendsUs": zero,
        "stcgUs": zero, "ltcgUs": zero, "capitalGainsUs": zero, "foreignInterest": zero, "foreignDividends": zero, "foreignRental": zero,
        "foreignPension": zero, "foreignStcg": zero, "foreignLtcg": zero, "foreignSection988GainLoss": zero, "foreignOtherIncome": zero, "usRetirementIncome": zero, "usRetirementIncomeExclSs": zero,
        "socialSecurityUs": zero, "taxExemptInterestUs": zero,
        "seEarningsUsd": (inc.get("seEarningsUsd") or 0) * frac, "seEarningsFromIndiaUsd": 0, "medicareWages": (inc.get("medicareWages") or 0) * frac,
        "qualifiedTipsUsd": 0, "qualifiedOvertimeUsd": 0, "qbiIncomeUsd": 0, "qbiIsSSTB": False, "qbiWagesUsd": 0, "qbiUbiaUsd": 0,
        "collectiblesLtcgUsd": 0, "qsbsExcludedGainUsd": 0, "qsbsTaxableGainUsd": 0,
        "retirementEpfInterestUsd": 0, "retirementNpsWithdrawalUsd": 0,
        "usSourceTotal": {"usd": eci_usd},
        "cfcNonElectedInclusionUs": zero, "cfcElectedPool": None,
    }


def _scale_ded_for_dual_status(ded, frac, drop_personal_credits):
    return {
        "mode": "itemized",
        "salt": (ded.get("salt") or 0) * frac, "mortgageInterest": (ded.get("mortgageInterest") or 0) * frac, "charitable": (ded.get("charitable") or 0) * frac,
        "medical": (ded.get("medical") or 0) * frac, "studentLoanInterest": (ded.get("studentLoanInterest") or 0) * frac,
        "isoAmtPrefUsd": (ded.get("isoAmtPrefUsd") or 0) * frac, "amtPrefs": (ded.get("amtPrefs") or 0) * frac,
        "careExpenses": 0 if drop_personal_credits else ded.get("careExpenses"),
        "aotc": 0 if drop_personal_credits else ded.get("aotc"), "lifetimeLearning": 0 if drop_personal_credits else ded.get("lifetimeLearning"),
        "dependents": 0 if drop_personal_credits else ded.get("dependents"),
        "seHealthInsuranceDeductionUsd": (ded.get("seHealthInsuranceDeductionUsd") or 0) * frac,
        "seRetirementDeductionUsd": (ded.get("seRetirementDeductionUsd") or 0) * frac,
    }


_NO_FEIE = {"claimed": False, "eligible": False, "taxHomeAbroad": False, "testMet": False, "reasons": [], "amountClaimedUsd": 0}


def _us_dual_status_info(d, ctx):
    if d["usStatusRaw"] != "DUAL_STATUS":
        return {"isDualStatusYear": False}
    year = d["baseYearUs"] or 2026
    start_date, end_date = d["usResidencyStartDateRaw"], d["usResidencyEndDateRaw"]
    has_dates = bool(start_date or end_date)
    total_days = _days_in_year(year)
    resident_days = total_days
    if has_dates:
        eff_start = start_date or f"{year}-01-01"
        eff_end = end_date or f"{year}-12-31"
        resident_days = max(0, min(total_days, _days_between_inclusive_iso(eff_start, eff_end)))
    resident_fraction = (resident_days / total_days) if total_days > 0 else 1
    return {
        "isDualStatusYear": True, "hasDates": has_dates, "residencyStartDate": start_date, "residencyEndDate": end_date,
        "residentDays": resident_days, "totalDaysInYear": total_days,
        "residentFraction": resident_fraction, "nonresidentFraction": 1 - resident_fraction,
    }


def _us_dual_status_result(d, ctx):
    info = d["usDualStatusInfo"]
    if not info["isDualStatusYear"]:
        return None
    frac, nr_frac = info["residentFraction"], info["nonresidentFraction"]
    # Saver's Credit (§25B) is a personal, nonrefundable credit — same
    # resident-period-only treatment as care_expenses/aotc/lifetime_learning/
    # dependents in _scale_ded_for_dual_status's drop_personal_credits.
    # Full-year contribution amount applied entirely to the resident
    # sub-period call, 0 to the nonresident one — this was previously
    # omitted from BOTH compute_us_tax_core calls entirely, which silently
    # dropped the Saver's Credit to $0 for every dual-status-year filer
    # regardless of real contributions.
    savers_credit_contribution_usd = d["electiveDeferralAggregateUsd"] + d["iraContributionAggregateUsd"]

    rp = compute_us_tax_core(
        _scale_resident_inc(d["incUs"], frac), _scale_ded_for_dual_status(d["dedUs"], frac, False),
        d["usFilingStatusRaw"], True, d["feie"], d["additionalMedicareOwedBoundary"], d["taxpayerDobRaw"], d["baseYearUs"],
        savers_credit_contribution_usd,
    )
    nr_raw = compute_us_tax_core(
        _scale_nonresident_inc(d["incUs"], nr_frac), _scale_ded_for_dual_status(d["dedUs"], nr_frac, True),
        d["usFilingStatusRaw"], False, _NO_FEIE, 0, d["taxpayerDobRaw"], d["baseYearUs"], 0,
    )
    # NIIT never applies to a nonresident alien (Treas. Reg. 1.1411-2(a)(2)(i)) --
    # compute_us_tax_core has no NRA-awareness flag, so override post-hoc.
    nr = {**nr_raw, "niitUsd": 0, "totalTaxBeforeFtcUsd": nr_raw["totalTaxBeforeFtcUsd"] - nr_raw["niitUsd"]}

    passive_us_source_during_nr_usd = (_usd_of(d["incUs"]["interestUs"]) + _usd_of(d["incUs"]["ordinaryDividendsUs"]) + _usd_of(d["incUs"]["capitalGainsUs"])) * nr_frac

    combined = {
        "agiUsd": rp["agiUsd"] + nr["agiUsd"], "taxableIncomeUsd": rp["taxableIncomeUsd"] + nr["taxableIncomeUsd"],
        "incomeTaxUsd": rp["incomeTaxUsd"] + nr["incomeTaxUsd"], "niitUsd": rp["niitUsd"] + nr["niitUsd"],
        "additionalMedicareUsd": rp["additionalMedicareUsd"] + nr["additionalMedicareUsd"], "seTaxUsd": rp["seTaxUsd"] + nr["seTaxUsd"],
        "qbiDeductionUsd": rp["qbiDeductionUsd"] + nr["qbiDeductionUsd"], "amtUsd": rp["amtUsd"] + nr["amtUsd"],
        "creditsUsd": rp["creditsUsd"] + nr["creditsUsd"], "totalTaxBeforeFtcUsd": rp["totalTaxBeforeFtcUsd"] + nr["totalTaxBeforeFtcUsd"],
        "deductionUsd": rp["deductionUsd"] + nr["deductionUsd"], "deductionMode": "itemized (dual-status — standard deduction not allowed)",
        "totalIncomeUsd": rp["totalIncomeUsd"] + nr["totalIncomeUsd"], "usSourceIncomeUsd": rp["usSourceIncomeUsd"] + nr["usSourceIncomeUsd"],
        "feieAppliedUsd": rp["feieAppliedUsd"], "worldwide": True,
        "ordinaryTaxUsd": rp["ordinaryTaxUsd"] + nr["ordinaryTaxUsd"], "preferentialTaxUsd": rp["preferentialTaxUsd"] + nr["preferentialTaxUsd"],
        "filingStatus": rp["filingStatus"], "ordinaryIncomeUsd": rp["ordinaryIncomeUsd"] + nr["ordinaryIncomeUsd"],
        "preferentialIncomeUsd": rp["preferentialIncomeUsd"] + nr["preferentialIncomeUsd"], "saltCapUsd": rp["saltCapUsd"],
        "socialSecurityDetail": rp["socialSecurityDetail"],
        "seniorDeductionUsd": rp["seniorDeductionUsd"], "seniorDetail": rp["seniorDetail"],
        "tipsDeductionUsd": rp["tipsDeductionUsd"], "overtimeDeductionUsd": rp["overtimeDeductionUsd"], "tipsOvertimeDetail": rp["tipsOvertimeDetail"],
        "ordinaryTaxableUsd": rp["ordinaryTaxableUsd"] + nr["ordinaryTaxableUsd"], "ordinaryBracketBreakdown": rp["ordinaryBracketBreakdown"],
        "amtDetail": rp["amtDetail"], "otherCreditsUsd": rp["otherCreditsUsd"] + nr["otherCreditsUsd"], "ctcDetail": rp["ctcDetail"],
        # Saver's Credit is resident-period-only (see the drop_personal_
        # credits comment above) -- nr's is always 0, kept as an explicit
        # sum for the same reason otherCreditsUsd above is a sum.
        "saversCreditUsd": (rp.get("saversCreditUsd") or 0) + (nr.get("saversCreditUsd") or 0), "saversCreditDetail": rp.get("saversCreditDetail"),
        "foreignSourceIncomeUsd": rp["foreignSourceIncomeUsd"],
        "retirementEpfInterestUsd": rp["retirementEpfInterestUsd"], "retirementNpsWithdrawalUsd": rp["retirementNpsWithdrawalUsd"],
        "niitDetail": rp["niitDetail"], "feie": rp["feie"],
        "effectiveRate": ((rp["totalTaxBeforeFtcUsd"] + nr["totalTaxBeforeFtcUsd"]) / (rp["totalIncomeUsd"] + nr["totalIncomeUsd"])) if (rp["totalIncomeUsd"] + nr["totalIncomeUsd"]) > 0 else 0,
    }

    return {
        "isDualStatusYear": True, "residentFraction": frac, "nonresidentFraction": nr_frac,
        "residencyStartDate": info["residencyStartDate"], "residencyEndDate": info["residencyEndDate"], "hasDates": info["hasDates"],
        "residentPeriod": rp, "nonresidentPeriod": nr, "passiveUsSourceDuringNrUsd": passive_us_source_during_nr_usd,
        "combined": combined,
    }


def _us_expatriation_result(d, ctx):
    surrendered_date = safe(ctx.get("us"), "us_residency_detail.i407_surrendered_date", None)
    is_ltr_expatriating = bool(d["usHasGreenCardRaw"] and surrendered_date and d["usGreenCardYearsHeldRaw"] >= EXPATRIATION_LTR_YEARS_THRESHOLD)
    if not is_ltr_expatriating:
        return {"isLtrExpatriating": False}

    reasons_met = []
    net_worth_test = d["usExpatriationNetWorthRaw"] >= EXPATRIATION_NET_WORTH_THRESHOLD_USD
    if net_worth_test:
        reasons_met.append(f"net worth of {_usd(d['usExpatriationNetWorthRaw'])} meets the ${EXPATRIATION_NET_WORTH_THRESHOLD_USD:,} threshold")
    avg_tax_test = d["usExpatriationAvgNetIncomeTaxRaw"] > EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD
    if avg_tax_test:
        reasons_met.append(f"average annual net income tax of {_usd(d['usExpatriationAvgNetIncomeTaxRaw'])} exceeds the ${EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD:,} threshold")
    cert_test = not d["usForm8854CompliantRaw"]
    if cert_test:
        reasons_met.append("Form 8854 5-year tax compliance is not certified")

    return {
        "isLtrExpatriating": True, "yearsHeld": d["usGreenCardYearsHeldRaw"],
        "isCoveredExpatriate": net_worth_test or avg_tax_test or cert_test,
        "netWorthTest": net_worth_test, "avgTaxTest": avg_tax_test, "certTest": cert_test, "reasonsMet": reasons_met,
        "exclusionUsd": EXPATRIATION_MTM_EXCLUSION_USD,
    }


def _us_tax_result_router(d, ctx):
    ek = d["usEntityKind"]
    if ek in ("ccorp", "scorp", "partnership", "trust"):
        return d["usEntityTaxResult"]
    if d["files1040nr"] and not d["s6013hElection"]:
        return d["nraTaxResult"]
    ds = d["usDualStatusResult"]
    if ds and ds["isDualStatusYear"]:
        return {**ds["combined"], "dualStatusDetail": ds}
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
        base["usCyToFyPrimaryUsd"] = js_round(us_cy_total * 9 / 12)
        base["usCyToFyNextUsd"] = js_round(us_cy_total * 3 / 12)
    return base


OVERRIDE_REASON = "ustax-full-nodes.js wiring: closes computeUsEntityTax/computeNraTax + usTaxResult's own entity/NRA routing, now that entityResult/metaResult are in the registry"


def build(base):
    r = base.extend()

    r.register("trustRetainedIncomeUsdRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "profile.trust_retained_income_usd", 0)), layer1_fields=("us.profile.trust_retained_income_usd",)))
    r.register("usEntityTaxResult", NodeDef(deps=("usEntityKind", "entityResult", "aggregateUsIncomeResult", "trustRetainedIncomeUsdRaw"), compute=_us_entity_tax_result))
    r.register("usEntityStateOfDomicileRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "profile.state_of_domicile", None), layer1_fields=("us.profile.state_of_domicile",)))
    r.register("usEntityStateTaxResult", NodeDef(deps=("usEntityKind", "usEntityStateOfDomicileRaw", "usEntityTaxResult"), compute=_us_entity_state_tax_result))
    r.register("nraSplitDeclaredRaw", NodeDef(deps=(), compute=_nra_split_declared_raw,
        layer1_fields=("us.nra_specific.us_eci_income_usd", "us.nra_specific.us_fdap_income_usd")))
    r.register("nraEffectiveEciFdap", NodeDef(
        deps=("nraSplitDeclaredRaw", "nraEciIncomeUsdRaw", "nraFdapIncomeUsdRaw", "nraDerivedEciFdapResult", "aggregateUsIncomeResult"),
        compute=_nra_effective_eci_fdap, layer1_fields=("us.nra_specific.rental_net_basis_election",)))
    r.register("nraAdditionalTax72tUsd", NodeDef(deps=("taxpayerDobRaw", "baseYearUs"), compute=_nra_additional_tax_72t_usd,
                                                 layer1_fields=("us.income_us_source.retirement_distributions", "india.residency_detail.final_india_residency_status")))
    r.register("nraTaxResult", NodeDef(
        deps=("nraRaw", "nraFdapIncomeUsdRaw", "nraEciIncomeUsdRaw", "usFilingStatusRaw", "dedUs", "additionalMedicareOwedBoundary", "usVisaTypeRaw", "nraEffectiveEciFdap", "aggregateUsIncomeResult", "royaltiesDirectUsSourceUsdRaw", "nraAdditionalTax72tUsd"),
        compute=_nra_tax_result, layer1_fields=("us.nra_specific.rental_net_basis_election",),
    ))

    r.register("usResidencyStartDateRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.residency_start_date", None), layer1_fields=("us.us_residency_detail.residency_start_date",)))
    r.register("usResidencyEndDateRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.residency_end_date", None), layer1_fields=("us.us_residency_detail.residency_end_date",)))
    r.register("usDualStatusInfo", NodeDef(deps=("usStatusRaw", "usResidencyStartDateRaw", "usResidencyEndDateRaw", "baseYearUs"), compute=_us_dual_status_info))
    r.register("usDualStatusResult", NodeDef(
        deps=("usDualStatusInfo", "incUs", "dedUs", "usFilingStatusRaw", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs",
              "electiveDeferralAggregateUsd", "iraContributionAggregateUsd"),
        compute=_us_dual_status_result,
    ))

    r.register("usGreenCardYearsHeldRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "us_residency_detail.green_card_years_held", 0)), layer1_fields=("us.us_residency_detail.green_card_years_held",)))
    r.register("usExpatriationNetWorthRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "us_residency_detail.expatriation_net_worth_usd", 0)), layer1_fields=("us.us_residency_detail.expatriation_net_worth_usd",)))
    r.register("usExpatriationAvgNetIncomeTaxRaw", NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "us_residency_detail.expatriation_avg_net_income_tax_usd", 0)), layer1_fields=("us.us_residency_detail.expatriation_avg_net_income_tax_usd",)))
    r.register("usForm8854CompliantRaw", NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.form_8854_5yr_compliance_certified", False) is True, layer1_fields=("us.us_residency_detail.form_8854_5yr_compliance_certified",)))
    r.register("usExpatriationResult", NodeDef(
        deps=("usHasGreenCardRaw", "usGreenCardYearsHeldRaw", "usExpatriationNetWorthRaw", "usExpatriationAvgNetIncomeTaxRaw", "usForm8854CompliantRaw"),
        compute=_us_expatriation_result,
    ))

    base_findings_all = r.get("findingsAllResult")
    r.override(
        "findingsAllResult",
        NodeDef(
            deps=base_findings_all.deps + (
                "usEntityStateTaxResult", "usDualStatusResult", "usExpatriationResult",
                "usEntityKind", "treatyFiles1040nrRaw", "s6013hElection", "usTaxResult",
                "nraDerivedEciFdapResult", "nraEciIncomeUsdRaw", "nraFdapIncomeUsdRaw", "nraRaw", "nraSplitDeclaredRaw",
            ) + tuple(x for x in ("aggregateUsIncomeResult", "residencyResult", "usHasGreenCardRaw", "treatyUsResidenceRaw", "treatyIndiaResidenceRaw")
                      if x not in base_findings_all.deps),
            compute=lambda d, ctx: _findings_all_result_override(d, ctx, base_findings_all.compute),
        ),
        reason=OVERRIDE_REASON,
    )

    r.override("usEntityKind", NodeDef(deps=("entityResult",), compute=lambda d, ctx: d["entityResult"]["usKind"]), reason=OVERRIDE_REASON)
    r.override("baseYearUs", NodeDef(deps=("metaResult",), compute=lambda d, ctx: d["metaResult"]["baseYear"]), reason=OVERRIDE_REASON)

    base_us_tax_result = r.get("usTaxResult")
    r.register("usTaxIndividualResult", base_us_tax_result)
    r.override(
        "usTaxResult",
        NodeDef(deps=("usEntityKind", "files1040nr", "s6013hElection", "usEntityTaxResult", "nraTaxResult", "usTaxIndividualResult", "usDualStatusResult"), compute=_us_tax_result_router),
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
