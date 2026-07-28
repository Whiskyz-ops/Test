"""US tax-law constants — port of the TAX.US / LIMITS.FEIE_MAX_USD /
LIMITS.NIIT_THRESHOLD slices of archive/engine-frozen/constants.js (Tax
Year 2026, post-OBBBA figures).

Kept as a literal, byte-for-byte transcription — do not hand-edit a value
here without updating the JS source first; these must never drift apart.
"""
from __future__ import annotations

INF = float("inf")

FEIE_MAX_USD = 132900
NIIT_THRESHOLD = {"single": 200000, "mfj": 250000, "mfs": 125000, "hoh": 200000}

US = {
    "BRACKETS": {
        "single": [[12400, 0.10], [49840, 0.12], [106250, 0.22], [202850, 0.24], [257540, 0.32], [640600, 0.35], [INF, 0.37]],
        "mfj": [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [INF, 0.37]],
        "mfs": [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [INF, 0.37]],
        "hoh": [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [INF, 0.37]],
    },
    "STD_DEDUCTION": {"single": 16100, "mfj": 32200, "mfs": 16100, "hoh": 24150},
    "LTCG_BRACKETS": {
        "single": {"br0": 49450, "br15": 545500},
        "mfj": {"br0": 98900, "br15": 613700},
        "mfs": {"br0": 49450, "br15": 306850},
        "hoh": {"br0": 66200, "br15": 579600},
    },
    "SALT_CAP_BASE_USD": {"single": 40400, "mfj": 40400, "mfs": 20200, "hoh": 40400},
    "SALT_CAP_PHASEOUT_THRESHOLD_USD": {"single": 505000, "mfj": 505000, "mfs": 252500, "hoh": 505000},
    "SALT_CAP_PHASEOUT_RATE": 0.30,
    "SALT_CAP_FLOOR_USD": 10000,
    "NIIT_RATE": 0.038,
    "ADDL_MEDICARE_RATE": 0.009,
    "C_CORP_RATE": 0.21,
    "SS_PROVISIONAL_INCOME_BASE_USD": {"single": 25000, "mfj": 32000, "mfs": 0, "hoh": 25000},
    "SS_PROVISIONAL_INCOME_ADDITIONAL_USD": {"single": 34000, "mfj": 44000, "mfs": 0, "hoh": 34000},
    "SS_TAXABLE_TIER1_RATE": 0.5,
    "SS_TAXABLE_TIER2_RATE": 0.85,
    "SE_NET_FACTOR": 0.9235,
    "SE_RATE_SS": 0.124,
    "SE_RATE_MEDICARE": 0.029,
    "SS_WAGE_BASE_USD": 184500,
    "QBI_RATE": 0.20,
    "QBI_THRESHOLD": {"single": 201750, "mfj": 403500, "mfs": 201750, "hoh": 201750},
    "QBI_PHASEIN": {"single": 75000, "mfj": 150000, "mfs": 75000, "hoh": 75000},
    "AMT_EXEMPTION": {"single": 90100, "mfj": 140200, "mfs": 70100, "hoh": 90100},
    "AMT_PHASEOUT": {"single": 500000, "mfj": 1000000, "mfs": 500000, "hoh": 500000},
    "AMT_PHASEOUT_RATE": 0.50,
    "AMT_RATE_BREAK": 244500,
    "AMT_RATE_LOW": 0.26,
    "AMT_RATE_HIGH": 0.28,
    "CTC_PER_CHILD_USD": 2200,
    "CTC_PHASEOUT_THRESHOLD_USD": {"single": 200000, "mfj": 400000, "mfs": 200000, "hoh": 200000},
    "CTC_PHASEOUT_PER_1000_USD": 50,
    "CTC_REFUNDABLE_MAX_PER_CHILD_USD": 1700,
    "CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD": 2500,
    "CTC_REFUNDABLE_RATE": 0.15,
    "ODC_PER_DEPENDENT_USD": 500,
    "SENIOR_DEDUCTION_MIN_AGE": 65,
    "SENIOR_DEDUCTION_PER_PERSON_USD": 6000,
    "SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD": {"single": 75000, "mfj": 150000, "hoh": 75000},
    "SENIOR_DEDUCTION_PHASEOUT_RATE": 0.06,
    "TIPS_DEDUCTION_MAX_USD": 25000,
    "OVERTIME_DEDUCTION_MAX_USD": {"single": 12500, "mfj": 25000, "hoh": 12500},
    "TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD": {"single": 150000, "mfj": 300000, "hoh": 150000},
    "TIPS_OVERTIME_PHASEOUT_PER_1000_USD": 100,
    "US_SEC179_MAX_USD": 2560000,
    "US_SEC179_PHASEOUT_THRESHOLD_USD": 4090000,
    "US_BONUS_DEPRECIATION_RATE": 1.00,
    "US_MACRS_HALF_YEAR": {
        "3-year": [0.3333, 0.4445, 0.1481, 0.0741],
        "5-year": [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576],
        "7-year": [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446],
        "15-year": [0.0500, 0.0950, 0.0855, 0.0770, 0.0693, 0.0623, 0.0590, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0295],
    },
    "US_MACRS_STRAIGHT_LINE_ANNUAL": {"27.5-year": 1 / 27.5, "39-year": 1 / 39, "amortization-15": 1 / 15},
}

US_STATES = {
    "CA": {
        "NAME": "California",
        "FORM_NAME": "Form 540",
        "BRACKETS": {
            "single": [[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [INF, 0.123]],
            "mfj": [[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [INF, 0.123]],
        },
        "STD_DEDUCTION": {"single": 5706, "mfj": 11412},
        "EXEMPTION_CREDIT_USD": {"single": 153, "mfj": 307},
        "DEPENDENT_CREDIT_USD": 475,
        "SURCHARGE_THRESHOLD_USD": 1000000,
        "SURCHARGE_RATE": 0.01,
        "SURCHARGE_LABEL": "Mental Health Services Tax (1% over $1,000,000, not doubled for MFJ)",
    },
    "NY": {
        "NAME": "New York",
        "FORM_NAME": "Form IT-201",
        "BRACKETS": {
            "single": [[8500, 0.04], [11700, 0.045], [13900, 0.0525], [80650, 0.055], [215400, 0.06], [1077550, 0.0685], [5000000, 0.0965], [25000000, 0.103], [INF, 0.109]],
            "mfj": [[17150, 0.04], [23600, 0.045], [27900, 0.0525], [161550, 0.055], [323200, 0.06], [2155350, 0.0685], [5000000, 0.0965], [25000000, 0.103], [INF, 0.109]],
        },
        "STD_DEDUCTION": {"single": 8000, "mfj": 16050},
        "DEPENDENT_EXEMPTION_USD": 1000,
    },
}

# DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7 — "US
# state income tax, Phase 2", 21 Jul 2026): the frozen engine models only
# CA/NY. Extended here, DAG-only, with NJ (a real bracket table, same shape
# as CA/NY) and the 8 states with no individual income tax at all (previously
# indistinguishable from an unmodeled state — both silently returned null).
US_STATES_NJ_NY_SHAPE_EXT = {
    "NJ": {
        "NAME": "New Jersey",
        "FORM_NAME": "Form NJ-1040",
        "BRACKETS": {
            "single": [[20000, 0.014], [35000, 0.0175], [40000, 0.035], [75000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [INF, 0.1075]],
            "mfj": [[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [INF, 0.1075]],
        },
        "STD_DEDUCTION": {"single": 1000, "mfj": 2000},
        "STD_DEDUCTION_LABEL": "personal exemption",
        "DEPENDENT_EXEMPTION_USD": 1500,
        "DEPENDENT_EXEMPTION_LABEL": "NJ dependent exemption ($1,500/dependent)",
    },
}
NO_INDIVIDUAL_INCOME_TAX_STATES = {"AK": 1, "FL": 1, "NV": 1, "SD": 1, "TN": 1, "TX": 1, "WA": 1, "WY": 1}
STATE_NAMES = {
    "AK": "Alaska", "FL": "Florida", "NV": "Nevada", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "WA": "Washington", "WY": "Wyoming",
}
US_STATES_EXT = {**US_STATES, **US_STATES_NJ_NY_SHAPE_EXT}
