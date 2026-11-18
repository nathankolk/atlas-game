// Traces the clear area, the opening zoom and the prompt card's box through the start of a round
const { open } = require('./rlib.js');
const size = process.argv[2] || 'd1280';
const seq = (process.argv[3] || 'world,flags-world,flags-europe,world,capitals-world,name-world,europe').split(',');
(async () => {
  const h = await open({ size: size, reducedMotion: !process.argv.includes('--motion') });
  for (let arg of seq) {
    if (arg[0] === '!') {
      arg = arg.slice(1);
      await h.page.goto(h.url);
      await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && window.__atlas.globe, null, { timeout: 30000 });
      await h.page.waitForTimeout(400);
      console.log('-- reloaded');
    }
    const trace = await h.page.evaluate(async (a) => {
      const A = window.__atlas, out = [];
      const snap = tag => {
        const card = document.getElementById('prompt').getBoundingClientRect();
        const host = document.getElementById('globe-host').getBoundingClientRect();
        const c = A.map.clear || {};
        return tag + ' card=' + Math.round(card.top) + '..' + Math.round(card.bottom) + ' x' + Math.round(card.left) + '..' + Math.round(card.right) + ' clearTop=' + Math.round(c.top) + ' clearBot=' + Math.round(c.bottom) + ' hostTop=' + Math.round(host.top) + ' hostH=' + Math.round(host.height) + ' k=' + (A.map.home ? A.map.home.k.toFixed(3) : '-') + ' view.k=' + A.globe.getView().k.toFixed(3) + ' cur=' + A.state.current + ' round=' + A.map.round + '/' + A.state.roundId;
      };
      out.push(snap('before'));
      const p = A.startGame(a);
      let last = '';
      const t0 = performance.now();
      while (performance.now() - t0 < 2200) {
        const s = snap('').replace(/^ /, '');
        if (s !== last) { out.push(Math.round(performance.now() - t0) + 'ms ' + s); last = s; }
        await new Promise(r => setTimeout(r, 8));
      }
      await p;
      return out;
    }, arg);
    console.log('== ' + arg + ' (' + size + ')\n' + trace.join('\n'));
  }
  await h.close();
})();
