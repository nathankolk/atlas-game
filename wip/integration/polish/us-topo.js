// Rebuilds the US states TopoJSON from the GeoJSON and checks it against the original:
// every state there, same number of pieces, areas equal, borders shared.
'use strict';
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '../../..');
const V = path.join(S, 'vendor/node_modules');
const topojson = require(path.join(V, 'topojson'));
const d3 = require(path.join(V, 'd3-geo'));
const geo = JSON.parse(fs.readFileSync(process.argv[2] || '/home/user/atlas-game/public/data/us-states-detail.json', 'utf8'));
const topo = topojson.topology({ states: geo }, 1e6);
const out = JSON.stringify(topo);
const trial = fs.readFileSync(path.join(S, 'us-states-topo-1000000.json'), 'utf8');
console.log('rebuilt bytes', out.length, 'trial bytes', trial.length, 'identical', out === trial);
const back = topojson.feature(topo, topo.objects.states).features;
let worst = 0, bad = 0;
const pieces = f => f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length;
geo.features.forEach((f, i) => {
  const g = back[i];
  if (g.properties.name !== f.properties.name || g.id !== f.id) { bad++; console.log('NAME/ID differs', f.properties.name); }
  if (pieces(g) !== pieces(f)) { bad++; console.log('PIECES differ', f.properties.name, pieces(f), pieces(g)); }
  const a = d3.geoArea(f), b = d3.geoArea(g), rel = Math.abs(a - b) / a;
  if (rel > worst) worst = rel;
  if (rel > 1e-4) { bad++; console.log('AREA differs', f.properties.name, rel); }
});
// Every arc used by two states is an interior border drawn once by the mesh
const use = new Map();
const walk = (arcs, id) => arcs.forEach(a => Array.isArray(a) ? walk(a, id) : use.set(a < 0 ? ~a : a, (use.get(a < 0 ? ~a : a) || new Set()).add(id)));
topo.objects.states.geometries.forEach(g => walk(g.arcs, g.properties.name));
const shared = Array.from(use.values()).filter(s => s.size === 2).length, more = Array.from(use.values()).filter(s => s.size > 2).length;
const interior = topojson.mesh(topo, topo.objects.states, (a, b) => a !== b), all = topojson.mesh(topo, topo.objects.states);
const pts = m => m.coordinates.reduce((n, l) => n + l.length, 0);
const ringPts = geo.features.reduce((n, f) => n + (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0), 0);
// Neighbours: a few known borders, and four corners
const nb = topojson.neighbors(topo.objects.states.geometries);
const names = topo.objects.states.geometries.map(g => g.properties.name);
const nbOf = n => nb[names.indexOf(n)].map(i => names[i]).sort().join(', ');
console.log('states', back.length, 'worst area error', worst.toExponential(2), 'problems', bad);
console.log('arcs', topo.arcs.length, 'shared by two', shared, 'by more', more, '| mesh points', pts(all), 'interior', pts(interior), '| ring points in the GeoJSON', ringPts);
console.log('Tennessee:', nbOf('Tennessee')); console.log('Utah:', nbOf('Utah')); console.log('Maine:', nbOf('Maine')); console.log('Hawaii:', nbOf('Hawaii') || '(none)'); console.log('District of Columbia:', nbOf('District of Columbia'));
if (process.argv[3]) { fs.writeFileSync(process.argv[3], out); console.log('wrote', process.argv[3]); }
