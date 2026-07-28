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
  },

  // ---- IRC §402(g) elective-deferral aggregate excess (Step 11 audit) -----
  // layer1_us.html's Step 11 ("Retirement Accounts") collects 401(k)/Roth
  // 401(k)/Solo 401(k) elective-deferral contributions, but none of it was
  // ever read by any DAG node -- feeding nothing downstream at all. Step 5's
  // own W-2 Box 12 codes D/E (401(k)/403(b) traditional deferral) and AA/BB
  // (Roth 401(k)/403(b) deferral) have the exact same problem: collected
  // per-W-2, never read. Both share the SAME §402(g) annual aggregate limit
  // across every plan a person contributes to, so they're combined here.
  // Deliberately excludes SEP IRA/employer profit-sharing (a different,
  // much larger employer-side limit, not part of the employee elective-
  // deferral aggregate) and HSA (a wholly separate IRC §223 limit -- needs
  // a coverage-type field the live UI doesn't collect yet, tracked
  // separately rather than guessed at here).
  w2Box12ElectiveDeferralsUsd: {
    deps: [],
    compute: function (d, ctx) {
      var codes401kRoth = { d: 1, e: 1, aa: 1, bb: 1 }; // traditional 401(k)/403(b) + Roth 401(k)/403(b)
      var rows = safe(ctx.us, "income_us_source.wages_w2", []) || [];
      return rows.reduce(function (sum, w2) {
        var box12 = w2.box_12_benefits || [];
        return sum + box12.reduce(function (s, b) {
          var code = String(b.code || "").trim().toLowerCase();
          return codes401kRoth[code] ? s + num(b.amount_usd) : s;
        }, 0);
      }, 0);
    }
  },
  retirementAccountsRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "retirement_accounts", {}) || {}; } },
  electiveDeferralAggregateUsd: {
    deps: ["w2Box12ElectiveDeferralsUsd", "retirementAccountsRaw"],
    compute: function (d) {
      var r = d.retirementAccountsRaw;
      return d.w2Box12ElectiveDeferralsUsd + num(r["401k_employee_contribution_usd"]) + num(r.roth_401k_contribution_usd) + num(r.solo_401k_contribution_usd);
    }
  },
  // 2026 figures (IRS Notice 2025-67 / Rev. Proc. 2025-32): base $24,500;
  // +$8,000 regular catch-up (50-59 and 64+); +$11,250 SECURE 2.0 §109
  // "super catch-up" (60-63 only, reverting to the regular catch-up at 64).
  electiveDeferralLimitUsd: {
    deps: ["ageAtYearEndUs"],
    compute: function (d) {
      var age = d.ageAtYearEndUs;
      if (age == null || age < 50) return 24500;
      if (age >= 60 && age <= 63) return 35750;
      return 32500;
    }
  },
  electiveDeferralExcessUsd: {
    deps: ["hasUsScope", "electiveDeferralAggregateUsd", "electiveDeferralLimitUsd"],
    scopeGate: "hasUsScope", outOfScopeValue: 0,
    compute: function (d) { return Math.max(0, d.electiveDeferralAggregateUsd - d.electiveDeferralLimitUsd); }
  },

  // ---- IRC §219(b)(5) traditional + Roth IRA combined-contribution excess -
  // Same problem as above: Step 11's traditional_ira_contribution_usd/
  // roth_ira_contribution_usd feed nothing. The two share one combined
  // annual limit (§219(b)(5) as modified by §408A(c)(2) for Roth) --
  // deliberately excludes SEP IRA (its own, much larger employer-side
  // limit, a separate concept despite the shared "IRA" name).
  iraContributionAggregateUsd: {
    deps: ["retirementAccountsRaw"],
    compute: function (d) { return num(d.retirementAccountsRaw.traditional_ira_contribution_usd) + num(d.retirementAccountsRaw.roth_ira_contribution_usd); }
  },
  // 2026: base $7,500; +$1,100 catch-up (50+, IRS Notice 2025-67).
  iraContributionLimitUsd: {
    deps: ["ageAtYearEndUs"],
    compute: function (d) { return (d.ageAtYearEndUs != null && d.ageAtYearEndUs >= 50) ? 8600 : 7500; }
  },
  iraContributionExcessUsd: {
    deps: ["hasUsScope", "iraContributionAggregateUsd", "iraContributionLimitUsd"],
    scopeGate: "hasUsScope", outOfScopeValue: 0,
    compute: function (d) { return Math.max(0, d.iraContributionAggregateUsd - d.iraContributionLimitUsd); }
  },

  // ---- SECURE 2.0 RMD determination (Step 11 audit) ------------------------
  // layer1_us.html's own "SECURE Act 2.0 RMD Calculator" card computes a
  // fabricated $5,000 flat RMD amount for ANY taxpayer age >= 73 (its own
  // comment claims "4% of total traditional balances" but no traditional-
  // account BALANCE field exists anywhere in the product -- only
  // contribution amounts -- so the $5,000 is a hardcoded literal, not a
  // real computation). Determination-only here (age test, no fabricated
  // dollar figure), matching the same discipline already applied to the
  // §877A covered-expatriate exit tax: compute what's computable, don't
  // invent what isn't.
  rmdRequired: {
    deps: ["hasUsScope", "ageAtYearEndUs"],
    scopeGate: "hasUsScope", outOfScopeValue: false,
    compute: function (d) { return d.ageAtYearEndUs != null && d.ageAtYearEndUs >= 73; }
  }
};

module.exports = { NODES: NODES };
