'use strict';
const path = require('path');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
(async () => {
  const h = await launch({ dpr: 1, root: ROOT });
  const { page, url } = h;
  let t = Date.now();
  const lap = (label) => { const n = Date.now(); console.log(String(n - t).padStart(6), label); t = n; };
  await page.goto(url + '?play=south-america', { waitUntil: 'domcontentloaded' });
  lap('goto');
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  lap('first question');
  for (let i = 0; i < 4; i++) {
    const pt = await page.evaluate(() => {
      const t0 = performance.now();
      const s = window.__atlas.state;
      const f = s.featureByCanonical.get(s.current);
      const el = [...document.querySelectorAll('#world-map .country')].find(e => e.__data__ === f);
      const r = el.getBoundingClientRect();
      const t1 = performance.now();
      const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      const top = document.elementFromPoint(x, y);
      const t2 = performance.now();
      return { x, y, ok: top && top.__data__ === f, find: t1 - t0, efp: t2 - t1 };
    });
    lap('locate ' + JSON.stringify(pt));
    await page.mouse.click(pt.x, pt.y);
    lap('click');
    await page.evaluate(() => window.__atlas.state.sequence.length);
    lap('evaluate after click');
    const t0 = Date.now(); let polls = 0;
    for (;;) { polls++; const s = await page.evaluate(() => { const s = window.__atlas.state; return { locked: s.interactionLocked, n: s.sequence.length }; }); if (!s.locked) break; await new Promise(r => setTimeout(r, 25)); }
    lap('advance (' + polls + ' polls)');
  }
  // frame timing
  const frames = await page.evaluate(() => new Promise(res => { const ts = []; let n = 0; const f = (t) => { ts.push(t); if (++n < 20) requestAnimationFrame(f); else res(ts.slice(1).map((t, i) => Math.round(t - ts[i]))); }; requestAnimationFrame(f); }));
  console.log('frame ms', frames.join(' '));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
