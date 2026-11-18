// Collects the place names the game itself shows (provinces, US states and their capitals, the
// Pin the City cities, every feature name in the world map) into places-in-game.json, which
// quiz.test.js types at the matcher. Run again after adding a level:
//   node tools/tests/fixtures/build-places.js
'use strict';
const fs = require('fs');
const path = require('path');
const repo = process.argv[2] || path.resolve(__dirname, '../../..');
const pub = path.join(repo, 'public');
const out = { provinces: [], usStates: [], usCapitals: [], pinCities: [], mapFeatures: [], mapAliases: [] };
for (const f of fs.readdirSync(path.join(pub, 'data'))) {
  const j = JSON.parse(fs.readFileSync(path.join(pub, 'data', f), 'utf8'));
  const feats = j.type === 'Topology' ? [].concat(...Object.keys(j.objects).map(k => j.objects[k].geometries || [])) : (j.features || []);
  const names = feats.map(g => g.properties && g.properties.name).filter(n => typeof n === 'string');
  if (/^provinces-/.test(f)) out.provinces.push(...names);
  else if (/^us-states/.test(f)) out.usStates.push(...names);
  else out.mapFeatures.push(...names);
}
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
// Evaluates one `const NAME = { ... };` object literal from the game's script.
function literal(name) {
  const at = html.indexOf('const ' + name + ' = {');
  if (at < 0) return {};
  const end = html.indexOf('\n  };', at);
  return new Function('return ' + html.slice(html.indexOf('{', at), end + 4).replace(/;\s*$/, ''))();
}
const caps = literal('US_CAPITALS');
out.usCapitals = Object.keys(caps).map(k => (Array.isArray(caps[k]) ? caps[k][0] : caps[k])).filter(v => typeof v === 'string');
const pins = literal('PIN_CITIES');
Object.keys(pins).forEach(k => (pins[k] || []).forEach(row => { if (Array.isArray(row) && typeof row[0] === 'string') out.pinCities.push(row[0]); }));
const aliases = literal('NAME_ALIASES');
out.mapAliases = Object.keys(aliases);
Object.keys(out).forEach(k => { out[k] = [...new Set(out[k])].sort(); });
fs.writeFileSync(path.join(__dirname, 'places-in-game.json'), JSON.stringify(out, null, 1));
console.log(Object.keys(out).map(k => k + ' ' + out[k].length).join(', '));
