"""Regular-books business expenses as Layer 1 India records them — mirrors
prototypes/graph-pilot/business-expenses.js exactly (see its header for the
rules: every *_inr expense on the head office and each branch, closing stock
as income, disclosure-only fields skipped, s.35D/35DDA at 1/5th, s.35
donations barred under the concessional regimes, NPA provisions not
deducted)."""
from __future__ import annotations

import re

MEMO_KEYS = {
    "payments_to_non_residents_no_tds_inr", "payments_to_residents_no_tds_inr",
    "total_cash_payments_exceeding_limit_inr", "total_cash_payments_exceeding_35k_inr", "npa_provisions_inr",
}
SPECIAL_KEYS = {
    "closing_stock_inr", "employer_pf_esi_contribution_inr", "s35D_total_preliminary_expenses_inr",
    "s35DDA_vrs_payments_inr", "s35_donation_to_approved_body_inr",
}


def _bx_num(v) -> float:
    if v is None or v == "" or isinstance(v, bool):
        return 0.0
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if f != f else f


def start_year_of(v):
    m = re.search(r"(19|20)\d{2}", "" if v is None else str(v))
    return int(m.group(0)) if m else None


def _fifth_if_in_window(amount: float, start_year_raw, fy_start_year) -> float:
    if not amount > 0:
        return 0.0
    start = start_year_of(start_year_raw)
    if start is not None and fy_start_year:
        n = fy_start_year - start
        if n < 0 or n > 4:
            return 0.0
    return amount / 5


def _expense_objects(entry) -> list:
    out = []
    if isinstance(entry, dict) and isinstance(entry.get("expenses"), dict):
        out.append(entry["expenses"])
    for br in (entry or {}).get("branches") or []:
        if isinstance(br, dict) and isinstance(br.get("expenses"), dict):
            out.append(br["expenses"])
    return out


def branch_receipts_inr(entry) -> dict:
    digital = other = 0.0
    for br in (entry or {}).get("branches") or []:
        br = br or {}
        t, dg, cs = _bx_num(br.get("turnover_inr")), _bx_num(br.get("digital_receipts_inr")), _bx_num(br.get("cash_receipts_inr"))
        digital += dg
        other += cs + max(0.0, t - dg - cs)
    return {"digitalInr": digital, "otherInr": other, "totalInr": digital + other}


def branch_turnover_inr(entry) -> float:
    return branch_receipts_inr(entry)["totalInr"]


def npa_provisions_inr(entry) -> float:
    total = 0.0
    for exp in _expense_objects(entry):
        total += _bx_num(exp.get("npa_provisions_inr"))
    return total


def regular_books_expenses(entry, opts=None) -> dict:
    opts = opts or {}
    items: dict = {}
    closing_stock_inr = 0.0

    def add(key, amt):
        if amt:
            items[key] = items.get(key, 0.0) + amt

    for exp in _expense_objects(entry):
        for k in list(exp.keys()):
            if not k.endswith("_inr") or k in MEMO_KEYS:
                continue
            v = _bx_num(exp[k])
            if not v:
                continue
            if k not in SPECIAL_KEYS:
                add(k, v)
            elif k == "closing_stock_inr":
                closing_stock_inr += v
            elif k == "employer_pf_esi_contribution_inr":
                if exp.get("employer_pf_esi_paid_before_due_date") is True:
                    add(k, v)
            elif k == "s35D_total_preliminary_expenses_inr":
                add(k, _fifth_if_in_window(v, exp.get("s35D_year_of_commencement"), opts.get("fyStartYear")))
            elif k == "s35DDA_vrs_payments_inr":
                add(k, _fifth_if_in_window(v, exp.get("s35DDA_first_year_of_payment"), opts.get("fyStartYear")))
            elif k == "s35_donation_to_approved_body_inr":
                if not opts.get("noS35Donation"):
                    add(k, v)
    lst = [{"key": k, "amountInr": v} for k, v in items.items()]
    deductible = 0.0
    for it in lst:
        deductible += it["amountInr"]
    return {"deductibleInr": deductible, "closingStockInr": closing_stock_inr, "items": lst}


def disallowance_slices_inr(entry) -> dict:
    s40a_i = s40a_ia_base = s40a3 = 0.0
    for exp in _expense_objects(entry):
        s40a_i += _bx_num(exp.get("payments_to_non_residents_no_tds_inr"))
        s40a_ia_base += _bx_num(exp.get("payments_to_residents_no_tds_inr"))
        s40a3 += _bx_num(exp.get("total_cash_payments_exceeding_limit_inr")) + _bx_num(exp.get("total_cash_payments_exceeding_35k_inr"))
    from ..core.util import js_round
    return {"s40aI": s40a_i, "s40aIa": js_round(s40a_ia_base * 0.30), "s40A3": s40a3}


def business_expense_opts(india, router) -> dict:
    india = india if isinstance(india, dict) else {}
    profile = india.get("profile") or {}
    entity = profile.get("entity_type") or ((((india.get("domestic_income") or {}).get("business_income")) or {}).get("entity_type")) or "individual"
    new_regime_ind_huf = entity in ("individual", "huf") and str(profile.get("tax_regime") or "NEW").upper() != "OLD"
    concessional_company = entity == "company" and (profile.get("opt_115baa") is True or profile.get("opt_115bab") is True)
    fy = _bx_num((router or {}).get("base_tax_year") if isinstance(router, dict) else None) or start_year_of((india.get("metadata") or {}).get("financial_year")) or None
    return {"fyStartYear": fy, "noS35Donation": new_regime_ind_huf or concessional_company}


EXPENSE_LABELS = {
    "rent_for_business_premises_inr": "Rent for business premises", "repairs_maintenance_inr": "Repairs & maintenance",
    "employee_salary_wages_inr": "Employee salary & wages", "employee_bonus_commission_inr": "Employee bonus & commission",
    "interest_on_borrowed_capital_inr": "Interest on borrowed capital", "insurance_premium_inr": "Insurance premium",
    "bad_debts_written_off_inr": "Bad debts written off", "other_business_expenses_inr": "Other business expenses",
    "ca_professional_fees_inr": "CA / professional fees", "opening_stock_inr": "Opening stock", "purchases_inr": "Purchases",
    "employer_pf_esi_contribution_inr": "Employer PF/ESI contribution (paid before due date, s.43B(d))",
    "s35D_total_preliminary_expenses_inr": "Preliminary expenses (1/5th, s.35D)", "s35DDA_vrs_payments_inr": "VRS payments (1/5th, s.35DDA)",
}


def expense_label(key: str) -> str:
    if key in EXPENSE_LABELS:
        return EXPENSE_LABELS[key]
    s = re.sub(r"_inr$", "", key).replace("_", " ")
    return s[:1].upper() + s[1:]
