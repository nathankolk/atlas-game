// Test harness for Cartographer's Atlas.
//
// The sandbox blocks cdnjs / jsdelivr / unpkg / arcgisonline, so this module
// (1) serves public/ on a local port, and (2) gives every Playwright page a set
// of routes that answer those hosts from local npm copies. Satellite tiles are
// answered with generated stand-in tiles: Natural Earth land drawn in Web
// Mercator (green land, blue sea, thin tile-edge lines + z/x/y text), so
// imagery/border alignment can be checked by eye and by pixel sampling.
//
// Usage:
//   const { launch } = require('<this file>');
//   const { browser, page, url, close } = await launch({ width: 1280, height: 800 });
//   await page.goto(url);            // or url + '?play=europe'
//   ...
//   await close();
//
// Options: { width, height, mobile (bool: 390x844 touch, dpr 3), dpr,
//            root (dir to serve; default <repo>/public), tiles ('mock'|'fail'),
//            seedStorage (object of localStorage key -> value set before load) }
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRATCH = path.resolve(__dirname, '..');
const VENDOR = path.join(SCRATCH, 'vendor', 'node_modules');
const REPO_PUBLIC = '/home/user/atlas-game/public';

const d3geo = require(path.join(VENDOR, 'd3-geo'));
const topojson = require(path.join(VENDOR, 'topojson-client'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      // The sync Function isn't running locally: behave like "no record yet"
      if (p.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(req.method === 'GET' ? 'null' : '{"ok":true}');
        return;
      }
      const file = path.join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---- Mock satellite tiles ----
let landGeo = null;
function land() {
  if (!landGeo) {
    const topo = JSON.parse(fs.readFileSync(path.join(VENDOR, 'world-atlas', 'land-110m.json'), 'utf8'));
    landGeo = topojson.feature(topo, topo.objects.land);
  }
  return landGeo;
}
const tileCache = new Map();
function mockTileSvg(z, x, y) {
  const key = z + '/' + x + '/' + y;
  if (tileCache.has(key)) return tileCache.get(key);
  const n = Math.pow(2, z);
  // Web Mercator world is n*256 px wide; this tile's origin is (x*256, y*256)
  const proj = d3geo.geoMercator()
    .scale(n * 256 / (2 * Math.PI))
    .translate([n * 128 - x * 256, n * 128 - y * 256])
    .clipExtent([[-2, -2], [258, 258]]);
  const d = d3geo.geoPath(proj)(land()) || '';
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

const CDN_FILES = [
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/d3\/[^/]+\/d3\.min\.js/, 'd3/dist/d3.min.js'],
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/topojson\/[^/]+\/topojson\.min\.js/, 'topojson/dist/topojson.min.js'],
  [/(jsdelivr\.net\/npm|unpkg\.com)\/topojson-client@[^/]+\/dist\/topojson-client\.min\.js/, 'topojson-client/dist/topojson-client.min.js'],
  [/(jsdelivr\.net\/npm|unpkg\.com)\/d3@[^/]+\/dist\/d3\.min\.js/, 'd3/dist/d3.min.js'],
  [/(jsdelivr\.net\/npm|unpkg\.com)\/world-atlas@[^/]+\/(.+\.json)/, m => 'world-atlas/' + m[2]],
  [/(jsdelivr\.net\/npm|unpkg\.com)\/us-atlas@[^/]+\/(.+\.json)/, m => 'us-atlas/' + m[2]]
];

async function installRoutes(context, opts) {
  const log = { tiles: 0, cdn: [], blocked: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async route => {
    const url = route.request().url();
    for (const [re, target] of CDN_FILES) {
      const m = url.match(re);
      if (m) {
        const rel = typeof target === 'function' ? target(m) : target;
        const file = path.join(VENDOR, rel);
        if (!fs.existsSync(file)) { log.blocked.push(url); return route.fulfill({ status: 404, body: 'missing ' + rel }); }
        log.cdn.push(rel);
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': MIME[path.extname(file)] || 'text/plain', 'Access-Control-Allow-Origin': '*' },
          body: fs.readFileSync(file)
        });
      }
    }
    const t = url.match(/arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/);
    if (t) {
      if (opts.tiles === 'fail') return route.abort();
      log.tiles++;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' },
        body: mockTileSvg(+t[1], +t[3], +t[2]) // URL order is z/y/x
      });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) {
      // Fonts are reachable in the sandbox, but don't let a slow font hold a test up
      try { return await route.continue(); } catch (e) { return; }
    }
    log.blocked.push(url);
    return route.abort();
  });
  return log;
}

async function launch(opts) {
  opts = Object.assign({ width: 1280, height: 800, tiles: 'mock' }, opts || {});
  const server = await serve(opts.root || REPO_PUBLIC);
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const ctxOpts = opts.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 3, isMobile: true, hasTouch: true }
    : { viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.dpr || 1 };
  const context = await browser.newContext(ctxOpts);
  const netLog = await installRoutes(context, opts);
  if (opts.seedStorage) {
    await context.addInitScript(seed => {
      try { Object.keys(seed).forEach(k => { if (localStorage.getItem(k) === null) localStorage.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])); }); } catch (e) {}
    }, opts.seedStorage);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return {
    browser, context, page, url, errors, netLog,
    close: async () => { await browser.close(); server.close(); }
  };
}

module.exports = { launch, serve, mockTileSvg, VENDOR, SCRATCH };
