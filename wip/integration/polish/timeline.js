// Where the time to Home goes: resource timings and marks, for one cold load
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const root = process.argv[2] === 'old' ? path.join(S, 'work/integration/globe-stage/old-app/public') : '/home/user/atlas-game/public';
const q = process.argv[3] || '';
(async () => {
  const h = await launch({ root, seedStorage: { 'atlas-theme': 'light' } });
  await h.context.addInitScript(() => {
    window.__home = null;
    const tick = () => { if (document.querySelectorAll('#menu-screen .level, #menu-content .region-card').length > 2) { window.__home = performance.now(); return; } setTimeout(tick, 2); };
    document.addEventListener('DOMContentLoaded', () => { window.__dcl = performance.now(); tick(); });
  });
  await h.page.goto(h.url + q);
  await h.page.waitForFunction(() => window.__home !== null, null, { timeout: 60000 }).catch(() => {});
  await h.page.waitForTimeout(1500);
  const r = await h.page.evaluate(() => ({
    dcl: Math.round(window.__dcl), home: Math.round(window.__home),
    nav: (n => ({ responseEnd: Math.round(n.responseEnd), domInteractive: Math.round(n.domInteractive), dclEnd: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }))(performance.getEntriesByType('navigation')[0]),
    res: performance.getEntriesByType('resource').map(e => [e.name.replace(location.origin, '').slice(0, 60), Math.round(e.startTime), Math.round(e.responseEnd)]),
    paint: performance.getEntriesByType('paint').map(e => [e.name, Math.round(e.startTime)]),
    keys: window.__atlas ? window.__atlas.LEVELS.map(l => l.key).join(' ') : ''
  }));
  console.log(JSON.stringify(r, null, 1));
  await h.close();
})();
