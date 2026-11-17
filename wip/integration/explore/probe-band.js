const path = require('path');
const S = path.resolve(__dirname, '../../..');
const fs = require('fs');
const chromium = require('playwright').chromium;
const stock = chromium.launch.bind(chromium);
chromium.launch = o => stock(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const SEED = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-quiz.json'), 'utf8'));
  const h = await lib.launchApp({ width: 800, height: 700, seedStorage: Object.assign({}, SEED, { 'atlas-theme': 'light' }), query: '#explore=germany' });
  const page = h.page;
  await page.waitForFunction(() => window.__atlas.explore.on && window.__atlas.explore.selected);
  await page.evaluate(() => document.querySelector('[data-action="explore-colour"][data-value="country"]').click());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(S, 'shots/app/explore/zz-band.png'), clip: { x: 0, y: 70, width: 400, height: 110 } });
  console.log(await page.evaluate(() => {
    const el = document.elementsFromPoint(180, 138).map(e => (e.id || e.className || e.tagName) + '').slice(0, 6);
    return JSON.stringify(el);
  }));
  await h.close(); process.exit(0);
})();
