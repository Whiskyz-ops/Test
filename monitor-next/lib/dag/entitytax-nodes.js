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
var CONST_ET = require("../engine/constants.js").CONST;
var C = CONST_ET.TAX.INDIA_COMPANY;
var FC = CONST_ET.TAX.INDIA_COMPANY_FOREIGN;
var F = CONST_ET.TAX.INDIA_FIRM;

var NODES = {
  indiaEntityTypeRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.entity_type", "individual"); } },
  indiaIsCompany: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return d.indiaEntityTypeRaw === "company"; } },
  indiaIsFirm: { deps: ["indiaEntityTypeRaw"], compute: function (d) { return ["firm", "llp", "local"].indexOf(d.indiaEntityTypeRaw) >= 0; } },
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
    deps: ["indiaIsCompany", "indiaIsFirm", "isIndianCompanyFact", "indiaOpt115baa", "indiaOpt115bab", "indiaOpt115ba",
      "indiaTurnoverLte400cr", "indiaMatBookProfitInr", "hasIndiaPE", "entityTaxableInrBoundary"],
    compute: function (d) {
      var taxable = d.entityTaxableInrBoundary;

      function entityResult(base, sur, cess, label, mat) {
        var total = base + sur + cess;
        return { regime: label, matApplied: mat, totalTaxInr: total, slabTaxInr: base, surchargeInr: sur, cessInr: cess };
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
