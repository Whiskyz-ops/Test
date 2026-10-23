"""Proof of concept: fill the blank 2025 Form 1040 with the engine's own US
tax computation for one test profile.

Only the lines the engine computes as a single figure are filled (total
income through total tax). Lines 1a-8 stay blank because the engine keeps
income as one worldwide total, not per 1040 line; line 17 (AMT), 19 (child
credits) and the payments section stay blank for the same reason.

    python3 scripts/fill-form-1040-demo.py [profile] [out.pdf]

profile defaults to us_resident_indian_income (a fixture in
dag_py/tests/fixtures/profiles). Uses assets/forms/fieldmaps/form-1040.json
from scripts/map-form-fields.py.

The engine's US constants are tax year 2026 and the PDF is the 2025 form,
so the figures are 2026 amounts on a 2025 layout (e.g. line 12e shows the
2026 standard deduction). The script warns when the years differ.
"""
import json
import os
import sys

from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(REPO, "dag_py", "src"))

from wising_dag.analyze import analyze  # noqa: E402

FORM_TAX_YEAR = 2025


def us_rows(result):
    return {row["label"].strip(): row.get("usd") or 0 for row in result["taxComputation"]["us"]["rows"]}


def ftc_allowed(result):
    for row in result["ftcReport"]["direction_us_claims_india"]["rows"]:
        if row["label"] == "FTC allowed this year":
            return row["usd"]
    return 0


def form_1040_lines(result):
    r = us_rows(result)
    total = r["Total income (worldwide)"]
    agi = r["Adjusted gross income"]
    deduction = -r.get("Less standard deduction", r.get("Less itemized deductions", 0))
    qbi = -r.get("Less §199A QBI deduction", 0)
    tax = r["Ordinary-rate tax"] + r.get("Preferential LTCG/QDI tax", 0)
    credits = ftc_allowed(result)  # Schedule 3 line 1 -> line 8 -> 1040 line 20
    other = (r.get("Net investment income tax (NIIT, §1411)", 0) + r.get("Additional Medicare tax", 0)
             + r.get("Self-employment tax (Schedule SE)", 0))  # Schedule 2 line 21
    after_credits = max(0, tax - credits)
    return {
        "9": total, "10": total - agi, "11a": agi, "11b": agi,
        "12e": deduction, "13a": qbi, "14": deduction + qbi, "15": r["Taxable income"],
        "16": tax, "18": tax, "20": credits, "21": credits, "22": after_credits,
        "23": other, "24": after_credits + other,
    }


def main():
    profile = sys.argv[1] if len(sys.argv) > 1 else "us_resident_indian_income"
    out = sys.argv[2] if len(sys.argv) > 2 else f"form-1040-{profile}.pdf"
    fixture = json.load(open(os.path.join(REPO, "dag_py", "tests", "fixtures", "profiles", profile + ".json")))
    result = analyze({k: fixture[k] for k in ("router", "india", "us")})
    engine_year = result["model"]["meta"].get("baseYear")
    if engine_year != FORM_TAX_YEAR:
        print(f"WARNING: engine computed tax year {engine_year}, form is {FORM_TAX_YEAR}; figures follow {engine_year} law")

    fieldmap = json.load(open(os.path.join(REPO, "assets", "forms", "fieldmaps", "form-1040.json")))["lines"]
    values = {fieldmap[line]["field"]: f"{round(amount):,}" for line, amount in form_1040_lines(result).items()}

    writer = PdfWriter(clone_from=PdfReader(os.path.join(REPO, "assets", "forms", "us-federal", "form-1040.pdf")))
    for page in writer.pages:
        writer.update_page_form_field_values(page, values, auto_regenerate=False)
    writer.set_need_appearances_writer(True)
    # IRS PDFs also carry an XFA copy of the form; Adobe Reader would show
    # that (still blank) copy instead of the fields filled above.
    writer._root_object["/AcroForm"].pop("/XFA", None)
    with open(out, "wb") as f:
        writer.write(f)
    for line, amount in form_1040_lines(result).items():
        print(f"line {line:>4}  {round(amount):>10,}")
    print("wrote", out)


if __name__ == "__main__":
    main()
