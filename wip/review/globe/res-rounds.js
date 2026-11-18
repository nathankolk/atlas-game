// Twenty rounds across modes, themes and map styles; counts what is alive after rounds 0, 1, 5, 10, 15, 20:
// WebGL objects, listeners, timers, canvases, DOM nodes, heap, the engine's stats. Then: does anything keep
// drawing or ticking on the screens that show no map?
//   node res-rounds.js [--size=d1280]
'use strict';
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };

function counters(fast) {
  const c = window.__c = { gl: {}, listeners: 0, listenerTypes: {}, timeouts: new Set(), intervals: new Set(), raf: 0, rafCalls: 0, timeoutCalls: 0, intervalCalls: 0, canvasMade: 0, ctxMade: 0 };
  ['Texture', 'Buffer', 'Framebuffer', 'Program', 'Shader', 'Renderbuffer'].forEach(kind => {
    c.gl[kind] = 0;
    [window.WebGLRenderingContext, window.WebGL2RenderingContext].forEach(C => {
      if (!C) return;
      const make = C.prototype['create' + kind], del = C.prototype['delete' + kind];
      C.prototype['create' + kind] = function () { const o = make.apply(this, arguments); if (o) c.gl[kind]++; return o; };
      C.prototype['delete' + kind] = function (o) { if (o && !o.__gone) { o.__gone = true; c.gl[kind]--; } return del.apply(this, arguments); };
    });
  });
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const seen = new WeakMap();
  const keyOf = (type, fn, o) => type + '|' + ((o === true || (o && o.capture)) ? 'c' : 'b');
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (fn) {
      let m = seen.get(this); if (!m) { m = new Map(); seen.set(this, m); }
      const k = keyOf(type, fn, o); let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); }
      if (!s.has(fn)) { s.add(fn); c.listeners++; c.listenerTypes[type] = (c.listenerTypes[type] || 0) + 1; }
    }
    return add.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    const m = seen.get(this), s = m && m.get(keyOf(type, fn, o));
    if (s && s.has(fn)) { s.delete(fn); c.listeners--; c.listenerTypes[type]--; }
    return rem.apply(this, arguments);
  };
  const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = function (fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    const id = st.apply(window, [function () { c.timeouts.delete(id); c.timeoutCalls++; return typeof fn === 'function' ? fn.apply(this, arguments) : undefined; }, ms > 50 ? ms / fast : ms].concat(rest));
    c.timeouts.add(id);
    return id;
  };
  window.clearTimeout = function (id) { c.timeouts.delete(id); return ct.call(window, id); };
  window.setInterval = function (fn, ms) {
    const id = si.call(window, function () { c.intervalCalls++; return fn.apply(this, arguments); }, ms);
    c.intervals.add(id);
    return id;
  };
  window.clearInterval = function (id) { c.intervals.delete(id); return ci.call(window, id); };
  const raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
  window.requestAnimationFrame = function (fn) { c.raf++; return raf.call(window, function (t) { c.raf--; c.rafCalls++; return fn(t); }); };
  window.cancelAnimationFrame = function (id) { if (id) c.raf = Math.max(0, c.raf - 1); return caf.call(window, id); };
  const ce = document.createElement.bind(document);
  document.createElement = function (tag) { if (String(tag).toLowerCase() === 'canvas') c.canvasMade++; return ce.apply(document, arguments); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) { const had = this.__ctx; const r = gc.apply(this, arguments); if (r && !had) { this.__ctx = true; c.ctxMade++; } return r; };
}

const sample = page => page.evaluate(() => {
  const c = window.__c, A = window.__atlas, s = A.globe ? A.globe.stats() : {};
  return {
    gl: JSON.stringify(c.gl), listeners: c.listeners, timeouts: c.timeouts.size, intervals: c.intervals.size, rafPending: c.raf,
    canvasesInDom: document.querySelectorAll('canvas').length, canvasMade: c.canvasMade, ctxMade: c.ctxMade, nodes: document.querySelectorAll('*').length,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    tri: s.triangles, seg: s.segments, frames: s.frames, imagery: s.imagery ? JSON.stringify(s.imagery) : null,
    outlines: A.map.outlines.length, marks: A.map.marks.size, labels: A.map.labels.length, dots: A.map.dots.length
  };
});

(async () => {
  const h = await open({ size: opt('size', 'd1280'), initScript: counters, initArg: 20, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const page = h.page;
  const gc = () => page.evaluate(() => { if (window.gc) window.gc(); });
  const show = async tag => { await gc(); await page.waitForTimeout(300); console.log(tag, JSON.stringify(await sample(page))); };
  await page.waitForTimeout(800);
  await show('round 0 (home)');
  const names = (key, n) => page.evaluate(([k, n]) => window.__atlas.levelByKey(k).names().slice(0, n), [key, n]);
  // One round: start, skip every question, results, back to Home (now and then by way of the round's map, Explore or Stats)
  const playRound = async (i, key, o) => {
    o = o || {};
    await page.evaluate(([style, diff, theme]) => {
      if (style) localStorage.setItem('atlas-map-style', style);
    }, [o.style || null]);
    const arg = await page.evaluate(k => window.__atlas.levelByKey(k).arg, key);
    const practice = o.full ? null : await names(key, o.n || 5);
    if (o.setup) await page.evaluate(o.setup);
    await startLevel(page, arg, o.learn ? { learn: true, learnFresh: true } : practice ? { practice: practice } : null);
    if (o.during) await page.evaluate(o.during);
    if (o.learn) {
      // Study, start the quiz, miss once, then leave
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
    } else {
      for (let guard = 0; guard < 400; guard++) {
        const st = await page.evaluate(() => {
          const A = window.__atlas, s = A.state, scr = (document.querySelector('.screen.active') || {}).id;
          if (scr !== 'game-screen') return 'done';
          if (s.pin && s.pin.phase === 'reveal') { document.getElementById('pin-btn').click(); return 'next'; }
          if (s.current && !s.interactionLocked) { document.getElementById('skip-btn').click(); return 'skipped'; }
          return 'wait';
        });
        if (st === 'done') break;
        await page.waitForTimeout(st === 'wait' ? 60 : 30);
      }
      if (o.review) {
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#results-screen button')).find(x => /map/i.test(x.textContent)); if (b) b.click(); });
        await page.waitForTimeout(500);
        await page.evaluate(() => document.getElementById('review-back-btn').click());
        await page.waitForTimeout(200);
      }
    }
    await page.evaluate(() => window.__atlas.showView('home'));
    await page.waitForTimeout(250);
    if (o.after) { await page.evaluate(o.after); await page.waitForTimeout(600); await page.evaluate(() => window.__atlas.showView('home')); await page.waitForTimeout(200); }
  };
  const setStyle = s => "(() => { const b = document.getElementById('map-style-btn'); const on = document.getElementById('map-wrap').classList.contains('sat-on'); if (on !== " + (s === 'sat') + ") b.click(); })";
  const plan = [
    ['europe'], ['us-state', { during: () => document.getElementById('map-style-btn').click() }], ['northeast-cities'], ['india-states', { review: true }],
    ['capitals-europe', { after: () => window.__atlas.showView('explore') }],
    ['flags-europe', { during: () => document.getElementById('map-style-btn').click() }], ['name-europe'], ['pin-europe', { full: true }], ['russia-east'], ['canada-provinces', { review: true }],
    ['africa', { setup: () => { document.documentElement.setAttribute('data-theme', 'dark'); } }], ['us-state-to-capital', { during: () => document.getElementById('map-style-btn').click() }], ['us-capital-to-state'], ['china-provinces', { after: () => window.__atlas.showView('stats') }], ['capitals-find-asia'],
    ['europe', { learn: true }], ['pin-asia', { full: true, during: () => document.getElementById('map-style-btn').click() }], ['russia-west', { after: () => window.__atlas.showView('explore') }], ['oceania', { full: true, review: true }], ['world', { n: 8 }]
  ];
  for (let i = 0; i < plan.length; i++) {
    try { await playRound(i + 1, plan[i][0], plan[i][1]); } catch (e) { console.log('round', i + 1, plan[i][0], 'FAILED', e.message.split('\n')[0]); }
    if ([1, 5, 10, 15, 20].includes(i + 1)) await show('round ' + (i + 1) + ' (' + plan[i][0] + ')');
  }
  // Second lap of the same twenty: anything that only grows shows here
  for (let i = 0; i < plan.length; i++) {
    try { await playRound(i + 21, plan[i][0], plan[i][1]); } catch (e) { console.log('round', i + 21, plan[i][0], 'FAILED', e.message.split('\n')[0]); }
  }
  await show('round 40');
  console.log('listener types', await page.evaluate(() => JSON.stringify(window.__c.listenerTypes)));
  // Idle screens: rAF callbacks, timers and engine frames over three seconds each
  for (const view of ['home', 'stats', 'settings', 'explore', 'home']) {
    await page.evaluate(v => window.__atlas.showView(v), view);
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => ({ raf: window.__c.rafCalls, t: window.__c.timeoutCalls, i: window.__c.intervalCalls, f: window.__atlas.globe.stats().frames }));
    await page.waitForTimeout(3000);
    const b = await page.evaluate(() => ({ raf: window.__c.rafCalls, t: window.__c.timeoutCalls, i: window.__c.intervalCalls, f: window.__atlas.globe.stats().frames, intervals: window.__c.intervals.size, timeouts: window.__c.timeouts.size }));
    console.log('idle 3 s on', view, 'rAF callbacks', b.raf - a.raf, 'timeouts fired', b.t - a.t, 'interval ticks', b.i - a.i, 'engine frames', b.f - a.f, 'intervals alive', b.intervals, 'timeouts pending', b.timeouts);
  }
  // Results screen and the game screen at rest
  await startLevel(page, 'Oceania', { practice: ['Fiji'] });
  await page.waitForTimeout(2500);
  let a = await page.evaluate(() => ({ raf: window.__c.rafCalls, f: window.__atlas.globe.stats().frames, i: window.__c.intervalCalls }));
  await page.waitForTimeout(3000);
  let b = await page.evaluate(() => ({ raf: window.__c.rafCalls, f: window.__atlas.globe.stats().frames, i: window.__c.intervalCalls }));
  console.log('idle 3 s in a round at rest: rAF callbacks', b.raf - a.raf, 'engine frames', b.f - a.f, 'interval ticks', b.i - a.i);
  await page.evaluate(() => document.getElementById('skip-btn').click());
  await page.waitForFunction(() => (document.querySelector('.screen.active') || {}).id === 'results-screen', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  a = await page.evaluate(() => ({ raf: window.__c.rafCalls, f: window.__atlas.globe.stats().frames, i: window.__c.intervalCalls }));
  await page.waitForTimeout(3000);
  b = await page.evaluate(() => ({ raf: window.__c.rafCalls, f: window.__atlas.globe.stats().frames, i: window.__c.intervalCalls }));
  console.log('idle 3 s on results: rAF callbacks', b.raf - a.raf, 'engine frames', b.f - a.f, 'interval ticks', b.i - a.i);
  console.log('errors', JSON.stringify(h.errors.slice(0, 6)));
  await h.close();
})();
