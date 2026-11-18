#!/usr/bin/env node
'use strict';
/*
 * tools/build-world.js — the game's border choices, applied to the world maps
 *
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
 * Usage:
 *   node tools/build-world.js           rewrites both files in place
 *   node tools/build-world.js --check   says what it would do; exits 1 if a file still needs it
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

const check = process.argv.includes('--check');
let needed = false;
for (const file of FILES) needed = fix(file, !check) || needed;
if (check && needed) process.exit(1);
