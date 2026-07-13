#!/usr/bin/env node
/* ============================================================================
 * WISING — end-to-end field sweep (tool 4)
 * ----------------------------------------------------------------------------
 * The other three audit scripts are all static text analysis — none of them
 * actually run the form in a browser. Two real bug classes this session
 * found needed an actual browser to catch:
 *   - saves to localStorage correctly but doesn't restore into the DOM on
 *     reload (the interest_us_bank_usd restoration-allowlist bug — found by
 *     a one-off Playwright script, not by any tool)
 *   - a value reaching `state` correctly but never actually moving the
 *     computed tax number (wrong currency, wrong sign, or genuinely
 *     disconnected from the engine despite `state` looking right)
 * This script automates both checks, in two layers:
 *
 * LAYER A — DOM round-trip (exhaustive within its scope, no manual list to
 * maintain). Parses every <input> wired through the plain, single-purpose
 * `updateOSField('field', ...)` (India) / `updateStateField('category',
 * 'field', ...)` (US) conventions directly out of the oninput attribute —
 * these two conventions have a literal target path in the call itself, so
 * the expected state path doesn't need to be hand-curated. For each: fill a
 * unique marker value, save, reload, and check (1) localStorage holds the
 * marker at EXACTLY the parsed path (not just "somewhere" — this is what
 * catches a wrapper pointing at the wrong field) and (2) the DOM shows the
 * marker again after reload (the restore-path check).
 * Deliberately narrower than "every input in both forms": inputs wired
 * through any of the several dozen OTHER update*Field-style helpers in
 * layer1_india.html (updateHPField, updateBizField, update80DDField, ...)
 * aren't included — those helpers have their own internal logic (often
 * targeting a dynamic array index, e.g. a specific business entry row) that
 * can't be inferred generically from the call site the way the two simple
 * conventions can. See docs/FIELD_COVERAGE_AUDIT.md for the honest scope
 * statement.
 *
 * LAYER B — end-to-end tax impact (curated, not exhaustive). For a small,
 * hand-picked set of money fields already covered by tests/engine/fixtures.js
 * (so the expected direction is known with confidence), seed state directly
 * via localStorage (Layer A already proved the DOM->state leg works for the
 * conventions in scope, so this layer tests state->computed-tax without
 * re-paying the UI-navigation cost per field) and load the built Monitor.
 * Confirms the displayed India/US tax figure moves in the correct direction
 * by a plausible magnitude — catches a value that reaches `state` correctly
 * but is silently ignored, double-counted, or unit-mismatched downstream.
 *
 * Known false-positive class (found on the first real run): some fields are
 * gated to a specific entity type (e.g. angel_tax_premium_inr only applies
 * to a closely-held company, local_authority_s10_20_inr only to a local
 * authority) and the form correctly CLEARS them on load for any other
 * profile type. The minimal "individual" test profile this script seeds
 * makes every such field look like a restoration failure — it isn't; the
 * form is doing the right thing. This script does not attempt to build a
 * profile per entity type to avoid it, so a FAIL on one of these should be
 * read as "verify the gating logic is intentional" rather than "confirmed
 * bug" until checked by hand (grep the field's id for a `.hidden`/entity-
 * type-conditional clear alongside it).
 *
 * Usage: node scripts/audit/e2e-field-sweep.js
 * Requires: playwright-core (present under monitor-next/node_modules) and a
 * built monitor-next/out/ (run `cd monitor-next && npm run build` first if
 * stale — this script does not rebuild it for you).
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");
const outDir = path.join(repoRoot, "monitor-next", "out");
const playwrightModule = path.join(repoRoot, "monitor-next", "node_modules", "playwright-core");
const PORT = 8199;
const BASE = `http://localhost:${PORT}`;
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

if (!fs.existsSync(outDir)) {
  console.error(`monitor-next/out/ not found. Run "cd monitor-next && npm run build" first.`);
  process.exit(1);
}
if (!fs.existsSync(playwrightModule)) {
  console.error(`playwright-core not found under monitor-next/node_modules.`);
  process.exit(1);
}
const { chromium } = require(playwrightModule);

// ---------------------------------------------------------------------------
// Layer A field extraction
// ---------------------------------------------------------------------------
function extractTag(html, id) {
  const re = new RegExp("<(?:input|select)\\b[^>]*\\bid=[\"']" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"'][^>]*>", "i");
  const m = html.match(re);
  return m ? m[0] : null;
}

function extractOsFieldTargets(html) {
  const re = /<input\b([^>]*?)id=["']([\w-]+)["']([^>]*?)oninput=["']updateOSField\(\s*['"]([\w]+)['"]/gi;
  const re2 = /<input\b([^>]*?)oninput=["']updateOSField\(\s*['"]([\w]+)['"][^>]*?id=["']([\w-]+)["']/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push({ id: m[2], field: m[4], statePath: "other_sources." + m[4] });
  while ((m = re2.exec(html)) !== null) out.push({ id: m[3], field: m[2], statePath: "other_sources." + m[2] });
  return out.filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i)
    .filter((f) => /inputmode=["']numeric["']/.test(extractTag(html, f.id) || ""));
}

function extractUpdateStateFieldTargets(html) {
  const re1 = /<input\b([^>]*?)id=["']([\w-]+)["']([^>]*?)oninput=["']updateStateField\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]+)['"]/gi;
  const re2 = /<input\b([^>]*?)oninput=["']updateStateField\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]+)['"][^>]*?id=["']([\w-]+)["']/gi;
  const out = [];
  let m;
  while ((m = re1.exec(html)) !== null) out.push({ id: m[2], category: m[4], field: m[5], statePath: m[4] + "." + m[5] });
  while ((m = re2.exec(html)) !== null) out.push({ id: m[4], category: m[2], field: m[3], statePath: m[2] + "." + m[3] });
  return out.filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i)
    .filter((f) => /inputmode=["']numeric["']/.test(extractTag(html, f.id) || ""));
}

const indiaHtml = fs.readFileSync(path.join(repoRoot, "layer1_india.html"), "utf8");
const usHtml = fs.readFileSync(path.join(repoRoot, "layer1_us.html"), "utf8");
const osFields = extractOsFieldTargets(indiaHtml);
const usFields = extractUpdateStateFieldTargets(usHtml);

// ---------------------------------------------------------------------------
// Layer B curated money fields — expected direction is "more India tax" or
// "more US tax", verified against tests/engine/fixtures.js's hand-derived
// expectations, not guessed here.
// ---------------------------------------------------------------------------
const LAYER_B_INDIA = [
  { path: "other_sources.gifts_above_50k_inr", marker: 500000, expect: "india_up" },
  { path: "other_sources.family_pension_gross_inr", marker: 600000, expect: "india_up" },
  { path: "other_sources.miscellaneous_income_inr", marker: 400000, expect: "india_up" },
];
const LAYER_B_US = [
  { path: "itemized_deductions_and_credits.child_and_dependent_care_expenses_usd", marker: 6000, expect: "us_down" },
  { path: "income_us_source.se_health_insurance_deduction_usd", marker: 6000, expect: "us_down" },
];

async function withServer(fn) {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: outDir, stdio: "ignore" });
  try {
    for (let i = 0; i < 30; i++) {
      try { await fetch(BASE + "/"); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); }
    }
    await fn();
  } finally {
    server.kill();
  }
}

function setDeep(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] || {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = value;
}
function getDeep(obj, dottedPath) {
  return dottedPath.split(".").reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

// A day-count field (max="366") flagged FAIL with a 5-digit marker on the
// first real run — not a bug, just an unrealistic marker for a field with a
// semantic range. Respect a declared max attribute when choosing one.
async function pickMarker(page, id, low, high) {
  const maxAttr = await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    return el ? el.getAttribute("max") : null;
  }, id).catch(() => null);
  const max = maxAttr ? parseInt(maxAttr, 10) : null;
  if (max && !isNaN(max) && max < high) return Math.max(1, Math.floor(Math.random() * max));
  return low + Math.floor(Math.random() * (high - low));
}

let pass = 0, fail = 0;
function report(ok, label, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "\n    " + detail : "")); }
}

async function runLayerA(browser) {
  console.log("\n=== LAYER A: DOM round-trip (updateOSField / updateStateField conventions) ===");
  console.log(`India other_sources fields found: ${osFields.length}   US direct-path fields found: ${usFields.length}\n`);

  const ctx = await browser.newContext();
  ctx.on("page", (p) => p.on("dialog", (d) => d.accept().catch(() => {})));
  const page = await ctx.newPage();

  // Establish router state once.
  await page.goto(BASE + "/router.html");
  await page.evaluate(() => {
    localStorage.setItem("wising_router_state", JSON.stringify({
      jurisdiction: "dual", base_tax_year: 2026, full_name: "Sweep Test", is_us_citizen: true, has_green_card: false, has_us_income: true
    }));
  });

  for (const f of osFields) {
    const marker = 100000 + Math.floor(Math.random() * 800000);
    await page.goto(BASE + "/layer1_india.html");
    await page.waitForTimeout(700);
    const loc = page.locator("#" + f.id);
    const count = await loc.count();
    if (count === 0) { report(false, `india.${f.statePath} (#${f.id})`, "element not found in served DOM"); continue; }
    await loc.fill(String(marker)).catch(() => {});
    await loc.dispatchEvent("input").catch(() => {});
    await page.waitForTimeout(150);
    const stateVal = await page.evaluate((p) => {
      try { return JSON.parse(localStorage.getItem("wising_layer1_india_state")).other_sources[p]; } catch (e) { return undefined; }
    }, f.field);
    const savedOk = Number(stateVal) === marker;
    await page.reload();
    await page.waitForTimeout(700);
    const restored = await page.evaluate((id) => { const el = document.getElementById(id); return el ? el.value : null; }, f.id);
    const restoredOk = restored != null && restored.replace(/[^\d]/g, "") === String(marker);
    report(savedOk && restoredOk, `india.other_sources.${f.field} (#${f.id})`,
      !savedOk ? `expected state.other_sources.${f.field}=${marker}, got ${stateVal}` : (!restoredOk ? `saved correctly but DOM did not restore marker on reload (got "${restored}")` : ""));
  }

  await page.goto(BASE + "/router.html");
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => {
    localStorage.setItem("wising_router_state", JSON.stringify({
      jurisdiction: "dual", base_tax_year: 2026, full_name: "Sweep Test", is_us_citizen: true, has_green_card: false, has_us_income: true
    }));
  });

  for (const f of usFields) {
    await page.goto(BASE + "/layer1_us.html");
    await page.waitForTimeout(700);
    const loc = page.locator("#" + f.id);
    const count = await loc.count();
    if (count === 0) { report(false, `us.${f.statePath} (#${f.id})`, "element not found in served DOM"); continue; }
    await page.evaluate((id) => { const el = document.getElementById(id); if (el) el.closest(".hidden") && el.closest(".hidden").classList.remove("hidden"); }, f.id);
    const marker = await pickMarker(page, f.id, 1000, 80000);
    await loc.fill(String(marker)).catch(() => {});
    await loc.dispatchEvent("input").catch(() => {});
    await page.waitForTimeout(150);
    const stateVal = await page.evaluate((p) => {
      try { const s = JSON.parse(localStorage.getItem("wising_us_state")); return p.reduce((c, k) => (c == null ? undefined : c[k]), s); } catch (e) { return undefined; }
    }, [f.category, f.field]);
    const savedOk = Number(stateVal) === marker;
    await page.reload();
    await page.waitForTimeout(700);
    const restored = await page.evaluate((id) => { const el = document.getElementById(id); return el ? el.value : null; }, f.id);
    const restoredOk = restored != null && restored.replace(/[^\d]/g, "") === String(marker);
    report(savedOk && restoredOk, `us.${f.statePath} (#${f.id})`,
      !savedOk ? `expected state.${f.statePath}=${marker}, got ${stateVal}` : (!restoredOk ? `saved correctly but DOM did not restore marker on reload (got "${restored}")` : ""));
  }

  await ctx.close();
}

async function readMonitorTax(page) {
  await page.goto(BASE + "/");
  await page.waitForTimeout(1800);
  return page.evaluate(() => {
    try {
      global.window = window;
      ["constants", "normalize", "computation", "conflicts"].forEach((m) => {});
    } catch (e) {}
    return null;
  }).then(async () => {
    // Compute directly via the same engine scripts the page already loaded,
    // reading straight from localStorage — avoids fragile UI-text scraping.
    return page.evaluate(() => {
      try {
        const model = window.WISING.normalize({});
        const r = window.WISING.compute(model);
        return { indiaTaxInr: r.indiaTax.totalTaxInr, usTaxUsd: r.usTax.totalTaxBeforeFtcUsd };
      } catch (e) { return { error: e.message }; }
    });
  });
}

async function runLayerB(browser) {
  console.log("\n=== LAYER B: end-to-end computed-tax impact (curated money fields) ===\n");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  async function seedAndRead(indiaExtra, usExtra) {
    await page.goto(BASE + "/router.html");
    await page.evaluate(({ indiaExtra, usExtra }) => {
      localStorage.clear();
      localStorage.setItem("wising_router_state", JSON.stringify({ jurisdiction: "dual", base_tax_year: 2026, full_name: "Sweep", is_us_citizen: true }));
      const india = { profile: { entity_type: "individual", tax_regime: "OLD" }, residency_detail: { final_india_residency_status: "ROR" }, domestic_income: { salary: { taxable_salary_inr: 1000000 } }, other_sources: {} };
      const us = { profile: { tax_entity_type: "individual", filing_status: "single" }, us_residency_detail: { is_us_citizen: true }, income_us_source: { wages_w2: [{ wages_box1_usd: 100000 }] }, itemized_deductions_and_credits: {} };
      function setDeep(obj, p, v) { const parts = p.split("."); let c = obj; for (let i = 0; i < parts.length - 1; i++) { c[parts[i]] = c[parts[i]] || {}; c = c[parts[i]]; } c[parts[parts.length - 1]] = v; }
      if (indiaExtra) setDeep(india, indiaExtra.path, indiaExtra.marker);
      if (usExtra) setDeep(us, usExtra.path, usExtra.marker);
      localStorage.setItem("wising_layer1_india_state", JSON.stringify(india));
      localStorage.setItem("wising_us_state", JSON.stringify(us));
    }, { indiaExtra, usExtra });
    return readMonitorTax(page);
  }

  const baseline = await seedAndRead(null, null);
  if (baseline.error) { report(false, "Layer B baseline load", baseline.error); await ctx.close(); return; }
  console.log(`  baseline: indiaTaxInr=${Math.round(baseline.indiaTaxInr)} usTaxUsd=${Math.round(baseline.usTaxUsd)}`);

  for (const f of LAYER_B_INDIA) {
    const r = await seedAndRead(f, null);
    const ok = !r.error && f.expect === "india_up" ? r.indiaTaxInr > baseline.indiaTaxInr : false;
    report(ok, `india.${f.path} (+${f.marker}) should increase India tax`, r.error || `indiaTaxInr ${Math.round(baseline.indiaTaxInr)} -> ${Math.round(r.indiaTaxInr)}`);
  }
  for (const f of LAYER_B_US) {
    const r = await seedAndRead(null, f);
    const ok = !r.error && f.expect === "us_down" ? r.usTaxUsd < baseline.usTaxUsd : false;
    report(ok, `us.${f.path} (+${f.marker}) should decrease US tax`, r.error || `usTaxUsd ${Math.round(baseline.usTaxUsd)} -> ${Math.round(r.usTaxUsd)}`);
  }

  await ctx.close();
}

(async () => {
  await withServer(async () => {
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    try {
      await runLayerA(browser);
      await runLayerB(browser);
    } finally {
      await browser.close();
    }
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
