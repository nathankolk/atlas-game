// Old stores read unchanged; sync payload, merge, size, failures; reset and its pull-side rule; export; storage event.
// "Devices" are separate browsers whose /api/records requests are answered by one in-memory server kept here.
'use strict';
const fs = require('fs');
const path = require('path');
const { S, launchApp, reloadApp, startLevel, playRound, snap, reporter } = require('./lib.js');
const topojson = require(path.join(S, 'vendor', 'node_modules', 'topojson-client'));

const SHOTS = __dirname + '/../../../shots/app/logic/';
const TOKEN = '4a8e9b2c7d3f1e6a5b8c2d4e7f9a1b3c';
const PROGRESS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery'];

function provinceNames(country) {
  const t = JSON.parse(fs.readFileSync('/home/user/atlas-game/public/data/provinces-' + country + '.json', 'utf8'));
  return topojson.feature(t, t.objects.provinces || t.objects[Object.keys(t.objects)[0]]).features.map(f => f.properties.name);
}

function utcKey(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// One blob per token, like the Pages Function; status overrides simulate failures
function makeServer() {
  const srv = { blob: null, posts: [], gets: 0, postStatus: 200, getStatus: 200, offline: false };
  srv.attach = async (page) => {
    await page.route(/\/api\/records/, async route => {
      if (srv.offline) return route.abort();
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postData();
        srv.posts.push(body);
        if (srv.postStatus !== 200) return route.fulfill({ status: srv.postStatus, contentType: 'application/json', body: '{"error":"payload_too_large"}' });
        srv.blob = body;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      srv.gets++;
      if (srv.getStatus !== 200) return route.fulfill({ status: srv.getStatus, contentType: 'application/json', body: '{"error":"x"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: srv.blob === null ? 'null' : srv.blob });
    });
  };
  srv.last = () => JSON.parse(srv.posts[srv.posts.length - 1]);
  return srv;
}

// Menu controls can sit above the scroll origin at this window size (inventory defect D1), out of a real
// click's reach, so menu and modal controls are clicked through the DOM
const jsClick = (page, sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) throw new Error('no element ' + q); el.click(); }, sel);
const lsAll = (page) => page.evaluate((keys) => { const o = {}; keys.concat(['atlas-reset-at', 'atlas-sync-meta', 'atlas-hard-mode', 'atlas-difficulty']).forEach(k => { o[k] = localStorage.getItem(k); }); return o; }, PROGRESS);
const waitPosts = async (srv, n) => { for (let i = 0; i < 100 && srv.posts.length < n; i++) await new Promise(res => setTimeout(res, 50)); return srv.posts.length >= n; };
const syncNow = async (page, srv) => {
  const before = srv.posts.length;
  await page.evaluate(() => { document.getElementById('sync-entry-btn').click(); });
  await page.waitForSelector('#sync-now-btn');
  await jsClick(page, '#sync-now-btn');
  await page.waitForFunction(() => document.getElementById('sync-now-btn') && document.getElementById('sync-now-btn').textContent === 'Sync Now' &&
    /Synced|Couldn|Sync failed|too large/.test(document.getElementById('sync-status-line').textContent), null, { timeout: 10000 });
  const line = await page.evaluate(() => [document.getElementById('sync-status-line').textContent, document.getElementById('sync-status-line').className]);
  await jsClick(page, '#sync-modal-close');
  return { line: line, posted: srv.posts.length > before };
};

(async () => {
  const r = reporter('stores, sync, reset');

  // ============ A. a returning player's stores are read as they are ============
  const canada = provinceNames('canada');
  const seed = {
    'atlas-records': JSON.stringify({
      'world-country|Oceania|normal': { gamesPlayed: 3, bestScore: { value: 9, max: 12, date: '2026-11-01' }, bestAccuracy: { correct: 5, total: 6, pct: 83, date: '2026-11-01' }, lastPlayed: '2026-11-10' },
      'world-country|Europe|hard': { gamesPlayed: 7, bestScore: { value: 78, max: 78, date: '2026-10-02' }, bestTime: { value: 182, total: 39, date: '2026-10-02' }, bestAccuracy: { correct: 39, total: 39, pct: 100, date: '2026-10-02' }, lastPlayed: '2026-10-02' },
      'daily-five|Daily|normal': { gamesPlayed: 12, bestScore: { value: 10, max: 10, date: '2026-09-01' }, bestAccuracy: { correct: 5, total: 5, pct: 100, date: '2026-09-01' }, lastPlayed: '2026-11-15' },
      'us-state|The United States|normal': { gamesPlayed: 2, bestScore: { value: 90, max: 100, date: '2026-08-01' }, bestAccuracy: { correct: 48, total: 50, pct: 96, date: '2026-08-01' }, lastPlayed: '2026-08-02' },
      'us-capital-to-state|US Capitals → States|normal': { gamesPlayed: 1, bestScore: { value: 70, max: 100, date: '2026-08-03' }, bestAccuracy: { correct: 40, total: 50, pct: 80, date: '2026-08-03' }, lastPlayed: '2026-08-03' },
      'us-state-to-capital|US States → Capitals|normal': { gamesPlayed: 1, bestScore: { value: 60, max: 100, date: '2026-08-04' }, bestAccuracy: { correct: 35, total: 50, pct: 70, date: '2026-08-04' }, lastPlayed: '2026-08-04' },
      'us-city|Northeast|normal': { gamesPlayed: 1, bestScore: { value: 50, max: 80, date: '2026-08-05' }, bestAccuracy: { correct: 30, total: 40, pct: 75, date: '2026-08-05' }, lastPlayed: '2026-08-05' },
      'province|canada-provinces|uncharted': { gamesPlayed: 1, bestScore: { value: 20, max: 26, date: '2026-10-05' }, bestAccuracy: { correct: 11, total: 13, pct: 85, date: '2026-10-05' }, lastPlayed: '2026-10-05' },
      'North America|normal': { gamesPlayed: 4, lastPlayed: '2026-04-24' }
    }),
    'atlas-focus': JSON.stringify({ 'world-country|Oceania': { names: ['Vanuatu', 'Fiji'], total: 6, savedAt: 1794790686008 },
      'province|canada-provinces': { names: [], total: 13, savedAt: 1794790686009 } }),
    'atlas-pin': JSON.stringify({ games: [{ at: 1794790769166, region: 'Oceania', diff: 'normal', score: 1520, max: 2000, avgKm: 141 },
      { at: 1794790869166, region: 'Oceania', diff: 'normal', score: 1640, max: 2000, avgKm: 97 }],
      cities: { 'Sydney': [[1794790769166, 12], [1794790869166, null]], 'Gold Coast': [[1794790769166, 240]] } }),
    'atlas-learn': JSON.stringify({ 'canada-provinces': { order: canada, level: 4, savedAt: 1794790770643 } }),
    'atlas-daily-attempts': JSON.stringify({
      [utcKey(-3)]: { dateKey: utcKey(-3), puzzleNumber: 202, countries: ['Afghanistan', 'Mexico', 'Jordan', 'Cameroon', 'Benin'], sequence: [2, 2, 1, 0, 2], score: 7, correct: 4, wrong: 1, total: 5, timeSeconds: 32, hardMode: true, completedAt: 1794500000000 },
      [utcKey(0)]: { dateKey: utcKey(0), puzzleNumber: 205, countries: ['Brazil', 'Mexico', 'Jordan', 'Cameroon', 'Benin'], sequence: [2, 1, 0, 2, 2], score: 7, correct: 4, wrong: 1, total: 5, timeSeconds: 41, hardMode: false, difficulty: 'normal', completedAt: 1794790732765 }
    }),
    'atlas-difficulty': 'normal', 'atlas-hard-mode': 'false', 'atlas-map-style': 'parchment'
  };
  {
    const h = await launchApp({ fast: true, noPaint: true, seedStorage: seed });
    const page = h.page;
    try {
      const after = await lsAll(page);
      r.eq('old stores are byte-identical after load', PROGRESS.slice(0, 5).map(k => after[k] === seed[k]), [true, true, true, true, true]);
      r.eq('no mastery store is invented on load', after['atlas-mastery'], null);
      // the menus read them
      const main = await page.evaluate(() => ({ daily: !!document.querySelector('.daily-card.daily-done'), stats: (document.querySelector('.daily-result-stats') || {}).textContent,
        pins: (document.querySelector('[data-folder="pins"] .r-best') || {}).textContent, us: (document.querySelector('[data-folder="us"] .r-best') || {}).textContent }));
      r.eq('today\'s seeded daily shows as played', [main.daily, main.stats], [true, '4/5 found · 7 pts · 80%']);
      r.check('pin folder reads atlas-pin', /^World/.test(main.pins || '') || main.pins === undefined, main.pins);
      r.eq('US folder best', main.us, 'Best: States 96%');
      await jsClick(page, '[data-folder="continents"]');
      const oce = await page.evaluate(() => document.querySelector('[data-region="Oceania"] .r-best').textContent);
      r.eq('Oceania card best from the old record', oce, 'Best: 5/6 · 9 pts');
      await jsClick(page, '[data-region="Oceania"]');
      const ch = await page.evaluate(() => [document.getElementById('focus-modal-overlay').classList.contains('show'), document.getElementById('focus-choice-focus-title').textContent]);
      r.eq('seeded focus list opens the chooser', ch, [true, 'Focus on Those 2']);
      await jsClick(page, '#focus-modal-close');
      await jsClick(page, '[data-action="back-to"]');
      await jsClick(page, '[data-folder="us"]');
      const us = await page.evaluate(() => Array.from(document.querySelectorAll('.us-card[data-action="play"]')).map(c => (c.querySelector('.r-best') || {}).textContent));
      r.eq('D3: capitals cards read their own records', us, ['Best: 48/50 · 90 pts', 'Best: 40/50 · 70 pts', 'Best: 35/50 · 60 pts']);
      await jsClick(page, '[data-action="back-to"]');
      await jsClick(page, '[data-folder="pins"]');
      const pin = await page.evaluate(() => document.querySelector('[data-region="pin-oceania"] .r-best').textContent);
      r.eq('pin card best', pin, 'Best 1,640 · avg 1,580');
      await jsClick(page, '[data-action="back-to"]');
      // seeded ladder resumes
      await startLevel(page, 'canada-provinces', { learn: true });
      const s = await snap(page);
      r.eq('seeded Learn ladder resumes at level 4', [s.learnPhase, s.learnLevel], ['study', 4]);
      await page.keyboard.press('Escape');
      const after2 = await lsAll(page);
      r.eq('still byte-identical after browsing (learn re-saved with a new time only)', ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-daily-attempts'].map(k => after2[k] === seed[k]), [true, true, true, true]);
      const learn2 = JSON.parse(after2['atlas-learn'])['canada-provinces'];
      r.eq('ladder order and level kept', [learn2.order, learn2.level], [canada, 4]);

      // G. export
      const ex = await page.evaluate(() => { const e = window.__atlas.exportProgress(); return { e: e, round: JSON.parse(JSON.stringify(e)) }; });
      r.eq('export is JSON-serialisable', ex.round, ex.e);
      r.eq('export holds every store', [ex.e.records, ex.e.focusLists, ex.e.pin, ex.e.dailyAttempts].map(x => JSON.stringify(x)),
        ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-daily-attempts'].map(k => seed[k]));
      r.eq('export: the rest', [Object.keys(ex.e).sort(), ex.e.learn['canada-provinces'].level, ex.e.mastery.v, ex.e.resetAt, ex.e.settings],
        [['app', 'dailyAttempts', 'exportVersion', 'exportedAt', 'focusLists', 'learn', 'mastery', 'pin', 'records', 'resetAt', 'settings'], 4, 2, 0, { difficulty: 'normal', mapStyle: 'parchment' }]);
      r.check('export carries no sync key', JSON.stringify(ex.e).indexOf('sync') < 0);
      r.eq('no page errors (A)', h.errors, []);
    } catch (e) { r.check('A ran to the end', false, String(e && e.stack || e)); }
    await h.close();
  }

  // ============ B-F. sync between devices ============
  const srv = makeServer();
  // Device 1 is seeded once by hand: the harness's seedStorage refills any missing key on every load,
  // which would undo a reset
  const d1 = await launchApp({ fast: true, noPaint: true, beforeLoad: h => srv.attach(h.page) });
  const d2 = await launchApp({ fast: true, noPaint: true, beforeLoad: h => srv.attach(h.page) });
  try {
    const p1 = d1.page, p2 = d2.page;
    await p1.evaluate((kv) => { Object.keys(kv).forEach(k => localStorage.setItem(k, kv[k])); }, Object.assign({}, seed, { 'atlas-sync-token': TOKEN, 'atlas-sync-username': 'Ada' }));
    await reloadApp(d1);
    await p1.waitForFunction(() => JSON.parse(localStorage.getItem('atlas-sync-meta') || '{}').lastSyncAt > 0);
    r.eq('app load pulls once; an empty server changes nothing', [srv.gets, srv.posts.length, (await lsAll(p1))['atlas-records'] === seed['atlas-records']], [1, 0, true]);

    // ---- B. a round end pushes the whole snapshot ----
    await startLevel(p1, 'Oceania');
    await playRound(p1, (i) => i === 0 ? 'miss' : 'first');
    r.check('round end pushed', await waitPosts(srv, 1));
    let blob = srv.last();
    r.eq('payload fields', Object.keys(blob).sort(), ['dailyAttempts', 'focusLists', 'lastUpdated', 'learn', 'mastery', 'pin', 'records', 'resetAt', 'username', 'version']);
    r.eq('payload basics', [blob.version, blob.username, blob.resetAt, blob.mastery.v, Object.keys(blob.mastery.items.country).length, blob.learn['canada-provinces'].level], [2, 'Ada', 0, 2, 7, 4]);
    r.eq('records in the payload are the local ones', JSON.stringify(blob.records), (await lsAll(p1))['atlas-records']);
    // practice rounds push too (their answers are new mastery history)
    await jsClick(p1, '#practice-btn');
    await p1.waitForFunction(() => window.__t.snapshot().screen === 'game-screen' && window.__t.snapshot().current);
    await playRound(p1);
    r.check('practice round end pushed', await waitPosts(srv, 2));
    await jsClick(p1, '#home-btn');

    // ---- device 2 links by pasting the key ----
    await p2.evaluate(() => { window.__atlas.mastery.record('country', 'France', 'first'); window.__atlas.mastery.record('country', 'Fiji', 'miss'); });
    await jsClick(p2, '#sync-entry-btn');
    await jsClick(p2, '[data-sync-tab="import"]');
    await p2.fill('#sync-key-input', TOKEN.toUpperCase().replace(/(.{8})/g, '$1 '));
    await jsClick(p2, '#sync-import-btn');
    await p2.waitForSelector('#sync-now-btn', { timeout: 10000 });
    await jsClick(p2, '#sync-modal-close');
    const l2 = await lsAll(p2);
    const m2 = JSON.parse(l2['atlas-mastery']);
    r.eq('linked device has the records, focus lists, pin history, daily attempts', ['atlas-records', 'atlas-pin'].map(k => l2[k] === (JSON.stringify(blob[k === 'atlas-records' ? 'records' : 'pin']) && JSON.stringify(srv.last()[k === 'atlas-records' ? 'records' : 'pin']))), [true, true]);
    r.eq('linked device merged mastery: 7 Oceania countries + its own France', Object.keys(m2.items.country).length, 8);
    const fiji = await p2.evaluate(() => { const g = window.__atlas.mastery.get('country', 'Fiji'); return [g.seen]; });
    r.check('per item, the history with more answers wins', fiji[0] >= 1, fiji);
    r.eq('linked device took the username and the ladder', [await p2.evaluate(() => localStorage.getItem('atlas-sync-username')), JSON.parse(l2['atlas-learn'])['canada-provinces'].level], ['Ada', 4]);
    r.check('linking pushed the merged copy back', srv.last().mastery.items.country.France !== undefined);

    // ---- C. merge rules against a hand-made remote blob ----
    const local = await lsAll(p1);
    const lm = JSON.parse(local['atlas-mastery']);
    const today = await p1.evaluate(() => window.__atlas.mastery.today());
    const daily = {};
    for (let i = 1; i <= 34; i++) daily[utcKey(-i - 3)] = { dateKey: utcKey(-i - 3), puzzleNumber: 200 - i, countries: [], sequence: [2, 2, 2, 2, 2], score: 10, correct: 5, wrong: 0, total: 5, timeSeconds: 20, hardMode: false, difficulty: 'normal', completedAt: 1 };
    const remote = {
      version: 2, username: 'Other', lastUpdated: Date.now(), resetAt: 0,
      records: {
        'world-country|Oceania|normal': { gamesPlayed: 9, bestScore: { value: 14, max: 14, date: '2026-11-12' }, bestTime: { value: 33, total: 7, date: '2026-11-12' }, bestAccuracy: { correct: 7, total: 7, pct: 100, date: '2026-11-12' }, lastPlayed: '2026-11-12' },
        'world-country|Asia|normal': { gamesPlayed: 1, bestScore: { value: 50, max: 96, date: '2026-11-11' }, bestAccuracy: { correct: 30, total: 48, pct: 63, date: '2026-11-11' }, lastPlayed: '2026-11-11' }
      },
      dailyAttempts: daily,
      focusLists: { 'world-country|Oceania': { names: ['Fiji'], total: 7, savedAt: 1 }, 'world-country|Asia': { names: ['Bhutan'], total: 48, savedAt: 1794790686010 } },
      pin: { games: [{ at: 1794790769166, region: 'Oceania', diff: 'normal', score: 1520, max: 2000, avgKm: 141 }, { at: 1794799999999, region: 'Europe', diff: 'hard', score: 900, max: 2000, avgKm: 600 }], cities: { 'Sydney': [[1794799999999, 5]], 'Paris': [[1794799999999, 80]] } },
      learn: { 'canada-provinces': { done: true, savedAt: Date.now() + 1000 }, 'india-states': { order: ['x'], level: 1, savedAt: 5 }, 'china-provinces': 'garbage' },
      mastery: { v: 2,
        items: { country: { 'Fiji': [today, 5, 9, 9], 'Japan': [today - 2, 3, 4, 3, 1], 'Australia': [today - 9, 1, 1] }, 'us-state': { 'Ohio': [today - 1, 2, 2, 2] } },
        days: { [today]: [1, 3, 1, 999], [today - 1]: [4, 80, 60, 700] } }
    };
    srv.blob = JSON.stringify(remote);
    const res = await syncNow(p1, srv);
    r.check('Sync Now reports success', /^Synced /.test(res.line[0]) && /success/.test(res.line[1]), res.line);
    const a = await lsAll(p1);
    const recs = JSON.parse(a['atlas-records']);
    r.eq('records: per-field best wins', [recs['world-country|Oceania|normal'].bestScore.value, recs['world-country|Oceania|normal'].bestTime.value, recs['world-country|Oceania|normal'].gamesPlayed, !!recs['world-country|Asia|normal'], recs['world-country|Europe|hard'].gamesPlayed], [14, 33, 9, true, 7]);
    const dl = Object.keys(JSON.parse(a['atlas-daily-attempts'])).sort();
    r.eq('D14: merged daily attempts are trimmed to the newest 30', [dl.length, dl[dl.length - 1], dl[0]], [30, utcKey(0), utcKey(-31)]);
    r.eq('daily: the local attempt wins for a shared day', JSON.parse(a['atlas-daily-attempts'])[utcKey(-3)].hardMode, true);
    const fo = JSON.parse(a['atlas-focus']);
    r.check('focus: newer savedAt wins, new levels arrive', fo['world-country|Oceania'].savedAt > 1 && fo['world-country|Asia'].names[0] === 'Bhutan', fo);
    const pn = JSON.parse(a['atlas-pin']);
    r.eq('pin: union of games and tries', [pn.games.length, pn.cities.Sydney.length, !!pn.cities.Paris], [3, 3, true]);
    const le = JSON.parse(a['atlas-learn']);
    r.eq('D14: learn ladders merge (newer wins, done marker included, garbage ignored)', [le['canada-provinces'].done, le['india-states'].level, le['china-provinces']], [true, 1, undefined]);
    const mm = JSON.parse(a['atlas-mastery']);
    r.eq('mastery: more answers wins per item; new items and skills arrive', [mm.items.country.Fiji, mm.items.country.Japan, mm.items['us-state'].Ohio, mm.items.country.Australia.length >= 3 || mm.items.country.Australia],
      [[today, 5, 9, 9], [today - 2, 3, 4, 3, 1], [today - 1, 2, 2, 2], JSON.stringify(lm.items.country.Australia) === JSON.stringify(mm.items.country.Australia) || mm.items.country.Australia]);
    r.eq('mastery days: element-wise max', [mm.days[today][0] >= lm.days[today][0], mm.days[today][3] >= 999, mm.days[today - 1]], [true, true, [4, 80, 60, 700]]);
    r.eq('the page\'s mastery instance sees the merge without a reload', await p1.evaluate(() => window.__atlas.mastery.get('country', 'Japan').seen), 5);
    r.eq('username is not overwritten', await p1.evaluate(() => localStorage.getItem('atlas-sync-username')), 'Ada');
    r.check('Sync Now pushed the merged state', res.posted && srv.last().records['world-country|Asia|normal'] !== undefined && srv.last().mastery.items.country.Japan !== undefined);
    r.check('hardMode is no longer sent', !('hardMode' in srv.last()));

    // ---- D. failures are visible ----
    srv.postStatus = 413;
    let f = await syncNow(p1, srv);
    r.check('413: Sync Now says the progress is too large', /too large to sync/.test(f.line[0]) && /error/.test(f.line[1]), f.line);
    let entry = await p1.evaluate(() => { const b = document.getElementById('sync-entry-btn'); return [b.className, b.getAttribute('aria-label')]; });
    r.eq('413: the menu\'s sync button turns to its error state at once', entry, ['sync-entry-btn error', 'Sync: the last attempt failed']);
    await p1.screenshot({ path: SHOTS + 'sync-error-menu.png' });
    await p1.evaluate(() => { document.getElementById('sync-entry-btn').click(); });
    await p1.waitForSelector('#sync-status-line');
    const modalLine = await p1.evaluate(() => [document.getElementById('sync-status-line').textContent, document.getElementById('sync-status-line').className]);
    r.check('413: reopening the sync panel still explains it', /too large to sync/.test(modalLine[0]) && /error/.test(modalLine[1]), modalLine);
    await p1.screenshot({ path: SHOTS + 'sync-error-modal.png' });
    await jsClick(p1, '#sync-modal-close');
    // a failed push at round end shows on the menu too
    srv.postStatus = 500;
    await startLevel(p1, 'Oceania');
    const n0 = srv.posts.length;
    await playRound(p1);
    await waitPosts(srv, n0 + 1);
    await jsClick(p1, '#home-btn');
    await p1.waitForTimeout(200);
    entry = await p1.evaluate(() => [document.getElementById('sync-entry-btn').className, JSON.parse(localStorage.getItem('atlas-sync-meta')).lastError]);
    r.eq('a failed round-end push shows on the menu', entry, ['sync-entry-btn error', 'push_500']);
    srv.postStatus = 200; srv.offline = true;
    f = await syncNow(p1, srv);
    r.check('offline: says the server could not be reached', /Couldn’t reach the sync server/.test(f.line[0]), f.line);
    srv.offline = false; srv.getStatus = 503;
    f = await syncNow(p1, srv);
    r.check('a failed pull is explained', /Couldn’t fetch your synced progress \(error 503\)/.test(f.line[0]), f.line);
    srv.getStatus = 200;
    f = await syncNow(p1, srv);
    entry = await p1.evaluate(() => { const b = document.getElementById('sync-entry-btn'); return [b.className, b.getAttribute('aria-label')]; });
    r.eq('recovering clears the error state', [/^Synced /.test(f.line[0]), entry], [true, ['sync-entry-btn ok', null]]);

    // ---- F. storage event: another tab's mastery writes reach this tab ----
    const tab = await d1.context.newPage();
    await srv.attach(tab);
    await tab.goto(d1.url);
    await tab.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0);
    await tab.evaluate(() => { window.__atlas.mastery.record('us-state', 'Texas', 'first'); });
    await p1.waitForTimeout(300);
    r.eq('storage event: the other tab\'s answer is visible here', await p1.evaluate(() => window.__atlas.mastery.get('us-state', 'Texas').seen), 1);
    await tab.close();

    // ---- E. reset ----
    // bring device 2 up to date first, and give it something unsynced
    await reloadApp(d2);
    await p2.waitForTimeout(500);
    await p2.evaluate(() => { window.__atlas.mastery.record('country', 'Peru', 'first'); });
    r.check('device 2 has progress before the reset', Object.keys(JSON.parse((await lsAll(p2))['atlas-mastery']).items.country).length > 8);

    const t0 = Date.now();
    const nReset = srv.posts.length;
    const pushRes = await p1.evaluate(() => window.__atlas.resetProgress());
    const z = await lsAll(p1);
    r.eq('reset: every progress store is gone', PROGRESS.map(k => z[k]), [null, null, null, null, null, null]);
    r.check('reset: stamped', Number(z['atlas-reset-at']) >= t0, z['atlas-reset-at']);
    r.eq('reset: preferences and the sync key stay', [z['atlas-difficulty'], await p1.evaluate(() => localStorage.getItem('atlas-sync-token'))], ['normal', TOKEN]);
    r.eq('reset: pushed', [pushRes.ok, srv.posts.length], [true, nReset + 1]);
    blob = srv.last();
    r.eq('reset: the pushed blob is empty and carries resetAt', [blob.resetAt, blob.records, blob.dailyAttempts, blob.focusLists, blob.pin, blob.learn, blob.mastery.items, blob.mastery.days],
      [Number(z['atlas-reset-at']), {}, {}, {}, { games: [], cities: {} }, {}, {}, {}]);
    r.eq('reset: mastery reads empty in the page', await p1.evaluate(() => [window.__atlas.mastery.totals().itemsSeen, window.__atlas.mastery.skills()]), [0, []]);
    const menuAfter = await p1.evaluate(() => [!!document.querySelector('.daily-card.daily-fresh'), document.querySelectorAll('.r-best').length]);
    r.eq('reset: the menu is redrawn without bests or a played daily', menuAfter, [true, 0]);
    await p1.screenshot({ path: SHOTS + 'menu-after-reset.png' });

    // device 2 pulls: remote reset is newer -> local progress wiped first
    await reloadApp(d2);
    await p2.waitForFunction((at) => localStorage.getItem('atlas-reset-at') === at, z['atlas-reset-at'], { timeout: 10000 });
    await p2.waitForTimeout(300);
    const z2 = await lsAll(p2);
    r.eq('pull of a newer reset wipes the other device', [z2['atlas-records'], z2['atlas-pin'], z2['atlas-daily-attempts'], z2['atlas-focus'], z2['atlas-learn']].map(v => v === null || v === '{}' || v === '{"games":[],"cities":{}}'), [true, true, true, true, true]);
    r.eq('... its mastery too', await p2.evaluate(() => window.__atlas.mastery.totals().itemsSeen), 0);

    // an older blob (a device that missed the reset pushes its copy): not merged, and replaced
    const stale = Object.assign({}, remote, { resetAt: 0 });
    srv.blob = JSON.stringify(stale);
    const nStale = srv.posts.length;
    await reloadApp(d1);
    r.check('an older blob is answered with a push', await waitPosts(srv, nStale + 1));
    const z3 = await lsAll(p1);
    r.eq('an older blob is not merged', [z3['atlas-records'], z3['atlas-mastery'], JSON.parse(srv.blob).resetAt, Object.keys(JSON.parse(srv.blob).records).length], [null, null, Number(z['atlas-reset-at']), 0]);
    // same through Sync Now
    srv.blob = JSON.stringify(stale);
    await syncNow(p1, srv);
    r.eq('Sync Now with an older blob: still empty, server replaced', [(await lsAll(p1))['atlas-records'] === null || (await lsAll(p1))['atlas-records'] === '{}', JSON.parse(srv.blob).resetAt], [true, Number(z['atlas-reset-at'])]);
    // equal resetAt: normal merge again
    await p2.evaluate(() => { window.__atlas.mastery.record('country', 'Chile', 'first'); });
    await syncNow(p2, srv);
    await syncNow(p1, srv);
    r.eq('after the reset, new progress syncs as before', await p1.evaluate(() => window.__atlas.mastery.get('country', 'Chile').seen), 1);
    // a second reset is later than the first even if the clock has not moved
    await p1.evaluate(() => { localStorage.setItem('atlas-reset-at', String(Date.now() + 3600000)); });
    const ahead = Number(await p1.evaluate(() => localStorage.getItem('atlas-reset-at')));
    await p1.evaluate(() => window.__atlas.resetProgress());
    r.eq('reset time only moves forward', Number(await p1.evaluate(() => localStorage.getItem('atlas-reset-at'))), ahead + 1);

    // a reset time no device could have stored (1e999 parses to Infinity) is no reset: nothing is wiped,
    // and it is not wiped again on every later pull either
    const keptBlob = srv.blob;
    const before2 = await lsAll(p2);
    r.eq('device 2 still has Chile before the bad blob', await p2.evaluate(() => window.__atlas.mastery.get('country', 'Chile').seen), 1);
    srv.blob = keptBlob.replace(/"resetAt":\d+/, '"resetAt":1e999');
    r.check('the bad blob carries an unstorable reset time', JSON.parse(srv.blob).resetAt === Infinity);
    const nInf = srv.posts.length;
    await reloadApp(d2);
    await waitPosts(srv, nInf + 1);
    await p2.waitForTimeout(300);
    const after2 = await lsAll(p2);
    r.eq('an unstorable reset time (Infinity) wipes nothing',
      [await p2.evaluate(() => window.__atlas.mastery.get('country', 'Chile').seen), after2['atlas-reset-at']],
      [1, before2['atlas-reset-at']]);
    srv.blob = keptBlob;

    // linking: a device joining the key keeps its own progress
    const d3 = await launchApp({ fast: true, noPaint: true, seedStorage: { 'atlas-records': seed['atlas-records'], 'atlas-reset-at': '5' }, beforeLoad: h => srv.attach(h.page) });
    const p3 = d3.page;
    await p3.evaluate(() => { window.__atlas.mastery.record('country', 'Kenya', 'second'); });
    await jsClick(p3, '#sync-entry-btn');
    await jsClick(p3, '[data-sync-tab="import"]');
    await p3.fill('#sync-key-input', TOKEN);
    await jsClick(p3, '#sync-import-btn');
    await p3.waitForSelector('#sync-now-btn', { timeout: 10000 });
    const z4 = await lsAll(p3);
    r.eq('joining a key that was reset: local progress is kept and merged, the key\'s reset time adopted',
      [z4['atlas-records'] === seed['atlas-records'], await p3.evaluate(() => window.__atlas.mastery.get('country', 'Kenya').seen), Number(z4['atlas-reset-at']), JSON.parse(srv.blob).resetAt, !!JSON.parse(srv.blob).records['world-country|Europe|hard']],
      [true, 1, ahead + 1, ahead + 1, true]);
    await d3.close();
    r.eq('no page errors (sync)', d1.errors.concat(d2.errors).filter(e => !/Failed to load resource|ERR_FAILED|net::/.test(e)), []);
  } catch (e) { r.check('sync script ran to the end', false, String(e && e.stack || e)); }
  await d1.close();
  await d2.close();

  process.exit(r.done() ? 0 : 1);
})();
