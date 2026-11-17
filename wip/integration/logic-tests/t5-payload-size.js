// How big does the sync payload get for a heavy player? Fills every store to (or past) what the app can
// produce, pushes, and measures the body the server would receive against the 256 KB limit.
'use strict';
const { launchApp, reloadApp, reporter } = require('./lib.js');

const TOKEN = '00000000000000000000000000000001';
const LIMIT = 256 * 1024;

(async () => {
  const r = reporter('payload size');
  const posts = [];
  const h = await launchApp({ noPaint: true, beforeLoad: async (hh) => {
    await hh.page.route(/\/api\/records/, async route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
  } });
  const page = h.page;
  try {
    const built = await page.evaluate(async (token) => {
      const A = window.__atlas;
      for (const l of A.LEVELS) await l.load();
      const today = A.mastery.today();
      const rnd = (n) => Math.floor(Math.random() * n);

      // mastery: every item of every skill with a long, messy history; a row for each of the 400 kept days
      const items = {};
      A.LEVELS.forEach(l => {
        const bySkill = items[l.skill] || (items[l.skill] = {});
        l.names().forEach(n => { bySkill[n] = [today - rnd(300), 1 + rnd(5), 100 + rnd(900), 10 + rnd(90), 10 + rnd(90), 10 + rnd(90), 2 + rnd(30)]; });
      });
      // the three city regions that are not built yet, at the size of the one that is
      for (let i = 0; i < 120; i++) items['us-city']['Future City ' + i + ', Some State'] = [today - rnd(300), 1 + rnd(5), 100 + rnd(900), 10 + rnd(90), 10 + rnd(90), 10 + rnd(90), 2 + rnd(30)];
      const days = {};
      for (let d = today - 400; d <= today; d++) days[d] = [1 + rnd(20), 100 + rnd(900), 100 + rnd(800), 1000 + rnd(9000)];
      const count = Object.keys(items).reduce((a, k) => a + Object.keys(items[k]).length, 0);
      localStorage.setItem('atlas-mastery', JSON.stringify({ v: 2, items: items, days: days, life: [99999, 9999999, 8888888, 99999999, 2000, 400, today, 400] }));

      // records: every found/missed level and the daily, at all three difficulties, all three bests
      const records = {};
      const regions = { 'world-country': ['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'], 'daily-five': ['Daily'],
        'us-state': ['The United States'], 'us-capital-to-state': ['US Capitals → States'], 'us-state-to-capital': ['US States → Capitals'],
        'us-city': ['Northeast', 'Midwest', 'South', 'West'], 'province': ['canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east'] };
      Object.keys(regions).forEach(mode => regions[mode].forEach(region => ['normal', 'hard', 'uncharted'].forEach(diff => {
        records[mode + '|' + region + '|' + diff] = { gamesPlayed: 1234, bestScore: { value: 368, max: 368, date: '2026-11-16' },
          bestTime: { value: 1823, total: 184, date: '2026-11-16' }, bestAccuracy: { correct: 184, total: 184, pct: 100, date: '2026-11-16' }, lastPlayed: '2026-11-16' };
      })));
      localStorage.setItem('atlas-records', JSON.stringify(records));

      // focus lists: every level, with half of its names
      const focus = {};
      A.LEVELS.filter(l => l.mode !== 'city-pin' && l.available).forEach(l => {
        const region = l.mode === 'world-country' ? l.arg : l.mode === 'province' ? l.arg : l.mode === 'us-city' ? 'Northeast' : regions[l.mode][0];
        focus[l.mode + '|' + region] = { names: l.names().filter((n, i) => i % 2 === 0), total: l.names().length, savedAt: Date.now() };
      });
      localStorage.setItem('atlas-focus', JSON.stringify(focus));

      // pin: the 200-game cap and five tries for each of the 120 cities
      const games = [];
      for (let i = 0; i < 200; i++) games.push({ at: 1794790769166 + i * 60000, region: 'North America', diff: 'uncharted', score: 1234, max: 2000, avgKm: 1234 });
      const cities = {};
      A.levelByKey('pin-world').names().forEach(n => { cities[n] = [0, 1, 2, 3, 4].map(i => [1794790769166 + i * 60000, 1234]); });
      localStorage.setItem('atlas-pin', JSON.stringify({ games: games, cities: cities }));

      // learn: a ladder in progress for every province round
      const learn = {};
      A.LEVELS.filter(l => l.mode === 'province').forEach(l => { learn[l.key] = { order: l.names(), level: 20, savedAt: Date.now() }; });
      localStorage.setItem('atlas-learn', JSON.stringify(learn));

      // daily: 30 days
      const daily = {};
      for (let i = 0; i < 30; i++) {
        const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        daily[k] = { dateKey: k, puzzleNumber: 205 - i, countries: ['Democratic Republic of the Congo', 'Saint Vincent and the Grenadines', 'Central African Republic', 'Bosnia and Herzegovina', 'United Arab Emirates'],
          sequence: [2, 1, 0, 2, 2], score: 7, correct: 4, wrong: 1, total: 5, timeSeconds: 132, hardMode: true, difficulty: 'uncharted', completedAt: Date.now() };
      }
      localStorage.setItem('atlas-daily-attempts', JSON.stringify(daily));
      localStorage.setItem('atlas-sync-token', token);
      localStorage.setItem('atlas-sync-username', 'A fairly long username');
      localStorage.setItem('atlas-reset-at', String(Date.now()));
      const sizes = {};
      ['atlas-mastery', 'atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts'].forEach(k => { sizes[k] = localStorage.getItem(k).length; });
      return { items: count, sizes: sizes };
    }, TOKEN);
    await reloadApp(h);
    // Sync's controls are a card in Settings
    await page.evaluate(() => window.__atlas.showView('settings'));
    await page.waitForSelector('#sync-now-btn');
    await page.click('#sync-now-btn');
    await page.waitForFunction(() => !document.getElementById('sync-now-btn').disabled && /last synced/.test(document.getElementById('sync-status-line').textContent), null, { timeout: 10000 });
    const body = posts[posts.length - 1];
    const bytes = Buffer.byteLength(body, 'utf8');
    console.log('   stores (chars): ' + JSON.stringify(built.sizes) + '; mastery items: ' + built.items);
    console.log('   payload: ' + body.length + ' chars, ' + bytes + ' bytes (' + (bytes / 1024).toFixed(1) + ' KB) of ' + (LIMIT / 1024) + ' KB');
    const parsed = JSON.parse(body);
    r.check('payload carries the heavy stores', Object.keys(parsed.records).length === 63 && parsed.pin.games.length === 200 && Object.keys(parsed.dailyAttempts).length === 30, [Object.keys(parsed.records).length, parsed.pin.games.length]);
    r.check('mastery survives the trip (all items)', Object.keys(parsed.mastery.items).reduce((a, k) => a + Object.keys(parsed.mastery.items[k]).length, 0) === built.items);
    r.check('a heavy player fits with room to spare (under half the limit)', bytes < LIMIT / 2, bytes);
    r.eq('no page errors', h.errors, []);
  } catch (e) { r.check('ran to the end', false, String(e && e.stack || e)); }
  await h.close();
  process.exit(r.done() ? 0 : 1);
})();
