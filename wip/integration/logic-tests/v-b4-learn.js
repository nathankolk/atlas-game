// Second-pass probe, real timers: stale callbacks from an abandoned Learn quiz or city round
// must not act on the round started right after (bug B4, the cases t3 does not play).
'use strict';
const { launchApp, startLevel, snap, reporter } = require('./lib.js');

(async () => {
  const r = reporter('B4 in Learn and city rounds');
  const h = await launchApp({ noPaint: true });
  const page = h.page;
  try {
    // ---- A. Learn quiz miss -> leave -> normal round of the same level ----
    await startLevel(page, 'canada-provinces', { learn: true, learnFresh: true });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__t.snapshot().learnPhase === 'quiz' && window.__atlas.state.current);
    await page.evaluate(() => window.__t.attempt(false));          // one miss fails the level; reveal timer is now pending
    const mid = await snap(page);
    r.eq('A: the miss locked the map and is waiting to restart the level', [mid.locked, mid.learnPhase], [true, 'quiz']);
    await page.keyboard.press('Escape');
    const first = await startLevel(page, 'canada-provinces');
    await page.waitForTimeout(3500);
    let s = await snap(page);
    r.eq('A: the new round still shows its first question', [s.current, s.seq, s.learnPhase, s.screen], [first.current, 0, null, 'game-screen']);
    r.eq('A: no marks or reveal left on the new map', await page.evaluate(() =>
      document.querySelectorAll('.country.reveal, .country.completed-wrong, .country.completed-correct, .country.target-wrong').length), 0);
    r.eq('A: no session and no items were recorded', await page.evaluate(() => [window.__atlas.mastery.totals().games, window.__atlas.mastery.totals().itemsSeen]), [0, 0]);

    // ---- B. Learn quiz miss -> leave -> resume the ladder ----
    await page.keyboard.press('Escape');
    await startLevel(page, 'canada-provinces', { learn: true, learnFresh: true });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__t.snapshot().learnPhase === 'quiz' && window.__atlas.state.current);
    await page.evaluate(() => window.__t.attempt(false));
    await page.keyboard.press('Escape');
    await startLevel(page, 'canada-provinces', { learn: true });
    await page.waitForTimeout(3500);
    r.eq('B: the resumed ladder was not restarted by the old miss', await page.evaluate(() => {
      const l = window.__atlas.state.learn;
      return [l.phase, l.level, l.restarts, document.getElementById('toast').classList.contains('show')];
    }), ['study', 1, 0, false]);

    // ---- C. skipped city -> leave -> same cities round ----
    await page.keyboard.press('Escape');
    await startLevel(page, 'northeast-cities');
    await page.keyboard.press('s');
    const c1 = await snap(page);
    r.eq('C: the skip is counted and its reveal is pending', [c1.seq, c1.locked], [1, true]);
    await page.keyboard.press('Escape');
    const firstCity = await startLevel(page, 'northeast-cities');
    await page.waitForTimeout(3500);
    s = await snap(page);
    r.eq('C: the new cities round still shows its first question', [s.current, s.seq, s.locked], [firstCity.current, 0, false]);
    r.eq('C: no dot is marked on the new map', await page.evaluate(() =>
      document.querySelectorAll('.city-dot.reveal, .city-dot.completed-wrong, .city-dot.completed-correct').length), 0);
    r.eq('C: the skipped city kept its outcome; the abandoned round is no session', await page.evaluate(() =>
      [window.__atlas.mastery.skills(), window.__atlas.mastery.totals().itemsSeen, window.__atlas.mastery.totals().games]), [['us-city'], 1, 0]);
    r.eq('no page errors', h.errors, []);
  } catch (e) { r.check('probe ran to the end', false, String(e && e.stack || e)); }
  await h.close();
  process.exit(r.done() ? 0 : 1);
})();
