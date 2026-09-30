/*
 * Built-in example household (Rohan & Priya Mehta) check: is everything the
 * Monitor and engine use for them something a user can see and change in
 * the Layer 0/1 forms?
 *
 * In a fresh browser: let the site add the two clients, open router.html,
 * layer1_india.html and layer1_us.html for each (the forms save on their
 * own), then report:
 *   1. field names in their stored data that no form has an input for;
 *   2. stored values the forms changed or dropped when opened with no edits;
 *   3. whether the engine's output (US tax, AGI, India tax, US foreign tax
 *      credit, state tax, alerts, and the joint household return) changed.
 * Exits non-zero on any of these.
 *
 * --regenerate: rebuild prototypes/graph-pilot/household-seed-data.js from
 * the hand-written starting point (household-seed.js
 * buildOriginalMehtaHousehold) by letting the forms save it, then applying
 * the documented clean-ups (docs/HOUSEHOLD_DESIGN.md, "Example household
 * data"). Run the plain check afterwards.
 *
 * Usage (after `cd monitor-next && npm run build`):
 *   node scripts/check-example-household.js [--regenerate]
 */
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4198;
const IDS = ["c_rohan_mehta", "c_priya_mehta"];
const SECTIONS = ["router", "india", "us"];
const PAGES = ["router.html", "layer1_india.html", "layer1_us.html"];
const REGENERATE = process.argv.includes("--regenerate");
const DATA_FILE = path.join(ROOT, "prototypes", "graph-pilot", "household-seed-data.js");

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
}
const leaves = (o, p = "", out = []) => {
  if (o === null || o === undefined) return out;
  if (Array.isArray(o)) { o.forEach((v, i) => leaves(v, p + "[" + i + "]", out)); return out; }
  if (typeof o === "object") { Object.keys(o).forEach((k) => leaves(o[k], p ? p + "." + k : k, out)); return out; }
  out.push([p, o]); return out;
};
const meaningful = (v) => !(v === null || v === undefined || v === "" || v === 0 || v === false);

global.WISING = {};
require(path.join(ROOT, "prototypes", "graph-pilot", "profiles.js"));
const A = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));
const H = require(path.join(ROOT, "prototypes", "graph-pilot", "household.js"));
const S = require(path.join(ROOT, "prototypes", "graph-pilot", "household-seed.js"));

function outputs(raw) {
  const r = A.analyze(JSON.parse(JSON.stringify(raw)));
  return {
    usTax: Math.round(r.computed.usTax.totalTaxBeforeFtcUsd), agi: Math.round(r.computed.usTax.agiUsd),
    indiaTaxInr: Math.round(r.computed.indiaTax.totalTaxInr || 0), usForeignTaxCredit: Math.round(r.computed.ftc.us.ftcAllowedUsd || 0),
    stateTax: Math.round((r.taxComputation.usState || {}).totalUsd || 0), alerts: r.findings.map((f) => f.id).sort().join(",")
  };
}
function jointTax(clients) {
  const h = H.analyzeHousehold(Object.assign({ id: IDS[0] }, clients[IDS[0]]), Object.assign({ id: IDS[1] }, clients[IDS[1]]), A.analyze);
  return h && h.jointUs ? Math.round(h.jointUs.incomeTaxUsd) : null;
}

// Clean-ups applied after the forms save the starting data (see the data
// file's header): s.44ADA removed from Rohan's entries (not allowed for a
// non-resident; the engine ignores it), fields no form collects dropped,
// form timestamps removed.
function cleanUp(data) {
  const R = data.c_rohan_mehta;
  const bis = [R.india.domestic_income && R.india.domestic_income.business_income]
    .concat(Object.values(R.india.quarters || {}).map((q) => q.domestic_income && q.domestic_income.business_income));
  bis.forEach((bi) => ((bi && bi.business_entries) || []).forEach((e) => { e.presumptive_scheme = null; delete e.holding_pct; }));
  (((R.us.real_estate || {}).properties) || []).forEach((p) => { delete p.property_type; delete p.gross_rent_usd; delete p.expenses_usd; });
  IDS.forEach((id) => SECTIONS.forEach((sec) => {
    const md = data[id][sec] && data[id][sec].metadata;
    if (md) ["created_at", "last_updated_at", "request_id"].forEach((k) => delete md[k]);
  }));
  return data;
}

function writeDataFile(data) {
  const src = fs.readFileSync(DATA_FILE, "utf8");
  const head = src.slice(0, src.indexOf("  var DATA = "));
  const tail = src.slice(src.indexOf(";\n  var W = root.WISING"));
  fs.writeFileSync(DATA_FILE, head + "  var DATA = " + JSON.stringify(data, null, 1) + tail);
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  const base = "http://localhost:" + PORT + "/";
  let failures = 0;
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
    page.on("dialog", (d) => d.accept());
    await page.goto(base + "index.html");
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("wising_site_unlocked", "true"); });
    if (REGENERATE) {
      const original = S.buildOriginalMehtaHousehold(global.WISING);
      await page.evaluate((cs) => {
        localStorage.setItem("wising_client_registry", JSON.stringify(cs.map((c) => ({ id: c.id, label: c.label }))));
        cs.forEach((c) => ["router", "india", "us"].forEach((k) => localStorage.setItem("wising_client_" + c.id + "_" + k, JSON.stringify(c[k]))));
      }, original);
    } else {
      await page.goto(base + "index.html"); await page.waitForTimeout(3000); // the Monitor adds the two clients
    }
    const snap = () => page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id,
      ["router", "india", "us"].reduce((o, k) => (o[k] = JSON.parse(localStorage.getItem("wising_client_" + id + "_" + k) || "{}"), o), {})])), IDS);
    const before = await snap();
    for (const id of IDS) for (const pg of PAGES) { await page.goto(base + pg + "?client=" + id); await page.waitForTimeout(3500); }
    await page.goto(base + "index.html"); await page.waitForTimeout(2000);
    const after = await snap();

    if (REGENERATE) {
      writeDataFile(cleanUp(JSON.parse(JSON.stringify(after))));
      console.log("Rewrote " + path.relative(ROOT, DATA_FILE) + ". Rebuild the Monitor and run this check again without --regenerate.");
      return;
    }

    const html = Object.fromEntries(SECTIONS.map((s, i) => [s, fs.readFileSync(path.join(ROOT, PAGES[i]), "utf8")]));
    for (const id of IDS) {
      console.log("== " + id);
      for (const sec of SECTIONS) {
        const names = [...new Set(leaves(before[id][sec]).filter(([, v]) => meaningful(v)).map(([k]) => k.split(".").pop().replace(/\[\d+\]$/, "")))];
        const noInput = names.filter((k) => !html[sec].includes(k) && !html.router.includes(k));
        const bm = new Map(leaves(before[id][sec])), am = new Map(leaves(after[id][sec]));
        const changed = [...bm].filter(([k, v]) => meaningful(v) && JSON.stringify(am.get(k)) !== JSON.stringify(v));
        console.log("   " + sec + ": fields with no form input: " + (noInput.length ? noInput.join(", ") : "none") +
          " | values changed by opening the forms: " + (changed.length ? changed.map(([k, v]) => k + " " + JSON.stringify(v) + " -> " + JSON.stringify(am.get(k))).join("; ") : "none"));
        failures += noInput.length + changed.length;
      }
      const o1 = outputs(before[id]), o2 = outputs(after[id]);
      const diffs = Object.keys(o1).filter((k) => o1[k] !== o2[k]);
      console.log("   engine: US tax $" + o1.usTax + ", AGI $" + o1.agi + ", India tax Rs " + o1.indiaTaxInr + ", US foreign tax credit $" + o1.usForeignTaxCredit +
        ", state tax $" + o1.stateTax + ", " + o1.alerts.split(",").length + " alerts — after the forms: " + (diffs.length ? "CHANGED " + diffs.join(", ") : "identical"));
      failures += diffs.length;
    }
    const j1 = jointTax(before), j2 = jointTax(after);
    console.log("== joint US return: income tax $" + j1 + " — after the forms: " + (j1 === j2 ? "identical" : "CHANGED to $" + j2));
    if (j1 !== j2) failures++;
    console.log(failures ? "\nFAIL — " + failures + " problem(s)" : "\nPASS — Rohan's and Priya's data is exactly what the forms save; the engine output doesn't change when the forms are opened.");
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(failures ? 1 : 0);
})();
