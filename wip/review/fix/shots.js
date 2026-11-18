// Screenshots of every screen the review fixes touched, in both themes.
//   node shots.js [name-filter]
'use strict';
const path = require('path');
const fs = require('fs');
const { open, startLevel } = require('../globe/rlib.js');
const OUT = path.resolve(__dirname, '../../../shots/app/review-fixes');
const only = process.argv[2] || '';
const OLD = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../integration/shell/seed-old.json'), 'utf8'));
const shot = async (h, name) => { await h.page.waitForTimeout(500); await h.page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(name); };
const start = async (h, key, o) => { await startLevel(h.page, await h.page.evaluate(k => (window.__atlas.levelByKey(k) || { arg: k }).arg, key), o); await h.page.waitForTimeout(900); };

const jobs = {
  // Home: a finished ladder, a pin card with something due, a country card with something due
  async home(theme, size) {
    const h = await open({ size, seedStorage: { 'atlas-theme': theme, 'atlas-learn': JSON.stringify({ oceania: { done: true, savedAt: Date.now() - 60000 } }) } });
    await h.page.evaluate(() => { const A = window.__atlas; A.mastery.record('city-pin', 'Paris', 'miss'); A.mastery.record('country', 'France', 'miss'); A.showView('stats'); A.showView('home'); });
    await shot(h, 'home-' + size + '-' + theme);
    await h.page.evaluate(() => document.querySelector('[data-level="oceania"]').scrollIntoView({ block: 'center' }));
    await shot(h, 'home-cards-' + size + '-' + theme);
    await h.page.evaluate(() => document.querySelector('[data-level="pin-europe"]').scrollIntoView({ block: 'center' }));
    await shot(h, 'home-pin-cards-' + size + '-' + theme);
    await h.close();
  },
  // Stats for a player with old stores only
  async stats(theme, size) {
    const h = await open({ size, seedStorage: Object.assign({}, OLD, { 'atlas-theme': theme }), query: '#stats' });
    await h.page.waitForSelector('#stats-content .kpis');
    await shot(h, 'stats-old-' + size + '-' + theme);
    await h.close();
  },
  // Reduce motion: a flag round after a country round
  async reduce(theme, size) {
    if (size !== 'd1280') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme, 'atlas-motion': 'reduce' } });
    await start(h, 'world');
    await start(h, 'flags-world');
    await shot(h, 'flags-world-reduce-' + size + '-' + theme);
    await h.close();
  },
  // Phones: opening views that had places under the HUD
  async corners(theme, size) {
    if (size === 'd1280') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme } });
    for (const key of ['north-america', 'africa', 'india-states', 'pin-africa']) {
      await start(h, key);
      await h.page.waitForTimeout(5200);   // the one-time hint fades
      await shot(h, 'open-' + key + '-' + size + '-' + theme);
      await h.page.evaluate(() => document.getElementById('back-btn').click());
      await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
    }
    await start(h, 'capitals-africa', { practice: ['Madagascar'] });
    await h.page.waitForTimeout(1200);
    await shot(h, 'shown-madagascar-' + size + '-' + theme);
    await h.close();
  },
  // City dots at the opening view with a few marks, and an outlined country
  async dots(theme, size) {
    if (size === 'p360') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme } });
    await start(h, 'northeast-cities');
    await h.page.evaluate(() => { const m = window.__atlas.map; m.dotMarks.set('New York', 'found'); m.dotMarks.set('Newark', 'missed'); m.dotMarks.set('Boston', 'second'); window.__atlas.globe.invalidate(); });
    await h.page.waitForTimeout(5200);
    await shot(h, 'dots-northeast-' + size + '-' + theme);
    const box = await h.page.evaluate(() => { const A = window.__atlas, p = A.dotPoints().find(q => q.dot.name === 'New York'), r = document.getElementById('globe-host').getBoundingClientRect(); return { x: Math.max(0, r.left + p.x - 110), y: Math.max(0, r.top + p.y - 80), width: 220, height: 160 }; });
    await h.page.screenshot({ path: path.join(OUT, 'dots-nyc-closeup-' + size + '-' + theme + '.png'), clip: box });
    await start(h, 'name-world', { practice: ['Canada'] });
    await shot(h, 'name-canada-outline-' + size + '-' + theme);
    await h.close();
  },
  // Learn: Europe with Russia's name
  async learn(theme, size) {
    if (size !== 'd1280') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme } });
    await h.page.evaluate(() => { const A = window.__atlas, names = A.levelByKey('europe').names().filter(n => n !== 'Russia');
      localStorage.setItem('atlas-learn', JSON.stringify({ europe: { order: names.slice(0, 5).concat(['Russia']).concat(names.slice(5)), level: 6, savedAt: Date.now() } })); });
    await start(h, 'europe', { learn: true });
    await h.page.waitForTimeout(1200);
    await shot(h, 'learn-europe-russia-' + size + '-' + theme);
    await h.close();
  },
  // Sync set-up where storage is blocked
  async sync(theme, size) {
    if (size === 'p360') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme }, noGoto: true });
    await h.context.addInitScript(() => { const real = Storage.prototype.setItem; let n = 0; Storage.prototype.setItem = function (k) { if (/^atlas-sync/.test(k)) throw new DOMException('blocked', 'QuotaExceededError'); return real.apply(this, arguments); }; });
    await h.page.goto(h.url + '#settings');
    await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.querySelector('[data-action="sync-create"]'));
    await h.page.evaluate(() => document.querySelector('[data-action="sync-create"]').click());
    await h.page.waitForSelector('#sync-create-btn');
    await h.page.evaluate(() => document.getElementById('sync-create-btn').click());
    await shot(h, 'sync-create-blocked-' + size + '-' + theme);
    await h.close();
  },
  // A flag question (the prompt's markup changed)
  async flag(theme, size) {
    if (size === 'p360') return;
    const h = await open({ size, seedStorage: { 'atlas-theme': theme } });
    await start(h, 'flags-europe');
    await shot(h, 'flag-question-' + size + '-' + theme);
    await h.close();
  }
};

(async () => {
  for (const name of Object.keys(jobs)) {
    if (only && name.indexOf(only) < 0) continue;
    for (const size of ['d1280', 'p390', 'p360']) for (const theme of ['light', 'dark']) {
      try { await jobs[name](theme, size); } catch (e) { console.log('FAILED ' + name + ' ' + size + ' ' + theme + ': ' + String(e).split('\n')[0]); }
    }
  }
})();
