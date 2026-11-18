'use strict';
// Phone: what does a tap on a tiny island's hit zone actually hit?
const path = require('path');
const pw = require('playwright');
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (o) => orig(Object.assign({}, o, { args: (o.args || []).concat(['--disable-gpu-compositing']) }));
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
const fs = require('fs');
// reuse the suite's in-page probe
const src = fs.readFileSync(path.join(__dirname, '..', 'smoke.js'), 'utf8');
const a = src.indexOf('function installMapProbe() {');
const b = src.indexOf('\nconst MapAdapter = {');
const installMapProbe = eval('(' + src.slice(a, b).trim() + ')');
(async () => {
  const h = await launch({ mobile: true, dpr: 2, root: ROOT });
  const { page, url, context } = h;
  await context.addInitScript(installMapProbe);
  await page.goto(url + '?play=world', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  await page.evaluate(() => {
    window.__clicks = [];
    const s = window.__atlas.state;
    const nameOf = el => { const f = el && el.__data__; return f ? (s.canonicalByFeature.get('id:' + f.id) || (f.properties && f.properties.name)) : null; };
    document.addEventListener('click', e => window.__clicks.push({ tag: e.target.tagName, cls: e.target.getAttribute('class'), name: nameOf(e.target), x: e.clientX, y: e.clientY }), true);
    window.__nameAt = (x, y) => { const el = document.elementFromPoint(x, y); return { cls: el && el.getAttribute('class'), name: nameOf(el) }; };
  });
  for (const name of ['Saint Kitts and Nevis', 'Antigua and Barbuda', 'Grenada', 'Barbados', 'Malta', 'Luxembourg', 'Tuvalu', 'Nauru', 'Singapore', 'Bahrain', 'Comoros', 'Mauritius']) {
    const loc = await page.evaluate(n => { const s = window.__atlas.state; if (!s.featureByCanonical.get(n)) return { error: 'none' }; return window.__smokeMap.locate(n, 0); }, name);
    if (loc.error || loc.miss) { console.log(name, JSON.stringify(loc)); continue; }
    await page.evaluate(() => { window.__clicks.length = 0; });
    await page.touchscreen.tap(loc.x, loc.y);
    await page.waitForTimeout(150);
    const got = await page.evaluate(([x, y]) => ({ clicks: window.__clicks.slice(), at: window.__nameAt(x, y) }), [loc.x, loc.y]);
    console.log(name, 'score', loc.score, 'at', loc.x.toFixed(1), loc.y.toFixed(1), '->', JSON.stringify(got));
    await page.waitForTimeout(450);
  }
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
