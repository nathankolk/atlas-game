const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stock = chromium.launch.bind(chromium);
chromium.launch = o => stock(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const h = await lib.launchApp({ mobile: true, dpr: 2, query: '#explore' });
  const page = h.page;
  await page.waitForFunction(() => window.__atlas.explore.on);
  console.log(await page.evaluate(() => ['.explore-side', '.explore-search', '.explore-tools', '#explore-results'].map(sel => {
    const cs = getComputedStyle(document.querySelector(sel));
    return sel + ' pos=' + cs.position + ' z=' + cs.zIndex + ' disp=' + cs.display;
  }).join('\n')));
  console.log(await page.evaluate(() => window.innerWidth + 'x' + window.innerHeight));
  await h.close();
  process.exit(0);
})();
