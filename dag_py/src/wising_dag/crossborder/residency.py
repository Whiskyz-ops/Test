"""resolveResidency (DTAA Article 4 tie-breaker + dual-residency
resolution) + the residency-consistency findings. Port of
prototypes/graph-pilot/residency-nodes.js.

`deriveCompanyPoem`/`deriveIndiaDomesticStatus` are exported as plain
functions too (mirroring the JS module's own extra exports), used
elsewhere for `WISING.util`-equivalent purposes.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import js_num_str, num, safe


def derive_company_poem(cr: dict | None) -> bool:
    cr = cr or {}
    if cr.get("isActiveBusiness") is True:
        return cr.get("boardMeetingsOutsideIndia") is False
    if cr.get("keyManagementLocation"):
        loc = cr["keyManagementLocation"]
        if loc == "india":
            return True
        if loc == "outside_india":
            return False
        if loc == "mixed":
            in_count = cr.get("directorsInIndia") or 0
            out_count = cr.get("directorsOutsideIndia") or 0
            if in_count > out_count:
                return True
            if out_count > in_count:
                return False
            return cr.get("managementDelegatedOutsideIndia") is False
        return False
    return False


def derive_india_domestic_status(entity: str, f: dict) -> str:
    if entity == "company":
        is_indian = f.get("isIndianCompany")
        if is_indian is True:
            return "ROR"
        if is_indian is False:
            return "ROR" if derive_company_poem(f.get("company")) is True else "NR"
        return "ROR"  # unanswered defaults to treated-as-Indian-company, matching source exactly

    if entity in ("firm", "llp", "aop", "trust"):
        return "NR" if f.get("whollyOutside") is True else "ROR"

    if entity == "huf":
        if f.get("whollyOutside") is True:
            return "NR"
        return "RNOR" if (f.get("nr9") is True or f.get("d7729") is True) else "ROR"

    # INDIVIDUAL
    days, p4y, emp = f.get("days"), f.get("p4y"), f.get("emp") or "none"
    visit, nr9, d7729 = f.get("visit"), f.get("nr9"), f.get("d7729")
    inc15, ltac = f.get("inc15"), f.get("ltac") or False

    if days is not None and days >= 182:
        if nr9 is False and d7729 is False:
            return "ROR"
        if nr9 is True:
            return "RNOR"
        return "RNOR"
    elif days is not None and 60 <= days < 182:
        if p4y is True:
            if emp != "none":
                if inc15 is True and ltac is False:
                    return "RNOR"
                if inc15 is False:
                    return "NR"
                return "NR"
            elif visit is True:
                if days >= 120 and inc15 is True:
                    return "RNOR"
                if days >= 120 and inc15 is False:
                    return "NR"
                if days < 120 and inc15 is True and ltac is False:
                    return "RNOR"
                return "NR"
            else:
                if nr9 is False and d7729 is False:
                    return "ROR"
                if nr9 is True:
                    return "RNOR"
                return "RNOR"
        else:
            if inc15 is True and ltac is False:
                return "RNOR"
            return "NR"
    elif days is not None and days < 60:
        if inc15 is True and ltac is False:
            return "RNOR"
        return "NR"
    return "NR"  # days null/undefined — none of the three ranges match, matches the solver's own initial default


def _residency_result(d, ctx):
    in_status, us_status = d["indiaStatusRaw"], d["usStatusRaw"]

    india_resident = in_status in ("ROR", "RNOR")
    india_worldwide = in_status == "ROR"

    us_resident = d["usIsCitizenRaw"] or d["usHasGreenCardRaw"] or us_status == "RESIDENT_ALIEN" or d["usSptMetRaw"]
    us_worldwide = us_resident

    india_cedes = d["treatyIndiaResidenceRaw"] == "us" or d["treatyDtaaForcedNrRaw"] is True
    us_cedes = (d["treatyUsResidenceRaw"] == "india" or d["treatyFiles1040nrRaw"] is True) and not d["usIsCitizenRaw"]
    tie_break_winner = d["treatyIndiaResidenceRaw"] if d["treatyIndiaResidenceRaw"] != "none" else (d["treatyUsResidenceRaw"] if d["treatyUsResidenceRaw"] != "none" else None)
    if india_cedes:
        india_worldwide = False
    if us_cedes:
        us_worldwide = False

    return {
        "india": {"status": in_status, "isResident": india_resident, "worldwide": india_worldwide, "cedesViaTreaty": india_cedes},
        "us": {"status": us_status, "isResident": us_resident, "worldwide": us_worldwide, "isCitizen": d["usIsCitizenRaw"], "cedesViaTreaty": us_cedes},
        "dualResident": india_resident and us_resident,
        "tieBreakWinner": tie_break_winner,
        "worldwideOverlap": india_worldwide and us_worldwide,
    }


def _india_company_poem_derived(d, ctx):
    return derive_company_poem({
        "isActiveBusiness": d["companyIsActiveBusinessRaw"], "boardMeetingsOutsideIndia": d["companyBoardOutsideIndiaRaw"],
        "keyManagementLocation": d["companyKeyManagementLocationRaw"], "managementDelegatedOutsideIndia": d["companyManagementDelegatedOutsideRaw"],
        "directorsInIndia": d["companyDirectorsInIndiaRaw"], "directorsOutsideIndia": d["companyDirectorsOutsideIndiaRaw"],
    })


def _india_domestic_status_derived(d, ctx):
    return derive_india_domestic_status(d["indiaEntityKindRaw"], {
        "days": d["indiaDaysCurrentYearRaw"], "p4y": d["indiaDays4YearRaw"], "emp": d["indiaEmploymentOrCrewRaw"],
        "visit": d["indiaVisitPioCitizenRaw"], "nr9": d["indiaNr9Raw"], "d7729": d["indiaD7729Raw"],
        "inc15": d["indiaIncome15lRaw"], "ltac": d["indiaLtacRaw"], "isIndianCompany": d["indiaIsIndianCompanyRaw"],
        "whollyOutside": d["indiaWhollyOutsideIndiaRaw"],
        "company": {
            "isActiveBusiness": d["companyIsActiveBusinessRaw"], "boardMeetingsOutsideIndia": d["companyBoardOutsideIndiaRaw"],
            "keyManagementLocation": d["companyKeyManagementLocationRaw"], "managementDelegatedOutsideIndia": d["companyManagementDelegatedOutsideRaw"],
            "directorsInIndia": d["companyDirectorsInIndiaRaw"], "directorsOutsideIndia": d["companyDirectorsOutsideIndiaRaw"],
        },
    })


def _residency_consistency_findings(d, ctx):
    findings = []

    if d["indiaStatusRaw"] is not None and d["indiaDomesticStatusDerived"] != d["indiaStatusRaw"]:
        treaty_override_active = d["treatyIndiaResidenceRaw"] == "us" or d["treatyDtaaForcedNrRaw"] is True
        entity_label = (
            "" if d["indiaEntityKindRaw"] == "individual" else
            " (company)" if d["indiaEntityKindRaw"] == "company" else
            " (HUF)" if d["indiaEntityKindRaw"] == "huf" else f" ({d['indiaEntityKindRaw']})"
        )
        if treaty_override_active and d["indiaStatusRaw"] == "NR" and d["indiaDomesticStatusDerived"] != "NR":
            findings.append({
                "id": "residency_status_dtaa_conflated_india", "severity": "warning", "category": "residency",
                "title": f"India residential status may be conflated with the DTAA treaty tie-break{entity_label}",
                "detail": (
                    f"Based on the residency facts on file, this taxpayer's India DOMESTIC-LAW status under s.6 should be "
                    f"{d['indiaDomesticStatusDerived']}, but the recorded final_india_residency_status is NR. The DTAA Article 4 tie-break "
                    f"is recorded as resolving to the US (dtaa_treaty_residence = \"us\""
                    f"{' / dtaa_forced_nr = true' if d['treatyDtaaForcedNrRaw'] else ''}). Layer 1's residency wizard used to overwrite the "
                    "domestic status field itself whenever the treaty tie-break resolved away from India — but under Indian law, residential "
                    "status (ROR/RNOR/NR) is a purely domestic-law determination, unaffected by any treaty. \"Losing\" the Article 4 tie-breaker "
                    "doesn't make someone stop being domestically resident — it only changes worldwide-taxation scope for treaty purposes "
                    "(already handled correctly, separately, elsewhere in this computation). This finding is the domestic-status side of that "
                    "same fact pattern, surfaced because the two concepts appear to have been conflated in what was recorded for this profile."
                ),
                "recommendation": (
                    "For domestic-law purposes (advance-tax interest under s.234B/234C, PAN-Aadhaar linking, Schedule FA disclosure, TDS rates "
                    f"on India-source payments), this taxpayer's status should likely be treated as {d['indiaDomesticStatusDerived']}, with the "
                    "treaty position tracked separately as a worldwide-taxation election, not as a change to the underlying residential status."
                ),
                "amountUsd": 0, "refs": ["s.6", "DTAA Art. 4"],
            })
        else:
            findings.append({
                "id": (
                    "residency_status_mismatch_india_company" if d["indiaEntityKindRaw"] == "company" else
                    "residency_status_mismatch_india" if d["indiaEntityKindRaw"] == "individual" else
                    "residency_status_mismatch_india_entity"
                ),
                "severity": "warning", "category": "residency",
                "title": f"India residency status may not match the facts on file{entity_label} — derived {d['indiaDomesticStatusDerived']}, recorded {d['indiaStatusRaw']}",
                "detail": (
                    "Re-deriving India's residential-status determination from the same raw facts Layer 1's own wizard uses "
                    "(day-count, the 4-year lookback, RNOR sub-status conditions, employment/PIO-visit exceptions, s.6(1A) deemed-residency, "
                    f"incorporation/POEM, or control-and-management, depending on entity type) produces {d['indiaDomesticStatusDerived']}, but "
                    f"the recorded final_india_residency_status is {d['indiaStatusRaw']}."
                ),
                "recommendation": "Re-run the Layer 1 India residency wizard, or verify the underlying residency facts were entered consistently — this looks like a wizard or data-entry error.",
                "amountUsd": 0, "refs": ["s.6"],
            })

    if d["usEntityKindRaw"] == "individual":
        if not d["usIsCitizenRaw"] and not d["usHasGreenCardRaw"]:
            if d["usDaysCurrentYearRaw"] >= 183 and d["usSptMetRaw"] is False:
                findings.append({
                    "id": "residency_status_understated_us", "severity": "info", "category": "residency",
                    "title": f"US Substantial Presence Test may be understated — {js_num_str(d['usDaysCurrentYearRaw'])} days present but SPT marked not met",
                    "detail": (
                        f"Layer 1 records {js_num_str(d['usDaysCurrentYearRaw'])} days of physical presence in the US this year — at or above the "
                        "183-day figure IRC 7701(b)(3)'s weighted 3-year sum reaches from current-year days alone (full weight, regardless "
                        "of the prior two years) — yet spt_test_met is recorded false. Two narrow exception categories exist, confirmed "
                        "against Layer 1 US's own SPT calculation (layer1_us.html): 'exempt individual' status (F/J/M/Q student/trainee "
                        "visas within their exempt years, foreign-government-related individuals, charitable-event athletes) excludes "
                        "ALL days from the SPT count; separately, specific days can be excluded even for a non-exempt individual (e.g. a "
                        "medical-condition exception). This engine does not model either, so this flag cannot rule them out — verify "
                        "before assuming error."
                    ),
                    "recommendation": "Confirm exempt-individual status or a day-exclusion claim doesn't apply before correcting spt_test_met — if neither does, this looks like a wizard or data-entry error.",
                    "amountUsd": 0, "refs": ["IRC 7701(b)(3)"],
                })
            elif d["usDaysCurrentYearRaw"] < 31 and d["usSptMetRaw"] is True:
                findings.append({
                    "id": "residency_status_overstated_us", "severity": "warning", "category": "residency",
                    "title": f"US Substantial Presence Test may be overstated — only {js_num_str(d['usDaysCurrentYearRaw'])} days present but SPT marked met",
                    "detail": (
                        f"Layer 1 records only {js_num_str(d['usDaysCurrentYearRaw'])} days of physical presence in the US this year, but "
                        "spt_test_met is recorded true. IRC 7701(b)(3)(A) sets an unconditional floor: the SPT cannot be satisfied with "
                        "fewer than 31 days of presence in the current year, regardless of the weighted 3-year total. No known exception "
                        "(exempt-individual status and day-exclusions can only reduce the count, never add days back)."
                    ),
                    "recommendation": "Re-run the Layer 1 US residency wizard, or verify us_days_current_year was entered for the correct calendar year.",
                    "amountUsd": 0, "refs": ["IRC 7701(b)(3)(A)"],
                })
    else:
        if d["usIncorporatedInUsRaw"] is True and d["usStatusRaw"] != "DOMESTIC_ENTITY":
            findings.append({
                "id": "residency_status_understated_us_entity", "severity": "warning", "category": "residency",
                "title": "US entity residency may be understated — incorporated in the US but not marked Domestic Entity",
                "detail": (
                    "Layer 1 records this entity as incorporated in the US (profile.incorporated_in_us = true), yet the recorded "
                    f"final status is {d['usStatusRaw']}, not DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this "
                    "field directly from incorporated_in_us with no other factor involved — no known exception."
                ),
                "recommendation": "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status were entered consistently — this looks like a wizard or data-entry error.",
                "amountUsd": 0, "refs": [],
            })
        elif d["usIncorporatedInUsRaw"] is False and d["usStatusRaw"] == "DOMESTIC_ENTITY":
            findings.append({
                "id": "residency_status_overstated_us_entity", "severity": "warning", "category": "residency",
                "title": "US entity residency may be overstated — not incorporated in the US but marked Domestic Entity",
                "detail": (
                    "Layer 1 records this entity as NOT incorporated in the US (profile.incorporated_in_us = false), yet the "
                    "recorded final status is DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this field directly from "
                    "incorporated_in_us with no other factor involved — no known exception."
                ),
                "recommendation": "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status were entered consistently — this looks like a wizard or data-entry error.",
                "amountUsd": 0, "refs": [],
            })

    return findings


NODES = {
    "indiaStatusRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.final_india_residency_status", None), layer1_fields=("india.residency_detail.final_india_residency_status",)),
    "usStatusRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.final_us_residency_status", None), layer1_fields=("us.us_residency_detail.final_us_residency_status",)),
    "usIsCitizenRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.is_us_citizen", False) is True, layer1_fields=("us.us_residency_detail.is_us_citizen",)),
    "usHasGreenCardRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.has_green_card", False) is True, layer1_fields=("us.us_residency_detail.has_green_card",)),
    "usSptMetRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.spt_test_met", False) is True, layer1_fields=("us.us_residency_detail.spt_test_met",)),
    "treatyIndiaResidenceRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.dtaa_treaty_residence", "none"), layer1_fields=("india.dtaa.dtaa_treaty_residence",)),
    "treatyDtaaForcedNrRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "dtaa.dtaa_forced_nr", False) is True, layer1_fields=("india.dtaa.dtaa_forced_nr",)),
    "treatyUsResidenceRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "us_residency_detail.dtaa_treaty_residence", "none"), layer1_fields=("us.us_residency_detail.dtaa_treaty_residence",)),
    "treatyFiles1040nrRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "nra_specific.files_form_1040nr", False) is True, layer1_fields=("us.nra_specific.files_form_1040nr",)),

    "residencyResult": NodeDef(
        deps=("indiaStatusRaw", "usStatusRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usSptMetRaw",
              "treatyIndiaResidenceRaw", "treatyDtaaForcedNrRaw", "treatyUsResidenceRaw", "treatyFiles1040nrRaw"),
        compute=_residency_result,
    ),

    "indiaEntityKindRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.entity_type", "individual"), layer1_fields=("india.profile.entity_type",)),
    "indiaDaysCurrentYearRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "residency_detail.days_in_india_current_year", 0)) or 0, layer1_fields=("india.residency_detail.days_in_india_current_year",)),
    "indiaDays4YearRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.days_in_india_preceding_4_years_gte_365", None), layer1_fields=("india.residency_detail.days_in_india_preceding_4_years_gte_365",)),
    "indiaEmploymentOrCrewRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.employment_or_crew_status", None), layer1_fields=("india.residency_detail.employment_or_crew_status",)),
    "indiaVisitPioCitizenRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.came_on_visit_to_india_pio_citizen", None), layer1_fields=("india.residency_detail.came_on_visit_to_india_pio_citizen",)),
    "indiaNr9Raw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.nr_years_last_10_gte_9", None), layer1_fields=("india.residency_detail.nr_years_last_10_gte_9",)),
    "indiaD7729Raw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.days_in_india_last_7_years_lte_729", None), layer1_fields=("india.residency_detail.days_in_india_last_7_years_lte_729",)),
    "indiaIncome15lRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.india_source_income_above_15l", None), layer1_fields=("india.residency_detail.india_source_income_above_15l",)),
    "indiaLtacRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", False) is True, layer1_fields=("india.residency_detail.liable_to_tax_in_another_country_being_indian_citizen",)),
    "indiaIsIndianCompanyRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.is_indian_company", None), layer1_fields=("india.residency_detail.is_indian_company",)),
    "indiaWhollyOutsideIndiaRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.is_wholly_outside_india", None), layer1_fields=("india.residency_detail.is_wholly_outside_india",)),
    "companyIsActiveBusinessRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "company_residency.is_active_business", False) is True, layer1_fields=("india.company_residency.is_active_business",)),
    "companyBoardOutsideIndiaRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "company_residency.board_meetings_primarily_outside_india", False) is True, layer1_fields=("india.company_residency.board_meetings_primarily_outside_india",)),
    "companyKeyManagementLocationRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "company_residency.key_management_location", ""), layer1_fields=("india.company_residency.key_management_location",)),
    "companyManagementDelegatedOutsideRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "company_residency.management_delegated_outside_india", False) is True, layer1_fields=("india.company_residency.management_delegated_outside_india",)),
    "companyDirectorsInIndiaRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "company_residency.directors_in_india_count", 0)) or 0, layer1_fields=("india.company_residency.directors_in_india_count",)),
    "companyDirectorsOutsideIndiaRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("india"), "company_residency.directors_outside_india_count", 0)) or 0, layer1_fields=("india.company_residency.directors_outside_india_count",)),

    "usDaysCurrentYearRaw": NodeDef(deps=(), compute=lambda d, ctx: num(safe(ctx.get("us"), "us_residency_detail.us_days_current_year", 0)) or 0, layer1_fields=("us.us_residency_detail.us_days_current_year",)),
    "usIncorporatedInUsRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "profile.incorporated_in_us", None), layer1_fields=("us.profile.incorporated_in_us",)),
    "usEntityKindRaw": NodeDef(
        deps=(),
        compute=lambda d, ctx: (lambda t: safe(ctx.get("us"), "profile.llc_tax_election", "individual") if t == "llc" else t)(safe(ctx.get("us"), "profile.tax_entity_type", "individual")),
        layer1_fields=("us.profile.tax_entity_type", "us.profile.llc_tax_election"),
    ),

    "indiaCompanyPoemDerived": NodeDef(
        deps=("companyIsActiveBusinessRaw", "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw",
              "companyManagementDelegatedOutsideRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw"),
        compute=_india_company_poem_derived,
    ),
    "indiaDomesticStatusDerived": NodeDef(
        deps=("indiaEntityKindRaw", "indiaDaysCurrentYearRaw", "indiaDays4YearRaw", "indiaEmploymentOrCrewRaw",
              "indiaVisitPioCitizenRaw", "indiaNr9Raw", "indiaD7729Raw", "indiaIncome15lRaw", "indiaLtacRaw",
              "indiaIsIndianCompanyRaw", "indiaWhollyOutsideIndiaRaw", "indiaCompanyPoemDerived",
              "companyIsActiveBusinessRaw", "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw",
              "companyManagementDelegatedOutsideRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw"),
        compute=_india_domestic_status_derived,
    ),

    "residencyConsistencyFindings": NodeDef(
        deps=("indiaStatusRaw", "indiaEntityKindRaw", "indiaDomesticStatusDerived", "treatyIndiaResidenceRaw", "treatyDtaaForcedNrRaw",
              "usStatusRaw", "usDaysCurrentYearRaw", "usSptMetRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usEntityKindRaw", "usIncorporatedInUsRaw"),
        compute=_residency_consistency_findings,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
