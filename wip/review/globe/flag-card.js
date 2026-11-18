const { open } = require('./rlib.js');
(async () => {
  const h = await open({ size: process.argv[2] || 'p390', reducedMotion: true });
  const trace = await h.page.evaluate(async () => {
    const A = window.__atlas, out = [];
    const el = document.getElementById('prompt-country'), card = document.getElementById('prompt');
    // Note what the card measures at the moment the game frames the map: wrap getBoundingClientRect on the card
    const orig = card.getBoundingClientRect.bind(card);
    card.getBoundingClientRect = function () { const r = orig(); out.push('  [card measured] ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' name.class=' + el.className + ' text=' + JSON.stringify(el.textContent) + ' minH=' + getComputedStyle(el).minHeight + ' screen=' + document.body.dataset.screen + ' gameActive=' + document.getElementById('game-screen').classList.contains('active')); return r; };
    const snap = () => { const r = orig(), n = el.getBoundingClientRect(), cs = getComputedStyle(el); return 'card=' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' name h=' + Math.round(n.height) + ' class=' + el.className + ' minH=' + cs.minHeight + ' font=' + cs.fontSize + ' text=' + JSON.stringify(el.textContent) + ' clearTop=' + (A.map.clear ? Math.round(A.map.clear.top) : '-') + ' screen=' + document.body.dataset.screen; };
    const p = A.startGame('flags-europe');
    let last = ''; const t0 = performance.now();
    while (performance.now() - t0 < 1500) { const s = snap(); if (s !== last) { out.push(Math.round(performance.now() - t0) + 'ms ' + s); last = s; } await new Promise(r => setTimeout(r, 5)); }
    return out;
  });
  console.log(trace.join('\n'));
  await h.close();
})();
