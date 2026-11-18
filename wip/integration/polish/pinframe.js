'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const h = await launch({ seedStorage: { 'atlas-theme': 'light' } });
  await h.page.goto(h.url);
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 60000 });
  await h.page.evaluate(a => window.__atlas.startGame(a), process.argv[2] || 'pin-europe');
  await h.page.waitForFunction(() => window.__atlas.state.current && window.__atlas.map.drawn, null, { timeout: 60000 });
  await h.page.waitForTimeout(800);
  const r = await h.page.evaluate(() => {
    const A = window.__atlas, g = A.globe, host = document.getElementById('globe-host').getBoundingClientRect();
    const c = A.map.clear;
    const out = { clear: c, host: [host.left, host.top, host.width, host.height], view: g.getView(), home: A.map.home, cards: document.getElementById('prompt').getBoundingClientRect().toJSON() };
    out.radius = g.radiusPx();
    const pts = [[-21.9, 64.1, 'Reykjavik'], [-9.1, 38.7, 'Lisbon'], [23.7, 38, 'Athens'], [37.6, 55.75, 'Moscow'], [18.07, 59.33, 'Stockholm'], [14.2, 52, 'centre']];
    out.cities = pts.map(p => { const q = g.project([p[0], p[1]]); return p[2] + ' ' + Math.round(q.x) + ',' + Math.round(q.y); });
    out.stage = document.getElementById('map-wrap').getBoundingClientRect().toJSON();
    out.hostStyle = document.getElementById('globe-host').getAttribute('style');
    return out;
  });
  console.log(JSON.stringify(r));
  await h.close();
})();
