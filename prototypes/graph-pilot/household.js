/* ============================================================================
 * household.js — analyzeHousehold(a, b, analyzeFn): the married-couple
 * calculation (docs/HOUSEHOLD_DESIGN.md section 4, build step 3).
 * Python mirror: dag_py/src/wising_dag/household/calc.py.
 *
 * a, b: two linked clients ({id, router, india, us}); analyzeFn: the
 * single-client engine (analyze.js's analyze, or the Monitor's analyzeDag).
 * The single-client engine is not changed — the household runs it on:
 *   1. each spouse's own profile — their Indian tax and Indian relief cap
 *      come from their own data only (the fix for audit rows G1/G2);
 *   2. each spouse as a separate filer — the weights for split method A;
 *   3. the two US profiles merged into one joint return — the joint US tax.
 * Then the joint regular US income tax is split between the spouses
 * (splitJointUsTax, method A: in proportion to the tax each would owe
 * filing separately — decision 1, CA to confirm), and each spouse's Indian
 * relief (s.159 / rule 76, Form 44) is recomputed with their share:
 *   relief = min(share x their US-source fraction, Indian tax on that income).
 *
 * Not yet per person (audit rows D1-D13): the merged joint return pools
 * the Social Security wage base, 401(k) limit, IRA limit and senior
 * deduction across the two spouses — the same as a single pooled profile
 * today. Married filing separately runs each spouse's own return; the
 * spouse-dependent MFS rules (spouse itemizes, lived apart) are not read yet.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var link = (typeof require === "function" && typeof module !== "undefined") ? require("./household-link.js") : (root.WISING && root.WISING.householdLink);

  // Sections that describe the person rather than income: the joint return
  // takes the first spouse's, except the fields patched below.
  var US_IDENTITY = { profile: true, us_residency_detail: true, state_residency: true, metadata: true, nra_specific: true };
  var INDIA_IDENTITY = { profile: true, residency_detail: true, dtaa: true, metadata: true, compliance_docs: true };

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  // Deep merge of two spouses' data for the joint return: numbers add,
  // booleans OR, arrays concatenate (quarterly arrays merge by quarter),
  // objects merge key by key, anything else keeps the first spouse's value.
  function mergeValue(x, y, key) {
    if (y === undefined || y === null) return clone(x);
    if (x === undefined || x === null) return clone(y);
    if (typeof x === "number" && typeof y === "number") return x + y;
    if (typeof x === "boolean" && typeof y === "boolean") return x || y;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (key === "quarters") {
        var n = Math.max(x.length, y.length), out = [];
        for (var i = 0; i < n; i++) out.push(mergeValue(x[i], y[i], null));
        return out;
      }
      return clone(x).concat(clone(y));
    }
    if (isObj(x) && isObj(y)) {
      var o = {};
      Object.keys(x).forEach(function (k) { o[k] = mergeValue(x[k], y[k], k); });
      Object.keys(y).forEach(function (k) { if (!(k in x)) o[k] = clone(y[k]); });
      return o;
    }
    return clone(x);
  }

  function mergeSection(x, y, identity) {
    x = x || {}; y = y || {};
    var o = {};
    Object.keys(x).forEach(function (k) { o[k] = identity[k] ? clone(x[k]) : mergeValue(x[k], y[k], k); });
    Object.keys(y).forEach(function (k) { if (!(k in x)) o[k] = clone(y[k]); });
    return o;
  }

  function jointProfile(a, b) {
    var us = mergeSection(a.us, b.us, US_IDENTITY);
    us.profile = us.profile || {};
    us.profile.filing_status = "mfj";
    us.profile.dependents_count = (Number((a.us && a.us.profile && a.us.profile.dependents_count) || 0) || 0) +
      (Number((b.us && b.us.profile && b.us.profile.dependents_count) || 0) || 0);
    var india = mergeSection(a.india, b.india, INDIA_IDENTITY);
    return { router: clone(a.router || {}), india: india, us: us };
  }

  function withStatus(c, status) {
    var us = clone(c.us || {});
    us.profile = us.profile || {};
    us.profile.filing_status = status;
    return { router: clone(c.router || {}), india: clone(c.india || {}), us: us };
  }

  function own(c) { return { router: clone(c.router || {}), india: clone(c.india || {}), us: clone(c.us || {}) }; }

  // Decision 1 (docs/HOUSEHOLD_DESIGN.md section 8). The one function to
  // change if the CA picks another method.
  function splitJointUsTax(jointTaxUsd, separateTaxAUsd, separateTaxBUsd) {
    var total = separateTaxAUsd + separateTaxBUsd;
    var shareA = total > 0 ? separateTaxAUsd / total : 0.5;
    return { method: "A", methodLabel: "in proportion to the US tax each spouse would owe filing separately", shareA: shareA, shareB: 1 - shareA, aUsd: jointTaxUsd * shareA, bUsd: jointTaxUsd * (1 - shareA) };
  }

  function n(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

  function spouseName(c, r) {
    var nm = r && r.summary && r.summary.name;
    if (nm && nm !== "Unnamed Taxpayer") return nm;
    return (c.router && c.router.full_name) || (c.us && c.us.profile && c.us.profile.full_name) || c.id;
  }

  function analyzeHousehold(a, b, analyzeFn) {
    var check = link.checkHouseholdLink(a, b);
    if (!check.linked) return { linked: false, blocked: true, errors: [] };
    if (check.errors.length) return { linked: true, blocked: true, errors: check.errors, status: check.status };

    var ownA = analyzeFn(own(a)), ownB = analyzeFn(own(b));
    var status = check.status;
    var spouses = [[a, ownA], [b, ownB]].map(function (t) {
      var r = t[1], u = r.computed.usTax, fi = r.computed.ftc.india;
      return {
        id: t[0].id, name: spouseName(t[0], r),
        indiaTaxUsd: n(r.computed.indiaTax.totalTaxUsd),
        indiaReliefCapUsd: n(fi.reliefCapUsd),
        indiaReliefSingleProfileUsd: n(fi.reliefAllowedUsd),
        usSourceFraction: n(u.totalIncomeUsd) > 0 ? Math.min(1, n(u.usSourceIncomeUsd) / n(u.totalIncomeUsd)) : 0,
        ownReturnIncomeTaxUsd: n(u.incomeTaxUsd),
        ownReturnTotalTaxUsd: n(u.totalTaxBeforeFtcUsd)
      };
    });

    var out = { linked: true, blocked: false, errors: [], status: status, spouses: spouses, jointUs: null, split: null };

    if (status === "mfs") {
      // Each spouse files their own return: their own US tax is the tax for relief.
      spouses.forEach(function (s) {
        s.usTaxShareUsd = s.ownReturnIncomeTaxUsd;
        s.indiaReliefHouseholdUsd = s.indiaReliefSingleProfileUsd;
      });
      return out;
    }

    var sepA = analyzeFn(withStatus(a, "mfs")), sepB = analyzeFn(withStatus(b, "mfs"));
    var joint = analyzeFn(jointProfile(a, b));
    var ju = joint.computed.usTax, jf = joint.computed.ftc.us;
    var indiaTaxPaidUsd = n(ownA.computed.ftc.us.indiaTaxPaidUsd) + n(ownB.computed.ftc.us.indiaTaxPaidUsd);
    out.jointUs = {
      incomeTaxUsd: n(ju.incomeTaxUsd),
      totalTaxBeforeFtcUsd: n(ju.totalTaxBeforeFtcUsd),
      totalIncomeUsd: n(ju.totalIncomeUsd),
      taxableIncomeUsd: n(ju.taxableIncomeUsd),
      // Joint Form 1116: both spouses' Indian tax against the joint limit.
      indiaTaxPaidUsd: indiaTaxPaidUsd,
      ftcLimitUsd: n(jf.ftcLimitUsd),
      ftcAllowedUsd: Math.min(indiaTaxPaidUsd, n(jf.ftcLimitUsd))
    };
    var split = splitJointUsTax(n(ju.incomeTaxUsd), n(sepA.computed.usTax.incomeTaxUsd), n(sepB.computed.usTax.incomeTaxUsd));
    out.split = split;
    spouses[0].separateReturnIncomeTaxUsd = n(sepA.computed.usTax.incomeTaxUsd);
    spouses[1].separateReturnIncomeTaxUsd = n(sepB.computed.usTax.incomeTaxUsd);
    spouses[0].share = split.shareA; spouses[1].share = split.shareB;
    spouses[0].usTaxShareUsd = split.aUsd; spouses[1].usTaxShareUsd = split.bUsd;
    spouses.forEach(function (s) {
      s.indiaReliefHouseholdUsd = Math.min(s.usTaxShareUsd * s.usSourceFraction, s.indiaReliefCapUsd);
    });
    return out;
  }

  var api = { analyzeHousehold: analyzeHousehold, splitJointUsTax: splitJointUsTax, jointProfile: jointProfile, mergeValue: mergeValue };
  var W = root.WISING = root.WISING || {};
  W.household = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
