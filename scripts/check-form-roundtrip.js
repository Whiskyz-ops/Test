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
 *   node scripts/check-form-roundtrip.js [layer1_us.html|layer1_india.html] [--all] [--only=id,id] [--fields]
 *   --all     also run the Python DAG's fuzz corpus and manual cases (~320
 *             more profiles), not just the demo clients
 *   --sections also run the per-section test profiles
 *             (dag_py/tests/fixtures/section-profiles, check-section-profiles.js)
 *   --fields  print which saved fields changed for each failing profile
 *   --dump=D  write {before, after} saved state for each failing profile to D
 *   --twice   compare the 2nd open against the 1st (idempotence) instead of
 *             the 1st open against the original data; also requires the saved
 *             JSON itself to be unchanged
 * Needs Playwright (global) and Chromium at /opt/pw-browsers/chromium or
 * PLAYWRIGHT_CHROMIUM. Exits non-zero on any change not listed in EXPECTED.
 */
"use strict";
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const fs = require("fs");
const ARGS = process.argv.slice(2);
const PAGE = ARGS.find((a) => !a.startsWith("--")) || "layer1_us.html";
const ALL = ARGS.includes("--all");
const FIELDS = ARGS.includes("--fields");
// --twice: open the form twice and compare the two saves. Data that has been
// through the form once must never change on a later open — whatever state
// it started in (this is what catches progressive corruption, e.g. a value
// re-added on every open).
const TWICE = ARGS.includes("--twice");
const ONLY = ((ARGS.find((a) => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);
const DUMP = (ARGS.find((a) => a.startsWith("--dump=")) || "").slice(7);
const WORKERS = 6;
const PORT = 4199;

function jsonCases(dir, prefix) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
    return { id: prefix + f.replace(/\.json$/, ""), state: { router: raw.router || {}, india: raw.india || {}, us: raw.us || {} } };
  });
}

// Leaf-level diff of two saved states, for --fields.
function fieldDiff(a, b, pfx, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const isObj = (v) => v && typeof v === "object";
  if (isObj(a) && isObj(b)) {
    new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => fieldDiff(a[k], b[k], pfx ? pfx + "." + k : k, out));
  } else out.push(pfx + ": " + JSON.stringify(a) + " → " + JSON.stringify(b));
  return out;
}

// Changes that are intended, per form: key "<profile id>" -> reason.
const EXPECTED = {
  "layer1_us.html": {
    // An India-only HUF with no US scope: opening the US form imports its
    // Indian rental into Layer 1 US's foreign-income fields (the form's own
    // India hydration). US tax stays $0; only the US income figure moves.
    sharma_huf: "usIncome only (India hydration into the US form)"
  },
  "layer1_india.html": {
    // Records "no foreign assets" on the India side while the US form holds a
    // 401(k) and US accounts; as an Indian ROR they belong on Schedule FA, and
    // the India form imports them — which resolves the contradiction the
    // engine was flagging.
    dual_resident_h1b: "Schedule FA import resolves the 'no foreign assets' contradiction"
  }
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
  let server = null;
  const startServer = async () => {
    server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 1200));
  };
  await startServer();
  // A long run can outlive the static server; retry, restarting it if needed.
  const nav = async (pg, url) => {
    for (let attempt = 0; ; attempt++) {
      try { return await pg.goto(url); } catch (e) {
        if (attempt >= 3) throw e;
        if (/ERR_CONNECTION_REFUSED/.test(String(e.message)) && server && server.exitCode !== null) await startServer();
        else await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  let failures = 0;
  try {
    const base = "http://localhost:" + PORT + "/";
    const first = await browser.newPage();
    await nav(first, base); await first.waitForTimeout(1500);
    const demoIds = await first.evaluate(() => (window.WISING.PROFILES || []).map((p) => p.id).concat(["__sample"]));
    await first.close();
    let cases = demoIds.map((id) => ({ id, demo: true }));
    if (ARGS.includes("--sections")) cases = cases.concat(jsonCases("dag_py/tests/fixtures/section-profiles", "section:"));
    if (ALL) cases = cases.concat(jsonCases("dag_py/tests/fixtures/golden/fuzz-corpus/profiles", "corpus:"), jsonCases("dag_py/tests/fixtures/manual-cases/profiles", "manual:"));
    if (ONLY.length) cases = cases.filter((c) => ONLY.includes(c.id));

    global.WISING = {};
    process.chdir(path.join(ROOT, "prototypes", "graph-pilot"));
    const dag = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));
    const safe = (st) => { try { return summary(dag.analyze(JSON.parse(JSON.stringify(st)))); } catch (e) { return { threw: String(e.message || e).slice(0, 120) }; } };

    const results = new Array(cases.length);
    let next = 0;
    async function worker() {
      const pg = await browser.newPage();
      pg.on("dialog", (d) => d.dismiss());
      while (next < cases.length) {
        const i = next++, c = cases[i];
        await nav(pg, base);
        await pg.evaluate((c) => {
          localStorage.clear();
          localStorage.setItem("wising_site_unlocked", "true");
          if (c.id === "__sample") {
            const S = window.WISING.SAMPLE;
            localStorage.setItem("wising_router_state", JSON.stringify(S.router));
            localStorage.setItem("wising_layer1_india_state", JSON.stringify(S.india));
            localStorage.setItem("wising_us_state", JSON.stringify(S.us));
          } else if (c.demo) window.WISING.loadProfile(c.id);
          else {
            localStorage.setItem("wising_router_state", JSON.stringify(c.state.router));
            localStorage.setItem("wising_layer1_india_state", JSON.stringify(c.state.india));
            localStorage.setItem("wising_us_state", JSON.stringify(c.state.us));
          }
        }, c);
        const read = () => pg.evaluate(() => ({
          router: JSON.parse(localStorage.getItem("wising_router_state") || "{}"),
          india: JSON.parse(localStorage.getItem("wising_layer1_india_state") || "{}"),
          us: JSON.parse(localStorage.getItem("wising_us_state") || "{}")
        }));
        let before = await read();
        const errs = [];
        const onErr = (e) => errs.push(String(e.message || e).slice(0, 160));
        pg.on("pageerror", onErr);
        await nav(pg, base + PAGE); await pg.waitForTimeout(2200);
        if (TWICE) { before = await read(); await nav(pg, base + PAGE); await pg.waitForTimeout(2200); }
        pg.off("pageerror", onErr);
        const after = await read();
        const a = safe(before), b = safe(after);
        let d;
        if (a.threw || b.threw) d = a.threw && b.threw ? [] : ["engine threw " + (a.threw ? "before: " + a.threw : "after: " + b.threw)];
        else d = diffSummaries(a, b);
        errs.filter((e) => !/tailwind is not defined/.test(e)).forEach((e) => d.push("page error: " + e));
        if (TWICE) {
          // key order doesn't matter; volatile timestamps / ids are ignored
          const canon = (v) => Array.isArray(v) ? v.map(canon) : (v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v);
          const strip = (st) => JSON.stringify(canon(st), (k, v) => (k === "last_updated_at" || k === "created_at" || k === "request_id" ? undefined : v));
          if (strip(before) !== strip(after)) {
            const f = fieldDiff(JSON.parse(strip(before)), JSON.parse(strip(after)), "", []);
            d.push("saved data changed on reopen: " + f.slice(0, 3).join("; ") + (f.length > 3 ? " … +" + (f.length - 3) : ""));
          }
        }
        if (DUMP && d.length) { fs.mkdirSync(DUMP, { recursive: true }); fs.writeFileSync(path.join(DUMP, c.id.replace(/[^\w.-]/g, "_") + ".json"), JSON.stringify({ before, after })); }
        results[i] = { c, d, fields: FIELDS && d.length ? fieldDiff(before, after, "", []) : null };
      }
      await pg.close();
    }
    await Promise.all(Array.from({ length: WORKERS }, worker));
    results.forEach(({ c, d, fields }) => {
      const expected = TWICE ? null : (EXPECTED[PAGE] || {})[c.id];
      if (d.length && !expected) failures++;
      console.log((d.length ? (expected ? "~ " : "✗ ") : "✓ ") + c.id + (d.length ? (expected ? "  (expected: " + expected + ")" : "") + "\n    " + d.join("\n    ") : ""));
      if (fields && !expected) console.log("      fields:\n        " + fields.slice(0, 400).join("\n        ") + (fields.length > 400 ? "\n        … +" + (fields.length - 400) : ""));
    });
    console.log("\n" + results.length + " profile(s) checked");
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("\n" + failures + " unexpected change(s) after opening " + PAGE);
  process.exit(failures ? 1 : 0);
})();
