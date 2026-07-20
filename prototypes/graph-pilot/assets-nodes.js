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

/* Trace helpers — same {kind,...} shape report-batch1-nodes.js's calc/
 * source/holdings already established (conflicts.js:1688-1690). */
function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }

/* SYS-1: shared import. */
var CONST_ASSETS = require("../../engine/constants.js").CONST;
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
  var indiaIsCompanyOrFirm = d.indiaIsCompany || d.indiaIsFirm;

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
  var seDeprPlanForTrace = d.selfEmploymentDepreciationPlan;
  (safe(ui, "self_employment", []) || []).forEach(function (s, seIdx) {
    var seDeprEntry = seDeprPlanForTrace.byBusiness[seIdx];
    var seDeprUsd = seDeprEntry ? seDeprEntry.totalUsd : 0;
    list.push({
      country: "US", type: "Self-employment (Sch C)", name: s.business_name || s.name || "Self-employment",
      incomeUsd: selfEmploymentNetProfitUsd(s, seDeprUsd), se: true, qbi: true,
      filesOwnReturn: false, returnForm: "Schedule C + Schedule SE (Form 1040)",
      calcTrace: selfEmploymentIncomeTrace(s, seDeprEntry)
    });
  });
  (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) {
    list.push({
      country: "US", type: "Farm (Sch F)", name: s.name || "Farm", incomeUsd: num(s.net_profit_usd || 0), se: true, qbi: true,
      filesOwnReturn: false, returnForm: "Schedule F (Form 1040)",
      calcTrace: source("Net farm profit as entered directly on Layer 1 US for this farm (net_profit_usd).")
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
  var indiaReturnFormCrude = d.indiaIsCompany ? "ITR-6" : (d.indiaIsFirm ? "ITR-5" : "ITR-2/3");
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
      incomeUsd: netProfitInr / 83.0, inr: netProfitInr,
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

/* ---- top-level assembly (normalize.js:2541-2714) --------------------------- */
NODES.assetsModelResult = {
  deps: ["indianMutualFundsResult", "indiaFinancialHoldingsTxRaw", "indianBusinessesBoundary",
    "usForeignCorpsRaw", "usOwns10PctForeignCorpRaw", "usSecuritiesBoundary",
    "epfInrRaw", "ppfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg",
    "uiAgg", "selfEmploymentDepreciationPlan", "bizEntriesAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg",
    "presumptiveEligibilityAgg", "indiaIsCompany", "indiaIsFirm"],
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
      businessEntities: businessEntitiesResult(d, ctx)
    };
  }
};

module.exports = { NODES: NODES };
