'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const h = await launch({ seedStorage: { 'atlas-theme': 'light' } });
  await h.page.goto(h.url);
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 60000 });
  await h.page.evaluate(a => window.__atlas.startGame(a), process.argv[2] || 'pin-europe');
  await h.page.waitForFunction(() => window.__atlas.state.current && window.__atlas.map.drawn, null, { timeout: 60000 });
  await h.page.waitForTimeout(800);
  const r = await h.page.evaluate(() => {
    const A = window.__atlas, g = A.globe, c = A.map.clear;
    const level = A.levelByKey(A.state.startArg);
    const names = level.names();
    // The cities' coordinates are in the round's own data: read them off the reveal helper's source list
    return { clear: c, n: names.length, names: names.join(', ') };
  });
  console.log(JSON.stringify(r));
  await h.close();
})();
