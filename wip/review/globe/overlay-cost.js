// Script time per frame of the 2D overlay while a question outlines a country (Name It / capitals: kind
// 'prompt', drawn by the engine's draw.outline = a d3 path every frame) and the globe is being dragged.
//   node overlay-cost.js [--size=d1280] [--throttle=1] [--names=Russia,Canada,Chad] [--level=name-world]
'use strict';
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280'), throttle = Number(opt('throttle', 1));
const names = opt('names', 'Russia,Canada,Indonesia,Norway,Chad').split(',');
const levelKey = opt('level', 'name-world');

function inclusive(profile, fns) {
  const byId = new Map();
  profile.nodes.forEach(n => byId.set(n.id, n));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)));
  const out = {};
  fns.forEach(n => { out[n] = 0; });
  let total = 0;
  const walk = (node, inside) => {
    const fn = node.callFrame.functionName;
    const now = inside.slice();
    if (fns.includes(fn) && !now.includes(fn)) now.push(fn);
    const s = self.get(node.id) || 0;
    if (fn !== '(idle)' && fn !== '(program)' && fn !== '(root)' && fn !== '(garbage collector)') total += s;
    now.forEach(n => { out[n] += s; });
    (node.children || []).forEach(c => walk(byId.get(c), now));
  };
  walk(profile.nodes[0], []);
  out.allScript = total;
  Object.keys(out).forEach(k => { out[k] = out[k] / 1000; });
  return out;
}

(async () => {
  for (const name of names) {
    const h = await open({ size: size });
    const page = h.page;
    const cdp = await h.context.newCDPSession(page);
    const arg = await page.evaluate(k => window.__atlas.levelByKey(k).arg, levelKey);
    await startLevel(page, arg, { practice: [name] });
    await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const pts = await page.evaluate(() => {
      const A = window.__atlas, m = A.map;
      const info = m.promptKey ? A.globe.featureInfo(m.layer, m.promptKey) : null;
      let n = 0;
      const visit = c => { if (typeof c[0] === 'number') n++; else c.forEach(visit); };
      if (info) visit(info.feature.geometry.coordinates);
      return { points: n, outlines: m.outlines.map(o => o.kind), k: A.globe.getView().k };
    });
    const mid = await page.evaluate(() => { const r = document.getElementById('map-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 }; });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    const f0 = await page.evaluate(() => window.__atlas.globe.stats().frames);
    await cdp.send('Profiler.start');
    if (args.includes('--reveal')) {
      // Skip: the answer's outline breathes for 2.6 s with nothing else moving
      await page.evaluate(() => document.getElementById('skip-btn').click());
      await page.waitForTimeout(2500);
    } else {
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.down();
      for (let i = 1; i <= 30; i++) { await page.mouse.move(mid.x + (i % 2 ? 6 : -6) * Math.ceil(i / 2), mid.y); await page.waitForTimeout(120); }
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    const prof = (await cdp.send('Profiler.stop')).profile;
    const frames = (await page.evaluate(() => window.__atlas.globe.stats().frames)) - f0;
    const inc = inclusive(prof, ['drawMapOverlay', 'outline']);
    const per = v => (v / Math.max(frames, 1)).toFixed(2);
    console.log(size + ' x' + throttle + ' ' + levelKey + ' ' + name + ' (' + pts.points + ' points, outlines ' + JSON.stringify(pts.outlines) + ', k ' + pts.k.toFixed(2) + '): ' + frames + ' frames ' + (args.includes('--reveal') ? 'during the reveal' : 'while dragging') + '; per frame: overlay ' + per(inc.drawMapOverlay) +
      ' ms (outline ' + per(inc.outline) + ' ms), all script ' + per(inc.allScript) + ' ms  errors ' + JSON.stringify(h.errors));
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
