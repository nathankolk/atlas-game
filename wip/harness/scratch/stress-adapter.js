'use strict';
// Adapter stress test: for every item of a level, MapAdapter.answer() must put a real click or
// tap on that item. Clicks are swallowed before the game sees them, so nothing has to wait.
//   node stress-adapter.js [--mobile] [slug ...]
const path = require('path');
const smoke = require('../smoke.js');
const { MapAdapter, Check, openLevel, OPT } = smoke;
const args = process.argv.slice(2);
OPT.mobile = args.includes('--mobile');
OPT.root = path.join(__dirname, '..', 'app-copy');
const slugs = args.filter(a => !a.startsWith('--'));
const LEVELS = slugs.length ? slugs : ['world', 'europe', 'oceania', 'us-state', 'northeast-cities', 'canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east'];
(async () => {
  let bad = 0;
  for (const slug of LEVELS) {
    const t = new Check('stress');
    const sess = await t.open();
    const page = sess.page;
    const t0 = Date.now();
    const st = await openLevel(sess, slug);
    await page.evaluate(() => {
      window.__got = null;
      document.addEventListener('click', e => {
        const svg = document.getElementById('world-map');
        if (!svg.contains(e.target)) return;
        e.stopPropagation();
        const s = window.__atlas.state;
        const d = e.target.__data__;
        let name = null;
        if (d && d.name && e.target.classList.contains('city-dot')) name = d.name;
        else if (d) {
          const maps = [s.featureByCanonical, s.usFeatureByCanonical].concat(Object.values(s.provinceStores || {}).map(x => x.featureByCanonical));
          for (const m of maps) for (const [n, f] of m) if (f === d) name = n;
        }
        window.__got = { name: name, cls: e.target.getAttribute('class') };
      }, true);
    });
    const names = [st.current].concat(st.queue);
    const before = Object.assign({}, MapAdapter.counts);
    const wrong = [];
    for (const name of names) {
      await page.evaluate(() => { window.__got = null; });
      try {
        await MapAdapter.answer(page, name);
        await page.waitForFunction(() => window.__got !== null, null, { timeout: 1500, polling: 20 }).catch(() => {});
        const got = await page.evaluate(() => window.__got);
        if (!got || got.name !== name) wrong.push(name + ' -> ' + JSON.stringify(got));
      } catch (e) { wrong.push(name + ' threw ' + e.message); }
    }
    const c = MapAdapter.counts;
    console.log((OPT.mobile ? 'M ' : 'D ') + slug.padEnd(18) + String(names.length).padStart(4) + ' items, ' +
      (c.zoomed - before.zoomed) + ' zoomed, ' + (c.synthetic - before.synthetic) + ' synthetic, ' + wrong.length + ' wrong, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    wrong.slice(0, 12).forEach(w => console.log('     ' + w));
    bad += wrong.length;
    await sess.close();
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
