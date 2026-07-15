#!/usr/bin/env node
/* ============================================================================
 * WISING — wizard step reachability checker
 * ----------------------------------------------------------------------------
 * Every Layer 1 form is a multi-step wizard (`switchStep('step-X')`, panels
 * `id="panel-step-X"`, sidebar buttons `id="btn-step-X"`). A step whose panel
 * exists but that nothing actually navigates to is dead: its fields can hold
 * data (if reachable some other way, e.g. a demo profile writing straight
 * into state) but a real user filling the form top-to-bottom can never see
 * or edit them. This exact bug class is already on record in this repo
 * (LAYER1_INDIA_FIELD_CHANGES.md's "Back/Next button chain" note: several
 * panels' Back/Next targets pointed at the wrong step or a step reordered
 * out from under them, leaving Deductions/Credits/Output unreachable via the
 * linear chain — reachable only because the sidebar tabs still worked).
 * This script checks BOTH paths so a break in either surfaces on its own,
 * not just the case where both break at once.
 *
 * Method (static text analysis, not a DOM walk):
 *   1. Collect every panel that exists: id="panel-step-X".
 *   2. Collect every sidebar entry point: id="btn-step-X", noting whether its
 *      class list starts with "hidden" (conditionally revealed — can't tell
 *      from statics alone whether it ever gets unhidden, so these are
 *      reported separately, not treated as proof of reachability).
 *   3. Resolve what each onclick="..." attribute actually navigates to. Many
 *      Next/Back buttons don't call switchStep() directly — they call a
 *      wrapper (e.g. onclick="confirmIntakeAndProceed()") that calls
 *      switchStep() inside its own function body, physically located in the
 *      <script> block far below every panel. A naive "nearest preceding
 *      panel-marker" position heuristic would misattribute every one of
 *      these to whatever panel happens to be last before the <script> block
 *      — this resolves one level of function-call indirection first
 *      (onclick="fn()" -> fn's body -> switchStep(...) or a further callee)
 *      so the source panel is the one the BUTTON is actually in, not the one
 *      nearest the function DEFINITION.
 *   4. Build the Back/Next chain graph from resolved (sourcePanel -> target)
 *      edges, BFS it from the wizard's first panel, and report: dead
 *      switchStep() targets with no matching panel, panels unreached by the
 *      chain, and panels with no sidebar entry point.
 *
 * Usage:
 *   node scripts/audit/step-reachability.js [layer1_india.html layer1_us.html ...]
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["layer1_india.html", "layer1_us.html"];

function findMatchingBrace(src, openBracePos) {
  let depth = 0;
  for (let i = openBracePos; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Every top-level `function NAME(...) { ... }` body, by name.
function extractFunctionBodies(html) {
  const bodies = new Map();
  const re = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const braceStart = m.index + m[0].length - 1;
    const braceEnd = findMatchingBrace(html, braceStart);
    if (braceEnd === -1) continue;
    bodies.set(m[1], html.slice(braceStart, braceEnd + 1));
  }
  return bodies;
}

function literalStepTargets(text) {
  const out = new Set();
  const re = /switchStep\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const argExpr = m[1];
    const litRe = /['"](step-[\w-]+)['"]/g;
    let lm;
    while ((lm = litRe.exec(argExpr)) !== null) out.add(lm[1]);
  }
  return out;
}

// Resolve what calling `expr` (an onclick body, or a function body) ultimately
// navigates to, following ONE level of named-function indirection.
function resolveTargets(expr, functionBodies) {
  const direct = literalStepTargets(expr);
  const calleeRe = /\b(\w+)\s*\(/g;
  let m;
  while ((m = calleeRe.exec(expr)) !== null) {
    const name = m[1];
    if (name === "switchStep") continue;
    const body = functionBodies.get(name);
    if (body) literalStepTargets(body).forEach((t) => direct.add(t));
  }
  return direct;
}

function analyze(file) {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    console.log(`\n${file}: not found, skipping.`);
    return;
  }
  const html = fs.readFileSync(filePath, "utf8");
  const functionBodies = extractFunctionBodies(html);

  const panelIds = new Set();
  const panelPositions = [];
  const panelRe = /id=["']panel-(step-[\w-]+)["']/g;
  let m;
  while ((m = panelRe.exec(html)) !== null) {
    panelIds.add(m[1]);
    panelPositions.push({ pos: m.index, id: m[1] });
  }

  const sidebarButtons = new Map();
  const btnRe = /<button[^>]*\bid=["']btn-(step-[\w-]+)["'][^>]*>/g;
  while ((m = btnRe.exec(html)) !== null) {
    const tag = m[0];
    const classMatch = tag.match(/class=["']([^"']*)["']/);
    const hiddenByDefault = !!(classMatch && /\bhidden\b/.test(classMatch[1]));
    sidebarButtons.set(m[1], { hiddenByDefault });
  }

  function nearestPrecedingPanel(pos) {
    let found = null;
    for (const p of panelPositions) {
      if (p.pos <= pos) found = p.id; else break;
    }
    return found;
  }

  // Only onclick="..." attributes are reliably positioned inside their real
  // source panel — resolve each one (following one hop of function-call
  // indirection) instead of scanning switchStep() calls file-wide by position.
  const edges = [];
  const allTargets = new Set();
  // Backreference (\1) so the closing delimiter must match whichever quote
  // character opened the attribute — onclick="switchStep('step-x')" uses
  // double quotes around single-quoted JS, and a delimiter-agnostic
  // [^"']* would truncate the capture at that FIRST inner single quote.
  const onclickRe = /onclick=(["'])((?:(?!\1).)*)\1/g;
  while ((m = onclickRe.exec(html)) !== null) {
    const srcPanel = nearestPrecedingPanel(m.index);
    if (!srcPanel) continue;
    const targets = resolveTargets(m[2], functionBodies);
    targets.forEach((t) => { allTargets.add(t); edges.push({ from: srcPanel, to: t }); });
  }

  console.log(`\n${"=".repeat(78)}\n${file}\n${"=".repeat(78)}`);
  console.log(`Panels found: ${panelIds.size}   Sidebar entry points: ${sidebarButtons.size}   Resolved navigation edges: ${edges.length}`);

  const deadLinks = [...allTargets].filter((t) => !panelIds.has(t));
  if (deadLinks.length) {
    console.log(`\n--- HIGH CONFIDENCE: navigation targets with no matching panel (typo / stale rename) ---`);
    deadLinks.forEach((t) => console.log(`  ${t}`));
  }

  const entry = panelPositions.length ? panelPositions[0].id : null;
  const adj = new Map();
  edges.forEach((e) => {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
  });
  const reachableViaChain = new Set();
  if (entry) {
    const queue = [entry];
    reachableViaChain.add(entry);
    while (queue.length) {
      const cur = queue.shift();
      for (const next of (adj.get(cur) || [])) {
        if (panelIds.has(next) && !reachableViaChain.has(next)) {
          reachableViaChain.add(next);
          queue.push(next);
        }
      }
    }
  }

  const orphaned = [];
  const sidebarOnly = [];
  const chainOnly = [];
  for (const id of panelIds) {
    const inChain = reachableViaChain.has(id);
    const sidebarInfo = sidebarButtons.get(id);
    const hasVisibleSidebar = sidebarInfo && !sidebarInfo.hiddenByDefault;
    const hasConditionalSidebar = sidebarInfo && sidebarInfo.hiddenByDefault;
    if (!inChain && !hasVisibleSidebar && !hasConditionalSidebar) orphaned.push(id);
    else if (!inChain && (hasVisibleSidebar || hasConditionalSidebar)) sidebarOnly.push({ id, hasVisibleSidebar });
    else if (inChain && !sidebarInfo) chainOnly.push(id);
  }

  if (orphaned.length) {
    console.log(`\n--- HIGH CONFIDENCE: orphaned panels (no chain edge points here, AND no sidebar button at all) ---`);
    orphaned.forEach((id) => console.log(`  ${id}  — unreachable by any means found in this file`));
  }
  if (sidebarOnly.length) {
    console.log(`\n--- MEDIUM CONFIDENCE: reachable only via sidebar, not via the linear Next/Back chain ---`);
    sidebarOnly.forEach(({ id, hasVisibleSidebar }) =>
      console.log(`  ${id}  — sidebar button is ${hasVisibleSidebar ? "visible by default" : "conditionally hidden (verify what unhides it)"}; a user following Next/Back in order never lands here`));
  }
  if (chainOnly.length) {
    console.log(`\n--- LOW CONFIDENCE: reachable via the chain but has no sidebar button at all ---`);
    chainOnly.forEach((id) => console.log(`  ${id}  — fine if intentionally chain-only, otherwise a dead end for sidebar-based navigation`));
  }
  if (!deadLinks.length && !orphaned.length && !sidebarOnly.length && !chainOnly.length) {
    console.log(`\nAll panels reachable via both the Back/Next chain and a sidebar entry point. No dead links.`);
  }
}

files.forEach(analyze);
