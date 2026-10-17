// Captures full-page stills of the real WISING build, for scripts/reel/render.py.
//
//   (cd monitor-next && npm run build) && (cd monitor-next/out && python3 -m http.server 8099)
//   node scripts/reel/capture.js /path/to/stills
//
// Runs the docs/LAUNCH_REEL.md flow in a fresh browser: the top of both
// intake forms, Priya's Monitor, her salary typed into the India form, then
// her Monitor and Reconciliation after Refresh. The intake forms load
// Tailwind from cdn.tailwindcss.com; where that host is blocked, set
// REEL_TAILWIND_DIR to a folder holding india.css and us.css compiled from
// each form, and they are served in its place.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const BASE = process.env.REEL_BASE_URL || 'http://localhost:8099';
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

async function setup(viewport) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 });
  const dir = process.env.REEL_TAILWIND_DIR;
  if (dir) {
    const css = { india: fs.readFileSync(path.join(dir, 'india.css'), 'utf8'), us: fs.readFileSync(path.join(dir, 'us.css'), 'utf8') };
    await ctx.route(/cdn\.tailwindcss\.com/, (r) => {
      const sheet = r.request().frame().url().includes('layer1_us') ? css.us : css.india;
      r.fulfill({ contentType: 'application/javascript',
        body: `window.tailwind={};(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(sheet)};(document.head||document.documentElement).appendChild(s);})();` });
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await ctx.addInitScript(() => localStorage.setItem('wising_site_unlocked', 'true'));
  return { b, ctx };
}

// boxes.json: where the reel's targets sit, to re-check render.py's coordinates after a UI change.
const boxes = {};
async function box(page, still, key, text, { nth = 0, pad = 6, up = 0 } = {}) {
  const r = await page.evaluate(({ text, nth, up }) => {
    const all = [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && (e.innerText || '').includes(text));
    const leaves = all.filter(e => ![...e.children].some(c => all.includes(c)));
    let e = leaves[nth]; if (!e) return null;
    for (let i = 0; i < up; i++) e = e.parentElement;
    const b = e.getBoundingClientRect();
    return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
  }, { text, nth, up });
  if (!r) { console.log('MISSING', still, key, text); return; }
  (boxes[still] ||= {})[key] = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}
async function shot(page, name, fullPage = true) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage }); }
const wait = (p, ms) => p.waitForTimeout(ms);
const navTo = (p, label) => p.locator('aside, nav').getByText(label, { exact: true }).first().click();

(async () => {
  const { b, ctx } = await setup({ width: 1280, height: 1600 });
  const m = await ctx.newPage();
  await m.goto(`${BASE}/?present=1`, { waitUntil: 'networkidle' }); await wait(m, 2500);
  await m.getByText('Open →').first().click(); await wait(m, 3000);

  // The US side of the split: top of the US intake form
  const u = await ctx.newPage();
  await u.goto(`${BASE}/layer1_us.html?client=c_rohan_mehta`, { waitUntil: 'networkidle' }); await wait(u, 2000);
  await shot(u, 'us_form', false);
  await box(u, 'us_form', 'year', 'US TAX YEAR', { up: 0 });
  await u.close();

  // Priya's Monitor before the edit
  await m.bringToFront();
  await m.locator('select').filter({ hasText: 'Priya Mehta' }).first().selectOption({ label: 'Priya Mehta' }); await wait(m, 3000);
  await m.evaluate(() => scrollTo(0, 0));
  await shot(m, 'priya_before');
  await box(m, 'priya_before', 'jointTax', '$87,212', { nth: 0 });
  await box(m, 'priya_before', 'rohanShare', '(89%)');

  // Priya's India form: Salary
  const f = await ctx.newPage();
  await f.goto(`${BASE}/layer1_india.html?client=c_priya_mehta`, { waitUntil: 'networkidle' }); await wait(f, 2000);
  await shot(f, 'india_form', false);
  await f.locator('span', { hasText: /^Employment$/ }).first().click(); await wait(f, 800);
  await f.getByText('3. Salary', { exact: false }).first().click(); await wait(f, 1200);
  await f.locator('label:has(#sal-has)').click(); await wait(f, 800);
  const gross = f.locator('xpath=//*[contains(normalize-space(.),"Gross Salary")]/following::input[1]').first();
  await f.evaluate(() => scrollTo(0, 0));
  await shot(f, 'form_1');
  const steps = ['2', '24', '240', '2400', '24000', '240000', '2400000'];
  await gross.click();
  for (let i = 0; i < steps.length; i++) {
    await gross.fill(''); await gross.type(steps[i], { delay: 10 }); await wait(f, 300);
    await shot(f, `form_type_${i}`);
  }
  await gross.press('Tab'); await wait(f, 1500);
  await shot(f, 'form_2');
  await box(f, 'form_2', 'where', 'none of this salary treated as earned', { up: 1 });

  // Priya's Monitor and Reconciliation after Refresh
  await wait(f, 1500);
  await m.bringToFront();
  await m.getByText('↻ Refresh').first().click(); await wait(m, 3500);
  await m.evaluate(() => scrollTo(0, 0));
  await shot(m, 'priya_after');
  await box(m, 'priya_after', 'jointTax', '$96,465', { nth: 0 });
  await box(m, 'priya_after', 'rohanShare', '(84%)');
  await box(m, 'priya_after', 'tds', 'Indian TDS');
  await navTo(m, 'Reconciliation'); await wait(m, 2500);
  await m.evaluate(() => scrollTo(0, 0));
  await shot(m, 'recon_after');
  await box(m, 'recon_after', 'salaryRow', 'not taxable in India', { up: 1 });
  await box(m, 'recon_after', 'unrelieved', '$3,873', { nth: 0 });

  // The brand mark for the end card, from the same paths the app's logo component draws
  const jsx = fs.readFileSync(path.join(__dirname, '../../monitor-next/components/WisingLogo.jsx'), 'utf8');
  const paths = jsx.match(/<path[\s\S]*?\/>/g).join('');
  const l = await ctx.newPage();
  await l.setContent(`<body style="margin:0;background:transparent"><svg width="834" height="611" viewBox="51 110 417.4 305.9">${paths}</svg></body>`);
  await l.locator('svg').screenshot({ path: `${OUT}/logo.png`, omitBackground: true });

  fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
  await b.close();
})();
