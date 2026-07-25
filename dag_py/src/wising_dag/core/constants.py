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
    "LRS_ANNUAL_USD": 250000,
    "TRUMP_ACCOUNT_ANNUAL_CAP_USD": 5000,
    "TRUMP_ACCOUNT_FEDERAL_SEED_USD": 1000,
}
