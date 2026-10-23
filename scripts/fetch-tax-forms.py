"""Download the blank US federal and state (CA / NY / NJ) tax-form PDFs the
engine can tell a client to file, and record each PDF's fillable fields.

Only forms the engine actually names (the Filings-tab catalogue in
monitor-next/lib/dag/constants.js, the return-form determination, and the
US/cross-border findings) are fetched. Links and revisions come from
US_Individual_Tax_Forms.xlsx (IRS catalogue downloaded 14 Oct 2026).

    python3 scripts/fetch-tax-forms.py            # download + inventory
    python3 scripts/fetch-tax-forms.py --no-fetch  # re-inventory only

Writes assets/forms/<group>/<file>.pdf and assets/forms/manifest.json.
"""
import json
import os
import sys
import subprocess
import time

from pypdf import PdfReader

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "forms")

IRS = "https://www.irs.gov/pub/irs-pdf/"
FTB = "https://www.ftb.ca.gov/forms/2025/"
NYS = "https://www.tax.ny.gov/pdf/current_forms/it/"
NJT = "https://www.nj.gov/treasury/taxation/pdf/current/"

# (group, form, title, url, why the engine needs it)
FORMS = [
    # --- Federal: main returns and schedules (return-form determination, US tax computation)
    ("us-federal", "Form 1040", "U.S. Individual Income Tax Return", IRS + "f1040.pdf", "US return for citizens / residents (usTaxResult)"),
    ("us-federal", "Form 1040-NR", "U.S. Nonresident Alien Income Tax Return", IRS + "f1040nr.pdf", "form_1040nr: US nonresident alien"),
    ("us-federal", "Schedule 1 (Form 1040)", "Additional Income and Adjustments to Income", IRS + "f1040s1.pdf", "Foreign income, FEIE exclusion, rental/business income"),
    ("us-federal", "Schedule 2 (Form 1040)", "Additional Taxes", IRS + "f1040s2.pdf", "AMT, SE tax, NIIT, Additional Medicare Tax, §72(t)"),
    ("us-federal", "Schedule 3 (Form 1040)", "Additional Credits and Payments", IRS + "f1040s3.pdf", "Foreign tax credit (line 1) flows here"),
    ("us-federal", "Schedule A (Form 1040)", "Itemized Deductions", IRS + "f1040sa.pdf", "Itemized vs standard deduction (dedUs)"),
    ("us-federal", "Schedule B (Form 1040)", "Interest and Ordinary Dividends", IRS + "f1040sb.pdf", "Part III foreign accounts question (FBAR link)"),
    ("us-federal", "Schedule C (Form 1040)", "Profit or Loss From Business", IRS + "f1040sc.pdf", "Self-employment / business income"),
    ("us-federal", "Schedule D (Form 1040)", "Capital Gains and Losses", IRS + "f1040sd.pdf", "Capital gains incl. Indian property / securities"),
    ("us-federal", "Schedule E (Form 1040)", "Supplemental Income and Loss", IRS + "f1040se.pdf", "Indian rental property income"),
    ("us-federal", "Schedule SE (Form 1040)", "Self-Employment Tax", IRS + "f1040sse.pdf", "SE tax on business income"),
    ("us-federal", "Schedule 8812 (Form 1040)", "Credits for Qualifying Children and Other Dependents", IRS + "f1040s8.pdf", "Child tax credit"),
    ("us-federal", "Form 8949", "Sales and Other Dispositions of Capital Assets", IRS + "f8949.pdf", "Per-sale detail feeding Schedule D"),
    ("us-federal", "Schedule NEC (Form 1040-NR)", "Tax on Income Not Effectively Connected", IRS + "f1040nrn.pdf", "NRA FDAP income at 30% / treaty rate (nra_fdap)"),
    ("us-federal", "Schedule OI (Form 1040-NR)", "Other Information", IRS + "f1040nro.pdf", "Treaty-exempt income, days in US"),
    ("us-federal", "Schedule A (Form 1040-NR)", "Itemized Deductions (nonresident)", IRS + "f1040nra.pdf", "NRA itemized deductions"),
    # --- Federal: cross-border (Filings-tab catalogue)
    ("us-federal", "Form 1116", "Foreign Tax Credit", IRS + "f1116.pdf", "form_1116: Indian tax credited against US tax"),
    ("us-federal", "Form 2555", "Foreign Earned Income", IRS + "f2555.pdf", "form_2555: FEIE elected"),
    ("us-federal", "Form 8833", "Treaty-Based Return Position Disclosure", IRS + "f8833.pdf", "form_8833: DTAA tie-breaker / treaty position"),
    ("us-federal", "Form 8938", "Statement of Specified Foreign Financial Assets", IRS + "f8938.pdf", "form_8938: FATCA threshold crossed"),
    ("us-federal", "Form 8621", "PFIC Information Return", IRS + "f8621.pdf", "form_8621: Indian mutual funds / ETFs, one per fund"),
    ("us-federal", "Form 5471", "Information Return re Certain Foreign Corporations", IRS + "f5471.pdf", "form_5471: >=10% of an Indian company"),
    ("us-federal", "Form 8865", "Return re Certain Foreign Partnerships", IRS + "f8865.pdf", "form_8865: Indian partnership / LLP"),
    ("us-federal", "Form 8858", "Information Return re Foreign Disregarded Entities and Branches", IRS + "f8858.pdf", "Foreign branch / disregarded entity"),
    ("us-federal", "Form 3520", "Transactions With Foreign Trusts and Receipt of Foreign Gifts", IRS + "f3520.pdf", "form_3520: foreign gift > $100k / foreign trust"),
    ("us-federal", "Form 3520-A", "Annual Return of Foreign Trust With a U.S. Owner", IRS + "f3520a.pdf", "form_3520: foreign grantor trust"),
    ("us-federal", "Form 8802", "Application for US Residency Certification", IRS + "f8802.pdf", "form_8802: Form 6166 to claim DTAA benefits in India"),
    ("us-federal", "Form 8854", "Initial and Annual Expatriation Statement", IRS + "f8854.pdf", "Expatriation / covered expatriate"),
    ("us-federal", "Form W-8BEN", "Certificate of Foreign Status of Beneficial Owner", IRS + "fw8ben.pdf", "NRA treaty-rate withholding claim"),
    ("us-federal", "Form W-7", "Application for ITIN", IRS + "fw7.pdf", "Spouse / dependent without SSN"),
    ("us-federal", "Form 8288", "FIRPTA Withholding Return", IRS + "f8288.pdf", "form_8288: US real property sold by a foreign person"),
    ("us-federal", "Form 8288-A", "Statement of FIRPTA Withholding", IRS + "f8288a.pdf", "form_8288"),
    ("us-federal", "Form 8288-B", "Application for FIRPTA Withholding Certificate", IRS + "f8288b.pdf", "form_8288"),
    # --- Federal: other taxes, penalties, credits
    ("us-federal", "Form 8960", "Net Investment Income Tax", IRS + "f8960.pdf", "form_8960: NIIT"),
    ("us-federal", "Form 8959", "Additional Medicare Tax", IRS + "f8959.pdf", "form_8959"),
    ("us-federal", "Form 6251", "Alternative Minimum Tax - Individuals", IRS + "f6251.pdf", "form_6251: AMT"),
    ("us-federal", "Form 8801", "Credit for Prior Year Minimum Tax", IRS + "f8801.pdf", "AMT credit carryforward"),
    ("us-federal", "Form 2210", "Underpayment of Estimated Tax", IRS + "f2210.pdf", "us1_penalty_2210"),
    ("us-federal", "Form 5329", "Additional Taxes on Qualified Plans and IRAs", IRS + "f5329.pdf", "us5_penalty_72t: early distribution"),
    ("us-federal", "Form 8880", "Saver's Credit", IRS + "f8880.pdf", "Retirement savings contributions credit"),
    ("us-federal", "Form 8889", "Health Savings Accounts", IRS + "f8889.pdf", "HSA"),
    ("us-federal", "Form 4868", "Automatic Extension of Time to File", IRS + "f4868.pdf", "form_4868"),
    ("us-federal", "Form 1040-ES", "Estimated Tax for Individuals", IRS + "f1040es.pdf", "Estimated tax due dates"),
    ("us-federal", "Form 1040-X", "Amended U.S. Individual Income Tax Return", IRS + "f1040x.pdf", "Correcting a filed return (e.g. late FTC claim)"),
    # --- California (usStateTaxResult: CA)
    ("us-state-ca", "CA 540", "California Resident Income Tax Return", FTB + "2025-540.pdf", "form_540: CA resident"),
    ("us-state-ca", "CA Schedule CA (540)", "California Adjustments - Residents", FTB + "2025-540-ca.pdf", "CA conformity adjustments (no FEIE in CA)"),
    ("us-state-ca", "CA 540NR", "California Nonresident or Part-Year Resident Return", FTB + "2025-540nr.pdf", "CA part-year / nonresident"),
    ("us-state-ca", "CA Schedule CA (540NR)", "California Adjustments - Nonresidents or Part-Year Residents", FTB + "2025-540nr-ca.pdf", "CA part-year / nonresident"),
    ("us-state-ca", "CA Schedule S", "Other State Tax Credit", FTB + "2025-540-s.pdf", "CA gives no credit for Indian tax; shown for completeness"),
    ("us-state-ca", "CA FTB 3519", "Payment for Automatic Extension for Individuals", FTB + "2025-3519.pdf", "CA extension payment"),
    ("us-state-ca", "CA 540-ES", "Estimated Tax for Individuals", "https://www.ftb.ca.gov/forms/2026/2026-540-es.pdf", "CA estimated tax"),
    # --- New York
    ("us-state-ny", "NY IT-201", "Resident Income Tax Return", NYS + "it201_fill_in.pdf", "form_it201: NY resident"),
    ("us-state-ny", "NY IT-203", "Nonresident and Part-Year Resident Return", NYS + "it203_fill_in.pdf", "NY part-year / nonresident"),
    ("us-state-ny", "NY IT-203-B", "Nonresident Income Allocation", NYS + "it203b_fill_in.pdf", "NY part-year / nonresident"),
    ("us-state-ny", "NY IT-196", "Itemized Deductions", NYS + "it196_fill_in.pdf", "NY itemized deductions"),
    ("us-state-ny", "NY IT-225", "New York State Modifications", NYS + "it225_fill_in.pdf", "NY additions / subtractions"),
    ("us-state-ny", "NY IT-201-ATT", "Other Tax Credits and Taxes", NYS + "it201att_fill_in.pdf", "NY credits schedule"),
    ("us-state-ny", "NY IT-112-R", "New York State Resident Credit", NYS + "it112r_fill_in.pdf", "NY credit for tax paid elsewhere (not India)"),
    ("us-state-ny", "NY IT-370", "Automatic Six-Month Extension", NYS + "it370_fill_in.pdf", "NY extension"),
    ("us-state-ny", "NY IT-2105", "Estimated Income Tax Payment Voucher", NYS + "it2105_fill_in.pdf", "NY estimated tax"),
    # --- New Jersey
    ("us-state-nj", "NJ-1040", "Resident Income Tax Return", NJT + "1040.pdf", "NJ resident"),
    ("us-state-nj", "NJ-1040NR", "Nonresident Income Tax Return", NJT + "1040nr.pdf", "NJ nonresident"),
    ("us-state-nj", "NJ Schedule NJ-COJ", "Credit for Taxes Paid to Other Jurisdiction", NJT + "schedulenjcoj.pdf", "NJ credit for tax paid elsewhere"),
    ("us-state-nj", "NJ Schedule NJ-BUS-1", "Business Income Summary", NJT + "resbus1.pdf", "NJ business income"),
    ("us-state-nj", "NJ-630", "Application for Extension of Time to File", NJT + "630.pdf", "NJ extension"),
    ("us-state-nj", "NJ-1040-ES", "Estimated Income Tax Payment Voucher", NJT + "1040es.pdf", "NJ estimated tax"),
]

# Named by the engine but there is no PDF to fill.
NOT_PDF = [
    ("FinCEN 114 (FBAR)", "Filed only online in the BSA E-Filing System; no paper or PDF return exists."),
    ("FinCEN 114a", "Authorization kept on file, never filed; the spreadsheet's fincen.gov link returns 404 (checked 23 Oct 2026)."),
    ("Form 6166", "Issued by the IRS in response to Form 8802; not completed by the taxpayer."),
    ("ITR-2 / ITR-3 and schedules FA, FSI, TR, AL", "India: filed as JSON through the e-filing portal or offline utility; no PDF form."),
    ("Form 44 (was 67), Form 41 (was 10F), Form 145/146 (was 15CA/15CB), Form 3CB/3CD, Form 3CEB", "India: online forms on the e-filing portal."),
    ("Form 16 / 16A, 26AS / AIS / TIS", "India: statements the client receives, not forms they fill."),
    ("LRS Form A2", "India: bank-specific remittance form."),
]


def safe_name(form):
    return "".join(c if c.isalnum() else "-" for c in form).strip("-").lower().replace("--", "-") + ".pdf"


def fetch(url, dest):
    # curl rather than urllib: ftb.ca.gov answers urllib with 403.
    for wait in (2, 4, 8, 16, None):
        try:
            subprocess.run(["curl", "-sSfL", "-A", "Mozilla/5.0", "-o", dest, url], check=True, timeout=120)
            with open(dest, "rb") as f:
                if f.read(4) != b"%PDF":
                    raise ValueError("not a PDF")
            return
        except Exception:
            if wait is None:
                raise
            time.sleep(wait)


def inventory(path):
    reader = PdfReader(path)
    fields = reader.get_fields() or {}
    kinds = {}
    for f in fields.values():
        ft = f.get("/FT")
        if ft is None:
            continue
        kinds[str(ft)] = kinds.get(str(ft), 0) + 1
    return {
        "pages": len(reader.pages),
        "fillable": bool(kinds),
        "fields": {"text": kinds.get("/Tx", 0), "checkbox_or_radio": kinds.get("/Btn", 0),
                   "choice": kinds.get("/Ch", 0), "signature": kinds.get("/Sig", 0)},
        "xfa": "/XFA" in (reader.trailer["/Root"].get("/AcroForm") or {}),
    }


def main():
    do_fetch = "--no-fetch" not in sys.argv
    out = []
    for group, form, title, url, why in FORMS:
        os.makedirs(os.path.join(ROOT, group), exist_ok=True)
        rel = f"{group}/{safe_name(form)}"
        dest = os.path.join(ROOT, rel)
        entry = {"form": form, "title": title, "group": group, "file": rel, "source": url, "why": why}
        try:
            if do_fetch:
                fetch(url, dest)
            entry.update(inventory(dest))
        except Exception as e:
            entry["error"] = f"{type(e).__name__}: {e}"
        out.append(entry)
        print(f"{form:32} {entry.get('pages', '-'):>3}p  {entry.get('fields', {}).get('text', '-')!s:>5} text  {entry.get('error', '')}")
    manifest = {
        "note": "Blank forms for tax year 2025 (filed in 2026). Re-run each year: field names change between revisions.",
        "forms": out,
        "not_pdf": [{"form": f, "reason": r} for f, r in NOT_PDF],
    }
    with open(os.path.join(ROOT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
