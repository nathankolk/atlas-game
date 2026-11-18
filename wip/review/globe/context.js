// A lost WebGL context in the middle of a round: restored, and never restored (Canvas 2D takes over).
const path = require('path');
const { open, startLevel } = require('./rlib.js');
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, 'shots', 'ctx-' + name + '.png') });
async function answerRight(page) {
  const pt = await page.evaluate(() => {
    const A = window.__atlas, st = A.state, g = A.globe, m = A.map;
    const hr = document.getElementById('globe-host').getBoundingClientRect();
    const key = 'name:' + st.featureByCanonical.get(st.current).properties.name;
    const at = g.anchor(m.layer, key), info = g.featureInfo(m.layer, key);
    const px = 2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180);
    g.setView({ lon: at[0], lat: at[1], k: px < 40 ? g.getView().k * 40 / Math.max(px, 0.05) : g.getView().k });
    const p = g.project(at); return { x: hr.left + p.x, y: hr.top + p.y, name: st.current };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((n) => { const st = window.__atlas.state; return (document.querySelector('.screen.active') || {}).id !== 'game-screen' || (st.current !== n && !st.interactionLocked); }, pt.name, { timeout: 30000 });
}
const info = page => page.evaluate(() => { const A = window.__atlas, s = A.globe.stats(); const marks = {}; A.map.marks.forEach((v, k) => { marks[k.slice(5)] = v; }); return JSON.stringify({ renderer: s.renderer, frames: s.frames, tri: s.triangles, imagery: s.imagery, marks: marks, cls: document.getElementById('map-wrap').className, toast: document.getElementById('toast').textContent, styleBtnHidden: document.getElementById('map-style-btn').hidden, score: A.state.score, credit: getComputedStyle(document.getElementById('sat-credit')).display }); });
const lose = page => page.evaluate(() => {
  const c = document.querySelector('#globe-host canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
  const ext = gl && gl.getExtension('WEBGL_lose_context');
  if (!ext) return 'no extension';
  window.__lose = ext; ext.loseContext(); return 'lost';
});
(async () => {
  for (const mode of ['restore', 'never']) {
    const h = await open({ size: 'd1280', seedStorage: { 'atlas-map-style': 'satellite' } });
    const page = h.page;
    await startLevel(page, 'Europe', { practice: ['France', 'Spain', 'Italy', 'Poland', 'Sweden'] });
    await page.waitForTimeout(1500);
    await answerRight(page); await answerRight(page);
    await page.evaluate(() => window.__atlas.globe.setView(window.__atlas.map.home));
    await page.waitForTimeout(800);
    console.log(mode, 'before        ', await info(page));
    console.log(mode, 'loseContext:', await lose(page));
    await page.waitForTimeout(800);
    await shot(page, mode + '-1-lost');
    console.log(mode, 'while lost    ', await info(page));
    if (mode === 'restore') {
      await page.evaluate(() => window.__lose.restoreContext());
      await page.waitForTimeout(2500);
      console.log(mode, 'restored      ', await info(page));
      await shot(page, mode + '-2-restored');
    } else {
      await page.waitForTimeout(5500);
      console.log(mode, 'after 6 s lost', await info(page));
      await shot(page, mode + '-2-fallback');
    }
    await answerRight(page);
    await page.evaluate(() => window.__atlas.globe.setView(window.__atlas.map.home));
    await page.waitForTimeout(1200);
    console.log(mode, 'answered again', await info(page));
    await shot(page, mode + '-3-after-answer');
    // the rest of the round, and the next round
    await answerRight(page); await answerRight(page);
    await page.waitForFunction(() => (document.querySelector('.screen.active') || {}).id === 'results-screen', null, { timeout: 20000 });
    console.log(mode, 'round finished; home controls:', await page.evaluate(() => { window.__atlas.showView('home'); return JSON.stringify({ note: Array.from(document.querySelectorAll('[data-imagery-note]')).map(e => e.textContent.trim()).filter(Boolean).slice(0, 1), mapStyle: localStorage.getItem('atlas-map-style') }); }));
    await startLevel(page, 'Oceania'); await page.waitForTimeout(1500);
    console.log(mode, 'next round    ', await info(page));
    await shot(page, mode + '-4-next-round');
    console.log(mode, 'errors', JSON.stringify(h.errors.slice(0, 5)));
    await h.close();
  }
})();
