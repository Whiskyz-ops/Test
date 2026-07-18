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
 * tieBreakWinner/worldwideOverlap. Small, self-contained, entirely raw-
 * input-driven — genuinely 🟢 effort, not the 🟡 "new pattern" the tracker
 * had guessed before this file existed to check.
 *
 * Verified in run-residency.js: full parity (every field) against
 * computed.residency for all 11 real profiles — no boundary left at all,
 * unlike every other phase in this effort.
 *
 * ----------------------------------------------------------------------
 * residencyConsistencyFindings — NEW, added on top of the port above.
 * Unlike every other finding closed in this effort (IN-1, US-1, US-5,
 * XB-7, holding_period_mismatch), this one has NO counterpart anywhere in
 * engine/conflicts.js today — it's a genuinely new check this DAG pilot is
 * introducing, not a port. Scope, from the residency assessment this same
 * session did: the engine stores day-count facts (daysCurrentYear, sptMet)
 * right next to the trusted status conclusion and never compares them —
 * monitoring.js will render a "210 of 182 days" progress bar next to a
 * status that came from a different source entirely, with nothing to
 * catch the contradiction. This closes that specific, narrow gap.
 *
 * Deliberately NOT a re-derivation of residency status (that would require
 * multi-year day-count history and qualitative facts this engine doesn't
 * even collect — s.6(1A)'s 9-of-10-years/729-day lookback, SPT's 3-year
 * weighted formula with prior-year days). Only two implications per
 * country are checked, each chosen because it holds under EVERY variant of
 * the rule with no exception (or, where a real exception exists, the
 * finding says so explicitly rather than asserting an error):
 *
 *   India (individual profiles only — company/HUF residency runs on
 *   POEM/control-and-management facts, not day-count, and daysCurrentYear
 *   isn't even populated in their raw data; confirmed against india_pvt_ltd/
 *   foreign_holdco_poem_india/sharma_huf profile fixtures before writing
 *   this gate, not assumed):
 *     - understated: days >= 182 (the unconditional s.6(1)(a) threshold —
 *       every lower alternate threshold only ADDS ways to become resident,
 *       never removes this one) but status === "NR". No known exception.
 *     - overstated: days === 0 but status is ROR/RNOR. s.6(1) requires SOME
 *       presence in the FY under every limb — EXCEPT s.6(1A)'s "deemed
 *       resident" provision (citizen, >Rs.15L non-foreign income, not
 *       liable to tax anywhere else), which this engine doesn't model
 *       anywhere (grepped, zero hits) — flagged as "verify," not "wrong."
 *
 *   US (individual profiles only, and not a citizen/green-card holder —
 *   for whom sptMet is moot since they're resident regardless):
 *     - understated: days >= 183 (current-year days alone satisfy IRC
 *       7701(b)(3)'s weighted 3-year sum at full weight, regardless of the
 *       other two years) but sptMet === false. EXCEPT "exempt individual"
 *       status (F/J/M/Q student/trainee visas in their exempt years,
 *       foreign-government-related individuals, charitable-event athletes)
 *       excludes days from the SPT count entirely — also not modeled
 *       anywhere in this engine — flagged as "verify," not "wrong."
 *     - overstated: days < 31 but sptMet === true. IRC 7701(b)(3)(A)'s
 *       31-day floor is unconditional — no exemption can raise a count
 *       back up, only lower it further. No known exception.
 *
 * Verified in run-residency.js: zero findings across all 11 real profiles
 * (true-negative check — the demo data is internally consistent) plus a
 * set of hand-built synthetic cases proving each of the four directions
 * fires exactly when it should (real data has no inconsistent profiles to
 * exercise the positive path, so synthetic cases are the only way to prove
 * the logic actually works, not just that it stays quiet).
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
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

  // ---- raw leaves for the consistency finding ------------------------------
  indiaDaysCurrentYearRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.india, "residency_detail.days_in_india_current_year", 0)) || 0; } },
  usDaysCurrentYearRaw: { deps: [], compute: function (d, ctx) { return Number(safe(ctx.us, "us_residency_detail.us_days_current_year", 0)) || 0; } },
  indiaEntityKindRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },
  indiaIsIndianCompanyRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.is_indian_company", null); } },
  indiaWhollyOutsideIndiaRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.is_wholly_outside_india", null); } },
  usEntityKindRaw: {
    deps: [],
    compute: function (d, ctx) {
      var usT = safe(ctx.us, "profile.tax_entity_type", "individual");
      if (usT === "llc") usT = safe(ctx.us, "profile.llc_tax_election", "individual");
      return usT;
    }
  },

  // ---- the new finding: declared status vs. the day-count facts also on file
  residencyConsistencyFindings: {
    deps: ["indiaStatusRaw", "indiaDaysCurrentYearRaw", "indiaEntityKindRaw", "indiaIsIndianCompanyRaw", "indiaWhollyOutsideIndiaRaw",
      "usStatusRaw", "usDaysCurrentYearRaw", "usSptMetRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "usEntityKindRaw"],
    compute: function (d) {
      var findings = [];

      if (d.indiaEntityKindRaw === "individual") {
        if (d.indiaDaysCurrentYearRaw >= 182 && d.indiaStatusRaw === "NR") {
          findings.push({
            id: "residency_status_understated_india", severity: "warning", category: "residency",
            title: "India residency may be understated — " + d.indiaDaysCurrentYearRaw + " days present but marked Non-Resident",
            detail: "Layer 1 records " + d.indiaDaysCurrentYearRaw + " days of physical presence in India this FY — at or above the unconditional " +
              "182-day threshold under s.6(1)(a), which is sufficient for residency on its own regardless of which alternate test " +
              "(the lower 60-day test, citizen/PIO carve-outs) might otherwise apply — yet the recorded final status is NR. No " +
              "known exception makes >=182 days consistent with NR.",
            recommendation: "Re-run the Layer 1 India residency wizard, or verify days_in_india_current_year was entered for the " +
              "correct financial year — a wrong-year entry is the most common cause of this mismatch.",
            amountUsd: 0, refs: ["s.6(1)(a)"]
          });
        } else if (d.indiaDaysCurrentYearRaw === 0 && (d.indiaStatusRaw === "ROR" || d.indiaStatusRaw === "RNOR")) {
          findings.push({
            id: "residency_status_overstated_india", severity: "info", category: "residency",
            title: "India residency may be overstated — 0 days present but marked " + d.indiaStatusRaw,
            detail: "Layer 1 records ZERO days of physical presence in India this FY, yet the recorded final status is " + d.indiaStatusRaw +
              " (resident). Every limb of s.6(1) requires some physical presence in the FY itself. One narrow exception exists: " +
              "s.6(1A)'s 'deemed resident' provision treats certain Indian citizens (>Rs.15 lakh of non-foreign-source income, not " +
              "liable to tax in any other country) as resident even with zero days present, specifically to prevent engineered " +
              "statelessness. This engine does not model that provision, so this flag cannot rule it out — verify before assuming error.",
            recommendation: "Confirm whether s.6(1A) deemed-residency applies before correcting — if it doesn't, this status is " +
              "likely a wizard or data-entry error.",
            amountUsd: 0, refs: ["s.6(1)", "s.6(1A)"]
          });
        }
      } else if (d.indiaEntityKindRaw === "company") {
        // s.6(3): an Indian-incorporated company is UNCONDITIONALLY resident —
        // incorporation alone settles it, no POEM override can reduce it back
        // to NR. (The other direction — foreign-incorporated but POEM resolves
        // to ROR — is a real, different situation, already a genuine engine
        // finding, entity_dual_residency_poem (conflicts.js:723, unported,
        // CFL-6) — deliberately not duplicated here.)
        if (d.indiaIsIndianCompanyRaw === true && d.indiaStatusRaw === "NR") {
          findings.push({
            id: "residency_status_understated_india_company", severity: "warning", category: "residency",
            title: "India company residency may be understated — incorporated in India but marked Non-Resident",
            detail: "Layer 1 records this company as incorporated in India (residency_detail.is_indian_company = true), yet the " +
              "recorded final status is NR. Under s.6(3), an Indian-incorporated company is unconditionally resident regardless " +
              "of Place of Effective Management — incorporation status alone settles it, with no POEM override that can reduce " +
              "it to NR. No known exception.",
            recommendation: "Re-run the Layer 1 India residency wizard, or verify is_indian_company and " +
              "final_india_residency_status were entered consistently — this looks like a wizard or data-entry error.",
            amountUsd: 0, refs: ["s.6(3)"]
          });
        }
      } else {
        // HUF / firm / LLP / local authority / trust / AOP / BOI / AJP, etc. —
        // s.6(2)/s.6(4): resident UNLESS control & management of its affairs
        // is wholly outside India. Binary test, both directions exception-free
        // (unlike the individual day-count checks above, there's no lower
        // alternate threshold or citizen/PIO carve-out complicating this one).
        if (d.indiaWhollyOutsideIndiaRaw === true && (d.indiaStatusRaw === "ROR" || d.indiaStatusRaw === "RNOR")) {
          findings.push({
            id: "residency_status_overstated_india_entity", severity: "warning", category: "residency",
            title: "India entity residency may be overstated — control & management wholly outside India but marked " + d.indiaStatusRaw,
            detail: "Layer 1 records that this entity's control and management is wholly situated outside India " +
              "(residency_detail.is_wholly_outside_india = true), yet the recorded final status is " + d.indiaStatusRaw +
              " (resident). Under s.6(2)/s.6(4), an entity of this type is resident UNLESS control and management is wholly " +
              "outside India — 'wholly outside' is the one condition that flips it to non-resident, so this combination has " +
              "no known exception.",
            recommendation: "Re-run the Layer 1 India residency wizard, or verify the control-and-management fact and final " +
              "status were entered consistently.",
            amountUsd: 0, refs: ["s.6(2)", "s.6(4)"]
          });
        } else if (d.indiaWhollyOutsideIndiaRaw === false && d.indiaStatusRaw === "NR") {
          findings.push({
            id: "residency_status_understated_india_entity", severity: "warning", category: "residency",
            title: "India entity residency may be understated — control & management NOT wholly outside India but marked Non-Resident",
            detail: "Layer 1 records that this entity's control and management is NOT wholly situated outside India " +
              "(residency_detail.is_wholly_outside_india = false), yet the recorded final status is NR. Under s.6(2)/s.6(4), an " +
              "entity of this type is resident UNLESS control and management is wholly outside India — since it isn't wholly " +
              "outside here, the entity should be resident, not NR. No known exception.",
            recommendation: "Re-run the Layer 1 India residency wizard, or verify the control-and-management fact and final " +
              "status were entered consistently.",
            amountUsd: 0, refs: ["s.6(2)", "s.6(4)"]
          });
        }
      }

      if (d.usEntityKindRaw === "individual" && !d.usIsCitizenRaw && !d.usHasGreenCardRaw) {
        if (d.usDaysCurrentYearRaw >= 183 && d.usSptMetRaw === false) {
          findings.push({
            id: "residency_status_understated_us", severity: "info", category: "residency",
            title: "US Substantial Presence Test may be understated — " + d.usDaysCurrentYearRaw + " days present but SPT marked not met",
            detail: "Layer 1 records " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year — at or above the " +
              "183-day figure IRC 7701(b)(3)'s weighted 3-year sum reaches from current-year days alone (full weight, regardless " +
              "of the prior two years) — yet spt_test_met is recorded false. One narrow exception exists: 'exempt individual' " +
              "status (F/J/M/Q student/trainee visas within their exempt years, foreign-government-related individuals, " +
              "charitable-event athletes) excludes days from the SPT count entirely. This engine does not model visa/exempt-" +
              "individual status, so this flag cannot rule that out — verify before assuming error.",
            recommendation: "Confirm exempt-individual status doesn't apply before correcting spt_test_met — if it doesn't, this " +
              "looks like a wizard or data-entry error.",
            amountUsd: 0, refs: ["IRC 7701(b)(3)"]
          });
        } else if (d.usDaysCurrentYearRaw < 31 && d.usSptMetRaw === true) {
          findings.push({
            id: "residency_status_overstated_us", severity: "warning", category: "residency",
            title: "US Substantial Presence Test may be overstated — only " + d.usDaysCurrentYearRaw + " days present but SPT marked met",
            detail: "Layer 1 records only " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year, but " +
              "spt_test_met is recorded true. IRC 7701(b)(3)(A) sets an unconditional floor: the SPT cannot be satisfied with " +
              "fewer than 31 days of presence in the current year, regardless of the weighted 3-year total. No known exception " +
              "(exempt-individual status can only exclude days, never add them back).",
            recommendation: "Re-run the Layer 1 US residency wizard, or verify us_days_current_year was entered for the correct " +
              "calendar year.",
            amountUsd: 0, refs: ["IRC 7701(b)(3)(A)"]
          });
        }
      }

      return findings;
    }
  }
};

module.exports = { NODES: NODES };
