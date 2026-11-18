// Two linked devices against one in-memory /api/records: a reset on one while the other plays on, a push
// that failed and is owed on the next visit, a device loaded earlier that finishes a round later, and
// setting sync up where storage is blocked.
// --root=<dir> serves another copy of the app (to show a check failing on an earlier tree).
'use strict';
const { launchApp, reloadApp, startLevel, playRound, reporter } = require('./lib.js');

const TOKEN = '7c1e9b2c7d3f1e6a5b8c2d4e7f9a1b3d';
const rootArg = process.argv.find(a => a.startsWith('--root='));
const ROOT = rootArg ? rootArg.slice(7) : undefined;

// One blob for the key; each device can be cut off or have its pushes refused on its own
function makeServer() {
  const srv = { blob: null, posts: [], gets: 0 };
  srv.attach = async (page, dev) => {
    await page.route(/\/api\/records/, async route => {
      if (dev.offline) return route.abort();
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postData();
        srv.posts.push({ from: dev.name, body: body });
        if (dev.postStatus) return route.fulfill({ status: dev.postStatus, contentType: 'application/json', body: '{"error":"payload_too_large"}' });
        srv.blob = body;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      srv.gets++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: srv.blob === null ? 'null' : srv.blob });
    });
  };
  srv.data = () => JSON.parse(srv.blob);
  return srv;
}

const sleep = ms => new Promise(res => setTimeout(res, ms));
const ls = (page, key) => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return localStorage.getItem(k); } }, key);
const jsClick = (page, sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) throw new Error('no element ' + q); el.click(); }, sel);
const toView = (page, view) => page.evaluate(v => window.__atlas.showView(v), view);
// Sync's line in Settings and the navigation light
const status = async (page) => {
  await toView(page, 'settings');
  await page.waitForSelector('#sync-status-line', { state: 'attached' });
  const out = await page.evaluate(() => ({ line: document.getElementById('sync-status-line').textContent,
    light: document.querySelector('[data-sync-dot]').classList.contains('is-error') }));
  await toView(page, 'home');
  return out;
};
// Requests settle: nothing new has reached the server for a moment
const quiet = async (srv) => {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const n = srv.posts.length + srv.gets;
    if (n === last) return;
    last = n;
    await sleep(250);
  }
};
const playLevel = async (page, arg, plan) => {
  await startLevel(page, arg);
  await playRound(page, plan);
  await jsClick(page, '#home-btn');
};

(async () => {
  const r = reporter('sync between devices');
  const srv = makeServer();
  const devA = { name: 'A' }, devB = { name: 'B' };
  const linked = { 'atlas-sync-token': TOKEN, 'atlas-sync-username': 'Ada' };
  const A = await launchApp({ fast: true, root: ROOT, seedStorage: linked, beforeLoad: h => srv.attach(h.page, devA) });
  const B = await launchApp({ fast: true, root: ROOT, seedStorage: linked, beforeLoad: h => srv.attach(h.page, devB) });
  const a = A.page, b = B.page;
  try {
    // ---- a device loaded earlier finishes a round later: the server keeps both devices' rounds ----
    await quiet(srv);
    await playLevel(b, 'Oceania');
    await quiet(srv);
    await playLevel(a, 'South America', i => (i === 0 ? 'miss' : 'first'));
    await quiet(srv);
    r.eq('the server holds the rounds of both devices after the one loaded earlier finishes its round',
      Object.keys(srv.data().records).sort(), ['world-country|Oceania|normal', 'world-country|South America|normal']);
    r.eq('... and that device has taken the other one\'s round in', Object.keys(await ls(a, 'atlas-records')).sort(),
      ['world-country|Oceania|normal', 'world-country|South America|normal']);

    // ---- a round finished offline is sent on the next visit ----
    devB.offline = true;
    await playLevel(b, 'flags-oceania');
    await quiet(srv);
    let st = await status(b);
    r.check('offline round end: the failure shows', /Couldn’t reach the sync server/.test(st.line) && st.light, st);
    devB.offline = false;
    await reloadApp(B);
    await quiet(srv);
    r.check('reopened online: the offline round reaches the server', !!srv.data().records['flag|Oceania|normal'], Object.keys(srv.data().records));
    st = await status(b);
    r.check('... and only then does sync read up to date', /Up to date/.test(st.line) && !st.light, st);
    await reloadApp(A);
    await quiet(srv);
    r.check('... and the other device receives it', !!(await ls(a, 'atlas-records'))['flag|Oceania|normal']);

    // ---- a refused push stays on show across a visit, and is sent once the server takes it ----
    devA.postStatus = 413;
    await playLevel(a, 'capitals-oceania');
    await quiet(srv);
    st = await status(a);
    r.check('413 at round end is explained', /too large to sync/.test(st.line) && st.light, st);
    await reloadApp(A);
    await quiet(srv);
    st = await status(a);
    r.check('413: still explained after reopening the app while pushes are refused', /too large to sync/.test(st.line) && st.light, st);
    r.check('... the server has not got the round', !srv.data().records['capital-pick|Oceania|normal']);
    devA.postStatus = 0;
    await reloadApp(A);
    await quiet(srv);
    st = await status(a);
    r.check('once pushes go through again the round is sent and the error cleared',
      !!srv.data().records['capital-pick|Oceania|normal'] && /Up to date/.test(st.line) && !st.light, st);

    // ---- devices taking turns on one day: each takes in the other's rounds when it comes back into view ----
    await reloadApp(A);
    await quiet(srv);
    await reloadApp(B);
    await quiet(srv);
    const totals = page => page.evaluate(() => { const t = window.__atlas.mastery.totals(); return [t.games, t.questions]; });
    // The page was in the background for a while and is shown again
    const backInView = page => page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem('atlas-sync-meta') || '{}');
      meta.lastSyncAt = Date.now() - 5 * 60000;
      localStorage.setItem('atlas-sync-meta', JSON.stringify(meta));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const t0 = await totals(a);
    r.eq('taking turns: both devices start from the same day\'s totals', await totals(b), t0);
    await playLevel(b, 'Oceania');
    await quiet(srv);
    await backInView(a);
    await quiet(srv);
    r.eq('taking turns: back in view, a device takes the other\'s round in without a reload', await totals(a), [t0[0] + 1, t0[1] + 7]);
    const southAmerica = await a.evaluate(() => window.__atlas.levelByKey('south-america').names().length);
    await playLevel(a, 'South America');
    await quiet(srv);
    await backInView(b);
    await quiet(srv);
    r.eq('taking turns: the day\'s rounds and answers add up on the device that played last', await totals(a), [t0[0] + 2, t0[1] + 7 + southAmerica]);
    r.eq('... and on the other', await totals(b), [t0[0] + 2, t0[1] + 7 + southAmerica]);
    const getsBefore = srv.gets;
    await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await quiet(srv);
    r.eq('a page shown again within a minute of its last sync asks for nothing', srv.gets, getsBefore);

    // ---- A resets while B, not reloaded, plays on ----
    await reloadApp(B);
    await quiet(srv);
    // B also holds dated entries from before the reset, and answers of a round it leaves before the reset
    await b.evaluate(() => {
      const old = Date.now() - 5000;
      localStorage.setItem('atlas-pin', JSON.stringify({ games: [{ at: old, region: 'Oceania', diff: 'normal', score: 1500, max: 2000, avgKm: 150 }], cities: { Sydney: [[old, 12]] } }));
      localStorage.setItem('atlas-learn', JSON.stringify({ oceania: { done: true, savedAt: old } }));
    });
    await startLevel(b, 'Africa');
    const left = await b.evaluate(() => window.__atlas.state.current);
    await b.evaluate(() => window.__t.attempt(true));
    await b.waitForFunction((name) => window.__atlas.state.current !== name && !window.__atlas.state.interactionLocked, left);
    await b.keyboard.press('Escape');
    await b.waitForFunction(() => window.__t.screen() !== 'game-screen');
    r.eq('B holds an answer from a round it left', await b.evaluate((name) => window.__atlas.mastery.get('country', name).seen, left), 1);
    const before = await ls(b, 'atlas-records');
    r.check('B holds records from before the reset', Object.keys(before).length >= 3, Object.keys(before));

    await sleep(30);
    await a.evaluate(() => window.__atlas.resetProgress());
    const resetAt = Number(await a.evaluate(() => localStorage.getItem('atlas-reset-at')));
    r.eq('A reset: the server is empty and carries the reset time', [Object.keys(srv.data().records).length, srv.data().resetAt], [0, resetAt]);
    await sleep(30);

    await startLevel(b, 'Europe');
    await playRound(b, i => (i === 0 ? 'miss' : i === 1 ? 'second' : 'first'));
    const europe = await b.evaluate(() => window.__atlas.levelByKey('europe').names().length);
    await jsClick(b, '#home-btn');
    await quiet(srv);
    await reloadApp(A);
    await quiet(srv);
    await reloadApp(B);
    await quiet(srv);

    const rec = (o) => { const e = (o || {})['world-country|Europe|normal']; return e ? [Object.keys(o).length, e.gamesPlayed, e.bestScore.value] : [Object.keys(o || {}).length, null]; };
    const want = [1, 1, europe * 2 - 3];
    r.eq('the round played after the reset is on the server, alone', rec(srv.data().records), want);
    r.eq('... on the device that played it', rec(await ls(b, 'atlas-records')), want);
    r.eq('... and on the device that reset', rec(await ls(a, 'atlas-records')), want);
    r.eq('the reset time stands everywhere', [srv.data().resetAt, Number(await b.evaluate(() => localStorage.getItem('atlas-reset-at')))], [resetAt, resetAt]);
    const m = await b.evaluate((name) => { const M = window.__atlas.mastery; return [M.totals().itemsSeen, M.totals().games, M.totals().questions, M.get('country', name).seen, M.get('country', 'Fiji').seen]; }, left);
    r.eq('learning history: the round after the reset, and nothing from before it (the left round\'s answer included)', m, [europe, 1, europe, 0, 0]);
    r.eq('... the same on the device that reset', await a.evaluate(() => { const M = window.__atlas.mastery; return [M.totals().itemsSeen, M.totals().games]; }), [europe, 1]);
    const focus = await ls(b, 'atlas-focus');
    r.eq('focus list of the round after the reset is kept, older ones are gone', [Object.keys(focus), focus['world-country|Europe'].names.length], [['world-country|Europe'], 2]);
    const pin = await ls(b, 'atlas-pin'), learn = await ls(b, 'atlas-learn');
    r.check('dated entries from before the reset are gone', (!pin || pin.games.length === 0) && (!learn || !learn.oceania), { pin: pin, learn: learn });
    r.eq('nothing is left noted for a later reset once a pull has settled it', await ls(b, 'atlas-sync-notes'), null);

    r.eq('no page errors', A.errors.concat(B.errors).filter(e => !/Failed to load resource|ERR_FAILED|net::/.test(e)), []);
  } catch (e) { r.check('the two-device script ran to the end', false, String(e && e.stack || e)); }
  await A.close();
  await B.close();

  // ---- storage blocked: setting sync up says why it cannot, instead of hanging ----
  const C = await launchApp({ fast: true, root: ROOT, beforeLoad: h => h.context.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('blocked', 'QuotaExceededError'); };
  }) });
  try {
    const c = C.page;
    await toView(c, 'settings');
    await jsClick(c, '[data-action="sync-create"]');
    await c.waitForSelector('#sync-create-btn');
    await jsClick(c, '#sync-create-btn');
    await sleep(600);
    const made = await c.evaluate(() => { const btn = document.getElementById('sync-create-btn'); const dlg = btn && btn.closest('.dialog, [role="dialog"]');
      return { button: btn ? [btn.disabled, btn.textContent] : null, text: dlg ? dlg.textContent : document.body.textContent.slice(0, 0) }; });
    r.check('create with storage blocked: the dialog says sync cannot be set up, and its button is not left on "Creating…"',
      made.button && made.button[0] === false && made.button[1] === 'Create sync code' && /isn’t keeping/.test(made.text), made);
    await jsClick(c, '[data-action="dialog-close"]');
    await jsClick(c, '[data-action="sync-link"]');
    await c.fill('#sync-key-input', TOKEN);
    await jsClick(c, '#sync-import-btn');
    await sleep(600);
    const linkedTo = await c.evaluate(() => { const btn = document.getElementById('sync-import-btn'); return [btn.disabled, btn.textContent, document.getElementById('sync-import-status').textContent]; });
    r.check('link with storage blocked: the same explanation', linkedTo[0] === false && linkedTo[1] === 'Link device' && /isn’t keeping/.test(linkedTo[2]), linkedTo);
    r.eq('no page errors (storage blocked)', C.errors.filter(e => !/Failed to load resource|ERR_FAILED|net::/.test(e)), []);
  } catch (e) { r.check('the storage-blocked script ran to the end', false, String(e && e.stack || e)); }
  await C.close();

  process.exit(r.done() ? 0 : 1);
})();
