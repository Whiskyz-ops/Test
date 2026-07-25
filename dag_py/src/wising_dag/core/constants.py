"""Cross-domain limit constants — port of the `CONST.LIMITS` slice of
prototypes/graph-pilot/constants.js not already covered by
india/constants.py or us/constants.py's own FEIE_MAX_USD/NIIT_THRESHOLD.
Used by india/findings.py (lrs_limit), us/findings.py
(trump_account_contribution_limit), and crossborder/findings.py (fbar_limit)
— genuinely shared across all three domains, so it lives in core/ rather
than being duplicated three times.
"""
from __future__ import annotations

LIMITS = {
    "FBAR_AGGREGATE_USD": 10000,
    # Duplicated from us/constants.py's own FEIE_MAX_USD (a flat module-level
    # name there, since ustax.py never needed the surrounding LIMITS
    # namespace) — same value, kept here too because filings/limits.py reads
    # every other threshold off this one shared table.
    "FEIE_MAX_USD": 132900,
    "FORM_8938": {
        "US_RESIDENT_SINGLE": {"lastDay": 50000, "anyTime": 75000},
        "US_RESIDENT_MFJ": {"lastDay": 100000, "anyTime": 150000},
        "ABROAD_SINGLE": {"lastDay": 200000, "anyTime": 300000},
        "ABROAD_MFJ": {"lastDay": 400000, "anyTime": 600000},
    },
    "LRS_ANNUAL_USD": 250000,
    "NRO_REPATRIATION_ANNUAL_USD": 1000000,
    "TRUMP_ACCOUNT_ANNUAL_CAP_USD": 5000,
    "TRUMP_ACCOUNT_FEDERAL_SEED_USD": 1000,
}
