#!/usr/bin/env node
// End-to-end smoke suite for Cartographer's Atlas: plays every kind of level in a real browser.
//
//   NODE_PATH=/opt/node-tools/node_modules node smoke.js [options]
//
//   --only=<name,name>   run a subset (names or numbers from --list)
//   --root=<dir>         serve this folder instead of the repo's public/
//   --shots=<dir>        save a screenshot at the end of each check
//   --mobile             phone size (390x844) with touch input
//   --patch-hook         for a build without window.__atlas: test a copy with the hook added
//   --list               print the checks and exit
//   --verbose            print each step as it happens
//   --stock-gpu          keep the harness's Chromium flags as they are (see the note below)
//
// Exit code: 0 when every check passed or was skipped, 1 when any failed.
//
// What the suite relies on, so that it survives a menu redesign and a new map renderer:
//   - levels start from deep links (?play=<slug>, &learn=1), never from menu clicks;
//   - game state is read from the test hook window.__atlas = { state, mastery, LEVELS, startGame };
//   - screens are #menu-screen / #game-screen / #results-screen, the visible one has .active;
//   - Skip, Drop Pin / Next, Quiz Me and leaving a round go through the keyboard (S, Enter, Escape);
//   - everything that touches the map lives in the MAP ADAPTER section just below. A new map
//     renderer means rewriting that section and nothing else.
'use strict';

const fs = require('fs');
const path = require('path');

// Options come from the command line; a script that require()s this file gets the defaults
// and may set fields on the exported OPT (for example OPT.mobile) before opening a browser.
const OPT = parseArgs(require.main === module ? process.argv.slice(2) : []);

// The harness starts Chromium with GPU compositing on a software GL driver. With that, every
// screen switch over the map leaves the browser busy for 5-15 s (measured: screenshots and
// browser.close() wait that long), which no check here is about. Compositing in software
// avoids it and leaves WebGL (still the software driver) working. --stock-gpu keeps the
// harness's own flags. The harness takes no launch flags, so they are added to its
// chromium.launch call from here.
if (!OPT.stockGpu) {
  const chromium = require('playwright').chromium;
  const stockLaunch = chromium.launch.bind(chromium);
  chromium.launch = options => stockLaunch(Object.assign({}, options, {
    args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
  }));
}
const { launch } = require('./atlas-harness.js');

/* =====================================================================
 * MAP ADAPTER — the only code in this file that knows how the map is drawn
 *
 * The map is one WebGL globe (window.__atlas.globe, the engine) with the game's own map
 * data beside it (window.__atlas.map): countries, states and provinces are features of the
 * round's layer, keyed 'name:' + the feature's raw name; US cities are dots drawn over the
 * globe (map.dots); Pin the City takes a tap anywhere on the globe.
 *
 * Contract with the rest of the suite (keep these when rewriting):
 *   install(context)            once per browser context, before any page loads
 *   ready(page)                 resolves when the round's map can take input
 *   answer(page[, name])        real click/tap on the item being asked for, or on a named item
 *   answerWrong(page[, skip])   real click/tap on an unanswered item that is NOT the answer;
 *                               resolves to its name (skip: names not to use)
 *   pinAt(page, lon, lat)       Pin the City: aim at this place
 *   pinFarFrom(page, lon, lat)  Pin the City: aim at a visible spot far from this place;
 *                               resolves to { lon, lat, km }
 *   resetView(page)             back to the round's opening view
 *   counts                      { clicks, zoomed, synthetic } for the end-of-run summary
 * All clicks are real pointer input at a point where globe.featureAt() says the item is the
 * thing under the pointer. A place that is hidden, covered or tiny is brought to the middle
 * with globe.setView (aim); the click itself is still real input. There is no synthetic
 * fallback (counts.synthetic stays 0).
 * ===================================================================== */

// The in-page half: installed on every page load as window.__smokeMap
function installMapProbe() {
  const state = () => window.__atlas.state;
  const globe = () => window.__atlas.globe;
  const gmap = () => window.__atlas.map;
  const hostEl = () => document.getElementById('globe-host');
  const keyOf = f => 'name:' + (f.properties.name || f.properties.NAME || f.properties.NAME_LONG);

  // name -> feature lookup for the dataset in play
  function featuresByName(name) {
    const s = state();
    if (s.activeDataset === 'us') return s.usFeatureByCanonical;
    if (s.activeDataset === 'province') {
      const stores = s.provinceStores || {};
      const keys = Object.keys(stores);
      const key = keys.find(k => String(s.currentProvinceRound || '').indexOf(k) === 0) ||
        keys.find(k => stores[k].featureByCanonical.has(name));
      return key ? stores[key].featureByCanonical : new Map();
    }
    return s.featureByCanonical;
  }

  function kmBetween(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // The part of the globe's host that is on screen, in client px
  function gViewRect() {
    const r = hostEl().getBoundingClientRect();
    return {
      left: Math.max(r.left, 0) + 2, top: Math.max(r.top, 0) + 2,
      right: Math.min(r.right, window.innerWidth) - 2, bottom: Math.min(r.bottom, window.innerHeight) - 2
    };
  }

  // lon/lat -> client px, with whether it faces the viewer squarely enough to click
  function gClient(lonlat) {
    const p = globe().project(lonlat);
    const r = hostEl().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, facing: p.visible && p.z > 0.12 };
  }

  // True when a click at this client point reaches the globe (no control on top)
  function gTopAt(x, y) {
    const v = gViewRect();
    if (x < v.left || x > v.right || y < v.top || y > v.bottom) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && hostEl().contains(top);
  }

  // The key of the feature of the round's layer exactly under a client point
  function gKeyAt(x, y) {
    const r = hostEl().getBoundingClientRect();
    const hit = globe().featureAt(x - r.left, y - r.top, { tolerance: 0 });
    return hit && hit.layerId === gmap().layer ? hit.key : null;
  }

  // Every position of a feature's geometry, thinned to at most `most`
  function gVertices(feature, most) {
    const out = [];
    const walk = a => { if (typeof a[0] === 'number') out.push(a); else a.forEach(walk); };
    if (feature.geometry) walk(feature.geometry.coordinates);
    const step = Math.max(1, Math.ceil(out.length / most));
    return out.filter((p, i) => i % step === 0);
  }

  // US cities are dots drawn over the globe; a tap goes to the nearest dot within reach
  function gDotAt(x, y) {
    const r = hostEl().getBoundingClientRect();
    let best = null, bestD = 12;
    gmap().dots.forEach(dot => {
      const p = globe().project(dot.lonlat);
      const d = Math.hypot(r.left + p.x - x, r.top + p.y - y);
      if (p.visible && d <= bestD) { best = dot.name; bestD = d; }
    });
    return best;
  }

  function gLocateDot(name, minScore) {
    const dot = gmap().dots.find(d => d.name === name);
    if (!dot) return { error: 'no dot on the globe is named "' + name + '"' };
    const c = gClient(dot.lonlat);
    const x = Math.round(c.x), y = Math.round(c.y);
    const hit = (px, py) => gTopAt(px, py) && gDotAt(px, py) === name;
    if (c.facing && hit(x, y)) {
      const ring = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]];
      const score = ring.filter(d => hit(x + d[0], y + d[1])).length;
      if (score >= (minScore || 0)) return { x: x, y: y, score: score };
    }
    return { miss: true, onScreen: c.facing && gTopAt(c.x, c.y), cx: c.x, cy: c.y };
  }

  // Finds a client point where a click lands on the named item and nothing else:
  // { x, y, score } with score = how many of 8 points around it also hit (0-8), or
  // { miss, onScreen, cx, cy } when no point in view will do
  function gLocate(name, minScore) {
    if (state().gameMode === 'us-city') return gLocateDot(name, minScore);
    const feature = featuresByName(name).get(name);
    if (!feature) return { error: 'nothing on the map is bound to "' + name + '"' };
    const key = keyOf(feature);
    const layer = gmap().layer;
    const anchor = globe().anchor(layer, key);
    if (!anchor) return { error: 'the globe has no feature "' + key + '" in layer ' + layer };
    const ring = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]];
    const hit = (x, y) => gTopAt(x, y) && gKeyAt(x, y) === key;
    let best = null;
    const consider = lonlat => {
      const c = gClient(lonlat);
      const x = Math.round(c.x), y = Math.round(c.y);
      if (!c.facing || !hit(x, y)) return false;
      let score = 0;
      ring.forEach(d => { if (hit(x + d[0], y + d[1])) score++; });
      if (!best || score > best.score) best = { x: x, y: y, score: score };
      return score === 8;
    };
    // The anchor first (the most-inside point), then points between it and the outline
    if (!consider(anchor)) {
      const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const verts = gVertices(feature, 60);
      for (let i = 0; i < verts.length; i++) {
        const far = Math.abs(verts[i][0] - anchor[0]) > 90;       // across the antimeridian: no straight blend
        if (consider(far ? verts[i] : mid(anchor, verts[i], 0.5)) || consider(far ? verts[i] : mid(anchor, verts[i], 0.9))) break;
      }
    }
    if (best && best.score >= (minScore || 0)) return best;
    const a = gClient(anchor);
    return { miss: true, onScreen: a.facing && gTopAt(a.x, a.y), cx: a.x, cy: a.y };
  }

  // Brings the named place to the middle of the globe, larger with every try
  function gAim(name, tries) {
    const g = globe();
    if (state().gameMode === 'us-city') {
      // Crowded dots come apart as the globe zooms in
      const dot = gmap().dots.find(d => d.name === name);
      g.setView({ lon: dot.lonlat[0], lat: dot.lonlat[1], k: g.getView().k * (tries > 0 ? 2.5 : 1) });
      return;
    }
    const feature = featuresByName(name).get(name);
    const key = keyOf(feature);
    const info = g.featureInfo(gmap().layer, key);
    const anchor = g.anchor(gmap().layer, key);
    const view = g.getView();
    const size = 2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180);   // px across, about
    let k = size < 60 ? view.k * 60 / Math.max(size, 0.05) : view.k;
    if (tries > 0) k = Math.max(k, view.k * 2.5);
    g.setView({ lon: anchor[0], lat: anchor[1], k: k });
  }

  function gAtHome() {
    const v = globe().getView(), h = gmap().home;
    return !h || (Math.abs(v.lon - h.lon) < 1e-4 && Math.abs(v.lat - h.lat) < 1e-4 && Math.abs(v.k / h.k - 1) < 1e-4);
  }

  // Where to click to pin this lon/lat: { x, y, free (facing the viewer, nothing on top) }
  function pinPoint(lon, lat) {
    const c = gClient([lon, lat]);
    return { x: c.x, y: c.y, free: c.facing && gTopAt(c.x, c.y) };
  }

  // A clickable spot on the globe as far as possible from this lon/lat
  function farPoint(lon, lat) {
    const view = gViewRect();
    const r = hostEl().getBoundingClientRect();
    let best = null;
    for (let i = 0; i < 14; i++) {
      for (let j = 0; j < 10; j++) {
        const x = view.left + (i + 0.5) * (view.right - view.left) / 14;
        const y = view.top + (j + 0.5) * (view.bottom - view.top) / 10;
        if (!gTopAt(x, y)) continue;
        const ll = globe().invert(x - r.left, y - r.top);
        if (!ll) continue;
        const km = kmBetween([lon, lat], ll);
        if (!best || km > best.km) best = { x: x, y: y, lon: ll[0], lat: ll[1], km: km };
      }
    }
    return best;
  }

  // When the view last changed, heard from the engine (a flight to a place takes many frames)
  let viewHeard = false, viewChanged = 0;
  function viewStill(quietMs) {
    if (!viewHeard) {
      viewHeard = true;
      globe().on('view', () => { viewChanged = performance.now(); });
    }
    return performance.now() - viewChanged > quietMs;
  }

  window.__smokeMap = {
    ready: function () {
      const s = window.__atlas && window.__atlas.state;
      return !!s && !!globe() && gmap().round === s.roundId && gmap().drawn;
    },
    atHome: gAtHome,
    still: viewStill,
    locate: gLocate,
    aim: gAim,
    // Turns the globe so that this lon/lat is at its middle, at the zoom it has
    aimAt: function (lon, lat) { globe().setView({ lon: lon, lat: lat, k: globe().getView().k }); },
    pinPoint: pinPoint, farPoint: farPoint
  };
}

const MapAdapter = {
  kind: 'WebGL globe',
  counts: { clicks: 0, zoomed: 0, synthetic: 0 },

  async install(context) {
    await context.addInitScript(installMapProbe);
  },

  async ready(page) {
    await page.waitForFunction(() => window.__smokeMap && window.__smokeMap.ready(), null, { timeout: 15000, polling: 30 });
  },

  // The least a click point must score (see gLocate): any hit will do for a mouse click on the
  // answer, a tap wants a little room, and a deliberately wrong answer stays well inside its
  // shape so that it cannot graze the right one
  minScore(wrongAnswer) {
    return wrongAnswer ? 6 : OPT.mobile ? 4 : 0;
  },

  // One real tap or click at a client point
  async tapAt(page, x, y) {
    if (OPT.mobile) {
      // Two taps close together in time and place are a double tap
      const last = this.lastTap;
      const wait = last && last.page === page && Math.hypot(last.x - x, last.y - y) < 16 ? last.at + 560 - Date.now() : 0;
      if (wait > 0) await page.waitForTimeout(wait);
      await page.touchscreen.tap(x, y);
      this.lastTap = { page: page, x: x, y: y, at: Date.now() };
    } else {
      await page.mouse.click(x, y);
    }
    this.counts.clicks++;
  },

  // Clicks or taps the named item if some point of it in view is safe to hit; otherwise
  // resolves to { miss, onScreen, cx, cy } without touching anything
  async tapItem(page, name, minScore) {
    const loc = await page.evaluate(a => window.__smokeMap.locate(a[0], a[1]), [name, minScore]);
    if (loc.error) throw new Error('map adapter: ' + loc.error);
    if (loc.miss) return loc;
    await this.tapAt(page, loc.x, loc.y);
    return loc;
  },

  async resetView(page) {
    if (await page.evaluate(() => window.__smokeMap.atHome())) return;
    await page.keyboard.press('0');
    await page.waitForFunction(() => window.__smokeMap.atHome(), null, { timeout: 3000, polling: 30 }).catch(() => {});
  },

  async answer(page, name) {
    if (name == null) name = await page.evaluate(() => window.__atlas.state.current);
    if (!name) throw new Error('map adapter: there is no question to answer');
    for (let attempt = 0; attempt < 7; attempt++) {
      const r = await this.tapItem(page, name, this.minScore(false));
      if (!r.miss) {
        // Turning the globe is part of playing on it: the view stays where the answer was
        if (attempt > 0) this.counts.zoomed++;
        return name;
      }
      await page.evaluate(a => window.__smokeMap.aim(a[0], a[1]), [name, attempt]);
      await page.waitForTimeout(150);
    }
    throw new Error('map adapter: could not click "' + name + '" on the globe');
  },

  async answerWrong(page, skip) {
    // Names still in the queue have not been asked, so they are unanswered and not the answer
    const names = await page.evaluate(skipNames => {
      const s = window.__atlas.state;
      return s.queue.filter(n => n !== s.current && skipNames.indexOf(n) === -1);
    }, skip || []);
    if (!names.length) throw new Error('map adapter: no other unanswered item is left for a wrong answer');
    for (let pass = 0; pass < 2; pass++) {
      for (const name of names.slice(0, 8)) {
        const r = await this.tapItem(page, name, this.minScore(true));
        if (!r.miss) return name;
      }
      if (await page.evaluate(() => window.__smokeMap.atHome())) break;
      await this.resetView(page);
    }
    // Nothing else can be hit safely in this view: go and find one, zooming as needed
    return this.answer(page, names[0]);
  },

  // Resolves once the globe has stopped moving (a reveal and the next city both turn it)
  async still(page) {
    await page.evaluate(() => window.__smokeMap.still(0));
    await page.waitForFunction(() => window.__smokeMap.still(350), null, { timeout: 8000, polling: 50 }).catch(() => {});
  },

  async pinAt(page, lon, lat) {
    await this.still(page);
    for (let attempt = 0; attempt < 4; attempt++) {
      const p = await page.evaluate(ll => window.__smokeMap.pinPoint(ll[0], ll[1]), [lon, lat]);
      if (p.free) {
        await this.tapAt(page, p.x, p.y);
        return;
      }
      // Behind the globe, near its edge or under a control: turn the place to the middle
      await page.evaluate(ll => window.__smokeMap.aimAt(ll[0], ll[1]), [lon, lat]);
      await page.waitForTimeout(150);
    }
    throw new Error('map adapter: could not reach ' + lon + ', ' + lat + ' with a click');
  },

  async pinFarFrom(page, lon, lat) {
    await this.still(page);
    await this.resetView(page);
    const p = await page.evaluate(ll => window.__smokeMap.farPoint(ll[0], ll[1]), [lon, lat]);
    if (!p) throw new Error('map adapter: no clickable spot found on the globe');
    await this.tapAt(page, p.x, p.y);
    return { lon: p.lon, lat: p.lat, km: p.km };
  }
};

/* =====================================================================
 * HUD CONTRACT — the few non-map elements the suite touches by selector
 * (screens by id, plus these). Keep them, or update this block.
 * ===================================================================== */

const HUD = {
  // "Leave by the back control": the first of these that is visible is clicked
  back: ['#back-btn', '#game-screen [data-action="back"]', '#game-screen .gamebar-back', '#game-screen button[aria-label="Back"]'],
  // States -> Capitals: the four answer buttons (text or data-capital is the capital)
  choices: '#choices-panel button',
  // Home shows today's Daily Five as played / still to play
  dailyPlayed: '#menu-screen .daily-done, #menu-screen [data-daily="played"]',
  dailyUnplayed: '#menu-screen .daily-fresh, #menu-screen [data-daily="unplayed"]',
  // Before the level sheet: a deep link to a province level, or to a level with a saved focus
  // list, stops at a chooser. The suite takes "fresh game" there.
  legacyChooserFresh: '#focus-modal-overlay.show #focus-choice-fresh',
  // Controls that count toward "the menu has rendered"
  menuControls: '#menu-screen button, #menu-screen a[href], #menu-screen [role="button"]'
};

/* =====================================================================
 * TEST DATA
 * ===================================================================== */

// Pin the City gazetteer: city -> [lon, lat], the coordinates the game scores against
const PIN_CITIES = {
  // Africa
  'Cairo': [31.2357, 30.0444], 'Lagos': [3.3792, 6.5244], 'Kinshasa': [15.2663, -4.4419], 'Johannesburg': [28.0473, -26.2041],
  'Luanda': [13.2894, -8.839], 'Dar es Salaam': [39.2083, -6.7924], 'Khartoum': [32.5599, 15.5007], 'Abidjan': [-4.0083, 5.36],
  'Alexandria': [29.9187, 31.2001], 'Nairobi': [36.8219, -1.2921], 'Addis Ababa': [38.74, 9.03], 'Casablanca': [-7.5898, 33.5731],
  'Cape Town': [18.4241, -33.9249], 'Accra': [-0.187, 5.6037], 'Algiers': [3.0588, 36.7538], 'Dakar': [-17.4677, 14.7167],
  'Tripoli': [13.1913, 32.8872], 'Tunis': [10.1815, 36.8065], 'Kampala': [32.5825, 0.3476], 'Antananarivo': [47.5079, -18.8792],
  // Asia
  'Tokyo': [139.6503, 35.6762], 'Delhi': [77.209, 28.6139], 'Shanghai': [121.4737, 31.2304], 'Beijing': [116.4074, 39.9042],
  'Mumbai': [72.8777, 19.076], 'Dhaka': [90.4125, 23.8103], 'Karachi': [67.0011, 24.8607], 'Istanbul': [28.9784, 41.0082],
  'Seoul': [126.978, 37.5665], 'Jakarta': [106.8456, -6.2088], 'Manila': [120.9842, 14.5995], 'Bangkok': [100.5018, 13.7563],
  'Ho Chi Minh City': [106.6297, 10.8231], 'Tehran': [51.389, 35.6892], 'Kolkata': [88.3639, 22.5726], 'Guangzhou': [113.2644, 23.1291],
  'Singapore': [103.8198, 1.3521], 'Riyadh': [46.6753, 24.7136], 'Baghdad': [44.3661, 33.3152], 'Dubai': [55.2708, 25.2048],
  // Europe
  'Moscow': [37.6173, 55.7558], 'London': [-0.1278, 51.5074], 'Paris': [2.3522, 48.8566], 'Madrid': [-3.7038, 40.4168],
  'Berlin': [13.405, 52.52], 'Rome': [12.4964, 41.9028], 'Saint Petersburg': [30.3609, 59.9311], 'Barcelona': [2.1686, 41.3874],
  'Kyiv': [30.5234, 50.4501], 'Milan': [9.19, 45.4642], 'Vienna': [16.3738, 48.2082], 'Warsaw': [21.0122, 52.2297],
  'Budapest': [19.0402, 47.4979], 'Bucharest': [26.1025, 44.4268], 'Munich': [11.582, 48.1351], 'Prague': [14.4378, 50.0755],
  'Amsterdam': [4.9041, 52.3676], 'Stockholm': [18.0686, 59.3293], 'Athens': [23.7275, 37.9838], 'Lisbon': [-9.1393, 38.7223],
  // North America
  'Mexico City': [-99.1332, 19.4326], 'New York': [-74.006, 40.7128], 'Los Angeles': [-118.2437, 34.0522], 'Toronto': [-79.3832, 43.6532],
  'Chicago': [-87.6298, 41.8781], 'Houston': [-95.3698, 29.7604], 'Havana': [-82.3666, 23.1136], 'Montreal': [-73.5673, 45.5017],
  'Guadalajara': [-103.3496, 20.6597], 'Monterrey': [-100.3161, 25.6866], 'Washington, D.C.': [-77.0369, 38.9072], 'Phoenix': [-112.074, 33.4484],
  'Guatemala City': [-90.5069, 14.6349], 'Santo Domingo': [-69.9312, 18.4861], 'Vancouver': [-123.1207, 49.2827], 'Miami': [-80.1918, 25.7617],
  'Dallas': [-96.797, 32.7767], 'San Francisco': [-122.4194, 37.7749], 'Panama City': [-79.5199, 8.9824], 'Seattle': [-122.3321, 47.6062],
  // South America
  'São Paulo': [-46.6333, -23.5505], 'Buenos Aires': [-58.3816, -34.6037], 'Rio de Janeiro': [-43.1729, -22.9068], 'Lima': [-77.0428, -12.0464],
  'Bogotá': [-74.0721, 4.711], 'Santiago': [-70.6693, -33.4489], 'Belo Horizonte': [-43.9345, -19.9167], 'Caracas': [-66.9036, 10.4806],
  'Brasília': [-47.8828, -15.7939], 'Salvador': [-38.5016, -12.9777], 'Fortaleza': [-38.5267, -3.7319], 'Medellín': [-75.5812, 6.2442],
  'Guayaquil': [-79.9224, -2.171], 'Quito': [-78.4678, -0.1807], 'Recife': [-34.877, -8.0476], 'Manaus': [-60.0217, -3.119],
  'Montevideo': [-56.1645, -34.9011], 'La Paz': [-68.1193, -16.4897], 'Asunción': [-57.5759, -25.2637], 'Córdoba': [-64.1888, -31.4201],
  // Oceania
  'Sydney': [151.2093, -33.8688], 'Melbourne': [144.9631, -37.8136], 'Brisbane': [153.0251, -27.4698], 'Perth': [115.8605, -31.9505],
  'Auckland': [174.7633, -36.8485], 'Adelaide': [138.6007, -34.9285], 'Gold Coast': [153.4, -28.0167], 'Canberra': [149.13, -35.2809],
  'Wellington': [174.7762, -41.2865], 'Christchurch': [172.6362, -43.5321], 'Hobart': [147.3272, -42.8821], 'Darwin': [130.8456, -12.4634],
  'Port Moresby': [147.1803, -9.4438], 'Suva': [178.4501, -18.1248], 'Newcastle': [151.7817, -32.9283], 'Townsville': [146.8169, -19.259],
  'Cairns': [145.7781, -16.9186], 'Nouméa': [166.458, -22.2758], 'Alice Springs': [133.8807, -23.698], 'Dunedin': [170.5028, -45.8788]
};

const US_CAPITALS = {
  'Alabama': 'Montgomery', 'Alaska': 'Juneau', 'Arizona': 'Phoenix', 'Arkansas': 'Little Rock',
  'California': 'Sacramento', 'Colorado': 'Denver', 'Connecticut': 'Hartford', 'Delaware': 'Dover',
  'Florida': 'Tallahassee', 'Georgia': 'Atlanta', 'Hawaii': 'Honolulu', 'Idaho': 'Boise',
  'Illinois': 'Springfield', 'Indiana': 'Indianapolis', 'Iowa': 'Des Moines', 'Kansas': 'Topeka',
  'Kentucky': 'Frankfort', 'Louisiana': 'Baton Rouge', 'Maine': 'Augusta', 'Maryland': 'Annapolis',
  'Massachusetts': 'Boston', 'Michigan': 'Lansing', 'Minnesota': 'Saint Paul', 'Mississippi': 'Jackson',
  'Missouri': 'Jefferson City', 'Montana': 'Helena', 'Nebraska': 'Lincoln', 'Nevada': 'Carson City',
  'New Hampshire': 'Concord', 'New Jersey': 'Trenton', 'New Mexico': 'Santa Fe', 'New York': 'Albany',
  'North Carolina': 'Raleigh', 'North Dakota': 'Bismarck', 'Ohio': 'Columbus', 'Oklahoma': 'Oklahoma City',
  'Oregon': 'Salem', 'Pennsylvania': 'Harrisburg', 'Rhode Island': 'Providence', 'South Carolina': 'Columbia',
  'South Dakota': 'Pierre', 'Tennessee': 'Nashville', 'Texas': 'Austin', 'Utah': 'Salt Lake City',
  'Vermont': 'Montpelier', 'Virginia': 'Richmond', 'Washington': 'Olympia', 'West Virginia': 'Charleston',
  'Wisconsin': 'Madison', 'Wyoming': 'Cheyenne'
};

const CANADA_PROVINCES = [
  'Quebec', 'Yukon', 'Ontario', 'Nunavut', 'Alberta', 'Manitoba', 'Nova Scotia', 'Saskatchewan',
  'British Columbia', 'New Brunswick', 'Northwest Territories', 'Prince Edward Island', 'Newfoundland and Labrador'
];

// What startGame() takes for a slug when the hook has no LEVELS registry yet
const LEGACY_START_ARGS = {
  world: 'World', daily: 'daily-five', africa: 'Africa', asia: 'Asia', europe: 'Europe',
  'north-america': 'North America', 'south-america': 'South America', oceania: 'Oceania'
};

// The stores that hold a player's progress; nothing may write these by accident
const PROGRESS_KEYS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery'];

function utcDay(offsetDays) {
  return new Date(Date.now() + (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
}

// A returning player's localStorage as an older build wrote it (shapes: ui-inventory section 4.1)
function oldPlayerStore() {
  const now = Date.now();
  const day = 86400000;
  const puzzle = d => Math.floor((Date.parse(d + 'T00:00:00Z') - Date.parse('2026-04-26T00:00:00Z')) / day) + 1;
  const daily = (offset, countries, sequence, seconds, extra) => {
    const d = utcDay(offset);
    const score = sequence.reduce((a, b) => a + b, 0);
    const correct = sequence.filter(p => p > 0).length;
    return Object.assign({
      dateKey: d, puzzleNumber: puzzle(d), countries: countries, sequence: sequence, score: score,
      correct: correct, wrong: 5 - correct, total: 5, timeSeconds: seconds, hardMode: false,
      difficulty: 'normal', completedAt: Date.parse(d + 'T12:00:00Z')
    }, extra || {});
  };
  const attempts = {};
  [
    daily(0, ['Brazil', 'Egypt', 'Thailand', 'Zambia', 'Kyrgyzstan'], [2, 2, 1, 0, 2], 41),
    daily(-1, ['Canada', 'Spain', 'Peru', 'Laos', 'Togo'], [2, 2, 2, 2, 0], 38),
    daily(-2, ['India', 'Mexico', 'Kenya', 'Oman', 'Benin'], [2, 1, 2, 0, 0], 55, { hardMode: true, difficulty: 'hard' }),
    // From before the difficulty picker: hardMode only
    (function () { const a = daily(-9, ['China', 'France', 'Chile', 'Nepal', 'Gabon'], [2, 2, 2, 1, 1], 47); delete a.difficulty; return a; })()
  ].forEach(a => { attempts[a.dateKey] = a; });

  return {
    'atlas-records': {
      'world-country|World|normal': {
        gamesPlayed: 4, bestScore: { value: 301, max: 366, date: '2026-09-14' },
        bestAccuracy: { correct: 160, total: 183, pct: 87, date: '2026-09-14' }, lastPlayed: '2026-10-30'
      },
      'world-country|South America|normal': {
        gamesPlayed: 7, bestScore: { value: 26, max: 26, date: '2026-07-02' },
        bestTime: { value: 41, total: 13, date: '2026-08-19' },
        bestAccuracy: { correct: 13, total: 13, pct: 100, date: '2026-07-02' }, lastPlayed: '2026-10-11'
      },
      'world-country|Oceania|hard': {
        gamesPlayed: 3, bestScore: { value: 9, max: 12, date: '2026-10-02' },
        bestAccuracy: { correct: 5, total: 6, pct: 83, date: '2026-10-02' }, lastPlayed: '2026-10-05'
      },
      'world-country|Europe|uncharted': {
        gamesPlayed: 1, bestScore: { value: 51, max: 76, date: '2026-11-08' },
        bestAccuracy: { correct: 30, total: 38, pct: 79, date: '2026-11-08' }, lastPlayed: '2026-11-08'
      },
      'daily-five|Daily|normal': {
        gamesPlayed: 12, bestScore: { value: 10, max: 10, date: '2026-06-03' },
        bestTime: { value: 19, total: 5, date: '2026-06-21' },
        bestAccuracy: { correct: 5, total: 5, pct: 100, date: '2026-06-03' }, lastPlayed: utcDay(0)
      },
      'us-state|The United States|normal': {
        gamesPlayed: 9, bestScore: { value: 97, max: 100, date: '2026-05-30' },
        bestAccuracy: { correct: 50, total: 50, pct: 100, date: '2026-05-30' },
        bestTime: { value: 143, total: 50, date: '2026-05-30' }, lastPlayed: '2026-09-01'
      },
      'us-capital-to-state|US Capitals → States|normal': {
        gamesPlayed: 2, bestScore: { value: 71, max: 100, date: '2026-06-10' },
        bestAccuracy: { correct: 41, total: 50, pct: 82, date: '2026-06-10' }, lastPlayed: '2026-06-12'
      },
      'us-state-to-capital|US States → Capitals|hard': {
        gamesPlayed: 1, bestScore: { value: 64, max: 100, date: '2026-06-15' },
        bestAccuracy: { correct: 38, total: 50, pct: 76, date: '2026-06-15' }, lastPlayed: '2026-06-15'
      },
      'us-city|Northeast|normal': {
        gamesPlayed: 3, bestScore: { value: 58, max: 80, date: '2026-08-02' },
        bestAccuracy: { correct: 33, total: 40, pct: 83, date: '2026-08-02' }, lastPlayed: '2026-08-04'
      },
      'province|canada-provinces|normal': {
        gamesPlayed: 5, bestScore: { value: 26, max: 26, date: '2026-09-20' },
        bestTime: { value: 33, total: 13, date: '2026-09-22' },
        bestAccuracy: { correct: 13, total: 13, pct: 100, date: '2026-09-20' }, lastPlayed: '2026-09-22'
      },
      'province|russia-east|normal': {
        gamesPlayed: 1, bestScore: { value: 12, max: 54, date: '2026-09-25' },
        bestAccuracy: { correct: 9, total: 27, pct: 33, date: '2026-09-25' }, lastPlayed: '2026-09-25'
      },
      // Oddities a reader has to tolerate: a pre-mode two-part key and a zero-question entry
      'North America|normal': {
        gamesPlayed: 2, bestScore: { value: 40, max: 46, date: '2026-04-24' },
        bestAccuracy: { correct: 21, total: 23, pct: 91, date: '2026-04-24' }, lastPlayed: '2026-04-25'
      },
      'us-city|Midwest|normal': {
        gamesPlayed: 1, bestScore: { value: 0, max: 0, date: '2026-10-01' },
        bestAccuracy: { correct: 0, total: 0, pct: 0, date: '2026-10-01' }, lastPlayed: '2026-10-01'
      }
    },
    'atlas-focus': {
      'world-country|Oceania': { names: ['Vanuatu', 'Fiji'], total: 6, savedAt: now - 40 * day },
      'us-state|The United States': { names: ['Delaware', 'Rhode Island', 'Vermont'], total: 50, savedAt: now - 76 * day },
      'province|canada-provinces': { names: [], total: 13, savedAt: now - 55 * day }
    },
    'atlas-daily-attempts': attempts,
    'atlas-pin': {
      games: [
        { at: now - 30 * day, region: 'Europe', diff: 'normal', score: 1410, max: 2000, avgKm: 188 },
        { at: now - 29 * day, region: 'Europe', diff: 'normal', score: 1655, max: 2000, avgKm: 121 },
        { at: now - 12 * day, region: 'World', diff: 'hard', score: 820, max: 2000, avgKm: 911 },
        { at: now - 3 * day, region: 'Oceania', diff: 'uncharted', score: 0, max: 2000, avgKm: null }
      ],
      cities: {
        'Paris': [[now - 30 * day, 96], [now - 29 * day, 12]],
        'Moscow': [[now - 30 * day, 402], [now - 29 * day, 210], [now - 12 * day, null]],
        'Lisbon': [[now - 29 * day, 31]],
        'Sydney': [[now - 3 * day, null]]
      }
    },
    'atlas-learn': {
      'canada-provinces': { order: CANADA_PROVINCES.slice(), level: 5, savedAt: now - 20 * day }
    },
    // An install from before the three-way difficulty picker: only the legacy flag
    'atlas-hard-mode': 'true',
    'atlas-map-style': 'parchment'
  };
}

/* =====================================================================
 * HELPERS (map-agnostic)
 * ===================================================================== */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const opt = { only: null, root: null, shots: null, mobile: false, patchHook: false, list: false, verbose: false, stockGpu: false };
  for (const a of argv) {
    if (a.startsWith('--only=')) opt.only = a.slice(7).split(',').map(s => s.trim()).filter(Boolean);
    else if (a.startsWith('--root=')) opt.root = path.resolve(a.slice(7));
    else if (a.startsWith('--shots=')) opt.shots = path.resolve(a.slice(8));
    else if (a === '--mobile') opt.mobile = true;
    else if (a === '--patch-hook') opt.patchHook = true;
    else if (a === '--list') opt.list = true;
    else if (a === '--verbose' || a === '-v') opt.verbose = true;
    else if (a === '--stock-gpu') opt.stockGpu = true;
    else { console.error('Unknown option: ' + a); process.exit(2); }
  }
  return opt;
}

// Progress lines for --verbose, stamped with seconds since the run began
const T0 = Date.now();
function log(msg) {
  if (OPT.verbose) console.log('      . ' + ((Date.now() - T0) / 1000).toFixed(2).padStart(7) + '  ' + msg);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

class HookMissing extends Error {}
class Skip extends Error {}

const HOOK_HELP = 'window.__atlas is missing: the app must expose the test hook ' +
  '(window.__atlas = { state, mastery, LEVELS, startGame, version } at the end of its script, PLAN.md section 6). ' +
  'To test a build from before the hook, run with --patch-hook.';

// One check's soft assertions, notes and browser sessions
class Check {
  constructor(name) {
    this.name = name;
    this.fails = [];
    this.notes = [];
    this.sessions = [];
  }
  ok(cond, msg) {
    if (!cond) this.fails.push(msg);
    return !!cond;
  }
  eq(actual, expected, what) {
    return this.ok(same(actual, expected), what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
  note(msg) {
    this.notes.push(msg);
  }

  // A fresh browser (own localStorage) on the app. opts: { seed, tiles }
  async open(opts) {
    opts = opts || {};
    const h = await launch({
      root: OPT.root || undefined, mobile: OPT.mobile, dpr: OPT.mobile ? 2 : 1, width: 1280, height: 800,
      tiles: opts.tiles || 'mock', seedStorage: opts.seed
    });
    await MapAdapter.install(h.context);
    const sess = { page: h.page, url: h.url, netLog: h.netLog, log: [], close: h.close, label: opts.label || '' };
    h.page.on('pageerror', e => sess.log.push({ kind: 'page error', text: e.message, url: '' }));
    h.page.on('console', m => {
      if (m.type() === 'error') sess.log.push({ kind: 'console error', text: m.text(), url: (m.location() || {}).url || '' });
    });
    h.page.on('dialog', d => {
      sess.log.push({ kind: 'dialog', text: d.message(), url: '' });
      d.dismiss().catch(() => {});
    });
    this.sessions.push(sess);
    return sess;
  }

  // Fails the check for every page error, console error or alert a session collected
  checkErrors(sess) {
    const seen = new Set();
    unexpectedErrors(sess).forEach(e => {
      const line = e.kind + (sess.label ? ' (' + sess.label + ')' : '') + ': ' + e.text;
      if (!seen.has(line)) this.fails.push(line);
      seen.add(line);
    });
    sess.log.length = 0;
  }
}

// Errors that are the app's doing. A resource that failed on a host the sandbox cannot reach
// (fonts; imagery when tiles are made to fail) is not.
function unexpectedErrors(sess) {
  return sess.log.filter(e => {
    if (e.kind === 'console error' && /Failed to load resource/i.test(e.text) &&
        e.url && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(e.url)) return false;
    return true;
  });
}

// The slice of game state the suite reads, plus which screen is showing
function readStateInPage() {
  const a = window.__atlas;
  if (!a || !a.state) return null;
  const s = a.state;
  const active = id => {
    const el = document.getElementById(id);
    return !!el && el.classList.contains('active');
  };
  return {
    screen: active('game-screen') ? 'game' : active('results-screen') ? 'results' : active('menu-screen') ? 'menu' : 'other',
    mode: s.gameMode, region: s.currentContinent, startArg: s.startArg,
    current: s.current, queue: s.queue.slice(), total: s.totalQuestions,
    attempts: s.attempts, correct: s.correct, wrong: s.wrong, score: s.score,
    missed: s.missed.slice(), secondTry: s.secondTry.slice(), sequence: s.sequence.slice(),
    locked: !!s.interactionLocked, practice: !!s.practice, dailyReplay: !!s.dailyReplay,
    difficulty: s.difficulty, hardMode: !!s.hardMode, mapStyle: s.mapStyle,
    learn: s.learn ? { level: s.learn.level, phase: s.learn.phase, restarts: s.learn.restarts, order: s.learn.order.slice() } : null,
    pin: s.pin ? {
      phase: s.pin.phase, hasGuess: !!s.pin.guess,
      results: s.pin.results.map(r => ({ name: r.name, km: r.km, pts: r.pts }))
    } : null
  };
}

async function snap(page) {
  try {
    return await page.evaluate(readStateInPage);
  } catch (e) {
    return null;   // mid-navigation
  }
}

function brief(st) {
  if (!st) return 'no game state (hook missing or page still loading)';
  return 'screen=' + st.screen + ' mode=' + st.mode + ' region=' + st.region + ' current=' + JSON.stringify(st.current) +
    ' answered=' + st.sequence.length + '/' + st.total + ' queue=' + st.queue.length + ' locked=' + st.locked +
    (st.learn ? ' learn=L' + st.learn.level + '/' + st.learn.phase + '/restarts ' + st.learn.restarts : '') +
    (st.pin ? ' pin=' + st.pin.phase + '/' + st.pin.results.length : '');
}

// Polls the game state until pred(state) holds
async function waitState(page, pred, what, timeout) {
  timeout = timeout || 8000;
  const t0 = Date.now();
  for (;;) {
    const st = await snap(page);
    if (st && pred(st)) return st;
    if (Date.now() - t0 > timeout) {
      throw new Error('timed out after ' + timeout + ' ms waiting for ' + what + ' [' + brief(st) + ']');
    }
    await sleep(25);
  }
}

async function requireHook(page) {
  try {
    await page.waitForFunction(() => !!(window.__atlas && window.__atlas.state), null, { timeout: 8000, polling: 50 });
  } catch (e) {
    throw new HookMissing(HOOK_HELP);
  }
}

// The menu is on screen with its controls drawn
function menuReadyInPage(sel) {
  const menu = document.getElementById('menu-screen');
  return !!menu && menu.classList.contains('active') && document.querySelectorAll(sel).length >= 8;
}

async function waitMenu(page, timeout) {
  await page.waitForFunction(menuReadyInPage, HUD.menuControls, { timeout: timeout || 20000, polling: 'raf' });
}

async function getStore(page, key) {
  const raw = await page.evaluate(k => localStorage.getItem(k), key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

const getRaw = (page, key) => page.evaluate(k => localStorage.getItem(k), key);

async function progressSnapshot(page) {
  return page.evaluate(keys => {
    const out = {};
    keys.forEach(k => { out[k] = localStorage.getItem(k); });
    return out;
  }, PROGRESS_KEYS);
}

// Click or tap a control
async function press(locator) {
  if (OPT.mobile) await locator.tap();
  else await locator.click();
}

async function pressFirstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() && await loc.isVisible()) {
      await press(loc);
      return sel;
    }
  }
  return null;
}

// True once a round's first question is up (or, for Learn, its first study screen)
function roundReady(st, learn) {
  if (!st || st.screen !== 'game') return false;
  if (learn) return !!st.learn && st.learn.phase === 'study' && st.total === st.learn.level;
  if (st.learn || !st.current || st.locked || st.sequence.length !== 0) return false;
  if (st.queue.length !== st.total - 1) return false;
  return !st.pin || (st.pin.phase === 'aim' && st.pin.results.length === 0);
}

// Waits for a round that is starting (deep link or hook) to show its first question
async function waitRound(sess, what, opts) {
  opts = opts || {};
  const t0 = Date.now();
  for (;;) {
    const st = await snap(sess.page);
    if (roundReady(st, opts.learn)) {
      await MapAdapter.ready(sess.page);
      return st;
    }
    // Legacy chooser in front of the round: take the fresh game
    if (!opts.noChooser) {
      const fresh = sess.page.locator(HUD.legacyChooserFresh);
      if (await fresh.count() && await fresh.isVisible()) {
        log('chooser shown, taking the fresh game');
        await press(fresh);
      }
    }
    if (Date.now() - t0 > 20000) throw new Error(what + ' did not start a round within 20 s [' + brief(st) + ']');
    await sleep(30);
  }
}

// Opens a level by its deep link and waits for the first question
async function openLevel(sess, slug, opts) {
  opts = opts || {};
  const link = '?play=' + slug + (opts.learn ? '&learn=1' : '');
  log('open ' + link);
  await sess.page.goto(sess.url + link, { waitUntil: 'domcontentloaded' });
  await requireHook(sess.page);
  return waitRound(sess, link, opts);
}

// Starts a round through the hook, without a page load. opts go to startGame (e.g. { practice })
async function hookStart(page, slug, opts) {
  return page.evaluate(args => {
    const a = window.__atlas;
    const level = a.LEVELS && a.LEVELS.find(l => l.key === args.slug);
    const arg = level ? level.arg : (args.legacy[args.slug] || args.slug);
    a.startGame(arg, args.opts || undefined);
    return arg;
  }, { slug: slug, opts: opts || null, legacy: LEGACY_START_ARGS });
}

// States -> Capitals: press the right capital, or a wrong one that is still enabled
async function chooseCapital(page, stateName, right) {
  const capital = US_CAPITALS[stateName];
  if (!capital) throw new Error('no capital on file for "' + stateName + '"');
  const index = await page.evaluate(args => {
    const buttons = Array.from(document.querySelectorAll(args.sel));
    return buttons.findIndex(b => {
      const label = b.getAttribute('data-capital') || b.textContent.trim();
      const isRight = label === args.capital || b.textContent.indexOf(args.capital) !== -1;
      return args.right ? isRight : (!isRight && !b.disabled);
    });
  }, { sel: HUD.choices, capital: capital, right: right });
  if (index < 0) throw new Error('no ' + (right ? 'correct' : 'wrong') + ' capital button found for ' + stateName + ' (' + HUD.choices + ')');
  await press(page.locator(HUD.choices).nth(index));
  return right ? capital : 'a wrong capital';
}

// One tap on the right answer, or on a wrong one, through whatever input the mode uses
async function tapAnswer(sess, st, right, skipNames) {
  if (st.mode === 'us-state-to-capital') return chooseCapital(sess.page, st.current, right);
  if (right) return MapAdapter.answer(sess.page, st.current);
  return MapAdapter.answerWrong(sess.page, skipNames);
}

const POINTS = { right: 2, second: 1, miss: 0, skip: 0 };

// Answers the question on screen. how: 'right' | 'second' (one wrong tap, then right) |
// 'miss' (two wrong taps) | 'skip'. Resolves once the outcome is recorded: { name, how, points }
async function answerQuestion(sess, how) {
  const page = sess.page;
  const before = await snap(page);
  if (!before || before.screen !== 'game' || !before.current) throw new Error('no question on screen [' + brief(before) + ']');
  const name = before.current;
  const n = before.sequence.length;
  log(how + ': ' + name);

  // Tap, and tap once more somewhere else if the first tap did not register
  const tapUntil = async (right, done, skipNames, what) => {
    let tapped = await tapAnswer(sess, before, right, skipNames);
    try {
      return [tapped, await waitState(page, done, what, 1500)];
    } catch (e) {
      sess.retries = (sess.retries || 0) + 1;
      RUN.retries++;
      log('tap on ' + tapped + ' did not register, trying once more');
      tapped = await tapAnswer(sess, before, right, (skipNames || []).concat(right ? [] : [tapped]));
      return [tapped, await waitState(page, done, what, 2500)];
    }
  };

  if (how === 'skip') {
    await page.keyboard.press('s');
  } else {
    if (how === 'second' || how === 'miss') {
      const first = await tapUntil(false, s => s.attempts >= 1 || s.sequence.length > n, [], 'the first wrong tap to count');
      if (how === 'miss') {
        await tapUntil(false, s => s.sequence.length > n, [first[0]], 'the second wrong tap to end the question');
      }
    }
    if (how !== 'miss') {
      await tapUntil(true, s => s.sequence.length > n, [], 'the answer "' + name + '" to register');
    }
  }
  const after = await waitState(page, s => s.sequence.length === n + 1, how + ' on "' + name + '" to be recorded', 3000);
  const points = after.sequence[n];
  if (points !== POINTS[how]) {
    throw new Error(how + ' on "' + name + '" was recorded as ' + points + ' point(s), expected ' + POINTS[how] +
      ' (the game scored it differently, or a tap landed on another item than intended)');
  }
  return { name: name, how: how, points: points, queueBefore: before.queue.length };
}

// After an answer: the next question, or the end of the round
async function waitNextQuestion(sess, answered) {
  return waitState(sess.page, s => s.screen !== 'game' ||
    (!!s.current && !s.locked && s.queue.length === answered.queueBefore - 1 && s.current !== answered.name),
    'the question after "' + answered.name + '"', 9000);
}

// Plays a found/missed round: how(i) gives the way to answer question i. Stops at `limit`
// questions or when the round ends. Resolves to { asked: [{ name, how, points }], state }
async function playRound(sess, opts) {
  opts = opts || {};
  const how = opts.how || (() => 'right');
  const limit = opts.limit || Infinity;
  const asked = [];
  let st = await snap(sess.page);
  while (asked.length < limit && st.screen === 'game') {
    const a = await answerQuestion(sess, how(asked.length, st));
    asked.push(a);
    st = await waitNextQuestion(sess, a);
  }
  return { asked: asked, state: st };
}

// The live mastery store as plain data, or null when the build has none
async function masteryDump(page, names) {
  return page.evaluate(list => {
    const m = window.__atlas && window.__atlas.mastery;
    if (!m) return null;
    const act = m.activity(1);
    const out = {
      skills: m.skills(), today: act[act.length - 1] || null, totals: m.totals(), items: {},
      stored: localStorage.getItem('atlas-mastery') != null
    };
    out.skills.forEach(skill => {
      out.items[skill] = {};
      list.forEach(name => {
        const it = m.get(skill, name);
        if (it && it.seen) out.items[skill][name] = { seen: it.seen, first: it.first, second: it.second, missed: it.missed };
      });
    });
    return out;
  }, names);
}

/* =====================================================================
 * SCENARIOS — rounds whose results more than one check reads
 * ===================================================================== */

const RUN = { retries: 0, hook: null, shared: {} };

// A small continent answered perfectly
async function scenarioPerfect(t) {
  const sess = await t.open();
  const start = await openLevel(sess, 'south-america');
  const total = start.total;
  const round = await playRound(sess);
  const end = round.state;
  const out = {
    total: total, names: round.asked.map(a => a.name), end: end,
    records: await getStore(sess.page, 'atlas-records'), focus: await getStore(sess.page, 'atlas-focus'),
    mastery: await masteryDump(sess.page, round.asked.map(a => a.name))
  };
  t.checkErrors(sess);
  RUN.shared.perfect = out;
  return out;
}

// A round with a second-try answer, a double miss and a skip, then a focus round over what it left
async function scenarioMixed(t) {
  const sess = await t.open();
  const page = sess.page;
  const start = await openLevel(sess, 'oceania');
  const plan = ['second', 'miss', 'skip'];
  const round = await playRound(sess, { how: i => plan[i] || 'right' });
  const out = {
    total: start.total, asked: round.asked, end: round.state,
    records: await getStore(page, 'atlas-records'), recordsRaw: await getRaw(page, 'atlas-records'),
    focus: await getStore(page, 'atlas-focus'), focusRaw: await getRaw(page, 'atlas-focus'),
    masteryFull: await masteryDump(page, round.asked.map(a => a.name))
  };
  RUN.shared.mixed = out;
  if (round.state.screen !== 'results') return out;

  // Focus practice over the saved list, started the way Smart Review and "Practice these" do
  const focusEntry = out.focus && out.focus['world-country|Oceania'];
  const names = focusEntry && Array.isArray(focusEntry.names) ? focusEntry.names : [];
  if (names.length) {
    await page.evaluate(list => {
      const a = window.__atlas;
      a.startGame(a.state.startArg, { practice: list });
    }, names);
    const pStart = await waitRound(sess, 'the focus practice round', { noChooser: true });
    const pRound = await playRound(sess);
    out.practice = {
      start: pStart, asked: pRound.asked, end: pRound.state,
      recordsRaw: await getRaw(page, 'atlas-records'), focusRaw: await getRaw(page, 'atlas-focus'),
      mastery: await masteryDump(page, round.asked.map(a => a.name))
    };
  }
  t.checkErrors(sess);
  return out;
}

// Canada in full, then the first two rungs of its Learn ladder with one deliberate miss
async function scenarioProvinces(t) {
  const sess = await t.open();
  const page = sess.page;
  const start = await openLevel(sess, 'canada-provinces');
  const round = await playRound(sess);
  const names = round.asked.map(a => a.name);
  const out = {
    start: start, asked: round.asked, end: round.state,
    records: await getStore(page, 'atlas-records'), recordsRaw: await getRaw(page, 'atlas-records'),
    focusRaw: await getRaw(page, 'atlas-focus'),
    masteryFull: await masteryDump(page, names)
  };
  RUN.shared.provinces = out;

  const learn = { steps: [] };
  out.learn = learn;
  const study = level => waitState(page, s => !!s.learn && s.learn.phase === 'study' && s.learn.level === level && s.total === level,
    'Learn level ' + level + ' study screen', 9000);
  const quiz = async () => {
    await page.keyboard.press('Enter');
    return waitState(page, s => !!s.learn && s.learn.phase === 'quiz' && !!s.current && !s.locked, 'the Learn quiz to begin', 4000);
  };

  let st = await openLevel(sess, 'canada-provinces', { learn: true });
  learn.first = st;
  // Level 1: one province
  st = await quiz();
  learn.level1Quiz = st;
  await answerQuestion(sess, 'right');
  st = await study(2);
  learn.steps.push('level 1 cleared');
  // Level 2: miss the first question on purpose (one wrong tap restarts the level)
  st = await quiz();
  learn.level2Quiz = st;
  const n = st.sequence.length;
  const wrong = await MapAdapter.answerWrong(page);
  log('deliberate Learn miss: tapped ' + wrong + ' for ' + st.current);
  await waitState(page, s => s.sequence.length === n + 1, 'one wrong tap in a Learn quiz to count as a miss (Learn gives no second try)', 3000);
  st = await waitState(page, s => !!s.learn && s.learn.phase === 'study' && s.learn.restarts === 1 && s.total === s.learn.level,
    'the miss to send Learn back to the study screen', 9000);
  learn.afterMiss = st;
  learn.steps.push('level 2 restarted after a miss');
  // Level 2 again, cleanly
  st = await quiz();
  let a = await answerQuestion(sess, 'right');
  st = await waitNextQuestion(sess, a);
  await answerQuestion(sess, 'right');
  st = await study(3);
  learn.end = st;
  learn.steps.push('level 2 cleared');
  learn.store = await getStore(page, 'atlas-learn');
  learn.recordsRaw = await getRaw(page, 'atlas-records');
  learn.focusRaw = await getRaw(page, 'atlas-focus');
  learn.mastery = await masteryDump(page, names);
  t.checkErrors(sess);
  return out;
}

/* =====================================================================
 * CHECKS
 * ===================================================================== */

const CHECKS = [];
const check = (name, title, fn) => CHECKS.push({ name: name, title: title, fn: fn });

check('boot', 'page loads cleanly, menu renders', async t => {
  const sess = await t.open();
  const page = sess.page;
  const tti = async () => {
    await page.goto(sess.url, { waitUntil: 'commit' });
    await waitMenu(page);
    return page.evaluate(() => Math.round(performance.now()));
  };
  const cold = await tti();
  const hook = await page.evaluate(() => {
    const a = window.__atlas;
    return a ? { state: !!a.state, startGame: typeof a.startGame === 'function', version: a.version } : null;
  });
  t.ok(hook, HOOK_HELP);
  if (hook) {
    t.ok(hook.state, 'window.__atlas.state is missing');
    t.ok(hook.startGame, 'window.__atlas.startGame is not a function');
  }
  const screens = await page.evaluate(() => ['menu-screen', 'game-screen', 'results-screen'].filter(id => !document.getElementById(id)));
  t.eq(screens, [], 'screen elements missing from the page');
  await page.waitForTimeout(300);   // let late errors (data parsing, first render) surface
  t.checkErrors(sess);
  const warm = await tti();
  t.checkErrors(sess);
  if (sess.netLog.blocked.length) {
    t.note('requests to hosts the sandbox does not serve: ' + Array.from(new Set(sess.netLog.blocked)).slice(0, 4).join(', '));
  }
  t.note('time to interactive ' + cold + ' ms (first load), ' + warm + ' ms (reload)');
});

check('continent-perfect', 'a continent answered perfectly: results, record, clean-sweep time', async t => {
  const r = await scenarioPerfect(t);
  const end = r.end;
  t.ok(r.total >= 10 && r.total <= 14, 'South America should have 12-13 countries, the round had ' + r.total);
  t.eq(end.screen, 'results', 'screen after the last answer');
  t.eq(end.sequence, r.names.map(() => 2), 'points per question');
  t.eq([end.score, end.correct, end.wrong], [r.total * 2, r.total, 0], 'score / found / missed');
  t.eq(new Set(r.names).size, r.total, 'distinct countries asked');
  const rec = r.records && r.records['world-country|South America|normal'];
  if (t.ok(rec, 'atlas-records has no "world-country|South America|normal" entry (keys: ' + Object.keys(r.records || {}).join(', ') + ')')) {
    t.eq(rec.gamesPlayed, 1, 'gamesPlayed');
    t.eq([rec.bestScore && rec.bestScore.value, rec.bestScore && rec.bestScore.max], [r.total * 2, r.total * 2], 'bestScore value / max');
    t.eq([rec.bestAccuracy && rec.bestAccuracy.correct, rec.bestAccuracy && rec.bestAccuracy.pct], [r.total, 100], 'bestAccuracy correct / pct');
    t.ok(rec.bestTime && typeof rec.bestTime.value === 'number' && rec.bestTime.value >= 0 && rec.bestTime.value < 120,
      'a clean sweep must store bestTime in seconds, got ' + JSON.stringify(rec.bestTime));
    t.eq(rec.bestTime && rec.bestTime.total, r.total, 'bestTime.total');
    t.eq(rec.lastPlayed, utcDay(0), 'lastPlayed');
  }
  t.eq(Object.keys(r.records || {}), ['world-country|South America|normal'], 'records written by one round');
  const focus = r.focus && r.focus['world-country|South America'];
  if (focus) t.eq(focus.names, [], 'focus list after a perfect round');
});

check('wrong-and-skip', 'second tries, misses and skips are counted; focus list; focus practice leaves records alone', async t => {
  const r = await scenarioMixed(t);
  const end = r.end;
  const by = how => r.asked.filter(a => a.how === how).map(a => a.name);
  const missed = by('miss').concat(by('skip'));
  const second = by('second');
  t.eq(end.screen, 'results', 'screen after the last answer');
  t.ok(r.total >= 6 && r.total <= 8, 'Oceania should have 6-7 countries, the round had ' + r.total);
  t.eq(end.sequence, r.asked.map(a => POINTS[a.how]), 'points per question');
  t.eq(end.secondTry, second, 'second-try names in game state');
  t.eq(end.missed, missed, 'missed names in game state (a double miss, then a skip)');
  t.eq([end.score, end.correct, end.wrong], [(r.total - 3) * 2 + 1, r.total - 2, 2], 'score / found / missed');
  const rec = r.records && r.records['world-country|Oceania|normal'];
  if (t.ok(rec, 'atlas-records has no "world-country|Oceania|normal" entry')) {
    t.eq(rec.bestScore && rec.bestScore.value, (r.total - 3) * 2 + 1, 'bestScore.value');
    t.eq([rec.bestAccuracy && rec.bestAccuracy.correct, rec.bestAccuracy && rec.bestAccuracy.total], [r.total - 2, r.total], 'bestAccuracy correct / total');
    t.ok(!rec.bestTime, 'a round with misses must not store a clean-sweep time, got ' + JSON.stringify(rec.bestTime));
  }
  const focus = r.focus && r.focus['world-country|Oceania'];
  if (t.ok(focus, 'atlas-focus has no "world-country|Oceania" entry')) {
    t.eq(focus.names, missed.concat(second), 'focus list (missed first, then second tries)');
    t.eq(focus.total, r.total, 'focus list total');
  }
  const p = r.practice;
  if (t.ok(p, 'the focus practice round did not run')) {
    t.ok(p.start.practice, 'state.practice should be true in a focus round');
    t.eq(p.start.total, 3, 'questions in the focus round');
    t.eq(p.asked.map(a => a.name).sort(), missed.concat(second).sort(), 'names asked in the focus round');
    t.eq(p.end.screen, 'results', 'screen after the focus round');
    t.ok(p.recordsRaw === r.recordsRaw, 'a focus practice round changed atlas-records: ' + r.recordsRaw + ' -> ' + p.recordsRaw);
    t.ok(p.focusRaw === r.focusRaw, 'a focus practice round rewrote atlas-focus: ' + r.focusRaw + ' -> ' + p.focusRaw);
  }
});

check('world', 'The World starts, takes five answers, and the back control leaves it', async t => {
  const sess = await t.open();
  const page = sess.page;
  const start = await openLevel(sess, 'world');
  t.ok(start.total >= 150, 'The World should ask 150+ countries, got ' + start.total);
  t.eq(start.mode, 'world-country', 'game mode');
  const round = await playRound(sess, { limit: 5 });
  t.eq(round.state.sequence, [2, 2, 2, 2, 2], 'points after five right answers');
  t.eq(round.state.screen, 'game', 'screen after five answers');
  const used = await pressFirstVisible(page, HUD.back);
  if (t.ok(used, 'no back control found on the game screen (tried ' + HUD.back.join(', ') + ')')) {
    const st = await waitState(page, s => s.screen === 'menu', 'the menu after pressing ' + used, 4000).catch(e => null);
    t.ok(st, 'pressing ' + used + ' did not return to the menu');
  }
  const stores = await progressSnapshot(page);
  t.eq([stores['atlas-records'], stores['atlas-focus']], [null, null], 'an abandoned round must not write records or a focus list');
  await page.waitForTimeout(200);
  t.checkErrors(sess);
});

check('us-modes', 'US States, States -> Capitals, Capitals -> States and a Cities region: five questions each', async t => {
  const sess = await t.open();
  const page = sess.page;
  const levels = [
    ['us-state', 'us-state'], ['us-state-to-capital', 'us-state-to-capital'],
    ['us-capital-to-state', 'us-capital-to-state'], ['northeast-cities', 'us-city']
  ];
  const dumps = {};
  for (const [slug, mode] of levels) {
    const start = await openLevel(sess, slug);
    t.eq(start.mode, mode, slug + ': game mode');
    t.ok(start.total >= 10, slug + ': expected a full level, got ' + start.total + ' questions');
    // One wrong tap first (so question 1 is a second-try answer), then four right
    const round = await playRound(sess, { limit: 5, how: i => (i === 0 ? 'second' : 'right') });
    const st = round.state;
    t.eq(st.sequence, [1, 2, 2, 2, 2], slug + ': points per question');
    t.eq([st.score, st.correct, st.wrong], [9, 5, 0], slug + ': score / found / missed');
    t.eq(st.secondTry, [round.asked[0].name], slug + ': second-try names');
    dumps[slug] = { asked: round.asked, mastery: await masteryDump(page, round.asked.map(a => a.name)) };
    await page.keyboard.press('Escape');
    const left = await waitState(page, s => s.screen === 'menu', 'the menu after Escape', 4000).catch(e => null);
    t.ok(left, slug + ': Escape did not leave the round');
    t.checkErrors(sess);
  }
  t.eq(await getRaw(page, 'atlas-records'), null, 'abandoned rounds must not write atlas-records');
  RUN.shared.us = dumps;
});

check('provinces-learn', 'Canada played in full; Learn ladder levels 1-2 with a miss that restarts a level', async t => {
  const r = await scenarioProvinces(t);
  t.eq(r.start.mode, 'province', 'game mode');
  t.eq(r.start.total, 13, 'provinces and territories of Canada');
  t.eq(r.end.screen, 'results', 'screen after the last province');
  t.eq(r.end.sequence, r.asked.map(() => 2), 'points per question');
  const rec = r.records && r.records['province|canada-provinces|normal'];
  if (t.ok(rec, 'atlas-records has no "province|canada-provinces|normal" entry')) {
    t.eq([rec.bestScore && rec.bestScore.value, rec.bestScore && rec.bestScore.max], [26, 26], 'bestScore value / max');
    t.ok(rec.bestTime && typeof rec.bestTime.value === 'number', 'a clean sweep must store bestTime, got ' + JSON.stringify(rec.bestTime));
  }
  const L = r.learn;
  if (!t.ok(L && L.end, 'Learn mode did not get through its first two levels (' + ((L && L.steps) || []).join('; ') + ')')) return;
  t.eq([L.first.learn.level, L.first.learn.phase], [1, 'study'], 'Learn opens on level 1, study');
  t.eq(L.first.learn.order.slice().sort(), r.asked.map(a => a.name).sort(), 'Learn ladder covers the same 13 names');
  t.eq([L.level1Quiz.total, L.level1Quiz.current], [1, L.first.learn.order[0]], 'level 1 quiz asks the first name of the ladder');
  t.eq(L.level2Quiz.total, 2, 'level 2 quiz length');
  t.eq([L.afterMiss.learn.level, L.afterMiss.learn.restarts], [2, 1], 'after a miss: level / restarts');
  t.eq([L.end.learn.level, L.end.learn.restarts, L.end.learn.phase], [3, 1, 'study'], 'after clearing level 2: level / restarts / phase');
  const saved = L.store && L.store['canada-provinces'];
  if (t.ok(saved, 'atlas-learn has no "canada-provinces" entry')) {
    t.eq(saved.level, 3, 'saved Learn level');
    t.eq(saved.order, L.first.learn.order, 'saved Learn order');
  }
  t.ok(L.recordsRaw === r.recordsRaw, 'Learn mode changed atlas-records');
  t.ok(L.focusRaw === r.focusRaw, 'Learn mode changed atlas-focus');
});

check('pin', 'Pin the City: a 20-pin round with accurate pins, far pins and a skip', async t => {
  const sess = await t.open();
  const page = sess.page;
  const start = await openLevel(sess, 'pin-europe');
  t.eq(start.mode, 'city-pin', 'game mode');
  t.eq(start.total, 20, 'cities in a round');
  const plan = i => (i === 7 ? 'skip' : i % 5 === 3 ? 'far' : 'near');
  const played = [];
  let st = start;
  for (let i = 0; i < 20 && st.screen === 'game'; i++) {
    const name = st.current;
    const how = plan(i);
    const truth = PIN_CITIES[name];
    if (!truth) throw new Error('the suite has no coordinates for "' + name + '" (update PIN_CITIES)');
    log(how + ' pin: ' + name);
    if (how === 'skip') {
      await page.keyboard.press('s');
    } else {
      if (how === 'near') await MapAdapter.pinAt(page, truth[0], truth[1]);
      else await MapAdapter.pinFarFrom(page, truth[0], truth[1]);
      await waitState(page, s => !!s.pin && s.pin.hasGuess, 'the tap to place a pin for ' + name, 2500);
      await page.keyboard.press('Enter');
    }
    st = await waitState(page, s => !!s.pin && s.pin.phase === 'reveal' && s.pin.results.length === i + 1, 'the reveal for ' + name, 3000);
    const res = st.pin.results[i];
    played.push({ name: name, how: how, km: res.km, pts: res.pts });
    t.eq(res.name, name, 'city scored');
    if (how === 'near') t.ok(res.km != null && res.km <= 80 && res.pts >= 85, 'accurate pin on ' + name + ' scored ' + res.pts + ' (' + Math.round(res.km) + ' km off)');
    if (how === 'far') t.ok(res.km != null && res.km >= 500 && res.pts <= 31, 'far pin for ' + name + ' scored ' + res.pts + ' (' + Math.round(res.km) + ' km off)');
    if (how === 'skip') t.eq([res.km, res.pts], [null, 0], 'skipped city km / points');
    await page.keyboard.press('Enter');   // Next, or Finish on the last city
    st = await waitState(page, s => s.screen !== 'game' || (!!s.pin && s.pin.phase === 'aim' && s.current !== name),
      'the city after ' + name, 4000);
  }
  t.eq(played.length, 20, 'cities played');
  t.eq(st.screen, 'results', 'screen after the last pin');
  const total = played.reduce((a, p) => a + p.pts, 0);
  t.eq(st.score, total, 'score is the sum of the pins');
  const store = await getStore(page, 'atlas-pin');
  if (t.ok(store && Array.isArray(store.games), 'atlas-pin was not written')) {
    t.eq(store.games.length, 1, 'games in atlas-pin');
    const g = store.games[0] || {};
    t.eq([g.region, g.diff, g.score, g.max], ['Europe', 'normal', total, 2000], 'saved game region / diff / score / max');
    const kms = played.filter(p => p.km != null).map(p => p.km);
    t.eq(g.avgKm, Math.round(kms.reduce((a, b) => a + b, 0) / kms.length), 'saved average miss');
    t.eq(Object.keys(store.cities || {}).sort(), played.map(p => p.name).sort(), 'cities with a saved try');
    const skipped = played.find(p => p.how === 'skip');
    const tries = skipped && store.cities && store.cities[skipped.name];
    t.ok(tries && tries.length === 1 && tries[0][1] === null, 'the skipped city should be saved with km null, got ' + JSON.stringify(tries));
  }
  t.eq(await getRaw(page, 'atlas-records'), null, 'Pin the City must not write atlas-records');
  RUN.shared.pin = { played: played, mastery: await masteryDump(page, played.map(p => p.name)) };
  t.checkErrors(sess);
});

check('daily', 'Daily Five: the attempt is stored; a reload shows it played and allows no second scored attempt', async t => {
  const sess = await t.open();
  const page = sess.page;
  const start = await openLevel(sess, 'daily');
  t.eq(start.mode, 'daily-five', 'game mode');
  t.eq(start.total, 5, 'questions');
  const plan = ['right', 'second', 'skip', 'right', 'right'];
  const round = await playRound(sess, { how: i => plan[i] });
  const names = round.asked.map(a => a.name);
  t.eq(round.state.screen, 'results', 'screen after the fifth answer');
  const attempts = await getStore(page, 'atlas-daily-attempts');
  const keys = Object.keys(attempts || {});
  t.eq(keys.length, 1, 'stored daily attempts');
  const today = keys[0];
  const a = (attempts || {})[today];
  if (t.ok(a, 'atlas-daily-attempts has no entry after the daily')) {
    t.ok(today === utcDay(0) || today === utcDay(-1), 'attempt stored under ' + today + ', expected today (UTC)');
    t.eq(a.sequence, [2, 1, 0, 2, 2], 'stored sequence');
    t.eq(a.countries, names, 'stored countries, in the order asked');
    t.eq([a.score, a.correct, a.wrong, a.total], [7, 4, 1, 5], 'stored score / correct / wrong / total');
    t.eq(a.difficulty, 'normal', 'stored difficulty');
    t.ok(typeof a.completedAt === 'number' && typeof a.timeSeconds === 'number', 'stored completedAt and timeSeconds should be numbers');
  }
  const rec = (await getStore(page, 'atlas-records') || {})['daily-five|Daily|normal'];
  t.ok(rec && rec.gamesPlayed === 1, 'atlas-records should count one "daily-five|Daily|normal" game, got ' + JSON.stringify(rec));
  RUN.shared.daily = { asked: round.asked, mastery: await masteryDump(page, names) };
  const attemptsRaw = await getRaw(page, 'atlas-daily-attempts');
  const recordsRaw = await getRaw(page, 'atlas-records');
  t.checkErrors(sess);

  // Come back later the same day through the daily link
  await page.goto(sess.url + '?play=daily', { waitUntil: 'domcontentloaded' });
  await requireHook(page);
  const scoredDaily = s => s.screen === 'game' && s.mode === 'daily-five' && !s.dailyReplay;
  const watch = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await snap(page);
      if (s && scoredDaily(s)) return true;
      await sleep(50);
    }
    return false;
  };
  t.ok(!(await watch(1200)), 'after a reload, ?play=daily started a second scored Daily Five');
  const onMenu = (await snap(page) || {}).screen === 'menu';
  if (onMenu) {
    await waitMenu(page, 8000).catch(() => {});
    const marks = await page.evaluate(sel => ({
      played: document.querySelectorAll(sel.played).length, unplayed: document.querySelectorAll(sel.unplayed).length
    }), { played: HUD.dailyPlayed, unplayed: HUD.dailyUnplayed });
    t.ok(marks.played > 0, 'the menu does not show today\'s Daily Five as played (' + HUD.dailyPlayed + ')');
    t.eq(marks.unplayed, 0, 'the menu still offers today\'s Daily Five as unplayed');
  }
  await hookStart(page, 'daily');
  t.ok(!(await watch(700)), 'startGame for the daily started a second scored attempt on the same day');
  t.ok((await getRaw(page, 'atlas-daily-attempts')) === attemptsRaw, 'the stored daily attempt changed after the reload');
  t.ok((await getRaw(page, 'atlas-records')) === recordsRaw, 'atlas-records changed after the reload');
  t.checkErrors(sess);
});

check('difficulty-satellite', 'Hard and Uncharted rounds play; satellite requests tiles; play continues when tiles fail', async t => {
  const three = async (sess, label) => {
    const round = await playRound(sess, { limit: 3 });
    t.eq(round.state.sequence, [2, 2, 2], label + ': points after three right answers');
    return round.state;
  };
  const tiles = async (sess, label) => {
    const t0 = Date.now();
    while (sess.netLog.tiles === 0 && Date.now() - t0 < 8000) await sleep(50);
    t.ok(sess.netLog.tiles > 0, label + ': no imagery tiles were requested');
  };

  let sess = await t.open({ seed: { 'atlas-difficulty': 'hard' }, label: 'hard' });
  let st = await openLevel(sess, 'south-america');
  t.eq([st.difficulty, st.hardMode], ['hard', true], 'hard: difficulty / hardMode');
  await three(sess, 'hard');
  t.eq(sess.netLog.tiles, 0, 'hard on the chart map: imagery tiles requested');
  t.checkErrors(sess);

  sess = await t.open({ seed: { 'atlas-difficulty': 'uncharted' }, label: 'uncharted' });
  st = await openLevel(sess, 'south-america');
  t.eq([st.difficulty, st.hardMode], ['uncharted', true], 'uncharted: difficulty / hardMode');
  await tiles(sess, 'uncharted');
  await three(sess, 'uncharted');
  t.checkErrors(sess);

  sess = await t.open({ seed: { 'atlas-map-style': 'satellite' }, label: 'satellite' });
  st = await openLevel(sess, 'south-america');
  t.eq([st.difficulty, st.mapStyle], ['normal', 'satellite'], 'satellite: difficulty / mapStyle');
  await tiles(sess, 'satellite');
  await three(sess, 'satellite');
  t.checkErrors(sess);

  sess = await t.open({ seed: { 'atlas-map-style': 'satellite' }, tiles: 'fail', label: 'satellite, tiles failing' });
  st = await openLevel(sess, 'south-america');
  t.eq(st.mapStyle, 'satellite', 'tiles failing: mapStyle');
  await three(sess, 'tiles failing');
  t.checkErrors(sess);
});

check('persistence', 'a returning player\'s old stores are read, kept and updated in place', async t => {
  const seed = oldPlayerStore();
  const sess = await t.open({ seed: seed });
  const page = sess.page;
  const readAll = () => page.evaluate(keys => {
    const out = {};
    keys.forEach(k => { out[k] = localStorage.getItem(k); });
    return out;
  }, Object.keys(seed));
  const parse = raw => { try { return JSON.parse(raw); } catch (e) { return raw; } };
  // What changed inside a keyed store, as short lines
  const diff = (key, before, after) => {
    const out = [];
    if (after == null) return [key + ' was removed'];
    if (typeof before !== 'object' || before === null) return same(before, after) ? [] : [key + ' changed from ' + JSON.stringify(before) + ' to ' + JSON.stringify(after)];
    Object.keys(before).forEach(k => {
      if (!(k in after)) out.push(key + ' lost "' + k + '"');
      else if (!same(before[k], after[k])) out.push(key + ' rewrote "' + k + '": ' + JSON.stringify(before[k]).slice(0, 90) + ' -> ' + JSON.stringify(after[k]).slice(0, 90));
    });
    Object.keys(after).forEach(k => { if (!(k in before)) out.push(key + ' gained "' + k + '"'); });
    return out;
  };

  // 1. Booting must not touch any of it
  await page.goto(sess.url, { waitUntil: 'domcontentloaded' });
  await requireHook(page);
  await waitMenu(page);
  await page.waitForTimeout(600);
  let now = await readAll();
  Object.keys(seed).forEach(k => {
    const before = typeof seed[k] === 'string' ? seed[k] : seed[k];
    diff(k, before, now[k] == null ? null : (typeof seed[k] === 'string' ? now[k] : parse(now[k])))
      .forEach(line => t.fails.push('on load: ' + line));
  });
  const st0 = await snap(page);
  t.eq([st0.difficulty, st0.hardMode], ['hard', true], 'legacy atlas-hard-mode=true should load as hard difficulty');
  t.checkErrors(sess);

  // 2. Other views that read the stores must cope with them too (when they exist)
  for (const view of ['stats', 'settings']) {
    const exists = await page.evaluate(v => !!document.getElementById(v + '-screen'), view);
    if (!exists) continue;
    await page.goto(sess.url + '#' + view, { waitUntil: 'domcontentloaded' });
    await requireHook(page);
    await page.waitForTimeout(500);
    const active = await page.evaluate(v => document.getElementById(v + '-screen').classList.contains('active'), view);
    t.ok(active, '#' + view + ' did not open the ' + view + ' screen');
    t.checkErrors(sess);
  }

  // 3. Today's daily is already in the store: no second scored attempt
  await page.goto(sess.url + '?play=daily', { waitUntil: 'domcontentloaded' });
  await requireHook(page);
  await page.waitForTimeout(900);
  const sd = await snap(page);
  t.ok(!(sd.screen === 'game' && sd.mode === 'daily-five' && !sd.dailyReplay), 'the seeded attempt for today was ignored: a scored Daily Five started');

  // 4. A saved Learn ladder resumes where it stopped
  let st = await openLevel(sess, 'canada-provinces', { learn: true });
  const sameNames = same(st.learn.order.slice().sort(), CANADA_PROVINCES.slice().sort());
  if (t.ok(sameNames, 'the suite\'s Canada names no longer match the map (update CANADA_PROVINCES): ' + st.learn.order.join(', '))) {
    t.eq(st.learn.level, 5, 'Learn resumes at the saved level');
    t.eq(st.learn.order, CANADA_PROVINCES, 'Learn resumes with the saved order');
  }
  await page.keyboard.press('Escape');
  await waitState(page, s => s.screen === 'menu', 'the menu after Escape', 4000);

  // 5. A full round updates its old record in place and leaves every other entry alone
  st = await openLevel(sess, 'oceania');
  t.eq(st.difficulty, 'hard', 'difficulty in the round');
  const total = st.total;
  const round = await playRound(sess);
  t.eq(round.state.screen, 'results', 'screen after the round');
  now = await readAll();
  const records = parse(now['atlas-records']) || {};
  const key = 'world-country|Oceania|hard';
  const rec = records[key];
  if (t.ok(rec, 'atlas-records lost "' + key + '"')) {
    t.eq(rec.gamesPlayed, 4, key + ' gamesPlayed (was 3)');
    t.eq([rec.bestScore.value, rec.bestScore.max, rec.bestScore.date], [total * 2, total * 2, utcDay(0)], key + ' bestScore value / max / date');
    t.eq([rec.bestAccuracy.correct, rec.bestAccuracy.pct], [total, 100], key + ' bestAccuracy correct / pct');
    t.ok(rec.bestTime && rec.bestTime.total === total, key + ' should gain a clean-sweep time, got ' + JSON.stringify(rec.bestTime));
  }
  const untouched = Object.assign({}, seed['atlas-records']);
  delete untouched[key];
  const others = Object.assign({}, records);
  delete others[key];
  diff('atlas-records', untouched, others).forEach(line => t.fails.push('after a round: ' + line));
  const focus = parse(now['atlas-focus']) || {};
  t.eq(focus['world-country|Oceania'] && focus['world-country|Oceania'].names, [], 'focus list for the level just played perfectly');
  ['us-state|The United States', 'province|canada-provinces'].forEach(k => {
    t.ok(same(focus[k], seed['atlas-focus'][k]), 'atlas-focus "' + k + '" changed: ' + JSON.stringify(focus[k]));
  });
  diff('atlas-pin', seed['atlas-pin'], parse(now['atlas-pin'])).forEach(line => t.fails.push('after a round: ' + line));
  diff('atlas-daily-attempts', seed['atlas-daily-attempts'], parse(now['atlas-daily-attempts'])).forEach(line => t.fails.push('after a round: ' + line));
  const learn = parse(now['atlas-learn']) || {};
  t.eq(learn['canada-provinces'] && [learn['canada-provinces'].level, learn['canada-provinces'].order], [5, CANADA_PROVINCES], 'saved Learn ladder level / order');
  t.checkErrors(sess);
});

check('mastery', 'outcomes land in atlas-mastery under the right skills; Learn adds none; a round is a session', async t => {
  if (!RUN.hook || !RUN.hook.mastery) throw new Skip('window.__atlas.mastery is absent in this build');
  const perfect = RUN.shared.perfect || await scenarioPerfect(t);
  const mixed = RUN.shared.mixed || await scenarioMixed(t);
  const prov = RUN.shared.provinces || await scenarioProvinces(t);
  const item = (dump, skill, name) => (dump && dump.items[skill] && dump.items[skill][name]) || null;
  const expectItems = (dump, skill, asked, label, tally) => {
    if (!t.ok(dump, label + ': no mastery data was captured')) return;
    t.ok(dump.stored, label + ': localStorage has no atlas-mastery');
    t.ok(dump.skills.indexOf(skill) !== -1, label + ': no "' + skill + '" skill in atlas-mastery (skills: ' + dump.skills.join(', ') + ')');
    asked.forEach(a => {
      const want = tally(a);
      const got = item(dump, skill, a.name);
      t.ok(got && same([got.first, got.second, got.missed], want),
        label + ': ' + skill + ' / ' + a.name + ' (' + a.how + ') should be first/second/missed ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));
    });
  };
  const byHow = a => (a.how === 'right' ? [1, 0, 0] : a.how === 'second' ? [0, 1, 0] : [0, 0, 1]);

  // A perfect round: every country a first-try answer, one session today
  expectItems(perfect.mastery, 'country', perfect.names.map(n => ({ name: n, how: 'right' })), 'perfect round', byHow);
  if (perfect.mastery && perfect.mastery.today) {
    const d = perfect.mastery.today;
    t.eq([d.games, d.questions, d.firstTry], [1, perfect.total, perfect.total], 'perfect round: today\'s games / questions / firstTry');
  } else t.ok(false, 'perfect round: mastery.activity() has no row for today');

  // A mixed round, then focus practice over its three weak names (practice records too)
  expectItems(mixed.masteryFull, 'country', mixed.asked, 'mixed round', byHow);
  if (mixed.masteryFull && mixed.masteryFull.today) t.eq(mixed.masteryFull.today.games, 1, 'mixed round: sessions today');
  if (mixed.practice) {
    const practised = new Set(mixed.practice.asked.map(a => a.name));
    expectItems(mixed.practice.mastery, 'country', mixed.asked, 'after focus practice', a => {
      const base = byHow(a);
      return practised.has(a.name) ? [base[0] + 1, base[1], base[2]] : base;
    });
    if (mixed.practice.mastery && mixed.practice.mastery.today) {
      t.eq(mixed.practice.mastery.today.games, 2, 'after focus practice: sessions today');
    }
  }

  // Provinces file under province:<country>; Learn quizzes add nothing to items
  expectItems(prov.masteryFull, 'province:canada', prov.asked, 'Canada round', byHow);
  if (prov.learn && prov.learn.mastery && prov.masteryFull) {
    t.eq(prov.learn.mastery.items, prov.masteryFull.items, 'items after two Learn levels (Learn quizzes must not record)');
    t.eq(prov.learn.mastery.totals.itemsSeen, prov.masteryFull.totals.itemsSeen, 'itemsSeen after two Learn levels');
    t.ok(prov.learn.mastery.today.games >= prov.masteryFull.today.games, 'Learn must not lower today\'s session count');
  } else t.ok(false, 'Learn: no mastery data was captured');

  // The other skills, when those checks ran in this process
  const us = RUN.shared.us;
  if (us) {
    const skills = { 'us-state': 'us-state', 'us-state-to-capital': 'us-capital', 'us-capital-to-state': 'us-capital', 'northeast-cities': 'us-city' };
    Object.keys(skills).forEach(slug => {
      if (!us[slug]) return;
      const dump = us[slug].mastery;
      t.ok(dump && dump.skills.indexOf(skills[slug]) !== -1, slug + ': no "' + skills[slug] + '" skill in atlas-mastery');
      us[slug].asked.forEach(a => {
        const got = item(dump, skills[slug], a.name);
        t.ok(got && got.seen >= 1 && (a.how !== 'second' || got.second >= 1), slug + ': ' + a.name + ' (' + a.how + ') not recorded under ' + skills[slug] + ', got ' + JSON.stringify(got));
      });
      if (dump && dump.today) t.eq(dump.today.games, 0, slug + ': abandoned rounds are not sessions');
    });
  }
  const pin = RUN.shared.pin;
  if (pin) {
    expectItems(pin.mastery, 'city-pin', pin.played, 'Pin the City', p => (p.pts >= 80 ? [1, 0, 0] : p.pts >= 40 ? [0, 1, 0] : [0, 0, 1]));
  }
  const daily = RUN.shared.daily;
  if (daily) expectItems(daily.mastery, 'country', daily.asked, 'Daily Five', byHow);
});

check('stale-timer', 'leaving during a reveal and starting another round at once does not skip its first question', async t => {
  const sess = await t.open();
  const page = sess.page;
  await openLevel(sess, 'africa');
  await page.keyboard.press('s');   // skip: the answer is revealed for a couple of seconds
  await waitState(page, s => s.sequence.length === 1 && s.locked, 'the skip to start its reveal', 2000);
  const skippedAt = Date.now();
  await page.keyboard.press('Escape');
  await waitState(page, s => s.screen === 'menu', 'the menu after Escape', 3000);
  await hookStart(page, 'europe');
  const first = await waitRound(sess, 'the second round', { noChooser: true });
  log('second round opened on ' + first.current + ' ' + (Date.now() - skippedAt) + ' ms after the skip');
  t.eq(first.region, 'Europe', 'region of the second round');
  // Watch past the end of the old round's reveal without touching anything
  let changed = null;
  while (Date.now() - skippedAt < 3600 && !changed) {
    const s = await snap(page);
    if (s && (s.current !== first.current || s.queue.length !== first.queue.length || s.sequence.length !== 0 || s.screen !== 'game')) {
      changed = { at: Date.now() - skippedAt, s: s };
    }
    await sleep(40);
  }
  t.ok(!changed, changed ? 'the new round\'s first question changed from "' + first.current + '" to "' + changed.s.current +
    '" with nothing pressed, ' + changed.at + ' ms after the skip in the previous round (a timer from the abandoned round fired; ' +
    'queue ' + first.queue.length + ' -> ' + changed.s.queue.length + ')' : '');
  t.checkErrors(sess);
});

check('bad-links', 'unknown or unplayable ?play= links land on the menu and write nothing', async t => {
  const sess = await t.open();
  const page = sess.page;
  for (const slug of ['nonsense', 'midwest-cities']) {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* first load */ } }).catch(() => {});
    await page.goto(sess.url + '?play=' + slug, { waitUntil: 'domcontentloaded' });
    await requireHook(page);
    // Follow the app for a moment: a real level reaches its first question, a bad link must stay on the menu
    const seen = new Set();
    let st = null, playable = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      st = await snap(page);
      if (st) seen.add(st.screen);
      if (roundReady(st, false) && st.total > 0) { playable = true; break; }
      await sleep(40);
    }
    if (playable) {
      t.note('?play=' + slug + ' is a real level in this build (' + st.total + ' questions)');
      continue;
    }
    t.ok(!seen.has('game') && !seen.has('results'), '?play=' + slug + ' left the menu (screens seen: ' + Array.from(seen).join(' -> ') + ')');
    t.eq(st && st.screen, 'menu', '?play=' + slug + ' final screen');
    const stores = await progressSnapshot(page);
    PROGRESS_KEYS.forEach(k => {
      t.ok(stores[k] == null, '?play=' + slug + ' wrote ' + k + ': ' + String(stores[k]).slice(0, 160));
    });
    t.checkErrors(sess);
  }
});

/* =====================================================================
 * RUNNER
 * ===================================================================== */

// Finds out what the build exposes before any check runs
async function preflight() {
  const h = await launch({ root: OPT.root || undefined, mobile: OPT.mobile, dpr: 1 });
  try {
    await h.page.goto(h.url, { waitUntil: 'domcontentloaded' });
    await h.page.waitForFunction(() => !!(window.__atlas && window.__atlas.state), null, { timeout: 8000, polling: 50 }).catch(() => {});
    return await h.page.evaluate(() => {
      const a = window.__atlas;
      if (!a || !a.state) return null;
      return { version: a.version, mastery: !!a.mastery, levels: Array.isArray(a.LEVELS) ? a.LEVELS.length : 0, startGame: typeof a.startGame === 'function' };
    });
  } finally {
    await h.close();
  }
}

async function runCheck(index, c) {
  const t = new Check(c.name);
  const t0 = Date.now();
  let status = 'PASS';
  let timer = null;
  try {
    if (!RUN.hook && c.name !== 'boot') throw new HookMissing(HOOK_HELP);
    await Promise.race([
      c.fn(t),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('check timed out after 150 s')), 150000); })
    ]);
  } catch (e) {
    if (e instanceof Skip) status = 'SKIP';
    if (e instanceof Skip) t.notes.push(e.message);
    else t.fails.push(e instanceof HookMissing ? e.message : (e && e.message ? e.message.split('\n')[0] : String(e)));
  } finally {
    clearTimeout(timer);
  }
  // Anything a session logged after its last explicit look still counts
  t.sessions.forEach(s => t.checkErrors(s));
  for (let i = 0; i < t.sessions.length; i++) {
    const s = t.sessions[i];
    if (OPT.shots) {
      const file = path.join(OPT.shots, String(index + 1).padStart(2, '0') + '-' + c.name + (t.sessions.length > 1 ? '-' + (i + 1) : '') + '.png');
      await s.page.screenshot({ path: file }).catch(() => {});
    }
    await s.close().catch(() => {});
  }
  if (status !== 'SKIP' && t.fails.length) status = 'FAIL';
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(status + '  ' + c.name + '  (' + secs + ' s)  ' + c.title);
  t.fails.forEach(f => console.log('      - ' + f));
  t.notes.forEach(n => console.log('      ' + (status === 'SKIP' ? 'skipped: ' : 'note: ') + n));
  return { name: c.name, status: status, fails: t.fails };
}

async function main() {
  if (OPT.list) {
    CHECKS.forEach((c, i) => console.log(String(i + 1).padStart(2) + '  ' + c.name.padEnd(22) + c.title));
    return 0;
  }
  let selected = CHECKS.map((c, i) => [i, c]);
  if (OPT.only) {
    const unknown = OPT.only.filter(n => !CHECKS.some((c, i) => c.name === n || String(i + 1) === n));
    if (unknown.length) {
      console.error('Unknown check(s): ' + unknown.join(', ') + '. Use --list.');
      return 2;
    }
    selected = selected.filter(([i, c]) => OPT.only.indexOf(c.name) !== -1 || OPT.only.indexOf(String(i + 1)) !== -1);
  }
  if (OPT.shots) fs.mkdirSync(OPT.shots, { recursive: true });

  const t0 = Date.now();
  RUN.hook = await preflight();
  if (!RUN.hook && OPT.patchHook) {
    const { makeCopy } = require('./make-test-copy.js');
    const copy = makeCopy({ src: OPT.root || undefined });
    OPT.root = copy.out;
    RUN.hook = await preflight();
    console.log('note: this build has no test hook; testing a patched copy at ' + copy.out);
  }
  console.log('Atlas smoke suite — ' + (OPT.root || 'repo public/') + ' — ' + (OPT.mobile ? 'phone 390x844, touch' : 'desktop 1280x800') +
    ' — map adapter: ' + MapAdapter.kind);
  console.log(RUN.hook
    ? 'hook: version ' + RUN.hook.version + ', mastery ' + (RUN.hook.mastery ? 'yes' : 'no') + ', LEVELS ' + (RUN.hook.levels || 'no')
    : 'hook: MISSING — ' + HOOK_HELP);

  const results = [];
  for (const [i, c] of selected) results.push(await runCheck(i, c));

  const count = s => results.filter(r => r.status === s).length;
  const c = MapAdapter.counts;
  console.log('');
  console.log('map input: ' + c.clicks + ' real ' + (OPT.mobile ? 'taps' : 'clicks') + ', ' + c.zoomed + ' needed a zoom first, ' +
    c.synthetic + ' synthetic, ' + RUN.retries + ' retried');
  console.log(count('PASS') + ' passed, ' + count('FAIL') + ' failed, ' + count('SKIP') + ' skipped in ' +
    ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  const failed = results.filter(r => r.status === 'FAIL').map(r => r.name);
  if (failed.length) console.log('failed: ' + failed.join(', '));
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  main().then(code => process.exit(code), err => {
    console.error(err);
    process.exit(1);
  });
} else {
  // For one-off scripts that want to drive the game the same way the suite does
  module.exports = {
    OPT, MapAdapter, HUD, Check, PIN_CITIES, US_CAPITALS, oldPlayerStore,
    snap, waitState, waitMenu, openLevel, waitRound, hookStart, answerQuestion, waitNextQuestion, playRound,
    getStore, masteryDump
  };
}
