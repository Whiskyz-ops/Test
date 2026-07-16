#!/usr/bin/env node
/* ============================================================================
 * WISING — engine-output -> frontend coverage checker
 * ----------------------------------------------------------------------------
 * The other audit scripts confirm a Layer 1 field reaches engine/normalize.js.
 * That's necessary but not sufficient: normalize.js's output still has to
 * flow through WISING.compute() / detectConflicts() / buildFtcReport() /
 * buildTaxComputation() / buildReturnFormDetermination() / WISING.monitor()
 * (conflict detection, residency, FTC reconciliation, tax computation, form
 * detection, holdings/limits, business-entity tax — the actual output
 * modules), and THAT output still has to be read by the monitor-next
 * frontend for a field to have any visible effect at all. A key computed by
 * the engine but never referenced by any frontend component is exactly the
 * same class of dead-end as a form field the engine never reads — it just
 * lives one hop further downstream.
 *
 * Method: WISING.analyze() (engine/conflicts.js) is the actual root — it
 * calls normalize() then compute()/detectConflicts()/buildDocuments()/
 * buildFtcReport()/buildTaxComputation()/buildWithholdingSummary()/
 * buildScopeNotes()/buildReturnFormDetermination()/monitor(), and returns
 * one combined object. Starting from analyze()'s own return statement, this
 * statically expands every key: for a nested object literal, recurse into
 * it directly; for a bare identifier or function call, resolve it to
 * whichever local function produced it (one function-call hop, e.g.
 * `documents: documents` -> `var documents = buildDocuments(...)` ->
 * buildDocuments()'s own return shape) and recurse into THAT function's
 * return statement(s) instead, up to a fixed depth. This walks the real
 * call graph instead of guessing from variable names.
 *
 * Every dotted path produced this way is then checked against monitor-next's
 * frontend files (components/*.jsx, app/*.jsx, lib/*.js) for a literal
 * `.lastSegment` property-access reference anywhere. A path with zero
 * matches means: the engine computed this, but nothing in the UI ever reads
 * it — computed, but never actually shown.
 *
 * This is a heuristic like this repo's other audit scripts: matching on the
 * final path SEGMENT rather than the full dotted path avoids needing a real
 * type-aware property-access resolver, at the cost of some false negatives
 * for generic segment names (e.g. "status", "total") that coincidentally
 * appear elsewhere in the frontend for an unrelated reason. Treat misses as
 * a prioritized reading list, not proof nothing reads them.
 *
 * Usage:
 *   node scripts/audit/engine-output-frontend-coverage.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const MAX_DEPTH = 6;

function findMatchingBrace(src, openPos) {
  let depth = 0;
  for (let i = openPos; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function extractFunctionBodies(files) {
  const bodies = new Map(); // name -> body text (first definition wins if duplicated)
  files.forEach((file) => {
    const p = path.join(repoRoot, "engine", file);
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, "utf8");
    const re = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (bodies.has(m[1])) continue;
      const braceStart = m.index + m[0].length - 1;
      const braceEnd = findMatchingBrace(src, braceStart);
      if (braceEnd === -1) continue;
      bodies.set(m[1], src.slice(braceStart, braceEnd + 1));
    }
  });
  return bodies;
}

// Split the inside of an object literal into top-level comma-separated
// segments, respecting nested {}/()/[]] and quoted strings — a minimal
// hand-rolled parser since these return objects are too dynamic (computed
// values, function calls, ternaries) for a JSON-style parser or vm-eval.
function splitTopLevel(text) {
  const segments = [];
  let depth = 0, cur = "", inStr = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      cur += c;
      if (c === inStr && text[i - 1] !== "\\") inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; cur += c; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    if (c === "}" || c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { segments.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) segments.push(cur);
  return segments;
}

function findAllReturnObjectLiterals(body) {
  const literals = [];
  const re = /return\s*\{/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const braceStart = m.index + m[0].length - 1;
    const braceEnd = findMatchingBrace(body, braceStart);
    if (braceEnd === -1) continue;
    literals.push(body.slice(braceStart, braceEnd + 1));
  }
  return literals;
}

function resolveVariableSource(body, varName) {
  const re = new RegExp("\\bvar\\s+" + varName + "\\s*=\\s*([^;]+);");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function baseCallName(expr) {
  const m = expr.match(/^([\w.]+)\s*\(/);
  if (!m) return null;
  const parts = m[1].split(".");
  return parts[parts.length - 1];
}

const allPaths = new Set(); // every dotted path the engine's output actually produces
const visitedCalls = new Set(); // (funcName@depth-path) guard against infinite mutual recursion

function walkObjectLiteral(literalText, functionBodies, curBody, prefix, depth, out) {
  if (depth > MAX_DEPTH) return;
  const inner = literalText.trim().replace(/^\{/, "").replace(/\}$/, "");
  const segments = splitTopLevel(inner);
  segments.forEach((seg) => {
    const trimmed = seg.trim();
    if (!trimmed || trimmed.startsWith("...")) return;
    const kv = trimmed.match(/^['"]?([\w$]+)['"]?\s*:\s*([\s\S]*)$/);
    let key, valueExpr;
    if (kv) { key = kv[1]; valueExpr = kv[2].trim(); }
    else if (/^[\w$]+$/.test(trimmed)) { key = trimmed; valueExpr = trimmed; } // shorthand { foo }
    else return; // can't parse this segment (spread, computed key, etc.) — skip gracefully

    const fullPath = prefix ? prefix + "." + key : key;
    out.add(fullPath);

    resolveAndRecurse(valueExpr, functionBodies, curBody, fullPath, depth, out);
  });
}

function resolveAndRecurse(valueExpr, functionBodies, curBody, fullPath, depth, out) {
  const v = valueExpr.trim();
  if (v.startsWith("{")) {
    const end = findMatchingBrace(v, 0);
    if (end !== -1) walkObjectLiteral(v.slice(0, end + 1), functionBodies, curBody, fullPath, depth + 1, out);
    return;
  }
  // Direct or namespaced function call: computeIndiaTax(model) / WISING.compute(model)
  const callName = baseCallName(v);
  if (callName && functionBodies.has(callName)) {
    const guardKey = callName + "@" + fullPath;
    if (visitedCalls.has(guardKey)) return;
    visitedCalls.add(guardKey);
    const callee = functionBodies.get(callName);
    findAllReturnObjectLiterals(callee).forEach((lit) => walkObjectLiteral(lit, functionBodies, callee, fullPath, depth + 1, out));
    return;
  }
  // Bare identifier: look for `var NAME = EXPR;` earlier in the CURRENT function body.
  if (/^[A-Za-z_]\w*$/.test(v)) {
    const resolved = resolveVariableSource(curBody, v);
    if (resolved && resolved !== v) resolveAndRecurse(resolved, functionBodies, curBody, fullPath, depth, out);
    return;
  }
  // Anything else (ternary, arithmetic, array literal, template string, etc.) — leaf, stop here.
}

function extractFrontendSources() {
  const dirs = [
    path.join(repoRoot, "monitor-next", "components"),
    path.join(repoRoot, "monitor-next", "app"),
    path.join(repoRoot, "monitor-next", "lib"),
  ];
  let combined = "";
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name)) {
        combined += fs.readFileSync(path.join(dir, entry.name), "utf8") + "\n";
      }
    });
  });
  return combined;
}

function main() {
  const functionBodies = extractFunctionBodies(["computation.js", "conflicts.js", "monitoring.js"]);
  if (!functionBodies.has("analyze")) {
    console.error("Could not find WISING.analyze()'s function body — aborting.");
    process.exit(2);
  }
  const analyzeBody = functionBodies.get("analyze");
  findAllReturnObjectLiterals(analyzeBody).forEach((lit) =>
    walkObjectLiteral(lit, functionBodies, analyzeBody, "", 0, allPaths));

  const frontendSrc = extractFrontendSources();

  const results = [...allPaths].map((p) => {
    const lastSeg = p.split(".").pop();
    const re = new RegExp("[.?]" + lastSeg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    return { path: p, referenced: re.test(frontendSrc) };
  });

  const missing = results.filter((r) => !r.referenced).sort((a, b) => a.path.localeCompare(b.path));
  const found = results.filter((r) => r.referenced);
  // `computed.*` is compute()'s raw internal result — analyze() exposes it
  // in full, but most of it is meant to be consumed by the purpose-built
  // presentation functions (buildFtcReport, buildTaxComputation, etc.),
  // re-shaped, and read from THEIR output instead — not read a second time
  // directly off `computed`. A miss there is expected far more often than a
  // miss in the presentation-layer keys those functions actually produce,
  // so they're reported as two separate, differently-weighted buckets
  // rather than one flat list where the signal drowns in expected noise.
  const missingRaw = missing.filter((r) => r.path === "computed" || r.path.startsWith("computed."));
  const missingPresentation = missing.filter((r) => r.path !== "computed" && !r.path.startsWith("computed."));

  console.log("=".repeat(78));
  console.log("Engine-output -> frontend coverage (WISING.analyze() result tree)");
  console.log("=".repeat(78));
  console.log(`Total output paths discovered (walking analyze() -> compute()/detectConflicts()/build*()/monitor()): ${allPaths.size}`);
  console.log(`Referenced somewhere in monitor-next/{components,app,lib}: ${found.length}`);
  console.log(`NEVER referenced: ${missing.length}  (${missingRaw.length} under raw computed.*, ${missingPresentation.length} in the presentation layer)`);

  if (missingPresentation.length) {
    console.log("\n--- HIGHER VALUE: presentation-layer keys (summary/taxComputation/withholding/documents/");
    console.log("    scopeNotes/returnForms/findings/monitoring/ftcReport) with no frontend reference ---");
    console.log("    (these are purpose-built for display — a miss here is a more meaningful candidate)");
    missingPresentation.forEach((r) => console.log(`  ${r.path}`));
  }
  if (missingRaw.length) {
    console.log("\n--- LOWER VALUE: raw computed.* internals with no DIRECT frontend reference ---");
    console.log("    (expected for most of these — they're consumed by the build*() functions above,");
    console.log("     re-shaped, and read from THEIR output instead of a second time off `computed`");
    console.log("     directly; only worth checking if the presentation-layer field that's supposed");
    console.log("     to carry this number is ALSO missing above, or looks suspiciously absent)");
    missingRaw.forEach((r) => console.log(`  ${r.path}`));
  }

  console.log("\nTreat misses as a prioritized reading list, not proof of a dead value — a generic");
  console.log("final segment name (e.g. \"status\", \"total\") can be read under a different");
  console.log("variable name in ways this text-matching approach won't catch.");
}

main();
