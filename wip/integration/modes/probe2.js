'use strict';
const path = require('path');
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad';
const { chromium } = require('playwright');
const _launch = chromium.launch.bind(chromium);
chromium.launch = (o) => _launch(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const h = await lib.launchApp({ mobile: true, dpr: 2 });
  const page = h.page;
  await lib.startLevel(page, 'name-europe');
  const r = await page.evaluate(() => {
    const box = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; };
    const cs = getComputedStyle(document.getElementById('answer-form'));
    return { prompt: box('prompt'), form: box('answer-form'), input: box('answer-input'), btn: box('answer-btn'), display: cs.display, w: cs.width, gridCols: getComputedStyle(document.getElementById('prompt')).gridTemplateColumns };
  });
  console.log(JSON.stringify(r));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
