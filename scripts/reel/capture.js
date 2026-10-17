// Captures full-page stills of the real WISING build, for scripts/reel/render.py.
//
//   (cd monitor-next && npm run build) && (cd monitor-next/out && python3 -m http.server 8099)
//   node scripts/reel/capture.js /path/to/stills
//
// Runs the docs/LAUNCH_REEL.md flow in a fresh browser: Rohan's Monitor, then
// Priya's salary typed into her India form, then her Monitor after Refresh.
// The India form loads Tailwind from cdn.tailwindcss.com; where that host is
// blocked, set REEL_TAILWIND_CSS to a locally compiled stylesheet and it is
// served in its place.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const BASE = process.env.REEL_BASE_URL || 'http://localhost:8099';

async function setup(viewport) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 });
  if (process.env.REEL_TAILWIND_CSS) {
    const css = fs.readFileSync(process.env.REEL_TAILWIND_CSS, 'utf8');
    await ctx.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'application/javascript',
      body: `window.tailwind={};(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);})();` }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  }
  await ctx.addInitScript(() => localStorage.setItem('wising_site_unlocked', 'true'));
  return { b, ctx };
}

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
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
async function shot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }
const wait = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const { b, ctx } = await setup({ width: 1280, height: 1600 });
  const m = await ctx.newPage();
  await m.goto(`${BASE}/?present=1`, { waitUntil: 'networkidle' }); await wait(m, 2500);
  // Clients → Rohan's Monitor
  await m.getByText('Open →').first().click(); await wait(m, 3500);
  await shot(m, 'rohan');
  await box(m, 'rohan', 'household', 'HOUSEHOLD · JOINT US RETURN', { up: 2 });
  await box(m, 'rohan', 'usTag', 'EXPOSED', { nth: 0 });
  await box(m, 'rohan', 'inTag', 'EXPOSED', { nth: 1 });
  await box(m, 'rohan', 'unpaid', 'Unpaid', {});
  await box(m, 'rohan', 'inRow', '$14,032');
  await box(m, 'rohan', 'inMissed', 'Q1 (due 15 Jun 2026) not paid', { up: 1 });
  await box(m, 'rohan', 'twice', 'Same income taxed by both countries');
  await box(m, 'rohan', 'twiceAmt', '$4,408', { nth: 0 });
  await box(m, 'rohan', 'disclose', 'Foreign asset & entity reporting');
  await box(m, 'rohan', 'fbar', '/ $10,000', { up: 3 });
  // Priya before
  await m.locator('select').filter({ hasText: 'Priya Mehta' }).first().selectOption({ label: 'Priya Mehta' }); await wait(m, 3000);
  await m.evaluate(() => scrollTo(0, 0));
  await shot(m, 'priya_before');
  await box(m, 'priya_before', 'household', 'HOUSEHOLD · JOINT US RETURN', { up: 2 });
  await box(m, 'priya_before', 'jointTax', '$87,212', { nth: 0 });
  await box(m, 'priya_before', 'priyaShare', '(11%)', { up: 0 });
  await box(m, 'priya_before', 'rohanShare', '(89%)', { up: 0 });
  // Priya's India form: Salary
  const f = await ctx.newPage();
  await f.goto(`${BASE}/layer1_india.html?client=c_priya_mehta`, { waitUntil: 'networkidle' }); await wait(f, 2000);
  await f.locator('span', { hasText: /^Employment$/ }).first().click(); await wait(f, 800);
  await f.getByText('3. Salary', { exact: false }).first().click(); await wait(f, 1200);
  await shot(f, 'form_0');
  await f.locator('label:has(#sal-has)').click(); await wait(f, 800);
  const gross = f.locator('xpath=//*[contains(normalize-space(.),"Gross Salary")]/following::input[1]').first();
  await gross.scrollIntoViewIfNeeded(); await f.evaluate(() => scrollTo(0, 0));
  await shot(f, 'form_1');
  const steps = ['2', '24', '2,40', '24,00', '2,40,00', '24,00,00', '24,00,000'];
  await gross.click();
  for (let i = 0; i < steps.length; i++) {
    await gross.fill(''); await gross.type(steps[i].replace(/,/g, ''), { delay: 10 }); await wait(f, 300);
    await shot(f, `form_type_${i}`);
  }
  await gross.press('Tab'); await wait(f, 1500);
  await shot(f, 'form_2');
  await box(f, 'form_2', 'where', 'none of this salary treated as earned', { up: 1 });
  await box(f, 'form_2', 'estimator', 'Est. Total Tax Liability', { up: 0 });
  // let the form persist, then refresh the Monitor
  await wait(f, 1500);
  await m.bringToFront();
  await m.getByText('↻ Refresh').first().click(); await wait(m, 3500);
  await m.evaluate(() => scrollTo(0, 0));
  await shot(m, 'priya_after');
  await box(m, 'priya_after', 'household', 'HOUSEHOLD · JOINT US RETURN', { up: 2 });
  await box(m, 'priya_after', 'jointTax', '$96,465', { nth: 0 });
  await box(m, 'priya_after', 'priyaShare', '(16%)');
  await box(m, 'priya_after', 'rohanShare', '(84%)');
  await box(m, 'priya_after', 'tds', 'Indian TDS', {});
  fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
  await b.close();
})();
