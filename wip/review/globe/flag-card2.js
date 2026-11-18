const { open } = require('./rlib.js');
(async () => {
  const h = await open({ size: process.argv[2] || 'p390', reducedMotion: process.argv[3] !== 'motion' });
  const trace = await h.page.evaluate(async () => {
    const A = window.__atlas, out = [];
    const el = document.getElementById('prompt-country');
    const p = A.startGame('flags-europe');
    const t0 = performance.now();
    let last = '';
    while (performance.now() - t0 < 1200) {
      const cs = getComputedStyle(el);
      const anims = el.getAnimations().map(a => (a.animationName || a.transitionProperty || '?') + ':' + a.playState).join(',');
      const s = 'class=' + el.className + ' minH=' + cs.minHeight + ' font=' + cs.fontSize + ' family=' + cs.fontFamily.slice(0, 30) + ' transition=' + cs.transitionProperty + '/' + cs.transitionDuration + ' anims=[' + anims + '] fontsStatus=' + document.fonts.status + ' flagFace=' + Array.from(document.fonts).filter(f => /Flag/.test(f.family)).map(f => f.status).join(',');
      if (s !== last) { out.push(Math.round(performance.now() - t0) + 'ms ' + s); last = s; }
      await new Promise(r => setTimeout(r, 5));
    }
    return out;
  });
  console.log(trace.join('\n'));
  await h.close();
})();
