// Plays whole rounds with REAL input (touchscreen taps on touch sizes, mouse clicks otherwise): every question
// is answered by a tap on its item's anchor (its dot, for cities). Before each tap the globe is at the round's
// opening view; if the engine's own picking says a tap there would not answer, the globe is turned to the place
// and zoomed in by the smallest step of a ladder that would (what a player does by hand). Reports every
// question the real tap did not answer first try.
//   node tap-real.js --size=p390 --levels=World,Europe
'use strict';
const fs = require('fs'), path = require('path');
const { open, startLevel, SIZES } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const size = opt('size', 'p390');
const levels = opt('levels', 'Oceania').split(',');

function aim(touch) {
  const A = window.__atlas, st = A.state, g = A.globe, m = A.map;
  if ((document.querySelector('.screen.active') || {}).id !== 'game-screen') return { done: true };
  if (!st.current || st.interactionLocked) return { wait: true };
  const host = document.getElementById('globe-host'), hr = host.getBoundingClientRect();
  const tol = touch ? 20 : 12;
  const mode = st.gameMode;
  let id, lonlat;
  if (mode === 'us-city') { const dot = m.dots.find(d => d.name === st.current); id = st.current; lonlat = dot.lonlat; }
  else {
    const byName = st.activeDataset === 'us' ? st.usFeatureByCanonical : st.activeDataset === 'province' ? st.provinceStores[st.currentProvinceRound.split('-')[0]].featureByCanonical : st.featureByCanonical;
    const f = byName.get(st.current);
    id = 'name:' + (f.properties.name || f.properties.NAME);
    lonlat = g.anchor(m.layer, id);
  }
  const would = (x, y) => {
    const el = document.elementFromPoint(hr.left + x, hr.top + y);
    if (!el || !host.contains(el)) return false;
    if (mode === 'us-city') {
      let best = null, bestD = tol;
      m.dots.forEach(dot => { const p = g.project(dot.lonlat); const d = Math.hypot(p.x - x, p.y - y); if (p.visible && d <= bestD) { best = dot; bestD = d; } });
      return !!best && best.name === id;
    }
    const hit = g.featureAt(x, y, { tolerance: tol, eligible: (l, k) => l === m.layer && m.eligible.has(k) });
    return !!hit && hit.layerId === m.layer && hit.key === id;
  };
  const LADDER = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];
  g.setView(m.home);
  let p = g.project(lonlat), step = 'home';
  if (!(p.visible && would(Math.round(p.x), Math.round(p.y)))) {
    step = null;
    for (const f of LADDER) {
      g.setView({ lon: lonlat[0], lat: lonlat[1], k: m.home.k * f });
      p = g.project(lonlat);
      if (p.visible && would(Math.round(p.x), Math.round(p.y))) { step = 'x' + f; break; }
    }
  }
  return { name: st.current, id: id, step: step, x: hr.left + Math.round(p.x), y: hr.top + Math.round(p.y), seq: st.sequence.length, correct: st.correct, attempts: st.attempts };
}

(async () => {
  const sz = SIZES[size];
  const out = {};
  for (const arg of levels) {
    const nogl = args.includes('--nogl');
    const h = await open({ size: size, fast: 12, initScript: nogl ? () => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) { return /webgl/.test(type) ? null : get.apply(this, arguments); };
    } : null });
    const page = h.page;
    const fails = [], steps = {};
    let n = 0;
    try {
      await startLevel(page, arg);
      await page.waitForTimeout(400);
      for (let guard = 0; guard < 2000; guard++) {
        const a = await page.evaluate(aim, sz.touch);
        if (a.done) break;
        if (a.wait) { await page.waitForTimeout(40); continue; }
        n++;
        steps[a.step] = (steps[a.step] || 0) + 1;
        if (a.step === null) { fails.push(a.name + ' (no view found by the probe)'); await page.evaluate(() => document.getElementById('skip-btn').click()); }
        else {
          if (sz.touch) await page.touchscreen.tap(a.x, a.y); else await page.mouse.click(a.x, a.y);
          const r = await page.evaluate(([before]) => {
            const st = window.__atlas.state;
            return { seq: st.sequence.length, last: st.sequence[st.sequence.length - 1], attempts: st.attempts, cur: st.current, picks: (st.picks || []).slice() };
          }, [a]);
          if (!(r.seq === a.seq + 1 && r.last === 2)) {
            fails.push(a.name + ' @' + a.step + ' -> ' + (r.seq === a.seq ? (r.attempts > a.attempts ? 'wrong pick ' + r.picks.join('/') : 'nothing happened') : 'points ' + r.last));
            // Get past it
            await page.evaluate(() => { const s = window.__atlas.state; if (!s.interactionLocked && s.current) document.getElementById('skip-btn').click(); });
          }
        }
        // Wait for the next question
        await page.waitForFunction((name) => {
          const st = window.__atlas.state, scr = (document.querySelector('.screen.active') || {}).id;
          return scr !== 'game-screen' || (st.current !== name && !st.interactionLocked) ;
        }, a.name, { timeout: 30000 });
      }
    } catch (e) { fails.push('SCRIPT: ' + e.message.split('\n')[0]); }
    const gs = await page.evaluate(() => JSON.stringify(window.__atlas.globe.stats()));
    if (nogl) console.log('  engine', gs);
    const res = await page.evaluate(() => ({ score: window.__atlas.state.score, correct: window.__atlas.state.correct, wrong: window.__atlas.state.wrong, total: window.__atlas.state.totalQuestions, screen: (document.querySelector('.screen.active') || {}).id }));
    console.log(size, arg, 'asked', n, 'of', res.total, 'score', res.score, 'correct', res.correct, 'wrong', res.wrong, 'end', res.screen, 'views', JSON.stringify(steps), 'FAILS', fails.length, fails.join('; '), 'errors', JSON.stringify(h.errors.slice(0, 3)));
    out[arg] = { n: n, res: res, steps: steps, fails: fails };
    await h.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'tap-' + (args.includes('--nogl') ? 'nogl-' : '') + size + '-' + levels[0].replace(/\W/g, '') + '.json'), JSON.stringify(out));
})();
