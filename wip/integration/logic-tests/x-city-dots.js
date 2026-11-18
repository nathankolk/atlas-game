// Northeast Cities at the opening view, never zooming: a real tap on each city's dot as drawn.
// Is every one of the 40 answered first try?   node x-city-dots.js [--mobile]
'use strict';
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, { args: ((options && options.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require('./lib.js');
const MOBILE = process.argv.includes('--mobile');
(async () => {
  const h = await lib.launchApp(Object.assign({ seedStorage: { 'atlas-theme': 'light' }, fast: false }, MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 }));
  const page = h.page;
  await lib.startLevel(page, 'northeast-cities');
  const still = async () => {
    await page.evaluate(() => { window.__lastView = null; });
    await page.waitForFunction(() => {
      const g = window.__atlas.globe, v = g.getView();
      const key = v.lon.toFixed(5) + ',' + v.lat.toFixed(5) + ',' + v.k.toFixed(5);
      const same = window.__lastView === key; window.__lastView = key; return same;
    }, null, { timeout: 20000, polling: 250 });
  };
  let first = 0, asked = 0;
  const bad = [];
  for (let i = 0; i < 45; i++) {
    const s = await page.evaluate(() => window.__t.snapshot());
    if (s.screen !== 'game-screen' || !s.current) break;
    await still();
    const at = await page.evaluate(() => {
      const A = window.__atlas, name = A.state.current;
      const host = document.getElementById('globe-host').getBoundingClientRect();
      const pts = A.dotPoints();
      const me = pts.find(p => p.dot.name === name);
      const x = host.left + me.x, y = host.top + me.y;
      const top = document.elementFromPoint(x, y);
      // How far the drawn dot stands from the city itself, and from its nearest drawn neighbour
      const truth = A.globe.project(me.dot.lonlat);
      const near = Math.min.apply(null, pts.filter(p => p !== me && p.visible).map(p => Math.hypot(p.x - me.x, p.y - me.y)));
      return { name: name, x: x, y: y, visible: me.visible, onGlobe: !!top && document.getElementById('globe-host').contains(top),
        off: Math.hypot(truth.x - me.x, truth.y - me.y), near: near, score: A.state.score, k: A.globe.getView().k };
    });
    asked++;
    if (MOBILE) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    await page.waitForFunction(n => { const A = window.__atlas; return document.body.dataset.screen !== 'game' || (A.state.current && A.state.current !== n && !A.state.interactionLocked); }, at.name, { timeout: 15000 }).catch(() => {});
    const after = await page.evaluate(() => ({ score: window.__atlas.state.score, current: window.__atlas.state.current, screen: document.body.dataset.screen }));
    if (after.score - at.score === 2) first++;
    else {
      bad.push(at.name + ': +' + (after.score - at.score) + (at.visible ? '' : ' [not visible]') + (at.onGlobe ? '' : ' [under a control]') + ' dot ' + at.off.toFixed(1) + ' px off its city, nearest neighbour ' + at.near.toFixed(1) + ' px');
      // Still on the same question (a wrong tap): skip it so the round goes on
      if (after.current === at.name && after.screen === 'game') { await page.evaluate(() => document.getElementById('skip-btn').click()); await page.waitForTimeout(3200); }
    }
  }
  console.log('northeast-cities ' + (MOBILE ? '390x844 touch' : '1280x800 mouse') + ': ' + first + ' of ' + asked + ' answered first try by a tap on the drawn dot, no zoom');
  bad.forEach(b => console.log('  ' + b));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
