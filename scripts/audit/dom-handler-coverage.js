#!/usr/bin/env node
/* ============================================================================
 * WISING — DOM handler coverage linter
 * ----------------------------------------------------------------------------
 * Finds data-entry elements (<input>/<select>/<textarea>) in a Layer 1 form
 * that have NO code path from the DOM into the form's own state object —
 * i.e. typing/selecting does nothing, silently. This is the bug class found
 * 13 Jul 2026 in layer1_us.html's "Passive & Other Income" screen: several
 * inputs had no oninput/onchange at all, and no addEventListener wiring
 * existed anywhere else in the file either. See docs/FIELD_COVERAGE_AUDIT.md.
 *
 * This is a heuristic, not a JS interpreter — it flags candidates for review,
 * it does not prove a bug. False positives happen (e.g. a field wired via a
 * batch "save on Next-step click" reader instead of per-keystroke); false
 * negatives happen too (a generic delegated listener that doesn't mention
 * the element's id in the source text won't be detected). Treat the output
 * as a prioritized reading list, not a verdict — the same discipline this
 * repo's own history shows plain grep needs (see FIELD_COVERAGE_AUDIT.md's
 * "Method" section on prior false positives).
 *
 * Usage:
 *   node scripts/audit/dom-handler-coverage.js [file.html ...]
 *   (defaults to router.html, layer1_india.html, and layer1_us.html at the repo root)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["router.html", "layer1_india.html", "layer1_us.html"];

// Element kinds that represent actual user data entry — buttons/hidden
// fields/file-upload triggers are excluded (this repo's uploads are mocked
// per docs/GAP_TRACKER.md IN-20; buttons trigger actions, not data).
const SKIP_INPUT_TYPES = new Set(["button", "submit", "reset", "hidden", "file", "image"]);

function findTags(html, tagName) {
  // Matches <tagName ...> (self-closing or not), across newlines, non-greedy
  // up to the first '>' that isn't inside a quoted attribute value. A full
  // HTML tokenizer would be more correct; this repo's markup is
  // attribute-quote-consistent enough that a simple non-greedy match works
  // in practice (verified against both Layer 1 files with zero mis-splits).
  const re = new RegExp("<" + tagName + "\\b([^>]*?)(/?)>", "gis");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ tag: tagName, attrs: m[1], index: m.index, full: m[0] });
  }
  return out;
}

function getAttr(attrs, name) {
  const re = new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
  const m = attrs.match(re);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3];
}

function hasAttr(attrs, name) {
  return new RegExp("\\b" + name + "\\b", "i").test(attrs);
}

function lineOf(html, index) {
  return html.slice(0, index).split("\n").length;
}

function nearestLabel(html, index) {
  // Look up to ~600 chars before the tag for a <label>...</label> or a
  // block of text likely to be the field's visible caption — best-effort,
  // for human-readable context in the report only.
  const before = html.slice(Math.max(0, index - 600), index);
  const labelMatch = before.match(/<label\b[^>]*>([\s\S]*?)<\/label>\s*$/i);
  if (labelMatch) {
    return labelMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
  }
  return null;
}

function hasIdEventListenerElsewhere(html, id) {
  if (!id) return false;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Direct: getElementById('id').addEventListener(...) / querySelector chain.
  const direct = [
    new RegExp("getElementById\\(['\"]" + escaped + "['\"]\\)\\s*\\.addEventListener", "i"),
    new RegExp("querySelector\\(['\"]#" + escaped + "['\"]\\)\\s*\\.addEventListener", "i"),
  ];
  if (direct.some((re) => re.test(html))) return true;

  // Indirection A: the id is passed as a quoted string argument inside an
  // on*="..." attribute ELSEWHERE in the file (the "custom card" pattern —
  // a checkbox with class="hidden" driven by a wrapping <div
  // onclick="toggleSetupCard('this-id')">, where the checkbox itself has no
  // attributes of its own).
  const indirectHandlerArg = new RegExp("on(?:click|change|input)\\s*=\\s*[\"'][^\"']*['\"]" + escaped + "['\"][^\"']*[\"']", "i");
  if (indirectHandlerArg.test(html)) return true;

  // Indirection B: getElementById('id') is captured (directly or into a
  // variable) and, within the same function body, that value/checked is
  // read on demand by code that persists state — the "pick a value, click
  // a separate Add/Save button" pattern (e.g. addFootprintState() reading a
  // <select> via picker.value then calling saveStateAndSync()). Approximated
  // by requiring a persistence call within 500 chars after the
  // getElementById occurrence — a real function-boundary parse would be
  // more precise, but this repo's functions are short enough in practice
  // for the proximity window to work.
  const getRe = new RegExp("getElementById\\(['\"]" + escaped + "['\"]\\)", "gi");
  let gm;
  while ((gm = getRe.exec(html)) !== null) {
    // Widen the window past 500 chars for this specific check: router.html's
    // saveRouter() builds an entire ~10-field object literal (each field its
    // own getElementById(...).value line) before the single localStorage.
    // setItem() call at the end — the persistence call can be 700-900 chars
    // past the FIRST field's getElementById, well outside the narrower window
    // used for the other layer1-form-specific helper calls below.
    const after = html.slice(gm.index, gm.index + 1200);
    if (/saveStateAndSync\s*\(|updateStateField\s*\(|recalculateDerivedFields\s*\(|localStorage\.setItem\s*\(/.test(after)) return true;
  }
  return false;
}

function findDelegatedListeners(html) {
  // Generic `document.addEventListener('input'/'change', fn)` /
  // `document.body.addEventListener(...)` wiring — informational: report
  // whether it actually writes to state (contains an assignment to
  // state./usState. or calls a known persistence helper) or is purely
  // cosmetic (e.g. currency-formatting-as-you-type), since a cosmetic
  // delegated listener is NOT coverage and would otherwise mask real gaps.
  const re = /document(?:\.body)?\.addEventListener\(\s*['"](input|change)['"]\s*,\s*function\s*\(([^)]*)\)\s*\{/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    // Grab a bounded window of the callback body for a quick persistence check.
    const bodyWindow = html.slice(m.index, m.index + 1500);
    const persists = /\b(state|usState)\s*\[|\b(state|usState)\.\w+[\w.]*\s*=|updateStateField|updateStateFieldNested|saveStateAndSync/.test(bodyWindow);
    out.push({ event: m[1], line: lineOf(html, m.index), persistsState: persists });
  }
  return out;
}

function auditFile(relPath) {
  const filePath = path.join(repoRoot, relPath);
  if (!fs.existsSync(filePath)) {
    console.log("SKIP (not found): " + relPath);
    return null;
  }
  const html = fs.readFileSync(filePath, "utf8");

  const elements = []
    .concat(findTags(html, "input"))
    .concat(findTags(html, "select"))
    .concat(findTags(html, "textarea"));

  const results = { wired: [], unwiredWithId: [], noIdNoInlineHandler: [], skipped: 0 };

  elements.forEach((el) => {
    const type = (getAttr(el.attrs, "type") || (el.tag === "input" ? "text" : el.tag)).toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) { results.skipped++; return; }
    if (hasAttr(el.attrs, "readonly") || hasAttr(el.attrs, "disabled")) { results.skipped++; return; }

    const id = getAttr(el.attrs, "id");
    const hasInline = hasAttr(el.attrs, "oninput") || hasAttr(el.attrs, "onchange") || hasAttr(el.attrs, "onclick");

    if (hasInline) { results.wired.push({ id, line: lineOf(html, el.index) }); return; }

    if (id) {
      if (hasIdEventListenerElsewhere(html, id)) {
        results.wired.push({ id, line: lineOf(html, el.index), via: "addEventListener elsewhere" });
      } else {
        results.unwiredWithId.push({
          id, tag: el.tag, type, line: lineOf(html, el.index),
          label: nearestLabel(html, el.index), snippet: el.full.slice(0, 160)
        });
      }
    } else {
      results.noIdNoInlineHandler.push({
        tag: el.tag, type, line: lineOf(html, el.index),
        label: nearestLabel(html, el.index), snippet: el.full.slice(0, 160)
      });
    }
  });

  const delegated = findDelegatedListeners(html);

  return { relPath, total: elements.length, ...results, delegated };
}

let anyHighConfidence = false;
targets.forEach((t) => {
  const r = auditFile(t);
  if (!r) return;
  console.log("\n" + "=".repeat(78));
  console.log(r.relPath);
  console.log("=".repeat(78));
  console.log(`  data-entry elements found: ${r.total}  (skipped as button/hidden/readonly/disabled: ${r.skipped})`);
  console.log(`  wired (inline handler or addEventListener): ${r.wired.length}`);
  console.log(`  UNWIRED — has an id, no handler found anywhere: ${r.unwiredWithId.length}`);
  console.log(`  no id + no inline handler (template-cloned row, lower confidence): ${r.noIdNoInlineHandler.length}`);

  if (r.delegated.length) {
    console.log(`\n  Delegated document-level listeners found (${r.delegated.length}):`);
    r.delegated.forEach((d) => {
      console.log(`    line ${d.line}: addEventListener('${d.event}', ...) — ${d.persistsState ? "appears to persist state (may explain some 'unwired' hits below — verify manually)" : "does NOT appear to persist state (cosmetic only, e.g. formatting — does not count as coverage)"}`);
    });
  }

  if (r.unwiredWithId.length) {
    anyHighConfidence = true;
    console.log(`\n  --- HIGH CONFIDENCE: unwired inputs (has id="...", zero handler found) ---`);
    r.unwiredWithId.forEach((u) => {
      console.log(`    line ${u.line}  <${u.tag} id="${u.id}" type="${u.type}">${u.label ? "  [label: " + u.label + "]" : ""}`);
    });
  }

  if (r.noIdNoInlineHandler.length) {
    console.log(`\n  --- LOWER CONFIDENCE: no id, no inline handler (check if a "sync" function reads it by class) ---`);
    r.noIdNoInlineHandler.slice(0, 30).forEach((u) => {
      console.log(`    line ${u.line}  <${u.tag} type="${u.type}">${u.label ? "  [label: " + u.label + "]" : ""}`);
    });
    if (r.noIdNoInlineHandler.length > 30) console.log(`    ... and ${r.noIdNoInlineHandler.length - 30} more`);
  }
});

console.log("\n" + "=".repeat(78));
console.log(anyHighConfidence
  ? "Result: HIGH-CONFIDENCE unwired inputs found — read the flagged lines before treating the form as complete."
  : "Result: no high-confidence unwired inputs found. Review the lower-confidence list too — this tool does not prove correctness.");
process.exit(0);
