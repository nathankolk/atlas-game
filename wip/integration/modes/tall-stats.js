'use strict';
const path = require('path'); const fs = require('fs');
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad';
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
(async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-quiz.json'), 'utf8'));
  seed['atlas-theme'] = 'light';
  const h = await lib.launchApp({ width: 1280, height: 2700, seedStorage: seed });
  await h.page.evaluate(() => window.__atlas.showView('stats'));
  await h.page.waitForTimeout(600);
  await h.page.screenshot({ path: path.join(S, 'shots/app/modes/stats-tall-d-light.png') });
  await h.close();
})();
