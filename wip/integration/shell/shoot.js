// Screenshot helper. Usage:
//   NODE_PATH=/opt/node-tools/node_modules node shoot.js <name> [--mobile] [--dark] [--url=?play=x] [--full] [--seed=file.json] [--js=file.js] [--wait=ms]
// Saves $S/shots/app/shell/<name>.png. --js runs a script file in the page before the shot.
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const name = args[0];
const flag = f => args.includes('--' + f);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
(async () => {
  const seed = opt('seed') ? JSON.parse(fs.readFileSync(opt('seed'), 'utf8')) : {};
  if (flag('dark')) seed['atlas-theme'] = 'dark';
  const h = await launch(Object.assign({ seedStorage: seed }, flag('mobile') ? { mobile: true } : { width: 1280, height: 800 }));
  const page = h.page;
  await page.goto(h.url + (opt('url') || ''));
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Number(opt('wait') || 500));
  if (opt('js')) {
    await page.evaluate(fs.readFileSync(opt('js'), 'utf8'));
    await page.waitForTimeout(Number(opt('wait') || 500));
  }
  const out = path.join(S, 'shots/app/shell', name + '.png');
  if (flag('full')) {
    // The views scroll inside #app, so grow the window to the content for a whole-page shot
    const hgt = await page.evaluate(() => {
      const v = document.querySelector('.screen.active');
      return v.scrollHeight + (document.querySelector('.topnav').offsetHeight || 0) + (document.querySelector('.tabbar').offsetHeight || 0);
    });
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.min(hgt, 12000) });
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: out });
  if (h.errors.length) console.log('PAGE ERRORS:', h.errors.slice(0, 5));
  console.log('saved', out);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
