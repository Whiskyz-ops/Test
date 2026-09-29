/* ============================================================================
 * household-link.js — spouse link between two clients (docs/HOUSEHOLD_DESIGN.md
 * sections 1-2, build step 1). Python mirror: dag_py/src/wising_dag/household/link.py.
 *
 * Each spouse is their own client; us.profile.spouse_client_id on each points
 * at the other. checkHouseholdLink(a, b) takes the two clients
 * ({id, router, india, us}; b null when the linked id doesn't exist) and returns
 *   { linked, status, errors: [{code, message}], tiers: {<id>: "light"|"full"} }.
 * Every error blocks the household calculation (build step 3).
 *
 * Spouse tier (decision 2, option B): a spouse with no amounts entered outside
 * identity/residency and no Indian side is a "light" profile (lower price or
 * free); any income, account or Indian return makes it "full".
 * ==========================================================================*/
(function (root) {
  "use strict";

  var LINK_STATUSES = { mfj: true, mfs: true };
  // Sections that describe the person, not work to be done on a return.
  var IDENTITY_SECTIONS = { profile: true, us_residency_detail: true, state_residency: true, metadata: true, nra_specific: true };

  function get(o, path, dflt) {
    var cur = o;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return dflt;
      cur = cur[parts[i]];
    }
    return cur === undefined ? dflt : cur;
  }

  function filingStatus(c) {
    var s = String(get(c, "us.profile.filing_status", "single") || "single").toLowerCase();
    if (s === "married_filing_jointly") return "mfj";
    if (s === "married_filing_separately") return "mfs";
    if (s === "head_of_household") return "hoh";
    return s;
  }

  function taxYear(c) {
    var y = get(c, "router.base_tax_year", null);
    if (y == null) y = get(c, "us.metadata.us_calendar_year", null);
    return y == null ? null : Number(y);
  }

  function isCitizen(c) {
    return get(c, "us.us_residency_detail.is_us_citizen", false) === true || get(c, "router.is_us_citizen", false) === true;
  }

  function isNra(c) {
    if (isCitizen(c) || get(c, "us.us_residency_detail.has_green_card", false) === true) return false;
    return get(c, "us.us_residency_detail.final_us_residency_status", null) === "NON_RESIDENT_ALIEN" ||
      get(c, "us.nra_specific.files_form_1040nr", false) === true;
  }

  function hasJointElection(c) {
    return get(c, "us.nra_specific.s6013h_joint_election", false) === true ||
      get(c, "us.us_residency_detail.s6013g_joint_election", false) === true;
  }

  // Any positive amount anywhere under v (numbers or numeric strings).
  function anyAmount(v) {
    if (v == null) return false;
    if (typeof v === "number") return v > 0;
    if (typeof v === "string") { var n = Number(v.replace(/,/g, "")); return v.trim() !== "" && isFinite(n) && n > 0; }
    if (Array.isArray(v)) return v.some(anyAmount);
    if (typeof v === "object") return Object.keys(v).some(function (k) { return anyAmount(v[k]); });
    return false;
  }

  function spouseTier(c) {
    var j = String(get(c, "router.primary_jurisdiction", get(c, "router.jurisdiction", "")) || "");
    var indiaSide = j === "india" || j === "cross_border" || j === "single_india" || j === "dual" || anyAmount(c.india);
    var us = c.us || {};
    var usWork = Object.keys(us).some(function (k) { return !IDENTITY_SECTIONS[k] && anyAmount(us[k]); });
    return indiaSide || usWork ? "full" : "light";
  }

  function name(c) {
    return get(c, "router.full_name", null) || get(c, "us.profile.full_name", null) || (c && c.id) || "the spouse";
  }

  function checkHouseholdLink(a, b) {
    var spouseId = get(a, "us.profile.spouse_client_id", null);
    var out = { linked: false, status: filingStatus(a), spouseId: spouseId, errors: [], tiers: {} };
    if (!spouseId) return out;
    out.linked = true;
    function err(code, message) { out.errors.push({ code: code, message: message }); }

    if (spouseId === a.id) { err("self_link", "The spouse link points at this client itself."); return out; }
    if (!b) { err("missing_spouse", "The linked spouse profile no longer exists. Re-link or remove the link."); return out; }
    out.tiers[b.id] = spouseTier(b);

    if (get(b, "us.profile.spouse_client_id", null) !== a.id) {
      err("half_link", name(b) + "'s profile doesn't link back to this client. Both profiles must point at each other.");
    }
    var sa = filingStatus(a), sb = filingStatus(b);
    if (!LINK_STATUSES[sa]) {
      err("status_not_married", "Filing status is " + sa.toUpperCase() + "; a spouse link needs married filing jointly or separately.");
    } else if (sa !== sb) {
      err("status_mismatch", "Filing status differs: " + sa.toUpperCase() + " here, " + sb.toUpperCase() + " on " + name(b) + "'s profile.");
    }
    var ya = taxYear(a), yb = taxYear(b);
    if (ya != null && yb != null && ya !== yb) {
      err("year_mismatch", "Tax year differs: " + ya + " here, " + yb + " on " + name(b) + "'s profile.");
    }
    if (sa === "mfj" && sb === "mfj") {
      [a, b].forEach(function (c) {
        if (isNra(c) && !hasJointElection(a) && !hasJointElection(b)) {
          err("nra_spouse_no_election", name(c) + " is a non-resident alien. A joint return needs the §6013(g) or §6013(h) election (IRC §6013(a)(1)).");
        }
      });
    }
    [a, b].forEach(function (c) {
      if (isCitizen(c) && get(c, "us.us_residency_detail.final_us_residency_status", null) === "NON_RESIDENT_ALIEN") {
        err("citizen_marked_nra", name(c) + " is a US citizen but marked non-resident alien. A citizen is always taxed as a US person (DTAA Art. 1(3) saving clause).");
      }
    });
    return out;
  }

  var api = { checkHouseholdLink: checkHouseholdLink, spouseTier: spouseTier };
  var W = root.WISING = root.WISING || {};
  W.householdLink = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
