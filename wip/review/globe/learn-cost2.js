// How long Europe's Learn ladder holds the main thread when Russia's name is first placed (anchorInBox):
// time from the first to the last of its 900 d3.geoContains calls, and the longest task around it.
//   node learn-cost2.js [--size=d1280] [--throttle=1] [--runs=3] [--shot=name]
'use strict';
const path = require('path');
const { open } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280'), throttle = Number(opt('throttle', 1)), runs = Number(opt('runs', 3)), shot = opt('shot', '');
(async () => {
  for (const withRussia of [false, true]) {
    const res = [];
    for (let i = 0; i < runs; i++) {
      const h = await open({ size: size });
      const page = h.page;
      const cdp = await h.context.newCDPSession(page);
      if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.evaluate(withRussia => {
        const A = window.__atlas, names = A.levelByKey('europe').names().slice();
        names.splice(names.indexOf('Russia'), 1); names.push('Russia');
        localStorage.setItem('atlas-learn', JSON.stringify({ europe: { order: names, level: names.length - (withRussia ? 0 : 1), savedAt: Date.now() } }));
        const orig = d3.geoContains;
        window.__gc = { n: 0, first: 0, last: 0 };
        d3.geoContains = function (f, p) { const g = window.__gc; if (!g.n) g.first = performance.now(); const r = orig(f, p); g.n++; if (g.n % 900 === 0) g.last = performance.now(); return r; };
        window.__long = [];
        new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
        window.__t0 = performance.now();
        A.startGame('Europe', { learn: true });
      }, withRussia);
      await page.waitForFunction(() => { const A = window.__atlas, st = A.state; return st.learn && st.learn.phase === 'study' && A.map.round === st.roundId && A.map.drawn && A.map.labels.length > 0; }, null, { timeout: 120000 });
      const up = await page.evaluate(() => Math.round(performance.now() - window.__t0));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => ({ n: window.__gc.n, grid: Math.round(window.__gc.last - window.__gc.first), long: window.__long.slice(), labels: window.__atlas.map.labels.map(l => l.name).includes('Russia'), spot: (window.__atlas.map.labels.find(l => l.name === 'Russia') || {}).lonlat }));
      res.push('up ' + up + ' ms, geoContains ' + r.n + ' calls over ' + r.grid + ' ms, long tasks ' + JSON.stringify(r.long) + (r.spot ? ', Russia at ' + r.spot.map(v => v.toFixed(1)) : ''));
      if (shot && withRussia && i === 0) await page.screenshot({ path: path.join(__dirname, 'shots', shot + '.png') });
      await h.close();
    }
    console.log(size + ' x' + throttle + (withRussia ? ' Russia shown: ' : ' Russia not yet shown: ') + '\n   ' + res.join('\n   '));
  }
})().catch(e => { console.error(e); process.exit(1); });
