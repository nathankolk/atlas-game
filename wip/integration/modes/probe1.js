// First look: registry, a round of each new mode started, screenshots
'use strict';
const path = require('path');
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad';
const { chromium } = require('playwright');
const _launch = chromium.launch.bind(chromium);
chromium.launch = (o) => _launch(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const mobile = process.argv.includes('--mobile');
  const h = await lib.launchApp(mobile ? { mobile: true, dpr: 2 } : { width: 1280, height: 800 });
  const page = h.page;
  const reg = await page.evaluate(() => {
    const A = window.__atlas;
    return {
      n: A.LEVELS.length,
      quiz: A.LEVELS.filter(l => ['capitals', 'flags', 'name'].includes(l.collection)).map(l => l.key + ':' + l.count() + ':' + l.available),
      world: A.levelByKey('world').count(),
      missing: Object.keys(A.WORLD_FACTS).filter(n => !A.state.featureByCanonical.has(n))
    };
  });
  console.log(JSON.stringify(reg, null, 1));
  const out = path.join(S, 'shots/app/modes');
  for (const key of ['capitals-europe', 'capitals-find-europe', 'flags-europe', 'name-europe', 'name-world']) {
    const s = await lib.startLevel(page, key);
    await page.waitForTimeout(1500);
    console.log(key, JSON.stringify(s));
    await page.screenshot({ path: path.join(out, 'p1-' + key + (mobile ? '-m' : '-d') + '.png') });
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
