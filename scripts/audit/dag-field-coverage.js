#!/usr/bin/env node
/* ============================================================================
 * WISING — DAG field coverage diff tool
 * ----------------------------------------------------------------------------
 * field-coverage.js measures Layer 1 form fields against archive/engine-
 * frozen/normalize.js — the OLD, frozen engine. But monitor-next now defaults
 * to the DAG (prototypes/graph-pilot/, engineSource: "dag"), which is a
 * separate codebase that reads Layer 1 fields directly in ~27 *-nodes.js
 * files via the same safe(obj, "path", dflt) helper, not through
 * normalize.js at all. That means field-coverage.js's number does not
 * describe what the shipping product actually consumes.
 *
 * This script re-runs the identical suffix-match diff methodology, but
 * extracts safe() reads from every prototypes/graph-pilot/*-nodes.js file
 * (deduped by path) instead of the frozen engine's normalize.js, to get the
 * real current coverage number for the live DAG.
 *
 * Usage:
 *   node scripts/audit/dag-field-coverage.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.join(__dirname, "..", "..");
const dagDir = path.join(repoRoot, "prototypes", "graph-pilot");

// ---------------------------------------------------------------------------
// 1. Extract every safe(obj, "path", default) read from every *-nodes.js
//    file under prototypes/graph-pilot/ (the live DAG), deduped by path.
// ---------------------------------------------------------------------------
function extractDagReads() {
  const files = fs.readdirSync(dagDir).filter((f) => /-nodes\.js$/.test(f));
  const seen = new Map(); // path -> {path, files:Set}
  const re = /safe\(\s*[a-zA-Z_][\w.]*\s*,\s*"([^"]+)"/g;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(dagDir, f), "utf8");
    let m;
    while ((m = re.exec(src)) !== null) {
      const p = m[1];
      if (!seen.has(p)) seen.set(p, { path: p, files: new Set() });
      seen.get(p).files.add(f);
    }
  });
  return { reads: Array.from(seen.values()), fileCount: files.length };
}

// ---------------------------------------------------------------------------
// 2. Extract the form's full state schema (identical to field-coverage.js).
// ---------------------------------------------------------------------------
function extractBalancedObjectLiteral(src, declRe) {
  const m = src.match(declRe);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function loadFlatKeysOnly(htmlFile, declRe, varName) {
  const file = path.join(repoRoot, htmlFile);
  const html = fs.readFileSync(file, "utf8");
  const literal = extractBalancedObjectLiteral(html, declRe);
  if (!literal) { console.error(`Could not locate ${varName} object literal in ${htmlFile}`); return null; }
  const keys = [];
  const keyRe = /(?:^|[{,])\s*(\w+)\s*:/g;
  let km;
  while ((km = keyRe.exec(literal)) !== null) keys.push(km[1]);
  const obj = {};
  keys.forEach((k) => { obj[k] = null; });
  return obj;
}

function loadFormSchema(htmlFile, declRe, varName) {
  const file = path.join(repoRoot, htmlFile);
  const html = fs.readFileSync(file, "utf8");
  const literal = extractBalancedObjectLiteral(html, declRe);
  if (!literal) { console.error(`Could not locate ${varName} object literal in ${htmlFile}`); return null; }
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
  if (Array.isArray(obj)) { out.push(prefix); return; }
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) { out.push(prefix); return; }
    keys.forEach((k) => flattenLeaves(obj[k], prefix ? prefix + "." + k : k, out));
    return;
  }
  out.push(prefix);
}

// ---------------------------------------------------------------------------
// 3. Diff (same suffix-match rule as field-coverage.js).
// ---------------------------------------------------------------------------
function pathEndsWith(fullPath, suffix) {
  if (fullPath === suffix) return true;
  return fullPath.length > suffix.length && fullPath.endsWith("." + suffix);
}

const engine = extractDagReads();
const indiaSchema = loadFormSchema("layer1_india.html", /const\s+state\s*=\s*\{/, "state");
const usSchema = loadFormSchema("layer1_us.html", /const\s+usState\s*=\s*\{/, "usState");
const routerSchema = loadFlatKeysOnly("router.html", /var\s+r\s*=\s*\{/, "r");

const indiaLeaves = []; if (indiaSchema) flattenLeaves(indiaSchema, "", indiaLeaves);
const usLeaves = []; if (usSchema) flattenLeaves(usSchema, "", usLeaves);
const routerLeaves = []; if (routerSchema) flattenLeaves(routerSchema, "", routerLeaves);
const allLeaves = indiaLeaves.concat(usLeaves, routerLeaves);

const unmatchedReads = [];
const matchedReads = [];
engine.reads.forEach((r) => {
  const hit = allLeaves.some((leaf) => pathEndsWith(leaf, r.path));
  (hit ? matchedReads : unmatchedReads).push(r);
});

// Same "dynamically assigned" fallback as field-coverage.js: a read whose
// last path segment appears as an assignment/object-key anywhere in the
// three form files, even if not in the static default-object literal.
const indiaHtml = fs.readFileSync(path.join(repoRoot, "layer1_india.html"), "utf8");
const usHtml = fs.readFileSync(path.join(repoRoot, "layer1_us.html"), "utf8");
const routerHtml = fs.readFileSync(path.join(repoRoot, "router.html"), "utf8");
function seenAsAssignmentAnywhere(fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("[.\\[\"']" + escaped + "[\"'\\]]?\\s*[:=]", "");
  return re.test(indiaHtml) || re.test(usHtml) || re.test(routerHtml);
}
const trulyUnmatched = [], dynamicallyAssigned = [];
unmatchedReads.forEach((r) => {
  const lastSeg = r.path.split(".").pop();
  (seenAsAssignmentAnywhere(lastSeg) ? dynamicallyAssigned : trulyUnmatched).push(r);
});

const unreadLeaves = allLeaves.filter((leaf) =>
  !engine.reads.some((r) => pathEndsWith(leaf, r.path))
);

console.log("=".repeat(78));
console.log("DAG field coverage diff — prototypes/graph-pilot/*-nodes.js  vs  the 3 Layer 0/1 forms");
console.log("(the LIVE default engine — see scripts/audit/field-coverage.js for the frozen-engine number)");
console.log("=".repeat(78));
console.log(`*-nodes.js files scanned: ${engine.fileCount}`);
console.log(`Distinct DAG read paths (safe() calls, deduped): ${engine.reads.length}`);
console.log(`Router leaf paths: ${routerLeaves.length}   India form leaf paths: ${indiaLeaves.length}   US form leaf paths: ${usLeaves.length}   Total: ${allLeaves.length}`);
console.log(`Matched (DAG path found in a form): ${matchedReads.length}`);
console.log(`Reclassified (dynamically assigned, likely fine): ${dynamicallyAssigned.length}`);
console.log(`UNMATCHED (DAG reads a path found in NEITHER form — check for rename/typo): ${trulyUnmatched.length}`);
console.log(`Form leaves with NO matching DAG read: ${unreadLeaves.length}  (of ${allLeaves.length} total = ${((allLeaves.length - unreadLeaves.length) / allLeaves.length * 100).toFixed(1)}% covered)`);

if (trulyUnmatched.length) {
  console.log("\n--- DAG reads paths that don't exist anywhere in either form ---");
  trulyUnmatched.forEach((r) => console.log(`  [${Array.from(r.files).join(",")}]  safe(_, "${r.path}")`));
}

const MONEY_OR_FLAG_RE = /(_inr|_usd|_pct|_percent|_count)$|^(has_|is_|claims_)/i;
const KNOWN_OK = [
  { re: /(^|\.)has_[a-z0-9_]+$/i, reason: "module-visibility UI toggle, not a tax data field itself" },
  { re: /(^|\.)is_(wholly_outside_india|poem_in_india|departure_year|us_resident_for_dtaa|available|metro_city|eligible_pwd)$/i, reason: "eligibility/classification flag consumed by the form's own wizard logic, not a raw amount" },
  { re: /(^|\.)exempt_[a-z0-9_]+_inr$/i, reason: "explicitly exempt income (PPF/EPF/NPS/PF withdrawal) — correctly never added to taxable income by design" },
  { re: /^other_sources\.family_pension_standard_deduction_inr$/, reason: "form's own display-only precomputation, engine recomputes independently" },
  { re: /^(metadata|config)\./, reason: "schema/versioning/timestamp bookkeeping, not taxpayer data" },
];
function knownOkReason(leafPath) {
  const hit = KNOWN_OK.find((k) => k.re.test(leafPath));
  return hit ? hit.reason : null;
}
const unreadMoneyLeavesAll = unreadLeaves.filter((l) => MONEY_OR_FLAG_RE.test(l.split(".").pop()));
const unreadMoneyLeaves = unreadMoneyLeavesAll.filter((l) => !knownOkReason(l));
const clearedByAllowlist = unreadMoneyLeavesAll.filter((l) => knownOkReason(l));

console.log(`\n--- CANDIDATES: money/flag fields with NO DAG read (${unreadMoneyLeaves.length} of ${unreadLeaves.length} unread; ${clearedByAllowlist.length} cleared by allowlist) ---`);
unreadMoneyLeaves.forEach((l) => console.log("  " + l));

console.log("\n" + "=".repeat(78));
process.exit(0);
