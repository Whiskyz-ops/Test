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
  }
};

module.exports = { NODES: NODES };
