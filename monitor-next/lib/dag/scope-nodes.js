"use strict";
/* ============================================================================
 * Pilot node graph: the scope-flag sub-graph, migrated from two REAL bug
 * sites this session found and fixed by hand (XB-23, XB-24). Each pair below
 * is [the historical bug, reproduced exactly, deliberately left ungated] +
 * [the same computation, properly scope-gated] — run side by side against
 * real profiles in run.js so the difference is observable, not asserted.
 *
 * ctx passed into every compute() is { model, usTax } — the REAL model/
 * computed.usTax objects produced by the actual engine's normalize()/
 * computation.js, not synthetic fixtures.
 * ==========================================================================*/

var NODES = {
  // Leaf facts — read once from the real engine's own model.meta, not
  // re-derived. The pilot's job is proving the CONSUMPTION side is safe,
  // not re-litigating normalize.js's derivation logic (which is already
  // correct and single-sourced as of XB-19).
  hasUsScope: { deps: [], compute: function (d, ctx) { return ctx.model.meta.hasUsScope !== false; } },
  hasIndiaScope: { deps: [], compute: function (d, ctx) { return ctx.model.meta.hasIndiaScope !== false; } },

  // ---- XB-23 bug site: normalize.js's aggregateAccounts(), BEFORE the
  // hasUsScope parameter was added, unconditionally summed every disclosed
  // bank account into the FBAR aggregate peak — wrong for a taxpayer with
  // zero US nexus, whose own domestic accounts aren't "foreign" to anyone.
  // Reproduced here deliberately ungated, exactly as it read in production
  // until the real fix landed.
  fbarAggregatePeakUsd_BUGGY_ungated: {
    deps: [],
    compute: function (d, ctx) {
      var accounts = ctx.model.accounts.accounts || [];
      return accounts.reduce(function (s, a) { return s + (a.peak.usd || 0); }, 0);
    }
  },
  // ---- The fixed version. Identical math — the only difference is
  // scopeGate, which the FRAMEWORK enforces. compute() below is simply
  // never invoked when hasUsScope is false.
  fbarAggregatePeakUsd: {
    deps: ["hasUsScope"],
    scopeGate: "hasUsScope",
    outOfScopeValue: 0,
    compute: function (d, ctx) {
      var accounts = ctx.model.accounts.accounts || [];
      return accounts.reduce(function (s, a) { return s + (a.peak.usd || 0); }, 0);
    }
  },

  // ---- XB-24 bug site: computation.js's computeFtc(), BEFORE
  // `!model.meta.hasUsScope` was added to foreignSrcGrossUsd — treated
  // 100% of India income as "foreign-source relative to a US return" for
  // any non-NRA taxpayer, including someone who was never a US taxpayer
  // in any sense at all.
  foreignSrcGrossUsd_BUGGY_ungated: {
    deps: [],
    compute: function (d, ctx) { return ctx.usTax.isNra ? 0 : ctx.model.income.india.total.usd; }
  },
  foreignSrcGrossUsd: {
    deps: ["hasUsScope"],
    scopeGate: "hasUsScope",
    outOfScopeValue: 0,
    compute: function (d, ctx) { return ctx.usTax.isNra ? 0 : ctx.model.income.india.total.usd; }
  },

  // ---- THE ACTUAL PILOT CLAIM. A brand-new node, written as if by
  // someone who has never heard of hasUsScope, computing "how much is
  // genuinely at stake for this taxpayer." It contains ZERO scope-checking
  // code — no `if` anywhere in this function — and depends only on the
  // two ALREADY-GATED nodes above. It inherits correctness for free: not
  // because the framework detected a missing check, but because there was
  // never anything for this author to check in the first place.
  atRiskExposureUsd: {
    deps: ["foreignSrcGrossUsd", "fbarAggregatePeakUsd"],
    compute: function (d) { return Math.max(d.foreignSrcGrossUsd, d.fbarAggregatePeakUsd); }
  }
};

module.exports = { NODES: NODES };
