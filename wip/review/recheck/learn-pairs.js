// For every ordered pair of a continent's countries: at level 2 of its Learn ladder on a phone,
// are both names drawn?  node learn-pairs.js <level-key> [--root=<dir>] [--size=390x844]
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
const KEY = args.find(a => !a.startsWith('--')) || 'oceania';
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || undefined;
const PATH = args.includes('--path');
const size = ((args.find(a => a.startsWith('--size=')) || '').slice(7) || '390x844').split('x').map(Number);
(async () => {
  const h = await lib.launchApp({ seedStorage: { 'atlas-theme': 'light' }, fast: true, root: ROOT, width: size[0], height: size[1], mobile: size[0] < 500, dpr: 1 });
  const page = h.page;
  await page.evaluate(p => { window.__viaQuiz = p; }, PATH);
  const names = await page.evaluate(k => window.__atlas.levelByKey(k).names(), KEY);
  const arg = await page.evaluate(k => window.__atlas.levelByKey(k).arg, KEY);
  const still = async () => {
    await page.evaluate(() => { window.__lastView = null; });
    await page.waitForFunction(() => {
      const A = window.__atlas, g = A.globe;
      if (!g || !A.map.drawn) return false;
      const v = g.getView();
      const key = v.lon.toFixed(5) + ',' + v.lat.toFixed(5) + ',' + v.k.toFixed(5);
      const same = window.__lastView === key;
      window.__lastView = key;
      return same;
    }, null, { timeout: 30000, polling: 300 });
  };
  let both = 0, total = 0;
  const missing = [];
  const pairs = [];
  for (const a of names) for (const b of names) if (a !== b) pairs.push([a, b]);
  // A sample when the level is large
  const step = Math.max(1, Math.floor(pairs.length / 60));
  for (let i = 0; i < pairs.length; i += step) {
    const [older, newest] = pairs[i];
    const order = [older, newest].concat(names.filter(n => n !== older && n !== newest));
    await page.evaluate(([k, o]) => {
      const all = {}; all[k] = { order: o, level: window.__viaQuiz ? 1 : 2, savedAt: Date.now() };
      localStorage.setItem('atlas-learn', JSON.stringify(all));
      window.__atlas.showView('home');
    }, [KEY, order]);
    await page.evaluate(a => { window.__atlas.startGame(a, { learn: true }); }, arg);
    await page.waitForFunction(() => { const A = window.__atlas; return A.state.learn && A.state.learn.phase === 'study' && A.map.drawn && A.map.round === A.state.roundId; }, null, { timeout: 30000 });
    await still();
    if (PATH) {
      // The way a player gets there: pass level 1's quiz, then level 2's study comes up
      await page.click('#learn-ready-btn');
      await page.waitForFunction(() => window.__atlas.state.current);
      await page.evaluate(() => window.__t.attempt(true));
      await page.waitForFunction(() => window.__atlas.state.learn && window.__atlas.state.learn.level === 2 && window.__atlas.state.learn.phase === 'study', null, { timeout: 20000 });
      await still();
      await page.waitForTimeout(400);
      await still();
    }
    const got = await page.evaluate(() => ({
      level: window.__atlas.state.learn.level,
      shown: window.__atlas.map.labels.map(l => l.name),
      hint: !document.getElementById('learn-hint').hidden
    }));
    total++;
    if (got.shown.length === 2) both++;
    else missing.push(older + ' (older) + ' + newest + ' (newest): shown ' + JSON.stringify(got.shown) + (got.hint ? ' [hint shown]' : ' [no hint]') + ' level ' + got.level);
  }
  console.log(KEY + ' ' + size.join('x') + (ROOT ? ' OLD' : ' NEW') + (PATH ? ' via level 1' : '') + ': both names shown in ' + both + ' of ' + total + ' ordered pairs');
  missing.forEach(m => console.log('  ' + m));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
