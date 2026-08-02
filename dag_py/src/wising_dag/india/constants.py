"""India tax-law constants — port of the TAX.INDIA / INDIA_COMPANY /
INDIA_COMPANY_FOREIGN / INDIA_FIRM slices of
archive/engine-frozen/constants.js (Tax Year 2026-27, Income-tax Act 2025).

Kept as a literal, byte-for-byte transcription (same discipline as the JS
side's own SYS-1 "one authoritative copy" rule) — do not hand-edit a value
here without updating the JS source first; these must never drift apart.
"""
from __future__ import annotations

INDIA = {
    # [upper_bound_inr, rate]; float("inf") = top slab.
    "SLABS_NEW": [
        [400000, 0.00], [800000, 0.05], [1200000, 0.10],
        [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [float("inf"), 0.30],
    ],
    "SLABS_OLD": [
        [250000, 0.00], [500000, 0.05], [1000000, 0.20], [float("inf"), 0.30],
    ],
    "STD_DEDUCTION_SALARY_NEW_INR": 75000,
    "STD_DEDUCTION_SALARY_OLD_INR": 50000,
    # s.10(14)/Rule 2BB(1)(g) — PWD transport allowance, exempt in BOTH regimes (not blocked by s.115BAC(2)).
    "PWD_TRANSPORT_ALLOWANCE_ANNUAL_INR": 38400,
    # s.16(iii) professional tax deduction — OLD regime only; Article 276 constitutional cap.
    "PROFESSIONAL_TAX_MAX_ANNUAL_INR": 2500,
    "REBATE_87A_NEW": {"incomeCap": 1200000, "maxRebate": 60000},
    "REBATE_87A_OLD": {"incomeCap": 500000, "maxRebate": 12500},
    "DEDUCTION_CAPS_OLD": {"s80C": 150000, "s80CCD1B": 50000, "s80D_self": 25000, "s80D_parents_senior": 50000},
    "STCG_111A_RATE": 0.20,
    "LTCG_112A_RATE": 0.125,
    "LTCG_112A_EXEMPT_INR": 125000,
    "S80DD_U_FLAT_INR": {"standard": 75000, "severe": 125000},
    "S80DDB_CAP_INR": {"normal": 40000, "senior": 100000},
    "ASSET_CLASS_RATES_INDIA": {
        "building_residential": 0.05, "building_commercial": 0.10, "building_temporary": 0.40,
        "plant_machinery_general": 0.15, "plant_machinery_motor_cars": 0.15,
        "plant_machinery_commercial_vehicles": 0.30, "plant_machinery_computers": 0.40,
        "plant_machinery_books": 0.40, "plant_machinery_pollution": 0.40,
        "ships": 0.20, "intangible_assets": 0.25,
    },
    "CG_GROUP_A_CLASSES": ["listed_equity", "equity_mutual_fund", "hybrid_mf_equity", "reit_invit", "etf"],
    "CG_GROUP_C_CLASSES": ["debt_mutual_fund_pre_apr23", "hybrid_mf_debt", "international_mf", "fof"],
    "LTCG_112_RATE": 0.125,
    "PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE": 0.30,
    "PROMOTER_BUYBACK_TARGET_RATE_CORPORATE": 0.22,
    "PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE": 0.12,
    "RATE_115BB": 0.30,
    "RATE_115BBH": 0.30,
    "RATE_115E_INVESTMENT_INCOME": 0.20,
    "S115A_RATES": {"dividend": 0.20, "royalty": 0.20, "fts": 0.20},
    "SURCHARGE_IND": [
        [50000000, 0.25], [20000000, 0.25], [10000000, 0.15], [5000000, 0.10], [0, 0.00],
    ],
    "SURCHARGE_CG_DIV_CAP": 0.15,
    "SURCHARGE_NEW_MAX": 0.25,
    "CESS_RATE": 0.04,
}

INDIA_COMPANY = {
    "RATE_115BAB": 0.15, "SURCHARGE_115BAB": 0.10,
    "RATE_115BAA": 0.22, "SURCHARGE_115BAA": 0.10,
    "RATE_115BA": 0.25,
    "RATE_TURNOVER_LTE_400CR": 0.25,
    "RATE_DEFAULT": 0.30,
    "SURCHARGE_OVER_1CR": 0.07, "SURCHARGE_OVER_10CR": 0.12,
    "MAT_RATE": 0.15, "CESS_RATE": 0.04,
}

INDIA_COMPANY_FOREIGN = {
    "RATE": 0.35, "SURCHARGE_OVER_1CR": 0.02, "SURCHARGE_OVER_10CR": 0.05,
    "MAT_RATE": 0.15, "CESS_RATE": 0.04,
}

INDIA_FIRM = {"RATE": 0.30, "SURCHARGE_OVER_1CR": 0.12, "CESS_RATE": 0.04}
