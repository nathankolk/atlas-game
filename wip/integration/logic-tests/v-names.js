// Independent check: feature names are present and unique in every map file the game can load
'use strict';
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad';
const topojson = require(S + '/vendor/node_modules/topojson-client');
const files = [
  ['/home/user/atlas-game/public/data/countries-110m.json', 'topo'],
  ['/home/user/atlas-game/public/data/countries-50m.json', 'topo'],
  [S + '/vendor/node_modules/world-atlas/countries-50m.json', 'topo'],
  [S + '/vendor/node_modules/world-atlas/countries-110m.json', 'topo'],
  ['/home/user/atlas-game/public/data/us-states.json', 'auto'],
  [S + '/vendor/node_modules/us-atlas/states-10m.json', 'topo'],
  ['/home/user/atlas-game/public/data/provinces-canada.json', 'topo'],
  ['/home/user/atlas-game/public/data/provinces-china.json', 'topo'],
  ['/home/user/atlas-game/public/data/provinces-india.json', 'topo'],
  ['/home/user/atlas-game/public/data/provinces-russia.json', 'topo'],
];
const featureName = f => f.properties ? (f.properties.name || f.properties.NAME || f.properties.NAME_LONG || null) : null;
for (const [file, kind] of files) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let feats = [];
  if (j.type === 'Topology') {
    const keys = Object.keys(j.objects);
    const key = j.objects.countries ? 'countries' : j.objects.states ? 'states' : keys[0];
    feats = topojson.feature(j, j.objects[key]).features;
  } else if (j.type === 'FeatureCollection') feats = j.features;
  const names = feats.map(featureName);
  const missing = names.filter(n => !n).length;
  const seen = new Map(); names.forEach(n => seen.set(n, (seen.get(n) || 0) + 1));
  const dups = [...seen].filter(([n, c]) => n && c > 1);
  const ids = feats.map(f => f.id); const idSeen = new Map(); ids.forEach(i => idSeen.set(i, (idSeen.get(i) || 0) + 1));
  const idDups = [...idSeen].filter(([i, c]) => c > 1);
  console.log(file.replace(S, '$S').replace('/home/user/atlas-game/', ''), '| objects:', j.objects ? Object.keys(j.objects).join(',') : j.type, '| features', feats.length, '| nameless', missing, '| dup names', JSON.stringify(dups), '| dup ids', JSON.stringify(idDups).slice(0, 120));
}
