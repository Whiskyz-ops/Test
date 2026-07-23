#!/usr/bin/env node
/* ============================================================================
 * WISING — array-item field coverage checker
 * ----------------------------------------------------------------------------
 * field-coverage.js treats every array (financial_holdings.transactions,
 * wages_w2, etc.) as one opaque leaf — it never looks at what fields the
 * INDIVIDUAL items in that array actually have. That's a real blind spot:
 * a large share of this session's actual bugs (the GAV field-name fallback,
 * sale_val vs sale_value aliasing, property-row field mismatches) were
 * exactly this class — a per-transaction field the form writes under one
 * name and the engine reads under another. This script closes that gap.
 *
 * Method: for each array the engine reads via a
 * `safe(x, "array.path", []).forEach(function (item) { ... })` pattern,
 * extract every `item.fieldName` access inside that callback (the engine's
 * expected item shape). Separately, find where the SAME array path gets
 * assigned in the form (`state.array.path = someVar;` or
 * `state.array.path.push({...})`), locate `someVar.push({...})` calls
 * nearby, and extract the keys of the pushed object literal (the form's
 * actual item shape, flattened — nested object keys are folded in too,
 * since matching nesting depth precisely between the two sides isn't
 * reliable with this method). Diff the two shapes.
 *
 * This is a heuristic text scan, not a real interpreter — same discipline
 * as the other two audit scripts: false positives and false negatives both
 * happen (documented inline below), so treat every hit as a candidate for
 * review, not a proven bug. In particular: a read that goes through a
 * RENAMED local variable (e.g. `var adv = w.tax_details_collapsed_by_default
 * || w; adv.federal_tax_withheld_usd`) is invisible to this tool — it only
 * catches direct `item.property` access — this exact limitation bit plain
 * grep earlier in this project's history (see docs/FIELD_COVERAGE_AUDIT.md's
 * "Method" section) and it applies here too.
 *
 * Known false-positive class (found empirically on the first real run,
 * unlisted_equity.transactions): a construction site can legitimately omit
 * a field the engine reads elsewhere in the SAME forEach body if that field
 * is only relevant conditionally — e.g. sale_date/sale_price_per_share only
 * matter for a SOLD holding, and a "still holding" placeholder entry (some
 * of this array's construction sites are cross-hydration shortcuts that
 * record a holding exists without recording a sale) correctly omits them,
 * matching the engine's own `if (!tx.sale_date) return;` guard. This tool
 * has no way to know which fields are conditional vs required — it flags
 * every field the forEach body ever touches, unconditionally. Read the
 * flagged code on both sides before concluding a PER-SITE GAP is a bug.
 *
 * Usage: node scripts/audit/array-item-coverage.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const resolveEngineFile = require("../engine-frozen.js").resolveEngineFile;
const normalizeSrc = fs.readFileSync(resolveEngineFile("normalize.js"), "utf8");
const indiaHtml = fs.readFileSync(path.join(repoRoot, "layer1_india.html"), "utf8");
const usHtml = fs.readFileSync(path.join(repoRoot, "layer1_us.html"), "utf8");

function matchBalanced(src, openIndex, openChar, closeChar) {
  let depth = 0, i = openIndex;
  for (; i < src.length; i++) {
    if (src[i] === openChar) depth++;
    else if (src[i] === closeChar) { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 1. Engine side: every safe(x, "array.path", []).forEach(function (item) {...})
// ---------------------------------------------------------------------------
function extractEngineArrayReads(src) {
  const re = /safe\([a-zA-Z_][\w.]*,\s*"([\w.]+)"\s*,\s*\[\]\s*\)\s*\|\|\s*\[\]\s*\)\s*\.forEach\(\s*function\s*\(\s*(\w+)\s*\)\s*\{/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const bodyStart = m.index + m[0].length - 1; // the '{'
    const bodyEnd = matchBalanced(src, bodyStart, "{", "}");
    if (bodyEnd === -1) continue;
    const body = src.slice(bodyStart, bodyEnd);
    const itemVar = m[2];
    const propRe = new RegExp("\\b" + itemVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.(\\w+)", "g");
    const fields = new Set();
    let pm;
    while ((pm = propRe.exec(body)) !== null) fields.add(pm[1]);
    const lineNo = src.slice(0, m.index).split("\n").length;
    out.push({ path: m[1], itemVar, fields: Array.from(fields), line: lineNo });
  }
  // Merge multiple forEach sites over the same array path (some arrays are
  // iterated more than once, in different functions, for different purposes).
  const merged = {};
  out.forEach((r) => {
    if (!merged[r.path]) merged[r.path] = { path: r.path, fields: new Set(), lines: [] };
    r.fields.forEach((f) => merged[r.path].fields.add(f));
    merged[r.path].lines.push(r.line);
  });
  return Object.values(merged).map((m) => ({ path: m.path, fields: Array.from(m.fields), lines: m.lines }));
}

// ---------------------------------------------------------------------------
// 2. Form side: find state.<array.path> = VAR / state.<array.path>.push({...}),
//    then VAR.push({...}) nearby, and flatten the pushed object's keys.
// ---------------------------------------------------------------------------
function extractObjectLiteralKeys(src, braceOpenIndex) {
  const end = matchBalanced(src, braceOpenIndex, "{", "}");
  if (end === -1) return [];
  const body = src.slice(braceOpenIndex + 1, end - 1);
  const keys = new Set();
  const keyRe = /(^|[{,])\s*(['"]?)([\w$]+)\2\s*:/g;
  let m;
  while ((m = keyRe.exec(body)) !== null) keys.add(m[3]);
  return Array.from(keys);
}

function extractFormArrayShape(html, arrayPath, stateVarNames) {
  const escapedPath = arrayPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const foundKeys = new Set();
  const sites = [];

  stateVarNames.forEach((sv) => {
    // Direct: state.array.path.push({...})
    const directRe = new RegExp(sv + "\\." + escapedPath + "\\.push\\(\\s*\\{", "g");
    let m;
    while ((m = directRe.exec(html)) !== null) {
      const openBrace = m.index + m[0].length - 1;
      const keys = extractObjectLiteralKeys(html, openBrace);
      keys.forEach((k) => foundKeys.add(k));
      sites.push({ kind: "direct push", line: html.slice(0, m.index).split("\n").length, keys });
    }

    // Indirect: state.array.path = varName; ... varName.push({...}) nearby.
    const assignRe = new RegExp(sv + "\\." + escapedPath + "\\s*=\\s*(\\w+)\\s*;", "g");
    while ((m = assignRe.exec(html)) !== null) {
      const varName = m[1];
      if (["null", "undefined", "true", "false"].includes(varName)) continue;
      // Search a window before the assignment for varName.push({...}) — sync
      // functions in this codebase build the array top-to-bottom then assign
      // it to state at the end, so "before" is the right direction.
      const windowStart = Math.max(0, m.index - 6000);
      const window = html.slice(windowStart, m.index);
      const pushRe = new RegExp("\\b" + varName + "\\.push\\(\\s*\\{", "g");
      let pm;
      while ((pm = pushRe.exec(window)) !== null) {
        const openBrace = windowStart + pm.index + pm[0].length - 1;
        const keys = extractObjectLiteralKeys(html, openBrace);
        keys.forEach((k) => foundKeys.add(k));
        sites.push({ kind: `via ${varName}.push()`, line: html.slice(0, openBrace).split("\n").length, keys });
      }
    }
  });

  return { keys: Array.from(foundKeys), sites };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const engineArrays = extractEngineArrayReads(normalizeSrc);

console.log("=".repeat(78));
console.log("Array-item field coverage — per-transaction/per-row field names");
console.log("=".repeat(78));
console.log(`Arrays the engine reads item-by-item: ${engineArrays.length}\n`);

let anyHighConfidence = false, anyPerSite = false;
engineArrays.forEach((ea) => {
  if (ea.fields.length === 0) return; // forEach body didn't access item.X directly (e.g. only used the item as a whole) — nothing to check
  const indiaShape = extractFormArrayShape(indiaHtml, ea.path, ["state"]);
  const usShape = extractFormArrayShape(usHtml, ea.path, ["usState"]);
  const formKeys = new Set([...indiaShape.keys, ...usShape.keys]);
  const sites = [...indiaShape.sites, ...usShape.sites];

  if (sites.length === 0) return; // path not found being constructed in either form at all — likely demo-profile-only or a top-level object-existence path already covered by field-coverage.js, not this tool's concern

  const missingFromUnion = ea.fields.filter((f) => !formKeys.has(f));

  // Per-site check: with >1 construction site (e.g. a real "Add Row" UI
  // plus a separate India->US auto-hydration shortcut), a field present at
  // ONE site but not another is invisible to the union check above but is
  // exactly the kind of masking that hid a real, severe mismatch
  // (foreign_corporations: the real "Add Foreign Corporation" UI writes
  // corporation_name/country_of_incorporation/ownership_percentage — ZERO
  // overlap with the engine's corp_name/country/ownership_pct/gilti_income_
  // usd — while a separate India->US auto-hydration shortcut coincidentally
  // used 2 of the 4 correct names, hiding the whole thing from the union
  // check) on its first run 14 Jul 2026. A site with NO fields in common is
  // reported too, not filtered out — that's the most severe case, not a
  // reason to suppress it; it's flagged distinctly since it's also
  // consistent with the regex having mis-attributed an unrelated push() to
  // this path, so it still needs a human look either way.
  const siteGaps = sites
    .map((s) => ({ ...s, missing: ea.fields.filter((f) => !s.keys.includes(f)) }))
    .filter((s) => s.missing.length > 0);

  if (missingFromUnion.length === 0 && siteGaps.length === 0) return;

  if (missingFromUnion.length > 0) anyHighConfidence = true;
  if (siteGaps.length > 0) anyPerSite = true;

  console.log(`--- ${ea.path}  (engine reads at normalize.js:${ea.lines.join(", ")}) ---`);
  console.log(`  engine reads item.{${ea.fields.join(", ")}}`);
  if (missingFromUnion.length > 0) {
    console.log(`  HIGH CONFIDENCE — missing from EVERY construction site found: ${missingFromUnion.join(", ")}`);
  }
  siteGaps.forEach((s) => {
    const zeroOverlap = s.missing.length === ea.fields.length;
    const label = zeroOverlap ? "PER-SITE GAP (ZERO fields in common — either this site is fully disconnected from the engine, or the regex mis-attributed an unrelated push() here; verify by hand either way)" : "PER-SITE GAP";
    console.log(`  ${label} — ${s.kind} (L${s.line}) is missing: ${s.missing.join(", ")}  [this site's own keys: ${s.keys.join(", ")}]`);
  });
  console.log("");
});

if (!anyHighConfidence && !anyPerSite) {
  console.log("No per-item field mismatches found for the arrays this tool could locate on both sides.");
}
console.log("Note: arrays with zero located construction sites in either form (demo-profile-only fields, or ones this tool's heuristics couldn't locate) are silently skipped — not a clean bill of health, just outside this pass's reach. Cross-check anything suspicious by hand.");
process.exit(0);
