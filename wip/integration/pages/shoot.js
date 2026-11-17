// Screenshot helper for the views.
//   NODE_PATH=/opt/node-tools/node_modules node shoot.js <out-name> [--mobile] [--dark] [--hash=stats] [--url=?play=x]
//     [--seed=file.json] [--js="code" | --jsfile=file.js] [--wait=ms] [--full] [--scroll=px|selector] [--dir=pages]
//     [--finish]   (with --url=?play=…: skip to the results screen first)
// --full grows the window to the page height at a pixel ratio low enough for the capture to stay whole.
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
  else if (!seed['atlas-theme']) seed['atlas-theme'] = 'light';
  const full = flag('full');
  const h = await launch(Object.assign({ seedStorage: seed }, flag('mobile') ? { mobile: true, dpr: full || flag('pages') ? 2 : 3 } : { width: 1280, height: 800 }));
  const page = h.page;
  // Stand-in sync server: one blob per token, kept for the life of the script
  const kv = {};
  await page.route('**/api/records*', async route => {
    const req = route.request();
    const token = new URL(req.url()).searchParams.get('token');
    if (opt('syncfail')) return route.fulfill({ status: Number(opt('syncfail')), body: '{}' });
    if (req.method() === 'POST') { kv[token] = req.postData(); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: kv[token] || 'null' });
  });
  await page.goto(h.url + (opt('url') || '') + (opt('hash') ? '#' + opt('hash') : ''));
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Number(opt('wait') || 700));
  if (flag('finish')) {
    for (let i = 0; i < 300; i++) {
      if (await page.evaluate(() => document.body.dataset.screen === 'results')) break;
      await page.keyboard.press(await page.evaluate(() => !!window.__atlas.state.pin) ? 'Enter' : 's');
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(3000);
  }
  const js = opt('jsfile') ? fs.readFileSync(opt('jsfile'), 'utf8') : opt('js');
  if (js) {
    await page.evaluate(js);
    await page.waitForTimeout(Number(opt('wait') || 700));
  }
  if (opt('scroll')) {
    await page.evaluate(to => {
      const v = document.querySelector('.screen.active');
      if (/^\d+$/.test(to)) v.scrollTop = Number(to);
      else document.querySelector(to).scrollIntoView({ block: 'start' });
    }, opt('scroll'));
    await page.waitForTimeout(300);
  }
  const dir = path.join(S, 'shots/app', opt('dir') || 'pages');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, name + '.png');
  if (full) {
    const hgt = await page.evaluate(() => {
      const v = document.querySelector('.screen.active');
      const shown = el => el && getComputedStyle(el).display !== 'none' ? el.offsetHeight : 0;
      return v.scrollHeight + shown(document.querySelector('.topnav')) + shown(document.querySelector('.tabbar'));
    });
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.min(hgt, 7000) });
    await page.waitForTimeout(400);
  }
  if (flag('pages')) {
    // A tall view as window-high pieces (name-p1.png, …): one very tall capture repeats itself past ~8,000 device px
    const pageH = Number(opt('pageh') || 1900);
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: pageH });
    await page.waitForTimeout(400);
    const dims = await page.evaluate(() => { const v = document.querySelector('.screen.active'); return { total: v.scrollHeight, win: v.clientHeight }; });
    const count = Math.max(1, Math.ceil(dims.total / dims.win));
    for (let i = 0; i < count; i++) {
      await page.evaluate(y => { document.querySelector('.screen.active').scrollTop = y; }, i * dims.win);
      await page.waitForTimeout(250);
      const file = out.replace(/\.png$/, '-p' + (i + 1) + '.png');
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
    if (h.errors.length) console.log('PAGE ERRORS:', h.errors.slice(0, 5));
    await h.close();
    return;
  }
  await page.screenshot({ path: out });
  if (h.errors.length) console.log('PAGE ERRORS:', h.errors.slice(0, 5));
  console.log('saved', out);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
