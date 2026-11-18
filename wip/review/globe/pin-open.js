// Pin the City at its opening view: which cities' true spots (where the player has to tap) are under a HUD element
//   node pin-open.js [--sizes=p360,p390] [--shot=pin-africa]
'use strict';
const fs = require('fs'), path = require('path');
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const sizes = opt('sizes', 'p360,p390').split(','), shoot = opt('shot', 'pin-africa,pin-north-america').split(',');
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
const pinSrc = html.slice(html.indexOf('const PIN_CITIES = {'));
const PIN = (new Function(pinSrc.slice(0, pinSrc.indexOf('\n  };') + 5) + '; return PIN_CITIES;'))();
(async () => {
  for (const size of sizes) {
    for (const key of ['pin-europe', 'pin-asia', 'pin-north-america', 'pin-africa', 'pin-south-america', 'pin-oceania']) {
      const h = await open({ size: size });
      const page = h.page;
      const lv = await page.evaluate(k => { const l = window.__atlas.levelByKey(k); return { arg: l.arg, names: l.names() }; }, key);
      await startLevel(page, lv.arg);
      await page.waitForFunction(() => !window.__atlas.state.interactionLocked && window.__atlas.state.current, null, { timeout: 20000 });
      await page.waitForTimeout(6500);      // the one-time zoom hint has gone
      const all = [].concat.apply([], Object.keys(PIN).map(r => PIN[r])).filter(c => lv.names.includes(c[0]));
      const res = await page.evaluate(cities => {
        const g = window.__atlas.globe, hr = document.getElementById('globe-host').getBoundingClientRect();
        const out = [];
        cities.forEach(c => {
          const p = g.project([c[3], c[2]]);
          const x = hr.left + p.x, y = hr.top + p.y;
          const el = p.visible ? document.elementFromPoint(x, y) : null;
          const hud = el && el.closest('#prompt, .mapctl, #game-legend, .game-actions, .gamebar, #toast, #zoom-hint');
          if (!p.visible || !el) out.push(c[0] + ' (out of sight)');
          else if (hud) out.push(c[0] + ' under ' + (el.id || hud.id || hud.className) + ' at ' + Math.round(x) + ',' + Math.round(y));
        });
        return out;
      }, all);
      console.log(size + ' ' + key + ' (' + all.length + ' cities): ' + (res.length ? res.join('; ') : 'all clear') + ' errors ' + JSON.stringify(h.errors));
      if (shoot.includes(key) && size === sizes[0]) await page.screenshot({ path: path.join(__dirname, 'shots', 'pinopen-' + size + '-' + key + '.png') });
      await h.close();
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
