#!/usr/bin/env node
/* ============================================================================
 * WISING — dropdown option-value engine-reference checker
 * ----------------------------------------------------------------------------
 * field-coverage.js and array-item-coverage.js confirm a FIELD reaches the
 * engine (the state path/key exists on both sides). Neither one checks
 * whether every CHOICE within that field actually does something once it
 * gets there. A <select> can be fully "wired" by that definition — its value
 * reaches state, state reaches the engine — while half its <option> values
 * are silently treated as an unhandled default, because nothing in the
 * engine ever branches on that specific string. Picking that option is then
 * a condition with zero legal/tax effect, indistinguishable in the UI from
 * one that works.
 *
 * Method: extract every <option value="X"> inside every <select> in each
 * Layer 0/1 form, then check whether X appears as a quoted string literal
 * anywhere in the engine's actual computation files (not sample-data.js/
 * profiles.js — those are demo-data GENERATORS that produce the same shape
 * the real form does; them containing a value proves nothing about whether
 * the engine treats it differently). Values too generic to be meaningful
 * signatures (true/false/empty/currency codes/bare numbers) are filtered out
 * — they're expected to appear everywhere and would just be noise.
 *
 * This is a heuristic, same discipline as this repo's other audit scripts:
 * a hit doesn't prove the engine's TREATMENT of the value is correct per the
 * actual tax law, only that some code path acknowledges it exists. A miss is
 * a strong, actionable signal — treat it as a prioritized reading list.
 *
 * Usage:
 *   node scripts/audit/option-value-coverage.js [file1.html file2.html ...]
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const resolveEngineFile = require("../engine-frozen.js").resolveEngineFile;
const DEFAULT_FORMS = ["router.html", "layer1_india.html", "layer1_us.html"];
const ENGINE_FILES = ["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js"];

const GENERIC_VALUES = new Set([
  "", "true", "false", "null", "undefined", "yes", "no", "0", "1", "none", "other",
  "INR", "USD", "EUR", "GBP", "individual", "select", "custom",
]);

function isMeaningfulValue(v) {
  if (GENERIC_VALUES.has(v)) return false;
  if (/^\d+(\.\d+)?$/.test(v)) return false; // bare numbers (e.g. year values) — too generic/noisy
  if (v.length < 3) return false;
  if (v.includes("${") || v.includes("<%")) return false; // unresolved template-literal placeholder, not a real static value
  return true;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A value can reach the engine as a quoted string literal ("value"), as part
// of a longer dotted PATH string ("carry_forward_losses.business_loss_cf" —
// normalize.js's own safe(obj,"path") convention), or as a bare, UNQUOTED
// object-literal key (building_residential: 0.05, a real rate-table pattern
// in this codebase). Requiring an exact ["value"] match misses the second
// and third forms entirely — false positives that would drown out the real
// findings. This checks for the value bordered by any of quote/dot/brace/
// comma/whitespace on both sides, which covers all three forms while still
// requiring the value to appear as a distinct token, not a coincidental
// substring of something longer.
function referencedInEngine(value, engineSrc) {
  const re = new RegExp(`(^|["'.,{(\\s])${escapeRegex(value)}($|["'.:,)}\\s])`);
  return re.test(engineSrc);
}

function extractSelectsWithOptions(html) {
  const selects = [];
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
  let m;
  while ((m = selectRe.exec(html)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/);
    const classMatch = attrs.match(/\bclass=["']([^"']+)["']/);
    const label = idMatch ? `#${idMatch[1]}` : (classMatch ? `.${classMatch[1].split(/\s+/)[0]}` : "(anonymous select)");
    const options = [];
    const optRe = /<option\b[^>]*\bvalue=["']([^"']*)["']/g;
    let om;
    while ((om = optRe.exec(body)) !== null) options.push(om[1]);
    selects.push({ label, options, line: html.slice(0, m.index).split("\n").length });
  }
  return selects;
}

function loadEngineSource() {
  return ENGINE_FILES
    .map((f) => {
      const p = resolveEngineFile(f);
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    })
    .join("\n");
}

function main() {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FORMS;
  const engineSrc = loadEngineSource();

  let totalMissing = 0;
  for (const file of files) {
    const filePath = path.join(repoRoot, file);
    if (!fs.existsSync(filePath)) {
      console.log(`\n${file}: not found, skipping.`);
      continue;
    }
    const html = fs.readFileSync(filePath, "utf8");
    const selects = extractSelectsWithOptions(html);

    console.log(`\n${"=".repeat(78)}\n${file}\n${"=".repeat(78)}`);
    console.log(`<select> elements found: ${selects.length}`);

    let fileMissing = 0;
    for (const sel of selects) {
      const meaningful = sel.options.filter(isMeaningfulValue);
      const missing = meaningful.filter((v) => !referencedInEngine(v, engineSrc));
      if (missing.length) {
        fileMissing += missing.length;
        console.log(`\n  line ${sel.line}  ${sel.label}  (${sel.options.length} option(s), ${missing.length} never referenced in engine/*.js)`);
        missing.forEach((v) => console.log(`      "${v}"`));
      }
    }
    if (fileMissing === 0) {
      console.log(`\n  Every meaningful option value in this file is referenced somewhere in engine/{${ENGINE_FILES.join(",")}}.`);
    }
    totalMissing += fileMissing;
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`Total option values with zero engine reference: ${totalMissing}`);
  console.log(`Treat each as a candidate: verify whether picking it should change the computed`);
  console.log(`result and, if so, find (or add) the engine branch that's supposed to read it.`);
}

main();
