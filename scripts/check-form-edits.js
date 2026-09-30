#!/usr/bin/env node
/*
 * Layer 1 form EDIT check: does what a user types survive saving and
 * reopening the page?
 *
 * For each profile: load it, open the form, and change every field a user
 * can reach (a step whose sidebar button is showing, no hidden section in
 * between) — text / number / date inputs and dropdowns, all in one pass.
 * Wait (the forms save on their own — no save is forced), reopen, and compare each field with what was typed. Any field that
 * didn't keep its value is then re-tested ALONE on a fresh copy of the
 * profile, so a field that only "failed" because another edit hid or reset
 * it (batch interference) isn't reported as a bug.
 *
 * Usage (after `cd monitor-next && npm run build`):
 *   node scripts/check-form-edits.js [layer1_india.html|layer1_us.html] [--only=id,id] [--toggles] [--verbose]
 * Exits non-zero if any field loses its value when edited on its own.
 */
"use strict";
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARGS = process.argv.slice(2);
const PAGE = ARGS.find((a) => !a.startsWith("--")) || "layer1_india.html";
const ONLY = ((ARGS.find((a) => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);
const VERBOSE = ARGS.includes("--verbose");
// --toggles: instead of text/dropdown fields, flip each reachable checkbox /
// radio on its own (they show and hide whole sections, so they can't be
// batched), reopen, and check the flip stuck.
const TOGGLES = ARGS.includes("--toggles");
// --deletes: for each kind of repeating row (bank accounts, W-2s, properties,
// holdings, …) delete the first row, reopen, and check the list shrank by one,
// the next row kept its own values, and nothing of the deleted row came back.
const DELETES = ARGS.includes("--deletes");
const PORT = 4198;
const DEFAULT_PROFILES = {
  "layer1_india.html": ["__sample", "india_only_ca_client", "dual_resident_h1b", "founder_indian_company", "us_resident_indian_income", "sharma_huf", "india_pvt_ltd", "foreign_holdco_poem_india"],
  "layer1_us.html": ["__sample", "us_only_cpa_client", "us_ccorp_indian_sub", "india_ror_us_income", "us_citizen_expat_india", "dual_resident_h1b", "greencard_retiree_india", "us_resident_indian_income"]
};

function loadPlaywright() {
  try { return require("playwright"); } catch (e) {
    return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}

// ---- in-page helpers (serialised into the page) -----------------------------
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
    if (isNumeric(el)) return String(cur).replace(/[^\\d.]/g, '') === '37' ? '41' : '37';
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
    save
  };
})();
`;

(async () => {
  let server = null;
  const startServer = async () => {
    server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "monitor-next", "out"), stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 1200));
  };
  await startServer();
  const nav = async (pg, url) => {
    for (let attempt = 0; ; attempt++) {
      try { return await pg.goto(url); } catch (e) {
        if (attempt >= 3) throw e;
        if (server && server.exitCode !== null) await startServer(); else await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium" });
  const base = "http://localhost:" + PORT + "/";
  const WORKERS = 4;

  // one isolated browser context per worker: localStorage is per context
  async function makeWorker() {
    const context = await browser.newContext();
    const pg = await context.newPage();
    pg.on("dialog", (d) => (DELETES ? d.accept() : d.dismiss()));
    const errors = [];
    pg.on("pageerror", (e) => { const m = String(e.message || e); if (!/tailwind is not defined/.test(m)) errors.push(m.slice(0, 200)); });
    async function loadProfile(id) {
      await nav(pg, base);
      await pg.evaluate((id) => {
        localStorage.clear();
        localStorage.setItem("wising_site_unlocked", "true"); localStorage.setItem("wising_mode", "full");
        if (id === "__sample") {
          const S = window.WISING.SAMPLE;
          localStorage.setItem("wising_router_state", JSON.stringify(S.router));
          localStorage.setItem("wising_layer1_india_state", JSON.stringify(S.india));
          localStorage.setItem("wising_us_state", JSON.stringify(S.us));
        } else window.WISING.loadProfile(id);
      }, id);
    }
    async function openForm() {
      await nav(pg, base + PAGE); await pg.waitForTimeout(2200);
      await pg.evaluate(PAGE_HELPERS);
    }
    async function editAndReopen(id, onlyKeys) {
      await loadProfile(id);
      await openForm();
      const edits = await pg.evaluate((k) => window.__edit.editAll(k), onlyKeys || null);
      // no explicit save: only what the form itself saves counts (as for a user)
      await pg.waitForTimeout(1200);
      await openForm();
      const after = await pg.evaluate(() => window.__edit.read());
      const lost = [];
      for (const e of edits) {
        const got = after[e.key];
        const ok = got !== undefined && (await pg.evaluate(([a, b]) => window.__edit.norm(a) === window.__edit.norm(b), [got, e.value]));
        if (!ok) lost.push(Object.assign({}, e, { got: got === undefined ? "(field not shown after reopening)" : got }));
      }
      return { edits, lost };
    }
    async function toggleTest(id) {
      await loadProfile(id); await openForm();
      const list = await pg.evaluate(() => window.__edit.toggles());
      const lost = [];
      for (const t of list) {
        await loadProfile(id); await openForm();
        const now = await pg.evaluate((k) => window.__edit.flip(k), t.key);
        if (now === null) continue;
        await pg.waitForTimeout(1200);
        await openForm();
        const after = await pg.evaluate((k) => window.__edit.toggleState(k), t.key);
        if (after !== now) lost.push(Object.assign({}, t, { value: now, got: after === null ? "(not shown after reopening)" : after, tag: "toggle" }));
      }
      return { edits: list, lost };
    }
    async function deleteTest(id) {
      await loadProfile(id); await openForm();
      const kinds = await pg.evaluate(() => window.__edit.rowKinds());
      const lost = [];
      for (const k of kinds) {
        await loadProfile(id); await openForm();
        const ok = await pg.evaluate((u) => window.__edit.deleteFirst(u), k.unit);
        if (!ok) continue;
        await pg.waitForTimeout(1200);
        await openForm();
        const after = (await pg.evaluate(() => window.__edit.rowKinds())).find((x) => x.unit === k.unit) || { count: 0, first: null };
        const norm = (arr) => arr ? arr.map((v) => String(v).replace(/[,\s]/g, "").toLowerCase()) : arr;
        const isBlank = (arr) => !arr || arr.every((v) => v === "" || v === "0" || v === "INR" || v === "USD" || v === "null" || /^[a-z_]+$/.test(v) && v.length < 25);
        if (after.count === k.count && k.count === 1 && isBlank(after.first)) {
          // the section is still answered "Yes", so an empty row is offered — the deleted data didn't come back
        } else if (after.count !== k.count - 1) lost.push({ label: k.unit, key: k.unit, value: (k.count - 1) + " rows", got: after.count + " rows " + JSON.stringify(after.first).slice(0, 120), tag: "delete" });
        else if (k.second && JSON.stringify(norm(after.first)) !== JSON.stringify(norm(k.second))) lost.push({ label: k.unit + " (next row's values after deleting the first)", key: k.unit, value: JSON.stringify(k.second).slice(0, 140), got: JSON.stringify(after.first).slice(0, 140), tag: "delete" });
      }
      return { edits: kinds, lost };
    }
    return { context, errors, editAndReopen, toggleTest, deleteTest };
  }

  const ids = ONLY.length ? ONLY : DEFAULT_PROFILES[PAGE];
  let realFailures = 0, totalEdited = 0, next = 0;
  async function run() {
    const w = await makeWorker();
    while (next < ids.length) {
      const id = ids[next++];
      w.errors.length = 0;
      if (DELETES) {
        const r = await w.deleteTest(id);
        totalEdited += r.edits.length; realFailures += r.lost.length;
        console.log([(r.lost.length ? "✗ " : "✓ ") + id + ": " + r.edits.length + " row kinds (" + r.edits.map((k) => k.unit + "×" + k.count).join(", ") + "), first row deleted each, " + r.lost.length + " problem(s)" + (w.errors.length ? ", " + w.errors.length + " page error(s)" : "")]
          .concat(r.lost.map((f) => "    " + f.label + ": expected " + f.value + " → got " + f.got))
          .concat(w.errors.slice(0, 5).map((e) => "    page error: " + e)).join("\n"));
        continue;
      }
      if (TOGGLES) {
        const r = await w.toggleTest(id);
        totalEdited += r.edits.length; realFailures += r.lost.length;
        console.log([(r.lost.length ? "✗ " : "✓ ") + id + ": " + r.edits.length + " toggles flipped one at a time, " + r.lost.length + " didn't stick" + (w.errors.length ? ", " + w.errors.length + " page error(s)" : "")]
          .concat(r.lost.map((f) => "    " + f.label + "  [" + f.key + "]  set " + f.value + " → reopened as " + f.got))
          .concat(w.errors.slice(0, 5).map((e) => "    page error: " + e)).join("\n"));
        continue;
      }
      const batch = await w.editAndReopen(id);
      totalEdited += batch.edits.length;
      const confirmed = [];
      for (const f of batch.lost) {
        const alone = await w.editAndReopen(id, [f.key]);
        if (alone.edits.length && alone.lost.length) confirmed.push(alone.lost[0]);
        else if (VERBOSE) console.log("  (batch-only) " + id + " " + f.key + " — " + f.label);
      }
      realFailures += confirmed.length;
      const lines = [(confirmed.length ? "✗ " : "✓ ") + id + ": " + batch.edits.length + " fields edited, " + batch.lost.length + " lost in the batch, " + confirmed.length + " lost when edited alone" + (w.errors.length ? ", " + w.errors.length + " page error(s)" : "")];
      confirmed.forEach((f) => lines.push("    " + f.label + "  [" + f.tag + " " + f.key + "]  typed " + JSON.stringify(f.value) + " → reopened as " + JSON.stringify(f.got)));
      w.errors.slice(0, 5).forEach((e) => lines.push("    page error: " + e));
      console.log(lines.join("\n"));
    }
    await w.context.close();
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, ids.length) }, run));
  await browser.close();
  server.kill();
  console.log("\n" + totalEdited + " field edits across " + ids.length + " profile(s); " + realFailures + " field(s) lost their value when edited alone on " + PAGE);
  process.exit(realFailures ? 1 : 0);
})();
