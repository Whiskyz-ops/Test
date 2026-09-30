#!/usr/bin/env node
/*
 * End-to-end "new client from scratch", driven like a user:
 *   Clients → "+ Add Client" (new tab) → Router (Layer 0) wizard answered
 *   slide by slide → Layer 1 India / Layer 1 US with typed entries →
 *   Monitor for that client → reopen the forms.
 * Checks: no page errors, no NaN/undefined/[object Object] on screen, the
 * Router finishes, the client appears under its name, the engine runs on
 * the client's saved data with the expected results, and what was typed is
 * still there after reopening.
 *
 * Usage (after `cd monitor-next && npm run build`):
 *   node scripts/check-new-client.js [--only=A,B]
 */
"use strict";
const path = require("path");
const { spawn, execSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const PORT = 4197;
const ONLY = ((process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
}

// Router answers per scenario (question id → value). Unlisted questions get
// a neutral default (first choice / "No" / a plausible value).
const SCENARIOS = [
  {
    id: "A", name: "Priya Cross Border", desc: "cross-border individual: Indian citizen, 40 days in India, green card, both-side income",
    router: { primary_jurisdiction: "cross_border", us_entity_type: "individual", india_entity_type: "individual", full_name: "Priya Cross Border",
      date_of_birth: "1988-04-12", is_indian_citizen: true, india_days: 40, has_india_source_income_or_assets: true, is_us_citizen: false,
      has_green_card: true, was_in_us_this_year: true, us_days: 320, has_us_source_income_or_assets: true, liable_to_tax_in_another_country: true,
      left_india_for_employment_this_year: false },
    india: { salaryGross: 2400000, bank: { name: "HDFC Bank", peak: 1500000 } },
    us: { w2Wages: 150000, w2Fed: 28000 },
    editRouter: { india_days: 200, us_days: 100 },
    // NR in India: only the India-workday share of the salary (40/360 days,
    // about ₹2.7L of ₹24L) is taxable there — under the exemption, so ₹0 is
    // right; check the salary reached the engine instead.
    expect: { usTaxPositive: true, indiaSalaryCounted: true }
  },
  {
    id: "B", name: "Rahul India Resident", desc: "India-only resident individual with salary",
    router: { primary_jurisdiction: "india", india_entity_type: "individual", full_name: "Rahul India Resident", date_of_birth: "1990-09-01",
      is_indian_citizen: true, india_days: 300, has_india_source_income_or_assets: true },
    india: { salaryGross: 1800000, bank: { name: "SBI", peak: 400000 } },
    expect: { indiaTaxPositive: true }
  },
  {
    id: "C", name: "Emma US Only", desc: "US-only citizen with one W-2",
    router: { primary_jurisdiction: "us", us_entity_type: "individual", full_name: "Emma US Only", date_of_birth: "1985-02-20", is_us_citizen: true,
      was_in_us_this_year: true, us_days: 365, has_us_source_income_or_assets: true },
    us: { w2Wages: 90000, w2Fed: 12000 },
    expect: { usTaxPositive: true }
  },
  {
    id: "D", name: "Acme India Pvt Ltd", desc: "Indian company",
    router: { primary_jurisdiction: "india", india_entity_type: "company", india_business_demographics: "Acme India Pvt Ltd" },
    expect: {}
  }
];

async function answerRouter(router, answers, problems) {
  const sc = { router: answers };
    const seen = [];
  for (let step = 0; step < 45; step++) {
    const done = await router.evaluate(() => { const c = document.getElementById("flow-complete-slide"); return !!(c && (c.classList.contains("active") || c.offsetParent)); });
    if (done) break;
    const qid = await router.evaluate(() => { const s = document.querySelector(".question-slide.active"); return s ? s.getAttribute("data-question-id") : null; });
    if (!qid) { problems.push("Router: no active question and not complete (after " + seen.join(" → ") + ")"); break; }
    seen.push(qid);
    if (seen.filter((x) => x === qid).length > 3) { problems.push("Router stuck on '" + qid + "'"); break; }
    // an answer not given by the scenario keeps what the page already shows
  const want = sc.router[qid] !== undefined ? sc.router[qid] : await router.evaluate((q) => { try { return routerState[q]; } catch (e) { return null; } }, qid);
    await router.evaluate(({ qid, want }) => {
      const slide = document.querySelector('.question-slide.active');
      const btns = Array.from(slide.querySelectorAll('button[onclick]'));
      const byHandler = (re) => btns.filter((b) => re.test(b.getAttribute('onclick')));
      const strBtns = byHandler(new RegExp("handleStringInput\\('" + qid + "'"));
      const boolBtns = byHandler(new RegExp("handleBoolInput\\('" + qid + "'"));
      const cont = btns.find((b) => /advanceQuestion\(\)|finalizeAndRoute\(\)|validateGates\(\)/.test(b.getAttribute('onclick')));
      const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      if (strBtns.length) {
        const b = strBtns.find((x) => want != null && x.getAttribute('onclick').indexOf("'" + want + "'") >= 0) || strBtns[0];
        b.click(); return;
      }
      if (boolBtns.length) {
        const v = want == null ? false : want;
        const b = boolBtns.find((x) => new RegExp(",\\s*" + v + "\\)").test(x.getAttribute('onclick'))) || boolBtns[boolBtns.length - 1];
        b.click(); if (cont && !/handleBoolInput/.test(cont.getAttribute('onclick'))) setTimeout(() => cont.click(), 50); return;
      }
      // text / number / date inputs (incl. dynamic tax-id slides)
      slide.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio]), select').forEach((el) => {
        if (el.offsetParent === null && el.type !== 'date') return;
        let v = (want != null && (el.type === 'date' || el.type === 'number') && typeof want === 'string' && !/^[\d-]+$/.test(want)) ? null : want;
        if (v == null) {
          const ph = (el.placeholder || '').toLowerCase();
          v = el.type === 'date' ? '1990-01-01' : el.type === 'number' ? '0' : el.tagName === 'SELECT' ? (Array.from(el.options).find((o) => o.value) || {}).value
            : /pan/.test(ph) ? 'ABCDE1234F' : /ssn|xxx-xx/.test(ph) ? '123-45-6789' : /ein|xx-x/.test(ph) ? '12-3456789' : /gst/.test(ph) ? '22ABCDE1234F1Z5' : /tan/.test(ph) ? 'ABCD12345E' : /cin/.test(ph) ? 'U12345MH2020PTC123456' : 'Test';
        }
        if (v != null) setVal(el, String(v));
      });
      if (cont) cont.click();
    }, { qid, want });
    await router.waitForTimeout(450);
  }
  return seen;
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  const base = "http://localhost:" + PORT + "/";
  global.WISING = {};
  const dag = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));
  let failures = 0;

  for (const sc of SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id))) {
    const problems = [];
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const errs = [];
    context.on("page", (p) => {
      p.on("dialog", (d) => d.dismiss());
      p.on("pageerror", (e) => { const m = String(e.message || e); if (!/tailwind is not defined/.test(m)) errs.push(p.url().split("/").pop().split("?")[0] + ": " + m.slice(0, 160)); });
    });
    const pg = await context.newPage();
    await pg.goto(base);
    await pg.evaluate(() => { localStorage.clear(); localStorage.setItem("wising_site_unlocked", "true"); localStorage.setItem("wising_mode", "full"); });
    await pg.goto(base + "index.html?view=clients"); await pg.waitForTimeout(2500);

    // 1. "+ Add Client" opens the Router in a new tab
    let router;
    try {
      [router] = await Promise.all([context.waitForEvent("page", { timeout: 10000 }), pg.locator("button:has-text('Add Client')").first().click()]);
    } catch (e) { problems.push("Add Client didn't open the Router: " + e.message.slice(0, 80)); }
    if (!router) { console.log("✗ " + sc.id + " " + sc.desc + "\n    " + problems.join("\n    ")); failures++; await context.close(); continue; }
    await router.waitForLoadState(); await router.waitForTimeout(1500);
    const clientId = new URL(router.url()).searchParams.get("client");
    if (!clientId) problems.push("Router opened without a client id");

    // 2. answer the Router slide by slide
    const seen = await answerRouter(router, sc.router, problems);
    const rState = await router.evaluate(() => JSON.parse(localStorage.getItem(window.WISING.ClientRegistry.storageKeyFor('ROUTER')) || 'null'));
    if (!rState || (rState.full_name !== sc.name && rState.india_entity_name !== sc.name && rState.us_entity_name !== sc.name)) problems.push("Router state not saved under the client (full_name " + JSON.stringify(rState && rState.full_name) + ")");
    const finished = await router.evaluate(() => { const c = document.getElementById("flow-complete-slide"); return !!(c && (c.classList.contains("active") || c.offsetParent)); });
    if (!finished) problems.push("Router didn't reach the completion screen (answered: " + seen.join(" → ") + ")");

    // 3. Layer 1 India (for a client with India scope)
    const q = "?client=" + encodeURIComponent(clientId || "");
    if (sc.india) {
      await router.goto(base + "layer1_india.html" + q); await router.waitForTimeout(2500);
      await router.evaluate((ind) => {
        const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        const has = document.getElementById('sal-has');
        if (has && !has.checked) has.click();
        setVal(document.getElementById('sal-gross'), String(ind.salaryGross));
        const add = Array.from(document.querySelectorAll('button[onclick="addBankAccountRow()"]'))[0];
        if (add) add.click();
        const card = Array.from(document.querySelectorAll('.bank-card')).pop();
        if (card) { setVal(card.querySelector('.bank-name'), ind.bank.name); setVal(card.querySelector('.bank-bal'), String(ind.bank.peak)); }
      }, sc.india);
      await router.waitForTimeout(1500);
    }
    // 4. Layer 1 US (for a client with US scope)
    if (sc.us) {
      await router.goto(base + "layer1_us.html" + q); await router.waitForTimeout(2500);
      await router.evaluate((us) => {
        const setVal = (el, v) => { if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        const has = document.getElementById('us-emp-has');
        if (has && !has.checked) has.click();
        const addBtn = document.getElementById('btn-add-w2');
        if (!document.querySelector('.w2-card') && addBtn) addBtn.click();
        const card = Array.from(document.querySelectorAll('.w2-card')).pop();
        if (card) { setVal(card.querySelector('.w2-employer') || card.querySelector('input[type=text]'), 'Globex Inc'); setVal(card.querySelector('.w2-wages'), String(us.w2Wages)); setVal(card.querySelector('.w2-fedtax'), String(us.w2Fed)); }
      }, sc.us);
      await router.waitForTimeout(1500);
    }

    // 5. engine on the client's saved data
    const raw = await router.evaluate((id) => window.WISING.ClientRegistry.getRawState(id), clientId);
    if (process.env.DUMP_DIR) require("fs").writeFileSync(path.join(process.env.DUMP_DIR, "client-" + sc.id + ".json"), JSON.stringify(raw));
    let r = null;
    try { r = dag.analyze(JSON.parse(JSON.stringify(raw))); } catch (e) { problems.push("engine threw on this client: " + e.message.slice(0, 120)); }
    if (r) {
      const inTax = r.computed.indiaTax.totalTaxInr, usTax = r.computed.usTax.totalTaxBeforeFtcUsd || r.computed.usTax.totalTaxUsd || 0;
      if (sc.expect.indiaTaxPositive && !(inTax > 0)) problems.push("India tax is " + inTax + " (expected > 0)");
      if (sc.expect.usTaxPositive && !(usTax > 0)) problems.push("US tax is " + usTax + " (expected > 0)");
      if (sc.expect.indiaSalaryCounted) {
        const sd = r.model.income.india.salaryDetail || {};
        if (!((sd.taxableSalaryInr || 0) > 0)) problems.push("India salary not in the engine's model: " + JSON.stringify(sd).slice(0, 160));
      }
      if (!isFinite(inTax) || !isFinite(usTax)) problems.push("non-finite tax: India " + inTax + ", US " + usTax);
      sc.result = "India taxable salary ₹" + Math.round(((r.model.income.india.salaryDetail || {}).taxableSalaryInr) || 0).toLocaleString("en-IN") + ", India tax ₹" + Math.round(inTax).toLocaleString("en-IN") + ", US tax $" + Math.round(usTax).toLocaleString("en-US") + ", " + r.findings.length + " findings";
    }

    // 6. Monitor + Clients list for this client
    await router.goto(base + "index.html?view=monitor&client=" + encodeURIComponent(clientId)); await router.waitForTimeout(3000);
    const mon = await router.locator("body").innerText();
    const bad = mon.split("\n").filter((l) => /\bNaN\b|\bundefined\b|\[object Object\]|Infinity/.test(l)).slice(0, 3);
    if (bad.length) problems.push("Monitor shows: " + bad.join(" | "));
    await router.goto(base + "index.html?view=clients"); await router.waitForTimeout(2500);
    const list = await router.locator("body").innerText();
    if (list.indexOf(sc.name) < 0) problems.push("client '" + sc.name + "' not listed under its name on Clients");

    // 7. reopen the forms: typed values still there
    if (sc.india) {
      await router.goto(base + "layer1_india.html" + q); await router.waitForTimeout(2500);
      const v = await router.evaluate(() => ({ gross: document.getElementById('sal-gross').value, bank: (Array.from(document.querySelectorAll('.bank-card .bank-name')).pop() || {}).value }));
      if (String(v.gross).replace(/[^\d]/g, "") !== String(sc.india.salaryGross)) problems.push("India salary after reopen: " + v.gross);
      if (v.bank !== sc.india.bank.name) problems.push("India bank after reopen: " + v.bank);
    }
    if (sc.us) {
      await router.goto(base + "layer1_us.html" + q); await router.waitForTimeout(2500);
      const v = await router.evaluate(() => { const c = Array.from(document.querySelectorAll('.w2-card')).pop(); return c ? c.querySelector('.w2-wages').value : null; });
      if (String(v || "").replace(/[^\d]/g, "") !== String(sc.us.w2Wages)) problems.push("US W-2 wages after reopen: " + v);
    }
    // 8. reopen the Router for this client: saved answers shown, a changed
    //    answer reaches both forms without losing what was typed there
    if (sc.editRouter) {
      await router.goto(base + "router.html" + q); await router.waitForTimeout(1500);
      const shownName = await router.evaluate(() => (document.getElementById('full-name-input') || {}).value);
      if (shownName !== sc.name) problems.push("Router reopened without the saved name (shows " + JSON.stringify(shownName) + ")");
      await answerRouter(router, Object.assign({}, sc.router, sc.editRouter), problems);
      const st = await router.evaluate((id) => window.WISING.ClientRegistry.getRawState(id), clientId);
      if (sc.editRouter.india_days != null && (st.india.residency_detail || {}).days_in_india_current_year !== sc.editRouter.india_days) problems.push("India form days after Router edit: " + (st.india.residency_detail || {}).days_in_india_current_year);
      if (sc.editRouter.us_days != null && (st.us.us_residency_detail || {}).us_days_current_year !== sc.editRouter.us_days) problems.push("US form days after Router edit: " + (st.us.us_residency_detail || {}).us_days_current_year);
      if (sc.india && ((st.india.domestic_income || {}).salary || {}).gross_salary_inr !== sc.india.salaryGross) problems.push("India salary lost after Router edit");
      if (sc.us && !(((st.us.income_us_source || {}).wages_w2 || []).some((w) => w.wages_box1_usd === sc.us.w2Wages))) problems.push("US W-2 lost after Router edit");
      try { const r2 = dag.analyze(JSON.parse(JSON.stringify(st))); sc.result += "; after Router edit: India " + r2.computed.residency.india.status + ", US " + r2.computed.residency.us.status; } catch (e) { problems.push("engine threw after Router edit: " + e.message.slice(0, 100)); }
    }
    errs.forEach((e) => problems.push("page error — " + e));
    if (problems.length) failures++;
    console.log((problems.length ? "✗ " : "✓ ") + sc.id + " " + sc.desc + (sc.result ? "  [" + sc.result + "]" : "") + (problems.length ? "\n    " + problems.join("\n    ") : ""));
    await context.close();
  }
  // Demo clients: reopen the Router and click straight through every slide
  // keeping what it shows — the engine results must not change.
  const summ = (r) => JSON.stringify([Math.round(r.computed.indiaTax.totalTaxInr), Math.round(r.computed.usTax.totalTaxBeforeFtcUsd || r.computed.usTax.totalTaxUsd || 0),
    r.findings.map((f) => f.id).sort(), (r.documents || []).filter((d) => d.required).map((d) => d.id).sort()]);
  for (const demo of ["us_resident_indian_income", "india_ror_us_income", "dual_resident_h1b", "india_only_ca_client"]) {
    const context = await browser.newContext();
    const pg = await context.newPage(); pg.on("dialog", (d) => d.dismiss());
    const perrs = []; pg.on("pageerror", (e) => { const m = String(e.message || e); if (!/tailwind is not defined/.test(m)) perrs.push(m.slice(0, 120)); });
    await pg.goto(base); await pg.evaluate((id) => { localStorage.clear(); localStorage.setItem("wising_site_unlocked", "true"); localStorage.setItem("wising_mode", "full"); window.WISING.loadProfile(id); }, demo);
    const readAll = () => pg.evaluate(() => ({ router: JSON.parse(localStorage.getItem("wising_router_state") || "{}"), india: JSON.parse(localStorage.getItem("wising_layer1_india_state") || "{}"), us: JSON.parse(localStorage.getItem("wising_us_state") || "{}") }));
    const before = await readAll();
    await pg.goto(base + "router.html"); await pg.waitForTimeout(1500);
    const bad = [];
    const afterOpen = await readAll();
    if (JSON.stringify(afterOpen.router) !== JSON.stringify(before.router)) bad.push("opening the Router changed its saved answers");
    await answerRouter(pg, {}, bad);
    const after = await readAll();
    let a = null, b = null;
    try { b = summ(dag.analyze(JSON.parse(JSON.stringify(before)))); a = summ(dag.analyze(JSON.parse(JSON.stringify(after)))); } catch (e) { bad.push("engine threw: " + e.message.slice(0, 100)); }
    if (a !== b) bad.push("engine results changed after clicking through the Router:\n      before " + b + "\n      after  " + a);
    perrs.forEach((e) => bad.push("page error — " + e));
    if (bad.length) failures++;
    console.log((bad.length ? "✗ " : "✓ ") + "R " + demo + ": Router reopened and clicked through unchanged" + (bad.length ? "\n    " + bad.join("\n    ") : ""));
    await context.close();
  }
  await browser.close(); server.kill();
  console.log("\n" + failures + " scenario(s) with problems");
  process.exit(failures ? 1 : 0);
})();
