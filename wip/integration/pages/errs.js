'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const seed = process.argv[3] ? JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')) : {};
  const h = await launch({ width: 1280, height: 800, seedStorage: seed });
  await h.page.goto(h.url + (process.argv[2] || ''));
  await h.page.waitForTimeout(2500);
  console.log(h.errors.join('\n') || 'no errors');
  console.log(await h.page.evaluate(() => [typeof window.__atlas, window.__atlas && window.__atlas.state.allFeatures.length, document.body.dataset.screen].join(' ')));
  await h.close();
})();
