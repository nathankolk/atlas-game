// Plays levels by skipping every question and notes, per question: is the place the question shows (name-it,
// capital-pick, states->capitals) in sight and clear of the HUD, and is the revealed answer (every mode) in
// sight and clear of the HUD (toast included)? Reduced motion (flights are instant), a fresh page per level.
//   node frame-play.js --size=p390 --levels=name-world,capitals-world [--limit=N]
'use strict';
const fs = require('fs'), path = require('path');
const { open, startLevel, SIZES } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'd1280');
const levels = opt('levels', 'name-world').split(',');
const limit = Number(opt('limit', 9999));
const kb = Number(opt('kb', 0));     // px of on-screen keyboard to emulate (phone sizes)
// Pin the City's coordinates, read from the page's source (the app does not expose them)
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
const pinSrc = html.slice(html.indexOf('const PIN_CITIES = {'));
const PIN = (new Function(pinSrc.slice(0, pinSrc.indexOf('\n  };') + 5) + '; return PIN_CITIES;'))();
const PIN_LL = {};
Object.keys(PIN).forEach(region => PIN[region].forEach(c => { PIN_LL[c[0]] = [c[3], c[2]]; }));

function helpers() {
  const A = window.__atlas;
  const HUD = { card: '#prompt', toast: '#toast', actions: '#game-screen .game-actions', mapctl: '#game-screen .mapctl', tally: '#game-legend', bar: '#game-screen .gamebar', hint: '#zoom-hint', credit: '#sat-credit' };
  const rects = () => {
    const out = [];
    Object.keys(HUD).forEach(name => {
      const el = document.querySelector(HUD[name]);
      if (!el || el.hidden) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || (name !== 'toast' && cs.visibility === 'hidden')) return;
      if (name === 'toast' && !el.classList.contains('show')) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ name: name, l: r.left, t: r.top, r: r.right, b: r.bottom });
    });
    return out;
  };
  const measure = (layer, key, lonlatOnly) => {
    const g = A.globe, m = A.map;
    const hr = document.getElementById('globe-host').getBoundingClientRect();
    const rs = rects();
    const cover = (x, y) => {
      const cx = hr.left + x, cy = hr.top + y;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'offscreen';
      if (window.__kbPx && cy > innerHeight - window.__kbPx) return 'keyboard';
      const hit = rs.find(r => cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b);
      return hit ? hit.name : null;
    };
    let anchor = lonlatOnly, info = null;
    if (!anchor) { info = g.featureInfo(layer, key); anchor = g.anchor(layer, key) || info.centroid; }
    const p = g.project(anchor);
    const c = m.clear;
    const res = { vis: p.visible, z: +p.z.toFixed(2), x: Math.round(p.x), y: Math.round(p.y), cover: p.visible ? cover(p.x, p.y) : 'hidden',
      inClear: p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom, k: +g.getView().k.toFixed(3) };
    if (info) {
      res.sizePx = Math.round(2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180));
      const pts = [];
      const walk = a => { if (typeof a[0] === 'number') pts.push(a); else a.forEach(walk); };
      walk(info.feature.geometry.coordinates);
      const step = Math.max(1, Math.floor(pts.length / 200));
      let n = 0, vis = 0, cov = 0, off = 0; const by = {};
      for (let i = 0; i < pts.length; i += step) {
        n++;
        const q = g.project(pts[i]);
        if (!q.visible) continue;
        vis++;
        const w = cover(q.x, q.y);
        if (w === 'offscreen') off++; else if (w) { cov++; by[w] = (by[w] || 0) + 1; }
      }
      res.n = n; res.visN = vis; res.cov = cov; res.off = off; res.by = by;
    }
    return res;
  };
  window.__f = { measure: measure, rects: rects };
}

(async () => {
  const out = {};
  for (const arg of levels) {
    const h = await open({ size: size, reducedMotion: !args.includes('--motion'), fast: 12, initScript: kb ? () => {
      const vv = new EventTarget();
      vv.height = window.innerHeight; vv.width = window.innerWidth; vv.offsetTop = 0; vv.offsetLeft = 0; vv.scale = 1; vv.pageTop = 0; vv.pageLeft = 0;
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      window.__kb = px => { vv.height = window.innerHeight - px; vv.dispatchEvent(new Event('resize')); };
    } : null });
    await h.page.evaluate(helpers);
    await h.page.evaluate(ll => { window.__pinLL = ll; }, PIN_LL);
    const rows = [];
    try {
      await startLevel(h.page, arg);
      await h.page.waitForTimeout(500);
      if (kb) {
        await h.page.evaluate(px => { window.__kbPx = px; window.__kb(px); }, kb);
        await h.page.waitForTimeout(900);      // the refit runs 200 ms after the viewport changes
        console.log('  keyboard up:', await h.page.evaluate(() => { const s = document.getElementById('game-screen'); const A = window.__atlas; return JSON.stringify({ screenH: s.style.height, cls: s.className, clear: A.map.clear, view: A.globe.getView(), home: A.map.home, host: [document.getElementById('globe-host').offsetTop, document.getElementById('globe-host').clientHeight] }); }));
      }
      let n = 0;
      for (;;) {
        // The question is up and can be answered
        await h.page.waitForFunction(() => {
          const A = window.__atlas, st = A.state, scr = (document.querySelector('.screen.active') || {}).id;
          return scr !== 'game-screen' || (st.current && !st.interactionLocked && (!st.pin || st.pin.phase === 'aim'));
        }, null, { timeout: 30000 });
        const step = await h.page.evaluate(() => {
          const A = window.__atlas, st = A.state, m = A.map, F = window.__f;
          if ((document.querySelector('.screen.active') || {}).id !== 'game-screen') return null;
          const row = { name: st.current, mode: st.gameMode };
          if (m.promptKey) row.prompt = F.measure(m.layer, m.promptKey);
          // Skip: the answer is revealed in the same task (flights are instant here)
          document.getElementById('skip-btn').click();
          if (st.pin) {
            const truth = window.__pinLL[row.name];
            row.pinTruth = truth ? F.measure(null, null, truth) : null;
            // The city's name is drawn over the spot: 16px type, baseline 14px above it
            if (truth && row.pinTruth.vis) {
              const hr = document.getElementById('globe-host').getBoundingClientRect();
              const w = row.name.length * 8.5, x = hr.left + row.pinTruth.x, y = hr.top + row.pinTruth.y;
              const lab = { l: x - w / 2, r: x + w / 2, t: y - 30, b: y - 12 };
              row.pinLabelUnder = F.rects().filter(r => r.l < lab.r && r.r > lab.l && r.t < lab.b && r.b > lab.t).map(r => r.name).join(',') || null;
            }
          } else if (st.gameMode === 'us-city') {
            row.reveal = m.reveal ? F.measure(null, null, m.reveal.lonlat) : null;
          } else {
            const line = m.outlines.filter(l => l.kind === 'reveal').pop();
            row.reveal = line ? F.measure(m.layer, 'name:' + (line.feature.properties.name || line.feature.properties.NAME)) : null;
          }
          row.rects = F.rects().map(r => r.name + ':' + [r.l, r.t, r.r, r.b].map(Math.round).join(','));
          return row;
        });
        if (!step) break;
        rows.push(step);
        if (++n >= limit) break;
        if (step.mode === 'city-pin') {
          // Next city
          await h.page.waitForTimeout(60);
          await h.page.evaluate(() => document.getElementById('pin-btn').click());
        }
        // Wait for this question to be over
        await h.page.waitForFunction((name) => {
          const A = window.__atlas, st = A.state, scr = (document.querySelector('.screen.active') || {}).id;
          return scr !== 'game-screen' || st.current !== name;
        }, step.name, { timeout: 30000 });
      }
    } catch (e) { console.log(size, arg, 'FAILED after', rows.length, e.message.split('\n')[0]); }
    out[arg] = rows;
    const bad = (r, what) => r[what] && (r[what].cover || !r[what].vis || (r[what].visN !== undefined && (r[what].visN === 0 || (r[what].cov + r[what].off) / Math.max(1, r[what].visN) > 0.4)));
    const pr = rows.filter(r => bad(r, 'prompt')), rv = rows.filter(r => bad(r, 'reveal')), pt = rows.filter(r => r.pinTruth && (r.pinTruth.cover || !r.pinTruth.vis || r.pinLabelUnder));
    const fmt = (r, what) => r.name + '[' + (r[what].vis ? (r[what].cover || 'anchor ok') : 'hidden') + (what === 'pinTruth' && r.pinLabelUnder ? ' label under ' + r.pinLabelUnder : '') + (r[what].visN !== undefined ? ' cov ' + r[what].cov + '+off ' + r[what].off + '/' + r[what].visN + ' ' + JSON.stringify(r[what].by) + ' ' + r[what].sizePx + 'px' : '') + ']';
    console.log(size, arg, 'questions', rows.length, '| prompt issues', pr.length, pr.slice(0, 40).map(r => fmt(r, 'prompt')).join('; '), '| reveal issues', rv.length, rv.slice(0, 40).map(r => fmt(r, 'reveal')).join('; '), '| pin', pt.length, pt.slice(0, 20).map(r => fmt(r, 'pinTruth')).join('; '), 'errors', JSON.stringify(h.errors.slice(0, 3)));
    await h.close();
  }
  const file = path.join(__dirname, 'out', 'frame-' + size + (kb ? '-kb' : '') + '-' + levels[0] + '.json');
  fs.writeFileSync(file, JSON.stringify(out));
})();
