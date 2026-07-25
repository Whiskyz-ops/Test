"""aggregateIndiaIncome — business/capital-gains/other-sources income
classification. Port of prototypes/graph-pilot/aggregateindiaincome-nodes.js.

The largest single India-domain file: WDV block-of-assets depreciation,
s.32(1)(iia) additional depreciation, s.40(a)/s.40A(3)/s.43B(h)
disallowances, the full capital-gains classification (buy-back pre/post
Oct-2024, foreign equity >24mo, financial_holdings across every asset
group, commodities, unlisted equity), and otherSourcesMisc.
"""
from __future__ import annotations

from ..core.dates import is_under_180_days_addition_inr, months_between
from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import num, safe
from . import constants as C

ASSET_CLASS_RATES_INDIA = C.INDIA["ASSET_CLASS_RATES_INDIA"]
GROUP_A_CLASSES = C.INDIA["CG_GROUP_A_CLASSES"]
GROUP_C_CLASSES = C.INDIA["CG_GROUP_C_CLASSES"]
S50AA_UNLISTED_DEBT_CUTOFF = "2024-07-23"


def _inr_to_usd(inr, ctx) -> float:
    return num(inr) / fx_rate(ctx)


def _to_inr_at_currency(amount, currency, usd_to_inr_rate):
    amt = num(amount)
    if not currency or currency == "INR":
        return amt
    if currency == "USD":
        return amt * usd_to_inr_rate
    return None


def _compute_asset_block_normal_depreciation_inr(block: dict) -> float:
    rate = ASSET_CLASS_RATES_INDIA.get(block.get("asset_class"))
    if not rate:
        return 0.0
    opening = num(block.get("opening_wdv_inr"))
    additions = num(block.get("additions_during_year_inr"))
    sale = num(block.get("sale_consideration_inr"))
    wdv_before_dep = opening + additions - sale
    if wdv_before_dep <= 0:
        return 0.0
    half_year = additions > 0 and is_under_180_days_addition_inr(block.get("addition_date"))
    if not half_year:
        return wdv_before_dep * rate
    full_rate_base = max(0.0, opening - sale)
    sale_against_additions = max(0.0, sale - opening)
    half_rate_base = max(0.0, additions - sale_against_additions)
    return min(wdv_before_dep, full_rate_base * rate + half_rate_base * rate * 0.5)


def _additional_depreciation_eligible_inr(india: dict | None, entry: dict) -> bool:
    entity_type = safe(india, "profile.entity_type", None) or safe(india, "domestic_income.business_income.entity_type", "individual")
    is_company = entity_type == "company"
    is_concessional_company = is_company and (
        safe(india, "profile.opt_115baa", False) is True
        or safe(india, "profile.opt_115bab", False) is True
        or safe(india, "profile.opt_115ba", False) is True
    )
    is_new_regime_ind_huf = entity_type in ("individual", "huf") and (safe(india, "profile.tax_regime", "NEW") or "NEW").upper() != "OLD"
    regime_disallows = is_concessional_company or is_new_regime_ind_huf
    has_mfg_or_power_gen = entry.get("business_code") == "01000" or entry.get("business_code") == "power_gen"
    return has_mfg_or_power_gen and not regime_disallows


def _compute_asset_block_additional_depreciation_inr(block: dict, india: dict | None, entry: dict) -> float:
    if block.get("asset_class") != "plant_machinery_general" or block.get("is_new_manufacturing_asset") is not True:
        return 0.0
    additions = num(block.get("additions_during_year_inr"))
    if additions <= 0:
        return 0.0
    if not _additional_depreciation_eligible_inr(india, entry):
        return 0.0
    rate = 0.10 if is_under_180_days_addition_inr(block.get("addition_date")) else 0.20
    return additions * rate


def _aggregate_entry_depreciation_inr(entry_idx: int, asset_blocks: list, india: dict | None, entry: dict) -> float:
    total = 0.0
    for block in asset_blocks or []:
        if block.get("unit_biz_idx") != entry_idx:
            continue
        total += _compute_asset_block_normal_depreciation_inr(block)
        total += _compute_asset_block_additional_depreciation_inr(block, india, entry)
    return total


def _compute_msme_disallowance_inr(entry_idx: int, msme_payables: list) -> float:
    from datetime import datetime, timedelta
    total = 0.0
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    for m in msme_payables or []:
        if m.get("unit_biz_idx") != entry_idx:
            continue
        amt = num(m.get("amount_inr"))
        if not m.get("invoice_date") or amt <= 0:
            continue
        from ..core.dates import parse_date
        inv_date = parse_date(m.get("invoice_date"))
        if inv_date is None:
            continue
        inv_date = inv_date.replace(hour=0, minute=0, second=0, microsecond=0)
        due_date = inv_date + timedelta(days=45 if m.get("has_written_agreement") is True else 15)
        ref_date = parse_date(m.get("payment_date")) if m.get("payment_date") else today
        ref_date = (ref_date or today).replace(hour=0, minute=0, second=0, microsecond=0)
        if ref_date > due_date:
            total += amt
    return total


def _aggregate_entry_disallowances_inr(entry_idx: int, exp: dict, msme_payables: list) -> float:
    s40a_i = num(exp.get("payments_to_non_residents_no_tds_inr"))
    s40a_ia = round(num(exp.get("payments_to_residents_no_tds_inr")) * 0.30)
    s40a3 = num(exp.get("total_cash_payments_exceeding_limit_inr")) + num(exp.get("total_cash_payments_exceeding_35k_inr"))
    s43bh = _compute_msme_disallowance_inr(entry_idx, msme_payables)
    return s40a_i + s40a_ia + s40a3 + s43bh


def _presumptive_ceiling_inr(scheme: str, digital_inr: float, cash_inr: float) -> float:
    total = digital_inr + cash_inr
    at_least_95pct_digital = total > 0 and (cash_inr / total) <= 0.05
    if scheme == "s44AD":
        return 30000000 if at_least_95pct_digital else 20000000
    if scheme == "s44ADA":
        return 7500000 if at_least_95pct_digital else 5000000
    return float("inf")


def _uses_regular_books_inr(b: dict, eligibility: dict) -> bool:
    scheme = b.get("presumptive_scheme")
    if scheme == "s44AD":
        dig, csh = num(b.get("digital_receipts_inr")), num(b.get("cash_receipts_inr"))
        return not (eligibility["eligible44AD"] and dig + csh <= _presumptive_ceiling_inr("s44AD", dig, csh))
    if scheme == "s44ADA":
        ada_dig, ada_csh = num(b.get("ada_digital_receipts_inr")), num(b.get("ada_cash_receipts_inr"))
        ada_receipts = num(b.get("gross_receipts_inr")) or (ada_dig + ada_csh)
        return not (eligibility["eligible44ADA"] and ada_receipts <= _presumptive_ceiling_inr("s44ADA", ada_dig, ada_csh))
    if scheme == "s44AE":
        return False
    return True


def _compute_business_entry_net_profit_inr(b: dict, eligibility: dict | None, depreciation_inr: float, disallowances_inr: float):
    eligibility = eligibility or {"eligible44AD": True, "eligible44ADA": True}
    scheme = b.get("presumptive_scheme")
    ada_receipts = None
    if scheme == "s44AD":
        dig44ad, csh44ad = num(b.get("digital_receipts_inr")), num(b.get("cash_receipts_inr"))
        if eligibility["eligible44AD"] and dig44ad + csh44ad <= _presumptive_ceiling_inr("s44AD", dig44ad, csh44ad):
            return dig44ad * 0.06 + csh44ad * 0.08
    elif scheme == "s44ADA":
        ada_dig, ada_csh = num(b.get("ada_digital_receipts_inr")), num(b.get("ada_cash_receipts_inr"))
        ada_receipts = num(b.get("gross_receipts_inr")) or (ada_dig + ada_csh)
        if eligibility["eligible44ADA"] and ada_receipts <= _presumptive_ceiling_inr("s44ADA", ada_dig, ada_csh):
            return ada_receipts * 0.50
    elif scheme == "s44AE":
        return None
    exp = b.get("expenses") or {}
    pf_esi_deductible_inr = num(exp.get("employer_pf_esi_contribution_inr")) if exp.get("employer_pf_esi_paid_before_due_date") is True else 0
    deductible_before_disallowances = (
        num(exp.get("rent_for_business_premises_inr")) + num(exp.get("repairs_maintenance_inr")) +
        num(exp.get("employee_salary_wages_inr")) + num(exp.get("employee_bonus_commission_inr")) +
        num(exp.get("interest_on_borrowed_capital_inr")) + num(exp.get("insurance_premium_inr")) +
        num(exp.get("bad_debts_written_off_inr")) + num(exp.get("other_business_expenses_inr")) +
        num(exp.get("ca_professional_fees_inr")) + pf_esi_deductible_inr
    )
    deductible = max(0.0, deductible_before_disallowances - num(disallowances_inr))
    dig, csh = num(b.get("digital_receipts_inr")), num(b.get("cash_receipts_inr"))
    receipts = (
        num(b.get("gross_receipts_inr")) or num(b.get("turnover_inr")) or
        ((dig + csh) if scheme == "s44AD" else 0) or (ada_receipts if scheme == "s44ADA" else 0)
    )
    return receipts - deductible - num(depreciation_inr)


def _compute_goods_vehicle_presumptive_inr(vehicles: list) -> float:
    total = 0.0
    for v in vehicles or []:
        months = num(v.get("months_owned"))
        if not (months > 0):
            continue
        if v.get("vehicle_type") == "heavy":
            total += 1000 * num(v.get("gvw_tonnes")) * months
        elif v.get("vehicle_type") == "light":
            total += 7500 * months
    return total


def _merge_quarters(source: dict, target: dict) -> None:
    """Deep merge matching indiaAnnualSlice/annualSliceAgg's own merge()."""
    for k, sv in source.items():
        if sv is None:
            continue
        if isinstance(sv, bool):
            target[k] = target.get(k) or sv
        elif isinstance(sv, (int, float)):
            target[k] = (target.get(k) or 0) + sv
        elif isinstance(sv, list):
            tgt_list = target.setdefault(k, [])
            if not isinstance(tgt_list, list):
                tgt_list = target[k] = []
            for i, el in enumerate(sv):
                if isinstance(el, dict):
                    while len(tgt_list) <= i:
                        tgt_list.append({})
                    if not isinstance(tgt_list[i], dict):
                        tgt_list[i] = {}
                    _merge_quarters(el, tgt_list[i])
                elif el not in tgt_list:
                    tgt_list.append(el)
        elif isinstance(sv, dict):
            tgt_dict = target.setdefault(k, {})
            if not isinstance(tgt_dict, dict):
                tgt_dict = target[k] = {}
            _merge_quarters(sv, tgt_dict)
        else:
            target[k] = sv


def _annual_slice_agg(ctx) -> dict:
    india = ctx.get("india")
    quarters = safe(india, "quarters", None)
    if not quarters:
        return {
            "domestic_income": safe(india, "domestic_income", {}) or {},
            "other_sources": safe(india, "other_sources", {}) or {},
            "capital_gains": safe(india, "capital_gains", {}) or {},
            "lrs_outbound": safe(india, "lrs_outbound", {}) or {},
        }
    out = {"domestic_income": {}, "other_sources": {}, "capital_gains": {}, "lrs_outbound": {}}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs = quarters.get(q)
        if not qs:
            continue
        if qs.get("domestic_income"):
            _merge_quarters(qs["domestic_income"], out["domestic_income"])
        if qs.get("other_sources"):
            _merge_quarters(qs["other_sources"], out["other_sources"])
        if qs.get("capital_gains"):
            _merge_quarters(qs["capital_gains"], out["capital_gains"])
        if qs.get("lrs_outbound"):
            _merge_quarters(qs["lrs_outbound"], out["lrs_outbound"])
    return out


def _presumptive_eligibility_agg(d, ctx):
    india = ctx.get("india")
    ror = d["indiaResidencyStatusRawAgg"] == "ROR"
    entity = safe(india, "profile.entity_type", None) or safe(india, "domestic_income.business_income.entity_type", "individual")
    entity_excluded_44ad = entity in ("llp", "company", "aop", "trust", "local", "coop", "ajp")
    eligible_44ad = ror and not entity_excluded_44ad
    return {
        "eligible44AD": eligible_44ad, "eligible44ADA": eligible_44ad and entity != "huf",
        "indiaStatus": d["indiaResidencyStatusRawAgg"], "entityType": entity, "rorFails": not ror,
    }


def _business_computation(d, ctx):
    india = ctx.get("india")
    business_inr = 0.0
    business_depreciation_inr = 0.0
    india_has_regular_books_entry = False
    india_has_valid_presumptive_entry = False
    for idx, b in enumerate(d["bizEntriesAgg"] or []):
        net_profit_inr = b.get("net_profit_inr") if b.get("net_profit_inr") is not None else b.get("net_profit")
        if net_profit_inr is None:
            is_regular_books = _uses_regular_books_inr(b, d["presumptiveEligibilityAgg"])
            if is_regular_books:
                india_has_regular_books_entry = True
            else:
                india_has_valid_presumptive_entry = True
            entry_depreciation_inr = _aggregate_entry_depreciation_inr(idx, d["bizAssetBlocksAgg"], india, b) if is_regular_books else 0
            entry_disallowances_inr = _aggregate_entry_disallowances_inr(idx, b.get("expenses") or {}, d["bizMsmePayablesAgg"]) if is_regular_books else 0
            net_profit_inr = _compute_business_entry_net_profit_inr(b, d["presumptiveEligibilityAgg"], entry_depreciation_inr, entry_disallowances_inr)
            business_depreciation_inr += entry_depreciation_inr
        else:
            india_has_regular_books_entry = True
        business_inr += num(net_profit_inr)
    business_inr += _compute_goods_vehicle_presumptive_inr(d["goodsVehiclesAgg"])
    business_inr += d["fnoIncomeInrAgg"]
    india_has_partner_firm_income = False
    for firm in d["partnerFirmsAgg"] or []:
        firm_income_inr = num(firm.get("remuneration_from_entity_inr")) + num(firm.get("interest_on_capital_from_entity_inr"))
        if firm_income_inr != 0:
            india_has_partner_firm_income = True
        business_inr += firm_income_inr
    return {
        "businessInr": business_inr, "businessDepreciationInr": business_depreciation_inr,
        "indiaHasRegularBooksEntry": india_has_regular_books_entry,
        "indiaHasValidPresumptiveEntry": india_has_valid_presumptive_entry,
        "indiaHasPartnerFirmIncome": india_has_partner_firm_income,
    }


def _capital_gains_computation(d, ctx):
    india = ctx.get("india")
    os_ = d["osAgg"]
    annual_cg = d["cgAgg"]
    usd_to_inr = fx_rate(ctx)
    buyback_txs = safe(india, "share_buyback.transactions", []) or []
    deemed_dividend_inr = num(safe(os_, "deemed_dividend_from_buyback_inr", 0))
    buyback_ltcg_inr = num(safe(annual_cg, "buyback_ltcg_inr", 0))
    buyback_stcg_inr = num(safe(annual_cg, "buyback_stcg_inr", 0))
    buyback_stcg_slab_inr = num(safe(os_, "buyback_stcg_slab_inr", 0))
    buyback_ltcg197_inr = 0.0
    promoter_buyback_ltcg_inr = 0.0
    promoter_buyback_stcg_inr = 0.0
    holding_period_mismatches = []

    for bb in buyback_txs:
        if bb.get("buyback_pre_or_post_oct2024") == "post_oct2024":
            deemed_dividend_inr += num(bb.get("consideration_received_inr"))
        elif bb.get("buyback_pre_or_post_oct2024") == "capital_gains_era":
            g = num(bb.get("capital_gain_or_loss"))
            if bb.get("gain_classification") == "ltcg":
                if bb.get("is_listed"):
                    buyback_ltcg_inr += g
                else:
                    buyback_ltcg197_inr += g
                if bb.get("is_promoter") and g > 0:
                    promoter_buyback_ltcg_inr += g
            elif bb.get("gain_classification") == "stcg":
                buyback_stcg_inr += g
                if bb.get("is_promoter") and g > 0:
                    promoter_buyback_stcg_inr += g
            elif bb.get("gain_classification") == "stcg_slab":
                buyback_stcg_slab_inr += g

            bb_months = months_between(bb.get("original_acquisition_date"), bb.get("buyback_date"))
            if bb_months is not None and g > 0 and bb.get("gain_classification"):
                bb_us_classification = "ltcg" if bb_months > 12 else "stcg"
                bb_india_classification = "ltcg" if bb.get("gain_classification") == "ltcg" else "stcg"
                if bb_us_classification != bb_india_classification:
                    holding_period_mismatches.append({
                        "companyName": bb.get("company_name") or "Unnamed company", "isListed": bool(bb.get("is_listed")),
                        "monthsHeld": bb_months, "gainInr": g, "gainUsd": _inr_to_usd(g, ctx),
                        "indiaClassification": bb_india_classification, "usClassification": bb_us_classification,
                        "indiaThresholdMonths": 12 if bb.get("is_listed") else 24, "sourceType": "buyback",
                    })

    is_india_ror = d["indiaResidencyStatusRawAgg"] == "ROR" and not d["indiaDtaaWorldwideCededAgg"]
    foreign_financial_holdings_txs = (safe(india, "financial_holdings.transactions", []) or []) if is_india_ror else []
    foreign_equity_ltcg197_inr = 0.0
    foreign_equity_stcg_slab_inr = 0.0
    for tx in foreign_financial_holdings_txs:
        if tx.get("asset_class") != "foreign_equity_unlisted":
            continue
        if not tx.get("sale_date") or tx.get("sale_value") in (None, ""):
            continue
        sale_inr = _to_inr_at_currency(tx.get("sale_value"), tx.get("sale_currency"), usd_to_inr)
        purchase_inr = _to_inr_at_currency(tx.get("purchase_value"), tx.get("purchase_currency"), usd_to_inr)
        if sale_inr is None or purchase_inr is None:
            continue
        months = months_between(tx.get("acquisition_date"), tx.get("sale_date"))
        if months is None:
            continue
        g = sale_inr - purchase_inr - num(tx.get("transfer_expenses"))
        fe_india_classification = "ltcg" if months > 24 else "stcg"
        if fe_india_classification == "ltcg":
            foreign_equity_ltcg197_inr += g
        else:
            foreign_equity_stcg_slab_inr += g
        if g > 0:
            fe_us_classification = "ltcg" if months > 12 else "stcg"
            if fe_us_classification != fe_india_classification:
                holding_period_mismatches.append({
                    "companyName": tx.get("asset_name_or_ticker") or "Unnamed foreign holding", "isListed": False,
                    "monthsHeld": months, "gainInr": g, "gainUsd": _inr_to_usd(g, ctx),
                    "indiaClassification": fe_india_classification, "usClassification": fe_us_classification,
                    "indiaThresholdMonths": 24, "sourceType": "foreign_equity",
                })

    chapter_xiia_elected = safe(india, "compliance_docs.chapter_xiia_elected", False) is True
    other_ltcg198_inr = 0.0
    other_stcg20_inr = 0.0
    other_ltcg197_inr = 0.0
    other_stcg_slab_inr = 0.0
    vda_gain_inr = 0.0
    vda_sale_consideration_inr = 0.0
    chapter_xiia_investment_income_inr = 0.0
    chapter_xiia_sfea_holding_count = 0
    for tx in safe(india, "financial_holdings.transactions", []) or []:
        cls = tx.get("asset_class")
        if not cls or cls == "foreign_equity_unlisted":
            continue
        if chapter_xiia_elected and tx.get("is_specified_foreign_exchange_asset") is True:
            chapter_xiia_sfea_holding_count += 1
            inv_income_inr = _to_inr_at_currency(tx.get("investment_income_this_year"), tx.get("investment_income_currency") or "INR", usd_to_inr)
            if inv_income_inr is not None:
                chapter_xiia_investment_income_inr += num(inv_income_inr)
        if cls == "nri_specified_company_deposit":
            continue
        if not tx.get("sale_date") or tx.get("sale_value") in (None, ""):
            continue
        sale_inr = _to_inr_at_currency(tx.get("sale_value"), tx.get("sale_currency"), usd_to_inr)
        purchase_inr = _to_inr_at_currency(tx.get("purchase_value"), tx.get("purchase_currency"), usd_to_inr)
        if sale_inr is None or purchase_inr is None:
            continue
        if cls == "vda_crypto":
            vda_sale_consideration_inr += sale_inr
            vg = sale_inr - purchase_inr - num(tx.get("transfer_expenses"))
            if vg > 0:
                vda_gain_inr += vg
            continue
        if cls in ("nri_specified_debenture", "nri_specified_govt_security") and tx.get("nri_exit_type") != "sold_to_third_party":
            continue
        months = months_between(tx.get("acquisition_date"), tx.get("sale_date"))
        if months is None:
            continue
        cost_basis_inr = purchase_inr
        if cls in ("listed_equity", "equity_mutual_fund") and tx.get("fmv_31jan2018_per_unit_inr") and tx.get("quantity"):
            fmv_total_inr = num(tx.get("fmv_31jan2018_per_unit_inr")) * num(tx.get("quantity"))
            cost_basis_inr = max(purchase_inr, min(fmv_total_inr, sale_inr))
        g2 = sale_inr - cost_basis_inr - num(tx.get("transfer_expenses"))
        is_chapter_xiia_listed_equity = cls == "listed_equity" and chapter_xiia_elected and tx.get("is_specified_foreign_exchange_asset") is True
        if cls == "debt_mutual_fund_post_apr23":
            other_stcg_slab_inr += g2
        elif cls in ("nri_specified_debenture", "nri_specified_govt_security"):
            if tx.get("stt_paid") is not False:
                if months > 12:
                    other_ltcg197_inr += g2
                else:
                    other_stcg_slab_inr += g2
            elif (tx.get("sale_date") or "") >= S50AA_UNLISTED_DEBT_CUTOFF:
                other_stcg_slab_inr += g2
            elif months > 24:
                other_ltcg197_inr += g2
            else:
                other_stcg_slab_inr += g2
        elif is_chapter_xiia_listed_equity and months > 12:
            other_ltcg197_inr += g2
        elif is_chapter_xiia_listed_equity:
            other_stcg20_inr += g2
        elif cls in GROUP_A_CLASSES and tx.get("stt_paid") is not False:
            if months > 12:
                other_ltcg198_inr += g2
            else:
                other_stcg20_inr += g2
        elif cls in GROUP_A_CLASSES:
            if months > 12:
                other_ltcg197_inr += g2
            else:
                other_stcg_slab_inr += g2
        elif cls == "bond_listed":
            if months > 12:
                other_ltcg197_inr += g2
            else:
                other_stcg_slab_inr += g2
        elif cls in GROUP_C_CLASSES:
            if months > 24:
                other_ltcg197_inr += g2
            else:
                other_stcg_slab_inr += g2

    commodity_ltcg197_inr = 0.0
    commodity_stcg_slab_inr = 0.0
    for tx in safe(india, "commodities.transactions", []) or []:
        if tx.get("is_maturity_redemption") is True:
            continue
        if not tx.get("sale_date") or tx.get("sale_value") in (None, ""):
            continue
        sale_inr = _to_inr_at_currency(tx.get("sale_value"), tx.get("sale_currency"), usd_to_inr)
        purchase_inr = _to_inr_at_currency(tx.get("purchase_value"), tx.get("purchase_currency"), usd_to_inr)
        if sale_inr is None or purchase_inr is None:
            continue
        months = months_between(tx.get("acquisition_date"), tx.get("sale_date"))
        if months is None:
            continue
        g3 = sale_inr - purchase_inr
        ctype = tx.get("commodity_type")
        if ctype in ("gold_etf", "gold_fund_of_funds"):
            commodity_stcg_slab_inr += g3
        elif ctype in ("sovereign_gold_bond_original", "sovereign_gold_bond_secondary"):
            if months > 12:
                commodity_ltcg197_inr += g3
            else:
                commodity_stcg_slab_inr += g3
        else:
            if months > 24:
                commodity_ltcg197_inr += g3
            else:
                commodity_stcg_slab_inr += g3

    unlisted_equity_ltcg197_inr = 0.0
    unlisted_equity_stcg_slab_inr = 0.0
    for tx in safe(india, "unlisted_equity.transactions", []) or []:
        if not tx.get("sale_date") or tx.get("sale_price_per_share") in (None, ""):
            continue
        shares = num(tx.get("number_of_shares"))
        if not (shares > 0):
            continue
        sale_inr = _to_inr_at_currency(num(tx.get("sale_price_per_share")) * shares, tx.get("sale_price_per_share_currency"), usd_to_inr)
        if tx.get("original_investment_currency") and tx.get("original_investment_currency") != "INR" and tx.get("original_cost_in_foreign_currency") is not None:
            purchase_inr = _to_inr_at_currency(num(tx.get("original_cost_in_foreign_currency")), tx.get("original_investment_currency"), usd_to_inr)
        else:
            purchase_inr = _to_inr_at_currency(num(tx.get("cost_per_share")) * shares, tx.get("cost_per_share_currency"), usd_to_inr)
        if sale_inr is None or purchase_inr is None:
            continue
        months = months_between(tx.get("acquisition_date"), tx.get("sale_date"))
        if months is None:
            continue
        g4 = sale_inr - purchase_inr
        if months > 24:
            unlisted_equity_ltcg197_inr += g4
        else:
            unlisted_equity_stcg_slab_inr += g4

    stcg_inr = num(safe(d["diAgg"], "capital_gains.short_term_15_pct", 0)) + num(safe(annual_cg, "stcg_111a_inr", 0)) + buyback_stcg_inr + other_stcg20_inr
    ltcg_inr = num(safe(annual_cg, "ltcg_112a_inr", 0)) + buyback_ltcg_inr + other_ltcg198_inr
    ltcg197_inr = buyback_ltcg197_inr + foreign_equity_ltcg197_inr + other_ltcg197_inr + commodity_ltcg197_inr + unlisted_equity_ltcg197_inr
    stcg_slab_inr = buyback_stcg_slab_inr + foreign_equity_stcg_slab_inr + other_stcg_slab_inr + commodity_stcg_slab_inr + unlisted_equity_stcg_slab_inr

    return {
        "stcgInr": stcg_inr, "ltcgInr": ltcg_inr, "ltcg197Inr": ltcg197_inr, "stcgSlabInr": stcg_slab_inr,
        "vdaGainInr": vda_gain_inr, "vdaSaleConsiderationInr": vda_sale_consideration_inr,
        "chapterXiiaInvestmentIncomeInr": chapter_xiia_investment_income_inr,
        "chapterXiiaSfeaHoldingCount": chapter_xiia_sfea_holding_count,
        "deemedDividendInr": deemed_dividend_inr, "promoterBuybackLtcgInr": promoter_buyback_ltcg_inr,
        "promoterBuybackStcgInr": promoter_buyback_stcg_inr, "holdingPeriodMismatches": holding_period_mismatches,
    }


def _other_sources_misc_computation(d, ctx):
    os_ = d["osAgg"]
    gifts_exempt = bool(safe(os_, "gifts_exemption_marriage", False)) or bool(safe(os_, "gifts_exemption_relative", False))
    gifts_above_50k_inr = 0 if gifts_exempt else num(safe(os_, "gifts_above_50k_inr", 0))
    family_pension_gross_inr = num(safe(os_, "family_pension_gross_inr", 0))
    family_pension_net_inr = max(0.0, family_pension_gross_inr - min(15000, round(family_pension_gross_inr / 3)))
    return (
        gifts_above_50k_inr + family_pension_net_inr + num(safe(os_, "spousal_clubbing_s64_inr", 0)) -
        num(safe(os_, "minor_child_exemption_inr", 0)) + num(safe(os_, "lic_maturity_inr", 0)) +
        num(safe(os_, "angel_tax_premium_inr", 0)) - num(safe(os_, "local_authority_s10_20_inr", 0)) +
        num(safe(os_, "miscellaneous_income_inr", 0)) + num(safe(os_, "taxable_epf_interest_inr", 0)) +
        num(safe(os_, "taxable_nps_withdrawal_inr", 0))
    )


def _di_income_bases(di: dict, os_: dict):
    salary_inr = num(safe(di, "salary.taxable_salary_inr", None)) or num(safe(di, "salary.gross_salary_inr", 0))
    hp_props = safe(di, "house_property.properties", []) or []
    house_property_inr = sum(
        num(p.get("annual_value_inr") or p.get("gross_annual_value_inr") or p.get("net_income_inr") or p.get("gross_rent_received_inr") or 0)
        for p in hp_props
    )
    interest_inr = (
        num(safe(os_, "interest_savings_inr", 0)) + num(safe(os_, "interest_fd_rd_inr", 0)) +
        num(safe(os_, "interest_bonds_inr", 0)) + num(safe(os_, "interest_on_it_refund_inr", 0)) +
        num(safe(di, "other_sources.interest_inr", 0))
    )
    dividend_inr = num(safe(os_, "dividend_inr", 0))
    special_rate_115bb_inr = num(safe(os_, "winnings_lottery_gaming_inr", 0)) + num(safe(os_, "online_gaming_winnings_inr", 0))
    return salary_inr, hp_props, house_property_inr, interest_inr, dividend_inr, special_rate_115bb_inr


def _total_india_income_inr(d, ctx):
    di = d["diAgg"]
    salary_inr, _hp_props, house_property_inr, interest_inr, dividend_inr, special_rate_115bb_inr = _di_income_bases(di, d["osAgg"])
    bc, cg = d["businessComputation"], d["capitalGainsComputation"]
    return (
        salary_inr + bc["businessInr"] + house_property_inr + interest_inr + dividend_inr + cg["stcgInr"] + cg["ltcgInr"] +
        special_rate_115bb_inr + cg["deemedDividendInr"] + cg["stcgSlabInr"] + cg["ltcg197Inr"] + cg["vdaGainInr"] +
        cg["chapterXiiaInvestmentIncomeInr"] + d["otherSourcesMiscComputation"]
    )


def _india_income_model_result(d, ctx):
    def m(inr):
        return {"inr": inr, "usd": inr / fx_rate(ctx)}

    di, os_ = d["diAgg"], d["osAgg"]
    salary_inr, hp_props, house_property_inr, interest_inr, dividend_inr, special_rate_115bb_inr = _di_income_bases(di, os_)
    agricultural_income_inr = num(safe(di, "agricultural_income_inr", 0))
    unexplained_115bbe_inr = num(safe(os_, "unexplained_income_115BBE_inr", 0))

    bc, cg = d["businessComputation"], d["capitalGainsComputation"]
    total = (
        salary_inr + bc["businessInr"] + house_property_inr + interest_inr + dividend_inr + cg["stcgInr"] + cg["ltcgInr"] +
        special_rate_115bb_inr + cg["deemedDividendInr"] + cg["stcgSlabInr"] + cg["ltcg197Inr"] + cg["vdaGainInr"] +
        cg["chapterXiiaInvestmentIncomeInr"] + d["otherSourcesMiscComputation"]
    )

    return {
        "salary": m(salary_inr), "business": m(bc["businessInr"]), "businessDepreciationInr": bc["businessDepreciationInr"],
        "businessFnoIncomeInr": d["fnoIncomeInrAgg"], "speculativeIncomeInr": d["speculativeIncomeInrAgg"],
        "housePropertyCount": len(hp_props), "agriculturalIncomeInr": agricultural_income_inr,
        "indiaHasRegularBooksEntry": bc["indiaHasRegularBooksEntry"], "indiaHasValidPresumptiveEntry": bc["indiaHasValidPresumptiveEntry"],
        "indiaHasPartnerFirmIncome": bc["indiaHasPartnerFirmIncome"],
        "houseProperty": m(house_property_inr),
        "interest": m(interest_inr), "dividend": m(dividend_inr), "otherSourcesMisc": m(d["otherSourcesMiscComputation"]),
        "stcg": m(cg["stcgInr"]), "ltcg": m(cg["ltcgInr"]), "ltcg197Inr": cg["ltcg197Inr"],
        "capitalGains": m(cg["stcgInr"] + cg["ltcgInr"] + cg["ltcg197Inr"]),
        "specialRate115bb": m(special_rate_115bb_inr),
        "deemedDividendBuyback": m(cg["deemedDividendInr"]),
        "stcgSlabInr": cg["stcgSlabInr"],
        "vdaGainInr": cg["vdaGainInr"],
        "vdaSaleConsiderationInr": cg["vdaSaleConsiderationInr"],
        "chapterXiiaInvestmentIncomeInr": cg["chapterXiiaInvestmentIncomeInr"],
        "chapterXiiaSfeaHoldingCount": cg["chapterXiiaSfeaHoldingCount"],
        "promoterBuybackLtcgInr": cg["promoterBuybackLtcgInr"],
        "promoterBuybackStcgInr": cg["promoterBuybackStcgInr"],
        "holdingPeriodMismatches": cg["holdingPeriodMismatches"],
        "unexplained115bbeInr": unexplained_115bbe_inr,
        "total": m(total),
    }


NODES = {
    "annualSliceAgg": NodeDef(deps=(), compute=lambda d, ctx: _annual_slice_agg(ctx)),
    "diAgg": NodeDef(deps=("annualSliceAgg",), compute=lambda d, ctx: d["annualSliceAgg"].get("domestic_income") or {}),
    "osAgg": NodeDef(deps=("annualSliceAgg",), compute=lambda d, ctx: d["annualSliceAgg"].get("other_sources") or {}),
    "cgAgg": NodeDef(deps=("annualSliceAgg",), compute=lambda d, ctx: d["annualSliceAgg"].get("capital_gains") or {}),
    "bizEntriesAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.business_entries", [])),
    "bizAssetBlocksAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.asset_blocks", [])),
    "bizMsmePayablesAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.msme_payables", [])),
    "goodsVehiclesAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.goods_vehicles", [])),
    "partnerFirmsAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.partner_firms", [])),
    "fnoIncomeInrAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: num(safe(d["diAgg"], "business_income.non_speculative_income_inr", 0))),
    "speculativeIncomeInrAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: num(safe(d["diAgg"], "business_income.speculative_income_inr", 0))),
    "agriculturalIncomeInrAgg": NodeDef(deps=("diAgg",), compute=lambda d, ctx: num(safe(d["diAgg"], "agricultural_income_inr", 0))),
    "unexplained115bbeInrAgg": NodeDef(deps=("osAgg",), compute=lambda d, ctx: num(safe(d["osAgg"], "unexplained_income_115BBE_inr", 0))),
    "indiaResidencyStatusRawAgg": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.final_india_residency_status", None)),
    "indiaDtaaWorldwideCededAgg": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.dtaa_worldwide_ceded", False) is True),
    "presumptiveEligibilityAgg": NodeDef(deps=("indiaResidencyStatusRawAgg",), compute=_presumptive_eligibility_agg),

    "businessComputation": NodeDef(
        deps=("bizEntriesAgg", "presumptiveEligibilityAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg", "goodsVehiclesAgg", "fnoIncomeInrAgg", "partnerFirmsAgg"),
        compute=_business_computation,
    ),
    "capitalGainsComputation": NodeDef(
        deps=("indiaResidencyStatusRawAgg", "indiaDtaaWorldwideCededAgg", "cgAgg", "osAgg", "diAgg"),
        compute=_capital_gains_computation,
    ),
    "otherSourcesMiscComputation": NodeDef(deps=("osAgg", "diAgg"), compute=_other_sources_misc_computation),
    "totalIndiaIncomeInr": NodeDef(
        deps=("businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "diAgg", "osAgg"),
        compute=_total_india_income_inr,
    ),
    "indiaIncomeModelResult": NodeDef(
        deps=("businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "diAgg", "osAgg", "fnoIncomeInrAgg", "speculativeIncomeInrAgg"),
        compute=_india_income_model_result,
    ),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
