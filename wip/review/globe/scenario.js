// A round with marks of every kind, then the picture after: turning and zooming, a theme change (the OS scheme
// with the theme on "Match system"), a map-style change, a resize, and "View on the map". Screenshots into
// shots/scn-<name>-*.png; prints what the map holds at each step.
//   node scenario.js [--size=d1280] [--which=find,learn,pin,cities]
'use strict';
const path = require('path');
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280');
const which = opt('which', 'find,learn,pin,cities').split(',');
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, 'shots', 'scn-' + size + '-' + name + '.png') });
const state = page => page.evaluate(() => {
  const A = window.__atlas, m = A.map, g = A.globe;
  const marks = {}; m.marks.forEach((v, k) => { marks[k.slice(5)] = v; });
  const dotMarks = {}; m.dotMarks.forEach((v, k) => { dotMarks[k] = v; });
  return JSON.stringify({ marks: marks, dotMarks: dotMarks, outlines: m.outlines.map(o => o.kind), labels: m.labels.length, view: Object.values(g.getView()).map(v => +v.toFixed(2)), cls: document.getElementById('map-wrap').className, theme: document.documentElement.dataset.theme, imagery: (g.stats().imagery || {}).status, clear: Object.values(m.clear).map(Math.round), atHome: Math.abs(g.getView().k - m.home.k) < 1e-6 });
});
// Answers the question in play with real clicks: right = on the place, wrong = on another unanswered one
async function answer(page, right) {
  const pt = await page.evaluate((right) => {
    const A = window.__atlas, st = A.state, g = A.globe, m = A.map;
    const hr = document.getElementById('globe-host').getBoundingClientRect();
    if (st.gameMode === 'us-city') {
      const dot = right ? m.dots.find(d => d.name === st.current) : m.dots.find(d => d.name !== st.current && !m.dotMarks.has(d.name));
      g.setView({ lon: dot.lonlat[0], lat: dot.lonlat[1], k: Math.max(g.getView().k, 40) });
      const p = g.project(dot.lonlat); return { x: hr.left + p.x, y: hr.top + p.y };
    }
    const byName = st.activeDataset === 'us' ? st.usFeatureByCanonical : st.activeDataset === 'province' ? st.provinceStores[st.currentProvinceRound.split('-')[0]].featureByCanonical : st.featureByCanonical;
    const target = 'name:' + byName.get(st.current).properties.name;
    const key = right ? target : Array.from(m.eligible).find(k => k !== target && !m.marks.has(k) && g.featureInfo(m.layer, k).radiusDeg > 2);
    const at = g.anchor(m.layer, key), info = g.featureInfo(m.layer, key);
    const px = 2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180);
    g.setView({ lon: at[0], lat: at[1], k: px < 40 ? g.getView().k * 40 / Math.max(px, 0.05) : g.getView().k });
    const p = g.project(at); return { x: hr.left + p.x, y: hr.top + p.y };
  }, right);
  await page.mouse.click(pt.x, pt.y);
}
const nextQuestion = (page, name) => page.waitForFunction((n) => { const st = window.__atlas.state; return (document.querySelector('.screen.active') || {}).id !== 'game-screen' || (st.current !== n && !st.interactionLocked); }, name, { timeout: 30000 });
const cur = page => page.evaluate(() => window.__atlas.state.current);

(async () => {
  if (which.includes('find')) {
    const h = await open({ size: size, seedStorage: { 'atlas-theme': 'system' }, colorScheme: 'light' });
    const page = h.page;
    await startLevel(page, 'Europe', { practice: ['France', 'Spain', 'Italy', 'Poland', 'Sweden', 'Ukraine'] });
    await page.waitForTimeout(400);
    // two first try, one second try, one missed twice, one skipped; one left unanswered
    let n;
    n = await cur(page); await answer(page, true); await nextQuestion(page, n);
    n = await cur(page); await answer(page, true); await nextQuestion(page, n);
    n = await cur(page); await answer(page, false); await page.waitForTimeout(900); await answer(page, true); await nextQuestion(page, n);
    n = await cur(page); await answer(page, false); await page.waitForTimeout(900); await answer(page, false); await nextQuestion(page, n);
    n = await cur(page); await page.keyboard.press('s'); await nextQuestion(page, n);
    await page.evaluate(() => window.__atlas.globe.setView(window.__atlas.map.home));
    await page.waitForTimeout(700);
    console.log('find: marks made      ', await state(page)); await shot(page, 'find-1-marks');
    // turn and zoom with the mouse
    const box = await page.evaluate(() => { const r = document.getElementById('map-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(box.x, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x - 180, box.y + 110, { steps: 6 }); await page.mouse.up();
    await page.mouse.wheel(0, -400); await page.waitForTimeout(1500);
    console.log('find: turned + zoomed ', await state(page)); await shot(page, 'find-2-turned');
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(900);
    console.log('find: dark scheme     ', await state(page)); await shot(page, 'find-3-dark');
    await page.keyboard.press('m'); await page.waitForTimeout(2500);
    console.log('find: satellite       ', await state(page)); await shot(page, 'find-4-sat-dark');
    await page.setViewportSize({ width: 900, height: 620 }); await page.waitForTimeout(1200);
    console.log('find: resized 900x620 ', await state(page)); await shot(page, 'find-5-resized');
    await page.keyboard.press('0'); await page.waitForTimeout(1500);
    console.log('find: recentred (0)   ', await state(page)); await shot(page, 'find-6-recentred');
    const fit = await page.evaluate(() => {
      // Is Europe's frame inside the clear area after Recentre in the resized window?
      const A = window.__atlas, g = A.globe, c = A.map.clear, box = [-25, 45, 34, 72];
      let out = 0, n = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (let i = 0; i <= 12; i++) for (const pt of [[box[0] + (box[1] - box[0]) * i / 12, box[2]], [box[0] + (box[1] - box[0]) * i / 12, box[3]], [box[0], box[2] + (box[3] - box[2]) * i / 12], [box[1], box[2] + (box[3] - box[2]) * i / 12]]) {
        const p = g.project(pt); n++; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        if (p.x < c.left || p.x > c.right || p.y < c.top || p.y > c.bottom) out++;
      }
      return { frameBox: [minX, minY, maxX, maxY].map(Math.round), clear: [c.left, c.top, c.right, c.bottom].map(Math.round), pointsOutside: out + '/' + n, view: g.getView(), home: A.map.home };
    });
    console.log('find: frame after recentre in the resized window', JSON.stringify(fit));
    await page.emulateMedia({ colorScheme: 'light' }); await page.keyboard.press('m'); await page.waitForTimeout(800);
    // finish and view on the map
    n = await cur(page); await page.keyboard.press('s');
    await page.waitForFunction(() => (document.querySelector('.screen.active') || {}).id === 'results-screen', null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#results-screen button')).find(x => /view on the map/i.test(x.textContent)); b.click(); });
    await page.waitForTimeout(1200);
    console.log('find: review          ', await state(page)); await shot(page, 'find-7-review');
    await page.mouse.move(box.x - 200, box.y); await page.mouse.down(); await page.mouse.move(box.x - 60, box.y - 40, { steps: 5 }); await page.mouse.up();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(1500);
    console.log('find: review, turned, dark, resized back', await state(page)); await shot(page, 'find-8-review-dark');
    // a click in review answers nothing
    const before = await state(page);
    await page.mouse.click(box.x, box.y + 40); await page.waitForTimeout(300);
    console.log('find: review click changes nothing:', before === await state(page));
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  }
  if (which.includes('learn')) {
    const h = await open({ size: size, seedStorage: { 'atlas-theme': 'system' }, colorScheme: 'light' });
    const page = h.page;
    await page.evaluate(async () => {
      const l = window.__atlas.levelByKey('africa');
      localStorage.setItem('atlas-learn', JSON.stringify({ africa: { order: l.names(), level: 24, savedAt: Date.now() } }));
    });
    await startLevel(page, 'Africa', { learn: true });
    await page.waitForTimeout(1500);
    console.log('learn: study 24       ', await state(page)); await shot(page, 'learn-1-study');
    await page.mouse.wheel(0, -300); await page.waitForTimeout(1800);
    console.log('learn: zoomed         ', await state(page)); await shot(page, 'learn-2-zoomed');
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(800);
    await page.setViewportSize({ width: 800, height: 700 }); await page.waitForTimeout(1500);
    console.log('learn: dark + 800x700 ', await state(page)); await shot(page, 'learn-3-dark-resized');
    await page.keyboard.press('m'); await page.waitForTimeout(2500);
    console.log('learn: satellite      ', await state(page)); await shot(page, 'learn-4-sat');
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  }
  if (which.includes('pin')) {
    const h = await open({ size: size, seedStorage: { 'atlas-theme': 'system' }, colorScheme: 'light' });
    const page = h.page;
    await startLevel(page, 'pin-europe');
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => { const r = document.getElementById('map-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(box.x - 150, box.y + 120); await page.waitForTimeout(400);
    await shot(page, 'pin-1-aim');
    await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    console.log('pin: dropped          ', await state(page), await page.evaluate(() => JSON.stringify(window.__atlas.state.pin.results))); await shot(page, 'pin-2-dropped');
    await page.mouse.move(box.x, box.y + 150); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 60, { steps: 5 }); await page.mouse.up();
    await page.mouse.wheel(0, -250); await page.waitForTimeout(1200);
    await page.emulateMedia({ colorScheme: 'dark' }); await page.keyboard.press('m'); await page.waitForTimeout(2500);
    await shot(page, 'pin-3-turned-dark-sat');
    await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(1500);
    console.log('pin: 700x900          ', await state(page)); await shot(page, 'pin-4-resized');
    await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    console.log('pin: next city        ', await state(page), await cur(page)); await shot(page, 'pin-5-next');
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  }
  if (which.includes('cities')) {
    const h = await open({ size: size });
    const page = h.page;
    await startLevel(page, 'northeast-cities', { practice: ['Boston', 'Newark', 'Buffalo', 'Portland', 'Pittsburgh'] });
    await page.waitForTimeout(400);
    let n;
    n = await cur(page); await answer(page, true); await nextQuestion(page, n);
    n = await cur(page); await answer(page, false); await page.waitForTimeout(900); await answer(page, true); await nextQuestion(page, n);
    n = await cur(page); await page.keyboard.press('s'); await nextQuestion(page, n);
    await page.evaluate(() => window.__atlas.globe.setView(window.__atlas.map.home));
    await page.waitForTimeout(600);
    console.log('cities: marks         ', await state(page)); await shot(page, 'cities-1-marks');
    await page.keyboard.press('m'); await page.waitForTimeout(2500); await shot(page, 'cities-2-sat');
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  }
})();
