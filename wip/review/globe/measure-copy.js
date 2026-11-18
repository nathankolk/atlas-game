// M5 measurements: the app on the globe against the app before the overhaul (commit 1c74e1d,
// extracted to old-app/public), on this machine, driven with the same in-page input.
//   NODE_PATH=/opt/node-tools/node_modules node measure.js [--apps=new,old] [--sizes=desktop,phone] [--styles=chart,satellite] [--runs=3]
// Prints one JSON line per case and a table at the end; results also go to measure-results.json.
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
// --stock-gpu keeps the harness's own Chromium flags (GPU compositing on the software GL driver)
if (!process.argv.includes('--stock-gpu')) {
  chromium.launch = options => stockLaunch(Object.assign({}, options, {
    args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
  }));
}
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const APPS = opt('apps', 'new,old').split(',');
const SIZES = opt('sizes', 'desktop,phone').split(',');
const STYLES = opt('styles', 'chart,satellite').split(',');
const RUNS = Number(opt('runs', 3));
const ROOTS = { new: '/home/user/atlas-game/public', old: '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/integration/globe-stage/old-app/public' };
const KIND = name => name === 'old' ? 'old' : 'new';
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const round = (v, d) => v == null ? null : Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0);

// Installed before the page's own script: notes when the map can first take an answer, and
// when its imagery has finished loading
function probe(app) {
  const t = window.__m = { interactive: null, painted: null, imagery: null, sawLoading: false };
  const mapUp = () => {
    if (app === 'new') {
      const A = window.__atlas;
      return !!A && !!A.state.current && A.map.round === A.state.roundId && A.map.drawn && A.globe.stats().frames > 0;
    }
    const screen = document.getElementById('game-screen'), name = document.getElementById('prompt-country');
    return !!screen && screen.classList.contains('active') && document.querySelectorAll('#world-map .country').length > 100 && !!name && name.textContent.length > 1;
  };
  const tick = () => {
    const now = performance.now();
    if (t.interactive === null && mapUp()) {
      t.interactive = now;
      // Two animation frames on, what was just put up has been through a paint
      requestAnimationFrame(() => requestAnimationFrame(() => { t.painted = performance.now(); }));
    }
    const credit = document.getElementById('sat-credit');
    if (credit && /Loading/.test(credit.textContent)) t.sawLoading = true;
    if (t.interactive !== null && t.imagery === null && t.sawLoading && credit && !/Loading/.test(credit.textContent)) t.imagery = now;
    if (t.interactive === null || (t.imagery === null && now < 30000)) setTimeout(tick, 4);
  };
  document.addEventListener('DOMContentLoaded', tick);
}

// Runs in the page: a drag of `frames` steps then a wheel zoom in and out, one input event per
// animation frame. Returns frame intervals and, on the globe, the engine's own per-frame time.
async function drive(app, frames) {
  const el = document.getElementById(app === 'new' ? 'globe-host' : 'world-map');
  const box = el.getBoundingClientRect();
  const cx = Math.round(box.left + box.width / 2), cy = Math.round(Math.max(box.top, 0) + Math.min(box.height, innerHeight) / 2);
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const engine = () => app === 'new' ? window.__atlas.globe.stats().lastFrameMs : null;
  const run = async (steps, each) => {
    const gaps = [], own = [];
    let last = await frame();
    for (let i = 0; i < steps; i++) {
      each(i);
      const now = await frame();
      gaps.push(now - last);
      last = now;
      if (app === 'new') own.push(engine());
    }
    return { gaps: gaps, own: own };
  };
  const mouse = (target, type, x, y) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y }));
  const pointer = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
  const out = {};
  // Where the map stands, to show afterwards that the input moved it
  const where = () => app === 'new' ? JSON.stringify(window.__atlas.globe.getView()) : (document.querySelector('#world-map g') || el).getAttribute('transform');
  out.start = where();
  // Turn / pan: 4 px a frame, left then right
  if (app === 'new') pointer('pointerdown', cx, cy); else mouse(el, 'mousedown', cx, cy);
  let x = cx;
  out.turn = await run(frames, i => {
    x += i < frames / 2 ? -4 : 4;
    if (i === Math.floor(frames / 2)) out.farTurn = where();
    if (app === 'new') pointer('pointermove', x, cy); else mouse(window, 'mousemove', x, cy);
  });
  if (app === 'new') pointer('pointerup', x, cy); else mouse(window, 'mouseup', x, cy);
  await new Promise(resolve => setTimeout(resolve, 600));
  // Zoom: one wheel notch a frame, in then out
  out.zoom = await run(frames, i => {
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, view: window, deltaY: i < frames / 2 ? -40 : 40, deltaMode: 0, clientX: cx, clientY: cy }));
    if (i === Math.floor(frames / 2)) out.midZoom = where();
  });
  return out;
}

async function metrics(cdp) {
  const m = {};
  (await cdp.send('Performance.getMetrics')).metrics.forEach(x => { m[x.name] = x.value; });
  return m;
}
const delta = (a, b, frames) => ({
  script: round((b.ScriptDuration - a.ScriptDuration) * 1000 / frames, 2),
  task: round((b.TaskDuration - a.TaskDuration) * 1000 / frames, 2),
  styleLayout: round((b.LayoutDuration - a.LayoutDuration + b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000 / frames, 2)
});

async function one(app, size, style) {
  const seed = { 'atlas-theme': 'light' };
  if (style === 'satellite') seed['atlas-map-style'] = 'satellite';
  const dims = size === 'phone' ? { mobile: true, dpr: 2, width: 390, height: 844 } : { width: 1280, height: 800 };
  const result = { app: app, size: size, style: style, interactive: [], painted: [], imagery: [] };
  for (let i = 0; i < RUNS; i++) {
    const h = await launch(Object.assign({ root: ROOTS[app], tiles: 'mock', seedStorage: seed }, dims));
    const page = h.page;
    await h.context.addInitScript(probe, app);
    await page.goto(h.url + '?play=world');
    await page.waitForFunction(() => window.__m && window.__m.painted !== null, null, { timeout: 60000 });
    if (style === 'satellite') await page.waitForFunction(() => window.__m.imagery !== null, null, { timeout: 30000 }).catch(() => {});
    const t = await page.evaluate(() => window.__m);
    result.interactive.push(round(t.interactive));
    result.painted.push(round(t.painted));
    if (style === 'satellite') result.imagery.push(round(t.imagery));
    if (i === RUNS - 1) {
      // The gestures, on the last load
      await page.waitForTimeout(2500);
      const cdp = await h.context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const FRAMES = 120;
      const m0 = await metrics(cdp);
      const driven = await page.evaluate(([fn, a, n]) => (0, eval)('(' + fn + ')')(a, n), [drive.toString(), app, FRAMES]).catch(e => ({ error: String(e) }));
      const m1 = await metrics(cdp);
      await page.waitForTimeout(3000);
      const m2 = await metrics(cdp);
      result.gesture = delta(m0, m1, FRAMES * 2);
      result.afterGesture = { scriptMs: round((m2.ScriptDuration - m1.ScriptDuration) * 1000), taskMs: round((m2.TaskDuration - m1.TaskDuration) * 1000) };
      result.moved = { start: driven.start, farTurn: driven.farTurn, midZoom: driven.midZoom };
      ['turn', 'zoom'].forEach(kind => {
        const d = driven[kind];
        if (!d) return;
        result[kind] = { frameMedian: round(median(d.gaps), 1), frameP95: round(pct(d.gaps, 0.95), 1) };
        if (d.own.length) { result[kind].engineMedian = round(median(d.own), 2); result[kind].engineP95 = round(pct(d.own, 0.95), 2); }
      });
      if (app === 'new') result.engine = await page.evaluate(() => { const s = window.__atlas.globe.stats(); return { renderer: s.renderer, buildMs: Math.round(s.buildMs), triangles: s.triangles, segments: s.segments, imagery: s.imagery }; });
      result.errors = h.errors.slice(0, 3);
    }
    await h.close();
  }
  result.interactiveMedian = median(result.interactive);
  result.paintedMedian = median(result.painted);
  if (style === 'satellite') result.imageryMedian = median(result.imagery.filter(v => v != null));
  return result;
}

(async () => {
  const all = [];
  for (const app of APPS) for (const size of SIZES) for (const style of STYLES) {
    const res = await one(app, size, style);
    all.push(res);
    console.log(JSON.stringify(res));
  }
  const file = path.join(__dirname, 'measure-results' + (opt('tag', '') ? '-' + opt('tag', '') : '') + '.json');
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  console.log('\napp  size     style      interactive  imagery  | turn: frame med/p95  engine med/p95 | zoom: frame med/p95  engine med/p95 | main thread per frame: script / task | after gesture: script ms');
  all.forEach(x => {
    const g = k => x[k] ? (x[k].frameMedian + '/' + x[k].frameP95).padEnd(12) + ' ' + (x[k].engineMedian != null ? x[k].engineMedian + '/' + x[k].engineP95 : '-').padEnd(12) : '-';
    console.log([x.app.padEnd(4), x.size.padEnd(8), x.style.padEnd(10), (x.interactiveMedian + '/' + x.paintedMedian).padEnd(12), String(x.imageryMedian == null ? '-' : x.imageryMedian).padEnd(8), '|', g('turn'), '|', g('zoom'), '|',
      x.gesture ? x.gesture.script + ' / ' + x.gesture.task : '-', '|', x.afterGesture ? x.afterGesture.scriptMs : '-'].join(' '));
  });
})().catch(e => { console.error(e); process.exit(1); });
