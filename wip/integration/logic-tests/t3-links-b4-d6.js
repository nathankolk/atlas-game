// Deep links (D7), stale delayed callbacks (B4), the load-failure message (D6)
'use strict';
const { launchApp, reloadApp, startLevel, answer, snap, reporter, pageHelpers } = require('./lib.js');
const path = require('path');
const { launch } = require(path.resolve(__dirname, '..', '..', '..', 'harness', 'atlas-harness.js'));

const SHOTS = __dirname + '/../../../shots/app/logic/';
const stores = (page) => page.evaluate(() => ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery']
  .filter(k => localStorage.getItem(k) !== null));

(async () => {
  const r = reporter('links, B4, D6');

  // ================= B4: real timers =================
  if (!process.env.ONLY || process.env.ONLY === 'b4') {
    const h = await launchApp({});
    const page = h.page;
    try {
      // 1. Skip (2.6 s reveal pending) -> Esc -> another level straight away
      await startLevel(page, 'Asia');
      await page.keyboard.press('s');
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
      const s1 = await startLevel(page, 'Europe');
      await page.waitForTimeout(3200);
      const s2 = await snap(page);
      r.eq('B4: a skip left behind does not eat the next round\'s first question', [s2.current, s2.queue, s2.wrong, s2.seq, s2.locked], [s1.current, s1.queue, 0, 0, false]);
      const marks = await page.evaluate(() => { const m = window.__t.marks(); return m.found + m.second + m.missed + m.reveal; });
      r.eq('B4: no marks from the abandoned round on the new map', marks, 0);

      // 2. Correct answer (0.9 s pending) -> Esc -> another level
      await page.evaluate(() => window.__t.attempt(true));
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
      const s3 = await startLevel(page, 'Africa');
      await page.waitForTimeout(1300);
      const s4 = await snap(page);
      r.eq('B4: a pending "next question" from the old round is dropped', [s4.current, s4.queue, s4.correct], [s3.current, s3.queue, 0]);

      // 3. Capital choice (1.1 s pending) -> Esc -> States
      await page.keyboard.press('Escape');
      await startLevel(page, 'us-state-to-capital');
      await page.evaluate(() => window.__t.attempt(true));
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
      const s5 = await startLevel(page, 'us-state');
      await page.waitForTimeout(1500);
      const s6 = await snap(page);
      r.eq('B4: capital-choice callbacks are dropped too', [s6.current, s6.queue, s6.correct], [s5.current, s5.queue, 0]);

      // 4. Leaving during the 80 ms start delay never shows a prompt on the hidden screen
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
      await page.evaluate(() => { window.__atlas.startGame('Oceania'); });
      await page.waitForFunction(() => window.__t.screen() === 'game-screen');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const s7 = await snap(page);
      r.eq('B4: a round left before its first prompt asks nothing', [s7.screen, s7.current], ['menu-screen', null]);

      // 5. The same round keeps working after all that (the guard only drops other rounds' callbacks)
      await startLevel(page, 'Oceania');
      const b = await snap(page);
      await answer(page, 'first');
      const a = await snap(page);
      r.eq('a normal answer still advances', [a.correct, a.queue], [1, b.queue - 1]);
      r.eq('no page errors (B4)', h.errors, []);
    } catch (e) { r.check('B4 script ran to the end', false, String(e && e.stack || e)); }
    await h.close();
  }

  // ================= D7: deep links =================
  if (!process.env.ONLY || process.env.ONLY === 'd7') {
    const focusSeed = { 'world-country|Europe': { names: ['France', 'Spain'], total: 39, savedAt: 1794790686008 } };
    // real timers, so the notice is still up when it is looked at
    const h = await launchApp({ seedStorage: { 'atlas-focus': focusSeed } });
    const page = h.page;
    const open = async (query) => { await reloadApp(h, query); await page.waitForTimeout(500); return snap(page); };
    try {
      // unplayable slug
      for (const slug of ['midwest-cities', 'south-cities', 'west-cities']) {
        const s = await open('?play=' + slug);
        const notice = await page.evaluate(() => { const el = document.getElementById('app-notice'); return el ? [el.classList.contains('show'), el.textContent] : null; });
        r.eq('?play=' + slug + ' stays on the menu', s.screen, 'menu-screen');
        r.check('?play=' + slug + ' says why', notice && notice[0] && /isn’t ready to play yet/.test(notice[1]), notice);
        r.eq('?play=' + slug + ' writes nothing', (await stores(page)), ['atlas-focus']);
        r.eq('?play=' + slug + ' clears the address bar', await page.evaluate(() => location.search), '');
        if (slug === 'midwest-cities') await page.screenshot({ path: SHOTS + 'notice-unplayable.png' });
      }
      // unknown slug
      let s = await open('?play=atlantis');
      let notice = await page.evaluate(() => { const el = document.getElementById('app-notice'); return el ? [el.classList.contains('show'), el.textContent] : null; });
      r.eq('unknown slug stays on the menu, nothing written', [s.screen, await stores(page), await page.evaluate(() => location.search)], ['menu-screen', ['atlas-focus'], '']);
      r.check('unknown slug says so', notice && notice[0] && /doesn’t lead to a level/.test(notice[1]), notice);
      await page.screenshot({ path: SHOTS + 'notice-unknown.png' });
      // starting an unbuilt level directly is refused the same way
      await page.evaluate(() => window.__atlas.startGame('midwest-cities'));
      await page.waitForTimeout(400);
      r.eq('an unbuilt level is refused before any map is fetched', await page.evaluate(() => window.__atlas.state.usLoaded), false);
      r.eq('startGame on an unbuilt level: menu, nothing written', [await page.evaluate(() => window.__t.screen()), await stores(page)], ['menu-screen', ['atlas-focus']]);
      await page.evaluate(() => window.__atlas.startGame('Atlantis'));
      await page.waitForTimeout(300);
      r.eq('startGame on a name that is no level: menu, nothing written', [await page.evaluate(() => window.__t.screen()), await stores(page)], ['menu-screen', ['atlas-focus']]);

      // a play link starts a fresh full round straight away, even where the card would open the chooser
      s = await open('?play=europe');
      await page.waitForFunction(() => window.__t.snapshot().current);
      s = await snap(page);
      r.eq('?play=europe starts a full round (a saved focus list does not open the chooser)', [s.screen, s.total, s.practice,
        await page.evaluate(() => !document.getElementById('level-sheet').hidden)], ['game-screen', 39, false, false]);
      r.eq('address bar keeps the link', await page.evaluate(() => location.search), '?play=europe');
      s = await open('?play=china-provinces');
      await page.waitForFunction(() => window.__t.snapshot().current, null, { timeout: 20000 });
      s = await snap(page);
      r.eq('?play=china-provinces starts the round, no chooser', [s.screen, s.total, s.learnPhase], ['game-screen', 33, null]);
      s = await open('?play=china-provinces&learn=1');
      await page.waitForFunction(() => window.__t.snapshot().learnPhase === 'study', null, { timeout: 20000 });
      s = await snap(page);
      r.eq('&learn=1 opens Learn', [s.screen, s.learnPhase, s.learnLevel, await page.evaluate(() => location.search)], ['game-screen', 'study', 1, '?play=china-provinces&learn=1']);
      s = await open('?play=europe&learn=1');
      await page.waitForFunction(() => window.__t.snapshot().learnPhase === 'study', null, { timeout: 20000 });
      s = await snap(page);
      r.eq('&learn=1 opens a continent\'s ladder too', [s.screen, s.learnPhase, s.learnLevel, await page.evaluate(() => location.search)], ['game-screen', 'study', 1, '?play=europe&learn=1']);
      // The World has no ladder (184 names is too long a one), so the link plays the level
      s = await open('?play=world&learn=1');
      await page.waitForFunction(() => window.__t.snapshot().current, null, { timeout: 20000 });
      s = await snap(page);
      r.eq('&learn=1 on a level without Learn plays it', [s.screen, s.learnPhase, s.total], ['game-screen', null, 184]);
      s = await open('?play=PIN-EUROPE');
      await page.waitForFunction(() => window.__t.snapshot().current);
      s = await snap(page);
      r.eq('slugs are case-insensitive; pin link starts the round', [s.screen, s.mode, s.total], ['game-screen', 'city-pin', 20]);
      s = await open('?play=us-capital-to-state');
      await page.waitForFunction(() => window.__t.snapshot().current, null, { timeout: 20000 });
      s = await snap(page);
      r.eq('US link', [s.screen, s.mode, s.total], ['game-screen', 'us-capital-to-state', 50]);
      // back to Home (there are no folders any more), address bar reset
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
      r.eq('leaving a linked level resets the address bar', await page.evaluate(() => [location.search, window.__atlas.state.view]), ['', 'home']);

      // daily
      s = await open('?play=daily');
      await page.waitForFunction(() => window.__t.snapshot().current);
      s = await snap(page);
      r.eq('?play=daily opens the Daily Five', [s.screen, s.mode, s.total], ['game-screen', 'daily-five', 5]);
      for (let i = 0; i < 5; i++) await answer(page, 'first');
      await page.waitForFunction(() => window.__t.screen() === 'results-screen');
      s = await open('?play=daily');
      r.eq('?play=daily after playing lands on the menu', [s.screen, await page.evaluate(() => (document.querySelector('.daily') || { dataset: {} }).dataset.daily === 'played')], ['menu-screen', true]);

      // share links still come from the registry
      const links = await page.evaluate(() => {
        const out = {};
        return window.__atlas.LEVELS.map(l => l.key).length;
      });
      r.eq('registry intact after reloads', links, 55);
      r.eq('no page errors (links)', h.errors, []);
    } catch (e) { r.check('links script ran to the end', false, String(e && e.stack || e)); }
    await h.close();
  }

  // ================= D6: the world map fails to load =================
  if (!process.env.ONLY || process.env.ONLY === 'd6') {
    const h = await launch({});
    const page = h.page;
    try {
      await page.route(/countries-(50|110)m\.json/, route => route.abort());
      await page.goto(h.url);
      await page.waitForFunction(() => document.querySelector('#menu-content .error-state'), null, { timeout: 20000 });
      const text = await page.evaluate(() => document.querySelector('#menu-content .error-state').textContent);
      r.check('D6: the load-failure message shows in the menu', /could not be unfurled/.test(text), text);
      await page.screenshot({ path: SHOTS + 'load-failure.png' });
      const errs = h.errors.filter(e => /pageerror/.test(e));
      r.eq('D6: no exception thrown while reporting it', errs, []);
      const lv = await page.evaluate(async () => {
        const l = window.__atlas.levelByKey('world');
        let rejected = false;
        try { await l.load(); } catch (e) { rejected = true; }
        return [l.ready(), l.names().length, rejected];
      });
      r.eq('world level: not ready, no names, load() rejects', lv, [false, 0, true]);
    } catch (e) { r.check('D6 script ran to the end', false, String(e && e.stack || e)); }
    await h.close();
  }

  process.exit(r.done() ? 0 : 1);
})();
