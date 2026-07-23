"use strict";
/* ============================================================================
 * "Going wider" — finding #3: early_withdrawal_penalty_72t (US-5).
 * Chosen deliberately as the SIMPLE contrast to IN-1/US-1's multi-branch
 * complexity — a flat 10% penalty gated on one age test. Proves the
 * framework doesn't add unwarranted overhead for a small, self-contained
 * finding. Also uses a genuinely different age calculation than IN-1's
 * (US calendar year-end, 31 Dec, vs IN-1's India FY-end, 31 Mar) — a
 * deliberate, honest non-reuse: the two "age at year end" nodes look
 * similar but aren't the same computation, so they aren't forced to share
 * a node across files.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var NODES = {
  routerJurisdiction: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "jurisdiction", null); } },
  routerUsSignal: {
    deps: [],
    compute: function (d, ctx) {
      return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true ||
        safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
    }
  },
  // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
  // values — additive synonyms for "single_india"/"single_us".
  hasUsScope: {
    deps: ["routerJurisdiction", "routerUsSignal"],
    compute: function (d) {
      return (d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only") ? false :
        (d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only") ? true : d.routerUsSignal;
    }
  },

  iraDistUsdRaw: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "income_us_source.ira_distributions_usd", 0)); } },
  dist401kUsdRaw: { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "income_us_source.401k_distributions_usd", 0)); } },
  dobRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null))); } },
  baseYear: { deps: [], compute: function (d, ctx) { return ctx.model.meta.baseYear; } },

  earlyDistUsd: { deps: ["iraDistUsdRaw", "dist401kUsdRaw"], compute: function (d) { return d.iraDistUsdRaw + d.dist401kUsdRaw; } },
  ageAtYearEndUs: {
    deps: ["dobRaw", "baseYear"],
    compute: function (d) {
      if (!d.dobRaw) return null;
      var dob = new Date(d.dobRaw);
      var yearEnd = new Date(d.baseYear, 11, 31); // 31 Dec — US calendar year-end, distinct from IN-1's FY-end
      return yearEnd.getFullYear() - dob.getFullYear() -
        ((yearEnd.getMonth() < dob.getMonth() || (yearEnd.getMonth() === dob.getMonth() && yearEnd.getDate() < dob.getDate())) ? 1 : 0);
    }
  },

  penalty72tUsd: {
    deps: ["hasUsScope", "earlyDistUsd", "ageAtYearEndUs"],
    scopeGate: "hasUsScope",
    outOfScopeValue: 0,
    compute: function (d) { return (d.earlyDistUsd > 0 && d.ageAtYearEndUs != null && d.ageAtYearEndUs < 59) ? d.earlyDistUsd * 0.10 : 0; }
  },
  shouldFire: {
    deps: ["hasUsScope", "earlyDistUsd", "ageAtYearEndUs"],
    scopeGate: "hasUsScope",
    outOfScopeValue: false,
    compute: function (d) { return d.earlyDistUsd > 0 && d.ageAtYearEndUs != null && d.ageAtYearEndUs < 59; }
  }
};

module.exports = { NODES: NODES };
