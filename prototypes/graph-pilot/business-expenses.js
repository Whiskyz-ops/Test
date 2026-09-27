"use strict";
/* Regular-books business expenses as Layer 1 India records them.
 *
 * Layer 1 India collects expenses per business unit (entry.expenses) and
 * per branch (entry.branches[i].expenses), through ~130 industry-specific
 * inputs (Inventory & COGS, farming costs, trading taxes, SaaS, logistics,
 * ...). The engine used to read only nine fixed fields, so every other
 * input (purchases, stock, shop/factory rent, professional fees, ...) and
 * every branch's turnover and expenses were silently ignored: net profit,
 * and so the tax, came out overstated.
 *
 * Rules, per expense object:
 *   - every numeric *_inr field is a deductible business expense, except:
 *   - closing_stock_inr: income (net profit = receipts + closing stock
 *     - opening stock - purchases - other expenses);
 *   - payments_to_*_no_tds_inr / total_cash_payments_exceeding_*_inr:
 *     disclosure slices of the expenses above (they drive the s.40(a) /
 *     s.40A(3) disallowances), not extra deductions;
 *   - employer_pf_esi_contribution_inr: only if paid before the due date
 *     (s.43B(d));
 *   - s35D_total_preliminary_expenses_inr / s35DDA_vrs_payments_inr: 1/5th
 *     a year for the five years from the year entered (all of it counts
 *     toward the 1/5th when the year is blank or unreadable);
 *   - s35_donation_to_approved_body_inr: not allowed under the s.115BAC new
 *     regime (individual/HUF) or s.115BAA/115BAB (s.35(1)(ii)/(iia)/(iii));
 *   - npa_provisions_inr: not deducted (s.36(1)(viia)'s income-linked limit
 *     isn't modelled — provisions are otherwise not deductible).
 */
var MEMO_KEYS = {
  payments_to_non_residents_no_tds_inr: true,
  payments_to_residents_no_tds_inr: true,
  total_cash_payments_exceeding_limit_inr: true,
  total_cash_payments_exceeding_35k_inr: true,
  npa_provisions_inr: true
};
var SPECIAL_KEYS = {
  closing_stock_inr: true,
  employer_pf_esi_contribution_inr: true,
  s35D_total_preliminary_expenses_inr: true,
  s35DDA_vrs_payments_inr: true,
  s35_donation_to_approved_body_inr: true
};

function bxNum(v) { var n = Number(v); return v == null || v === "" || typeof v === "boolean" || isNaN(n) ? 0 : n; }

// "Tax Year 2023-24" / "2023-24" / "FY2023" / 2023 -> 2023 (null if none).
function startYearOf(v) {
  var m = String(v == null ? "" : v).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}
function fifthIfInWindow(amount, startYearRaw, fyStartYear) {
  if (!(amount > 0)) return 0;
  var start = startYearOf(startYearRaw);
  if (start !== null && fyStartYear) {
    var n = fyStartYear - start;
    if (n < 0 || n > 4) return 0;
  }
  return amount / 5;
}

// The expense objects of an entry: head office, then each branch.
function expenseObjects(entry) {
  var out = [];
  if (entry && entry.expenses && typeof entry.expenses === "object") out.push(entry.expenses);
  ((entry && entry.branches) || []).forEach(function (br) {
    if (br && br.expenses && typeof br.expenses === "object") out.push(br.expenses);
  });
  return out;
}

function branchTurnoverInr(entry) {
  return ((entry && entry.branches) || []).reduce(function (s, br) { return s + bxNum(br && br.turnover_inr); }, 0);
}

/* opts: { fyStartYear, noS35Donation }
 * returns { deductibleInr (all expenses incl. opening stock + purchases),
 *           closingStockInr, items: [{ key, amountInr }] } */
function regularBooksExpenses(entry, opts) {
  opts = opts || {};
  var items = {}, closingStockInr = 0;
  function add(key, amt) { if (amt) items[key] = (items[key] || 0) + amt; }
  expenseObjects(entry).forEach(function (exp) {
    Object.keys(exp).forEach(function (k) {
      if (!/_inr$/.test(k) || MEMO_KEYS[k]) return;
      var v = bxNum(exp[k]);
      if (!v) return;
      if (!SPECIAL_KEYS[k]) { add(k, v); return; }
      if (k === "closing_stock_inr") closingStockInr += v;
      else if (k === "employer_pf_esi_contribution_inr") { if (exp.employer_pf_esi_paid_before_due_date === true) add(k, v); }
      else if (k === "s35D_total_preliminary_expenses_inr") add(k, fifthIfInWindow(v, exp.s35D_year_of_commencement, opts.fyStartYear));
      else if (k === "s35DDA_vrs_payments_inr") add(k, fifthIfInWindow(v, exp.s35DDA_first_year_of_payment, opts.fyStartYear));
      else if (k === "s35_donation_to_approved_body_inr") { if (!opts.noS35Donation) add(k, v); }
    });
  });
  var list = Object.keys(items).map(function (k) { return { key: k, amountInr: items[k] }; });
  var deductibleInr = list.reduce(function (s, it) { return s + it.amountInr; }, 0);
  return { deductibleInr: deductibleInr, closingStockInr: closingStockInr, items: list };
}

// s.40(a)(i) / s.40(a)(ia) / s.40A(3) slices across head office + branches.
function disallowanceSlicesInr(entry) {
  var s40aI = 0, s40aIaBase = 0, s40A3 = 0;
  expenseObjects(entry).forEach(function (exp) {
    s40aI += bxNum(exp.payments_to_non_residents_no_tds_inr);
    s40aIaBase += bxNum(exp.payments_to_residents_no_tds_inr);
    s40A3 += bxNum(exp.total_cash_payments_exceeding_limit_inr) + bxNum(exp.total_cash_payments_exceeding_35k_inr);
  });
  return { s40aI: s40aI, s40aIa: Math.round(s40aIaBase * 0.30), s40A3: s40A3 };
}

function businessExpenseOpts(india, router) {
  var profile = (india && india.profile) || {};
  var entity = profile.entity_type || ((((india || {}).domestic_income || {}).business_income || {}).entity_type) || "individual";
  var newRegimeIndHuf = (entity === "individual" || entity === "huf") && String(profile.tax_regime || "NEW").toUpperCase() !== "OLD";
  var concessionalCompany = entity === "company" && (profile.opt_115baa === true || profile.opt_115bab === true);
  var fy = bxNum(router && router.base_tax_year) || startYearOf(((india || {}).metadata || {}).financial_year) || null;
  return { fyStartYear: fy, noS35Donation: newRegimeIndHuf || concessionalCompany };
}

var EXPENSE_LABELS = {
  rent_for_business_premises_inr: "Rent for business premises", repairs_maintenance_inr: "Repairs & maintenance",
  employee_salary_wages_inr: "Employee salary & wages", employee_bonus_commission_inr: "Employee bonus & commission",
  interest_on_borrowed_capital_inr: "Interest on borrowed capital", insurance_premium_inr: "Insurance premium",
  bad_debts_written_off_inr: "Bad debts written off", other_business_expenses_inr: "Other business expenses",
  ca_professional_fees_inr: "CA / professional fees", opening_stock_inr: "Opening stock", purchases_inr: "Purchases",
  employer_pf_esi_contribution_inr: "Employer PF/ESI contribution (paid before due date, s.43B(d))",
  s35D_total_preliminary_expenses_inr: "Preliminary expenses (1/5th, s.35D)", s35DDA_vrs_payments_inr: "VRS payments (1/5th, s.35DDA)"
};
function expenseLabel(key) {
  if (EXPENSE_LABELS[key]) return EXPENSE_LABELS[key];
  var s = key.replace(/_inr$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = {
  regularBooksExpenses: regularBooksExpenses, disallowanceSlicesInr: disallowanceSlicesInr,
  branchTurnoverInr: branchTurnoverInr, businessExpenseOpts: businessExpenseOpts, expenseLabel: expenseLabel
};
