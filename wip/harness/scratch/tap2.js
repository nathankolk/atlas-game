'use strict';
// Phone: tap whole-pixel points all over the map; compare where the click lands and what it hits
// with what elementFromPoint says is under the tapped point.
const path = require('path');
const smoke = require('../smoke.js');
const { Check, openLevel, OPT } = smoke;
OPT.mobile = true;
OPT.root = path.join(__dirname, '..', 'app-copy');
(async () => {
  const t = new Check('tap2');
  const sess = await t.open();
  const page = sess.page;
  await openLevel(sess, process.argv[2] || 'world');
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener('click', e => { e.stopPropagation(); window.__clicks.push({ x: e.clientX, y: e.clientY, el: e.target }); }, true);
  });
  let n = 0, moved = 0, retarget = 0; const dx = {}, samples = [];
  for (let i = 0; i < 60; i++) {
    const x = 20 + Math.floor(Math.random() * 350), y = 240 + Math.floor(Math.random() * 300);
    await page.evaluate(() => { window.__clicks.length = 0; });
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(650);   // stay clear of double-tap
    const r = await page.evaluate(([x, y]) => {
      const c = window.__clicks[0];
      if (!c) return null;
      const under = document.elementFromPoint(x, y);
      const underClick = document.elementFromPoint(c.x, c.y);
      return { cx: c.x, cy: c.y, sameAsUnder: c.el === under, sameAsUnderClick: c.el === underClick, cls: c.el.getAttribute && c.el.getAttribute('class'), underCls: under && under.getAttribute('class') };
    }, [x, y]);
    if (!r) { samples.push('no click at ' + x + ',' + y); continue; }
    n++;
    const k = (r.cx - x) + ',' + (r.cy - y);
    dx[k] = (dx[k] || 0) + 1;
    if (r.cx !== x || r.cy !== y) moved++;
    if (!r.sameAsUnder) { retarget++; if (samples.length < 10) samples.push('tap ' + x + ',' + y + ' -> click ' + r.cx + ',' + r.cy + ' on ' + r.cls + ' (under tap: ' + r.underCls + ', click target is under click point: ' + r.sameAsUnderClick + ')'); }
  }
  console.log('taps with a click:', n, 'click moved:', moved, 'target differs from element under the tap:', retarget);
  console.log('offsets (dx,dy -> count):', JSON.stringify(dx));
  samples.forEach(s => console.log('  ' + s));
  await sess.close();
})().catch(e => { console.error(e); process.exit(1); });
