// Explore's neighbours for every country against world-countries' borders.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const wc = require('./ext/node_modules/world-countries');
(async () => {
  const s = await L.open(); const page = s.page;
  await L.home(s);
  await page.evaluate(() => { location.hash = '#explore'; }); await L.sleep(1500);
  const app = await page.evaluate(async () => {
    const a = window.__atlas, out = {};
    const names = a.levelByKey('world').names();
    for (const n of names) {
      a.selectCountry(n);
      await new Promise(r => setTimeout(r, 15));
      const card = document.getElementById('place-card');
      out[n] = { text: card.innerText.replace(/\s+/g, ' ').slice(0, 600), chips: Array.from(card.querySelectorAll('[data-action="explore-pick"]')).map(b => b.textContent.trim()) };
    }
    return { cards: out, nb: (function () { const o = {}; const m = a.state.neighbours; if (m && m.forEach) m.forEach((v, k) => { o[k] = Array.from(v); }); return o; })() };
  });
  fs.writeFileSync('borders-app.json', JSON.stringify(app, null, 1));
  const facts = JSON.parse(fs.readFileSync('facts-app.json', 'utf8')).facts;
  const byIso = new Map(wc.map(c => [c.cca2, c])), by3 = new Map(wc.map(c => [c.cca3, c]));
  const nameOfIso = {}; Object.keys(facts).forEach(n => { nameOfIso[facts[n][1]] = n; });
  const lines = [];
  let checked = 0;
  Object.keys(app.cards).forEach(n => {
    const c = byIso.get(facts[n][1]);
    if (!c) { lines.push(n + ': not in world-countries; card: ' + app.cards[n].text.slice(0, 200)); return; }
    checked++;
    const theirs = (c.borders || []).map(b => by3.get(b)).filter(Boolean);
    const theirNames = theirs.map(t => nameOfIso[t.cca2] || ('(' + t.name.common + ')'));
    const mine = app.cards[n].chips;
    const text = app.cards[n].text;
    const missing = theirNames.filter(t => mine.indexOf(t) === -1 && text.indexOf(t.replace(/[()]/g, '')) === -1);
    const extra = mine.filter(m => theirNames.indexOf(m) === -1);
    if (missing.length || extra.length) lines.push(n + ': app lacks [' + missing.join(', ') + '] app adds [' + extra.join(', ') + ']');
    // capital on the card
    if (text.indexOf(facts[n][0]) === -1) lines.push(n + ': card does not show capital ' + facts[n][0] + ' | ' + text.slice(0, 160));
  });
  lines.unshift('countries compared: ' + checked);
  fs.writeFileSync('borders.out', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log('sample card:', app.cards['France'].text.slice(0, 400));
  await s.close();
})().catch(e => { console.error(e); process.exit(1); });
