// Screenshots of the country quizzes, for one window size and theme per run.
//   NODE_PATH=/opt/node-tools/node_modules node shoot-modes.js [--mobile] [--dark] [--only=scene,scene]
// Writes $S/shots/app/modes/<scene>-<d|m>-<light|dark>.png. Scenes are listed in SCENES below.
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
const DARK = args.includes('--dark');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : null;
const OUT = path.join(S, 'shots/app/modes');
const TAG = (MOBILE ? 'm' : 'd') + '-' + (DARK ? 'dark' : 'light');

// Delays in the page run window.__speed times faster (1 = as written); set per scene
function speedScript() {
  window.__speed = 1;
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    return st.apply(window, [fn, ms > 50 ? ms / window.__speed : ms].concat(rest));
  };
}
function noFlagsScript() {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text) {
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(String(text))) return;
    return fill.apply(this, arguments);
  };
}

async function open(opts) {
  opts = opts || {};
  const seed = Object.assign({}, opts.seed || {}, { 'atlas-theme': DARK ? 'dark' : 'light' });
  if (opts.diff) seed['atlas-difficulty'] = opts.diff;
  const size = MOBILE ? { mobile: true, dpr: 2 } : { width: 1280, height: 800 };
  const h = await lib.launchApp(Object.assign({ seedStorage: seed, beforeLoad: async hh => {
    await hh.context.addInitScript(speedScript);
    if (opts.noFlags) await hh.context.addInitScript(noFlagsScript);
  } }, size));
  return h;
}
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '-' + TAG + '.png') });
  console.log('shot ' + name + '-' + TAG);
};
const speed = (page, n) => page.evaluate(v => { window.__speed = v; }, n);
const settle = (page, ms) => page.waitForTimeout(ms || 900);
const seqLen = page => page.evaluate(() => window.__atlas.state.sequence.length);
async function next(page, before) {
  await page.waitForFunction((b) => { const s = window.__t.snapshot(); return s.screen !== 'game-screen' || (!s.locked && s.seq > b && s.current); }, before, { timeout: 30000 });
}
// Answers the first question right at speed, so the map has a mark on it when the shot is taken
async function warmUp(page, n) {
  await speed(page, 25);
  for (let i = 0; i < n; i++) {
    const b = await seqLen(page);
    await page.evaluate(() => window.__t.attempt(true));
    await next(page, b);
  }
  await speed(page, 1);
  await settle(page, 900);
}

// In play: a right answer, a wrong one, a reveal, for one level
async function inPlay(prefix, key, opts) {
  const h = await open(opts);
  const page = h.page;
  await lib.startLevel(page, key);
  await warmUp(page, 2);
  await shot(page, prefix + '-1-question');
  // A screenshot here can take over a second, so the page's delays are stretched while one is
  // taken: the toast and the reveal are still up when the picture is
  await speed(page, 0.3);
  // a wrong try
  await page.evaluate(() => window.__t.attempt(false));
  await settle(page, 450);
  await shot(page, prefix + '-2-wrong');
  // a second wrong: the reveal
  await page.evaluate(() => window.__t.attempt(false));
  await settle(page, 500);
  await shot(page, prefix + '-3-reveal');
  await speed(page, 25);
  await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 40000 });
  await speed(page, 1);
  await settle(page, 800);
  // a right answer
  await speed(page, 0.3);
  await page.evaluate(() => window.__t.attempt(true));
  await settle(page, 350);
  await shot(page, prefix + '-4-right');
  console.log('errors', JSON.stringify(h.errors));
  await h.close();
}

const SCENES = {
  pick: () => inPlay('pick', 'capitals-europe'),
  find: () => inPlay('find', 'capitals-find-africa'),
  flag: () => inPlay('flag', 'flags-south-america'),
  name: async () => {
    const h = await open();
    const page = h.page;
    await lib.startLevel(page, 'name-europe');
    await warmUp(page, 2);
    await speed(page, 0.3);
    await page.keyboard.type('Scot');
    await settle(page, 300);
    await shot(page, 'name-1-typing');
    // a real country from outside the level
    await page.evaluate(() => { document.getElementById('answer-input').value = ''; });
    await page.keyboard.type('Brazil');
    await page.keyboard.press('Enter');
    await settle(page, 450);
    await shot(page, 'name-2-outside');
    // not a country at all
    await page.keyboard.type('Atlantis');
    await page.keyboard.press('Enter');
    await settle(page, 450);
    await shot(page, 'name-2b-unknown');
    // a second wrong name: the reveal
    await page.evaluate(() => window.__t.attempt(false));
    await settle(page, 500);
    await shot(page, 'name-3-reveal');
    await speed(page, 25);
    await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 40000 });
    await speed(page, 1);
    await settle(page, 800);
    await speed(page, 0.3);
    // a near match: the toast gives the spelling
    const near = await page.evaluate(() => { const n = window.__atlas.state.current; return n.length > 7 ? n.slice(0, 3) + n.slice(4) : n; });
    await page.keyboard.type(near);
    await page.keyboard.press('Enter');
    await settle(page, 350);
    await shot(page, 'name-4-right');
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  },
  // Name It on a phone with the keyboard up: the lower 336 px of the window are not visible
  keyboard: async () => {
    if (!MOBILE) return;
    const h = await open();
    const page = h.page;
    await lib.startLevel(page, 'name-world', { practice: ['New Zealand', 'Chile', 'Iceland', 'Japan'] });
    await settle(page, 600);
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => 844 - 336 });
      vv.dispatchEvent(new Event('resize'));
      // Where the keyboard would be, for the picture
      const kb = document.createElement('div');
      kb.id = 'fake-keyboard';
      kb.textContent = 'on-screen keyboard (stand-in)';
      kb.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:336px;z-index:999;background:#cfd3d9;color:#555;display:grid;place-items:center;font:500 15px system-ui;border-top:1px solid #aab';
      document.body.appendChild(kb);
    });
    await settle(page, 1600);
    await page.keyboard.type('Chi');
    await shot(page, 'name-5-keyboard');
    await page.evaluate(() => { document.getElementById('answer-input').value = ''; window.__t.attempt(true); });
    await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 20000 });
    await settle(page, 1300);
    await shot(page, 'name-6-keyboard-next');
    await h.close();
  },
  uncharted: async () => {
    const h = await open({ diff: 'uncharted' });
    const page = h.page;
    await lib.startLevel(page, 'name-south-america');
    await warmUp(page, 1);
    await settle(page, 1500);
    await shot(page, 'name-7-uncharted');
    await lib.startLevel(page, 'capitals-africa');
    await warmUp(page, 1);
    await settle(page, 1500);
    await shot(page, 'pick-5-uncharted');
    await h.close();
  },
  world: async () => {
    const h = await open();
    const page = h.page;
    await lib.startLevel(page, 'capitals-world', { practice: ['Sri Lanka', 'Malta'] });
    await settle(page, 1500);
    await shot(page, 'pick-6-world');
    await speed(page, 25);
    const b = await seqLen(page);
    await page.evaluate(() => window.__t.attempt(true));
    await next(page, b);
    await speed(page, 1);
    await settle(page, 1500);
    await shot(page, 'pick-7-world-next');
    await h.close();
  },
  library: async () => {
    const seed = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-quiz.json'), 'utf8'));
    const h = await open({ seed: seed });
    const page = h.page;
    const toCollection = async key => {
      await page.evaluate(k => { document.getElementById('collection-' + k).scrollIntoView({ block: 'start' }); document.getElementById('menu-screen').scrollBy(0, -70); }, key);
      await settle(page, 400);
    };
    await toCollection('capitals');
    await shot(page, 'library-1-capitals-pick');
    await page.evaluate(() => document.querySelector('#collection-capitals [data-value="find"]').click());
    await toCollection('capitals');
    await shot(page, 'library-2-capitals-find');
    await toCollection('flags');
    await shot(page, 'library-3-flags-name');
    for (const key of ['capitals-find-europe', 'flags-europe', 'name-europe']) {
      await page.evaluate(k => document.querySelector('[data-level="' + k + '"]').click(), key);
      await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
      await settle(page, 500);
      await shot(page, 'sheet-' + key);
      await page.evaluate(() => document.querySelector('[data-action="sheet-close"]').click());
    }
    await page.evaluate(() => document.querySelector('#collection-capitals [data-value="pick"]').click());
    await page.evaluate(() => document.querySelector('[data-level="capitals-europe"]').click());
    await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
    await settle(page, 500);
    await shot(page, 'sheet-capitals-europe');
    await page.evaluate(() => document.querySelector('[data-action="sheet-close"]').click());
    // Stats with the new skills
    await page.evaluate(() => window.__atlas.showView('stats'));
    await settle(page, 600);
    await shot(page, 'stats-1-top');
    await page.evaluate(() => {
      // Phones fold the mastery table: open the three new groups
      ['capitals', 'flags', 'name'].forEach(k => { const b = document.querySelector('[data-action="toggle-stats-group"][data-collection="' + k + '"]'); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); });
      document.querySelector('[data-action="toggle-stats-group"][data-collection="capitals"]').scrollIntoView({ block: 'start' });
      document.getElementById('stats-screen').scrollBy(0, -80);
    });
    await settle(page, 400);
    await shot(page, 'stats-2-mastery');
    await page.evaluate(() => { const el = document.getElementById('stats-records-title'); el.scrollIntoView({ block: 'start' }); document.getElementById('stats-screen').scrollBy(0, -80); });
    await settle(page, 400);
    await shot(page, 'stats-3-records');
    await page.evaluate(() => window.__atlas.showView('settings'));
    await page.evaluate(() => { const el = document.querySelector('.credits'); el.scrollIntoView({ block: 'center' }); });
    await settle(page, 400);
    await shot(page, 'settings-credits');
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  },
  results: async () => {
    const h = await open();
    const page = h.page;
    for (const [name, key] of [['pick', 'capitals-south-america'], ['find', 'capitals-find-south-america'], ['flag', 'flags-oceania'], ['name', 'name-south-america']]) {
      await lib.startLevel(page, key);
      await speed(page, 25);
      await lib.playRound(page, i => i === 1 ? 'miss' : i === 3 ? 'second' : i === 4 ? 'skip' : 'first');
      await speed(page, 1);
      await settle(page, 900);
      await shot(page, 'results-' + name);
      if (MOBILE) {
        await page.evaluate(() => { const el = document.getElementById('results-detail'); if (el) el.scrollIntoView({ block: 'start' }); });
        await settle(page, 300);
        await shot(page, 'results-' + name + '-detail');
      }
    }
    console.log('errors', JSON.stringify(h.errors));
    await h.close();
  },
  noflags: async () => {
    const h = await open({ noFlags: true });
    const page = h.page;
    await page.evaluate(() => document.querySelector('[data-level="flags-europe"]').click());
    await page.waitForFunction(() => window.__atlas.state.flagsOff, null, { timeout: 15000 });
    await page.evaluate(() => { document.getElementById('collection-flags').scrollIntoView({ block: 'start' }); document.getElementById('menu-screen').scrollBy(0, -70); });
    await settle(page, 500);
    await shot(page, 'library-4-flags-unavailable');
    await h.close();
  }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of Object.keys(SCENES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    try { await SCENES[name](); } catch (e) { console.log('SCENE FAILED ' + name + ': ' + String(e && e.stack || e).slice(0, 500)); }
  }
})();
