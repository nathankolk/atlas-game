'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const mobile = process.argv.includes('--mobile');
  const h = await launch(Object.assign({ seedStorage: { 'atlas-theme': 'light' } }, mobile ? { mobile: true, dpr: 2 } : {}));
  await h.page.goto(h.url);
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.globe && window.__atlas.map.drawn, null, { timeout: 60000 });
  await h.page.waitForTimeout(800);
  const r = await h.page.evaluate(async arg => {
    const A = window.__atlas, g = A.globe, host = document.getElementById('globe-host'), log = [];
    const t0 = performance.now();
    const size = tag => log.push([tag, Math.round(performance.now() - t0), host.clientWidth, host.clientHeight, host.style.top, host.style.bottom, 'k=' + g.getView().k.toFixed(3), 'R=' + Math.round(g.radiusPx()), 'card=' + Math.round(document.getElementById('prompt').getBoundingClientRect().bottom), 'screen=' + document.body.dataset.screen]);
    const orig = g.resize.bind(g), res = g.resume.bind(g);
    g.resize = () => { size('resize'); return orig(); };
    g.resume = () => { size('resume'); return res(); };
    const sv = g.setView.bind(g); g.setView = v => { const r = sv(v); size('setView'); return r; };
    const fl = g.flyTo.bind(g); g.flyTo = (v, o) => { size('flyTo ' + JSON.stringify(v).slice(0, 60)); return fl(v, o); };
    size('before');
    A.startGame(arg);
    await new Promise(r => { const t = () => A.state.current ? r() : setTimeout(t, 2); t(); });
    size('question'); await new Promise(r => setTimeout(r, 600)); size('later');
    return log;
  }, process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'Europe');
  console.log(r.map(x => x.join(' ')).join('\n'));
  await h.close();
})();
