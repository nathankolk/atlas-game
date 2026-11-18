// Checks for the country quizzes: Capitals (pick and find), Flags and Name It.
//   NODE_PATH=/opt/node-tools/node_modules node check-modes.js [--mobile] [--only=name,name]
// Groups: registry, pick, find, flag, name, keys, difficulty, library, noflags, review, results, keyboard
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
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
// --root=<dir> serves another copy of the app (to show a check failing on an earlier tree)
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || undefined;
const r = lib.reporter('country quizzes' + (MOBILE ? ' (phone)' : ' (desktop)'));

// Makes this browser draw no flags at all: the outcome Quiz.flagSupport calls 'none'
function noFlagsScript() {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text) {
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(String(text))) return;
    return fill.apply(this, arguments);
  };
}

async function open(opts) {
  opts = opts || {};
  const size = MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 };
  const fonts = [];
  const h = await lib.launchApp(Object.assign({
    seedStorage: Object.assign({ 'atlas-theme': 'light' }, opts.seed || {}),
    root: ROOT,
    fast: opts.fast === undefined ? 25 : opts.fast,
    query: opts.query || '',
    beforeLoad: async hh => {
      hh.page.on('request', req => { if (/\.woff2(\?|$)/.test(req.url()) && /127\.0\.0\.1|localhost/.test(req.url())) fonts.push(req.url()); });
      await hh.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      await hh.context.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} });
      if (opts.noFlags) await hh.context.addInitScript(noFlagsScript);
    }
  }, size));
  h.fonts = fonts;
  return h;
}

const toast = page => page.evaluate(() => {
  const t = document.getElementById('toast');
  return { text: t.textContent.trim(), kind: t.className.replace('toast', '').replace('show', '').trim() };
});
const st = (page, fn, arg) => page.evaluate(fn, arg);
// Waits for the question after the one that was showing (or the results screen)
async function next(page, before) {
  await page.waitForFunction((b) => {
    const s = window.__t.snapshot();
    return s.screen !== 'game-screen' || (!s.locked && s.seq > b && s.current);
  }, before, { timeout: 30000 });
}
const seq = page => page.evaluate(() => window.__atlas.state.sequence.length);
// Plays what is left of the round right, to the results screen
async function finish(page) {
  await lib.playRound(page, () => 'first');
}

const groups = {};

/* ----- registry: levels, slugs, records regions, data ----- */
groups.registry = async () => {
  const h = await open();
  const page = h.page;
  const reg = await st(page, () => {
    const A = window.__atlas;
    const quiz = A.LEVELS.filter(l => ['capitals', 'flags', 'name'].includes(l.collection));
    // The module's own level lists, cut down to the countries the map has
    const onMap = n => A.state.featureByCanonical.has(n);
    const kinds = { 'capital-pick': 'capitals-', 'capital-find': 'capitals-reverse-', 'flag': 'flags-', 'name-it': 'name-' };
    const continents = {};
    ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'].forEach(c => { continents[c] = A.levelByKey(c.toLowerCase().replace(/ /g, '-')).names(); });
    const theirs = {};
    A.Quiz.levels(continents, A.WORLD_FACTS).forEach(l => { theirs[l.key] = l.names.filter(onMap).sort(); });
    const mismatched = quiz.filter(l => {
      const region = l.key.slice(l.key.indexOf(l.mode === 'capital-find' ? 'find-' : '-') + (l.mode === 'capital-find' ? 5 : 1));
      const want = theirs[kinds[l.mode] + region];
      return JSON.stringify(l.names().slice().sort()) !== JSON.stringify(want);
    }).map(l => l.key);
    return {
      total: A.LEVELS.length,
      collections: A.COLLECTIONS.map(c => c.key),
      keys: quiz.map(l => l.key),
      modes: Array.from(new Set(quiz.map(l => l.mode))),
      skills: Array.from(new Set(quiz.map(l => l.skill))),
      variants: quiz.filter(l => l.collection === 'capitals').map(l => l.variant),
      counts: { pick: A.levelByKey('capitals-world').count(), find: A.levelByKey('capitals-find-world').count(),
        flags: A.levelByKey('flags-world').count(), name: A.levelByKey('name-world').count() },
      europeFind: A.levelByKey('capitals-find-europe').names().includes('Luxembourg'),
      africaFind: A.levelByKey('capitals-find-africa').names().includes('Djibouti'),
      flagless: ['Somaliland', 'Northern Cyprus', 'Syria'].filter(n => A.levelByKey('flags-world').names().includes(n)),
      mismatched: mismatched,
      factsOffMap: Object.keys(A.WORLD_FACTS).filter(n => !onMap(n)),
      aliasesOff: Object.keys(A.COUNTRY_TYPED_ALIASES).filter(n => !A.WORLD_FACTS[n]),
      worldNames: A.levelByKey('world').names().filter(n => !A.WORLD_FACTS[n]),
      fontStack: getComputedStyle(document.documentElement).getPropertyValue('--font-flags')
    };
  });
  r.eq('55 levels in all', reg.total, 55);
  r.eq('collections in order', reg.collections, ['world', 'us', 'provinces', 'capitals', 'flags', 'name', 'pins']);
  const regions = ['world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'];
  r.eq('slugs', reg.keys, [].concat(regions.map(x => 'capitals-' + x), regions.map(x => 'capitals-find-' + x), regions.map(x => 'flags-' + x), regions.map(x => 'name-' + x)));
  r.eq('four game modes', reg.modes, ['capital-pick', 'capital-find', 'flag', 'name-it']);
  r.eq('three skills', reg.skills, ['capital', 'flag', 'country-name']);
  r.eq('capitals variants', reg.variants, Array(7).fill('pick').concat(Array(7).fill('find')));
  r.eq('world counts (184 on the map; find leaves out Luxembourg and Djibouti; flags leave out three)', reg.counts, { pick: 184, find: 182, flags: 181, name: 184 });
  r.check('trivial capitals are not asked for in find', !reg.europeFind && !reg.africaFind);
  r.eq('no flag level asks for a country without a current flag', reg.flagless, []);
  r.eq('every level holds what Quiz.levels lists for it', reg.mismatched, []);
  r.eq('every WORLD_FACTS key is on the map but French Guiana (inside France in the map file)', reg.factsOffMap, ['French Guiana']);
  r.eq('every typed-alias key is a WORLD_FACTS key', reg.aliasesOff, []);
  r.eq('every country the game asks for has facts', reg.worldNames, []);
  r.check('--font-flags is Quiz.FLAG_FONT_STACK', /^'Atlas Flags'/.test(reg.fontStack.trim()), reg.fontStack);
  r.eq('no flag font fetched before a flag is shown', h.fonts, []);
  // The data's own check, against the game's country list
  let dataOk = false;
  try {
    const out = execFileSync('node', [path.join(S, 'work/data/check.js')], { encoding: 'utf8' });
    dataOk = /OK: every game country has an entry, no extra keys/.test(out);
  } catch (e) { /* reported below */ }
  r.check('work/data/check.js passes against index.html', dataOk);
  // Record regions and link slugs
  const targets = await st(page, () => ['capitals-europe', 'capitals-find-world', 'flags-north-america', 'name-oceania'].map(k => {
    const l = window.__atlas.levelByKey(k);
    return l.mode + '|' + l.arg;
  }));
  r.eq('level args', targets, ['capital-pick|capitals-europe', 'capital-find|capitals-find-world', 'flag|flags-north-america', 'name-it|name-oceania']);
  await h.close();

  // A level link starts the level
  const h2 = await open({ query: '?play=capitals-find-europe' });
  await h2.page.waitForFunction(() => window.__atlas.state.current && window.__atlas.state.gameMode === 'capital-find', null, { timeout: 30000 });
  const link = await st(h2.page, () => ({ title: document.getElementById('region-tag').textContent, region: window.__atlas.state.currentContinent, url: location.search }));
  r.eq('?play=capitals-find-europe starts Europe by Capital', link, { title: 'Europe by Capital', region: 'Europe', url: '?play=capitals-find-europe' });
  r.eq('no errors', h2.errors, []);
  await h2.close();
};

/* ----- pick: a country is shown, its capital picked from four ----- */
groups.pick = async () => {
  const h = await open();
  const page = h.page;
  await lib.startLevel(page, 'capitals-europe');
  const q = await st(page, () => {
    const A = window.__atlas, s = A.state;
    const key = window.__t.keyFor(s.current);
    const btns = Array.from(document.querySelectorAll('#choices-panel .choice-btn')).map(b => b.textContent);
    return {
      label: document.getElementById('prompt-label').textContent, name: document.getElementById('prompt-country').textContent, current: s.current,
      title: document.getElementById('region-tag').textContent,
      choices: btns, answer: A.Quiz.capitalOf(A.WORLD_FACTS, s.current).capital,
      promptKey: A.map.promptKey === key, outline: A.map.outlines.some(o => o.kind === 'prompt'),
      interactive: A.globe.featureAt ? null : null, skipKey: document.getElementById('skip-key').textContent,
      formHidden: document.getElementById('answer-form').hidden, total: s.totalQuestions
    };
  });
  r.eq('pick: title', q.title, 'Capitals of Europe');
  r.eq('pick: label', q.label, 'Which city is the capital of');
  r.eq('pick: the card names the country', q.name, q.current);
  r.check('pick: four choices, the answer among them once', q.choices.length === 4 && q.choices.filter(c => c === q.answer).length === 1 && new Set(q.choices).size === 4, q);
  r.check('pick: the country is the prompted place on the map', q.promptKey && q.outline);
  r.check('pick: no typed field, Skip key is S', q.formHidden && q.skipKey === 'S');
  r.eq('pick: 39 questions', q.total, 39);

  // The prompted country is in what the HUD leaves clear, and big enough to see
  await page.waitForFunction(() => !window.__atlas.globe.isAnimating || !window.__atlas.globe.isAnimating(), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const inView = await st(page, () => {
    const A = window.__atlas, g = A.globe, key = A.map.promptKey;
    const p = g.project(g.anchor('world', key)), c = A.map.clear, info = g.featureInfo('world', key);
    return { ok: p.z > 0.3 && p.x > c.left && p.x < c.right && p.y > c.top && p.y < c.bottom,
      across: 2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180) };
  });
  r.check('pick: the prompted country is inside the clear area', inView.ok, inView);
  r.check('pick: and at least 40 px across', inView.across >= 39.5, inView);

  // First try right
  let before = await seq(page);
  let name = await st(page, () => window.__atlas.state.current);
  await st(page, () => window.__t.attempt(true));
  let after = await st(page, () => ({ t: document.getElementById('toast').textContent, score: window.__atlas.state.score, mark: window.__atlas.map.marks.get(window.__t.keyFor(window.__atlas.state.current)),
    correctBtn: !!document.querySelector('.choice-btn.choice-correct') }));
  r.check('pick: right answer scores 2, marks the country found, toast names both', after.score === 2 && after.mark === 'found' && after.correctBtn && after.t.includes(name) && after.t.includes('+2 pts'), after);
  await next(page, before);

  // Wrong then right: second try
  before = await seq(page);
  await st(page, () => window.__t.attempt(false));
  let mid = await st(page, () => ({ tryShown: !document.getElementById('prompt-try').hidden, attempts: window.__atlas.state.attempts, wrongBtn: !!document.querySelector('.choice-btn.choice-wrong:disabled') }));
  r.check('pick: a wrong pick shows Second try and strikes the choice', mid.tryShown && mid.attempts === 1 && mid.wrongBtn, mid);
  await st(page, () => window.__t.attempt(true));
  after = await st(page, () => ({ score: window.__atlas.state.score, mark: window.__atlas.map.marks.get(window.__t.keyFor(window.__atlas.state.current)) }));
  r.check('pick: second try scores 1, marked second', after.score === 3 && after.mark === 'second', after);
  await next(page, before);

  // Two wrong: reveal
  before = await seq(page);
  name = await st(page, () => window.__atlas.state.current);
  await st(page, () => { window.__t.attempt(false); });
  after = await st(page, () => {
    window.__t.attempt(false);
    const A = window.__atlas;
    return { reveal: !!document.querySelector('.choice-btn.choice-reveal'), shown: A.map.shown.get(window.__t.keyFor(A.state.current)), t: document.getElementById('toast').textContent, wrong: A.state.wrong, locked: A.state.interactionLocked };
  });
  r.check('pick: two wrong picks reveal the capital and the country', after.reveal && after.shown === 'reveal' && after.wrong === 1 && after.locked && after.t.includes(name), after);
  await next(page, before);
  const missed = await st(page, (n) => window.__atlas.map.marks.get(window.__t.keyFor(n)), name);
  r.eq('pick: the missed country keeps the missed mark', missed, 'missed');

  // Skip
  before = await seq(page);
  // Pressed and read in one step: at this suite's speed the reveal is over in a tenth of a second
  after = await st(page, () => {
    document.getElementById('skip-btn').click();
    return { reveal: !!document.querySelector('.choice-btn.choice-reveal'), wrong: window.__atlas.state.wrong };
  });
  r.check('pick: Skip reveals and counts a miss', after.reveal && after.wrong === 2, after);
  await next(page, before);

  // The answer's place among the four varies over the round (one generator per round)
  const slots = new Set();
  for (let i = 0; i < 8; i++) {
    const b = await seq(page);
    slots.add(await st(page, () => {
      const A = window.__atlas, answer = A.Quiz.capitalOf(A.WORLD_FACTS, A.state.current).capital;
      return Array.from(document.querySelectorAll('#choices-panel .choice-btn')).findIndex(x => x.dataset.capital === answer);
    }));
    await st(page, () => window.__t.attempt(true));
    await next(page, b);
  }
  r.check('pick: the answer moves between slots', slots.size >= 2 && !slots.has(-1), Array.from(slots));
  await finish(page);
  const done = await st(page, () => {
    const A = window.__atlas;
    const rec = JSON.parse(localStorage.getItem('atlas-records') || '{}');
    const focus = JSON.parse(localStorage.getItem('atlas-focus') || '{}');
    return {
      recKeys: Object.keys(rec), rec: rec['capital-pick|Europe|normal'] && rec['capital-pick|Europe|normal'].bestAccuracy,
      focusKeys: Object.keys(focus), focusN: (focus['capital-pick|Europe'] || { names: [] }).names.length,
      skills: A.mastery.skills(), seen: A.mastery.summary('capital').seen,
      title: document.querySelector('.results-title') && document.querySelector('.results-title').textContent,
      revisit: Array.from(document.querySelectorAll('#results-screen .revisit li, #results-screen [class*=revisit] li')).map(li => li.textContent).slice(0, 4),
      heading: (document.querySelector('#results-detail h2, #results-detail h3') || {}).textContent
    };
  });
  r.eq('pick: record written under capital-pick|Europe|normal', done.recKeys, ['capital-pick|Europe|normal']);
  r.check('pick: 37 of 39', done.rec && done.rec.correct === 37 && done.rec.total === 39, done.rec);
  r.check('pick: focus list holds the three to revisit', done.focusKeys.length === 1 && done.focusKeys[0] === 'capital-pick|Europe' && done.focusN === 3, done);
  r.check('pick: mastery recorded under capital, 39 seen', done.skills.includes('capital') && done.seen === 39, done);
  r.check('pick: revisit rows give the capital', done.revisit.length === 3 && done.revisit.every(t => / · /.test(t)), done.revisit);
  r.eq('no errors', h.errors, []);
  await h.close();
};

/* ----- find: a capital is named, its country tapped ----- */
groups.find = async () => {
  const h = await open();
  const page = h.page;
  await lib.startLevel(page, 'capitals-find-europe');
  const q = await st(page, () => {
    const A = window.__atlas, s = A.state;
    return { label: document.getElementById('prompt-label').textContent, name: document.getElementById('prompt-country').textContent,
      capital: A.Quiz.capitalOf(A.WORLD_FACTS, s.current).capital, promptKey: A.map.promptKey, choicesHidden: document.getElementById('choices-panel').hidden, total: s.totalQuestions };
  });
  r.eq('find: label', q.label, 'Which country’s capital is');
  r.check('find: the card names the capital, the map marks nothing', q.name === q.capital && q.promptKey === null && q.choicesHidden, q);
  r.eq('find: 38 questions (no Luxembourg)', q.total, 38);
  let before = await seq(page);
  let after = await st(page, () => {
    const A = window.__atlas, name = A.state.current, cap = document.getElementById('prompt-country').textContent;
    window.__t.attempt(true);
    return { t: document.getElementById('toast').textContent, want: cap + ' → ' + name, mark: A.map.marks.get(window.__t.keyFor(name)), score: A.state.score };
  });
  r.check('find: a right tap scores 2 and the toast ties capital to country', after.score === 2 && after.mark === 'found' && after.t.includes(after.want), after);
  await next(page, before);
  before = await seq(page);
  after = await st(page, () => {
    window.__t.attempt(false);
    return { t: document.getElementById('toast').textContent, attempts: window.__atlas.state.attempts };
  });
  r.check('find: a wrong tap says what was tapped', after.attempts === 1 && /Not quite — that’s /.test(after.t), after);
  await st(page, () => window.__t.attempt(true));
  await next(page, before);
  await h.close();

  // Shared capitals: Nicosia is Cyprus's and is claimed by Northern Cyprus; North Nicosia is Northern Cyprus's
  const h2 = await open();
  const p2 = h2.page;
  await lib.startLevel(p2, 'capitals-find-world', { practice: ['Northern Cyprus'] });
  let res = await st(p2, () => {
    const A = window.__atlas;
    window.__t.tapKey(window.__t.keyFor('Cyprus'));
    return { prompt: document.getElementById('prompt-country').textContent, attempts: A.state.attempts, locked: A.state.interactionLocked, toast: document.getElementById('toast').textContent, kind: document.getElementById('toast').className, picks: A.state.picks.length };
  });
  r.check('find: Cyprus for North Nicosia is not counted either way', res.prompt === 'North Nicosia' && res.attempts === 0 && !res.locked && res.picks === 0 && /not counted/.test(res.toast) && /note/.test(res.kind), res);
  res = await st(p2, () => { window.__t.attempt(true); return window.__atlas.state.score; });
  r.eq('find: then Northern Cyprus is right, first try', res, 2);
  await p2.waitForFunction(() => window.__t.screen() === 'results-screen', null, { timeout: 20000 });
  await lib.startLevel(p2, 'capitals-find-world', { practice: ['Cyprus'] });
  res = await st(p2, () => {
    const A = window.__atlas;
    window.__t.tapKey(window.__t.keyFor('Northern Cyprus'));
    return { prompt: document.getElementById('prompt-country').textContent, score: A.state.score, markAsked: A.map.marks.get(window.__t.keyFor('Cyprus')), markTapped: A.map.marks.get(window.__t.keyFor('Northern Cyprus')) || null };
  });
  r.check('find: Northern Cyprus answers for Nicosia, and the mark goes to Cyprus', res.prompt === 'Nicosia' && res.score === 2 && res.markAsked === 'found' && res.markTapped === null, res);
  r.eq('no errors', h2.errors, []);
  await h2.close();
};

/* ----- flag: a flag is shown, its country tapped ----- */
groups.flag = async () => {
  const h = await open();
  const page = h.page;
  r.eq('flag: no font fetched on Home', h.fonts.length, 0);
  await lib.startLevel(page, 'flags-europe');
  const q = await st(page, () => {
    const A = window.__atlas, el = document.getElementById('prompt-country');
    const cs = getComputedStyle(el), box = el.getBoundingClientRect();
    // What is read out: the live region's text without what is hidden from assistive technology
    const spoken = node => node.nodeType === 3 ? node.nodeValue
      : node.nodeType !== 1 || node.hidden || node.getAttribute('aria-hidden') === 'true' ? ''
      : Array.from(node.childNodes).map(spoken).join(' ');
    const seen = el.querySelector('[aria-hidden="true"]') || el;
    return { label: document.getElementById('prompt-label').textContent, text: seen.textContent, want: A.Quiz.flagPrompt(A.WORLD_FACTS, A.state.current).flag,
      spoken: spoken(document.getElementById('prompt')).replace(/\s+/g, ' ').trim(),
      family: cs.fontFamily, size: parseFloat(cs.fontSize), height: box.height, loaded: document.fonts.check("32px 'Atlas Flags'", seen.textContent),
      support: null, title: document.getElementById('region-tag').textContent, total: A.state.totalQuestions };
  });
  r.eq('flag: title', q.title, 'Flags of Europe');
  r.eq('flag: label', q.label, 'Which country’s flag is this');
  r.check('flag: the card shows the country’s flag', q.text === q.want && q.text.length === 4, q);
  r.check('flag: the question is read out without the flag itself (a screen reader would name its country)',
    !/[\u{1F1E6}-\u{1F1FF}]/u.test(q.spoken) && /Which country’s flag is this/.test(q.spoken) && /A flag is shown/.test(q.spoken), q.spoken);
  r.check('flag: drawn from the flag font, large', /^"?Atlas Flags/.test(q.family) && q.size >= (MOBILE ? 96 : 120) && q.loaded, q);
  r.eq('flag: the font was fetched once a flag was due', h.fonts.length, 1);
  const support = await st(page, () => window.__atlas.Quiz.flagSupport(document));
  r.eq('flag: support is font', support, 'font');
  let before = await seq(page);
  let after = await st(page, () => {
    const A = window.__atlas, name = A.state.current;
    window.__t.attempt(true);
    return { t: document.getElementById('toast').textContent, flag: !!document.querySelector('#toast .flag'), name: name, mark: A.map.marks.get(window.__t.keyFor(name)) };
  });
  r.check('flag: right tap marks the country; toast shows flag and name', after.mark === 'found' && after.flag && after.t.includes(after.name), after);
  await next(page, before);
  // Miss twice: reveal
  before = await seq(page);
  after = await st(page, () => {
    const A = window.__atlas, name = A.state.current;
    window.__t.attempt(false); window.__t.attempt(false);
    return { shown: A.map.shown.get(window.__t.keyFor(name)), t: document.getElementById('toast').textContent, name: name, wrong: A.state.wrong };
  });
  r.check('flag: two wrong taps reveal the country', after.shown === 'reveal' && after.wrong === 1 && after.t.includes('this is ' + after.name), after);
  await next(page, before);
  await finish(page);
  const done = await st(page, () => ({
    rec: Object.keys(JSON.parse(localStorage.getItem('atlas-records') || '{}')), seen: window.__atlas.mastery.summary('flag').seen,
    flagRows: document.querySelectorAll('#results-screen li .flag').length
  }));
  r.eq('flag: record under flag|Europe|normal', done.rec, ['flag|Europe|normal']);
  r.eq('flag: mastery under flag, 39 seen', done.seen, 39);
  r.eq('flag: the revisit row shows its flag', done.flagRows, 1);
  await h.close();

  // Chad and Romania fly the same flag
  const h2 = await open();
  const p2 = h2.page;
  await lib.startLevel(p2, 'flags-world', { practice: ['Chad'] });
  const twin = await st(p2, () => {
    const A = window.__atlas;
    window.__t.tapKey(window.__t.keyFor('Romania'));
    return { score: A.state.score, chad: A.map.marks.get(window.__t.keyFor('Chad')), romania: A.map.marks.get(window.__t.keyFor('Romania')) || null, t: document.getElementById('toast').textContent, practice: A.state.practice };
  });
  r.check('flag: Romania answers for Chad’s flag; the mark goes to Chad', twin.practice && twin.score === 2 && twin.chad === 'found' && twin.romania === null && /Romania flies the same flag/.test(twin.t), twin);
  r.eq('no errors', h2.errors, []);
  await h2.close();
};

/* ----- name: the country is shown, its name typed ----- */
groups.name = async () => {
  const h = await open();
  const page = h.page;
  await lib.startLevel(page, 'name-europe');
  const q = await st(page, () => {
    const A = window.__atlas, input = document.getElementById('answer-input');
    return {
      label: document.getElementById('prompt-label').textContent, title: document.getElementById('region-tag').textContent,
      nameHidden: document.getElementById('prompt-country').hidden, formShown: !document.getElementById('answer-form').hidden,
      focused: document.activeElement === input, promptKey: A.map.promptKey === window.__t.keyFor(A.state.current),
      attrs: ['maxlength', 'autocomplete', 'autocorrect', 'spellcheck', 'autocapitalize'].map(a => input.getAttribute(a)),
      list: input.getAttribute('list'), skipKey: document.getElementById('skip-key').textContent, size: A.state.quiz.matcher.size
    };
  });
  r.eq('name: title', q.title, 'Name It · Europe');
  r.eq('name: label', q.label, 'Name this country');
  r.check('name: a field in the card, focused; the country marked on the map', q.nameHidden && q.formShown && q.focused && q.promptKey, q);
  r.eq('name: field allows 60 characters, no suggestions', q.attrs, ['60', 'off', 'off', 'false', 'words']);
  r.check('name: no datalist', q.list === null);
  r.eq('name: Skip shows Esc', q.skipKey, 'Esc');
  r.check('name: the matcher knows every country', q.size >= 185, q.size);
  await h.close();

  // Each kind of typed answer, one question at a time, as practice rounds on chosen countries
  const h2 = await open();
  const p2 = h2.page;
  const ask = async (level, country) => {
    await p2.waitForFunction(() => true);
    await lib.startLevel(p2, level, { practice: [country] });
  };
  const typed = (text, submit) => st(p2, ([t, s]) => {
    const A = window.__atlas;
    window.__t.typeAnswer(t);
    if (s && !A.state.interactionLocked) document.getElementById('answer-form').requestSubmit();
    const toastEl = document.getElementById('toast');
    return { locked: A.state.interactionLocked, score: A.state.score, attempts: A.state.attempts, wrong: A.state.wrong,
      toast: toastEl.textContent, kind: toastEl.className, value: document.getElementById('answer-input').value,
      cls: document.getElementById('answer-form').className, picks: A.state.picks.slice(), tryShown: !document.getElementById('prompt-try').hidden,
      focused: document.activeElement === document.getElementById('answer-input') };
  }, [text, !!submit]);
  const results = () => p2.waitForFunction(() => window.__t.screen() === 'results-screen', null, { timeout: 20000 });

  await ask('name-europe', 'France');
  let a = await typed('Franc', false);
  r.check('name: an unfinished name does nothing while typing', !a.locked && a.score === 0 && a.attempts === 0, a);
  a = await typed('france', false);
  r.check('name: the exact name is taken as it is typed, whatever its case', a.locked && a.score === 2 && a.value === 'France' && /is-found/.test(a.cls) && /Well done — France/.test(a.toast), a);
  await results();

  await ask('name-europe', 'Netherlands');
  a = await typed('Holland', false);
  r.check('name: an alias is right', a.locked && a.score === 2 && a.value === 'Netherlands', a);
  await results();

  await ask('name-europe', 'Switzerland');
  a = await typed('Switzerlnd', false);
  r.check('name: a near match waits for Enter', !a.locked && a.score === 0, a);
  a = await typed('Switzerlnd', true);
  r.check('name: on Enter it is right, and the toast gives the spelling', a.locked && a.score === 2 && /it’s spelled Switzerland/.test(a.toast) && /correct/.test(a.kind), a);
  await results();

  await ask('name-africa', 'Niger');
  a = await typed('Niger', false);
  r.check('name: “Niger” is not taken while typing (it may become Nigeria)', !a.locked && a.score === 0, a);
  a = await typed('Niger', true);
  r.check('name: on Enter Niger is right', a.locked && a.score === 2, a);
  await results();

  await ask('name-africa', 'Nigeria');
  a = await typed('Niger', true);
  r.check('name: “Niger” for Nigeria is a wrong try, said so', !a.locked && a.attempts === 1 && a.tryShown && /this isn’t Niger/.test(a.toast) && a.picks[0] === 'Niger', a);
  a = await typed('Nigeria', false);
  r.check('name: then Nigeria scores 1', a.locked && a.score === 1, a);
  await results();
  const story = await st(p2, () => (document.querySelector('#results-screen li small') || {}).textContent);
  r.check('name: the results say what was typed', /Second try, after Niger/.test(story || ''), story);

  await ask('name-europe', 'Spain');
  a = await typed('Japan', true);
  r.check('name: a country from outside the level is a wrong try, and called a real country', a.attempts === 1 && /Japan is a real country, but not this one/.test(a.toast) && /wrong/.test(a.kind), a);
  a = await typed('xyzzy', true);
  r.check('name: text that is no country costs nothing', a.attempts === 1 && !a.locked && /That name isn’t in this atlas/.test(a.toast) && /note/.test(a.kind), a);
  a = await typed('   ', true);
  r.check('name: an empty answer does nothing', a.attempts === 1 && !a.locked, a);
  a = await typed('Portugal', true);
  r.check('name: a second wrong name is a miss; the field shows the name and the map reveals it', a.locked && a.wrong === 1 && a.value === 'Spain' && /is-missed/.test(a.cls) && /this is Spain/.test(a.toast), a);
  const lockedType = await st(p2, () => { window.__t.typeAnswer('zzz'); return document.getElementById('answer-input').value; });
  r.eq('name: nothing is typed over a shown answer', lockedType, 'Spain');
  await results();
  const typedStory = await st(p2, () => (document.querySelector('#results-screen li small') || {}).textContent);
  r.check('name: “You typed Japan, then Portugal”', /You typed Japan, then Portugal/.test(typedStory || ''), typedStory);

  // A short form that begins its own country's full name waits, so the full name can be typed out
  await ask('name-europe', 'Bosnia and Herzegovina');
  a = await typed('Bosnia', false);
  r.check('name: “Bosnia” is not taken while typing (it may become Bosnia and Herzegovina)', !a.locked && a.score === 0 && a.attempts === 0, a);
  a = await typed('Bosnia and Herzegovin', false);
  r.check('name: nor is anything on the way to the full name', !a.locked && a.score === 0, a);
  a = await typed('Bosnia and Herzegovina', false);
  r.check('name: the full name is taken as its last letter is typed', a.locked && a.score === 2 && a.value === 'Bosnia and Herzegovina', a);
  await results();
  await ask('name-europe', 'Bosnia and Herzegovina');
  a = await typed('Bosnia', true);
  r.check('name: on Enter “Bosnia” is right', a.locked && a.score === 2 && /Well done — Bosnia and Herzegovina/.test(a.toast), a);
  await results();

  // Records, mastery, a full round
  await lib.startLevel(p2, 'name-oceania');
  await finish(p2);
  const done = await st(p2, () => ({ rec: Object.keys(JSON.parse(localStorage.getItem('atlas-records') || '{}')), skills: window.__atlas.mastery.skills(),
    seen: window.__atlas.mastery.summary('country-name').seen }));
  r.eq('name: a full round writes name-it|Oceania|normal (practice rounds wrote nothing)', done.rec, ['name-it|Oceania|normal']);
  r.check('name: mastery under country-name', done.skills.includes('country-name') && done.seen >= 7, done);
  r.eq('no errors', h2.errors, []);
  await h2.close();

  // Typing that runs on past a name taken as typed, at the game's real pace (no shortened delays), key by key
  const h3 = await open({ fast: false });
  const p3 = h3.page;
  for (let i = 0; i < 12; i++) {
    await lib.startLevel(p3, 'name-north-america', { practice: ['United States', 'Canada'] });
    if (await st(p3, () => window.__atlas.state.current) === 'United States') break;
  }
  const field = () => st(p3, () => { const A = window.__atlas, t = document.getElementById('toast');
    return { current: A.state.current, value: document.getElementById('answer-input').value, score: A.state.score, attempts: A.state.attempts,
      note: /show/.test(t.className) && /note|wrong/.test(t.className) ? t.textContent.trim() : '', locked: A.state.interactionLocked }; });
  r.eq('name, typing on: the United States is asked first', (await field()).current, 'United States');
  await p3.focus('#answer-input');
  await p3.keyboard.type('United States of America', { delay: 110 });
  await p3.keyboard.press('Enter');
  await p3.waitForFunction(() => window.__atlas.state.current === 'Canada' && !window.__atlas.state.interactionLocked, null, { timeout: 10000 });
  await p3.waitForTimeout(300);
  let f3 = await field();
  r.check('name, typing on: “United States of America” typed in one go is one right answer, and none of it lands in the next question',
    f3.current === 'Canada' && f3.value === '' && f3.score === 2 && f3.attempts === 0 && f3.note === '', f3);
  await p3.waitForTimeout(1100);
  await p3.keyboard.type('Canada', { delay: 110 });
  await p3.waitForTimeout(200);
  f3 = await st(p3, () => ({ score: window.__atlas.state.score, value: document.getElementById('answer-input').value }));
  r.check('name, typing on: after a pause the field takes the next answer as usual', f3.score === 4 && f3.value === 'Canada', f3);
  r.eq('no errors', h3.errors, []);
  await h3.close();
};

/* ----- keys: S types, Escape skips, the field keeps the focus ----- */
groups.keys = async () => {
  const h = await open({ fast: 8 });
  const page = h.page;
  await lib.startLevel(page, 'name-europe');
  await page.keyboard.type('s');
  let k = await st(page, () => ({ value: document.getElementById('answer-input').value, wrong: window.__atlas.state.wrong, seq: window.__atlas.state.sequence.length }));
  r.check('keys: S types an s and skips nothing', k.value === 's' && k.wrong === 0 && k.seq === 0, k);
  await page.keyboard.type('m0+-');
  k = await st(page, () => ({ value: document.getElementById('answer-input').value, zoom: window.__t.zoom(), sat: document.getElementById('map-wrap').classList.contains('sat-on') }));
  r.check('keys: M, 0, + and - are letters too', k.value === 'sm0+-' && !k.sat, k);
  let before = await seq(page);
  await page.keyboard.press('Escape');
  k = await st(page, () => ({ wrong: window.__atlas.state.wrong, screen: window.__t.screen(), value: document.getElementById('answer-input').value, current: window.__atlas.state.current }));
  r.check('keys: Escape skips the question and stays in the round', k.wrong === 1 && k.screen === 'game-screen' && k.value === k.current, k);
  await next(page, before);
  k = await st(page, () => ({ value: document.getElementById('answer-input').value, focused: document.activeElement === document.getElementById('answer-input') }));
  r.check('keys: the next question starts with an empty, focused field', k.value === '' && k.focused, k);

  // A real click on Skip, on the globe and on the button beside the field leaves the cursor in the field
  before = await seq(page);
  await page.click('#skip-btn');
  k = await st(page, () => ({ focused: document.activeElement === document.getElementById('answer-input'), wrong: window.__atlas.state.wrong }));
  r.check('keys: clicking Skip keeps the field focused', k.focused && k.wrong === 2, k);
  await next(page, before);
  const hostBox = await st(page, () => { const b = document.getElementById('globe-host').getBoundingClientRect(); const c = window.__atlas.map.clear; return { x: b.left + (c.left + c.right) / 2, y: b.top + c.bottom - 30 }; });
  await page.mouse.click(hostBox.x, hostBox.y);
  k = await st(page, () => document.activeElement === document.getElementById('answer-input'));
  r.check('keys: clicking the globe keeps the field focused', k);
  // Typing after the focus has gone elsewhere goes to the field
  await st(page, () => { document.getElementById('answer-input').blur(); });
  await page.keyboard.type('ab');
  k = await st(page, () => ({ value: document.getElementById('answer-input').value, focused: document.activeElement === document.getElementById('answer-input') }));
  r.check('keys: a letter typed anywhere lands in the field', k.focused && k.value === 'ab', k);
  // Enter hands the answer in (a real key press)
  const target = await st(page, () => window.__atlas.state.current);
  await st(page, () => { document.getElementById('answer-input').value = ''; });
  before = await seq(page);
  await page.keyboard.type(target.slice(0, -1));
  await page.keyboard.press('Enter');
  k = await st(page, () => ({ answered: window.__atlas.state.sequence.length, score: window.__atlas.state.score, attempts: window.__atlas.state.attempts, toast: document.getElementById('toast').textContent }));
  // Taken as a near match (the question is then over, and at this speed the next may already be up), or not known
  const taken = k.answered > before && k.score > 0 && /Well done|it’s spelled/.test(k.toast);
  r.check('keys: Enter submits (a name one letter short is near enough, or is asked again)', taken || /isn’t in this atlas|this isn’t/.test(k.toast), k);
  if (taken) await next(page, before);
  // The button beside the field
  const t2 = await st(page, () => window.__atlas.state.current);
  await st(page, () => { document.getElementById('answer-input').value = ''; });
  before = await seq(page);
  await page.keyboard.type('Atlantis');
  await page.click('#answer-btn');
  k = await st(page, () => ({ focused: document.activeElement === document.getElementById('answer-input'), toast: document.getElementById('toast').textContent, attempts: window.__atlas.state.attempts }));
  r.check('keys: the button submits and the field keeps the focus', k.focused && /That name isn’t in this atlas/.test(k.toast) && k.attempts === 0, k);
  // Back on Home the field is let go
  await page.click('#back-btn');
  k = await st(page, () => ({ screen: window.__t.screen(), focused: document.activeElement === document.getElementById('answer-input') }));
  r.check('keys: leaving the round lets go of the field', k.screen === 'menu-screen' && !k.focused, k);

  // S still skips in the other modes, Escape still leaves
  await lib.startLevel(page, 'flags-oceania');
  before = await seq(page);
  await page.keyboard.press('s');
  k = await st(page, () => window.__atlas.state.wrong);
  r.eq('keys: S skips in a flag round', k, 1);
  await next(page, before);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__t.screen() === 'menu-screen', null, { timeout: 5000 });
  r.check('keys: Escape leaves a flag round', true);
  r.eq('no errors', h.errors, []);
  await h.close();
};

/* ----- difficulty: Hard and Uncharted in the new modes ----- */
groups.difficulty = async () => {
  const h = await open({ seed: { 'atlas-difficulty': 'uncharted' } });
  const page = h.page;
  for (const key of ['name-europe', 'capitals-europe']) {
    await lib.startLevel(page, key);
    const u = await st(page, () => {
      const A = window.__atlas, stage = document.getElementById('map-wrap');
      return { noBorders: stage.classList.contains('no-borders'), sat: stage.classList.contains('sat-on'),
        outline: A.map.outlines.filter(o => o.kind === 'prompt').length, promptStyle: A.map.promptKey === window.__t.keyFor(A.state.current) };
    });
    r.check(key + ' in Uncharted: imagery, no borders, and the asked country outlined', u.noBorders && u.sat && u.outline === 1 && u.promptStyle, u);
    const b = await seq(page);
    await st(page, () => window.__t.attempt(true));
    const marks = await st(page, () => window.__atlas.map.marks.size);
    r.eq(key + ' in Uncharted: an answered country keeps no mark', marks, 0);
    await next(page, b);
    const moved = await st(page, () => window.__atlas.map.outlines.filter(o => o.kind === 'prompt').length);
    r.eq(key + ' in Uncharted: the outline moves to the next country', moved, 1);
  }
  await lib.startLevel(page, 'flags-europe');
  const f = await st(page, () => ({ outline: window.__atlas.map.outlines.length, prompt: window.__atlas.map.promptKey }));
  r.check('flags in Uncharted: nothing outlined until an answer', f.outline === 0 && f.prompt === null, f);
  await page.click('#back-btn');
  await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
  // The level sheet says what the difficulties mean here
  const notes = {};
  for (const key of ['name-europe', 'capitals-europe', 'capitals-find-europe', 'flags-europe']) {
    await st(page, (k) => {
      const A = window.__atlas, c = A.COLLECTIONS.find(x => x.key === 'capitals');
      localStorage.setItem('atlas-capitals-way', k.indexOf('find') > 0 ? 'find' : 'pick');
      A.showView('home');
    }, key);
    await st(page, (k) => document.querySelector('[data-level="' + k + '"]').click(), key);
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    notes[key] = await st(page, () => ({ note: document.querySelector('#level-sheet [data-difficulty-note]').textContent, how: document.querySelector('.sheet-sub').textContent, eyebrow: document.querySelector('.sheet-head .eyebrow').textContent }));
    await st(page, () => document.querySelector('[data-action="sheet-close"]').click());
  }
  r.check('sheet: Name It’s Uncharted note names the outline', /outline of the country to name/.test(notes['name-europe'].note), notes['name-europe']);
  r.check('sheet: Capitals pick’s Uncharted note names the outline', /outline of the country asked about/.test(notes['capitals-europe'].note), notes['capitals-europe']);
  r.check('sheet: find and flags keep the general note', /a shape shows only once you answer/.test(notes['capitals-find-europe'].note) && /a shape shows only once you answer/.test(notes['flags-europe'].note), notes);
  r.check('sheet: how each is played', /pick its capital/.test(notes['capitals-europe'].how) && /find its country/.test(notes['capitals-find-europe'].how) &&
    /a flag is shown/.test(notes['flags-europe'].how) && /type its name/.test(notes['name-europe'].how), notes);
  r.check('sheet: the eyebrow says which way round', /Capitals · Find the country/i.test(notes['capitals-find-europe'].eyebrow) && /Capitals · Pick the capital/i.test(notes['capitals-europe'].eyebrow), notes);
  await h.close();

  // Hard keeps no marks
  const h2 = await open({ seed: { 'atlas-difficulty': 'hard' } });
  await lib.startLevel(h2.page, 'name-oceania');
  const b = await seq(h2.page);
  await st(h2.page, () => window.__t.attempt(true));
  const hard = await st(h2.page, () => ({ marks: window.__atlas.map.marks.size, borders: !document.getElementById('map-wrap').classList.contains('no-borders') }));
  r.check('Name It on Hard: borders stay, an answered country keeps no mark', hard.marks === 0 && hard.borders, hard);
  await next(h2.page, b);
  await finish(h2.page);
  const rec = await st(h2.page, () => Object.keys(JSON.parse(localStorage.getItem('atlas-records') || '{}')));
  r.eq('Name It on Hard: its own record', rec, ['name-it|Oceania|hard']);
  await h2.close();
};

/* ----- library: three collections, the Capitals switch, level sheets ----- */
groups.library = async () => {
  const h = await open();
  const page = h.page;
  const lib1 = await st(page, () => {
    const sections = Array.from(document.querySelectorAll('#library-collections .collection'));
    const cards = id => Array.from(document.querySelectorAll('#collection-' + id + ' .level')).map(c => c.dataset.level + '|' + c.querySelector('.level-title').textContent);
    return {
      order: sections.map(s => s.id), chips: Array.from(document.querySelectorAll('.jump .chip')).map(c => c.textContent),
      count: document.getElementById('library-count').textContent,
      capitals: cards('capitals'), flags: cards('flags').length, name: cards('name').length,
      way: Array.from(document.querySelectorAll('#collection-capitals [data-action="set-variant"]')).map(b => b.textContent + ':' + b.getAttribute('aria-checked')),
      sum: document.querySelector('#collection-capitals .collection-sum').textContent,
      icons: ['capitals', 'flags', 'name'].map(id => document.querySelector('#collection-' + id + ' .collection-icon use').getAttribute('href')),
      iconsExist: ['i-capitol', 'i-flag', 'i-type'].every(id => !!document.getElementById(id)),
      descs: ['capitals', 'flags', 'name'].map(id => document.querySelector('#collection-' + id + ' .collection-desc').textContent),
      titles: document.querySelectorAll('[title]').length
    };
  });
  r.eq('library: collections in order', lib1.order, ['world', 'us', 'provinces', 'capitals', 'flags', 'name', 'pins'].map(k => 'collection-' + k));
  r.eq('library: chips', lib1.chips, ['World & Continents', 'United States', 'Provinces & States', 'Capitals', 'Flags', 'Name It', 'Pin the City']);
  r.eq('library: count line', lib1.count, 'Fifty-two levels in seven collections.');
  r.eq('library: Capitals shows the seven pick levels first', lib1.capitals, ['capitals-world|The World', 'capitals-africa|Africa', 'capitals-asia|Asia', 'capitals-europe|Europe', 'capitals-north-america|North America', 'capitals-south-america|South America', 'capitals-oceania|Oceania']);
  r.eq('library: the switch', lib1.way, ['Pick the capital:true', 'Find the country:false']);
  r.check('library: seven flag cards, seven name cards', lib1.flags === 7 && lib1.name === 7, lib1);
  r.check('library: Capitals counts each country once (184)', /of 184/.test(lib1.sum), lib1.sum);
  r.check('library: icons and descriptions', lib1.iconsExist && lib1.icons.join() === '#i-capitol,#i-flag,#i-type' && lib1.descs.every(d => d.length > 20), lib1);
  r.eq('library: no title attributes', lib1.titles, 0);
  r.eq('library: still no flag font', h.fonts.length, 0);

  await page.click('#collection-capitals [data-action="set-variant"][data-value="find"]');
  const lib2 = await st(page, () => ({
    cards: Array.from(document.querySelectorAll('#collection-capitals .level')).map(c => c.dataset.level),
    saved: localStorage.getItem('atlas-capitals-way'),
    focus: document.activeElement && document.activeElement.dataset.value,
    meta: document.querySelector('[data-level="capitals-find-europe"] .level-meta').textContent
  }));
  r.eq('library: the switch shows the seven find levels', lib2.cards, ['world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'].map(x => 'capitals-find-' + x));
  r.check('library: remembered on this device, focus stays on the switch', lib2.saved === 'find' && lib2.focus === 'find', lib2);
  r.eq('library: find Europe has 38 capitals', lib2.meta, '38 capitals');
  // Arrow keys work the switch
  await page.keyboard.press('ArrowLeft');
  const lib3 = await st(page, () => ({ saved: localStorage.getItem('atlas-capitals-way'), first: document.querySelector('#collection-capitals .level').dataset.level }));
  r.eq('library: arrow key switches back', lib3, { saved: 'pick', first: 'capitals-world' });
  await page.click('#collection-capitals [data-action="set-variant"][data-value="find"]');
  await lib.reloadApp(h, '');
  const lib4 = await st(page, () => document.querySelector('#collection-capitals .level').dataset.level);
  r.eq('library: the choice survives a reload', lib4, 'capitals-find-world');

  // A sheet for each kind; Start begins the level
  for (const [key, mode] of [['capitals-find-asia', 'capital-find'], ['flags-asia', 'flag'], ['name-asia', 'name-it']]) {
    await st(page, (k) => document.querySelector('[data-level="' + k + '"]').click(), key);
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    const sheet = await st(page, () => ({ title: document.getElementById('sheet-title').textContent, start: document.getElementById('sheet-start-btn').textContent, ways: document.querySelectorAll('[data-action="sheet-way"]').length }));
    r.check('sheet for ' + key + ': Asia, one way to play, Start', sheet.title === 'Asia' && sheet.ways === 1 && /Start/.test(sheet.start), sheet);
    if (key === 'flags-asia') {
      await page.waitForFunction(() => document.fonts.check("32px 'Atlas Flags'", '\u{1F1EB}\u{1F1F7}'), null, { timeout: 8000 }).catch(() => {});
      r.eq('sheet for flags: opening it fetches the flag font', h.fonts.length, 1);
    }
    await st(page, () => document.getElementById('sheet-start-btn').click());
    await page.waitForFunction((m) => window.__atlas.state.gameMode === m && window.__atlas.state.current, mode, { timeout: 30000 });
    r.check('sheet for ' + key + ': Start begins a ' + mode + ' round', true);
    await st(page, () => document.getElementById('back-btn').click());
    await page.waitForFunction(() => window.__t.screen() === 'menu-screen');
  }
  // Stats lists all fourteen Capitals levels
  await st(page, () => window.__atlas.showView('stats'));
  const stats = await st(page, () => {
    const rows = Array.from(document.querySelectorAll('.mtable tbody')).map(tb => Array.from(tb.querySelectorAll('tr')).map(tr => tr.querySelector('th').textContent.trim()));
    const cap = rows.find(g => g[0] === 'Capitals');
    return { cap: cap, groups: rows.map(g => g[0]), total: document.querySelector('.kpis .kpi .kpi-sub').textContent };
  });
  r.eq('stats: mastery groups', stats.groups, ['World & Continents', 'United States', 'Provinces & States', 'Capitals', 'Flags', 'Name It', 'Pin the City']);
  r.check('stats: Capitals lists fourteen levels, named by their way round', stats.cap && stats.cap.length === 15 && stats.cap[1] === 'The World · Pick the capital' && stats.cap[8] === 'The World · Find the country', stats.cap);
  r.eq('no errors', h.errors, []);
  await h.close();
};

/* ----- noflags: a browser that draws no flags ----- */
groups.noflags = async () => {
  const h = await open({ noFlags: true });
  const page = h.page;
  const before = await st(page, () => ({ cards: document.querySelectorAll('#collection-flags a.level').length, off: window.__atlas.state.flagsOff }));
  r.check('noflags: nothing is known until a flag is wanted', before.cards === 7 && !before.off, before);
  await st(page, () => document.querySelector('[data-level="flags-europe"]').click());
  await page.waitForFunction(() => window.__atlas.state.flagsOff, null, { timeout: 15000 });
  const after = await st(page, () => ({
    sheetHidden: document.getElementById('level-sheet').hidden,
    notice: (document.getElementById('app-notice') || {}).textContent,
    cards: Array.from(document.querySelectorAll('#collection-flags .level')).map(c => c.tagName + '|' + c.querySelector('.level-meta').textContent + '|' + c.querySelector('.tag').textContent),
    count: document.getElementById('library-count').textContent,
    available: window.__atlas.levelByKey('flags-world').available
  }));
  r.check('noflags: the sheet closes and a notice says why', after.sheetHidden && /draws no flags/.test(after.notice || ''), after);
  r.check('noflags: all seven cards are unavailable, with the reason', after.cards.length === 7 && after.cards.every(c => c === 'DIV|This browser draws no flags|Unavailable') && !after.available, after.cards);
  r.eq('noflags: the count leaves them out', after.count, 'Forty-five levels in seven collections.');
  // startGame refuses, a due flag is not offered for review
  const refused = await st(page, async () => {
    const A = window.__atlas;
    A.mastery.record('flag', 'France', 'miss');
    await A.startGame('flags-europe');
    return { screen: window.__t.screen(), notice: document.getElementById('app-notice').textContent };
  });
  r.check('noflags: a flag round does not start', refused.screen === 'menu-screen' && /flag levels can’t be played/.test(refused.notice), refused);
  await st(page, () => window.__atlas.showView('stats'));
  const stats = await st(page, () => Array.from(document.querySelectorAll('.mtable tbody')).map(tb => tb.querySelector('th').textContent.trim() + ':' + tb.querySelectorAll('tr').length));
  r.check('noflags: Stats lists no flag levels', stats.includes('Flags:1'), stats);
  await h.close();

  // The link to a flag level ends on Home with the reason
  const h2 = await open({ noFlags: true, query: '?play=flags-europe' });
  await h2.page.waitForFunction(() => window.__atlas.state.flagsOff && window.__t.screen() === 'menu-screen', null, { timeout: 20000 });
  const link = await st(h2.page, () => ({ notice: document.getElementById('app-notice').textContent, records: localStorage.getItem('atlas-records'), opening: document.getElementById('game-screen').classList.contains('is-opening') }));
  r.check('noflags: ?play=flags-europe lands on Home with a notice, nothing written', /draws no flags/.test(link.notice) && !link.records, link);
  r.eq('no errors', h2.errors, []);
  await h2.close();
};

/* ----- review: the three skills in Smart Review and the totals ----- */
groups.review = async () => {
  const h = await open();
  const page = h.page;
  const totals0 = await st(page, () => document.querySelector('.summary .summary-sub').textContent);
  await st(page, () => {
    const A = window.__atlas;
    ['France', 'Spain', 'Peru'].forEach(n => A.mastery.record('capital', n, 'miss'));
    ['Japan', 'Chad'].forEach(n => A.mastery.record('flag', n, 'miss'));
    A.mastery.record('country-name', 'Kenya', 'miss');
    A.showView('stats');
    A.showView('home');
  });
  const card = await st(page, () => ({ n: (document.querySelector('.review-num') || {}).textContent, lede: document.querySelector('.lede').textContent }));
  r.check('review: six places due', card.n === '6' && /Six places/.test(card.lede), card);
  r.check('totals: the Home figure counts every skill once', /^of [\d,]+$/.test(totals0), totals0);
  await st(page, () => document.querySelector('[data-action="start-review"]').click());
  await page.waitForFunction(() => window.__atlas.state.current && window.__atlas.state.review, null, { timeout: 30000 });
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    const s = await st(page, () => {
      const A = window.__atlas, s = A.state;
      return { arg: s.startArg, mode: s.gameMode, practice: s.practice, names: [s.current].concat(s.queue).sort(), kind: document.getElementById('game-kind').textContent };
    });
    rounds.push(s.arg + ':' + s.names.join('+') + ':' + s.practice + ':' + s.kind);
    await finish(page);
    if (i < 2) {
      const label = await st(page, () => { const b = document.getElementById('review-next-btn'); return b.hidden ? null : b.textContent; });
      r.check('review: Next is offered (' + label + ')', /^Next: \d+ (capital|flag|countr)/.test(label || ''), label);
      await st(page, () => document.getElementById('review-next-btn').click());
      await page.waitForFunction((n) => window.__atlas.state.current && window.__t.screen() === 'game-screen' && window.__atlas.state.sequence.length === 0 && window.__atlas.map.round === window.__atlas.state.roundId && window.__atlas.state.startArg !== n, s.arg, { timeout: 30000 });
    }
  }
  r.eq('review: three practice rounds on the World levels, exactly the due names, largest first', rounds,
    ['capitals-world:France+Peru+Spain:true:Review', 'flags-world:Chad+Japan:true:Review', 'name-world:Kenya:true:Review']);
  const after = await st(page, () => ({ rec: localStorage.getItem('atlas-records'), focus: localStorage.getItem('atlas-focus') }));
  r.check('review: no records, no focus lists', !after.rec && !after.focus, after);

  // Totals: every skill's names once
  await st(page, () => window.__atlas.showView('stats'));
  const totals = await st(page, () => {
    const A = window.__atlas;
    const bySkill = {};
    A.LEVELS.filter(l => l.available).forEach(l => { (bySkill[l.skill] = bySkill[l.skill] || new Set()); l.names().forEach(n => bySkill[l.skill].add(n)); });
    const sizes = {};
    Object.keys(bySkill).forEach(k => { sizes[k] = bySkill[k].size; });
    const kpi = document.querySelector('.kpis .kpi');
    return { sizes: sizes, shown: kpi.querySelector('.of') ? kpi.querySelector('.of').textContent : kpi.querySelector('.kpi-sub').textContent,
      weak: Array.from(document.querySelectorAll('#stats-screen .weak li, #stats-screen [class*=weak] li')).map(li => li.textContent).slice(0, 8) };
  });
  r.check('totals: capital 184, flag 181, country-name 184', totals.sizes.capital === 184 && totals.sizes.flag === 181 && totals.sizes['country-name'] === 184, totals.sizes);
  console.log('      skill sizes: ' + JSON.stringify(totals.sizes) + ' · shown: ' + totals.shown);
  r.eq('no errors', h.errors, []);
  await h.close();
};

/* ----- results and share ----- */
groups.results = async () => {
  const h = await open();
  const page = h.page;
  await lib.startLevel(page, 'capitals-find-oceania');
  await lib.playRound(page, (i) => i === 0 ? 'miss' : i === 1 ? 'second' : 'first');
  const res = await st(page, () => ({
    label: document.querySelector('.results-bar') ? document.querySelector('.results-bar').textContent : '',
    rows: Array.from(document.querySelectorAll('#results-screen li')).map(li => li.textContent).filter(t => / · /.test(t)).length,
    gain: !!document.querySelector('.gain'), practice: !document.getElementById('practice-btn').hidden,
    viewMap: !!document.querySelector('[data-action="view-map"]')
  }));
  r.check('results: titled Oceania by Capital, with the mastery gain and Practice these', /Oceania by Capital/.test(res.label) && res.gain && res.practice, res);
  await st(page, () => document.querySelector('[data-action="share-results"]').click());
  await page.waitForTimeout(300);
  const shared = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  r.check('results: share text names the level and links to it', /Oceania by Capital/.test(shared) && /\?play=capitals-find-oceania/.test(shared), shared);
  // Practice these runs the focus names
  await st(page, () => document.getElementById('practice-btn').click());
  await page.waitForFunction(() => window.__atlas.state.practice && window.__atlas.state.current, null, { timeout: 20000 });
  const prac = await st(page, () => ({ n: window.__atlas.state.totalQuestions, mode: window.__atlas.state.gameMode }));
  r.eq('results: Practice these asks the two to revisit', prac, { n: 2, mode: 'capital-find' });
  await finish(page);
  // View on the map after a Name It round: nothing to type
  await lib.startLevel(page, 'name-oceania');
  await finish(page);
  await st(page, () => document.querySelector('[data-action="view-map"]').click());
  const review = await st(page, () => ({ hud: getComputedStyle(document.querySelector('.hud-top')).display, marks: window.__atlas.map.marks.size, screen: window.__t.screen() }));
  r.check('results: View on the map shows the marks and no field', review.hud === 'none' && review.marks === 7 && review.screen === 'game-screen', review);
  await page.keyboard.press('Escape');
  r.eq('no errors', h.errors, []);
  await h.close();
};

/* ----- keyboard: the on-screen keyboard's share of the window ----- */
groups.keyboard = async () => {
  if (!MOBILE) { console.log('      (keyboard group runs with --mobile)'); return; }
  const h = await open({ fast: 8 });
  const page = h.page;
  await lib.startLevel(page, 'name-world', { practice: ['New Zealand', 'Chile', 'Iceland'] });
  await page.waitForTimeout(700);
  const full = await st(page, () => ({ h: document.getElementById('game-screen').getBoundingClientRect().height, kb: document.getElementById('game-screen').classList.contains('kb-open') }));
  // The keyboard comes up: the visual viewport loses its lower 336 px
  await st(page, () => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => 844 - 336 });
    vv.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => document.getElementById('game-screen').classList.contains('kb-open'), null, { timeout: 3000 });
  await page.waitForTimeout(1500);
  const up = await st(page, () => {
    const A = window.__atlas, g = A.globe;
    const screen = document.getElementById('game-screen').getBoundingClientRect();
    const host = document.getElementById('globe-host').getBoundingClientRect();
    const p = g.project(g.anchor('world', A.map.promptKey));
    const skip = document.getElementById('skip-btn').getBoundingClientRect();
    const card = document.getElementById('prompt').getBoundingClientRect();
    return { screenH: screen.height, y: host.top + p.y, x: host.left + p.x, z: p.z, skipBottom: skip.bottom, skipTop: skip.top, cardBottom: card.bottom,
      legend: getComputedStyle(document.getElementById('game-legend')).display, focused: document.activeElement === document.getElementById('answer-input') };
  });
  r.check('keyboard: the game screen shrinks to what is visible', full.h === 844 && !full.kb && up.screenH === 508, { full, up });
  r.check('keyboard: Skip sits above the keyboard', up.skipBottom <= 508, up);
  r.check('keyboard: the marked country is between the card and Skip, in sight', up.z > 0.3 && up.y > up.cardBottom && up.y < up.skipTop && up.x > 0 && up.x < 390, up);
  r.check('keyboard: the tally makes way, the field keeps the focus', up.legend === 'none' && up.focused, up);
  // Next question: still in the visible part
  const b = await seq(page);
  await st(page, () => window.__t.attempt(true));
  await next(page, b);
  await page.waitForTimeout(1200);
  const nextQ = await st(page, () => {
    const A = window.__atlas, g = A.globe, host = document.getElementById('globe-host').getBoundingClientRect();
    const p = g.project(g.anchor('world', A.map.promptKey));
    return { y: host.top + p.y, z: p.z, top: document.getElementById('prompt').getBoundingClientRect().bottom, bottom: document.getElementById('skip-btn').getBoundingClientRect().top,
      focused: document.activeElement === document.getElementById('answer-input') };
  });
  r.check('keyboard: the next country is in the visible part too, field still focused', nextQ.z > 0.3 && nextQ.y > nextQ.top && nextQ.y < nextQ.bottom && nextQ.focused, nextQ);
  // The keyboard goes away
  await st(page, () => {
    const vv = window.visualViewport;
    delete vv.height;
    vv.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => !document.getElementById('game-screen').classList.contains('kb-open'), null, { timeout: 3000 });
  const down = await st(page, () => document.getElementById('game-screen').getBoundingClientRect().height);
  r.eq('keyboard: the screen takes the whole window again', down, 844);
  r.eq('no errors', h.errors, []);
  await h.close();
};

(async () => {
  for (const name of Object.keys(groups)) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log('--- ' + name);
    try {
      await groups[name]();
    } catch (e) {
      r.check(name + ': ran to the end', false, String(e && e.stack || e).slice(0, 600));
    }
  }
  process.exit(r.done() ? 0 : 1);
})();
