// For every level and every item: would a tap on the item's anchor answer it, at the opening view,
// after turning to it, and after how much zoom? Uses the engine's own picking with the game's arguments
// (onMapClick: tolerance 20 touch / 12 mouse, eligible = the round's own features) and elementFromPoint
// for what stands over the map. Nothing is answered.
//   node pick-probe.js --size=p390 [--levels=a,b]
'use strict';
const fs = require('fs');
const path = require('path');
const { open, startLevel, SIZES } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280');
const only = opt('levels', '');

function probeLevel(touch) {
  const A = window.__atlas, st = A.state, g = A.globe, m = A.map;
  const host = document.getElementById('globe-host');
  const hr = host.getBoundingClientRect();
  const mode = st.gameMode;
  const home = { lon: m.home.lon, lat: m.home.lat, k: m.home.k };
  const clear = m.clear;
  const tol = touch ? 20 : 12;
  const maxK = Math.max(80, 60 * home.k);
  const eligible = (layerId, key) => layerId === m.layer && m.eligible.has(key);
  const over = (x, y) => {
    const el = document.elementFromPoint(hr.left + x, hr.top + y);
    if (!el) return 'offscreen';
    if (host.contains(el)) return null;
    let e = el, tag = '';
    while (e && e !== document.body && !tag) { tag = e.id || (typeof e.className === 'string' && e.className.split(' ')[0]) || ''; e = e.parentElement; }
    return tag || el.tagName;
  };
  const shapes = !['us-city', 'name-it', 'capital-pick', 'us-state-to-capital', 'city-pin'].includes(mode);
  const dotTap = (x, y) => {
    let best = null, bestD = tol;
    m.dots.forEach(dot => { const p = g.project(dot.lonlat); const d = Math.hypot(p.x - x, p.y - y); if (p.visible && d <= bestD) { best = dot; bestD = d; } });
    return best ? best.name : 'none';
  };
  const tapResult = (x, y) => {
    const o = over(x, y);
    if (o) return 'hud:' + o;
    if (mode === 'us-city') return dotTap(x, y);
    const hit = g.featureAt(x, y, { tolerance: tol, eligible: eligible });
    if (!hit) return 'none';
    if (hit.layerId !== m.layer || !m.eligible.has(hit.key)) return 'inelig:' + hit.key;
    return hit.key;
  };
  const ringR = touch ? 8 : 4;
  const probe = (id, lonlat, view) => {
    g.setView(view);
    const p = g.project(lonlat);
    const x = Math.round(p.x), y = Math.round(p.y);
    const inClear = p.x >= clear.left && p.x <= clear.right && p.y >= clear.top && p.y <= clear.bottom;
    if (!p.visible) return { vis: false, x: x, y: y, z: +p.z.toFixed(2), inClear: inClear };
    const centre = tapResult(x, y);
    let ring = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (tapResult(x + Math.round(ringR * Math.cos(a)), y + Math.round(ringR * Math.sin(a))) === id) ring++;
    }
    return { vis: true, x: x, y: y, z: +p.z.toFixed(2), inClear: inClear, centre: centre, ok: centre === id, ring: ring };
  };
  const byName = st.activeDataset === 'us' ? st.usFeatureByCanonical
    : st.activeDataset === 'province' ? st.provinceStores[st.currentProvinceRound.split('-')[0]].featureByCanonical
      : st.featureByCanonical;
  const level = A.levelByKey(st.startArg) || A.LEVELS.find(l => l.arg === st.startArg);
  const names = level.names();
  const LADDER = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 200, 300, 600];
  const items = [];
  names.forEach(name => {
    let id, lonlat, sizeHome = null;
    if (mode === 'us-city') {
      const dot = m.dots.find(d => d.name === name);
      if (!dot) { items.push({ name: name, error: 'no dot' }); return; }
      id = name; lonlat = dot.lonlat;
    } else {
      const f = byName.get(name);
      if (!f) { items.push({ name: name, error: 'no feature' }); return; }
      id = 'name:' + (f.properties.name || f.properties.NAME);
      if (!m.eligible.has(id)) { items.push({ name: name, error: 'feature not eligible: ' + id }); return; }
      lonlat = g.anchor(m.layer, id);
      const info = g.featureInfo(m.layer, id);
      g.setView(home);
      sizeHome = +(2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180)).toFixed(1);
    }
    const it = { name: name, id: id, lonlat: [+lonlat[0].toFixed(2), +lonlat[1].toFixed(2)], sizeHome: sizeHome };
    it.home = probe(id, lonlat, home);
    // Turned to it, same zoom, then zoomed in step by step
    it.ladder = [];
    let fOk = null, fRing = null;
    for (let i = 0; i < LADDER.length; i++) {
      const k = home.k * LADDER[i];
      if (k > maxK * 1.0001) break;
      const r = probe(id, lonlat, { lon: lonlat[0], lat: lonlat[1], k: k });
      it.ladder.push(LADDER[i] + ':' + (r.vis ? (r.ok ? 'c' : 'x') + r.ring : 'h') + (r.vis && !r.ok ? '(' + r.centre + ')' : ''));
      if (r.ok && fOk === null) fOk = LADDER[i];
      if (r.ok && r.ring >= 6 && fRing === null) fRing = LADDER[i];
      if (fOk !== null && fRing !== null && i >= 6) break;
    }
    it.fOk = fOk; it.fRing = fRing;
    items.push(it);
  });
  g.setView(home);
  // HUD boxes, in host px
  const box = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return [Math.round(r.left - hr.left), Math.round(r.top - hr.top), Math.round(r.right - hr.left), Math.round(r.bottom - hr.top)]; };
  return {
    mode: mode, layer: m.layer, shapes: shapes, home: home, maxFactor: +(maxK / home.k).toFixed(1), radiusHome: +g.radiusPx().toFixed(1),
    clear: clear, host: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)],
    hud: { prompt: box('#game-screen .prompt'), gamebar: box('#game-screen .gamebar'), mapctl: box('#game-screen .mapctl'), skip: box('#skip-btn'), tally: box('#game-screen .tally'), hint: box('#game-screen .hint'), credit: box('#sat-credit'), choices: box('#choices-panel'), pin: box('#pin-btn') },
    items: items
  };
}

(async () => {
  const sz = SIZES[size];
  const h = await open({ size: size, reducedMotion: true });
  const levels = await h.page.evaluate(() => window.__atlas.LEVELS.filter(l => (typeof l.available === 'function' ? l.available() : l.available) !== false).map(l => ({ key: l.key, arg: l.arg, mode: l.mode })));
  const out = {};
  for (const lv of levels) {
    if (only && !only.split(',').includes(lv.key)) continue;
    if (['name-it', 'capital-pick', 'us-state-to-capital', 'city-pin'].includes(lv.mode)) continue;
    try {
      await startLevel(h.page, lv.arg);
      await h.page.waitForTimeout(150);
      const r = await h.page.evaluate(probeLevel, sz.touch);
      out[lv.key] = r;
      const bad = r.items.filter(i => i.error);
      const homeOk = r.items.filter(i => i.home && i.home.vis && i.home.ok).length;
      const never = r.items.filter(i => !i.error && i.fOk === null);
      const far = r.items.filter(i => !i.error && i.fOk !== null && i.fOk > 8);
      console.log(size, lv.key, 'items', r.items.length, 'homeOk', homeOk, 'never', never.map(i => i.name).join(';') || '-', 'needs>8x', far.map(i => i.name + '@' + i.fOk).join(';') || '-', bad.length ? 'ERR ' + bad.map(i => i.name + ':' + i.error).join(';') : '');
    } catch (e) {
      console.log(size, lv.key, 'FAILED', e.message.split('\n')[0]);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'pick-' + size + '.json'), JSON.stringify(out));
  console.log('errors', JSON.stringify(h.errors.slice(0, 5)));
  await h.close();
})();
