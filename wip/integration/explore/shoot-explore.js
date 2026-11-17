// Screenshots of the Explore view and of Learn on the wider set of levels, one window size and theme per run.
//   NODE_PATH=/opt/node-tools/node_modules node shoot-explore.js [--mobile] [--dark] [--only=scene,scene]
// Writes $S/shots/app/explore/<scene>-<d|m>-<light|dark>.png. Scenes are the keys of SCENES below.
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
const OUT = path.join(S, 'shots/app/explore');
const sizeArg = args.find(a => a.startsWith('--size='));
const SIZE = sizeArg ? sizeArg.slice(7).split('x').map(Number) : null;
const TAG = (SIZE ? SIZE.join('x') : MOBILE ? 'm' : 'd') + '-' + (DARK ? 'dark' : 'light');
const SEED = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-quiz.json'), 'utf8'));

async function open(opts) {
  opts = opts || {};
  const seed = Object.assign({}, opts.seed === null ? {} : (opts.seed || SEED), { 'atlas-theme': DARK ? 'dark' : 'light' }, opts.extra || {});
  const size = SIZE ? { width: SIZE[0], height: SIZE[1] } : MOBILE ? { mobile: true, dpr: 2 } : { width: 1280, height: 800 };
  return lib.launchApp(Object.assign({ seedStorage: seed, query: opts.query || '' }, size));
}
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '-' + TAG + '.png') });
  console.log('shot ' + name + '-' + TAG);
};
const settle = (page, ms) => page.waitForTimeout(ms || 900);
// Waits until the globe has stopped moving and has drawn what it was last given
async function still(page) {
  await page.waitForFunction(() => {
    const g = window.__atlas.globe;
    if (!g) return false;
    const v = g.getView();
    const key = v.lon.toFixed(4) + ',' + v.lat.toFixed(4) + ',' + v.k.toFixed(4);
    const same = window.__lastView === key;
    window.__lastView = key;
    return same && window.__atlas.map.drawn;
  }, null, { timeout: 30000, polling: 400 });
  await settle(page, 500);
}
async function explore(page) {
  await page.evaluate(() => { location.hash = '#explore'; });
  await page.waitForFunction(() => document.body.dataset.screen === 'explore' && window.__atlas.explore.on, null, { timeout: 20000 });
  await still(page);
}
async function pick(page, name) {
  await page.evaluate(n => window.__atlas.selectCountry(n), name);
  await still(page);
}
const colour = (page, value) => page.evaluate(v => document.querySelector('[data-action="explore-colour"][data-value="' + v + '"]').click(), value);

const SCENES = {
  // Explore with nothing selected, then a large country, a small island and one with many neighbours
  async explore() {
    const h = await open();
    const page = h.page;
    await explore(page);
    await shot(page, 'explore-1-open');
    await pick(page, 'Brazil');
    await shot(page, 'explore-2-brazil');
    await pick(page, 'Barbados');
    await shot(page, 'explore-3-barbados');
    await pick(page, 'Germany');
    await shot(page, 'explore-4-germany');
    await pick(page, 'France');
    await shot(page, 'explore-5-france');
    await pick(page, 'South Africa');
    await shot(page, 'explore-6-south-africa');
    await pick(page, 'Russia');
    await shot(page, 'explore-7-russia');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // Search with results, and with none
  async search() {
    const h = await open();
    const page = h.page;
    await explore(page);
    await page.click('#explore-search');
    await page.keyboard.type('gui', { delay: 30 });
    await settle(page, 400);
    await shot(page, 'explore-search-1-results');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await still(page);
    await shot(page, 'explore-search-2-picked');
    await page.click('#explore-search');
    await page.keyboard.type('holl', { delay: 30 });
    await settle(page, 400);
    await shot(page, 'explore-search-3-alias');
    await page.fill('#explore-search', 'atlantis');
    await settle(page, 400);
    await shot(page, 'explore-search-4-none');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // Each Colour by setting for a seeded player, with and without a country selected
  async colour() {
    const h = await open();
    const page = h.page;
    await explore(page);
    for (const key of ['country', 'country-name', 'capital', 'flag']) {
      await colour(page, key);
      await still(page);
      await shot(page, 'explore-colour-' + key);
    }
    await pick(page, 'India');
    await shot(page, 'explore-colour-flag-india');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // Satellite: plain, a country selected, coloured by a skill
  async satellite() {
    const h = await open({ extra: { 'atlas-map-style': 'satellite' } });
    const page = h.page;
    await explore(page);
    await settle(page, 1500);
    await shot(page, 'explore-sat-1-open');
    await pick(page, 'Egypt');
    await settle(page, 1500);
    await shot(page, 'explore-sat-2-egypt');
    await colour(page, 'country');
    await still(page);
    await shot(page, 'explore-sat-3-coloured');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // The Stats link arriving in Explore, coloured by the skill it named
  async stats() {
    const h = await open();
    const page = h.page;
    await page.evaluate(() => { location.hash = '#stats'; });
    await settle(page, 700);
    await page.evaluate(() => document.querySelector('[data-action="see-on-globe"]').scrollIntoView({ block: 'center' }));
    await settle(page, 300);
    await shot(page, 'explore-stats-1-link');
    await page.evaluate(() => document.querySelector('[data-action="see-on-globe"][data-value="capital"]').click());
    await page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 10000 });
    await still(page);
    await shot(page, 'explore-stats-2-arrived');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // Other window shapes: a country selected with the colours on
  async sizes() {
    const h = await open();
    const page = h.page;
    await explore(page);
    await colour(page, 'country');
    await pick(page, 'Germany');
    await shot(page, 'explore-size-germany');
    await page.click('#explore-search');
    await page.keyboard.type('sa', { delay: 30 });
    await settle(page, 400);
    await shot(page, 'explore-size-search');
    await h.close();
  },
  // A deep link, and a brand-new player
  async link() {
    const h = await open({ query: '#explore=japan', seed: null });
    const page = h.page;
    await page.waitForFunction(() => window.__atlas.explore.on && window.__atlas.explore.selected, null, { timeout: 20000 });
    await still(page);
    await shot(page, 'explore-link-japan-new-player');
    console.log('errors: ' + JSON.stringify(h.errors));
    await h.close();
  },
  // Learn on a continent and on the States: the study panel a few levels in, then the quiz
  async learn() {
    for (const [key, arg, level] of (process.env.LEARN_ONLY ? [['europe', 'Europe', 9]] : [['europe', 'Europe', 9], ['africa', 'Africa', 22], ['us-state', 'us-state', 14]])) {
      const h = await open();
      const page = h.page;
      await page.evaluate(([k, lv]) => {
        const names = window.__atlas.levelByKey(k).names();
        const all = JSON.parse(localStorage.getItem('atlas-learn') || '{}');
        all[k] = { order: names, level: lv, savedAt: Date.now() };
        localStorage.setItem('atlas-learn', JSON.stringify(all));
      }, [key, level]);
      await lib.startLevel(page, arg, { learn: true });
      await still(page);
      await shot(page, 'learn-' + key + '-1-study');
      await page.click('#learn-ready-btn');
      await page.waitForFunction(() => window.__atlas.state.current, null, { timeout: 10000 });
      await still(page);
      await shot(page, 'learn-' + key + '-2-quiz');
      await h.close();
    }
  },
  // The level sheet offering Learn on a continent
  async learnsheet() {
    const h = await open();
    const page = h.page;
    await page.evaluate(() => document.querySelector('[data-action="open-level"][data-level="asia"]').click());
    await settle(page, 600);
    await shot(page, 'learn-sheet-asia');
    await h.close();
  }
};

(async () => {
  for (const name of Object.keys(SCENES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    try { await SCENES[name](); } catch (e) { console.log('SCENE FAILED ' + name + ': ' + (e.stack || e)); }
  }
  process.exit(0);
})();
