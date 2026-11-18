// Focused sync checks: canonical merge equality, offline round then reload, 413 across a reload,
// a reset while the other device keeps playing without reloading, heavy payload size.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const out = [];
const say = s => { out.push(s); console.log(s); };
const kv = new Map();
const net = { mode: 'ok', posts: [] };
async function stub(sess, name) {
  await sess.context.route('**/api/records*', async route => {
    const req = route.request();
    const token = new URL(req.url()).searchParams.get('token') || '';
    if (sess.offline) return route.abort();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: kv.has(token) ? kv.get(token) : 'null' });
    const text = req.postData() || '';
    const bytes = Buffer.byteLength(text, 'utf8');
    net.posts.push({ from: name, bytes });
    if (sess.too413 || bytes > 256 * 1024) return route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"payload_too_large"}' });
    kv.set(token, text);
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
}
const canon = v => { if (Array.isArray(v)) return v.map(canon); if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; } return v; };
const KEYS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-reset-at'];
async function stores(page) {
  const o = await page.evaluate(keys => { const o = {}; keys.forEach(k => { o[k] = localStorage.getItem(k); }); o.exp = JSON.stringify(window.__atlas.mastery.exportBlob()); return o; }, KEYS);
  Object.keys(o).forEach(k => { try { o[k] = JSON.stringify(canon(JSON.parse(o[k]))); } catch (e) {} });
  return o;
}
const cmp = (a, b, keys, what) => { let n = 0; keys.forEach(k => { if (a[k] !== b[k]) { n++; say('  DIFF ' + what + ': ' + k + '\n     A: ' + String(a[k]).slice(0, 700) + '\n     B: ' + String(b[k]).slice(0, 700)); } }); if (!n) say('  same on both: ' + what); };
async function settings(sess) { await sess.page.evaluate(() => { location.hash = '#settings'; }); await sess.page.waitForSelector('#settings-screen.active'); await L.sleep(250); }
async function status(sess) {
  return sess.page.evaluate(() => ({ line: (document.getElementById('sync-status-line') || {}).textContent || null,
    dot: Array.from(document.querySelectorAll('[data-sync-dot]')).map(d => (d.hidden ? 'hidden' : 'shown') + (d.classList.contains('is-error') ? ' error' : '')).join(','), meta: localStorage.getItem('atlas-sync-meta') }));
}
async function reload(sess) { await sess.page.goto(sess.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(sess.page); await L.sleep(900); }
// A round started without a page load (as from Home), played to the end, then back to Home by its button
async function playInPlace(sess, slug, how, skill) {
  await L.hookStart(sess.page, slug);
  await L.waitRound(sess, slug);
  const r = await Pl.playChecked(sess, { how, skill });
  r.problems.forEach(p => say('  PROBLEM ' + p));
  await L.sleep(400);
  await sess.page.click('#home-btn');
  await L.waitMenu(sess.page);
  await L.sleep(300);
}
const TOKEN = 'aaaabbbbccccddddeeeeffff00001111';
const linked = { 'atlas-sync-token': TOKEN, 'atlas-sync-username': 'Ada' };

(async () => {
  const A = await L.open({ label: 'A', seed: linked }), B = await L.open({ label: 'B', seed: linked });
  await stub(A, 'A'); await stub(B, 'B');
  await L.home(A); await L.home(B);
  await L.waitMenu(A.page); await L.waitMenu(B.page);

  // 1. merge equality
  await playInPlace(A, 'oceania', i => ['right', 'second', 'miss', 'skip', 'right', 'right', 'right'][i], 'country');
  await playInPlace(B, 'south-america', i => (i % 4 === 1 ? 'second' : 'right'), 'country');
  await playInPlace(B, 'oceania', () => 'right', 'country');
  await reload(A); await settings(A); await A.page.click('#sync-now-btn'); await L.sleep(900);
  await reload(B);
  cmp(await stores(A.page), await stores(B.page), ['atlas-records', 'atlas-focus', 'atlas-daily-attempts', 'atlas-pin', 'atlas-learn', 'exp'], '1. after A and B played apart, then synced');
  const mA = await Pl.mdump(A.page);
  say('1. rounds played across both devices 3, answers 27: mastery totals on A ' + JSON.stringify(mA.totals) + ' today ' + JSON.stringify(mA.today) + ' item answers ' + mA.answers);
  say('1. Oceania record ' + JSON.stringify(JSON.parse((await stores(A.page))['atlas-records'])['world-country|Oceania|normal']));

  // 2. a round finished offline, then the app is opened again online
  B.offline = true;
  await playInPlace(B, 'flags-oceania', () => 'right', 'flag');
  say('2. B right after the offline round (Home): ' + JSON.stringify(await status(B)));
  B.offline = false;
  await reload(B);
  await settings(B);
  say('2. B after reopening online: ' + JSON.stringify(await status(B)));
  say('2. server has the offline round: ' + !!JSON.parse(kv.get(TOKEN)).records['flag|Oceania|normal'] + ' ; B has it: ' + !!JSON.parse(await L.raw(B.page, 'atlas-records'))['flag|Oceania|normal']);
  await reload(A);
  say('2. A after reload has it: ' + !!JSON.parse(await L.raw(A.page, 'atlas-records'))['flag|Oceania|normal']);

  // 3. 413 on push
  A.too413 = true;
  await playInPlace(A, 'capitals-oceania', () => 'right', 'capital');
  say('3. A on Home after a round whose push got 413: ' + JSON.stringify(await status(A)));
  await settings(A);
  say('3. A Settings: ' + JSON.stringify(await status(A)));
  await reload(A); await settings(A);
  say('3. A Settings after reopening the app (pushes still 413): ' + JSON.stringify(await status(A)));
  A.too413 = false;

  // 4. A resets; B (not reloaded) keeps playing; A opens; B opens
  await A.page.click('#sync-now-btn'); await L.sleep(800);
  await reload(B);
  const bPre = await stores(B.page);
  await settings(A);
  await A.page.click('[data-action="reset-progress"]'); await L.sleep(300);
  await A.page.click('[data-action="dialog-confirm"]'); await L.sleep(900);
  const resetAt = Number(await L.raw(A.page, 'atlas-reset-at'));
  say('4. A reset at ' + resetAt + '; server records ' + Object.keys(JSON.parse(kv.get(TOKEN)).records).length);
  await L.sleep(1100);
  await playInPlace(B, 'name-oceania', () => 'right', 'country-name');     // played AFTER the reset, B has not synced since
  say('4. B played Name It Oceania after the reset; server now: resetAt ' + JSON.parse(kv.get(TOKEN)).resetAt + ' records ' + Object.keys(JSON.parse(kv.get(TOKEN)).records).join(', '));
  await reload(A);
  say('4. A reopened: records ' + (await L.raw(A.page, 'atlas-records')) + ' ; server records ' + Object.keys(JSON.parse(kv.get(TOKEN)).records).join(', ') + ' resetAt ' + JSON.parse(kv.get(TOKEN)).resetAt);
  await reload(B);
  const b4 = await stores(B.page);
  say('4. B reopened: records ' + b4['atlas-records'] + ' mastery ' + String(b4.exp).slice(0, 200));
  await reload(A);
  say('4. A reopened again: records ' + (await L.raw(A.page, 'atlas-records')));

  say('errors A ' + JSON.stringify(A.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)) + ' B ' + JSON.stringify(B.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)));
  await A.close(); await B.close();

  // 5. heavy player payload
  for (const f of ['seed-heavy.json', 'seed-rich.json']) {
    const seed = JSON.parse(fs.readFileSync(L.S + '/harness/scratch/' + f, 'utf8'));
    const H = await L.open({ seed: Object.assign({}, seed, linked) });
    net.posts.length = 0;
    await stub(H, 'H');
    await L.home(H); await L.waitMenu(H.page);
    await settings(H); await H.page.click('#sync-now-btn'); await L.sleep(1200);
    say('5. ' + f + ' payload bytes ' + JSON.stringify(net.posts) + ' status ' + JSON.stringify(await status(H)).slice(0, 200));
    await H.close();
  }
  fs.writeFileSync('sync2.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('sync2.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
