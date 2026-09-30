#!/usr/bin/env node
/*
 * Layer 1 form -> engine EFFECT audit: which inputs does the engine ignore?
 *
 * For each profile: load it, open the form, save, and run the engine (the
 * live DAG, same one the Monitor uses) on what the form saved — the
 * baseline. Then, one reachable field at a time: set a realistic new value
 * (large amounts for money fields, so threshold-gated fields still register),
 * let the form save, run the engine again, and compare the WHOLE engine
 * output (monitoring timestamps excluded) with the baseline. The field is
 * then set back. A field whose change moves nothing anywhere in the output
 * is reported as "no effect" — a candidate for "the form collects it, the
 * engine ignores it". Candidates need triage: some fields are informational
 * by design (names, addresses, reference numbers).
 *
 * A field counts as used if it had an effect on ANY profile where it was
 * reachable (keys are the inline handler, stable across profiles).
 *
 * Usage (after `cd monitor-next && npm run build`):
 *   node scripts/check-form-engine-effect.js [layer1_india.html|layer1_us.html|router.html] [--only=id,id] [--json=out.json]
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARGS = process.argv.slice(2);
const PAGE = ARGS.find((a) => !a.startsWith("--")) || "layer1_india.html";
const ONLY = ((ARGS.find((a) => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);
const JSON_OUT = (ARGS.find((a) => a.startsWith("--json=")) || "").slice(7);
const PORT = Number(process.env.EFFECT_PORT) || 4195;
const DEFAULT_PROFILES = {
  "layer1_india.html": ["__sample", "india_only_ca_client", "dual_resident_h1b", "founder_indian_company", "us_resident_indian_income", "sharma_huf", "india_pvt_ltd", "foreign_holdco_poem_india", "india_ror_us_income", "greencard_retiree_india"],
  "layer1_us.html": ["__sample", "us_only_cpa_client", "us_ccorp_indian_sub", "india_ror_us_income", "us_citizen_expat_india", "dual_resident_h1b", "greencard_retiree_india", "us_resident_indian_income"],
  "router.html": ["__sample", "dual_resident_h1b", "us_only_cpa_client", "india_pvt_ltd", "us_ccorp_indian_sub"]
};

function loadPlaywright() {
  try { return require("playwright"); } catch (e) {
    return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}

const PAGE_HELPERS = `
window.__edit = (function () {
  // Tailwind's CDN build is blocked in the test sandbox, so its "hidden" class does nothing; restore it.
  function css() { if (!document.getElementById('__edit_css')) { const s = document.createElement('style'); s.id = '__edit_css'; s.textContent = '.hidden{display:none!important}'; document.head.appendChild(s); } }
  const unstableId = (id) => !id || /\\d{5,}/.test(id);
  function reachable(el) {
    if (el.disabled || el.readOnly) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.id && n.id.indexOf('panel-step-') === 0) {
        const btn = document.getElementById('btn-' + n.id.slice(6));
        if (!btn) return false;
        for (let b = btn; b && b !== document.body; b = b.parentElement) if (b.classList.contains('hidden') || getComputedStyle(b).display === 'none') return false;
        return true;
      }
      if (n.classList.contains('hidden') || getComputedStyle(n).display === 'none') return false;
    }
    return false; // not inside a step panel (headers, dev tools, JSON viewers)
  }
  function unitClass(n) { return Array.from(n.classList).find((c) => /^[a-z][a-z0-9-]*(card|row)$/.test(c) && !/^(flex|grid|glass)/.test(c)); }
  function key(el) {
    const parts = [];
    let n = el.parentElement;
    for (; n && n !== document.body; n = n.parentElement) {
      if (n.id && !unstableId(n.id)) { parts.unshift('#' + n.id); break; }
      const u = unitClass(n);
      if (u && n.parentElement) {
        const sibs = Array.from(n.parentElement.children).filter((x) => x.classList.contains(u));
        parts.unshift('.' + u + '[' + sibs.indexOf(n) + ']');
      }
    }
    let self;
    const handler = el.getAttribute('oninput') || el.getAttribute('onchange');
    if (el.id && !unstableId(el.id)) self = '#' + el.id;
    else if (handler && !/\d{5,}/.test(handler)) {
      // the inline handler names the state field — stable across re-renders
      const scope = document.body;
      const same = Array.from(scope.querySelectorAll(el.tagName)).filter((x) => (x.getAttribute('oninput') || x.getAttribute('onchange')) === handler);
      return el.tagName.toLowerCase() + '{' + handler.replace(/\\s+/g, ' ') + '}[' + same.indexOf(el) + ']';
    }
    else {
      const scope = el.parentElement ? (el.closest(parts.length ? '[id], .' + (parts[parts.length - 1].slice(1).split('[')[0]) : 'body') || document.body) : document.body;
      const same = Array.from(scope.querySelectorAll(el.tagName)).filter((x) => x.className === el.className && x.type === el.type);
      self = el.tagName.toLowerCase() + '(' + el.className.split(/\\s+/).filter((c) => /^[a-z]+(-[a-z0-9]+)+$/.test(c) && !/^(w|h|px|py|pl|pr|mt|mb|text|bg|border|rounded|font|focus|transition|flex|grid|gap|col|row|min|max|leading|tracking|placeholder|shadow|ring|outline|cursor|hover|peer|sr|self|items|justify|appearance|block|inline|opacity|z|top|left|right|bottom|absolute|relative|space|overflow|truncate|uppercase|normal|italic|select|pointer|duration|ease)(-|$)/.test(c)).join('.') + ')[' + same.indexOf(el) + ']';
      if (el.id) self = self; // unstable ids ignored
    }
    return parts.join(' > ') + ' > ' + self;
  }
  function label(el) {
    const l = el.id && document.querySelector('label[for="' + el.id + '"]');
    if (l) return l.textContent.trim().replace(/\\s+/g, ' ').slice(0, 70);
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      let p = n.previousElementSibling;
      while (p && !/^(LABEL|SPAN|P|H3|H4|DIV)$/.test(p.tagName)) p = p.previousElementSibling;
      if (p && p.textContent.trim()) return p.textContent.trim().replace(/\\s+/g, ' ').slice(0, 70);
      const lab = n.parentElement && n.parentElement.querySelector(':scope > label');
      if (lab && lab.textContent.trim()) return lab.textContent.trim().replace(/\\s+/g, ' ').slice(0, 70);
    }
    return el.placeholder || el.name || '';
  }
  const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=range]), select, textarea';
  // not stored values by design: "picker" dropdowns that add a chip and
  // reset, and live currency converters (only their converted USD is saved)
  const notAValue = (el) => /-picker$/.test(el.id || '') || /autoConvertField\\(/.test(el.getAttribute('oninput') || el.getAttribute('onchange') || '');
  function fields() { css(); return Array.from(document.querySelectorAll(EDITABLE)).filter((el) => reachable(el) && !notAValue(el)).map((el) => ({ el, key: key(el) })); }
  const isNumeric = (el) => el.type === 'number' || el.inputMode === 'numeric' || el.classList.contains('inr-input') || /^[\\d,.\\s₹$-]*$/.test(el.placeholder || 'x') && (el.placeholder || '').length > 0 && /\\d/.test(el.placeholder || '');
  function newValue(el) {
    const cur = el.value;
    if (el.tagName === 'SELECT') {
      const opts = Array.from(el.options).filter((o) => !o.disabled && o.value !== '' && o.value !== cur && o.value !== 'null');
      return opts.length ? opts[opts.length > 1 ? 1 : 0].value : null;
    }
    if (el.type === 'date') return cur === '2025-06-15' ? '2025-07-16' : '2025-06-15';
    if (el.type === 'month') return '2025-06';
    if (el.type === 'email') return 'edit.test@example.com';
    if (/validateNaics|naics/i.test((el.getAttribute('oninput') || '') + (el.id || '') + el.className)) return cur === '541511' ? '541512' : '541511'; // digits-only field
    if (isNumeric(el)) { const c = Number(String(cur).replace(/[^\\d.]/g, '')) || 0; return String(c > 0 ? Math.round(c * 2 + 250000) : 1234567); }
    return cur === 'Edit Test' ? 'Edit Check' : 'Edit Test';
  }
  function set(el, v) {
    el.focus && el.focus();
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    ['input', 'change'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
  }
  function norm(v) { v = String(v == null ? '' : v).trim().toLowerCase(); const n = v.replace(/[,\\s₹$%]/g, ''); return /^-?\\d+(\\.\\d+)?$/.test(n) ? String(Number(n)) : v; }
  function save() {
    try { if (typeof window.saveLayer1State === 'function') window.saveLayer1State(); } catch (e) {}
    try { if (typeof window.saveStateAndSync === 'function') window.saveStateAndSync(); else if (typeof saveStateAndSync === 'function') saveStateAndSync(); } catch (e) {}
  }
  return {
    // edit every reachable field (or only those whose key is in onlyKeys); returns [{key,label,value}]
    editAll(onlyKeys) {
      const done = [];
      const seen = new Set();
      // several passes: an edit can reveal new fields (e.g. a dropdown showing a sub-section)
      for (let pass = 0; pass < 3; pass++) {
        fields().forEach(({ el, key }) => {
          if (seen.has(key) || (onlyKeys && !onlyKeys.includes(key))) return;
          seen.add(key);
          const v = newValue(el);
          if (v === null) return;
          set(el, v);
          done.push({ key, label: label(el), value: v, tag: el.tagName.toLowerCase() });
        });
      }
      return done;
    },
    read() { const out = {}; fields().forEach(({ el, key }) => { out[key] = el.value; }); return out; },
    toggles() { css(); return Array.from(document.querySelectorAll('input[type=checkbox], input[type=radio]')).filter((el) => reachable(el) && !(el.type === 'radio' && el.checked)).map((el) => ({ key: key(el), label: label(el), checked: el.checked })); },
    flip(k) {
      const t = Array.from(document.querySelectorAll('input[type=checkbox], input[type=radio]')).find((el) => reachable(el) && key(el) === k);
      if (!t) return null;
      t.click();
      return t.checked;
    },
    // repeating rows that have a delete button: {unit, count, values of row 0 and row 1}
    rowKinds() {
      css();
      const kinds = {};
      Array.from(document.querySelectorAll('button[onclick]')).forEach((b) => {
        if (!/remove|delete/i.test(b.getAttribute('onclick')) && !/delete|remove|✕/i.test(b.textContent)) return;
        let card = b.parentElement;
        while (card && card !== document.body && !unitClass(card)) card = card.parentElement;
        if (!card || card === document.body || !reachable(b)) return;
        const u = unitClass(card);
        if (!kinds[u]) kinds[u] = true;
      });
      return Object.keys(kinds).map((u) => {
        const rows = Array.from(document.querySelectorAll('.' + u)).filter((r) => r.parentElement && !r.parentElement.closest('.' + u));
        const vals = (r) => r ? Array.from(r.querySelectorAll('input:not([type=file]):not([type=checkbox]):not([type=radio]), select')).map((x) => x.value) : null;
        return { unit: u, count: rows.length, first: vals(rows[0]), second: vals(rows[1]) };
      }).filter((k) => k.count > 0);
    },
    deleteFirst(u) {
      const rows = Array.from(document.querySelectorAll('.' + u)).filter((r) => r.parentElement && !r.parentElement.closest('.' + u));
      if (!rows.length) return false;
      const b = Array.from(rows[0].querySelectorAll('button[onclick]')).find((x) => /remove|delete/i.test(x.getAttribute('onclick')) || /delete|remove|✕/i.test(x.textContent));
      if (!b) return false;
      b.click();
      return true;
    },
    toggleState(k) { const t = Array.from(document.querySelectorAll('input[type=checkbox], input[type=radio]')).find((el) => key(el) === k); return t ? t.checked : null; },
    norm,
    save,
    // every reachable field: [{ key, label, orig, value }] — nothing edited yet
    list() { const out = [], seen = new Set(); fields().forEach(({ el, key }) => { if (seen.has(key)) return; seen.add(key); const v = newValue(el); if (v !== null) out.push({ key, label: label(el), orig: el.value, value: v, handler: (el.getAttribute('oninput') || el.getAttribute('onchange') || el.getAttribute('onblur') || '').slice(0, 160) }); }); return out; },
    setKey(k, v) { const f = fields().find((x) => x.key === k); if (!f) return false; set(f.el, v); return true; }
  };
})();
`;


(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  global.WISING = {};
  process.chdir(path.join(ROOT, "prototypes", "graph-pilot"));
  const dag = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js"));
  const fingerprint = (st) => {
    try { return JSON.stringify(dag.analyze(JSON.parse(JSON.stringify(st))), (k, v) => (k === "monitoring" || k === "asOf" ? undefined : v)); }
    catch (e) { return "THREW " + String(e.message || e).slice(0, 80); }
  };
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  const base = "http://localhost:" + PORT + "/";
  const results = {}; // key -> { label, handler, effect: bool, profiles: [] }
  const ids = ONLY.length ? ONLY : DEFAULT_PROFILES[PAGE];
  let next = 0;
  async function worker() {
    const context = await browser.newContext();
    const pg = await context.newPage();
    pg.on("dialog", (d) => d.dismiss());
    const readState = () => pg.evaluate(() => {
      window.__edit.save();
      try { if (typeof persistIndiaState === "function") persistIndiaState(); } catch (e) {}
      try { if (typeof persistUsState === "function") persistUsState(); } catch (e) {}
      try { if (typeof saveState === "function") saveState(); } catch (e) {}
      return { router: JSON.parse(localStorage.getItem("wising_router_state") || "{}"), india: JSON.parse(localStorage.getItem("wising_layer1_india_state") || "{}"), us: JSON.parse(localStorage.getItem("wising_us_state") || "{}") };
    });
    while (next < ids.length) {
      const id = ids[next++];
      await pg.goto(base);
      await pg.evaluate((id) => {
        localStorage.clear(); localStorage.setItem("wising_site_unlocked", "true"); localStorage.setItem("wising_mode", "full");
        if (id === "__sample") { const S = window.WISING.SAMPLE; localStorage.setItem("wising_router_state", JSON.stringify(S.router)); localStorage.setItem("wising_layer1_india_state", JSON.stringify(S.india)); localStorage.setItem("wising_us_state", JSON.stringify(S.us)); }
        else window.WISING.loadProfile(id);
      }, id);
      await pg.goto(base + PAGE); await pg.waitForTimeout(2200);
      await pg.evaluate(PAGE_HELPERS);
      const list = await pg.evaluate(() => window.__edit.list());
      let used = 0;
      for (const f of list) {
        // baseline taken right before each edit: setting the previous field
        // back can leave harmless differences (null vs "") in the saved data
        const beforeFp = fingerprint(await readState());
        const ok = await pg.evaluate(([k, v]) => window.__edit.setKey(k, v), [f.key, f.value]);
        if (!ok) continue;
        await pg.waitForTimeout(60);
        const fp = fingerprint(await readState());
        const effect = fp !== beforeFp;
        if (effect) used++;
        if (process.env.EFFECT_DEBUG && (f.handler + f.key).includes(process.env.EFFECT_DEBUG)) console.log('  [debug] ' + f.key + ' | ' + f.label + ' | ' + JSON.stringify(f.orig) + ' -> ' + JSON.stringify(f.value) + ' | set=' + ok + ' effect=' + effect);
        const r = results[f.key] || (results[f.key] = { label: f.label, handler: f.handler, effect: false, profiles: [] });
        r.effect = r.effect || effect;
        r.profiles.push(id);
        await pg.evaluate(([k, v]) => window.__edit.setKey(k, v), [f.key, f.orig]);
        await pg.waitForTimeout(40);
      }
      console.log(id + ": " + list.length + " fields, " + used + " moved the engine output");
    }
    await context.close();
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  await browser.close(); server.kill();
  const none = Object.entries(results).filter(([, r]) => !r.effect);
  console.log("\n" + Object.keys(results).length + " distinct fields; " + none.length + " never moved the engine output on any profile:\n");
  none.sort((a, b) => a[1].label.localeCompare(b[1].label)).forEach(([k, r]) => console.log("  " + r.label + "  ⟨" + (r.handler || k).replace(/\s+/g, " ") + "⟩  [" + r.profiles.length + " profile(s)]"));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
})();
