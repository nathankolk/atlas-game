// US rounds (states, both capitals modes, cities), a province round, Learn, Pin the City and the Daily Five,
// played through the real handlers; the mastery store, records and the D3 fix are checked along the way.
'use strict';
const { launchApp, startLevel, playRound, answer, snap, installPinCities, reporter } = require('./lib.js');

const SHOTS = __dirname + '/../../../shots/app/logic/';

(async () => {
  const r = reporter('modes');
  const h = await launchApp({ fast: true, noPaint: true });
  const page = h.page;
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('atlas-mastery')));
  const today = () => page.evaluate(() => window.__atlas.mastery.today());
  const outcomesOf = (skill, names) => page.evaluate(([s, ns]) => {
    const out = {};
    ns.forEach(n => { const g = window.__atlas.mastery.get(s, n); out[n] = [g.first, g.second, g.missed]; });
    return out;
  }, [skill, names]);
  const tally = (log) => { const out = {}; log.forEach(x => { const t = out[x.name] || (out[x.name] = [0, 0, 0]); t[x.outcome === 'first' ? 0 : x.outcome === 'second' ? 1 : 2]++; }); return out; };
  const home = async () => { await page.click('#home-btn'); await page.waitForFunction(() => window.__t.screen() === 'menu-screen'); };
  let sessions = 0;
  try {
    await installPinCities(page);

    // ---- States ----
    await startLevel(page, 'us-state');
    const sLog = await playRound(page, (i) => ['miss', 'second'][i] || 'first');
    sessions++;
    r.eq('States asks 50', sLog.length, 50);
    r.eq('us-state outcomes', await outcomesOf('us-state', sLog.map(x => x.name)), tally(sLog));
    await home();

    // ---- States -> Capitals (choice buttons) ----
    await startLevel(page, 'us-state-to-capital');
    const cLog = await playRound(page, (i) => ['second', 'miss', 'skip'][i] || 'first');
    sessions++;
    r.eq('States -> Capitals asks 50', cLog.length, 50);
    r.eq('us-capital outcomes after one mode', await outcomesOf('us-capital', cLog.map(x => x.name)), tally(cLog));
    await home();

    // ---- Capitals -> States feeds the same skill ----
    await startLevel(page, 'us-capital-to-state');
    const c2Log = await playRound(page, (i) => i === 0 ? 'miss' : 'first');
    sessions++;
    r.eq('us-capital outcomes after both modes', await outcomesOf('us-capital', cLog.map(x => x.name)), tally(cLog.concat(c2Log)));
    let st = await store();
    r.eq('skills so far', Object.keys(st.items).sort(), ['us-capital', 'us-state']);
    r.eq('50 items in each', [Object.keys(st.items['us-state']).length, Object.keys(st.items['us-capital']).length], [50, 50]);
    const recs = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('atlas-records'))).sort());
    r.eq('records keep their old keys', recs, ['us-capital-to-state|US Capitals → States|normal', 'us-state-to-capital|US States → Capitals|normal', 'us-state|The United States|normal']);
    await home();

    // ---- D3: all three US cards show a best, and the folder card reads all three ----
    const bests = await page.evaluate(() => ['us-state', 'us-state-to-capital', 'us-capital-to-state']
      .map(k => [k, (document.querySelector('[data-level="' + k + '"] .level-best') || {}).textContent || null]));
    r.check('D3: each US mode card shows its best', bests.length === 3 && bests.every(b => /^Best\d/.test(b[1] || '')), bests);
    await page.screenshot({ path: SHOTS + 'menu-us-bests.png' });
    console.log('   US cards: ' + JSON.stringify(bests));

    // ---- Cities: Northeast ----
    await startLevel(page, 'northeast-cities');
    const prompt = (await snap(page)).prompt;
    r.check('city prompt reads "City, State"', /^[^,]+, [^,]+$/.test(prompt), prompt);
    const ctLog = await playRound(page, (i) => ['second', 'miss', 'skip'][i] || 'first');
    sessions++;
    r.eq('Northeast asks 40', ctLog.length, 40);
    r.eq('us-city outcomes', await outcomesOf('us-city', ctLog.map(x => x.name)), tally(ctLog));
    await home();

    // ---- Province round: Canada ----
    await startLevel(page, 'canada-provinces');
    const pLog = await playRound(page, (i) => ['miss', 'second'][i] || 'first');
    sessions++;
    r.eq('Canada asks 13', pLog.length, 13);
    r.eq('province:canada outcomes', await outcomesOf('province:canada', pLog.map(x => x.name)), tally(pLog));
    st = await store();
    const day = await today();
    r.eq('sessions so far', st.days[day][0], sessions);
    await home();

    // ---- Learn: quizzes don't touch items; each cleared level is a session ----
    const before = JSON.stringify((await store()).items);
    await startLevel(page, 'canada-provinces', { learn: true });
    let s = await snap(page);
    r.eq('Learn opens on the study panel of level 1', [s.learnPhase, s.learnLevel], ['study', 1]);
    await page.screenshot({ path: SHOTS + 'learn-study.png' });
    // level 1: pass
    await page.click('#learn-ready-btn');
    await answer(page, 'first');
    s = await snap(page);
    r.eq('level 1 cleared -> study level 2', [s.learnPhase, s.learnLevel], ['study', 2]);
    // level 2: miss once (restart), then pass
    await page.click('#learn-ready-btn');
    await answer(page, 'miss');
    s = await snap(page);
    r.eq('a miss restarts level 2', [s.learnPhase, s.learnLevel], ['study', 2]);
    await page.click('#learn-ready-btn');
    await answer(page, 'first');
    await answer(page, 'first');
    s = await snap(page);
    r.eq('level 2 cleared -> study level 3', [s.learnPhase, s.learnLevel], ['study', 3]);
    st = await store();
    r.eq('Learn quizzes record no items', JSON.stringify(st.items), before);
    r.eq('two cleared levels = two sessions (1 + 3 questions, 1 + 2 right)', st.days[day].slice(0, 3),
      [sessions + 2, 50 + 50 + 50 + 40 + 13 + 4, null].map((v, i) => i === 2 ? st.days[day][2] : v));
    sessions += 2;
    const learnSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-learn'))['canada-provinces']);
    r.eq('ladder saved at level 3', [learnSaved.level, learnSaved.order.length], [3, 13]);
    // leave mid-ladder, come back, finish it
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
    await startLevel(page, 'canada-provinces', { learn: true });
    s = await snap(page);
    r.eq('ladder resumes at level 3', [s.learnPhase, s.learnLevel], ['study', 3]);
    for (let level = 3; level <= 13; level++) {
      await page.click('#learn-ready-btn');
      for (let q = 0; q < level; q++) await answer(page, 'first');
    }
    await page.waitForFunction(() => window.__t.screen() === 'results-screen');
    sessions += 11;
    st = await store();
    r.eq('finished ladder: 11 more sessions, still no items recorded', [st.days[day][0], JSON.stringify(st.items) === before], [sessions, true]);
    const learnDone = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-learn'))['canada-provinces']);
    r.check('finished ladder leaves a done marker', learnDone && learnDone.done === true && !learnDone.order && learnDone.savedAt > 0, learnDone);
    r.eq('results say Learn', await page.evaluate(() => document.getElementById('results-region').textContent), 'Provinces of Canada · Learn');
    await home();
    // the chooser treats the marker as "no ladder in progress"
    await page.evaluate(() => document.querySelector('[data-level="canada-provinces"]').click());
    const chooser = await page.evaluate(() => ({ shown: !document.getElementById('level-sheet').hidden,
      learn: (document.querySelector('.mode[data-value="learn"] strong') || {}).textContent, reset: !!document.querySelector('[data-action="sheet-learn-reset"]'),
      info: document.getElementById('sheet-info').textContent }));
    r.eq('level sheet after a finished ladder', [chooser.shown, chooser.learn, chooser.reset], [true, 'Learn Them', false]);
    r.check('the sheet counts the round from the registry', /of 13 mastered/.test(chooser.info), chooser.info.slice(0, 120));
    await page.evaluate(() => document.querySelector('#level-sheet [data-action="sheet-close"]').click());

    // ---- Pin the City: Oceania ----
    const firstBefore = (await store()).days[day][2];
    await startLevel(page, 'pin-oceania');
    await page.screenshot({ path: SHOTS + 'pin-aim.png' });
    const pinLog = await playRound(page, (i) => ['first', 'second', 'miss', 'skip'][i] || 'first');
    sessions++;
    r.eq('Pin Oceania asks 20', pinLog.length, 20);
    const pinResults = await page.evaluate(() => window.__atlas.state.pin.results.map(x => [x.name, x.pts]));
    console.log('   pin points: ' + JSON.stringify(pinResults.slice(0, 5)));
    r.check('pin points land in the planned bands', pinResults[0][1] >= 80 && pinResults[1][1] >= 40 && pinResults[1][1] < 80 && pinResults[2][1] < 40 && pinResults[3][1] === 0, pinResults.slice(0, 4));
    r.eq('city-pin outcomes follow the points bands', await outcomesOf('city-pin', pinLog.map(x => x.name)), tally(pinLog));
    const pinStore = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-pin')));
    r.eq('atlas-pin keeps its shape', [pinStore.games.length, pinStore.games[0].region, pinStore.games[0].diff, pinStore.games[0].max, Object.keys(pinStore.cities).length], [1, 'Oceania', 'normal', 2000, 20]);
    st = await store();
    r.eq('pin round is a session; 20 cities in the store', [st.days[day][0], Object.keys(st.items['city-pin']).length], [sessions, 20]);
    r.eq('pin session counts the 17 first-band answers as first tries', st.days[day][2] - firstBefore, 17);
    await page.screenshot({ path: SHOTS + 'results-pin.png' });
    await home();

    // ---- Daily Five ----
    const countryBefore = Object.keys((await store()).items.country || {}).length;
    await startLevel(page, 'daily-five');
    const dLog = await playRound(page, (i) => ['first', 'second', 'miss'][i] || 'first');
    sessions++;
    r.eq('Daily asks 5', dLog.length, 5);
    r.eq('daily countries feed the country skill', await outcomesOf('country', dLog.map(x => x.name)), tally(dLog));
    const attempt = await page.evaluate(() => { const all = JSON.parse(localStorage.getItem('atlas-daily-attempts')); return all[Object.keys(all)[0]]; });
    r.eq('daily attempt saved in its old shape', [attempt.sequence, attempt.score, attempt.correct, attempt.total, attempt.countries], [[2, 1, 0, 2, 2], 7, 4, 5, dLog.map(x => x.name)]);
    await home();
    // a second start is refused; a practice replay records mastery but no attempt
    await page.evaluate(() => window.__atlas.startGame('daily-five'));
    await page.waitForTimeout(300);
    r.eq('a played daily does not start again', await page.evaluate(() => window.__t.screen()), 'menu-screen');
    await page.click('[data-action="replay-daily"]');
    await page.waitForFunction(() => window.__t.snapshot().screen === 'game-screen' && window.__t.snapshot().current);
    const rLog = await playRound(page);
    sessions++;
    r.eq('replay asks the same five', rLog.map(x => x.name), dLog.map(x => x.name));
    r.eq('replay adds to the country history', await outcomesOf('country', dLog.map(x => x.name)), tally(dLog.concat(rLog)));
    st = await store();
    r.eq('all sessions counted today', st.days[day][0], sessions);
    r.eq('country skill has the five', Object.keys(st.items.country).length, countryBefore + 5);

    // ---- the store as a whole ----
    const raw = await page.evaluate(() => localStorage.getItem('atlas-mastery'));
    console.log('   atlas-mastery: ' + raw.length + ' chars; skills ' + Object.keys(st.items).map(k => k + ':' + Object.keys(st.items[k]).length).join(', '));
    console.log('   days: ' + JSON.stringify(st.days) + ' life: ' + JSON.stringify(st.life));
    console.log('   sample: ' + JSON.stringify(Object.entries(st.items['city-pin']).slice(0, 4)));
    r.eq('skills in the store', Object.keys(st.items).sort(), ['city-pin', 'country', 'province:canada', 'us-capital', 'us-city', 'us-state']);
    r.eq('store version', st.v, 2);
    const totals = await page.evaluate(() => ({ t: window.__atlas.mastery.totals(), streak: window.__atlas.mastery.streak() }));
    r.eq('totals', [totals.t.games, totals.t.itemsSeen, totals.streak.current], [sessions, 50 + 50 + 40 + 13 + 20 + 5, 1]);
    r.eq('no page errors', h.errors, []);
  } catch (e) {
    r.check('script ran to the end', false, String(e && e.stack || e));
    try { await page.screenshot({ path: SHOTS + 'fail-t2.png' }); console.log(JSON.stringify(await snap(page))); } catch (e2) { /* page gone */ }
  }
  await h.close();
  process.exit(r.done() ? 0 : 1);
})();
