"use strict";
/* ============================================================================
 * model.assets (normalize.js:2541-2714) — never a target of AGG-10 itself.
 * That closure explicitly scoped it out: nothing this migration's own TAX
 * computation reads model.assets, since every real consumer reads the raw
 * form fields directly or an already-derived boundary node under a
 * different name (indianBusinessesBoundary, usSecuritiesBoundary, etc.).
 *
 * monitor-next's Holdings and Business tabs are the first REAL consumer —
 * dag-adapter.js's assembled `model` object never had an `.assets` key at
 * all until this file, so HoldingsView/BusinessView would throw "Cannot
 * read properties of undefined (reading 'indianSecurities'/'businessEntities')"
 * the instant either tab opened under DAG mode. Exactly the "adapter
 * coverage gap, not a tax-logic bug" failure mode this pass exists to close.
 *
 * Reused wholesale, not re-derived, wherever an exact source-line match
 * already existed (checked field-for-field against normalize.js, not
 * assumed from the node name): indianMutualFundsResult (report-batch1-
 * nodes.js), indianBusinessesBoundary/usSecuritiesBoundary (agg10-nodes.js),
 * indiaFinancialHoldingsTxRaw/epfInrRaw/ppfInrRaw/npsInrRaw/
 * taxableEpfInterestInrAgg/taxableNpsWithdrawalInrAgg (findings-batch3-
 * nodes.js), usForeignCorpsRaw/usOwns10PctForeignCorpRaw (crossbasis-
 * nodes.js), presumptiveEligibilityAgg/bizEntriesAgg/bizAssetBlocksAgg/
 * bizMsmePayablesAgg (aggregateindiaincome-nodes.js), selfEmployment-
 * DepreciationPlan/uiAgg (aggregateusincome-nodes.js).
 *
 * Two small additive extensions needed along the way, both non-breaking,
 * both re-verified against their own existing runners immediately after:
 *   - aggregateusincome-nodes.js's aggregateAssetDepreciationUsd gained a
 *     `class` field on each asset's calc result and an `assets[]` array per
 *     business (normalize.js L1600-1603) — previously dropped since
 *     nothing there read the per-asset trace, only the summed total.
 *   - aggregateindiaincome-nodes.js's presumptiveEligibilityAgg gained
 *     indiaStatus/entityType/rorFails (normalize.js L279-282) — previously
 *     dropped for the same reason, needed here so businessEntryIncomeTrace's
 *     ceiling-miss note can name the actual reason (residency vs. entity
 *     type) instead of a vague catch-all.
 *
 * Genuinely new port, read fresh from source, not available anywhere else
 * in the DAG: businessEntities — one row per real entity (US self-return
 * via Schedule M-1, self-employment/farm/partnership/S-corp/trust K-1s, US
 * C-corp 1120, Indian PGBP business entries, foreign corporations/CFC),
 * each with its own calc/source trace, merged by name so a company the
 * taxpayer merely OWNS (a CFC) doesn't double-count against their own
 * PGBP/self-employment income when the same entity appears both ways.
 *
 * Verified in run-assets.js against production's real model.assets, all 12
 * fixtures (SAMPLE + 11 PROFILES).
 * ==========================================================================*/
var baseNodes = require("./ustax-full-nodes.js").NODES;
var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
var fxRate = require("./fx-util.js").fxRate;

/* Trace helpers — same {kind,...} shape report-batch1-nodes.js's calc/
 * source/holdings already established (conflicts.js:1688-1690). */
function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }

/* SYS-1: shared import. */
var CONST_ASSETS = require("./constants.js").CONST;
var ASSET_CLASS_RATES_INDIA = CONST_ASSETS.TAX.INDIA.ASSET_CLASS_RATES_INDIA;

/* ---- self-employment trace (normalize.js:1414-1447) ----------------------- */
function computeSelfEmploymentNetProfitUsd(s) {
  var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
  var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
  return grossProfit + num(s.other_income_usd) - num(s.expenses_usd);
}
function selfEmploymentNetProfitUsd(s, depreciationUsd) {
  var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
  if (explicit !== undefined && explicit !== null) return num(explicit);
  return computeSelfEmploymentNetProfitUsd(s) - num(depreciationUsd || 0);
}
function selfEmploymentIncomeTrace(s, depreciationPlanEntry) {
  var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
  if (explicit !== undefined && explicit !== null) {
    return source("Net self-employment earnings entered directly on Layer 1 US for this business (not derived from gross receipts and expenses).");
  }
  var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
  var parts = [{ label: "Gross receipts", amount: num(s.gross_receipts_usd) }];
  if (num(s.returns_and_allowances_usd) > 0) parts.push({ label: "Less: returns & allowances", amount: -num(s.returns_and_allowances_usd) });
  if (cogs > 0) parts.push({ label: "Less: cost of goods sold", amount: -cogs });
  if (num(s.other_income_usd) > 0) parts.push({ label: "Plus: other business income", amount: num(s.other_income_usd) });
  if (num(s.expenses_usd) > 0) parts.push({ label: "Less: business expenses", amount: -num(s.expenses_usd) });
  (depreciationPlanEntry ? depreciationPlanEntry.assets : []).forEach(function (a) {
    var label = "Asset (" + a.class + ", yr " + a.yearN + ")";
    if (a.sec179Usd > 0) parts.push({ label: label + " — §179", amount: -a.sec179Usd });
    if (a.bonusUsd > 0) parts.push({ label: label + " — 100% bonus depreciation", amount: -a.bonusUsd });
    if (a.macrsUsd > 0) parts.push({ label: label + " — MACRS", amount: -a.macrsUsd });
  });
  return calc("Schedule C: gross receipts less returns/COGS, plus other income, less expenses, less asset depreciation (§179 / 100% bonus, permanent under OBBBA / MACRS — computed from each asset's own class and placed-in-service date, not Layer 1's own first-year-only preview). Home-office isn't netted yet (Phase 1).", parts);
}

/* ---- farm trace (aggregateusincome-nodes.js) — mirrors self-employment's
 * own phantom-field fix: gross_income_usd/net_profit_usd are never written
 * by the live form; real gross income is the sum of itemized_income{}'s
 * line items, netted against the accrual inventory swing when applicable. */
function computeFarmGrossIncomeUsd(f) {
  var inc = safe(f, "itemized_income", {}) || {};
  var gross = num(inc.sales_livestock_produce_raised) + num(inc.sales_livestock_produce_purchased) +
    num(inc.cooperative_distributions) + num(inc.agricultural_program_payments) + num(inc.ccc_loans) +
    num(inc.crop_insurance_proceeds) + num(inc.custom_hire_income) + num(inc.other_income);
  if (f.accounting_method === "accrual") {
    var inv = safe(f, "inventory", {}) || {};
    gross -= (num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory));
  }
  return gross;
}
function computeFarmNetProfitUsd(f) { return computeFarmGrossIncomeUsd(f) - num(f.expenses_usd); }
function farmNetProfitUsd(f, depreciationUsd) {
  if (f.net_profit_usd !== undefined && f.net_profit_usd !== null) return num(f.net_profit_usd);
  if (f.gross_income_usd !== undefined && f.gross_income_usd !== null) return num(f.gross_income_usd) - num(f.expenses_usd) - num(depreciationUsd || 0);
  return computeFarmNetProfitUsd(f) - num(depreciationUsd || 0);
}
function farmIncomeTrace(f, depreciationPlanEntry) {
  if (f.net_profit_usd !== undefined && f.net_profit_usd !== null) {
    return source("Net farm profit entered directly on Layer 1 US for this farm (not derived from Schedule F line items).");
  }
  if (f.gross_income_usd !== undefined && f.gross_income_usd !== null) {
    return source("Gross farm income entered directly on Layer 1 US for this farm (gross_income_usd), net of expenses_usd and asset depreciation.");
  }
  var inc = safe(f, "itemized_income", {}) || {};
  var parts = [];
  [["sales_livestock_produce_raised", "Sales of livestock/produce raised"], ["sales_livestock_produce_purchased", "Sales of livestock/produce bought for resale"],
   ["cooperative_distributions", "Cooperative distributions"], ["agricultural_program_payments", "Agricultural program payments"],
   ["ccc_loans", "CCC loans"], ["crop_insurance_proceeds", "Crop insurance proceeds"], ["custom_hire_income", "Custom hire income"], ["other_income", "Other farm income"]
  ].forEach(function (pair) { if (num(inc[pair[0]]) !== 0) parts.push({ label: pair[1], amount: num(inc[pair[0]]) }); });
  if (f.accounting_method === "accrual") {
    var inv = safe(f, "inventory", {}) || {};
    var invAdj = num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory);
    if (invAdj !== 0) parts.push({ label: "Less: cost of livestock/items purchased for resale (accrual inventory)", amount: -invAdj });
  }
  if (num(f.expenses_usd) !== 0) parts.push({ label: "Less: farm operating expenses", amount: -num(f.expenses_usd) });
  (depreciationPlanEntry ? depreciationPlanEntry.assets : []).forEach(function (a) {
    var label = "Asset (" + a.class + ", yr " + a.yearN + ")";
    if (a.sec179Usd > 0) parts.push({ label: label + " — §179", amount: -a.sec179Usd });
    if (a.bonusUsd > 0) parts.push({ label: label + " — 100% bonus depreciation", amount: -a.bonusUsd });
    if (a.macrsUsd > 0) parts.push({ label: label + " — MACRS", amount: -a.macrsUsd });
  });
  return calc("Schedule F: sum of itemized farm income lines, less accrual inventory adjustment (if applicable), less expenses, less asset depreciation (§179 / 100% bonus / MACRS).", parts);
}

/* ---- India business-entry trace (normalize.js:56-165, 534-623) ------------ */
var PRESUMPTIVE_CEILING_CITATION = "s.44AD/44ADA turnover ceilings (Rs.2cr/Rs.3cr and Rs.50L/Rs.75L, the higher figure requiring digital receipts ≥95% of total) verified 2026-07-12, matched to Layer 1 India's own live eligibility check — re-check each Finance Act cycle.";
var PRESUMPTIVE_RESIDENCY_CITATION = "s.44AD/44ADA residency and entity-type eligibility (ROR-only; 44AD additionally excludes firms/LLPs/companies/AOPs/trusts/local authorities/co-ops, 44ADA further excludes HUFs) verified 2026-07-12, matched to Layer 1 India's own live eligibility check.";
function isUnder180DaysAdditionInr(additionDateStr) {
  if (!additionDateStr) return false;
  var d = new Date(additionDateStr);
  if (isNaN(d.getTime())) return false;
  var month = d.getMonth(), date = d.getDate();
  return (month === 9 && date >= 4) || month > 9 || month <= 2;
}
function computeAssetBlockNormalDepreciationInr(block) {
  var rate = ASSET_CLASS_RATES_INDIA[block.asset_class];
  if (!rate) return 0;
  var opening = num(block.opening_wdv_inr), additions = num(block.additions_during_year_inr), sale = num(block.sale_consideration_inr);
  var wdvBeforeDep = opening + additions - sale;
  if (wdvBeforeDep <= 0) return 0;
  var halfYear = additions > 0 && isUnder180DaysAdditionInr(block.addition_date);
  if (!halfYear) return wdvBeforeDep * rate;
  var fullRateBase = Math.max(0, opening - sale);
  var saleAgainstAdditions = Math.max(0, sale - opening);
  var halfRateBase = Math.max(0, additions - saleAgainstAdditions);
  return Math.min(wdvBeforeDep, fullRateBase * rate + halfRateBase * rate * 0.5);
}
function additionalDepreciationEligibleInr(india, entry) {
  var entityType = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
  var isCompany = entityType === "company";
  var isConcessionalCompany = isCompany && (safe(india, "profile.opt_115baa", false) === true || safe(india, "profile.opt_115bab", false) === true || safe(india, "profile.opt_115ba", false) === true);
  var isNewRegimeIndHuf = (entityType === "individual" || entityType === "huf") && (safe(india, "profile.tax_regime", "NEW") || "NEW").toUpperCase() !== "OLD";
  var regimeDisallows = isConcessionalCompany || isNewRegimeIndHuf;
  var hasMfgOrPowerGen = entry.business_code === "01000" || entry.business_code === "power_gen";
  return hasMfgOrPowerGen && !regimeDisallows;
}
function computeAssetBlockAdditionalDepreciationInr(block, india, entry) {
  if (block.asset_class !== "plant_machinery_general" || block.is_new_manufacturing_asset !== true) return 0;
  var additions = num(block.additions_during_year_inr);
  if (additions <= 0) return 0;
  if (!additionalDepreciationEligibleInr(india, entry)) return 0;
  var rate = isUnder180DaysAdditionInr(block.addition_date) ? 0.10 : 0.20;
  return additions * rate;
}
function aggregateEntryDepreciationInr(entryIdx, assetBlocks, india, entry) {
  var total = 0;
  (assetBlocks || []).forEach(function (block) {
    if (block.unit_biz_idx !== entryIdx) return;
    total += computeAssetBlockNormalDepreciationInr(block);
    total += computeAssetBlockAdditionalDepreciationInr(block, india, entry);
  });
  return total;
}
function computeMsmeDisallowanceInr(entryIdx, msmePayables) {
  var total = 0, today = new Date(); today.setHours(0, 0, 0, 0);
  (msmePayables || []).forEach(function (m) {
    if (m.unit_biz_idx !== entryIdx) return;
    var amt = num(m.amount_inr);
    if (!m.invoice_date || amt <= 0) return;
    var invDate = new Date(m.invoice_date); invDate.setHours(0, 0, 0, 0);
    if (isNaN(invDate.getTime())) return;
    var dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + (m.has_written_agreement === true ? 45 : 15));
    var refDate = m.payment_date ? new Date(m.payment_date) : today;
    refDate.setHours(0, 0, 0, 0);
    if (refDate > dueDate) total += amt;
  });
  return total;
}
function aggregateEntryDisallowancesInr(entryIdx, exp, msmePayables) {
  var s40aI = num(exp.payments_to_non_residents_no_tds_inr);
  var s40aIa = Math.round(num(exp.payments_to_residents_no_tds_inr) * 0.30);
  var s40A3 = num(exp.total_cash_payments_exceeding_limit_inr) + num(exp.total_cash_payments_exceeding_35k_inr);
  var s43Bh = computeMsmeDisallowanceInr(entryIdx, msmePayables);
  return s40aI + s40aIa + s40A3 + s43Bh;
}
function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
  var total = digitalInr + cashInr;
  var atLeast95PctDigital = total > 0 && (cashInr / total) <= 0.05;
  if (scheme === "s44AD") return atLeast95PctDigital ? 30000000 : 20000000;
  if (scheme === "s44ADA") return atLeast95PctDigital ? 7500000 : 5000000;
  return Infinity;
}
function usesRegularBooksInr(b, eligibility) {
  var scheme = b.presumptive_scheme;
  if (scheme === "s44AD") { var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr); return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh)); }
  if (scheme === "s44ADA") { var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr); var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh); return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)); }
  if (scheme === "s44AE") return false;
  // s.44BB (non-resident, mineral-oil services) / s.44BBB (foreign company,
  // civil construction/turnkey power projects) — flat 10% presumptive, no
  // eligibility/ceiling test (aggregateindiaincome-nodes.js's businessComputation
  // mirror, IN-26).
  if (scheme === "s44BB" || scheme === "s44BBB") return false;
  return true;
}
function computeBusinessEntryNetProfitInr(b, eligibility, depreciationInr, disallowancesInr) {
  eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
  var scheme = b.presumptive_scheme;
  var adaReceipts;
  if (scheme === "s44AD") {
    var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
    if (eligibility.eligible44AD && dig44AD + csh44AD <= presumptiveCeilingInr("s44AD", dig44AD, csh44AD)) return dig44AD * 0.06 + csh44AD * 0.08;
  } else if (scheme === "s44ADA") {
    var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
    adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
    if (eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)) return adaReceipts * 0.50;
  } else if (scheme === "s44AE") return null;
  else if (scheme === "s44BB" || scheme === "s44BBB") return Math.round((num(b.turnover_inr) + num(b.cash_receipts_inr)) * 0.10);
  var exp = b.expenses || {};
  var pfEsiDeductibleInr = exp.employer_pf_esi_paid_before_due_date === true ? num(exp.employer_pf_esi_contribution_inr) : 0;
  var deductibleBeforeDisallowances = num(exp.rent_for_business_premises_inr) + num(exp.repairs_maintenance_inr) +
    num(exp.employee_salary_wages_inr) + num(exp.employee_bonus_commission_inr) + num(exp.interest_on_borrowed_capital_inr) +
    num(exp.insurance_premium_inr) + num(exp.bad_debts_written_off_inr) + num(exp.other_business_expenses_inr) +
    num(exp.ca_professional_fees_inr) + pfEsiDeductibleInr;
  var deductible = Math.max(0, deductibleBeforeDisallowances - num(disallowancesInr));
  var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
  var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) ||
    (scheme === "s44AD" ? (dig + csh) : 0) || (scheme === "s44ADA" ? adaReceipts : 0);
  return receipts - deductible - num(depreciationInr);
}
function businessEntryIncomeTrace(b, eligibility, depreciationInr, disallowancesInr) {
  eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
  var explicit = b.net_profit_inr != null ? b.net_profit_inr : b.net_profit;
  if (explicit !== undefined && explicit !== null) {
    return source("Net profit entered directly on Layer 1 India for this business entry (not derived from a presumptive rate or books).");
  }
  var scheme = b.presumptive_scheme, ceilingNote = null, ceilingCitation = null;
  var dig44AD, csh44AD, adaDig, adaCsh, adaReceipts;
  if (scheme === "s44AD") {
    dig44AD = num(b.digital_receipts_inr); csh44AD = num(b.cash_receipts_inr);
    var ceiling44AD = presumptiveCeilingInr("s44AD", dig44AD, csh44AD);
    if (eligibility.eligible44AD && dig44AD + csh44AD <= ceiling44AD) {
      return calc("Presumptive income under s.44AD: digital/banking receipts × 6% + cash receipts × 8%", [
        { label: "Digital / banking receipts", amount: dig44AD },
        { label: "Rate", display: "6%" },
        { label: "Cash receipts", amount: csh44AD },
        { label: "Rate", display: "8%" }
      ], PRESUMPTIVE_CEILING_CITATION);
    }
    if (!eligibility.eligible44AD) {
      var why44AD = eligibility.rorFails
        ? "this taxpayer's India residency status is " + (eligibility.indiaStatus || "not on file") + ", not Resident & Ordinarily Resident (ROR)"
        : "this taxpayer's entity type (" + eligibility.entityType + ") is one s.44AD excludes (firms/LLPs/companies/AOPs/trusts/local authorities/co-ops)";
      ceilingNote = "s.44AD is only available to Resident & Ordinarily Resident (ROR) individuals/HUFs and eligible firms — " + why44AD + ", so the presumptive election is invalid and regular books apply instead:";
      ceilingCitation = PRESUMPTIVE_RESIDENCY_CITATION;
    } else {
      ceilingNote = "Total receipts (₹" + Math.round(dig44AD + csh44AD).toLocaleString("en-IN") + ") exceed the s.44AD turnover ceiling for this cash-receipts mix (₹" + Math.round(ceiling44AD).toLocaleString("en-IN") + ") — the presumptive election is invalid above this, so regular books apply instead:";
      ceilingCitation = PRESUMPTIVE_CEILING_CITATION;
    }
  } else if (scheme === "s44ADA") {
    adaDig = num(b.ada_digital_receipts_inr); adaCsh = num(b.ada_cash_receipts_inr);
    adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
    var ceiling44ADA = presumptiveCeilingInr("s44ADA", adaDig, adaCsh);
    if (eligibility.eligible44ADA && adaReceipts <= ceiling44ADA) {
      return calc("Presumptive income under s.44ADA: gross receipts × 50% (professionals)", [
        { label: "Gross receipts", amount: adaReceipts },
        { label: "Rate", display: "50%" }
      ], PRESUMPTIVE_CEILING_CITATION);
    }
    if (!eligibility.eligible44ADA) {
      var why44ADA = eligibility.rorFails
        ? "this taxpayer's India residency status is " + (eligibility.indiaStatus || "not on file") + ", not Resident & Ordinarily Resident (ROR)"
        : "this taxpayer's entity type is HUF, which s.44ADA excludes";
      ceilingNote = "s.44ADA is only available to Resident & Ordinarily Resident (ROR) individuals — " + why44ADA + ", so the presumptive election is invalid and regular books apply instead:";
      ceilingCitation = PRESUMPTIVE_RESIDENCY_CITATION;
    } else {
      ceilingNote = "Gross receipts (₹" + Math.round(adaReceipts).toLocaleString("en-IN") + ") exceed the s.44ADA turnover ceiling for this cash-receipts mix (₹" + Math.round(ceiling44ADA).toLocaleString("en-IN") + ") — the presumptive election is invalid above this, so regular books apply instead:";
      ceilingCitation = PRESUMPTIVE_CEILING_CITATION;
    }
  } else if (scheme === "s44AE") {
    return source("s.44AE tonnage-based presumptive income (goods carriages) is computed once from the Goods Vehicles schedule and rolled into the total business income figure above — it isn't split per vehicle here, so this entry shows ₹0 on its own.");
  } else if (scheme === "s44BB" || scheme === "s44BBB") {
    var bbTurnover = num(b.turnover_inr), bbCash = num(b.cash_receipts_inr);
    var bbLabel = scheme === "s44BB" ? "s.44BB (non-resident, mineral-oil exploration services)" : "s.44BBB (foreign company, civil construction / turnkey power project)";
    return calc("Presumptive income under " + bbLabel + ": 10% of gross receipts, no ceiling test.", [
      { label: "Turnover / gross receipts", amount: bbTurnover },
      { label: "Cash receipts", amount: bbCash },
      { label: "Rate", display: "10%" }
    ]);
  }
  var exp = b.expenses || {};
  var expenseFields = [
    ["rent_for_business_premises_inr", "Rent for business premises"],
    ["repairs_maintenance_inr", "Repairs & maintenance"],
    ["employee_salary_wages_inr", "Employee salary & wages"],
    ["employee_bonus_commission_inr", "Employee bonus & commission"],
    ["interest_on_borrowed_capital_inr", "Interest on borrowed capital"],
    ["insurance_premium_inr", "Insurance premium"],
    ["bad_debts_written_off_inr", "Bad debts written off"],
    ["other_business_expenses_inr", "Other business expenses"],
    ["ca_professional_fees_inr", "CA / professional fees"]
  ];
  var fallbackReceipts = num(b.gross_receipts_inr) || num(b.turnover_inr) ||
    (scheme === "s44AD" ? (dig44AD + csh44AD) : 0) ||
    (scheme === "s44ADA" ? adaReceipts : 0);
  var parts = [{ label: "Gross receipts / turnover", amount: fallbackReceipts }];
  expenseFields.forEach(function (f) {
    var v = num(exp[f[0]]);
    if (v > 0) parts.push({ label: "Less: " + f[1], amount: -v });
  });
  if (exp.employer_pf_esi_paid_before_due_date === true && num(exp.employer_pf_esi_contribution_inr) > 0) {
    parts.push({ label: "Less: Employer PF/ESI contribution (paid before due date, s.43B(d))", amount: -num(exp.employer_pf_esi_contribution_inr) });
  }
  if (num(disallowancesInr) > 0) {
    parts.push({ label: "Add back: statutory disallowances (s.40A(3) cash / s.40(a) TDS default / s.43B(h) MSME overdue)", amount: num(disallowancesInr) });
  }
  if (num(depreciationInr) > 0) {
    parts.push({ label: "Less: current-year depreciation (s.32, asset blocks)", amount: -num(depreciationInr) });
  }
  var netProfitInr = parts.reduce(function (s, p) { return s + (p.amount || 0); }, 0);
  parts.push({ label: "Net profit (this entry)", amount: netProfitInr });
  var formula = ceilingNote || "Regular books: gross receipts/turnover less the itemized deductible expenses on file, less statutory disallowances (s.40A(3)/40(a)/43B(h)) already included in those expenses, less current-year depreciation (s.32 WDV method + s.32(1)(iia) additional depreciation). F&O-specific costs and s.35/35D/35DDA amortization aren't modeled yet (Phase 1 follow-on — see gap tracker IN-22/26), so this is still a floor, not the final figure.";
  return calc(formula, parts, ceilingCitation);
}

/* ---- businessEntities: one row per real entity (normalize.js:2568-2712) --- */
function businessEntitiesResult(d, ctx) {
  var us = ctx.us, india = ctx.india;
  var list = [];
  var ui = d.uiAgg;
  var entityKind = safe(us, "profile.tax_entity_type", "individual");
  // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21
  // Jul 2026) — widened to include AOP/BOI and Trust/NGO/Political Party,
  // same as isEntityTaxpayer (entitytax-nodes.js's file header has the
  // full writeup).
  var indiaIsCompanyOrFirm = d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust;

  if (["ccorp", "scorp", "partnership"].indexOf(entityKind) >= 0 || safe(us, "profile.incorporated_in_us", false) === true) {
    var m1ForTrace = safe(us, "corporate_financials.schedule_m1", null);
    var m1SelfInc = m1ForTrace ? (
      num(m1ForTrace.net_income_per_books) + num(m1ForTrace.federal_tax_expense) + num(m1ForTrace.meals_disallowed_50) +
      num(m1ForTrace.foreign_taxes_credited) + num(m1ForTrace.interest_expense_limitation) + num(m1ForTrace.other_additions) -
      num(m1ForTrace.tax_exempt_interest) - num(m1ForTrace.tax_depreciation_over_book) - num(m1ForTrace.other_subtractions)
    ) : 0;
    var selfInc = m1SelfInc !== 0 ? m1SelfInc : num(safe(ui, "business_income_usd", 0));
    var selfForm = entityKind === "ccorp" ? "1120 (C-Corp, 21% flat)" : entityKind === "scorp" ? "1120-S (pass-through)" : entityKind === "partnership" ? "1065 (pass-through)" : "1120";
    if (selfInc !== 0) list.push({
      country: "US", type: entityKind === "ccorp" ? "C-Corp (Form 1120)" : entityKind === "scorp" ? "S-Corp (Form 1120-S)" : entityKind === "partnership" ? "Partnership (Form 1065)" : "C-Corp (Form 1120)",
      name: safe(us, "profile.full_name", "US entity"), incomeUsd: selfInc, corp: true,
      filesOwnReturn: true, returnForm: "Form " + selfForm + " — entity-level return",
      calcTrace: m1SelfInc !== 0
        ? calc("Schedule M-1 book-to-tax reconciliation (this entity's own return, not a K-1 received from another entity).", [
            { label: "Net income per books", amount: num(m1ForTrace.net_income_per_books) },
            { label: "Plus: federal tax expense", amount: num(m1ForTrace.federal_tax_expense) },
            { label: "Plus: meals & entertainment disallowed", amount: num(m1ForTrace.meals_disallowed_50) },
            { label: "Plus: foreign taxes deducted (not credited)", amount: num(m1ForTrace.foreign_taxes_credited) },
            { label: "Plus: s.163(j) interest expense limitation", amount: num(m1ForTrace.interest_expense_limitation) },
            { label: "Plus: other additions", amount: num(m1ForTrace.other_additions) },
            { label: "Less: tax-exempt interest", amount: -num(m1ForTrace.tax_exempt_interest) },
            { label: "Less: tax depreciation over book depreciation", amount: -num(m1ForTrace.tax_depreciation_over_book) },
            { label: "Less: other subtractions", amount: -num(m1ForTrace.other_subtractions) }
          ])
        : source("Entity-level taxable income as entered on Layer 1 US (business_income_usd) — no Schedule M-1 data on file for this entity.")
    });
  }
  var seDeprPlanForTrace = d.usBusinessDepreciationPlan;
  (safe(ui, "self_employment", []) || []).forEach(function (s, seIdx) {
    var seDeprEntry = seDeprPlanForTrace.byBusiness["se" + seIdx];
    var seDeprUsd = seDeprEntry ? seDeprEntry.totalUsd : 0;
    list.push({
      country: "US", type: "Self-employment (Sch C)", name: s.business_name || s.name || "Self-employment",
      incomeUsd: selfEmploymentNetProfitUsd(s, seDeprUsd), se: true, qbi: true,
      filesOwnReturn: false, returnForm: "Schedule C + Schedule SE (Form 1040)",
      calcTrace: selfEmploymentIncomeTrace(s, seDeprEntry)
    });
  });
  (safe(ui, "farming_schedule_f", []) || []).forEach(function (f, farmIdx) {
    var farmDeprEntry = seDeprPlanForTrace.byBusiness["farm" + farmIdx];
    var farmDeprUsd = farmDeprEntry ? farmDeprEntry.totalUsd : 0;
    list.push({
      country: "US", type: "Farm (Sch F)", name: f.business_name || f.name || "Farm",
      incomeUsd: farmNetProfitUsd(f, farmDeprUsd), se: true, qbi: true,
      filesOwnReturn: false, returnForm: "Schedule F (Form 1040)",
      calcTrace: farmIncomeTrace(f, farmDeprEntry)
    });
  });
  (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
    var ord = num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0), gp = num(k.guaranteed_payments_usd || 0), s179 = num(k.sec179_deduction_usd || 0);
    list.push({
      country: "US", type: "Partnership K-1 (1065)", name: k.business_name || k.partnership_name || k.name || "Partnership",
      incomeUsd: ord + gp - s179, se: true, qbi: true,
      filesOwnReturn: false, returnForm: "Form 1065 (partnership return, informational) → Schedule E + Schedule SE (Form 1040)",
      calcTrace: calc("Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4) − s.179 deduction (K-1 Box 12). Guaranteed payments count for SE tax but are excluded from the §199A QBI base. Interest/dividend/capital-gain/rental/royalty boxes on this K-1, if any, are folded into this taxpayer's general investment-income totals, not shown per-entity here.", [
        { label: "Ordinary business income (Box 1)", amount: ord },
        { label: "Guaranteed payments (Box 4)", amount: gp },
        { label: "Less: s.179 deduction (Box 12)", amount: -s179 }
      ])
    });
  });
  (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) {
    var ord = num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0), s179 = num(s.sec179_deduction_usd || 0);
    list.push({
      country: "US", type: "S-Corp K-1 (1120-S)", name: s.business_name || s.corp_name || s.name || "S-Corporation",
      incomeUsd: ord - s179, se: false, qbi: true,
      filesOwnReturn: false, returnForm: "Form 1120-S (S-corp return, informational) → Schedule E (Form 1040)",
      calcTrace: calc("Ordinary business income (K-1 Box 1, ordinary_income_usd — the real Layer 1 US field; scorp_income_usd/ordinary_business_income_usd are legacy fallbacks that don't exist on the live form) − s.179 deduction (Box 11). S-corp distributions aren't subject to SE tax.", [
        { label: "Ordinary business income (Box 1)", amount: ord },
        { label: "Less: s.179 deduction (Box 11)", amount: -s179 }
      ])
    });
  });
  (safe(ui, "trusts_estates_k1", []) || []).forEach(function (t) {
    var ord = num(t.ordinary_income_usd || 0), og = num(t.ordinary_gain_usd || 0);
    list.push({
      country: "US", type: "Trust/Estate K-1 (1041)", name: t.business_name || "Trust/Estate",
      incomeUsd: ord + og, se: false, qbi: true,
      filesOwnReturn: false, returnForm: "Form 1041 (fiduciary return, informational) → Schedule E (Form 1040)",
      calcTrace: calc("Ordinary income (K-1 Box 1) + ordinary gain (Box 8 sub-line). Interest/dividend/capital-gain/rental/royalty boxes on this K-1, if any, are folded into this taxpayer's general investment-income totals, not shown per-entity here.", [
        { label: "Ordinary income (Box 1)", amount: ord },
        { label: "Ordinary gain (Box 8)", amount: og }
      ])
    });
  });
  (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) {
    list.push({
      country: "US", type: "C-Corp (Form 1120)", name: c.corp_name || c.name || "C-Corporation",
      incomeUsd: num(c.taxable_income_usd || c.net_income_usd || 0), corp: true,
      filesOwnReturn: true, returnForm: "Form 1120 (C-Corp — entity-level return, 21% flat)",
      calcTrace: source("Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return until distributed.")
    });
  });

  var bizEligibility = d.presumptiveEligibilityAgg;
  var indiaReturnFormCrude = d.indiaIsCompany ? "ITR-6" : (d.indiaIsTrust ? "ITR-7" : (d.indiaIsFirm || d.indiaIsAop) ? "ITR-5" : "ITR-2/3");
  (d.bizEntriesAgg || []).forEach(function (b, bIdx) {
    var netProfitInr = b.net_profit_inr || b.net_profit;
    var isRegularBooksForTrace = usesRegularBooksInr(b, bizEligibility);
    var entryDepreciationInrForTrace = isRegularBooksForTrace ? aggregateEntryDepreciationInr(bIdx, d.bizAssetBlocksAgg, india, b) : 0;
    var entryDisallowancesInrForTrace = isRegularBooksForTrace ? aggregateEntryDisallowancesInr(bIdx, b.expenses || {}, d.bizMsmePayablesAgg) : 0;
    if (netProfitInr === undefined || netProfitInr === null) netProfitInr = computeBusinessEntryNetProfitInr(b, bizEligibility, entryDepreciationInrForTrace, entryDisallowancesInrForTrace);
    netProfitInr = num(netProfitInr);
    var entryReturnForm = indiaIsCompanyOrFirm ? indiaReturnFormCrude :
      (isRegularBooksForTrace
        ? "Regular books (this entry) — feeds the taxpayer's overall return form; see Filings → Return Form for the checked ITR"
        : "Valid presumptive election (this entry) — feeds the taxpayer's overall return form; see Filings → Return Form for the checked ITR");
    list.push({
      country: "IN", type: "Business / Profession (PGBP)", name: b.business_name || b.trade_name || b.name || "Indian business",
      incomeUsd: netProfitInr / fxRate(ctx), inr: netProfitInr,
      filesOwnReturn: indiaIsCompanyOrFirm, returnForm: entryReturnForm,
      calcTrace: businessEntryIncomeTrace(b, bizEligibility, entryDepreciationInrForTrace, entryDisallowancesInrForTrace)
    });
  });

  (d.usForeignCorpsRaw || []).forEach(function (c) {
    var country = c.country != null ? c.country : c.country_of_incorporation;
    var corpName = c.corp_name || c.corporation_name;
    var ownershipPct = num(c.ownership_pct != null ? c.ownership_pct : c.ownership_percentage);
    list.push({
      country: country === "IN" ? "IN" : "US", type: "Foreign corporation (CFC)", name: corpName || "Foreign corporation",
      incomeUsd: num(c.gilti_income_usd || 0), cfc: true, gilti: num(c.gilti_income_usd || 0), ownershipPct: ownershipPct,
      filesOwnReturn: true, returnForm: "Foreign local return (not modeled) + Form 5471 (informational, US) + GILTI on Schedule 1 (Form 1040)",
      calcTrace: source("GILTI inclusion as entered on Layer 1 US for this CFC (gilti_income_usd) — a hand-entered estimate, since full GILTI/QBAI/tested-income computation from the CFC's own books isn't modeled yet (see gap tracker). Ownership: " + Math.round(ownershipPct) + "%. This is a US inclusion only — the entity's own foreign-country income tax return is separate and not shown here.")
    });
  });

  var byName = {}, order = [];
  list.forEach(function (e) {
    var key = String(e.name || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!byName[key]) { byName[key] = e; order.push(key); return; }
    var ex = byName[key];
    if (e.cfc) { ex.cfc = true; ex.gilti = Math.max(ex.gilti || 0, e.gilti || 0); ex.ownershipPct = ex.ownershipPct || e.ownershipPct; if (!ex.incomeUsd) ex.incomeUsd = e.incomeUsd; }
    else if (ex.cfc) { e.cfc = ex.cfc; e.gilti = ex.gilti; e.ownershipPct = ex.ownershipPct; byName[key] = e; }
    else { ex.incomeUsd = Math.max(ex.incomeUsd || 0, e.incomeUsd || 0); }
  });
  return order.map(function (k) { return byName[k]; });
}

/* ---- Phase 5: entity graph (docs/BUSINESS_ENTITY_ARCHITECTURE.md §6) -----
 * Genuinely new — no engine equivalent, and no prior DAG node either.
 * `businessEntitiesResult` above already produces a flat, by-name-deduped
 * list for the Business tab's display; this is a DIFFERENT shape built
 * fresh from the same source arrays (not derived from the flat list, which
 * merges same-named rows in a way that would incorrectly conflate two
 * genuinely distinct source items): a proper Entity[]/Edge[] graph, one
 * node per REAL entity with a stable id, plus edges recording how money
 * flows between them, instead of everything silently summed into one
 * number. Root = the return being prepared (the individual, or the
 * business entity itself when the taxpayer's own return IS an entity
 * return — Layer 1 US's ccorp/scorp/partnership self-entity, or Layer 1
 * India's non-individual profile.entity_type). Every OTHER real entity
 * (India business_entries[]/partner_firms[] with a non-individual
 * entity_type, US K-1s, US c_corporations_1120[], foreign_corporations[])
 * gets its own node plus an edge into the root recording the flow type —
 * §6's own note that partner_firms/K-1s are "an edge INTO the individual,
 * not a separate computed entity" is followed literally: those get a
 * lightweight entity (for the edge to point at) but no income/tax block,
 * since WISING doesn't compute THEIR OWN return, only what flows through.
 * A sole proprietorship (Sch C/farm, or an India business_entries[] item
 * with entity_type left at "individual"/unset) is NOT modeled as its own
 * entity here — legally, it has no separate existence from its owner, so
 * its income is already just part of the root's own income, same as the
 * doc's schema implies (no "sole prop" kind in the enum).
 *
 * Phase 5 scope only: the entity/edge STRUCTURE. Making edges carry a
 * verified traceable dollar amount (vs. the amount already shown on the
 * flow's own Layer 1 entry) is Phase 6 (§6's own phased-build-order split),
 * not done here. The frontend (an entity switcher, per-entity drill-down)
 * is Phase 8, later still.
 *
 * INDIA_ENTITY_KIND_MAP covers every real profile.entity_type value this
 * app supports, not just the four the doc's own schema names (huf/firm/
 * llp/company) — aop/trust/local/coop/ajp are real, selectable values
 * (entitytax-nodes.js's indiaIsAop/indiaIsTrust, indiaIsFirm's llp/local
 * grouping) that would otherwise have nowhere to map to. */
var INDIA_ENTITY_KIND_MAP = {
  huf: "in_huf", firm: "in_firm", llp: "in_llp", company: "in_company",
  aop: "in_aop", trust: "in_trust", local: "in_local", coop: "in_coop", ajp: "in_ajp"
};
var US_ENTITY_KIND_MAP = { ccorp: "us_ccorp", scorp: "us_scorp", partnership: "us_partnership", trust: "us_trust", llc: "us_llc" };

function normEntityName(n) { return String(n || "").toLowerCase().replace(/\s+/g, " ").trim(); }

function buildEntityGraph(d, ctx) {
  var us = ctx.us, india = ctx.india;
  var entities = [], edges = [];
  var usTaxEntityType = safe(us, "profile.tax_entity_type", "individual");
  var indiaEntityType = d.indiaEntityTypeRaw;
  var rootUsKind = US_ENTITY_KIND_MAP[usTaxEntityType] || null;
  var rootIndiaKind = INDIA_ENTITY_KIND_MAP[indiaEntityType] || null;
  var indiaName = safe(india, "profile.full_name", null);
  var usName = safe(us, "profile.full_name", null);
  var namesMatch = rootIndiaKind && rootUsKind && normEntityName(indiaName) !== "" && normEntityName(indiaName) === normEntityName(usName);

  // Two genuinely distinct real entities can be bundled into ONE taxpayer
  // analysis (e.g. us_ccorp_indian_sub: "Cloudspire Inc", a US C-corp, and
  // its wholly-owned "Cloudspire India Pvt Ltd" subsidiary, a different
  // legal entity with its own different name) — collapsing them into one
  // root would be actively wrong, not just incomplete (§6's own opening
  // caution: "an entity graph consolidating wrong numbers is worse than no
  // graph"). Detected by: both sides have a real non-individual entity
  // type AND their names differ. When both are non-individual but the
  // NAMES MATCH (e.g. founder_indian_company-shaped data, one entity
  // dual-resident on both sides), that's genuinely ONE entity — single root.
  var rootIds;
  if (rootIndiaKind && rootUsKind && !namesMatch) {
    entities.push({ id: "root_in", kind: rootIndiaKind, jurisdiction: "IN", name: indiaName || "Indian entity", returnForm: null, layer1Ref: null });
    entities.push({ id: "root_us", kind: rootUsKind, jurisdiction: "US", name: usName || "US entity", returnForm: null, layer1Ref: null });
    rootIds = ["root_in", "root_us"];
  } else {
    var rootKind = rootIndiaKind || rootUsKind || "individual";
    var rootJurisdiction = rootIndiaKind ? "IN" : (rootUsKind ? "US" : "both");
    var rootName = indiaName || usName || "Taxpayer";
    entities.push({ id: "root", kind: rootKind, jurisdiction: rootJurisdiction, name: rootName, returnForm: null, layer1Ref: null });
    rootIds = ["root"];
  }
  // Every OTHER entity's edges point at this by default — the India root
  // when a real india entity type exists (matches this app's own existing
  // entity-routing precedent, businessEntitiesResult's indiaIsCompanyOrFirm/
  // computeIndiaEntityTax gating already treating India as the primary
  // signal), else whichever single root exists.
  var primaryRootId = rootIds.indexOf("root_in") >= 0 ? "root_in" : rootIds[0];
  function findRootIdByName(name) {
    var n = normEntityName(name);
    if (!n) return null;
    for (var i = 0; i < rootIds.length; i++) { if (normEntityName(entities.filter(function (e) { return e.id === rootIds[i]; })[0].name) === n) return rootIds[i]; }
    return null;
  }

  // India business_entries[] with a real non-individual entity_type — a
  // firm/LLP/company entry inside the Business module, distinct from the
  // taxpayer's own primary entity_type above (e.g. an individual who is
  // also a partner/shareholder in a separate business entity recorded here).
  (d.bizEntriesAgg || []).forEach(function (b, idx) {
    var kind = INDIA_ENTITY_KIND_MAP[b.entity_type];
    if (!kind) return; // unset/individual — sole-prop income, part of root
    var id = "in_biz_" + idx;
    var isRegularBooksForGraph = usesRegularBooksInr(b, d.presumptiveEligibilityAgg);
    var entryDeprInrForGraph = isRegularBooksForGraph ? aggregateEntryDepreciationInr(idx, d.bizAssetBlocksAgg, india, b) : 0;
    var entryDisallowInrForGraph = isRegularBooksForGraph ? aggregateEntryDisallowancesInr(idx, b.expenses || {}, d.bizMsmePayablesAgg) : 0;
    var netProfitInr = b.net_profit_inr || b.net_profit;
    if (netProfitInr === undefined || netProfitInr === null) {
      netProfitInr = computeBusinessEntryNetProfitInr(b, d.presumptiveEligibilityAgg, entryDeprInrForGraph, entryDisallowInrForGraph);
    }
    netProfitInr = num(netProfitInr);
    entities.push({
      id: id, kind: kind, jurisdiction: "IN", name: b.business_name || b.trade_name || b.name || null,
      returnForm: null, layer1Ref: { form: "layer1_india", path: "domestic_income.business_income.business_entries[" + idx + "]" },
      income: { inr: netProfitInr, usd: netProfitInr / fxRate(ctx) }
    });
    // Phase 6 (§6): a real trace, not just a bare amount — reuses the SAME
    // businessEntryIncomeTrace already shown on the Business tab for this
    // entry, so the graph edge and the flat-list row can never disagree on
    // how the figure was derived.
    edges.push({
      from: id, to: primaryRootId, ownershipPct: null, flow: "business_income", amountInr: netProfitInr,
      trace: businessEntryIncomeTrace(b, d.presumptiveEligibilityAgg, entryDeprInrForGraph, entryDisallowInrForGraph)
    });
  });

  // India partner_firms[] — per §6, an edge into the individual, not a
  // separate computed entity (the firm's own return isn't prepared here).
  // A lightweight entity is still created so the edge has a real node to
  // point FROM — no income/tax block, since that firm's own return is out
  // of scope, matching computeBusinessEntryNetProfitInr's own s.40(b)
  // "trusted, not re-derived" stance on partner remuneration (§3.3).
  (d.partnerFirmsAgg || []).forEach(function (firm, idx) {
    var id = "in_partner_firm_" + idx;
    var kind = INDIA_ENTITY_KIND_MAP[firm.entity_type] || "in_firm";
    entities.push({
      id: id, kind: kind, jurisdiction: "IN", name: firm.firm_name || null,
      returnForm: null, layer1Ref: { form: "layer1_india", path: "domestic_income.business_income.partner_firms[" + idx + "]" }
    });
    var remunerationInr = num(firm.remuneration_from_entity_inr), interestInr = num(firm.interest_on_capital_from_entity_inr);
    var totalRemunerationInr = remunerationInr + interestInr;
    if (totalRemunerationInr !== 0) {
      edges.push({
        from: id, to: primaryRootId, ownershipPct: null, flow: "partner_remuneration", amountInr: totalRemunerationInr,
        trace: calc("Taxable PGBP income to the partner (s.40(b)) — the firm's own s.40(b) cap on what it may pay out is tested at the firm's own return, which this app doesn't prepare, so the entered figure is trusted rather than re-derived (§3.3).", [
          { label: "Remuneration from entity", amount: remunerationInr },
          { label: "Interest on capital from entity", amount: interestInr }
        ])
      });
    }
    var exemptShareInr = num(firm.profit_share_exempt_inr);
    if (exemptShareInr !== 0) {
      edges.push({
        from: id, to: primaryRootId, ownershipPct: null, flow: "exempt_profit_share", amountInr: exemptShareInr,
        trace: source("Genuinely exempt to the partner under s.10(2A) — already taxed at the firm's own level. Shown for reconciliation only; not added to the partner's taxable income.")
      });
    }
  });

  // US K-1 types — per §6, "K-1 pass-through -> owner's income" as an
  // explicit edge. Same "lightweight entity, no own tax block" stance as
  // partner_firms above: WISING doesn't prepare the partnership/S-corp/
  // trust's OWN return, only reads what flows through via the K-1. Points
  // at root_us specifically when the taxpayer bundle has two roots (a K-1
  // is inherently a US-side flow), else whichever single root exists.
  var usFlowTargetId = rootIds.indexOf("root_us") >= 0 ? "root_us" : rootIds[0];

  // Phase 6's own concrete "silent sum" to decompose: aggregateUsIncome-
  // nodes.js's k1PassiveIncomeUsd/addK1Passive sums interest/dividend/
  // capital-gain/rental/royalty boxes from EVERY K-1 into one taxpayer-wide
  // pool (k1InterestUsd, k1OrdDivUsd, etc.) before folding into the overall
  // interestUs/ordinaryDividendsUs/etc. totals — correct for the tax
  // computation, but it means the FINAL number can't say which K-1 entity
  // produced which slice. Re-verified fresh from source here (same
  // discipline as every other function in this file, not cross-required)
  // — byte-for-byte the same formula as aggregateusincome-nodes.js's own
  // k1PassiveIncomeUsd, confirmed by direct comparison, not assumed.
  function k1PassiveIncomeUsdForGraph(k) {
    return {
      interestUsd: num(k.interest_income_usd), ordDivUsd: num(k.ordinary_dividends_usd), qualDivUsd: num(k.qualified_dividends_usd),
      stcgUsd: num(k.stcg_usd),
      ltcgUsd: num(k.ltcg_usd) + Math.max(0, num(k.net_sec1231_gain_usd || k.sec1231_gain_usd || 0)),
      rentalUsd: num(k.net_rental_real_estate_usd) + num(k.other_rental_income_usd) + num(k.royalties_usd || k.royalty_income_usd || 0)
    };
  }
  function passiveIncomeTraceParts(passive) {
    var parts = [];
    if (passive.interestUsd !== 0) parts.push({ label: "Interest income (K-1 passive box)", amount: passive.interestUsd });
    if (passive.ordDivUsd !== 0) parts.push({ label: "Ordinary dividends (K-1 passive box)", amount: passive.ordDivUsd });
    if (passive.stcgUsd !== 0) parts.push({ label: "Short-term capital gain (K-1 passive box)", amount: passive.stcgUsd });
    if (passive.ltcgUsd !== 0) parts.push({ label: "Long-term capital gain + net s.1231 gain (K-1 passive box)", amount: passive.ltcgUsd });
    if (passive.rentalUsd !== 0) parts.push({ label: "Rental + royalty income (K-1 passive box)", amount: passive.rentalUsd });
    return parts;
  }
  function pushK1Entities(kind, idPrefix, sourcePath, nameFn, flowLabel, incomeUsdFn, ordinaryTraceParts, formulaNote) {
    (safe(us, sourcePath, []) || []).forEach(function (k, idx) {
      var id = idPrefix + idx;
      var incomeUsd = incomeUsdFn(k);
      var passive = k1PassiveIncomeUsdForGraph(k);
      entities.push({
        id: id, kind: kind, jurisdiction: "US", name: nameFn(k),
        returnForm: null, layer1Ref: { form: "layer1_us", path: sourcePath + "[" + idx + "]" },
        income: { usd: incomeUsd, inr: incomeUsd * fxRate(ctx) }, passiveIncomeUsd: passive
      });
      // Two edges, not one: the ordinary/QBI-eligible business income (the
      // "k1_passthrough" flow this edge always carried) and — new here,
      // the actual Phase 6 decomposition — the passive-box amounts, which
      // otherwise only ever existed as an anonymous slice of the taxpayer's
      // OVERALL interest/dividend/capital-gain/rental totals.
      edges.push({
        from: id, to: usFlowTargetId, ownershipPct: null, flow: flowLabel, amountUsd: incomeUsd,
        trace: calc(formulaNote, ordinaryTraceParts(k))
      });
      var passiveTotalUsd = passive.interestUsd + passive.ordDivUsd + passive.stcgUsd + passive.ltcgUsd + passive.rentalUsd;
      if (passiveTotalUsd !== 0) {
        edges.push({
          from: id, to: usFlowTargetId, ownershipPct: null, flow: "k1_passive_income", amountUsd: passiveTotalUsd,
          trace: calc("This K-1's own interest/dividend/capital-gain/rental/royalty boxes — folded into the taxpayer's overall totals for those income types elsewhere, but shown here so this specific entity's contribution is traceable rather than anonymous within the combined figure.", passiveIncomeTraceParts(passive))
        });
      }
    });
  }
  pushK1Entities("us_partnership", "us_k1_partnership_", "income_us_source.partnerships_k1",
    function (k) { return k.business_name || k.partnership_name || k.name || null; }, "k1_passthrough",
    function (k) { return num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) + num(k.guaranteed_payments_usd || 0) - num(k.sec179_deduction_usd || 0); },
    function (k) { return [
      { label: "Ordinary business income (Box 1)", amount: num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) },
      { label: "Guaranteed payments (Box 4)", amount: num(k.guaranteed_payments_usd || 0) },
      { label: "Less: s.179 deduction (Box 12)", amount: -num(k.sec179_deduction_usd || 0) }
    ]; },
    "Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4) − s.179 deduction (K-1 Box 12). Guaranteed payments count for SE tax but are excluded from the §199A QBI base.");
  pushK1Entities("us_scorp", "us_k1_scorp_", "income_us_source.s_corporations_k1",
    function (k) { return k.business_name || k.corp_name || k.name || null; }, "k1_passthrough",
    function (k) { return num(k.ordinary_income_usd || k.scorp_income_usd || k.ordinary_business_income_usd || 0) - num(k.sec179_deduction_usd || 0); },
    function (k) { return [
      { label: "Ordinary business income (Box 1)", amount: num(k.ordinary_income_usd || k.scorp_income_usd || k.ordinary_business_income_usd || 0) },
      { label: "Less: s.179 deduction (Box 11)", amount: -num(k.sec179_deduction_usd || 0) }
    ]; },
    "Ordinary business income (K-1 Box 1, ordinary_income_usd — the real Layer 1 US field; scorp_income_usd/ordinary_business_income_usd are legacy fallbacks that don't exist on the live form) − s.179 deduction (Box 11). S-corp distributions aren't subject to SE tax.");
  pushK1Entities("us_trust", "us_k1_trust_", "income_us_source.trusts_estates_k1",
    function (k) { return k.business_name || null; }, "k1_passthrough",
    function (k) { return num(k.ordinary_income_usd || 0) + num(k.ordinary_gain_usd || 0); },
    function (k) { return [
      { label: "Ordinary income (Box 1)", amount: num(k.ordinary_income_usd || 0) },
      { label: "Ordinary gain (Box 8)", amount: num(k.ordinary_gain_usd || 0) }
    ]; },
    "Ordinary income (K-1 Box 1) + ordinary gain (Box 8 sub-line).");

  // US c_corporations_1120[] — entries the taxpayer holds an interest in
  // (distinct from a ROOT entity's own Form 1120 when tax_entity_type IS
  // ccorp, already captured as a root above — skipped here by name match,
  // same guard as the foreign-corp loop below, so the filer's own C-corp
  // never also shows up as if it were something it merely invested in).
  // WISING doesn't compute this corporation's OWN federal tax (no
  // computeUsEntityTax call against it, unlike the root case) — only the
  // taxable-income figure as entered, so it's a lightweight entity like the
  // K-1 cases, not a fully-computed one.
  (safe(us, "income_us_source.c_corporations_1120", []) || []).forEach(function (c, idx) {
    var name = c.corp_name || c.name || null;
    if (findRootIdByName(name)) return; // already modeled as a root entity
    var id = "us_ccorp_" + idx;
    var incomeUsd = num(c.taxable_income_usd || c.net_income_usd || 0);
    entities.push({
      id: id, kind: "us_ccorp", jurisdiction: "US", name: name,
      returnForm: "Form 1120 (C-Corp, 21% flat)", layer1Ref: { form: "layer1_us", path: "income_us_source.c_corporations_1120[" + idx + "]" },
      income: { usd: incomeUsd, inr: incomeUsd * fxRate(ctx) }
    });
    edges.push({
      from: id, to: usFlowTargetId, ownershipPct: null, flow: "dividend", amountUsd: incomeUsd,
      trace: source("Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return until distributed — shown here as a placeholder for the eventual dividend flow, not an actual distribution WISING has independently confirmed occurred.")
    });
  });

  // US foreign_entities.foreign_corporations[] — CFC ownership. WISING
  // models the GILTI/Subpart-F INCLUSION only (a hand-entered estimate,
  // gap tracker XB-14), not the foreign corp's own local-country return.
  // When this entry's name matches an EXISTING root (the two-roots-in-one-
  // bundle case above — a US parent's own CFC record naming its own already-
  // modeled Indian subsidiary), skip creating a duplicate node entirely and
  // just add the ownership/GILTI edge directly between the two real roots
  // instead — the bug this whole function was rewritten to fix: without
  // this guard, the India subsidiary showed up TWICE (once as the root,
  // once as a "foreign_corp" with an edge pointing at itself).
  (d.usForeignCorpsRaw || []).forEach(function (c, idx) {
    var corpName = c.corp_name || c.corporation_name || null;
    var ownershipPct = num(c.ownership_pct != null ? c.ownership_pct : c.ownership_percentage);
    var giltiUsd = num(c.gilti_income_usd || 0);
    var matchedRootId = findRootIdByName(corpName);
    if (matchedRootId) {
      var otherRootId = rootIds.filter(function (r) { return r !== matchedRootId; })[0];
      // Only meaningful when there IS a second, distinct root to connect to
      // (the two-roots case) — a single-root match would be a self-loop
      // (a US individual's own CFC record naming their sole India company
      // root, with no separate US-entity root to draw the edge to) and is
      // deliberately left unmodeled rather than drawn as a self-reference.
      if (otherRootId) edges.push({
        from: matchedRootId, to: otherRootId, ownershipPct: ownershipPct, flow: "gilti", amountUsd: giltiUsd,
        trace: source("GILTI inclusion as entered on Layer 1 US for this CFC (gilti_income_usd) — a hand-entered estimate, since full GILTI/QBAI/tested-income computation from the CFC's own books isn't modeled yet (gap tracker XB-14). Ownership: " + Math.round(ownershipPct) + "%. This edge connects two entities BOTH already modeled as their own root here (a US parent and its differently-named subsidiary), not a newly-created placeholder node.")
      });
      return;
    }
    var id = "foreign_corp_" + idx;
    entities.push({
      id: id, kind: "foreign_corp", jurisdiction: (c.country != null ? c.country : c.country_of_incorporation) === "IN" ? "IN" : "foreign", name: corpName,
      returnForm: "Foreign local return (not modeled) + Form 5471 (informational)", layer1Ref: { form: "layer1_us", path: "foreign_entities.foreign_corporations[" + idx + "]" },
      // income here is the GILTI inclusion only, NOT the CFC's own full
      // local-country income (not modeled, gap tracker XB-14) — same
      // "hand-entered estimate" caveat businessEntityResult's own trace uses.
      income: { usd: giltiUsd, inr: giltiUsd * fxRate(ctx) }
    });
    edges.push({
      from: id, to: usFlowTargetId, ownershipPct: ownershipPct, flow: "gilti", amountUsd: giltiUsd,
      trace: source("GILTI inclusion as entered on Layer 1 US for this CFC (gilti_income_usd) — a hand-entered estimate, since full GILTI/QBAI/tested-income computation from the CFC's own books isn't modeled yet (gap tracker XB-14). Ownership: " + Math.round(ownershipPct) + "%. This is a US inclusion only — the entity's own foreign-country income tax return is separate and not shown here.")
    });
  });

  return { entities: entities, edges: edges };
}

/* ---- top-level assembly (normalize.js:2541-2714) --------------------------- */
NODES.assetsModelResult = {
  deps: ["indianMutualFundsResult", "indiaFinancialHoldingsTxRaw", "indianBusinessesBoundary",
    "usForeignCorpsRaw", "usOwns10PctForeignCorpRaw", "usSecuritiesBoundary",
    "epfInrRaw", "ppfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg",
    "uiAgg", "usBusinessDepreciationPlan", "bizEntriesAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg",
    "presumptiveEligibilityAgg", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust",
    "partnerFirmsAgg", "indiaEntityTypeRaw"],
  compute: function (d, ctx) {
    return {
      indianMutualFunds: d.indianMutualFundsResult,
      indianSecurities: d.indiaFinancialHoldingsTxRaw,
      usPficHoldings: safe(ctx.us, "foreign_entities.pfic_holdings", []),
      indianBusinesses: d.indianBusinessesBoundary,
      usForeignCorps: d.usForeignCorpsRaw,
      usOwns10PctForeignCorp: d.usOwns10PctForeignCorpRaw,
      indianProperties: safe(ctx.india, "property.properties", []),
      epfInr: d.epfInrRaw,
      ppfInr: d.ppfInrRaw,
      npsInr: d.npsInrRaw,
      taxableEpfInterestInr: d.taxableEpfInterestInrAgg,
      taxableNpsWithdrawalInr: d.taxableNpsWithdrawalInrAgg,
      usSecurities: d.usSecuritiesBoundary,
      usProperties: safe(ctx.us, "real_estate.properties", []) || [],
      usRetirement: safe(ctx.us, "retirement_accounts", {}) || {},
      businessEntities: businessEntitiesResult(d, ctx),
      entityGraph: buildEntityGraph(d, ctx)
    };
  }
};

/* ---- IN-6: s.44AD(4) presumptive re-election lock-in disclosure ----------
 * Layer 1 India's own validateS44ADEligibility() already prevents SELECTING
 * s44AD again during the 5-year lock-in (a UI-level force-revert, silent
 * once the box is simply left unchecked) — it never actually discloses to
 * the preparer that the lock-in is running, how many years remain, or that
 * s.44AD(5)'s mandatory-tax-audit consequence (report-batch1-nodes.js's
 * form_3cb_3cd trigger, extended alongside this finding) may already apply
 * this year regardless of turnover. This finding surfaces that fact
 * directly instead of leaving it as an invisible UI constraint. */
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
var CONST_ASSETS_INDIA = CONST_ASSETS.TAX.INDIA;
/* ---- MSME s.43B(h) disallowance finding ----------------------------------
 * The disallowance itself was already netted into each business entry's own
 * net profit (IN-23, msmeDisallowanceTotalAgg above sums the same
 * computation taxpayer-wide) — but that only ever showed up as a silently
 * lower net-profit number. A preparer has no way to see "₹X was disallowed
 * under s.43B(h) this year, across N overdue MSME invoices" without
 * re-deriving it by hand from the raw MSME payables table. This finding
 * surfaces the dollar impact directly. */
var msmeSortWeight = { critical: 0, warning: 1, info: 2 };
NODES.findingsAllResult = {
  deps: baseNodes.findingsAllResult.deps.concat(["presumptiveLockinAgg", "totalIncomeInrV3", "taxRegime", "msmeDisallowanceTotalAgg"]),
  compute: function (d, ctx) {
    var all = baseNodes.findingsAllResult.compute(d, ctx).slice();
    var msme = d.msmeDisallowanceTotalAgg;
    var addedAny = false;
    if (msme && msme.totalInr > 0) {
      addedAny = true;
      all.push({
        id: "msme_disallowance_s43Bh_india", severity: "warning", category: "income",
        title: "s.43B(h) MSME disallowance: " + inr(msme.totalInr) + " added back to business income",
        detail: "This taxpayer has " + msme.overdueCount + " MSME payable" + (msme.overdueCount === 1 ? "" : "s") +
          " (" + inr(msme.totalInr) + " total) still unpaid beyond the statutory window (15 days, or 45 days with a written agreement) as of today. " +
          "Under s.43B(h) (Finance Act 2023), that amount is disallowed as a business deduction for this AY and only becomes deductible in the year actually paid — it has already been added back into the business income figure computed above, not left as a separate manual step.",
        recommendation: "Confirm these MSME dues before filing — paying before the return due date does not cure a s.43B(h) disallowance once the statutory window has already lapsed; the deduction shifts to the year of actual payment regardless.",
        amountUsd: msme.totalInr / fxRate(ctx),
        refs: ["s.43B(h) (Finance Act 2023, MSME payables)", "MSMED Act 2006 s.15/16"]
      });
    }
    var lockin = d.presumptiveLockinAgg;
    if (lockin && lockin.lockInActive) {
      addedAny = true;
      var basicExemptionInr = (d.taxRegime === "OLD" ? CONST_ASSETS_INDIA.SLABS_OLD : CONST_ASSETS_INDIA.SLABS_NEW)[0][0];
      var auditApplies = d.totalIncomeInrV3 > basicExemptionInr;
      var reelectAy = lockin.currentAyStart + lockin.yearsRemaining;
      all.push({
        id: "presumptive_lockin_active_india", severity: auditApplies ? "critical" : "warning", category: "document",
        title: "s.44AD presumptive taxation locked out for " + lockin.yearsRemaining + " more year" + (lockin.yearsRemaining === 1 ? "" : "s") +
          (auditApplies ? " — mandatory tax audit applies this year" : ""),
        detail: "This taxpayer exited s.44AD presumptive taxation in AY " + lockin.exitYear + "-" + String(lockin.exitYear + 1).slice(-2) +
          ". Under s.44AD(4), the presumptive scheme cannot be re-elected for 5 assessment years from that exit — re-election is possible starting AY " +
          reelectAy + "-" + String(reelectAy + 1).slice(-2) + "." +
          (auditApplies
            ? " Total income this year (" + inr(d.totalIncomeInrV3) + ") exceeds the basic exemption limit (" + inr(basicExemptionInr) +
              ") while this lock-out is active — s.44AD(5) makes a tax audit under s.44AB MANDATORY this year, regardless of turnover or the usual ₹1cr/₹10cr threshold."
            : " Total income this year (" + inr(d.totalIncomeInrV3) + ") is below the basic exemption limit (" + inr(basicExemptionInr) +
              "), so s.44AD(5)'s mandatory-audit consequence does not apply THIS year — but re-check every year the lock-out remains active."),
        recommendation: auditApplies
          ? "Arrange a tax audit (Form 3CB/3CD) for this AY — see Documents to File. Do not rely on the turnover threshold alone; s.44AD(5) overrides it while this lock-out is active."
          : "No audit required this year on this basis alone, but confirm total income against the basic exemption limit again next year while the lock-out remains active.",
        amountUsd: auditApplies ? (d.totalIncomeInrV3 / fxRate(ctx)) : 0,
        refs: ["s.44AD(4)/(5) (5-year presumptive re-election lock-in and mandatory audit)", "Form 3CB/3CD"]
      });
    }
    if (addedAny) {
      all.sort(function (a, b) {
        if (msmeSortWeight[a.severity] !== msmeSortWeight[b.severity]) return msmeSortWeight[a.severity] - msmeSortWeight[b.severity];
        return b.amountUsd - a.amountUsd;
      });
    }
    return all;
  }
};

module.exports = { NODES: NODES };
