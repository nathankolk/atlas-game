// Prints every geometry of the 50m world with the geometries it shares an arc with
const topojson = require('/home/user/atlas-game/public/vendor/topojson-client.min.js');
const topo = require('/home/user/atlas-game/public/data/countries-50m.json');
const geoms = topo.objects.countries.geometries;
const nb = topojson.neighbors(geoms);
geoms.forEach((g, i) => {
  const name = g.properties && g.properties.name;
  console.log((name || '(unnamed ' + g.id + ')') + ': ' + nb[i].map(j => geoms[j].properties.name).sort().join(', '));
});
console.error(geoms.length + ' geometries');
