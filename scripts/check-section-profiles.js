#!/usr/bin/env node
/*
 * Per-section test profiles: one small client per Layer 1 form section,
 * run through the FULL engine (analyze(), the same entry point the Monitor
 * uses) and checked against figures worked out by hand from the law — not
 * copied from engine output.
 *
 * Why: rule-level tests feed a node its inputs directly, so they miss bugs
 * in how the full graph wires those inputs (s.80M read a dividend the full
 * graph never supplies, and was 0 for every real company). These profiles
 * only go in through the front door.
 *
 * Each profile is dag_py/tests/fixtures/section-profiles/<id>.json:
 *   { id, form, section, story, router, india, us, monitorAsOf?,
 *     expect: [{ path, value, why, tol? }] }
 * monitorAsOf pins the engine's "today" (else the clock).
 * `path` is a dot path into analyze()'s result; a segment like
 * rows[label=Taxable income] picks the array element whose field matches.
 * `tol` defaults to 1 (rounding).
 *
 * Also checked: every field name a profile sets appears in the form it
 * belongs to (router.html / layer1_india.html / layer1_us.html), so a
 * profile can't test a field no form can write. The same profiles are run
 * by the Python engine (dag_py/tests/test_section_profiles.py) and through
 * the real forms (check-form-roundtrip.js --sections).
 *
 * Usage: node scripts/check-section-profiles.js [--only=id,id] [--show=id]
 *   --show=id  print the profile's main computed figures (for authoring)
 */
"use strict";
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "dag_py", "tests", "fixtures", "section-profiles");
const FORMS = path.join(ROOT, "monitor-next", "public");
const ARGS = process.argv.slice(2);
const ONLY = ((ARGS.find((a) => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);
const SHOW = (ARGS.find((a) => a.startsWith("--show=")) || "").slice(7);

function pick(obj, p) {
  const segs = p.match(/[^.[\]]+(\[[^\]]*\])?/g) || [];
  let cur = obj;
  for (const seg of segs) {
    if (cur == null) return undefined;
    const m = seg.match(/^([^[]+)(?:\[([^=\]]+)=([^\]]*)\])?$/);
    if (!m) return undefined;
    cur = cur[m[1]];
    if (m[2] !== undefined) cur = Array.isArray(cur) ? cur.find((x) => x && String(x[m[2]]) === m[3]) : undefined;
  }
  return cur;
}

function leafKeys(v, out) {
  if (Array.isArray(v)) v.forEach((x) => leafKeys(x, out));
  else if (v && typeof v === "object") Object.keys(v).forEach((k) => { out.add(k); leafKeys(v[k], out); });
  return out;
}

// Keys that name a structure the forms build by position rather than by a
// literal field name.
const STRUCTURAL = new Set(["Q1", "Q2", "Q3", "Q4"]);
// Year keys of a by-year map (e.g. sepp_prior_payments_by_year: { "2024": … }).
const isYearKey = (k) => /^\d{4}$/.test(k);
const formText = {};
function formHas(file, key) {
  if (!formText[file]) formText[file] = fs.readFileSync(path.join(FORMS, file), "utf8");
  return formText[file].includes(key);
}
// Old field names a form still understands on load but renames on save
// (e.g. layer1_us.html's US_SUPERSEDED_ALIASES) — a profile must use the name
// the form saves, since the engine reads saved data.
function supersededIn(file) {
  formHas(file, "");
  const m = formText[file].match(/SUPERSEDED_ALIASES = new Set\(\[([^\]]*)\]\)/);
  return new Set(m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : []);
}

function loadProfiles() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
    .filter((p) => !ONLY.length || ONLY.includes(p.id));
}

function check(profile, result) {
  const problems = [];
  (profile.expect || []).forEach((e) => {
    const picked = pick(result, e.path);
    const got = picked === undefined ? null : picked; // absent == null, as in the Python runner
    const tol = e.tol === undefined ? 1 : e.tol;
    const ok = typeof e.value === "number" ? typeof got === "number" && Math.abs(got - e.value) <= tol : JSON.stringify(got) === JSON.stringify(e.value);
    if (!ok) problems.push(e.path + ": expected " + JSON.stringify(e.value) + ", engine " + JSON.stringify(got) + "  (" + e.why + ")");
  });
  [["router", "router.html"], ["india", "layer1_india.html"], ["us", "layer1_us.html"]].forEach(([part, file]) => {
    const superseded = supersededIn(file);
    leafKeys(profile[part] || {}, new Set()).forEach((k) => {
      if (!STRUCTURAL.has(k) && !isYearKey(k) && !formHas(file, k)) problems.push(part + "." + k + ": no such field in " + file);
      else if (superseded.has(k)) problems.push(part + "." + k + ": old field name " + file + " renames on save");
    });
  });
  return problems;
}

if (require.main === module) {
  global.WISING = {};
  process.chdir(path.join(ROOT, "prototypes", "graph-pilot"));
  const dag = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));
  // monitorAsOf (optional): the engine's "today", for checks that depend on it (SEPP status mid-year).
  const run = (p) => dag.analyze(JSON.parse(JSON.stringify(Object.assign({ router: p.router || {}, india: p.india || {}, us: p.us || {} },
    p.monitorAsOf ? { monitorAsOf: p.monitorAsOf } : {}))));
  const profiles = loadProfiles();
  if (SHOW) {
    const p = profiles.find((x) => x.id === SHOW);
    const r = run(p);
    console.log(JSON.stringify({ indiaTax: r.computed.indiaTax, usTax: r.computed.usTax, incomeIndia: r.model.income.india, incomeUs: r.model.income.us, taxComputation: r.taxComputation, findings: (r.findings || []).map((f) => f.id) }, null, 1));
    process.exit(0);
  }
  let failed = 0, checks = 0;
  profiles.forEach((p) => {
    let problems;
    try { problems = check(p, run(p)); } catch (e) { problems = ["engine threw: " + String(e.stack || e).split("\n").slice(0, 3).join(" | ")]; }
    checks += (p.expect || []).length;
    if (problems.length) failed++;
    console.log((problems.length ? "✗ " : "✓ ") + p.id + "  [" + p.form + " → " + p.section + "]" + (problems.length ? "\n    " + problems.join("\n    ") : ""));
  });
  console.log("\n" + profiles.length + " section profiles, " + checks + " hand-computed checks, " + failed + " failing");
  process.exit(failed ? 1 : 0);
}

module.exports = { pick, check, loadProfiles, DIR };
