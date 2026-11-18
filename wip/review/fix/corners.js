// At the opening view of each level on a phone: which of the things the round asks for lie under the HUD?
//   node corners.js [--root=dir] [--size=p390|p360] [--levels=a,b] [--shots]
'use strict';
const path = require('path');
const { open, startLevel } = require('../globe/rlib.js');
const lib = require('../../integration/logic-tests/lib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const LEVELS = (opt('levels', '') || 'north-america,africa,europe,asia,south-america,oceania,flags-north-america,flags-africa,flags-oceania,capitals-find-north-america,india-states,china-provinces,canada-provinces,russia-west,russia-south,russia-east,us-state,northeast-cities,south-cities,pin-africa,pin-north-america,pin-europe,pin-asia,pin-south-america,pin-oceania').split(',');
(async () => {
  for (const size of opt('size', 'p390,p360').split(',')) {
    const h = await open({ size: size, root: opt('root', undefined), seedStorage: { 'atlas-theme': 'light', 'atlas-hint-seen': '1' } });
    const cities = lib.pinCitiesFromSource();
    for (const key of LEVELS) {
      const arg = await h.page.evaluate(k => window.__atlas.levelByKey(k).arg, key);
      await startLevel(h.page, arg);
      await h.page.waitForTimeout(700);
      const res = await h.page.evaluate((cities) => {
        const A = window.__atlas, g = A.globe, m = A.map, st = A.state;
        const host = document.getElementById('globe-host'), hr = host.getBoundingClientRect();
        let spots = [];
        if (st.pin) spots = Object.keys(cities).filter(n => cities[n].region === st.currentContinent).map(n => [n, [cities[n].lon, cities[n].lat]]);
        else if (st.gameMode === 'us-city') spots = m.dots.map(d => [d.name, d.lonlat]);
        else m.eligible.forEach(k => { const at = g.anchor(m.layer, k); if (at) spots.push([k.slice(5), at]); });
        const under = [];
        spots.forEach(([name, at]) => {
          const p = g.project(at);
          if (!p.visible) { under.push(name + ':hidden'); return; }
          const el = document.elementFromPoint(hr.left + p.x, hr.top + p.y);
          if (el && !host.contains(el) && !el.closest('.map-hint')) { let e = el; while (e && !e.id) e = e.parentElement; under.push(name + ':' + (e ? e.id : el.className)); }
        });
        const v = g.getView();
        return { n: spots.length, under: under, k: +v.k.toFixed(3), atHome: Math.abs(v.k - m.home.k) < 1e-6 };
      }, cities);
      console.log(size + ' ' + key + ': ' + res.n + ' spots, k ' + res.k + (res.atHome ? '' : ' (not home)') + ', under the HUD: ' + (res.under.length ? res.under.join(', ') : 'none'));
      if (args.includes('--shots')) await h.page.screenshot({ path: path.join(__dirname, 'shots', 'corner-' + size + '-' + key + (opt('root', '') ? '-old' : '') + '.png') });
      await h.page.evaluate(() => document.getElementById('back-btn').click());
      await h.page.waitForFunction(() => document.body.dataset.screen === 'menu');
    }
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
