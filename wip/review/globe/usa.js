'use strict';
const { open, startLevel } = require('./rlib.js');
(async () => {
  const h = await open({ size: 'd1280' });
  const names = await h.page.evaluate(() => window.__atlas.levelByKey('name-world').names().filter(n => /United|America/.test(n)));
  console.log('names', JSON.stringify(names));
  const arg = await h.page.evaluate(() => window.__atlas.levelByKey('name-world').arg);
  await startLevel(h.page, arg, { practice: ['United States of America'] });
  await h.page.waitForTimeout(1200);
  console.log(await h.page.evaluate(() => { const A = window.__atlas; return JSON.stringify({ current: A.state.current, total: A.state.totalQuestions, practice: !!A.state.practice, promptKey: A.map.promptKey }); }));
  await h.close();
})();
