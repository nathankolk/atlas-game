'use strict';
const path = require('path');
const fs = require('fs');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
const GAZ = eval('({' + fs.readFileSync(path.join(__dirname, '..', '.gaz.txt'), 'utf8') + '})');
(async () => {
  for (const mobile of [false, true]) {
    const h = await launch({ mobile, dpr: 1, root: ROOT });
    const { page, url } = h;
    for (const slug of ['pin-europe', 'pin-africa', 'pin-asia', 'pin-north-america', 'pin-south-america', 'pin-oceania', 'pin-world']) {
      await page.goto(url + '?play=' + slug);
      await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.pin && s.current && s.queue.length === s.totalQuestions - 1 && document.querySelectorAll('#world-map .country').length > 50; }, null, { timeout: 20000 });
      const res = await page.evaluate((GAZ) => {
        const s = window.__atlas.state;
        const svg = document.getElementById('world-map');
        const r = svg.getBoundingClientRect();
        const names = [s.current].concat(s.queue);
        const covered = [], outside = [];
        for (const n of names) {
          const xy = s.projection(GAZ[n]);
          const m = s.mapG.node().getScreenCTM();
          const x = xy[0] * m.a + xy[1] * m.c + m.e, y = xy[0] * m.b + xy[1] * m.d + m.f;
          const inside = x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1;
          if (!inside) { outside.push(n); continue; }
          const top = document.elementFromPoint(x, y);
          if (!top || !svg.contains(top)) covered.push(n + ' <' + (top && (top.id || top.className)) + '>');
        }
        return { n: names.length, covered, outside, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], wrapH: document.getElementById('map-wrap').clientHeight };
      }, GAZ);
      console.log(mobile ? 'M' : 'D', slug, JSON.stringify(res));
    }
    // wheel zoom test
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(200);
    console.log('wheel k =', await page.evaluate(() => window.__atlas.state.currentTransform && window.__atlas.state.currentTransform.k));
    // counts per continent
    console.log(await page.evaluate(() => { const s = window.__atlas.state; const c = {}; s.allFeatures.forEach(f => { const k = s.continentByFeature.get('id:' + f.id); if (k) c[k] = (c[k] || 0) + 1; }); return c; }));
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
