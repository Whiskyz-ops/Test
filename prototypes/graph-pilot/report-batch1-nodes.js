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
// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21 Jul
// 2026): AOP -> ITR-5, Trust/NGO/Political Party -> ITR-7 — see
// entitytax-nodes.js's file header for the full writeup.
NODES.entityFormsResult = {
  deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "indiaLayer1ItrRaw", "usEntityKind", "treatyFiles1040nrRaw"],
  compute: function (d) {
    var crude = d.indiaIsCompany ? "ITR-6" : (d.indiaIsTrust ? "ITR-7" : (d.indiaIsFirm || d.indiaIsAop) ? "ITR-5" : "ITR-2/3");
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

// ---- model.assets.usPficHoldings (normalize.js:2546) — Layer 1 US's own
// dedicated "PFIC Holdings" card (foreign_entities.pfic_holdings), a
// SEPARATE signal from indianMutualFunds above. Was defined in
// assets-nodes.js's assetsModelResult but never independently read by
// form_8621's own trigger below (docs/GAP_TRACKER.md, 22 Jul 2026 audit) —
// added as its own leaf so buildDocumentsResult can depend on it directly.
NODES.usPficHoldingsRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.pfic_holdings", []) || []; } };

// ---- model.assets.usSecurities (us.financial_holdings) — foreign brokerage/
// securities holdings, separately FBAR/FATCA-reportable per Layer 1 US's own
// is_fbar_reportable flag. schedule_fa's own accountsListResult only ever
// comes from bank_accounts, never financial_holdings — a ROR holding only
// foreign securities (no bank account, no US-source income) was silently
// missing Schedule FA (docs/GAP_TRACKER.md, 22 Jul 2026 audit) — added as
// its own leaf so buildDocumentsResult can depend on it directly.
NODES.usSecuritiesRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "financial_holdings", []) || []; } };

// ---- form_8858 (Foreign Disregarded Entities) — two independent leaves for
// the two real signals Layer 1 US collects (see the DOCUMENTS_CATALOG entry
// above for the full explanation).
NODES.usOwnsForeignDisregardedEntityRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.owns_foreign_disregarded_entity", false) === true; } };
NODES.usSelfEmploymentRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "income_us_source.self_employment", []) || []; } };

// ---- schedule_m1_m2 (Form 1120/1120-S/1065 Schedules L/M-1/M-2) —
// layer1_us.html's "Corporate Financials" screen collects the entity's own
// balance-sheet figures (usState.corporate_financials.schedule_l:
// assets_beginning/assets_ending) — schedule_m1's sibling fields are already
// read elsewhere (agg10-nodes.js/assets-nodes.js, for book-tax income
// reconciliation), but schedule_l itself was never read by anything before
// this leaf (docs/GAP_TRACKER.md entity-filings-audit round). Added as its
// own leaf so buildDocumentsResult can depend on it directly.
NODES.usCorpScheduleLRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "corporate_financials.schedule_l", {}) || {}; } };

// ---- form_8865 (Foreign Partnerships) — layer1_us.html's Step 9 screen
// ("Screen 3K — Foreign Entities") has its own dedicated "I own 10% or more
// of a foreign partnership" accordion (addPartRow()/syncPartState(),
// foreign_entities.foreign_partnerships[], each row carrying its own real
// Form 8865 Category 1-4 selector) -- form_8865 below was hardcoded false
// with a comment claiming "no field anywhere represents owning an interest
// in a foreign partnership," which was true when that comment was written
// but the live UI has since grown exactly this section. Read here so a
// taxpayer who fills in this accordion actually gets Form 8865 flagged.
NODES.usForeignPartnershipsRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.foreign_partnerships", []) || []; } };

// ---- form_27d (task #48, LRS-investor flag): report-batch4-nodes.js's
// computeLrsTcs() (AGG-8, already ported) isn't reachable from here —
// report-batch1-nodes.js sits BEFORE report-batch4-nodes.js in the merge
// chain, and run-report1.js resolves this file's own NODES completely
// standalone — so this trigger re-derives just the purpose + above-
// threshold check it needs from the same raw india.lrs_outbound field
// computeLrsTcs itself reads, rather than duplicating that file's full TCS
// dollar computation (which stays this codebase's single copy).
// LRS_TCS_THRESHOLD_INR_B1 mirrors report-batch4-nodes.js's own
// LRS_TCS_THRESHOLD_INR constant — the ₹10L s.206C(1G) base threshold below
// which an investment/gift-donation LRS remittance owes no TCS at all.
var LRS_TCS_THRESHOLD_INR_B1 = 1000000;
NODES.lrsOutboundRaw = {
  deps: [], compute: function (d, ctx) {
    var lo = safe(ctx.india, "lrs_outbound", {}) || {};
    return { totalRemittedInr: num(lo.total_lrs_remitted_this_fy_inr), purpose: lo.lrs_purpose || null };
  }
};

// ---- form_10ic / form_10id — the company-side regime-election forms,
// mirroring form_10iea's individual/HUF equivalent. Same raw flags
// entitytax-nodes.js/agg10-nodes.js already read for the entity-tax rate
// itself, exposed here as their own leaves rather than importing across
// files (same local-leaf convention as every other Raw node in this file).
NODES.indiaOpt115baaRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.opt_115baa", false) === true; } };
NODES.indiaOpt115babRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.opt_115bab", false) === true; } };

// ---- LIM-2: Form 8938 gauge (computeLimits, computation.js:1466-1476) -----
var CONST_B1_LIMITS = require("./constants.js").CONST.LIMITS; // SYS-1: shared
var CONST_B1_INDIA = require("./constants.js").CONST.TAX.INDIA; // SYS-1: shared
var FORM_8938 = CONST_B1_LIMITS.FORM_8938;
NODES.form8938GaugeResult = {
  deps: ["feie", "usFilingStatusRaw", "accountsListResult", "aggregateLastDayUsdResult", "hasUsScopeBoundaryFtc"],
  compute: function (d) {
    if (!d.hasUsScopeBoundaryFtc) return null;
    var isMfj = d.usFilingStatusRaw === "mfj";
    var abroad = d.feie.taxHomeAbroad && d.feie.testMet;
    var tbl = FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    // Form 8938 is actually TWO independent tests -- highest value at any
    // time during the year, AND value on the last day of the year -- either
    // one breaching its own threshold triggers the filing requirement. The
    // gauge's single (value/limit/pct) shape reports whichever of the two
    // is proportionally worse, so "breached" still fires correctly if only
    // ONE of the two is actually over its threshold.
    var peakUsd = d.accountsListResult.aggregatePeak.usd;
    var lastDayUsd = d.aggregateLastDayUsdResult.usd;
    var peakPct = tbl.anyTime > 0 ? peakUsd / tbl.anyTime : 0;
    var lastDayPct = tbl.lastDay > 0 ? lastDayUsd / tbl.lastDay : 0;
    var useLastDay = lastDayPct > peakPct;
    var valueUsd = useLastDay ? lastDayUsd : peakUsd;
    var limit = useLastDay ? tbl.lastDay : tbl.anyTime;
    var pct = useLastDay ? lastDayPct : peakPct;
    var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
    return { id: "form8938", value: valueUsd, limit: limit, pct: pct, status: status };
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
  // DELIBERATE DAG/engine divergence, same pattern as form_8960/form_8959
  // above (task #44 follow-up, docs/GAP_TRACKER.md) — the engine has no
  // §25B Saver's Credit computation at all, so it never had a Form 8880
  // trigger to model.
  { id: "form_8880", jurisdiction: "US", name: "IRS Form 8880 (Saver's Credit)", desc: "Retirement Savings Contributions Credit — a nonrefundable credit for elective deferrals and IRA contributions by lower/moderate-income filers.", why: "AGI and eligible retirement contributions on file qualify for a nonzero Saver's Credit under §25B.", severity: "info" },
  { id: "form_540", jurisdiction: "US", name: "California Form 540 (Resident Income Tax Return)", desc: "California state income tax return — computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.", severity: "warning" },
  { id: "form_it201", jurisdiction: "US", name: "New York Form IT-201 (Resident Income Tax Return)", desc: "New York state income tax return — computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to New York, and NY taxes worldwide income independently of the federal treaty position.", severity: "warning" },
  // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7, 21
  // Jul 2026): new document trigger, no engine equivalent (NJ wasn't
  // modeled at all before this) — see findings-batch5-nodes.js's
  // usStateTaxResult.
  { id: "form_nj1040", jurisdiction: "US", name: "New Jersey Form NJ-1040 (Resident Income Tax Return)", desc: "New Jersey state income tax return — computed on worldwide income for a full-year NJ resident, including Indian-source income. NJ grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to New Jersey, and NJ taxes worldwide income independently of the federal treaty position.", severity: "warning" },
  // DELIBERATE DAG/engine divergence, same pattern as form_nj1040 above:
  // a brand-new document, not a fixed-up existing trigger, so per the
  // standing frozen-engine policy it's added DAG-only (docs/GAP_TRACKER.md,
  // 22 Jul 2026 audit's catalog-completeness pass). Reg. §1.6038-2 requires
  // Form 8858 from a US person who owns a foreign disregarded entity — Layer
  // 1 US collects TWO real signals for this (foreign_entities.
  // owns_foreign_disregarded_entity, a direct flag; and a Schedule C row
  // with llc_type "foreign_disregarded", the same field normalize.js
  // already reads to route income into foreignSelfEmployment) but the
  // 31-entry catalog had no Form 8858 row at all — confirmed via
  // us_citizen_expat_india (Grace Thomas), who has a real foreign
  // disregarded entity on file (an India-based consulting sole
  // proprietorship) and got no Form 8858 prompt whatsoever.
  { id: "form_8858", jurisdiction: "US", name: "IRS Form 8858 (Foreign Disregarded Entities)", desc: "Information return for US persons who own a foreign disregarded entity or foreign branch.", why: "A foreign disregarded entity is on file (Reg. §1.6038-2) — a single-owner foreign business entity, or a foreign branch of a US business, that isn't itself taxed as a corporation.", severity: "warning" },
  // DELIBERATE DAG/engine divergence, same pattern as form_8858 above — see
  // docs/GAP_TRACKER.md, second (external-research) catalog-completeness
  // pass. This is the ANNUAL RETURN OF THE TRUST ITSELF (or its US agent),
  // separate from form_3520 (the US owner/beneficiary's own return) — a US
  // person treated as the OWNER (not just a beneficiary) of a foreign trust
  // under the grantor-trust rules must ALSO ensure the trust files this.
  // Reuses the same ppfInr/epfInr ownership-signal subset of form_3520's own
  // condition (Indian PPF/EPF accounts are commonly treated as foreign
  // grantor trusts for this purpose) — deliberately NOT the gift-received/
  // beneficiary-distribution subset, since those don't make the US person
  // the trust's "owner."
  { id: "form_3520a", jurisdiction: "US", name: "IRS Form 3520-A (Annual Information Return of Foreign Trust)", desc: "Annual return filed by (or on behalf of) a foreign trust with a US owner — distinct from Form 3520, which the US owner/beneficiary files themselves.", why: "A US person is treated as the owner of a foreign trust for grantor-trust purposes (e.g. an Indian PPF/EPF account) — the trust itself (or a US agent) must file this annually, in addition to the owner's own Form 3520.", severity: "warning" },
  // DELIBERATE DAG/engine divergence, same pattern — s.115JB requires a CA-
  // certified book-profit report whenever MAT actually applies. The engine
  // already computes this exact signal (computed.indiaTax.matApplied,
  // computation.js's computeIndiaEntityTax) but never promoted it to a
  // Filings-tab document — same "computed elsewhere, never surfaced as a
  // filing requirement" pattern as form_6251/AMT before Batch B.
  { id: "form_29b", jurisdiction: "IN", name: "Form 29B (MAT Report)", desc: "Chartered Accountant's report certifying book profit under s.115JB, filed when Minimum Alternate Tax applies.", why: "MAT (s.115JB) applies this year — tax computed on book profit exceeds tax computed under the normal provisions.", severity: "warning" },
  // DELIBERATE DAG/engine divergence, same pattern. An individual/HUF with
  // business/professional income who elects the OLD regime (opting out of
  // the s.115BAC default) must file this declaration by the s.139(1) due
  // date — a salaried/other-income-only filer can just tick a box on the
  // ITR itself instead, no separate form. Reuses the exact condition
  // already independently derived for the (separate, diagnostic-only)
  // "form_10iea" entry in checks-registry-nodes.js.
  { id: "form_10iea", jurisdiction: "IN", name: "Form 10-IEA (Old Regime Election)", desc: "Declaration to opt out of the default new tax regime (s.115BAC) — or to switch back — required for an individual/HUF with business/professional income.", why: "The old tax regime is elected on file, and business/professional income is present — this combination requires a filed Form 10-IEA, not just a checkbox on the ITR.", severity: "info" },
  // DELIBERATE DAG/engine divergence, same pattern — Form 10-IEA's COMPANY-
  // side equivalents. A domestic company opting into the s.115BAA 22%
  // concessional rate (indiaOpt115baaRaw) must file Form 10-IC; a domestic
  // company opting into the s.115BAB 15% new-manufacturing rate
  // (indiaOpt115babRaw) must file Form 10-ID instead — the two elections are
  // mutually exclusive and each has its own form, not a shared one. Both
  // flags already drive entitytax-nodes.js's actual rate/surcharge
  // computation (the india_pvt_ltd demo profile has opt_115baa: true on
  // file already) but neither was ever promoted to a Filings-tab document.
  { id: "form_10ic", jurisdiction: "IN", name: "Form 10-IC (s.115BAA Election)", desc: "Declaration to opt into the 22% concessional corporate tax rate under s.115BAA.", why: "The company has elected the s.115BAA concessional rate on file — this election requires a filed Form 10-IC (on or before the return due date), not just the rate applied silently.", severity: "info" },
  { id: "form_10id", jurisdiction: "IN", name: "Form 10-ID (s.115BAB Election)", desc: "Declaration to opt into the 15% concessional rate for new manufacturing companies under s.115BAB.", why: "The company has elected the s.115BAB new-manufacturing concessional rate on file — this election requires a filed Form 10-ID, distinct from (and mutually exclusive with) Form 10-IC.", severity: "info" },
  // DELIBERATE DAG/engine divergence, same pattern as form_8858/form_29b
  // above — docs/GAP_TRACKER.md entity-filings-audit round (Entity Trust
  // Parity Plan §3.6): "Form 1120 itself, Schedule M-1/M-2, K-1 issuance"
  // had never had their own audit round. Form 1120's own Return Form logic
  // was already reviewed (Batch E) and is correct, but Schedules L/M-1/M-2
  // and K-1 issuance are two SEPARATE filing obligations that attach to that
  // return and had no Documents-tab entry at all. Reg./instructions test:
  // Form 1120/1120-S — Schedule L (balance sheet)/M-1/M-2 not required if
  // total receipts AND total assets at year end are each under $250,000
  // (Form 1120 Sch. K Q13 / Form 1120-S Sch. B Q10); Form 1065 — same
  // exemption at $250,000 receipts / $1,000,000 assets (Sch. B Q4). Layer 1
  // collects the entity's own total-assets figure (corporate_financials.
  // schedule_l) but has no distinct entity-level TOTAL RECEIPTS field (only
  // per-branch self-employment gross_receipts_usd, an unrelated individual
  // concept) — so only the total-assets prong is checked here, same
  // single-available-signal honesty as the FIRPTA/Form 8865 entity-level
  // gaps: a company under the assets threshold that nonetheless has
  // $250k+ of receipts would show N/A here, a named imprecision, not a
  // guess.
  { id: "schedule_m1_m2", jurisdiction: "US", name: "Form 1120/1120-S/1065 Schedules L, M-1 & M-2", desc: "Balance sheet (Schedule L) and book-to-tax income reconciliation (Schedule M-1) and retained-earnings reconciliation (Schedule M-2), filed with the entity's own return.", why: "The entity's own return is Form 1120, 1120-S, or 1065, and total assets on file meet or exceed the small-entity exemption threshold ($250,000 for a corporation, $1,000,000 for a partnership) — below that, these schedules can be skipped.", severity: "warning" },
  // Same pattern — K-1 issuance to owners is a distinct obligation from the
  // Schedule L/M-1/M-2 book-tax reconciliation above, and unlike it has NO
  // small-entity exemption: any partnership or S-corp that files at all must
  // issue a Schedule K-1 to every partner/shareholder for their distributive
  // share (IRC §6031(b)/§6037(b)); a trust/estate (Form 1041) issues K-1s
  // only to beneficiaries who actually received a distribution this year
  // (usTaxResult.trustDistributedUsd, the same figure the trust branch of
  // usEntityResult already computes for the retained-vs-distributed split).
  { id: "k1_issuance", jurisdiction: "US", name: "Schedule K-1 Issuance to Owners", desc: "Each partner's/shareholder's/beneficiary's distributive share of income, deductions and credits — issued alongside the entity's own return, not filed separately.", why: "The entity's own return is Form 1065 or 1120-S (K-1 issuance to every partner/shareholder is mandatory whenever that return is filed, with no small-entity exemption), or Form 1041 with a distribution actually made to a beneficiary this year.", severity: "critical" },
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
  { id: "form_4868", jurisdiction: "US", name: "IRS Form 4868 (Extension Request)", desc: "Automatic 6-month extension of time to file (not to pay) the US return.", why: "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar — the extension does not happen automatically.", severity: "info" },
  // DELIBERATE DAG/engine divergence, same pattern as form_8880/form_nj1040
  // above (task #47, ITIN-filing gate) — the engine has no ITIN-gate concept
  // at all. Modeled on form_15ca_cb/lrs_form_a2's own severity: "info" since
  // this is a required document, not itself a finding of wrongdoing —
  // itinApplicationRequiredFinding (report-batch5-nodes.js) is the loud,
  // severity: "critical" warning that filing is actually BLOCKED without it.
  { id: "form_w7", jurisdiction: "US", name: "IRS Form W-7 (ITIN Application)", desc: "Application for an IRS Individual Taxpayer Identification Number, for anyone listed on a US return who isn't eligible for an SSN.", why: "No SSN, ITIN, or ATIN is on file for this taxpayer and no Form W-7 application is recorded as already filed — one is required before a 1040/1040-NR listing this person can actually be filed (IRC §6109).", severity: "info" },
  // DELIBERATE DAG/engine divergence, same pattern as form_w7 above (task
  // #48, LRS-investor flag) — the engine's computeLrsTcs was already ported
  // (report-batch4-nodes.js, AGG-8) but never promoted to a Filings-tab
  // document, only a Withholding-tab summary row. Form 27D is the TCS
  // certificate the AUTHORIZED DEALER (bank) issues to the remitter — the
  // remitter's own counterpart to Form 16A, needed to actually claim the
  // TCS as a credit in the ITR.
  { id: "form_27d", jurisdiction: "IN", name: "Form 27D (TCS Certificate)", desc: "Certificate issued by the Authorized Dealer/bank for Tax Collected at Source on an outward LRS remittance.", why: "An LRS remittance for investment or gift/donation purposes exceeded the ₹10L base threshold — s.206C(1G) TCS was collected on the excess, and Form 27D is needed to claim it as a credit in the ITR.", severity: "info" }
];

NODES.buildDocumentsResult = {
  deps: ["residencyResult", "accountsListResult", "form8938GaugeResult", "taxesPaidIndiaResult", "entityFormsResult",
    "feieRaw", "treatyUsResidenceRaw", "treatyFiles1040nrRaw", "treatyIndiaResidenceRaw",
    "indianMutualFundsResult", "usPficHoldingsRaw", "usSecuritiesRaw", "usOwnsForeignDisregardedEntityRaw", "usSelfEmploymentRaw", "usForeignPartnershipsRaw", "bizEntriesAgg", "ppfInrRaw", "epfInrRaw", "foreignGiftsRaw",
    "usTaxResult", "headlineTotalIncomeUsdResult", "usFilingStatusRaw", "aggregateUsIncomeResult",
    "taxesPaidUsResult", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc",
    "limitsRawExtra", "totalIncomeInrV3", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "viaForeignCorpXbr4", "usStateTaxResult", "nraRaw",
    "entityTaxResult", "taxRegime", "businessComputation", "indiaOpt115baaRaw", "indiaOpt115babRaw", "presumptiveLockinAgg", "usCorpScheduleLRaw",
    "hasUsScope", "ssnOrItinTypeRaw", "usEntityKind", "lrsOutboundRaw"],
  compute: function (d) {
    var res = d.residencyResult;
    var isForm1118 = d.entityFormsResult.usReturnForm === "1120";
    // "US person" for information-return purposes (FBAR/FATCA/CFC/PFIC):
    // individual (citizen/resident alien) OR a domestic entity — a US-
    // organized corp/S-corp/partnership/trust can independently own foreign
    // accounts/CFC stock/PFIC shares with its own filing obligation, same
    // engine/conflicts.js fix, generalized past just C-corps (isForm1118).
    var isUsDomesticEntity = ["1120", "1120-S", "1065", "1041"].indexOf(d.entityFormsResult.usReturnForm) !== -1;
    var isUsPerson = res.us.isResident || isUsDomesticEntity;
    var t = indiaBusinessTurnoverInr(d.bizEntriesAgg);
    var atLeast95PctDigital = t.totalInr > 0 && (t.cashInr / t.totalInr) <= 0.05;
    var form8938 = d.form8938GaugeResult;

    var triggers = {
      fincen_114: d.accountsListResult.aggregatePeak.usd > 10000 && isUsPerson,
      form_8938: !!form8938 && form8938.status === "breached" && isUsPerson,
      // NOT broadened to isUsPerson: Form 1118 vs 1116 is a real, C-corp-
      // specific distinction (a pass-through S-corp/partnership's FTC flows
      // to its owners' own 1040/1116, not the entity's own return).
      form_1116: d.taxesPaidIndiaResult.total.usd > 0 && (res.us.isResident || isForm1118),
      form_2555: d.feieRaw.claimed,
      // Same engine/conflicts.js fix: files1040nr alone doesn't mean a
      // treaty position was taken. d.nraRaw.treatyRateClaims is the precise
      // signal (already trusted by the W-8BEN finding).
      form_8833: res.dualResident || d.treatyUsResidenceRaw !== "none" ||
                 (d.nraRaw && (d.nraRaw.treatyRateClaims || []).length > 0),
      // Was only checking indianMutualFundsResult (India-side financial_
      // holdings filtered for "mutual_fund"), ignoring Layer 1 US's own
      // dedicated "PFIC Holdings" card (usPficHoldingsRaw) entirely — a
      // user who fills in only the US-side card (holds PFICs through a
      // vehicle other than an India-side mutual fund entry, or just didn't
      // duplicate the same holding on both forms) got Form 8621 silently
      // marked N/A despite explicitly saying they hold PFICs. Masked in
      // every demo profile because whoever built them always populated
      // both fields together for the same holding.
      // Step 8's own "Comprehensive Foreign Assets" screen (addHoldingRow/
      // syncHoldingsState) runs its own live PFIC income/asset/financial-
      // institution-exception test and tags each row pfic_classification:
      // "passive_foreign_investment_company_section_1297" -- a THIRD signal
      // (usSecuritiesRaw, separate from both indianMutualFundsResult and
      // usPficHoldingsRaw) that was never read here either. A taxpayer who
      // adds a foreign ETF or PE/CFC-adjacent holding through this screen's
      // primary UI path (the "+ Add Holding" button, not a separate India-
      // side mutual fund entry or the foreign_entities.pfic_holdings card)
      // saw a live "Reportable (Form 8621)" badge but got no Form 8621 in
      // their actual computed results.
      form_8621: (d.indianMutualFundsResult.length > 0 || d.usPficHoldingsRaw.length > 0 ||
                  d.usSecuritiesRaw.some(function (h) { return h.pfic_classification === "passive_foreign_investment_company_section_1297"; })) && isUsPerson,
      // Was checking d.bizEntriesAgg.length > 0 (India-side domestic
      // business_entries, an unrelated concept) — same engine/conflicts.js
      // bug, fixed the same way: viaForeignCorpXbr4 is the correct CFC-
      // ownership signal (form_3ceb below already uses it). Broadened to
      // isUsPerson (any domestic entity, not just C-corp).
      form_5471: d.viaForeignCorpXbr4 && isUsPerson,
      form_8865: d.usForeignPartnershipsRaw.length > 0 && isUsPerson,
      // Was OR'ing receivedAbove100k/isTrustBeneficiary in unconditionally —
      // Form 3520 (IRC §6039F) is US-persons-only; gated the whole trigger
      // behind isUsPerson instead of just the ppfInr/epfInr clause.
      form_3520: isUsPerson && ((d.ppfInrRaw > 0 || d.epfInrRaw > 0) || d.foreignGiftsRaw.receivedAbove100k || d.foreignGiftsRaw.isTrustBeneficiary),
      // Only the OWNERSHIP subset of form_3520's own condition — a gift
      // received or a plain beneficiary distribution doesn't make the US
      // person the trust's "owner," so 3520-A (the trust's own return)
      // doesn't apply to those cases the way it does to a PPF/EPF holder.
      form_3520a: isUsPerson && (d.ppfInrRaw > 0 || d.epfInrRaw > 0),
      // Same engine/conflicts.js fix: the OR'd NON_RESIDENT_ALIEN status
      // check was a false positive on every "zero US exposure" placeholder
      // profile — treatyFiles1040nrRaw (the explicit Layer 1 US flag) is
      // the correct, sufficient signal on its own.
      form_1040nr: d.treatyFiles1040nrRaw,
      form_8960: d.headlineTotalIncomeUsdResult > ((CONST_B1_LIMITS.NIIT_THRESHOLD)[d.usFilingStatusRaw] || 200000) &&
        (d.aggregateUsIncomeResult.interestUs.usd + d.aggregateUsIncomeResult.ordinaryDividendsUs.usd + d.aggregateUsIncomeResult.capitalGainsUs.usd) > 0,
      form_8959: d.usTaxResult.additionalMedicareUsd > 0,
      form_8880: (d.usTaxResult.saversCreditUsd || 0) > 0,
      // See engine/conflicts.js's form_67 comment: was the wrong field
      // (foreignSourceTotal, an unrelated US-model concept) OR'd with a bare
      // isResident catch-all — false-positive on 6/12 demo profiles. Fixed
      // to usSourceTotal, properly ANDed with the ROR gate (RNOR/NR aren't
      // taxed on foreign income in India, matching schedule_fa 2 lines down).
      form_67: res.india.status === "ROR" &&
               (d.aggregateUsIncomeResult.usSourceTotal.usd > 0 || d.taxesPaidUsResult.total.usd > 0),
      trc: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
      form_10f: res.dualResident || d.treatyIndiaResidenceRaw !== "none",
      schedule_fa: res.india.status === "ROR" && (d.aggregateUsIncomeResult.usSourceTotal.usd > 0 ||
                   d.accountsListResult.accounts.some(function (a) { return a.country !== "India"; }) ||
                   d.usSecuritiesRaw.some(function (h) { return (h.peak_balance_usd || 0) > 0; })),
      // See engine/conflicts.js's schedule_fsi_tr comment: same bug class as
      // form_67 above — no ROR gate, false positive for a plain NR.
      schedule_fsi_tr: res.india.status === "ROR" &&
                        (d.taxesPaidUsResult.total.usd > 0 || d.aggregateUsIncomeResult.usSourceTotal.usd > 0),
      form_15ca_cb: d.limitsRawExtra.lrsRemittedInr > 0,
      // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6,
      // 21 Jul 2026): AOP/Trust excluded here too, consistent with how firm
      // is already treated (whether or not firm's own exclusion is itself
      // fully correct is a separate, pre-existing question, out of scope).
      schedule_al: !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust && d.totalIncomeInrV3 > 5000000,
      // s.44AD(5): once the s.44AD(4) 5-year presumptive re-election lock-in
      // is active (presumptiveLockinAgg), a mandatory tax audit applies in
      // ANY locked-out year the taxpayer's total income exceeds the basic
      // exemption limit — regardless of turnover, and regardless of whether
      // this year's business is even presumptive-eligible at all. Genuinely
      // additive to the existing turnover-threshold/company triggers, not a
      // replacement (gap tracker IN-6's "audit-if-opt-out interplay").
      form_3cb_3cd: d.indiaIsCompany || (t.totalInr > 0 && t.totalInr > (atLeast95PctDigital ? 100000000 : 10000000)) ||
        (d.presumptiveLockinAgg.lockInActive && d.totalIncomeInrV3 > ((d.taxRegime === "OLD" ? CONST_B1_INDIA.SLABS_OLD : CONST_B1_INDIA.SLABS_NEW)[0][0])),
      form_8802: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
      form_6251: d.usTaxResult.amtUsd > 0,
      form_8288: !!(d.nraRaw.usRealPropertyDisposed && (d.nraRaw.firptaWithholdingUsd || 0) > 0),
      form_3ceb: d.viaForeignCorpXbr4,
      form_26as_ais_tis: d.hasIndiaScopeXbr,
      form_16_16a: d.hasIndiaScopeXbr,
      lrs_form_a2: d.limitsRawExtra.lrsRemittedInr > 0,
      form_4868: d.hasUsScopeBoundaryFtc,
      form_w7: d.hasUsScope && d.usEntityKind === "individual" && !d.nraRaw.w7ItinApplicationFiled &&
               (d.ssnOrItinTypeRaw === "none" || (d.nraRaw.s6013hElection && d.nraRaw.spouseSsnOrItinType === "none")),
      form_27d: (d.lrsOutboundRaw.purpose === "investment" || d.lrsOutboundRaw.purpose === "gift_donation") &&
                d.lrsOutboundRaw.totalRemittedInr > LRS_TCS_THRESHOLD_INR_B1,
      form_540: !!d.usStateTaxResult && d.usStateTaxResult.state === "CA",
      form_it201: !!d.usStateTaxResult && d.usStateTaxResult.state === "NY",
      form_nj1040: !!d.usStateTaxResult && d.usStateTaxResult.state === "NJ",
      // DELIBERATE DAG/engine divergence, same reasoning as form_nj1040
      // above — see the DOCUMENTS_CATALOG entry for the full explanation.
      form_8858: d.usOwnsForeignDisregardedEntityRaw ||
                 d.usSelfEmploymentRaw.some(function (s) { return s.llc_type === "foreign_disregarded"; }),
      // matApplied is only meaningful for the company branch of
      // entityTaxResult (MAT/s.115JB only applies to companies) — gating on
      // indiaIsCompany ensures it's read from the right branch.
      form_29b: d.indiaIsCompany && !!d.entityTaxResult.matApplied,
      // Same condition already independently derived for the diagnostic-
      // only "form_10iea" checks-registry entry (checks-registry-nodes.js) —
      // reused here rather than re-derived, now promoted to a real document.
      form_10iea: d.taxRegime === "OLD" && !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust &&
                  (d.businessComputation.businessInr || 0) > 0,
      // Company-side equivalents of form_10iea — mutually exclusive
      // elections, each with its own form.
      form_10ic: d.indiaIsCompany && d.indiaOpt115baaRaw,
      form_10id: d.indiaIsCompany && d.indiaOpt115babRaw,
      // Only the total-assets prong of the real small-entity exemption test —
      // see the DOCUMENTS_CATALOG entry above for the honest receipts-prong
      // gap. $1M threshold for a partnership (Form 1065 Sch. B Q4), $250k for
      // a corporation (Form 1120 Sch. K Q13 / Form 1120-S Sch. B Q10).
      schedule_m1_m2: ["1120", "1120-S", "1065"].indexOf(d.entityFormsResult.usReturnForm) !== -1 &&
        Math.max(d.usCorpScheduleLRaw.assets_ending || 0, d.usCorpScheduleLRaw.assets_beginning || 0) >=
        (d.entityFormsResult.usReturnForm === "1065" ? 1000000 : 250000),
      // No small-entity exemption, unlike schedule_m1_m2 above — K-1
      // issuance is mandatory whenever the return itself is a partnership or
      // S-corp return; a trust/estate issues K-1s only when it actually
      // distributed to a beneficiary this year.
      k1_issuance: d.entityFormsResult.usReturnForm === "1065" || d.entityFormsResult.usReturnForm === "1120-S" ||
        (d.entityFormsResult.usReturnForm === "1041" && (d.usTaxResult.trustDistributedUsd || 0) > 0)
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
  deps: ["hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "usEntityKind",
    "businessComputation", "indiaFinancialHoldingsTxRaw", "aggregateUsIncomeResult"],
  compute: function (d) {
    var notes = [];
    var hasIndia = d.hasIndiaScopeXbr, hasUs = d.hasUsScopeBoundaryFtc, dual = hasIndia && hasUs;
    var hasIndiaBusiness = d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust || d.usEntityKind !== "individual" || (d.businessComputation.businessInr || 0) > 0;
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
