'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(S, 'work/integration/shell/seed-rich.json'), 'utf8'));
  const h = await launch({ width: 1280, height: 800, seedStorage: seed });
  const page = h.page;
  await page.goto(h.url);
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.getElementById('library-collections'), null, { timeout: 20000 });
  for (const t of [300, 3000]) {
    await page.waitForTimeout(t);
    console.log(JSON.stringify(await page.evaluate(() => {
      const A = window.__atlas;
      return ['russia-west', 'russia-south', 'russia-east', 'china-provinces'].map(k => {
        const l = A.levelByKey(k);
        const card = document.querySelector('[data-level="' + k + '"]');
        return { k, ready: l.ready(), n: l.names().length, sum: l.ready() ? A.mastery.summary(l.skill, l.names()).seen : null, ring: card.querySelector('.ring').outerHTML.slice(0, 80), due: card.querySelector('.level-due').textContent };
      });
    })));
  }
  console.log('stored russia names', JSON.stringify(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('atlas-mastery')).items['province:russia']))));
  console.log('net', JSON.stringify(h.netLog.blocked), h.errors);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
