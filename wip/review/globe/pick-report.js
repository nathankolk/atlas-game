// Reads out/pick-<size>.json and prints what is worth a look
const fs = require('fs'), path = require('path');
const size = process.argv[2] || 'p390';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pick-' + size + '.json'), 'utf8'));
for (const key of Object.keys(d)) {
  if (only && !only.includes(key)) continue;
  const r = d[key];
  const lines = [];
  r.items.forEach(it => {
    if (it.error) { lines.push('  ERROR ' + it.name + ': ' + it.error); return; }
    const h = it.home;
    const homeWhy = !h.vis ? 'hidden(z=' + h.z + ')' : h.ok ? null : h.centre;
    const steps = it.ladder.map(s => s.split(':')[1][0]);
    // a zoom where it works followed by a closer one where it does not
    const firstC = steps.indexOf('c'); const laterX = firstC >= 0 && steps.slice(firstC).includes('x');
    const flags = [];
    if (homeWhy) flags.push('home:' + homeWhy + (h.vis && !h.inClear ? '[outside clear]' : ''));
    else if (h.ring < 4) flags.push('home ring ' + h.ring + '/8');
    if (it.fOk === null) flags.push('NEVER by anchor');
    else if (it.fOk > 1) flags.push('needs x' + it.fOk);
    if (it.fRing === null) flags.push('ring never >=6');
    else if (it.fRing > 4) flags.push('ring>=6 at x' + it.fRing);
    if (laterX) flags.push('NONMONO');
    if (flags.length) lines.push('  ' + it.name + ' [' + it.sizeHome + 'px] ' + flags.join('; ') + (laterX || it.fOk === null || it.fOk > 4 || (it.fRing || 99) > 8 ? '  ladder ' + it.ladder.join(' ') : ''));
  });
  console.log(size + ' ' + key + ' (' + r.mode + ', ' + r.items.length + ' items, home k=' + r.home.k.toFixed(2) + ' R=' + r.radiusHome + 'px, max x' + r.maxFactor + ') flagged ' + lines.length);
  if (process.argv[4] !== 'brief') console.log(lines.join('\n'));
}
