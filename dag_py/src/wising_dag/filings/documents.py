"""buildDocumentsResult (the 30-entry Filings-tab document catalog run
through a per-entry trigger map) + buildScopeNotesResult +
buildReturnFormDeterminationResult + buildFtcReportResult. Port of
prototypes/graph-pilot/report-batch1-nodes.js.

All four functions live in the same JS file and are thin, deps-only ports —
kept together here rather than split, matching the JS source's own
organization.

`entityFormsResult` (JS) is NOT re-derived here — it duplicates
`core/entry.py`'s already-ported `entityResult` (`indiaReturnForm`/
`usReturnForm`/`indiaOpt115baa`/`indiaOpt115bab` fields, verified
field-for-field identical), a duplication the JS source carries only for
build-history reasons. Reused directly instead.

`presumptiveLockinAgg` is the one node in this file that reads real
wall-clock "now" (`new Date()` in the JS source, for the s.44AD(4) 5-year
re-election lock-in window) — ported to read `ctx["monitorAsOfBoundary"]`
instead of a bare `datetime.now()`, matching this port's own architecture
rule ("no filesystem/localStorage/env-var/bare-datetime.now() reads inside
wising_dag/ — 'now' only enters via ctx").
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from ..core.fx_util import fx_rate
from ..core.graph import NodeDef
from ..core.util import format_inr, format_usd, js_round, num, safe


def _inr(n: float) -> str:
    return f"₹{format_inr(n)}"


def _usd(n: float) -> str:
    return format_usd(n)


def _calc(formula, parts=None, citation=None):
    return {"kind": "calc", "formula": formula, "parts": parts or [], "citation": citation}


def _source(detail, citation=None):
    return {"kind": "source", "detail": detail, "citation": citation}


def _holdings(section, note=None):
    return {"kind": "holdings", "section": section, "note": note}


def _india_business_turnover_inr(entries) -> dict:
    total_inr, cash_inr = 0.0, 0.0
    for b in entries or []:
        digital = num(b.get("digital_receipts_inr")) + num(b.get("ada_digital_receipts_inr"))
        cash = num(b.get("cash_receipts_inr")) + num(b.get("ada_cash_receipts_inr"))
        receipts = num(b.get("gross_receipts_inr")) or num(b.get("turnover_inr")) or (digital + cash)
        total_inr += receipts
        cash_inr += cash
    return {"totalInr": total_inr, "cashInr": cash_inr}


def _accounts_list_result(d, ctx):
    rate = fx_rate(ctx)

    def _money_from_inr(v):
        return {"inr": v, "usd": v / rate}

    def _money_from_usd(v):
        return {"usd": v, "inr": v * rate}

    india_accounts = [
        {"bank": b.get("bank_name") or "Indian Bank", "type": b.get("account_type") or "savings",
         "peak": _money_from_inr(b.get("peak_balance_inr") or 0), "country": "India"}
        for b in d["bankAccountsRaw"]["india"]
    ]
    us_disclosed = [
        {"bank": b.get("bank_name") or "Bank", "type": b.get("account_type") or "savings",
         "peak": _money_from_usd(b["peak_balance_usd"]) if b.get("peak_balance_usd") is not None else _money_from_inr(b.get("peak_balance_inr") or 0),
         "country": b.get("country") or "India"}
        for b in d["bankAccountsRaw"]["us"]
    ]
    accounts = india_accounts if len(india_accounts) >= len(us_disclosed) else us_disclosed
    form_fbar = d["bankAccountsRaw"]["usFormFbar"]
    if form_fbar > 0:
        aggregate_peak = _money_from_usd(form_fbar)
    elif not d["hasUsScopeBoundaryFtc"]:
        aggregate_peak = {"usd": 0, "inr": 0}
    else:
        aggregate_peak = {"usd": sum(a["peak"]["usd"] for a in accounts), "inr": sum(a["peak"]["inr"] for a in accounts)}
    return {"accounts": accounts, "aggregatePeak": aggregate_peak}


def _taxes_paid_india_result(d, ctx):
    rate = fx_rate(ctx)
    tc = d["taxCreditsIndiaRaw"]
    advance = tc["q1"] + tc["q2"] + tc["q3"] + tc["q4"]
    tds = tc["tdsAlreadyDeducted"] + tc["tds"]
    return {
        "advance": {"inr": advance, "usd": advance / rate}, "tds": {"inr": tds, "usd": tds / rate},
        "tcs": {"inr": tc["tcs"], "usd": tc["tcs"] / rate},
        "total": {"inr": advance + tds + tc["tcs"], "usd": (advance + tds + tc["tcs"]) / rate},
    }


def _presumptive_lockin_agg(d, ctx):
    last_exit_ay = d["s44adLastExitAyRaw"]
    if not last_exit_ay:
        return {"lockInActive": False, "yearsRemaining": 0, "exitYear": None}
    match = re.search(r"(?:AY\s*)?(\d{4})(?:-\d{2,4})?", str(last_exit_ay), re.IGNORECASE)
    if not match:
        return {"lockInActive": False, "yearsRemaining": 0, "exitYear": None}
    exit_year = int(match.group(1))
    now = ctx.get("monitorAsOfBoundary")
    now = datetime.fromisoformat(now) if isinstance(now, str) else (now or datetime.now(timezone.utc))
    current_ay_start = now.year - (1 if now.month < 4 else 0)
    years_since_exit = current_ay_start - exit_year
    lock_in_active = 0 < years_since_exit < 5
    return {"lockInActive": lock_in_active, "yearsRemaining": (5 - years_since_exit) if lock_in_active else 0, "exitYear": exit_year, "currentAyStart": current_ay_start}


def _form8938_gauge_result(d, ctx):
    from ..core.constants import LIMITS
    if not d["hasUsScopeBoundaryFtc"]:
        return None
    is_mfj = d["usFilingStatusRaw"] == "mfj"
    abroad = d["feie"]["taxHomeAbroad"] and d["feie"]["testMet"]
    tbl = LIMITS["FORM_8938"][("ABROAD_MFJ" if is_mfj else "ABROAD_SINGLE") if abroad else ("US_RESIDENT_MFJ" if is_mfj else "US_RESIDENT_SINGLE")]
    # Form 8938 has TWO independent thresholds (last-day-of-year value, and
    # highest value at any time during the year) -- exceeding EITHER one
    # triggers the filing requirement. Report whichever is proportionally
    # worse. Mirrors report-batch1-nodes.js's form8938GaugeResult exactly.
    peak_usd = d["accountsListResult"]["aggregatePeak"]["usd"]
    last_day_usd = d["aggregateLastDayUsdResult"]["usd"]
    peak_pct = (peak_usd / tbl["anyTime"]) if tbl["anyTime"] > 0 else 0
    last_day_pct = (last_day_usd / tbl["lastDay"]) if tbl["lastDay"] > 0 else 0
    use_last_day = last_day_pct > peak_pct
    value_usd = last_day_usd if use_last_day else peak_usd
    limit = tbl["lastDay"] if use_last_day else tbl["anyTime"]
    pct = last_day_pct if use_last_day else peak_pct
    status = "breached" if pct >= 1 else ("approaching" if pct >= 0.8 else "ok")
    return {"id": "form8938", "value": value_usd, "limit": limit, "pct": pct, "status": status}


DOCUMENTS_CATALOG = [
    {"id": "fincen_114", "jurisdiction": "US", "name": "FinCEN Form 114 (FBAR)", "desc": "Report of Foreign Bank and Financial Accounts.", "why": "Aggregate peak balance across all foreign (Indian) accounts exceeded USD 10,000.", "severity": "critical"},
    {"id": "form_8938", "jurisdiction": "US", "name": "IRS Form 8938 (FATCA)", "desc": "Statement of Specified Foreign Financial Assets, filed with Form 1040.", "why": "Specified foreign financial assets exceeded the Form 8938 reporting threshold for your filing status/residence.", "severity": "critical"},
    {"id": "form_1116", "jurisdiction": "US", "name": "IRS Form 1116 (Foreign Tax Credit)", "desc": "Claims credit for income tax paid to India against US tax liability.", "why": "Indian income tax was paid on income that is also taxable in the US.", "severity": "warning"},
    {"id": "form_2555", "jurisdiction": "US", "name": "IRS Form 2555 (FEIE)", "desc": "Foreign Earned Income Exclusion / foreign housing exclusion.", "why": "FEIE was elected on foreign earned income.", "severity": "info"},
    {"id": "form_8833", "jurisdiction": "US", "name": "IRS Form 8833 (Treaty-Based Position)", "desc": "Discloses a treaty-based return position (e.g. Article 4 tie-breaker).", "why": "A DTAA tie-breaker or treaty rate is being relied upon to override default US taxation.", "severity": "critical"},
    {"id": "form_8621", "jurisdiction": "US", "name": "IRS Form 8621 (PFIC)", "desc": "Information return for Passive Foreign Investment Companies — one per fund.", "why": "Holdings in Indian mutual funds / ETFs are PFICs and require annual reporting (punitive §1291 regime unless QEF/MTM elected).", "severity": "critical"},
    {"id": "form_5471", "jurisdiction": "US", "name": "IRS Form 5471 (CFC)", "desc": "Information return for US persons owning ≥10% of a foreign corporation.", "why": "You own ≥10% of an Indian company — potential Subpart F / GILTI inclusion.", "severity": "warning"},
    {"id": "form_8865", "jurisdiction": "US", "name": "IRS Form 8865", "desc": "Return for US persons with interests in a foreign partnership.", "why": "You hold an interest in an Indian partnership/LLP.", "severity": "warning"},
    {"id": "form_3520", "jurisdiction": "US", "name": "IRS Form 3520 / 3520-A", "desc": "Reporting of foreign gifts and transactions with foreign trusts.", "why": "Foreign gift > USD 100,000 received, or you are a grantor/beneficiary of a foreign trust (note: Indian PPF/EPF may be treated as trusts).", "severity": "warning"},
    {"id": "form_1040nr", "jurisdiction": "US", "name": "IRS Form 1040-NR", "desc": "Non-resident alien income tax return.", "why": "You are (or elect to be treated as) a US non-resident alien for this year.", "severity": "info"},
    {"id": "form_8960", "jurisdiction": "US", "name": "IRS Form 8960 (NIIT)", "desc": "Net Investment Income Tax (3.8%).", "why": "MAGI exceeded the NIIT threshold and net investment income is present.", "severity": "info"},
    {"id": "form_8959", "jurisdiction": "US", "name": "IRS Form 8959 (Additional Medicare Tax)", "desc": "Additional 0.9% Medicare tax on wages/SE income above the filing-status threshold, and reconciles employer over/under-withholding.", "why": "Additional Medicare Tax is owed and is not offset by the Foreign Tax Credit.", "severity": "info"},
    {"id": "form_540", "jurisdiction": "US", "name": "California Form 540 (Resident Income Tax Return)", "desc": "California state income tax return — computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.", "why": "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.", "severity": "warning"},
    {"id": "form_it201", "jurisdiction": "US", "name": "New York Form IT-201 (Resident Income Tax Return)", "desc": "New York state income tax return — computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.", "why": "State-of-residence facts on file point to New York, and NY taxes worldwide income independently of the federal treaty position.", "severity": "warning"},
    {"id": "form_nj1040", "jurisdiction": "US", "name": "New Jersey Form NJ-1040 (Resident Income Tax Return)", "desc": "New Jersey state income tax return — computed on worldwide income for a full-year NJ resident, including Indian-source income. NJ grants no credit for tax paid to a foreign country.", "why": "State-of-residence facts on file point to New Jersey, and NJ taxes worldwide income independently of the federal treaty position.", "severity": "warning"},
    {"id": "form_8858", "jurisdiction": "US", "name": "IRS Form 8858 (Foreign Disregarded Entities)", "desc": "Information return for US persons who own a foreign disregarded entity or foreign branch.", "why": "A foreign disregarded entity is on file (Reg. §1.6038-2) — a single-owner foreign business entity, or a foreign branch of a US business, that isn't itself taxed as a corporation.", "severity": "warning"},
    {"id": "form_3520a", "jurisdiction": "US", "name": "IRS Form 3520-A (Annual Information Return of Foreign Trust)", "desc": "Annual return filed by (or on behalf of) a foreign trust with a US owner — distinct from Form 3520, which the US owner/beneficiary files themselves.", "why": "A US person is treated as the owner of a foreign trust for grantor-trust purposes (e.g. an Indian PPF/EPF account) — the trust itself (or a US agent) must file this annually, in addition to the owner's own Form 3520.", "severity": "warning"},
    {"id": "form_29b", "jurisdiction": "IN", "name": "Form 29B (MAT Report)", "desc": "Chartered Accountant's report certifying book profit under s.115JB, filed when Minimum Alternate Tax applies.", "why": "MAT (s.115JB) applies this year — tax computed on book profit exceeds tax computed under the normal provisions.", "severity": "warning"},
    {"id": "form_10iea", "jurisdiction": "IN", "name": "Form 10-IEA (Old Regime Election)", "desc": "Declaration to opt out of the default new tax regime (s.115BAC) — or to switch back — required for an individual/HUF with business/professional income.", "why": "The old tax regime is elected on file, and business/professional income is present — this combination requires a filed Form 10-IEA, not just a checkbox on the ITR.", "severity": "info"},
    {"id": "form_10ic", "jurisdiction": "IN", "name": "Form 10-IC (s.115BAA Election)", "desc": "Declaration to opt into the 22% concessional corporate tax rate under s.115BAA.", "why": "The company has elected the s.115BAA concessional rate on file — this election requires a filed Form 10-IC (on or before the return due date), not just the rate applied silently.", "severity": "info"},
    {"id": "form_10id", "jurisdiction": "IN", "name": "Form 10-ID (s.115BAB Election)", "desc": "Declaration to opt into the 15% concessional rate for new manufacturing companies under s.115BAB.", "why": "The company has elected the s.115BAB new-manufacturing concessional rate on file — this election requires a filed Form 10-ID, distinct from (and mutually exclusive with) Form 10-IC.", "severity": "info"},
    {"id": "form_67", "jurisdiction": "IN", "name": "Form 44 (India FTC)", "desc": "Statement of foreign income & foreign tax, filed before the ITR due date.", "why": "Foreign (US) income is being offered to tax in India and FTC u/s 90/91 is claimed. Schedule FSI/TR must accompany the ITR.", "severity": "critical"},
    {"id": "trc", "jurisdiction": "IN", "name": "Tax Residency Certificate (TRC)", "desc": "Issued by the other contracting state (IRS Form 6166 for the US).", "why": "DTAA relief / treaty rate is being claimed — a TRC is mandatory u/s 159(8).", "severity": "critical"},
    {"id": "form_10f", "jurisdiction": "IN", "name": "Form 41", "desc": "Self-declaration accompanying the TRC, filed electronically on the ITR portal.", "why": "Treaty benefit claimed and the TRC does not contain all particulars required u/r 75.", "severity": "warning"},
    {"id": "schedule_fa", "jurisdiction": "IN", "name": "Schedule FA (Foreign Assets)", "desc": "Disclosure of foreign assets/accounts in the Indian ITR.", "why": "You are Resident & Ordinarily Resident (ROR) and hold US bank accounts, securities or other foreign assets.", "severity": "critical"},
    {"id": "schedule_fsi_tr", "jurisdiction": "IN", "name": "Schedule FSI & Schedule TR", "desc": "Foreign Source Income and Tax Relief schedules in the ITR.", "why": "Foreign income is offered to tax and relief u/s 90/91 is claimed.", "severity": "warning"},
    {"id": "form_15ca_cb", "jurisdiction": "IN", "name": "Form 145 / Form 146 (was 15CA / 15CB)", "desc": "Remittance certificates for foreign outward remittances.", "why": "Outward remittances under LRS / to non-residents were made during the year. Renumbered from Form 15CA/15CB effective 1 Apr 2026 under the Income-tax Rules, 2026 (Rule 220) — the old numbers still apply to remittances made before that date.", "severity": "info"},
    {"id": "schedule_al", "jurisdiction": "IN", "name": "Schedule AL (Assets & Liabilities)", "desc": "Disclosure of assets and liabilities at cost, filed with the ITR.", "why": "Total income exceeds ₹50 lakh — Schedule AL is mandatory at this threshold u/s 139(1) (ITR-2/3/5 filers).", "severity": "warning"},
    {"id": "form_3cb_3cd", "jurisdiction": "IN", "name": "Form 3CB / 3CD (Tax Audit Report)", "desc": "Chartered Accountant's tax-audit report and statement of particulars, filed before the ITR due date.", "why": "Business turnover exceeds the s.44AB tax-audit threshold (₹1 crore, or ₹10 crore where cash receipts and payments are each ≤5% of the total).", "severity": "critical"},
    {"id": "form_8802", "jurisdiction": "US", "name": "IRS Form 8802 (Application for US Residency Certification)", "desc": "Application to the IRS for Form 6166 — the US residency certificate India's TRC requirement expects the other contracting state to issue.", "why": "DTAA relief is being claimed on Indian-source income — Form 6166 must be requested via Form 8802 before it can be filed with the Indian TRC/Form 41 paperwork; IRS processing typically takes 4-6+ weeks, so file well ahead of the India due date.", "severity": "warning"},
    {"id": "form_6251", "jurisdiction": "US", "name": "IRS Form 6251 (Alternative Minimum Tax)", "desc": "Computes AMT and reconciles it against regular tax liability.", "why": "AMT preference items (commonly an ISO exercise, or the SALT-cap add-back) push tentative minimum tax above the regular tax for the year.", "severity": "warning"},
    {"id": "form_8288", "jurisdiction": "US", "name": "IRS Form 8288 / 8288-A / 8288-B (FIRPTA Withholding)", "desc": "Withholding certificate and returns for a foreign person's disposition of US real property.", "why": "A US real property interest was disposed of by a foreign person — 15% FIRPTA withholding applies at closing unless a Form 8288-B withholding certificate reduces it.", "severity": "warning"},
    {"id": "form_3ceb", "jurisdiction": "IN", "name": "Form 3CEB (Transfer Pricing Certification)", "desc": "Chartered Accountant's report on international transactions with associated enterprises, filed before the ITR due date u/s 92E.", "why": "A cross-border related-party ownership relationship is on file — international transactions with that entity must be reported and certified, independent of whether pricing is at arm's length.", "severity": "warning"},
    {"id": "form_26as_ais_tis", "jurisdiction": "IN", "name": "Form 26AS / AIS / TIS", "desc": "Annual tax-credit statement (26AS) and the Annual/Taxpayer Information Statements — the pre-filled record every ITR should be reconciled against before filing.", "why": "Indian income is on file for this taxpayer — TDS, advance tax and reported high-value transactions should be cross-checked against these statements before the return is filed.", "severity": "info"},
    {"id": "form_16_16a", "jurisdiction": "IN", "name": "Form 16 / Form 16A (TDS Certificates)", "desc": "Salary (Form 16) and non-salary (Form 16A) TDS certificates issued by each deductor.", "why": "Indian income subject to TDS is on file — hold the certificate from each deductor to reconcile against Form 26AS/AIS and support the credit claimed in the ITR.", "severity": "info"},
    {"id": "lrs_form_a2", "jurisdiction": "IN", "name": "LRS Form A2 (Outward Remittance Declaration)", "desc": "Declaration furnished to the remitting bank for each outward remittance under the Liberalised Remittance Scheme.", "why": "Outward remittances under LRS were made this year — each remittance requires its own Form A2 filed with the bank at the time of transfer, separate from the annual Form 145/146 (was 15CA/15CB) return-time reporting.", "severity": "info"},
    {"id": "form_4868", "jurisdiction": "US", "name": "IRS Form 4868 (Extension Request)", "desc": "Automatic 6-month extension of time to file (not to pay) the US return.", "why": "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar — the extension does not happen automatically.", "severity": "info"},
]


def _build_documents_result(d, ctx):
    res = d["residencyResult"]
    entity = d["entityResult"]
    is_form_1118 = entity["usReturnForm"] == "1120"
    is_us_domestic_entity = entity["usReturnForm"] in ("1120", "1120-S", "1065", "1041")
    is_us_person = res["us"]["isResident"] or is_us_domestic_entity
    t = _india_business_turnover_inr(d["bizEntriesAgg"])
    at_least_95_pct_digital = t["totalInr"] > 0 and (t["cashInr"] / t["totalInr"]) <= 0.05
    form8938 = d["form8938GaugeResult"]

    from ..core.constants import LIMITS
    from ..us.constants import NIIT_THRESHOLD
    lockin = d["presumptiveLockinAgg"]

    triggers = {
        "fincen_114": d["accountsListResult"]["aggregatePeak"]["usd"] > 10000 and is_us_person,
        "form_8938": bool(form8938) and form8938["status"] == "breached" and is_us_person,
        "form_1116": d["taxesPaidIndiaResult"]["total"]["usd"] > 0 and (res["us"]["isResident"] or is_form_1118),
        "form_2555": d["feieRaw"]["claimed"],
        "form_8833": res["dualResident"] or d["treatyUsResidenceRaw"] != "none" or (d["nraRaw"] and len(d["nraRaw"].get("treatyRateClaims") or []) > 0),
        "form_8621": (len(d["indianMutualFundsResult"]) > 0 or len(d["usPficHoldingsRaw"]) > 0 or
                      any(h.get("pfic_classification") == "passive_foreign_investment_company_section_1297" for h in d["usSecuritiesRaw"])) and is_us_person,
        "form_5471": d["viaForeignCorpXbr4"] and is_us_person,
        "form_8865": False,
        "form_3520": is_us_person and ((d["ppfInrRaw"] > 0 or d["epfInrRaw"] > 0) or d["foreignGiftsRaw"]["receivedAbove100k"] or d["foreignGiftsRaw"]["isTrustBeneficiary"]),
        "form_3520a": is_us_person and (d["ppfInrRaw"] > 0 or d["epfInrRaw"] > 0),
        "form_1040nr": d["treatyFiles1040nrRaw"],
        # NIIT_THRESHOLD lives in us/constants.py (the real source ustax.py's
        # own NIIT computation also reads), NOT core/constants.py's LIMITS —
        # that table never carried this key at all, so `LIMITS.get(...)` was
        # silently falling back to `{}` -> every filing status got the
        # single/hoh $200,000 threshold, wrongly triggering form_8960 for an
        # mfj filer between $200,000-$249,999 (found via
        # run-js-dag-vs-py-dag.js's cross-check against the real JS DAG).
        "form_8960": d["headlineTotalIncomeUsdResult"] > NIIT_THRESHOLD.get(d["usFilingStatusRaw"], 200000) and
                     (d["aggregateUsIncomeResult"]["interestUs"]["usd"] + d["aggregateUsIncomeResult"]["ordinaryDividendsUs"]["usd"] + d["aggregateUsIncomeResult"]["capitalGainsUs"]["usd"]) > 0,
        "form_8959": d["usTaxResult"]["additionalMedicareUsd"] > 0,
        "form_67": res["india"]["status"] == "ROR" and (d["aggregateUsIncomeResult"]["usSourceTotal"]["usd"] > 0 or d["taxesPaidUsResult"]["total"]["usd"] > 0),
        "trc": res["dualResident"] or d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none",
        "form_10f": res["dualResident"] or d["treatyIndiaResidenceRaw"] != "none",
        "schedule_fa": res["india"]["status"] == "ROR" and (
            d["aggregateUsIncomeResult"]["usSourceTotal"]["usd"] > 0 or
            any(a["country"] != "India" for a in d["accountsListResult"]["accounts"]) or
            any((h.get("peak_balance_usd") or 0) > 0 for h in d["usSecuritiesRaw"])
        ),
        "schedule_fsi_tr": res["india"]["status"] == "ROR" and (d["taxesPaidUsResult"]["total"]["usd"] > 0 or d["aggregateUsIncomeResult"]["usSourceTotal"]["usd"] > 0),
        "form_15ca_cb": d["limitsRawExtra"]["lrsRemittedInr"] > 0,
        "schedule_al": not d["indiaIsCompany"] and not d["indiaIsFirm"] and not d["indiaIsAop"] and not d["indiaIsTrust"] and d["totalIncomeInrV3"] > 5000000,
        "form_3cb_3cd": d["indiaIsCompany"] or (t["totalInr"] > 0 and t["totalInr"] > (100000000 if at_least_95_pct_digital else 10000000)) or
                        (lockin["lockInActive"] and d["totalIncomeInrV3"] > (d["slabs"][0][0])),
        "form_8802": res["dualResident"] or d["treatyIndiaResidenceRaw"] != "none" or d["treatyUsResidenceRaw"] != "none",
        "form_6251": d["usTaxResult"]["amtUsd"] > 0,
        "form_8288": bool(d["nraRaw"]["usRealPropertyDisposed"] and (d["nraRaw"].get("firptaWithholdingUsd") or 0) > 0),
        "form_3ceb": d["viaForeignCorpXbr4"],
        "form_26as_ais_tis": d["hasIndiaScopeXbr"],
        "form_16_16a": d["hasIndiaScopeXbr"],
        "lrs_form_a2": d["limitsRawExtra"]["lrsRemittedInr"] > 0,
        "form_4868": d["hasUsScopeBoundaryFtc"],
        "form_540": bool(d["usStateTaxResult"]) and d["usStateTaxResult"]["state"] == "CA",
        "form_it201": bool(d["usStateTaxResult"]) and d["usStateTaxResult"]["state"] == "NY",
        "form_nj1040": bool(d["usStateTaxResult"]) and d["usStateTaxResult"]["state"] == "NJ",
        "form_8858": d["usOwnsForeignDisregardedEntityRaw"] or any(s.get("llc_type") == "foreign_disregarded" for s in d["usSelfEmploymentRaw"]),
        "form_29b": d["indiaIsCompany"] and bool(d["entityTaxResult"]["matApplied"]),
        "form_10iea": d["taxRegime"] == "OLD" and not d["indiaIsCompany"] and not d["indiaIsFirm"] and not d["indiaIsAop"] and not d["indiaIsTrust"] and (d["businessComputation"]["businessInr"] or 0) > 0,
        "form_10ic": d["indiaIsCompany"] and entity["indiaOpt115baa"],
        "form_10id": d["indiaIsCompany"] and entity["indiaOpt115bab"],
    }

    out = []
    for doc in DOCUMENTS_CATALOG:
        triggered = bool(triggers.get(doc["id"]))
        name, desc, why = doc["name"], doc["desc"], doc["why"]
        if doc["id"] == "form_1116" and is_form_1118:
            name = "IRS Form 1118 (Foreign Tax Credit — Corporations)"
            desc = "Claims credit for income tax paid to India against US corporate tax liability."
            why = "This C-corp paid Indian income tax on income that is also taxable in the US. C-corps file Form 1118, not the individual/estate/trust Form 1116."
        out.append({"id": doc["id"], "jurisdiction": doc["jurisdiction"], "name": name, "desc": desc, "why": why, "severity": doc["severity"], "required": triggered, "status": "required" if triggered else "not_triggered"})
    return out


def _build_scope_notes_result(d, ctx):
    notes = []
    has_india, has_us = d["hasIndiaScopeXbr"], d["hasUsScopeBoundaryFtc"]
    dual = has_india and has_us
    has_india_business = d["indiaIsCompany"] or d["indiaIsFirm"] or d["indiaIsAop"] or d["indiaIsTrust"] or d["usEntityKind"] != "individual" or (d["businessComputation"]["businessInr"] or 0) > 0
    has_securities_trades = len(d["indiaFinancialHoldingsTxRaw"]) > 0
    has_us_wages_or_se = d["aggregateUsIncomeResult"]["wages"]["usd"] > 0 or (d["aggregateUsIncomeResult"].get("seEarningsUsd") or 0) > 0

    def note(id_, area, kind, title, body, relevant):
        if relevant:
            notes.append({"id": id_, "area": area, "kind": kind, "title": title, "body": body})

    note("scope_gaar", "India", "excluded", "GAAR is not evaluated",
         "India's General Anti-Avoidance Rule can recharacterize arrangements that lack commercial substance — a facts-and-circumstances judgment no rules engine can safely make. WISING flags mechanical conflicts only; whether an arrangement invites GAAR scrutiny remains a professional call.",
         has_india)
    note("scope_stt", "India", "excluded", "STT is not computed as a levy",
         "Securities Transaction Tax charged on trades (raised on F&O by Finance Act 2026) isn't calculated here. The stt_paid flag on each transaction drives the capital-gains regime (s.196/198 vs s.197) — the levy amount itself is neither a tax credit nor a capital-gains deduction, so nothing downstream depends on it.",
         has_securities_trades)
    note("scope_payer_tds", "India", "excluded", "Your obligations as a TDS deductor aren't tracked",
         "The Withholding page covers tax withheld FROM this taxpayer's income. Duties in the opposite direction — deducting TDS on payments the business makes to vendors, contractors, or professionals — aren't monitored as a compliance obligation in their own right, though the resulting s.40(a) expense disallowance for TDS failures (and s.40A(3) cash-payment / s.43B(h) MSME-overdue disallowances) does flow into business income (Phase 1).",
         has_india_business)
    note("scope_clubbing", "India", "excluded", "Clubbing amounts are taken as entered",
         "Spousal and minor-child clubbed income entered in Layer 1 is taxed as given. WISING doesn't trace asset transfers between family members to detect clubbing that should have been reported but wasn't.",
         has_india)
    note("scope_fica", "United States", "excluded", "FICA/FUTA levies aren't computed",
         "Employee and employer Social Security/Medicare/unemployment payroll taxes are a separate tax base from income tax. Only the pieces that touch the 1040 are computed: Additional Medicare 0.9%, self-employment tax, and the W-2 withholding shown on the Withholding page.",
         has_us_wages_or_se)
    note("scope_fatca_ch4", "Cross-border", "excluded", "FATCA Chapter 4 withholding is institution-side",
         "The 30% FATCA withholding regime (IRC §§1471-1474) applies to payments to non-compliant foreign financial institutions — banks' problem, not yours directly. Where it touches an individual is the US-person self-certification banks request, which is tracked with your documents.",
         dual)
    note("scope_mocked_uploads", "App", "excluded", "Document-upload extraction is simulated",
         "Every \"upload to auto-fill\" feature in Layer 1 (Form 26AS, Lower-TDS certificate, bank statements, property documents) is a demo simulation with representative values — not live OCR. Figures sourced from an upload should be treated as manually-entered until real extraction ships.",
         True)
    note("scope_mli", "Cross-border", "assurance", "MLI does not affect the India-US treaty",
         "The US never signed the OECD Multilateral Instrument, so the India-US DTAA text is untouched by it — unlike India's treaties with the UK, Netherlands, or Singapore. Verified; nothing to apply.",
         dual)
    note("scope_dtaa_current", "Cross-border", "assurance", "Treaty text current as modeled",
         "The India-US DTAA has not been amended since the 2000 protocol. Every treaty rate and tie-breaker rule in this engine reflects the treaty as it stands.",
         dual)

    return notes


CBDT_CITATION = "CBDT notified the AY 2026-27 ITR forms 2026-03-30 (corrigendum 2026-04-10). Eligibility rules verified against that notification 2026-07-12 — re-check each filing season, since CBDT re-notifies forms (and sometimes changes eligibility) annually."


def _build_return_form_determination_result(d, ctx):
    itr = d["indiaItrFormResult"] if d["hasIndiaScopeXbr"] else None

    reasons_suffix = (" Reasons: " + "; ".join(itr["disqualifiers"]) + ".") if (itr and itr.get("disqualifiers")) else ""
    if not itr:
        india_trace = _source("No India-side data on file.", None)
    elif itr.get("frontendForm") is None:
        india_trace = _source(
            (itr.get("explanation") or "Backend-computed eligibility check.") + reasons_suffix +
            " Layer 1 India hasn't produced its own recommendation for this profile (itr_recommendation.form is unset) — this is WISING's own independent computation, run unconditionally, not a hedge pending the frontend.",
            CBDT_CITATION,
        )
    elif itr["matchesFrontend"]:
        india_trace = _source((itr.get("explanation") or "") + reasons_suffix + f" Cross-checked against Layer 1 India's own recommendation ({itr['frontendForm']}) — they agree.", CBDT_CITATION)
    else:
        india_trace = _source(
            f"WISING computes {itr['form']}; Layer 1 India's own recommendation was {itr['frontendForm']}"
            f" (\"{itr.get('frontendExplanation') or 'no explanation on file'}\"). They disagree — see the india_itr_form_mismatch finding for likely causes." + reasons_suffix,
            CBDT_CITATION,
        )

    entity = d["entityResult"]
    us_return_form = entity["usReturnForm"]
    us_detail = {
        "1120": "C-Corp: entity-level return, taxed at 21% flat.",
        "1120-S": "S-Corp: informational return, income passes through via K-1.",
        "1065": "Partnership: informational return, income passes through via K-1.",
        "1041": "Trust/estate return.",
        "1040-NR": "Nonresident alien individual return — Layer 1 US recorded this taxpayer as filing Form 1040-NR.",
    }.get(us_return_form, "Resident/citizen individual return — standard Form 1040 (not recorded as an NRA 1040-NR filer).")
    us_trace = _source(us_detail, "IRS form-per-entity-type/residency-status mapping, verified 2026-07-12.")

    return {
        "india": {"form": itr["form"] if itr else entity["indiaReturnForm"], "isRecommendation": bool(itr), "matchesFrontend": itr["matchesFrontend"] if itr else None, "trace": india_trace},
        "us": {"form": us_return_form, "trace": us_trace},
    }


def _build_ftc_report_result(d, ctx):
    ftc, india_total_tax_usd, us_tax = d["ftcResult"], d["indiaTotalTaxUsdBoundaryFtc"], d["usTaxResult"]
    feie_rows = []
    if ftc["us"]["feieExcludedUsd"] > 0:
        feie_rows = [
            {"label": "Less FEIE-excluded wages (§911)", "usd": -ftc["us"]["feieExcludedUsd"],
             "trace": _source("The §911 Foreign Earned Income Exclusion amount claimed on Layer 1 US (Form 2555). Excluded income leaves the FTC computation entirely — §911(d)(6) no-double-dip.")},
            {"label": "Indian tax disallowed on excluded income", "usd": -ftc["us"]["indiaTaxDisallowedUsd"],
             "trace": _calc("Total Indian tax × (FEIE-excluded wages ÷ gross Indian-source income) — the slice of Indian tax attributable to income the US isn't taxing at all can't be credited",
                             [{"label": "Total India tax (USD)", "amount": india_total_tax_usd}, {"label": "FEIE-excluded wages", "amount": ftc["us"]["feieExcludedUsd"]}, {"label": "Gross Indian-source income (US view)", "amount": d["indiaIncomeTotalUsdBoundaryFtc"]}])},
        ]
    return {
        "direction_us_claims_india": {
            "title": f"US {d['usFtcFormXbr']} — credit for Indian taxes",
            "rows": feie_rows + [
                {"label": "Indian income tax (creditable)", "usd": ftc["us"]["indiaTaxPaidUsd"],
                 "trace": _calc("Total India tax × creditable fraction (gross Indian income less any FEIE-excluded slice, over gross Indian income)",
                                 [{"label": "Total India tax (from Tax Computation)", "amount": india_total_tax_usd},
                                  {"label": "Creditable fraction", "display": f"{js_round((ftc['us']['indiaTaxPaidUsd'] / india_total_tax_usd if india_total_tax_usd > 0 else 1) * 100)}%"}])},
                {"label": "Foreign-source income (US view)", "usd": ftc["us"]["foreignSourceIncomeUsd"],
                 "trace": _holdings("india", f"Net of the {_usd(ftc['us']['feieExcludedUsd'])} FEIE-excluded wages shown in the row above." if ftc["us"]["feieExcludedUsd"] > 0 else None)},
                {"label": "US taxable income", "usd": ftc["us"]["taxableIncomeUsd"], "trace": _calc("Same figure as \"Taxable income\" in the Tax Computation card above", [{"label": "US taxable income", "amount": ftc["us"]["taxableIncomeUsd"]}])},
                {"label": "US income tax (pre-credit)", "usd": ftc["us"]["usIncomeTaxUsd"],
                 "trace": _calc("Ordinary-rate tax + preferential LTCG/QDI tax only — NIIT, Additional Medicare, SE tax and AMT are excluded, they're not creditable against foreign tax by statute",
                                 [{"label": "Ordinary-rate tax", "amount": us_tax["ordinaryTaxUsd"]}, {"label": "Preferential LTCG/QDI tax", "amount": us_tax["preferentialTaxUsd"]}])},
                {"label": "FTC limitation = US tax × foreign/taxable", "usd": ftc["us"]["ftcLimitUsd"],
                 "trace": _calc("§904(a): the credit can't exceed US tax on this income times the same proportion foreign-source income bears to total taxable income",
                                 [{"label": "US income tax (pre-credit)", "amount": ftc["us"]["usIncomeTaxUsd"]}, {"label": "Foreign-source income", "amount": ftc["us"]["foreignSourceIncomeUsd"]}, {"label": "US taxable income", "amount": ftc["us"]["taxableIncomeUsd"]}])},
                {"label": "FTC allowed this year", "usd": ftc["us"]["ftcAllowedUsd"], "emphasis": True,
                 "trace": _calc("Lesser of Indian tax paid and the §904 limitation", [{"label": "Indian income tax (creditable)", "amount": ftc["us"]["indiaTaxPaidUsd"]}, {"label": "FTC limitation", "amount": ftc["us"]["ftcLimitUsd"]}])},
                {"label": "Excess credit carried over (§904(c))", "usd": ftc["us"]["carryoverUsd"],
                 "trace": _calc("Indian tax paid in excess of what the §904 limitation allows this year — carries back 1 year / forward 10 years", [{"label": "Indian income tax (creditable)", "amount": ftc["us"]["indiaTaxPaidUsd"]}, {"label": "Less FTC allowed this year", "amount": -ftc["us"]["ftcAllowedUsd"]}])},
                {"label": "Residual double tax (unrelieved)", "usd": ftc["us"]["residualDoubleTaxUsd"], "warn": True,
                 "trace": _calc("Same as the excess credit carried over — until it's actually used in a future year this is double taxation the credit hasn't relieved yet", [{"label": "Excess credit carried over", "amount": ftc["us"]["carryoverUsd"]}])},
            ],
        },
        "direction_india_relief": {
            "title": "India §159 relief — for US taxes on doubly-taxed income",
            "rows": [
                {"label": "US-source income (foreign, India view)", "usd": ftc["india"]["foreignSourceIncomeUsd"],
                 "trace": _holdings("us", "Only counted when the taxpayer is India ROR (worldwide taxation) — zero here because that isn't the case." if ftc["india"]["foreignSourceIncomeUsd"] == 0 else None)},
                {"label": "US tax on that US-source income", "usd": ftc["india"]["usTaxOnUsSourceUsd"],
                 "trace": _calc("US income tax × (US-source income ÷ total US income) — the slice of US tax attributable to income India also taxes",
                                 [{"label": "US income tax (pre-credit)", "amount": us_tax["incomeTaxUsd"]}, {"label": "US-source income", "amount": us_tax["usSourceIncomeUsd"]}, {"label": "Total US income", "amount": us_tax["totalIncomeUsd"]}])},
                {"label": "Indian tax on the doubly-taxed income (cap)", "usd": ftc["india"]["reliefCapUsd"],
                 "trace": _calc("Total India tax × (US-source income ÷ total India-view income) — s.159 relief can never exceed the Indian tax actually attributable to that income",
                                 [{"label": "Total India tax", "amount": india_total_tax_usd}, {"label": "US-source income (India view)", "amount": ftc["india"]["foreignSourceIncomeUsd"]}, {"label": "Total India-view income", "amount": d["indiaTotalIncomeUsdBoundaryFtc"]}])},
                {"label": "§90 relief allowed", "usd": ftc["india"]["reliefAllowedUsd"], "emphasis": True,
                 "trace": _calc("Lesser of the US tax on that income and the Indian-tax cap", [{"label": "US tax on the doubly-taxed income", "amount": ftc["india"]["usTaxOnUsSourceUsd"]}, {"label": "Indian tax cap", "amount": ftc["india"]["reliefCapUsd"]}])},
            ],
        },
        "headlineNetDoubleTaxUsd": ftc["netUnrelievedDoubleTaxUsd"],
    }


NODES = {
    "accountsListResult": NodeDef(deps=("bankAccountsRaw", "hasUsScopeBoundaryFtc"), compute=_accounts_list_result),
    "taxCreditsIndiaRaw": NodeDef(
        deps=(), compute=lambda d, ctx: (lambda tc: {
            "q1": num(safe(tc, "advance_tax_q1_15jun_inr", 0)), "q2": num(safe(tc, "advance_tax_q2_15sep_inr", 0)),
            "q3": num(safe(tc, "advance_tax_q3_15dec_inr", 0)), "q4": num(safe(tc, "advance_tax_q4_15mar_inr", 0)),
            "tdsAlreadyDeducted": num(safe(tc, "tds_already_deducted_inr", 0)), "tds": num(safe(tc, "tds_inr", 0)), "tcs": num(safe(tc, "tcs_inr", 0)),
        })(safe(ctx.get("india"), "tax_credits", {})),
        layer1_fields=(
            "india.tax_credits.advance_tax_q1_15jun_inr", "india.tax_credits.advance_tax_q2_15sep_inr",
            "india.tax_credits.advance_tax_q3_15dec_inr", "india.tax_credits.advance_tax_q4_15mar_inr",
            "india.tax_credits.tds_already_deducted_inr", "india.tax_credits.tds_inr", "india.tax_credits.tcs_inr",
        ),
    ),
    "taxesPaidIndiaResult": NodeDef(deps=("taxCreditsIndiaRaw",), compute=_taxes_paid_india_result),
    "s44adLastExitAyRaw": NodeDef(deps=("diAgg",), compute=lambda d, ctx: safe(d["diAgg"], "business_income.s44AD_last_exit_ay", None), layer1_fields=("india.domestic_income.business_income.s44AD_last_exit_ay",)),
    "presumptiveLockinAgg": NodeDef(deps=("s44adLastExitAyRaw",), compute=_presumptive_lockin_agg),
    "indianMutualFundsResult": NodeDef(deps=("indiaFinancialHoldingsTxRaw",), compute=lambda d, ctx: [t for t in d["indiaFinancialHoldingsTxRaw"] if t.get("asset_type") and "mutual_fund" in str(t["asset_type"]).lower()]),
    "usPficHoldingsRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_entities.pfic_holdings", []) or [], layer1_fields=("us.foreign_entities.pfic_holdings",)),
    "usSecuritiesRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "financial_holdings", []) or [], layer1_fields=("us.financial_holdings",)),
    "usOwnsForeignDisregardedEntityRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "foreign_entities.owns_foreign_disregarded_entity", False) is True, layer1_fields=("us.foreign_entities.owns_foreign_disregarded_entity",)),
    "usSelfEmploymentRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("us"), "income_us_source.self_employment", []) or [], layer1_fields=("us.income_us_source.self_employment",)),
    "form8938GaugeResult": NodeDef(deps=("feie", "usFilingStatusRaw", "accountsListResult", "aggregateLastDayUsdResult", "hasUsScopeBoundaryFtc"), compute=_form8938_gauge_result),
    "headlineTotalIncomeUsdResult": NodeDef(
        deps=("totalIndiaIncomeInr", "aggregateUsIncomeResult"),
        compute=lambda d, ctx: d["totalIndiaIncomeInr"] / fx_rate(ctx) + d["aggregateUsIncomeResult"]["total"]["usd"],
    ),
    "buildDocumentsResult": NodeDef(
        deps=("residencyResult", "accountsListResult", "form8938GaugeResult", "taxesPaidIndiaResult", "entityResult",
              "feieRaw", "treatyUsResidenceRaw", "treatyFiles1040nrRaw", "treatyIndiaResidenceRaw",
              "indianMutualFundsResult", "usPficHoldingsRaw", "usSecuritiesRaw", "usOwnsForeignDisregardedEntityRaw", "usSelfEmploymentRaw", "bizEntriesAgg", "ppfInrRaw", "epfInrRaw", "foreignGiftsRaw",
              "usTaxResult", "headlineTotalIncomeUsdResult", "usFilingStatusRaw", "aggregateUsIncomeResult",
              "taxesPaidUsResult", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc",
              "limitsRawExtra", "totalIncomeInrV3", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "viaForeignCorpXbr4", "usStateTaxResult", "nraRaw",
              "entityTaxResult", "taxRegime", "businessComputation", "presumptiveLockinAgg", "slabs"),
        compute=_build_documents_result,
    ),
    "buildScopeNotesResult": NodeDef(
        deps=("hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "usEntityKind",
              "businessComputation", "indiaFinancialHoldingsTxRaw", "aggregateUsIncomeResult"),
        compute=_build_scope_notes_result,
    ),
    "buildReturnFormDeterminationResult": NodeDef(deps=("hasIndiaScopeXbr", "indiaItrFormResult", "entityResult"), compute=_build_return_form_determination_result),
    "buildFtcReportResult": NodeDef(deps=("ftcResult", "indiaTotalTaxUsdBoundaryFtc", "indiaTotalIncomeUsdBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc", "usTaxResult", "usFtcFormXbr"), compute=_build_ftc_report_result),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r
