'use strict';
// Same as prof4 but with extra Chromium flags patched into the harness's launch call.
const path = require('path');
const pw = require('playwright');
const extra = (process.argv[2] || '').split(' ').filter(Boolean);
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (o) => orig(Object.assign({}, o, { args: (o.args || []).concat(extra) }));
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
(async () => {
  const h = await launch({ dpr: 1, root: ROOT });
  const { page, url } = h;
  const T = Date.now();
  const stamp = () => String(Date.now() - T).padStart(6);
  await page.goto(url + '?play=oceania', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  console.log(stamp(), 'first question');
  const a = Date.now(); await page.evaluate(() => 1); console.log(stamp(), 'first evaluate took', Date.now() - a);
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => { const s = window.__atlas.state; return !s.interactionLocked; }, null, { polling: 30 });
    await page.evaluate(() => { const s = window.__atlas.state; const f = s.featureByCanonical.get(s.current); const el = [...document.querySelectorAll('#world-map .country')].find(e => e.__data__ === f); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
  await page.waitForFunction(() => document.getElementById('results-screen').classList.contains('active'), null, { polling: 30 });
  console.log(stamp(), 'results active');
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'no webgl'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl ok'; });
  console.log(stamp(), 'webgl:', gl);
  await page.screenshot({ path: path.join(__dirname, 'x.png') }); console.log(stamp(), 'screenshot');
  await h.close();
  console.log(stamp(), 'closed');
})().catch(e => { console.error(e); process.exit(1); });
