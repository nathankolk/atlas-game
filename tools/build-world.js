#!/usr/bin/env node
'use strict';
/*
 * tools/build-world.js — the game's choices, applied to its map files
 *
 * 1. Crimea.
 * public/data/countries-50m.json and countries-110m.json are the world-atlas
 * package's files (v2.0.2), made from Natural Earth's Admin 0 countries at
 * 1:50m and 1:110m. Natural Earth draws de facto boundaries (who controls a
 * place), and at these two scales it offers no other view, so both files put
 * Crimea inside Russia. The game follows internationally recognized borders
 * there, as the Russia province rounds already do (tools/build-provinces.js
 * leaves Crimea and Sevastopol out of Russia), so this script gives Crimea
 * to Ukraine:
 *   - the one polygon of Russia's shape that holds Crimea is taken out of it;
 *   - it is merged into Ukraine with topojson-client's mergeArcs, which drops
 *     the line the two shared, so no border is drawn across the isthmus.
 * Only which country uses which arcs changes. The arcs themselves are left
 * as they are, so every other border stays exactly where it was.
 *
 * 2. Lakes (with --lakes).
 * Natural Earth publishes its country and state layers twice: with large
 * lakes inside the land, and with them cut out. The world-atlas files and
 * the states and provinces (Natural Earth's admin-1 layer) are the first
 * kind, so Lake Michigan was part of Michigan and Wisconsin, Lake Victoria
 * part of Uganda, Kenya and Tanzania. This cuts Natural Earth's lakes out of
 * every map file: from the 1:50m lakes, every lake of 500 km² or more (for
 * the world, the states and the provinces alike, so that the shores of a
 * state and of the country drawn beneath it are the same line); from the
 * 1:110m lakes, all of them, for countries-110m.json. Australia's salt pans
 * (DRY_LAKES: Eyre, Torrens, Gairdner and the rest) are left as land: they
 * are dry most years.
 *   - Each polygon of each shape is cut on its own (polygon-clipping), and
 *     only if a lake overlaps it. A polygon that crosses the 180th meridian
 *     (Russia's mainland, Alaska, Chukotka) is cut in longitudes made
 *     continuous (+360 west of Greenwich), and its original points are then
 *     put back exactly as they were: a flat-map tool given such a polygon
 *     as it is sees a band round the whole world, and cuts lakes on the far
 *     side of the globe out of it.
 *   - Rings are turned the way the files and d3 have them (outer rings
 *     clockwise); shapes no lake touches are left exactly as they were.
 *   - The file is rebuilt with topojson-server at its own quantization, so
 *     borders between shapes stay shared; the world files' "land" object is
 *     the union of the countries again. A top-level "lakes" member records
 *     what was cut, and a file that has one is not cut again (its shores are
 *     the lakes' outlines rounded to its grid, so a second cut would shave
 *     slivers off every shore).
 * A border that runs only through a lake (the Democratic Republic of the
 * Congo and Tanzania, across Lake Tanganyika) is no longer a shared line in
 * the map: the game lists it in EXTRA_BORDERS.
 *
 * Usage:
 *   node tools/build-world.js                  Crimea only (no downloads needed)
 *   node tools/build-world.js --lakes <dir>    Crimea, then the lakes
 *   node tools/build-world.js --check [...]    says what it would do; exits 1 if a file still needs it
 * The lakes need, in <dir>, Natural Earth's lake files:
 *   curl -L -O https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
 *   curl -L -O https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_lakes.geojson
 * and two packages, installed without saving them to the repo:
 *   npm install --no-save polygon-clipping@0.15 topojson-server@3
 * On files it has already fixed it changes nothing. It fails loudly if the
 * shapes are not what it expects (a new world-atlas release, say), rather
 * than guess.
 */

const fs = require('fs');
const path = require('path');
const topojson = require(path.join(__dirname, '..', 'public', 'vendor', 'topojson-client.min.js'));

const FILES = ['countries-50m.json', 'countries-110m.json'];
const DATA = path.join(__dirname, '..', 'public', 'data');
const SIMFEROPOL = [34.10, 44.95];                 // lon, lat: in the middle of the peninsula
const CRIMEA_BOX = [32.0, 44.0, 37.0, 46.5];       // west, south, east, north: the piece moved must lie inside

// Planar ray test on a ring of [lon, lat]: enough for a peninsula a few degrees across
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boxOf(ring) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// The polygons of a Polygon or MultiPolygon geometry, as arc lists
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.arcs];
  if (geometry.type === 'MultiPolygon') return geometry.arcs;
  throw new Error(geometry.properties.name + ' is a ' + geometry.type + ', not a polygon');
}

function fix(file, write) {
  const where = path.join(DATA, file);
  const topology = JSON.parse(fs.readFileSync(where, 'utf8'));
  const countries = topology.objects.countries;
  const russia = countries.geometries.find(g => g.properties.name === 'Russia');
  const ukraine = countries.geometries.find(g => g.properties.name === 'Ukraine');
  if (!russia || !ukraine) throw new Error(file + ': no Russia or no Ukraine');

  // Which of Russia's polygons holds Simferopol (feature() keeps the polygons in order)
  const shapes = topojson.feature(topology, russia).geometry;
  const rings = shapes.type === 'Polygon' ? [shapes.coordinates] : shapes.coordinates;
  const held = rings.map((poly, i) => (inRing(SIMFEROPOL, poly[0]) ? i : -1)).filter(i => i >= 0);
  if (!held.length) {
    const own = topojson.feature(topology, ukraine).geometry;
    const ua = own.type === 'Polygon' ? [own.coordinates] : own.coordinates;
    if (!ua.some(poly => inRing(SIMFEROPOL, poly[0]))) throw new Error(file + ': Crimea is in neither Russia nor Ukraine');
    console.log(file + ': Crimea is already Ukraine\'s');
    return false;
  }
  if (held.length > 1) throw new Error(file + ': ' + held.length + ' of Russia\'s polygons hold Simferopol');
  const box = boxOf(rings[held[0]][0]);
  if (box[0] < CRIMEA_BOX[0] || box[1] < CRIMEA_BOX[1] || box[2] > CRIMEA_BOX[2] || box[3] > CRIMEA_BOX[3]) {
    throw new Error(file + ': the polygon holding Simferopol reaches beyond Crimea (' + box.map(v => v.toFixed(2)).join(', ') + ')');
  }

  const russiaPolygons = polygonsOf(russia);
  const crimea = russiaPolygons[held[0]];
  const rest = russiaPolygons.filter((p, i) => i !== held[0]);
  const merged = topojson.mergeArcs(topology, [ukraine, { type: 'Polygon', arcs: crimea }]);
  console.log(file + ': Crimea (' + rings[held[0]][0].length + ' points) moves from Russia (' + russiaPolygons.length +
    ' polygons, now ' + rest.length + ') to Ukraine (' + polygonsOf(ukraine).length + ' polygon(s), now ' + merged.arcs.length + ')');
  if (!write) return true;

  setPolygons(russia, rest);
  setPolygons(ukraine, merged.arcs);
  fs.writeFileSync(where, JSON.stringify(topology));
  return true;
}

// Gives a geometry these polygons, as a Polygon when there is one
function setPolygons(geometry, polygons) {
  if (polygons.length === 1) {
    geometry.type = 'Polygon';
    geometry.arcs = polygons[0];
  } else {
    geometry.type = 'MultiPolygon';
    geometry.arcs = polygons;
  }
}

/* ===== Lakes ===== */

const LAKE_MIN_KM2 = 500;
// Salt pans that are dry most years: land, as players see them
const DRY_LAKES = new Set(['Lake Eyre North', 'Lake Eyre South', 'Lake Torrens', 'Lake Gairdner', 'Lake Frome',
  'Lake Mackay', 'Lake Barlee', 'Lake Disappointment']);
const LAKE_JOBS = [
  { file: 'countries-50m.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 },
  { file: 'countries-110m.json', lakes: 'ne_110m_lakes.geojson', min: 0 },
  { file: 'us-states.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 },
  { file: 'provinces-canada.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 },
  { file: 'provinces-china.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 },
  { file: 'provinces-india.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 },
  { file: 'provinces-russia.json', lakes: 'ne_50m_lakes.geojson', min: LAKE_MIN_KM2 }
];
const EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;

// The polygons of a GeoJSON geometry, as lists of rings
function polysOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

// Area of a ring on the sphere, km² (fine for rings that do not wrap the globe)
function ringKm2(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    a += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs(a * EARTH_KM * EARTH_KM / 2);
}

function polysKm2(polys) {
  return polys.reduce((sum, p) => sum + ringKm2(p[0]) - p.slice(1).reduce((h, r) => h + ringKm2(r), 0), 0);
}

// Twice the signed planar area: positive when the ring runs counter-clockwise
function shoelace(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s;
}

// True when a ring jumps from one side of the 180th meridian to the other
function wraps(polys) {
  return polys.some(p => p.some(ring => ring.some((pt, i) => i > 0 && Math.abs(pt[0] - ring[i - 1][0]) > 180)));
}

const mapPoints = (polys, fn) => polys.map(p => p.map(ring => ring.map(fn)));
const shifted = polys => mapPoints(polys, ([x, y]) => [x < 0 ? x + 360 : x, y]);

function boxOf(polys) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  polys.forEach(p => p[0].forEach(([x, y]) => {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }));
  return b;
}
const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// polygon-clipping leaves out points that lie on a straight line between
// their neighbours. A straight border (49°N, 60°N) keeps those points on the
// shape across it, so without them the two no longer share the line. This
// puts every point of the original that lies on a segment of the result
// back on that segment, in order, whether the segment's ends are points of
// the original or new points where a lake shore crosses the line.
function restoreDroppedPoints(result, original) {
  const CELL = 0.5;                               // degrees: a grid to find nearby points fast
  const cells = new Map();
  const cellKey = (cx, cy) => cx + ',' + cy;
  const seen = new Set();
  original.forEach(p => p.forEach(ring => ring.forEach(pt => {
    const k = pt[0] + ',' + pt[1];
    if (seen.has(k)) return;
    seen.add(k);
    const c = cellKey(Math.floor(pt[0] / CELL), Math.floor(pt[1] / CELL));
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(pt);
  })));
  // The original points strictly inside segment a-b, ordered from a
  const onSegment = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    if (!len2) return [];
    const found = [];
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
    const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (const c of cells.get(cellKey(cx, cy)) || []) {
          const t = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2;
          if (t <= 0 || t >= 1) continue;
          if (Math.hypot(a[0] + t * dx - c[0], a[1] + t * dy - c[1]) < 1e-7) found.push([t, c]);
        }
      }
    }
    return found.sort((p, q) => p[0] - q[0]).map(f => f[1]);
  };
  return result.map(p => p.map(ring => {
    const out = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
      out.push(...onSegment(ring[i - 1], ring[i]));
      out.push(ring[i]);
    }
    return out;
  }));
}

// Outer rings clockwise and holes counter-clockwise, as d3 and these files have them
function orient(polys) {
  return polys.map(p => p.map((ring, i) => ((shoelace(ring) > 0) === (i === 0) ? ring.slice().reverse() : ring)));
}

function loadLakes(dir, name, min) {
  const fc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  return fc.features.filter(f => !DRY_LAKES.has(f.properties.name)).map(f => polysOf(f.geometry))
    .filter(polys => polys.length && polysKm2(polys) >= min).map(polys => ({
    polys: polys, box: boxOf(polys), shifted: shifted(polys), shiftedBox: boxOf(shifted(polys))
  }));
}

// The number of distinct values per axis the file was quantized to
function quantizationOf(topology) {
  let min = Infinity, max = -Infinity;
  topology.arcs.forEach(arc => {
    let x = 0;
    arc.forEach(p => { x += p[0]; if (x < min) min = x; if (x > max) max = x; });
  });
  return max - min + 1;
}

function cutLakes(job, dir, write, libs) {
  const where = path.join(DATA, job.file);
  const topology = JSON.parse(fs.readFileSync(where, 'utf8'));
  // Cut once: a file's shores are its lakes' outlines rounded to the file's
  // grid, so cutting again would only shave slivers off every shore
  if (topology.lakes) {
    console.log(job.file + ': lakes already cut (' + topology.lakes + ')');
    return false;
  }
  const name = Object.keys(topology.objects).find(k => k !== 'land');
  const features = topojson.feature(topology, topology.objects[name]).features;
  const lakes = loadLakes(dir, job.lakes, job.min);
  const cut = [];
  features.forEach(f => {
    const polys = polysOf(f.geometry);
    if (!polys.length) return;
    // Polygon by polygon: a piece no lake touches is left exactly as it is,
    // and pieces are never merged (two pieces of Russia meet along the 180th
    // meridian, which in continuous longitudes is just a shared edge)
    let removed = 0;
    const out = [];
    polys.forEach(poly => {
      const wrapped = wraps([poly]);
      const shape = wrapped ? shifted([poly]) : [poly];
      const box = boxOf(shape);
      const hits = lakes.filter(l => overlap(box, wrapped ? l.shiftedBox : l.box)).map(l => (wrapped ? l.shifted : l.polys));
      if (!hits.length) { out.push(poly); return; }
      let result;
      try {
        result = libs.clip.difference(shape, ...hits);
      } catch (err) {
        throw new Error(job.file + ': cutting lakes out of ' + f.properties.name + ' failed: ' + err.message);
      }
      const before = polysKm2(shape), after = polysKm2(result);
      // Nothing a lake covers (only the boxes met). Any real overlap is cut,
      // however small: a lake that pokes across a border must notch both
      // sides, or the two no longer share the line
      if (before - after < 1e-6) { out.push(poly); return; }
      let done = orient(restoreDroppedPoints(result, shape));
      if (wrapped) {
        // Points of the original go back exactly as they were (-180 stays
        // -180); only the new ones, on lake shores, are shifted back
        const was = new Map();
        poly.forEach(ring => ring.forEach(pt => was.set((pt[0] < 0 ? pt[0] + 360 : pt[0]) + ',' + pt[1], pt)));
        done = done.map(p => p.map(ring => ring.map(pt => was.get(pt[0] + ',' + pt[1]) || (pt[0] > 180 ? [pt[0] - 360, pt[1]] : pt))));
      }
      out.push(...done);
      removed += before - after;
    });
    if (!removed) return;
    f.geometry = out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
    cut.push([f.properties.name, Math.round(removed)]);
  });
  if (!cut.length) {
    console.log(job.file + ': no lakes left to cut');
    return false;
  }
  cut.sort((a, b) => b[1] - a[1]);
  console.log(job.file + ': lakes cut out of ' + cut.length + ' shapes — ' +
    cut.slice(0, 8).map(c => c[0] + ' ' + c[1].toLocaleString('en-US') + ' km²').join(', ') + (cut.length > 8 ? ', …' : ''));
  if (!write) return true;

  const rebuilt = libs.server.topology({ [name]: { type: 'FeatureCollection', features: features } }, quantizationOf(topology));
  if (topology.objects.land) {
    rebuilt.objects.land = { type: 'GeometryCollection', geometries: [topojson.mergeArcs(rebuilt, rebuilt.objects[name].geometries)] };
  }
  rebuilt.lakes = 'Natural Earth ' + job.lakes.replace(/^ne_|_lakes\.geojson$/g, '') + ' lakes' +
    (job.min ? ' of ' + job.min + ' km² and more' : '') + ', less the dry salt pans';
  fs.writeFileSync(where, JSON.stringify(rebuilt));
  return true;
}

/* ===== Run ===== */

const args = process.argv.slice(2);
const check = args.includes('--check');
const lakesAt = args.indexOf('--lakes');
let needed = false;
for (const file of FILES) needed = fix(file, !check) || needed;
if (lakesAt >= 0) {
  const dir = args[lakesAt + 1];
  if (!dir || !fs.existsSync(path.join(dir, 'ne_50m_lakes.geojson'))) throw new Error('--lakes needs a folder holding ne_50m_lakes.geojson and ne_110m_lakes.geojson');
  const libs = { clip: require('polygon-clipping'), server: require('topojson-server') };
  for (const job of LAKE_JOBS) needed = cutLakes(job, dir, !check, libs) || needed;
}
if (check && needed) process.exit(1);
