// Serves the globe engine's test pages and opens them in headless Chromium.
//
// The engine is taken from public/index.html (see ../extract.js) and served
// as /globe.js; /vendor and /data come from public/. Requests for Esri
// imagery tiles are answered with stand-in tiles: Natural Earth land in
// green on a blue sea, drawn in Web Mercator with the tile's z/x/y printed
// on it, so imagery can be checked against the borders pixel by pixel.
// Every other outside request is refused and noted in netLog.blocked.
//
// Needs Playwright (npm install --no-save playwright, then
// npx playwright install chromium), or a NODE_PATH that has it.
//
//   const { launch } = require('./harness.js');
//   const { page, url, errors, netLog, close } = await launch({ width, height, mobile, dpr, tiles });
//   tiles: 'mock' (default) or 'fail' (every tile request is aborted)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const extract = require('../extract.js');

const PUBLIC = path.resolve(__dirname, '../../../public');

// d3-geo and topojson-client exactly as the site ships them
const libs = vm.createContext({});
['d3-array', 'd3-geo', 'topojson-client'].forEach(name => {
  vm.runInContext(fs.readFileSync(path.join(PUBLIC, 'vendor', name + '.min.js'), 'utf8'), libs);
});
const d3geo = libs.d3, topojson = libs.topojson;
const readJson = name => JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', name), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png'
};

// Files the test pages ask for that the site does not have under that name
const VIRTUAL = {
  '/': () => fs.readFileSync(path.join(__dirname, 'demo.html')),
  '/index.html': () => fs.readFileSync(path.join(__dirname, 'demo.html')),
  '/test.html': () => fs.readFileSync(path.join(__dirname, 'test.html')),
  '/globe.js': () => extract.source('globe'),
  // The states as plain GeoJSON, the form a caller without TopoJSON would hand the engine
  '/data/us-states-detail.json': () => {
    const topology = readJson('us-states.json');
    return JSON.stringify(topojson.feature(topology, topology.objects.states));
  },
  // The coarse world file also holds the land as one shape
  '/data/land-110m.json': () => fs.readFileSync(path.join(PUBLIC, 'data', 'countries-110m.json'))
};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const send = (body, ext) => {
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
      };
      if (VIRTUAL[p]) { send(VIRTUAL[p](), path.extname(p) || '.html'); return; }
      const file = path.join(PUBLIC, p);
      if (!/^\/(vendor|data)\//.test(p) || !file.startsWith(PUBLIC)) { res.writeHead(404); res.end('not found'); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        send(buf, path.extname(file));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let landShape = null;
const tileCache = new Map();
function mockTileSvg(z, x, y) {
  const key = z + '/' + x + '/' + y;
  if (tileCache.has(key)) return tileCache.get(key);
  if (!landShape) {
    const topology = readJson('countries-110m.json');
    landShape = topojson.feature(topology, topology.objects.land);
  }
  const n = Math.pow(2, z);
  // The Web Mercator world is n * 256 px wide; this tile's origin is (x * 256, y * 256)
  const projection = d3geo.geoMercator()
    .scale(n * 256 / (2 * Math.PI))
    .translate([n * 128 - x * 256, n * 128 - y * 256])
    .clipExtent([[-2, -2], [258, 258]]);
  const d = d3geo.geoPath(projection)(landShape) || '';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
    '<rect width="256" height="256" fill="#14385c"/>' +
    '<path d="' + d + '" fill="#4d7a3a" stroke="#2f5524" stroke-width="1"/>' +
    '<rect x="0.5" y="0.5" width="255" height="255" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>' +
    '<text x="8" y="20" font-family="monospace" font-size="12" fill="rgba(255,255,255,0.55)">' + key + '</text>' +
    '</svg>';
  tileCache.set(key, svg);
  return svg;
}

async function launch(opts) {
  opts = Object.assign({ width: 1280, height: 800, tiles: 'mock' }, opts || {});
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  // WebGL on the software driver, so the tests run on a machine with no GPU
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const context = await browser.newContext(opts.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 3, isMobile: true, hasTouch: true }
    : { viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.dpr || 1 });
  const netLog = { tiles: 0, blocked: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => {
    const address = route.request().url();
    const t = address.match(/arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/);
    if (t) {
      if (opts.tiles === 'fail') return route.abort();
      netLog.tiles++;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' },
        body: mockTileSvg(+t[1], +t[3], +t[2])     // the address has z/y/x
      });
    }
    netLog.blocked.push(address);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return {
    browser, context, page, url, errors, netLog,
    close: async () => { await browser.close(); server.close(); }
  };
}

module.exports = { launch, mockTileSvg };
