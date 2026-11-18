// Three short checks.
//  A  shown places on a phone: how much of the state/country a pick-the-capital question shows is under the HUD
//  B  Reduce motion (OS, Settings) against motion allowed: length of a flight to the next country, glide after a drag
//  C  the hand cursor after the globe turns under a resting mouse
//   node misc.js [--parts=A,B,C]
'use strict';
const path = require('path');
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const parts = opt('parts', 'A,B,C').split(',');
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, 'shots', name + '.png') });

// Waits until the globe's view has not changed for 400 ms
const still = page => page.evaluate(() => new Promise(resolve => {
  const g = window.__atlas.globe;
  let last = JSON.stringify(g.getView()), since = performance.now();
  const tick = () => {
    const now = JSON.stringify(g.getView());
    if (now !== last) { last = now; since = performance.now(); }
    if (performance.now() - since > 400) return resolve();
    setTimeout(tick, 30);
  };
  tick();
}));

// Of the shown place's outline points: how many are under each HUD element, and how many off the stage
const cover = page => page.evaluate(() => {
  const A = window.__atlas, m = A.map, g = A.globe;
  const info = m.promptKey ? g.featureInfo(m.layer, m.promptKey) : null;
  if (!info) return null;
  const hr = document.getElementById('globe-host').getBoundingClientRect();
  const sr = document.getElementById('map-wrap').getBoundingClientRect();
  const HUD = { card: '#prompt', actions: '#game-screen .game-actions', mapctl: '#game-screen .mapctl', tally: '#game-legend', bar: '#game-screen .gamebar' };
  const rects = Object.keys(HUD).map(n => { const el = document.querySelector(HUD[n]); const r = el && !el.hidden ? el.getBoundingClientRect() : null; return r && r.width ? { n: n, r: r } : null; }).filter(Boolean);
  const out = { name: A.state.current, total: 0, off: 0, under: {} };
  const visit = c => {
    if (typeof c[0] !== 'number') return c.forEach(visit);
    const p = g.project(c);
    out.total++;
    if (!p.visible) { out.off++; return; }
    const x = hr.left + p.x, y = hr.top + p.y;
    if (x < sr.left || x > sr.right || y < sr.top || y > sr.bottom) { out.off++; return; }
    for (const q of rects) if (x >= q.r.left && x <= q.r.right && y >= q.r.top && y <= q.r.bottom) { out.under[q.n] = (out.under[q.n] || 0) + 1; break; }
  };
  visit(info.feature.geometry.coordinates);
  const a = g.project(g.anchor(m.layer, m.promptKey));
  const ax = hr.left + a.x, ay = hr.top + a.y;
  out.anchorUnder = (rects.find(q => ax >= q.r.left && ax <= q.r.right && ay >= q.r.top && ay <= q.r.bottom) || {}).n || null;
  return out;
});

(async () => {
  if (parts.includes('A')) {
    for (const [key, names, shoot] of [
      ['us-state-to-capital', ['Mississippi', 'Louisiana', 'Florida', 'Alabama', 'Texas', 'Maine', 'Hawaii', 'Georgia'], ['Mississippi']],
      ['capitals-africa', ['Madagascar', 'South Africa', 'Mauritius', 'Mozambique', 'Somalia', 'Lesotho'], ['Madagascar']]]) {
      for (const size of ['p390', 'p360']) {
        const h = await open({ size: size, reducedMotion: false });
        const page = h.page;
        const arg = await page.evaluate(k => window.__atlas.levelByKey(k).arg, key);
        await startLevel(page, arg, { practice: names });
        const rows = [];
        for (let i = 0; i < names.length; i++) {
          await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 20000 });
          await still(page);
          const c = await cover(page);
          if (c) rows.push(c.name + ' ' + JSON.stringify(c.under) + ' off ' + c.off + ' of ' + c.total + (c.anchorUnder ? ' ANCHOR under ' + c.anchorUnder : ''));
          if (c && shoot.includes(c.name)) await shot(page, 'shown-' + size + '-' + c.name.replace(/\W+/g, '-'));
          const cur = c && c.name;
          await page.evaluate(() => document.getElementById('skip-btn').click());
          const more = await page.waitForFunction(n => { const st = window.__atlas.state; return (document.querySelector('.screen.active') || {}).id !== 'game-screen' || (st.current && st.current !== n && !st.interactionLocked); }, cur, { timeout: 20000 }).then(() => true, () => false);
          if (!more || await page.evaluate(() => (document.querySelector('.screen.active') || {}).id !== 'game-screen')) break;
        }
        console.log('A ' + size + ' ' + key + ':\n   ' + rows.join('\n   ') + '\n   errors ' + JSON.stringify(h.errors));
        await h.close();
      }
    }
  }

  if (parts.includes('B')) {
    for (const [label, o] of [['motion allowed', {}], ['OS reduce', { reducedMotion: true }], ['Settings reduce', { seedStorage: { 'atlas-motion': 'reduce' } }]]) {
      const h = await open(Object.assign({ size: 'd1280' }, o));
      const page = h.page;
      const arg = await page.evaluate(() => window.__atlas.levelByKey('capitals-world').arg);
      await startLevel(page, arg, { practice: ['New Zealand', 'Canada', 'South Africa', 'Japan'] });
      await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 20000 });
      await still(page);
      // Skip: sample the view until the next question has been up for 700 ms
      const flight = await page.evaluate(() => new Promise(resolve => {
        const A = window.__atlas, g = A.globe, first = A.state.current;
        const views = [];
        let last = JSON.stringify(g.getView()), nextAt = 0;
        document.getElementById('skip-btn').click();
        const tick = () => {
          const t = performance.now(), now = JSON.stringify(g.getView());
          if (now !== last) { views.push(Math.round(t)); last = now; }
          if (!nextAt && A.state.current && A.state.current !== first) nextAt = t;
          if (nextAt && t - nextAt > 1500) return resolve({ changes: views.length, span: views.length ? views[views.length - 1] - views[0] : 0 });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      // A quick drag, then watch for the glide
      const mid = await page.evaluate(() => { const r = document.getElementById('map-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.65 }; });
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.down();
      await page.mouse.move(mid.x - 60, mid.y, { steps: 2 }); await page.waitForTimeout(120); await page.mouse.move(mid.x - 260, mid.y, { steps: 4 });
      await page.mouse.up();
      const v1 = await page.evaluate(() => JSON.stringify(window.__atlas.globe.getView()));
      await page.waitForTimeout(1200);
      const v2 = await page.evaluate(() => JSON.stringify(window.__atlas.globe.getView()));
      const css = await page.evaluate(() => ({ reduced: document.documentElement.dataset.motion || '', dur: getComputedStyle(document.getElementById('prompt')).transitionDuration }));
      console.log('B ' + label + ': flight to next country ' + flight.changes + ' view changes over ' + flight.span + ' ms; after a drag the view ' + (v1 === v2 ? 'stayed' : 'glided on') + '; ' + JSON.stringify(css) + ' errors ' + JSON.stringify(h.errors));
      await h.close();
    }
  }

  if (parts.includes('C')) {
    const h = await open({ size: 'd1280' });
    const page = h.page;
    await startLevel(page, 'Europe');
    await page.waitForFunction(() => !window.__atlas.state.interactionLocked, null, { timeout: 20000 });
    await still(page);
    const pt = await page.evaluate(() => { const A = window.__atlas, g = A.globe; const hr = document.getElementById('globe-host').getBoundingClientRect(); const p = g.project(g.anchor('world', 'name:France')); return { x: hr.left + p.x, y: hr.top + p.y }; });
    await page.mouse.move(pt.x - 5, pt.y - 5); await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(300);
    const cur = () => page.evaluate(() => document.getElementById('globe-host').style.getPropertyValue('--globe-cursor'));
    const c1 = await cur();
    // The globe turns under the resting mouse: the mid-Atlantic comes under it
    await page.evaluate(() => { const g = window.__atlas.globe, v = g.getView(); g.setView({ lon: v.lon - 40, lat: v.lat - 15, k: v.k }); });
    await page.waitForTimeout(500);
    const c2 = await cur();
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(900);
    const c3 = await cur();
    const under = await page.evaluate(([x, y]) => { const A = window.__atlas, g = A.globe; const hr = document.getElementById('globe-host').getBoundingClientRect(); const hit = g.pick ? g.pick(x - hr.left, y - hr.top) : null; return hit ? hit.key : null; }, [pt.x, pt.y]);
    console.log('C cursor over France "' + c1 + '", after the view put the sea under the mouse "' + c2 + '", after 12 arrow-key turns "' + c3 + '" (under the mouse now: ' + under + ') errors ' + JSON.stringify(h.errors));
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
