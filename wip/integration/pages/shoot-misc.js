// Screenshots of the transient pieces: the game's toast, a notice, the loading card, the record banner, the copy dialog.
//   NODE_PATH=/opt/node-tools/node_modules node shoot-misc.js
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const out = name => path.join(S, 'shots/app/pages', name + '.png');
const ready = page => page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 30000 });
const inGame = page => page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current, null, { timeout: 30000 });
// Click the country the game is asking for (or, with wrong = true, another one)
const answer = (page, wrong) => page.evaluate(w => {
  const st = window.__atlas.state;
  let key = null, other = null;
  st.canonicalByFeature.forEach((name, k) => { if (name === st.current) key = k; else if (st.continentByFeature.get(k) === 'Oceania') other = k; });
  const el = document.querySelector('.country[data-fkey="' + CSS.escape(w ? other : key) + '"]');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
}, !!wrong);

(async () => {
  // 1. toast, right answer, desktop light
  let h = await launch({ width: 1280, height: 800, seedStorage: { 'atlas-theme': 'light' } });
  await h.page.goto(h.url + '?play=oceania'); await ready(h.page); await inGame(h.page); await h.page.waitForTimeout(600);
  await answer(h.page);
  await h.page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  await h.page.waitForTimeout(450);
  await h.page.screenshot({ path: out('misc-toast-correct-desktop-light') });
  await h.close();

  // 2. toast, wrong answer, phone dark
  h = await launch({ mobile: true, seedStorage: { 'atlas-theme': 'dark' } });
  await h.page.goto(h.url + '?play=oceania'); await ready(h.page); await inGame(h.page); await h.page.waitForTimeout(600);
  await answer(h.page, true);
  await h.page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  await h.page.waitForTimeout(450);
  await h.page.screenshot({ path: out('misc-toast-wrong-mobile-dark') });
  await h.close();

  // 3. notice on a view, both themes
  for (const [theme, mobile] of [['dark', false], ['light', true]]) {
    h = await launch(Object.assign({ seedStorage: { 'atlas-theme': theme } }, mobile ? { mobile: true } : { width: 1280, height: 800 }));
    await h.page.goto(h.url + '?play=nowhere'); await ready(h.page);
    await h.page.waitForFunction(() => { const n = document.getElementById('app-notice'); return n && n.classList.contains('show'); });
    await h.page.waitForTimeout(500);
    await h.page.screenshot({ path: out('misc-notice-' + (mobile ? 'mobile' : 'desktop') + '-' + theme) });
    await h.close();
  }

  // 4. loading card while a province map is on its way
  for (const theme of ['light', 'dark']) {
    h = await launch({ width: 1280, height: 800, seedStorage: { 'atlas-theme': theme } });
    await h.page.route('**/data/provinces-china.json', async route => { await new Promise(r => setTimeout(r, 2500)); route.continue(); });
    await h.page.goto(h.url); await ready(h.page); await h.page.waitForTimeout(300);
    await h.page.evaluate(() => { window.__atlas.startGame('china-provinces'); });
    await h.page.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return o && o.classList.contains('visible'); });
    await h.page.waitForTimeout(600);
    await h.page.screenshot({ path: out('misc-loading-desktop-' + theme) });
    await h.close();
  }

  // 5. record banner: a perfect Oceania over an old, poor best; then the copy dialog where the clipboard is refused
  const old = { 'world-country|Oceania|normal': { gamesPlayed: 2, bestScore: { value: 3, max: 14, date: '2026-10-01' }, bestAccuracy: { correct: 2, total: 7, pct: 29, date: '2026-10-01' }, lastPlayed: '2026-10-01' } };
  h = await launch({ width: 1280, height: 800, seedStorage: { 'atlas-theme': 'light', 'atlas-records': JSON.stringify(old) } });
  await h.page.goto(h.url + '?play=oceania'); await ready(h.page); await inGame(h.page); await h.page.waitForTimeout(500);
  for (let i = 0; i < 40; i++) {
    if (await h.page.evaluate(() => document.body.dataset.screen === 'results')) break;
    if (await h.page.evaluate(() => !window.__atlas.state.interactionLocked)) await answer(h.page);
    await h.page.waitForTimeout(400);
  }
  await h.page.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 20000 });
  await h.page.waitForTimeout(2500);
  await h.page.screenshot({ path: out('misc-record-banner-desktop-light') });
  await h.page.evaluate(() => { try { delete Navigator.prototype.share; } catch (e) {} navigator.share = undefined; navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
  await h.page.locator('#share-btn').click();
  await h.page.waitForFunction(() => !!document.querySelector('#dialog textarea'));
  await h.page.waitForTimeout(500);
  await h.page.screenshot({ path: out('misc-copy-dialog-desktop-light') });
  console.log('errors', h.errors.length, h.errors.slice(0, 3));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
