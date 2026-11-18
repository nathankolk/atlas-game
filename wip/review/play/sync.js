// Two simulated devices against one stubbed /api/records (same rules as functions/api/records.js).
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const out = [];
const say = s => { out.push(s); console.log(s); };
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = n => !only.length || only.indexOf(n) !== -1;

const kv = new Map();
const net = { mode: 'ok', posts: [], gets: 0, forceGet: null };
async function stub(sess, name) {
  await sess.context.route('**/api/records*', async route => {
    const req = route.request();
    const token = new URL(req.url()).searchParams.get('token') || '';
    if (sess.offline || net.mode === 'offline') return route.abort();
    if (!/^[a-f0-9]{32}$/i.test(token)) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_token"}' });
    if (req.method() === 'GET') {
      net.gets++;
      if (net.forceGet != null) return route.fulfill({ status: 200, contentType: 'application/json', body: net.forceGet });
      return route.fulfill({ status: 200, contentType: 'application/json', body: kv.has(token) ? kv.get(token) : 'null' });
    }
    const text = req.postData() || '';
    const bytes = Buffer.byteLength(text, 'utf8');
    net.posts.push({ from: name, bytes });
    if (net.mode === '413' || bytes > 256 * 1024) return route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"payload_too_large"}' });
    kv.set(token, text);
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
}
const KEYS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery', 'atlas-reset-at'];
async function stores(page) {
  return page.evaluate(keys => { const o = {}; keys.forEach(k => { o[k] = localStorage.getItem(k); }); o.exp = JSON.stringify(window.__atlas.mastery.exportBlob()); return o; }, KEYS);
}
async function settings(sess) {
  await sess.page.evaluate(() => { location.hash = '#settings'; });
  await sess.page.waitForSelector('#settings-screen.active', { timeout: 5000 });
  await L.sleep(200);
}
async function syncLine(sess) {
  return sess.page.evaluate(() => ({
    line: (document.getElementById('sync-status-line') || {}).textContent || null,
    lineErr: !!(document.getElementById('sync-status-line') && document.getElementById('sync-status-line').classList.contains('is-error')),
    dot: Array.from(document.querySelectorAll('[data-sync-dot]')).map(d => (d.hidden ? 'hidden' : 'shown') + (d.classList.contains('is-error') ? ' error' : '')).join(','),
    notice: (document.getElementById('app-notice') || {}).textContent || ''
  }));
}
async function create(sess, name) {
  await settings(sess);
  await sess.page.click('[data-action="sync-create"]');
  await sess.page.fill('#sync-username-new', name);
  await sess.page.click('#sync-create-btn');
  await sess.page.waitForFunction(() => !!localStorage.getItem('atlas-sync-token'), null, { timeout: 5000 });
  await L.sleep(400);
  // a dialog shows the code: close it
  await sess.page.keyboard.press('Escape');
  return L.raw(sess.page, 'atlas-sync-token');
}
async function link(sess, token) {
  await settings(sess);
  await sess.page.click('[data-action="sync-link"]');
  await sess.page.fill('#sync-key-input', token);
  await sess.page.click('#sync-import-btn');
  await L.sleep(1200);
  return sess.page.evaluate(() => ({ token: localStorage.getItem('atlas-sync-token'), status: (document.getElementById('sync-import-status') || {}).textContent || '', notice: (document.getElementById('app-notice') || {}).textContent || '' }));
}
async function playLevel(sess, slug, how, skill, limit) {
  await sess.page.goto(sess.url + '?play=' + slug, { waitUntil: 'domcontentloaded' });
  await L.waitRound(sess, slug);
  const r = await Pl.playChecked(sess, { how, skill, limit });
  r.problems.forEach(p => say('  PROBLEM ' + p));
  await L.sleep(500);
  return r;
}
async function reload(sess) {
  await sess.page.goto(sess.url, { waitUntil: 'domcontentloaded' });
  await L.waitMenu(sess.page);
  await L.sleep(900);   // the pull on load
}
const cmp = (a, b, keys, what) => { keys.forEach(k => { if (a[k] !== b[k]) say('  PROBLEM ' + what + ': ' + k + ' differs\n     A: ' + String(a[k]).slice(0, 260) + '\n     B: ' + String(b[k]).slice(0, 260)); }); };

(async () => {
  const A = await L.open({ label: 'A' }), B = await L.open({ label: 'B' });
  await stub(A, 'A'); await stub(B, 'B');
  await L.home(A); await L.home(B);

  // S1: A plays, creates a code; B (with its own round) links
  await playLevel(A, 'oceania', i => ['right', 'second', 'miss', 'skip', 'right', 'right', 'right'][i], 'country');
  await playLevel(B, 'south-america', i => (i % 4 === 1 ? 'second' : 'right'), 'country');
  await A.page.goto(A.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(A.page);
  const token = await create(A, 'Ada');
  say('S1 token created: ' + (token && token.length) + ' posts ' + JSON.stringify(net.posts));
  say('S1 A status ' + JSON.stringify(await syncLine(A)));
  await B.page.goto(B.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(B.page);
  const bBefore = await stores(B.page);
  say('S1 link B: ' + JSON.stringify(await link(B, token)).slice(0, 300));
  const b1 = await stores(B.page);
  const recB = JSON.parse(b1['atlas-records'] || '{}');
  say('S1 B records now: ' + Object.keys(recB).join(', ') + ' | username ' + await L.raw(B.page, 'atlas-sync-username'));
  await reload(A);
  const a1 = await stores(A.page);
  cmp(a1, b1, ['atlas-records', 'atlas-focus', 'atlas-daily-attempts', 'exp'], 'S1 after link, A reloaded');
  say('S1 mastery answers A ' + (await Pl.mdump(A.page)).answers + ' B ' + (await Pl.mdump(B.page)).answers + ' (7 + 13 expected); games A ' + (await Pl.mdump(A.page)).totals.games + ' B ' + (await Pl.mdump(B.page)).totals.games);

  if (want('merge')) {
    // S2: both play Oceania again with different results, without reloading in between
    await playLevel(A, 'oceania', () => 'right', 'country');           // perfect: bestTime
    await playLevel(B, 'oceania', i => (i === 0 ? 'miss' : 'right'), 'country');
    await reload(A); await reload(B); await reload(A);
    const a2 = await stores(A.page), b2 = await stores(B.page);
    cmp(a2, b2, ['atlas-records', 'atlas-focus', 'exp'], 'S2 after both played Oceania and reloaded');
    say('S2 Oceania record on A: ' + JSON.stringify(JSON.parse(a2['atlas-records'])['world-country|Oceania|normal']));
    say('S2 focus on A: ' + JSON.stringify(JSON.parse(a2['atlas-focus'])['world-country|Oceania']) + ' / B: ' + JSON.stringify(JSON.parse(b2['atlas-focus'])['world-country|Oceania']));
  }

  if (want('offline')) {
    // S5: B offline: round still ends, status says so, data kept; back online -> push on Sync now
    B.offline = true;
    const before = await stores(B.page);
    await playLevel(B, 'flags-oceania', () => 'right', 'flag');
    await B.page.goto(B.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(B.page); await L.sleep(600);
    await settings(B);
    say('S5 offline status: ' + JSON.stringify(await syncLine(B)));
    const recs = JSON.parse(await L.raw(B.page, 'atlas-records'));
    if (!recs['flag|Oceania|normal']) say('  PROBLEM offline round not saved locally');
    B.offline = false;
    await B.page.click('#sync-now-btn'); await L.sleep(900);
    say('S5 back online status: ' + JSON.stringify(await syncLine(B)));
    await reload(A);
    const recA = JSON.parse(await L.raw(A.page, 'atlas-records'));
    if (!recA['flag|Oceania|normal']) say('  PROBLEM round played offline on B never reached A');
  }

  if (want('413')) {
    net.mode = '413';
    await playLevel(A, 'capitals-oceania', () => 'right', 'capital');
    await A.page.goto(A.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(A.page); await L.sleep(500);
    say('S4 413 home dot: ' + JSON.stringify(await syncLine(A)));
    await settings(A);
    say('S4 413 status: ' + JSON.stringify(await syncLine(A)));
    const recs = JSON.parse(await L.raw(A.page, 'atlas-records'));
    if (!recs['capital-pick|Oceania|normal']) say('  PROBLEM round lost under 413');
    net.mode = 'ok';
    await A.page.click('#sync-now-btn'); await L.sleep(900);
    say('S4 after recovery: ' + JSON.stringify(await syncLine(A)));
  }

  if (want('corrupt')) {
    const good = kv.get(token);
    const before = await stores(A.page);
    const today = new Date().toISOString().slice(0, 10);
    const blobs = {
      'not json (html)': '<html>502</html>',
      'a string': '"hello"',
      'an array': '[1,2,3]',
      'a number': '42',
      'wrong types': JSON.stringify({ records: 'abc', dailyAttempts: 'x', focusLists: 7, pin: 'p', learn: [1], mastery: 'garbage', resetAt: 'soon' }),
      'null members': JSON.stringify({ records: { 'world-country|Oceania|normal': null, 'world-country|Asia|normal': 5, 'x|y|z': {} }, dailyAttempts: { [today]: 'junk', '2026-11-01': null }, focusLists: { 'world-country|Asia': { names: [1, null, {}], savedAt: 9e15 } }, pin: { games: 'x', cities: [] }, learn: { 'canada-provinces': { order: 'x', level: 'y', savedAt: 9e15 }, 'europe': { order: [], level: 99, savedAt: 9e15 } }, mastery: { v: 2, items: { country: { France: 'x', Spain: [1e99, -5, 'a'] } }, days: 'x', life: {} }, resetAt: -5 }),
      'huge': JSON.stringify({ records: {}, junk: 'x'.repeat(600000) })
    };
    for (const name of Object.keys(blobs)) {
      net.forceGet = blobs[name];
      A.errors.length = 0;
      let err = null;
      try {
        await A.page.goto(A.url, { waitUntil: 'domcontentloaded' });
        await L.waitMenu(A.page);
        await L.sleep(900);
        // Home, Stats, a sheet, Explore still draw
        for (const h of ['#stats', '#settings', '#explore', '']) { await A.page.evaluate(x => { location.hash = x; }, h); await L.sleep(500); }
        await A.page.evaluate(() => { const c = document.querySelector('[data-action="open-level"][data-level="asia"]'); if (c) c.click(); });
        await L.sleep(300);
        await A.page.keyboard.press('Escape');
        await A.page.evaluate(() => { const c = document.querySelector('[data-action="open-level"][data-level="canada-provinces"]'); if (c) c.click(); });
        await L.sleep(300);
        await A.page.keyboard.press('Escape');
      } catch (e) { err = e.message.split('\n')[0]; }
      const after = await stores(A.page);
      const errs = A.errors.filter(e => !/Failed to load resource/.test(e));
      const changed = KEYS.filter(k => after[k] !== before[k]);
      say('S6 corrupt blob "' + name + '": ' + (err ? 'CRASH ' + err : 'ok') + '; page errors ' + JSON.stringify(errs).slice(0, 500) + '; stores changed: ' + changed.join(', '));
      changed.forEach(k => say('     ' + k + ' now ' + String(after[k]).slice(0, 400)));
      // put things back for the next blob
      await A.page.evaluate(b => { Object.keys(b).forEach(k => { if (k !== 'exp') { if (b[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, b[k]); } }); }, before);
    }
    net.forceGet = null;
    kv.set(token, good);
    await reload(A);
  }

  if (want('reset')) {
    // S3: B plays a round that A has not seen; A resets; B reloads
    await reload(B);
    const preA = await stores(A.page);
    await settings(A);
    await A.page.click('[data-action="reset-progress"]');
    await L.sleep(300);
    const dlg = await A.page.evaluate(() => document.getElementById('dialog').innerText.replace(/\s+/g, ' '));
    say('S3 reset dialog: ' + dlg.slice(0, 500));
    await A.page.click('[data-action="dialog-confirm"]');
    await L.sleep(900);
    const a3 = await stores(A.page);
    say('S3 A after reset: ' + KEYS.map(k => k + '=' + (a3[k] === null ? 'null' : a3[k].length + 'b')).join(' ') + ' | token kept ' + !!(await L.raw(A.page, 'atlas-sync-token')));
    say('S3 server blob resetAt ' + JSON.parse(kv.get(token)).resetAt + ' records ' + Object.keys(JSON.parse(kv.get(token)).records).length);
    // B, not reloaded, finishes a round: its push carries the old data
    await playLevel(B, 'name-oceania', () => 'right', 'country-name');
    say('S3 server blob after B pushed without pulling: resetAt ' + JSON.parse(kv.get(token)).resetAt + ' records ' + Object.keys(JSON.parse(kv.get(token)).records).length);
    await reload(A);
    const a4 = await stores(A.page);
    say('S3 A after reload (B pushed stale data): records ' + (a4['atlas-records'] || 'null').slice(0, 80) + ' mastery answers ' + (await Pl.mdump(A.page)).answers + ' ; server resetAt ' + JSON.parse(kv.get(token)).resetAt + ' records ' + Object.keys(JSON.parse(kv.get(token)).records).length);
    await reload(B);
    const b4 = await stores(B.page);
    say('S3 B after reload: ' + KEYS.map(k => k + '=' + (b4[k] === null ? 'null' : b4[k].length + 'b')).join(' ') + ' mastery answers ' + (await Pl.mdump(B.page)).answers);
    say('S3 B home masthead: ' + (await B.page.evaluate(() => document.querySelector('#menu-screen').innerText.replace(/\s+/g, ' ').slice(0, 260))));
    // after the reset both play and converge
    await playLevel(B, 'oceania', () => 'right', 'country');
    await reload(A);
    const a5 = await stores(A.page), b5 = await stores(B.page);
    cmp(a5, b5, ['atlas-records', 'exp', 'atlas-reset-at'], 'S3 after reset, B played, A reloaded');
  }
  say('errors A ' + JSON.stringify(A.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)) + ' B ' + JSON.stringify(B.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)));
  say('posts: ' + net.posts.map(p => p.from + ':' + p.bytes).join(' '));
  await A.close(); await B.close();
  fs.writeFileSync('sync.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('sync.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
