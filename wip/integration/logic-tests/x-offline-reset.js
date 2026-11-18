// What happens to a round played and synced on device A after device B reset while offline,
// once B's reset reaches the server.  (A probe, not a suite: it prints what it finds.)
'use strict';
const { launchApp, reloadApp, startLevel, playRound } = require('./lib.js');
const TOKEN = '7c1e9b2c7d3f1e6a5b8c2d4e7f9a1b3d';
const sleep = ms => new Promise(res => setTimeout(res, ms));
function makeServer() {
  const srv = { blob: null, posts: 0, gets: 0 };
  srv.attach = async (page, dev) => {
    await page.route(/\/api\/records/, async route => {
      if (dev.offline) return route.abort();
      const req = route.request();
      if (req.method() === 'POST') { srv.posts++; srv.blob = req.postData(); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      srv.gets++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: srv.blob === null ? 'null' : srv.blob });
    });
  };
  return srv;
}
const quiet = async (srv) => { let last = -1; for (let i = 0; i < 60; i++) { const n = srv.posts + srv.gets; if (n === last) return; last = n; await sleep(300); } };
const ls = (page, key) => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, key);
(async () => {
  const srv = makeServer();
  const devA = { name: 'A' }, devB = { name: 'B' };
  const linked = { 'atlas-sync-token': TOKEN, 'atlas-sync-username': 'Ada' };
  const A = await launchApp({ fast: true, seedStorage: linked, beforeLoad: h => srv.attach(h.page, devA) });
  const B = await launchApp({ fast: true, seedStorage: linked, beforeLoad: h => srv.attach(h.page, devB) });
  const a = A.page, b = B.page;
  try {
    await quiet(srv);
    // An earlier round on A, synced: this is what the reset is meant to erase
    await startLevel(a, 'South America'); await playRound(a); await a.evaluate(() => document.getElementById('home-btn').click());
    await quiet(srv);
    await reloadApp(B); await quiet(srv);
    // B resets while it cannot reach the server
    devB.offline = true;
    await b.evaluate(() => { window.__atlas.resetProgress(); });
    await sleep(1500);
    // A plays on, online, and syncs
    await startLevel(a, 'Oceania'); await playRound(a); await a.evaluate(() => document.getElementById('home-btn').click());
    await quiet(srv);
    console.log('server after A\'s round:', Object.keys(JSON.parse(srv.blob).records).sort().join(', '));
    // B comes back and delivers its reset
    devB.offline = false;
    await reloadApp(B); await quiet(srv);
    console.log('server after B reconnects:', Object.keys(JSON.parse(srv.blob).records).sort().join(', ') || '(no records)', 'resetAt', JSON.parse(srv.blob).resetAt > 0);
    // A looks again
    await reloadApp(A); await quiet(srv);
    const rec = await ls(a, 'atlas-records');
    const focus = await ls(a, 'atlas-focus');
    const totals = await a.evaluate(() => { const t = window.__atlas.mastery.totals(); return [t.games, t.questions]; });
    console.log('A after its next pull: records', Object.keys(rec || {}).sort().join(', ') || '(none)', '| focus lists', Object.keys(focus || {}).sort().join(', ') || '(none)', '| mastery games, questions', totals.join(', '));
  } catch (e) { console.log('ERROR', e && e.stack || e); }
  await A.close(); await B.close();
})();
