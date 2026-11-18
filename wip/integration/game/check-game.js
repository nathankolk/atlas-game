// Interaction checks for the game screen chrome and the results screen.
//   NODE_PATH=/opt/node-tools/node_modules node check-game.js [--mobile] [--only=name,name]
// Groups: hud, capitals, pin, learn, results, daily, review, keys
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const args = process.argv.slice(2);
const MOBILE = args.includes('--mobile');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : null;
const r = lib.reporter('game chrome and results' + (MOBILE ? ' (phone)' : ' (desktop)'));
const SEED = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-rich.json'), 'utf8'));
const SEED_UNPLAYED = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-rich-unplayed.json'), 'utf8'));

function speedScript() {
  window.__speed = 25;
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    return st.apply(window, [fn, ms > 50 ? ms / window.__speed : ms].concat(rest));
  };
}

async function open(seed) {
  const size = MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 };
  const h = await lib.launchApp(Object.assign({
    seedStorage: Object.assign({ 'atlas-theme': 'light' }, seed || {}), noPaint: false,
    beforeLoad: async hh => {
      await hh.context.addInitScript(speedScript);
      await hh.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      // No share sheet: the copy path is the one that can be checked
      await hh.context.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} });
    }
  }, size));
  await lib.installPinCities(h.page);
  return h;
}

const start = async (page, key, opts) => {
  const arg = key === 'daily' ? 'daily-five' : await page.evaluate(k => window.__atlas.levelByKey(k).arg, key);
  return lib.startLevel(page, arg, opts || null);
};
const text = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
// Shown: laid out, not hidden by an ancestor, and with some size
const shown = (page, sel) => page.evaluate(s => {
  const e = document.querySelector(s);
  if (!e) return false;
  const b = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
}, sel);
const rect = (page, sel) => page.evaluate(s => {
  const b = document.querySelector(s).getBoundingClientRect();
  return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
}, sel);
const waitResults = page => page.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 30000 });
const visibleActions = page => page.evaluate(() => ['review-next-btn', 'practice-btn', 'full-btn', 'replay-btn', 'daily-practice-btn', 'view-map-btn', 'share-btn']
  .filter(id => { const e = document.getElementById(id); return e && !e.hidden; })
  .map(id => id.replace('-btn', '') + ':' + document.getElementById(id).textContent.trim().replace(/\s+/g, ' ')));

const groups = {};

groups.hud = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'africa');
  r.eq('hud: no title= attribute anywhere', await page.evaluate(() => document.querySelectorAll('[title]').length), 0);
  r.eq('hud: the stage fills the game screen', await rect(page, '#map-wrap'), await rect(page, '#game-screen'));
  // The globe's host covers the stage and may reach past its top or bottom edge (its middle is the clear area's)
  r.check('hud: the map covers the stage', await page.evaluate(() => {
    const m = window.__t.mapEl().getBoundingClientRect(), s = document.getElementById('map-wrap').getBoundingClientRect();
    return m.left <= s.left && m.right >= s.right && m.top <= s.top && m.bottom >= s.bottom;
  }));
  r.eq('hud: title and tags', [await text(page, '#region-tag'), await text(page, '#game-diff'), await page.evaluate(() => document.getElementById('game-kind').hidden)], ['Africa', 'Normal', true]);
  r.eq('hud: prompt label', await text(page, '#prompt-label'), 'Find on the map');
  r.eq('hud: counter at the first question', [await text(page, '#game-count'), await text(page, '#game-of')], ['1', 'of 54']);
  r.eq('hud: icon buttons are named', await page.evaluate(() => ['back-btn', 'zoom-in-btn', 'zoom-out-btn', 'zoom-reset-btn', 'map-style-btn']
    .map(id => document.getElementById(id).getAttribute('aria-label'))), ['Leave this round', 'Zoom in', 'Zoom out', 'Reset view', 'Satellite map']);
  r.eq('hud: nothing over the map blurs what is behind it', await page.evaluate(() =>
    Array.from(document.querySelectorAll('#game-screen *')).filter(e => {
      const cs = getComputedStyle(e);
      return (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    }).length), 0);
  const mapRect = () => page.evaluate(() => { const b = window.__t.mapEl().getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
  const map0 = await mapRect();
  const card0 = await rect(page, '#prompt');

  // A wrong tap: second-try marker, toast with an icon, shake
  await page.evaluate(() => { window.__speed = 1; });
  await page.evaluate(() => window.__t.attempt(false));
  r.eq('hud: second-try marker after a wrong tap', await page.evaluate(() => !document.getElementById('prompt-try').hidden), true);
  r.check('hud: toast shows with an icon and the name tapped', await page.evaluate(() => {
    const t = document.getElementById('toast');
    return t.classList.contains('show') && t.classList.contains('wrong') && !!t.querySelector('.toast-icon svg') && /^Not quite — that’s \S/.test(t.textContent.trim());
  }), await text(page, '#toast'));
  await page.evaluate(() => { window.__speed = 25; });
  await page.evaluate(() => window.__t.attempt(true));
  await page.waitForFunction(() => window.__atlas.state.sequence.length === 1 && !window.__atlas.state.interactionLocked, null, { timeout: 8000 });
  r.eq('hud: the marker is gone on the next question', await page.evaluate(() => document.getElementById('prompt-try').hidden), true);
  r.eq('hud: a second-try find keeps its own mark on the map', await page.evaluate(() =>
    [window.__t.marks().second, window.__t.marks().found]), [1, 0]);
  await lib.answer(page, 'first');
  await lib.answer(page, 'miss');
  await lib.answer(page, 'skip');
  r.eq('hud: tally', [await text(page, '#legend-found'), await text(page, '#legend-second'), await text(page, '#legend-missed')], ['1', '1', '2']);
  r.eq('hud: counter and score after four answers', [await text(page, '#game-count'), await text(page, '#stat-score')], ['5', '3']);
  await page.waitForTimeout(450);   // the line eases to its new length
  r.check('hud: progress line is 4/54 of the bar', await page.evaluate(() => {
    const t = document.getElementById('game-track');
    const share = t.firstElementChild.getBoundingClientRect().width / t.getBoundingClientRect().width;
    return Math.abs(share - 4 / 54) < 0.01 && t.getAttribute('aria-valuenow') === '4' && t.getAttribute('aria-valuemax') === '54';
  }));
  r.eq('hud: the map kept its size through the questions (B2)', await mapRect(), map0);
  r.eq('hud: the prompt card kept its height (a long name may widen it)', (await rect(page, '#prompt'))[3], card0[3]);

  // The clock runs while the round is in play
  await page.evaluate(() => { window.__atlas.state.startTime = Date.now() - 65000; });
  await page.waitForFunction(() => /^1:0\d$/.test(document.getElementById('stat-time').textContent), null, { timeout: 3000 }).catch(() => {});
  r.check('hud: the clock shows the time since the round began', /^1:0\d$/.test(await text(page, '#stat-time')), await text(page, '#stat-time'));

  if (MOBILE) {
    r.eq('hud (phone): every control is at least 44px', await page.evaluate(() =>
      Array.from(document.querySelectorAll('#game-screen button')).filter(b => {
        const q = b.getBoundingClientRect();
        return q.width > 0 && getComputedStyle(b).visibility !== 'hidden' && (q.width < 44 || q.height < 44);
      }).map(b => b.id || b.className)), []);
    const card = await rect(page, '#prompt'), skip = await rect(page, '#skip-btn'), ctl = await rect(page, '#game-screen .mapctl');
    r.check('hud (phone): prompt at the top, Skip bottom centre, controls lower right above it',
      card[1] < 100 && skip[1] > 700 && Math.abs(skip[0] + skip[2] / 2 - 195) < 3 && ctl[0] > 300 && ctl[1] + ctl[3] <= skip[1], [card, skip, ctl]);
    r.eq('hud (phone): one line says where the round stands', await text(page, '#game-sub'), '5 of 54');
  } else {
    r.check('hud: Skip carries its key', (await text(page, '#skip-btn')).replace(/\s+/g, ' ') === 'Skip S');
  }

  // Leaving stops the clock and returns Home
  await page.click('#back-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'menu');
  r.eq('hud: the back control leaves the round; the clock stops', await page.evaluate(() => window.__atlas.state.clock), null);
  await page.waitForTimeout(450);
  r.eq('hud: a hidden game screen is out of reach', await page.evaluate(() => getComputedStyle(document.getElementById('game-screen')).visibility), 'hidden');
  await h.close();
};

groups.capitals = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'us-state-to-capital');
  r.eq('capitals: prompt label and four choices', [await text(page, '#prompt-label'), await page.evaluate(() => document.querySelectorAll('#choices-panel .choice-btn').length)], ['Which capital belongs to', 4]);
  const mapRect = () => page.evaluate(() => { const b = window.__t.mapEl().getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
  const map0 = await mapRect(), card0 = await rect(page, '#prompt');
  // The state being asked about takes the answer's mark at once, over its own tint (B5): on the
  // globe a feature shows its mark before its prompt tint, and the flash eases into that mark
  await page.evaluate(() => { window.__speed = 1; });
  const before = await page.evaluate(() => { const m = window.__atlas.map; return [m.promptKey === window.__t.keyFor(window.__atlas.state.current), m.marks.get(m.promptKey) || null, m.outlines.filter(o => o.kind === 'prompt').length]; });
  await page.evaluate(() => window.__t.attempt(true));
  const during = await page.evaluate(() => { const m = window.__atlas.map; return [m.promptKey === window.__t.keyFor(window.__atlas.state.current), m.marks.get(m.promptKey) || null]; });
  r.eq('capitals: the prompted state is tinted and outlined', before, [true, null, 1]);
  r.eq('capitals: a right answer shows on the prompted state at once (B5)', during, [true, 'found']);
  await page.evaluate(() => { window.__speed = 25; });
  await page.waitForFunction(() => window.__atlas.state.sequence.length === 1 && !window.__atlas.state.interactionLocked, null, { timeout: 8000 });
  await lib.answer(page, 'second');
  await lib.answer(page, 'miss');
  r.eq('capitals: the map kept its size (B2)', await mapRect(), map0);
  r.eq('capitals: the card kept its size', (await rect(page, '#prompt')).slice(2), card0.slice(2));
  r.eq('capitals: marks by outcome', await page.evaluate(() => { const m = window.__t.marks(); return [m.found, m.second, m.missed]; }), [1, 1, 1]);

  await start(page, 'us-capital-to-state');
  r.eq('capitals → states: prompt label, no choices', [await text(page, '#prompt-label'), await page.evaluate(() => document.getElementById('choices-panel').hidden)], ['Which state’s capital is', true]);
  await start(page, 'northeast-cities');
  r.eq('cities: prompt label', await text(page, '#prompt-label'), 'Find the city');
  r.check('cities: the prompt names the state too', /, [A-Z]/.test(await text(page, '#prompt-country')), await text(page, '#prompt-country'));
  await lib.answer(page, 'second');
  r.eq('cities: a second-try dot keeps its own mark', await page.evaluate(() => Array.from(window.__atlas.map.dotMarks.values())), ['second']);
  await h.close();
};

groups.pin = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'pin-europe');
  r.eq('pin: prompt label, Drop pin waiting for a spot', [await text(page, '#prompt-label'), (await text(page, '#pin-btn')).trim(), await page.evaluate(() => document.getElementById('pin-btn').disabled)], ['Pin the city', 'Drop pin', true]);
  r.eq('pin: the extra figure is the average miss; no tally', [await text(page, '#stat-extra-label'), await shown(page, '#game-legend')], ['Avg km', false]);
  const map0 = await rect(page, '#globe-host'), card0 = await rect(page, '#prompt');
  const note0 = await text(page, '#prompt-note');
  r.check('pin: the card names the country', !!note0 && !/km/.test(note0), note0);
  const city = await page.evaluate(() => window.__pinCities[window.__atlas.state.current]);
  await page.evaluate(([lon, lat]) => window.__t.pinTap(lon, lat), [city.lon + 2, city.lat - 1.5]);
  r.eq('pin: a spot enables Drop pin', await page.evaluate(() => document.getElementById('pin-btn').disabled), false);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__atlas.state.pin.phase === 'reveal', null, { timeout: 8000 });
  const note1 = await text(page, '#prompt-note');
  r.check('pin: the card keeps the distance and the points', /\d km off · \+\d+ points?$/.test(note1), note1);
  r.eq('pin: the button turns to Next', (await text(page, '#pin-btn')).trim(), 'Next');
  r.eq('pin: the map kept its size (B2)', await rect(page, '#globe-host'), map0);
  r.eq('pin: the card kept its height (a long line may widen it)', (await rect(page, '#prompt'))[3], card0[3]);
  r.eq('pin: counter stays on the pin just dropped', await text(page, '#game-count'), '1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__atlas.state.pin.phase === 'aim', null, { timeout: 8000 });
  r.eq('pin: counter moves on with the next city', await text(page, '#game-count'), '2');
  if (MOBILE) {
    r.eq('pin (phone): Skip and Drop pin share the bottom row', await page.evaluate(() => {
      const a = document.getElementById('skip-btn').getBoundingClientRect(), b = document.getElementById('pin-btn').getBoundingClientRect();
      return Math.abs(a.top - b.top) < 2 && a.right <= b.left;
    }), true);
  }
  // To the results
  await lib.playRound(page, i => ['first', 'second', 'miss', 'skip'][i % 4]);
  await page.waitForTimeout(300);
  r.check('pin results: label, ring in points, bands', await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.outcomes dt')).map(e => e.textContent.trim());
    return /^Pin the City · Europe/.test(document.getElementById('results-region').textContent) &&
      /of 2,000 points/.test(document.querySelector('.score-ring-label').textContent) &&
      cells.join('|') === '80+ points|40 to 79|Under 40|Time';
  }), await text(page, '.outcomes'));
  r.eq('pin results: actions', await visibleActions(page), ['replay:Play again', 'share:Share']);
  r.check('pin results: farthest off, with distances', await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.revisit li small')).map(e => e.textContent);
    return document.querySelector('.revisit-head h2').textContent === 'Farthest off' && rows.length > 0 && rows.every(t => /km off · \+\d+|Skipped/.test(t));
  }));
  r.check('pin results: progress panel', /Your progress/i.test(await text(page, '.results-bests')) && /Best round/i.test(await text(page, '.results-bests')));
  await h.close();
};

groups.learn = async () => {
  const h = await open();
  const page = h.page;
  await start(page, 'canada-provinces', { learn: true, learnFresh: true });
  r.eq('learn: study label and tags', [await text(page, '#prompt-label'), await text(page, '#game-kind'), await text(page, '#stat-score-label'), await text(page, '#stat-extra-label')],
    ['Level 1 of 13 · study it', 'Learn', 'Found', 'Restarts']);
  r.eq('learn: study shows Quiz me, not Skip; no tally', [await shown(page, '#learn-ready-btn'), await shown(page, '#skip-btn'), await shown(page, '#game-legend')], [true, false, false]);
  r.eq('learn: counter counts levels', [await text(page, '#game-count'), await text(page, '#game-of')], ['1', 'of 13 levels']);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__atlas.state.learn.phase === 'quiz' && window.__atlas.state.current, null, { timeout: 8000 });
  r.eq('learn: quiz label, Skip back', [await text(page, '#prompt-label'), await shown(page, '#skip-btn'), await shown(page, '#learn-ready-btn')], ['Level 1 of 13 · find', true, false]);
  await lib.answer(page, 'first');
  await page.waitForFunction(() => window.__atlas.state.learn && window.__atlas.state.learn.level === 2 && window.__atlas.state.learn.phase === 'study', null, { timeout: 8000 });
  r.eq('learn: level 2 study', await text(page, '#prompt-label'), 'Level 2 of 13 · study all 2');
  // The "zoom in" pill stays for as long as it is shown (D8)
  await page.evaluate(() => { document.getElementById('learn-hint').hidden = false; });
  r.eq('learn: the zoom-in pill does not fade by itself (D8)', await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('learn-hint'));
    return [cs.animationName, cs.opacity];
  }), ['none', '1']);
  await page.evaluate(() => { document.getElementById('learn-hint').hidden = true; });
  // Finish the ladder
  for (let i = 0; i < 400; i++) {
    const s = await lib.snap(page);
    if (s.screen !== 'game-screen') break;
    if (s.learnPhase === 'study') {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => { const l = window.__atlas.state.learn; return !l || (l.phase === 'quiz' && window.__atlas.state.current); }, null, { timeout: 8000 });
    } else {
      await lib.answer(page, 'first');
    }
  }
  await waitResults(page);
  r.eq('learn results: label and ring', [await text(page, '#results-region'), (await text(page, '.score-ring-label')).replace(/\s+/g, ' ')], ['Provinces of Canada · Learn', '13learned']);
  r.eq('learn results: actions', await visibleActions(page), ['full:Full round', 'replay:Learn again']);
  r.eq('learn results: no gain, bests or revisit list; a note instead', await page.evaluate(() =>
    [!!document.querySelector('.gain'), !!document.querySelector('.results-bests'), !!document.querySelector('.revisit'), !!document.querySelector('.results-note')]), [false, false, false, true]);
  r.eq('learn results: three figures', await page.evaluate(() => Array.from(document.querySelectorAll('.outcomes dt')).map(e => e.textContent.trim())), ['Levels', 'Restarts', 'Time']);
  await page.click('#full-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current && !window.__atlas.state.learn, null, { timeout: 15000 });
  r.eq('learn results: "Full round" starts the level proper', [await text(page, '#prompt-label'), await page.evaluate(() => document.getElementById('game-kind').hidden), await text(page, '#game-of')], ['Find on the map', true, 'of 13']);
  await h.close();
};

groups.results = async () => {
  const h = await open();
  const page = h.page;
  // First round: one second try, one miss, one skip
  await start(page, 'oceania');
  await page.evaluate(() => { window.__atlas.state.startTime = Date.now() - 90000; });
  const playedFrom = Date.now();
  await lib.playRound(page, i => ['second', 'miss', 'skip', 'first'][Math.min(i, 3)]);
  const playedFor = (Date.now() - playedFrom) / 1000;     // how long the round took on this machine
  await page.waitForTimeout(200);
  r.eq('results: label', (await text(page, '#results-region')), 'Oceania');
  r.eq('results: ring', (await text(page, '.score-ring-label')).replace(/\s+/g, ' '), '5of 7 found');
  r.eq('results: three arcs', await page.evaluate(() => ['sr-good', 'sr-second', 'sr-bad'].map(c => document.querySelectorAll('.score-ring .' + c).length)), [1, 1, 1]);
  const took = await page.evaluate(() => document.querySelector('.outcomes > div:last-child dd').textContent.trim());
  const tookSeconds = Number(took.split(':')[0]) * 60 + Number(took.split(':')[1]);
  r.check('results: the time is the round\'s (90 s were put on the clock)', tookSeconds >= 90 + playedFor - 3 && tookSeconds <= 90 + playedFor + 1, [took, playedFor]);
  r.eq('results: figures', await page.evaluate(() => Array.from(document.querySelectorAll('.outcomes > div')).map(d => d.querySelector('dd').textContent.trim() + ' ' + d.querySelector('dt').textContent.trim())),
    ['4 First try', '1 Second try', '2 Missed', took + ' Time']);
  r.check('results: line gives points and accuracy', (await text(page, '.results-line')) === '9 of 14 points · 71% accuracy', await text(page, '.results-line'));
  r.eq('results: no record badge on a first play', await page.evaluate(() => !!document.querySelector('.badge-record')), false);
  r.check('results: mastery gain with the level\'s bar', await page.evaluate(() => {
    const g = document.querySelector('.gain');
    return !!g && /^[+−±]\d+$/.test(g.querySelector('.gain-num').textContent) && / in Oceania$/.test(g.querySelector('strong').textContent) && !!g.querySelector('.mbar') && /of 7/.test(g.querySelector('.gain-text span').textContent);
  }), await text(page, '.gain'));
  r.eq('results: revisit list, misses first, each with what happened', await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.revisit li'));
    return [document.querySelector('.revisit-head h2').textContent, rows.length, rows.map(li => li.querySelector('.revisit-mark').classList.contains('is-second') ? 2 : 0).join(''),
      rows.every(li => li.querySelector('small').textContent.length > 0 && li.querySelector('.level-pill').textContent.length > 0)];
  }), ['Countries to revisit', 3, '002', true]);
  r.check('results: stories', await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.revisit li small')).map(e => e.textContent);
    return (/^You chose .+ twice$|^You chose .+, then .+$/.test(t[0])) && t[1] === 'Skipped' && /^Second try, after /.test(t[2]);
  }), await page.evaluate(() => Array.from(document.querySelectorAll('.revisit li small')).map(e => e.textContent)));
  r.eq('results: actions', await visibleActions(page), ['practice:Practice these 3', 'replay:Play again', 'view-map:View on the map', 'share:Share']);
  r.eq('results: the first action is the suggested one', await page.evaluate(() =>
    [document.getElementById('practice-btn').classList.contains('btn--primary'), document.getElementById('replay-btn').classList.contains('btn--secondary')]), [true, true]);
  r.check('results: the top of the page is on screen (D2)', await page.evaluate(() => {
    const s = document.getElementById('results-screen');
    return s.scrollTop === 0 && document.querySelector('.results-bar').getBoundingClientRect().top >= 0 && document.getElementById('home-btn').getBoundingClientRect().top >= 0;
  }));
  r.eq('results: the clock stopped at the round\'s time', [await page.evaluate(() => window.__atlas.state.clock), await text(page, '#stat-time')], [null, took]);
  if (MOBILE) {
    r.check('results (phone): the actions stay in reach at the bottom', await page.evaluate(() => {
      const a = document.querySelector('.results-actions').getBoundingClientRect();
      return getComputedStyle(document.querySelector('.results-actions')).position === 'fixed' && Math.abs(a.bottom - innerHeight) < 1;
    }));
    r.eq('results (phone): no sideways scroll', await page.evaluate(() => document.getElementById('results-screen').scrollWidth <= innerWidth), true);
  }

  // Share: copied, and the button says so, then reads as before
  await page.evaluate(() => { window.__speed = 1; });
  await page.click('#share-btn');
  await page.waitForFunction(() => document.getElementById('share-btn').classList.contains('copied'), null, { timeout: 4000 }).catch(() => {});
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  r.check('results: Share copies the round\'s text', !!clip && /^🧭 Cartographer.s Atlas · /.test(clip) && clip.indexOf('Oceania · 9/14 pts · 5/7 found · ' + took) !== -1 && /\?play=oceania$/.test(clip), clip);
  r.eq('results: the button says Copied and keeps its icon', await page.evaluate(() => {
    const b = document.getElementById('share-btn');
    return [b.querySelector('span').textContent, !!b.querySelector('svg')];
  }), ['Copied', true]);
  await page.waitForFunction(() => !document.getElementById('share-btn').classList.contains('copied'), null, { timeout: 5000 });
  r.eq('results: then it reads Share again', await page.evaluate(() => document.getElementById('share-btn').textContent.trim()), 'Share');
  await page.evaluate(() => { window.__speed = 25; });

  // View on the map: the round's marks, nothing to answer, and back
  await page.evaluate(() => document.querySelector('.revisit-head [data-action="view-map"]').click());
  await page.waitForFunction(() => document.body.dataset.screen === 'game');
  r.eq('review: marks stay; prompt, actions and back are away; Results is the way back', [
    await page.evaluate(() => { const m = window.__t.marks(); return [m.found, m.second, m.missed]; }),
    await shown(page, '#prompt'), await shown(page, '#skip-btn'), await shown(page, '#back-btn'), await shown(page, '#review-back-btn'), await shown(page, '#game-legend')],
    [[4, 1, 2], false, false, false, true, true]);
  const before = await page.evaluate(() => JSON.stringify([window.__atlas.state.score, window.__atlas.state.sequence, window.__atlas.mastery.totals()]));
  await page.evaluate(() => {
    const T = window.__t, A = window.__atlas;
    // A tap on a place not yet answered, and one on a missed place
    const open = Array.from(A.map.eligible).find(k => !A.map.marks.has(k));
    const missed = Array.from(A.map.marks.entries()).find(m => m[1] === 'missed');
    if (open) T.tapKey(open);
    T.tapKey(missed[0]);
  });
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  r.eq('review: taps and Skip change nothing', await page.evaluate(() => JSON.stringify([window.__atlas.state.score, window.__atlas.state.sequence, window.__atlas.mastery.totals()])), before);
  r.eq('review: still on the map', await page.evaluate(() => document.body.dataset.screen), 'game');
  await page.click('#review-back-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'results');
  r.eq('review: back on the results, as they were', (await text(page, '.score-ring-label')).replace(/\s+/g, ' '), '5of 7 found');

  // Practice these: a practice round of the three
  await page.click('#practice-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current && !window.__atlas.state.interactionLocked, null, { timeout: 15000 });
  r.eq('practice: tag and counter', [await text(page, '#game-kind'), await text(page, '#game-of')], ['Practice', 'of 3']);
  r.eq('practice: the last round left no mode class behind', await page.evaluate(() => document.getElementById('game-screen').className), 'screen active');
  await lib.playRound(page, () => 'first');
  await page.waitForTimeout(200);
  r.eq('practice results: label, actions', [await text(page, '#results-region'), await visibleActions(page)], ['Oceania · Practice', ['replay:Full round', 'view-map:View on the map']]);
  r.eq('practice results: no bests, a gain', await page.evaluate(() => [!!document.querySelector('.results-bests'), !!document.querySelector('.gain')]), [false, true]);

  // A second full round, flawless: a record badge and marked bests
  await page.click('#replay-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current && !window.__atlas.state.practice, null, { timeout: 15000 });
  await lib.playRound(page, () => 'first');
  await page.waitForTimeout(200);
  r.check('record: badge and title', await page.evaluate(() => {
    const b = document.querySelector('.badge-record');
    return !!b && /^(Three new records|Two new records|New (score|time|accuracy) record)$/.test(b.textContent.trim()) && document.querySelector('.results-title').textContent === 'Flawless';
  }), await text(page, '.results-summary'));
  r.check('record: the bests that fell are marked, in words too', await page.evaluate(() => {
    const marked = Array.from(document.querySelectorAll('.results-bests dd.is-record'));
    return marked.length >= 1 && marked.every(d => !!d.querySelector('svg') && / new record$/.test(d.textContent));
  }));
  r.eq('record: a single arc; nothing to revisit; Play again leads', await page.evaluate(() =>
    [document.querySelectorAll('.score-ring circle:not(.sr-track)').length, !!document.querySelector('.revisit'), document.getElementById('replay-btn').classList.contains('btn--primary')]), [1, false, true]);
  r.eq('record: actions', await visibleActions(page), ['replay:Play again', 'view-map:View on the map', 'share:Share']);

  // Hard: marks don't stay, so there is no map to look back at
  await page.evaluate(() => { localStorage.setItem('atlas-difficulty', 'hard'); });
  await page.reload();
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0);
  await page.evaluate(lib.pageHelpers);
  await start(page, 'oceania');
  r.eq('hard: tag', await text(page, '#game-diff'), 'Hard');
  await lib.playRound(page, i => i === 0 ? 'miss' : 'first');
  await page.waitForTimeout(200);
  r.eq('hard results: label and actions', [await text(page, '#results-region'), await visibleActions(page)], ['Oceania · Hard', ['practice:Practice this one', 'replay:Play again', 'share:Share']]);
  r.eq('hard results: no "View on the map" in the list either', await page.evaluate(() => !!document.querySelector('.revisit-head [data-action="view-map"]')), false);
  await h.close();
};

groups.daily = async () => {
  const h = await open(SEED_UNPLAYED);
  const page = h.page;
  await start(page, 'daily');
  r.check('daily: title', /^Daily #\d+$/.test(await text(page, '#region-tag')), await text(page, '#region-tag'));
  await lib.playRound(page, i => ['first', 'second', 'miss', 'first', 'first'][i]);
  await page.waitForTimeout(300);
  r.check('daily results: label', /^Daily #\d+$/.test(await text(page, '#results-region')), await text(page, '#results-region'));
  r.eq('daily results: five marks in the order answered', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.daily-recap .mark')).map(m => m.className.replace('mark mark--', ''))), ['first', 'second', 'missed', 'first', 'first']);
  r.check('daily results: countdown to the next puzzle runs', /^\d\d:\d\d:\d\d$/.test(await text(page, '.daily-recap [data-countdown]')), await text(page, '.daily-recap [data-countdown]'));
  r.eq('daily results: actions', await visibleActions(page), ['daily-practice:Practice replay', 'view-map:View on the map', 'share:Share']);
  r.eq('daily results: sharing is the step to take', await page.evaluate(() =>
    [document.querySelector('.daily-recap [data-action="share-results"]').classList.contains('btn--primary'), document.getElementById('daily-practice-btn').classList.contains('btn--secondary')]), [true, true]);
  await page.evaluate(() => { window.__speed = 1; });
  await page.evaluate(() => document.querySelector('.daily-recap [data-action="share-results"]').click());
  await page.waitForFunction(() => document.querySelector('.daily-recap .btn').classList.contains('copied'), null, { timeout: 4000 }).catch(() => {});
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  r.check('daily results: share text is the spoiler-free grid', !!clip && /^🧭 Atlas Daily #\d+\n4\/5 found · 7\/10 pts\n\n🟩🟨🟥🟩🟩\n\n.*\?play=daily$/.test(clip), clip);
  await page.evaluate(() => { window.__speed = 25; });
  // Practice replay
  await page.click('#daily-practice-btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current && window.__atlas.state.dailyReplay, null, { timeout: 15000 });
  r.eq('daily replay: tag', await text(page, '#game-kind'), 'Practice');
  await lib.playRound(page, () => 'first');
  await page.waitForTimeout(300);
  r.check('daily replay results: label, no share anywhere', /^Daily #\d+ \(Practice\)$/.test(await text(page, '#results-region')) &&
    await page.evaluate(() => document.getElementById('share-btn').hidden && !document.querySelector('.daily-recap [data-action="share-results"]')), await text(page, '#results-region'));
  r.eq('daily replay results: actions', await visibleActions(page), ['daily-practice:Practice replay', 'view-map:View on the map']);
  await h.close();
};

groups.review = async () => {
  const h = await open(SEED);
  const page = h.page;
  const due = await page.evaluate(() => document.querySelector('[data-action="start-review"]') ? 1 : 0);
  if (!due) { r.check('review: the seed has something due', false); await h.close(); return; }
  await page.evaluate(() => document.querySelector('[data-action="start-review"]').click());
  await page.waitForFunction(() => document.body.dataset.screen === 'game' && (window.__atlas.state.current), null, { timeout: 30000 });
  await page.evaluate(lib.pageHelpers);
  const steps = await page.evaluate(() => window.__atlas.state.review.queue.length);
  r.eq('review: tag', await text(page, '#game-kind'), 'Review');
  await lib.playRound(page, () => 'first');
  await page.waitForTimeout(300);
  if (steps > 0) {
    r.check('review results: "Next: …" leads while rounds are left', await page.evaluate(() => {
      const b = document.getElementById('review-next-btn');
      return !b.hidden && /^Next: \d+ \S/.test(b.textContent) && b.classList.contains('btn--primary');
    }), await text(page, '#review-next-btn'));
    await page.click('#review-next-btn');
    await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current && !window.__atlas.state.interactionLocked, null, { timeout: 30000 });
    r.eq('review: the next round is a review too', [await text(page, '#game-kind'), await page.evaluate(() => window.__atlas.state.review.queue.length)], ['Review', steps - 1]);
  } else {
    r.eq('review results: no Next when the playlist is done', await page.evaluate(() => document.getElementById('review-next-btn').hidden), true);
  }
  await h.close();
};

groups.keys = async () => {
  const h = await open({ 'atlas-difficulty': 'uncharted' });
  const page = h.page;
  await start(page, 'south-america');
  await page.waitForTimeout(400);
  r.eq('uncharted: tag, imagery on, borders off, no style switch', [await text(page, '#game-diff'),
    await page.evaluate(() => document.getElementById('map-wrap').className), await shown(page, '#map-style-btn')], ['Uncharted', 'stage sat-on no-borders', false]);
  r.check('uncharted: the imagery credit shows', await shown(page, '#sat-credit') && /Esri/.test(await text(page, '#sat-credit')));
  await page.keyboard.press('m');
  r.eq('uncharted: M does not leave the imagery', await page.evaluate(() => document.getElementById('map-wrap').classList.contains('sat-on')), true);
  await page.evaluate(() => { localStorage.setItem('atlas-difficulty', 'normal'); });
  await page.reload();
  await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0);
  await page.evaluate(lib.pageHelpers);
  await start(page, 'south-america');
  r.eq('keys: chart to start with, no credit', [await page.evaluate(() => document.getElementById('map-wrap').className), await shown(page, '#sat-credit')], ['stage', false]);
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  r.eq('keys: M turns the imagery on; the button says so', await page.evaluate(() =>
    [document.getElementById('map-wrap').classList.contains('sat-on'), document.getElementById('map-style-btn').getAttribute('aria-pressed'), document.getElementById('map-style-btn').classList.contains('is-active')]), [true, 'true', true]);
  r.check('keys: the credit shows with the imagery', await shown(page, '#sat-credit'));
  await page.keyboard.press('m');
  const k0 = await page.evaluate(() => window.__t.zoom());
  // The view eases to its new zoom; software rendering here draws that out, so wait for it to arrive
  await page.keyboard.press('+');
  await page.waitForFunction(k => window.__t.zoom() > k * 1.55, k0, { timeout: 8000 }).catch(() => {});
  const k1 = await page.evaluate(() => window.__t.zoom());
  await page.keyboard.press('0');
  await page.waitForFunction(() => Math.abs(window.__t.zoom() - 1) < 0.001, null, { timeout: 8000 }).catch(() => {});
  const k2 = await page.evaluate(() => window.__t.zoom());
  r.check('keys: + zooms in, 0 resets', k1 > k0 && Math.abs(k2 - 1) < 0.001, [k0, k1, k2]);
  const n = await page.evaluate(() => window.__atlas.state.sequence.length);
  await page.keyboard.press('s');
  await page.waitForFunction(c => window.__atlas.state.sequence.length === c + 1, n, { timeout: 4000 });
  r.eq('keys: S skips (a miss)', await page.evaluate(() => window.__atlas.state.sequence.slice(-1)[0]), 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.body.dataset.screen === 'menu', null, { timeout: 4000 });
  r.eq('keys: Escape leaves the round', await page.evaluate(() => document.body.dataset.screen), 'menu');
  await h.close();
};

(async () => {
  for (const name of Object.keys(groups)) {
    if (ONLY && !ONLY.includes(name)) continue;
    try {
      await groups[name]();
    } catch (e) {
      r.check(name + ': ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
    }
  }
  process.exit(r.done() ? 0 : 1);
})();
