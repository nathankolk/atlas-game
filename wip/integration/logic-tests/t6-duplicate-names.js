// Name uniqueness inside a skill. Today's data has no clash, so this serves a copy of the app with two
// planted: a second Springfield in a new Midwest region, and a second Sydney among the pin cities.
'use strict';
const fs = require('fs');
const path = require('path');
const { launchApp, startLevel, answer, snap, installPinCities, reporter } = require('./lib.js');

const SRC = '/home/user/atlas-game/public';
const COPY = path.join(__dirname, '_dup-copy');

function makeCopy() {
  fs.rmSync(COPY, { recursive: true, force: true });
  fs.mkdirSync(COPY, { recursive: true });
  fs.symlinkSync(path.join(SRC, 'data'), path.join(COPY, 'data'));
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const a = "    ]\n    // Midwest / South / West populated in Stage 2.\n";
  if (html.split(a).length !== 2) throw new Error('city table anchor not found');
  html = html.replace(a, "    ],\n    'Midwest': [\n      { name: 'Springfield', state: 'Illinois', coords: [-89.6501, 39.7817] },\n      { name: 'Chicago', state: 'Illinois', coords: [-87.6298, 41.8781] }\n    ]\n");
  const b = "      ['Dunedin', 'New Zealand', -45.8788, 170.5028]\n";
  if (html.split(b).length !== 2) throw new Error('pin table anchor not found');
  html = html.replace(b, "      ['Dunedin', 'New Zealand', -45.8788, 170.5028],\n      ['Sydney', 'Canada', 46.1368, -60.1942]\n");
  fs.writeFileSync(path.join(COPY, 'index.html'), html);
}

(async () => {
  const r = reporter('duplicate names');
  makeCopy();
  const h = await launchApp({ fast: true, noPaint: true, root: COPY });
  const page = h.page;
  try {
    const reg = await page.evaluate(() => {
      const A = window.__atlas;
      const cities = [].concat.apply([], A.LEVELS.filter(l => l.mode === 'us-city').map(l => l.names()));
      const pins = A.levelByKey('pin-world').names();
      return { midwest: [A.levelByKey('midwest-cities').available, A.levelByKey('midwest-cities').names()],
        northeastHasBare: A.levelByKey('northeast-cities').names().includes('Springfield'),
        citiesUnique: new Set(cities).size === cities.length, pinsUnique: new Set(pins).size === pins.length, pinCount: pins.length,
        oceania: A.levelByKey('pin-oceania').names().filter(n => /Sydney/.test(n)) };
    });
    r.eq('the later Springfield is told apart by state; the earlier keeps its name', [reg.midwest, reg.northeastHasBare], [[true, ['Springfield, Illinois', 'Chicago']], true]);
    r.eq('US city names are unique across regions', reg.citiesUnique, true);
    r.eq('pin city names are unique; none is lost', [reg.pinsUnique, reg.pinCount, reg.oceania], [true, 121, ['Sydney', 'Sydney, Canada']]);

    // the Midwest round plays, and the prompt does not repeat the state
    await startLevel(page, 'midwest-cities');
    const seen = {};
    for (let i = 0; i < 2; i++) { const s = await snap(page); seen[s.current] = s.prompt; await answer(page, 'first'); }
    r.eq('prompts read "City, State" once', seen, { 'Springfield, Illinois': 'Springfield, Illinois', 'Chicago': 'Chicago, Illinois' });
    await page.waitForFunction(() => window.__t.screen() === 'results-screen');
    const m = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('atlas-mastery')).items['us-city']).sort());
    r.eq('mastery keeps the two Springfields apart', m, ['Chicago', 'Springfield, Illinois']);
    await page.evaluate(() => document.getElementById('home-btn').click());

    // Pin the City: the planted city is asked under its own name, shown by its plain label
    await installPinCities(page);
    await page.evaluate(() => { window.__pinCities['Sydney, Canada'] = { lat: 46.1368, lon: -60.1942 }; });
    await startLevel(page, 'pin-oceania');
    let found = null;
    for (let i = 0; i < 20 && !found; i++) {
      const s = await snap(page);
      if (s.screen !== 'game-screen') break;
      if (s.current === 'Sydney, Canada') found = await page.evaluate(() => document.getElementById('prompt-country').innerHTML);
      else await answer(page, 'skip');
    }
    if (found === null) console.log('   (the planted city was the one of 21 left out of this 20-city round; prompt not seen)');
    else r.eq('pin prompt shows the plain name and the country', found, 'Sydney<span class="pin-prompt-country">Canada</span>');
    r.eq('no page errors', h.errors, []);
  } catch (e) { r.check('ran to the end', false, String(e && e.stack || e)); }
  await h.close();
  fs.rmSync(COPY, { recursive: true, force: true });
  process.exit(r.done() ? 0 : 1);
})();
