// Game and results screenshots for the game-chrome stage.
//   NODE_PATH=/opt/node-tools/node_modules node shoot.js <name> <level-key> [flags]
// Flags:
//   --mobile --dark --seed=file.json   --diff=hard|uncharted   --sat   --tiles=fail
//   --learn            open the level in Learn mode (study panel first)
//   --practice=n       a practice round of the level's first n names
//   --plan=a,b,c       answers, in order: f first try, s second try, m missed twice, k skip,
//                      w one wrong try and stop there (toast up), p pin aimed (not dropped),
//                      d pin dropped (reveal up), q Learn: start the quiz
//   --rest=f|k|mix     after the plan, play everything left this way, to the results screen
//   --viewmap          on the results screen, open "View on the map"
//   --elapsed=sec      make the round look this old (clock)
//   --js="code"        run in the page before the shot      --wait=ms    settle time before the shot
//   --scroll=px        scroll the results screen            --dir=name   folder under shots/app (default game)
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
// Compositing in software: with the harness's GPU compositing over a software GL driver, a
// screenshot over the map can wait longer than its timeout (same switch as the smoke suite)
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const args = process.argv.slice(2);
const flag = f => args.includes('--' + f);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };

// Delays in the page run window.__speed times faster (1 = as written)
function speedScript() {
  window.__speed = 25;
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    return st.apply(window, [fn, ms > 50 ? ms / window.__speed : ms].concat(rest));
  };
}

(async () => {
  const seed = opt('seed') ? JSON.parse(fs.readFileSync(opt('seed'), 'utf8')) : {};
  seed['atlas-theme'] = flag('dark') ? 'dark' : 'light';
  if (opt('diff')) seed['atlas-difficulty'] = opt('diff');
  if (flag('sat')) seed['atlas-map-style'] = 'satellite';
  const size = flag('mobile') ? { mobile: true, dpr: 2 } : opt('size') ? { width: Number(opt('size').split('x')[0]), height: Number(opt('size').split('x')[1]) } : { width: 1280, height: 800 };
  const h = await lib.launchApp(Object.assign({ seedStorage: seed, tiles: opt('tiles') || 'mock',
    beforeLoad: hh => hh.context.addInitScript(speedScript) }, size));
  const page = h.page;
  await lib.installPinCities(page);
  const key = args[1];
  const info = await page.evaluate(k => {
    const level = window.__atlas.levelByKey(k);
    return level ? { arg: level.arg } : null;
  }, key);
  const startOpts = flag('learn') ? { learn: true, learnFresh: true } : null;
  let arg = key === 'daily' ? 'daily-five' : info.arg;
  if (opt('practice')) {
    const level = await page.evaluate(async k => {
      const l = window.__atlas.levelByKey(k);
      await l.load();
      return l.names();
    }, key);
    await lib.startLevel(page, arg, { practice: level.slice(0, Number(opt('practice'))) });
  } else {
    await lib.startLevel(page, arg, startOpts);
  }
  await page.evaluate(() => document.fonts.ready);
  if (opt('elapsed')) await page.evaluate(sec => { window.__atlas.state.startTime -= sec * 1000; }, Number(opt('elapsed')));

  const how = { f: 'first', s: 'second', m: 'miss', k: 'skip' };
  const plan = (opt('plan') || '').split(',').filter(Boolean);
  for (const step of plan) {
    if (how[step]) {
      await lib.answer(page, how[step]);
    } else if (step === 'w') {
      await page.evaluate(() => { window.__speed = 1; });
      await page.evaluate(() => window.__t.attempt(false));
    } else if (step === 'q') {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__atlas.state.learn && window.__atlas.state.learn.phase === 'quiz' && window.__atlas.state.current, null, { timeout: 15000 });
    } else if (step === 'p' || step === 'd') {
      const city = await page.evaluate(() => window.__pinCities[window.__atlas.state.current]);
      const xy = await page.evaluate(([lon, lat]) => window.__t.clientPoint(lon, lat), [city.lon + 3.2, city.lat - 2.1]);
      await page.evaluate(([x, y]) => {
        document.getElementById('world-map').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      }, [xy.x, xy.y]);
      if (step === 'd') {
        await page.evaluate(() => { window.__speed = 1; });
        await page.click('#pin-btn');
      }
    }
  }
  if (opt('rest') === 'learn') {
    // A Learn ladder to its end: start each quiz, find every name first try
    for (let i = 0; i < 3000; i++) {
      const s = await lib.snap(page);
      if (s.screen !== 'game-screen') break;
      if (s.learnPhase === 'study') {
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => { const l = window.__atlas.state.learn; return !l || (l.phase === 'quiz' && window.__atlas.state.current); }, null, { timeout: 15000 });
      } else {
        await lib.answer(page, 'first');
      }
    }
  } else if (opt('rest')) {
    const r = opt('rest');
    await lib.playRound(page, i => r === 'mix' ? ['first', 'first', 'second', 'first', 'miss', 'first', 'first', 'skip'][i % 8] : how[r]);
  }
  if (flag('viewmap')) {
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('[data-action="view-map"]').click());
  }
  if (opt('js')) await page.evaluate(opt('js'));
  await page.waitForTimeout(Number(opt('wait') || (opt('rest') ? 3200 : 900)));
  if (opt('scroll')) {
    await page.evaluate(px => { document.querySelector('.screen.active').scrollTop = Number(px); }, opt('scroll'));
    await page.waitForTimeout(300);
  }
  const dir = path.join(S, 'shots/app', opt('dir') || 'game');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, args[0] + '.png');
  await page.screenshot({ path: out });
  const errs = (h.errors || []).filter(e => !/fonts\.g|ERR_|Failed to load resource/.test(String(e)));
  if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
  console.log('saved', out);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
