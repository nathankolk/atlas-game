const path = require('path');
const { open, startLevel } = require('./rlib.js');
(async () => {
  for (const size of ['d1280', 'p390']) {
    const h = await open({ size: size, dpr: 2 });
    const page = h.page;
    await startLevel(page, 'northeast-cities');
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const A = window.__atlas, g = A.globe, m = A.map;
      g.setView(m.home);
      const pts = m.dots.map(d => { const p = g.project(d.lonlat); return { name: d.name, x: p.x, y: p.y }; });
      const pairs = [];
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y); if (d < 12) pairs.push(pts[i].name + '~' + pts[j].name + ' ' + d.toFixed(1) + 'px'); }
      // Mark Newark missed and New York found as the game would, then look
      m.dotMarks.set('Newark', 'missed'); m.dotMarks.set('New York', 'found'); g.invalidate();
      const hr = document.getElementById('globe-host').getBoundingClientRect();
      const ny = pts.find(p => p.name === 'New York');
      return { pairs: pairs, order: m.dots.map(d => d.name).join(','), clip: { x: Math.max(0, hr.left + ny.x - 70), y: hr.top + ny.y - 60, width: 140, height: 120 } };
    });
    console.log(size, 'dot pairs closer than 12 px (two radii) at the opening view:', info.pairs.length, info.pairs.join('; '));
    console.log(size, 'draw order:', info.order.slice(0, 200));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'dots-nyc-' + size + '.png'), clip: info.clip });
    await h.close();
  }
})();
