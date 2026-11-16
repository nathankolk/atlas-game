// Baseline screenshots + rough interaction timings of the app as it stands.
'use strict';
const path = require('path');
const { launch, SCRATCH } = require('./atlas-harness.js');
const OUT = path.join(SCRATCH, 'shots', process.argv[2] || 'baseline');
require('fs').mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}

(async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'm-' : 'd-';
    const h = await launch({ mobile, dpr: mobile ? 2 : 1 });
    const { page, url } = h;
    await page.goto(url);
    await page.waitForSelector('#menu-content *', { timeout: 20000 });
    await page.waitForTimeout(800);
    await shot(page, tag + '01-menu');
    await page.screenshot({ path: path.join(OUT, tag + '01-menu-full.png'), fullPage: true });

    await page.goto(url + '?play=world');
    await page.waitForTimeout(2500);
    await shot(page, tag + '02-world');

    await page.goto(url + '?play=europe');
    await page.waitForTimeout(2500);
    await shot(page, tag + '03-europe');

    // Satellite
    await page.evaluate(() => localStorage.setItem('atlas-map-style', 'satellite'));
    await page.goto(url + '?play=world');
    await page.waitForTimeout(4000);
    await shot(page, tag + '04-world-sat');
    await page.evaluate(() => localStorage.setItem('atlas-map-style', 'parchment'));

    await page.goto(url + '?play=us-state');
    await page.waitForTimeout(3000);
    await shot(page, tag + '05-us');

    console.log(tag, 'errors:', JSON.stringify(h.errors.slice(0, 8)), 'blocked:', JSON.stringify(h.netLog.blocked.slice(0, 8)), 'tiles:', h.netLog.tiles);
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
