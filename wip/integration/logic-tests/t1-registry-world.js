// Level registry, slugs, B1 (Australia), a continent round and The World, with the mastery store checked after each
'use strict';
const { launchApp, startLevel, playRound, snap, reporter } = require('./lib.js');

const EXPECTED_SLUGS = ['world', 'daily', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania',
  'us-state', 'us-capital-to-state', 'us-state-to-capital', 'northeast-cities', 'midwest-cities', 'south-cities', 'west-cities',
  'canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east',
  'pin-world', 'pin-africa', 'pin-asia', 'pin-europe', 'pin-north-america', 'pin-south-america', 'pin-oceania'];

(async () => {
  const r = reporter('registry + world');
  const h = await launchApp({ fast: true, noPaint: true });
  const page = h.page;
  try {
    const reg = await page.evaluate(() => {
      const A = window.__atlas;
      return {
        version: A.version,
        keys: A.LEVELS.map(l => l.key),
        fields: A.LEVELS.map(l => Object.keys(l).sort().join(',')),
        levels: A.LEVELS.map(l => ({ key: l.key, collection: l.collection, title: l.title, arg: l.arg, mode: l.mode, skill: l.skill,
          noun: l.noun, available: l.available, ready: l.ready(), n: l.names().length, count: l.count() })),
        byKey: A.levelByKey('china-provinces').arg, none: A.levelByKey('atlantis')
      };
    });
    r.eq('hook version', reg.version, 2);
    r.eq('27 levels', reg.keys.length, 27);
    r.eq('every old slug is a level key (plus daily)', EXPECTED_SLUGS.filter(s => s !== 'daily').sort(), reg.keys.slice().sort());
    r.check('level keys are unique', new Set(reg.keys).size === reg.keys.length);
    r.check('every level has the same fields', new Set(reg.fields).size === 1, reg.fields[0]);
    r.eq('levelByKey', [reg.byKey, reg.none], ['china-provinces', null]);
    console.log(reg.levels.map(l => '   ' + [l.key, l.collection, l.title, l.arg, l.mode, l.skill, l.noun, l.available, l.ready, l.n].join(' | ')).join('\n'));
    const by = {}; reg.levels.forEach(l => { by[l.key] = l; });
    r.eq('The World has 184 countries (Australia back)', by.world.n, 184);
    r.eq('Oceania has 7', by.oceania.n, 7);
    r.eq('continents sum to the world', ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'].reduce((a, k) => a + by[k].n, 0), 184);
    r.eq('US levels know their 50 states before the map loads', [by['us-state'].n, by['us-state'].ready], [50, true]);
    r.eq('Northeast cities', [by['northeast-cities'].n, by['northeast-cities'].available], [40, true]);
    r.eq('unbuilt city regions are flagged', ['midwest-cities', 'south-cities', 'west-cities'].map(k => [by[k].available, by[k].n]), [[false, 0], [false, 0], [false, 0]]);
    r.eq('province names wait for their map', [by['china-provinces'].ready, by['china-provinces'].n], [false, 0]);
    r.eq('pin levels', [by['pin-world'].n, by['pin-europe'].n], [120, 20]);
    // count(): the same as names().length wherever names() is ready, and already right for provinces
    r.eq('count() matches names() on every ready level', reg.levels.filter(l => l.ready && l.count !== l.n).map(l => l.key), []);
    r.eq('province levels know their size before their map loads',
      ['canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east'].map(k => by[k].count), [13, 33, 36, 29, 27, 27]);

    // load() makes names() complete
    const prov = await page.evaluate(async () => {
      const out = {};
      for (const key of ['canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east']) {
        const l = window.__atlas.levelByKey(key);
        await l.load();
        out[key] = [l.ready(), l.names().length, l.count()];
      }
      return out;
    });
    r.eq('province levels after load() (ready, names, count)', prov, { 'canada-provinces': [true, 13, 13], 'china-provinces': [true, 33, 33], 'india-states': [true, 36, 36],
      'russia-west': [true, 29, 29], 'russia-south': [true, 27, 27], 'russia-east': [true, 27, 27] });

    // Skill names are unique inside each skill
    const dup = await page.evaluate(() => {
      const bySkill = {};
      window.__atlas.LEVELS.forEach(l => { (bySkill[l.skill] = bySkill[l.skill] || []).push(l); });
      const out = {};
      Object.keys(bySkill).forEach(skill => {
        // within one level a repeated name is always a clash; across levels it is one only if the levels are different sets
        bySkill[skill].forEach(l => { const n = l.names(); if (new Set(n).size !== n.length) out[l.key] = 'repeats a name'; });
      });
      const cityNames = [].concat.apply([], window.__atlas.LEVELS.filter(l => l.mode === 'us-city').map(l => l.names()));
      if (new Set(cityNames).size !== cityNames.length) out['us-city'] = 'a city name repeats across regions';
      return out;
    });
    r.eq('no name is shared by two items of a skill', dup, {});

    // Menu still draws, with the new counts
    const menu = await page.evaluate(() => document.querySelector('.region-card.featured .r-count').textContent);
    r.check('main menu shows 184 countries', /184 countries/.test(menu), menu);

    // ---- Oceania: one of each outcome, then first tries ----
    await startLevel(page, 'Oceania');
    const start = await page.evaluate(() => [window.__atlas.state.current].concat(window.__atlas.state.queue));
    r.check('Australia is asked for in Oceania', start.includes('Australia'), start);
    const log = await playRound(page, (i) => ['second', 'miss', 'skip'][i] || 'first');
    r.eq('7 questions', log.length, 7);
    const m = await page.evaluate(() => {
      const A = window.__atlas;
      return { store: JSON.parse(localStorage.getItem('atlas-mastery')), today: A.mastery.today(),
        summary: A.mastery.summary('country', A.levelByKey('oceania').names()),
        records: JSON.parse(localStorage.getItem('atlas-records')), focus: JSON.parse(localStorage.getItem('atlas-focus')) };
    });
    r.eq('mastery skills after Oceania', Object.keys(m.store.items), ['country']);
    r.eq('7 countries recorded', Object.keys(m.store.items.country).sort(), log.map(x => x.name).sort());
    const want = {}; log.forEach(x => { want[x.name] = x.outcome; });
    const got = await page.evaluate((names) => {
      const out = {};
      names.forEach(n => { const g = window.__atlas.mastery.get('country', n); out[n] = g.first ? 'first' : g.second ? 'second' : 'miss'; });
      return out;
    }, log.map(x => x.name));
    r.eq('each country has the outcome that was played', got, want);
    r.eq('one session: 7 questions, 4 first try', m.store.days[m.today].slice(0, 3), [1, 7, 4]);
    r.eq('summary counts', [m.summary.total, m.summary.seen, m.summary.new], [7, 7, 0]);
    r.check('record saved under the old key', !!m.records['world-country|Oceania|normal'] && m.records['world-country|Oceania|normal'].gamesPlayed === 1, Object.keys(m.records));
    r.eq('record score', m.records['world-country|Oceania|normal'].bestScore, Object.assign({}, m.records['world-country|Oceania|normal'].bestScore, { value: 9, max: 14 }));
    r.eq('focus list = missed then second-try', m.focus['world-country|Oceania'].names, log.filter(x => x.outcome === 'miss').map(x => x.name).concat(log.filter(x => x.outcome === 'second').map(x => x.name)));
    await page.screenshot({ path: __dirname + '/../../../shots/app/logic/results-oceania.png' });

    // ---- Focus practice from the results screen: records untouched, mastery grows ----
    await page.click('#practice-btn');
    await page.waitForFunction(() => window.__t.snapshot().screen === 'game-screen' && window.__t.snapshot().current);
    const ps = await snap(page);
    r.eq('practice round asks the 3 to revisit', [ps.practice, ps.total], [true, 3]);
    await playRound(page);
    const m2 = await page.evaluate(() => ({ store: JSON.parse(localStorage.getItem('atlas-mastery')), today: window.__atlas.mastery.today(),
      records: JSON.parse(localStorage.getItem('atlas-records')) }));
    r.eq('practice is a second session', m2.store.days[m2.today].slice(0, 3), [2, 10, 7]);
    r.eq('practice leaves records alone', m2.records['world-country|Oceania|normal'].gamesPlayed, 1);

    // ---- The World: Australia asked, all 184 recorded ----
    await page.click('#home-btn');
    await startLevel(page, 'World');
    const wlog = await playRound(page);
    r.eq('The World asks 184', wlog.length, 184);
    r.check('Australia is asked for in The World', wlog.some(x => x.name === 'Australia'));
    const m3 = await page.evaluate(() => {
      const A = window.__atlas;
      return { n: Object.keys(JSON.parse(localStorage.getItem('atlas-mastery')).items.country).length,
        bytes: A.mastery.byteSize(), summary: A.mastery.summary('country', A.levelByKey('world').names()),
        rec: JSON.parse(localStorage.getItem('atlas-records'))['world-country|World|normal'] };
    });
    r.eq('184 countries in the store', m3.n, 184);
    r.eq('World record', [m3.rec.bestScore.value, m3.rec.bestScore.max, m3.rec.bestAccuracy.pct], [368, 368, 100]);
    console.log('   mastery store after The World: ' + m3.bytes + ' chars; summary ' + JSON.stringify(m3.summary));
    r.eq('no page errors', h.errors, []);
  } catch (e) {
    r.check('script ran to the end', false, String(e && e.stack || e));
  }
  await h.close();
  process.exit(r.done() ? 0 : 1);
})();
