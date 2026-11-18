// Checks for the game on the globe: picking rules, marks, view controls, review mode, resize.
//   NODE_PATH=/opt/node-tools/node_modules node check-globe.js [--mobile] [--only=a,b]   groups: picking tiny hard input view review us provinces imageryfail pin imagerymodes noimagery
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const onlyArg = args.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;
const r = lib.reporter('globe checks' + (mobile ? ' (phone)' : ''));

const open = (opts) => lib.launchApp(Object.assign(mobile ? { mobile: true, dpr: 2, width: 390, height: 844 } : { width: 1280, height: 800 }, opts || {}));
const st = (page) => page.evaluate(() => {
  const s = window.__atlas.state, m = window.__atlas.map;
  return { current: s.current, attempts: s.attempts, locked: s.interactionLocked, picks: s.picks.slice(), correct: s.correct, wrong: s.wrong,
    seq: s.sequence.slice(), marks: Array.from(m.marks.entries()), view: window.__atlas.globe.getView(), home: m.home };
});
const start = (page, arg, opts) => lib.startLevel(page, arg, opts || null);
// Client point of a named country's anchor, the globe turned to it first
const aim = (page, name) => page.evaluate(n => window.__t.aimKey(window.__t.keyFor(n)), name);
const tapName = (page, name) => page.evaluate(n => window.__t.tapKey(window.__t.keyFor(n)), name);
const tap = (page, x, y) => page.evaluate(([a, b]) => window.__t.tapAt(a, b), [x, y]);
// Client point of a lon/lat as the globe stands
const at = (page, lon, lat) => page.evaluate(([a, b]) => {
  const p = window.__atlas.globe.project([a, b]), q = document.getElementById('globe-host').getBoundingClientRect();
  return { x: q.left + p.x, y: q.top + p.y, visible: p.visible };
}, [lon, lat]);
const setView = (page, v) => page.evaluate(view => window.__atlas.globe.setView(view), v);

const groups = {};

groups.picking = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  await start(page, 'Africa', { practice: ['Chad', 'Mali', 'Niger'] });
  let s0 = await st(page);
  // Land outside the round takes no answer
  await setView(page, { lon: 2, lat: 46, k: 3 });
  let p = await at(page, 2.5, 47);
  await tap(page, p.x, p.y);
  let s = await st(page);
  r.eq('picking: a tap on a country outside the round does nothing', [s.attempts, s.picks, s.locked], [0, [], false]);
  // Open sea takes no answer
  p = await at(page, -30, 40);
  await tap(page, p.x, p.y);
  s = await st(page);
  r.eq('picking: a tap on open sea does nothing', [s.attempts, s.locked], [0, false]);
  // First wrong tap: counted, named, not locked
  const wrong = s0.current === 'Chad' ? 'Mali' : 'Chad';
  await tapName(page, wrong);
  s = await st(page);
  r.eq('picking: a wrong tap is one attempt, names what was tapped, leaves the map open', [s.attempts, s.picks, s.locked], [1, [wrong], false]);
  await tapName(page, s0.current);
  s = await st(page);
  r.eq('picking: the right place on the second try scores one point and is marked second', [s.seq, s.marks], [[1], [['name:' + s0.current, 'second']]]);
  await page.waitForFunction(() => !window.__atlas.state.interactionLocked, null, { timeout: 5000 });
  // An answered place takes no more answers
  await tapName(page, s0.current);
  s = await st(page);
  r.eq('picking: an answered place takes no answer', [s.attempts, s.picks], [0, []]);
  // Two wrong taps: the answer is revealed and marked missed
  const target = s.current;
  const other = ['Chad', 'Mali', 'Niger'].find(n => n !== target && n !== s0.current);
  await tapName(page, other);
  // Read in the same breath as the tap: the round's delays run 25 times faster here
  const shown = await page.evaluate(n => {
    window.__t.tapKey(window.__t.keyFor(n));
    return [Array.from(window.__atlas.map.shown.values()), window.__atlas.map.outlines.length, !!window.__atlas.map.reveal];
  }, other);
  s = await st(page);
  r.eq('picking: a second wrong tap ends the question as missed', [s.seq, s.locked], [[1, 0], true]);
  r.eq('picking: the answer is shown as a reveal', shown, [['reveal'], 1, true]);
  await page.waitForFunction(() => !window.__atlas.state.interactionLocked, null, { timeout: 5000 });
  s = await st(page);
  r.eq('picking: after the reveal the place keeps the missed mark', s.marks.filter(m => m[1] === 'missed'), [['name:' + target, 'missed']]);
  r.eq('picking: nothing is left showing as a reveal', await page.evaluate(() => window.__atlas.map.shown.size), 0);
  await h.close();
};

groups.tiny = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  const fresh = async () => { await start(page, 'World', { practice: ['Fiji'] }); };
  // Barbados from open water 8 px east of it, at a zoom where it is a speck
  await fresh();
  await setView(page, { lon: -59.5, lat: 13.2, k: 4 });
  let p = await at(page, -59.55, 13.17);
  const size = await page.evaluate(() => { const g = window.__atlas.globe; return 2 * g.radiusPx() * Math.sin(g.featureInfo('world', 'name:Barbados').radiusDeg * Math.PI / 180); });
  await tap(page, p.x + size / 2 + 8, p.y);
  let s = await st(page);
  r.eq('tiny: a tap in open water 8 px from Barbados (' + size.toFixed(1) + ' px across) picks Barbados', s.picks, ['Barbados']);
  // A tap inside Saudi Arabia right beside Bahrain is Saudi Arabia's
  await fresh();
  await setView(page, { lon: 50.5, lat: 26, k: 4 });
  p = await at(page, 50.0, 25.9);
  await tap(page, p.x, p.y);
  s = await st(page);
  r.eq('tiny: a tap inside Saudi Arabia next to Bahrain picks Saudi Arabia', s.picks, ['Saudi Arabia']);
  // Greenland is not part of any round
  await fresh();
  await setView(page, { lon: -40, lat: 72, k: 1.5 });
  p = await at(page, -40, 72);
  await tap(page, p.x, p.y);
  s = await st(page);
  r.eq('tiny: a tap on Greenland does nothing', [s.attempts, s.picks], [0, []]);
  await h.close();
};

groups.hard = async () => {
  const h = await open({ fast: 25, seedStorage: { 'atlas-difficulty': 'hard' } });
  const page = h.page;
  await start(page, 'Africa', { practice: ['Chad', 'Mali'] });
  const first = (await st(page)).current;
  await tapName(page, first);
  await page.waitForFunction(n => window.__atlas.state.current && window.__atlas.state.current !== n, first, { timeout: 5000 });
  let s = await st(page);
  r.eq('hard: a found place keeps no mark', s.marks, []);
  await tapName(page, first);
  s = await st(page);
  r.eq('hard: tapping it again is a wrong answer', [s.attempts, s.picks], [1, [first]]);
  await h.close();
};

groups.input = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'Africa', { practice: ['Chad', 'Mali', 'Niger'] });
  const s0 = await st(page);
  const other = s0.current === 'Chad' ? 'Mali' : 'Chad';
  const p = await aim(page, other);
  const v0 = (await st(page)).view;
  if (mobile) {
    await page.touchscreen.tap(p.x, p.y);
    await page.touchscreen.tap(p.x, p.y);
  } else {
    await page.mouse.dblclick(p.x, p.y);
  }
  await page.waitForTimeout(500);
  let s = await st(page);
  r.eq('input: two quick taps are two answers', [s.picks, s.seq], [[other, other], [0]]);
  r.check('input: and the view does not zoom (it only turns to the answer)', Math.abs(s.view.k / v0.k - 1) < 0.01, [v0.k, s.view.k]);
  await page.waitForFunction(() => !window.__atlas.state.interactionLocked, null, { timeout: 8000 });
  // A drag turns the globe and answers nothing
  s = await st(page);
  const c = await aim(page, s.current);
  const before = (await st(page)).view;
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, id: 1 }] });
    await touch('touchStart', c.x, c.y);
    for (let i = 1; i <= 6; i++) await touch('touchMove', c.x + i * 15, c.y + i * 4);
    await touch('touchEnd');
  } else {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 10, { steps: 4 });
    await page.mouse.move(c.x + 90, c.y + 25, { steps: 4 });
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
  const after = await st(page);
  r.check('input: a drag turns the globe', Math.abs(after.view.lon - before.lon) > 2, [before.lon, after.view.lon]);
  r.eq('input: and answers nothing', [after.attempts, after.picks, after.seq.length], [0, [], s.seq.length]);
  if (!mobile) {
    // Hover: a hand over what can be picked, and the hover tint. The place the two wrong taps
    // revealed carries a mark and cannot be picked again, so hover over one of the round's others.
    const spots = { Chad: [18.6, 15.3], Mali: [-2, 17.5], Niger: [9, 17] };
    const marked = after.marks.map(m => m[0]);
    const free = Object.keys(spots).find(n => !marked.includes('name:' + n));
    await setView(page, { lon: spots[free][0], lat: spots[free][1], k: 1.4 });
    const chad = await at(page, spots[free][0], spots[free][1]);
    await page.mouse.move(chad.x + 3, chad.y + 3);
    await page.mouse.move(chad.x, chad.y);
    await page.waitForFunction(() => document.getElementById('globe-host').style.getPropertyValue('--globe-cursor') === 'pointer', null, { timeout: 3000 }).catch(() => {});
    r.eq('input: the cursor is a hand over a place that can be picked', await page.evaluate(() => document.getElementById('globe-host').style.getPropertyValue('--globe-cursor')), 'pointer');
    const sea = await at(page, 0, -10);
    await page.mouse.move(sea.x, sea.y);
    await page.waitForTimeout(200);
    r.eq('input: and the grab cursor over the sea', await page.evaluate(() => document.getElementById('globe-host').style.getPropertyValue('--globe-cursor')), '');
  }
  await h.close();
};

groups.view = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'Europe');
  await page.waitForTimeout(300);
  const s0 = await st(page);
  // (a phone held upright opens on the places that bound Europe's countries, balanced as drawn: a little east of the box's middle)
  r.check('view: the round opens on its frame', Math.abs(s0.view.lon - 10) < (mobile ? 5 : 3) && s0.view.lat > 45 && s0.view.lat < 62 && Math.abs(s0.view.k - s0.home.k) < 1e-6, s0.view);
  await page.evaluate(() => { document.documentElement.dataset.motion = 'reduce'; });
  await page.keyboard.press('+');
  let s = await st(page);
  r.check('view: + zooms in by 1.6', Math.abs(s.view.k / s0.view.k - 1.6) < 0.01, s.view.k / s0.view.k);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  s = await st(page);
  r.check('view: - zooms out', s.view.k < s0.view.k, s.view.k / s0.view.k);
  await page.click('#zoom-in-btn');
  await page.click('#zoom-in-btn');
  s = await st(page);
  r.check('view: the zoom buttons work', s.view.k > s0.view.k * 1.5, s.view.k / s0.view.k);
  await setView(page, { lon: 100, lat: 0 });
  await page.keyboard.press('0');
  s = await st(page);
  r.eq('view: 0 returns to the round\'s opening view', [s.view.lon, s.view.lat, s.view.k].map(n => +n.toFixed(4)), [s0.view.lon, s0.view.lat, s0.view.k].map(n => +n.toFixed(4)));
  await setView(page, { lon: 100, lat: 0 });
  await page.click('#zoom-reset-btn');
  s = await st(page);
  r.check('view: so does the recentre button', Math.abs(s.view.lon - s0.view.lon) < 1e-3, s.view);
  // The frame sits inside what the HUD leaves clear
  const fit = await page.evaluate(() => {
    const A = window.__atlas, g = A.globe, c = A.map.clear;
    // A wide stage holds the continent's whole box; a tall one (a phone held upright) the places that bound its
    // countries: Iceland's west, Ireland's west, Lisbon's coast, Malta, Crete, Rhodes, Ukraine's east, the North Cape
    const tall = c.right - c.left < c.bottom - c.top;
    const corners = (tall ? [[-24.5, 65.5], [-10.5, 52], [-9.6, 38.7], [14.4, 35.8], [24, 34.8], [28.3, 36], [40.3, 48.5], [26, 71.2]]
      : [[-25, 34], [45, 34], [-25, 72], [45, 72], [10, 34], [10, 72]]).map(ll => g.project(ll));
    return { inside: corners.every(p => p.x >= c.left - 1 && p.x <= c.right + 1 && p.y >= c.top - 1 && p.y <= c.bottom + 1), corners: corners.map(p => [Math.round(p.x), Math.round(p.y)]), clear: c };
  });
  r.check('view: Europe\'s frame fits what the HUD leaves clear', fit.inside, fit);
  // M swaps the look and keeps the marks
  const first = s.current;
  await tapName(page, first);
  await page.waitForFunction(n => window.__atlas.state.current !== n, first, { timeout: 5000 });
  await page.keyboard.press('m');
  await page.waitForTimeout(600);
  s = await st(page);
  r.eq('view: M turns imagery on and keeps the marks', [await page.evaluate(() => document.getElementById('map-wrap').classList.contains('sat-on')), !!(await page.evaluate(() => window.__atlas.globe.stats().imagery)), s.marks.length], [true, true, 1]);
  r.check('view: the imagery credit shows', await page.evaluate(() => getComputedStyle(document.getElementById('sat-credit')).display !== 'none' && /Esri/.test(document.getElementById('sat-credit').textContent)));
  await page.keyboard.press('m');
  r.eq('view: M again turns it off', [await page.evaluate(() => document.getElementById('map-wrap').classList.contains('sat-on')), await page.evaluate(() => window.__atlas.globe.stats().imagery)], [false, null]);
  // A new window shape: marks stay; a view that was moved is kept, one at home is fitted again
  await page.keyboard.press('0');
  const size = mobile ? { width: 844, height: 390 } : { width: 900, height: 700 };
  await page.setViewportSize(size);
  await page.waitForTimeout(600);
  s = await st(page);
  r.eq('view: marks survive a new window shape', s.marks.length, 1);
  r.check('view: a view left at home is fitted to the new shape', Math.abs(s.view.k - s.home.k) < 1e-6 && Math.abs(s.home.k - s0.home.k) > 1e-3, [s0.home, s.home]);
  await h.close();
};

groups.review = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  await start(page, 'Africa', { practice: ['Chad', 'Mali'] });
  await lib.playRound(page, i => i === 0 ? 'first' : 'miss');
  await page.click('#view-map-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game');
  let s = await st(page);
  r.eq('review: the map still shows the round\'s marks', s.marks.map(m => m[1]).sort(), ['found', 'missed']);
  r.eq('review: the globe is drawing again', await page.evaluate(() => { const g = window.__atlas.globe, n = g.stats().frames; g.invalidate(); return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(g.stats().frames > n)))); }), true);
  await tapName(page, 'Niger');
  const s1 = await st(page);
  r.eq('review: taps answer nothing', [s1.attempts, s1.picks, s1.seq, s1.marks.length], [s.attempts, s.picks, s.seq, 2]);
  await page.click('#review-back-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'results');
  r.check('review: back on the results screen', true);
  await h.close();
};

groups.us = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  // States → Capitals: the prompted state is shown and in view on every prompt; the map takes no answers
  await start(page, 'us-state-to-capital', { practice: ['Hawaii', 'Alaska', 'Maine'] });
  for (let i = 0; i < 3; i++) {
    const s = await st(page);
    // The globe turns to the state; software rendering here draws the turn out, so wait for it to arrive
    const inView = () => { const A = window.__atlas, g = A.globe, c = A.map.clear, p = g.project(g.anchor('us', A.map.promptKey)); return p.visible && p.x > c.left && p.x < c.right && p.y > c.top && p.y < c.bottom; };
    await page.waitForFunction(inView, null, { timeout: 10000 }).catch(() => {});
    const seen = await page.evaluate(() => {
      const A = window.__atlas, g = A.globe, key = A.map.promptKey, c = A.map.clear;
      const p = g.project(g.anchor('us', key));
      return { key: key, tint: A.map.outlines.filter(o => o.kind === 'prompt').length, inView: p.visible && p.x > c.left && p.x < c.right && p.y > c.top && p.y < c.bottom };
    });
    r.eq('us: ' + s.current + ' is shown as the question and is in view', seen, { key: 'name:' + s.current, tint: 1, inView: true });
    if (i === 0) {
      const p = await page.evaluate(() => { const A = window.__atlas, q = A.globe.project(A.globe.anchor('us', A.map.promptKey)), b = document.getElementById('globe-host').getBoundingClientRect(); return { x: b.left + q.x, y: b.top + q.y }; });
      await tap(page, p.x, p.y);
      const after = await st(page);
      r.eq('us: a tap on the map answers nothing in States → Capitals', [after.attempts, after.seq.length], [0, 0]);
    }
    await lib.answer(page, 'first');
  }
  await page.waitForFunction(() => document.body.dataset.screen === 'results');
  // DC is drawn but is no answer
  await start(page, 'us-state', { practice: ['Maryland'] });
  await page.evaluate(() => window.__atlas.globe.setView({ lon: -77.03, lat: 38.9, k: 300 }));
  let p = await at(page, -77.03, 38.9);
  r.eq('us: the District of Columbia is on the map', await page.evaluate(([x, y]) => { const b = document.getElementById('globe-host').getBoundingClientRect(); const hit = window.__atlas.globe.featureAt(x - b.left, y - b.top, { tolerance: 0 }); return hit && hit.key; }, [p.x, p.y]), 'name:District of Columbia');
  await tap(page, p.x, p.y);
  r.eq('us: and a tap on it does nothing', (await st(page)).attempts, 0);
  // Cities: dots hold their size, the nearest dot takes the tap, marks stay
  await start(page, 'northeast-cities', { practice: ['New York', 'Newark', 'Jersey City'] });
  const first = (await st(page)).current;
  // A tap 2 px on the target's side of the midpoint between it and the dot nearest to it
  const gap = await page.evaluate(n => {
    const A = window.__atlas, g = A.globe, b = document.getElementById('globe-host').getBoundingClientRect();
    const a = g.project(A.map.dots.find(d => d.name === n).lonlat);
    let c = null, len = Infinity;
    A.map.dots.forEach(d => { const q = g.project(d.lonlat), l = Math.hypot(q.x - a.x, q.y - a.y); if (d.name !== n && l < len) { len = l; c = q; } });
    const t = Math.max(0, len / 2 - 2) / len;
    window.__t.tapAt(b.left + a.x + (c.x - a.x) * t, b.top + a.y + (c.y - a.y) * t);
    return len;
  }, first);
  let s = await st(page);
  r.eq('us: of two crowded dots (' + gap.toFixed(1) + ' px apart) the nearer takes the tap', [s.seq, s.picks], [[2], []]);
  r.eq('us: the found dot is marked', await page.evaluate(() => Array.from(window.__atlas.map.dotMarks.entries())), [[first, 'found']]);
  await h.close();
};

groups.provinces = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  // India at its opening view: the scattered territories can be tapped without zooming
  for (const name of ['Lakshadweep', 'Puducherry', 'Andaman and Nicobar Islands']) {
    await start(page, 'india-states', { practice: [name] });
    const p = await page.evaluate(n => {
      const A = window.__atlas, g = A.globe, b = document.getElementById('globe-host').getBoundingClientRect();
      const q = g.project(g.anchor('prov', 'name:' + n));
      return { x: b.left + q.x, y: b.top + q.y, size: 2 * g.radiusPx() * Math.sin(g.featureInfo('prov', 'name:' + n).radiusDeg * Math.PI / 180) };
    }, name);
    await tap(page, p.x + 5, p.y + 3);
    r.eq('provinces: ' + name + ' takes a tap 6 px off its anchor at the opening view', (await st(page)).seq, [2]);
    await page.waitForFunction(() => document.body.dataset.screen === 'results');
  }
  // Russia: a province of another round is on the map but is no answer
  await start(page, 'russia-south', { practice: ['Tatarstan'] });
  let p = await page.evaluate(() => {
    const A = window.__atlas, g = A.globe;
    // The largest province that is not in this round
    const keys = A.map.provinces.features.map(f => 'name:' + f.properties.name).filter(k => !A.map.eligible.has(k));
    const key = keys.sort((a, b) => g.featureInfo('prov', b).areaSr - g.featureInfo('prov', a).areaSr)[0];
    const a = g.anchor('prov', key);
    g.setView({ lon: a[0], lat: a[1] });
    const q = g.project(a), b = document.getElementById('globe-host').getBoundingClientRect();
    const hit = g.featureAt(q.x, q.y, { tolerance: 0 });
    return { x: b.left + q.x, y: b.top + q.y, key: key, hit: hit && hit.key };
  });
  r.eq('provinces: a province of another round is on the map', p.hit, p.key);
  await tap(page, p.x, p.y);
  r.eq('provinces: and takes no answer (' + p.key + ')', (await st(page)).attempts, 0);
  // Learn: names over the provinces, the newest always there; the pill only when a name in sight is left off
  await page.evaluate(async () => {
    const l = window.__atlas.LEVELS.find(x => x.arg === 'india-states');
    await l.load();
    localStorage.setItem('atlas-learn', JSON.stringify({ 'india-states': { order: l.names(), level: 30, savedAt: Date.now() } }));
  });
  await start(page, 'india-states', { learn: true });
  await page.waitForTimeout(400);
  const lay = () => page.evaluate(() => {
    const A = window.__atlas, m = A.map, run = A.state.learn;
    return { labels: m.labels.length, newest: m.labels.length ? m.labels[m.labels.length - 1].name === run.order[run.level - 1] : false,
      dotted: m.labels.filter(l => l.dot).length, tints: Array.from(m.tints.values()).filter(v => v === 'learnNew').length + '/' + m.tints.size,
      outline: m.outlines.filter(o => o.kind === 'learn').length, pill: !document.getElementById('learn-hint').hidden };
  });
  let l = await lay();
  r.check('learn: level 30 of India shows its names, the newest last and on top', l.labels >= 20 && l.newest && l.dotted > 5 && l.tints === '1/30' && l.outline === 1, l);
  r.eq('learn: the pill shows exactly when a name in sight was left off', l.pill, l.labels < 30);
  // Zooming in on the crowded north-east brings names back
  await page.evaluate(() => window.__atlas.globe.setView({ lon: 92.5, lat: 25.5, k: window.__atlas.globe.getView().k * 5 }));
  await page.waitForTimeout(700);
  const zoomed = await page.evaluate(() => {
    const A = window.__atlas, g = A.globe, c = A.map.clear, run = A.state.learn;
    const inSight = run.order.slice(0, run.level).filter(n => { const p = g.project(g.anchor('prov', 'name:' + n)); return p.visible && p.x > 0 && p.x < document.getElementById('globe-host').clientWidth && p.y > -document.getElementById('globe-host').offsetTop && p.y < -document.getElementById('globe-host').offsetTop + document.getElementById('map-wrap').clientHeight; });
    return { inSight: inSight.length, labelled: A.map.labels.filter(l => inSight.indexOf(l.name) !== -1).length, pill: !document.getElementById('learn-hint').hidden };
  });
  r.check('learn: zoomed in, every name in sight is laid out again and the pill is gone', zoomed.inSight > 3 && zoomed.labelled === zoomed.inSight && !zoomed.pill, zoomed);
  // The quiz takes the names away
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__atlas.state.learn.phase === 'quiz' && window.__atlas.state.current);
  l = await lay();
  r.eq('learn: the quiz shows no names, tints or outline', [l.labels, l.tints, l.outline, l.pill], [0, '0/0', 0, false]);
  await h.close();
};

groups.imageryfail = async () => {
  const h = await open({ tiles: 'fail', seedStorage: { 'atlas-map-style': 'satellite' } });
  const page = h.page;
  await start(page, 'Africa', { practice: ['Chad', 'Mali'] });
  await page.waitForFunction(() => /couldn.t load/.test(document.getElementById('toast').textContent), null, { timeout: 15000 }).catch(() => {});
  r.check('imagery: when no tile loads a toast says so', /couldn.t load/.test(await page.evaluate(() => document.getElementById('toast').textContent)));
  r.eq('imagery: and the map is the chart again, with no credit', await page.evaluate(() => [document.getElementById('map-wrap').classList.contains('sat-on'), getComputedStyle(document.getElementById('sat-credit')).display]), [false, 'none']);
  const first = (await st(page)).current;
  await tapName(page, first);
  r.eq('imagery: play goes on', (await st(page)).seq, [2]);
  await h.close();
};

// Records what the game last told the engine about each layer's borders
const spyBorders = (page) => page.evaluate(() => {
  const g = window.__atlas.globe;
  if (g.__borders) return;
  g.__borders = {};
  const update = g.updateLayer;
  g.updateLayer = function (id, o) {
    if (o && o.bordersVisible !== undefined) g.__borders[id] = o.bordersVisible;
    return update.apply(g, arguments);
  };
});
// Imagery ready with the globe at rest: a round that opens with a flight (a Learn study panel turning
// to its newest name) asks for more tiles on the way, and the note says Loading again until they are in
const imagerySettled = (page) => page.evaluate(() => new Promise(resolve => {
  const g = window.__atlas.globe, t0 = performance.now();
  let last = JSON.stringify(g.getView()), still = 0;
  const tick = () => {
    const now = JSON.stringify(g.getView()), im = g.stats().imagery;
    still = now === last ? still + 1 : 0;
    last = now;
    if (still >= 6 && im && im.status === 'ready') resolve(true);
    else if (performance.now() - t0 > 20000) resolve(false);
    else setTimeout(tick, 60);
  };
  setTimeout(tick, 60);
}));
// Where a lon/lat sits relative to what the HUD leaves clear
const sight = (page, lonlat) => page.evaluate(ll => {
  const A = window.__atlas, p = A.globe.project(ll), c = A.map.clear;
  return p.visible && p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom;
}, lonlat);
const flown = (page) => page.evaluate(() => new Promise(resolve => {
  const g = window.__atlas.globe;
  let last = JSON.stringify(g.getView()), still = 0;
  const tick = () => {
    const now = JSON.stringify(g.getView());
    still = now === last ? still + 1 : 0;
    last = now;
    if (still >= 6) resolve(); else setTimeout(tick, 60);
  };
  setTimeout(tick, 60);
}));

groups.pin = async () => {
  const h = await open();
  const page = h.page;
  await lib.installPinCities(page);
  await start(page, 'pin-world');
  const pin = () => page.evaluate(() => {
    const p = window.__atlas.state.pin;
    return { phase: p.phase, guess: p.guess && p.guess.map(v => Math.round(v * 100) / 100), done: p.results.length, btn: document.getElementById('pin-btn').disabled };
  });
  const city = () => page.evaluate(() => window.__pinCities[window.__atlas.state.current]);
  r.eq('pin: the world round opens on the whole globe, nothing to tap but the globe', await page.evaluate(() => {
    const A = window.__atlas;
    return [A.map.layer, A.globe.featureAt(A.map.clear.left + 300, A.map.clear.top + 200, { tolerance: 0 }), A.globe.getView().k <= 1.2];
  }), ['world', null, true]);
  // A tap in the sky beside the globe is no guess
  const sky = await page.evaluate(() => {
    const A = window.__atlas, b = document.getElementById('globe-host').getBoundingClientRect(), c = A.map.clear;
    const x = c.left + 6, y = c.top + 6;
    return { x: b.left + x, y: b.top + y, off: A.globe.invert(x, y) === null };
  });
  await tap(page, sky.x, sky.y);
  r.eq('pin: a tap off the globe sets no pin', [sky.off, (await pin()).guess, (await pin()).btn], [true, null, true]);
  // A tap on the sea sets the pin where it landed
  let c1 = await city();
  await page.evaluate(([lon, lat]) => window.__t.pinTap(lon, lat), [-30, 0]);
  let s = await pin();
  r.check('pin: a tap on open sea aims the pin there and frees Drop pin', s.guess && Math.abs(s.guess[0] + 30) < 0.5 && Math.abs(s.guess[1]) < 0.5 && !s.btn, s);
  // Far side of the world: after the drop the city is in sight
  const anti = [c1.lon > 0 ? c1.lon - 180 : c1.lon + 180, -c1.lat];
  await page.evaluate(([lon, lat]) => window.__t.pinTap(lon, lat), anti);
  const viewBefore = await page.evaluate(() => window.__atlas.globe.getView());
  await page.keyboard.press('Enter');
  await flown(page);
  s = await pin();
  r.eq('pin: Enter drops the pin', [s.phase, s.done], ['reveal', 1]);
  r.check('pin: a pin on the far side of the world leaves the city in sight', await sight(page, [c1.lon, c1.lat]));
  await page.keyboard.press('Enter');
  await flown(page);
  const viewAfter = await page.evaluate(() => window.__atlas.globe.getView());
  r.check('pin: the next city gets back the view the reveal turned from',
    Math.abs(viewAfter.lon - viewBefore.lon) < 0.01 && Math.abs(viewAfter.lat - viewBefore.lat) < 0.01 && Math.abs(viewAfter.k - viewBefore.k) < 0.001, [viewBefore, viewAfter]);
  r.eq('pin: and starts with no pin', [(await pin()).guess, (await pin()).btn, (await pin()).phase], [null, true, 'aim']);
  // A miss of a few thousand km, city out of sight at the time: both ends in sight afterwards
  c1 = await city();
  const guess = [c1.lon + (c1.lon > 0 ? -55 : 55), Math.max(-60, Math.min(60, c1.lat + (c1.lat > 0 ? -20 : 20)))];
  await page.evaluate(([lon, lat]) => window.__t.pinTap(lon, lat), guess);
  await page.evaluate(([lon, lat]) => { const g = window.__atlas.globe; g.setView({ lon: lon, lat: lat, k: g.getView().k * 3 }); }, guess);
  await page.keyboard.press('Enter');
  await flown(page);
  r.eq('pin: after a wide miss the city and the pin are both in sight', [await sight(page, [c1.lon, c1.lat]), await sight(page, guess)], [true, true]);
  // The player moves the globe during the reveal: the next city leaves it there
  await page.evaluate(() => { const g = window.__atlas.globe, v = g.getView(); g.setView({ lon: v.lon + 25, lat: v.lat, k: v.k }); });
  const moved = await page.evaluate(() => window.__atlas.globe.getView());
  await page.keyboard.press('Enter');
  await flown(page);
  const kept = await page.evaluate(() => window.__atlas.globe.getView());
  r.check('pin: a globe the player turned during the reveal stays where they left it', Math.abs(kept.lon - moved.lon) < 0.01 && Math.abs(kept.k - moved.k) < 0.001, [moved, kept]);
  // Skip scores nothing and shows the city
  c1 = await city();
  await page.keyboard.press('s');
  await flown(page);
  s = await pin();
  r.eq('pin: S skips: the city is shown, no points', [s.phase, s.done, await page.evaluate(() => window.__atlas.state.pin.results[2].pts), await sight(page, [c1.lon, c1.lat])], ['reveal', 3, 0, true]);
  // Leaving the round and playing something else: no pin left on the map
  await page.keyboard.press('Escape');
  await start(page, 'Africa', { practice: ['Chad'] });
  r.eq('pin: nothing of the pin round is left for the next round', await page.evaluate(() => window.__atlas.state.pin), null);
  // A continent frames its cities; Hard takes the borders away, Uncharted adds imagery
  await spyBorders(page);
  await page.evaluate(() => { localStorage.setItem('atlas-difficulty', 'hard'); });
  await lib.reloadApp(h);
  await lib.installPinCities(page);
  await spyBorders(page);
  await start(page, 'pin-europe');
  r.eq('pin: Hard draws no borders, on the chart', await page.evaluate(() => {
    const A = window.__atlas, wrap = document.getElementById('map-wrap');
    return [A.globe.__borders.world, wrap.classList.contains('sat-on'), wrap.classList.contains('no-borders'), document.getElementById('game-screen').classList.contains('pin-hard')];
  }), [false, false, false, true]);
  r.check('pin: Europe opens on its cities, every one inside the clear area', await page.evaluate(() => {
    const A = window.__atlas, c = A.map.clear;
    return Object.keys(window.__pinCities).filter(n => window.__pinCities[n].region === 'Europe').every(n => {
      const p = A.globe.project([window.__pinCities[n].lon, window.__pinCities[n].lat]);
      return p.visible && p.x > c.left && p.x < c.right && p.y > c.top && p.y < c.bottom;
    }) && A.globe.getView().k > 1.5;
  }));
  await page.keyboard.press('Escape');
  await start(page, 'Europe', { practice: ['France'] });
  r.eq('pin: a country round on Hard after it has its borders back', await page.evaluate(() => window.__atlas.globe.__borders.world), true);
  await h.close();
};

groups.imagerymodes = async () => {
  for (const diff of ['normal', 'uncharted']) {
    const h = await open({ seedStorage: { 'atlas-map-style': 'satellite', 'atlas-difficulty': diff } });
    const page = h.page;
    await lib.installPinCities(page);
    await spyBorders(page);
    const rounds = [['World', null], ['us-state', null], ['us-state-to-capital', null], ['northeast-cities', null], ['india-states', null], ['russia-west', { learn: true, learnFresh: true }], ['pin-asia', null]];
    for (const [arg, opts] of rounds) {
      await start(page, arg, opts);
      const ready = await imagerySettled(page);
      const look = await page.evaluate(() => {
        const A = window.__atlas, wrap = document.getElementById('map-wrap'), credit = document.getElementById('sat-credit');
        const im = A.globe.stats().imagery;
        return { sat: wrap.classList.contains('sat-on'), noBorders: wrap.classList.contains('no-borders'),
          credit: getComputedStyle(credit).display !== 'none' && /Esri/.test(credit.textContent) && credit.getBoundingClientRect().height > 0,
          loadingText: /Loading/.test(credit.textContent), tiles: im && im.tiles, borders: A.globe.__borders[A.map.layer],
          layersBtn: getComputedStyle(document.getElementById('map-style-btn')).display !== 'none' };
      });
      const label = 'imagery (' + diff + ', ' + arg + (opts ? ', learn' : '') + '): ';
      r.check(label + 'tiles arrive and the note stops saying Loading', ready && look.tiles > 0 && !look.loadingText, look);
      r.eq(label + 'imagery look, Esri credit, borders ' + (diff === 'uncharted' ? 'off, no layers button' : 'on'),
        [look.sat, look.credit, look.noBorders, look.borders, look.layersBtn],
        [true, true, diff === 'uncharted', diff !== 'uncharted', diff !== 'uncharted']);
      // One answer goes through and is marked (Normal) or not (Uncharted)
      const mode = await page.evaluate(() => window.__atlas.state.gameMode);
      if (mode === 'city-pin') {
        await lib.answer(page, 'second');
        r.eq(label + 'a pin drops and scores', await page.evaluate(() => { const p = window.__atlas.state.pin.results; return [p.length, p[0].pts > 20]; }), [1, true]);
      } else if (opts && opts.learn) {
        r.eq(label + 'the study names are laid out', await page.evaluate(() => window.__atlas.map.labels.length), 1);
      } else {
        await lib.answer(page, 'first');
        const m = await page.evaluate(() => window.__t.marks());
        r.eq(label + 'a right answer is ' + (diff === 'normal' ? 'marked' : 'left unmarked'), [(await st(page)).seq, m.found], [[2], diff === 'normal' ? 1 : 0]);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.body.dataset.screen !== 'game');
    }
    r.eq('imagery (' + diff + '): no page errors', h.errors.filter(e => !/tile|ERR_/i.test(e)), []);
    await h.close();
  }
};

groups.noimagery = async () => {
  // No WebGL: the engine draws with Canvas 2D and has no imagery
  const h = await open({
    seedStorage: { 'atlas-map-style': 'satellite', 'atlas-difficulty': 'uncharted' },
    beforeLoad: hh => hh.context.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) { return /webgl/.test(type) ? null : get.apply(this, arguments); };
    })
  });
  const page = h.page;
  await page.waitForFunction(() => !!window.__atlas.globe);
  const controls = () => page.evaluate(() => {
    const q = sel => Array.from(document.querySelectorAll(sel));
    const visible = el => !el.hidden && el.getClientRects().length > 0;
    return {
      renderer: window.__atlas.globe.stats().renderer, supports: window.__atlas.globe.supportsImagery(),
      difficulty: window.__atlas.state.difficulty, saved: localStorage.getItem('atlas-difficulty'),
      uncharted: q('[data-action="set-difficulty"][data-value="uncharted"]').map(b => b.disabled),
      satellite: q('[data-action="set-map"][data-value="satellite"]').map(b => [b.disabled, b.getAttribute('aria-checked')]),
      chart: q('[data-action="set-map"][data-value="parchment"]').map(b => [b.disabled, b.getAttribute('aria-checked')]),
      notes: q('[data-imagery-note]').filter(visible).map(el => el.textContent)
    };
  });
  let c = await controls();
  r.eq('no imagery: the globe draws with Canvas 2D and says it has no imagery', [c.renderer, c.supports], ['canvas2d', false]);
  r.eq('no imagery: Uncharted falls back to Hard for the visit; the saved choice is kept', [c.difficulty, c.saved], ['hard', 'uncharted']);
  r.eq('no imagery: Home locks Uncharted and Satellite, Chart is the one chosen, and a note says why',
    [c.uncharted, c.satellite, c.chart, c.notes.length, /WebGL/.test(c.notes[0] || '')], [[true], [[true, 'false']], [[false, 'true']], 1, true]);
  // The locked options do nothing when pressed from script
  await page.evaluate(() => {
    document.querySelector('[data-action="set-difficulty"][data-value="uncharted"]').click();
    document.querySelector('[data-action="set-map"][data-value="satellite"]').click();
  });
  r.eq('no imagery: pressing the locked options changes nothing', (await controls()).difficulty, 'hard');
  // The level sheet and Settings say the same
  await page.evaluate(() => document.querySelector('[data-level="africa"]').click());
  await page.waitForFunction(() => document.querySelectorAll('[data-action="set-map"]').length >= 2);
  c = await controls();
  r.eq('no imagery: the level sheet locks them too, with the note', [c.uncharted.every(Boolean), c.satellite.every(x => x[0]), c.notes.length], [true, true, 2]);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForFunction(() => document.body.dataset.screen === 'settings');
  c = await controls();
  r.check('no imagery: Settings locks them too, with the note', c.uncharted.every(Boolean) && c.satellite.every(x => x[0]) && c.notes.length >= 1, c);
  // A round plays on the chart: no imagery classes, no layers button, M does nothing, no failure toast
  await start(page, 'Africa', { practice: ['Chad', 'Mali', 'Niger'] });
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  r.eq('no imagery: the round is on the chart, without the layers button, and M changes nothing', await page.evaluate(() => {
    const wrap = document.getElementById('map-wrap');
    return [wrap.classList.contains('sat-on'), wrap.classList.contains('no-borders'), getComputedStyle(document.getElementById('map-style-btn')).display,
      getComputedStyle(document.getElementById('sat-credit')).display, window.__atlas.state.mapStyle, /couldn/.test(document.getElementById('toast').textContent)];
  }), [false, false, 'none', 'none', 'satellite', false]);
  await lib.playRound(page, i => ['first', 'second', 'miss'][i]);
  r.eq('no imagery: a whole round plays on Canvas 2D', await page.evaluate(() => [document.body.dataset.screen, window.__atlas.state.sequence]), ['results', [2, 1, 0]]);
  r.eq('no imagery: no page errors', h.errors, []);
  await h.close();
};

(async () => {
  for (const name of Object.keys(groups)) {
    if (only && !only.includes(name)) continue;
    try { await groups[name](); } catch (e) { r.check(name + ': ran to the end', false, String(e && e.stack || e).slice(0, 600)); }
  }
  process.exit(r.done() ? 0 : 1);
})();
