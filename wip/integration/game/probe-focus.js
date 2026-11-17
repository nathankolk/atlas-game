// Keyboard focus is visible on each game control
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stock = chromium.launch.bind(chromium);
chromium.launch = o => stock(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const h = await lib.launchApp({ width: 1280, height: 800, seedStorage: { 'atlas-theme': 'light' } });
  const page = h.page;
  await lib.startLevel(page, 'us-state-to-capital');
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const e = document.activeElement;
      const cs = getComputedStyle(e);
      return (e.id || e.className || e.tagName) + ' -> ' + (cs.boxShadow === 'none' ? 'NO RING' : cs.boxShadow.slice(0, 60)) + (e.matches(':focus-visible') ? '' : ' (not focus-visible)');
    }));
  }
  console.log(seen.join('\n'));
  await h.close();
})();
