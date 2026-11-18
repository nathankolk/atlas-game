// Edge checks for the globe: the coarse-world opening for level links, network use, resize and
// rotation, reduced motion, a lost WebGL context.
//   NODE_PATH=/opt/node-tools/node_modules node check-edges.js [--only=opening,network,resize,motion,context]
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;
const r = lib.reporter('globe edge checks');
const SHOTS = path.join(S, 'shots/app/globe');
const groups = {};
// Every URL the page asks for
const watch = (page) => { const urls = []; page.on('request', q => urls.push(q.url())); return urls; };

// A level link while the detailed map is slow: the globe is up first, drawn from the coarse map
groups.opening = async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'desktop';
    const h = await launch(mobile ? { mobile: true, dpr: 2 } : { width: 1280, height: 800 });
    const page = h.page;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/data/countries-50m.json', async route => { await held; route.continue(); });
    await page.goto(h.url + '?play=europe');
    await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas && window.__atlas.globe &&
      window.__atlas.globe.stats().triangles > 0 && window.__atlas.globe.stats().frames > 0, null, { timeout: 15000 });
    const early = await page.evaluate(() => {
      const A = window.__atlas, screen = document.getElementById('game-screen');
      const hidden = sel => getComputedStyle(document.querySelector(sel)).visibility === 'hidden';
      return { opening: screen.classList.contains('is-opening'), world: A.state.allFeatures.length, sketch: A.map.sketch.features.length,
        hud: [hidden('.gamebar'), hidden('.hud-top'), hidden('.game-actions'), hidden('#game-screen .mapctl')],
        globe: getComputedStyle(document.getElementById('globe-host')).visibility, triangles: A.globe.stats().triangles,
        loading: document.getElementById('loading-overlay').classList.contains('visible') && document.getElementById('loading-overlay').textContent };
    });
    r.check('opening (' + tag + '): the globe is up from the coarse map before the detailed one is in',
      early.opening && early.world === 0 && early.sketch > 150 && early.triangles > 1000 && early.globe === 'visible', early);
    r.eq('opening (' + tag + '): nothing of the round\'s chrome shows yet, and a card says the map is loading', [early.hud, /Loading the map/.test(early.loading || '')], [[true, true, true, true], true]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'm4-opening-' + (mobile ? 'm' : 'd') + '.png') });
    const coarse = early.triangles;
    release();
    await page.waitForFunction(() => { const A = window.__atlas; return A.state.current && A.map.round === A.state.roundId && A.map.drawn; }, null, { timeout: 20000 });
    await page.evaluate(lib.pageHelpers);
    const late = await page.evaluate(() => {
      const A = window.__atlas, screen = document.getElementById('game-screen');
      return { opening: screen.classList.contains('is-opening'), triangles: A.globe.stats().triangles, title: document.getElementById('region-tag').textContent,
        hud: getComputedStyle(document.querySelector('.gamebar')).visibility, loading: document.getElementById('loading-overlay').classList.contains('visible'),
        layer: A.map.layer, eligible: A.map.eligible.size, k: A.globe.getView().k };
    });
    r.check('opening (' + tag + '): the detailed map takes over and the round starts', !late.opening && late.triangles > coarse * 3 && late.hud === 'visible' && !late.loading && late.eligible > 30 && late.k > 1.2, late);
    const first = await page.evaluate(() => window.__atlas.state.current);
    await page.evaluate(() => window.__t.attempt(true));
    r.eq('opening (' + tag + '): the first answer counts (' + first + ')', await page.evaluate(() => window.__atlas.state.sequence), [2]);
    r.eq('opening (' + tag + '): no page errors', h.errors, []);
    await h.close();
  }
  // The detailed map fails: Home, with its error, not a stranded globe
  const h = await launch({ width: 1000, height: 700 });
  await h.page.route('**/data/countries-50m.json', route => setTimeout(() => route.abort(), 700));
  await h.page.goto(h.url + '?play=africa');
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.worldFailed, null, { timeout: 15000 });
  await h.page.waitForTimeout(300);
  r.eq('opening: when the detailed map cannot load the player is on Home with no loading card', await h.page.evaluate(() => [document.body.dataset.screen,
    (document.getElementById('loading-overlay') || { classList: { contains: () => false } }).classList.contains('visible'), document.querySelector('.screen.active').id]), ['menu', false, 'menu-screen']);
  await h.close();
  // No link: the coarse map is not fetched at all
  const h2 = await launch({ width: 1000, height: 700 });
  const asked = watch(h2.page);
  await h2.page.goto(h2.url);
  await h2.page.waitForFunction(() => window.__atlas && window.__atlas.globe && window.__atlas.map.drawn, null, { timeout: 15000 });
  r.eq('opening: a visit that starts on Home fetches only the detailed world', asked.filter(u => /countries-\d+m/.test(u)).map(u => u.replace(/^.*\//, '')), ['countries-50m.json']);
  await h2.close();
};

// The page talks to its own origin and the font service; imagery adds the tile host
groups.network = async () => {
  let asked;
  const h = await lib.launchApp({ width: 1000, height: 700, beforeLoad: hh => { asked = watch(hh.page); } });
  const page = h.page;
  await lib.startLevel(page, 'us-state', { practice: ['Ohio', 'Texas'] });
  await lib.playRound(page, () => 'first');
  await lib.startLevel(page, 'canada-provinces', { practice: ['Ontario'] });
  await lib.playRound(page, () => 'first');
  await lib.startLevel(page, 'pin-europe');
  const origin = new URL(h.url).origin;
  const hosts = Array.from(new Set(asked.map(u => new URL(u).origin))).filter(o => o !== origin).sort();
  r.eq('network: on the chart nothing is fetched beyond the page\'s own origin and the fonts', hosts.filter(o => !/fonts\.(googleapis|gstatic)\.com$/.test(o)), []);
  r.eq('network: the libraries come from /vendor/', asked.filter(u => /\.js(\?|$)/.test(u)).map(u => new URL(u).pathname).sort(),
    ['/vendor/d3-array.min.js', '/vendor/d3-geo.min.js', '/vendor/earcut.min.js', '/vendor/topojson-client.min.js']);
  r.eq('network: d3 is the small build (no select, zoom or transition)', await page.evaluate(() => [typeof d3.geoPath, typeof d3.select, typeof d3.zoom, typeof d3.transition]), ['function', 'undefined', 'undefined', 'undefined']);
  await page.keyboard.press('m');
  await page.waitForFunction(() => { const im = window.__atlas.globe.stats().imagery; return im && im.status === 'ready'; }, null, { timeout: 15000 });
  const withTiles = Array.from(new Set(asked.map(u => new URL(u).origin))).filter(o => o !== origin && !/fonts\./.test(o));
  r.eq('network: the harness had nothing to block or stand in for but tiles', [h.netLog.blocked, h.netLog.cdn], [[], []]);
  r.eq('network: satellite adds the Esri tile host and nothing else', withTiles, ['https://server.arcgisonline.com']);
  await h.close();
};

// A new window shape mid-round, and a phone turned on its side and back
groups.resize = async () => {
  const h = await lib.launchApp({ mobile: true, dpr: 2, width: 390, height: 844 });
  const page = h.page;
  await lib.startLevel(page, 'South America');
  for (const how of ['first', 'second', 'miss']) await lib.answer(page, how);
  const snap = () => page.evaluate(() => {
    const A = window.__atlas, host = document.getElementById('globe-host'), c = A.map.clear, g = A.globe;
    const canvas = host.querySelector('canvas');
    const inClear = Array.from(A.map.eligible).every(k => { const p = g.project(g.anchor('world', k)); return p.visible && p.x > c.left - 4 && p.x < c.right + 4 && p.y > c.top - 4 && p.y < c.bottom + 4; });
    const v = g.getView(), hm = A.map.home;
    return { marks: window.__t.marks(), view: v, home: hm, host: [host.clientWidth, host.clientHeight], canvas: [canvas.clientWidth, canvas.clientHeight], inClear: inClear,
      atHome: Math.abs(v.k - hm.k) < 1e-9 && Math.abs(v.lon - hm.lon) < 1e-6 && Math.abs(v.lat - hm.lat) < 1e-6, score: A.state.score, current: A.state.current };
  });
  // The answers above turned the globe; the player puts it back before turning the phone
  const goHome = () => page.evaluate(() => window.__atlas.globe.setView(window.__atlas.map.home));
  await goHome();
  const before = await snap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(k => Math.abs(window.__atlas.map.home.k - k) > 1e-6, before.home.k, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const side = await snap();
  await page.screenshot({ path: path.join(SHOTS, 'm4-rotated-m.png') });
  r.eq('resize: turned on its side mid-round, the phone keeps the marks, the score and the question', [side.marks, side.score, side.current], [before.marks, before.score, before.current]);
  r.check('resize: the globe fills the new shape and the untouched view is fitted again, every country in the clear area',
    // (on its side the prompt card stands at the left and the host reaches past the stage's right edge, so that
    // the globe's middle is the middle of what is beside the card)
    side.canvas[0] === side.host[0] && side.host[0] >= 844 && side.atHome && side.inClear && Math.abs(side.view.k - before.view.k) > 0.01, side);
  await lib.answer(page, 'first');
  r.eq('resize: play goes on in the new shape', (await snap()).marks.found, before.marks.found + 1);
  await goHome();
  const homeSide = (await snap()).home.k;
  await page.setViewportSize({ width: 390, height: 844 });
  // The refit comes a moment after the last resize event: wait for it, not for a set time
  await page.waitForFunction(k => Math.abs(window.__atlas.map.home.k - k) > 1e-6, homeSide, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const back = await snap();
  r.check('resize: turned back, the opening view is the one it started with', back.atHome && back.inClear && Math.abs(back.view.k - before.view.k) < 0.02 * before.view.k, [before.view, back.view]);
  // A view the player moved is kept through a resize
  await page.evaluate(() => { const g = window.__atlas.globe, v = g.getView(); g.setView({ lon: v.lon + 20, lat: v.lat, k: v.k * 2 }); });
  const moved = await snap();
  await page.setViewportSize({ width: 600, height: 700 });
  await page.waitForTimeout(900);
  const kept = await snap();
  r.check('resize: a view the player moved stays as they left it', Math.abs(kept.view.lon - moved.view.lon) < 1e-6 && Math.abs(kept.view.k - moved.view.k) < 1e-6 && kept.canvas[0] === 600, [moved.view, kept.view]);
  // Review mode ("View on the map") after a rotation still has every mark
  await lib.playRound(page, () => 'first');
  await page.click('#view-map-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game');
  const total = await page.evaluate(() => window.__atlas.map.eligible.size);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  const review = await snap();
  r.eq('resize: the finished map keeps every mark through a rotation in review', review.marks.found + review.marks.second + review.marks.missed, total);
  await page.screenshot({ path: path.join(SHOTS, 'm4-review-rotated-m.png') });
  r.eq('resize: no page errors', h.errors, []);
  await h.close();
};

// The in-app Reduce motion switch reaches the globe: no eased flights, zooms or glides
groups.motion = async () => {
  for (const pref of ['reduce', 'full']) {
    const h = await lib.launchApp({ width: 1000, height: 700, seedStorage: { 'atlas-motion': pref } });
    const page = h.page;
    await lib.startLevel(page, 'us-state-to-capital', { practice: ['Hawaii'] });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const g = window.__atlas.globe; g.setView(window.__atlas.map.home); });
    // + on the keyboard: instant, or eased over several frames
    const zoom = await page.evaluate(async () => {
      const g = window.__atlas.globe, k0 = g.getView().k;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      const atOnce = g.getView().k / k0;
      // Software rendering stretches an eased zoom: wait for it to arrive, not for a set time
      for (let i = 0; i < 80 && Math.abs(g.getView().k / k0 - 1.6) > 0.001; i++) await new Promise(resolve => setTimeout(resolve, 100));
      return { atOnce: atOnce, later: g.getView().k / k0 };
    });
    // A flick of the mouse: glides on, or stops dead
    const box = await page.evaluate(() => { const c = window.__atlas.map.clear, b = document.getElementById('globe-host').getBoundingClientRect(); return { x: b.left + (c.left + c.right) / 2, y: b.top + (c.top + c.bottom) / 2 }; });
    // A flick, sent from inside the page with its own clock: drawing in software is too slow
    // here for real pointer timing to read as a flick (frames between the moves take 50 ms and more)
    const atRelease = await page.evaluate(([x, y]) => {
      const host = document.getElementById('globe-host');
      const t0 = performance.now();
      const send = (type, px, at) => {
        const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: px, clientY: y });
        Object.defineProperty(ev, 'timeStamp', { value: t0 + at });
        host.dispatchEvent(ev);
      };
      send('pointerdown', x, 0);
      for (let i = 1; i <= 6; i++) send('pointermove', x - i * 22, i * 12);
      send('pointerup', x - 132, 80);
      return window.__atlas.globe.getView().lon;
    }, [box.x, box.y]);
    await page.waitForTimeout(1200);
    const afterGlide = await page.evaluate(() => window.__atlas.globe.getView().lon);
    // Recentre
    const reset = await page.evaluate(async () => {
      const g = window.__atlas.globe, home = window.__atlas.map.home;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      return Math.abs(g.getView().lon - home.lon) < 1e-6 && Math.abs(g.getView().k - home.k) < 1e-9;
    });
    if (pref === 'reduce') {
      r.check('motion (reduced): + zooms at once', Math.abs(zoom.atOnce - 1.6) < 1e-6 && Math.abs(zoom.later - 1.6) < 1e-6, zoom);
      r.check('motion (reduced): a flick does not glide on', Math.abs(afterGlide - atRelease) < 1e-9, [atRelease, afterGlide]);
      r.eq('motion (reduced): 0 recentres at once', reset, true);
    } else {
      r.check('motion (full): + eases to its zoom', Math.abs(zoom.atOnce - 1) < 0.2 && Math.abs(zoom.later - 1.6) < 0.01, zoom);
      r.check('motion (full): a flick glides on', Math.abs(afterGlide - atRelease) > 0.2, [atRelease, afterGlide]);
      r.eq('motion (full): 0 flies back (not there at once)', reset, false);
    }
    await h.close();
  }
  // Flipping the switch in Settings reaches a globe that already exists
  const h = await lib.launchApp({ width: 1000, height: 700, seedStorage: { 'atlas-motion': 'full' } });
  const page = h.page;
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForFunction(() => document.body.dataset.screen === 'settings' && document.querySelector('[data-action="toggle-motion"]'));
  await page.click('[data-action="toggle-motion"]');
  await lib.startLevel(page, 'Africa', { practice: ['Chad'] });
  const z = await page.evaluate(() => { const g = window.__atlas.globe, k0 = g.getView().k; document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })); return g.getView().k / k0; });
  r.check('motion: turning Reduce motion on in Settings reaches the globe', Math.abs(z - 1.6) < 1e-6, z);
  await h.close();
};

// The GPU takes the WebGL context away and gives it back; then takes it away for good
groups.context = async () => {
  const h = await lib.launchApp({ width: 1000, height: 700, seedStorage: { 'atlas-map-style': 'satellite' } });
  const page = h.page;
  await lib.startLevel(page, 'Africa');
  for (const how of ['first', 'second', 'miss']) await lib.answer(page, how);
  const marks = await page.evaluate(() => window.__t.marks());
  const lose = () => page.evaluate(() => {
    const canvas = document.querySelector('#globe-host canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    window.__lost = gl.getExtension('WEBGL_lose_context');
    window.__lost.loseContext();
  });
  await lose();
  await page.waitForTimeout(300);
  await lib.answer(page, 'first');
  r.eq('context: with the context lost, an answer still counts', (await page.evaluate(() => window.__t.marks())).found, marks.found + 1);
  await page.evaluate(() => window.__lost.restoreContext());
  await page.waitForFunction(() => { const im = window.__atlas.globe.stats().imagery; return window.__atlas.globe.stats().renderer === 'webgl' && im && im.status === 'ready'; }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const restored = await page.evaluate(() => ({ renderer: window.__atlas.globe.stats().renderer, marks: window.__t.marks(), sat: document.getElementById('map-wrap').classList.contains('sat-on'),
    imagery: (window.__atlas.globe.stats().imagery || {}).status, triangles: window.__atlas.globe.stats().triangles }));
  r.check('context: given back, the globe draws with WebGL again, marks and imagery in place', restored.renderer === 'webgl' && restored.marks.found === marks.found + 1 && restored.marks.missed === 1 && restored.sat && restored.imagery === 'ready' && restored.triangles > 10000, restored);
  await page.screenshot({ path: path.join(SHOTS, 'm4-context-restored-d.png') });
  // Lost for good: the engine gives up after 4 s and draws with Canvas 2D; imagery goes, the game says so and locks it
  await lose();
  await page.waitForFunction(() => window.__atlas.globe.stats().renderer === 'canvas2d', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const fallen = await page.evaluate(() => ({ marks: window.__t.marks(), sat: document.getElementById('map-wrap').classList.contains('sat-on'), toast: document.getElementById('toast').textContent,
    btn: document.getElementById('map-style-btn').hidden, supports: window.__atlas.globe.supportsImagery() }));
  r.check('context: lost for good, the globe carries on in Canvas 2D on the chart and says the imagery is gone', !fallen.sat && /couldn.t load/.test(fallen.toast) && fallen.btn && !fallen.supports && fallen.marks.found === marks.found + 1, fallen);
  await lib.answer(page, 'first');
  r.eq('context: and play goes on', (await page.evaluate(() => window.__t.marks())).found, marks.found + 2);
  await page.screenshot({ path: path.join(SHOTS, 'm4-context-fallback-d.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.body.dataset.screen === 'menu');
  r.eq('context: Home then shows Satellite locked', await page.evaluate(() => [document.querySelector('[data-action="set-map"][data-value="satellite"]').disabled, !document.querySelector('[data-imagery-note]').hidden]), [true, true]);
  r.eq('context: no page errors', h.errors.filter(e => !/context|WebGL|CONTEXT_LOST/i.test(e)), []);
  await h.close();
};

(async () => {
  for (const name of Object.keys(groups)) {
    if (only && !only.includes(name)) continue;
    try { await groups[name](); } catch (e) { r.check(name + ': ran to the end', false, String(e && e.stack || e).slice(0, 700)); }
  }
  process.exit(r.done() ? 0 : 1);
})();
