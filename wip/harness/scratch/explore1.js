'use strict';
const path = require('path');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
(async () => {
  for (const mobile of [false, true]) {
    const h = await launch({ mobile, dpr: 1, root: ROOT });
    const { page, url } = h;
    const t0 = Date.now();
    await page.goto(url + '?play=world');
    await page.waitForFunction(() => window.__atlas && window.__atlas.state.current && document.querySelectorAll('#world-map .country').length > 50, null, { timeout: 20000 });
    console.log(mobile ? 'MOBILE' : 'DESKTOP', 'world ready in', Date.now() - t0, 'ms');
    const res = await page.evaluate(() => {
      const s = window.__atlas.state;
      const svg = document.getElementById('world-map');
      const wrap = svg.getBoundingClientRect();
      const out = { total: 0, center: 0, grid: 0, outline: 0, none: [] };
      const names = [s.current].concat(s.queue);
      for (const name of names) {
        const f = s.featureByCanonical.get(name);
        const els = [...svg.querySelectorAll('.country')].filter(e => e.__data__ === f);
        out.total++;
        if (!els.length) { out.none.push(name + ' (no element)'); continue; }
        const el = els[0];
        const r = el.getBoundingClientRect();
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.__data__ === f; };
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        if (hit(cx, cy)) { out.center++; continue; }
        let found = false;
        for (const n of [5, 9, 15]) {
          for (let i = 0; i < n && !found; i++) for (let j = 0; j < n && !found; j++) {
            const x = r.left + (i + 0.5) * r.width / n, y = r.top + (j + 0.5) * r.height / n;
            if (x < wrap.left || x > wrap.right || y < wrap.top || y > wrap.bottom) continue;
            if (hit(x, y)) found = true;
          }
          if (found) break;
        }
        if (found) { out.grid++; continue; }
        const len = el.getTotalLength(), m = el.getScreenCTM();
        for (let i = 0; i < 64 && !found; i++) {
          const p = el.getPointAtLength(len * i / 64);
          const x = p.x * m.a + p.y * m.c + m.e, y = p.x * m.b + p.y * m.d + m.f;
          if (hit(x, y)) found = true;
        }
        if (found) { out.outline++; continue; }
        out.none.push(name + ' bbox ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
      return out;
    });
    console.log(JSON.stringify(res));
    console.log('errors', h.errors, 'blocked', h.netLog.blocked);
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
