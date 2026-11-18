// A returning player's stores in the OLD app's shapes: nothing dropped, renamed or misread; then play and see what is written.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const out = [];
const say = s => { out.push(s); console.log(s); };
const day = off => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const rec = (score, max, correct, total, date, games, time) => Object.assign({
  gamesPlayed: games, bestScore: { value: score, max: max, date: date },
  bestAccuracy: { correct: correct, total: total, pct: Math.round(correct / total * 100), date: date }, lastPlayed: date
}, time ? { bestTime: { value: time, total: total, date: date } } : {});

const records = {
  'world-country|Oceania|normal': rec(12, 14, 6, 7, day(-40), 4),
  'world-country|Oceania|hard': rec(14, 14, 7, 7, day(-30), 2, 21),
  'world-country|World|hard': rec(300, 368, 160, 184, day(-20), 3),
  'world-country|North America|uncharted': rec(40, 46, 21, 23, day(-10), 1),
  'world-country|Europe|normal': rec(78, 78, 39, 39, day(-12), 9, 95),
  'daily-five|Daily|normal': rec(10, 10, 5, 5, day(-3), 31, 12),
  'us-state|The United States|normal': rec(96, 100, 49, 50, day(-8), 6),
  'us-capital-to-state|US Capitals → States|normal': rec(80, 100, 44, 50, day(-7), 2),
  'us-state-to-capital|US States → Capitals|hard': rec(70, 100, 40, 50, day(-6), 2),
  'us-city|Northeast|normal': rec(60, 80, 33, 40, day(-5), 5),
  'province|russia-west|normal': rec(40, 58, 22, 29, day(-4), 2),
  'province|canada-provinces|hard': rec(26, 26, 13, 13, day(-2), 7, 44),
  'North America|normal': rec(44, 46, 23, 23, '2026-04-24', 7, 182),
  'us-city|Midwest|normal': { gamesPlayed: 1, bestScore: { value: 0, max: 0, date: day(-50) }, bestAccuracy: { correct: 0, total: 0, pct: 0, date: day(-50) }, lastPlayed: day(-50) }
};
const focus = {
  'world-country|Oceania': { names: ['Vanuatu', 'New Caledonia', 'Fiji'], total: 7, savedAt: Date.now() - 40 * 86400000 },
  'world-country|Europe': { names: [], total: 39, savedAt: Date.now() - 12 * 86400000 },
  'us-state|The United States': { names: ['Iowa', 'Missouri'], total: 50, savedAt: Date.now() - 8 * 86400000 },
  'us-capital-to-state|US Capitals → States': { names: ['Kentucky', 'Vermont', 'Oregon'], total: 50, savedAt: Date.now() - 7 * 86400000 },
  'us-state-to-capital|US States → Capitals': { names: ['South Dakota'], total: 50, savedAt: Date.now() - 6 * 86400000 },
  'us-city|Northeast': { names: ['Worcester', 'Yonkers'], total: 40, savedAt: Date.now() - 5 * 86400000 },
  'province|russia-west': { names: ['Tver', 'Ryazan'], total: 29, savedAt: Date.now() - 4 * 86400000 }
};
const pin = {
  games: [
    { at: Date.now() - 9 * 86400000, region: 'Oceania', diff: 'normal', score: 1640, max: 2000, avgKm: 212 },
    { at: Date.now() - 8 * 86400000, region: 'World', diff: 'hard', score: 900, max: 2000, avgKm: 800 },
    { at: Date.now() - 7 * 86400000, region: 'Europe', diff: 'uncharted', score: 0, max: 2000, avgKm: null }
  ],
  cities: { 'Sydney': [[Date.now() - 9 * 86400000, 12]], 'Gold Coast': [[Date.now() - 9 * 86400000, null]], 'Paris': [[Date.now() - 7 * 86400000, null]] }
};
const learn = { 'canada-provinces': { order: ['Quebec', 'Saskatchewan', 'Yukon', 'Ontario', 'Nunavut', 'Manitoba', 'Alberta', 'British Columbia', 'Nova Scotia', 'New Brunswick', 'Prince Edward Island', 'Newfoundland and Labrador', 'Northwest Territories'], level: 5, savedAt: Date.now() - 86400000 } };
const daily = {};
for (let i = 1; i <= 6; i++) {
  daily[day(-i)] = { dateKey: day(-i), puzzleNumber: 0, countries: ['Afghanistan', 'Mexico', 'Jordan', 'Cameroon', 'Benin'], sequence: [2, 2, 1, 0, 2], score: 7, correct: 4, wrong: 1, total: 5, timeSeconds: 32, hardMode: i % 2 === 0, completedAt: Date.now() - i * 86400000 };
  if (i < 3) daily[day(-i)].difficulty = i % 2 === 0 ? 'hard' : 'normal';
}
const seed = {
  'atlas-records': JSON.stringify(records), 'atlas-focus': JSON.stringify(focus), 'atlas-pin': JSON.stringify(pin),
  'atlas-learn': JSON.stringify(learn), 'atlas-daily-attempts': JSON.stringify(daily),
  'atlas-hard-mode': 'true', 'atlas-map-style': 'satellite'
};
const KEYS = Object.keys(seed);

(async () => {
  const sess = await L.open({ seed });
  const page = sess.page;
  await L.home(sess);
  await L.waitMenu(page);
  const same = async when => {
    for (const k of KEYS) {
      const v = await L.raw(page, k);
      if (v !== seed[k]) say('PROBLEM ' + when + ': ' + k + ' changed. now: ' + String(v).slice(0, 300));
    }
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    say(when + ': keys ' + keys.join(', '));
  };
  await same('after load');
  const st = await page.evaluate(() => ({ diff: window.__atlas.state.difficulty, hard: window.__atlas.state.hardMode, style: window.__atlas.state.mapStyle }));
  say('settings read: ' + JSON.stringify(st));
  const homeText = await page.evaluate(() => {
    const t = sel => Array.from(document.querySelectorAll(sel)).map(e => e.innerText.replace(/\s+/g, ' ').trim());
    return { masthead: t('#menu-screen .masthead, #menu-screen header').slice(0, 2), daily: t('#menu-screen .daily'), review: t('#menu-screen .review'),
      cards: Array.from(document.querySelectorAll('[data-action="open-level"]')).map(c => c.dataset.level + ': ' + c.innerText.replace(/\s+/g, ' ').trim() + ' [' + c.getAttribute('aria-label') + ']') };
  });
  say('HOME ' + JSON.stringify(homeText, null, 1));
  await page.screenshot({ path: 'shots/old-home.png', fullPage: false });
  // sheets: every level with a focus list or learn
  for (const key of ['oceania', 'europe', 'us-state', 'us-capital-to-state', 'us-state-to-capital', 'northeast-cities', 'russia-west', 'canada-provinces', 'world', 'north-america', 'pin-oceania', 'pin-europe']) {
    await page.evaluate(k => document.querySelector('[data-action="open-level"][data-level="' + k + '"]').click(), key);
    await page.waitForSelector('#level-sheet:not([hidden])');
    await L.sleep(250);
    const t = await page.evaluate(() => document.getElementById('level-sheet').innerText.replace(/\s+/g, ' ').trim());
    say('SHEET ' + key + ': ' + t.slice(0, 700));
    await page.keyboard.press('Escape');
    await L.sleep(150);
  }
  await same('after sheets');
  // stats
  await page.evaluate(() => { location.hash = '#stats'; });
  await L.sleep(600);
  await page.evaluate(() => { const b = document.querySelector('[data-action="show-all-records"]'); if (b) b.click(); });
  await L.sleep(200);
  const stats = await page.evaluate(() => document.getElementById('stats-screen').innerText.replace(/[ \t]+/g, ' '));
  fs.writeFileSync('old-stats.txt', stats);
  say('STATS length ' + stats.length);
  await page.screenshot({ path: 'shots/old-stats.png', fullPage: true });
  await page.evaluate(() => { location.hash = '#settings'; });
  await L.sleep(400);
  await page.evaluate(() => { location.hash = '#explore'; });
  await L.sleep(1200);
  await page.evaluate(() => { location.hash = ''; });
  await L.sleep(400);
  await same('after stats, settings, explore');
  const exp = await page.evaluate(() => window.__atlas.exportProgress());
  say('export: records ' + Object.keys(exp.records).length + ' daily ' + Object.keys(exp.dailyAttempts).length + ' focus ' + Object.keys(exp.focusLists).length + ' pin games ' + exp.pin.games.length + ' learn ' + JSON.stringify(Object.keys(exp.learn)));
  if (JSON.stringify(exp.records) !== JSON.stringify(records)) say('PROBLEM export records differ from seeded');
  if (JSON.stringify(exp.dailyAttempts) !== JSON.stringify(daily)) say('PROBLEM export daily differs');
  if (JSON.stringify(exp.focusLists) !== JSON.stringify(focus)) say('PROBLEM export focus differs');
  if (JSON.stringify(exp.pin) !== JSON.stringify(pin)) say('PROBLEM export pin differs: ' + JSON.stringify(exp.pin).slice(0, 300));
  if (JSON.stringify(exp.learn) !== JSON.stringify(learn)) say('PROBLEM export learn differs: ' + JSON.stringify(exp.learn).slice(0, 300));

  // Play Oceania on Hard (the restored difficulty) perfectly and slowly enough to lose to the best time 21 s? time will be less: see what is written
  await page.goto(sess.url + '?play=oceania', { waitUntil: 'domcontentloaded' });
  await L.waitRound(sess, 'oceania');
  const r = await Pl.playChecked(sess, { how: i => (i === 1 ? 'second' : 'right'), skill: 'country' });
  r.problems.forEach(p => say('PROBLEM ' + p));
  const recs2 = await L.store(page, 'atlas-records');
  say('after Oceania hard (one second try): ' + JSON.stringify(recs2['world-country|Oceania|hard']));
  Object.keys(records).forEach(k => { if (k !== 'world-country|Oceania|hard' && JSON.stringify(recs2[k]) !== JSON.stringify(records[k])) say('PROBLEM record ' + k + ' changed: ' + JSON.stringify(recs2[k])); });
  const f2 = await L.store(page, 'atlas-focus');
  say('focus Oceania now: ' + JSON.stringify(f2['world-country|Oceania']));
  Object.keys(focus).forEach(k => { if (k !== 'world-country|Oceania' && JSON.stringify(f2[k]) !== JSON.stringify(focus[k])) say('PROBLEM focus ' + k + ' changed'); });
  const res = await page.evaluate(() => document.getElementById('results-screen').innerText.replace(/\s+/g, ' ').slice(0, 600));
  say('results: ' + res);
  // Learn resume for Canada
  await page.goto(sess.url + '?play=canada-provinces&learn=1', { waitUntil: 'domcontentloaded' });
  const ls = await L.waitRound(sess, 'canada learn', { learn: true });
  say('learn resume: level ' + ls.learn.level + ' order same: ' + (JSON.stringify(ls.learn.order) === JSON.stringify(learn['canada-provinces'].order)));
  say('errors: ' + JSON.stringify(sess.errors.filter(e => !/Failed to load resource/.test(e))));
  await sess.close();
  fs.writeFileSync('oldplayer.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('oldplayer.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
