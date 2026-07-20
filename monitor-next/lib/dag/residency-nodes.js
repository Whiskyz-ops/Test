"use strict";
/* ============================================================================
 * Closes XBR-1: resolveResidency (the DTAA Article 4 tie-breaker + dual-
 * residency resolution) — the one remaining "boundary-read" dependency in
 * the wired tax graphs (ustax-nodes.js's worldwideUs reads
 * ctx.computed.residency.us.worldwide directly today).
 *
 * The real complexity here is smaller than the tracker's original XBR-1
 * description implied. Read fresh from source (computation.js:1284-1314)
 * before writing a line of graph code: resolveResidency() does NOT do any
 * day-counting or run the home/CVI/habitual-abode/nationality cascade
 * itself — those are Layer 1's own job (the residency wizard and
 * evaluateTieBreaker() in layer1_india.html, outside this engine entirely).
 * The engine receives their ALREADY-DECIDED conclusions as plain fields:
 *   model.residency.india.status    <- india.residency_detail.final_india_residency_status
 *   model.residency.us.status       <- us.us_residency_detail.final_us_residency_status
 *   model.treaty.treatyResidence    <- india.dtaa.dtaa_treaty_residence
 *   model.treaty.usTreatyResidence  <- us.us_residency_detail.dtaa_treaty_residence
 * (all confirmed by grep against normalize.js:2225-2308 — every one of these
 * is a raw safe() pass-through, not a derived value; normalize.js never
 * computes SPT day-counts or evaluates the tie-break steps either).
 *
 * What resolveResidency() ACTUALLY does, and what this file ports in full:
 * turn those pre-decided facts into isResident/worldwide-taxation booleans
 * for each side, apply the treaty "cedes worldwide taxation" consequence
 * (India cedes if the tie-break winner is the US or Layer 1 recorded a
 * forced-NR outcome; the US cedes if the winner is India or the taxpayer
 * files 1040-NR — EXCEPT a US citizen, who keeps worldwide taxation
 * regardless per the §. saving clause), and assemble dualResident/
 * tieBreakWinner/worldwideOverlap.
 *
 * Verified in run-residency.js: full parity (every field) against
 * computed.residency for all 11 real profiles — no boundary left at all,
 * unlike every other phase in this effort.
 *
 * ----------------------------------------------------------------------
 * residencyConsistencyFindings — NEW, no engine/conflicts.js counterpart.
 *
 * REWRITTEN from the original narrow day-count heuristic after two things
 * were found by reading layer1_india.html/layer1_us.html directly (not just
 * the engine) rather than assumed:
 *
 * (1) Layer 1 India's runResidencySolver() (layer1_india.html:5717-5919) is
 *     a full ~20-branch statutory determination — the 60/182-day tests, the
 *     4-year lookback, RNOR sub-status (9-of-10-years / 729-days-in-7-years),
 *     the employment/crew departure exception, the PIO/citizen visit
 *     exception, and s.6(1A) deemed-residency (income >Rs.15L, not liable to
 *     tax elsewhere) — that normalize.js never reads at all. Only the final
 *     locked final_india_residency_status string crosses into the engine.
 *     deriveIndiaDomesticStatus() below is a faithful, line-by-line port of
 *     that ENTIRE function (individual + company POEM "mock rule" + HUF +
 *     firm/LLP/AOP/trust branches) using the SAME raw fields Layer 1 itself
 *     uses. This replaces the old narrow "days>=182 or days===0" heuristic,
 *     which only caught two of many possible inconsistencies and had to
 *     hedge with "one exception this engine can't model" — that hedge is
 *     gone now, because every fact the real solver uses is now read here
 *     too, not a subset of it.
 *
 * (2) The live wizard ALSO overwrites final_india_residency_status to "NR"
 *     whenever dtaa_treaty_residence === "us" or dtaa_forced_nr === true —
 *     for EVERY entity type, applied unconditionally after the branches
 *     above. But resolveResidency() (XBR-1, ported above in this same file)
 *     treats that field as pure, TREATY-INDEPENDENT domestic-law status: it
 *     derives isResident/worldwide from status alone, then applies the
 *     treaty "cedes worldwide taxation" consequence separately (indiaCedes),
 *     never touching status or isResident. This is a real conflict between
 *     Layer 1's live behavior and the engine's own contract for what this
 *     field means — RESOLVED here by tax-law reasoning, not by picking a
 *     side arbitrarily: Indian residential status under s.6 is genuinely a
 *     domestic-law-only concept, unaffected by any treaty. Article 4 only
 *     ever governs which country gets to tax which income under the treaty
 *     (and only when both countries already, independently, consider the
 *     person domestically resident) — "losing" the tie-break to the US does
 *     NOT make someone stop being domestically resident in India for
 *     s.234B/234C advance-tax interest, PAN-Aadhaar linking, Schedule FA
 *     disclosure, or any other domestic-law purpose. So resolveResidency()'s
 *     contract is the legally correct one, and Layer 1's live wizard
 *     conflating the two is itself the bug — deriveIndiaDomesticStatus()
 *     below deliberately does NOT reproduce that conflation (it computes
 *     PURE domestic status, no DTAA override, matching resolveResidency()'s
 *     assumption). The consistency check below therefore does NOT gate on
 *     the treaty fields to suppress a mismatch — instead, when a mismatch is
 *     found AND the treaty override fields are set, the finding explicitly
 *     diagnoses it as the wizard's own DTAA/domestic-status conflation
 *     (residency_status_dtaa_conflated_india) rather than a generic
 *     data-entry error, since that's almost certainly the real cause.
 *
 * Ground-truth limitation, stated plainly: the 11 demo profiles in
 * engine/profiles.js were hand-authored with a chosen final status directly
 * (e.g. dual_resident_h1b: 183 days, "ROR", dtaa_treaty_residence "us" — a
 * state the real wizard could not itself produce, since it would compute
 * RNOR from 183 days with nr9/d7_729 unanswered, then the DTAA override
 * would push it to NR, not leave it "ROR") rather than run through the real
 * wizard, which needs the fuller fact set (p4y/emp/visit/nr9/d7_729/inc15/
 * ltac) this doc's earlier phases confirmed the fixtures never populate.
 * This means comparing the full derivation against the 11 real profiles is
 * NOT a valid exact-match test the way every other phase in this effort has
 * used real profiles — the mismatches it would produce reflect fixture
 * incompleteness, not a bug in this port. So verification here uses the
 * approach the rest of this effort reaches for when real profiles can't
 * exercise a path: a synthetic case for every one of the ~26 branches
 * (17 individual + 4 company + 2 firm/LLP/AOP/trust + 3 HUF), each checked
 * against the exact path label in the real source. The 11 real profiles are
 * still run, but reported (not asserted) — see run-residency.js.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}

/* ---- Company POEM "mock rule" — layer1_india.html:5731-5758, verbatim --- */
function deriveCompanyPoem(cr) {
  cr = cr || {};
  if (cr.isActiveBusiness === true) {
    return cr.boardMeetingsOutsideIndia === false;
  } else if (cr.keyManagementLocation) {
    if (cr.keyManagementLocation === "india") return true;
    if (cr.keyManagementLocation === "outside_india") return false;
    if (cr.keyManagementLocation === "mixed") {
      var inCount = cr.directorsInIndia || 0, outCount = cr.directorsOutsideIndia || 0;
      if (inCount > outCount) return true;
      if (outCount > inCount) return false;
      return cr.managementDelegatedOutsideIndia === false;
    }
    return false;
  } else {
    return false;
  }
}

/* ---- runResidencySolver(), PURE DOMESTIC-LAW status only (no DTAA
 * override — see file header for why) — layer1_india.html:5717-5903,
 * verbatim branch-for-branch. entity: "company"|"huf"|"firm"|"llp"|"aop"|
 * "trust"|"individual" (anything else routes to the individual branch,
 * matching the real solver's own catch-all else). f: raw facts object. ---*/
function deriveIndiaDomesticStatus(entity, f) {
  if (entity === "company") {
    var isIndian = f.isIndianCompany;
    if (isIndian === true) return "ROR";
    if (isIndian === false) return deriveCompanyPoem(f.company) === true ? "ROR" : "NR";
    return "ROR"; // unanswered defaults to treated-as-Indian-company, matching source exactly
  }
  if (entity === "firm" || entity === "llp" || entity === "aop" || entity === "trust") {
    return f.whollyOutside === true ? "NR" : "ROR";
  }
  if (entity === "huf") {
    if (f.whollyOutside === true) return "NR";
    return (f.nr9 === true || f.d7729 === true) ? "RNOR" : "ROR";
  }
  // INDIVIDUAL
  var days = f.days, p4y = f.p4y, emp = f.emp || "none", visit = f.visit,
    nr9 = f.nr9, d7729 = f.d7729, inc15 = f.inc15, ltac = f.ltac || false;
  if (days >= 182) {
    if (nr9 === false && d7729 === false) return "ROR";
    if (nr9 === true) return "RNOR";
    return "RNOR";
  } else if (days >= 60 && days < 182) {
    if (p4y === true) {
      if (emp !== "none") {
        if (inc15 === true && ltac === false) return "RNOR";
        if (inc15 === false) return "NR";
        return "NR";
      } else if (visit === true) {
        if (days >= 120 && inc15 === true) return "RNOR";
        if (days >= 120 && inc15 === false) return "NR";
        if (days < 120 && inc15 === true && ltac === false) return "RNOR";
        return "NR";
      } else {
        if (nr9 === false && d7729 === false) return "ROR";
        if (nr9 === true) return "RNOR";
        return "RNOR";
      }
    } else {
      if (inc15 === true && ltac === false) return "RNOR";
      return "NR";
    }
  } else if (days < 60) {
    if (inc15 === true && ltac === false) return "RNOR";
    return "NR";
  }
  return "NR"; // days null/undefined — none of the three ranges match, matches the solver's own initial default
}

var NODES = {
  indiaStatusRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.final_india_residency_status", null); } },
  usStatusRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.final_us_residency_status", null); } },
  usIsCitizenRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.is_us_citizen", false) === true; } },
  usHasGreenCardRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.has_green_card", false) === true; } },
  usSptMetRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.spt_test_met", false) === true; } },
  treatyIndiaResidenceRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.dtaa_treaty_residence", "none"); } },
  treatyDtaaForcedNrRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.dtaa_forced_nr", false) === true; } },
  treatyUsResidenceRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.dtaa_treaty_residence", "none"); } },
  treatyFiles1040nrRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "nra_specific.files_form_1040nr", false) === true; } },

  // ---- resolveResidency, ported in full ------------------------------------
  residencyResult: {
    deps: ["indiaStatusRaw", "usStatusRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usSptMetRaw",
      "treatyIndiaResidenceRaw", "treatyDtaaForcedNrRaw", "treatyUsResidenceRaw", "treatyFiles1040nrRaw"],
    compute: function (d) {
      var inStatus = d.indiaStatusRaw, usStatus = d.usStatusRaw;

      var indiaResident = (inStatus === "ROR" || inStatus === "RNOR");
      var indiaWorldwide = (inStatus === "ROR");

      var usResident = d.usIsCitizenRaw || d.usHasGreenCardRaw || usStatus === "RESIDENT_ALIEN" || d.usSptMetRaw;
      var usWorldwide = usResident;

      var indiaCedes = d.treatyIndiaResidenceRaw === "us" || d.treatyDtaaForcedNrRaw === true;
      var usCedes = (d.treatyUsResidenceRaw === "india" || d.treatyFiles1040nrRaw === true) && !d.usIsCitizenRaw;
      var tieBreakWinner = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw
                          : (d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null);
      if (indiaCedes) indiaWorldwide = false;
      if (usCedes) usWorldwide = false;

      return {
        india: { status: inStatus, isResident: indiaResident, worldwide: indiaWorldwide, cedesViaTreaty: indiaCedes },
        us: { status: usStatus, isResident: usResident, worldwide: usWorldwide, isCitizen: d.usIsCitizenRaw, cedesViaTreaty: usCedes },
        dualResident: indiaResident && usResident,
        tieBreakWinner: tieBreakWinner,
        worldwideOverlap: indiaWorldwide && usWorldwide
      };
    }
  },

  // ---- raw leaves: entity kind + the FULL individual/company/HUF fact set -
  indiaEntityKindRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },
  indiaDaysCurrentYearRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.india, "residency_detail.days_in_india_current_year", 0)) || 0; } },
  indiaDays4YearRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.days_in_india_preceding_4_years_gte_365", null); } },
  indiaEmploymentOrCrewRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.employment_or_crew_status", null); } },
  indiaVisitPioCitizenRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.came_on_visit_to_india_pio_citizen", null); } },
  indiaNr9Raw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.nr_years_last_10_gte_9", null); } },
  indiaD7729Raw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.days_in_india_last_7_years_lte_729", null); } },
  indiaIncome15lRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.india_source_income_above_15l", null); } },
  indiaLtacRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", false) === true; } },
  indiaIsIndianCompanyRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.is_indian_company", null); } },
  indiaWhollyOutsideIndiaRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.is_wholly_outside_india", null); } },
  companyIsActiveBusinessRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "company_residency.is_active_business", false) === true; } },
  companyBoardOutsideIndiaRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "company_residency.board_meetings_primarily_outside_india", false) === true; } },
  companyKeyManagementLocationRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "company_residency.key_management_location", ""); } },
  companyManagementDelegatedOutsideRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "company_residency.management_delegated_outside_india", false) === true; } },
  companyDirectorsInIndiaRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.india, "company_residency.directors_in_india_count", 0)) || 0; } },
  companyDirectorsOutsideIndiaRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.india, "company_residency.directors_outside_india_count", 0)) || 0; } },

  usDaysCurrentYearRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.us, "us_residency_detail.us_days_current_year", 0)) || 0; } },
  usIncorporatedInUsRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "profile.incorporated_in_us", null); } },
  usEntityKindRaw: {
    deps: [],
    compute: function (d, ctx) {
      var usT = safe(ctx.us, "profile.tax_entity_type", "individual");
      if (usT === "llc") usT = safe(ctx.us, "profile.llc_tax_election", "individual");
      return usT;
    }
  },

  // ---- deriveCompanyPoem, as its own node (individually testable) ---------
  indiaCompanyPoemDerived: {
    deps: ["companyIsActiveBusinessRaw", "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw",
      "companyManagementDelegatedOutsideRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw"],
    compute: function (d) {
      return deriveCompanyPoem({
        isActiveBusiness: d.companyIsActiveBusinessRaw, boardMeetingsOutsideIndia: d.companyBoardOutsideIndiaRaw,
        keyManagementLocation: d.companyKeyManagementLocationRaw, managementDelegatedOutsideIndia: d.companyManagementDelegatedOutsideRaw,
        directorsInIndia: d.companyDirectorsInIndiaRaw, directorsOutsideIndia: d.companyDirectorsOutsideIndiaRaw
      });
    }
  },

  // ---- deriveIndiaDomesticStatus, as a node — full runResidencySolver() ---
  // port, PURE domestic law, no DTAA override (see file header). -----------
  indiaDomesticStatusDerived: {
    deps: ["indiaEntityKindRaw", "indiaDaysCurrentYearRaw", "indiaDays4YearRaw", "indiaEmploymentOrCrewRaw",
      "indiaVisitPioCitizenRaw", "indiaNr9Raw", "indiaD7729Raw", "indiaIncome15lRaw", "indiaLtacRaw",
      "indiaIsIndianCompanyRaw", "indiaWhollyOutsideIndiaRaw", "indiaCompanyPoemDerived",
      "companyIsActiveBusinessRaw", "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw",
      "companyManagementDelegatedOutsideRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw"],
    compute: function (d) {
      return deriveIndiaDomesticStatus(d.indiaEntityKindRaw, {
        days: d.indiaDaysCurrentYearRaw, p4y: d.indiaDays4YearRaw, emp: d.indiaEmploymentOrCrewRaw,
        visit: d.indiaVisitPioCitizenRaw, nr9: d.indiaNr9Raw, d7729: d.indiaD7729Raw,
        inc15: d.indiaIncome15lRaw, ltac: d.indiaLtacRaw, isIndianCompany: d.indiaIsIndianCompanyRaw,
        whollyOutside: d.indiaWhollyOutsideIndiaRaw,
        company: {
          isActiveBusiness: d.companyIsActiveBusinessRaw, boardMeetingsOutsideIndia: d.companyBoardOutsideIndiaRaw,
          keyManagementLocation: d.companyKeyManagementLocationRaw, managementDelegatedOutsideIndia: d.companyManagementDelegatedOutsideRaw,
          directorsInIndia: d.companyDirectorsInIndiaRaw, directorsOutsideIndia: d.companyDirectorsOutsideIndiaRaw
        }
      });
    }
  },

  // ---- the consistency finding: derived domestic status vs. recorded ------
  residencyConsistencyFindings: {
    deps: ["indiaStatusRaw", "indiaEntityKindRaw", "indiaDomesticStatusDerived", "treatyIndiaResidenceRaw", "treatyDtaaForcedNrRaw",
      "usStatusRaw", "usDaysCurrentYearRaw", "usSptMetRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usEntityKindRaw", "usIncorporatedInUsRaw"],
    compute: function (d) {
      var findings = [];

      if (d.indiaStatusRaw != null && d.indiaDomesticStatusDerived !== d.indiaStatusRaw) {
        var treatyOverrideActive = d.treatyIndiaResidenceRaw === "us" || d.treatyDtaaForcedNrRaw === true;
        var entityLabel = d.indiaEntityKindRaw === "individual" ? "" :
          d.indiaEntityKindRaw === "company" ? " (company)" :
          d.indiaEntityKindRaw === "huf" ? " (HUF)" : " (" + d.indiaEntityKindRaw + ")";
        if (treatyOverrideActive && d.indiaStatusRaw === "NR" && d.indiaDomesticStatusDerived !== "NR") {
          // The recorded status is fully explained by Layer 1's own DTAA/
          // domestic-status conflation (see file header) — diagnose it as
          // that specifically, not a generic data-entry error.
          findings.push({
            id: "residency_status_dtaa_conflated_india", severity: "warning", category: "residency",
            title: "India residential status may be conflated with the DTAA treaty tie-break" + entityLabel,
            detail: "Based on the residency facts on file, this taxpayer's India DOMESTIC-LAW status under s.6 should be " +
              d.indiaDomesticStatusDerived + ", but the recorded final_india_residency_status is NR. The DTAA Article 4 tie-break " +
              "is recorded as resolving to the US (dtaa_treaty_residence = \"us\"" + (d.treatyDtaaForcedNrRaw ? " / dtaa_forced_nr = true" : "") +
              "). Layer 1's residency wizard currently overwrites the domestic status field itself whenever the treaty tie-break " +
              "resolves away from India — but under Indian law, residential status (ROR/RNOR/NR) is a purely domestic-law " +
              "determination, unaffected by any treaty. \"Losing\" the Article 4 tie-breaker doesn't make someone stop being " +
              "domestically resident — it only changes worldwide-taxation scope for treaty purposes (already handled correctly, " +
              "separately, by this DAG's residencyResult.india.worldwide/cedesViaTreaty). This finding is the domestic-status " +
              "side of that same fact pattern, surfaced because the two concepts appear to have been conflated in what was " +
              "recorded.",
            recommendation: "For domestic-law purposes (advance-tax interest under s.234B/234C, PAN-Aadhaar linking, Schedule FA " +
              "disclosure, TDS rates on India-source payments), this taxpayer's status should likely be treated as " +
              d.indiaDomesticStatusDerived + ", with the treaty position tracked separately as a worldwide-taxation election, not " +
              "as a change to the underlying residential status.",
            amountUsd: 0, refs: ["s.6", "DTAA Art. 4"]
          });
        } else {
          findings.push({
            id: d.indiaEntityKindRaw === "company" ? "residency_status_mismatch_india_company" :
              (d.indiaEntityKindRaw === "individual" ? "residency_status_mismatch_india" : "residency_status_mismatch_india_entity"),
            severity: "warning", category: "residency",
            title: "India residency status may not match the facts on file" + entityLabel + " — derived " + d.indiaDomesticStatusDerived + ", recorded " + d.indiaStatusRaw,
            detail: "Re-deriving India's residential-status determination from the same raw facts Layer 1's own wizard uses " +
              "(day-count, the 4-year lookback, RNOR sub-status conditions, employment/PIO-visit exceptions, s.6(1A) deemed-" +
              "residency, incorporation/POEM, or control-and-management, depending on entity type) produces " +
              d.indiaDomesticStatusDerived + ", but the recorded final_india_residency_status is " + d.indiaStatusRaw + ".",
            recommendation: "Re-run the Layer 1 India residency wizard, or verify the underlying residency facts were entered " +
              "consistently — this looks like a wizard or data-entry error.",
            amountUsd: 0, refs: ["s.6"]
          });
        }
      }

      if (d.usEntityKindRaw === "individual") {
        if (!d.usIsCitizenRaw && !d.usHasGreenCardRaw) {
          if (d.usDaysCurrentYearRaw >= 183 && d.usSptMetRaw === false) {
            findings.push({
              id: "residency_status_understated_us", severity: "info", category: "residency",
              title: "US Substantial Presence Test may be understated — " + d.usDaysCurrentYearRaw + " days present but SPT marked not met",
              detail: "Layer 1 records " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year — at or above the " +
                "183-day figure IRC 7701(b)(3)'s weighted 3-year sum reaches from current-year days alone (full weight, regardless " +
                "of the prior two years) — yet spt_test_met is recorded false. Two narrow exception categories exist, confirmed " +
                "against Layer 1 US's own SPT calculation (layer1_us.html): 'exempt individual' status (F/J/M/Q student/trainee " +
                "visas within their exempt years, foreign-government-related individuals, charitable-event athletes) excludes " +
                "ALL days from the SPT count; separately, specific days can be excluded even for a non-exempt individual (e.g. a " +
                "medical-condition exception). This engine does not model either, so this flag cannot rule them out — verify " +
                "before assuming error.",
              recommendation: "Confirm exempt-individual status or a day-exclusion claim doesn't apply before correcting " +
                "spt_test_met — if neither does, this looks like a wizard or data-entry error.",
              amountUsd: 0, refs: ["IRC 7701(b)(3)"]
            });
          } else if (d.usDaysCurrentYearRaw < 31 && d.usSptMetRaw === true) {
            findings.push({
              id: "residency_status_overstated_us", severity: "warning", category: "residency",
              title: "US Substantial Presence Test may be overstated — only " + d.usDaysCurrentYearRaw + " days present but SPT marked met",
              detail: "Layer 1 records only " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year, but " +
                "spt_test_met is recorded true. IRC 7701(b)(3)(A) sets an unconditional floor: the SPT cannot be satisfied with " +
                "fewer than 31 days of presence in the current year, regardless of the weighted 3-year total. No known exception " +
                "(exempt-individual status and day-exclusions can only reduce the count, never add days back).",
              recommendation: "Re-run the Layer 1 US residency wizard, or verify us_days_current_year was entered for the correct " +
                "calendar year.",
              amountUsd: 0, refs: ["IRC 7701(b)(3)(A)"]
            });
          }
        }
      } else {
        // Business entity (ccorp/scorp/partnership/trust). Layer 1 US's own
        // corporate short-circuit (layer1_us.html:7099-7126) sets
        // final_us_residency_status = incorporated_in_us ? "DOMESTIC_ENTITY" :
        // "FOREIGN_ENTITY" and returns immediately — none of the individual-
        // style SPT/DTAA/citizen logic even runs for an entity, so this
        // comparison is exception-free in both directions, confirmed by
        // reading the real branch (not assumed).
        if (d.usIncorporatedInUsRaw === true && d.usStatusRaw !== "DOMESTIC_ENTITY") {
          findings.push({
            id: "residency_status_understated_us_entity", severity: "warning", category: "residency",
            title: "US entity residency may be understated — incorporated in the US but not marked Domestic Entity",
            detail: "Layer 1 records this entity as incorporated in the US (profile.incorporated_in_us = true), yet the recorded " +
              "final status is " + d.usStatusRaw + ", not DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this " +
              "field directly from incorporated_in_us with no other factor involved — no known exception.",
            recommendation: "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status " +
              "were entered consistently — this looks like a wizard or data-entry error.",
            amountUsd: 0, refs: []
          });
        } else if (d.usIncorporatedInUsRaw === false && d.usStatusRaw === "DOMESTIC_ENTITY") {
          findings.push({
            id: "residency_status_overstated_us_entity", severity: "warning", category: "residency",
            title: "US entity residency may be overstated — not incorporated in the US but marked Domestic Entity",
            detail: "Layer 1 records this entity as NOT incorporated in the US (profile.incorporated_in_us = false), yet the " +
              "recorded final status is DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this field directly from " +
              "incorporated_in_us with no other factor involved — no known exception.",
            recommendation: "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status " +
              "were entered consistently — this looks like a wizard or data-entry error.",
            amountUsd: 0, refs: []
          });
        }
      }

      return findings;
    }
  }
};

module.exports = {
  NODES: NODES,
  deriveIndiaDomesticStatus: deriveIndiaDomesticStatus,
  deriveCompanyPoem: deriveCompanyPoem
};
