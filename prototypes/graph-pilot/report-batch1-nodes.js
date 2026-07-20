"use strict";
/* ============================================================================
 * CFL-7 batch 1: starts closing the report-assembly layer — the functions
 * that turn computed figures into WISING.analyze()'s exact return shape
 * (documents, ftcReport, scopeNotes, returnForms), rather than more
 * findings (CFL-6, fully closed).
 *
 * Scoped in detail 19 Jul 2026 (see DAG_MIGRATION_TRACKER.md's CFL-7 row):
 * 13 functions across conflicts.js, ~1,016 lines. This batch closes the
 * four the tracker's own scoping note called "already unblocked" or
 * "just needed XBR-2/XBR-6, now closed":
 *
 *   - buildDocuments (conflicts.js:1577-1673): the 28-entry CONST.DOCUMENTS
 *     catalog + one boolean trigger per entry. Needed 6 new small
 *     derivations along the way that no earlier batch had built yet:
 *     the full aggregateAccounts() port (accounts[] with country, not just
 *     the aggregatePeak batch 5 built), the India side of
 *     aggregateTaxesPaid (batch 5 only closed the US side), entity.
 *     indiaReturnForm/usReturnForm, model.assets.indianMutualFunds as an
 *     array (batch 3 only computed its count inline for pfic), the
 *     Form 8938 gauge (LIM-2, previously unbuilt), and
 *     indiaBusinessTurnoverInr (a small standalone helper).
 *   - buildScopeNotes (conflicts.js:2481-2521): pure boolean gates over
 *     already-available facts, zero new derivations needed.
 *   - buildReturnFormDetermination (conflicts.js:2538-2588): needed only
 *     the same entity.indiaReturnForm/usReturnForm plus indiaItrFormResult
 *     (XBR-6, already closed).
 *   - buildFtcReport (conflicts.js:1751-1833): needed only ftcResult
 *     (XBR-2, already closed) plus one small additive change to
 *     ustax-nodes.js's already-closed usTaxResult node — exposing
 *     ordinaryTaxUsd/preferentialTaxUsd (computed internally there since
 *     TAX-5 closed, just never returned) for one trace sub-detail line.
 *
 * Deliberately NOT in this batch: buildTaxComputation (the biggest single
 * function, ~400 lines, deeply nested trace objects for every India/US tax
 * line) and buildWithholdingSummary's full row-by-row display (batch 4
 * only closed the numeric totals withholding_documentation_gap needed,
 * not the per-row breakdown) — both real, separate, larger ports, not
 * attempted here. analyze()'s own top-level orchestration (documents/
 * ftcReport/taxComputation/withholding/scopeNotes/returnForms/monitoring/
 * summary assembly) is likewise deferred until more of its pieces exist.
 *
 * Verified in run-report1.js: exact structural match against
 * WISING.analyze()'s own documents/ftcReport/scopeNotes/returnForms
 * fields (NOT findings — a genuinely different comparison shape from
 * every CFL-6 batch runner) for all 11 real profiles.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(v, ctx) { return Number(v) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js
function moneyFromInr(v, ctx) { return { inr: v, usd: inrToUsd(v, ctx) }; }
function moneyFromUsd(v, ctx) { return { usd: v, inr: v * fxRate(ctx) }; }
function addMoney(a, b) { return { usd: a.usd + b.usd, inr: a.inr + b.inr }; }
function zeroMoney() { return { usd: 0, inr: 0 }; }

// Trace helpers, ported verbatim (conflicts.js:1688-1690).
function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }
function holdings(section, note) { return { kind: "holdings", section: section, note: note || null }; }

var findingsBatch6Nodes = require("./findings-batch6-nodes.js").NODES;
var NODES = {};
Object.keys(findingsBatch6Nodes).forEach(function (k) { NODES[k] = findingsBatch6Nodes[k]; });

// ---- indiaBusinessTurnoverInr, ported verbatim (conflicts.js:1565-1575) ---
function indiaBusinessTurnoverInr(entries) {
  var totalInr = 0, cashInr = 0;
  (entries || []).forEach(function (b) {
    var digital = num(b.digital_receipts_inr) + num(b.ada_digital_receipts_inr);
    var cash = num(b.cash_receipts_inr) + num(b.ada_cash_receipts_inr);
    var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (digital + cash);
    totalInr += receipts;
    cashInr += cash;
  });
  return { totalInr: totalInr, cashInr: cashInr };
}

// ---- AGG-5: full aggregateAccounts() port, incl. per-account country ------
// (batch 5 only built aggregatePeakUsdResult; this closes the rest.)
NODES.accountsListResult = {
  deps: ["bankAccountsRaw", "hasUsScopeBoundaryFtc"],
  compute: function (d, ctx) {
    var indianAccounts = d.bankAccountsRaw.india.map(function (b) {
      return { bank: b.bank_name || "Indian Bank", type: b.account_type || "savings", peak: moneyFromInr(b.peak_balance_inr || 0, ctx), country: "India" };
    });
    var usDisclosed = d.bankAccountsRaw.us.map(function (b) {
      return { bank: b.bank_name || "Bank", type: b.account_type || "savings",
        peak: b.peak_balance_usd !== undefined ? moneyFromUsd(b.peak_balance_usd, ctx) : moneyFromInr(b.peak_balance_inr || 0, ctx), country: b.country || "India" };
    });
    var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
    var formFbar = d.bankAccountsRaw.usFormFbar;
    var aggregatePeak = formFbar > 0 ? moneyFromUsd(formFbar, ctx) : (!d.hasUsScopeBoundaryFtc ? zeroMoney() : accounts.reduce(function (acc, a) { return addMoney(acc, a.peak); }, zeroMoney()));
    return { accounts: accounts, aggregatePeak: aggregatePeak };
  }
};

// ---- AGG-6: India side of aggregateTaxesPaid (batch 5 only built the US side) --
NODES.taxCreditsIndiaRaw = {
  deps: [], compute: function (d, ctx) {
    var tc = safe(ctx.india, "tax_credits", {});
    return {
      q1: num(safe(tc, "advance_tax_q1_15jun_inr", 0)), q2: num(safe(tc, "advance_tax_q2_15sep_inr", 0)),
      q3: num(safe(tc, "advance_tax_q3_15dec_inr", 0)), q4: num(safe(tc, "advance_tax_q4_15mar_inr", 0)),
      tdsAlreadyDeducted: num(safe(tc, "tds_already_deducted_inr", 0)), tds: num(safe(tc, "tds_inr", 0)), tcs: num(safe(tc, "tcs_inr", 0))
    };
  }
};
NODES.taxesPaidIndiaResult = {
  deps: ["taxCreditsIndiaRaw"], compute: function (d, ctx) {
    var tc = d.taxCreditsIndiaRaw;
    var advance = tc.q1 + tc.q2 + tc.q3 + tc.q4;
    var tds = tc.tdsAlreadyDeducted + tc.tds;
    return { advance: moneyFromInr(advance, ctx), tds: moneyFromInr(tds, ctx), tcs: moneyFromInr(tc.tcs, ctx), total: moneyFromInr(advance + tds + tc.tcs, ctx) };
  }
};

// ---- entity.indiaReturnForm / usReturnForm (normalize.js:2156-2351) -------
NODES.entityFormsResult = {
  deps: ["indiaIsCompany", "indiaIsFirm", "indiaLayer1ItrRaw", "usEntityKind", "treatyFiles1040nrRaw"],
  compute: function (d) {
    var crude = d.indiaIsCompany ? "ITR-6" : (d.indiaIsFirm ? "ITR-5" : "ITR-2/3");
    var indiaReturnForm = d.indiaLayer1ItrRaw || crude;
    var usT = d.usEntityKind;
    var usReturnForm = usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" :
      (d.treatyFiles1040nrRaw ? "1040-NR" : "1040");
    return { indiaReturnForm: indiaReturnForm, usReturnForm: usReturnForm };
  }
};

// ---- model.assets.indianMutualFunds, as an array (normalize.js:2546-2548) --
NODES.indianMutualFundsResult = {
  deps: ["indiaFinancialHoldingsTxRaw"],
  compute: function (d) { return d.indiaFinancialHoldingsTxRaw.filter(function (t) { return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0; }); }
};

// ---- LIM-2: Form 8938 gauge (computeLimits, computation.js:1466-1476) -----
var CONST_B1_LIMITS = require("../../engine/constants.js").CONST.LIMITS; // SYS-1: shared
var FORM_8938 = CONST_B1_LIMITS.FORM_8938;
NODES.form8938GaugeResult = {
  deps: ["feie", "usFilingStatusRaw", "accountsListResult", "hasUsScopeBoundaryFtc"],
  compute: function (d) {
    if (!d.hasUsScopeBoundaryFtc) return null;
    var isMfj = d.usFilingStatusRaw === "mfj";
    var abroad = d.feie.taxHomeAbroad && d.feie.testMet;
    var tbl = FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    var valueUsd = d.accountsListResult.aggregatePeak.usd;
    var pct = tbl.anyTime > 0 ? valueUsd / tbl.anyTime : 0;
    var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
    return { id: "form8938", value: valueUsd, limit: tbl.anyTime, pct: pct, status: status };
  }
};

// ---- headline.totalIncomeUsd (computation.js:1831) -------------------------
NODES.headlineTotalIncomeUsdResult = {
  deps: ["totalIndiaIncomeInr", "aggregateUsIncomeResult"],
  compute: function (d, ctx) { return inrToUsd(d.totalIndiaIncomeInr, ctx) + d.aggregateUsIncomeResult.total.usd; }
};

// ============================================================================
// buildDocuments, ported in full (conflicts.js:1577-1673)
// ============================================================================
var DOCUMENTS_CATALOG = [
  { id: "fincen_114", jurisdiction: "US", name: "FinCEN Form 114 (FBAR)", desc: "Report of Foreign Bank and Financial Accounts.", why: "Aggregate peak balance across all foreign (Indian) accounts exceeded USD 10,000.", severity: "critical" },
  { id: "form_8938", jurisdiction: "US", name: "IRS Form 8938 (FATCA)", desc: "Statement of Specified Foreign Financial Assets, filed with Form 1040.", why: "Specified foreign financial assets exceeded the Form 8938 reporting threshold for your filing status/residence.", severity: "critical" },
  { id: "form_1116", jurisdiction: "US", name: "IRS Form 1116 (Foreign Tax Credit)", desc: "Claims credit for income tax paid to India against US tax liability.", why: "Indian income tax was paid on income that is also taxable in the US.", severity: "warning" },
  { id: "form_2555", jurisdiction: "US", name: "IRS Form 2555 (FEIE)", desc: "Foreign Earned Income Exclusion / foreign housing exclusion.", why: "FEIE was elected on foreign earned income.", severity: "info" },
  { id: "form_8833", jurisdiction: "US", name: "IRS Form 8833 (Treaty-Based Position)", desc: "Discloses a treaty-based return position (e.g. Article 4 tie-breaker).", why: "A DTAA tie-breaker or treaty rate is being relied upon to override default US taxation.", severity: "critical" },
  { id: "form_8621", jurisdiction: "US", name: "IRS Form 8621 (PFIC)", desc: "Information return for Passive Foreign Investment Companies — one per fund.", why: "Holdings in Indian mutual funds / ETFs are PFICs and require annual reporting (punitive §1291 regime unless QEF/MTM elected).", severity: "critical" },
  { id: "form_5471", jurisdiction: "US", name: "IRS Form 5471 (CFC)", desc: "Information return for US persons owning ≥10% of a foreign corporation.", why: "You own ≥10% of an Indian company — potential Subpart F / GILTI inclusion.", severity: "warning" },
  { id: "form_8865", jurisdiction: "US", name: "IRS Form 8865", desc: "Return for US persons with interests in a foreign partnership.", why: "You hold an interest in an Indian partnership/LLP.", severity: "warning" },
  { id: "form_3520", jurisdiction: "US", name: "IRS Form 3520 / 3520-A", desc: "Reporting of foreign gifts and transactions with foreign trusts.", why: "Foreign gift > USD 100,000 received, or you are a grantor/beneficiary of a foreign trust (note: Indian PPF/EPF may be treated as trusts).", severity: "warning" },
  { id: "form_1040nr", jurisdiction: "US", name: "IRS Form 1040-NR", desc: "Non-resident alien income tax return.", why: "You are (or elect to be treated as) a US non-resident alien for this year.", severity: "info" },
  { id: "form_8960", jurisdiction: "US", name: "IRS Form 8960 (NIIT)", desc: "Net Investment Income Tax (3.8%).", why: "MAGI exceeded the NIIT threshold and net investment income is present.", severity: "info" },
  { id: "form_8959", jurisdiction: "US", name: "IRS Form 8959 (Additional Medicare Tax)", desc: "Additional 0.9% Medicare tax on wages/SE income above the filing-status threshold, and reconciles employer over/under-withholding.", why: "Additional Medicare Tax is owed and is not offset by the Foreign Tax Credit.", severity: "info" },
  { id: "form_540", jurisdiction: "US", name: "California Form 540 (Resident Income Tax Return)", desc: "California state income tax return — computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.", severity: "warning" },
  { id: "form_it201", jurisdiction: "US", name: "New York Form IT-201 (Resident Income Tax Return)", desc: "New York state income tax return — computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to New York, and NY taxes worldwide income independently of the federal treaty position.", severity: "warning" },
  { id: "form_67", jurisdiction: "IN", name: "Form 44 (India FTC)", desc: "Statement of foreign income & foreign tax, filed before the ITR due date.", why: "Foreign (US) income is being offered to tax in India and FTC u/s 90/91 is claimed. Schedule FSI/TR must accompany the ITR.", severity: "critical" },
  { id: "trc", jurisdiction: "IN", name: "Tax Residency Certificate (TRC)", desc: "Issued by the other contracting state (IRS Form 6166 for the US).", why: "DTAA relief / treaty rate is being claimed — a TRC is mandatory u/s 159(8).", severity: "critical" },
  { id: "form_10f", jurisdiction: "IN", name: "Form 41", desc: "Self-declaration accompanying the TRC, filed electronically on the ITR portal.", why: "Treaty benefit claimed and the TRC does not contain all particulars required u/r 75.", severity: "warning" },
  { id: "schedule_fa", jurisdiction: "IN", name: "Schedule FA (Foreign Assets)", desc: "Disclosure of foreign assets/accounts in the Indian ITR.", why: "You are Resident & Ordinarily Resident (ROR) and hold US bank accounts, securities or other foreign assets.", severity: "critical" },
  { id: "schedule_fsi_tr", jurisdiction: "IN", name: "Schedule FSI & Schedule TR", desc: "Foreign Source Income and Tax Relief schedules in the ITR.", why: "Foreign income is offered to tax and relief u/s 90/91 is claimed.", severity: "warning" },
  { id: "form_15ca_cb", jurisdiction: "IN", name: "Form 145 / Form 146 (was 15CA / 15CB)", desc: "Remittance certificates for foreign outward remittances.", why: "Outward remittances under LRS / to non-residents were made during the year. Renumbered from Form 15CA/15CB effective 1 Apr 2026 under the Income-tax Rules, 2026 (Rule 220) — the old numbers still apply to remittances made before that date.", severity: "info" },
  { id: "schedule_al", jurisdiction: "IN", name: "Schedule AL (Assets & Liabilities)", desc: "Disclosure of assets and liabilities at cost, filed with the ITR.", why: "Total income exceeds ₹50 lakh — Schedule AL is mandatory at this threshold u/s 139(1) (ITR-2/3/5 filers).", severity: "warning" },
  { id: "form_3cb_3cd", jurisdiction: "IN", name: "Form 3CB / 3CD (Tax Audit Report)", desc: "Chartered Accountant's tax-audit report and statement of particulars, filed before the ITR due date.", why: "Business turnover exceeds the s.44AB tax-audit threshold (₹1 crore, or ₹10 crore where cash receipts and payments are each ≤5% of the total).", severity: "critical" },
  { id: "form_8802", jurisdiction: "US", name: "IRS Form 8802 (Application for US Residency Certification)", desc: "Application to the IRS for Form 6166 — the US residency certificate India's TRC requirement expects the other contracting state to issue.", why: "DTAA relief is being claimed on Indian-source income — Form 6166 must be requested via Form 8802 before it can be filed with the Indian TRC/Form 41 paperwork; IRS processing typically takes 4-6+ weeks, so file well ahead of the India due date.", severity: "warning" },
  { id: "form_6251", jurisdiction: "US", name: "IRS Form 6251 (Alternative Minimum Tax)", desc: "Computes AMT and reconciles it against regular tax liability.", why: "AMT preference items (commonly an ISO exercise, or the SALT-cap add-back) push tentative minimum tax above the regular tax for the year.", severity: "warning" },
  { id: "form_8288", jurisdiction: "US", name: "IRS Form 8288 / 8288-A / 8288-B (FIRPTA Withholding)", desc: "Withholding certificate and returns for a foreign person's disposition of US real property.", why: "A US real property interest was disposed of by a foreign person — 15% FIRPTA withholding applies at closing unless a Form 8288-B withholding certificate reduces it.", severity: "warning" },
  { id: "form_3ceb", jurisdiction: "IN", name: "Form 3CEB (Transfer Pricing Certification)", desc: "Chartered Accountant's report on international transactions with associated enterprises, filed before the ITR due date u/s 92E.", why: "A cross-border related-party ownership relationship is on file — international transactions with that entity must be reported and certified, independent of whether pricing is at arm's length.", severity: "warning" },
  { id: "form_26as_ais_tis", jurisdiction: "IN", name: "Form 26AS / AIS / TIS", desc: "Annual tax-credit statement (26AS) and the Annual/Taxpayer Information Statements — the pre-filled record every ITR should be reconciled against before filing.", why: "Indian income is on file for this taxpayer — TDS, advance tax and reported high-value transactions should be cross-checked against these statements before the return is filed.", severity: "info" },
  { id: "form_16_16a", jurisdiction: "IN", name: "Form 16 / Form 16A (TDS Certificates)", desc: "Salary (Form 16) and non-salary (Form 16A) TDS certificates issued by each deductor.", why: "Indian income subject to TDS is on file — hold the certificate from each deductor to reconcile against Form 26AS/AIS and support the credit claimed in the ITR.", severity: "info" },
  { id: "lrs_form_a2", jurisdiction: "IN", name: "LRS Form A2 (Outward Remittance Declaration)", desc: "Declaration furnished to the remitting bank for each outward remittance under the Liberalised Remittance Scheme.", why: "Outward remittances under LRS were made this year — each remittance requires its own Form A2 filed with the bank at the time of transfer, separate from the annual Form 145/146 (was 15CA/15CB) return-time reporting.", severity: "info" },
  { id: "form_4868", jurisdiction: "US", name: "IRS Form 4868 (Extension Request)", desc: "Automatic 6-month extension of time to file (not to pay) the US return.", why: "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar — the extension does not happen automatically.", severity: "info" }
];

NODES.buildDocumentsResult = {
  deps: ["residencyResult", "accountsListResult", "form8938GaugeResult", "taxesPaidIndiaResult", "entityFormsResult",
    "feieRaw", "treatyUsResidenceRaw", "treatyFiles1040nrRaw", "treatyIndiaResidenceRaw",
    "indianMutualFundsResult", "bizEntriesAgg", "ppfInrRaw", "epfInrRaw", "foreignGiftsRaw",
    "usTaxResult", "headlineTotalIncomeUsdResult", "usFilingStatusRaw", "aggregateUsIncomeResult",
    "taxesPaidUsResult", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc",
    "limitsRawExtra", "totalIncomeInrV3", "indiaIsCompany", "indiaIsFirm", "viaForeignCorpXbr4", "usStateTaxResult", "nraRaw"],
  compute: function (d) {
    var res = d.residencyResult;
    var isForm1118 = d.entityFormsResult.usReturnForm === "1120";
    var t = indiaBusinessTurnoverInr(d.bizEntriesAgg);
    var atLeast95PctDigital = t.totalInr > 0 && (t.cashInr / t.totalInr) <= 0.05;
    var form8938 = d.form8938GaugeResult;

    var triggers = {
      fincen_114: d.accountsListResult.aggregatePeak.usd > 10000 && res.us.isResident,
      form_8938: !!form8938 && form8938.status === "breached" && res.us.isResident,
      form_1116: d.taxesPaidIndiaResult.total.usd > 0 && (res.us.isResident || isForm1118),
      form_2555: d.feieRaw.claimed,
      form_8833: res.dualResident || d.treatyUsResidenceRaw !== "none" || d.treatyFiles1040nrRaw,
      form_8621: d.indianMutualFundsResult.length > 0 && res.us.isResident,
      form_5471: d.bizEntriesAgg.length > 0 && res.us.isResident,
      form_8865: false,
      form_3520: ((d.ppfInrRaw > 0 || d.epfInrRaw > 0) && res.us.isResident) || d.foreignGiftsRaw.receivedAbove100k || d.foreignGiftsRaw.isTrustBeneficiary,
      form_1040nr: d.treatyFiles1040nrRaw || res.us.status === "NON_RESIDENT_ALIEN",
      form_8960: d.headlineTotalIncomeUsdResult > ((CONST_B1_LIMITS.NIIT_THRESHOLD)[d.usFilingStatusRaw] || 200000) &&
        (d.aggregateUsIncomeResult.interestUs.usd + d.aggregateUsIncomeResult.ordinaryDividendsUs.usd + d.aggregateUsIncomeResult.capitalGainsUs.usd) > 0,
      form_8959: d.usTaxResult.additionalMedicareUsd > 0,
      form_67: d.aggregateUsIncomeResult.foreignSourceTotal.usd > 0 || d.taxesPaidUsResult.total.usd > 0 || res.india.isResident,
      trc: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
      form_10f: res.dualResident || d.treatyIndiaResidenceRaw !== "none",
      schedule_fa: res.india.status === "ROR" && (d.aggregateUsIncomeResult.usSourceTotal.usd > 0 || d.accountsListResult.accounts.some(function (a) { return a.country !== "India"; })),
      schedule_fsi_tr: d.taxesPaidUsResult.total.usd > 0 || d.aggregateUsIncomeResult.usSourceTotal.usd > 0,
      form_15ca_cb: d.limitsRawExtra.lrsRemittedInr > 0,
      schedule_al: !d.indiaIsCompany && !d.indiaIsFirm && d.totalIncomeInrV3 > 5000000,
      form_3cb_3cd: d.indiaIsCompany || (t.totalInr > 0 && t.totalInr > (atLeast95PctDigital ? 100000000 : 10000000)),
      form_8802: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
      form_6251: d.usTaxResult.amtUsd > 0,
      form_8288: !!(d.nraRaw.usRealPropertyDisposed && (d.nraRaw.firptaWithholdingUsd || 0) > 0),
      form_3ceb: d.viaForeignCorpXbr4,
      form_26as_ais_tis: d.hasIndiaScopeXbr,
      form_16_16a: d.hasIndiaScopeXbr,
      lrs_form_a2: d.limitsRawExtra.lrsRemittedInr > 0,
      form_4868: d.hasUsScopeBoundaryFtc,
      form_540: !!d.usStateTaxResult && d.usStateTaxResult.state === "CA",
      form_it201: !!d.usStateTaxResult && d.usStateTaxResult.state === "NY"
    };

    return DOCUMENTS_CATALOG.map(function (doc) {
      var triggered = !!triggers[doc.id];
      var name = doc.name, desc = doc.desc, why = doc.why;
      if (doc.id === "form_1116" && isForm1118) {
        name = "IRS Form 1118 (Foreign Tax Credit — Corporations)";
        desc = "Claims credit for income tax paid to India against US corporate tax liability.";
        why = "This C-corp paid Indian income tax on income that is also taxable in the US. C-corps file Form 1118, not the individual/estate/trust Form 1116.";
      }
      return { id: doc.id, jurisdiction: doc.jurisdiction, name: name, desc: desc, why: why, severity: doc.severity, required: triggered, status: triggered ? "required" : "not_triggered" };
    });
  }
};

// ============================================================================
// buildScopeNotes, ported in full (conflicts.js:2481-2521)
// ============================================================================
NODES.buildScopeNotesResult = {
  deps: ["hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "indiaIsCompany", "indiaIsFirm", "usEntityKind",
    "businessComputation", "indiaFinancialHoldingsTxRaw", "aggregateUsIncomeResult"],
  compute: function (d) {
    var notes = [];
    var hasIndia = d.hasIndiaScopeXbr, hasUs = d.hasUsScopeBoundaryFtc, dual = hasIndia && hasUs;
    var hasIndiaBusiness = d.indiaIsCompany || d.indiaIsFirm || d.usEntityKind !== "individual" || (d.businessComputation.businessInr || 0) > 0;
    var hasSecuritiesTrades = d.indiaFinancialHoldingsTxRaw.length > 0;
    var hasUsWagesOrSe = d.aggregateUsIncomeResult.wages.usd > 0 || (d.aggregateUsIncomeResult.seEarningsUsd || 0) > 0;

    function note(id, area, kind, title, body, relevant) {
      if (relevant) notes.push({ id: id, area: area, kind: kind, title: title, body: body });
    }

    note("scope_gaar", "India", "excluded", "GAAR is not evaluated",
      "India's General Anti-Avoidance Rule can recharacterize arrangements that lack commercial substance — a facts-and-circumstances judgment no rules engine can safely make. WISING flags mechanical conflicts only; whether an arrangement invites GAAR scrutiny remains a professional call.",
      hasIndia);
    note("scope_stt", "India", "excluded", "STT is not computed as a levy",
      "Securities Transaction Tax charged on trades (raised on F&O by Finance Act 2026) isn't calculated here. The stt_paid flag on each transaction drives the capital-gains regime (s.196/198 vs s.197) — the levy amount itself is neither a tax credit nor a capital-gains deduction, so nothing downstream depends on it.",
      hasSecuritiesTrades);
    note("scope_payer_tds", "India", "excluded", "Your obligations as a TDS deductor aren't tracked",
      "The Withholding page covers tax withheld FROM this taxpayer's income. Duties in the opposite direction — deducting TDS on payments the business makes to vendors, contractors, or professionals — aren't monitored as a compliance obligation in their own right, though the resulting s.40(a) expense disallowance for TDS failures (and s.40A(3) cash-payment / s.43B(h) MSME-overdue disallowances) does flow into business income (Phase 1).",
      hasIndiaBusiness);
    note("scope_clubbing", "India", "excluded", "Clubbing amounts are taken as entered",
      "Spousal and minor-child clubbed income entered in Layer 1 is taxed as given. WISING doesn't trace asset transfers between family members to detect clubbing that should have been reported but wasn't.",
      hasIndia);
    note("scope_fica", "United States", "excluded", "FICA/FUTA levies aren't computed",
      "Employee and employer Social Security/Medicare/unemployment payroll taxes are a separate tax base from income tax. Only the pieces that touch the 1040 are computed: Additional Medicare 0.9%, self-employment tax, and the W-2 withholding shown on the Withholding page.",
      hasUsWagesOrSe);
    note("scope_fatca_ch4", "Cross-border", "excluded", "FATCA Chapter 4 withholding is institution-side",
      "The 30% FATCA withholding regime (IRC §§1471-1474) applies to payments to non-compliant foreign financial institutions — banks' problem, not yours directly. Where it touches an individual is the US-person self-certification banks request, which is tracked with your documents.",
      dual);
    note("scope_mocked_uploads", "App", "excluded", "Document-upload extraction is simulated",
      "Every \"upload to auto-fill\" feature in Layer 1 (Form 26AS, Lower-TDS certificate, bank statements, property documents) is a demo simulation with representative values — not live OCR. Figures sourced from an upload should be treated as manually-entered until real extraction ships.",
      true);
    note("scope_mli", "Cross-border", "assurance", "MLI does not affect the India-US treaty",
      "The US never signed the OECD Multilateral Instrument, so the India-US DTAA text is untouched by it — unlike India's treaties with the UK, Netherlands, or Singapore. Verified; nothing to apply.",
      dual);
    note("scope_dtaa_current", "Cross-border", "assurance", "Treaty text current as modeled",
      "The India-US DTAA has not been amended since the 2000 protocol. Every treaty rate and tie-breaker rule in this engine reflects the treaty as it stands.",
      dual);

    return notes;
  }
};

// ============================================================================
// buildReturnFormDetermination, ported in full (conflicts.js:2538-2588)
// ============================================================================
NODES.buildReturnFormDeterminationResult = {
  deps: ["hasIndiaScopeXbr", "indiaItrFormResult", "entityFormsResult"],
  compute: function (d) {
    var CBDT_CITATION = "CBDT notified the AY 2026-27 ITR forms 2026-03-30 (corrigendum 2026-04-10). Eligibility rules verified against that notification 2026-07-12 — re-check each filing season, since CBDT re-notifies forms (and sometimes changes eligibility) annually.";
    var itr = d.hasIndiaScopeXbr ? d.indiaItrFormResult : null;

    var reasonsSuffix = (itr && itr.disqualifiers.length) ? " Reasons: " + itr.disqualifiers.join("; ") + "." : "";
    var indiaTrace;
    if (!itr) {
      indiaTrace = source("No India-side data on file.", null);
    } else if (itr.frontendForm == null) {
      indiaTrace = source(
        (itr.explanation || "Backend-computed eligibility check.") + reasonsSuffix +
        " Layer 1 India hasn't produced its own recommendation for this profile (itr_recommendation.form is unset) — this is WISING's own independent computation, run unconditionally, not a hedge pending the frontend.",
        CBDT_CITATION);
    } else if (itr.matchesFrontend) {
      indiaTrace = source(
        (itr.explanation || "") + reasonsSuffix + " Cross-checked against Layer 1 India's own recommendation (" + itr.frontendForm + ") — they agree.",
        CBDT_CITATION);
    } else {
      indiaTrace = source(
        "WISING computes " + itr.form + "; Layer 1 India's own recommendation was " + itr.frontendForm +
        " (\"" + (itr.frontendExplanation || "no explanation on file") + "\"). They disagree — see the india_itr_form_mismatch finding for likely causes." + reasonsSuffix,
        CBDT_CITATION);
    }

    var E = d.entityFormsResult;
    var usDetail =
      E.usReturnForm === "1120" ? "C-Corp: entity-level return, taxed at 21% flat." :
      E.usReturnForm === "1120-S" ? "S-Corp: informational return, income passes through via K-1." :
      E.usReturnForm === "1065" ? "Partnership: informational return, income passes through via K-1." :
      E.usReturnForm === "1041" ? "Trust/estate return." :
      E.usReturnForm === "1040-NR" ? "Nonresident alien individual return — Layer 1 US recorded this taxpayer as filing Form 1040-NR." :
      "Resident/citizen individual return — standard Form 1040 (not recorded as an NRA 1040-NR filer).";
    var usTrace = source(usDetail, "IRS form-per-entity-type/residency-status mapping, verified 2026-07-12.");

    return {
      india: { form: itr ? itr.form : E.indiaReturnForm, isRecommendation: !!itr, matchesFrontend: itr ? itr.matchesFrontend : null, trace: indiaTrace },
      us: { form: E.usReturnForm, trace: usTrace }
    };
  }
};

// ============================================================================
// buildFtcReport, ported in full (conflicts.js:1751-1833)
// ============================================================================
NODES.buildFtcReportResult = {
  deps: ["ftcResult", "indiaTotalTaxUsdBoundaryFtc", "indiaTotalIncomeUsdBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc", "usTaxResult", "usFtcFormXbr"],
  compute: function (d) {
    var ftc = d.ftcResult, indiaTotalTaxUsd = d.indiaTotalTaxUsdBoundaryFtc, usTax = d.usTaxResult;
    var feieRows = ftc.us.feieExcludedUsd > 0
      ? [
          { label: "Less FEIE-excluded wages (§911)", usd: -ftc.us.feieExcludedUsd,
            trace: source("The §911 Foreign Earned Income Exclusion amount claimed on Layer 1 US (Form 2555). Excluded income leaves the FTC computation entirely — §911(d)(6) no-double-dip.") },
          { label: "Indian tax disallowed on excluded income", usd: -ftc.us.indiaTaxDisallowedUsd,
            trace: calc("Total Indian tax × (FEIE-excluded wages ÷ gross Indian-source income) — the slice of Indian tax attributable to income the US isn't taxing at all can't be credited", [
              { label: "Total India tax (USD)", amount: indiaTotalTaxUsd },
              { label: "FEIE-excluded wages", amount: ftc.us.feieExcludedUsd },
              { label: "Gross Indian-source income (US view)", amount: d.indiaIncomeTotalUsdBoundaryFtc }
            ]) }
        ]
      : [];
    return {
      direction_us_claims_india: {
        title: "US " + d.usFtcFormXbr + " — credit for Indian taxes",
        rows: feieRows.concat([
          { label: "Indian income tax (creditable)", usd: ftc.us.indiaTaxPaidUsd,
            trace: calc("Total India tax × creditable fraction (gross Indian income less any FEIE-excluded slice, over gross Indian income)", [
              { label: "Total India tax (from Tax Computation)", amount: indiaTotalTaxUsd },
              { label: "Creditable fraction", display: Math.round((indiaTotalTaxUsd > 0 ? ftc.us.indiaTaxPaidUsd / indiaTotalTaxUsd : 1) * 100) + "%" }
            ]) },
          { label: "Foreign-source income (US view)", usd: ftc.us.foreignSourceIncomeUsd,
            trace: holdings("india", ftc.us.feieExcludedUsd > 0 ? ("Net of the " + usd(ftc.us.feieExcludedUsd) + " FEIE-excluded wages shown in the row above.") : null) },
          { label: "US taxable income", usd: ftc.us.taxableIncomeUsd,
            trace: calc("Same figure as \"Taxable income\" in the Tax Computation card above", [
              { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
            ]) },
          { label: "US income tax (pre-credit)", usd: ftc.us.usIncomeTaxUsd,
            trace: calc("Ordinary-rate tax + preferential LTCG/QDI tax only — NIIT, Additional Medicare, SE tax and AMT are excluded, they're not creditable against foreign tax by statute", [
              { label: "Ordinary-rate tax", amount: usTax.ordinaryTaxUsd },
              { label: "Preferential LTCG/QDI tax", amount: usTax.preferentialTaxUsd }
            ]) },
          { label: "FTC limitation = US tax × foreign/taxable", usd: ftc.us.ftcLimitUsd,
            trace: calc("§904(a): the credit can't exceed US tax on this income times the same proportion foreign-source income bears to total taxable income", [
              { label: "US income tax (pre-credit)", amount: ftc.us.usIncomeTaxUsd },
              { label: "Foreign-source income", amount: ftc.us.foreignSourceIncomeUsd },
              { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
            ]) },
          { label: "FTC allowed this year", usd: ftc.us.ftcAllowedUsd, emphasis: true,
            trace: calc("Lesser of Indian tax paid and the §904 limitation", [
              { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
              { label: "FTC limitation", amount: ftc.us.ftcLimitUsd }
            ]) },
          { label: "Excess credit carried over (§904(c))", usd: ftc.us.carryoverUsd,
            trace: calc("Indian tax paid in excess of what the §904 limitation allows this year — carries back 1 year / forward 10 years", [
              { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
              { label: "Less FTC allowed this year", amount: -ftc.us.ftcAllowedUsd }
            ]) },
          { label: "Residual double tax (unrelieved)", usd: ftc.us.residualDoubleTaxUsd, warn: true,
            trace: calc("Same as the excess credit carried over — until it's actually used in a future year this is double taxation the credit hasn't relieved yet", [
              { label: "Excess credit carried over", amount: ftc.us.carryoverUsd }
            ]) }
        ])
      },
      direction_india_relief: {
        title: "India §159 relief — for US taxes on doubly-taxed income",
        rows: [
          { label: "US-source income (foreign, India view)", usd: ftc.india.foreignSourceIncomeUsd,
            trace: holdings("us", ftc.india.foreignSourceIncomeUsd === 0 ? "Only counted when the taxpayer is India ROR (worldwide taxation) — zero here because that isn't the case." : null) },
          { label: "US tax on that US-source income", usd: ftc.india.usTaxOnUsSourceUsd,
            trace: calc("US income tax × (US-source income ÷ total US income) — the slice of US tax attributable to income India also taxes", [
              { label: "US income tax (pre-credit)", amount: usTax.incomeTaxUsd },
              { label: "US-source income", amount: usTax.usSourceIncomeUsd },
              { label: "Total US income", amount: usTax.totalIncomeUsd }
            ]) },
          { label: "Indian tax on the doubly-taxed income (cap)", usd: ftc.india.reliefCapUsd,
            trace: calc("Total India tax × (US-source income ÷ total India-view income) — s.159 relief can never exceed the Indian tax actually attributable to that income", [
              { label: "Total India tax", amount: indiaTotalTaxUsd },
              { label: "US-source income (India view)", amount: ftc.india.foreignSourceIncomeUsd },
              { label: "Total India-view income", amount: d.indiaTotalIncomeUsdBoundaryFtc }
            ]) },
          { label: "§90 relief allowed", usd: ftc.india.reliefAllowedUsd, emphasis: true,
            trace: calc("Lesser of the US tax on that income and the Indian-tax cap", [
              { label: "US tax on the doubly-taxed income", amount: ftc.india.usTaxOnUsSourceUsd },
              { label: "Indian tax cap", amount: ftc.india.reliefCapUsd }
            ]) }
        ]
      },
      headlineNetDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
    };
  }
};

module.exports = { NODES: NODES };
