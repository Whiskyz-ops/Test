"""Draft a line-number -> PDF field map for each downloaded form.

IRS and state PDFs name their fields with opaque codes (f1_47[0]) and the
2025 IRS revisions carry no tooltips, so the only link from a field to its
form line is where it sits on the page. This matches each text field to the
line-number label printed just left of it on the same baseline.

The result is a DRAFT: column layouts (Form 8949, Schedule E, Form 1116
columns A-C), repeated rows and lettered sub-lines can be mismatched. Every
map needs a person to check it against the printed form before the product
relies on it.

    python3 scripts/map-form-fields.py

Writes assets/forms/fieldmaps/<file>.json and adds a "mapped" count to each
entry in assets/forms/manifest.json. Needs pdftotext (poppler-utils).
"""
import json
import os
import re
import subprocess
import tempfile

from pypdf import PdfReader

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "forms")
LINE_RE = re.compile(r"^(\d{1,2}[a-z]?|[A-Z])$")
WORD_RE = re.compile(r'<page width="[\d.]+" height="([\d.]+)">|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')


def page_labels(pdf):
    with tempfile.NamedTemporaryFile(suffix=".html") as tmp:
        subprocess.run(["pdftotext", "-q", "-bbox", pdf, tmp.name], check=True)
        html = open(tmp.name, encoding="utf-8").read()
    pages, height = [], 0.0
    for m in WORD_RE.finditer(html):
        if m.group(1):
            height = float(m.group(1))
            pages.append([])
            continue
        text = m.group(6).strip()
        if LINE_RE.match(text):
            x0, y1, x1 = float(m.group(2)), float(m.group(5)), float(m.group(4))
            pages[-1].append({"text": text, "x0": x0, "x1": x1, "y": height - y1})  # PDF coordinates
    return pages


def full_name(annot):
    parts, node = [], annot
    while node is not None:
        if "/T" in node:
            parts.append(str(node["/T"]))
        node = node.get("/Parent")
        node = node.get_object() if node is not None else None
    return ".".join(reversed(parts))


def field_type(annot):
    node = annot
    while node is not None:
        if "/FT" in node:
            return str(node["/FT"])
        node = node.get("/Parent")
        node = node.get_object() if node is not None else None
    return None


def map_form(pdf):
    reader = PdfReader(pdf)
    labels = page_labels(pdf)
    found, unmapped = {}, []
    for pno, page in enumerate(reader.pages):
        for ref in page.get("/Annots") or []:
            a = ref.get_object()
            if a.get("/Subtype") != "/Widget" or field_type(a) != "/Tx":
                continue
            x0, y0, x1, y1 = (float(v) for v in a["/Rect"])
            best = None
            for lab in labels[pno] if pno < len(labels) else []:
                gap = x0 - lab["x1"]
                if abs(lab["y"] - y0) <= 4 and -2 <= gap <= 40 and (best is None or gap < best[0]):
                    best = (gap, lab["text"])
            name = full_name(a)
            if best:
                found.setdefault(best[1], []).append({"field": name, "page": pno + 1, "x": round(x0)})
            else:
                unmapped.append({"field": name, "page": pno + 1, "rect": [round(v) for v in (x0, y0, x1, y1)]})
    # A label can match more than one field: a column B, or a stray number
    # elsewhere ("20" in "2025"). The rightmost field is the amount column, so
    # it becomes "line"; the rest stay as "also" for a reviewer to sort out.
    lines = {}
    for key, hits in found.items():
        hits.sort(key=lambda h: (-h["x"], h["page"]))
        lines[key] = {"field": hits[0]["field"], "page": hits[0]["page"]}
        if len(hits) > 1:
            lines[key]["also"] = [h["field"] for h in hits[1:]]
    return {"lines": lines, "unmapped": unmapped}


def main():
    manifest_path = os.path.join(ROOT, "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    os.makedirs(os.path.join(ROOT, "fieldmaps"), exist_ok=True)
    for entry in manifest["forms"]:
        if "error" in entry:
            continue
        result = map_form(os.path.join(ROOT, entry["file"]))
        out = os.path.join("fieldmaps", os.path.basename(entry["file"]).replace(".pdf", ".json"))
        json.dump({"form": entry["form"], "status": "draft - not reviewed", **result},
                  open(os.path.join(ROOT, out), "w", encoding="utf-8"), indent=1)
        entry["fieldmap"] = out
        entry["mapped"] = len(result["lines"])
        print(f"{entry['form']:32} {entry['mapped']:>4} of {entry['fields']['text']:>4} text fields matched to a line")
    json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
