// What Learn's name placement costs: (1) the grid search for a place whose anchor lies outside the round's
// frame (anchorInBox: d3.geoContains x 900), per place, when a ladder opens with every name on the map;
// (2) placeLearnLabels each time a zoom settles (CPU profile, inclusive time).
//   node learn-cost.js [--size=d1280] [--levels=europe,asia,...] [--throttle=4]
'use strict';
const { open } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280');
const levels = opt('levels', 'europe,asia,africa,north-america,south-america,oceania').split(',');
const throttle = Number(opt('throttle', 1));

// Inclusive time (ms) of each named function in a CDP CPU profile
function inclusive(profile, names) {
  const byId = new Map();
  profile.nodes.forEach(n => byId.set(n.id, n));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)));
  const out = {};
  names.forEach(n => { out[n] = 0; });
  const walk = (node, inside) => {
    const fn = node.callFrame.functionName;
    const now = inside.slice();
    if (names.includes(fn) && !now.includes(fn)) now.push(fn);
    const s = self.get(node.id) || 0;
    now.forEach(n => { out[n] += s; });
    (node.children || []).forEach(c => walk(byId.get(c), now));
  };
  walk(profile.nodes[0], []);
  Object.keys(out).forEach(k => { out[k] = Math.round(out[k] / 100) / 10; });
  return out;
}

(async () => {
  for (const key of levels) {
    const h = await open({ size: size });
    const page = h.page;
    const cdp = await h.context.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const info = await page.evaluate(k => {
      const A = window.__atlas, lv = A.levelByKey(k);
      const names = lv.names().slice();
      // Russia last, so that it is the newest name where it is in the level
      const i = names.indexOf('Russia');
      if (i >= 0) { names.splice(i, 1); names.push('Russia'); }
      const all = {};
      all[k] = { order: names, level: names.length, savedAt: Date.now() };
      localStorage.setItem('atlas-learn', JSON.stringify(all));
      window.__gc = { n: 0, ms: 0, by: {} };
      const orig = d3.geoContains;
      d3.geoContains = function (f, p) {
        const t = performance.now();
        const r = orig(f, p);
        const dt = performance.now() - t;
        const nm = (f && f.properties && f.properties.name) || '?';
        const g = window.__gc;
        g.n++; g.ms += dt;
        const b = g.by[nm] || (g.by[nm] = { n: 0, ms: 0 });
        b.n++; b.ms += dt;
        return r;
      };
      window.__long = [];
      try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
      return { arg: lv.arg, n: names.length };
    }, key);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    await page.evaluate(a => { window.__t0 = performance.now(); window.__atlas.startGame(a, { learn: true }); }, info.arg);
    await page.waitForFunction(() => {
      const A = window.__atlas, st = A.state;
      return st.learn && st.learn.phase === 'study' && A.map.round === st.roundId && A.map.drawn && A.map.labels.length > 0;
    }, null, { timeout: 60000 });
    const upMs = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    await page.waitForTimeout(800);
    const p1 = (await cdp.send('Profiler.stop')).profile;
    const start = await page.evaluate(() => {
      const g = window.__gc;
      const by = Object.keys(g.by).map(k => k + ' ' + g.by[k].n + ' calls ' + Math.round(g.by[k].ms) + ' ms');
      const out = { calls: g.n, ms: Math.round(g.ms), by: by, labels: window.__atlas.map.labels.length, long: window.__long.slice() };
      window.__gc = { n: 0, ms: 0, by: {} };
      window.__long.length = 0;
      window.__settles = 0;
      window.__atlas.globe.on('settle', () => { window.__settles++; });
      return out;
    });
    console.log(size + ' x' + throttle + ' ' + key + ' (' + info.n + ' names): study up after ' + upMs + ' ms; geoContains ' + start.calls + ' calls, ' + start.ms + ' ms; ' +
      JSON.stringify(start.by) + '; labels ' + start.labels + '; long tasks ' + JSON.stringify(start.long) + '; profile ' + JSON.stringify(inclusive(p1, ['anchorInBox', 'placeLearnLabels', 'learnAnchor', 'startLearnLevel', 'frameMap', 'setupMap'])));

    // Zoom in three times, letting the view settle each time
    const mid = await page.evaluate(() => { const r = document.getElementById('map-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; });
    await page.mouse.move(mid.x, mid.y);
    await cdp.send('Profiler.start');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
      await page.waitForTimeout(1500);
    }
    const p2 = (await cdp.send('Profiler.stop')).profile;
    const after = await page.evaluate(() => ({ settles: window.__settles, calls: window.__gc.n, labels: window.__atlas.map.labels.length, long: window.__long.slice(), k: window.__atlas.globe.getView().k }));
    console.log('   zoom: ' + after.settles + ' settles, geoContains calls ' + after.calls + ', labels ' + after.labels + ', k ' + after.k.toFixed(2) + ', long tasks ' + JSON.stringify(after.long) +
      ', profile ' + JSON.stringify(inclusive(p2, ['placeLearnLabels', 'anchorInBox', 'learnAnchor', 'drawMapOverlay', 'drawLearnLabels'])) + ' errors ' + JSON.stringify(h.errors));
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
