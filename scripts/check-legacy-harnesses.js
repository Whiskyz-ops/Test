#!/usr/bin/env node
/*
 * Legacy DAG-vs-frozen-engine harnesses (prototypes/graph-pilot/run-*.js):
 * a trustworthy signal for them.
 *
 * Those scripts were written during the port to prove each DAG node matched
 * the frozen engine exactly. The DAG has since fixed many things the frozen
 * engine gets wrong (salary exemptions, house property, business expenses,
 * Chapter VI-A, FEIE wages, NRA treaty fields, ...), so many of their exact-
 * match checks now fail BY DESIGN — which makes their raw output useless as
 * a green/red signal. This check makes it useful again:
 *
 *  1. Every demo client (and the sample) is replayed through run-fuzz.js's
 *     full-output DAG-vs-frozen comparison, which classifies each difference
 *     against the documented list of deliberate divergences. Any difference
 *     that ISN'T a documented divergence fails this check.
 *  2. Each run-*.js script runs; its failed-check count may not exceed the
 *     baseline recorded in scripts/legacy-harness-baseline.json (set when
 *     every one of those failures had been traced to step 1's accepted
 *     divergences). A script failing MORE checks than its baseline — new
 *     drift nobody has explained — fails this check.
 *
 * Usage: node scripts/check-legacy-harnesses.js [--update-baseline]
 * (only update the baseline after tracing every new failure to a documented,
 * deliberate divergence).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GP = path.join(ROOT, "prototypes", "graph-pilot");
const BASELINE = path.join(__dirname, "legacy-harness-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");

// 1. demo clients through run-fuzz's classifier
global.WISING = {};
require(path.join(GP, "sample-data.js"));
require(path.join(GP, "profiles.js"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-"));
const demos = global.WISING.PROFILES.map((p) => ({ label: p.id, profile: { router: p.router, india: p.india, us: p.us } }))
  .concat([{ label: "sample", profile: { router: global.WISING.SAMPLE.router, india: global.WISING.SAMPLE.india, us: global.WISING.SAMPLE.us } }]);
// The legacy scripts load the FROZEN copy of the demo profiles
// (archive/engine-frozen/profiles.js — a point-in-time snapshot that differs
// slightly from the live one), so those are replayed too.
const frozenDump = spawnSync("node", ["-e", 'global.window=global;require(process.argv[1]);process.stdout.write(JSON.stringify(WISING.PROFILES.map(function(p){return {label:"frozen:"+p.id,profile:{router:p.router,india:p.india,us:p.us}};})))',
  require("./engine-frozen.js").resolveEngineFile("profiles.js")], { encoding: "utf8" });
JSON.parse(frozenDump.stdout || "[]").forEach((d) => demos.push(d));
let unexplained = 0;
console.log("Demo clients, full DAG-vs-frozen output (run-fuzz.js classifier):");
demos.forEach((d) => {
  const f = path.join(tmp, d.label.replace(/[^\w.-]/g, "_") + ".json");
  fs.writeFileSync(f, JSON.stringify(d));
  const r = spawnSync("node", ["run-fuzz.js", "--repro=" + f], { cwd: GP, encoding: "utf8" });
  const status = ((r.stdout || "").match(/^status: (\S+)/m) || [])[1] || "error";
  const ok = status === "match" || status === "known";
  if (!ok) unexplained++;
  console.log("  " + (ok ? "✓" : "✗") + " " + d.label + ": " + status);
});

// 2. each legacy script vs its baseline
const scripts = fs.readdirSync(GP).filter((f) => /^run-.*\.js$/.test(f) && f !== "run-fuzz.js").sort();
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
const now = {};
let regressions = 0;
console.log("\nLegacy harness scripts (failed checks vs baseline):");
scripts.forEach((s) => {
  const r = spawnSync("node", [s], { cwd: GP, encoding: "utf8", timeout: 300000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/(\d+) passed, (\d+) failed(?![\s\S]*\d+ passed, \d+ failed)/);
  const failed = m ? Number(m[2]) : (r.status === 0 ? 0 : -1); // -1: crashed / no summary line
  now[s] = failed;
  const base = baseline[s] === undefined ? 0 : baseline[s];
  const bad = failed === -1 ? base !== -1 : failed > base;
  if (bad) regressions++;
  if (failed !== 0 || bad) console.log("  " + (bad ? "✗" : "~") + " " + s + ": " + (failed === -1 ? "no summary / crashed" : failed + " failed") + " (baseline " + base + ")");
});
console.log("  (" + scripts.filter((s) => now[s] === 0).length + " of " + scripts.length + " scripts fully passing)");

if (UPDATE) {
  if (unexplained) { console.log("\nNot updating the baseline: " + unexplained + " demo client(s) have unexplained differences."); process.exit(1); }
  fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + "\n");
  console.log("\nBaseline updated.");
  process.exit(0);
}
console.log("\n" + (unexplained || regressions
  ? "FAIL — " + unexplained + " demo client(s) with unexplained differences, " + regressions + " script(s) failing more checks than their baseline"
  : "PASS — every legacy-harness failure is within its recorded baseline, and every demo difference from the frozen engine is a documented, deliberate divergence"));
process.exit(unexplained || regressions ? 1 : 0);
