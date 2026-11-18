// markGridInside (from the page) against d3.geoContains, cell by cell, for countries on continent boxes
const fs = require('fs'), path = require('path');
const V = '/home/user/atlas-game/public/vendor/';
const ctx = {};
const vm = require('vm');
const sandbox = vm.createContext({});
['d3-array.min.js', 'd3-geo.min.js', 'topojson-client.min.js'].forEach(f => vm.runInContext(fs.readFileSync(V + f, 'utf8'), sandbox));
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
const a = html.indexOf('  function markGridInside('), b = html.indexOf('  // The point of a feature, inside a [west, east, south, north] box');
vm.runInContext(html.slice(a, b) + '\nthis.markGridInside = markGridInside;', sandbox);
const world = JSON.parse(fs.readFileSync('/home/user/atlas-game/public/data/countries-50m.json', 'utf8'));
sandbox.world = world;
const out = vm.runInContext(`(function () {
  const feats = topojson.feature(world, world.objects.countries).features;
  const boxes = { Europe: [-25, 45, 34, 72], Africa: [-20, 53, -36, 38], Asia: [26, 146, -11, 55], 'North America': [-170, -52, 7, 72], 'South America': [-82, -34, -56, 13], Oceania: [112, 180, -48, 0] };
  const cases = [['Russia', 'Europe'], ['Russia', 'Asia'], ['Cabo Verde', 'Africa'], ['Mauritius', 'Africa'], ['Fiji', 'Oceania'], ['United States of America', 'North America'], ['France', 'Europe'], ['France', 'South America'],
    ['Indonesia', 'Oceania'], ['South Africa', 'Africa'], ['Antarctica', 'South America'], ['New Zealand', 'Oceania'], ['Kiribati', 'Oceania'], ['Norway', 'Europe'], ['Canada', 'North America']];
  const n = 30, lines = [];
  cases.forEach(([name, cont]) => {
    const f = feats.find(x => x.properties.name === name);
    if (!f) { lines.push(name + ': not on the map'); return; }
    const box = boxes[cont];
    const inside = []; for (let i = 0; i < n; i++) inside.push(new Array(n).fill(false));
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let calls = 0; const real = d3.geoContains;
    const t0 = Date.now();
    polys.forEach(r => markGridInside(r, box, n, inside));
    const ms = Date.now() - t0;
    let diff = 0, on = 0;
    const sLon = (box[1] - box[0]) / n, sLat = (box[3] - box[2]) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const want = real(f, [box[0] + (i + 0.5) * sLon, box[2] + (j + 0.5) * sLat]); if (want) on++; if (want !== inside[i][j]) diff++; }
    lines.push(name + ' on ' + cont + ': ' + on + ' cells on it, ' + diff + ' differ, ' + ms + ' ms');
  });
  return lines.join('\\n');
})()`, sandbox);
console.log(out);
