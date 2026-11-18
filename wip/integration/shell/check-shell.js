// Interaction checks for the shell, Home and the level sheet.
//   NODE_PATH=/opt/node-tools/node_modules node check-shell.js [--mobile] [--only=name]
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const mobile = process.argv.includes('--mobile');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
// --root=<dir> serves another copy of the app (to show a check failing on an earlier tree)
const ROOT = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7) || undefined;
const seedOf = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else { fails++; console.log('  FAIL: ' + what); } };
const eq = (a, b, what) => ok(a === b, what + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

async function open(seed, urlTail, size) {
  const h = await launch(Object.assign({ seedStorage: seed || {}, root: ROOT }, mobile ? { mobile: true } : (size || { width: 1280, height: 800 })));
  if (size && size.before) await size.before(h);
  await h.page.goto(h.url + (urlTail || ''));
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.getElementById('library-collections'), null, { timeout: 20000 });
  await h.page.waitForTimeout(300);
  return h;
}
const st = page => page.evaluate(() => {
  const s = window.__atlas.state;
  return { screen: document.body.dataset.screen, active: (document.querySelector('.screen.active') || {}).id, mode: s.gameMode, startArg: s.startArg,
    practice: s.practice, learn: !!s.learn, learnLevel: s.learn ? s.learn.level : null, queue: s.queue.length, total: s.totalQuestions, difficulty: s.difficulty, mapStyle: s.mapStyle,
    review: s.review ? s.review.queue.length : null, dailyReplay: !!s.dailyReplay, view: s.view, hash: location.hash, search: location.search };
});
const press = (page, sel) => mobile ? page.locator(sel).first().tap() : page.locator(sel).first().click();
const waitGame = page => page.waitForFunction(() => document.body.dataset.screen === 'game' && (window.__atlas.state.current || window.__atlas.state.learn), null, { timeout: 30000 });

const checks = {
  async 'new player'() {
    const h = await open({});
    const page = h.page;
    const info = await page.evaluate(() => {
      const A = window.__atlas;
      const cards = Array.from(document.querySelectorAll('a.level')).map(a => ({ key: a.dataset.level, meta: a.querySelector('.level-meta').textContent, due: a.querySelector('.level-due').textContent, ringNum: !!a.querySelector('.ring b') }));
      return { cards, soon: document.querySelectorAll('.level.is-soon').length, levels: A.LEVELS.map(l => ({ key: l.key, available: l.available, count: l.count(), mode: l.mode, variant: l.variant })),
        figures: Array.from(document.querySelectorAll('.summary dd')).map(d => d.textContent), greeting: document.querySelector('.masthead h1').textContent,
        chipHidden: document.getElementById('streak-chip').hidden, daily: document.querySelector('.daily').dataset.daily, review: document.querySelector('.review').className,
        titles: document.querySelectorAll('[title]').length, storage: Object.keys(localStorage) };
    });
    // Capitals holds two sets of levels and shows one at a time: 'pick' until its switch is turned
    eq(info.cards.length, info.levels.filter(l => l.available && (!l.variant || l.variant === 'pick')).length, 'one card per playable level on show');
    eq(info.soon, 3, 'three coming-soon cards');
    info.cards.forEach(c => {
      const l = info.levels.find(x => x.key === c.key);
      const n = l.mode === 'city-pin' ? Math.min(20, l.count) : l.count;
      ok(c.meta.indexOf(String(n)) === 0 && n > 0, c.key + ' card count: "' + c.meta + '" vs ' + n);
      eq(c.due, 'New', c.key + ' trailing pill');
      ok(!c.ringNum, c.key + ' ring shows no number for a new player');
    });
    eq(info.figures.join('|'), '—|—|—', 'masthead figures for a new player');
    eq(info.greeting, 'Welcome.', 'greeting');
    ok(info.chipHidden, 'no streak chip');
    eq(info.daily, 'unplayed', 'daily card state');
    ok(/review--empty/.test(info.review), 'review card is the empty state');
    eq(info.titles, 0, 'no title= attributes on the page');
    ok(!info.storage.some(k => /atlas-(records|focus|pin|learn|daily|mastery)/.test(k)), 'looking at Home wrote no progress: ' + info.storage.join(','));
    ok(!h.netLog || !JSON.stringify(h.netLog).match(/provinces-|us-states/), 'no province or US map fetched for a new player');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'sheet: open, keyboard, close, start'() {
    const h = await open({});
    const page = h.page;
    await press(page, '[data-level="europe"]');
    await page.waitForSelector('#level-sheet:not([hidden])');
    let a = await page.evaluate(() => ({ inside: document.getElementById('level-sheet').contains(document.activeElement), title: document.getElementById('sheet-title').textContent, ways: document.querySelectorAll('.mode').length }));
    ok(a.inside, 'focus moved into the sheet');
    eq(a.title, 'Europe', 'sheet title');
    eq(a.ways, 2, 'a new continent level offers Play and Learn');
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.getElementById('level-sheet').contains(document.activeElement)), 'Tab stays inside the sheet');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+Tab');
    ok(await page.evaluate(() => document.getElementById('level-sheet').contains(document.activeElement)), 'Shift+Tab stays inside the sheet');
    await page.keyboard.press('Escape');
    a = await page.evaluate(() => ({ hidden: document.getElementById('level-sheet').hidden, scrim: document.getElementById('level-sheet-scrim').hidden, focus: document.activeElement.dataset.level || document.activeElement.tagName }));
    ok(a.hidden && a.scrim, 'Escape closes the sheet');
    eq(a.focus, 'europe', 'focus returns to the card');
    // backdrop and close button
    await press(page, '[data-level="europe"]');
    await page.waitForSelector('#level-sheet:not([hidden])');
    await page.mouse.click(8, mobile ? 30 : 400);
    ok(await page.evaluate(() => document.getElementById('level-sheet').hidden), 'a click on the backdrop closes the sheet');
    await press(page, '[data-level="europe"]');
    await press(page, '.sheet-close');
    ok(await page.evaluate(() => document.getElementById('level-sheet').hidden), 'the close button closes the sheet');
    // difficulty inside the sheet is the global one
    await press(page, '[data-level="europe"]');
    await press(page, '#level-sheet [data-action="set-difficulty"][data-value="hard"]');
    let s = await st(page);
    eq(s.difficulty, 'hard', 'difficulty picked in the sheet');
    eq(await page.evaluate(() => localStorage.getItem('atlas-difficulty')), 'hard', 'difficulty saved');
    eq(await page.evaluate(() => document.querySelector('.playbar [data-action="set-difficulty"][data-value="hard"]').getAttribute('aria-checked')), 'true', 'Home control follows');
    await press(page, '#level-sheet [data-action="set-map"][data-value="satellite"]');
    eq((await st(page)).mapStyle, 'satellite', 'map style picked in the sheet');
    await press(page, '#sheet-start-btn');
    await waitGame(page);
    s = await st(page);
    eq(s.startArg, 'Europe', 'Start begins the level');
    ok(!s.practice && !s.learn, 'a full round');
    ok(await page.evaluate(() => document.getElementById('level-sheet').hidden), 'the sheet is gone during play');
    eq(s.search, '?play=europe', 'address bar names the level');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    s = await st(page);
    eq(s.search + s.hash, '', 'address bar is bare again on Home');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'returning player: bests, focus, learn'() {
    const h = await open(seedOf('seed-rich.json'));
    const page = h.page;
    const before = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    let a = await page.evaluate(() => ({
      africa: document.querySelector('[data-level="africa"] .level-best').textContent, africaDue: document.querySelector('[data-level="africa"] .level-due').textContent,
      caps: document.querySelector('[data-level="us-capital-to-state"] .level-best').textContent, caps2: document.querySelector('[data-level="us-state-to-capital"] .level-best').textContent,
      europe: document.querySelector('[data-level="europe"] .level-best').textContent, pin: document.querySelector('[data-level="pin-europe"] .level-best').textContent,
      figures: Array.from(document.querySelectorAll('.summary dd')).map(d => d.textContent), chip: document.getElementById('streak-chip').textContent, daily: document.querySelector('.daily').dataset.daily,
      marks: document.querySelectorAll('.daily .mark').length, share: !!document.querySelector('.daily [data-action="share-daily"]'), countdown: document.querySelector('[data-countdown]').textContent }));
    eq(a.africa, 'Best49 / 54', 'Africa best');
    ok(/due$/.test(a.africaDue), 'Africa due pill: ' + a.africaDue);
    eq(a.caps, 'Best44 / 50', 'Capitals → States best (D3)');
    eq(a.caps2, 'Best41 / 50', 'States → Capitals best (D3)');
    ok(/^Best39 \/ 39·\d:\d\d$/.test(a.europe), 'Europe best with clean-sweep time: ' + a.europe);
    eq(a.pin, 'Best1,904 pts', 'Pin Europe best');
    ok(a.figures.every(f => f !== '—'), 'masthead figures filled: ' + a.figures.join('|'));
    ok(/\d+-day streak/.test(a.chip), 'streak chip: ' + a.chip);
    eq(a.daily, 'played', 'daily card state');
    eq(a.marks, 5, 'five result marks');
    ok(a.share && /^\d\d:\d\d:\d\d$/.test(a.countdown), 'share button and countdown: ' + a.countdown);
    // Hard bests differ
    await press(page, '.playbar [data-action="set-difficulty"][data-value="hard"]');
    a = await page.evaluate(() => ({ africa: document.querySelector('[data-level="africa"] .level-best').textContent, asia: document.querySelector('[data-level="asia"] .level-best').textContent,
      focusOn: document.activeElement.dataset.value, hash: location.hash }));
    eq(a.africa, 'Best47 / 54', 'Africa best on Hard');
    eq(a.asia, 'Not played on Hard', 'Asia on Hard');
    if (!mobile) eq(a.focusOn, 'hard', 'focus stays on the picked segment');
    if (!mobile) {
      await page.keyboard.press('ArrowRight');
      eq((await st(page)).difficulty, 'uncharted', 'arrow key moves the difficulty');
      a = await page.evaluate(() => ({ sat: document.querySelector('.playbar [data-action="set-map"][data-value="satellite"]').getAttribute('aria-checked'), chartOff: document.querySelector('.playbar [data-action="set-map"][data-value="parchment"]').disabled }));
      ok(a.sat === 'true' && a.chartOff, 'Uncharted locks the map control on satellite');
      await page.keyboard.press('ArrowRight');
      eq((await st(page)).difficulty, 'normal', 'arrow key wraps round');
    } else {
      await press(page, '.playbar [data-action="set-difficulty"][data-value="normal"]');
    }
    // focus practice
    await press(page, '[data-level="africa"]');
    await page.waitForSelector('#level-sheet:not([hidden])');
    a = await page.evaluate(() => ({ ways: Array.from(document.querySelectorAll('.mode')).map(m => m.dataset.value), rows: Array.from(document.querySelectorAll('.bests tbody tr')).map(r => r.textContent), segs: Array.from(document.querySelectorAll('#level-sheet .seg--rich small')).map(x => x.textContent) }));
    eq(a.ways.join(','), 'play,focus,learn', 'Africa offers Play, Focus Practice and Learn');
    ok(/Normal49 \/ 54—91%14/.test(a.rows[0]) && /Hard47 \/ 54/.test(a.rows[1]) && /Uncharted———0/.test(a.rows[2]), 'bests table: ' + a.rows.join(' | '));
    eq(a.segs.join(','), '49 / 54,47 / 54,No best yet', 'difficulty options carry their bests');
    await press(page, '.mode[data-value="focus"]');
    ok(/7 to revisit/.test(await page.locator('#sheet-start-btn').textContent()), 'Start label for focus practice');
    await press(page, '#sheet-start-btn');
    await waitGame(page);
    let s = await st(page);
    ok(s.practice && s.total === 7 && s.startArg === 'Africa', 'focus round of seven: ' + JSON.stringify(s));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    // Learn, and the start-over link
    await press(page, '[data-level="russia-south"]');
    await page.waitForSelector('#level-sheet:not([hidden])');
    a = await page.evaluate(() => ({ ways: Array.from(document.querySelectorAll('.mode')).map(m => m.dataset.value + ':' + m.querySelector('strong').textContent.trim()), reset: !!document.querySelector('[data-action="sheet-learn-reset"]') }));
    eq(a.ways.join(','), 'play:Play,learn:Keep Learning', 'Russia South offers Play and Keep Learning');
    ok(a.reset, 'start-over link shown for a ladder in progress');
    await press(page, '.mode[data-value="learn"]');
    await press(page, '#sheet-start-btn');
    await waitGame(page);
    s = await st(page);
    ok(s.learn && s.learnLevel === 9, 'Learn resumes at level 9: ' + JSON.stringify(s));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    await press(page, '[data-level="russia-south"]');
    await press(page, '[data-action="sheet-learn-reset"]');
    await waitGame(page);
    s = await st(page);
    ok(s.learn && s.learnLevel === 1, 'start-over begins at level 1: ' + JSON.stringify(s));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    await press(page, '[data-level="china-provinces"]');
    a = await page.evaluate(() => Array.from(document.querySelectorAll('.mode')).map(m => m.dataset.value + ':' + m.querySelector('strong').textContent.trim().replace(/\s+/g, ' ')));
    eq(a.join(','), 'play:Play,focus:Focus Practice 9,learn:Learn Them', 'China offers all three');
    await page.keyboard.press('Escape');
    const after = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    ok(before[0] === after[0] && before[1] === after[1], 'records and focus lists untouched by practice, Learn and abandoned rounds');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'old stores only'() {
    const seed = seedOf('seed-old.json');
    const h = await open(seed);
    const page = h.page;
    const a = await page.evaluate(() => ({ africa: document.querySelector('[data-level="africa"] .level-best').textContent, states: document.querySelector('[data-level="us-state"] .level-best').textContent,
      canada: document.querySelector('[data-level="canada-provinces"] .level-best').textContent, pin: document.querySelector('[data-level="pin-world"] .level-best').textContent,
      figures: Array.from(document.querySelectorAll('.summary dd')).map(d => d.textContent), greeting: document.querySelector('.masthead h1').textContent, week: document.querySelector('.week-label') ? document.querySelector('.week-label').textContent : '',
      records: localStorage.getItem('atlas-records') }));
    eq(a.africa, 'Best49 / 54', 'Africa best from an old store');
    ok(/^Best50 \/ 50·1:48$/.test(a.states), 'States best: ' + a.states);
    ok(/^Best13 \/ 13/.test(a.canada), 'Canada best: ' + a.canada);
    eq(a.pin, 'Best1,712 pts', 'Pin World best');
    eq(a.figures.join('|'), '—|—|—', 'no mastery yet: figures are dashes, not zeros');
    ok(a.greeting !== 'Welcome.', 'a returning player is not greeted as new: ' + a.greeting);
    eq(a.week, '6 days running', 'daily streak shows on the unplayed card (D4)');
    eq(a.records, seed['atlas-records'], 'records store unchanged by looking at Home');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'views, hash and theme'() {
    const h = await open({});
    const page = h.page;
    const nav = mobile ? '#tabbar' : '#topnav-links';
    await press(page, nav + ' [data-view="stats"]');
    let s = await st(page);
    ok(s.active === 'stats-screen' && s.hash === '#stats' && s.view === 'stats', 'Stats view: ' + JSON.stringify(s));
    eq(await page.evaluate(n => document.querySelector(n + ' [data-view="stats"]').getAttribute('aria-current'), nav), 'page', 'nav marks the current view');
    await press(page, nav + ' [data-view="settings"]');
    s = await st(page);
    ok(s.active === 'settings-screen' && s.hash === '#settings', 'Settings view: ' + JSON.stringify(s));
    // Sync is a card in Settings; its steps open in the dialog
    ok(await page.locator('[data-action="sync-create"]').isVisible(), 'sync reachable in Settings');
    await press(page, '[data-action="sync-create"]');
    ok(await page.evaluate(() => !document.getElementById('dialog').hidden), 'the sync dialog opens from Settings');
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.getElementById('dialog').hidden), 'and Escape closes it');
    await page.evaluate(() => { location.hash = '#stats'; });
    await page.waitForFunction(() => document.querySelector('.screen.active').id === 'stats-screen');
    await page.evaluate(() => { location.hash = ''; });
    await page.waitForFunction(() => document.querySelector('.screen.active').id === 'menu-screen');
    await page.evaluate(() => { location.hash = '#nonsense'; });
    await page.waitForTimeout(200);
    eq((await st(page)).active, 'menu-screen', 'an unknown hash is Home');
    // theme
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await press(page, '#theme-toggle');
    let t = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, saved: localStorage.getItem('atlas-theme'), meta: document.querySelector('meta[name="theme-color"]').content, label: document.getElementById('theme-toggle').getAttribute('aria-label'), bg: getComputedStyle(document.body).backgroundColor }));
    ok(before === 'light' && t.theme === 'dark' && t.saved === 'dark' && t.meta === '#101824' && /Parchment/.test(t.label) && t.bg === 'rgb(16, 24, 36)', 'theme toggled to dark: ' + JSON.stringify(t));
    await page.reload();
    await page.waitForFunction(() => window.__atlas);
    eq(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'theme kept across a reload');
    await h.close();
    // direct load on a hash, and a play link wins over a hash
    const h2 = await launch(Object.assign({ seedStorage: {} }, mobile ? { mobile: true } : { width: 1280, height: 800 }));
    await h2.page.goto(h2.url + '#settings');
    await h2.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0);
    eq(await h2.page.evaluate(() => document.querySelector('.screen.active').id), 'settings-screen', 'loading on #settings shows Settings');
    await h2.page.goto(h2.url + '?play=oceania');
    await waitGame(h2.page);
    eq((await st(h2.page)).startArg, 'Oceania', 'a ?play= link still starts its level');
    eq(h2.errors.length, 0, 'page errors: ' + h2.errors.join(' | '));
    await h2.close();
  },

  async 'daily and review'() {
    const h = await open(seedOf('seed-rich-unplayed.json'));
    const page = h.page;
    const before = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    const due = await page.evaluate(() => Number(document.querySelector('.review-num').textContent));
    ok(due > 0, 'review card shows a due count: ' + due);
    await press(page, '.daily [data-action="play-daily"].btn');
    await waitGame(page);
    eq((await st(page)).mode, 'daily-five', 'the Daily Five starts from its card');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    await press(page, '[data-action="start-review"]');
    await waitGame(page);
    let s = await st(page);
    ok(s.practice && s.review !== null && s.total > 0, 'review round is a practice round: ' + JSON.stringify(s));
    const first = s.total, playlist = s.review;
    eq(await page.locator('#game-kind').textContent(), 'Review', 'the game bar says Review');
    let seen = first, rounds = 1;
    for (let guard = 0; guard < 12; guard++) {
      // skip through the round
      for (let i = 0; i < 120; i++) {
        if (await page.evaluate(() => document.body.dataset.screen === 'results')) break;
        await page.keyboard.press('s');
        await page.waitForTimeout(250);
      }
      await page.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 20000 });
      const next = await page.evaluate(() => { const b = document.getElementById('review-next-btn'); return b.hidden ? null : b.textContent; });
      s = await st(page);
      if (s.review === 0) { ok(next === null, 'no Next after the last round'); break; }
      ok(/^Next: \d+ /.test(next || ''), 'Next action names the coming round: ' + next);
      await page.locator('#review-next-btn').click();
      await waitGame(page);
      s = await st(page);
      ok(s.practice && s.total <= first, 'next round is practice and no larger than the first');
      seen += s.total; rounds++;
    }
    eq(seen, due, 'the playlist covered every due place (' + rounds + ' rounds)');
    eq(rounds, playlist + 1, 'one round per playlist step');
    const after = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    ok(before[0] === after[0] && before[1] === after[1], 'a review leaves records and focus lists alone');
    await page.locator('#home-btn').click();
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    eq((await st(page)).review, null, 'review state cleared on Home');
    // Every place was skipped, and a miss is due again the same day (mastery SPEC: "due = today")
    eq(await page.evaluate(() => Number((document.querySelector('.review-num') || {}).textContent)), due, 'places skipped in a review are still due afterwards');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'back button and lazy level data'() {
    const h = await open(seedOf('seed-rich.json'));
    const page = h.page;
    // A hash typed by hand makes a history entry; Back must return to the view before it
    await page.evaluate(() => { location.hash = 'stats'; });
    await page.waitForFunction(() => document.body.dataset.screen === 'stats');
    await page.evaluate(() => { location.hash = 'settings'; });
    await page.waitForFunction(() => document.body.dataset.screen === 'settings');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.screen === 'stats');
    eq((await st(page)).view, 'stats', 'Back returns to Stats');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    eq((await st(page)).view, 'home', 'Back again returns to Home');
    await page.goForward();
    await page.waitForFunction(() => document.body.dataset.screen === 'stats');
    ok(await page.evaluate(() => document.querySelector('#topnav-links a.is-on').dataset.view === 'stats'), 'the navigation follows the address');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    // Russia's rounds share a skill: their rings wait for the map, then fill in without a reload
    await page.waitForFunction(() => !!document.querySelector('[data-level="russia-west"] .ring b'), null, { timeout: 20000 });
    const rings = await page.evaluate(() => ['russia-west', 'russia-south', 'russia-east', 'china-provinces', 'india-states', 'canada-provinces'].map(k => {
      const card = document.querySelector('[data-level="' + k + '"]');
      return k + ':' + (card.querySelector('.ring b') ? card.querySelector('.ring b').textContent : '-');
    }));
    ok(/russia-west:\d+/.test(rings.join(' ')), 'province cards fill in once their map arrives: ' + rings.join(' '));
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  // What a level card says in its corners, and links that name no level
  async 'cards: ladder done, due pills; odd links'() {
    const h = await open({ 'atlas-learn': JSON.stringify({ oceania: { done: true, savedAt: Date.now() - 60000 } }) });
    const page = h.page;
    const card = key => page.evaluate(k => { const a = document.querySelector('[data-level="' + k + '"]');
      return { due: a.querySelector('.level-due').textContent, isDue: a.querySelector('.level-due').classList.contains('is-due'), best: (a.querySelector('.level-best') || {}).textContent || '', said: a.getAttribute('aria-label') }; }, key);
    let c = await card('oceania');
    ok(c.due === '' && c.best === 'Ladder complete' && /Ladder complete/.test(c.said) && !/New/.test(c.said), 'a level whose Learn ladder is finished is not called New: ' + JSON.stringify(c));
    c = await card('south-america');
    eq(c.due, 'New', 'a level never touched still is');
    // Something due in Pin the City (which Smart Review cannot bring back) and in a country skill (which it can)
    await page.evaluate(() => { const A = window.__atlas; A.mastery.record('city-pin', 'Paris', 'miss'); A.mastery.record('country', 'France', 'miss'); A.showView('stats'); A.showView('home'); });
    await page.waitForTimeout(200);
    const pinWorld = await card('pin-world'), pinEurope = await card('pin-europe'), europe = await card('europe');
    ok(!/due/.test(pinWorld.due) && !pinWorld.isDue && !/due/.test(pinEurope.due) && !/due/.test(pinEurope.said), 'Pin the City cards promise no review that Smart Review does not hold: ' + JSON.stringify([pinWorld, pinEurope]));
    ok(europe.due === '1 due' && europe.isDue && /1 due/.test(europe.said), 'a country level still shows what is due: ' + JSON.stringify(europe));
    const review = await page.evaluate(() => document.querySelector('.review').textContent);
    ok(/France/.test(review) && !/Paris/.test(review), 'and Smart Review offers the country, not the city: ' + review.slice(0, 120));
    // Links whose slug is a property every object has
    for (const slug of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'no-such-level']) {
      await page.goto(h.url + '?play=' + slug);
      await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.getElementById('library-collections'), null, { timeout: 20000 });
      await page.waitForTimeout(300);
      const said = await page.evaluate(() => ({ screen: document.body.dataset.screen, notice: Array.from(document.querySelectorAll('[role="status"], [role="alert"], .notice')).map(n => n.textContent.trim()).filter(Boolean).join(' | '), search: location.search }));
      ok(said.screen === 'menu' && /That link doesn’t lead to a level/.test(said.notice) && said.search === '', '?play=' + slug + ' is told it leads to no level: ' + JSON.stringify(said));
    }
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  // The browser's back button after moving about with the app's own controls
  async 'back button: views, sheet, round'() {
    const h = await open({});
    const page = h.page;
    const navTo = async view => { await press(page, (mobile ? '#tabbar' : '#topnav-links') + ' a[data-view="' + view + '"]'); await page.waitForFunction(v => window.__atlas.state.view === v, view); };
    const where = () => page.evaluate(() => ({ screen: document.body.dataset.screen, view: window.__atlas.state.view, sheet: !document.getElementById('level-sheet').hidden,
      here: location.href.indexOf(location.origin) === 0, search: location.search, hash: location.hash }));
    const back = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(400); return page.url().indexOf(h.url) === 0 ? where() : { left: page.url() }; };
    // Views
    await navTo('stats');
    await navTo('settings');
    let w = await back();
    ok(w.view === 'stats' && w.screen === 'stats' && w.hash === '#stats', 'Back after Home > Stats > Settings by the navigation shows Stats: ' + JSON.stringify(w));
    w = await back();
    ok(w.view === 'home' && w.screen === 'menu' && w.hash === '', 'Back again shows Home, still in the app: ' + JSON.stringify(w));
    // A level sheet
    await navTo('stats');
    await navTo('home');
    await press(page, '[data-level="oceania"]');
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    await page.waitForTimeout(150);
    w = await back();
    ok(w.screen === 'menu' && w.sheet === false && w.view === 'home', 'Back with a level sheet open closes the sheet and stays on Home: ' + JSON.stringify(w));
    // Closed with Escape, the sheet leaves nothing behind for Back to trip over
    await press(page, '[data-level="oceania"]');
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // A round started from the sheet
    await press(page, '[data-level="oceania"]');
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    await press(page, '#sheet-start-btn');
    await waitGame(page);
    await page.waitForTimeout(200);
    eq((await where()).search, '?play=oceania', 'the address names the round');
    w = await back();
    ok(w.screen === 'menu' && w.sheet === false && w.search === '', 'Back during a round leaves the round for Home: ' + JSON.stringify(w));
    await page.goForward({ waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(400);
    w = await where();
    ok(w.screen === 'menu' && w.search === '', 'Forward does not start the round again: ' + JSON.stringify(w));
    // A round left with the app's own button: its entry goes with it
    await press(page, '[data-level="oceania"]');
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    await press(page, '#sheet-start-btn');
    await waitGame(page);
    await press(page, '#back-btn');
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    await page.waitForTimeout(300);
    eq((await where()).search, '', 'the address is Home\'s again');
    w = await back();
    ok(w.view === 'stats' && w.screen === 'stats', 'one Back from Home then shows the view before it (Stats), not a spent round or sheet: ' + JSON.stringify(w));
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  // A round that ends in another tab: this tab's Home shows its best as well as its mastery
  async 'second tab'() {
    const h = await open({});
    const page = h.page;
    const other = await h.context.newPage();
    await other.goto(h.url);
    await other.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 20000 });
    // The stores a finished round writes, in its order: the learning history first, the records after
    await other.evaluate(async () => {
      const A = window.__atlas;
      A.levelByKey('oceania').names().forEach(n => A.mastery.record('country', n, 'first'));
      A.mastery.recordSession({ questions: 7, firstTry: 7, seconds: 30 });
      await new Promise(r => setTimeout(r, 60));
      const day = new Date().toISOString().slice(0, 10);
      localStorage.setItem('atlas-records', JSON.stringify({ 'world-country|Oceania|normal': { gamesPlayed: 1, bestScore: { value: 14, max: 14, date: day },
        bestTime: { value: 30, total: 7, date: day }, bestAccuracy: { correct: 7, total: 7, pct: 100, date: day }, lastPlayed: day } }));
    });
    await page.waitForTimeout(700);
    const card = await page.evaluate(() => { const a = document.querySelector('[data-level="oceania"]'); return { best: (a.querySelector('.level-best') || {}).textContent || '', ring: !!a.querySelector('.ring b'), said: a.getAttribute('aria-label') }; });
    ok(/Best\s*7 \/ 7/.test(card.best) && card.ring, 'the other tab\'s round shows on this tab\'s card, best and mastery both: ' + JSON.stringify(card));
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await other.close();
    await h.close();
  },

  // The Daily Five card at UTC midnight with Home left open, and what a played card's buttons act on
  async 'daily card rolls over'() {
    const attempt = (key, number, countries) => ({ dateKey: key, puzzleNumber: number, countries: countries, sequence: [2, 2, 1, 0, 2], score: 7, correct: 4, wrong: 1, total: 5,
      timeSeconds: 40, hardMode: false, difficulty: 'normal', completedAt: Date.parse(key + 'T12:00:00Z') });
    // Day 1 of the puzzle is 2026-04-26, so 1 December is No. 220
    const seed = { 'atlas-daily-attempts': JSON.stringify({ '2026-11-30': attempt('2026-11-30', 219, ['Chile', 'Kenya', 'Laos', 'Togo', 'Fiji']),
      '2026-12-01': attempt('2026-12-01', 220, ['Peru', 'Chad', 'Iran', 'Mali', 'Cuba']) }) };
    const h = await open(seed, '', { width: mobile ? 390 : 1280, height: mobile ? 844 : 800, before: async (hh) => {
      await hh.page.clock.install({ time: new Date('2026-12-01T23:59:30Z') });
      await hh.page.addInitScript(() => {
        window.__shared = [];
        try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
        try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__shared.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
      });
    } });
    const page = h.page;
    const card = () => page.evaluate(() => { const c = document.querySelector('#menu-screen .daily'); return { state: c.dataset.daily, no: (c.querySelector('.eyebrow b') || {}).textContent, date: c.dataset.date || null,
      lede: document.querySelector('.masthead .lede').textContent }; });
    let c = await card();
    ok(c.state === 'played' && c.no === 'No. 220' && /Daily Five is done/.test(c.lede), 'before midnight the card shows the day\'s finished puzzle: ' + JSON.stringify(c));
    // A played card's buttons act on the day the card is for, whatever today is: here a card made to stand for the day before
    const acted = await page.evaluate(async () => {
      const el = document.querySelector('#menu-screen .daily');
      el.dataset.date = '2026-11-30';
      el.querySelector('[data-action="share-daily"]').click();
      await Promise.resolve();
      el.querySelector('[data-action="replay-daily"]').click();
      return { shared: window.__shared.slice(), replay: window.__atlas.state.dailyReplay };
    });
    ok(acted.shared.length === 1 && /#219\b/.test(acted.shared[0]), 'Share on a played card shares that card\'s puzzle: ' + JSON.stringify(acted.shared));
    eq(acted.replay && acted.replay.dateKey, '2026-11-30', 'Practice Replay on a played card replays that card\'s puzzle');
    await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 20000 });
    await page.evaluate(() => window.__atlas.showView('home'));
    await page.waitForFunction(() => document.body.dataset.screen === 'menu');
    c = await card();
    ok(c.state === 'played' && c.no === 'No. 220', 'back on Home before midnight: still the finished puzzle: ' + JSON.stringify(c));
    // Midnight passes with Home open
    await page.clock.fastForward(40000);
    await page.waitForTimeout(300);
    c = await card();
    ok(c.state === 'unplayed' && c.no === 'No. 221', 'after UTC midnight the card is the new day\'s puzzle, still to play: ' + JSON.stringify(c));
    ok(/Daily Five is waiting/.test(c.lede), 'and the masthead no longer says today\'s puzzle is done: ' + c.lede);
    const count = await page.evaluate(() => document.querySelector('#menu-screen [data-countdown]').textContent);
    ok(/^23 h 59 m$/.test(count), 'its countdown runs to the next midnight: ' + count);
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'layout: tops reachable (D1, D2)'() {
    const h = await open({}, '', { width: 1280, height: 620 });
    const page = h.page;
    const a = await page.evaluate(() => { const v = document.getElementById('menu-screen'); const m = document.querySelector('.masthead-copy').getBoundingClientRect(); const b = document.querySelector('.brand').getBoundingClientRect(); return { top: v.scrollTop, mTop: m.top, bTop: b.top, scrollable: v.scrollHeight > v.clientHeight, x: document.documentElement.scrollWidth <= window.innerWidth }; });
    ok(a.top === 0 && a.bTop >= 0 && a.mTop > a.bTop && a.scrollable, 'Home starts at its top with the brand in view: ' + JSON.stringify(a));
    ok(a.x, 'no sideways overflow');
    await page.goto(h.url + '?play=oceania');
    await waitGame(page);
    // Seven skips, each followed by its reveal; keep pressing until the round is over
    for (let i = 0; i < 200; i++) { if (await page.evaluate(() => document.body.dataset.screen === 'results')) break; await page.keyboard.press('s'); await page.waitForTimeout(250); }
    await page.waitForFunction(() => document.body.dataset.screen === 'results');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const v = document.getElementById('results-screen'); return { taller: v.scrollHeight > v.clientHeight, top: v.scrollTop, kicker: document.querySelector('.results-bar').getBoundingClientRect().top }; });
    ok(r.taller && r.top === 0 && r.kicker >= 0, 'results taller than the window still shows its top: ' + JSON.stringify(r));
    await h.close();
  }
};

(async () => {
  for (const name of Object.keys(checks)) {
    if (only && name.indexOf(only) === -1) continue;
    const f0 = fails;
    try { await checks[name](); } catch (e) { fails++; console.log('  ERROR in ' + name + ': ' + (e.stack || e).split('\n').slice(0, 3).join(' ')); }
    console.log((fails === f0 ? 'PASS  ' : 'FAIL  ') + name);
  }
  console.log(passes + ' assertions passed, ' + fails + ' failed' + (mobile ? ' (mobile)' : ''));
  process.exit(fails ? 1 : 0);
})();
