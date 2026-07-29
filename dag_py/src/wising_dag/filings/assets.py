"""model.assets — Holdings/Business tab data (indianSecurities, businessEntities,
entityGraph, etc.) + the two MSME/presumptive-lockin findings assets-nodes.js
adds on top of report-batch5-nodes.js's findingsAllResult. Port of
prototypes/graph-pilot/assets-nodes.js.

Genuinely new in this file (no engine equivalent, no prior DAG node): the
self-employment/farm income traces, businessEntryIncomeTrace,
businessEntitiesResult (flat per-entity list), and the entity-ownership graph
(docs/BUSINESS_ENTITY_ARCHITECTURE.md §6) — buildEntityGraph and its
supporting kind/form maps. Everything else is reused directly from
already-ported pure functions rather than re-derived: self-employment/farm
net-profit math from us/aggregate_us_income.py, India business-entry
depreciation/disallowance/net-profit math from india/aggregate_india_income.py.

`msmeDisallowanceTotalAgg` reads only `bizMsmePayablesAgg` (already available
via aggregate_india_income.py, which every caller of this module's build()
will already have composed in) — a taxpayer-wide sum of the SAME s.43B(h)
overdue-MSME-invoice computation aggregate_india_income.py's
`_compute_msme_disallowance_inr` already nets into each business entry's own
net profit, surfaced here as its own disclosed figure for the finding below.
Like `presumptiveLockinAgg` (filings/documents.py), it reads real wall-clock
"now" in the JS source (`new Date()`) — ported to read `ctx["monitorAsOfBoundary"]`
instead, matching this port's architecture rule ("no filesystem/localStorage/
env-var/bare-datetime.now() reads inside wising_dag/ — 'now' only enters via
ctx").

`findingsAllResult` is OVERRIDEN here (not just extended) — same
`NodeRegistry.override(..., reason=...)` mechanism assets-nodes.js's own
`NODES.findingsAllResult = {deps: baseNodes.findingsAllResult.deps.concat([...]), ...}`
JS pattern maps onto structurally: the override's compute calls the
PREVIOUS findingsAllResult's own compute (captured via `base.get(...)`
before overriding) and appends the two new findings on top.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..core.dates import parse_date
from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import format_inr, js_num_str, js_round, num, safe
from ..india.constants import INDIA as _CONST_INDIA
from ..india.aggregate_india_income import (
    _aggregate_entry_depreciation_inr,
    _aggregate_entry_disallowances_inr,
    _compute_business_entry_net_profit_inr,
    _presumptive_ceiling_inr,
    _uses_regular_books_inr,
)
from ..us.aggregate_us_income import (
    _compute_farm_net_profit_usd,
    _compute_self_employment_net_profit_usd,
    _farm_net_profit_usd,
    _home_office_deduction_usd,
    _self_employment_net_profit_usd,
    _vehicle_deduction_usd,
)


def _inr(n: float) -> str:
    return f"₹{format_inr(n)}"


def _fmt(n: float) -> str:
    return f"${js_round(n):,}"


def _calc(formula, parts=None, citation=None):
    return {"kind": "calc", "formula": formula, "parts": parts or [], "citation": citation}


def _source(detail, citation=None):
    return {"kind": "source", "detail": detail, "citation": citation}


# ---- self-employment trace (normalize.js:1414-1447) -----------------------
def _self_employment_income_trace(s: dict, depreciation_plan_entry: dict | None):
    explicit = s.get("self_employment_earnings_usd") if s.get("self_employment_earnings_usd") is not None else s.get("net_profit_usd")
    if explicit is not None:
        return _source("Net self-employment earnings entered directly on Layer 1 US for this business (not derived from gross receipts and expenses).")
    cogs = num(s.get("cogs_beginning_inventory")) + num(s.get("cogs_purchases")) + num(s.get("cogs_labor")) + num(s.get("cogs_materials")) - num(s.get("cogs_ending_inventory"))
    parts = [{"label": "Gross receipts", "amount": num(s.get("gross_receipts_usd"))}]
    if num(s.get("returns_and_allowances_usd")) > 0:
        parts.append({"label": "Less: returns & allowances", "amount": -num(s.get("returns_and_allowances_usd"))})
    if cogs > 0:
        parts.append({"label": "Less: cost of goods sold", "amount": -cogs})
    if num(s.get("other_income_usd")) > 0:
        parts.append({"label": "Plus: other business income", "amount": num(s.get("other_income_usd"))})
    if num(s.get("expenses_usd")) > 0:
        parts.append({"label": "Less: business expenses", "amount": -num(s.get("expenses_usd"))})
    se_veh_ded, se_ho_ded = _vehicle_deduction_usd(s), _home_office_deduction_usd(s)
    if se_veh_ded > 0:
        parts.append({"label": f"Less: vehicle mileage deduction ({js_num_str(num(s.get('vehicle_miles')))} mi × $0.68)", "amount": -se_veh_ded})
    if se_ho_ded > 0:
        parts.append({"label": f"Less: home-office deduction (§280A simplified method, {js_num_str(min(num(s.get('home_office_sqft')), 300))} sqft × $5)", "amount": -se_ho_ded})
    for a in (depreciation_plan_entry["assets"] if depreciation_plan_entry else []):
        label = f"Asset ({a['class']}, yr {js_num_str(a['yearN'])})"
        if a["sec179Usd"] > 0:
            parts.append({"label": f"{label} — §179", "amount": -a["sec179Usd"]})
        if a["bonusUsd"] > 0:
            parts.append({"label": f"{label} — 100% bonus depreciation", "amount": -a["bonusUsd"]})
        if a["macrsUsd"] > 0:
            parts.append({"label": f"{label} — MACRS", "amount": -a["macrsUsd"]})
    return _calc(
        "Schedule C: gross receipts less returns/COGS, plus other income, less expenses, less vehicle-mileage/"
        "home-office deductions, less asset depreciation (§179 / 100% bonus, permanent under OBBBA / MACRS — "
        "computed from each asset's own class and placed-in-service date, not Layer 1's own first-year-only preview).",
        parts,
    )


# ---- farm trace (aggregateusincome-nodes.js) -------------------------------
def _farm_income_trace(f: dict, depreciation_plan_entry: dict | None):
    if f.get("net_profit_usd") is not None:
        return _source("Net farm profit entered directly on Layer 1 US for this farm (not derived from Schedule F line items).")
    if f.get("gross_income_usd") is not None:
        return _source("Gross farm income entered directly on Layer 1 US for this farm (gross_income_usd), net of expenses_usd and asset depreciation.")
    inc = safe(f, "itemized_income", {}) or {}
    parts = []
    for field, label in (
        ("sales_livestock_produce_raised", "Sales of livestock/produce raised"),
        ("sales_livestock_produce_purchased", "Sales of livestock/produce bought for resale"),
        ("cooperative_distributions", "Cooperative distributions"),
        ("agricultural_program_payments", "Agricultural program payments"),
        ("ccc_loans", "CCC loans"),
        ("crop_insurance_proceeds", "Crop insurance proceeds"),
        ("custom_hire_income", "Custom hire income"),
        ("other_income", "Other farm income"),
    ):
        if num(inc.get(field)) != 0:
            parts.append({"label": label, "amount": num(inc.get(field))})
    if f.get("accounting_method") == "accrual":
        inv = safe(f, "inventory", {}) or {}
        inv_adj = num(inv.get("beginning_inventory")) + num(inv.get("cost_of_purchases")) - num(inv.get("ending_inventory"))
        if inv_adj != 0:
            parts.append({"label": "Less: cost of livestock/items purchased for resale (accrual inventory)", "amount": -inv_adj})
    if num(f.get("expenses_usd")) != 0:
        parts.append({"label": "Less: farm operating expenses", "amount": -num(f.get("expenses_usd"))})
    farm_veh_ded, farm_ho_ded = _vehicle_deduction_usd(f), _home_office_deduction_usd(f)
    if farm_veh_ded > 0:
        parts.append({"label": f"Less: vehicle mileage deduction ({js_num_str(num(f.get('vehicle_miles')))} mi × $0.68)", "amount": -farm_veh_ded})
    if farm_ho_ded > 0:
        parts.append({"label": f"Less: home-office deduction (§280A simplified method, {js_num_str(min(num(f.get('home_office_sqft')), 300))} sqft × $5)", "amount": -farm_ho_ded})
    for a in (depreciation_plan_entry["assets"] if depreciation_plan_entry else []):
        label = f"Asset ({a['class']}, yr {js_num_str(a['yearN'])})"
        if a["sec179Usd"] > 0:
            parts.append({"label": f"{label} — §179", "amount": -a["sec179Usd"]})
        if a["bonusUsd"] > 0:
            parts.append({"label": f"{label} — 100% bonus depreciation", "amount": -a["bonusUsd"]})
        if a["macrsUsd"] > 0:
            parts.append({"label": f"{label} — MACRS", "amount": -a["macrsUsd"]})
    return _calc(
        "Schedule F: sum of itemized farm income lines, less accrual inventory adjustment (if applicable), "
        "less expenses, less vehicle-mileage/home-office deductions, less asset depreciation (§179 / 100% bonus / MACRS).",
        parts,
    )


# ---- India business-entry trace (normalize.js:56-165, 534-623) ------------
PRESUMPTIVE_CEILING_CITATION = (
    "s.44AD/44ADA turnover ceilings (Rs.2cr/Rs.3cr and Rs.50L/Rs.75L, the higher figure requiring digital receipts "
    "≥95% of total) verified 2026-07-12, matched to Layer 1 India's own live eligibility check — re-check each "
    "Finance Act cycle."
)
PRESUMPTIVE_RESIDENCY_CITATION = (
    "s.44AD/44ADA residency and entity-type eligibility (ROR-only; 44AD additionally excludes firms/LLPs/companies/"
    "AOPs/trusts/local authorities/co-ops, 44ADA further excludes HUFs) verified 2026-07-12, matched to Layer 1 "
    "India's own live eligibility check."
)


def _business_entry_income_trace(b: dict, eligibility: dict | None, depreciation_inr: float, disallowances_inr: float):
    eligibility = eligibility or {"eligible44AD": True, "eligible44ADA": True}
    explicit = b.get("net_profit_inr") if b.get("net_profit_inr") is not None else b.get("net_profit")
    if explicit is not None:
        return _source("Net profit entered directly on Layer 1 India for this business entry (not derived from a presumptive rate or books).")

    scheme = b.get("presumptive_scheme")
    ceiling_note, ceiling_citation = None, None
    dig44ad = csh44ad = ada_dig = ada_csh = ada_receipts = 0.0

    if scheme == "s44AD":
        dig44ad, csh44ad = num(b.get("digital_receipts_inr")), num(b.get("cash_receipts_inr"))
        ceiling_44ad = _presumptive_ceiling_inr("s44AD", dig44ad, csh44ad)
        if eligibility["eligible44AD"] and dig44ad + csh44ad <= ceiling_44ad:
            return _calc(
                "Presumptive income under s.44AD: digital/banking receipts × 6% + cash receipts × 8%",
                [
                    {"label": "Digital / banking receipts", "amount": dig44ad}, {"label": "Rate", "display": "6%"},
                    {"label": "Cash receipts", "amount": csh44ad}, {"label": "Rate", "display": "8%"},
                ],
                PRESUMPTIVE_CEILING_CITATION,
            )
        if not eligibility["eligible44AD"]:
            why = (
                f"this taxpayer's India residency status is {eligibility.get('indiaStatus') or 'not on file'}, not Resident & Ordinarily Resident (ROR)"
                if eligibility.get("rorFails")
                else f"this taxpayer's entity type ({eligibility.get('entityType')}) is one s.44AD excludes (firms/LLPs/companies/AOPs/trusts/local authorities/co-ops)"
            )
            ceiling_note = f"s.44AD is only available to Resident & Ordinarily Resident (ROR) individuals/HUFs and eligible firms — {why}, so the presumptive election is invalid and regular books apply instead:"
            ceiling_citation = PRESUMPTIVE_RESIDENCY_CITATION
        else:
            ceiling_note = f"Total receipts (₹{format_inr(dig44ad + csh44ad)}) exceed the s.44AD turnover ceiling for this cash-receipts mix (₹{format_inr(ceiling_44ad)}) — the presumptive election is invalid above this, so regular books apply instead:"
            ceiling_citation = PRESUMPTIVE_CEILING_CITATION
    elif scheme == "s44ADA":
        ada_dig, ada_csh = num(b.get("ada_digital_receipts_inr")), num(b.get("ada_cash_receipts_inr"))
        ada_receipts = num(b.get("gross_receipts_inr")) or (ada_dig + ada_csh)
        ceiling_44ada = _presumptive_ceiling_inr("s44ADA", ada_dig, ada_csh)
        if eligibility["eligible44ADA"] and ada_receipts <= ceiling_44ada:
            return _calc(
                "Presumptive income under s.44ADA: gross receipts × 50% (professionals)",
                [{"label": "Gross receipts", "amount": ada_receipts}, {"label": "Rate", "display": "50%"}],
                PRESUMPTIVE_CEILING_CITATION,
            )
        if not eligibility["eligible44ADA"]:
            why = (
                f"this taxpayer's India residency status is {eligibility.get('indiaStatus') or 'not on file'}, not Resident & Ordinarily Resident (ROR)"
                if eligibility.get("rorFails")
                else "this taxpayer's entity type is HUF, which s.44ADA excludes"
            )
            ceiling_note = f"s.44ADA is only available to Resident & Ordinarily Resident (ROR) individuals — {why}, so the presumptive election is invalid and regular books apply instead:"
            ceiling_citation = PRESUMPTIVE_RESIDENCY_CITATION
        else:
            ceiling_note = f"Gross receipts (₹{format_inr(ada_receipts)}) exceed the s.44ADA turnover ceiling for this cash-receipts mix (₹{format_inr(ceiling_44ada)}) — the presumptive election is invalid above this, so regular books apply instead:"
            ceiling_citation = PRESUMPTIVE_CEILING_CITATION
    elif scheme == "s44AE":
        return _source(
            "s.44AE tonnage-based presumptive income (goods carriages) is computed once from the Goods Vehicles "
            "schedule and rolled into the total business income figure above — it isn't split per vehicle here, "
            "so this entry shows ₹0 on its own."
        )
    elif scheme in ("s44BB", "s44BBB"):
        bb_turnover, bb_cash = num(b.get("turnover_inr")), num(b.get("cash_receipts_inr"))
        bb_label = "s.44BB (non-resident, mineral-oil exploration services)" if scheme == "s44BB" else "s.44BBB (foreign company, civil construction / turnkey power project)"
        return _calc(
            f"Presumptive income under {bb_label}: 10% of gross receipts, no ceiling test.",
            [
                {"label": "Turnover / gross receipts", "amount": bb_turnover}, {"label": "Cash receipts", "amount": bb_cash},
                {"label": "Rate", "display": "10%"},
            ],
        )

    exp = b.get("expenses") or {}
    expense_fields = [
        ("rent_for_business_premises_inr", "Rent for business premises"), ("repairs_maintenance_inr", "Repairs & maintenance"),
        ("employee_salary_wages_inr", "Employee salary & wages"), ("employee_bonus_commission_inr", "Employee bonus & commission"),
        ("interest_on_borrowed_capital_inr", "Interest on borrowed capital"), ("insurance_premium_inr", "Insurance premium"),
        ("bad_debts_written_off_inr", "Bad debts written off"), ("other_business_expenses_inr", "Other business expenses"),
        ("ca_professional_fees_inr", "CA / professional fees"),
    ]
    fallback_receipts = (
        num(b.get("gross_receipts_inr")) or num(b.get("turnover_inr")) or
        ((dig44ad + csh44ad) if scheme == "s44AD" else 0) or (ada_receipts if scheme == "s44ADA" else 0)
    )
    parts = [{"label": "Gross receipts / turnover", "amount": fallback_receipts}]
    for field, label in expense_fields:
        v = num(exp.get(field))
        if v > 0:
            parts.append({"label": f"Less: {label}", "amount": -v})
    if exp.get("employer_pf_esi_paid_before_due_date") is True and num(exp.get("employer_pf_esi_contribution_inr")) > 0:
        parts.append({"label": "Less: Employer PF/ESI contribution (paid before due date, s.43B(d))", "amount": -num(exp.get("employer_pf_esi_contribution_inr"))})
    if num(disallowances_inr) > 0:
        parts.append({"label": "Add back: statutory disallowances (s.40A(3) cash / s.40(a) TDS default / s.43B(h) MSME overdue)", "amount": num(disallowances_inr)})
    if num(depreciation_inr) > 0:
        parts.append({"label": "Less: current-year depreciation (s.32, asset blocks)", "amount": -num(depreciation_inr)})
    net_profit_inr = sum(p.get("amount") or 0 for p in parts)
    parts.append({"label": "Net profit (this entry)", "amount": net_profit_inr})
    formula = ceiling_note or (
        "Regular books: gross receipts/turnover less the itemized deductible expenses on file, less statutory "
        "disallowances (s.40A(3)/40(a)/43B(h)) already included in those expenses, less current-year depreciation "
        "(s.32 WDV method + s.32(1)(iia) additional depreciation). F&O-specific costs and s.35/35D/35DDA "
        "amortization aren't modeled yet (Phase 1 follow-on — see gap tracker IN-22/26), so this is still a floor, "
        "not the final figure."
    )
    return _calc(formula, parts, ceiling_citation)


# ---- businessEntities: one row per real entity (normalize.js:2568-2712) ---
def _business_entities_result(d, ctx):
    us, india = ctx.get("us"), ctx.get("india")
    lst = []
    ui = d["uiAgg"]
    entity_kind = safe(us, "profile.tax_entity_type", "individual")
    india_is_company_or_firm = d["indiaIsCompany"] or d["indiaIsFirm"] or d["indiaIsAop"] or d["indiaIsTrust"]

    if entity_kind in ("ccorp", "scorp", "partnership") or safe(us, "profile.incorporated_in_us", False) is True:
        m1 = safe(us, "corporate_financials.schedule_m1", None)
        m1_self_inc = (
            num(m1.get("net_income_per_books")) + num(m1.get("federal_tax_expense")) + num(m1.get("meals_disallowed_50")) +
            num(m1.get("foreign_taxes_credited")) + num(m1.get("interest_expense_limitation")) + num(m1.get("other_additions")) -
            num(m1.get("tax_exempt_interest")) - num(m1.get("tax_depreciation_over_book")) - num(m1.get("other_subtractions"))
        ) if m1 else 0.0
        self_inc = m1_self_inc if m1_self_inc != 0 else num(safe(ui, "business_income_usd", 0))
        self_form = {"ccorp": "1120 (C-Corp, 21% flat)", "scorp": "1120-S (pass-through)", "partnership": "1065 (pass-through)"}.get(entity_kind, "1120")
        if self_inc != 0:
            lst.append({
                "country": "US",
                "type": {"ccorp": "C-Corp (Form 1120)", "scorp": "S-Corp (Form 1120-S)", "partnership": "Partnership (Form 1065)"}.get(entity_kind, "C-Corp (Form 1120)"),
                "name": safe(us, "profile.full_name", "US entity"), "incomeUsd": self_inc, "corp": True,
                "filesOwnReturn": True, "returnForm": f"Form {self_form} — entity-level return",
                "calcTrace": (
                    _calc(
                        "Schedule M-1 book-to-tax reconciliation (this entity's own return, not a K-1 received from another entity).",
                        [
                            {"label": "Net income per books", "amount": num(m1.get("net_income_per_books"))},
                            {"label": "Plus: federal tax expense", "amount": num(m1.get("federal_tax_expense"))},
                            {"label": "Plus: meals & entertainment disallowed", "amount": num(m1.get("meals_disallowed_50"))},
                            {"label": "Plus: foreign taxes deducted (not credited)", "amount": num(m1.get("foreign_taxes_credited"))},
                            {"label": "Plus: s.163(j) interest expense limitation", "amount": num(m1.get("interest_expense_limitation"))},
                            {"label": "Plus: other additions", "amount": num(m1.get("other_additions"))},
                            {"label": "Less: tax-exempt interest", "amount": -num(m1.get("tax_exempt_interest"))},
                            {"label": "Less: tax depreciation over book depreciation", "amount": -num(m1.get("tax_depreciation_over_book"))},
                            {"label": "Less: other subtractions", "amount": -num(m1.get("other_subtractions"))},
                        ],
                    ) if m1_self_inc != 0 else
                    _source("Entity-level taxable income as entered on Layer 1 US (business_income_usd) — no Schedule M-1 data on file for this entity.")
                ),
            })

    se_depr_plan = d["usBusinessDepreciationPlan"]
    for se_idx, s in enumerate(safe(ui, "self_employment", []) or []):
        se_depr_entry = se_depr_plan["byBusiness"].get(f"se{se_idx}")
        se_depr_usd = se_depr_entry["totalUsd"] if se_depr_entry else 0
        lst.append({
            "country": "US", "type": "Self-employment (Sch C)", "name": s.get("business_name") or s.get("name") or "Self-employment",
            "incomeUsd": _self_employment_net_profit_usd(s, se_depr_usd), "se": True, "qbi": True,
            "filesOwnReturn": False, "returnForm": "Schedule C + Schedule SE (Form 1040)",
            "calcTrace": _self_employment_income_trace(s, se_depr_entry),
        })
    for farm_idx, f in enumerate(safe(ui, "farming_schedule_f", []) or []):
        farm_depr_entry = se_depr_plan["byBusiness"].get(f"farm{farm_idx}")
        farm_depr_usd = farm_depr_entry["totalUsd"] if farm_depr_entry else 0
        lst.append({
            "country": "US", "type": "Farm (Sch F)", "name": f.get("business_name") or f.get("name") or "Farm",
            "incomeUsd": _farm_net_profit_usd(f, farm_depr_usd), "se": True, "qbi": True,
            "filesOwnReturn": False, "returnForm": "Schedule F (Form 1040)",
            "calcTrace": _farm_income_trace(f, farm_depr_entry),
        })
    for k in safe(ui, "partnerships_k1", []) or []:
        ord_ = num(k.get("ordinary_business_income_usd") if k.get("ordinary_business_income_usd") is not None else k.get("ordinary_income_usd") or 0)
        gp = num(k.get("guaranteed_payments_usd") or 0)
        s179 = num(k.get("sec179_deduction_usd") or 0)
        lst.append({
            "country": "US", "type": "Partnership K-1 (1065)", "name": k.get("business_name") or k.get("partnership_name") or k.get("name") or "Partnership",
            "incomeUsd": ord_ + gp - s179, "se": True, "qbi": True,
            "filesOwnReturn": False, "returnForm": "Form 1065 (partnership return, informational) → Schedule E + Schedule SE (Form 1040)",
            "calcTrace": _calc(
                "Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4) − s.179 deduction (K-1 Box 12). "
                "Guaranteed payments count for SE tax but are excluded from the §199A QBI base. Interest/dividend/"
                "capital-gain/rental/royalty boxes on this K-1, if any, are folded into this taxpayer's general "
                "investment-income totals, not shown per-entity here.",
                [
                    {"label": "Ordinary business income (Box 1)", "amount": ord_}, {"label": "Guaranteed payments (Box 4)", "amount": gp},
                    {"label": "Less: s.179 deduction (Box 12)", "amount": -s179},
                ],
            ),
        })
    for s in safe(ui, "s_corporations_k1", []) or []:
        ord_ = num(s.get("ordinary_income_usd") if s.get("ordinary_income_usd") is not None else (s.get("scorp_income_usd") if s.get("scorp_income_usd") is not None else s.get("ordinary_business_income_usd") or 0))
        s179 = num(s.get("sec179_deduction_usd") or 0)
        lst.append({
            "country": "US", "type": "S-Corp K-1 (1120-S)", "name": s.get("business_name") or s.get("corp_name") or s.get("name") or "S-Corporation",
            "incomeUsd": ord_ - s179, "se": False, "qbi": True,
            "filesOwnReturn": False, "returnForm": "Form 1120-S (S-corp return, informational) → Schedule E (Form 1040)",
            "calcTrace": _calc(
                "Ordinary business income (K-1 Box 1, ordinary_income_usd — the real Layer 1 US field; "
                "scorp_income_usd/ordinary_business_income_usd are legacy fallbacks that don't exist on the live "
                "form) − s.179 deduction (Box 11). S-corp distributions aren't subject to SE tax.",
                [{"label": "Ordinary business income (Box 1)", "amount": ord_}, {"label": "Less: s.179 deduction (Box 11)", "amount": -s179}],
            ),
        })
    for t in safe(ui, "trusts_estates_k1", []) or []:
        ord_, og = num(t.get("ordinary_income_usd") or 0), num(t.get("ordinary_gain_usd") or 0)
        lst.append({
            "country": "US", "type": "Trust/Estate K-1 (1041)", "name": t.get("business_name") or "Trust/Estate",
            "incomeUsd": ord_ + og, "se": False, "qbi": True,
            "filesOwnReturn": False, "returnForm": "Form 1041 (fiduciary return, informational) → Schedule E (Form 1040)",
            "calcTrace": _calc(
                "Ordinary income (K-1 Box 1) + ordinary gain (Box 8 sub-line). Interest/dividend/capital-gain/rental/"
                "royalty boxes on this K-1, if any, are folded into this taxpayer's general investment-income "
                "totals, not shown per-entity here.",
                [{"label": "Ordinary income (Box 1)", "amount": ord_}, {"label": "Ordinary gain (Box 8)", "amount": og}],
            ),
        })
    for c in safe(ui, "c_corporations_1120", []) or []:
        lst.append({
            "country": "US", "type": "C-Corp (Form 1120)", "name": c.get("corp_name") or c.get("name") or "C-Corporation",
            "incomeUsd": num(c.get("taxable_income_usd") if c.get("taxable_income_usd") is not None else c.get("net_income_usd") or 0), "corp": True,
            "filesOwnReturn": True, "returnForm": "Form 1120 (C-Corp — entity-level return, 21% flat)",
            "calcTrace": _source(
                "Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or "
                "net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return "
                "until distributed."
            ),
        })

    biz_eligibility = d["presumptiveEligibilityAgg"]
    india_return_form_crude = "ITR-6" if d["indiaIsCompany"] else ("ITR-7" if d["indiaIsTrust"] else ("ITR-5" if (d["indiaIsFirm"] or d["indiaIsAop"]) else "ITR-2/3"))
    for b_idx, b in enumerate(d["bizEntriesAgg"] or []):
        net_profit_inr = b.get("net_profit_inr") if b.get("net_profit_inr") is not None else b.get("net_profit")
        is_regular_books = _uses_regular_books_inr(b, biz_eligibility)
        entry_depr_inr = _aggregate_entry_depreciation_inr(b_idx, d["bizAssetBlocksAgg"], india, b) if is_regular_books else 0
        entry_disallow_inr = _aggregate_entry_disallowances_inr(b_idx, b.get("expenses") or {}, d["bizMsmePayablesAgg"]) if is_regular_books else 0
        if net_profit_inr is None:
            net_profit_inr = _compute_business_entry_net_profit_inr(b, biz_eligibility, entry_depr_inr, entry_disallow_inr)
        net_profit_inr = num(net_profit_inr)
        entry_return_form = india_return_form_crude if india_is_company_or_firm else (
            "Regular books (this entry) — feeds the taxpayer's overall return form; see Filings → Return Form for the checked ITR"
            if is_regular_books else
            "Valid presumptive election (this entry) — feeds the taxpayer's overall return form; see Filings → Return Form for the checked ITR"
        )
        lst.append({
            "country": "IN", "type": "Business / Profession (PGBP)", "name": b.get("business_name") or b.get("trade_name") or b.get("name") or "Indian business",
            "incomeUsd": net_profit_inr / fx_rate(ctx), "inr": net_profit_inr,
            "filesOwnReturn": india_is_company_or_firm, "returnForm": entry_return_form,
            "calcTrace": _business_entry_income_trace(b, biz_eligibility, entry_depr_inr, entry_disallow_inr),
        })

    # Phase 7 (XB-14): prefer the real computed per-CFC trace (tested income -
    # tested loss + Subpart F included) over the legacy hand-entered
    # gilti_income_usd estimate, matched by corp name. gilti_income_usd stays
    # as a fallback only for old saved data with no computed trace at all —
    # never written by the current UI. Mirrors assets-nodes.js exactly.
    cfc_trace_by_name: dict = {}
    for t in safe(d.get("cfcInclusionResult"), "perCfcTrace", []) or []:
        if t.get("name"):
            cfc_trace_by_name[str(t["name"]).lower().strip()] = t
    for c in d["usForeignCorpsRaw"] or []:
        country = c.get("country") if c.get("country") is not None else c.get("country_of_incorporation")
        corp_name = c.get("corp_name") or c.get("corporation_name")
        ownership_pct = num(c.get("ownership_pct") if c.get("ownership_pct") is not None else c.get("ownership_percentage"))
        trace = cfc_trace_by_name.get(str(corp_name).lower().strip()) if corp_name else None
        computed_inclusion_usd = (trace["testedIncomeUsd"] - trace["testedLossUsd"] + trace["subpartFIncludedUsd"]) if trace else None
        gilti_usd = computed_inclusion_usd if computed_inclusion_usd is not None else num(c.get("gilti_income_usd") or 0)
        if computed_inclusion_usd is not None:
            calc_trace_detail = (
                f"NCTI + Subpart F inclusion computed from this CFC's entered tested income/loss, Subpart F income and E&P "
                f"(§951/§951A), pro-rated by ownership: {js_round(ownership_pct)}%. See the CFC/NCTI finding for the full "
                f"§250 deduction / §962 tax / FTC breakdown. Documented simplifications: no QBAI (correctly eliminated OBBBA "
                f"TY2026), no PTEP tracking, no state conformity modeled."
            )
        else:
            calc_trace_detail = (
                f"GILTI inclusion as entered on Layer 1 US for this CFC (legacy gilti_income_usd field) — a hand-entered "
                f"estimate carried over from old saved data. Ownership: {js_round(ownership_pct)}%. This is a US inclusion "
                f"only — the entity's own foreign-country income tax return is separate and not shown here."
            )
        lst.append({
            "country": "IN" if country == "IN" else "US", "type": "Foreign corporation (CFC)", "name": corp_name or "Foreign corporation",
            "incomeUsd": gilti_usd, "cfc": True, "gilti": gilti_usd, "ownershipPct": ownership_pct,
            "filesOwnReturn": True, "returnForm": "Foreign local return (not modeled) + Form 5471 (informational, US) + NCTI/GILTI + Subpart F on Schedule 1 (Form 1040)",
            "calcTrace": _source(calc_trace_detail),
        })

    by_name: dict = {}
    order: list = []
    for e in lst:
        key = " ".join(str(e.get("name") or "").lower().split())
        if key not in by_name:
            by_name[key] = e
            order.append(key)
            continue
        ex = by_name[key]
        if e.get("cfc"):
            ex["cfc"] = True
            ex["gilti"] = max(ex.get("gilti") or 0, e.get("gilti") or 0)
            ex["ownershipPct"] = ex.get("ownershipPct") or e.get("ownershipPct")
            if not ex.get("incomeUsd"):
                ex["incomeUsd"] = e.get("incomeUsd")
        elif ex.get("cfc"):
            e["cfc"], e["gilti"], e["ownershipPct"] = ex["cfc"], ex.get("gilti"), ex.get("ownershipPct")
            by_name[key] = e
        else:
            ex["incomeUsd"] = max(ex.get("incomeUsd") or 0, e.get("incomeUsd") or 0)
    return [by_name[k] for k in order]


# ---- entity graph (docs/BUSINESS_ENTITY_ARCHITECTURE.md §6) ---------------
INDIA_ENTITY_KIND_MAP = {
    "huf": "in_huf", "firm": "in_firm", "llp": "in_llp", "company": "in_company",
    "aop": "in_aop", "trust": "in_trust", "local": "in_local", "coop": "in_coop", "ajp": "in_ajp",
}
US_ENTITY_KIND_MAP = {"ccorp": "us_ccorp", "scorp": "us_scorp", "partnership": "us_partnership", "trust": "us_trust", "llc": "us_llc"}
INDIA_KIND_TO_ITR = {
    "in_huf": "ITR-2/3 (HUF)", "in_firm": "ITR-5 (Firm/LLP)", "in_llp": "ITR-5 (Firm/LLP)",
    "in_company": "ITR-6 (Company)", "in_aop": "ITR-5 (AOP/BOI)", "in_trust": "ITR-7 (Trust)",
    "in_local": "ITR-5 (Local authority)", "in_coop": "ITR-5 (Co-operative society)", "in_ajp": "ITR-7 (AJP)",
}
US_KIND_TO_FORM = {
    "us_ccorp": "Form 1120 (C-Corp, 21% flat)", "us_scorp": "Form 1120-S (pass-through)",
    "us_partnership": "Form 1065 (pass-through, informational)", "us_trust": "Form 1041 (fiduciary)",
    "us_llc": "Form 1065/1120/Schedule C (LLC — depends on entity classification election, not modeled)",
}
US_K1_KIND_TO_FORM = {
    "us_partnership": "Form 1065 (partnership return, informational) → Schedule E + Schedule SE (Form 1040)",
    "us_scorp": "Form 1120-S (S-corp return, informational) → Schedule E (Form 1040)",
    "us_trust": "Form 1041 (fiduciary return, informational) → Schedule E (Form 1040)",
}


def _root_return_form(india_kind, us_kind):
    india_form = INDIA_KIND_TO_ITR.get(india_kind) if india_kind else None
    us_form = US_KIND_TO_FORM.get(us_kind) if us_kind else None
    if india_form and us_form:
        return f"{india_form} (India) + {us_form} (US)"
    if india_form:
        return f"{india_form} — see Filings → Return Form for any additional US-side requirement"
    if us_form:
        return f"{us_form} — see Filings → Return Form for any additional India-side requirement"
    return "Individual — see Filings → Return Form for the actual ITR/1040 determination"


def _norm_entity_name(n) -> str:
    return " ".join(str(n or "").lower().split())


def _k1_passive_income_usd_for_graph(k: dict) -> dict:
    return {
        "interestUsd": num(k.get("interest_income_usd")), "ordDivUsd": num(k.get("ordinary_dividends_usd")),
        "qualDivUsd": num(k.get("qualified_dividends_usd")), "stcgUsd": num(k.get("stcg_usd")),
        "ltcgUsd": num(k.get("ltcg_usd")) + max(0.0, num(k.get("net_sec1231_gain_usd") if k.get("net_sec1231_gain_usd") is not None else k.get("sec1231_gain_usd") or 0)),
        "rentalUsd": num(k.get("net_rental_real_estate_usd")) + num(k.get("other_rental_income_usd")) + num(k.get("royalties_usd") if k.get("royalties_usd") is not None else k.get("royalty_income_usd") or 0),
    }


def _passive_income_trace_parts(passive: dict) -> list:
    parts = []
    if passive["interestUsd"] != 0:
        parts.append({"label": "Interest income (K-1 passive box)", "amount": passive["interestUsd"]})
    if passive["ordDivUsd"] != 0:
        parts.append({"label": "Ordinary dividends (K-1 passive box)", "amount": passive["ordDivUsd"]})
    if passive["stcgUsd"] != 0:
        parts.append({"label": "Short-term capital gain (K-1 passive box)", "amount": passive["stcgUsd"]})
    if passive["ltcgUsd"] != 0:
        parts.append({"label": "Long-term capital gain + net s.1231 gain (K-1 passive box)", "amount": passive["ltcgUsd"]})
    if passive["rentalUsd"] != 0:
        parts.append({"label": "Rental + royalty income (K-1 passive box)", "amount": passive["rentalUsd"]})
    return parts


def _build_entity_graph(d, ctx):
    us, india = ctx.get("us"), ctx.get("india")
    entities: list = []
    edges: list = []
    us_tax_entity_type = safe(us, "profile.tax_entity_type", "individual")
    india_entity_type = d["indiaEntityTypeRaw"]
    root_us_kind = US_ENTITY_KIND_MAP.get(us_tax_entity_type)
    root_india_kind = INDIA_ENTITY_KIND_MAP.get(india_entity_type)
    india_name = safe(india, "profile.full_name", None)
    us_name = safe(us, "profile.full_name", None)
    names_match = bool(root_india_kind and root_us_kind and _norm_entity_name(india_name) != "" and _norm_entity_name(india_name) == _norm_entity_name(us_name))

    if root_india_kind and root_us_kind and not names_match:
        entities.append({"id": "root_in", "kind": root_india_kind, "jurisdiction": "IN", "name": india_name or "Indian entity", "returnForm": INDIA_KIND_TO_ITR.get(root_india_kind), "layer1Ref": None})
        entities.append({"id": "root_us", "kind": root_us_kind, "jurisdiction": "US", "name": us_name or "US entity", "returnForm": US_KIND_TO_FORM.get(root_us_kind), "layer1Ref": None})
        root_ids = ["root_in", "root_us"]
    else:
        root_kind = root_india_kind or root_us_kind or "individual"
        root_jurisdiction = "IN" if root_india_kind else ("US" if root_us_kind else "both")
        root_name = india_name or us_name or "Taxpayer"
        entities.append({"id": "root", "kind": root_kind, "jurisdiction": root_jurisdiction, "name": root_name, "returnForm": _root_return_form(root_india_kind, root_us_kind), "layer1Ref": None})
        root_ids = ["root"]

    primary_root_id = "root_in" if "root_in" in root_ids else root_ids[0]

    def find_root_id_by_name(name):
        n = _norm_entity_name(name)
        if not n:
            return None
        for rid in root_ids:
            entity = next(e for e in entities if e["id"] == rid)
            if _norm_entity_name(entity["name"]) == n:
                return rid
        return None

    for idx, b in enumerate(d["bizEntriesAgg"] or []):
        kind = INDIA_ENTITY_KIND_MAP.get(b.get("entity_type"))
        if not kind:
            continue
        entity_id = f"in_biz_{idx}"
        is_regular_books = _uses_regular_books_inr(b, d["presumptiveEligibilityAgg"])
        entry_depr_inr = _aggregate_entry_depreciation_inr(idx, d["bizAssetBlocksAgg"], india, b) if is_regular_books else 0
        entry_disallow_inr = _aggregate_entry_disallowances_inr(idx, b.get("expenses") or {}, d["bizMsmePayablesAgg"]) if is_regular_books else 0
        net_profit_inr = b.get("net_profit_inr") if b.get("net_profit_inr") is not None else b.get("net_profit")
        if net_profit_inr is None:
            net_profit_inr = _compute_business_entry_net_profit_inr(b, d["presumptiveEligibilityAgg"], entry_depr_inr, entry_disallow_inr)
        net_profit_inr = num(net_profit_inr)
        entities.append({
            "id": entity_id, "kind": kind, "jurisdiction": "IN", "name": b.get("business_name") or b.get("trade_name") or b.get("name") or None,
            "returnForm": (INDIA_KIND_TO_ITR.get(kind) or "") + " (informational — this entity's own return; WISING doesn't prepare it, only folds its net profit through to the taxpayer as modeled here)",
            "layer1Ref": {"form": "layer1_india", "path": f"domestic_income.business_income.business_entries[{idx}]"},
            "income": {"inr": net_profit_inr, "usd": net_profit_inr / fx_rate(ctx)},
        })
        edges.append({
            "from": entity_id, "to": primary_root_id, "ownershipPct": None, "flow": "business_income", "amountInr": net_profit_inr,
            "trace": _business_entry_income_trace(b, d["presumptiveEligibilityAgg"], entry_depr_inr, entry_disallow_inr),
        })

    for idx, firm in enumerate(d["partnerFirmsAgg"] or []):
        entity_id = f"in_partner_firm_{idx}"
        kind = INDIA_ENTITY_KIND_MAP.get(firm.get("entity_type")) or "in_firm"
        entities.append({
            "id": entity_id, "kind": kind, "jurisdiction": "IN", "name": firm.get("firm_name") or None,
            "returnForm": (INDIA_KIND_TO_ITR.get(kind) or "") + " (informational — this firm's own return; WISING doesn't prepare it, only the partner's remuneration/profit share flowing through, per s.3.3 above)",
            "layer1Ref": {"form": "layer1_india", "path": f"domestic_income.business_income.partner_firms[{idx}]"},
        })
        remuneration_inr, interest_inr = num(firm.get("remuneration_from_entity_inr")), num(firm.get("interest_on_capital_from_entity_inr"))
        total_remuneration_inr = remuneration_inr + interest_inr
        if total_remuneration_inr != 0:
            edges.append({
                "from": entity_id, "to": primary_root_id, "ownershipPct": None, "flow": "partner_remuneration", "amountInr": total_remuneration_inr,
                "trace": _calc(
                    "Taxable PGBP income to the partner (s.40(b)) — the firm's own s.40(b) cap on what it may pay "
                    "out is tested at the firm's own return, which this app doesn't prepare, so the entered figure "
                    "is trusted rather than re-derived (§3.3).",
                    [{"label": "Remuneration from entity", "amount": remuneration_inr}, {"label": "Interest on capital from entity", "amount": interest_inr}],
                ),
            })
        exempt_share_inr = num(firm.get("profit_share_exempt_inr"))
        if exempt_share_inr != 0:
            edges.append({
                "from": entity_id, "to": primary_root_id, "ownershipPct": None, "flow": "exempt_profit_share", "amountInr": exempt_share_inr,
                "trace": _source("Genuinely exempt to the partner under s.10(2A) — already taxed at the firm's own level. Shown for reconciliation only; not added to the partner's taxable income."),
            })

    us_flow_target_id = "root_us" if "root_us" in root_ids else root_ids[0]

    def push_k1_entities(kind, id_prefix, source_path, name_fn, flow_label, income_usd_fn, ordinary_trace_parts_fn, formula_note):
        for idx, k in enumerate(safe(us, source_path, []) or []):
            entity_id = f"{id_prefix}{idx}"
            income_usd = income_usd_fn(k)
            passive = _k1_passive_income_usd_for_graph(k)
            entities.append({
                "id": entity_id, "kind": kind, "jurisdiction": "US", "name": name_fn(k),
                "returnForm": US_K1_KIND_TO_FORM.get(kind), "layer1Ref": {"form": "layer1_us", "path": f"{source_path}[{idx}]"},
                "income": {"usd": income_usd, "inr": income_usd * fx_rate(ctx)}, "passiveIncomeUsd": passive,
            })
            edges.append({"from": entity_id, "to": us_flow_target_id, "ownershipPct": None, "flow": flow_label, "amountUsd": income_usd, "trace": _calc(formula_note, ordinary_trace_parts_fn(k))})
            passive_total_usd = passive["interestUsd"] + passive["ordDivUsd"] + passive["stcgUsd"] + passive["ltcgUsd"] + passive["rentalUsd"]
            if passive_total_usd != 0:
                edges.append({
                    "from": entity_id, "to": us_flow_target_id, "ownershipPct": None, "flow": "k1_passive_income", "amountUsd": passive_total_usd,
                    "trace": _calc(
                        "This K-1's own interest/dividend/capital-gain/rental/royalty boxes — folded into the "
                        "taxpayer's overall totals for those income types elsewhere, but shown here so this "
                        "specific entity's contribution is traceable rather than anonymous within the combined figure.",
                        _passive_income_trace_parts(passive),
                    ),
                })

    push_k1_entities(
        "us_partnership", "us_k1_partnership_", "income_us_source.partnerships_k1",
        lambda k: k.get("business_name") or k.get("partnership_name") or k.get("name"), "k1_passthrough",
        lambda k: num(k.get("ordinary_business_income_usd") if k.get("ordinary_business_income_usd") is not None else k.get("ordinary_income_usd") or 0) + num(k.get("guaranteed_payments_usd") or 0) - num(k.get("sec179_deduction_usd") or 0),
        lambda k: [
            {"label": "Ordinary business income (Box 1)", "amount": num(k.get("ordinary_business_income_usd") if k.get("ordinary_business_income_usd") is not None else k.get("ordinary_income_usd") or 0)},
            {"label": "Guaranteed payments (Box 4)", "amount": num(k.get("guaranteed_payments_usd") or 0)},
            {"label": "Less: s.179 deduction (Box 12)", "amount": -num(k.get("sec179_deduction_usd") or 0)},
        ],
        "Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4) − s.179 deduction (K-1 Box 12). Guaranteed payments count for SE tax but are excluded from the §199A QBI base.",
    )
    push_k1_entities(
        "us_scorp", "us_k1_scorp_", "income_us_source.s_corporations_k1",
        lambda k: k.get("business_name") or k.get("corp_name") or k.get("name"), "k1_passthrough",
        lambda k: num(k.get("ordinary_income_usd") if k.get("ordinary_income_usd") is not None else (k.get("scorp_income_usd") if k.get("scorp_income_usd") is not None else k.get("ordinary_business_income_usd") or 0)) - num(k.get("sec179_deduction_usd") or 0),
        lambda k: [
            {"label": "Ordinary business income (Box 1)", "amount": num(k.get("ordinary_income_usd") if k.get("ordinary_income_usd") is not None else (k.get("scorp_income_usd") if k.get("scorp_income_usd") is not None else k.get("ordinary_business_income_usd") or 0))},
            {"label": "Less: s.179 deduction (Box 11)", "amount": -num(k.get("sec179_deduction_usd") or 0)},
        ],
        "Ordinary business income (K-1 Box 1, ordinary_income_usd — the real Layer 1 US field; scorp_income_usd/ordinary_business_income_usd are legacy fallbacks that don't exist on the live form) − s.179 deduction (Box 11). S-corp distributions aren't subject to SE tax.",
    )
    push_k1_entities(
        "us_trust", "us_k1_trust_", "income_us_source.trusts_estates_k1",
        lambda k: k.get("business_name"), "k1_passthrough",
        lambda k: num(k.get("ordinary_income_usd") or 0) + num(k.get("ordinary_gain_usd") or 0),
        lambda k: [{"label": "Ordinary income (Box 1)", "amount": num(k.get("ordinary_income_usd") or 0)}, {"label": "Ordinary gain (Box 8)", "amount": num(k.get("ordinary_gain_usd") or 0)}],
        "Ordinary income (K-1 Box 1) + ordinary gain (Box 8 sub-line).",
    )

    for idx, c in enumerate(safe(us, "income_us_source.c_corporations_1120", []) or []):
        name = c.get("corp_name") or c.get("name")
        if find_root_id_by_name(name):
            continue
        entity_id = f"us_ccorp_{idx}"
        income_usd = num(c.get("taxable_income_usd") if c.get("taxable_income_usd") is not None else c.get("net_income_usd") or 0)
        entities.append({
            "id": entity_id, "kind": "us_ccorp", "jurisdiction": "US", "name": name,
            "returnForm": "Form 1120 (C-Corp, 21% flat)", "layer1Ref": {"form": "layer1_us", "path": f"income_us_source.c_corporations_1120[{idx}]"},
            "income": {"usd": income_usd, "inr": income_usd * fx_rate(ctx)},
        })
        edges.append({
            "from": entity_id, "to": us_flow_target_id, "ownershipPct": None, "flow": "dividend", "amountUsd": income_usd,
            "trace": _source(
                "Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or "
                "net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return "
                "until distributed — shown here as a placeholder for the eventual dividend flow, not an actual "
                "distribution WISING has independently confirmed occurred."
            ),
        })

    # Phase 7 (XB-14): same computed-trace-over-legacy-estimate preference as
    # _business_entities_result above. Mirrors assets-nodes.js exactly.
    entity_graph_cfc_trace_by_name: dict = {}
    for t in safe(d.get("cfcInclusionResult"), "perCfcTrace", []) or []:
        if t.get("name"):
            entity_graph_cfc_trace_by_name[str(t["name"]).lower().strip()] = t
    for idx, c in enumerate(d["usForeignCorpsRaw"] or []):
        corp_name = c.get("corp_name") or c.get("corporation_name")
        ownership_pct = num(c.get("ownership_pct") if c.get("ownership_pct") is not None else c.get("ownership_percentage"))
        eg_trace = entity_graph_cfc_trace_by_name.get(str(corp_name).lower().strip()) if corp_name else None
        eg_computed_usd = (eg_trace["testedIncomeUsd"] - eg_trace["testedLossUsd"] + eg_trace["subpartFIncludedUsd"]) if eg_trace else None
        gilti_usd = eg_computed_usd if eg_computed_usd is not None else num(c.get("gilti_income_usd") or 0)
        if eg_computed_usd is not None:
            gilti_trace_text = (
                "NCTI + Subpart F inclusion computed from this CFC's entered tested income/loss, Subpart F income and "
                "E&P (§951/§951A). See the CFC/NCTI finding for the full §250 deduction / §962 tax / FTC breakdown."
            )
        else:
            gilti_trace_text = (
                "GILTI inclusion as entered on Layer 1 US for this CFC (legacy gilti_income_usd field) — a hand-entered "
                "estimate carried over from old saved data."
            )
        matched_root_id = find_root_id_by_name(corp_name)
        if matched_root_id:
            other_root_id = next((r for r in root_ids if r != matched_root_id), None)
            if other_root_id:
                edges.append({
                    "from": matched_root_id, "to": other_root_id, "ownershipPct": ownership_pct, "flow": "gilti", "amountUsd": gilti_usd,
                    "trace": _source(
                        f"{gilti_trace_text} Ownership: {js_round(ownership_pct)}%. This edge connects two entities BOTH "
                        f"already modeled as their own root here (a US parent and its differently-named subsidiary), not "
                        f"a newly-created placeholder node."
                    ),
                })
            continue
        entity_id = f"foreign_corp_{idx}"
        entities.append({
            "id": entity_id, "kind": "foreign_corp", "jurisdiction": "IN" if (c.get("country") if c.get("country") is not None else c.get("country_of_incorporation")) == "IN" else "foreign", "name": corp_name,
            "returnForm": "Foreign local return (not modeled) + Form 5471 (informational)", "layer1Ref": {"form": "layer1_us", "path": f"foreign_entities.foreign_corporations[{idx}]"},
            "income": {"usd": gilti_usd, "inr": gilti_usd * fx_rate(ctx)},
        })
        edges.append({
            "from": entity_id, "to": us_flow_target_id, "ownershipPct": ownership_pct, "flow": "gilti", "amountUsd": gilti_usd,
            "trace": _source(
                f"{gilti_trace_text} Ownership: {js_round(ownership_pct)}%. This is a US inclusion only — the entity's "
                f"own foreign-country income tax return is separate and not shown here."
            ),
        })

    return {"entities": entities, "edges": edges}


def _assets_model_result(d, ctx):
    return {
        "indianMutualFunds": d["indianMutualFundsResult"],
        "indianSecurities": d["indiaFinancialHoldingsTxRaw"],
        "usPficHoldings": safe(ctx.get("us"), "foreign_entities.pfic_holdings", []),
        "indianBusinesses": d["indianBusinessesBoundary"],
        "usForeignCorps": d["usForeignCorpsRaw"],
        "usOwns10PctForeignCorp": d["usOwns10PctForeignCorpRaw"],
        "indianProperties": safe(ctx.get("india"), "property.properties", []),
        "epfInr": d["epfInrRaw"], "ppfInr": d["ppfInrRaw"], "npsInr": d["npsInrRaw"],
        "taxableEpfInterestInr": d["taxableEpfInterestInrAgg"], "taxableNpsWithdrawalInr": d["taxableNpsWithdrawalInrAgg"],
        "usSecurities": d["usSecuritiesBoundary"],
        "usProperties": safe(ctx.get("us"), "real_estate.properties", []) or [],
        "usRetirement": safe(ctx.get("us"), "retirement_accounts", {}) or {},
        "businessEntities": _business_entities_result(d, ctx),
        "entityGraph": _build_entity_graph(d, ctx),
    }


# ---- s.43B(h) MSME disallowance total, taxpayer-wide -----------------------
def _msme_disallowance_total_agg(d, ctx):
    now = ctx.get("monitorAsOfBoundary")
    today = datetime.fromisoformat(now) if isinstance(now, str) else (now or datetime.now(timezone.utc))
    # normalized to a naive datetime — invoice_date/payment_date strings are
    # plain "YYYY-MM-DD" (parse_date returns naive for those); comparing a
    # tz-aware "now" against them would raise TypeError.
    today = today.replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)
    total_inr, overdue_count = 0.0, 0
    for m in d["bizMsmePayablesAgg"] or []:
        amt = num(m.get("amount_inr"))
        if not m.get("invoice_date") or amt <= 0:
            continue
        inv_date = parse_date(m.get("invoice_date"))
        if inv_date is None:
            continue
        inv_date = inv_date.replace(hour=0, minute=0, second=0, microsecond=0)
        due_delta_days = 45 if m.get("has_written_agreement") is True else 15
        due_date = inv_date + timedelta(days=due_delta_days)
        ref_date = parse_date(m.get("payment_date")) if m.get("payment_date") else today
        ref_date = (ref_date or today).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)
        if ref_date > due_date:
            total_inr += amt
            overdue_count += 1
    return {"totalInr": total_inr, "overdueCount": overdue_count}


_MSME_SORT_WEIGHT = {"critical": 0, "warning": 1, "info": 2}


def _findings_all_result_override(d, ctx, base_compute):
    all_findings = list(base_compute(d, ctx))
    added_any = False

    msme = d["msmeDisallowanceTotalAgg"]
    if msme and msme["totalInr"] > 0:
        added_any = True
        all_findings.append({
            "id": "msme_disallowance_s43Bh_india", "severity": "warning", "category": "income",
            "title": f"s.43B(h) MSME disallowance: {_inr(msme['totalInr'])} added back to business income",
            "detail": (
                f"This taxpayer has {msme['overdueCount']} MSME payable{'' if msme['overdueCount'] == 1 else 's'} "
                f"({_inr(msme['totalInr'])} total) still unpaid beyond the statutory window (15 days, or 45 days "
                "with a written agreement) as of today. Under s.43B(h) (Finance Act 2023), that amount is "
                "disallowed as a business deduction for this AY and only becomes deductible in the year actually "
                "paid — it has already been added back into the business income figure computed above, not left "
                "as a separate manual step."
            ),
            "recommendation": (
                "Confirm these MSME dues before filing — paying before the return due date does not cure a "
                "s.43B(h) disallowance once the statutory window has already lapsed; the deduction shifts to the "
                "year of actual payment regardless."
            ),
            "amountUsd": msme["totalInr"] / fx_rate(ctx),
            "refs": ["s.43B(h) (Finance Act 2023, MSME payables)", "MSMED Act 2006 s.15/16"],
        })

    lockin = d["presumptiveLockinAgg"]
    if lockin and lockin["lockInActive"]:
        added_any = True
        basic_exemption_inr = (_CONST_INDIA["SLABS_OLD"] if d["taxRegime"] == "OLD" else _CONST_INDIA["SLABS_NEW"])[0][0]
        audit_applies = d["totalIncomeInrV3"] > basic_exemption_inr
        reelect_ay = lockin["currentAyStart"] + lockin["yearsRemaining"]
        all_findings.append({
            "id": "presumptive_lockin_active_india",
            "severity": "critical" if audit_applies else "warning",
            "category": "document",
            "title": (
                f"s.44AD presumptive taxation locked out for {lockin['yearsRemaining']} more year{'' if lockin['yearsRemaining'] == 1 else 's'}"
                + (" — mandatory tax audit applies this year" if audit_applies else "")
            ),
            "detail": (
                f"This taxpayer exited s.44AD presumptive taxation in AY {lockin['exitYear']}-{str(lockin['exitYear'] + 1)[-2:]}. "
                "Under s.44AD(4), the presumptive scheme cannot be re-elected for 5 assessment years from that "
                f"exit — re-election is possible starting AY {reelect_ay}-{str(reelect_ay + 1)[-2:]}."
                + (
                    f" Total income this year ({_inr(d['totalIncomeInrV3'])}) exceeds the basic exemption limit "
                    f"({_inr(basic_exemption_inr)}) while this lock-out is active — s.44AD(5) makes a tax audit "
                    "under s.44AB MANDATORY this year, regardless of turnover or the usual ₹1cr/₹10cr threshold."
                    if audit_applies else
                    f" Total income this year ({_inr(d['totalIncomeInrV3'])}) is below the basic exemption limit "
                    f"({_inr(basic_exemption_inr)}), so s.44AD(5)'s mandatory-audit consequence does not apply "
                    "THIS year — but re-check every year the lock-out remains active."
                )
            ),
            "recommendation": (
                "Arrange a tax audit (Form 3CB/3CD) for this AY — see Documents to File. Do not rely on the "
                "turnover threshold alone; s.44AD(5) overrides it while this lock-out is active."
                if audit_applies else
                "No audit required this year on this basis alone, but confirm total income against the basic "
                "exemption limit again next year while the lock-out remains active."
            ),
            "amountUsd": (d["totalIncomeInrV3"] / fx_rate(ctx)) if audit_applies else 0,
            "refs": ["s.44AD(4)/(5) (5-year presumptive re-election lock-in and mandatory audit)", "Form 3CB/3CD"],
        })

    # -- retirement_excess_elective_deferral / retirement_excess_ira_
    # contribution / retirement_rmd_required (Step 11 Layer 1 US field-
    # completeness audit, 27 Jul 2026 — new DAG-only findings, no engine
    # equivalent since Layer 1 US's Retirement screen and Step 5's W-2 Box
    # 12 codes fed NOTHING downstream before this). Mirrors report-batch5-
    # nodes.js's retirementExcessElectiveDeferralFinding/
    # retirementExcessIraContributionFinding/retirementRmdRequiredFinding.
    if d["hasUsScope"] and d["electiveDeferralExcessUsd"] > 0:
        added_any = True
        all_findings.append({
            "id": "retirement_excess_elective_deferral", "severity": "warning", "category": "credit",
            "title": f"§402(g) excess elective deferral ({_fmt(d['electiveDeferralExcessUsd'])} over the limit)",
            "detail": (
                f"{_fmt(d['electiveDeferralAggregateUsd'])} of combined 401(k)/403(b)/Solo-401(k) elective deferrals (traditional "
                "and Roth, across every plan and every W-2 Box 12 code D/E/AA/BB on file) exceeds the §402(g) annual aggregate limit "
                f"of {_fmt(d['electiveDeferralLimitUsd'])} for this taxpayer's age this year, by {_fmt(d['electiveDeferralExcessUsd'])}."
            ),
            "recommendation": (
                "Excess deferrals must be withdrawn (with earnings) by the following April 15 to avoid double taxation — once as "
                "a 2026 excess deferral and again as ordinary income when eventually distributed. Confirm whether prior-year W-2 wages "
                "exceeded $150,000, which would require any age-60-63 catch-up doses to have gone into a Roth 401(k) specifically "
                "(SECURE 2.0's mandatory Roth catch-up) — not modeled here."
            ),
            "amountUsd": d["electiveDeferralExcessUsd"], "refs": ["§402(g)", "Form 5329"],
        })

    if d["hasUsScope"] and d["iraContributionExcessUsd"] > 0:
        added_any = True
        backdoor = d["retirementAccountsRaw"].get("backdoor_roth_executed") is True
        all_findings.append({
            "id": "retirement_excess_ira_contribution", "severity": "warning", "category": "credit",
            "title": f"§219(b)(5) excess IRA contribution ({_fmt(d['iraContributionExcessUsd'])} over the limit)",
            "detail": (
                f"{_fmt(d['iraContributionAggregateUsd'])} of combined traditional + Roth IRA contributions exceeds the §219(b)(5) "
                f"annual combined limit of {_fmt(d['iraContributionLimitUsd'])} for this taxpayer's age this year, by "
                f"{_fmt(d['iraContributionExcessUsd'])}." + (
                    " A backdoor Roth conversion is on file — confirm the excess isn't simply the nondeductible traditional "
                    "contribution awaiting conversion (not double-counted as its own excess)." if backdoor else ""
                )
            ),
            "recommendation": (
                "A 6% excise tax (§4973) applies to the excess each year it remains in the account. Withdraw the excess (with "
                "earnings) by the filing deadline (including extensions) to avoid the excise tax, or apply it as next year's "
                "contribution if otherwise eligible."
            ),
            "amountUsd": d["iraContributionExcessUsd"], "refs": ["§219(b)(5)", "§4973", "Form 5329"],
        })

    # -- hsa_excess_contribution (task #40 follow-up, closing the HSA gap
    # the §402(g) block above deliberately deferred). Mirrors report-batch5-
    # nodes.js's hsaExcessContributionFinding.
    if d["hasUsScope"] and d["hsaContributionExcessUsd"] > 0:
        added_any = True
        coverage = "family" if d["hsaCoverageType"] == "family" else "self-only"
        all_findings.append({
            "id": "hsa_excess_contribution", "severity": "warning", "category": "credit",
            "title": f"§223 excess HSA contribution ({_fmt(d['hsaContributionExcessUsd'])} over the limit)",
            "detail": (
                f"{_fmt(d['hsaContributionAggregateUsd'])} of combined HSA contributions (individual/payroll after-tax plus "
                "employer/cafeteria-plan amounts under W-2 Box 12 code W) exceeds the §223(b) annual limit of "
                f"{_fmt(d['hsaContributionLimitUsd'])} for this taxpayer's {coverage} HDHP coverage and age this year, by "
                f"{_fmt(d['hsaContributionExcessUsd'])}."
            ),
            "recommendation": (
                "Excess HSA contributions are subject to a 6% excise tax (§4973) each year they remain in the account, "
                "and are also included in gross income unless withdrawn (with earnings) by the filing deadline including "
                "extensions. Confirm whether the coverage-type change happened mid-year (a common cause of an apparent "
                "excess that a last-month-rule or testing-period calculation would actually cure) — not modeled here."
            ),
            "amountUsd": d["hsaContributionExcessUsd"], "refs": ["§223(b)", "§4973", "Form 5329", "Form 8889"],
        })

    if d["rmdRequired"]:
        added_any = True
        all_findings.append({
            "id": "retirement_rmd_required", "severity": "info", "category": "credit",
            "title": f"Required Minimum Distribution (RMD) likely required at age {d['ageAtYearEndUs']}",
            "detail": (
                f"This taxpayer is age {d['ageAtYearEndUs']} at year-end, at or above the SECURE 2.0 RMD-start age of 73. "
                "Layer 1 does not collect traditional IRA/401(k) account BALANCES (only contribution amounts), so the actual RMD "
                "dollar amount cannot be computed here — it depends on the prior year-end balance across all traditional accounts "
                "and the IRS Uniform Lifetime Table divisor for this age."
            ),
            "recommendation": (
                "Confirm the prior year-end balance of every traditional IRA/401(k)/403(b) account and compute the RMD "
                "using the IRS Uniform Lifetime Table before the year-end deadline (April 1 of the year after turning 73 for the "
                "first RMD only). A missed or shortfall RMD carries a 25% excise tax (10% if corrected within 2 years) under §4974."
            ),
            "amountUsd": 0, "refs": ["§401(a)(9)", "§4974", "Form 5329"],
        })

    # -- s83b_election_not_filed_timely (Step 16 Layer 1 US field-
    # completeness audit, 27 Jul 2026 -- new DAG-only finding, no engine
    # equivalent). layer1_us.html's "Founder Section 83(b) elections" card
    # collects filed_within_30_days per election but it was never read
    # anywhere -- a missed SS83(b) election means every future vesting date
    # is taxed as ordinary income on the FULL FMV at that vest, not the
    # one-time, usually near-zero, grant-date spread.
    unvested_awards = [a for a in (d["equityCompRaw"].get("unvested_restricted_stock_awards") or []) if a and a.get("filed_within_30_days") is False]
    if unvested_awards:
        added_any = True
        names = ", ".join(a.get("company_name") or "unnamed company" for a in unvested_awards)
        all_findings.append({
            "id": "s83b_election_not_filed_timely", "severity": "critical", "category": "income",
            "title": f"{len(unvested_awards)} §83(b) election{'' if len(unvested_awards) == 1 else 's'} NOT filed within the 30-day deadline",
            "detail": (
                f"For {names}, the §83(b) election is recorded as NOT filed within the mandatory 30-day window from the "
                "grant date. §83(b)(2) makes this deadline absolute — there is no extension, no reasonable-cause exception, "
                "and no way to file late. Without a timely election, the grant-date spread is never locked in; instead, the "
                "FULL fair market value of each tranche is taxed as ordinary income on its OWN vesting date, capturing all "
                "appreciation between grant and vest as compensation income rather than future capital gain."
            ),
            "recommendation": (
                "If the 30-day window has already closed, the election cannot be filed late — confirm this is accurate "
                "before assuming an error, and model the ordinary-income exposure at each future vesting date instead of "
                "relying on the grant-date spread."
            ),
            "amountUsd": 0, "refs": ["§83(b)", "Treas. Reg. §1.83-2"],
        })

    if added_any:
        all_findings.sort(key=lambda f: (_MSME_SORT_WEIGHT[f["severity"]], -f["amountUsd"]))
    return all_findings


NODES = {
    "msmeDisallowanceTotalAgg": NodeDef(
        deps=("bizMsmePayablesAgg",), compute=_msme_disallowance_total_agg,
        layer1_fields=(
            "india.domestic_income.business_income.msme_payables[].amount_inr",
            "india.domestic_income.business_income.msme_payables[].invoice_date",
            "india.domestic_income.business_income.msme_payables[].has_written_agreement",
            "india.domestic_income.business_income.msme_payables[].payment_date",
        ),
    ),
    "assetsModelResult": NodeDef(
        deps=(
            "indianMutualFundsResult", "indiaFinancialHoldingsTxRaw", "indianBusinessesBoundary",
            "usForeignCorpsRaw", "usOwns10PctForeignCorpRaw", "usSecuritiesBoundary",
            "epfInrRaw", "ppfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg",
            "uiAgg", "usBusinessDepreciationPlan", "bizEntriesAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg",
            "presumptiveEligibilityAgg", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust",
            "partnerFirmsAgg", "indiaEntityTypeRaw", "cfcInclusionResult",
        ),
        compute=_assets_model_result,
    ),
}


def build(base):
    """Registers this file's own two nodes (msmeDisallowanceTotalAgg,
    assetsModelResult) — trust-the-caller, same as every other Phase 6
    module: `base` must already carry the deps listed above (from
    india/aggregate_india_income.py, india/entity_tax.py, us/aggregate_us_income.py,
    crossborder/cross_basis.py, crossborder/black_money_act.py,
    crossborder/findings.py, filings/documents.py). Then OVERRIDES
    `findingsAllResult` (must already be registered, from reports/assembly.py)
    to append the msme_disallowance_s43Bh_india / presumptive_lockin_active_india
    findings on top — the base compute is captured via `base.get(...)` before
    overriding, same pattern assets-nodes.js's own
    `deps: baseNodes.findingsAllResult.deps.concat([...])` /
    `baseNodes.findingsAllResult.compute(d, ctx)` maps onto structurally.
    """
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)

    base_findings_all = r.get("findingsAllResult")
    r.override(
        "findingsAllResult",
        NodeDef(
            deps=base_findings_all.deps + ("presumptiveLockinAgg", "totalIncomeInrV3", "taxRegime", "msmeDisallowanceTotalAgg",
                                            "hasUsScope", "electiveDeferralExcessUsd", "electiveDeferralAggregateUsd", "electiveDeferralLimitUsd",
                                            "iraContributionExcessUsd", "iraContributionAggregateUsd", "iraContributionLimitUsd",
                                            "hsaContributionExcessUsd", "hsaContributionAggregateUsd", "hsaContributionLimitUsd", "hsaCoverageType",
                                            "retirementAccountsRaw", "rmdRequired", "ageAtYearEndUs", "equityCompRaw"),
            compute=lambda d, ctx: _findings_all_result_override(d, ctx, base_findings_all.compute),
        ),
        reason="assets-nodes.js: adds msme_disallowance_s43Bh_india / presumptive_lockin_active_india / retirement_excess_elective_deferral / retirement_excess_ira_contribution / hsa_excess_contribution / retirement_rmd_required / s83b_election_not_filed_timely findings on top of report-batch5-nodes.js's own findingsAllResult",
    )
    return r
