// Checks for the polish stage: what was made faster, the frames a round opens on, accessibility.
//   NODE_PATH=/opt/node-tools/node_modules node check-polish.js [--only=perf,frames,a11y,explore,contrast]
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : null;
const want = g => !ONLY || ONLY.includes(g);

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (!ok && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : ''));
}
const eq = (name, got, wanted) => check(name, JSON.stringify(got) === JSON.stringify(wanted), { got, wanted });

async function open(opts, seed) {
  const h = await launch(Object.assign({ seedStorage: Object.assign({ 'atlas-theme': 'light' }, seed || {}) }, opts || {}));
  if (opts && opts.size) await h.page.setViewportSize(opts.size);
  return h;
}
const home = async (h, hash) => {
  await h.page.goto(h.url + (hash || ''));
  await h.page.waitForFunction(hashed => window.__atlas && window.__atlas.state.allFeatures.length > 0 && (hashed || document.querySelectorAll('#menu-screen .level').length > 5), !!hash, { timeout: 60000 });
};
const built = page => page.waitForFunction(() => window.__atlas.globe && window.__atlas.map.drawn, null, { timeout: 60000 });
const question = page => page.waitForFunction(() => { const A = window.__atlas; return A.state.current && A.map.round === A.state.roundId && A.map.drawn; }, null, { timeout: 60000 });
const start = async (page, arg, opts) => { await page.evaluate(([a, o]) => { window.__atlas.startGame(a, o || undefined); }, [arg, opts || null]); await question(page); };

/* ===== What was made faster ===== */
async function perf() {
  const h = await open();
  const page = h.page;
  const asked = [];
  page.on('request', r => asked.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
  await home(h);
  check('perf: the world map is preloaded from the head', await page.evaluate(() => !!document.querySelector('head link[rel="preload"][as="fetch"][href="/data/countries-50m.json"]')));
  eq('perf: and fetched once', asked.filter(u => u === '/data/countries-50m.json').length, 1);
  check('perf: Home needs neither the coarse world, the states, a province file nor the flag font', !asked.some(u => /^\/(data|vendor)\//.test(u) && /110m|us-states|provinces-|woff2/.test(u)), asked.filter(u => /^\/(data|vendor)/.test(u)));
  await built(page);
  check('perf: the globe is made and the world built into it while Home is showing', await page.evaluate(() => document.body.dataset.screen === 'menu' && window.__atlas.globe.stats().triangles > 100000));
  // Level lists
  const lists = await page.evaluate(() => {
    const A = window.__atlas, find = A.levelByKey('capitals-find-world'), pick = A.levelByKey('capitals-world'), europe = A.levelByKey('europe');
    const a = find.names(), b = find.names();
    a.push('Atlantis');
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) A.LEVELS.forEach(l => l.names());
    return { find: b.length, again: find.names().length, pick: pick.names().length, europe: europe.names().length, ms: performance.now() - t0,
      lux: b.includes('Luxembourg'), dji: b.includes('Djibouti'), same: JSON.stringify(b) === JSON.stringify(find.names()) };
  });
  eq('perf: level lists keep their sizes (find 182, pick 184, Europe 39)', [lists.find, lists.pick, lists.europe], [182, 184, 39]);
  check('perf: a caller that changes its list does not change the next caller\'s', lists.again === 182 && lists.same && !lists.lux && !lists.dji, lists);
  check('perf: asking every level for its names 200 times takes under 150 ms', lists.ms < 150, lists.ms);
  // A level's sheet gets its map ready
  await page.evaluate(() => document.querySelector('[data-action="open-level"][data-level="us-state"]').click());
  await page.waitForFunction(() => window.__atlas.state.usLoaded && window.__atlas.map.drawn && /us:/.test(window.__atlas.map.layerSet), null, { timeout: 30000 }).catch(() => {});
  const us = await page.evaluate(() => ({ loaded: window.__atlas.state.usLoaded, n: window.__atlas.state.usFeatures.length, set: window.__atlas.map.layerSet, drawn: window.__atlas.map.drawn, borders: !!window.__atlas.state.usBorders }));
  check('perf: opening the States sheet fetches the states and builds them into the globe', us.loaded && us.n === 51 && /us:51/.test(us.set) && us.drawn && us.borders, us);
  check('perf: the states come as TopoJSON (the old GeoJSON is not asked for)', asked.includes('/data/us-states.json') && !asked.some(u => /us-states-detail/.test(u)), asked.filter(u => /us-states/.test(u)));
  const started = await page.evaluate(() => new Promise(resolve => {
    const A = window.__atlas, t0 = performance.now();
    let sizes = 0, overlay = false;
    const canvas = document.querySelector('#globe-host canvas');
    let last = canvas.width + 'x' + canvas.height;
    document.getElementById('sheet-start-btn').click();
    const tick = () => {
      const now = canvas.width + 'x' + canvas.height;
      if (now !== last) { sizes++; last = now; }
      const el = document.getElementById('loading-overlay');
      if (el && el.classList.contains('visible')) overlay = true;
      if (A.state.current && A.map.round === A.state.roundId) { resolve({ ms: performance.now() - t0, sizes, overlay, mode: A.state.gameMode }); return; }
      setTimeout(tick, 1);
    };
    tick();
  }));
  check('perf: Start then goes straight to the first question (no loading card, canvases sized once)', started.mode === 'us-state' && !started.overlay && started.sizes <= 1, started);
  await page.evaluate(() => document.getElementById('back-btn').click());
  await page.waitForFunction(() => document.body.dataset.screen === 'menu');
  await page.evaluate(() => document.querySelector('[data-action="open-level"][data-level="india-states"]').click());
  await page.waitForFunction(() => window.__atlas.map.drawn && /prov:36/.test(window.__atlas.map.layerSet), null, { timeout: 30000 }).catch(() => {});
  eq('perf: opening India\'s sheet builds its 36 states and territories', await page.evaluate(() => /prov:36/.test(window.__atlas.map.layerSet) && window.__atlas.map.drawn), true);
  await page.evaluate(() => document.querySelector('[data-action="open-level"][data-level="canada-provinces"]') && window.__atlas.startGame('china-provinces'));
  await question(page);
  eq('perf: a round of another country swaps the province layer in', await page.evaluate(() => /prov:3[0-9]/.test(window.__atlas.map.layerSet) && window.__atlas.state.eligibleFeatures.length), 33);
  await page.evaluate(() => document.getElementById('back-btn').click());
  await page.waitForFunction(() => document.body.dataset.screen === 'menu');
  // The countdown only ticks while one is on screen
  const count = await page.evaluate(async () => {
    const el = document.querySelector('#menu-screen [data-countdown]');
    if (!el) return null;
    const a = el.textContent;
    window.__atlas.startGame('Oceania');
    await new Promise(r => setTimeout(r, 2300));
    const during = el.textContent, inGame = document.body.dataset.screen;
    document.getElementById('back-btn').click();
    await new Promise(r => setTimeout(r, 300));
    const el2 = document.querySelector('#menu-screen [data-countdown]');
    const b = el2.textContent;
    await new Promise(r => setTimeout(r, 1300));
    return { a, during, inGame, b, later: el2.textContent, kind: el2.dataset.countdown };
  });
  check('perf: the Daily Five countdown rests while a round is on and runs again on Home', !!count && count.inGame === 'game' && count.during === count.a && (count.kind === 'words' || count.later !== count.b), count);
  eq('perf: no page errors', h.errors, []);
  await h.close();

  // From Explore, a sheet fetches the level's map but leaves the globe as Explore painted it
  const e = await open();
  await home(e, '#explore');
  await built(e.page);
  await e.page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 20000 });
  await e.page.evaluate(() => window.__atlas.selectCountry('Canada'));
  await e.page.waitForTimeout(1200);
  const before = await e.page.evaluate(() => window.__atlas.map.layerSet);
  await e.page.evaluate(() => { const A = window.__atlas; const level = A.levelByKey('canada-provinces'); document.getElementById('level-sheet'); A.state; return level; });
  await e.page.evaluate(() => { const b = document.querySelector('#place-card [data-action="open-level"]'); if (b) b.click(); });
  await e.page.waitForTimeout(600);
  const fromExplore = await e.page.evaluate(() => ({ sheet: !document.getElementById('level-sheet').hidden, set: window.__atlas.map.layerSet, on: window.__atlas.explore.on }));
  check('perf: a sheet opened from Explore leaves Explore\'s globe alone', fromExplore.sheet && fromExplore.on && fromExplore.set === before, [before, fromExplore]);
  eq('perf: no page errors in Explore', e.errors, []);
  await e.close();
}

/* ===== The frames a round opens on ===== */
const frameOf = (page, places) => page.evaluate(names => {
  const A = window.__atlas, g = A.globe, c = A.map.clear, host = document.getElementById('globe-host');
  const stage = document.getElementById('map-wrap').getBoundingClientRect(), hr = host.getBoundingClientRect();
  const out = { clear: c, host: [hr.left - stage.left, hr.top - stage.top, hr.width, hr.height], stage: [stage.width, stage.height], pts: {} };
  names.forEach(n => {
    const lonlat = Array.isArray(n) ? n : g.anchor('world', 'name:' + n) || null;
    const info = !Array.isArray(n) ? g.featureInfo('world', 'name:' + n) : null;
    const p = lonlat ? g.project(lonlat) : null;
    out.pts[Array.isArray(n) ? n.join(',') : n] = p ? { x: Math.round(p.x), y: Math.round(p.y), visible: p.visible, has: !!info } : null;
  });
  const card = document.getElementById('prompt').getBoundingClientRect();
  out.card = [card.left - stage.left, card.top - stage.top, card.right - stage.left, card.bottom - stage.top].map(Math.round);
  out.view = g.getView();
  return out;
}, places);
const inside = (p, c, slack) => !!p && p.visible && p.x >= c.left - slack && p.x <= c.right + slack && p.y >= c.top - slack && p.y <= c.bottom + slack;

async function frames() {
  // Phone, upright: Europe's countries take the width
  let h = await open({ mobile: true, dpr: 2 });
  await home(h);
  await start(h.page, 'Europe');
  await h.page.waitForTimeout(600);
  let f = await frameOf(h.page, ['Portugal', 'Ireland', 'Iceland', 'Ukraine', 'Greece', 'Finland', 'Malta', [-9.5, 38.7], [40.2, 49], [24, 35], [25.7, 71.1]]);
  const xs = [f.pts['-9.5,38.7'].x, f.pts['40.2,49'].x];
  const width = f.clear.right - f.clear.left;
  check('frames (phone): Europe opens with its countries across the width (Lisbon to Ukraine\'s east take over 80% of it, inside the clear area)', (xs[1] - xs[0]) / width > 0.8 && xs[0] >= f.clear.left - 1 && xs[1] <= f.clear.right + 1, { xs, width });
  check('frames (phone): Portugal, Ireland, Iceland, Ukraine, Greece, Finland and Malta are all on the stage', ['Portugal', 'Ireland', 'Iceland', 'Ukraine', 'Greece', 'Finland', 'Malta'].every(n => f.pts[n] && f.pts[n].visible && f.pts[n].x >= 0 && f.pts[n].x <= f.stage[0] && f.pts[n].y >= f.clear.top - 4 && f.pts[n].y <= f.clear.bottom + 4), f.pts);
  check('frames (phone): Crete and the North Cape are inside the clear area', inside(f.pts['24,35'], f.clear, 2) && inside(f.pts['25.7,71.1'], f.clear, 2), [f.pts['24,35'], f.pts['25.7,71.1'], f.clear]);
  for (const [arg, west, east] of [['Africa', [-25.3, 16], [57.7, -20.2]], ['South America', [-81.3, -4.6], [-34.8, -7.2]], ['North America', [-168, 65.6], [-59.5, 13.2]], ['Asia', [35.5, 33.9], [141, 38]], ['Oceania', [113.5, -25], [178, -17.8]]]) {
    await h.page.evaluate(() => document.getElementById('back-btn').click());
    await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
    await start(h.page, arg);
    await h.page.waitForTimeout(400);
    f = await frameOf(h.page, [west, east]);
    const a = f.pts[west.join(',')], b = f.pts[east.join(',')];
    check('frames (phone): ' + arg + ' has its west and east ends on the stage' + (arg === 'Africa' ? ' (Cape Verde to Mauritius)' : arg === 'North America' ? ' (Alaska to Barbados)' : ''), !!a && !!b && a.visible && b.visible && a.x >= 0 && b.x <= f.stage[0] && a.y > f.clear.top - 30 && b.y < f.clear.bottom + 30, [a, b, f.clear]);
  }
  await h.page.evaluate(() => document.getElementById('back-btn').click());
  await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
  await start(h.page, 'pin-europe');
  await h.page.waitForTimeout(400);
  const CITIES = [[37.6, 55.75], [-0.13, 51.5], [2.35, 48.85], [-3.7, 40.4], [13.4, 52.5], [12.5, 41.9], [30.3, 59.94], [2.17, 41.39], [30.5, 50.45], [9.19, 45.46], [16.37, 48.2], [21, 52.2], [19.04, 47.5], [26.1, 44.4], [11.58, 48.14], [14.42, 50.08], [4.9, 52.37], [18.07, 59.33], [23.7, 38], [-9.14, 38.7]];
  f = await frameOf(h.page, CITIES);
  check('frames (phone): Pin the City, Europe opens with all twenty cities inside the clear area', CITIES.every(c => inside(f.pts[c.join(',')], f.clear, 2)), f.clear);
  eq('frames (phone): no page errors', h.errors, []);
  await h.close();

  // Desktop: the box as before, and Pin the City centred on what the HUD leaves clear
  h = await open();
  await home(h);
  await start(h.page, 'Europe');
  await h.page.waitForTimeout(500);
  f = await frameOf(h.page, [[-25, 34], [45, 34], [-25, 72], [45, 72], [10, 34], [10, 72]]);
  check('frames (desktop): Europe\'s whole box is inside the clear area', Object.keys(f.pts).every(k => inside(f.pts[k], f.clear, 2)), [f.pts, f.clear]);
  eq('frames (desktop): the globe\'s host is as wide as the stage', [f.host[0], f.host[2]], [0, f.stage[0]]);
  await h.page.evaluate(() => document.getElementById('back-btn').click());
  await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
  await start(h.page, 'pin-europe');
  await h.page.waitForTimeout(500);
  f = await frameOf(h.page, CITIES);
  check('frames (desktop): Pin the City, Europe opens with all twenty cities inside the clear area', CITIES.every(c => inside(f.pts[c.join(',')], f.clear, 2)), f.clear);
  const ys = CITIES.map(c => f.pts[c.join(',')].y);
  const slackTop = Math.min.apply(null, ys) - f.clear.top, slackBottom = f.clear.bottom - Math.max.apply(null, ys);
  check('frames (desktop): and the cities sit in the clear area, not above or below it (no card over a city)', slackTop >= 0 && slackBottom >= 0 && f.card[3] <= f.clear.top, { slackTop, slackBottom, card: f.card, clear: f.clear });
  eq('frames (desktop): no page errors', h.errors, []);
  await h.close();

  // A phone on its side: the card stands at the left, the globe in the middle of what is beside it
  h = await open({ mobile: true, dpr: 2, size: { width: 844, height: 390 } });
  await home(h);
  for (const arg of ['South America', 'capitals-europe', 'name-europe', 'flags-europe']) {
    await start(h.page, arg);
    await h.page.waitForTimeout(900);
    f = await frameOf(h.page, []);
    const centre = f.host[0] + f.host[2] / 2;
    check('frames (landscape): ' + arg + ': the card is at the left and the clear area starts beside it', f.card[0] < 30 && f.card[2] < f.stage[0] / 2 && f.clear.left - (f.host[0] < 0 ? -f.host[0] : 0) >= f.card[2], f);
    check('frames (landscape): ' + arg + ': the globe\'s middle is the middle of the clear area', Math.abs(centre - (f.clear.left + f.clear.right) / 2) <= 1.5 && Math.abs(f.host[1] + f.host[3] / 2 - (f.clear.top + f.clear.bottom) / 2) <= 1.5, f);
    if (arg !== 'South America' && arg !== 'flags-europe') {
      const shown = await h.page.evaluate(() => {
        const A = window.__atlas, g = A.globe, key = A.map.promptKey, c = A.map.clear;
        const p = key ? g.project(g.anchor('world', key)) : null;
        return { key, p: p && { x: Math.round(p.x), y: Math.round(p.y), visible: p.visible }, c };
      });
      check('frames (landscape): ' + arg + ': the country asked about is in the clear area', inside(shown.p, shown.c, 4), shown);
    }
    const cardBox = await h.page.evaluate(() => { const r = document.getElementById('prompt').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.bottom), innerHeight]; });
    check('frames (landscape): ' + arg + ': the card keeps its width and fits the window', cardBox[0] === 280 && cardBox[1] <= cardBox[2] - 8, cardBox);
    await h.page.evaluate(() => document.getElementById('back-btn').click());
    await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
  }
  eq('frames (landscape): no page errors', h.errors, []);
  await h.close();
}

/* ===== Accessibility ===== */
// Runs in the page: controls on show without a name a screen reader can say
function unnamed() {
  const shown = el => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    }
    return true;
  };
  const name = el => {
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(n => n.textContent).join(' ');
    const label = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
    return (el.getAttribute('aria-label') || by || (label && label.textContent) || el.textContent || el.getAttribute('placeholder') || '').trim();
  };
  const bad = [];
  document.querySelectorAll('button, a[href], input, select, textarea, [role="radio"], [role="switch"], [role="option"], [role="img"]').forEach(el => {
    if (shown(el) && !name(el)) bad.push((el.id ? '#' + el.id : '') + '.' + String(el.className).slice(0, 40));
  });
  const titled = Array.from(document.querySelectorAll('[title]')).filter(el => el.tagName !== 'TITLE' && !el.closest('svg')).map(el => el.outerHTML.slice(0, 60));
  return { bad, titled };
}

// Tabs through what is on show; returns the stops that showed no focus ring
async function tabWalk(page, max) {
  const dull = [], seen = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const ring = n => { const cs = getComputedStyle(n); return (cs.boxShadow && cs.boxShadow !== 'none') || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.outlineColor)); };
      const box = el.getBoundingClientRect();
      const tag = (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0] + ' ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
      // A field inside a styled box shows the ring on the box
      const wrapped = el.closest('.explore-search');
      return { tag, ring: ring(el) || (!!wrapped && ring(wrapped)), outline: getComputedStyle(el).outlineStyle, onScreen: box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth, hidden: !!el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden' };
    });
    if (!r) continue;
    if (seen.includes(r.tag) && seen.length > 3) break;
    seen.push(r.tag);
    if (!r.ring || r.hidden || !r.onScreen) dull.push(r);
  }
  return { stops: seen.length, dull, seen };
}

async function a11y() {
  for (const theme of ['light', 'dark']) {
    const h = await open(null, Object.assign(JSON.parse(require('fs').readFileSync(path.join(S, 'harness/scratch/seed-rich.json'), 'utf8')), { 'atlas-theme': theme }));
    const page = h.page;
    await home(h);
    await built(page);
    const tag = 'a11y (' + theme + '): ';
    // Names, view by view
    for (const view of ['', '#explore', '#stats', '#settings']) {
      await page.evaluate(v => { window.location.hash = v; }, view);
      await page.waitForTimeout(view === '#explore' ? 1500 : 500);
      if (view === '#explore') { await page.evaluate(() => window.__atlas.selectCountry('France')); await page.waitForTimeout(900); }
      const n = await page.evaluate(unnamed);
      check(tag + (view || 'Home') + ': every control and picture on show has a name', n.bad.length === 0, n.bad.slice(0, 6));
      check(tag + (view || 'Home') + ': nothing carries a title tooltip', n.titled.length === 0, n.titled.slice(0, 3));
      await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
      const walk = await tabWalk(page, view === '' ? 34 : 26);
      check(tag + (view || 'Home') + ': Tab reaches the controls (' + walk.stops + ' stops) and each shows a focus ring on screen', walk.stops >= 8 && walk.dull.length === 0, walk.dull.slice(0, 4));
    }
    // The focus ring itself
    await page.evaluate(() => { window.location.hash = ''; });
    await page.waitForTimeout(400);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement), root = getComputedStyle(document.documentElement);
      return { shadow: cs.boxShadow, outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, color: root.getPropertyValue('--focus-color').trim() };
    });
    check(tag + 'the ring is drawn in --focus-color, with a transparent outline behind it for forced colours', /solid 2px/.test(ring.outline) && /rgba\(0, 0, 0, 0\)|transparent/.test(ring.outline) && ring.shadow !== 'none' && ring.color.length > 3, ring);

    // The level sheet: a dialog that traps the focus and gives it back
    await page.evaluate(() => { const c = document.querySelector('[data-action="open-level"][data-level="europe"]'); c.focus(); });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    let s = await page.evaluate(() => ({ role: document.getElementById('level-sheet').getAttribute('role'), modal: document.getElementById('level-sheet').getAttribute('aria-modal'), named: !!document.getElementById(document.getElementById('level-sheet').getAttribute('aria-labelledby')), inSheet: document.getElementById('level-sheet').contains(document.activeElement) }));
    check(tag + 'the level sheet is a named modal dialog and takes the focus', s.role === 'dialog' && s.modal === 'true' && s.named && s.inSheet, s);
    let escaped = false;
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.getElementById('level-sheet').contains(document.activeElement)))) { escaped = true; break; } }
    check(tag + 'Tab stays inside the sheet', !escaped);
    const sheetNames = await page.evaluate(unnamed);
    check(tag + 'every control in the sheet has a name', sheetNames.bad.length === 0, sheetNames.bad);
    await page.keyboard.press('Escape');
    s = await page.evaluate(() => ({ hidden: document.getElementById('level-sheet').hidden, back: document.activeElement && document.activeElement.dataset.level }));
    eq(tag + 'Escape closes it and the focus goes back to the card', s, { hidden: true, back: 'europe' });

    // A dialog (reset progress)
    await page.evaluate(() => { window.location.hash = '#settings'; });
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#settings-screen button')).find(x => /reset/i.test(x.textContent)); if (!b) return false; b.focus(); b.click(); return true; });
    await page.waitForTimeout(300);
    let d = await page.evaluate(() => { const el = document.getElementById('dialog'); return { open: !el.hidden, role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), inside: el.contains(document.activeElement), label: el.getAttribute('aria-labelledby') || el.getAttribute('aria-label') }; });
    check(tag + 'the reset dialog is a named modal dialog and takes the focus', opened && d.open && /dialog/.test(d.role || '') && d.modal === 'true' && d.inside && !!d.label, d);
    escaped = false;
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.getElementById('dialog').contains(document.activeElement)))) { escaped = true; break; } }
    check(tag + 'Tab stays inside the dialog', !escaped);
    await page.keyboard.press('Escape');
    d = await page.evaluate(() => ({ hidden: document.getElementById('dialog').hidden, back: /reset/i.test((document.activeElement && document.activeElement.textContent) || '') }));
    eq(tag + 'Escape closes it and the focus goes back to its button', d, { hidden: true, back: true });

    // A round: what is said, and the results
    await start(page, 'Oceania');
    const live = await page.evaluate(() => ({ prompt: document.getElementById('prompt').getAttribute('aria-live'), atomic: document.getElementById('prompt').getAttribute('aria-atomic'), toast: document.getElementById('toast').getAttribute('role'), host: document.getElementById('globe-host').getAttribute('aria-label'), names: null }));
    eq(tag + 'the question is a live region, the answer toast a status, the globe a named picture', [live.prompt, live.atomic, live.toast, !!live.host], ['polite', 'true', 'status', true]);
    const gameNames = await page.evaluate(unnamed);
    check(tag + 'every control of the game screen has a name', gameNames.bad.length === 0, gameNames.bad);
    await page.keyboard.press('s');
    await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'), null, { timeout: 5000 }).catch(() => {});
    const said = await page.evaluate(() => document.getElementById('toast').textContent.trim());
    check(tag + 'a skipped question is told (the toast names the place)', said.length > 8, said);
    await page.evaluate(async () => {
      const A = window.__atlas, st = window.setTimeout;
      window.setTimeout = (fn, ms) => st(fn, Math.min(ms, 5));
      for (let i = 0; i < 200 && !document.getElementById('results-screen').classList.contains('active'); i++) {
        if (A.state.current && !A.state.interactionLocked) document.getElementById('skip-btn').click();
        await new Promise(r => st(r, 12));
      }
      window.setTimeout = st;
    });
    await page.waitForFunction(() => document.getElementById('results-screen').classList.contains('active'), null, { timeout: 30000 });
    const res = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, ring: document.querySelector('.score-ring').getAttribute('aria-label'), h1: document.querySelector('#results-summary h1').textContent, names: null }));
    check(tag + 'the results take the focus at their summary, whose ring is put into words', res.focus === 'results-summary' && /\d/.test(res.ring || '') && res.h1.length > 2, res);
    const resNames = await page.evaluate(unnamed);
    check(tag + 'every control of the results has a name', resNames.bad.length === 0, resNames.bad);
    const walk = await tabWalk(page, 14);
    check(tag + 'Tab goes from the summary to the actions, each with a ring', walk.stops >= 3 && walk.dull.length === 0, walk.dull.slice(0, 3));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    eq(tag + 'Escape leaves the results for Home', await page.evaluate(() => document.body.dataset.screen), 'menu');
    // A game played with the keyboard alone: the capitals that are picked from four
    await start(page, 'capitals-oceania');
    const keyed = await page.evaluate(async () => {
      const A = window.__atlas, first = A.state.current;
      const btn = Array.from(document.querySelectorAll('.choice-btn')).find(b => !b.disabled);
      btn.focus();
      return { first, focused: document.activeElement === btn, n: document.querySelectorAll('.choice-btn').length };
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ attempts: window.__atlas.state.attempts, seq: window.__atlas.state.sequence.length, picks: window.__atlas.state.picks.length }));
    check(tag + 'a capital can be picked with Tab and Enter', keyed.focused && keyed.n === 4 && (after.attempts + after.seq + after.picks) > 0, [keyed, after]);
    await page.keyboard.press('Escape');
    eq(tag + 'no page errors', h.errors, []);
    await h.close();
  }

  // Reduce motion: the app's switch stops flights, glides and the pulse, whatever the system says
  const h = await open(null, { 'atlas-motion': 'reduce' });
  await home(h);
  await start(h.page, 'Africa');
  await h.page.waitForTimeout(300);
  const still = await h.page.evaluate(async () => {
    const A = window.__atlas, g = A.globe, before = g.getView();
    document.getElementById('zoom-in-btn').click();
    const atOnce = g.getView().k;
    await new Promise(r => setTimeout(r, 400));
    const later = g.getView().k;
    const t = getComputedStyle(document.querySelector('.screen.active')).transitionDuration;
    const a = getComputedStyle(document.getElementById('prompt-country') || document.querySelector('.prompt-name')).animationDuration;
    return { before: before.k, atOnce, later, t, a, attr: document.documentElement.getAttribute('data-motion') };
  });
  check('a11y (reduce motion): a zoom arrives at once, and transitions are cut to nothing', still.attr === 'reduce' && still.atOnce > still.before * 1.2 && Math.abs(still.later - still.atOnce) < 1e-9 && parseFloat(still.t) < 0.001, still);
  const glide = await h.page.evaluate(async () => {
    const g = window.__atlas.globe, host = document.getElementById('globe-host'), r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = Math.max(r.top, 0) + 300;
    const ev = (type, x) => host.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: cy }));
    ev('pointerdown', cx);
    for (let i = 1; i <= 8; i++) { ev('pointermove', cx - i * 14); await new Promise(q => requestAnimationFrame(q)); }
    ev('pointerup', cx - 8 * 14);
    const released = g.getView().lon;
    await new Promise(q => setTimeout(q, 500));
    return { released, later: g.getView().lon };
  });
  check('a11y (reduce motion): the globe stops where a drag lets go of it (no glide)', Math.abs(glide.later - glide.released) < 1e-6, glide);
  await h.close();
}

/* ===== Explore on a phone: the search list and the Colour by panel ===== */
async function exploreChecks() {
  const h = await open({ mobile: true, dpr: 2 });
  await home(h, '#explore');
  await built(h.page);
  await h.page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 20000 });
  const vis = () => h.page.evaluate(() => ({ tools: getComputedStyle(document.getElementById('explore-tools')).visibility, list: !document.getElementById('explore-results').hidden, n: document.querySelectorAll('#explore-results [role="option"]').length }));
  eq('explore (phone): the Colour by panel shows while nothing is typed', await vis(), { tools: 'visible', list: false, n: 0 });
  await h.page.focus('#explore-search');
  await h.page.keyboard.type('fra');
  await h.page.waitForTimeout(250);
  let v = await vis();
  check('explore (phone): it steps aside while the search list is open', v.tools === 'hidden' && v.list && v.n >= 1, v);
  await h.page.evaluate(() => document.querySelector('#explore-results [role="option"]').click());
  await h.page.waitForTimeout(500);
  v = await vis();
  check('explore (phone): and comes back when a country is picked', v.tools === 'visible' && !v.list, v);
  await h.page.focus('#explore-search');
  await h.page.keyboard.type('zzzz');
  await h.page.waitForTimeout(200);
  await h.page.evaluate(() => document.getElementById('explore-stage').click());
  await h.page.waitForTimeout(200);
  v = await vis();
  check('explore (phone): or when the list is put away by a tap elsewhere', v.tools === 'visible' && !v.list, v);
  eq('explore (phone): no page errors', h.errors, []);
  await h.close();
}

(async () => {
  if (want('contrast')) {
    let out = '';
    try { out = execFileSync('node', [path.join(__dirname, 'contrast.js')], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || e); }
    check('contrast: text, the focus ring, control edges, the mastery ramp and the map\'s marks meet their thresholds in both themes', /every pair meets/.test(out), out.split('\n').slice(0, 6));
  }
  if (want('perf')) await perf();
  if (want('frames')) await frames();
  if (want('a11y')) await a11y();
  if (want('explore')) await exploreChecks();
  console.log('\npolish checks: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
