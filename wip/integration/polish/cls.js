// Layout shift when the web fonts arrive late: fonts are held back, then released
//   node cls.js [--mobile] [--seed]
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const mobile = process.argv.includes('--mobile');
  const seed = process.argv.includes('--seed') ? JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-rich.json'), 'utf8')) : {};
  seed['atlas-theme'] = 'light';
  for (const view of ['', '#stats', '#settings']) {
    const h = await launch(Object.assign({ seedStorage: seed }, mobile ? { mobile: true, dpr: 2 } : {}));
    // The stylesheet comes at once; the font files 1.2 s late
    await h.context.route(/fonts\.gstatic\.com/, async route => { await new Promise(r => setTimeout(r, 1200)); try { await route.continue(); } catch (e) { /* closed */ } });
    await h.context.addInitScript(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4), (e.sources || []).slice(0, 2).map(s => s.node && (s.node.id || s.node.className || s.node.nodeName))]); } })).observe({ type: 'layout-shift', buffered: true });
    });
    await h.page.goto(h.url + view);
    await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 60000 });
    await h.page.waitForTimeout(700);
    const before = await h.page.evaluate(() => ({ cls: window.__cls, fonts: Array.from(document.fonts).filter(f => f.status === 'loaded').length }));
    await h.page.evaluate(() => document.fonts.ready);
    await h.page.waitForTimeout(2500);
    const after = await h.page.evaluate(() => ({ cls: +window.__cls.toFixed(4), fonts: Array.from(document.fonts).filter(f => f.status === 'loaded').length, shifts: window.__shifts.slice(-6) }));
    console.log((view || 'home') + (mobile ? ' phone' : ' desktop') + ': before fonts ' + before.cls.toFixed(4) + ' (' + before.fonts + ' loaded), after ' + after.cls + ' (' + after.fonts + ' loaded)', JSON.stringify(after.shifts));
    await h.close();
  }
})();
