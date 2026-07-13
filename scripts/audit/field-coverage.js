#!/usr/bin/env node
/* ============================================================================
 * WISING — field coverage diff tool
 * ----------------------------------------------------------------------------
 * Cross-references what a Layer 1 form's state object actually contains
 * against what engine/normalize.js actually reads (safe(obj, "path", dflt)
 * calls). This is the mechanical version of the manual cross-reference that
 * found 9 real "field silently never reaches the engine" bugs on 13 Jul
 * 2026 (see docs/FIELD_COVERAGE_AUDIT.md) — re-runnable in seconds instead
 * of a multi-hour reading pass, specifically so it can be re-run every time
 * layer1_india.html / layer1_us.html get updated.
 *
 * Path matching is SUFFIX-based, not full scope resolution: normalize.js
 * reads through local aliases (`di`, `os`, `ui`, `it`, ...) assigned partway
 * down the state tree, so a read path like "salary.taxable_salary_inr" is
 * matched against any form leaf path ENDING in the same dotted suffix
 * (e.g. "domestic_income.salary.taxable_salary_inr"). This has false-match
 * risk for short/generic suffixes (flagged separately, lower confidence) but
 * correctly resolves the vast majority of real paths without a full JS
 * interpreter. Treat every "possibly unread" hit as a candidate for human/
 * Claude review, not a proven bug — same discipline as dom-handler-coverage.js.
 *
 * Usage:
 *   node scripts/audit/field-coverage.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.join(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// 1. Extract every safe(obj, "path", default) read from normalize.js,
//    tagged with the enclosing function name for human review context.
// ---------------------------------------------------------------------------
function extractEngineReads() {
  const file = path.join(repoRoot, "engine", "normalize.js");
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");

  // Track function boundaries by scanning for "function name(" declarations
  // line-by-line (adequate for this file's flat, non-minified style).
  const fnStarts = [];
  lines.forEach((line, i) => {
    const m = line.match(/function\s+(\w+)\s*\(/);
    if (m) fnStarts.push({ line: i, name: m[1] });
  });
  function enclosingFn(lineNo) {
    let name = "(top level)";
    for (const f of fnStarts) { if (f.line <= lineNo) name = f.name; else break; }
    return name;
  }

  const re = /safe\(\s*([a-zA-Z_][\w.]*)\s*,\s*"([^"]+)"/g;
  const reads = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const lineNo = src.slice(0, m.index).split("\n").length - 1;
    reads.push({ rootVar: m[1], path: m[2], line: lineNo + 1, fn: enclosingFn(lineNo) });
  }
  return reads;
}

// ---------------------------------------------------------------------------
// 2. Extract the form's full state schema as a real JS object (via vm, not
//    regex) and flatten it into dotted leaf paths.
// ---------------------------------------------------------------------------
function extractBalancedObjectLiteral(src, declRe) {
  const m = src.match(declRe);
  if (!m) return null;
  const start = m.index + m[0].length - 1; // position of the opening '{'
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function loadFormSchema(htmlFile, declRe, varName) {
  const file = path.join(repoRoot, htmlFile);
  const html = fs.readFileSync(file, "utf8");
  const literal = extractBalancedObjectLiteral(html, declRe);
  if (!literal) {
    console.error(`Could not locate ${varName} object literal in ${htmlFile}`);
    return null;
  }
  // A couple of state-object literals call browser globals inline (e.g.
  // crypto.randomUUID() for a default request id) — stub the ones seen so
  // far rather than trying to enumerate every possible browser global.
  const sandbox = { crypto: { randomUUID: () => "stub-uuid" } };
  vm.createContext(sandbox);
  try {
    return vm.runInContext("(" + literal + ")", sandbox, { timeout: 2000 });
  } catch (e) {
    console.error(`Failed to evaluate ${varName} from ${htmlFile}: ${e.message}`);
    return null;
  }
}

function flattenLeaves(obj, prefix, out) {
  if (obj === null || obj === undefined) { out.push(prefix); return; }
  if (Array.isArray(obj)) { out.push(prefix); return; } // arrays are leaves — per-item shape isn't statically knowable from an empty default
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) { out.push(prefix); return; }
    keys.forEach((k) => flattenLeaves(obj[k], prefix ? prefix + "." + k : k, out));
    return;
  }
  out.push(prefix); // primitive
}

// ---------------------------------------------------------------------------
// 3. Diff: for each engine read path, does ANY form leaf end with it? For
//    each form leaf, does ANY engine read path match as a suffix of it?
// ---------------------------------------------------------------------------
function pathEndsWith(fullPath, suffix) {
  if (fullPath === suffix) return true;
  return fullPath.length > suffix.length && fullPath.endsWith("." + suffix);
}

function diff(engineReads, formLeaves) {
  const unmatchedReads = []; // engine reads a path the form doesn't have — likely a real bug
  const matchedReads = [];
  engineReads.forEach((r) => {
    const hit = formLeaves.some((leaf) => pathEndsWith(leaf, r.path));
    (hit ? matchedReads : unmatchedReads).push(r);
  });

  const unreadLeaves = formLeaves.filter((leaf) =>
    !engineReads.some((r) => pathEndsWith(leaf, r.path))
  );

  return { matchedReads, unmatchedReads, unreadLeaves };
}

const MONEY_OR_FLAG_RE = /(_inr|_usd|_pct|_percent|_count)$|^(has_|is_|claims_)/i;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const engineReads = extractEngineReads();

const indiaSchema = loadFormSchema("layer1_india.html", /const\s+state\s*=\s*\{/, "state");
const usSchema = loadFormSchema("layer1_us.html", /const\s+usState\s*=\s*\{/, "usState");

const indiaLeaves = [];
if (indiaSchema) flattenLeaves(indiaSchema, "", indiaLeaves);
const usLeaves = [];
if (usSchema) flattenLeaves(usSchema, "", usLeaves);

// normalize.js reads both india and us through several different root
// variables (india/us directly, or di/os/ui/it/... aliases assigned partway
// down) — since suffix matching doesn't need to know which, run every
// engine read against BOTH form schemas' leaves combined and report which
// side(s) matched, rather than trying to statically resolve each alias.
const allLeaves = indiaLeaves.concat(usLeaves);
const result = diff(engineReads, allLeaves);

// The static schema literal only captures fields declared in the initial
// object — some real fields (e.g. wages_w2[]) are only ever assigned later
// at runtime (restore-from-localStorage, lazy init on first row add) and
// never appear in the literal at all. Before trusting "unmatched" as a real
// bug candidate, fall back to a plain textual search across both form files
// for the field's last path segment used as an assignment/object-key —
// this reclassifies "declared dynamically, not statically" fields out of
// the high-confidence bucket instead of misreporting them as mismatches.
const indiaHtml = fs.readFileSync(path.join(repoRoot, "layer1_india.html"), "utf8");
const usHtml = fs.readFileSync(path.join(repoRoot, "layer1_us.html"), "utf8");
function seenAsAssignmentAnywhere(fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("[.\\[\"']" + escaped + "[\"'\\]]?\\s*[:=]", "");
  return re.test(indiaHtml) || re.test(usHtml);
}
const trulyUnmatched = [], dynamicallyAssigned = [];
result.unmatchedReads.forEach((r) => {
  const lastSeg = r.path.split(".").pop();
  (seenAsAssignmentAnywhere(lastSeg) ? dynamicallyAssigned : trulyUnmatched).push(r);
});
result.unmatchedReads = trulyUnmatched;
result.dynamicallyAssigned = dynamicallyAssigned;

console.log("=".repeat(78));
console.log("Field coverage diff — engine/normalize.js  vs  layer1_india.html + layer1_us.html");
console.log("=".repeat(78));
console.log(`Engine read paths (safe() calls): ${engineReads.length}`);
console.log(`India form leaf paths: ${indiaLeaves.length}   US form leaf paths: ${usLeaves.length}`);
console.log(`Matched (engine path found somewhere in either form's static schema): ${result.matchedReads.length}`);
console.log(`Reclassified — path absent from the static schema but the field name appears as an assignment elsewhere (dynamically assigned, likely fine): ${result.dynamicallyAssigned.length}`);
console.log(`UNMATCHED (engine reads a path/field name found NOWHERE in either form — check for a rename/typo): ${result.unmatchedReads.length}`);
console.log(`Form leaves with no matching engine read at all: ${result.unreadLeaves.length}`);

if (result.unmatchedReads.length) {
  console.log("\n--- HIGH VALUE: engine reads paths that don't exist anywhere in either form ---");
  console.log("(often a field-name mismatch — the exact bug class found in careExpenses/amtPrefs 13 Jul 2026)");
  result.unmatchedReads.forEach((r) => {
    console.log(`  normalize.js:${r.line} [${r.fn}]  safe(${r.rootVar}, "${r.path}")`);
  });
}

if (result.dynamicallyAssigned.length) {
  console.log(`\n--- LOWER CONFIDENCE: absent from the static default object, but the field name is assigned somewhere (verify manually — a coincidental name match is possible) ---`);
  result.dynamicallyAssigned.slice(0, 40).forEach((r) => {
    console.log(`  normalize.js:${r.line} [${r.fn}]  safe(${r.rootVar}, "${r.path}")`);
  });
  if (result.dynamicallyAssigned.length > 40) console.log(`  ... and ${result.dynamicallyAssigned.length - 40} more`);
}

const unreadMoneyLeaves = result.unreadLeaves.filter((l) => {
  const lastSeg = l.split(".").pop();
  return MONEY_OR_FLAG_RE.test(lastSeg);
});
console.log(`\n--- CANDIDATES: form fields that look like money/flags and have no matching engine read (${unreadMoneyLeaves.length} of ${result.unreadLeaves.length} total unread leaves) ---`);
console.log("(needs human/Claude triage — many of these are legitimately UI-only, display, or compliance metadata, not tax computation inputs)");
unreadMoneyLeaves.slice(0, 80).forEach((l) => console.log("  " + l));
if (unreadMoneyLeaves.length > 80) console.log(`  ... and ${unreadMoneyLeaves.length - 80} more`);

console.log("\n" + "=".repeat(78));
console.log(result.unmatchedReads.length
  ? "Result: engine reads paths absent from both forms — investigate each line above."
  : "Result: every engine read path resolves to something in at least one form.");
process.exit(0);
