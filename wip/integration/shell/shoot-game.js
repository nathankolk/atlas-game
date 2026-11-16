// Game and results screenshots. Usage:
//   NODE_PATH=/opt/node-tools/node_modules node shoot-game.js <name> <slug> [--mobile] [--dark] [--finish] [--skips=n] [--seed=file.json]
// --skips=n presses S n times before the shot; --finish skips to the results screen.
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const flag = f => args.includes('--' + f);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
(async () => {
  const seed = opt('seed') ? JSON.parse(fs.readFileSync(opt('seed'), 'utf8')) : {};
  if (flag('dark')) seed['atlas-theme'] = 'dark';
  const h = await launch(Object.assign({ seedStorage: seed }, flag('mobile') ? { mobile: true } : { width: 1280, height: 800 }));
  const page = h.page;
  await page.goto(h.url + '?play=' + args[1]);
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.current, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const skipOnce = async () => {
    const before = await page.evaluate(() => window.__atlas.state.sequence.length + ':' + (window.__atlas.state.pin ? window.__atlas.state.pin.results.length : 0));
    await page.keyboard.press(await page.evaluate(() => !!window.__atlas.state.pin) ? 'Enter' : 's');
    await page.waitForFunction(b => {
      const st = window.__atlas.state;
      return document.getElementById('results-screen').classList.contains('active') ||
        (st.sequence.length + ':' + (st.pin ? st.pin.results.length : 0)) !== b && !st.interactionLocked;
    }, before, { timeout: 15000 }).catch(() => {});
  };
  const n = Number(opt('skips') || 0);
  for (let i = 0; i < n; i++) await skipOnce();
  if (flag('finish')) {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate(() => document.getElementById('results-screen').classList.contains('active'))) break;
      await page.keyboard.press('s');
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(900);
  }
  const out = path.join(S, 'shots/app/shell', args[0] + '.png');
  await page.screenshot({ path: out });
  if (h.errors.length) console.log('PAGE ERRORS:', h.errors.slice(0, 5));
  console.log('saved', out);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
