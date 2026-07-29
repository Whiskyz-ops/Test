"""US-domain findings — the 17 findings in test_findings_domain_split.py's
US_FINDING_IDS whose compute() reads only US raw/domain facts (never
residencyResult/ftcResult/apportionmentResult/crossBasisResult/
mapDoubleTaxedIncomeResult directly).

Ports, by JS source file:
  - findings-nodes.js:            amt_applies
  - findings-batch3-nodes.js:     foreign_gift_3520, covered_expat_gift_tax,
                                   nra_w8ben_missing, firpta
  - findings-batch4-nodes.js:     feie_ineligible, feie_applied, nra_fdap_flat_rate
  - findings-batch5-nodes.js:     iso_3921, state_income_tax, trump_account_contribution_limit
  - us1-nodes.js + report-batch5-nodes.js: underpayment_2210 (split pattern)
  - us5-nodes.js + report-batch5-nodes.js: early_withdrawal_penalty_72t (split pattern)
  - residency-nodes.js's residencyConsistencyFindings (US branch only):
    residency_status_understated_us, residency_status_overstated_us,
    residency_status_understated_us_entity, residency_status_overstated_us_entity

feie_ineligible/feie_applied read `usTaxResult["feie"]` directly (already
carries `.reasons`/`.appliedUsd` via ustax.py's `feie_eligibility()`) — the
JS source's separate `feieDetailed` node existed only because the JS
`usTaxResult` version omitted `reasons[]`; that gap doesn't exist here, so
no sibling node was needed.

underpayment_2210/early_withdrawal_penalty_72t reuse us/us1_penalty_2210.py's
and us/us5_penalty_72t.py's already-built, already-tested computation nodes
(us2210PenaltyUsd, usPaidTotalUsd, usRequiredUsd, penalty72tUsd, earlyDistUsd,
ageAtYearEndUs, shouldFire) — only the full finding-object text (title/detail/
recommendation) is new here, ported from report-batch5-nodes.js.
"""
from __future__ import annotations

from ..core.constants import LIMITS
from ..core.findings import make_finding
from ..core.graph import NodeDef
from ..core.util import js_num_str, js_round, num, safe
from ..india.aggregate_india_income import _annual_slice_agg
from . import constants as C
from . import us1_penalty_2210, us5_penalty_72t, us_full

T = C.US


def _bracket_tax(amount: float, slabs: list) -> float:
    t, tax, prev = max(0.0, amount), 0.0, 0.0
    for cap, rate in slabs:
        if t > prev:
            tax += (min(t, cap) - prev) * rate
            prev = cap
        else:
            break
    return tax


def _bracket_breakdown(amount: float, slabs: list) -> list[dict]:
    t, prev, rows = max(0.0, amount), 0.0, []
    for cap, rate in slabs:
        if t > prev:
            taxable = min(t, cap) - prev
            rows.append({"from": prev, "to": cap, "rate": rate, "taxable": taxable, "tax": taxable * rate})
            prev = cap
        else:
            break
    return rows


# ---- AGG-9: aggregateEquityComp, port of findings-batch5-nodes.js. --------
def _equity_comp_result(d, ctx):
    ec = d["equityCompRaw"]
    rsu_income_usd = 0.0
    for r in safe(ec, "rsu_vestings", []) or []:
        rsu_income_usd += num(r.get("gross_income_usd")) if r.get("gross_income_usd") is not None else num(r.get("fmv_at_vest_usd")) * num(r.get("shares_vested"))
    nso_income_usd = 0.0
    for n in safe(ec, "nso_exercises", []) or []:
        nso_income_usd += num(n.get("ordinary_income_recognized_usd")) if n.get("ordinary_income_recognized_usd") is not None else max(0.0, (num(n.get("fmv_at_exercise_usd")) - num(n.get("strike_price_usd"))) * num(n.get("shares_exercised")))
    iso_count = len(safe(ec, "iso_exercises", []) or [])
    esop_events = d["esopEventsRaw"]
    esop_from_events = sum(num(e.get("perquisite_value_inr")) for e in esop_events)
    esop_perquisite_inr = esop_from_events if len(esop_events) > 0 else d["esopPerquisiteInrRaw"]
    return {
        "hasUsEquityComp": safe(ec, "has_equity_comp", False) is True or rsu_income_usd > 0 or nso_income_usd > 0 or iso_count > 0,
        "rsuIncomeUsd": rsu_income_usd, "nsoIncomeUsd": nso_income_usd, "isoExerciseCount": iso_count,
        "esopPerquisiteInr": esop_perquisite_inr, "esopGrantEvents": esop_events,
    }


# ---- TAX-9: computeUsStateTax, port of findings-batch5-nodes.js. ----------
def _us_state_tax_result(d, ctx):
    is_nra = d["treatyFiles1040nrRaw"] and not d["s6013hElection"]
    if d["usEntityKind"] != "individual" or is_nra:
        return None
    sr = d["stateResidencyRaw"]
    state_code = sr["domicileDec31"] or sr["primaryState"] or sr["domicileJan1"]
    if not state_code:
        return None
    if C.NO_INDIVIDUAL_INCOME_TAX_STATES.get(state_code):
        return {
            "state": state_code, "stateName": C.STATE_NAMES.get(state_code, state_code), "formName": None,
            "filingStatus": "mfj" if d["usFilingStatusRaw"] == "mfj" else "single",
            "noIncomeTax": True, "agiUsd": d["usTaxResult"]["agiUsd"], "standardDeductionUsd": 0, "dependentExemptionUsd": 0, "five29DeductionUsd": 0,
            "taxableIncomeUsd": 0, "bracketTaxUsd": 0, "bracketBreakdown": [], "surchargeUsd": 0, "surchargeLabel": None,
            "exemptionCreditUsd": 0, "dependentCreditUsd": 0, "totalTaxUsd": 0, "effectiveRate": 0,
            "basis": f"{C.STATE_NAMES.get(state_code, state_code)} has no individual income tax.",
        }
    st = C.US_STATES_EXT.get(state_code)
    if not st:
        return None
    status = "mfj" if d["usFilingStatusRaw"] == "mfj" else "single"
    brackets = st["BRACKETS"][status]
    standard_deduction_usd = st["STD_DEDUCTION"][status]
    dependents = d["dedUs"].get("dependents") or 0
    dependent_exemption_usd = (st.get("DEPENDENT_EXEMPTION_USD") or 0) * dependents
    # 529 state tax deduction (task #45 follow-up): only the RESIDENT
    # state's own plan qualifies -- compared against the state the taxpayer
    # actually funded, not assumed to match residency. NJ additionally
    # gates on a gross-income cap (CA has no FIVE29_DEDUCTION_MAX_USD key
    # at all -- no deduction exists). Mirrors findings-batch5-nodes.js exactly.
    five29_state_matches = bool(d["dedUs"].get("funded529Plan")) and d["dedUs"].get("five29StateDeductionState") and \
        str(d["dedUs"]["five29StateDeductionState"]).upper() == state_code
    five29_income_cap = st.get("FIVE29_DEDUCTION_INCOME_CAP_USD")
    five29_income_ok = five29_income_cap is None or d["usTaxResult"]["agiUsd"] <= five29_income_cap
    five29_cap_table = st.get("FIVE29_DEDUCTION_MAX_USD")
    five29_cap_usd = (five29_cap_table.get(status, five29_cap_table.get("single")) if five29_cap_table else 0) or 0
    five29_deduction_usd = min(d["dedUs"].get("five29ContributionsUsd") or 0, five29_cap_usd) if (five29_state_matches and five29_income_ok) else 0.0
    taxable_income_usd = max(0.0, d["usTaxResult"]["agiUsd"] - standard_deduction_usd - dependent_exemption_usd - five29_deduction_usd)
    bracket_tax_usd = _bracket_tax(taxable_income_usd, brackets)
    bracket_breakdown_rows = _bracket_breakdown(taxable_income_usd, brackets)
    surcharge_usd = 0.0
    if st.get("SURCHARGE_THRESHOLD_USD") is not None and taxable_income_usd > st["SURCHARGE_THRESHOLD_USD"]:
        surcharge_usd = (taxable_income_usd - st["SURCHARGE_THRESHOLD_USD"]) * st["SURCHARGE_RATE"]
    exemption_credit_usd = (st.get("EXEMPTION_CREDIT_USD") or {}).get(status, 0)
    dependent_credit_usd = (st.get("DEPENDENT_CREDIT_USD") or 0) * dependents
    total_tax_usd = max(0.0, js_round(bracket_tax_usd + surcharge_usd - exemption_credit_usd - dependent_credit_usd))
    return {
        "state": state_code, "stateName": st["NAME"], "formName": st["FORM_NAME"], "filingStatus": status,
        "noIncomeTax": False,
        "agiUsd": d["usTaxResult"]["agiUsd"], "standardDeductionUsd": standard_deduction_usd, "dependentExemptionUsd": dependent_exemption_usd,
        "standardDeductionLabel": st.get("STD_DEDUCTION_LABEL") or "standard deduction",
        "dependentExemptionLabel": st.get("DEPENDENT_EXEMPTION_LABEL") or (st["NAME"] + " dependent exemption"),
        "five29DeductionUsd": five29_deduction_usd,
        "taxableIncomeUsd": taxable_income_usd, "bracketTaxUsd": bracket_tax_usd, "bracketBreakdown": bracket_breakdown_rows,
        "surchargeUsd": surcharge_usd, "surchargeLabel": st.get("SURCHARGE_LABEL"),
        "exemptionCreditUsd": exemption_credit_usd, "dependentCreditUsd": dependent_credit_usd,
        "totalTaxUsd": total_tax_usd, "effectiveRate": (total_tax_usd / d["usTaxResult"]["agiUsd"]) if d["usTaxResult"]["agiUsd"] > 0 else 0,
        "basis": "TY2025 rates (returns filed 2026); full-year resident, worldwide income via federal AGI, no foreign tax credit against state tax.",
    }


def _gauge(value_usd: float, limit_usd: float) -> dict:
    pct = (value_usd / limit_usd) if limit_usd > 0 else 0
    status = "breached" if pct >= 1 else ("approaching" if pct >= 0.8 else "ok")
    return {"value": value_usd, "limit": limit_usd, "pct": pct, "status": status}


def _nra_fdap_detail(d, ctx):
    claim = (d["nraRaw"]["treatyRateClaims"] or [None])[0] if d["nraRaw"]["treatyRateClaims"] else None
    # Two distinct "claimed rate" readings, matching the engine's own two
    # separate variables of the same name in different scopes: the RAW
    # Layer 1 value (e.g. 15, for display) vs. the NORMALIZED 0-1 fraction
    # computeNraTax actually computes with (claim.rate / 100).
    raw_claimed_rate_pct = claim["rate"] if (claim and claim.get("rate") is not None) else None
    claimed_rate_fraction = max(0.0, min(1.0, num(claim["rate"]) / 100)) if (claim and claim.get("rate") is not None) else None
    w8ben_on_file = d["nraRaw"]["submittedW8ben"] is True
    fdap_rate = claimed_rate_fraction if (w8ben_on_file and claimed_rate_fraction is not None) else 0.30
    fdap_usd = d["nraFdapIncomeUsdRaw"]
    gap_usd = fdap_usd * (0.30 - claimed_rate_fraction) if (not w8ben_on_file and claimed_rate_fraction is not None and claimed_rate_fraction < 0.30) else 0
    return {
        "fdapUsd": fdap_usd, "fdapRate": fdap_rate, "claimedRate": raw_claimed_rate_pct, "w8benOnFile": w8ben_on_file,
        "fdapTaxUsd": fdap_usd * fdap_rate, "gapUsd": gap_usd,
        # Clamped percentage — the ROUTED value buildWithholdingSummary's
        # treatyRatePct actually reads, DIFFERENT from claimedRate above
        # (the raw unclamped Layer 1 value the nra_fdap_flat_rate finding's
        # own detail text reads instead) — both faithful ports of two
        # genuinely different engine variables with the same name in
        # different scopes, not a duplicate. An out-of-range claim.rate
        # (e.g. 395) previously passed through unclamped into treatyRatePct.
        "claimedRatePctClamped": (claimed_rate_fraction * 100) if claimed_rate_fraction is not None else None,
        "incomeType": (claim.get("income_type") if claim else None) or None,
    }


def _nra_derived_eci_fdap_result(d, ctx):
    """Independent re-derivation of the ECI/FDAP split from
    aggregateUsIncomeResult (which folds in K-1/C-corp/partnership
    passthrough items, unlike the live form's own derivation), cross-checked
    against nraEciIncomeUsdRaw/nraFdapIncomeUsdRaw — layer1_us.html's OWN
    client-side derivation (updateNraFields(), ~line 11507), which sums only
    W-2 wages + self-employment for ECI and direct interest/dividends/rental
    for FDAP. The two genuinely diverge whenever K-1 passive income, C-corp/
    partnership business income, or direct-source royalties are present —
    none of those reach the live form's own figure. This node does NOT
    override nraEciIncomeUsdRaw/nraFdapIncomeUsdRaw (those still drive the
    actual tax computed in ustax_full.py's _nra_tax_result) — it only powers
    the nra_eci_fdap_classification_check finding below.

    Rental income is bucketed as FDAP here (the §871(a) statutory default,
    absent a §871(d) net-basis election this engine has no field for) —
    matching layer1_us.html's own classification, but NOT the different ECI
    definition ustax_full.py's own _scale_nonresident_inc (dual-status-year
    path) uses, which folds rental into ECI. That's a pre-existing
    inconsistency between two NRA-adjacent code paths — noted here rather
    than silently reconciled, since fixing it would change the dual-status
    combined tax figure, a different surface than this finding.
    """
    agg = d["aggregateUsIncomeResult"]
    derived_eci_usd = agg["wages"]["usd"] + agg["businessUs"]["usd"]
    derived_fdap_usd = agg["interestUs"]["usd"] + agg["ordinaryDividendsUs"]["usd"] + agg["rentalUs"]["usd"] + d["royaltiesDirectUsSourceUsdRaw"]
    return {
        "derivedEciUsd": derived_eci_usd, "derivedFdapUsd": derived_fdap_usd,
        "derivedTotalUsd": derived_eci_usd + derived_fdap_usd,
    }


def _fmt(n: float) -> str:
    return f"${js_round(n):,}"


NODES = {
    # ---- 4c4a. NRA raw facts (findings-batch3-nodes.js) ----------------------
    "nraRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "treatyRateClaims": safe(ctx.get("us"), "nra_specific.treaty_rate_claims", []) or [],
            "submittedW8ben": safe(ctx.get("us"), "nra_specific.submitted_w8ben", False) is True,
            "usRealPropertyDisposed": safe(ctx.get("us"), "nra_specific.us_real_property_disposed", False) is True,
            "firptaWithholdingUsd": num(safe(ctx.get("us"), "nra_specific.firpta_withholding_usd", 0)),
        },
        layer1_fields=(
            "us.nra_specific.treaty_rate_claims", "us.nra_specific.submitted_w8ben",
            "us.nra_specific.us_real_property_disposed", "us.nra_specific.firpta_withholding_usd",
        ),
    ),
    "foreignGiftsRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "receivedAbove100k": safe(ctx.get("us"), "foreign_gifts_and_trusts.received_foreign_gifts_above_100k", False) is True,
            "isTrustBeneficiary": safe(ctx.get("us"), "foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust", False) is True,
            "receivedFromCoveredExpatriate": safe(ctx.get("us"), "foreign_gifts_and_trusts.received_gift_from_covered_expatriate", False) is True,
        },
        layer1_fields=(
            "us.foreign_gifts_and_trusts.received_foreign_gifts_above_100k",
            "us.foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust",
            "us.foreign_gifts_and_trusts.received_gift_from_covered_expatriate",
        ),
    ),

    # ---- 4h. nra_fdap_flat_rate detail (findings-batch4-nodes.js) -----------
    "nraFdapIncomeUsdRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "nra_specific.us_fdap_income_usd", 0)), layer1_fields=("us.nra_specific.us_fdap_income_usd",)),
    "nraEciIncomeUsdRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "nra_specific.us_eci_income_usd", 0)), layer1_fields=("us.nra_specific.us_eci_income_usd",)),
    "nraFdapDetail": NodeDef(deps=("nraRaw", "nraFdapIncomeUsdRaw"), compute=_nra_fdap_detail),
    "royaltiesDirectUsSourceUsdRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "income_us_source.royalties_direct_us_source_usd", 0)), layer1_fields=("us.income_us_source.royalties_direct_us_source_usd",)),
    "nraDerivedEciFdapResult": NodeDef(deps=("aggregateUsIncomeResult", "royaltiesDirectUsSourceUsdRaw"), compute=_nra_derived_eci_fdap_result),

    # ---- AGG-9 / TAX-9 (findings-batch5-nodes.js) -----------------------------
    "equityCompRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "equity_compensation", {}) or {}, layer1_fields=("us.equity_compensation",)),
    # findings-batch5-nodes.js's esop nodes read d.diAgg — India's own
    # domestic-income aggregate (an ESOP granted by an Indian employer,
    # perquisite valued in INR), a deliberate cross-read of India's raw
    # income aggregate for a US-domain finding about the SAME equity award,
    # not a crossborder-result dependency. Same cross-domain-read situation
    # as limitsRawExtra's own lrsRemittedInr above: reads the quarterly-
    # merge-aware `_annual_slice_agg(ctx)` helper directly (pure function,
    # no registry dependency), not a "diAgg" node — us_full.build() never
    # pulls in aggregate_india_income.py, so this file's own build() must
    # stay usable in isolation. A previous version of this leaf read
    # `ctx["india"]["domestic_income"]` directly, bypassing the quarterly
    # merge entirely — invisible on every real fixture/small fuzz-corpus
    # profile (none had `quarters` AND an esop event living only inside a
    # quarter), only surfaced once the fuzz corpus was scaled up to 300
    # cases.
    "esopEventsRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(_annual_slice_agg(ctx), "domestic_income.salary.esop_perquisite_events", []) or []),
    "esopPerquisiteInrRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(_annual_slice_agg(ctx), "domestic_income.salary.esop_perquisite_inr", 0))),
    "equityCompResult": NodeDef(deps=("equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw"), compute=_equity_comp_result),

    "stateResidencyRaw": NodeDef(
        deps=(), compute=lambda d, ctx: {
            "domicileJan1": safe(ctx.get("us"), "state_residency.jan_1_domicile_state", None),
            "domicileDec31": safe(ctx.get("us"), "state_residency.dec_31_domicile_state", None),
            "primaryState": safe(ctx.get("us"), "state_residency.primary_state_of_residence", None),
            "footprint": safe(ctx.get("us"), "state_residency.total_states_footprint", []) or [],
            "movedStates": safe(ctx.get("us"), "state_residency.moved_states_this_year", False) is True,
            "caSafeHarbor": safe(ctx.get("us"), "state_residency.ca_safe_harbor_employment_contract", False) is True,
            "caRetainsTies": safe(ctx.get("us"), "state_residency.ca_retains_property_or_voter_reg", False) is True,
            # layer1_us.html's live statutory-residency tracker
            # (renderStatutoryCheckers()/updateFootprintDetails()) stores
            # these under the generic per-state state_residency.
            # footprint_details[code].{days,ppa} object (shared by NY/NJ/CT/
            # MA/etc.) -- NOT the flat ny_actual_days_present/
            # ny_permanent_place_of_abode field names this used to read,
            # which nothing in the live form has ever written.
            "nyDaysPresent": num(safe(ctx.get("us"), "state_residency.footprint_details.NY.days", 0)) or num(safe(ctx.get("us"), "state_residency.ny_actual_days_present", 0)),
            "nyPermanentAbode": safe(ctx.get("us"), "state_residency.footprint_details.NY.ppa", False) is True or safe(ctx.get("us"), "state_residency.ny_permanent_place_of_abode", False) is True,
            "ny548DayRule": safe(ctx.get("us"), "state_residency.ny_548_day_rule", False) is True,
        },
        layer1_fields=(
            "us.state_residency.jan_1_domicile_state", "us.state_residency.dec_31_domicile_state",
            "us.state_residency.primary_state_of_residence", "us.state_residency.total_states_footprint",
            "us.state_residency.moved_states_this_year", "us.state_residency.ca_safe_harbor_employment_contract",
            "us.state_residency.ca_retains_property_or_voter_reg", "us.state_residency.ny_actual_days_present",
            "us.state_residency.ny_permanent_place_of_abode", "us.state_residency.ny_548_day_rule",
        ),
    ),
    "usStateTaxResult": NodeDef(deps=("usEntityKind", "treatyFiles1040nrRaw", "s6013hElection", "stateResidencyRaw", "usFilingStatusRaw", "dedUs", "usTaxResult"), compute=_us_state_tax_result),

    # lrsRemittedInr's primary source (the quarterly-merge-aware annual
    # slice) is read via india/aggregate_india_income.py's pure
    # `_annual_slice_agg(ctx)` helper directly — NOT the "annualSliceAgg"
    # node itself, which isn't available in this file's own build() chain
    # (us_full.build() never pulls in aggregate_india_income.py, the same
    # cross-domain-read situation as this file's own diAggUs leaf above).
    "limitsRawExtra": NodeDef(
        deps=(), compute=lambda d, ctx: _limits_raw_extra(ctx),
        layer1_fields=(
            "india.lrs_outbound.total_lrs_remitted_this_fy_inr",
            "us.profile.trump_accounts_opened", "us.profile.trump_accounts_num_children",
            "us.profile.trump_accounts_children_born_2025_2028", "us.profile.trump_accounts_total_contributions_usd",
            "us.profile.trump_accounts_children",
        ),
    ),
}


def _limits_raw_extra(ctx):
    # 26 U.S.C. 530A's $5,000/year cap applies PER CHILD, not as a family
    # total -- when a per-child breakdown is on file, derive the aggregate
    # fields from it (for the legacy family-wide gauge/display) AND surface
    # the single largest child contribution so the finding below can catch
    # an individual over-contribution that a family-wide total can hide.
    # Falls back to the old flat fields for data saved before this array
    # existed. Port of findings-batch5-nodes.js's NODES.limitsRawExtra.
    trump_children_raw = safe(ctx.get("us"), "profile.trump_accounts_children", None)
    trump_children = trump_children_raw if isinstance(trump_children_raw, list) else None
    return {
        "lrsRemittedInr": num(safe(_annual_slice_agg(ctx), "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)) or num(safe(ctx.get("india"), "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
        "trumpAccountsOpened": safe(ctx.get("us"), "profile.trump_accounts_opened", False) is True,
        "trumpAccountsNumChildren": len(trump_children) if trump_children is not None else num(safe(ctx.get("us"), "profile.trump_accounts_num_children", 0)),
        "trumpAccountsSeedEligibleChildren": (
            sum(1 for c in trump_children if isinstance(c, dict) and c.get("born_2025_2028") is True) if trump_children is not None
            else num(safe(ctx.get("us"), "profile.trump_accounts_children_born_2025_2028", 0))
        ),
        "trumpAccountsContributionsUsd": (
            sum(num(c.get("contribution_usd") if isinstance(c, dict) else 0) for c in trump_children) if trump_children is not None
            else num(safe(ctx.get("us"), "profile.trump_accounts_total_contributions_usd", 0))
        ),
        "trumpAccountsMaxChildContributionUsd": (
            max((num(c.get("contribution_usd") if isinstance(c, dict) else 0) for c in trump_children), default=0.0) if trump_children is not None
            else None
        ),
        "trumpAccountsHasPerChildData": trump_children is not None,
    }


def _findings_us_result(d, ctx):
    findings = []

    # -- 4c. AMT BITES (findings-nodes.js, conflicts.js:325-334) --------------
    if d["usTaxResult"]["amtUsd"] > 0:
        findings.append(make_finding(
            "amt_applies", "warning", "credit",
            f"US Alternative Minimum Tax applies (+{_fmt(d['usTaxResult']['amtUsd'])})",
            "This is a US-only tax (IRC §55) — India has no AMT-equivalent regime. The US tentative minimum tax exceeds the "
            f"regular US tax, so an additional {_fmt(d['usTaxResult']['amtUsd'])}"
            " is added to the US liability. Common drivers: a large standard-deduction / SALT add-back, private-activity-bond interest, or an ISO exercise.",
            "WISING computes the parallel AMT (Form 6251) and includes it in the US tax total above. Review ISO exercise timing and the state-tax add-back; AMT paid on deferral items can generate a Minimum Tax Credit (Form 8801) usable in later years.",
            d["usTaxResult"]["amtUsd"], ["§55", "Form 6251", "Form 8801"],
        ))

    # -- 10b. FOREIGN GIFTS / TRUSTS — FORM 3520 (findings-batch3-nodes.js, conflicts.js:1413-1444) --
    fg = d["foreignGiftsRaw"]
    if fg["receivedAbove100k"] or fg["isTrustBeneficiary"]:
        gift_reasons = []
        if fg["receivedAbove100k"]:
            gift_reasons.append("gift(s) from a foreign person exceeding $100,000 this year")
        if fg["isTrustBeneficiary"]:
            gift_reasons.append("US beneficiary of a foreign trust")
        findings.append(make_finding(
            "foreign_gift_3520", "warning", "document",
            "Form 3520 required — foreign gift / trust reporting (no tax due, but real penalty exposure)",
            "Layer 1 records " + " and ".join(gift_reasons) + ". Form 3520 is an INFORMATION return — there is no tax on a bona "
            "fide gift — but the failure-to-file penalty is up to 25% of the unreported amount, and it is one of the most "
            "commonly missed filings precisely because no tax is owed to prompt it.",
            "File Form 3520 (and 3520-A if a foreign trust with a US owner) by the return due date, even where no tax results. "
            "Confirm the gift is genuinely a gift and not disguised compensation or a loan, and aggregate gifts from related donors.",
            0, ["Form 3520", "Form 3520-A"],
        ))
    if fg["receivedFromCoveredExpatriate"]:
        findings.append(make_finding(
            "covered_expat_gift_tax", "critical", "credit",
            "§2801 covered-expatriate gift/bequest tax may apply",
            "A gift or bequest was received from someone Layer 1 flags as a covered expatriate. Unlike an ordinary foreign gift, "
            "§2801 imposes a special transfer tax on the US RECIPIENT, at the highest gift/estate tax rate, on the value received "
            "from a covered expatriate — this is a real tax liability, not just an information filing.",
            "Confirm the donor's covered-expatriate status and compute the §2801 tax on Form 708, finalized January 2026 (TD 10027) "
            "with the first return due 15 Jul 2027 for gifts/bequests received in calendar 2025; this is separate from and in "
            "addition to the Form 3520 reporting above.",
            0, ["§2801", "Form 708", "Covered expatriate"],
        ))

    # -- 4i. NRA TREATY RATE CLAIMED WITHOUT W-8BEN (findings-batch3-nodes.js, conflicts.js:1037-1047) --
    nra = d["nraRaw"]
    if len(nra["treatyRateClaims"] or []) > 0 and not nra["submittedW8ben"]:
        findings.append(make_finding(
            "nra_w8ben_missing", "critical", "treaty",
            "Treaty withholding rate claimed without Form W-8BEN on file",
            f"{len(nra['treatyRateClaims'])} treaty-rate claim(s) are recorded for US-source FDAP income, but Form W-8BEN "
            "(certifying foreign status and the treaty claim to the withholding agent) is not on file. Without it, the payer "
            "must withhold at the default 30% rather than the claimed treaty rate.",
            "File Form W-8BEN with each withholding agent to support the claimed treaty rate; without it, expect 30% "
            "withholding and a refund claim on the 1040-NR instead of correct withholding at source.",
            0, ["Form W-8BEN", "Treaty rate claim"],
        ))

    # -- 4j. FIRPTA (findings-batch3-nodes.js, conflicts.js:1049-1060) --------
    if nra["usRealPropertyDisposed"]:
        findings.append(make_finding(
            "firpta", "warning", "document",
            "FIRPTA withholding on US real property disposition",
            "A disposition of US real property by a foreign person is on file"
            + (f" with {_fmt(nra['firptaWithholdingUsd'])} withheld at closing" if nra["firptaWithholdingUsd"] > 0 else "")
            + ". FIRPTA generally requires the buyer to withhold 15% of the gross sale price (not the gain) at closing, "
            "regardless of the seller's actual tax liability on the transaction.",
            "File Form 8288-A/8288-B as applicable; if 15% of the gross price materially overstates the actual tax on the "
            "gain, apply for a withholding certificate (Form 8288-B) BEFORE closing to reduce it, and reconcile the balance on the 1040-NR.",
            nra["firptaWithholdingUsd"] or 0, ["FIRPTA", "Form 8288-A", "Form 8288-B"],
        ))

    # -- 4b. FEIE CLAIMED BUT NOT ELIGIBLE (findings-batch4-nodes.js, conflicts.js:303-323) --
    feie_res = d["usTaxResult"].get("feie")
    if feie_res and feie_res["claimed"] and not feie_res["eligible"]:
        findings.append(make_finding(
            "feie_ineligible", "critical", "credit",
            "FEIE claimed but the taxpayer does not qualify",
            f"Form 2555 exclusion was claimed in Layer 1, but the §911 tests fail: {'; '.join(feie_res['reasons'])}"
            ". FEIE is only available to someone living abroad — a US-based taxpayer with foreign income must use the Foreign Tax Credit instead. The engine has computed US tax WITHOUT the exclusion.",
            "Remove the FEIE claim and rely on Form 1116 FTC for the Indian taxes (usually better anyway when Indian rates exceed US rates). If the taxpayer genuinely lives abroad, complete the tax-home and presence-test fields in the US Layer 1 so the exclusion can be applied.",
            d["feie"]["amountClaimedUsd"] or 0, ["§911", "Form 2555", "Form 1116"],
        ))
    elif feie_res and feie_res["claimed"] and feie_res["eligible"] and feie_res["appliedUsd"] > 0:
        findings.append(make_finding(
            "feie_applied", "info", "credit",
            f"FEIE applied — {_fmt(feie_res['appliedUsd'])} of foreign wages excluded",
            f"The §911 tests are met (foreign tax home + {'presence test' if feie_res['testMet'] else ''}"
            f"), so {_fmt(feie_res['appliedUsd'])} of foreign earned income is excluded from US tax. The excluded income and its share of Indian tax were removed from the FTC computation (no-double-dip).",
            "Compare FEIE vs full FTC annually — for high-tax countries like India, revoking FEIE in favour of FTC can save tax, but a revocation locks you out of FEIE for 5 years.",
            0, ["Form 2555", "§911(d)(6)"],
        ))

    # -- 4h. NRA (1040-NR): FDAP SHOULD BE FLAT-RATE (findings-batch4-nodes.js, conflicts.js:1015-1035) --
    is_routed_to_nra_for_fdap = d["usEntityKind"] not in ("ccorp", "scorp", "partnership", "trust") and d["treatyFiles1040nrRaw"] and not d["s6013hElection"]
    if d["treatyFiles1040nrRaw"] and not d["s6013hElection"] and d["nraFdapDetail"]["fdapUsd"] > 0:
        nra_detail = d["nraFdapDetail"]
        findings.append(make_finding(
            "nra_fdap_flat_rate", "info", "credit",
            "1040-NR: FDAP taxed flat" + (f" ({js_round(nra_detail['fdapRate'] * 100)}%)" if is_routed_to_nra_for_fdap else "") + ", ECI at graduated rates",
            f"{_fmt(nra_detail['fdapUsd'])} of FDAP income (interest/dividends/rents not effectively connected with a US trade or "
            "business) is taxed flat" + (f" at the claimed {nra_detail['claimedRate']}% treaty rate" if nra_detail["claimedRate"] else " at the 30% statutory rate (no treaty rate on file)")
            + f" with no deductions (Schedule NEC), separate from {_fmt(d['nraEciIncomeUsdRaw'])} of ECI taxed at graduated brackets"
            " with itemized deductions only (NRAs generally can't claim the standard deduction).",
            "Confirm the treaty rate claimed on Form W-8BEN/1040-NR matches the rate used here"
            + ("" if nra_detail["claimedRate"] else " — no treaty rate is on file, so the default 30% was applied; check whether Article 11/12 of the DTAA reduces it") + ".",
            0, ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"],
        ))

    # -- 4c3. FORM 3921 — ISO INFORMATION RETURN (findings-batch5-nodes.js, conflicts.js:561-571) --
    eq = d["equityCompResult"]
    if eq["isoExerciseCount"] > 0:
        findings.append(make_finding(
            "iso_3921", "info", "document",
            "ISO exercise(s) on file — employer owes you Form 3921",
            f"{eq['isoExerciseCount']} incentive stock option exercise(s) recorded this year. The employer is "
            "required to furnish Form 3921 (one per exercise) by January 31 of the following year, reporting the grant/exercise "
            "dates, exercise price, and FMV at exercise — the same figures already driving the AMT preference computed above.",
            "Confirm Form 3921 was received from the employer for each exercise and that its FMV/exercise-price figures match "
            "what's on file here before relying on the AMT number.",
            0, ["Form 3921", "§6039"],
        ))

    # -- 4c6. STATE INCOME TAX (findings-batch5-nodes.js, conflicts.js:607-631) --
    st = d["usStateTaxResult"]
    if st and st["totalTaxUsd"] > 0:
        findings.append(make_finding(
            "state_income_tax", "warning", "credit",
            f"{st['stateName']} state income tax: {_fmt(st['totalTaxUsd'])} ({st['formName']})",
            f"{st['stateName']} taxes a full-year resident's WORLDWIDE income, including Indian-source income already reported "
            f"on the federal and Indian returns — computed here as {_fmt(st['taxableIncomeUsd'])} of state taxable income "
            f"(federal AGI {_fmt(st['agiUsd'])} less the {st['stateName']} standard deduction"
            + (" and dependent exemption" if st["dependentExemptionUsd"] > 0 else "") + f") at {st['stateName']}'s own bracket rates"
            + (f", plus {_fmt(st['surchargeUsd'])} ({st['surchargeLabel']})" if st["surchargeUsd"] > 0 else "")
            + (f", less {_fmt(st['exemptionCreditUsd'] + st['dependentCreditUsd'])} of personal/dependent credits" if st["exemptionCreditUsd"] + st["dependentCreditUsd"] > 0 else "")
            + f". Neither the Foreign Tax Credit computed above nor any DTAA relief applies here — {st['stateName']}"
            + " is not a party to the India-US treaty and " + ("grants no credit for tax paid to a foreign country at all." if st["state"] == "CA" else "does not treat Indian tax as a creditable state-level offset."),
            f"File {st['formName']} alongside the federal return. This is a full-year-resident, TY2025-rates estimate — it does not "
            f"split state-source income for a part-year or nonresident allocation, does not model {st['stateName']}"
            "'s own AGI addition/subtraction adjustments beyond the standard deduction"
            + ("/dependent exemption" if st["dependentExemptionUsd"] > 0 else "") + ", and (for California) does not include the local-jurisdiction "
            "SDI/VPDI payroll tax. Treat as directional, not filing-ready.",
            st["totalTaxUsd"], [st["formName"], st["stateName"] + " residency"],
        ))

    # -- 12a. TRUMP ACCOUNT (§530A) MONITORING (findings-batch5-nodes.js, conflicts.js:1470-1504) --
    lr = d["limitsRawExtra"]
    if lr["trumpAccountsOpened"]:
        ta_children = max(1, lr["trumpAccountsNumChildren"] or 1)
        trump_acct = _gauge(lr["trumpAccountsContributionsUsd"], LIMITS["TRUMP_ACCOUNT_ANNUAL_CAP_USD"] * ta_children)
        ta_seed_eligible = lr["trumpAccountsSeedEligibleChildren"] or 0
        ta_seed_usd = LIMITS["TRUMP_ACCOUNT_FEDERAL_SEED_USD"]
        seed_note = (
            f"A ${ta_seed_usd:,} one-time federal seed contribution applies to the {js_num_str(ta_seed_eligible)} "
            "child(ren) born 2025-2028 — separate from, and not counted against, the $5,000/year cap."
            if ta_seed_eligible > 0 else
            "No federal seed applies — that one-time $1,000 contribution is only for children born 2025-2028."
        )
        # With a real per-child breakdown, check each child's own contribution
        # against the cap directly -- a family total can stay under N x $5,000
        # while one specific child's account is individually over the limit
        # (e.g. two kids, $6,000 total split $5,500/$500: the $6,000 aggregate
        # is under the $10,000 family-wide check, but the first child alone
        # already breached their own $5,000 cap).
        per_child_breach = lr["trumpAccountsHasPerChildData"] and lr["trumpAccountsMaxChildContributionUsd"] > LIMITS["TRUMP_ACCOUNT_ANNUAL_CAP_USD"]
        if per_child_breach:
            findings.append(make_finding(
                "trump_account_contribution_limit", "warning", "limit",
                "Trump Account (§530A) contribution cap exceeded for at least one child",
                f"At least one child's account received {_fmt(lr['trumpAccountsMaxChildContributionUsd'])} this year, which on its own "
                "exceeds the $5,000/child/year cap (combined across all contributors — parents, family, employer all draw from the same "
                f"limit), independent of the family-wide total of {_fmt(trump_acct['value'])} across {js_num_str(ta_children)} child(ren). {seed_note}",
                "Excess contributions are not automatically rejected by the custodian in every case — verify that specific child's account "
                "against all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
                0, ["§530A", "Trump Account"],
            ))
        elif trump_acct["status"] == "breached":
            findings.append(make_finding(
                "trump_account_contribution_limit", "warning", "limit",
                "Trump Account (§530A) contribution cap exceeded",
                f"Contributions of {_fmt(trump_acct['value'])} across {js_num_str(ta_children)}"
                " child(ren) exceed the $5,000/child/year cap (combined across all contributors — parents, family, employer all draw "
                f"from the same limit). {seed_note}",
                "Excess contributions are not automatically rejected by the custodian in every case — verify the aggregate against "
                "all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
                0, ["§530A", "Trump Account"],
            ))
        else:
            findings.append(make_finding(
                "trump_account_contribution_limit", "info", "limit",
                "Trump Account (§530A) in use",
                f"Contributions of {_fmt(trump_acct['value'])} this year are within the $5,000/child/year cap. {seed_note}"
                " Contributions are nondeductible; account growth is tax-deferred until withdrawal, and the account converts to a "
                "Traditional IRA when the beneficiary turns 18.",
                "No action needed while under the cap — just confirm contributions are tracked in aggregate across every contributor, "
                "not just this taxpayer's own deposits.",
                0, ["§530A", "Trump Account"],
            ))

    # -- underpayment_2210 (us1-nodes.js + report-batch5-nodes.js, conflicts.js:511-521) --
    if d["us1ShouldFire"]:
        penalty_usd = d["us2210PenaltyUsd"]
        findings.append(make_finding(
            "underpayment_2210", "warning", "credit",
            f"US estimated-tax underpayment penalty — Form 2210 ({_fmt(penalty_usd)} estimated)",
            f"Withholding + estimated payments ({_fmt(d['usPaidTotalUsd'])}) fall short of both safe harbors: 90% of this year's "
            f"tax ({_fmt(d['usCurrentHarborUsd'])}) and "
            + (f"{js_round(d['usPriorHarborPct'] * 100)}% of last year's tax ({_fmt(d['usPriorHarborUsd'])})" if d["usPriorHarborUsd"] is not None else "the prior-year safe harbor (last year's total tax was never entered, so only the current-year harbor could be checked)")
            + f", with a balance due over the $1,000 de-minimis. Estimated penalty (simplified regular method, equal quarterly "
            f"installments, withholding spread evenly, no cross-quarter netting): {_fmt(penalty_usd)}.",
            "Confirm against the real Form 2210 (it can use the Annualized Income Installment Method for uneven income, which "
            "this estimate does not model, and could produce a lower number). Paying the shortfall now stops further accrual.",
            max(0.0, penalty_usd), ["Form 2210", "§6654"],
        ))

    # -- early_withdrawal_penalty_72t (us5-nodes.js + report-batch5-nodes.js, conflicts.js:549-557) --
    if d["us5ShouldFire"]:
        findings.append(make_finding(
            "early_withdrawal_penalty_72t", "warning", "credit",
            f"§72(t) 10% early-withdrawal penalty on IRA/401(k) distributions ({_fmt(d['penalty72tUsd'])})",
            f"{_fmt(d['earlyDistUsd'])} of IRA/401(k) distributions are on file for a taxpayer age {d['ageAtYearEndUs']}"
            f" at year-end — under the 59½ threshold. Absent a statutory exception, §72(t) adds a flat 10% additional tax ({_fmt(d['penalty72tUsd'])}"
            ") on top of ordinary income tax already computed on this same income.",
            "Confirm whether a real exception applies (death, disability, SEPP under §72(t)(2)(A)(iv), first $10,000 for a "
            "first-time home purchase, higher education, medical expenses over 7.5% of AGI, qualified birth/adoption up to "
            "$5,000) — none of these are captured by Layer 1 today, so this assumes the full 10% applies until confirmed otherwise.",
            d["penalty72tUsd"], ["§72(t)", "Form 5329"],
        ))

    return findings


# ---- residency-consistency (US branch only) — port of residency-nodes.js's
# residencyConsistencyFindings (US-side branch). India branch lives in
# india/findings.py. --------------------------------------------------------
def _us_residency_consistency_finding(d, ctx):
    if d["usEntityKindRaw"] == "individual":
        if not d["usIsCitizenRaw"] and not d["usHasGreenCardRaw"]:
            if d["usDaysCurrentYearRaw"] >= 183 and d["usSptMetRaw"] is False:
                return [make_finding(
                    "residency_status_understated_us", "info", "residency",
                    f"US Substantial Presence Test may be understated — {js_num_str(d['usDaysCurrentYearRaw'])} days present but SPT marked not met",
                    f"Layer 1 records {js_num_str(d['usDaysCurrentYearRaw'])} days of physical presence in the US this year — at or above the "
                    "183-day figure IRC 7701(b)(3)'s weighted 3-year sum reaches from current-year days alone (full weight, regardless "
                    "of the prior two years) — yet spt_test_met is recorded false. Two narrow exception categories exist, confirmed "
                    "against Layer 1 US's own SPT calculation (layer1_us.html): 'exempt individual' status (F/J/M/Q student/trainee "
                    "visas within their exempt years, foreign-government-related individuals, charitable-event athletes) excludes "
                    "ALL days from the SPT count; separately, specific days can be excluded even for a non-exempt individual (e.g. a "
                    "medical-condition exception). This engine does not model either, so this flag cannot rule them out — verify "
                    "before assuming error.",
                    "Confirm exempt-individual status or a day-exclusion claim doesn't apply before correcting "
                    "spt_test_met — if neither does, this looks like a wizard or data-entry error.",
                    0, ["IRC 7701(b)(3)"],
                )]
            elif d["usDaysCurrentYearRaw"] < 31 and d["usSptMetRaw"] is True:
                return [make_finding(
                    "residency_status_overstated_us", "warning", "residency",
                    f"US Substantial Presence Test may be overstated — only {js_num_str(d['usDaysCurrentYearRaw'])} days present but SPT marked met",
                    f"Layer 1 records only {js_num_str(d['usDaysCurrentYearRaw'])} days of physical presence in the US this year, but "
                    "spt_test_met is recorded true. IRC 7701(b)(3)(A) sets an unconditional floor: the SPT cannot be satisfied with "
                    "fewer than 31 days of presence in the current year, regardless of the weighted 3-year total. No known exception "
                    "(exempt-individual status and day-exclusions can only reduce the count, never add days back).",
                    "Re-run the Layer 1 US residency wizard, or verify us_days_current_year was entered for the correct "
                    "calendar year.",
                    0, ["IRC 7701(b)(3)(A)"],
                )]
        return []
    else:
        if d["usIncorporatedInUsRaw"] is True and d["usStatusRaw"] != "DOMESTIC_ENTITY":
            return [make_finding(
                "residency_status_understated_us_entity", "warning", "residency",
                "US entity residency may be understated — incorporated in the US but not marked Domestic Entity",
                f"Layer 1 records this entity as incorporated in the US (profile.incorporated_in_us = true), yet the recorded "
                f"final status is {d['usStatusRaw']}, not DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this "
                "field directly from incorporated_in_us with no other factor involved — no known exception.",
                "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status "
                "were entered consistently — this looks like a wizard or data-entry error.",
                0, [],
            )]
        elif d["usIncorporatedInUsRaw"] is False and d["usStatusRaw"] == "DOMESTIC_ENTITY":
            return [make_finding(
                "residency_status_overstated_us_entity", "warning", "residency",
                "US entity residency may be overstated — not incorporated in the US but marked Domestic Entity",
                "Layer 1 records this entity as NOT incorporated in the US (profile.incorporated_in_us = false), yet the "
                "recorded final status is DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this field directly from "
                "incorporated_in_us with no other factor involved — no known exception.",
                "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status "
                "were entered consistently — this looks like a wizard or data-entry error.",
                0, [],
            )]
        return []


NODES["findingsUsResult"] = NodeDef(
    deps=("usTaxResult", "foreignGiftsRaw", "nraRaw", "feie",
          "treatyFiles1040nrRaw", "s6013hElection", "nraFdapDetail", "nraEciIncomeUsdRaw", "usEntityKind",
          "equityCompResult", "usStateTaxResult", "limitsRawExtra",
          "us1ShouldFire", "us2210PenaltyUsd", "usPaidTotalUsd", "usCurrentHarborUsd", "usPriorHarborUsd", "usPriorHarborPct",
          "us5ShouldFire", "penalty72tUsd", "earlyDistUsd", "ageAtYearEndUs"),
    compute=_findings_us_result,
)
NODES["usResidencyConsistencyFinding"] = NodeDef(
    deps=("usEntityKindRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usDaysCurrentYearRaw", "usSptMetRaw", "usIncorporatedInUsRaw", "usStatusRaw"),
    compute=_us_residency_consistency_finding,
)

ALL_FINDING_IDS = (
    "amt_applies", "foreign_gift_3520", "covered_expat_gift_tax", "nra_w8ben_missing", "firpta",
    "feie_ineligible", "feie_applied", "nra_fdap_flat_rate", "iso_3921", "state_income_tax",
    "trump_account_contribution_limit", "underpayment_2210", "early_withdrawal_penalty_72t",
    "residency_status_understated_us", "residency_status_overstated_us",
    "residency_status_understated_us_entity", "residency_status_overstated_us_entity",
)


def build(base):
    r = us_full.build(base)
    # us1_penalty_2210.py/us5_penalty_72t.py are standalone files with their
    # own local routerJurisdiction/routerUsSignal/hasUsScope raw leaves
    # (same standalone-file convention as india/findings.py's IN-1 chain).
    # Both also define their OWN "shouldFire" node under the same id but
    # with different compute logic — aliased to us1ShouldFire/us5ShouldFire
    # BEFORE the generic merge, mirroring report-batch5-nodes.js's own
    # "shouldFire is the one genuine, dangerous exception" handling.
    r.register("us1ShouldFire", us1_penalty_2210.NODES["shouldFire"])
    r.register("us5ShouldFire", us5_penalty_72t.NODES["shouldFire"])
    for node_id, node in us1_penalty_2210.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)
    for node_id, node in us5_penalty_72t.NODES.items():
        if node_id != "shouldFire" and node_id not in r:
            r.register(node_id, node)
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
