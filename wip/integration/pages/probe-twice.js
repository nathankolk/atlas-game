// Is Home really drawn twice at phone width, or is the tall capture repeating?
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(S, 'work/integration/shell/seed-rich.json'), 'utf8'));
  seed['atlas-theme'] = 'dark';
  const h = await launch({ mobile: true, seedStorage: seed });
  const page = h.page;
  await page.goto(h.url);
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.getElementById('library-collections'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const v = document.getElementById('menu-screen');
    return { mastheads: document.querySelectorAll('.masthead').length, greetings: document.querySelectorAll('.masthead h1').length,
      topnavs: document.querySelectorAll('.topnav').length, collections: document.querySelectorAll('.collection').length,
      libraries: document.querySelectorAll('.library').length, levelCards: document.querySelectorAll('.level').length,
      scrollH: v.scrollHeight, clientH: v.clientHeight, docH: document.documentElement.scrollHeight, bodyH: document.body.scrollHeight,
      pageH: document.querySelector('#menu-content').getBoundingClientRect().height };
  });
  console.log(JSON.stringify(info));
  // Scroll through the view in window-sized steps, one ordinary screenshot each
  const steps = Math.ceil(info.scrollH / info.clientH);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(y => { document.getElementById('menu-screen').scrollTop = y; }, i * info.clientH);
    await page.waitForTimeout(150);
    if (i === 0 || i === 3 || i === steps - 1) await page.screenshot({ path: path.join(S, 'shots/app/closeout', 'home-phone-dark-step' + i + '.png') });
  }
  console.log('steps', steps, 'errors', h.errors.length);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
