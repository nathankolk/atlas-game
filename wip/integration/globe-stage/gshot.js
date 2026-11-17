// Screenshots for the globe stage.
//   NODE_PATH=/opt/node-tools/node_modules node gshot.js <name> <start-arg> [flags]
// Flags: --mobile --dark --diff=hard|uncharted --sat --tiles=fail --learn --size=WxH --nogl
//        --js="code run in the page after the round starts" --wait=ms --opts='{"practice":[..]}'
//        --plan=f,s,m,k,w   answers with real clicks: f first try, s second try, m missed twice,
//                           k skip, w one wrong try (toast up); --planwait=ms after each (default 1100)
//        --pin=near,off,far,drop,next,skip   Pin the City steps with real clicks: aim on the city,
//                           aim --off=<degrees> (default 6) north-east of it, aim far away, Enter, Enter, S
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const smoke = require(path.join(S, 'harness/smoke.js'));
const args = process.argv.slice(2);
const flag = f => args.includes('--' + f);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };

(async () => {
  const seed = {};
  seed['atlas-theme'] = flag('dark') ? 'dark' : 'light';
  if (opt('diff')) seed['atlas-difficulty'] = opt('diff');
  if (flag('sat')) seed['atlas-map-style'] = 'satellite';
  const size = flag('mobile') ? { mobile: true, dpr: 2 } : opt('size')
    ? { width: Number(opt('size').split('x')[0]), height: Number(opt('size').split('x')[1]) } : { width: 1280, height: 800 };
  smoke.OPT.mobile = flag('mobile');
  const h = await launch(Object.assign({ seedStorage: seed, tiles: opt('tiles') || 'mock' }, size));
  await smoke.MapAdapter.install(h.context);
  if (flag('nogl')) {
    await h.context.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        return /webgl/.test(type) ? null : get.apply(this, arguments);
      };
    });
  }
  const page = h.page;
  const t0 = Date.now();
  await page.goto(h.url);
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && window.__atlas.globe, null, { timeout: 30000 });
  let startOpts = opt('opts') ? JSON.parse(opt('opts')) : undefined;
  if (flag('learn')) startOpts = { learn: true, learnFresh: true };
  if (opt('learnlevel')) {
    // A ladder already climbed to this level (--learnlevel=N), names in the map's own order
    await page.evaluate(async ([key, level]) => {
      const l = window.__atlas.LEVELS.find(x => x.arg === key);
      await l.load();
      localStorage.setItem('atlas-learn', JSON.stringify({ [key]: { order: l.names(), level: level, savedAt: Date.now() } }));
    }, [args[1], Number(opt('learnlevel'))]);
    startOpts = { learn: true };
  }
  await page.evaluate(([a, o]) => { window.__atlas.startGame(a, o || undefined); }, [args[1], startOpts || null]);
  await page.waitForFunction(() => {
    const A = window.__atlas, s = A.state;
    return document.getElementById('game-screen').classList.contains('active') && (s.current || (s.learn && s.learn.phase === 'study'));
  }, null, { timeout: 30000 });
  await page.waitForTimeout(Number(opt('wait') || 1500));
  const M = smoke.MapAdapter;
  for (const step of (opt('plan') || '').split(',').filter(Boolean)) {
    if (step === 'f') await M.answer(page);
    else if (step === 'k') await page.keyboard.press('s');
    else {
      await M.answerWrong(page);
      await page.waitForTimeout(250);
      if (step === 's') await M.answer(page);
      if (step === 'm') await M.answerWrong(page);
    }
    if (flag('trace')) console.log(step, JSON.stringify(await page.evaluate(() => { const s = window.__atlas.state; return { cur: s.current, att: s.attempts, locked: s.interactionLocked, c: s.correct, w: s.wrong, picks: s.picks }; })));
    if (step === 'w') break;
    await page.waitForTimeout(Number(opt('planwait') || (step === 'f' || step === 's' ? 1100 : 2900)));
  }
  if (opt('pin')) {
    const cities = require(path.join(S, 'work/integration/logic-tests/lib.js')).pinCitiesFromSource();
    for (const step of opt('pin').split(',')) {
      const city = cities[await page.evaluate(() => window.__atlas.state.current)];
      const off = Number(opt('off') || 6);
      if (step === 'near') await M.pinAt(page, city.lon, city.lat);
      else if (step === 'off') await M.pinAt(page, city.lon + off, city.lat + off * 0.6);
      else if (step === 'far') await M.pinFarFrom(page, city.lon, city.lat);
      else if (step === 'drop' || step === 'next') await page.keyboard.press('Enter');
      else if (step === 'skip') await page.keyboard.press('s');
      await page.waitForTimeout(step === 'drop' || step === 'skip' || step === 'next' ? 1300 : 300);
    }
  }
  if (opt('js')) {
    const out = await page.evaluate(code => (0, eval)('(async () => {' + code + '})()'), opt('js'));
    if (out !== undefined) console.log('js ->', JSON.stringify(out));
    await page.waitForTimeout(Number(opt('wait2') || 900));
  }
  const file = path.join(S, 'shots/app/globe', args[0] + '.png');
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => {
    const g = window.__atlas.globe;
    return { view: g.getView(), stats: g.stats(), clear: window.__atlas.map.clear, host: document.getElementById('globe-host').getBoundingClientRect().toJSON() };
  });
  console.log(file, JSON.stringify(info), 'errors:', JSON.stringify(h.errors.slice(0, 5)), (Date.now() - t0) + 'ms');
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
