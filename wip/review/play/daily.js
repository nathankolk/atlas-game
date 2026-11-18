// Daily Five: unplayed, played, share text, and the UTC day rolling over with a faked clock.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const out = [];
const say = s => { out.push(s); console.log(s); };
const shareStub = () => {
  window.__shared = [];
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__shared.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
};
const card = page => page.evaluate(() => { const c = document.querySelector('#menu-screen .daily'); return c ? c.dataset.daily + ' | ' + c.innerText.replace(/\s+/g, ' ') : null; });
const lede = page => page.evaluate(() => document.querySelector('#menu-screen').innerText.replace(/\s+/g, ' ').slice(0, 170));

(async () => {
  // D1: play at 23:40 UTC, then let midnight pass with Home open
  let sess = await L.open({ init: shareStub });
  let page = sess.page;
  await page.clock.install({ time: new Date('2026-11-18T23:40:00Z') });
  await L.home(sess); await L.waitMenu(page);
  say('D1 23:40 unplayed card: ' + await card(page));
  await page.click('.daily [data-action="play-daily"]');
  let st = await L.waitRound(sess, 'daily');
  const puzzle = [st.current].concat(st.queue);
  say('D1 puzzle ' + JSON.stringify(puzzle) + ' dateKey ' + (await page.evaluate(() => window.__atlas.state.dailyDateKey)) + ' url ' + (await page.evaluate(() => location.search)));
  const r = await Pl.playChecked(sess, { how: i => ['right', 'second', 'miss', 'skip', 'right'][i], skill: 'country' });
  r.problems.forEach(p => say('  PROBLEM ' + p));
  await L.sleep(400);
  const att = await L.store(page, 'atlas-daily-attempts');
  say('D1 attempts ' + JSON.stringify(att));
  say('D1 record ' + JSON.stringify((await L.store(page, 'atlas-records'))['daily-five|Daily|normal']) + ' focus ' + (await L.raw(page, 'atlas-focus')));
  say('D1 results: ' + (await page.evaluate(() => document.getElementById('results-screen').innerText.replace(/\s+/g, ' ').slice(0, 500))));
  await page.click('#share-btn'); await L.sleep(300);
  say('D1 share text: ' + JSON.stringify(await page.evaluate(() => window.__shared)));
  await page.click('#home-btn'); await L.waitMenu(page); await L.sleep(300);
  say('D1 played card: ' + await card(page));
  await page.click('[data-action="share-daily"]'); await L.sleep(300);
  say('D1 share from card: ' + JSON.stringify(await page.evaluate(() => window.__shared.slice(-1))));
  // a second scored attempt by link
  await page.goto(sess.url + '?play=daily', { waitUntil: 'domcontentloaded' }); await L.sleep(1500);
  st = await L.snap(page);
  say('D1 ?play=daily again -> screen ' + st.screen + ' mode ' + st.mode + ' dailyReplay ' + st.dailyReplay + ' notice ' + (await page.evaluate(() => (document.getElementById('app-notice') || {}).textContent || '')));
  if (st.screen === 'game') { await page.keyboard.press('Escape'); await L.sleep(300); }
  await page.goto(sess.url, { waitUntil: 'domcontentloaded' }); await L.waitMenu(page); await L.sleep(300);
  say('D1 now ' + (await page.evaluate(() => new Date().toISOString())) + ' card: ' + await card(page));
  // midnight passes while Home stays open
  await page.clock.fastForward('30:00'); await L.sleep(1500);
  say('D1 after midnight, ' + (await page.evaluate(() => new Date().toISOString())) + ' card still on screen: ' + await card(page));
  say('D1 lede: ' + await lede(page));
  // what the stale card's buttons do now
  const hasReplay = await page.evaluate(() => !!document.querySelector('[data-action="replay-daily"]'));
  if (hasReplay) {
    const before = await page.evaluate(() => window.__shared.length);
    await page.click('[data-action="share-daily"]'); await L.sleep(300);
    say('D1 stale card Share -> shared something: ' + ((await page.evaluate(() => window.__shared.length)) > before));
    await page.click('[data-action="replay-daily"]');
    st = await L.waitRound(sess, 'stale replay');
    const p2 = [st.current].concat(st.queue);
    say('D1 stale card "Practice Replay" opens: dateKey ' + (await page.evaluate(() => window.__atlas.state.dailyDateKey)) + ' dailyReplay ' + JSON.stringify(await page.evaluate(() => window.__atlas.state.dailyReplay)) + ' countries ' + JSON.stringify(p2.slice().sort()) + ' (yesterday: ' + JSON.stringify(puzzle.slice().sort()) + ') tag ' + (await page.evaluate(() => document.getElementById('region-tag').textContent)));
    await page.keyboard.press('Escape'); await L.sleep(400);
    say('D1 back on Home, card: ' + await card(page));
  }
  await sess.close();

  // D2: an unplayed card open across midnight, then a round started before midnight and finished after
  sess = await L.open({ init: shareStub }); page = sess.page;
  await page.clock.install({ time: new Date('2026-11-18T23:59:20Z') });
  await L.home(sess); await L.waitMenu(page);
  say('D2 23:59:20 card: ' + await card(page));
  await page.click('.daily [data-action="play-daily"]');
  st = await L.waitRound(sess, 'daily');
  const key0 = await page.evaluate(() => window.__atlas.state.dailyDateKey);
  await L.answerQuestion(sess, 'right').then(a => L.waitNextQuestion(sess, a));
  await page.clock.fastForward('01:00');
  const r2 = await Pl.playChecked(sess, { skill: 'country' });
  await L.sleep(400);
  say('D2 round started ' + key0 + ', finished ' + (await page.evaluate(() => new Date().toISOString())) + ': attempts keys ' + Object.keys(await L.store(page, 'atlas-daily-attempts')) + ' results label ' + (await page.evaluate(() => document.getElementById('results-region').textContent)) + ' | ' + (await page.evaluate(() => (document.querySelector('.daily-recap') || {}).innerText || '').then ? '' : ''));
  say('D2 results text: ' + (await page.evaluate(() => document.getElementById('results-screen').innerText.replace(/\s+/g, ' ').slice(0, 300))));
  await page.click('#home-btn'); await L.waitMenu(page); await L.sleep(300);
  say('D2 Home after: card ' + await card(page));
  say('D2 mastery today row ' + JSON.stringify((await Pl.mdump(page)).today) + ' streak ' + JSON.stringify(await page.evaluate(() => window.__atlas.mastery.streak())));
  say('errors ' + JSON.stringify(sess.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)));
  await sess.close();
  fs.writeFileSync('daily.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('daily.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
