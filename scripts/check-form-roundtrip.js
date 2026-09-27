#!/usr/bin/env node
/*
 * Layer 1 form round-trip check: every demo profile is loaded, the given
 * intake form is opened (which re-saves its section of the client's data
 * the way the form stores it), and the engine's results before and after
 * are compared. A form that drops or rewrites fields it doesn't understand
 * shows up here as a changed tax figure, finding, required document or
 * reporting-limit value.
 *
 * Usage (after `cd monitor-next && npm run build`):
 *   node scripts/check-form-roundtrip.js [layer1_us.html|layer1_india.html]
 * Needs Playwright (global) and Chromium at /opt/pw-browsers/chromium or
 * PLAYWRIGHT_CHROMIUM. Exits non-zero on any change not listed in EXPECTED.
 */
"use strict";
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PAGE = process.argv[2] || "layer1_us.html";
const PORT = 4199;

// Changes that are intended, per form: key "<profile id>" -> reason.
const EXPECTED = {
  "layer1_us.html": {
    // An India-only HUF with no US scope: opening the US form imports its
    // Indian rental into Layer 1 US's foreign-income fields (the form's own
    // India hydration). US tax stays $0; only the US income figure moves.
    sharma_huf: "usIncome only (India hydration into the US form)"
  },
  "layer1_india.html": {}
};

function loadPlaywright() {
  try { return require("playwright"); } catch (e) {
    return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}

function summary(r) {
  const c = r.computed;
  return {
    indiaTax: Math.round(c.indiaTax.totalTaxInr),
    usTax: Math.round(c.usTax.totalTaxBeforeFtcUsd || c.usTax.totalTaxUsd || 0),
    usIncome: Math.round(r.model.income.us.total ? r.model.income.us.total.usd : 0),
    findings: r.findings.map((f) => f.id).sort(),
    docs: (r.documents || []).filter((d) => d.required).map((d) => d.id).sort(),
    limits: (c.limits || []).map((g) => g.id + ":" + Math.round(g.value))
  };
}

function diffSummaries(a, b) {
  const out = [];
  ["indiaTax", "usTax", "usIncome"].forEach((k) => { if (a[k] !== b[k]) out.push(k + " " + a[k] + " → " + b[k]); });
  ["findings", "docs"].forEach((k) => {
    const lost = a[k].filter((x) => !b[k].includes(x)), gained = b[k].filter((x) => !a[k].includes(x));
    if (lost.length || gained.length) out.push(k + " -" + JSON.stringify(lost) + " +" + JSON.stringify(gained));
  });
  if (JSON.stringify(a.limits) !== JSON.stringify(b.limits)) out.push("limits " + JSON.stringify(a.limits) + " → " + JSON.stringify(b.limits));
  return out;
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  let failures = 0;
  try {
    const pg = await browser.newPage();
    pg.on("dialog", (d) => d.dismiss());
    const base = "http://localhost:" + PORT + "/";
    await pg.goto(base); await pg.waitForTimeout(1500);
    const ids = await pg.evaluate(() => (window.WISING.PROFILES || []).map((p) => p.id).concat(["__sample"]));

    global.WISING = {};
    process.chdir(path.join(ROOT, "prototypes", "graph-pilot"));
    const dag = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));

    for (const id of ids) {
      await pg.goto(base);
      await pg.evaluate((id) => {
        localStorage.clear();
        localStorage.setItem("wising_site_unlocked", "true");
        if (id === "__sample") {
          const S = window.WISING.SAMPLE;
          localStorage.setItem("wising_router_state", JSON.stringify(S.router));
          localStorage.setItem("wising_layer1_india_state", JSON.stringify(S.india));
          localStorage.setItem("wising_us_state", JSON.stringify(S.us));
        } else window.WISING.loadProfile(id);
      }, id);
      const read = () => pg.evaluate(() => ({
        router: JSON.parse(localStorage.getItem("wising_router_state") || "{}"),
        india: JSON.parse(localStorage.getItem("wising_layer1_india_state") || "{}"),
        us: JSON.parse(localStorage.getItem("wising_us_state") || "{}")
      }));
      const before = await read();
      await pg.goto(base + PAGE); await pg.waitForTimeout(2500);
      const after = await read();
      const d = diffSummaries(summary(dag.analyze(before)), summary(dag.analyze(after)));
      const expected = (EXPECTED[PAGE] || {})[id];
      if (d.length && !expected) failures++;
      console.log((d.length ? (expected ? "~ " : "✗ ") : "✓ ") + id + (d.length ? (expected ? "  (expected: " + expected + ")" : "") + "\n    " + d.join("\n    ") : ""));
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("\n" + failures + " unexpected change(s) after opening " + PAGE);
  process.exit(failures ? 1 : 0);
})();
