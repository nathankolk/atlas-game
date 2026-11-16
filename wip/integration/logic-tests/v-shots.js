// Screenshots of what this stage touched, desktop 1280x800 and phone 390x844, real timers, map painted
'use strict';
const path = require('path');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
// Software compositing: the harness's GPU compositing on SwiftShader stalls for seconds after each screen switch
chromium.launch = options => stockLaunch(Object.assign({}, options, { args: ((options && options.args) || []).concat(['--disable-gpu-compositing']) }));
const { launchApp, reloadApp, startLevel, answer, installPinCities } = require('./lib.js');

const OUT = path.resolve(__dirname, '..', '..', '..', 'shots', 'app', 'logic-verify');
const TOKEN = '4a8e9b2c7d3f1e6a5b8c2d4e7f9a1b3c';
const seed = {
  'atlas-records': JSON.stringify({
    'us-state|The United States|normal': { gamesPlayed: 2, bestScore: { value: 90, max: 100, date: '2026-08-01' }, bestAccuracy: { correct: 48, total: 50, pct: 96, date: '2026-08-01' }, lastPlayed: '2026-08-02' },
    'us-capital-to-state|US Capitals → States|normal': { gamesPlayed: 1, bestScore: { value: 70, max: 100, date: '2026-08-03' }, bestAccuracy: { correct: 40, total: 50, pct: 80, date: '2026-08-03' }, lastPlayed: '2026-08-03' },
    'us-state-to-capital|US States → Capitals|normal': { gamesPlayed: 1, bestScore: { value: 60, max: 100, date: '2026-08-04' }, bestAccuracy: { correct: 35, total: 50, pct: 70, date: '2026-08-04' }, lastPlayed: '2026-08-04' }
  }),
  'atlas-sync-token': TOKEN, 'atlas-sync-username': 'Ada'
};

(async () => {
  for (const dev of [{ tag: 'd', opts: { width: 1280, height: 800 } }, { tag: 'm', opts: { mobile: true } }]) {
    let postStatus = 200;
    const h = await launchApp(Object.assign({ seedStorage: seed, beforeLoad: async (hh) => {
      await hh.page.route(/\/api\/records/, route => route.request().method() === 'POST'
        ? route.fulfill({ status: postStatus, contentType: 'application/json', body: '{}' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    } }, dev.opts));
    const page = h.page;
    const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(OUT, dev.tag + '-' + name + '.png') }); console.log('shot ' + dev.tag + '-' + name); };
    try {
      await shot('01-menu');
      await page.evaluate(() => document.querySelector('[data-folder="us"]').click());
      await shot('02-menu-us-bests');
      // unplayable deep link -> notice
      await reloadApp(h, '?play=midwest-cities');
      await shot('03-notice-unplayable');
      await reloadApp(h, '?play=nowhere');
      await shot('04-notice-unknown');
      // Oceania with Australia
      await startLevel(page, 'Oceania');
      await shot('05-game-oceania');
      await answer(page, 'first');
      await answer(page, 'miss');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, dev.tag + '-06-game-oceania-marks.png') });
      for (let i = 0; i < 5; i++) await answer(page, 'first');
      await page.waitForFunction(() => window.__t.screen() === 'results-screen');
      await shot('07-results');
      // sync failure: menu dot + panel text
      postStatus = 413;
      await page.evaluate(() => document.getElementById('home-btn').click());
      await page.evaluate(() => document.getElementById('sync-entry-btn').click());
      await page.waitForSelector('#sync-now-btn');
      await page.evaluate(() => document.getElementById('sync-now-btn').click());
      await page.waitForFunction(() => /too large/.test(document.getElementById('sync-status-line').textContent));
      await shot('08-sync-error-panel');
      await page.evaluate(() => document.getElementById('sync-modal-close').click());
      await page.evaluate(() => { const b = document.getElementById('sync-entry-btn'); b.scrollIntoView({ block: 'center' }); });
      await shot('09-sync-error-menu');
      // Pin the City prompt uses the city label
      await startLevel(page, 'pin-europe');
      await shot('10-pin');
      await installPinCities(page);
      await answer(page, 'first');
      await page.evaluate(() => {});
      // second city: aim and drop, stay on the reveal
      const city = await page.evaluate(() => window.__pinCities[window.__atlas.state.current]);
      const xy = await page.evaluate(([lon, lat]) => window.__t.clientPoint(lon, lat), [city.lon + 4, city.lat - 3]);
      await page.mouse.click(xy.x, xy.y);
      await page.keyboard.press('Enter');
      await shot('11-pin-reveal');
      // Learn: study panel, then a quiz prompt
      await page.evaluate(() => document.getElementById('back-btn').click());
      await startLevel(page, 'canada-provinces', { learn: true, learnFresh: true });
      await shot('12-learn-study');
      await page.keyboard.press('Enter');
      await shot('13-learn-quiz');
      await answer(page, 'miss');
      await shot('14-learn-restart');
      await page.evaluate(() => document.getElementById('back-btn').click());
      await shot('15-menu-after');
      console.log('mastery: ' + await page.evaluate(() => localStorage.getItem('atlas-mastery')));
      console.log('errors: ' + JSON.stringify(h.errors.filter(e => !/413/.test(e))));
    } catch (e) { console.log('FAILED ' + dev.tag + ': ' + (e && e.stack || e)); }
    await h.close();
  }
})();
