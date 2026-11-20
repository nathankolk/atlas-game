// Automated checks for the globe engine (the GLOBE ENGINE section of public/index.html), run in
// headless Chromium through globe/harness.js. Prints PASS/FAIL per check and exits non-zero if
// anything failed. Needs Playwright (see globe/harness.js). The whole file takes a while on a
// machine without a GPU; a filter runs part of it.
//
//   node tools/tests/globe.test.js [filter]
//
// `filter` runs only the groups whose name contains it (e.g. "pick", "canvas2d").
//
// The 'imagery-*' groups check satellite imagery against the harness's stand-in tiles (green
// land on blue sea in Web Mercator, each tile labelled z/x/y); 'imagery-retry' waits 10 s.
// The groups 'demo', 'demo-mobile', 'pictures' and 'imagery-*' also write screenshots, into
// atlas-globe-shots in the system's temp folder (the path is printed at the end).
'use strict';

const path = require('path');
const fs = require('fs');

const SHOTS = path.join(require('os').tmpdir(), 'atlas-globe-shots');
const { launch } = require('./globe/harness.js');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}
const fmt = (n, d) => Number(n).toFixed(d === undefined ? 2 : d);
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 3 : tol));

/* ===== Helpers that run in the page ===== */

function pageHelpers() {
  const T = window.T = {};
  const cache = {};
  const FILES = {
    world: ['data/countries-50m.json', 'countries'],
    world110: ['data/countries-110m.json', 'countries'],
    land110: ['data/land-110m.json', 'land'],
    us: ['data/us-states-detail.json'],
    canada: ['data/provinces-canada.json', 'provinces'],
    china: ['data/provinces-china.json', 'provinces'],
    india: ['data/provinces-india.json', 'provinces'],
    russia: ['data/provinces-russia.json', 'provinces']
  };

  // Loads a data set once: { features, borders } (borders only for TopoJSON sources).
  T.load = name => {
    if (!cache[name]) {
      cache[name] = fetch(FILES[name][0]).then(r => r.json()).then(json => {
        if (json.type !== 'Topology') return { features: json.features, borders: null };
        const object = json.objects[FILES[name][1]];
        const fc = topojson.feature(json, object);
        return { features: fc.features || [fc], borders: topojson.mesh(json, object) };
      });
    }
    return cache[name];
  };

  T.name = f => (f.properties && f.properties.name) || 'feature';
  T.STYLES = { land: '#f5ebd4', good: '#5f8a4b', bad: '#a0311e', mark: '#ff0000', half: 'rgba(255,0,0,0.5)', hidden: 'transparent' };
  // A theme with no shading at all, so pixels are either pure ocean or pure style colour
  T.FLAT = { ocean: '#0000ff', oceanEdge: '#0000ff', graticule: 'rgba(0,0,0,0)', atmosphere: 'rgba(0,0,0,0)', limb: 'rgba(0,0,0,0)' };

  // Replaces the globe in #host with a fresh one (window.globe).
  T.create = opts => {
    if (window.globe) window.globe.destroy();
    window.globe = Globe.create(document.getElementById('host'), opts || {});
    window.globe.defineStyles(T.STYLES);
    return window.globe;
  };

  T.layer = (id, data, extra) => Object.assign({
    id, features: data.features, key: T.name, interactive: true, borders: data.borders,
    borderColor: 'rgba(107,68,35,0.55)', borderWidth: 0.9, style: 'land'
  }, extra || {});

  T.frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  T.frames = async n => { for (let i = 0; i < n; i++) await T.frame(); };
  T.wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Resolves with the scene canvas's pixels (ImageData) taken right after the globe's next draw.
  T.capture = globe => new Promise(resolve => {
    const off = globe.addOverlay(() => {
      off();
      const src = document.querySelector('#host canvas.globe-gl');
      const copy = document.createElement('canvas');
      copy.width = src.width; copy.height = src.height;
      const ctx = copy.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      resolve(ctx.getImageData(0, 0, copy.width, copy.height));
    });
  });

  // [r, g, b, a] at host point (x, y) of a capture.
  T.pixel = (img, x, y) => {
    const scale = img.width / document.getElementById('host').clientWidth;
    const o = (Math.round(y * scale) * img.width + Math.round(x * scale)) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
  };
  T.pixelAt = async (globe, lonlat) => {
    const img = await T.capture(globe);
    const p = globe.project(lonlat);
    return T.pixel(img, p.x, p.y);
  };
  T.near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 3 : tol));

  // Land mask of a capture taken with the FLAT theme and red land: 1 = land, 0 = not, and
  // 2 = a tie, where red covers half the pixel. 4× MSAA can only say 0, 1, 2, 3 or 4 samples
  // out of 4, so a coast pixel that is anywhere from 3/8 to 5/8 land reads as exactly half.
  T.maskOf = img => {
    const mask = new Uint8Array(img.width * img.height), d = img.data;
    for (let i = 0; i < mask.length; i++) {
      const red = d[i * 4] * d[i * 4 + 3] / 255;
      mask[i] = red > 136 ? 1 : red < 120 ? 0 : 2;
    }
    return mask;
  };

  // The same land mask drawn independently with d3.geoOrthographic on a 2D canvas.
  T.referenceMask = (features, view, w, h, radius) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const projection = d3.geoOrthographic().rotate([-view.lon, -view.lat]).scale(radius).translate([w / 2, h / 2]).clipAngle(90).precision(0.1);
    const draw = d3.geoPath(projection, ctx);
    ctx.fillStyle = '#f00';
    features.forEach(f => { ctx.beginPath(); draw(f); ctx.fill(); });
    const d = ctx.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return mask;
  };

  // Intersection over union of a captured mask and a reference mask; ties side with the reference.
  T.iou = (mask, reference) => {
    let both = 0, either = 0;
    for (let i = 0; i < mask.length; i++) {
      const m = mask[i] === 2 ? reference[i] : mask[i];
      both += m & reference[i]; either += m | reference[i];
    }
    return either ? both / either : 1;
  };

  /* Imagery */

  T.TILE = (z, x, y) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
  // FLAT with a magenta ocean: any part of the globe that imagery does not cover shows up
  T.SAT = Object.assign({}, T.FLAT, { ocean: '#ff00ff', oceanEdge: '#ff00ff' });
  // The colours of the harness's stand-in tiles
  T.TILE_LAND = [77, 122, 58, 255];
  T.TILE_SEA = [20, 56, 92, 255];

  // A globe for imagery checks: the 110m land (the very shapes the stand-in tiles are drawn
  // from) as one layer with clear fills and yellow borders, hidden to begin with, over a
  // magenta ocean. T.statuses collects what onStatus hears once imagery is turned on.
  T.satGlobe = async (view, opts) => {
    const land = await T.load('land110');
    const globe = T.create(Object.assign({ theme: T.SAT, maxZoom: 600 }, opts || {}));
    globe.defineStyles({ clear: 'rgba(0,0,0,0)', tint: 'rgba(255,0,0,0.3)' });
    globe.setGraticule(false);
    await globe.setLayers([T.layer('land', land, { style: 'clear', bordersVisible: false, borderColor: '#ffff00', borderWidth: 1 })]);
    globe.setView(view);
    T.statuses = [];
    T.onStatus = status => T.statuses.push(status);
    return globe;
  };

  // Resolves once onStatus has heard `status` (true), or after `timeout` ms without it (false).
  T.heard = async (status, timeout) => {
    const end = performance.now() + (timeout || 15000);
    while (T.statuses.indexOf(status) < 0 && performance.now() < end) await T.wait(20);
    return T.statuses.indexOf(status) >= 0;
  };

  // Resolves when the view has settled, imagery has nothing left to load and that is on screen.
  T.imageryIdle = async (globe, timeout) => {
    const end = performance.now() + (timeout || 20000);
    await T.wait(260);
    while (performance.now() < end) {
      const im = globe.stats().imagery;
      if (!im || (!im.loading && im.status !== 'loading')) break;
      await T.wait(40);
    }
    await T.frames(2);
  };

  // What a capture shows at each pixel: 1 = tile land (green), 0 = tile sea (or nothing at
  // all), 3 = the magenta ocean of T.SAT, that is, globe without imagery.
  T.satMask = img => {
    const mask = new Uint8Array(img.width * img.height), d = img.data;
    for (let i = 0, o = 0; i < mask.length; i++, o += 4) {
      mask[i] = d[o] > 200 && d[o + 1] < 70 && d[o + 2] > 200 ? 3 : d[o + 1] > d[o + 2] ? 1 : 0;
    }
    return mask;
  };
  T.count = (mask, value) => { let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i] === value) n++; return n; };

  // Intersection over union of the land in a mask and in a reference mask moved by (dx, dy) px.
  T.iouShifted = (mask, reference, w, h, dx, dy) => {
    let both = 0, either = 0;
    for (let y = 0; y < h; y++) {
      const ry = y - dy;
      for (let x = 0; x < w; x++) {
        const rx = x - dx;
        const r = rx >= 0 && rx < w && ry >= 0 && ry < h ? reference[ry * w + rx] : 0;
        const m = mask[y * w + x] === 1 ? 1 : 0;
        both += m & r; either += m | r;
      }
    }
    return either ? both / either : 1;
  };

  // The whole-pixel shift of the reference, up to `range` px each way, under which it matches
  // a mask best: { dx, dy, iou } and `zero`, the score with no shift. Of equal scores the
  // smaller shift wins, so a picture that is in the right place answers (0, 0).
  T.bestShift = (mask, reference, w, h, range) => {
    const shifts = [];
    for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) shifts.push([dx, dy]);
    shifts.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    const best = { dx: 0, dy: 0, iou: -1, zero: 0 };
    shifts.forEach(s => {
      const iou = T.iouShifted(mask, reference, w, h, s[0], s[1]);
      if (!s[0] && !s[1]) best.zero = iou;
      if (iou > best.iou + 1e-9) { best.dx = s[0]; best.dy = s[1]; best.iou = iou; }
    });
    return best;
  };

  // How much of a capture is neither clearly tile land nor clearly tile sea: the blurred
  // band along coasts, in pixels. Sharp imagery has little of it.
  T.softness = img => {
    let n = 0;
    for (let o = 0, d = img.data; o < d.length; o += 4) {
      const t = d[o + 1] - d[o + 2];
      if (d[o + 3] === 255 && t > -10 && t < 20 && !(d[o] > 200 && d[o + 2] > 200)) n++;
    }
    return n;
  };

  // Measures the imagery on screen against the 110m land drawn by d3 for the same view.
  T.measureImagery = async (globe, view) => {
    const land = (await T.load('land110')).features;
    const img = await T.capture(globe);
    const w = img.width, h = img.height;
    // (in the capture's own pixels, which are device pixels)
    const scale = w / document.getElementById('host').clientWidth;
    const mask = T.satMask(img), reference = T.referenceMask(land, view, w, h, globe.radiusPx() * scale);
    const best = T.bestShift(mask, reference, w, h, 3);
    return {
      img, mask, w, h, blank: T.count(mask, 3), land: T.count(mask, 1), soft: T.softness(img),
      iou: best.zero, bestIou: best.iou, shift: [best.dx, best.dy], imagery: globe.stats().imagery
    };
  };

  // Deterministic random numbers (mulberry32)
  T.random = seed => () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  // A uniformly random point on the sphere
  T.randomLonLat = rnd => [rnd() * 360 - 180, Math.asin(rnd() * 2 - 1) * 180 / Math.PI];

  // The name of the feature containing a point according to d3.geoContains, or null.
  T.d3Hit = (features, lonlat) => {
    for (let i = 0; i < features.length; i++) if (d3.geoContains(features[i], lonlat)) return T.name(features[i]);
    return null;
  };
}

/* ===== Check groups ===== */

const groups = [];
// `options` are passed to the harness's launch() (viewport, device pixel ratio, ...).
function group(name, fn, options) { groups.push({ name, fn, options: options || {} }); }

group('build', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const world = await T.load('world'), us = await T.load('us');
    const runs = [];
    let out = null;
    // The first build is the cold one a visitor gets; the repeats show the warmed-up cost
    for (let run = 0; run < 4; run++) {
      const globe = T.create();
      // A heartbeat on the task queue: its longest gap is the longest the page was blocked
      let longest = 0, last = performance.now(), beating = true, progress = 0;
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
        if (beating) channel.port2.postMessage(0);
      };
      channel.port2.postMessage(0);
      globe.on('progress', () => progress++);
      const started = performance.now();
      await globe.setLayers([T.layer('world', world)]);
      beating = false;
      runs.push(globe.stats().buildMs);
      if (!out) out = { wall: performance.now() - started, longest, progress, stats: globe.stats() };
    }
    out.runs = runs;
    // Framing a big data set is a single synchronous step: time it too
    const globe = T.create();
    await globe.setLayers([T.layer('us', us)]);
    out.fit = [];
    for (let i = 0; i < 4; i++) { const t = performance.now(); globe.fitTo(us.features); out.fit.push(performance.now() - t); }
    return out;
  });
  check('build: countries-50m produces a mesh', r.stats.triangles > 100000 && r.stats.segments > 50000,
    Math.round(r.stats.triangles) + ' triangles, ' + r.stats.segments + ' border segments');
  check('build: under 150 ms, or sliced so that no single step blocks the page for 100 ms',
    r.stats.buildMs < 150 || (r.progress > 0 && r.longest < 100),
    'first build ' + fmt(r.runs[0], 0) + ' ms of work over ' + fmt(r.wall, 0) + ' ms, longest block ' + fmt(r.longest, 1) + ' ms, ' + r.progress +
    ' progress events; repeat builds ' + r.runs.slice(1).map(v => fmt(v, 0)).join(', ') + ' ms');
  check('fitTo: framing the 53,000-point US states takes a few ms', Math.min.apply(null, r.fit) < 25, r.fit.map(v => fmt(v, 1)).join(', ') + ' ms');
});

group('project', async ({ page }) => {
  const r = await page.evaluate(() => {
    const globe = T.create();
    const rnd = T.random(7);
    let maxPx = 0, maxDeg = 0, farWrong = 0, offGlobe = 0;
    for (let i = 0; i < 2000; i++) {
      if (i % 50 === 0) globe.setView({ lon: rnd() * 360 - 180, lat: rnd() * 170 - 85, k: 1 + rnd() * rnd() * 60 });
      // screen → geographic → screen
      const x = rnd() * 800, y = rnd() * 600;
      const ll = globe.invert(x, y);
      if (ll) {
        const p = globe.project(ll);
        if (p.z > 0.02) maxPx = Math.max(maxPx, Math.hypot(p.x - x, p.y - y));
        if (!p.visible) farWrong++;
      } else if (Math.hypot(x - 400, y - 300) < globe.radiusPx() - 1e-6) offGlobe++;
      // geographic → screen → geographic
      const q = T.randomLonLat(rnd), s = globe.project(q);
      if (s.visible && s.z > 0.05) {
        const back = globe.invert(s.x, s.y);
        maxDeg = Math.max(maxDeg, d3.geoDistance(q, back) * 180 / Math.PI);
      }
      const anti = globe.project([q[0] + 180, -q[1]]);
      if (anti.visible === s.visible && Math.abs(s.z) > 1e-9) farWrong++;
    }
    const outside = globe.invert(-50, -50);
    return { maxPx, maxDeg, farWrong, offGlobe, outside };
  });
  check('project/invert: screen round trip is exact', r.maxPx < 1e-6, 'max error ' + r.maxPx.toExponential(1) + ' px');
  check('project/invert: geographic round trip is exact', r.maxDeg < 1e-6, 'max error ' + r.maxDeg.toExponential(1) + '°');
  check('project/invert: far side is reported invisible, off-globe inverts to null', r.farWrong === 0 && r.offGlobe === 0 && r.outside === null);
});

group('pick', async ({ page }) => {
  const known = await page.evaluate(async () => {
    const world = await T.load('world');
    const globe = T.create();
    await globe.setLayers([T.layer('world', world)]);
    const at = (lonlat, opts) => {
      const p = globe.project(lonlat), hit = globe.featureAt(p.x, p.y, opts);
      return hit && hit.key;
    };
    const out = {};
    globe.setView({ lon: 10, lat: 30, k: 1.2 });
    out.paris = at([2.35, 48.86]);
    out.nairobi = at([36.82, -1.29]);
    globe.setView({ lon: -150, lat: 20, k: 1 });
    out.pacific = at([-150, 30]);
    // Nauru is a fraction of a pixel at this zoom; tap 13 px away from it
    globe.setView({ lon: 160, lat: 0, k: 1 });
    const n = globe.project([166.93, -0.52]);
    const hit = globe.featureAt(n.x - 12, n.y + 5);
    out.nauru = hit && hit.key;
    out.nauruHasFeature = !!(hit && hit.feature && hit.layerId === 'world');
    out.nauruExact = globe.featureAt(n.x - 12, n.y + 5, { tolerance: 0 });
    const other = globe.featureAt(n.x - 12, n.y + 5, { eligible: (layer, key) => key !== 'Nauru' });
    out.nauruIneligible = other && other.key;
    const info = globe.featureInfo('world', 'France');
    out.info = info && { centroid: info.centroid, radiusDeg: info.radiusDeg, areaSr: info.areaSr, bounds: info.bounds, same: info.feature === world.features.find(f => T.name(f) === 'France') };
    return out;
  });
  check('featureAt: Paris → France', known.paris === 'France', String(known.paris));
  check('featureAt: Nairobi → Kenya', known.nairobi === 'Kenya', String(known.nairobi));
  check('featureAt: mid-Pacific → null', known.pacific === null, String(known.pacific));
  check('featureAt: a tap 13 px from tiny Nauru selects it', known.nauru === 'Nauru' && known.nauruHasFeature, String(known.nauru));
  check('featureAt: tolerance 0 and `eligible` switch that off', known.nauruExact === null && known.nauruIneligible !== 'Nauru',
    'tolerance 0 → ' + known.nauruExact + ', ineligible → ' + known.nauruIneligible);
  check('featureInfo: centroid, bounds, cap radius and area', known.info && known.info.same && known.info.radiusDeg > 3 &&
    known.info.areaSr > 0.01 && known.info.areaSr < 0.02 && Array.isArray(known.info.bounds) && Math.abs(known.info.centroid[1] - 46) < 4,
    known.info && JSON.stringify({ centroid: known.info.centroid.map(v => +v.toFixed(2)), radiusDeg: +known.info.radiusDeg.toFixed(1), areaSr: +known.info.areaSr.toFixed(4) }));

  const agree = await page.evaluate(async () => {
    const out = [];
    for (const name of ['world', 'us', 'russia']) {
      const data = await T.load(name);
      const globe = T.create();
      await globe.setLayers([T.layer('active', data)]);
      const rnd = T.random(name.length * 101);
      const points = [];
      // Half the points are anywhere on the globe, half hug a border of a random feature
      for (let i = 0; i < 150; i++) points.push(T.randomLonLat(rnd));
      for (let i = 0; i < 250; i++) {
        const f = data.features[Math.floor(rnd() * data.features.length)];
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        const ring = polys[Math.floor(rnd() * polys.length)][0];
        const v = ring[Math.floor(rnd() * ring.length)];
        points.push([v[0] + (rnd() - 0.5) * 0.2, Math.max(-89.9, Math.min(89.9, v[1] + (rnd() - 0.5) * 0.2))]);
      }
      let wrong = 0, hits = 0;
      const examples = [];
      points.forEach(q => {
        globe.setView({ lon: q[0] + 20, lat: Math.max(-80, Math.min(80, q[1] - 10)), k: 2 });
        const p = globe.project(q);
        const hit = globe.featureAt(p.x, p.y, { tolerance: 0 });
        const got = hit && hit.key, want = T.d3Hit(data.features, q);
        if (want) hits++;
        if (got !== want) { wrong++; if (examples.length < 3) examples.push(q.map(v => +v.toFixed(4)) + ': ' + got + ' vs ' + want); }
      });
      out.push({ name, points: points.length, hits, wrong, examples });
    }
    return out;
  });
  agree.forEach(a => check('featureAt: agrees with d3.geoContains on ' + a.name, a.wrong === 0 && a.hits > 50,
    a.points + ' points, ' + a.hits + ' on land, ' + a.wrong + ' disagreements' + (a.examples.length ? ' (' + a.examples.join('; ') + ')' : '')));
});

group('styles', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const world = await T.load('world');
    const globe = T.create();
    await globe.setLayers([T.layer('world', world, { bordersVisible: false })]);
    const paris = [2.35, 48.86], madrid = [-3.7, 40.4], berlin = [13.4, 52.5], sea = [-25, 45];
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    const out = {};
    out.land = await T.pixelAt(globe, paris);
    globe.setStyle('world', 'France', 'good');
    out.good = await T.pixelAt(globe, paris);
    out.neighbour = await T.pixelAt(globe, madrid);
    globe.setStyles('world', { Spain: 'bad', Germany: 'mark' });
    const img = await T.capture(globe);
    out.spain = T.pixel(img, globe.project(madrid).x, globe.project(madrid).y);
    out.germany = T.pixel(img, globe.project(berlin).x, globe.project(berlin).y);
    globe.defineStyles({ good: '#123456' });
    out.redefined = await T.pixelAt(globe, paris);
    globe.setStyle('world', 'France', 'hidden');
    out.hidden = await T.pixelAt(globe, paris);
    out.ocean = await T.pixelAt(globe, sea);
    globe.resetStyles('world');
    out.reset = await T.pixelAt(globe, madrid);
    globe.resetStyles('world', 'bad');
    out.resetTo = await T.pixelAt(globe, berlin);
    // Layer default style
    globe.resetStyles('world');
    globe.updateLayer('world', { style: 'mark' });
    out.layerStyle = await T.pixelAt(globe, paris);
    globe.updateLayer('world', { style: 'land', visible: false });
    out.invisible = await T.pixelAt(globe, paris);
    globe.updateLayer('world', { visible: true });
    // Flash: the flash colour first, the feature's own style afterwards
    globe.defineStyles({ good: T.STYLES.good });
    globe.setStyle('world', 'France', 'good');
    globe.flash('world', 'France', 'mark', 300);
    out.flashStart = await T.pixelAt(globe, paris);
    await T.wait(450);
    out.flashEnd = await T.pixelAt(globe, paris);
    await T.wait(200);
    const frames = globe.stats().frames;
    await T.wait(300);
    out.flashIdle = globe.stats().frames - frames;
    // Swapping a layer's features keeps the styles already set, by key
    globe.setStyle('world', 'Spain', 'bad');
    const coarse = await T.load('world110');
    await globe.updateLayer('world', { features: coarse.features, borders: coarse.borders });
    const img2 = await T.capture(globe);
    out.keptFrance = T.pixel(img2, globe.project(paris).x, globe.project(paris).y);
    out.keptSpain = T.pixel(img2, globe.project(madrid).x, globe.project(madrid).y);
    out.swapped = globe.stats().triangles;
    return out;
  });
  const LAND = [245, 235, 212, 255], GOOD = [95, 138, 75, 255], BAD = [160, 49, 30, 255], MARK = [255, 0, 0, 255];
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
  check('styles: layer default colour is drawn exactly', near(r.land, LAND), r.land.join(','));
  check('styles: setStyle recolours one feature only', near(r.good, GOOD) && near(r.neighbour, LAND), r.good.join(',') + ' / neighbour ' + r.neighbour.join(','));
  check('styles: setStyles recolours several', near(r.spain, BAD) && near(r.germany, MARK));
  check('styles: redefining a style repaints its features', near(r.redefined, [0x12, 0x34, 0x56, 255]), r.redefined.join(','));
  check('styles: a transparent style shows the ocean', near(r.hidden, r.ocean, 6) && !near(r.hidden, LAND), r.hidden.join(',') + ' vs ocean ' + r.ocean.join(','));
  check('styles: resetStyles restores the default, or a given style', near(r.reset, LAND) && near(r.resetTo, BAD));
  check('styles: updateLayer changes the default style and visibility', near(r.layerStyle, MARK) && near(r.invisible, r.ocean, 6));
  check('styles: flash shows its colour, then returns to the set style', near(r.flashStart, MARK) && near(r.flashEnd, GOOD),
    r.flashStart.join(',') + ' → ' + r.flashEnd.join(','));
  check('styles: no frames are drawn once a flash has finished', r.flashIdle === 0, r.flashIdle + ' frames');
  check('styles: swapping features keeps per-key styles', near(r.keptFrance, GOOD) && near(r.keptSpain, BAD) && r.swapped < 100000,
    'France ' + r.keptFrance.join(',') + ', Spain ' + r.keptSpain.join(',') + ', ' + Math.round(r.swapped) + ' triangles');

  // More features than one row of the style texture holds (256): a grid of 600 squares, in
  // both renderers
  for (const forceCanvas2D of [false, true]) {
    const many = await page.evaluate(async forceCanvas2D => {
      const features = [];
      for (let i = 0; i < 600; i++) {
        const x = -30 + (i % 30) * 2, y = -20 + Math.floor(i / 30) * 2;
        features.push({ type: 'Feature', id: i, properties: {}, geometry: { type: 'Polygon', coordinates: [[[x, y], [x, y + 2], [x + 2, y + 2], [x + 2, y], [x, y]]] } });
      }
      const globe = T.create({ forceCanvas2D });
      await globe.setLayers([{ id: 'grid', features, interactive: true, style: 'land', bordersVisible: false }]);     // default key: String(feature.id)
      globe.setView({ lon: 0, lat: 0, k: 2 });
      const marked = [0, 255, 256, 300, 511, 512, 599];
      marked.forEach(i => globe.setStyle('grid', String(i), 'mark'));
      await T.wait(forceCanvas2D ? 350 : 0);
      const img = await T.capture(globe);
      let wrong = 0, picksWrong = 0;
      features.forEach((f, i) => {
        const p = globe.project([-29 + (i % 30) * 2, -19 + Math.floor(i / 30) * 2]), px = T.pixel(img, p.x, p.y);
        const want = marked.indexOf(i) >= 0 ? [255, 0, 0, 255] : [245, 235, 212, 255];
        if (!T.near(px, want)) wrong++;
        const hit = globe.featureAt(p.x, p.y, { tolerance: 0 });
        if (!hit || hit.key !== String(i)) picksWrong++;
      });
      return { wrong, picksWrong };
    }, forceCanvas2D);
    check('styles: 600 features in one layer each keep their own colour (' + (forceCanvas2D ? 'Canvas 2D' : 'WebGL') + ')', many.wrong === 0 && many.picksWrong === 0,
      many.wrong + ' squares with the wrong colour, ' + many.picksWrong + ' wrong picks');
  }
});

group('reference', async ({ page }) => {
  const views = [
    ['centred on the antimeridian', 'world', { lon: 180, lat: 5, k: 1 }],
    ['over the north pole', 'world', { lon: 0, lat: 85, k: 1.4 }],
    ['over the south pole', 'world', { lon: 120, lat: -85, k: 1.4 }],
    ['Europe at ×20', 'world', { lon: 14, lat: 43.5, k: 20 }],
    ['limb crossing Russia', 'world', { lon: 5, lat: -18, k: 1 }],
    ['Atlantic, whole globe', 'world', { lon: -30, lat: 20, k: 1 }],
    ['110m world', 'world110', { lon: 100, lat: 30, k: 1.2 }]
  ];
  for (const [label, set, view] of views) {
    const r = await page.evaluate(async ({ set, view }) => {
      const data = await T.load(set);
      if (!window.globe || T.shown !== set) {
        const globe = T.create({ theme: T.FLAT });
        globe.setGraticule(false);
        await globe.setLayers([T.layer('active', data, { style: 'mark', bordersVisible: false })]);
        T.shown = set;
      }
      globe.setView(view);
      const img = await T.capture(globe);
      const mask = T.maskOf(img);
      const reference = T.referenceMask(data.features, view, img.width, img.height, globe.radiusPx());
      let land = 0;
      for (let i = 0; i < mask.length; i++) land += reference[i];
      return { iou: T.iou(mask, reference), land: land / mask.length };
    }, { set, view });
    check('reference: WebGL matches d3.geoOrthographic, ' + label, r.iou >= 0.985 && r.land > 0.02,
      'IoU ' + fmt(r.iou, 4) + ', land covers ' + fmt(r.land * 100, 1) + '%');
  }
  // The same comparison at views nobody chose: anywhere on the globe, at any zoom up to ×40
  const sweep = await page.evaluate(async () => {
    const data = await T.load('world');
    const globe = T.create({ theme: T.FLAT });
    globe.setGraticule(false);
    await globe.setLayers([T.layer('active', data, { style: 'mark', bordersVisible: false })]);
    const rnd = T.random(2026);
    const out = { views: 0, withLand: 0, worst: 1, worstView: null };
    for (let i = 0; i < 16; i++) {
      const q = T.randomLonLat(rnd);
      const view = { lon: q[0], lat: Math.max(-85, Math.min(85, q[1])), k: Math.pow(40, rnd()) };
      globe.setView(view);
      const img = await T.capture(globe);
      const reference = T.referenceMask(data.features, view, img.width, img.height, globe.radiusPx());
      const iou = T.iou(T.maskOf(img), reference);
      out.views++;
      if (reference.some(v => v)) out.withLand++;
      if (iou < out.worst) { out.worst = iou; out.worstView = view; }
    }
    return out;
  });
  check('reference: WebGL matches d3.geoOrthographic at 16 random views of the 50m world', sweep.worst >= 0.985 && sweep.withLand >= 10,
    'lowest IoU ' + fmt(sweep.worst, 4) + (sweep.worstView ? ' at ' + fmt(sweep.worstView.lon, 1) + ', ' + fmt(sweep.worstView.lat, 1) + ' ×' + fmt(sweep.worstView.k, 1) : '') + '; ' + sweep.withLand + ' of ' + sweep.views + ' views show land');
});

// Sets up the 110m world (quick to rasterise in software) and an event log for input checks.
async function inputSetup(page, view, opts) {
  await page.evaluate(async ({ view, opts }) => {
    const world = await T.load('world110');
    const globe = T.create(opts);
    await globe.setLayers([T.layer('world', world)]);
    globe.setView(view);
    T.log = [];
    globe.on('click', e => T.log.push({ type: 'click', x: e.x, y: e.y, hit: e.hit && e.hit.key, lonlat: e.lonlat, hasEvent: !!e.originalEvent }));
    globe.on('hover', hit => T.log.push({ type: 'hover', hit: hit && hit.key }));
    globe.on('settle', v => T.log.push({ type: 'settle', k: v.k }));
    T.settled = () => new Promise(resolve => { const off = globe.on('settle', () => { off(); resolve(); }); });
    await T.frames(2);
  }, { view, opts: opts || {} });
}
const clicks = page => page.evaluate(() => T.log.filter(e => e.type === 'click'));
const getView = page => page.evaluate(() => globe.getView());

group('drag', async ({ page }) => {
  await inputSetup(page, { lon: 0, lat: 0, k: 1 });
  // Slow drag, held still before release: the ground follows the pointer and nothing glides
  const cursorIdle = await page.evaluate(() => document.querySelector('.globe-gl').style.cursor);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(400 + i * 12, 300 + i * 4);
  const cursorDragging = await page.evaluate(() => document.querySelector('.globe-gl').style.cursor);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.evaluate(() => T.frames(3));
  const v = await getView(page);
  // The first 12 px step only arms the drag; the other nine (108 px, 36 px) turn a 276 px globe
  const R = 0.46 * 600;
  check('drag: rotates so the ground follows the pointer', Math.abs(v.lon - (-108 / R * 180 / Math.PI)) < 1 && Math.abs(v.lat - 36 / R * 180 / Math.PI) < 0.5,
    'lon ' + fmt(v.lon) + '° (expected ' + fmt(-108 / R * 180 / Math.PI) + '), lat ' + fmt(v.lat) + '° (expected ' + fmt(36 / R * 180 / Math.PI) + ')');
  check('drag: does not report a click', (await clicks(page)).length === 0);
  check('drag: cursor is grab, grabbing while dragging', /grab\)/.test(cursorIdle) && /grabbing\)/.test(cursorDragging), cursorIdle + ' / ' + cursorDragging);
  await page.waitForTimeout(300);
  const v2 = await getView(page);
  check('drag: no glide after the pointer rested', v2.lon === v.lon && v2.lat === v.lat);

  // A flick: released while moving, the globe glides on and then comes to rest. Sent as
  // synthetic pointer events from inside the page so their timing is not at the mercy of
  // the test driver.
  const flick = () => page.evaluate(async () => {
    const canvas = document.querySelector('.globe-gl');
    const send = (type, x) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: 300, bubbles: true }));
    send('pointerdown', 300);
    for (let i = 1; i <= 6; i++) { await T.wait(12); send('pointermove', 300 + i * 15); }
    send('pointerup', 390);
    return globe.getView();
  });
  const atRelease = await flick();
  await page.evaluate(() => T.settled());
  const afterGlide = await getView(page);
  check('drag: a flick glides on with inertia, then settles', afterGlide.lon < atRelease.lon - 3, 'glided ' + fmt(atRelease.lon - afterGlide.lon) + '° further');
  const frames = await page.evaluate(() => globe.stats().frames);
  await page.waitForTimeout(400);
  check('drag: idle after the glide (no frames drawn)', await page.evaluate(() => globe.stats().frames) === frames);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await flick();
  await page.waitForTimeout(300);
  check('drag: no glide when the user prefers reduced motion', (await getView(page)).lon === still.lon);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // The caller's own switch says the same thing, whatever the system says
  await page.evaluate(() => globe.setOptions({ reducedMotion: true }));
  const stillByOption = await flick();
  await page.waitForTimeout(300);
  check('drag: no glide with the reducedMotion option on', (await getView(page)).lon === stillByOption.lon);
  await page.evaluate(() => globe.setOptions({ reducedMotion: null }));

  // Dragging from empty space beside the globe rotates too
  await page.evaluate(() => { globe.setView({ lon: 0, lat: 0, k: 1 }); });
  await page.mouse.move(20, 20);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(20 + i * 10, 20);
  await page.waitForTimeout(150);
  await page.mouse.up();
  check('drag: starting off the globe still rotates', (await getView(page)).lon < -5, 'lon ' + fmt((await getView(page)).lon) + '°');
});

group('click', async ({ page }) => {
  await inputSetup(page, { lon: 10, lat: 30, k: 1.2 });
  const paris = await page.evaluate(() => globe.project([2.35, 48.86]));
  await page.mouse.click(paris.x, paris.y);
  let log = await clicks(page);
  check('click: reported with position, lon/lat, hit and the DOM event', log.length === 1 && log[0].hit === 'France' && log[0].hasEvent &&
    Math.abs(log[0].x - paris.x) < 1 && Math.abs(log[0].y - paris.y) < 1 && Math.abs(log[0].lonlat[0] - 2.35) < 0.3 && Math.abs(log[0].lonlat[1] - 48.86) < 0.3,
    JSON.stringify(log[0]));

  // A press that wobbles 3 px is still a click; one that travels 10 px is a drag
  await page.waitForTimeout(400);
  await page.mouse.move(paris.x, paris.y);
  await page.mouse.down();
  await page.mouse.move(paris.x + 3, paris.y + 2);
  await page.mouse.up();
  const before = await getView(page);
  log = await clicks(page);
  check('click: a 3 px wobble still clicks and does not move the globe', log.length === 2 && before.lon === 10 && before.lat === 30);
  await page.waitForTimeout(400);
  await page.mouse.move(paris.x, paris.y);
  await page.mouse.down();
  await page.mouse.move(paris.x + 10, paris.y);
  await page.waitForTimeout(120);
  await page.mouse.up();
  check('click: a 10 px press-and-move is a drag, not a click', (await clicks(page)).length === 2);

  // Clicking the sea reports no hit; clicking space reports no lon/lat either
  await page.waitForTimeout(400);
  await page.evaluate(() => globe.setView({ lon: -150, lat: 20, k: 1 }));
  await page.mouse.click(400, 300);
  await page.waitForTimeout(400);
  await page.mouse.click(8, 8);
  log = await clicks(page);
  check('click: open sea → hit null; off the globe → lonlat null', log.length === 4 && log[2].hit === null && Array.isArray(log[2].lonlat) && log[3].lonlat === null && log[3].hit === null,
    JSON.stringify(log.slice(2)));

  // Double click: both clicks are reported, and the view zooms ×2 keeping the point in place
  await page.waitForTimeout(400);
  await page.evaluate(() => { globe.setView({ lon: 10, lat: 30, k: 1.2 }); T.log.length = 0; });
  const target = await page.evaluate(() => globe.invert(520, 240));
  await page.mouse.dblclick(520, 240);
  await page.evaluate(() => T.settled());
  const v = await getView(page);
  const now = await page.evaluate(() => globe.invert(520, 240));
  check('double click: zooms ×2 toward the point', Math.abs(v.k - 2.4) < 0.02 && Math.hypot(now[0] - target[0], now[1] - target[1]) < 0.05 && (await clicks(page)).length === 2,
    'k ' + fmt(v.k) + ', point under cursor moved ' + Math.hypot(now[0] - target[0], now[1] - target[1]).toExponential(1) + '°');
});

group('wheel', async ({ page }) => {
  await inputSetup(page, { lon: 20, lat: 10, k: 1 });
  const target = await page.evaluate(() => globe.invert(520, 250));
  await page.mouse.move(520, 250);
  await page.mouse.wheel(0, -400);
  await page.evaluate(() => T.frame());
  const mid = await getView(page);
  await page.evaluate(() => T.settled());
  const v = await getView(page);
  const now = await page.evaluate(() => globe.invert(520, 250));
  const drift = Math.hypot(now[0] - target[0], now[1] - target[1]);
  check('wheel: zooms in toward the cursor', Math.abs(v.k - Math.pow(2, 0.8)) < 0.01 && drift < 0.01, 'k ' + fmt(v.k, 3) + ' (expected ' + fmt(Math.pow(2, 0.8), 3) + '), point under cursor drifted ' + drift.toExponential(1) + '°');
  check('wheel: the zoom is eased over several frames', mid.k > 1 && mid.k < v.k, 'k after one frame ' + fmt(mid.k, 3));
  await page.mouse.wheel(0, 100000);
  await page.evaluate(() => T.settled());
  const out = await getView(page);
  await page.mouse.wheel(0, -100000);
  await page.evaluate(() => T.settled());
  const inn = await getView(page);
  check('wheel: zoom is clamped to [minZoom, maxZoom]', out.k === 1 && inn.k === 80, out.k + ' … ' + inn.k);
  const scrolled = await page.evaluate(() => window.scrollY);
  check('wheel: the page itself does not scroll', scrolled === 0);
  // A trackpad pinch arrives as a ctrl+wheel with small deltas
  await page.evaluate(() => { globe.setView({ lon: 20, lat: 10, k: 1 }); return T.settled(); });
  await page.evaluate(() => {
    document.querySelector('.globe-gl').dispatchEvent(new WheelEvent('wheel', { deltaY: -20, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
    return T.settled();
  });
  const pinch = await getView(page);
  check('wheel: ctrl+wheel (trackpad pinch) zooms ten times as fast', Math.abs(pinch.k - Math.pow(2, 0.4)) < 0.01, 'k ' + fmt(pinch.k, 3));
});

group('pinch', async ({ page }) => {
  await inputSetup(page, { lon: 20, lat: 10, k: 1.5 });
  const client = await page.context().newCDPSession(page);
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p[0], y: p[1], id })) });
  const target = await page.evaluate(() => globe.invert(400, 300));
  await touch('touchStart', [[300, 300], [500, 300]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[300 - i * 10, 300 + i * 2], [500 + i * 10, 300 + i * 2]]);
  await page.evaluate(() => T.frames(2));
  const v = await getView(page);
  const p = await page.evaluate(t => globe.project(t), target);
  check('pinch: spreading two fingers ×2 doubles the zoom', Math.abs(v.k - 3) < 0.05, 'k ' + fmt(v.k, 3));
  check('pinch: the ground under the fingers follows their midpoint', Math.hypot(p.x - 400, p.y - 320) < 1.5, 'now at ' + fmt(p.x, 1) + ', ' + fmt(p.y, 1) + ' (midpoint 400, 320)');
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
  const after = await getView(page);
  check('pinch: no click and no glide when the fingers lift', (await clicks(page)).length === 0 && after.lon === v.lon && after.k === v.k);

  // One finger: tap, then drag
  await touch('touchStart', [[400, 300]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
  const taps = await clicks(page);
  check('touch: a tap is a click', taps.length === 1 && Math.abs(taps[0].x - 400) < 1 && Math.abs(taps[0].y - 300) < 1, JSON.stringify(taps[0]));
  await touch('touchStart', [[400, 300]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[400 + i * 10, 300]]);
  await page.waitForTimeout(150);
  await touch('touchEnd', []);
  const dragged = await getView(page);
  check('touch: a one-finger drag rotates without clicking', dragged.lon < after.lon - 3 && (await clicks(page)).length === 1, 'lon ' + fmt(after.lon) + '° → ' + fmt(dragged.lon) + '°');
  // Double tap
  await page.waitForTimeout(400);
  await touch('touchStart', [[420, 280]]); await touch('touchEnd', []);
  await touch('touchStart', [[424, 283]]); await touch('touchEnd', []);
  await page.evaluate(() => T.settled());
  const zoomed = await getView(page);
  check('touch: a double tap zooms ×2', Math.abs(zoomed.k - 2 * dragged.k) < 0.05, 'k ' + fmt(dragged.k) + ' → ' + fmt(zoomed.k));
});

group('lost-release', async ({ page }) => {
  // A press whose release the browser never delivers (a system gesture took the touch, the mouse
  // was let go while another window had focus) must not leave the globe thinking it is still down
  await inputSetup(page, { lon: 20, lat: 10, k: 1.5 });
  const client = await page.context().newCDPSession(page);
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p[0], y: p[1], id })) });
  // A press that reaches the globe and is never released
  const ghost = (o) => page.evaluate(o => {
    document.querySelector('.globe-gl').dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: 250, clientY: 300, button: 0, buttons: 1, bubbles: true, cancelable: true }, o)));
  }, o);

  // Touch: a finger that never lifted, then one finger swiping sideways
  await ghost({ pointerId: 901, pointerType: 'touch', isPrimary: true });
  const before = await getView(page);
  await touch('touchStart', [[400, 300]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[400 + i * 15, 300]]);
  await page.waitForTimeout(150);
  await touch('touchEnd', []);
  await page.evaluate(() => T.frames(2));
  const swiped = await getView(page);
  check('lost release (touch): a one-finger swipe turns the globe and does not zoom', swiped.k === before.k && swiped.lon < before.lon - 3,
    'k ' + fmt(before.k, 3) + ' → ' + fmt(swiped.k, 3) + ', lon ' + fmt(before.lon) + '° → ' + fmt(swiped.lon) + '°');
  await page.waitForTimeout(400);
  await ghost({ pointerId: 902, pointerType: 'touch', isPrimary: true });
  await touch('touchStart', [[400, 300]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
  check('lost release (touch): a tap is still a click', (await clicks(page)).length === 1, (await clicks(page)).length + ' clicks');
  // A pinch still zooms after one
  await ghost({ pointerId: 903, pointerType: 'touch', isPrimary: true });
  await page.evaluate(() => { globe.setView({ lon: 20, lat: 10, k: 1.5 }); return T.frames(2); });
  await touch('touchStart', [[300, 300], [500, 300]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[300 - i * 10, 300], [500 + i * 10, 300]]);
  await touch('touchEnd', []);
  await page.evaluate(() => T.frames(2));
  const pinched = await getView(page);
  check('lost release (touch): two fingers still pinch to zoom', Math.abs(pinched.k - 3) < 0.05, 'k ' + fmt(pinched.k, 3));

  // Mouse, on a globe of its own: a button that was let go where the page could not see it
  await page.waitForTimeout(400);
  await inputSetup(page, { lon: 20, lat: 10, k: 1.5 });
  await ghost({ pointerId: 1, pointerType: 'mouse', isPrimary: true });
  const still = await getView(page);
  for (let i = 1; i <= 8; i++) await page.mouse.move(300 + i * 20, 300);
  await page.evaluate(() => T.frames(2));
  const hovered = await getView(page);
  check('lost release (mouse): moving the mouse with no button down does not drag the globe', hovered.lon === still.lon && hovered.lat === still.lat && hovered.k === still.k,
    'lon ' + fmt(still.lon) + '° → ' + fmt(hovered.lon) + '°, k ' + fmt(still.k, 3) + ' → ' + fmt(hovered.k, 3));
  await ghost({ pointerId: 1, pointerType: 'mouse', isPrimary: true });
  await page.mouse.click(420, 300);
  await page.waitForTimeout(350);
  await page.mouse.click(460, 280);
  check('lost release (mouse): clicks are clicks again, every one of them', (await clicks(page)).length === 2, (await clicks(page)).length + ' clicks');
  await page.waitForTimeout(400);
  const v0 = await getView(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(400 + i * 12, 300);
  await page.waitForTimeout(150);
  await page.mouse.up();
  const v1 = await getView(page);
  check('lost release (mouse): a drag with the button down still turns the globe', v1.lon < v0.lon - 3, 'lon ' + fmt(v0.lon) + '° → ' + fmt(v1.lon) + '°');
});

group('hover', async ({ page }) => {
  await inputSetup(page, { lon: 10, lat: 40, k: 1.5 });
  const r0 = await page.evaluate(() => {
    globe.defineStyles({ hover: '#00ffff' });
    globe.setHoverStyle('world', 'hover', key => key !== 'Spain');
    return { paris: globe.project([2.35, 48.86]), madrid: globe.project([-3.7, 40.4]), sea: globe.project([-20, 45]) };
  });
  await page.mouse.move(r0.paris.x, r0.paris.y);
  const overFrance = await page.evaluate(async p => T.pixel(await T.capture(globe), p.x + 6, p.y + 6), r0.paris);
  await page.mouse.move(r0.madrid.x, r0.madrid.y);
  const overSpain = await page.evaluate(async ({ m, p }) => {
    const img = await T.capture(globe);
    return { spain: T.pixel(img, m.x + 6, m.y + 6), france: T.pixel(img, p.x + 6, p.y + 6) };
  }, { m: r0.madrid, p: r0.paris });
  await page.mouse.move(r0.sea.x, r0.sea.y);
  await page.evaluate(() => T.frames(2));
  const frames = await page.evaluate(() => globe.stats().frames);
  await page.mouse.move(r0.sea.x + 5, r0.sea.y + 5);
  await page.mouse.move(r0.sea.x + 9, r0.sea.y + 2);
  await page.evaluate(() => T.frames(2));
  const framesAfter = await page.evaluate(() => globe.stats().frames);
  await page.mouse.move(r0.paris.x, r0.paris.y);
  await page.mouse.move(900, 650);
  await page.evaluate(() => T.frames(2));
  const hovers = await page.evaluate(() => T.log.filter(e => e.type === 'hover').map(e => e.hit));
  // The globe turning under a resting mouse changes what is hovered once the view settles
  await page.mouse.move(r0.paris.x, r0.paris.y);
  await page.evaluate(() => T.frames(2));
  const turned = await page.evaluate(async () => {
    const mouse = globe.project([2.35, 48.86]);
    globe.setView({ lon: 10 - 6.05, lat: 40 - 8.46, k: 1.5 });      // brings Madrid roughly under the mouse
    await T.settled();
    await T.frames(2);
    const under = globe.featureAt(mouse.x, mouse.y);
    const last = T.log.filter(e => e.type === 'hover').pop();
    return { under: under && under.key, hovered: last && last.hit };
  });
  check('hover: events follow the mouse, with null over the sea and on leaving', JSON.stringify(hovers) === JSON.stringify(['France', 'Spain', null, 'France', null]), JSON.stringify(hovers));
  check('hover: the hover style is painted, and removed when the mouse moves on', overFrance.join() === '0,255,255,255' && overSpain.france.join() === '245,235,212,255', overFrance.join() + ' then ' + overSpain.france.join());
  check('hover: keys rejected by the filter are not restyled', overSpain.spain.join() === '245,235,212,255', overSpain.spain.join());
  check('hover: moving the mouse without changing target draws nothing', framesAfter === frames, (framesAfter - frames) + ' frames');
  check('hover: re-evaluated when the globe moves under a resting mouse', turned.under !== 'France' && turned.hovered === turned.under, 'now over ' + turned.under + ', hover reported ' + turned.hovered);
});

group('view', async ({ page }) => {
  await inputSetup(page, { lon: 0, lat: 0, k: 1 });
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world110');
    const byName = name => world.features.find(f => T.name(f) === name);
    let views = 0, movingViews = 0;
    globe.on('view', (v, info) => { views++; if (info.moving) movingViews++; });
    globe.onsettle = () => { out.assignedSettle = (out.assignedSettle || 0) + 1; };

    // flyTo: eased, resolves true, ends exactly on target, fires view events and one settle
    let started = performance.now();
    out.flyResult = await globe.flyTo({ lon: 100, lat: 40, k: 3 }, { duration: 400 });
    out.flyMs = performance.now() - started;
    out.flyView = globe.getView();
    out.flyViews = views; out.flyMoving = movingViews;
    await T.settled();
    out.settles = T.log.filter(e => e.type === 'settle').length;
    out.assignedSettles = out.assignedSettle;

    // A pointer press interrupts a flight: the promise resolves false
    const flight = globe.flyTo({ lon: -100, lat: 0, k: 1 }, { duration: 2000 });
    await T.frames(3);
    const canvas = document.querySelector('.globe-gl');
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300, bubbles: true }));
    out.interrupted = await flight;
    out.interruptedAt = globe.getView();

    // setView is immediate; values are clamped and wrapped
    globe.setView({ lon: 190, lat: 89, k: 1000 });
    out.clamped = globe.getView();
    globe.setView({ k: 0.1 });
    out.clampedOut = globe.getView();

    // fitTo: every vertex inside the padded host, and the fit is tight in one direction
    const measure = (feature, padding) => {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, hidden = 0;
      const walk = a => {
        if (typeof a[0] === 'number') { const p = globe.project(a); if (!p.visible) hidden++; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
        else a.forEach(walk);
      };
      (Array.isArray(feature) ? feature : [feature]).forEach(f => walk(f.geometry.coordinates));
      return { inside: !hidden && minX >= padding - 0.01 && maxX <= 800 - padding + 0.01 && minY >= padding - 0.01 && maxY <= 600 - padding + 0.01,
        fill: Math.max((maxX - minX) / (800 - 2 * padding), (maxY - minY) / (600 - 2 * padding)), minX, maxX, minY, maxY };
    };
    out.fits = {};
    for (const name of ['Chile', 'France', 'Russia', 'United States of America', 'Fiji']) {
      globe.fitTo(byName(name), { padding: 30 });
      out.fits[name] = Object.assign(measure(byName(name), 30), { k: globe.getView().k });
    }
    globe.fitTo(['France', 'Spain', 'Italy'].map(byName), { padding: 50 });
    out.fits.group = measure(['France', 'Spain', 'Italy'].map(byName), 50);
    globe.fitTo(byName('Luxembourg'), { maxZoom: 6 });
    out.fitMaxZoom = globe.getView().k;
    globe.fitTo(world.features);
    out.fitWorld = globe.getView();

    // fitTo sets home; resetView returns there; setHome replaces it
    globe.fitTo(byName('France'), { padding: 30 });
    const home = globe.getView();
    globe.setView({ lon: -60, lat: -10, k: 5 });
    await globe.resetView({ animate: false });
    out.resetToFit = JSON.stringify(globe.getView()) === JSON.stringify(home);
    globe.setHome({ lon: 12, lat: 34, k: 2 });
    globe.setView({ lon: -60, lat: -10, k: 5 });
    out.resetAnimated = await globe.resetView();
    out.homeView = globe.getView();

    // An animated fit flies there
    out.fitAnimated = await globe.fitTo(byName('Chile'), { padding: 30, animate: true, duration: 300 });
    out.fitAnimatedInside = measure(byName('Chile'), 30).inside;

    // zoomBy about the centre of the screen
    globe.setView({ lon: 10, lat: 20, k: 2 });
    globe.zoomBy(2, { animate: false });
    out.zoomByNow = globe.getView();
    globe.zoomBy(0.5);
    await T.settled();
    out.zoomByEased = globe.getView();

    // spin: turns steadily, holds still while a pointer is down, stops on spin(0)
    globe.setView({ lon: 0, lat: 0, k: 1 });
    globe.spin(60);
    await T.wait(500);
    out.spun = globe.getView().lon;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300, bubbles: true }));
    await T.frames(2);
    const held = globe.getView().lon;
    await T.wait(250);
    out.heldStill = globe.getView().lon === held;
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300, bubbles: true }));
    await T.wait(250);
    out.resumed = globe.getView().lon > held;
    globe.spin(0);
    await T.frames(2);
    const stopped = globe.getView().lon;
    await T.wait(200);
    out.stopped = globe.getView().lon === stopped;
    out.radius = [globe.radiusPx(), globe.getView().k];
    return out;
  });
  check('flyTo: eases to the target and resolves true', r.flyResult === true && r.flyView.lon === 100 && r.flyView.lat === 40 && r.flyView.k === 3 && r.flyMs > 350 && r.flyMs < 2500,
    fmt(r.flyMs, 0) + ' ms, ' + r.flyViews + " 'view' events");
  check("events: 'view' fires per frame with moving=true during a flight, 'settle' once after it", r.flyViews >= 3 && r.flyMoving >= r.flyViews - 1 && r.settles === 1 && r.assignedSettles === 1,
    r.flyViews + ' view events (' + r.flyMoving + ' moving), ' + r.settles + ' settle, assigned handler called ' + r.assignedSettles + '×');
  check('flyTo: interrupted by user input, resolves false part-way', r.interrupted === false && r.interruptedAt.lon !== -100, 'stopped at lon ' + fmt(r.interruptedAt.lon));
  check('setView: wraps longitude, clamps latitude to ±85 and zoom to its limits', r.clamped.lon === -170 && r.clamped.lat === 85 && r.clamped.k === 80 && r.clampedOut.k === 1, JSON.stringify(r.clamped));
  Object.keys(r.fits).forEach(name => check('fitTo: ' + name + ' fits inside the padding and fills it', r.fits[name].inside && r.fits[name].fill > 0.93 && r.fits[name].fill <= 1.0001,
    'fills ' + fmt(r.fits[name].fill * 100, 1) + '% of the free space' + (r.fits[name].k ? ' at k ' + fmt(r.fits[name].k) : '')));
  check('fitTo: maxZoom caps the zoom; the whole world falls back to the full globe', Math.abs(r.fitMaxZoom - 6) < 1e-9 && r.fitWorld.k < 1.1, 'k ' + r.fitMaxZoom + ' / world k ' + fmt(r.fitWorld.k) + ' centred ' + fmt(r.fitWorld.lon, 1) + ', ' + fmt(r.fitWorld.lat, 1));
  check('resetView: returns to the fitted home; setHome replaces it', r.resetToFit && r.resetAnimated === true && r.homeView.lon === 12 && r.homeView.lat === 34 && r.homeView.k === 2);
  check('fitTo: animate flies to the fit', r.fitAnimated === true && r.fitAnimatedInside);
  check('zoomBy: immediate and eased, about the screen centre', r.zoomByNow.k === 4 && r.zoomByNow.lon === 10 && Math.abs(r.zoomByEased.k - 2) < 1e-9 && r.zoomByEased.lon === 10 && r.zoomByEased.lat === 20, r.zoomByNow.k + ' → ' + r.zoomByEased.k);
  check('spin: rotates, pauses while a pointer is down, resumes, stops', r.spun > 5 && r.heldStill && r.resumed && r.stopped, 'turned ' + fmt(r.spun, 1) + '° in 0.5 s at 60°/s');
  check('radiusPx: 0.46 × min(width, height) × k', Math.abs(r.radius[0] - 0.46 * 600 * r.radius[1]) < 1e-9);

  // Reduced motion: flights are instant
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(async () => {
    globe.setView({ lon: 0, lat: 0, k: 1 });
    const started = performance.now();
    const done = await globe.flyTo({ lon: 90, lat: 10, k: 2 });
    return { ms: performance.now() - started, done, view: globe.getView() };
  });
  check('flyTo: instant when the user prefers reduced motion', reduced.done === true && reduced.ms < 30 && reduced.view.lon === 90, fmt(reduced.ms, 1) + ' ms');
  // The reducedMotion option overrides the system's setting either way; null follows it again
  const flight = () => page.evaluate(async () => {
    globe.setView({ lon: 0, lat: 0, k: 1 });
    const started = performance.now();
    await globe.flyTo({ lon: 90, lat: 10, k: 2 }, { duration: 300 });
    const zoomStarted = performance.now();
    globe.zoomBy(2);
    // An eased zoom takes many frames; a reduced one is all there on the next
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const k = globe.getView().k;
    await T.settled();
    return { ms: zoomStarted - started, zoomedAtOnce: Math.abs(k - 4) < 1e-9 };
  });
  await page.evaluate(() => globe.setOptions({ reducedMotion: false }));
  const forcedFull = await flight();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => globe.setOptions({ reducedMotion: true }));
  const forcedStill = await flight();
  await page.evaluate(() => globe.setOptions({ reducedMotion: null }));
  const followed = await flight();
  check('setOptions: reducedMotion false keeps the animations though the system asks for less',
    forcedFull.ms > 150 && !forcedFull.zoomedAtOnce, fmt(forcedFull.ms, 0) + ' ms');
  check('setOptions: reducedMotion true makes flights and zooms instant though the system does not ask',
    forcedStill.ms < 30 && forcedStill.zoomedAtOnce, fmt(forcedStill.ms, 1) + ' ms');
  check('setOptions: reducedMotion null follows the system again', followed.ms > 150 && !followed.zoomedAtOnce, fmt(followed.ms, 0) + ' ms');

  // Resizing the host keeps a fitted view fitted
  const resized = await page.evaluate(async () => {
    const world = await T.load('world110');
    const chile = world.features.find(f => T.name(f) === 'Chile');
    globe.fitTo(chile, { padding: 30 });
    const before = globe.getView();
    const host = document.getElementById('host');
    host.style.width = '400px'; host.style.height = '700px';
    await T.frames(3);
    const after = globe.getView();
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    const walk = a => { if (typeof a[0] === 'number') { const p = globe.project(a); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); } else a.forEach(walk); };
    walk(chile.geometry.coordinates);
    const canvas = document.querySelector('.globe-gl');
    const out = { before, after, minX, maxX, minY, maxY, canvas: [canvas.width, canvas.height], radius: globe.radiusPx() };
    host.style.width = '800px'; host.style.height = '600px';
    await T.frames(3);
    out.restored = globe.getView();
    return out;
  });
  check('resize: canvases follow the host and a fitted view is re-fitted', resized.canvas[0] === 400 && resized.canvas[1] === 700 && resized.minY >= 29.9 && resized.maxY <= 670.1 && resized.minX >= 29.9 && resized.maxX <= 370.1 &&
    Math.abs(resized.restored.k - resized.before.k) < 1e-9, 'k ' + fmt(resized.before.k) + ' → ' + fmt(resized.after.k) + ' → ' + fmt(resized.restored.k));
});

group('ensureVisible', async ({ page }) => {
  await inputSetup(page, { lon: 0, lat: 0, k: 1 });
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world110');
    const byName = name => world.features.find(f => T.name(f) === name);
    const onScreen = (lonlat, margin) => { const p = globe.project(lonlat); return p.visible && p.x >= margin && p.x <= 800 - margin && p.y >= margin && p.y <= 600 - margin; };
    // Already comfortably in view: nothing moves
    globe.setView({ lon: 10, lat: 45, k: 2 });
    const before = JSON.stringify(globe.getView());
    out.stayResult = await globe.ensureVisible(byName('France'), { animate: false });
    out.stayed = JSON.stringify(globe.getView()) === before;
    out.stayedPoint = (await globe.ensureVisible([12, 42], { animate: false })) && JSON.stringify(globe.getView()) === before;
    // On the far side: turns to face it
    await globe.ensureVisible(byName('Australia'), { animate: false });
    out.farSide = onScreen(globe.featureInfo('world', 'Australia').centroid, 60);
    out.farSideZoomKept = globe.getView().k === 2;
    // A point on the far side, animated
    globe.setView({ lon: 0, lat: 0, k: 1 });
    out.flew = await globe.ensureVisible([-150, 60]);
    out.pointVisible = onScreen([-150, 60], 60);
    // Visible but within the margin of the host's edge
    globe.setView({ lon: 0, lat: 0, k: 3 });
    const edge = globe.invert(790, 300);
    await globe.ensureVisible(edge, { animate: false });
    out.fromEdge = onScreen(edge, 60);
    // Off-screen although on the near side
    globe.setView({ lon: 0, lat: 0, k: 8 });
    await globe.ensureVisible([30, 30], { animate: false });
    out.offScreen = onScreen([30, 30], 60);
    // A feature too small to see: zoom in until it is about 24 px across
    globe.setView({ lon: 0, lat: 40, k: 1 });
    const info = globe.featureInfo('world', 'Luxembourg');
    const sizeBefore = 2 * globe.radiusPx() * Math.sin(info.radiusDeg * Math.PI / 180);
    await globe.ensureVisible(byName('Luxembourg'), { animate: false });
    out.tiny = { sizeBefore, sizeAfter: 2 * globe.radiusPx() * Math.sin(info.radiusDeg * Math.PI / 180), centred: onScreen(info.centroid, 200) };
    // A feature the engine has never seen works too
    globe.setView({ lon: 0, lat: 0, k: 1 });
    const stranger = { type: 'Feature', properties: { name: 'box' }, geometry: { type: 'Polygon', coordinates: [[[170, -40], [170, -45], [175, -45], [175, -40], [170, -40]]] } };
    await globe.ensureVisible(stranger, { animate: false });
    out.stranger = onScreen([172.5, -42.5], 60);
    return out;
  });
  check('ensureVisible: leaves the view alone when the target is comfortably in view', r.stayed && r.stayedPoint && r.stayResult === true);
  check('ensureVisible: turns to a feature on the far side, keeping the zoom', r.farSide && r.farSideZoomKept);
  check('ensureVisible: flies to a far-side point', r.flew === true && r.pointVisible);
  check('ensureVisible: moves a target away from the edge of the host', r.fromEdge);
  check('ensureVisible: brings an off-screen target into view', r.offScreen);
  check('ensureVisible: zooms in on a feature under 10 px until it is about 24 px', r.tiny.sizeBefore < 10 && Math.abs(r.tiny.sizeAfter - 24) < 0.5 && r.tiny.centred,
    fmt(r.tiny.sizeBefore, 1) + ' px → ' + fmt(r.tiny.sizeAfter, 1) + ' px');
  check('ensureVisible: accepts a feature that is not in any layer', r.stranger);
});

group('overlay', async ({ page }) => {
  await inputSetup(page, { lon: 20, lat: 20, k: 1 });
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world110');
    const overlay = document.querySelector('#host canvas.globe-overlay');
    const read = () => overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height);
    const alphaAt = (img, p) => img.data[(Math.round(p.y) * img.width + Math.round(p.x)) * 4 + 3];
    const count = img => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 40) n++; return n; };
    out.layout = { pointerEvents: getComputedStyle(overlay).pointerEvents, size: [overlay.width, overlay.height], order: [...document.querySelectorAll('#host canvas')].map(c => c.className).join(' > ') };

    // A callback draws at project() and sees the frame's details
    let info = null, calls = 0;
    const cairo = [31.2, 30.0];
    const off = globe.addOverlay((ctx, g) => {
      calls++;
      info = { width: g.width, height: g.height, dpr: g.dpr, radius: g.radiusPx, time: g.time, lon: g.view.lon, k: g.view.k };
      const p = g.project(cairo);
      ctx.fillStyle = '#f0f';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
    });
    await T.frames(2);
    out.info = info;
    out.dotAtCairo = alphaAt(read(), globe.project(cairo));
    globe.setView({ lon: 60, lat: 10, k: 1.5 });
    await T.frames(2);
    out.dotFollows = alphaAt(read(), globe.project(cairo)) > 200 && info.lon === 60 && info.k === 1.5;
    // invalidate() asks for one redraw; animate(ms) keeps them coming
    let before = calls;
    globe.invalidate();
    await T.frames(3);
    out.invalidateCalls = calls - before;
    before = calls;
    globe.animate(300);
    await T.wait(500);
    out.animateCalls = calls - before;
    before = calls;
    await T.wait(200);
    out.afterAnimate = calls - before;
    off();
    await T.frames(2);
    out.clearedAfterOff = count(read());

    // geoLine: a great-circle arc, drawn only on the near side
    globe.setView({ lon: 0, lat: 30, k: 1 });
    const a = [-0.1, 51.5], b = [139.7, 35.7];       // London → Tokyo; Tokyo is beyond the limb
    const offLine = globe.addOverlay(ctx => globe.draw.geoLine(ctx, a, b, { color: '#f00', width: 3 }));
    await T.frames(2);
    let img = read();
    const arc = d3.geoInterpolate(a, b);
    let onArc = 0, visibleSamples = 0, farthest = 0;
    for (let i = 0; i <= 40; i++) {
      const p = globe.project(arc(i / 40));
      if (p.visible && p.z > 0.05) { visibleSamples++; if (alphaAt(img, p) > 100) onArc++; }
    }
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 40) farthest = Math.max(farthest, Math.hypot(x - 400, y - 300));
    }
    out.line = { onArc, visibleSamples, farthest, radius: globe.radiusPx(), tokyoVisible: globe.project(b).visible };
    offLine();

    // outline: stroke and fill of one feature
    globe.setView({ lon: 2, lat: 46, k: 4 });
    const france = world.features.find(f => T.name(f) === 'France');
    const offOutline = globe.addOverlay(ctx => globe.draw.outline(ctx, france, { stroke: '#00f', width: 3, fill: 'rgba(0,255,0,0.5)' }));
    await T.frames(2);
    img = read();
    const centre = globe.project([2.5, 47]), outside = globe.project([10, 51]);
    const o = (Math.round(centre.y) * img.width + Math.round(centre.x)) * 4;
    out.outline = { fill: [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]], outside: alphaAt(img, outside), pixels: count(img) };
    offOutline();

    // rings: nothing at t = 0 or 1, rings in between, nothing for a place on the far side
    globe.setView({ lon: 0, lat: 0, k: 1 });
    let t = 0, place = [10, 10];
    const offRings = globe.addOverlay(ctx => globe.draw.rings(ctx, place, { t, color: '#000', count: 3 }));
    const ringPixels = async value => { t = value; globe.invalidate(); await T.frames(2); return count(read()); };
    out.rings = [await ringPixels(0), await ringPixels(0.3), await ringPixels(0.6), await ringPixels(1)];
    place = [180, 0];
    out.ringsFarSide = await ringPixels(0.5);
    offRings();
    return out;
  });
  check('overlay: a 2D canvas above the scene, same size, ignoring pointer events', r.layout.pointerEvents === 'none' && r.layout.order === 'globe-gl > globe-overlay' && r.layout.size.join() === '800,600', r.layout.order);
  check('overlay: callbacks get the frame details and draw where project() says', r.dotAtCairo > 200 && r.info.width === 800 && r.info.height === 600 && r.info.dpr === 1 && Math.abs(r.info.radius - 276) < 1e-9 && r.info.time > 0, JSON.stringify(r.info));
  check('overlay: redrawn with every view change', r.dotFollows);
  check('overlay: invalidate() draws one frame, animate(ms) draws for that long, then idle', r.invalidateCalls === 1 && r.animateCalls >= 3 && r.afterAnimate === 0,
    'invalidate → ' + r.invalidateCalls + ', animate(300) → ' + r.animateCalls + ', afterwards ' + r.afterAnimate);
  check('overlay: removing the callback clears the canvas', r.clearedAfterOff === 0);
  check('draw.geoLine: follows the great circle and stops at the limb', !r.line.tokyoVisible && r.line.visibleSamples > 10 && r.line.onArc === r.line.visibleSamples && r.line.farthest <= r.line.radius + 2.5,
    r.line.onArc + '/' + r.line.visibleSamples + ' samples on the arc, farthest ink ' + fmt(r.line.farthest, 1) + ' px from centre (radius ' + fmt(r.line.radius, 0) + ')');
  check('draw.outline: fills and strokes the feature only', r.outline.fill[1] > 200 && r.outline.fill[3] > 100 && r.outline.fill[3] < 160 && r.outline.outside === 0, 'fill ' + r.outline.fill.join(','));
  check('draw.rings: expand and fade with t; nothing on the far side', r.rings[0] === 0 && r.rings[1] > 100 && r.rings[2] > 100 && r.rings[3] === 0 && r.ringsFarSide === 0, 'pixels at t = 0, 0.3, 0.6, 1: ' + r.rings.join(', '));
});

group('performance', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world'), coarse = await T.load('world110');
    const globe = T.create();
    await globe.setLayers([T.layer('context', coarse, { interactive: false }), T.layer('world', world)]);
    globe.addOverlay((ctx, g) => { const p = g.project([2.35, 48.86]); if (p.visible) ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
    await T.wait(500);
    // Count GL draw calls by wrapping them on this context
    const gl = document.querySelector('.globe-gl').getContext('webgl');
    let calls = 0;
    ['drawArrays', 'drawElements'].forEach(name => {
      const original = gl[name];
      gl[name] = function () { calls++; return original.apply(this, arguments); };
    });
    // Idle: nothing is drawn
    let frames = globe.stats().frames;
    await T.wait(700);
    out.idleFrames = globe.stats().frames - frames;
    out.idleCalls = calls;
    // A scripted 120-frame rotation with some zooming
    const times = [];
    let maxCalls = 0;
    frames = globe.stats().frames;
    for (let i = 0; i < 120; i++) {
      globe.setView({ lon: 3 + i * 3, lat: 25 * Math.sin(i / 12), k: 1 + (i % 40) / 16 });
      calls = 0;
      await T.frame();
      times.push(globe.stats().lastFrameMs);
      maxCalls = Math.max(maxCalls, calls);
    }
    out.framesDrawn = globe.stats().frames - frames;
    times.sort((a, b) => a - b);
    out.median = times[60]; out.p95 = times[113]; out.max = times[119];
    out.mean = times.reduce((a, b) => a + b, 0) / times.length;
    out.maxCalls = maxCalls;
    out.stats = globe.stats();
    return out;
  });
  check('idle: no frames and no draw calls while nothing changes', r.idleFrames === 0 && r.idleCalls === 0, r.idleFrames + ' frames, ' + r.idleCalls + ' draw calls in 0.7 s');
  check('performance: JS time per frame under 2 ms over a 120-frame rotation (50m world + context layer + overlay)', r.framesDrawn === 120 && r.mean < 2 && r.p95 < 2,
    'mean ' + fmt(r.mean) + ' ms, median ' + fmt(r.median) + ', p95 ' + fmt(r.p95) + ', max ' + fmt(r.max) + ' (' + Math.round(r.stats.triangles) + ' triangles, ' + r.stats.segments + ' segments)');
  check('performance: at most 10 draw calls per frame', r.maxCalls > 0 && r.maxCalls <= 10, r.maxCalls + ' draw calls with two layers');
});

group('canvas2d', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world'), coarse = await T.load('world110');
    const globe = T.create({ forceCanvas2D: true });
    out.renderer = globe.stats().renderer;
    out.canvases = [...document.querySelectorAll('#host canvas')].map(c => c.className).join(' > ');

    // Picking runs on the same code as the WebGL path
    await globe.setLayers([T.layer('world', world, { bordersVisible: false })]);
    const at = lonlat => { const p = globe.project(lonlat), hit = globe.featureAt(p.x, p.y); return hit && hit.key; };
    globe.setView({ lon: 10, lat: 30, k: 1.2 });
    out.paris = at([2.35, 48.86]); out.nairobi = at([36.82, -1.29]);
    globe.setView({ lon: -150, lat: 20, k: 1 });
    out.pacific = at([-150, 30]);
    globe.setView({ lon: 160, lat: 0, k: 1 });
    const n = globe.project([166.93, -0.52]), hit = globe.featureAt(n.x - 12, n.y + 5);
    out.nauru = hit && hit.key;

    // Styles, on the lighter 110m world
    await globe.setLayers([T.layer('world', coarse, { bordersVisible: false })]);
    const paris = [2.35, 48.86], madrid = [-3.7, 40.4], sea = [-25, 45];
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    out.land = await T.pixelAt(globe, paris);
    globe.setStyle('world', 'France', 'good');
    let img = await T.capture(globe);
    out.good = T.pixel(img, globe.project(paris).x, globe.project(paris).y);
    out.neighbour = T.pixel(img, globe.project(madrid).x, globe.project(madrid).y);
    globe.defineStyles({ good: '#123456' });
    out.redefined = await T.pixelAt(globe, paris);
    globe.defineStyles({ good: T.STYLES.good });
    globe.setStyle('world', 'France', 'hidden');
    img = await T.capture(globe);
    out.hidden = T.pixel(img, globe.project(paris).x, globe.project(paris).y);
    out.ocean = T.pixel(img, globe.project(sea).x, globe.project(sea).y);
    globe.setStyle('world', 'France', 'good');
    globe.flash('world', 'France', 'mark', 300);
    out.flashStart = await T.pixelAt(globe, paris);
    await T.wait(500);
    out.flashEnd = await T.pixelAt(globe, paris);

    // Borders
    globe.resetStyles('world');
    globe.updateLayer('world', { bordersVisible: true, borderColor: '#ff0000', borderWidth: 2 });
    img = await T.capture(globe);
    let red = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 220 && img.data[i + 1] < 60 && img.data[i + 2] < 60) red++;
    out.borderPixels = red;

    // While the view moves the frames are cheap; one full-quality frame follows when it settles
    globe.updateLayer('world', { bordersVisible: false });
    await T.wait(400);
    let frames = globe.stats().frames;
    globe.setView({ lon: 5, lat: 48, k: 3 });
    await T.frames(2);
    out.movingFrames = globe.stats().frames - frames;
    await T.wait(400);
    out.settledFrames = globe.stats().frames - frames;
    await T.wait(300);
    out.idleFrames = globe.stats().frames - frames;
    return out;
  });
  const LAND = [245, 235, 212, 255], GOOD = [95, 138, 75, 255], MARK = [255, 0, 0, 255];
  const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= (t || 3));
  check('canvas2d: forceCanvas2D selects the fallback renderer', r.renderer === 'canvas2d' && r.canvases === 'globe-gl > globe-overlay', r.renderer);
  check('canvas2d: picking (Paris, Nairobi, mid-Pacific, Nauru by tolerance)', r.paris === 'France' && r.nairobi === 'Kenya' && r.pacific === null && r.nauru === 'Nauru', [r.paris, r.nairobi, r.pacific, r.nauru].join(', '));
  check('canvas2d: default and per-feature styles', near(r.land, LAND) && near(r.good, GOOD) && near(r.neighbour, LAND), r.land.join(',') + ' / ' + r.good.join(','));
  check('canvas2d: redefined, transparent and flashed styles', near(r.redefined, [0x12, 0x34, 0x56, 255]) && near(r.hidden, r.ocean, 6) && near(r.flashStart, MARK) && near(r.flashEnd, GOOD),
    'flash ' + r.flashStart.join(',') + ' → ' + r.flashEnd.join(','));
  check('canvas2d: borders are stroked', r.borderPixels > 300, r.borderPixels + ' border pixels');
  check('canvas2d: one extra full-quality frame when the view settles, then idle', r.movingFrames === 1 && r.settledFrames === 2 && r.idleFrames === 2,
    'frames after a view change: ' + r.movingFrames + ', after settling: ' + r.settledFrames + ', later: ' + r.idleFrames);

  for (const [label, view] of [['whole globe', { lon: 100, lat: 30, k: 1.2 }], ['over the south pole', { lon: 0, lat: -85, k: 1.5 }], ['across the antimeridian at ×6', { lon: 178, lat: 62, k: 6 }]]) {
    const iou = await page.evaluate(async view => {
      const coarse = await T.load('world110');
      if (T.shown !== 'c2d') {
        const globe = T.create({ forceCanvas2D: true, theme: T.FLAT });
        globe.setGraticule(false);
        await globe.setLayers([T.layer('world', coarse, { style: 'mark', bordersVisible: false })]);
        T.shown = 'c2d';
      }
      globe.setView(view);
      await T.wait(350);          // let it settle: the settled frame is the exact one
      const img = await T.capture(globe);
      return T.iou(T.maskOf(img), T.referenceMask(coarse.features, view, img.width, img.height, globe.radiusPx()));
    }, view);
    check('canvas2d: matches the d3 reference, ' + label, iou >= 0.985, 'IoU ' + fmt(iou, 4));
  }

  // The detailed sets, framed as the game frames them; the quick frame drawn while the view is
  // moving may leave out only what is too small to see
  for (const set of ['us', 'russia']) {
    const r = await page.evaluate(async set => {
      const data = await T.load(set);
      const globe = T.create({ forceCanvas2D: true, theme: T.FLAT });
      globe.setGraticule(false);
      await globe.setLayers([T.layer('active', data, { style: 'mark', bordersVisible: false })]);
      await T.wait(350);
      globe.fitTo(data.features, { padding: 30 });
      const view = globe.getView();
      const moving = T.maskOf(await T.capture(globe));
      await T.wait(350);
      const settled = T.maskOf(await T.capture(globe));
      const reference = T.referenceMask(data.features, view, 800, 600, globe.radiusPx());
      return { moving: T.iou(moving, reference), settled: T.iou(settled, reference), k: view.k };
    }, set);
    check('canvas2d: ' + set + ' matches the d3 reference, both while moving and settled', r.settled >= 0.985 && r.moving >= 0.975,
      'IoU ' + fmt(r.moving, 4) + ' moving, ' + fmt(r.settled, 4) + ' settled, at k ' + fmt(r.k));
  }
  // d3 reads ring winding; the engine must not (RFC 7946 files are wound the other way)
  const rewound = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const reversed = coarse.features.map(f => ({
      type: 'Feature', properties: f.properties,
      geometry: { type: 'MultiPolygon', coordinates: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(rings => rings.map(ring => ring.slice().reverse())) }
    }));
    const globe = T.create({ forceCanvas2D: true, theme: T.FLAT });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'active', features: reversed, key: T.name, style: 'mark', bordersVisible: false }]);
    const view = { lon: 20, lat: 10, k: 1.2 };
    globe.setView(view);
    await T.wait(350);
    const img = await T.capture(globe);
    return T.iou(T.maskOf(img), T.referenceMask(coarse.features, view, img.width, img.height, globe.radiusPx()));
  });
  check('canvas2d: polygons wound the other way are drawn the same', rewound >= 0.985, 'IoU ' + fmt(rewound, 4) + ' against the d3 picture of the original features');

  // Input goes through the same handlers
  await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const globe = T.create({ forceCanvas2D: true });
    await globe.setLayers([T.layer('world', coarse, { bordersVisible: false })]);
    T.clicks = []; globe.on('click', e => T.clicks.push(e.hit && e.hit.key)); globe.setView({ lon: 10, lat: 30, k: 1.2 });
  });
  const paris = await page.evaluate(() => globe.project([2.35, 48.86]));
  await page.mouse.click(paris.x, paris.y);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(400 + i * 10, 300);
  await page.waitForTimeout(150);
  await page.mouse.up();
  const input = await page.evaluate(() => ({ clicks: T.clicks, view: globe.getView() }));
  check('canvas2d: click and drag work', input.clicks.length === 1 && input.clicks[0] === 'France' && input.view.lon < 5, JSON.stringify(input.clicks) + ', lon ' + fmt(input.view.lon));
});

group('robustness', async ({ page }) => {
  // WebGL context loss and restoration
  const lost = await page.evaluate(async () => {
    const out = {};
    const coarse = await T.load('world110');
    const globe = T.create();
    await globe.setLayers([T.layer('world', coarse, { bordersVisible: false })]);
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    globe.setStyle('world', 'France', 'good');
    await T.frames(2);
    const canvas = document.querySelector('.globe-gl');
    const ext = canvas.getContext('webgl').getExtension('WEBGL_lose_context');
    ext.loseContext();
    await T.wait(100);
    // The API keeps working while the context is gone
    globe.setView({ lon: 5, lat: 48, k: 3 });
    globe.setStyle('world', 'Spain', 'bad');
    await T.frames(2);
    ext.restoreContext();
    await T.wait(300);
    const img = await T.capture(globe);
    const px = lonlat => { const p = globe.project(lonlat); return T.pixel(img, p.x, p.y); };
    out.france = px([2.35, 48.86]); out.spain = px([-3.7, 40.4]); out.germany = px([10.5, 51]); out.sea = px([-12, 46]);
    return out;
  });
  const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= (t || 3));
  check('context loss: geometry and styles come back after the context is restored',
    near(lost.france, [95, 138, 75, 255]) && near(lost.spain, [160, 49, 30, 255]) && near(lost.germany, [245, 235, 212, 255]) && lost.sea[2] > lost.sea[0],
    'France ' + lost.france.join(',') + ', Spain ' + lost.spain.join(',') + ', sea ' + lost.sea.join(','));

  // Without 32-bit index buffers the same picture is drawn from unindexed triangles
  const plain = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const original = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function (name) { return name === 'OES_element_index_uint' ? null : original.call(this, name); };
    const globe = T.create({ theme: T.FLAT });
    WebGLRenderingContext.prototype.getExtension = original;
    globe.setGraticule(false);
    await globe.setLayers([T.layer('world', coarse, { style: 'mark', bordersVisible: false })]);
    const view = { lon: 100, lat: 30, k: 1.2 };
    globe.setView(view);
    let img = await T.capture(globe);
    const iou = T.iou(T.maskOf(img), T.referenceMask(coarse.features, view, img.width, img.height, globe.radiusPx()));
    globe.updateLayer('world', { bordersVisible: true, borderColor: '#00ff00', borderWidth: 2 });
    img = await T.capture(globe);
    let green = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 1] > 200 && img.data[i] < 80) green++;
    return { iou, green };
  });
  check('no OES_element_index_uint: fills and borders still draw correctly', plain.iou >= 0.985 && plain.green > 1000, 'IoU ' + fmt(plain.iou, 4) + ', ' + plain.green + ' border pixels');

  // No WebGL at all: the engine falls back by itself
  const none = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) { return /webgl/.test(type) ? null : original.apply(this, arguments); };
    const globe = T.create();
    HTMLCanvasElement.prototype.getContext = original;
    await globe.setLayers([T.layer('world', coarse)]);
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    return { renderer: globe.stats().renderer, land: await T.pixelAt(globe, [2.35, 48.86]) };
  });
  check('no WebGL: falls back to Canvas 2D on its own', none.renderer === 'canvas2d' && near(none.land, [245, 235, 212, 255]), none.renderer + ', ' + none.land.join(','));

  // A WebGL context whose shaders will not compile is as good as none
  const broken = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const warnings = [];
    const warn = console.warn;
    console.warn = message => warnings.push(String(message));
    const original = WebGLRenderingContext.prototype.getShaderParameter;
    WebGLRenderingContext.prototype.getShaderParameter = function () { return false; };
    const globe = T.create();
    WebGLRenderingContext.prototype.getShaderParameter = original;
    console.warn = warn;
    await globe.setLayers([T.layer('world', coarse)]);
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    return { renderer: globe.stats().renderer, land: await T.pixelAt(globe, [2.35, 48.86]), warnings, canvases: [...document.querySelectorAll('#host canvas')].map(c => c.className).join(' > ') };
  });
  check('shaders fail to compile: falls back to Canvas 2D with one warning', broken.renderer === 'canvas2d' && near(broken.land, [245, 235, 212, 255]) && broken.warnings.length === 1 && broken.canvases === 'globe-gl > globe-overlay',
    broken.renderer + ', ' + broken.land.join(',') + ', "' + broken.warnings.join(' | ') + '"');

  // The context is lost while layers are still being built
  const during = await page.evaluate(async () => {
    const world = await T.load('world');
    const globe = T.create();
    const building = globe.setLayers([T.layer('world', world, { bordersVisible: false })]);
    const ext = document.querySelector('.globe-gl').getContext('webgl').getExtension('WEBGL_lose_context');
    ext.loseContext();
    await building;
    globe.setStyle('world', 'France', 'good');
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    await T.wait(100);
    ext.restoreContext();
    await T.wait(300);
    const img = await T.capture(globe);
    const px = lonlat => { const p = globe.project(lonlat); return T.pixel(img, p.x, p.y); };
    return { france: px([2.35, 48.86]), germany: px([10.5, 51]), renderer: globe.stats().renderer };
  });
  check('context loss: layers built while the context was gone are drawn once it is back',
    near(during.france, [95, 138, 75, 255]) && near(during.germany, [245, 235, 212, 255]) && during.renderer === 'webgl', 'France ' + during.france.join(',') + ', Germany ' + during.germany.join(','));

  // The context is lost and never comes back: after a few seconds the engine carries on in Canvas 2D
  await page.evaluate(async () => {
    const coarse = await T.load('world110'), india = await T.load('india');
    const globe = T.create();
    T.kinds = []; T.clicks = [];
    globe.on('renderer', kind => T.kinds.push(kind));
    globe.on('click', e => T.clicks.push(e.hit && e.hit.key));
    await globe.setLayers([T.layer('world', coarse, { borderColor: '#0000ff', borderWidth: 2 })]);
    globe.setView({ lon: 40, lat: 35, k: 2 });
    globe.setStyle('world', 'France', 'good');
    await T.frames(2);
    document.querySelector('.globe-gl').getContext('webgl').getExtension('WEBGL_lose_context').loseContext();
    await T.wait(100);
    // Work done in the meantime is not lost either
    globe.setStyle('world', 'Spain', 'bad');
    await globe.setLayers([T.layer('world', coarse, { borderColor: '#0000ff', borderWidth: 2 }), T.layer('india', india, { style: 'mark', bordersVisible: false })]);
    globe.setStyle('world', 'France', 'good');
    globe.setStyle('world', 'Spain', 'bad');
  });
  await page.waitForTimeout(4600);
  const paris = await page.evaluate(() => globe.project([2.35, 48.86]));
  await page.mouse.click(paris.x, paris.y);
  const gone = await page.evaluate(async () => {
    await T.wait(350);
    const img = await T.capture(globe);
    const px = lonlat => { const p = globe.project(lonlat); return T.pixel(img, p.x, p.y); };
    let blue = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 2] > 200 && img.data[i] < 60 && img.data[i + 1] < 60) blue++;
    return {
      renderer: globe.stats().renderer, kinds: T.kinds, clicks: T.clicks, blue, imagery: globe.supportsImagery(),
      canvases: [...document.querySelectorAll('#host canvas')].map(c => c.className + ' ' + c.width + '×' + c.height).join(' > '),
      france: px([2.35, 48.86]), spain: px([-3.7, 40.4]), germany: px([10.5, 51]), india: px([78.5, 22.5]), sea: px([65, 15])
    };
  });
  check('context loss: a context that stays lost is replaced by the Canvas 2D renderer, keeping layers, styles and input',
    gone.renderer === 'canvas2d' && gone.kinds.join() === 'canvas2d' && gone.canvases === 'globe-gl 800×600 > globe-overlay 800×600' && gone.clicks.join() === 'France' && gone.imagery === false &&
    near(gone.france, [95, 138, 75, 255]) && near(gone.spain, [160, 49, 30, 255]) && near(gone.germany, [245, 235, 212, 255]) && near(gone.india, [255, 0, 0, 255]) && gone.sea[2] > gone.sea[0] && gone.blue > 300,
    gone.renderer + ' after 4.6 s; France ' + gone.france.join(',') + ', Spain ' + gone.spain.join(',') + ', India ' + gone.india.join(',') + ', ' + gone.blue + ' border pixels, clicked ' + gone.clicks.join());

  // Awkward input
  const odd = await page.evaluate(async () => {
    const out = { warnings: [] };
    const warn = console.warn;
    console.warn = message => out.warnings.push(String(message));
    const coarse = await T.load('world110');
    const france = coarse.features.find(f => T.name(f) === 'France');
    // The same polygons wound the other way (RFC 7946 order, which d3 reads as "everything but")
    const rewound = { type: 'Feature', properties: { name: 'Rewound France' }, geometry: { type: 'MultiPolygon', coordinates: france.geometry.coordinates.map(poly => poly.map(ring => ring.slice().reverse())) } };
    const features = [
      rewound,
      { type: 'Feature', properties: { name: 'nothing' }, geometry: null },
      { type: 'Feature', properties: { name: 'a point' }, geometry: { type: 'Point', coordinates: [10, 10] } },
      { type: 'Feature', properties: { name: 'degenerate' }, geometry: { type: 'Polygon', coordinates: [[[5, 5], [5, 5], [5, 5]]] } },
      { type: 'Feature', properties: { name: 'half the world' }, geometry: { type: 'Polygon', coordinates: [[[-170, 0], [-90, 60], [0, 80], [90, 60], [170, 0], [90, -60], [0, -80], [-90, -60], [-170, 0]]] } }
    ];
    const globe = T.create({ theme: T.FLAT });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'odd', features, key: T.name, interactive: true, style: 'mark', bordersVisible: false }]);
    globe.setView({ lon: 2.35, lat: 46.5, k: 4 });
    const p = globe.project([2.35, 48.86]);
    out.hit = (globe.featureAt(p.x, p.y) || {}).key;
    out.pixel = await T.pixelAt(globe, [2.35, 48.86]);
    const a = globe.featureInfo('odd', 'Rewound France'), b = d3.geoCentroid(france);
    out.centroidOff = d3.geoDistance(a.centroid, b) * 180 / Math.PI;
    out.areaRatio = a.areaSr / d3.geoArea(france);
    // Bounds and overlay outlines go through d3, which must be handed the rings its own way round
    const want = d3.geoBounds(france), got = a.bounds;
    out.boundsOff = Math.max(Math.abs(got[0][0] - want[0][0]), Math.abs(got[0][1] - want[0][1]), Math.abs(got[1][0] - want[1][0]), Math.abs(got[1][1] - want[1][1]));
    const off = globe.addOverlay(ctx => globe.draw.outline(ctx, rewound, { fill: '#ff0000' }));
    await T.frames(2);
    const overlay = document.querySelector('#host canvas.globe-overlay');
    const ink = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height);
    out.outlineIou = T.iou(T.maskOf(ink), T.referenceMask([france], globe.getView(), ink.width, ink.height, globe.radiusPx()));
    off();
    out.pointInfo = globe.featureInfo('odd', 'a point').centroid;
    out.emptyInfo = globe.featureInfo('odd', 'nothing').centroid;
    out.missing = [globe.featureInfo('odd', 'no such key'), globe.featureInfo('no such layer', 'x')];
    // Calls that name unknown layers or keys do nothing
    globe.setStyle('nope', 'x', 'good'); globe.setStyle('odd', 'nope', 'good'); globe.flash('odd', 'nope', 'good');
    globe.resetStyles('nope'); globe.setHoverStyle('nope', 'good'); await globe.updateLayer('nope', { visible: false });
    // An empty layer list and an empty layer are fine
    await globe.setLayers([{ id: 'empty', features: [] }]);
    await globe.setLayers([]);
    out.emptyOk = globe.featureAt(400, 300) === null && globe.stats().triangles === 0;
    console.warn = warn;
    return out;
  });
  check('input: polygons wound the other way are filled, picked and measured the same', odd.hit === 'Rewound France' && odd.pixel[0] > 250 && odd.centroidOff < 1e-6 && Math.abs(odd.areaRatio - 1) < 1e-9,
    'hit ' + odd.hit + ', centroid off by ' + odd.centroidOff.toExponential(1) + '°, area ratio ' + odd.areaRatio.toFixed(12));
  check('input: ...and so are their bounds and their overlay outline', odd.boundsOff < 1e-9 && odd.outlineIou >= 0.97,
    'bounds off by ' + odd.boundsOff.toExponential(1) + '°, outline IoU ' + fmt(odd.outlineIou, 4) + ' against d3 drawing the original');
  check('input: null, point and degenerate geometries are tolerated', Math.abs(odd.pointInfo[0] - 10) < 1e-9 && Array.isArray(odd.emptyInfo) && odd.missing[0] === null && odd.missing[1] === null && odd.emptyOk);
  check('input: a polygon wider than a hemisphere is skipped with one warning', odd.warnings.length === 1 && /hemisphere/.test(odd.warnings[0]), odd.warnings.join(' | '));

  // Layer swaps
  const swaps = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world'), coarse = await T.load('world110');
    const globe = T.create();
    let ready = 0;
    globe.on('ready', () => ready++);
    // Styles set straight after setLayers (before the build finishes) apply to the new layers
    const first = globe.setLayers([T.layer('world', world, { bordersVisible: false })]);
    globe.setStyle('world', 'France', 'good');
    out.pendingInfo = !!globe.featureInfo('world', 'France');
    // A second setLayers before the first has finished wins; both promises resolve
    const second = globe.setLayers([T.layer('world', coarse, { bordersVisible: false })]);
    globe.setStyle('world', 'Spain', 'bad');
    await Promise.all([first, second]);
    out.triangles = globe.stats().triangles;
    globe.setView({ lon: 0, lat: 45, k: 3 });
    const img = await T.capture(globe);
    const px = lonlat => { const p = globe.project(lonlat); return T.pixel(img, p.x, p.y); };
    out.france = px([2.35, 48.86]); out.spain = px([-3.7, 40.4]);
    out.ready = ready;
    // New borders for an existing layer
    await globe.updateLayer('world', { borders: { type: 'MultiLineString', coordinates: [[[0, 40], [0, 50]]] }, bordersVisible: true });
    out.segments = globe.stats().segments;
    await globe.setLayers([T.layer('world', coarse)]);
    out.readyOnce = ready;
    return out;
  });
  check('layers: styles set before the build finishes are kept; the last setLayers wins', swaps.pendingInfo && swaps.triangles < 100000 && near(swaps.france, [245, 235, 212, 255]) && near(swaps.spain, [160, 49, 30, 255]),
    Math.round(swaps.triangles) + ' triangles, France ' + swaps.france.join(',') + ' (style was set on the superseded layer), Spain ' + swaps.spain.join(','));
  check("layers: updateLayer replaces borders; 'ready' fires once", swaps.segments === 8 && swaps.ready === 1 && swaps.readyOnce === 1, swaps.segments + ' segments, ready ×' + swaps.readyOnce);
});

group('datasets', async ({ page }) => {
  for (const name of ['world', 'world110', 'land110', 'us', 'canada', 'china', 'india', 'russia']) {
    const r = await page.evaluate(async name => {
      const out = { warnings: [] };
      const warn = console.warn;
      console.warn = message => out.warnings.push(String(message));
      const data = await T.load(name);
      const globe = T.create({ theme: T.FLAT });
      globe.setGraticule(false);
      await globe.setLayers([T.layer('active', data, { style: 'mark', bordersVisible: false, key: (f, i) => T.name(f) })]);
      out.stats = globe.stats();
      // Centroid and area against d3
      out.centroidOff = 0; out.areaOff = 0;
      data.features.forEach(f => {
        const info = globe.featureInfo('active', T.name(f));
        out.centroidOff = Math.max(out.centroidOff, d3.geoDistance(info.centroid, d3.geoCentroid(f)) * 180 / Math.PI);
        out.areaOff = Math.max(out.areaOff, Math.abs(info.areaSr / d3.geoArea(f) - 1));
      });
      // Picture against d3, at the fitted view and zoomed in on its centre
      globe.fitTo(data.features, { padding: 20 });
      out.ious = [];
      for (const factor of [1, 5]) {
        globe.zoomBy(factor, { animate: false });
        const view = globe.getView();
        const img = await T.capture(globe);
        out.ious.push(T.iou(T.maskOf(img), T.referenceMask(data.features, view, img.width, img.height, globe.radiusPx())));
      }
      console.warn = warn;
      return out;
    }, name);
    check('datasets: ' + name + ' builds and matches d3 (picture, centroids, areas)',
      r.warnings.length === 0 && r.ious.every(v => v >= 0.985) && r.centroidOff < 1e-6 && r.areaOff < 1e-6 && r.stats.triangles > 1000,
      Math.round(r.stats.triangles) + ' triangles, ' + r.stats.segments + ' segments, IoU ' + r.ious.map(v => fmt(v, 4)).join(' / ') +
      ', centroid within ' + r.centroidOff.toExponential(1) + '°, area within ' + r.areaOff.toExponential(1) + (r.warnings.length ? ', warnings: ' + r.warnings.join(' | ') : ''));
  }

  // Borders: no line along the antimeridian cut, none at the pole, shared edges drawn once
  const r = await page.evaluate(async () => {
    const out = {};
    const redAlong = async (globe, points) => {
      const img = await T.capture(globe);
      let red = 0;
      points.forEach(q => { const p = globe.project(q), c = T.pixel(img, p.x, p.y); if (c[0] > 200 && c[1] < 80) red++; });
      return red;
    };
    const meridian = (lat0, lat1) => { const pts = []; for (let i = 0; i <= 30; i++) pts.push([180, lat0 + (lat1 - lat0) * i / 30]); return pts; };
    const lineStyle = { style: 'land', borderColor: '#ff0000', borderWidth: 2 };

    // Chukotka in the Russian provinces is cut in two at 180°
    const russia = await T.load('russia');
    let globe = T.create();
    await globe.setLayers([T.layer('active', russia, lineStyle)]);
    globe.setView({ lon: 180, lat: 67, k: 12 });
    out.chukotkaMesh = await redAlong(globe, meridian(65.6, 68.4));
    await globe.updateLayer('active', { borders: null });
    out.chukotkaRings = await redAlong(globe, meridian(65.6, 68.4));
    const img = await T.capture(globe);
    let red = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 200 && img.data[i + 1] < 80) red++;
    out.chukotkaBorderPixels = red;

    // The 50m world: Russia is stitched across 180°, Antarctica has a ring of points at the pole
    const world = await T.load('world');
    for (const mode of ['mesh', 'rings']) {
      globe = T.create();
      await globe.setLayers([T.layer('active', world, Object.assign({}, lineStyle, mode === 'rings' ? { borders: null } : {}))]);
      globe.setView({ lon: 180, lat: 67, k: 12 });
      out['russia_' + mode] = await redAlong(globe, meridian(65.6, 68.4));
      globe.setView({ lon: 0, lat: -85, k: 4 });
      const pole = [];
      for (let i = 0; i < 12; i++) pole.push([i * 30, -89.9]);
      pole.push([0, -90]);
      out['pole_' + mode] = await redAlong(globe, pole);
      out['poleFill_' + mode] = await T.pixelAt(globe, [0, -90]);
      out['segments_' + mode] = globe.stats().segments;
    }
    // US states are plain GeoJSON: rings are the only source of borders
    const us = await T.load('us');
    let ringEdges = 0;
    us.features.forEach(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(poly => poly.forEach(ring => { ringEdges += ring.length - 1; })));
    globe = T.create();
    await globe.setLayers([T.layer('active', us)]);
    out.us = { ringEdges, segments: globe.stats().segments };
    return out;
  });
  check('borders: no line along the antimeridian cut through Chukotka (mesh or rings)', r.chukotkaMesh === 0 && r.chukotkaRings === 0 && r.chukotkaBorderPixels > 500,
    r.chukotkaMesh + ' / ' + r.chukotkaRings + ' red samples on the meridian; ' + r.chukotkaBorderPixels + ' border pixels elsewhere in view');
  check('borders: none along 180° in the stitched 50m world, none at the south pole', r.russia_mesh === 0 && r.russia_rings === 0 && r.pole_mesh === 0 && r.pole_rings === 0,
    'meridian ' + r.russia_mesh + ' / ' + r.russia_rings + ', pole ' + r.pole_mesh + ' / ' + r.pole_rings);
  check('fills: Antarctica is solid at the pole', r.poleFill_mesh.join() === '245,235,212,255', r.poleFill_mesh.join(','));
  check('borders: rings give each shared edge once (as many segments as the mesh)', Math.abs(r.segments_rings - r.segments_mesh) < r.segments_mesh * 0.02 && r.us.segments < r.us.ringEdges * 0.85,
    '50m world: ' + r.segments_rings + ' from rings vs ' + r.segments_mesh + ' from the mesh; US states: ' + r.us.segments + ' segments from ' + r.us.ringEdges + ' ring edges');
});

group('translucent', async ({ page }) => {
  // Real data, half-transparent red over blue: one blend gives (128, 0, 127). A pixel any
  // redder has been blended twice somewhere.
  const views = [
    ['whole globe', 'world', { lon: 20, lat: 20, k: 1 }],
    ['Europe at ×6', 'world', { lon: 15, lat: 50, k: 6 }],
    ['south pole', 'world', { lon: 0, lat: -85, k: 2 }],
    ['antimeridian', 'world', { lon: 180, lat: 60, k: 3 }],
    ['110m world (Sudan overlaps itself)', 'world110', { lon: 25, lat: 10, k: 2.5 }],
    ['US states', 'us', { lon: -98, lat: 39, k: 4 }],
    ['Russian provinces', 'russia', { lon: 100, lat: 62, k: 3 }]
  ];
  for (const [label, set, view] of views) {
    const r = await page.evaluate(async ({ set, view }) => {
      const data = await T.load(set);
      if (T.shown !== 'half-' + set) {
        const globe = T.create({ theme: T.FLAT });
        globe.setGraticule(false);
        await globe.setLayers([T.layer('active', data, { style: 'half', bordersVisible: false })]);
        T.shown = 'half-' + set;
      }
      globe.setView(view);
      const d = (await T.capture(globe)).data;
      let doubled = 0, land = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 133) doubled++; if (d[i] > 120) land++; }
      return { doubled, land };
    }, { set, view });
    check('translucent fills: nothing is blended twice, ' + label, r.doubled === 0 && r.land > 5000, r.doubled + ' over-blended pixels among ' + r.land + ' land pixels');
  }

  // Seams: shapes with long edges, so their triangles are subdivided many times over, and two
  // that share a border. Every pixel well inside must be exactly one blend.
  const r = await page.evaluate(async () => {
    const circle = d3.geoCircle().center([20, 30]).radius(40).precision(30)();
    const box = (west, east) => ({ type: 'Polygon', coordinates: [[[west, -50], [west, -10], [east, -10], [east, -50], [west, -50]]] });
    const features = [['dodecagon', circle], ['west box', box(60, 100)], ['east box', box(100, 150)]]
      .map(([name, geometry]) => ({ type: 'Feature', properties: { name }, geometry }));
    const globe = T.create({ theme: T.FLAT });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'shapes', features, key: T.name, style: 'half', bordersVisible: false }]);
    const out = { triangles: globe.stats().triangles, views: [] };
    for (const view of [{ lon: 40, lat: 10, k: 1 }, { lon: 100, lat: -30, k: 3 }, { lon: 20, lat: 30, k: 2.2 }, { lon: -40, lat: 40, k: 1 }]) {
      globe.setView(view);
      const img = await T.capture(globe);
      const w = img.width, h = img.height, d = img.data;
      const reference = T.referenceMask(features, view, w, h, globe.radiusPx());
      let interior = 0, wrong = 0;
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const i = y * w + x;
        let inside = 1;
        for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2; dx++) if (!reference[i + dy * w + dx]) { inside = 0; break; }
        if (!inside) continue;
        interior++;
        if (Math.abs(d[i * 4] - 128) > 3 || Math.abs(d[i * 4 + 2] - 127) > 3) wrong++;
      }
      out.views.push({ interior, wrong });
    }
    return out;
  });
  check('translucent fills: no seams or overlaps inside heavily subdivided shapes or along a shared border',
    r.triangles > 2000 && r.views.every(v => v.wrong === 0 && v.interior > 20000),
    Math.round(r.triangles) + ' triangles; wrong pixels per view: ' + r.views.map(v => v.wrong + '/' + v.interior).join(', '));
});

group('lifecycle', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const out = {};
    const coarse = await T.load('world110');
    const host = document.getElementById('host');
    host.style.touchAction = 'pan-y';
    const globe = T.create();
    let ready = 0, clicks = 0;
    globe.on('ready', () => ready++);
    const offClick = globe.on('click', () => clicks++);
    globe.onclick = () => { out.assignedClick = (out.assignedClick || 0) + 1; };
    await globe.setLayers([T.layer('world', coarse)]);
    await T.frames(2);
    out.ready = ready;
    out.touchAction = host.style.touchAction;
    const canvas = document.querySelector('#host .globe-gl');
    const press = (target, x, y) => {
      target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: x, clientY: y, bubbles: true }));
      target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: x, clientY: y, bubbles: true }));
    };
    press(canvas, 400, 300);
    out.clicks = clicks;
    offClick();
    await T.wait(350);
    press(canvas, 400, 300);
    out.clicksAfterOff = clicks;

    // Theme and graticule
    globe.setView({ lon: -30, lat: 30, k: 1 });
    const sea = [-35, 32];
    const withGrid = await T.capture(globe);
    globe.setGraticule(false);
    const noGrid = await T.capture(globe);
    let differing = 0;
    for (let i = 0; i < withGrid.data.length; i += 4) if (Math.abs(withGrid.data[i] - noGrid.data[i]) > 2) differing++;
    out.graticulePixels = differing;
    globe.setTheme({ ocean: '#102030', oceanEdge: '#102030', limb: 'rgba(0,0,0,0)' });
    out.themed = await T.pixelAt(globe, sea);
    out.corner = T.pixel(await T.capture(globe), 5, 5);

    // Imagery turned on and straight off again leaves nothing behind (see the imagery groups
    // for the rest); a source with no URLs to give counts as one that failed
    const statuses = [];
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: status => statuses.push(status) });
    globe.setImagery({ enabled: false });
    await T.wait(300);
    out.imageryOff = globe.stats().imagery;
    globe.setImagery({ enabled: true, tileUrl: () => '', onStatus: status => statuses.push(status) });
    await T.wait(300);
    out.imagery = statuses;
    out.supportsImagery = globe.supportsImagery();
    globe.setImagery({ enabled: false });

    // fitTo before the host has a size takes effect when it gets one
    host.style.display = 'none';
    const hidden = Globe.create(host);
    hidden.defineStyles(T.STYLES);
    await hidden.setLayers([T.layer('world', coarse)]);
    const chile = coarse.features.find(f => T.name(f) === 'Chile');
    hidden.fitTo(chile, { padding: 30 });
    const sizeless = hidden.getView();
    host.style.display = '';
    await T.frames(3);
    const laidOut = hidden.getView();
    const south = hidden.project([-70.5, -53]), north = hidden.project([-69.5, -18]);
    out.lateFit = { sizeless, laidOut, top: north.y, bottom: south.y };
    hidden.destroy();
    await T.frames(1);

    // pause / resume
    await T.wait(300);
    globe.pause();
    let frames = globe.stats().frames;
    globe.setView({ lon: 50, lat: 0, k: 2 });
    globe.invalidate();
    press(canvas, 400, 300);
    await T.wait(300);
    out.pausedFrames = globe.stats().frames - frames;
    out.pausedClicks = out.assignedClick;
    globe.resume();
    await T.frames(2);
    out.resumedFrames = globe.stats().frames - frames;

    // attachTo: the canvases move to another host and take its size
    const other = document.createElement('div');
    other.style.cssText = 'position:absolute;left:820px;top:0;width:160px;height:200px;';
    document.body.appendChild(other);
    globe.attachTo(other);
    await T.frames(2);
    out.attached = {
      moved: other.querySelectorAll('canvas').length === 2 && host.querySelectorAll('canvas').length === 0,
      size: [other.querySelector('.globe-gl').width, other.querySelector('.globe-gl').height],
      radius: globe.radiusPx() / globe.getView().k,
      oldTouchAction: host.style.touchAction, newTouchAction: other.style.touchAction
    };
    const before = out.assignedClick;
    await T.wait(350);
    press(other.querySelector('.globe-gl'), 900, 100);
    out.attached.clickOnNew = out.assignedClick - before;
    globe.attachTo(host);
    await T.frames(2);
    out.backHome = host.querySelectorAll('canvas').length === 2 && globe.radiusPx() / globe.getView().k === 276;
    other.remove();

    // destroy
    frames = globe.stats().frames;
    globe.destroy();
    window.globe = null;
    out.destroyed = { canvases: host.querySelectorAll('canvas').length, touchAction: host.style.touchAction };
    host.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300, bubbles: true }));
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
    await T.wait(200);
    out.destroyed.clicks = out.assignedClick;
    host.style.touchAction = '';
    return out;
  });
  check("events: 'ready' fires once; on() returns an unsubscribe; handlers can also be assigned (globe.onclick)",
    r.ready === 1 && r.clicks === 1 && r.clicksAfterOff === 1 && r.assignedClick >= 2, 'ready ×' + r.ready + ', listener ' + r.clicksAfterOff + ', assigned ' + r.assignedClick);
  check('host: touch-action is none while attached', r.touchAction === 'none');
  check('setGraticule / setTheme: change the picture; outside the halo the canvas is transparent', r.graticulePixels > 500 && r.themed.join() === '16,32,48,255' && r.corner[3] === 0,
    r.graticulePixels + ' graticule pixels, ocean ' + r.themed.join(',') + ', corner alpha ' + r.corner[3]);
  check("setImagery: turned on and off at once it stays 'loading' and is gone; with no tile URLs it reports 'failed'", r.imagery.join() === 'loading,loading,failed' && r.imageryOff === null && r.supportsImagery === true, r.imagery.join() + ', ' + r.supportsImagery);
  check('fitTo: called before the host has a size, applies once it is laid out', r.lateFit.sizeless.k === 1 && r.lateFit.laidOut.k > 2 && r.lateFit.top > 25 && r.lateFit.bottom < 575,
    'k ' + r.lateFit.sizeless.k + ' → ' + fmt(r.lateFit.laidOut.k) + ', Chile spans y ' + fmt(r.lateFit.top, 0) + ' to ' + fmt(r.lateFit.bottom, 0));
  check('pause / resume: no frames and no input while paused', r.pausedFrames === 0 && r.resumedFrames >= 1, r.pausedFrames + ' frames while paused, ' + r.resumedFrames + ' after resume');
  check('attachTo: canvases move to the new host, resize, and take input there', r.attached.moved && r.attached.size.join() === '160,200' && Math.abs(r.attached.radius - 0.46 * 160) < 1e-9 &&
    r.attached.oldTouchAction === 'pan-y' && r.attached.newTouchAction === 'none' && r.attached.clickOnNew === 1 && r.backHome, JSON.stringify(r.attached));
  check('destroy: canvases removed, host restored, input ignored', r.destroyed.canvases === 0 && r.destroyed.touchAction === 'pan-y' && r.destroyed.clicks === r.assignedClick, JSON.stringify(r.destroyed));
});

/* ----- Later additions to the engine (imagery has its own groups below) ----- */

group('options', async ({ page }) => {
  // A1: dblClickZoom off (at creation or later), zoom limits changed after creation
  await inputSetup(page, { lon: 10, lat: 30, k: 1.2 }, { dblClickZoom: false });
  await page.mouse.dblclick(520, 240);
  await page.waitForTimeout(400);
  const off = { view: await getView(page), clicks: (await clicks(page)).length };
  check('setOptions (A1): with dblClickZoom off a double click is two clicks and no zoom', off.view.k === 1.2 && off.clicks === 2, 'k ' + off.view.k + ', ' + off.clicks + ' clicks');
  await page.waitForTimeout(350);
  await page.evaluate(() => globe.setOptions({ dblClickZoom: true }));
  await page.mouse.dblclick(520, 240);
  await page.evaluate(() => T.settled());
  const on = await getView(page);
  check('setOptions (A1): dblClickZoom can be turned back on', Math.abs(on.k - 2.4) < 0.02, 'k ' + fmt(on.k));
  const limits = await page.evaluate(async () => {
    const out = {};
    globe.setView({ k: 1000 });
    out.default = globe.getView().k;
    globe.setOptions({ maxZoom: 600 });
    globe.setView({ k: 1000 });
    out.raised = globe.getView().k;
    globe.setOptions({ maxZoom: 5000 });
    globe.setView({ k: 5000 });
    out.capped = globe.getView().k;
    globe.setOptions({ maxZoom: 40, minZoom: 2 });
    out.clampedDown = globe.getView().k;
    globe.setView({ k: 0.5 });
    out.clampedUp = globe.getView().k;
    globe.setOptions({ minZoom: 0.5 });
    globe.setView({ k: 0.5 });
    out.below = globe.getView().k;
    return out;
  });
  check('setOptions (A1/A2): minZoom and maxZoom apply at once; maxZoom goes up to 600', limits.default === 80 && limits.raised === 600 && limits.capped === 600 && limits.clampedDown === 40 && limits.clampedUp === 2 && limits.below === 0.5,
    JSON.stringify(limits));
});

group('deepzoom', async ({ page }) => {
  // A2: fills, borders, picking and positions at k = 300 and 600 on three small places
  for (const [label, set, name] of [['Macau', 'world', 'Macao'], ['Luxembourg', 'world', 'Luxembourg'], ['Rhode Island', 'us', 'Rhode Island']]) {
    for (const k of [300, 600]) {
      const r = await page.evaluate(async ({ set, name, k }) => {
        const data = await T.load(set);
        const feature = data.features.find(f => T.name(f) === name);
        if (T.shown !== 'deep-' + name) {
          const globe = T.create({ theme: Object.assign({}, T.FLAT, { ocean: '#000000', oceanEdge: '#000000' }), maxZoom: 600 });
          globe.setGraticule(false);
          await globe.setLayers([{ id: 'one', features: [feature], key: T.name, interactive: true, style: 'mark', borderColor: '#ff0000', borderWidth: 4, bordersVisible: false }]);
          T.shown = 'deep-' + name;
        }
        const out = {};
        // Centre the view on a point of the outline, so the boundary runs through the picture
        const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        const ring = polys.reduce((a, b) => b[0].length > a[0].length ? b : a)[0];
        const vertex = ring[Math.floor(ring.length / 3)];
        const view = { lon: vertex[0], lat: vertex[1], k };
        globe.setStyle('one', name, 'mark');
        globe.updateLayer('one', { bordersVisible: false });
        globe.setView(view);
        const p = globe.project(vertex);
        out.vertexAt = [p.x, p.y];
        out.radius = globe.radiusPx();
        const fill = T.maskOf(await T.capture(globe));
        const R = globe.radiusPx();
        const projection = d3.geoOrthographic().rotate([-view.lon, -view.lat]).scale(R).translate([400, 300]).clipAngle(90).precision(0.1);
        const reference = (stroke) => {
          const c = document.createElement('canvas');
          c.width = 800; c.height = 600;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.beginPath(); d3.geoPath(projection, ctx)(feature);
          if (stroke) { ctx.strokeStyle = '#f00'; ctx.lineWidth = 4; ctx.stroke(); } else { ctx.fillStyle = '#f00'; ctx.fill(); }
          const d = ctx.getImageData(0, 0, 800, 600).data, mask = new Uint8Array(800 * 600);
          for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;
          return mask;
        };
        const fillReference = reference(false);
        out.fillIou = T.iou(fill, fillReference);
        out.landPx = fillReference.reduce((a, b) => a + b, 0);
        out.land = out.landPx / fillReference.length;
        // Borders alone
        globe.setStyle('one', name, 'hidden');
        globe.updateLayer('one', { bordersVisible: true });
        out.borderIou = T.iou(T.maskOf(await T.capture(globe)), reference(true));
        // Picking against d3.geoContains all over the picture
        const rnd = T.random(k);
        out.pickWrong = 0;
        for (let i = 0; i < 300; i++) {
          const x = rnd() * 800, y = rnd() * 600;
          const hit = globe.featureAt(x, y, { tolerance: 0 });
          if (!!hit !== d3.geoContains(feature, globe.invert(x, y))) out.pickWrong++;
        }
        // Positions: a round trip through invert and project
        out.roundTrip = 0;
        for (let i = 0; i < 100; i++) {
          const x = rnd() * 800, y = rnd() * 600, q = globe.project(globe.invert(x, y));
          out.roundTrip = Math.max(out.roundTrip, Math.hypot(q.x - x, q.y - y));
        }
        // Steadiness: nudge the view by a whole number of pixels; the picture must move by exactly that
        globe.setStyle('one', name, 'mark');
        globe.updateLayer('one', { bordersVisible: false });
        const centre = globe.invert(400 - 16, 300 - 9);
        globe.setView({ lon: centre[0], lat: centre[1], k });
        const moved = T.maskOf(await T.capture(globe));
        let both = 0, either = 0;
        for (let y = 9; y < 600; y++) for (let x = 16; x < 800; x++) {
          const a = fill[(y - 9) * 800 + x - 16], b = moved[y * 800 + x];
          if (a === 2 || b === 2) continue;
          both += a & b; either += a | b;
        }
        out.shiftIou = either ? both / either : 1;
        return out;
      }, { set, name, k });
      check('deep zoom (A2): ' + label + ' at k = ' + k + ', fill, borders, picking and positions',
        // (the feature must be in the picture without filling it: Macau is only 3,800 px at k = 300)
        r.fillIou >= 0.985 && r.borderIou >= 0.9 && r.pickWrong === 0 && r.roundTrip < 1e-6 && r.shiftIou >= 0.99 && r.landPx > 3000 && r.land < 0.95 &&
        Math.abs(r.vertexAt[0] - 400) < 1e-6 && Math.abs(r.vertexAt[1] - 300) < 1e-6,
        'fill IoU ' + fmt(r.fillIou, 4) + ', border IoU ' + fmt(r.borderIou, 3) + ', ' + r.pickWrong + '/300 picks differ from d3, round trip ' + r.roundTrip.toExponential(1) +
        ' px, 16×9 px nudge IoU ' + fmt(r.shiftIou, 4) + ' (radius ' + Math.round(r.radius) + ' px, feature covers ' + r.landPx + ' px)');
    }
  }
  // The point nearest the viewer is where view-space z reaches 1. Rounding must not push a vertex
  // there outside clip space, which would cut a notch out of the picture at its centre: put
  // every vertex of a small shape there in turn.
  const notch = await page.evaluate(async () => {
    const world = await T.load('world');
    const macau = world.features.find(f => T.name(f) === 'Macao');
    const globe = T.create({ theme: Object.assign({}, T.FLAT, { ocean: '#000000', oceanEdge: '#000000' }), maxZoom: 600 });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'one', features: [macau], key: T.name, style: 'mark', borderColor: '#ff0000', borderWidth: 4, bordersVisible: false }]);
    const out = { views: 0, fill: 1, border: 1 };
    const ring = macau.geometry.coordinates[0];
    for (const k of [150, 300, 600]) {
      for (let i = 0; i < ring.length - 1; i++) {
        const view = { lon: ring[i][0], lat: ring[i][1], k };
        globe.setView(view);
        const projection = d3.geoOrthographic().rotate([-view.lon, -view.lat]).scale(globe.radiusPx()).translate([400, 300]).clipAngle(90).precision(0.1);
        const reference = stroke => {
          const c = document.createElement('canvas');
          c.width = 800; c.height = 600;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.beginPath(); d3.geoPath(projection, ctx)(macau);
          if (stroke) { ctx.strokeStyle = '#f00'; ctx.lineWidth = 4; ctx.stroke(); } else { ctx.fillStyle = '#f00'; ctx.fill(); }
          const d = ctx.getImageData(0, 0, 800, 600).data, mask = new Uint8Array(800 * 600);
          for (let j = 0; j < mask.length; j++) mask[j] = d[j * 4 + 3] > 127 ? 1 : 0;
          return mask;
        };
        globe.setStyle('one', 'Macao', 'mark');
        globe.updateLayer('one', { bordersVisible: false });
        out.fill = Math.min(out.fill, T.iou(T.maskOf(await T.capture(globe)), reference(false)));
        globe.setStyle('one', 'Macao', 'hidden');
        globe.updateLayer('one', { bordersVisible: true });
        out.border = Math.min(out.border, T.iou(T.maskOf(await T.capture(globe)), reference(true)));
        out.views++;
      }
    }
    return out;
  });
  check('deep zoom (A2): nothing is cut out of the picture where a vertex sits at the centre of the view', notch.fill >= 0.985 && notch.border >= 0.9,
    notch.views + ' views, each centred on a vertex of Macau, at k = 150, 300, 600: lowest fill IoU ' + fmt(notch.fill, 4) + ', lowest border IoU ' + fmt(notch.border, 3));

  // Dragging at k = 600 still follows the pointer
  const before = await page.evaluate(() => globe.invert(400, 300));
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 0; i <= 10; i++) await page.mouse.move(406 + i * 10, 300 + i * 4);
  await page.waitForTimeout(150);
  await page.mouse.up();
  const after = await page.evaluate(q => globe.project(q), before);
  check('deep zoom (A2): a drag at k = 600 moves the ground with the pointer', Math.hypot(after.x - 500, after.y - 340) < 1.5, 'the point from the centre is now at ' + fmt(after.x, 1) + ', ' + fmt(after.y, 1) + ' (pointer travelled to 500, 340 after the 6 px slop)');
});

group('picking-rules', async ({ page }) => {
  // A3
  const r = await page.evaluate(async () => {
    const out = {};
    const india = await T.load('india'), world = await T.load('world');
    let globe = T.create();
    await globe.setLayers([T.layer('context', world, { interactive: false, style: 'land' }), T.layer('india', india)]);
    globe.fitTo(india.features, { padding: 30 });
    const R = globe.radiusPx();
    // (a) an exact hit is returned whether or not it is eligible, and says so
    const delhi = globe.project([78.9, 23.5]);
    const none = () => false;
    const exact = globe.featureAt(delhi.x, delhi.y, { eligible: none });
    out.exact = exact && { key: exact.key, exact: exact.exact, layer: exact.layerId };
    // (b) Lakshadweep: scattered islands, a wide cap but only a few pixels of land
    const info = globe.featureInfo('india', 'Lakshadweep');
    out.lakshadweep = { capPx: 2 * R * Math.sin(info.radiusDeg * Math.PI / 180), areaPx2: info.areaSr * R * R };
    // (c) distance is to the nearest vertex on screen
    const vertices = [];
    const walk = a => { if (typeof a[0] === 'number') vertices.push(globe.project(a)); else a.forEach(walk); };
    walk(info.feature.geometry.coordinates);
    const nearest = (x, y) => Math.min.apply(null, vertices.map(v => Math.hypot(v.x - x, v.y - y)));
    // walk west from the westernmost vertex, out to sea
    const west = vertices.reduce((a, b) => b.x < a.x ? b : a);
    out.taps = [8, 16, 21, 24, 40].map(dx => {
      const hit = globe.featureAt(west.x - dx, west.y);
      return { dx, distance: nearest(west.x - dx, west.y), key: hit && hit.key, exact: hit && hit.exact };
    });
    out.customTolerance = [globe.featureAt(west.x - 16, west.y, { tolerance: 11 }), globe.featureAt(west.x - 9, west.y, { tolerance: 11 })].map(h => h && h.key);
    out.notEligible = globe.featureAt(west.x - 8, west.y, { eligible: (layer, key) => key !== 'Lakshadweep' });
    // A big neighbour is never picked by the fallback: the sea just off Kerala's coast
    const kerala = globe.featureInfo('india', 'Kerala');
    out.kerala = { capPx: 2 * R * Math.sin(kerala.radiusDeg * Math.PI / 180), areaPx2: kerala.areaSr * R * R };
    const offCoast = globe.project([75.9, 10.8]);
    const sea = globe.featureAt(offCoast.x - 6, offCoast.y);
    out.offKerala = sea && sea.key;
    // The context layer is not interactive: a tap on it next to a tiny eligible feature still reaches the feature
    const chandigarh = globe.featureInfo('india', 'Chandigarh');
    out.chandigarhPx = 2 * R * Math.sin(chandigarh.radiusDeg * Math.PI / 180);
    // Two tiny neighbours: the nearer one wins
    globe = T.create();
    const dot = (name, lon) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [[[lon, 0], [lon, 0.05], [lon + 0.05, 0.05], [lon + 0.05, 0], [lon, 0]]] } });
    await globe.setLayers([{ id: 'dots', features: [dot('west dot', 0), dot('east dot', 6)], key: T.name, interactive: true, style: 'mark' }]);
    globe.setView({ lon: 3, lat: 0, k: 1 });
    const a = globe.project([0.05, 0.025]), b = globe.project([6, 0.025]);
    out.gap = b.x - a.x;
    out.between = [0.3, 0.45, 0.55, 0.7].map(t => { const hit = globe.featureAt(a.x + (b.x - a.x) * t, a.y); return hit && hit.key; });
    // The far side never counts
    globe.setView({ lon: 183, lat: 0, k: 1 });
    out.farSide = globe.featureAt(400, 300);
    return out;
  });
  check('picking (A3a): an exact hit is returned even when not eligible, flagged exact', r.exact && r.exact.exact === true && r.exact.layer === 'india', JSON.stringify(r.exact));
  check('picking (A3b): a scattered territory with a wide cap counts as small by its area', r.lakshadweep.capPx > 14 && r.lakshadweep.areaPx2 < 200 && r.taps[0].key === 'Lakshadweep' && r.taps[0].exact === false,
    'Lakshadweep: cap ' + fmt(r.lakshadweep.capPx, 0) + ' px across, ' + fmt(r.lakshadweep.areaPx2, 1) + ' px² of land');
  check('picking (A3c): the fallback reaches exactly `tolerance` px from the nearest vertex',
    r.taps.every(t => (t.distance <= 22) === (t.key === 'Lakshadweep')) && r.taps.some(t => t.key === null) && r.customTolerance[0] === null && r.customTolerance[1] === 'Lakshadweep' && r.notEligible === null,
    r.taps.map(t => fmt(t.distance, 1) + ' px → ' + t.key).join('; ') + '; tolerance 11: 16 px → ' + r.customTolerance[0] + ', 9 px → ' + r.customTolerance[1]);
  check('picking (A3b): features that are not small are never picked by the fallback', r.offKerala === null && r.kerala.capPx > 14 && r.kerala.areaPx2 > 200, 'tap 6 px off the coast of Kerala (' + fmt(r.kerala.areaPx2, 0) + ' px²) → ' + r.offKerala);
  check('picking (A3c): of two small features the nearer wins; nothing on the far side', r.between.join() === 'west dot,west dot,east dot,east dot' && r.farSide === null, r.between.join(', ') + ' across a ' + fmt(r.gap, 0) + ' px gap');
});

group('fit-input', async ({ page }) => {
  // A4: any GeoJSON object
  const r = await page.evaluate(async () => {
    const globe = T.create();
    const inside = (points, padding) => points.every(q => { const p = globe.project(q); return p.visible && p.x >= padding - 0.01 && p.x <= 800 - padding + 0.01 && p.y >= padding - 0.01 && p.y <= 600 - padding + 0.01; });
    const tight = points => { const xs = points.map(q => globe.project(q).x), ys = points.map(q => globe.project(q).y); return Math.max((Math.max(...xs) - Math.min(...xs)) / 740, (Math.max(...ys) - Math.min(...ys)) / 540); };
    const out = {};
    // The corners of a box over Europe, as the game frames continents
    const corners = [[-10, 35], [40, 35], [40, 70], [-10, 70]];
    globe.fitTo({ type: 'MultiPoint', coordinates: corners }, { padding: 30 });
    out.multiPoint = { inside: inside(corners, 30), fill: tight(corners), view: globe.getView() };
    const line = [[100, -10], [120, 5], [150, -35]];
    globe.fitTo({ type: 'LineString', coordinates: line }, { padding: 30 });
    out.lineString = { inside: inside(line, 30), fill: tight(line) };
    globe.fitTo({ type: 'Point', coordinates: [30, 30] }, { padding: 30, maxZoom: 12 });
    out.point = globe.getView();
    const box = { type: 'Polygon', coordinates: [[[10, 10], [10, 20], [25, 20], [25, 10], [10, 10]]] };
    globe.fitTo(box, { padding: 30 });
    out.polygon = { inside: inside(box.coordinates[0], 30), fill: tight(box.coordinates[0]) };
    // ...and the same ring wound the other way, which d3 would read as "everything but the box"
    globe.fitTo({ type: 'Polygon', coordinates: [box.coordinates[0].slice().reverse()] }, { padding: 30 });
    out.rewound = { inside: inside(box.coordinates[0], 30), fill: tight(box.coordinates[0]) };
    const collection = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: box },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [60, 40] } },
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[30, -10], [35, -5]]] } }
    ] };
    const all = box.coordinates[0].concat([[60, 40], [30, -10], [35, -5]]);
    globe.fitTo(collection, { padding: 30 });
    out.collection = { inside: inside(all, 30), fill: tight(all) };
    globe.fitTo({ type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [box, { type: 'Point', coordinates: [60, 40] }] } }, { padding: 30 });
    out.geometryCollection = { inside: inside(box.coordinates[0].concat([[60, 40]]), 30) };
    // Objects that are not in any layer never reach a layer's key function (this one would throw)
    const coarse = await T.load('world110');
    await globe.setLayers([{ id: 'strict', features: coarse.features, key: f => f.properties.name, interactive: true, style: 'land' }]);
    try {
      globe.fitTo({ type: 'MultiPoint', coordinates: corners }, { padding: 30 });
      out.strictFit = inside(corners, 30);
      await globe.ensureVisible({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [box.coordinates[0].slice().reverse()] } }, { animate: false });
      globe.addOverlay(ctx => globe.draw.outline(ctx, { type: 'Feature', geometry: box }, { stroke: '#f00' }));
      await T.frames(2);
      out.strict = out.strictFit && Math.abs(globe.getView().lon - 17.5) < 1;
    } catch (e) {
      out.strict = String(e);
    }
    return out;
  });
  const ok = v => v.inside && v.fill > 0.93 && v.fill <= 1.0001;
  check('fitTo (A4): a MultiPoint of box corners', ok(r.multiPoint), 'fills ' + fmt(r.multiPoint.fill * 100, 1) + '%, centred ' + fmt(r.multiPoint.view.lon, 1) + ', ' + fmt(r.multiPoint.view.lat, 1) + ' at k ' + fmt(r.multiPoint.view.k));
  check('fitTo (A4): a LineString, a bare Polygon (either winding), a Point', ok(r.lineString) && ok(r.polygon) && ok(r.rewound) && Math.abs(r.point.lon - 30) < 1e-9 && Math.abs(r.point.lat - 30) < 1e-9 && r.point.k === 12,
    'line ' + fmt(r.lineString.fill * 100, 1) + '%, polygon ' + fmt(r.polygon.fill * 100, 1) + '%, rewound ' + fmt(r.rewound.fill * 100, 1) + '%, point k ' + r.point.k);
  check('fitTo (A4): a FeatureCollection of mixed geometry, a GeometryCollection', ok(r.collection) && r.geometryCollection.inside, 'collection fills ' + fmt(r.collection.fill * 100, 1) + '%');
  check('fitTo / ensureVisible / draw.outline: objects outside every layer are never passed to a layer\'s key function', r.strict === true, String(r.strict));
});

group('rebuilds', async ({ page }) => {
  // A6
  const r = await page.evaluate(async () => {
    const out = { warnings: [] };
    const warn = console.warn;
    console.warn = message => out.warnings.push(String(message));
    const world = await T.load('world110'), india = await T.load('india');
    let cuts = 0;
    const original = window.earcut;
    window.earcut = function () { cuts++; return original.apply(this, arguments); };
    const globe = T.create();
    await globe.setLayers([T.layer('world', world)]);
    out.first = cuts;
    out.worldSegments = globe.stats().segments;
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    globe.setStyle('world', 'France', 'good');
    // The same id and the same features array again, with other settings and another layer
    cuts = 0;
    const started = performance.now();
    await globe.setLayers([T.layer('world', world, { style: 'mark', borderWidth: 2 }), T.layer('india', india)]);
    out.second = cuts;
    out.indiaPolygons = india.features.reduce((n, f) => n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
    out.restyled = await T.pixelAt(globe, [2.35, 48.86]);        // France: its own style was dropped, the new default applies
    // Nothing at all changes: no work
    cuts = 0;
    const frames = globe.stats().frames;
    await globe.setLayers([T.layer('world', world, { style: 'mark', borderWidth: 2 }), T.layer('india', india)]);
    out.third = cuts;
    // updateLayer with settings only, or with the very same features
    await globe.updateLayer('world', { visible: false, style: 'land', borderColor: '#000', borderWidth: 1, bordersVisible: false });
    await globe.updateLayer('world', { visible: true, features: world.features, borders: world.borders });
    out.updates = cuts;
    // New borders for the same features: the lines are built again, the triangles are kept
    const meridian = { type: 'MultiLineString', coordinates: [[[2.35, 40], [2.35, 50]]] };
    const before = globe.stats();
    await globe.updateLayer('world', { borders: meridian, bordersVisible: true });
    out.borderUpdate = { cuts, segments: globe.stats().segments - (before.segments - out.worldSegments), triangles: globe.stats().triangles === before.triangles, land: await T.pixelAt(globe, [5, 46]) };
    await globe.setLayers([T.layer('world', world, { borders: { type: 'MultiLineString', coordinates: meridian.coordinates } }), T.layer('india', india)]);
    out.borderSet = { cuts, segments: globe.stats().segments - (before.segments - out.worldSegments), triangles: globe.stats().triangles === before.triangles, land: await T.pixelAt(globe, [5, 46]) };
    // `interactive` is a setting like any other
    const paris = () => { const p = globe.project([2.35, 48.86]), hit = globe.featureAt(p.x, p.y); return hit ? hit.layerId + '/' + hit.key : null; };
    out.pick = [paris()];
    await globe.updateLayer('world', { interactive: false });
    out.pick.push(paris());
    await globe.updateLayer('world', { interactive: true });
    out.pick.push(paris());
    await globe.setLayers([T.layer('world', world, { borders: meridian, interactive: false }), T.layer('india', india)]);
    out.pick.push(paris());
    await globe.setLayers([T.layer('world', world, { borders: meridian, interactive: true }), T.layer('india', india)]);
    out.pick.push(paris());
    out.flagCuts = cuts;
    // A different features array does rebuild
    await globe.updateLayer('world', { features: world.features.slice() });
    out.rebuilt = cuts;
    window.earcut = original;
    // Duplicate keys are reported once per layer
    await globe.setLayers([{ id: 'dupes', features: world.features, key: f => (T.name(f) < 'C' ? 'early' : T.name(f)), style: 'land' }]);
    console.warn = warn;
    return out;
  });
  check('setLayers (A6): a layer with the same id and features array is not rebuilt', r.first > 100 && r.second === r.indiaPolygons && r.third === 0,
    'triangulations: ' + r.first + ' at first, ' + r.second + ' when India was added (India has ' + r.indiaPolygons + ' polygons), ' + r.third + ' when nothing changed');
  check('setLayers (A6): a reused layer takes the new settings and starts with no per-feature styles', r.restyled.join() === '255,0,0,255', r.restyled.join(','));
  check('updateLayer (A6): settings, or the same features again, never rebuild; new features do', r.updates === 0 && r.rebuilt > 100, r.updates + ' / ' + r.rebuilt + ' triangulations');
  const landShown = px => px[0] > 240 && px[1] > 225 && px[3] === 255;
  check('layers (A6): new borders for the same features array rebuild the lines only (updateLayer and setLayers)',
    r.borderUpdate.cuts === 0 && r.borderUpdate.segments === 8 && r.borderUpdate.triangles && landShown(r.borderUpdate.land) &&
    r.borderSet.cuts === 0 && r.borderSet.segments === 8 && r.borderSet.triangles && landShown(r.borderSet.land),
    r.borderUpdate.cuts + ' and ' + r.borderSet.cuts + ' triangulations; the world layer went from ' + r.worldSegments + ' border segments to ' + r.borderUpdate.segments + '; fills still drawn (' + r.borderUpdate.land.join(',') + ')');
  check('layers (A6): `interactive` can be switched by updateLayer or setLayers without a rebuild',
    r.pick.join() === 'world/France,,world/France,,world/France' && r.flagCuts === 0, JSON.stringify(r.pick) + ', ' + r.flagCuts + ' triangulations');
  check('layers (A6): duplicate keys are reported once, naming the key', r.warnings.length === 1 && /"dupes".*"early"/.test(r.warnings[0]), r.warnings.join(' | '));
});

group('pointer-events', async ({ page }) => {
  // A7 and A8
  await inputSetup(page, { lon: 10, lat: 30, k: 1.2 });
  await page.evaluate(() => {
    T.hovers = []; T.moves = [];
    globe.on('hover', (hit, at) => T.hovers.push({ key: hit && hit.key, exact: hit && hit.exact, x: at && at.x, y: at && at.y }));
    globe.on('move', e => T.moves.push({ x: e.x, y: e.y, lonlat: e.lonlat && e.lonlat.slice() }));
  });
  const paris = await page.evaluate(() => globe.project([2.35, 48.86]));
  // A press held for a second without moving is still a click
  await page.mouse.move(paris.x, paris.y);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const held = await clicks(page);
  check('click (A7): a long press without movement is a click', held.length === 1 && held[0].hit === 'France', JSON.stringify(held.map(c => c.hit)));
  // The secondary and middle buttons neither click nor drag
  await page.waitForTimeout(350);
  const before = await getView(page);
  for (const button of ['right', 'middle']) {
    await page.mouse.move(paris.x, paris.y);
    await page.mouse.down({ button });
    await page.mouse.move(paris.x + 60, paris.y + 20);
    await page.mouse.up({ button });
    await page.mouse.click(paris.x + 80, paris.y, { button });
  }
  const after = await getView(page);
  check('click (A7): only the primary mouse button clicks or drags', (await clicks(page)).length === 1 && after.lon === before.lon && after.lat === before.lat);
  // hover carries the position; move reports every mouse position that is not a drag
  await page.evaluate(() => { T.hovers.length = 0; T.moves.length = 0; });
  const sea = await page.evaluate(() => globe.project([-20, 45]));
  await page.mouse.move(paris.x, paris.y);
  await page.evaluate(() => T.frames(2));
  await page.mouse.move(sea.x, sea.y);
  await page.evaluate(() => T.frames(2));
  await page.mouse.move(5, 5);
  await page.evaluate(() => T.frames(2));
  const idle = await page.evaluate(() => ({ hovers: T.hovers.slice(), moves: T.moves.slice() }));
  await page.mouse.move(paris.x, paris.y);
  await page.evaluate(() => T.frames(2));
  const movesBeforeDrag = await page.evaluate(() => T.moves.length);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(paris.x + i * 10, paris.y);
  await page.waitForTimeout(150);
  const movesDuringDrag = await page.evaluate(() => T.moves.length);
  await page.mouse.up();
  const h = idle.hovers, m = idle.moves;
  check('hover (A8): the handler gets the hit and the pointer position', h.length === 2 && h[0].key === 'France' && h[0].exact === true && Math.abs(h[0].x - paris.x) < 1 && Math.abs(h[0].y - paris.y) < 1 &&
    h[1].key === null && Math.abs(h[1].x - sea.x) < 1, JSON.stringify(h));
  check("move (A8): 'move' reports x, y and lon/lat for mouse movement, null lon/lat off the globe, nothing during a drag",
    m.length === 3 && Math.abs(m[0].x - paris.x) < 1 && Math.abs(m[0].lonlat[0] - 2.35) < 0.5 && Math.abs(m[1].lonlat[0] + 20) < 0.5 && m[2].lonlat === null && movesDuringDrag === movesBeforeDrag,
    m.length + ' events; ' + (movesDuringDrag - movesBeforeDrag) + ' during a drag');
});

group('anchor', async ({ page }) => {
  // A9
  const shapes = await page.evaluate(async () => {
    const out = {};
    // A disc, and a disc with a hole to one side: the answers are known
    const circle = (centre, radius) => d3.geoCircle().center(centre).radius(radius).precision(1)().coordinates[0];
    const disc = { type: 'Feature', properties: { name: 'disc' }, geometry: { type: 'Polygon', coordinates: [circle([30, 40], 10)] } };
    const holed = { type: 'Feature', properties: { name: 'holed' }, geometry: { type: 'Polygon', coordinates: [circle([30, 0], 10), circle([35, 0], 3).reverse()] } };
    // Two parts: the anchor belongs to the larger even though the smaller has more points
    const parts = { type: 'Feature', properties: { name: 'parts' }, geometry: { type: 'MultiPolygon', coordinates: [[d3.geoCircle().center([-60, 5]).radius(2).precision(0.2)().coordinates[0]], [circle([-40, 45], 6)]] } };
    const globe = T.create();
    await globe.setLayers([{ id: 'shapes', features: [disc, holed, parts], key: T.name, style: 'land' }]);
    const deg = (a, b) => d3.geoDistance(a, b) * 180 / Math.PI;
    out.disc = deg(globe.anchor('shapes', 'disc'), [30, 40]);
    out.discRadius = globe.anchorRadiusDeg('shapes', 'disc');
    // The largest circle in the holed disc has radius 6° and sits at 26°E on the equator. How
    // much room the anchor really has is worked out here from the two circles themselves.
    const a = globe.anchor('shapes', 'holed');
    out.holed = { anchor: a, fromExpected: deg(a, [26, 0]), room: Math.min(10 - deg(a, [30, 0]), deg(a, [35, 0]) - 3), reported: globe.anchorRadiusDeg('shapes', 'holed') };
    out.parts = deg(globe.anchor('shapes', 'parts'), [-40, 45]);
    out.cached = globe.anchor('shapes', 'disc') === globe.anchor('shapes', 'disc');
    out.missing = [globe.anchor('shapes', 'nope'), globe.anchorRadiusDeg('shapes', 'nope')];
    return out;
  });
  check('anchor (A9): the centre of a disc; on the larger of two parts; cached; null for an unknown key',
    shapes.disc < 0.2 && shapes.parts < 0.2 && shapes.cached && shapes.missing[0] === null && shapes.missing[1] === null,
    'disc off by ' + fmt(shapes.disc) + '°, two parts off by ' + fmt(shapes.parts) + '°');
  // The search promises a clear radius within 1/400 of the shape's size (20°) of the best: 5.95°.
  // On this shape that pins the position down to within 0.63° of the ideal point.
  check('anchor (A9): beside the hole in a disc with a hole, with all but the last 0.05° of the room there is',
    shapes.holed.room >= 5.94 && shapes.holed.fromExpected < 0.7,
    'at ' + shapes.holed.anchor.map(v => fmt(v, 2)).join(', ') + ': ' + fmt(shapes.holed.room, 3) + '° clear (best possible 6°), ' + fmt(shapes.holed.fromExpected) + '° from 26, 0');
  check('anchorRadiusDeg: the radius of the largest circle round the anchor that stays inside',
    Math.abs(shapes.discRadius - 10) < 0.02 && Math.abs(shapes.holed.reported - shapes.holed.room) < 0.02,
    'disc ' + fmt(shapes.discRadius, 3) + '° (10° by construction), holed disc ' + fmt(shapes.holed.reported, 3) + '° (measured ' + fmt(shapes.holed.room, 3) + '°)');

  const real = await page.evaluate(async () => {
    const out = { outside: [], crowded: [], sets: {} };
    for (const set of ['world', 'us', 'canada', 'china', 'india', 'russia']) {
      const data = await T.load(set);
      const globe = T.create({ forceCanvas2D: set === 'china' });        // the fallback has no triangles to lean on
      await globe.setLayers([T.layer('active', data, { interactive: set !== 'india' })]);
      let total = 0, slowest = 0;
      data.features.forEach(f => {
        const t = performance.now();
        const a = globe.anchor('active', T.name(f));
        total += performance.now() - t;
        slowest = Math.max(slowest, performance.now() - t);
        if (!d3.geoContains(f, a)) out.outside.push(set + ': ' + T.name(f));
        // No point of the outline may lie inside the circle the engine says is clear
        const radius = globe.anchorRadiusDeg('active', T.name(f)) * Math.PI / 180;
        let nearest = Infinity;
        (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(rings => rings.forEach(ring => ring.forEach(q => { nearest = Math.min(nearest, d3.geoDistance(a, q)); })));
        if (!(radius > 0) || nearest < radius - 1e-9) out.crowded.push(set + ': ' + T.name(f));
      });
      out.sets[set] = { features: data.features.length, ms: total, slowest };
      if (set === 'world') {
        const france = data.features.find(f => T.name(f) === 'France');
        const centroid = globe.featureInfo('active', 'France').centroid, anchor = globe.anchor('active', 'France');
        out.france = { centroid, anchor, centroidInside: d3.geoContains(france, centroid), radiusDeg: globe.featureInfo('active', 'France').radiusDeg };
        out.usa = globe.anchor('active', 'United States of America');
        // ensureVisible on a sprawling feature aims at the anchor
        globe.setView({ lon: 150, lat: -20, k: 3 });
        await globe.ensureVisible(france, { animate: false });
        const p = globe.project(anchor), c = globe.project(centroid);
        out.ensure = { anchorOnScreen: p.visible && p.x > 60 && p.x < 740 && p.y > 60 && p.y < 540, anchorFromCentre: Math.hypot(p.x - 400, p.y - 300), centroidFromCentre: Math.hypot(c.x - 400, c.y - 300) };
      }
    }
    return out;
  });
  check('anchor (A9): inside its feature for every country, state and province', real.outside.length === 0,
    Object.keys(real.sets).map(k => k + ' ' + real.sets[k].features + ' in ' + fmt(real.sets[k].ms, 0) + ' ms (slowest ' + fmt(real.sets[k].slowest, 0) + ')').join('; ') + (real.outside.length ? '; outside: ' + real.outside.slice(0, 5).join(', ') : ''));
  check('anchorRadiusDeg: positive, and no point of the outline is nearer the anchor, for every country, state and province', real.crowded.length === 0,
    real.crowded.length ? 'wrong for ' + real.crowded.slice(0, 5).join(', ') : '');
  check("anchor (A9): France's is in metropolitan France though its centroid is not on French soil; the USA's is in the lower 48",
    !real.france.centroidInside && real.france.anchor[0] > -2 && real.france.anchor[0] < 7 && real.france.anchor[1] > 43 && real.france.anchor[1] < 50 &&
    real.usa[0] > -125 && real.usa[0] < -70 && real.usa[1] > 26 && real.usa[1] < 49,
    'France: centroid ' + real.france.centroid.map(v => fmt(v, 1)).join(', ') + ', anchor ' + real.france.anchor.map(v => fmt(v, 1)).join(', ') + '; USA anchor ' + real.usa.map(v => fmt(v, 1)).join(', '));
  check('ensureVisible (A9): a sprawling feature is brought into view by its anchor', real.ensure.anchorOnScreen && real.ensure.anchorFromCentre < 1,
    'anchor ' + fmt(real.ensure.anchorFromCentre, 1) + ' px from the centre of the host, centroid ' + fmt(real.ensure.centroidFromCentre, 0) + ' px');
});

group('outline', async ({ page }) => {
  // A10
  const r = await page.evaluate(async () => {
    const out = {};
    const world = await T.load('world');
    const byName = name => world.features.find(f => T.name(f) === name);
    const globe = T.create();
    await globe.setLayers([T.layer('world', world)]);
    const overlay = document.querySelector('#host canvas.globe-overlay');
    const ink = () => {
      const d = overlay.getContext('2d').getImageData(0, 0, 800, 600).data;
      let n = 0, farthest = 0;
      for (let i = 0; i < 800 * 600; i++) if (d[i * 4 + 3] > 60) { n++; farthest = Math.max(farthest, Math.hypot(i % 800 + 0.5 - 400, Math.floor(i / 800) + 0.5 - 300)); }
      return { n, farthest };
    };
    // Russia straddling the limb: only its near part is drawn, and it ends at the limb
    let targets = [byName('Russia')];
    globe.addOverlay(ctx => targets.forEach(f => globe.draw.outline(ctx, f, { stroke: '#f0f', width: 2, fill: 'rgba(255,0,255,0.3)' })));
    globe.setView({ lon: 5, lat: -18, k: 1 });
    await T.frames(2);
    out.straddling = Object.assign(ink(), { radius: globe.radiusPx() });
    // The outline follows the land: its inked pixels match the feature drawn by the engine
    globe.setView({ lon: 100, lat: 60, k: 1.3 });
    await T.frames(2);
    out.visible = ink().n;
    // Wholly on the far side: nothing
    globe.setView({ lon: -80, lat: -40, k: 1 });
    await T.frames(2);
    out.farSide = ink().n;
    // Cost of a handful of outlines per frame while the globe turns
    targets = ['France', 'Brazil', 'India', 'Egypt', 'Australia'].map(byName);
    out.points = targets.reduce((n, f) => n + JSON.stringify(f.geometry.coordinates).split('],[').length, 0);
    const times = [];
    for (let i = 0; i < 40; i++) {
      globe.setView({ lon: 20 + i * 2, lat: 10, k: 1.5 });
      await T.frame();
      times.push(globe.stats().lastFrameMs);
    }
    times.sort((a, b) => a - b);
    out.median = times[20]; out.worst = times[39];

    // A stroke alone (no fill) is traced by the engine itself. It inks what d3 would ink...
    const canada = byName('Canada');
    const stroked = (view, features) => {
      const ref = document.createElement('canvas');
      ref.width = 800; ref.height = 600;
      const c = ref.getContext('2d');
      const path = d3.geoPath(d3.geoOrthographic().clipAngle(90).precision(0.3).rotate([-view.lon, -view.lat]).scale(globe.radiusPx()).translate([400, 300]), c);
      c.beginPath();
      features.forEach(f => path(f));
      c.strokeStyle = '#f0f'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      const a = overlay.getContext('2d').getImageData(0, 0, 800, 600).data, b = c.getImageData(0, 0, 800, 600).data;
      let both = 0, either = 0, mine = 0, far = 0;
      for (let i = 0; i < 800 * 600; i++) {
        const m = a[i * 4 + 3] > 60, t = b[i * 4 + 3] > 60;
        if (m) { mine++; far = Math.max(far, Math.hypot(i % 800 + 0.5 - 400, Math.floor(i / 800) + 0.5 - 300)); }
        if (m && t) both++;
        if (m || t) either++;
      }
      return { iou: both / Math.max(1, either), ink: mine, farthest: far };
    };
    out.match = {};
    for (const [name, view, list] of [['Canada', { lon: -95, lat: 62, k: 1.7 }, [canada]], ['France', { lon: 3, lat: 46, k: 9 }, [byName('France')]],
      ['Indonesia', { lon: 118, lat: -2, k: 3 }, [byName('Indonesia')]]]) {
      targets = [];
      const off = globe.addOverlay(ctx => list.forEach(f => globe.draw.outline(ctx, f, { stroke: '#f0f', width: 2 })));
      globe.setView(view);
      await T.frames(2);
      out.match[name] = stroked(view, list);
      off();
    }
    // ...stops at the limb, draws nothing on the far side...
    const offRussia = globe.addOverlay(ctx => globe.draw.outline(ctx, byName('Russia'), { stroke: '#f0f', width: 2 }));
    globe.setView({ lon: 5, lat: -18, k: 1 });
    await T.frames(2);
    out.strokeLimb = Object.assign(ink(), { radius: globe.radiusPx() });
    globe.setView({ lon: -80, lat: -40, k: 1 });
    await T.frames(2);
    out.strokeFar = ink().n;
    offRussia();
    // ...a country of specks still shows as dots...
    const tuvalu = byName('Tuvalu') || byName('Kiribati');
    const offDots = globe.addOverlay(ctx => globe.draw.outline(ctx, tuvalu, { stroke: '#f0f', width: 2 }));
    const where = d3.geoCentroid(tuvalu);
    globe.setView({ lon: where[0], lat: where[1], k: 2 });
    await T.frames(2);
    out.dots = ink().n;
    offDots();
    // ...and costs little even for the outline with the most points on the map
    out.canadaPoints = JSON.stringify(canada.geometry.coordinates).split('],[').length;
    const offCanada = globe.addOverlay(ctx => globe.draw.outline(ctx, canada, { stroke: '#f0f', width: 2 }));
    const costs = [];
    for (let i = 0; i < 40; i++) {
      globe.setView({ lon: -120 + i * 1.5, lat: 55, k: 1.6 });
      await T.frame();
      costs.push(globe.stats().lastFrameMs);
    }
    offCanada();
    costs.sort((a, b) => a - b);
    out.canadaMedian = costs[20]; out.canadaWorst = costs[39];
    return out;
  });
  check('draw.outline: a stroke alone inks what d3 would ink (Canada, France, Indonesia)', ['Canada', 'France', 'Indonesia'].every(n => r.match[n].iou >= 0.9 && r.match[n].ink > 300),
    Object.keys(r.match).map(n => n + ' IoU ' + fmt(r.match[n].iou, 3) + ' over ' + r.match[n].ink + ' px').join('; '));
  check('draw.outline: a stroke alone stops at the limb and draws nothing on the far side', r.strokeLimb.n > 200 && r.strokeLimb.farthest <= r.strokeLimb.radius + 1.5 && r.strokeFar === 0,
    r.strokeLimb.n + ' px of ink, none beyond ' + fmt(r.strokeLimb.farthest, 1) + ' px (radius ' + fmt(r.strokeLimb.radius, 0) + '); ' + r.strokeFar + ' px on the far side');
  check('draw.outline: a country of specks still shows when stroked', r.dots >= 4, r.dots + ' px of ink');
  check('draw.outline: stroking the outline with the most points (Canada) costs about a millisecond of JS a frame', r.canadaMedian < 3,
    'median ' + fmt(r.canadaMedian) + ' ms per frame, worst ' + fmt(r.canadaWorst) + ' ms, about ' + r.canadaPoints + ' points');
  check('draw.outline (A10): a feature straddling the limb is drawn only on the near side', r.straddling.n > 500 && r.straddling.farthest <= r.straddling.radius + 1.5 && r.visible > r.straddling.n && r.farSide === 0,
    r.straddling.n + ' px of ink, none beyond ' + fmt(r.straddling.farthest, 1) + ' px from the centre (radius ' + fmt(r.straddling.radius, 0) + '); ' + r.farSide + ' px when wholly on the far side');
  // The limit is loose on purpose: on a machine with no GPU the same code measures 4 to 8 ms from run to run
  check('draw.outline (A10): five country outlines per frame cost a few ms of JS', r.median < 10, 'median ' + fmt(r.median) + ' ms per frame, worst ' + fmt(r.worst) + ' ms, about ' + r.points + ' points outlined');
});

group('layer-order', async ({ page }) => {
  // Later layers are drawn on top and picked first; hidden and non-interactive layers are not picked
  await page.evaluate(async () => {
    const coarse = await T.load('world110'), india = await T.load('india');
    const globe = T.create();
    globe.defineStyles({ under: '#0000ff', over: '#00ff00' });
    T.world = T.layer('world', coarse, { style: 'under', bordersVisible: false });
    T.india = T.layer('india', india, { style: 'over', bordersVisible: false });
    await globe.setLayers([T.world, T.india]);
    globe.setView({ lon: 79, lat: 22, k: 4 });
    T.spot = [78.5, 22.5];          // in Madhya Pradesh
    T.look = async () => {
      const p = globe.project(T.spot), hit = globe.featureAt(p.x, p.y);
      return { hit: hit ? hit.layerId + '/' + hit.key : null, pixel: (await T.pixelAt(globe, T.spot)).join() };
    };
    T.hovers = [];
    globe.on('hover', hit => T.hovers.push(hit ? hit.layerId + '/' + hit.key : null));
  });
  const spot = await page.evaluate(() => globe.project(T.spot));
  await page.mouse.move(spot.x, spot.y);
  const r = await page.evaluate(async () => {
    const out = {};
    await T.frames(2);
    out.both = await T.look();
    await globe.updateLayer('india', { visible: false });
    await T.frames(2);
    out.hidden = await T.look();
    await globe.updateLayer('india', { visible: true, interactive: false });
    await T.frames(2);
    out.context = await T.look();
    await globe.updateLayer('india', { interactive: true });
    await T.frames(2);
    out.hovers = T.hovers.slice();
    await globe.setLayers([T.india, T.world]);
    out.reversed = await T.look();
    return out;
  });
  const GREEN = '0,255,0,255', BLUE = '0,0,255,255';
  check('layers: the later layer is drawn on top and picked first',
    r.both.hit === 'india/Madhya Pradesh' && r.both.pixel === GREEN && r.reversed.hit === 'world/India' && r.reversed.pixel === BLUE,
    'provinces over world: ' + r.both.hit + '; world over provinces: ' + r.reversed.hit);
  check('layers: a hidden layer is neither drawn nor picked; a non-interactive one is drawn but not picked',
    r.hidden.hit === 'world/India' && r.hidden.pixel === BLUE && r.context.hit === 'world/India' && r.context.pixel === GREEN,
    'hidden: ' + r.hidden.hit + ' (' + r.hidden.pixel + '); not interactive: ' + r.context.hit + ' (' + r.context.pixel + ')');
  check('hover: worked out again when a layer changes under a resting mouse',
    r.hovers.join() === 'india/Madhya Pradesh,world/India,india/Madhya Pradesh', JSON.stringify(r.hovers));
});

group('crisp', async ({ page }) => {
  // Fills meet the limb: no gap inside it, nothing outside it
  const limb = await page.evaluate(async () => {
    // A cap centred on the eastern limb, so the limb cuts it in half
    const cap = { type: 'Feature', properties: { name: 'cap' }, geometry: { type: 'Polygon', coordinates: [d3.geoCircle().center([90, 0]).radius(50).precision(2)().coordinates[0]] } };
    const globe = T.create({ theme: Object.assign({}, T.FLAT, { ocean: '#000000', oceanEdge: '#000000' }) });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'cap', features: [cap], key: T.name, style: 'mark', bordersVisible: false }]);
    const out = [];
    for (const k of [1, 1.4]) {
      globe.setView({ lon: 0, lat: 0, k });
      const img = await T.capture(globe), R = globe.radiusPx();
      // Every pixel of the cap whose centre is 1.5 to 8 px inside the limb must be solid, and
      // every one 1.5 to 8 px outside it empty (the pixels in between are the anti-aliased edge)
      let inside = 255, outside = 0, checked = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 400; x < img.width; x++) {
          const dx = x + 0.5 - 400, dy = 300 - (y + 0.5), r = Math.hypot(dx, dy);
          if (r < R - 8 || r > R + 8 || Math.abs(Math.atan2(dy, dx)) > 35 * Math.PI / 180) continue;
          const o = (y * img.width + x) * 4, red = img.data[o] * img.data[o + 3] / 255;
          if (r <= R - 1.5) { inside = Math.min(inside, red); checked++; }
          else if (r >= R + 1.5) outside = Math.max(outside, red);
        }
      }
      out.push({ k, inside, outside, checked });
    }
    return out;
  });
  check('fills: they reach the limb with no gap, and stop there',
    limb.every(v => v.inside >= 254 && v.outside <= 1 && v.checked > 1000),
    limb.map(v => 'k ' + v.k + ': faintest of ' + v.checked + ' pixels just inside the limb ' + Math.round(v.inside) + '/255, strongest just outside ' + Math.round(v.outside) + '/255').join('; '));

  // Borders keep their width in CSS px at every zoom
  const widths = await page.evaluate(async () => {
    const globe = T.create({ theme: Object.assign({}, T.FLAT, { ocean: '#000000', oceanEdge: '#000000' }), maxZoom: 600 });
    globe.setGraticule(false);
    await globe.setLayers([{ id: 'line', features: [], borders: { type: 'MultiLineString', coordinates: [[[0, -30], [0, 30]]] }, borderColor: '#ff0000', borderWidth: 3 }]);
    const out = { wide: [], thin: [] };
    for (const width of [3, 0.5]) {
      globe.updateLayer('line', { borderWidth: width });
      for (const k of [1, 12, 150, 600]) {
        globe.setView({ lon: 0, lat: 0, k });
        const img = await T.capture(globe);
        // Total ink across two rows: for an anti-aliased line that is its width
        let ink = 0;
        for (const y of [250, 300]) for (let x = 380; x < 420; x++) ink += T.pixel(img, x, y)[0] / 255 / 2;
        out[width === 3 ? 'wide' : 'thin'].push(ink);
      }
    }
    return out;
  });
  check('borders: the same width in CSS px at k = 1, 12, 150 and 600; hairlines are drawn fainter, not thinner',
    widths.wide.every(v => Math.abs(v - 3) < 0.35) && widths.thin.every(v => Math.abs(v - 0.5) < 0.15),
    '3 px line measures ' + widths.wide.map(v => fmt(v)).join(', ') + ' px; 0.5 px line ' + widths.thin.map(v => fmt(v)).join(', ') + ' px of ink');
});

group('hidpi', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const globe = T.create();
    await globe.setLayers([T.layer('world', coarse)]);
    globe.setView({ lon: 2.35, lat: 48.86, k: 3 });
    let dpr = 0;
    globe.addOverlay((ctx, g) => { dpr = g.dpr; const p = g.project([2.35, 48.86]); ctx.fillStyle = '#f0f'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); });
    const img = await T.capture(globe);
    const scene = document.querySelector('.globe-gl'), overlay = document.querySelector('.globe-overlay');
    const o = overlay.getContext('2d').getImageData(800, 600, 1, 1).data;        // the host's centre, in backing-store px
    return { device: window.devicePixelRatio, scene: [scene.width, scene.height], overlay: [overlay.width, overlay.height], css: scene.getBoundingClientRect().width,
      dpr, land: T.pixel(img, 400, 300), overlayAtCentre: [o[0], o[1], o[2], o[3]], p: globe.project([2.35, 48.86]), radius: globe.radiusPx() };
  });
  check('hidpi: backing store is capped at 2 device px per CSS px; positions stay in CSS px', r.device === 3 && r.scene.join() === '1600,1200' && r.overlay.join() === '1600,1200' && r.css === 800 &&
    r.dpr === 2 && Math.abs(r.p.x - 400) < 1e-9 && Math.abs(r.p.y - 300) < 1e-9 && Math.abs(r.radius - 828) < 1e-9 && r.land.join() === '245,235,212,255' && r.overlayAtCentre.join() === '255,0,255,255',
    'devicePixelRatio ' + r.device + ', canvas ' + r.scene.join('×') + ' for an 800×600 host');
}, { dpr: 3 });

/* ----- Satellite imagery ----- */

// Records the z/x/y of every tile a page asks for.
function tileRequests(page) {
  const asked = [];
  page.on('request', request => {
    const m = request.url().match(/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/);
    if (m) asked.push(m[1] + '/' + m[3] + '/' + m[2]);       // the URL has z/y/x
  });
  return asked;
}

// The browser reports every tile that fails to load on the console. Where the check itself
// makes tiles fail, those reports are not page errors.
function forgiveTileErrors(h) {
  for (let i = h.errors.length - 1; i >= 0; i--) if (/Failed to load resource: net::ERR_FAILED/.test(h.errors[i])) h.errors.splice(i, 1);
}

const hostShot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), clip: { x: 0, y: 0, width: 800, height: 600 }, timeout: 60000 });

group('imagery-align', async ({ page }) => {
  const asked = tileRequests(page);
  const first = await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: 10, lat: 20, k: 1 });
    const supports = globe.supportsImagery(), before = globe.stats().imagery;
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    const during = T.statuses.slice();
    await T.imageryIdle(globe);
    return { supports, before, during, statuses: T.statuses.slice(), imagery: globe.stats().imagery };
  });
  check("imagery: supportsImagery() is true with WebGL; onStatus hears 'loading' at once, then 'ready'",
    first.supports === true && first.before === null && first.during.join() === 'loading' && first.statuses.join() === 'loading,ready' && first.imagery.status === 'ready' && first.imagery.loading === 0,
    first.statuses.join(' → ') + '; stats().imagery ' + JSON.stringify(first.imagery));
  const base = asked.slice(0, 16);
  check('imagery: the 16 tiles of zoom 2 (the whole world) are asked for first', base.length === 16 && new Set(base).size === 16 && base.every(key => /^2\/[0-3]\/[0-3]$/.test(key)), base.join(' '));

  // Alignment with the stand-in tiles, view by view: the land the tiles show against the
  // same land drawn by d3 for that view, and the engine's own borders against the tiles' coast
  const VIEWS = [
    ['the whole globe', 'world', { lon: 10, lat: 20, k: 1 }, 0.97],
    ['a view across the antimeridian', 'antimeridian', { lon: 180, lat: 56, k: 2.5 }, 0.97],
    ['a high-latitude view', 'arctic', { lon: 20, lat: 74, k: 4 }, 0.97],
    ['zoomed ×20 on Italy', 'x20', { lon: 12, lat: 42, k: 20 }, 0.985],
    ['zoomed ×60 on the Chesapeake', 'x60', { lon: -75.6, lat: 38.6, k: 60 }, 0.985],
    ['zoomed ×30 on Fiji, across the antimeridian', 'fiji', { lon: 179.6, lat: -17.3, k: 30 }, 0.97]
  ];
  for (const [title, slug, view, minIou] of VIEWS) {
    const from = asked.length;
    const r = await page.evaluate(async view => {
      globe.setView(view);
      await T.imageryIdle(globe);
      const m = await T.measureImagery(globe, view);
      // Known places: a pixel well inside tile land must be the tiles' green, one at sea their blue
      const land = (await T.load('land110')).features;
      const rnd = T.random(11);
      let known = 0, right = 0;
      for (let i = 0; i < 4000 && known < 300; i++) {
        const x = 20 + rnd() * 760, y = 20 + rnd() * 560, lonlat = globe.invert(x, y);
        if (!lonlat || globe.project(lonlat).z < 0.3) continue;
        // Keep clear of the coast: all four points 4 px away must be on the same side
        const here = d3.geoContains(land[0], lonlat);
        if ([[4, 0], [-4, 0], [0, 4], [0, -4]].some(o => { const q = globe.invert(x + o[0], y + o[1]); return !q || d3.geoContains(land[0], q) !== here; })) continue;
        known++;
        const c = T.pixel(m.img, x, y);
        if (c[3] === 255 && (here ? c[1] - c[2] > 25 : c[2] - c[1] > 12)) right++;
      }
      // Borders: every pixel the yellow border covers must have the tiles' coast within 2 px
      // (leaving out the rim of the globe, where the coast is seen edge-on)
      globe.updateLayer('land', { bordersVisible: true });
      const lined = await T.capture(globe);
      const rim = Math.pow(0.92 * globe.radiusPx(), 2);
      let border = 0, onCoast = 0;
      for (let y = 2; y < m.h - 2; y++) {
        for (let x = 2; x < m.w - 2; x++) {
          const o = (y * m.w + x) * 4;
          if (!(lined.data[o] > 170 && lined.data[o + 1] > 170 && lined.data[o + 2] < 120)) continue;
          if ((x - m.w / 2) * (x - m.w / 2) + (y - m.h / 2) * (y - m.h / 2) > rim) continue;
          border++;
          let sea = false, green = false;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (m.mask[(y + dy) * m.w + x + dx] === 1) green = true; else sea = true; }
          if (sea && green) onCoast++;
        }
      }
      globe.setStyle('land', 'feature', 'tint');
      await T.frames(2);
      return { blank: m.blank, land: m.land, iou: m.iou, bestIou: m.bestIou, shift: m.shift, zoom: m.imagery.zoom, known, right, border, onCoast };
    }, view);
    await hostShot(page, 'imagery-' + slug);
    await page.evaluate(async () => { globe.setStyle('land', 'feature', null); globe.updateLayer('land', { bordersVisible: false }); await T.frames(2); });
    check('imagery: ' + title + ' is covered, with tile land where d3 draws land',
      r.blank === 0 && r.land > 2000 && r.iou >= minIou && Math.abs(r.shift[0]) + Math.abs(r.shift[1]) === 0 && r.known >= 100 && r.right === r.known,
      'tile zoom ' + r.zoom + ', IoU ' + fmt(r.iou, 4) + ' (best fit at shift ' + r.shift.join(',') + '), ' + r.right + '/' + r.known + ' known land and sea points right, ' + r.blank + ' px without imagery');
    // (With the whole globe in view a few islands are smaller than a texel of the tiles: their
    // borders are drawn, but there is no land left in the picture for them to sit on. Across
    // the antimeridian the same goes for lakes: Cedar, Reindeer and Athabasca, water on the map,
    // are narrower than a texel of the zoom-3 tiles, which show land there)
    check('imagery: ' + title + ': the borders sit on the tiles\' coastlines', r.border > 300 && r.onCoast / r.border > (slug === 'world' || slug === 'antimeridian' ? 0.98 : 0.99),
      r.onCoast + ' of ' + r.border + ' border px have the coast within 2 px');
    if (slug === 'antimeridian' || slug === 'fiji') {
      const n = Math.pow(2, r.zoom);
      const columns = new Set(asked.slice(from).filter(key => key.indexOf(r.zoom + '/') === 0).map(key => +key.split('/')[1]));
      check('imagery: ' + title + ': its detail window takes tiles from both sides of the antimeridian', columns.has(0) && columns.has(n - 1),
        'zoom ' + r.zoom + ' columns ' + Array.from(columns).sort((a, b) => a - b).join(' '));
    }
  }

  // A tinted fill lies over the imagery, blended once
  const tint = await page.evaluate(async () => {
    globe.setView({ lon: 12, lat: 42, k: 20 });
    await T.imageryIdle(globe);
    const plain = await T.capture(globe);
    globe.setStyle('land', 'feature', 'tint');
    const tinted = await T.capture(globe);
    globe.setStyle('land', 'feature', null);
    let n = 0, right = 0, sample = null;
    for (let y = 30; y < 570; y += 7) {
      for (let x = 30; x < 770; x += 7) {
        const a = T.pixel(plain, x, y), b = T.pixel(tinted, x, y);
        if (T.near(a, T.TILE_SEA, 2) && !T.near(b, T.TILE_SEA, 2)) return { n: 0 };       // the sea took the tint
        if (!T.near(a, T.TILE_LAND, 2)) continue;
        n++;
        if (T.near(b, [130, 85, 41, 255], 3)) right++; else if (!sample) sample = b;
      }
    }
    return { n, right, sample };
  });
  check('imagery: a translucent fill tints the imagery under it (30% red over tile land)', tint.n > 500 && tint.right === tint.n, tint.right + ' of ' + tint.n + ' land samples' + (tint.sample ? '; e.g. ' + tint.sample.join(',') : ''));
});

group('imagery-moving', async ({ page }) => {
  // While tile responses above zoom 3 are being held back, they wait in `held`
  let held = null;
  await page.route(/MapServer\/tile\/\d+\//, route => {
    if (held && +route.request().url().match(/tile\/(\d+)\//)[1] > 3) held.push(route); else route.fallback();
  });

  // Turning the globe: the window is where the view last settled, the base is everywhere
  const spin = await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: 10, lat: 45, k: 4 });
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    await T.imageryIdle(globe);
    const land = (await T.load('land110')).features;
    const out = { zoom: globe.stats().imagery.zoom, frames: 0, blankFrames: 0, worstBlank: 0, minIou: 1, minLand: 1e9 };
    const frames = globe.stats().frames;
    for (let i = 1; i <= 48; i++) {
      const view = { lon: 10 + i * 7.5, lat: 45 * Math.cos(i / 6), k: 4 - 3 * Math.sin(i / 48 * Math.PI) };
      globe.setView(view);
      const img = await T.capture(globe), mask = T.satMask(img), blank = T.count(mask, 3);
      if (blank) { out.blankFrames++; out.worstBlank = Math.max(out.worstBlank, blank); }
      if (i % 6 === 0) {
        const v = globe.getView();
        out.minIou = Math.min(out.minIou, T.iouShifted(mask, T.referenceMask(land, v, img.width, img.height, globe.radiusPx()), img.width, img.height, 0, 0));
        out.minLand = Math.min(out.minLand, T.count(mask, 1));
      }
    }
    out.frames = globe.stats().frames - frames;
    return out;
  });
  check('imagery: while the globe turns (48 frames, a full turn with zooming) every frame is covered by imagery: no blank frames',
    spin.frames >= 48 && spin.blankFrames === 0 && spin.minIou > 0.9 && spin.minLand > 5000,
    spin.frames + ' frames, ' + spin.blankFrames + ' with uncovered pixels (worst ' + spin.worstBlank + ' px); land matches d3 with IoU ≥ ' + fmt(spin.minIou, 3) + ' on the way');

  // Zooming in: soft at first (the coarser mosaics), sharp once the view has settled and the
  // detail window's tiles are in
  await page.evaluate(async () => { globe.setView({ lon: 10, lat: 20, k: 1 }); await T.imageryIdle(globe); });
  held = [];
  const view = { lon: 12, lat: 42, k: 30 };
  const soft = await page.evaluate(async view => {
    T.statuses.length = 0;
    globe.setView(view);
    await T.frames(2);
    const early = T.count(T.satMask(await T.capture(globe)), 3);
    await T.wait(600);           // settled by now: the detail tiles have been asked for
    const m = await T.measureImagery(globe, view);
    return { early, blank: m.blank, soft: m.soft, iou: m.iou, imagery: m.imagery, statuses: T.statuses.slice() };
  }, view);
  await hostShot(page, 'imagery-soft');
  const waiting = held.length;
  held.forEach(route => route.fallback());
  held = null;
  const sharp = await page.evaluate(async view => {
    await T.imageryIdle(globe);
    const m = await T.measureImagery(globe, view);
    return { blank: m.blank, soft: m.soft, iou: m.iou, shift: m.shift, imagery: m.imagery, statuses: T.statuses.slice() };
  }, view);
  await hostShot(page, 'imagery-sharp');
  check('imagery: straight after a jump to ×30 the coarser imagery already covers the view, and the detail tiles are on their way once it settles',
    soft.early === 0 && soft.blank === 0 && waiting > 0 && soft.imagery.loading === waiting && soft.statuses.join() === 'loading' && soft.iou > 0.8,
    waiting + ' tiles of zoom ' + soft.imagery.zoom + ' asked for; meanwhile IoU ' + fmt(soft.iou, 3) + ', ' + soft.soft + ' px of blurred coast');
  check('imagery: the detail window sharpens the picture when its tiles arrive',
    sharp.imagery.zoom === 7 && sharp.imagery.loading === 0 && sharp.statuses.join() === 'loading,ready' && sharp.blank === 0 && sharp.soft < soft.soft / 4 && sharp.iou > 0.985 && sharp.iou > soft.iou && sharp.shift.join() === '0,0',
    'tile zoom ' + sharp.imagery.zoom + ': IoU ' + fmt(soft.iou, 4) + ' → ' + fmt(sharp.iou, 4) + ', blurred coast ' + soft.soft + ' → ' + sharp.soft + ' px');

  // Zooming in again: until the next window's tiles are in, the window before it stays
  // underneath, so the picture does not step back to the coarse base on the way
  held = [];
  const closer = { lon: 12, lat: 42, k: 60 };
  const between = await page.evaluate(async view => {
    globe.setView(view);
    await T.wait(600);
    const m = await T.measureImagery(globe, view);
    return { blank: m.blank, soft: m.soft, iou: m.iou, imagery: m.imagery };
  }, closer);
  const waitingAgain = held.length;
  held.forEach(route => route.fallback());
  held = null;
  const arrived = await page.evaluate(async view => {
    await T.imageryIdle(globe);
    const m = await T.measureImagery(globe, view);
    return { soft: m.soft, iou: m.iou, imagery: m.imagery };
  }, closer);
  check('imagery: while the tiles of the next window are on their way the window before it stays underneath: no step back to the coarse base',
    waitingAgain > 0 && between.imagery.zoom === 8 && between.imagery.loading === waitingAgain && between.blank === 0 && between.iou > 0.97 && between.soft < soft.soft / 4 &&
    arrived.imagery.loading === 0 && arrived.iou > 0.985 && arrived.soft < between.soft,
    'waiting for ' + waitingAgain + ' tiles of zoom 8 at ×60: IoU ' + fmt(between.iou, 4) + ' with ' + between.soft + ' px of blurred coast (zoom 7 underneath); with them ' + fmt(arrived.iou, 4) + ' and ' + arrived.soft + ' px');

  // Deep zoom (A2): a corner of the coast at k = 300 and 600, nudged a fraction of a pixel at a time
  const deep = await page.evaluate(async () => {
    const land = (await T.load('land110')).features;
    // A vertex where the coast turns by 60–120° between two edges long enough to cross the view
    let corner = null;
    land[0].geometry.coordinates.some(polygon => polygon.some(ring => {
      for (let i = 1; i < ring.length - 1 && !corner; i++) {
        const b = ring[i], c = Math.cos(b[1] * Math.PI / 180);
        if (Math.abs(b[1]) > 55 || Math.abs(b[0]) > 170) continue;
        const ux = (ring[i - 1][0] - b[0]) * c, uy = ring[i - 1][1] - b[1], vx = (ring[i + 1][0] - b[0]) * c, vy = ring[i + 1][1] - b[1];
        const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy), turn = Math.acos((ux * vx + uy * vy) / (lu * lv)) * 180 / Math.PI;
        if (lu > 0.6 && lv > 0.6 && turn > 60 && turn < 120) corner = b;
      }
      return !!corner;
    }));
    const out = { corner, runs: [] };
    for (const k of [300, 600]) {
      const run = { k, blank: 0, minIou: 1, maxIou: 0, shift: 0, zoom: 0 };
      // One device pixel, in degrees of longitude, at this zoom
      const px = 1 / (k * 0.46 * 600 * Math.cos(corner[1] * Math.PI / 180)) * 180 / Math.PI;
      for (let step = 0; step < 6; step++) {
        const view = { lon: corner[0] + step * 0.3 * px, lat: corner[1] + step * 0.2 * px, k };
        globe.setView(view);
        if (!step) await T.imageryIdle(globe);
        const m = await T.measureImagery(globe, globe.getView());
        run.blank += m.blank;
        run.minIou = Math.min(run.minIou, m.iou); run.maxIou = Math.max(run.maxIou, m.iou);
        run.shift = Math.max(run.shift, Math.abs(m.shift[0]) + Math.abs(m.shift[1]));
        run.zoom = m.imagery.zoom; run.land = m.land;
      }
      out.runs.push(run);
    }
    globe.updateLayer('land', { bordersVisible: true });
    await T.frames(2);
    return out;
  });
  await hostShot(page, 'imagery-deep');
  deep.runs.forEach(run => check('imagery: deep zoom k = ' + run.k + ': the tiles stay on the coast as the view creeps by 0.3 px steps (no jitter)',
    run.blank === 0 && run.land > 20000 && run.minIou > 0.985 && run.maxIou - run.minIou < 0.004 && run.shift === 0,
    'tile zoom ' + run.zoom + ' at ' + deep.corner.map(v => fmt(v, 3)).join(', ') + ': IoU ' + fmt(run.minIou, 4) + '–' + fmt(run.maxIou, 4) + ' over 6 steps, best fit never off by a pixel'));

  // The poles: past 85.0511° the last row of the map carries on, and the meridian opposite
  // the view centre (in sight beyond the pole) shows no seam. That meridian runs straight up
  // the middle of the host. A GPU works out which mipmap to use in blocks of 2×2 pixels, so a
  // seam there shows only if the middle falls inside a block: hence a host 802 px wide.
  const polar = await page.evaluate(async () => {
    globe.updateLayer('land', { bordersVisible: false });
    document.getElementById('host').style.width = '802px';
    globe.resize();
    const out = {};
    for (const [name, view, lon] of [['north', { lon: 30, lat: 85, k: 3 }, -150], ['south', { lon: 30, lat: -85, k: 3 }, -150]]) {
      globe.setView(view);
      await T.imageryIdle(globe);
      const img = await T.capture(globe), mask = T.satMask(img);
      const land = (await T.load('land110')).features[0];
      const px = (lonlat, dx) => { const p = globe.project(lonlat); return T.pixel(img, p.x + (dx || 0), p.y); };
      const sign = view.lat > 0 ? 1 : -1;
      // Along the far meridian, on the other side of the pole, up to the edge of the map: the
      // pixels on either side of it
      let n = 0, same = 0;
      for (let lat = 76; lat < 84.9; lat += 0.2) {
        const expected = d3.geoContains(land, [lon, sign * lat]) ? T.TILE_LAND : T.TILE_SEA;
        n += 2;
        if (T.near(px([lon, sign * lat], -0.5), expected, 8)) same++;
        if (T.near(px([lon, sign * lat], 0.5), expected, 8)) same++;
      }
      out[name] = { blank: T.count(mask, 3), pole: px([0, sign * 89.5]), n, same, zoom: globe.stats().imagery.zoom, width: img.width };
    }
    document.getElementById('host').style.width = '';
    globe.resize();
    return out;
  });
  await hostShot(page, 'imagery-south-pole');
  check('imagery: the poles are covered by the last row of the map (sea in the north, Antarctica in the south), with no seam beyond the pole',
    polar.north.width === 802 && polar.north.blank === 0 && polar.south.blank === 0 && polar.north.pole[2] - polar.north.pole[1] > 20 && polar.south.pole[1] - polar.south.pole[2] > 20 &&
    polar.north.same / polar.north.n > 0.85 && polar.south.same / polar.south.n > 0.85,
    'north pole ' + polar.north.pole.join(',') + ', south pole ' + polar.south.pole.join(',') + '; along the far meridian ' + polar.north.same + '/' + polar.north.n + ' and ' + polar.south.same + '/' + polar.south.n + ' samples are the plain colour of the tiles');
});

// Two device pixels per CSS pixel. The detail window is chosen for device pixels as far as
// the size of a mosaic allows: an 800×600 host at 2× would need 42 tiles of zoom 8 here, over
// the limit of 40, so it gets zoom 7, as a 1× display does.
group('imagery-hidpi', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: 12, lat: 42, k: 20 });
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    await T.imageryIdle(globe);
    const m = await T.measureImagery(globe, globe.getView());
    return { w: m.w, blank: m.blank, iou: m.iou, shift: m.shift, zoom: m.imagery.zoom, statuses: T.statuses.join() };
  });
  check('imagery (2× display): the picture is in place to the device pixel',
    r.w === 1600 && r.blank === 0 && r.iou > 0.985 && r.shift.join() === '0,0' && (r.zoom === 7 || r.zoom === 8) && r.statuses === 'loading,ready',
    'tile zoom ' + r.zoom + ', IoU ' + fmt(r.iou, 4) + ', best fit at shift ' + r.shift.join(','));
}, { dpr: 2 });

group('imagery-retry', async h => {
  const { page } = h;
  // Tiles fail while `failing` is set
  let failing = true;
  const asked = tileRequests(page);
  await page.route(/MapServer\/tile\/\d+\//, route => failing ? route.abort() : route.fallback());
  const sea = [-32, 12];          // open Atlantic, clear of the lines and labels on the stand-in tiles
  const state = () => page.evaluate(async sea => ({ statuses: T.statuses.slice(), imagery: globe.stats().imagery, sea: await T.pixelAt(globe, sea) }), sea);

  await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: -20, lat: 10, k: 1 });
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    T.failedAt = 0;
    await T.heard('failed');
    T.failedAt = performance.now();
    await T.frames(2);
  });
  const failed = await state(), askedFirst = asked.length;
  check("imagery: when no tile at all can be loaded onStatus hears 'failed', and the ocean colour shows",
    failed.statuses.join() === 'loading,failed' && failed.imagery.status === 'failed' && near(failed.sea, [255, 0, 255, 255]) && askedFirst >= 16,
    failed.statuses.join(' → ') + ' after ' + askedFirst + ' requests; sea pixel ' + failed.sea.join(','));

  // A5: the engine tries again by itself when a later view settles, but not within ~10 s
  failing = false;
  await page.evaluate(async () => { globe.setView({ lon: -25, lat: 12, k: 1 }); await T.wait(700); });
  const soon = await state(), askedSoon = asked.length;
  await page.evaluate(async () => {
    await T.wait(Math.max(0, 10300 - (performance.now() - T.failedAt)));
    globe.setView({ lon: -20, lat: 10, k: 1 });
    await T.imageryIdle(globe);
  });
  const later = await state();
  check('imagery (A5): a view settling soon after the failure does not ask again; one settling 10 s after it does, and imagery comes back',
    askedSoon === askedFirst && soon.statuses.join() === 'loading,failed' && asked.length > askedSoon && later.statuses.join() === 'loading,failed,ready' && near(later.sea, [20, 56, 92, 255], 8),
    (askedSoon - askedFirst) + ' requests at +0.7 s, ' + (asked.length - askedSoon) + ' at +10.3 s; ' + later.statuses.join(' → ') + '; sea pixel ' + later.sea.join(','));

  // A5: setImagery({ enabled: true }) again retries at once. (Other URLs than before: the
  // browser would hand back the images it has just shown without asking the network.)
  failing = true;
  await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: -20, lat: 10, k: 1 });
    globe.setImagery({ enabled: true, tileUrl: (z, x, y) => T.TILE(z, x, y) + '?again', onStatus: T.onStatus });
    await T.heard('failed');
  });
  failing = false;
  const before = asked.length;
  await page.evaluate(async () => { globe.setImagery({ enabled: true }); await T.imageryIdle(globe); });
  const again = await state();
  check('imagery (A5): setImagery({ enabled: true }) after a failure tries again at once',
    asked.length > before && again.statuses.join() === 'loading,failed,loading,ready' && near(again.sea, [20, 56, 92, 255], 8), again.statuses.join(' → '));

  // Some tiles missing is not a failure: what arrived is shown, the rest is ocean
  await page.unroute(/MapServer\/tile\/\d+\//);
  await page.route(/MapServer\/tile\/\d+\//, route => /tile\/\d+\/\d+\/[01]\?/.test(route.request().url()) ? route.abort() : route.fallback());
  const partial = await page.evaluate(async () => {
    const globe = await T.satGlobe({ lon: 0, lat: 10, k: 1 });
    // (maxZoom 2: the base mosaic alone)
    globe.setImagery({ enabled: true, tileUrl: (z, x, y) => T.TILE(z, x, y) + '?partial', maxZoom: 2, onStatus: T.onStatus });
    await T.imageryIdle(globe);
    return { statuses: T.statuses.slice(), west: await T.pixelAt(globe, [-32, 12]), east: await T.pixelAt(globe, [60, -20]), zoom: globe.stats().imagery.zoom };
  });
  check("imagery: with only some tiles missing the status is 'ready': the tiles that came are drawn, the ocean colour shows through the rest",
    partial.statuses.join() === 'loading,ready' && partial.zoom === 2 && near(partial.west, [255, 0, 255, 255]) && near(partial.east, [20, 56, 92, 255], 8),
    partial.statuses.join(' → ') + '; west (tiles refused) ' + partial.west.join(',') + ', east ' + partial.east.join(','));
  forgiveTileErrors(h);
});

group('imagery-offline', async h => {
  const { page } = h;
  const r = await page.evaluate(async () => {
    const out = {};
    const globe = await T.satGlobe({ lon: 10, lat: 20, k: 1 });
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    await T.heard('failed');
    // Life goes on without imagery: views settle, styles change
    for (let i = 0; i < 3; i++) { globe.setView({ lon: 10 + i, lat: 20, k: 1 }); await T.wait(300); }
    globe.setStyle('land', 'feature', 'good');
    out.statuses = T.statuses.slice();
    out.imagery = globe.stats().imagery;
    out.sea = await T.pixelAt(globe, [-30, 0]);
    out.land = await T.pixelAt(globe, [20, 20]);
    // The Canvas 2D fallback draws no imagery, and says so up front
    const flat = await T.satGlobe({ lon: 10, lat: 20, k: 1 }, { forceCanvas2D: true });
    out.flatSupports = flat.supportsImagery();
    flat.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    await T.wait(200);
    out.flatStatuses = T.statuses.slice();
    out.flatImagery = flat.stats().imagery;
    return out;
  });
  check("imagery (tiles: 'fail'): onStatus hears 'loading' then 'failed', once; the ocean colour and the layers are drawn as without imagery",
    r.statuses.join() === 'loading,failed' && r.imagery.status === 'failed' && near(r.sea, [255, 0, 255, 255]) && near(r.land, [95, 138, 75, 255]),
    r.statuses.join(' → ') + '; sea ' + r.sea.join(',') + ', land ' + r.land.join(','));
  check("imagery: the Canvas 2D fallback has supportsImagery() false and answers setImagery with 'failed'",
    r.flatSupports === false && r.flatStatuses.join() === 'failed' && r.flatImagery === null, r.flatStatuses.join());

  // The demo page takes the failure by going back to the drawn map
  await page.goto(h.url);
  await page.evaluate(() => window.demoReady);
  await page.click('#imagery');
  await page.waitForFunction(() => /unavailable/.test(document.getElementById('imagery').textContent));
  const demo = await page.evaluate(() => ({
    text: document.getElementById('imagery').textContent, pressed: document.getElementById('imagery').getAttribute('aria-pressed'),
    credit: document.getElementById('credit').hidden, lit: demo.state.imagery
  }));
  check('imagery: the demo page, offline, puts the drawn map back and says imagery is unavailable', demo.pressed === 'false' && demo.credit === true && demo.lit === false, '"' + demo.text + '"');
  forgiveTileErrors(h);
}, { tiles: 'fail' });

group('imagery-housekeeping', async ({ page }) => {
  const asked = tileRequests(page);
  const r = await page.evaluate(async () => {
    const out = {};
    const globe = await T.satGlobe({ lon: 10, lat: 20, k: 1 });
    globe.setImagery({ enabled: true, tileUrl: T.TILE, onStatus: T.onStatus });
    await T.imageryIdle(globe);
    await T.wait(300);
    // Idle: imagery draws nothing by itself
    let frames = globe.stats().frames;
    await T.wait(700);
    out.idleFrames = globe.stats().frames - frames;
    // A scripted 120-frame rotation with some zooming, as in the performance check
    const times = [];
    for (let i = 0; i < 120; i++) {
      globe.setView({ lon: 3 + i * 3, lat: 25 * Math.sin(i / 12), k: 1 + (i % 40) / 16 });
      await T.frame();
      times.push(globe.stats().lastFrameMs);
    }
    times.sort((a, b) => a - b);
    out.mean = times.reduce((a, b) => a + b, 0) / times.length; out.p95 = times[113]; out.max = times[119];
    return out;
  });
  check('imagery: no frames are drawn while nothing changes', r.idleFrames === 0, r.idleFrames + ' frames in 0.7 s');
  check('imagery: JS time per frame stays under 2 ms over a 120-frame rotation with imagery on', r.mean < 2 && r.p95 < 2, 'mean ' + fmt(r.mean) + ' ms, p95 ' + fmt(r.p95) + ', max ' + fmt(r.max));

  // Turning imagery off and on again: the tiles are still there, so it is 'ready' at once
  // without having been 'loading'
  await page.evaluate(async () => { globe.setView({ lon: -20, lat: 10, k: 1 }); await T.imageryIdle(globe); });
  const from = asked.length;
  const toggled = await page.evaluate(async () => {
    const out = {};
    globe.setImagery({ enabled: false });
    out.off = await T.pixelAt(globe, [-32, 12]);
    out.offStats = globe.stats().imagery;
    await T.wait(400);
    T.statuses.length = 0;
    globe.setImagery({ enabled: true });
    out.statuses = T.statuses.slice();
    out.on = await T.pixelAt(globe, [-32, 12]);
    return out;
  });
  check("imagery: turned off, the ocean is back at once; turned on again, it is 'ready' at once from the tiles it kept",
    near(toggled.off, [255, 0, 255, 255]) && toggled.offStats === null && near(toggled.on, [20, 56, 92, 255], 8) && asked.length === from && toggled.statuses.join() === 'ready',
    'off ' + toggled.off.join(',') + ', on ' + toggled.on.join(',') + '; ' + toggled.statuses.join(' → ') + '; ' + (asked.length - from) + ' requests');

  // The tile cache: least recently used tiles go once it holds 160
  const PLACES = [];
  for (let i = 0; i < 20; i++) PLACES.push({ lon: -165 + i * 17, lat: i % 2 ? 35 : -25, k: 14 });
  const sizes = [];
  for (const view of PLACES) {
    sizes.push(await page.evaluate(async view => { globe.setView(view); await T.imageryIdle(globe); return globe.stats().imagery.tiles; }, view));
  }
  // (Whether tiles had to be loaded again shows in the status: the browser may hand an image
  // it still holds back without a request)
  const revisit = view => page.evaluate(async view => {
    T.statuses.length = 0;
    globe.setView(view);
    await T.imageryIdle(globe);
    return T.statuses.join();
  }, view);
  const total = new Set(asked).size;
  await revisit(PLACES[18]);
  const again = await revisit(PLACES[19]), evicted = await revisit(PLACES[0]);
  check('imagery: the tile cache stops at 160 tiles; a place just seen is drawn from it, one seen long ago is loaded again',
    total > 220 && Math.max.apply(null, sizes) === 160 && again === '' && evicted === 'loading,ready',
    total + ' different tiles asked for, cache sizes ' + sizes.join(' ') + '; status on returning to the last place: "' + again + '", to the first: "' + evicted + '"');

  // A lost WebGL context: the mosaics are made again from the cached tiles
  const lost = await page.evaluate(async () => {
    const view = { lon: 12, lat: 42, k: 14 };
    globe.setView(view);
    await T.imageryIdle(globe);
    T.statuses.length = 0;
    const lose = document.querySelector('.globe-gl').getContext('webgl').getExtension('WEBGL_lose_context');
    lose.loseContext();
    await T.wait(200);
    lose.restoreContext();
    await T.wait(500);
    await T.imageryIdle(globe);
    const m = await T.measureImagery(globe, view);
    return { blank: m.blank, iou: m.iou, zoom: m.imagery.zoom, renderer: globe.stats().renderer, statuses: T.statuses.join() };
  });
  check('imagery: after the WebGL context is lost and restored the imagery is back, made again from the tiles in the cache',
    lost.renderer === 'webgl' && lost.blank === 0 && lost.iou > 0.98 && lost.statuses === '',
    'IoU ' + fmt(lost.iou, 4) + ' at tile zoom ' + lost.zoom + ', ' + lost.blank + ' px without imagery, status changes: "' + lost.statuses + '"');
});

// The demo page: every data set loads, the controls work, and the screenshots are taken.
async function demo(h, tag, sets) {
  const { page, url } = h;
  const shot = (name, options) => page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png'), timeout: 60000 }, options || {}));
  await page.goto(url);
  await page.evaluate(() => window.demoReady);
  await page.waitForTimeout(600);
  const first = await page.evaluate(() => ({ stats: globe.stats(), pressed: document.querySelector('#datasets [aria-pressed="true"]').textContent }));
  check('demo (' + tag + '): opens on the 50m world with WebGL', first.stats.renderer === 'webgl' && first.stats.triangles > 100000 && first.pressed === 'World 50m');
  await shot('demo-' + tag + '-world');
  for (const set of sets) {
    await page.click('#datasets [data-set="' + set + '"]');
    await page.waitForFunction(name => demo.state.set === name && globe.stats().triangles > 0 && document.querySelector('#datasets [aria-pressed="true"]').dataset.set === name, set);
    // The fit flies there: wait until the view has stopped changing
    await page.waitForFunction(() => {
      const v = JSON.stringify(globe.getView()), same = v === window.lastSeenView;
      window.lastSeenView = v;
      return same && globe.getView().k > 1.05;
    }, null, { polling: 400 });
    const s = await page.evaluate(() => ({ stats: globe.stats(), view: globe.getView() }));
    check('demo (' + tag + '): shows ' + set, s.stats.triangles > 10000 && s.view.k > 1.05, Math.round(s.stats.triangles) + ' triangles, k ' + fmt(s.view.k));
    await shot('demo-' + tag + '-' + set);
  }
}

group('demo', async h => {
  const { page } = h;
  await demo(h, 'desktop', ['us', 'canada', 'china', 'india', 'russia']);
  // Pick two places: style change, flash, outline, label, rings and the route between them
  await page.click('#datasets [data-set="world110"]');
  await page.waitForFunction(() => demo.state.set === 'world110' && globe.stats().triangles > 0 && globe.stats().triangles < 100000);
  await page.waitForTimeout(500);
  let p = await page.evaluate(() => globe.project([30, 27]));
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(1500);
  p = await page.evaluate(() => globe.project([78, 22]));
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(450);
  const picked = await page.evaluate(() => ({ place: document.getElementById('place').textContent, selected: demo.state.selected.key, previous: demo.state.previous.key }));
  check('demo: clicking selects a place and remembers the one before', picked.place === 'India' && picked.selected === 'India' && picked.previous === 'Egypt', JSON.stringify(picked));
  await page.screenshot({ path: path.join(SHOTS, 'demo-desktop-selected.png') });
  // Controls
  await page.waitForTimeout(1200);
  const settled = () => page.evaluate(() => new Promise(resolve => { const off = globe.on('settle', () => { off(); resolve(); }); }));
  const before = await page.evaluate(() => globe.getView());
  await page.click('#zoom-in');
  await settled();
  const zoomed = await page.evaluate(() => globe.getView());
  await page.click('#reset');
  await settled();
  const reset = await page.evaluate(() => globe.getView());
  await page.click('#imagery');
  await page.waitForFunction(() => { const im = globe.stats().imagery; return im && im.status === 'ready' && !im.loading; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'demo-desktop-imagery.png'), timeout: 60000 });
  const imagery = await page.evaluate(() => ({
    text: document.getElementById('imagery').textContent, pressed: document.getElementById('imagery').getAttribute('aria-pressed'),
    credit: !document.getElementById('credit').hidden, zoom: globe.stats().imagery.zoom
  }));
  await page.click('#imagery');
  imagery.off = await page.evaluate(() => globe.stats().imagery === null && document.getElementById('credit').hidden);
  await page.click('#spin');
  await page.waitForTimeout(500);
  const spun = await page.evaluate(() => globe.getView());
  await page.click('#spin');
  check('demo: zoom, reset, spin and the imagery toggle respond', Math.abs(zoomed.k - before.k * 1.6) < 0.01 && Math.abs(reset.k - before.k) < 1e-6 && spun.lon !== reset.lon &&
    imagery.text === 'Imagery' && imagery.pressed === 'true' && imagery.credit && imagery.zoom >= 2 && imagery.off,
    'k ' + fmt(before.k) + ' → ' + fmt(zoomed.k) + ' → ' + fmt(reset.k) + '; imagery on at tile zoom ' + imagery.zoom + ' with its credit line, then off');

  // Still pictures of the engine alone, for the record
  await page.evaluate(() => { demo.state.selected = demo.state.previous = null; document.querySelector('.panel').style.display = 'none'; return demo.load('world'); });
  for (const [name, view] of [['view-antimeridian', { lon: 180, lat: 10, k: 1 }], ['view-south-pole', { lon: 0, lat: -85, k: 1.6 }], ['view-europe', { lon: 14, lat: 47, k: 8 }], ['view-limb-russia', { lon: 5, lat: -18, k: 1 }]]) {
    await page.evaluate(v => globe.setView(v), view);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 60000 });
  }
  check('demo: no network requests were blocked', h.netLog.blocked.length === 0, h.netLog.blocked.slice(0, 3).join(', '));
}, { width: 1280, height: 800 });

group('demo-mobile', async h => {
  await demo(h, 'mobile', ['china']);
  const r = await h.page.evaluate(() => {
    const c = document.querySelector('.globe-gl');
    return { canvas: [c.width, c.height], view: [innerWidth, innerHeight], touch: getComputedStyle(document.getElementById('globe')).touchAction };
  });
  check('demo (mobile): full-screen canvas at 2× with touch-action none', r.canvas[0] === r.view[0] * 2 && r.canvas[1] === r.view[1] * 2 && r.touch === 'none', r.canvas.join('×') + ' backing store for ' + r.view.join('×'));
}, { mobile: true, dpr: 2 });

// Close-up pictures at two device pixels per CSS pixel, for looking at rather than checking.
group('pictures', async ({ page }) => {
  const shot = (name, clip) => page.screenshot({ path: path.join(SHOTS, name + '.png'), clip, timeout: 60000 });
  await page.evaluate(async () => {
    const world = await T.load('world');
    const globe = T.create();
    globe.defineStyles({ pale: 'rgba(245,235,212,0.55)' });
    await globe.setLayers([T.layer('world', world)]);
    globe.setView({ lon: 28.7, lat: 44.6, k: 1 });
    await T.frames(3);
  });
  await shot('detail-limb', { x: 480, y: 20, width: 300, height: 300 });
  await page.evaluate(async () => { globe.setView({ lon: 15.5, lat: 45.2, k: 40 }); await T.frames(3); });
  await shot('detail-borders-thin', { x: 200, y: 150, width: 400, height: 300 });
  await page.evaluate(async () => { globe.updateLayer('world', { borderWidth: 3 }); await T.frames(3); });
  await shot('detail-borders-wide', { x: 200, y: 150, width: 400, height: 300 });
  await page.evaluate(async () => {
    globe.updateLayer('world', { borderWidth: 0.9, style: 'pale' });
    globe.setStyles('world', { Italy: 'good', Croatia: 'bad' });
    globe.setView({ lon: 14, lat: 44, k: 7 });
    await T.frames(3);
  });
  await shot('detail-translucent', { x: 150, y: 100, width: 500, height: 400 });
  const fallback = await page.evaluate(async () => {
    const coarse = await T.load('world110');
    const globe = T.create({ forceCanvas2D: true });
    await globe.setLayers([T.layer('world', coarse)]);
    globe.setView({ lon: 28.7, lat: 44.6, k: 1 });
    await T.wait(400);
    return globe.stats().renderer;
  });
  await shot('canvas2d-world110', { x: 0, y: 0, width: 800, height: 600 });
  check('pictures: close-ups and the Canvas 2D fallback were captured', fallback === 'canvas2d');
}, { dpr: 2 });

/* ===== Runner ===== */

(async () => {
  const filter = process.argv[2] || '';
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const g of groups) {
    if (filter && g.name.indexOf(filter) < 0) continue;
    const h = await launch(Object.assign({ width: 1000, height: 700 }, g.options));
    try {
      if (g.name.indexOf('demo') !== 0) {
        await h.page.goto(h.url + 'test.html');
        await h.page.evaluate(pageHelpers);
      }
      await g.fn(h);
      check(g.name + ': no page errors', h.errors.length === 0, h.errors.slice(0, 3).join(' | '));
    } catch (e) {
      check(g.name + ': ran to completion', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' '));
    }
    await h.close();
  }
  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed, ' + results.length + ' checks');
  if (failed.length) console.log('Failed: ' + failed.map(r => r.name).join('; '));
  console.log('Screenshots: ' + SHOTS);
  process.exit(failed.length ? 1 : 0);
})();
