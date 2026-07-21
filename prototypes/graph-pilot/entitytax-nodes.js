"use strict";
/* ============================================================================
 * Closes the one remaining boundary from the IN-1 tax-computation work:
 * computeIndiaEntityTax (company/firm/LLP rate schedules — the branch
 * computeIndiaTax takes instead of the individual/HUF slab path whenever
 * model.entity.indiaIsCompany || indiaIsFirm).
 *
 * Much smaller than the individual path — no loss set-off, no Chapter
 * VI-A deductions, no §156 rebate, no special-rate buckets, no NR
 * treatment. Just: a rate lookup driven by entity facts (foreign vs
 * domestic incorporation, 115BAB/115BAA/115BA elections, turnover), a MAT
 * floor comparison, surcharge, cess.
 *
 * ONE boundary input remains, consistent with the rest of this effort:
 * inc.total.inr (the entity's total India income) — same
 * aggregateIndiaIncome classification complexity already deferred for
 * IN-1's individual path, read straight off model.income.india.total.inr
 * rather than re-derived. Everything else here — the rate/regime
 * selection, MAT floor, surcharge, cess — is genuinely ported.
 *
 * DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6 —
 * "business entity coverage", 21 Jul 2026): AOP/BOI and Trust/NGO/Political
 * Party (Layer 1 India's entity_type = "aop" / "trust") are NEITHER
 * indiaIsCompany NOR indiaIsFirm — the engine's own routing condition
 * (computation.js, `if (E.indiaIsCompany || E.indiaIsFirm)`) never reaches
 * computeIndiaEntityTax for them at all, so they fall through and get taxed
 * as a plain resident individual: slab rates, a standard deduction, a §156
 * rebate. That's wrong for both, in different directions:
 *   - AOP/BOI (s.167B): when member shares are indeterminate — or determinate
 *     but any member's own income exceeds the basic exemption limit, the
 *     common case for a real commercial AOP — tax is at the Maximum Marginal
 *     Rate, not slab rates. Layer 1 collects no member-share-determinacy
 *     facts at all, so MMR (the statutory DEFAULT for the unestablished
 *     case, not a guess) is applied unconditionally below.
 *   - Trust/NGO/Political Party: the engine's OWN computeIndiaItrForm
 *     (computation.js:1753-1756, ported unchanged in itrform-nodes.js)
 *     already recommends ITR-7 "claiming tax exemptions under Trust & NGO
 *     Tax Exemptions" for this exact entity_type value — i.e. the engine's
 *     own form-determination logic already assumes s.11/12A (charitable) or
 *     s.13A (political party) exemption. computeIndiaEntityTax computing a
 *     nonzero individual-slab tax on the SAME income directly contradicts
 *     its own ITR-7 recommendation. Aligned here: treated as exemption-
 *     claiming (tax = 0), with the compliance conditions (85% application-
 *     of-income test, valid 12A/12AB registration, s.13A's books/audit/
 *     cash-donation conditions) flagged as unverified rather than silently
 *     assumed met — same "self-documented simplification, not silently
 *     wrong" discipline as every other unverified-condition item in this
 *     codebase (GAP_TRACKER.md section H.2's `estimate` flag precedent). A
 *     genuine private/family trust (not claiming any exemption) is a
 *     different real-world case this Layer 1 field cannot currently
 *     distinguish from the charitable/political case — recorded as a
 *     known remaining gap, not solved by this fix (see GAP_TRACKER H.6).
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/* SYS-1: verified-identical copies of CONST.TAX.INDIA_COMPANY /
 * INDIA_COMPANY_FOREIGN / INDIA_FIRM replaced by the shared import. */
var CONST_ET = require("./constants.js").CONST;
var C = CONST_ET.TAX.INDIA_COMPANY;
var FC = CONST_ET.TAX.INDIA_COMPANY_FOREIGN;
var F = CONST_ET.TAX.INDIA_FIRM;

// Maximum Marginal Rate (Explanation to s.2(29C)): the rate applicable to
// the highest slab of an individual's income, INCLUDING surcharge and cess
// — 30% x 1.37 x 1.04 = 42.744%. Derived from the same top-slab-rate/cess
// constants the individual path already uses (CONST.TAX.INDIA.SLABS_OLD's
// top bracket = 30%, CESS_RATE = 4%) plus the old-regime top surcharge
// (>Rs5cr), which is a bare 0.37 literal inline in engine/computation.js's
// own computeIndiaSurcharge (`rate = isNew ? T.SURCHARGE_NEW_MAX : 0.37`),
// not otherwise exposed there as a named constant — restated here as its
// own named literal rather than silently duplicated. AOP/BOI without
// exclusively-corporate members gets the same MMR as an individual; the
// narrower "AOP with only corporate members" surcharge-cap carve-out (a
// distinct sub-rule) isn't modeled — Layer 1 doesn't capture AOP membership
// composition at all.
var INDIA_MMR_TOP_SLAB_RATE = 0.30;
var INDIA_MMR_TOP_SURCHARGE_RATE = 0.37;
var INDIA_MMR_CESS_RATE = 0.04;

var NODES = {
  indiaEntityTypeRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },
  indiaIsCompany: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "company"; } },
  indiaIsFirm: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return ["firm", "llp", "local"].indexOf(d.indiaEntityTypeRaw) >= 0; } },
  // "aop" covers AOP/BOI (one shared Layer 1 dropdown value); "trust" covers
  // Trust/NGO/Political Party (also one shared value — see file header).
  indiaIsAop: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "aop"; } },
  indiaIsTrust: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "trust"; } },
  isIndianCompanyFact: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "residency_detail.is_indian_company", null); } },
  indiaOpt115baa: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.opt_115baa", false) === true; } },
  indiaOpt115bab: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.opt_115bab", false) === true; } },
  indiaOpt115ba: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.opt_115ba", false) === true; } },
  indiaTurnoverLte400cr: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.turnover_lte_400cr", false) === true; } },
  indiaMatBookProfitInr: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.mat_book_profit", null); } },
  hasIndiaPE: { deps: [], compute: function (d, ctx) { return !!safe(ctx.india, "dtaa.has_permanent_establishment_in_india", false); } },

  // ---- the one boundary input: the entity's total India income -----------
  entityTaxableInrBoundary: { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.total && ctx.model.income.india.total.inr); } },

  entityTaxResult: {
    deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "isIndianCompanyFact", "indiaOpt115baa", "indiaOpt115bab", "indiaOpt115ba",
      "indiaTurnoverLte400cr", "indiaMatBookProfitInr", "hasIndiaPE", "entityTaxableInrBoundary"],
    compute: function (d) {
      var taxable = d.entityTaxableInrBoundary;

      function entityResult(base, sur, cess, label, mat) {
        var total = base + sur + cess;
        return { regime: label, matApplied: mat, totalTaxInr: total, slabTaxInr: base, surchargeInr: sur, cessInr: cess };
      }

      // AOP/BOI — s.167B Maximum Marginal Rate (see file header for why).
      if (d.indiaIsAop) {
        var aopBase = taxable * INDIA_MMR_TOP_SLAB_RATE;
        var aopSur = aopBase * INDIA_MMR_TOP_SURCHARGE_RATE;
        var aopCess = (aopBase + aopSur) * INDIA_MMR_CESS_RATE;
        return entityResult(aopBase, aopSur, aopCess, "AOP/BOI ITR-5 (Maximum Marginal Rate, s.167B)", false);
      }

      // Trust/NGO/Political Party — treated as exemption-claiming (ITR-7),
      // consistent with the engine's own computeIndiaItrForm recommendation
      // for this same entity_type value (see file header).
      if (d.indiaIsTrust) {
        return entityResult(0, 0, 0, "Trust/NGO/Political Party ITR-7 (exempt — s.11/12A or s.13A, compliance unverified)", false);
      }

      if (d.indiaIsCompany) {
        if (d.isIndianCompanyFact === false) {
          var rateF = FC.RATE;
          var baseTaxF = taxable * rateF;
          var surRateF = taxable > 100000000 ? FC.SURCHARGE_OVER_10CR : (taxable > 10000000 ? FC.SURCHARGE_OVER_1CR : 0);
          var normalF = baseTaxF + baseTaxF * surRateF;
          var matBaseInrF = d.indiaMatBookProfitInr != null ? d.indiaMatBookProfitInr : taxable;
          var matF = matBaseInrF * FC.MAT_RATE;
          var matAppliedF = d.hasIndiaPE && normalF < matF;
          var preCessF = matAppliedF ? matF : normalF;
          var cessF = preCessF * FC.CESS_RATE;
          var regimeF = "Foreign Company ITR-6 (" + Math.round(rateF * 100) + "%" +
            (matAppliedF ? ", MAT" : (d.hasIndiaPE ? "" : ", MAT-exempt (no India PE)")) + ")";
          return entityResult(baseTaxF, preCessF - baseTaxF, cessF, regimeF, matAppliedF);
        }
        var rate = d.indiaOpt115bab ? C.RATE_115BAB : d.indiaOpt115baa ? C.RATE_115BAA :
          d.indiaOpt115ba ? C.RATE_115BA : (d.indiaTurnoverLte400cr ? C.RATE_TURNOVER_LTE_400CR : C.RATE_DEFAULT);
        var baseTax = taxable * rate;
        var concessional115 = d.indiaOpt115bab || d.indiaOpt115baa;
        var surRate = concessional115 ? (d.indiaOpt115bab ? C.SURCHARGE_115BAB : C.SURCHARGE_115BAA) :
          (taxable > 100000000 ? C.SURCHARGE_OVER_10CR : (taxable > 10000000 ? C.SURCHARGE_OVER_1CR : 0));
        var normal = baseTax + baseTax * surRate;
        var matBaseInr = d.indiaMatBookProfitInr != null ? d.indiaMatBookProfitInr : taxable;
        var mat = matBaseInr * C.MAT_RATE;
        var matApplied = !concessional115 && normal < mat;
        var preCess = matApplied ? mat : normal;
        var cessC = preCess * C.CESS_RATE;
        var regime = "Corporate ITR-6 (" + Math.round(rate * 100) + "%" +
          (d.indiaOpt115bab ? " §115BAB" : d.indiaOpt115baa ? " §200" : d.indiaOpt115ba ? " §115BA" : "") +
          (matApplied ? ", MAT" : "") + ")";
        return entityResult(baseTax, preCess - baseTax, cessC, regime, matApplied);
      }

      // firm / LLP
      var ftax = taxable * F.RATE;
      var fsurRate = taxable > 10000000 ? F.SURCHARGE_OVER_1CR : 0;
      var fsur = ftax * fsurRate;
      var fcess = (ftax + fsur) * F.CESS_RATE;
      return entityResult(ftax, fsur, fcess, "Firm/LLP ITR-5 (30%)", false);
    }
  },

  totalTaxInrEntity: { deps: ["entityTaxResult"], compute: function (d) { return d.entityTaxResult.totalTaxInr; } }
};

module.exports = { NODES: NODES };
