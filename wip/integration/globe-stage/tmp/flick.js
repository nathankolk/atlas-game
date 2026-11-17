const path = require('path');
const S = path.resolve(__dirname, '../../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = o => stockLaunch(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const h = await lib.launchApp({ width: 1000, height: 700, seedStorage: { 'atlas-motion': 'full' } });
  const page = h.page;
  await lib.startLevel(page, 'Africa', { practice: ['Chad'] });
  await page.waitForTimeout(800);
  const out = await page.evaluate(async () => {
    const g = window.__atlas.globe, host = document.getElementById('globe-host');
    const b = host.getBoundingClientRect(), x = b.left + 500, y = b.top + 400;
    const send = (type, px) => host.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: px, clientY: y }));
    const log = [g.getView().lon];
    send('pointerdown', x);
    for (let i = 1; i <= 6; i++) { await new Promise(r => setTimeout(r, 16)); send('pointermove', x - i * 22); }
    send('pointerup', x - 132);
    log.push(g.getView().lon);
    for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 200)); log.push(g.getView().lon); }
    return { log, motion: document.documentElement.getAttribute('data-motion'), media: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  console.log(JSON.stringify(out));
  await h.close();
})();
