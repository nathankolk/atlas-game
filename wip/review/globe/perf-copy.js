// Polish-stage measurements: cold load weight, time to Home, Start -> first question, memory.
//   NODE_PATH=/opt/node-tools/node_modules node perf.js [--apps=new,old] [--sizes=desktop,phone] [--runs=3] [--only=load,start,link,memory] [--tag=before]
// Appends one JSON line per case to perf-results.jsonl (with the tag) and prints a table.
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const APPS = opt('apps', 'new,old').split(',');
const SIZES = opt('sizes', 'desktop,phone').split(',');
const RUNS = Number(opt('runs', 3));
const ONLY = opt('only', 'load,start,link,memory').split(',');
const TAG = opt('tag', 'run');
const ROOTS = { new: '/home/user/atlas-game/public', old: path.join(S, 'work/integration/globe-stage/old-app/public') };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = v => v == null ? null : Math.round(v);
const dims = size => size === 'phone' ? { mobile: true, dpr: 2, width: 390, height: 844 } : { width: 1280, height: 800 };
const out = [];
const save = row => { row.tag = TAG; out.push(row); fs.appendFileSync(path.join(__dirname, 'perf-results.jsonl'), JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)); };

// Every response of the page, with its size as sent by a host that compresses text (brotli, as Cloudflare does)
function watch(page) {
  const list = [];
  page.on('response', async res => {
    const url = res.url();
    try {
      const body = await res.body();
      const type = (res.headers()['content-type'] || '');
      const text = /text|javascript|json|svg|css/.test(type);
      list.push({ url: url.replace(/^https?:\/\/[^/]+/, m => /127\.0\.0\.1/.test(m) ? '' : m), status: res.status(), raw: body.length, sent: text ? zlib.brotliCompressSync(body).length : body.length });
    } catch (e) { list.push({ url, status: res.status(), raw: 0, sent: 0 }); }
  });
  return list;
}

// Google Fonts answer from memory after the first fetch: the sandbox reaches them through a
// proxy whose delay (150-450 ms, blocking the page) would drown what is being measured
const fontCache = new Map();
async function fastFonts(context) {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
    const url = route.request().url();
    if (!fontCache.has(url)) {
      try { const res = await route.fetch(); fontCache.set(url, { status: res.status(), headers: res.headers(), body: await res.body() }); }
      catch (e) { return route.abort(); }
    }
    return route.fulfill(fontCache.get(url));
  });
}
const open = async (app, size, seed) => {
  const h = await launch(Object.assign({ root: ROOTS[app], seedStorage: Object.assign({ 'atlas-theme': 'light' }, seed || {}) }, dims(size)));
  await fastFonts(h.context);
  return h;
};

// Home is usable: its level cards (new) or its menu buttons (old) are in the page
const homeUp = app => app === 'new'
  ? () => document.querySelectorAll('#menu-screen .level').length > 5
  : () => document.querySelectorAll('#menu-content .region-card').length > 2;

function installHomeProbe(app) {
  window.__home = null;
  const up = app === 'new'
    ? () => document.querySelectorAll('#menu-screen .level').length > 5
    : () => document.querySelectorAll('#menu-content .region-card').length > 2;
  const tick = () => { if (up()) { window.__home = performance.now(); return; } setTimeout(tick, 2); };
  document.addEventListener('DOMContentLoaded', tick);
}

// A question can be answered: the prompt is up on a map that is drawn
function questionUp(app) {
  if (app === 'new') {
    const A = window.__atlas;
    return !!A && !!A.state.current && A.map.round === A.state.roundId && A.map.drawn && A.globe.stats().frames > 0;
  }
  const screen = document.getElementById('game-screen'), name = document.getElementById('prompt-country');
  return !!screen && screen.classList.contains('active') && document.querySelectorAll('#world-map path').length > 20 && !!name && name.textContent.length > 1;
}

async function load(app, size) {
  const row = { what: 'load', app, size, home: [], requests: null, raw: null, sent: null, files: null };
  // Pass 0 fills the font cache and counts what is transferred; the passes after it are timed
  for (let i = 0; i <= RUNS; i++) {
    const h = await open(app, size);
    const list = i === 0 ? watch(h.page) : [];
    await h.context.addInitScript(installHomeProbe, app);
    await h.page.goto(h.url);
    await h.page.waitForFunction(() => window.__home !== null, null, { timeout: 60000 });
    if (i > 0) row.home.push(round(await h.page.evaluate(() => window.__home)));
    await h.page.waitForTimeout(i === 0 ? 2500 : 200);     // whatever the page fetches once it is idle
    if (i === 0) {
      row.requests = list.length;
      row.raw = list.reduce((s, r) => s + r.raw, 0);
      row.sent = list.reduce((s, r) => s + r.sent, 0);
      row.files = list.map(r => r.url.slice(0, 70) + ' ' + r.status + ' ' + r.raw + '/' + r.sent);
    }
    await h.close();
  }
  row.homeMedian = median(row.home);
  save(row);
}

// From the tap on Start (new: the level sheet's button; old: the level's card) to a question that can be answered
const LEVELS = {
  europe: { new: 'europe', old: ['continents', 'Europe'] },
  states: { new: 'us-state', old: ['us', 'us-state'] },
  india: { new: 'india-states', old: ['provinces', 'india-states'] }
};
async function start(app, size, levelName, satellite) {
  const row = { what: 'start', app, size, level: levelName, style: satellite ? 'satellite' : 'chart', ms: [], paintMs: [] };
  const lv = LEVELS[levelName];
  for (let i = 0; i < RUNS; i++) {
    const h = await open(app, size, satellite ? { 'atlas-map-style': 'satellite' } : null);
    const page = h.page;
    await page.goto(h.url);
    await page.waitForFunction(homeUp(app), null, { timeout: 60000 });
    await page.waitForTimeout(3000);       // a player reads the page before choosing
    let res;
    if (app === 'new') {
      await page.evaluate(key => document.querySelector('[data-action="open-level"][data-level="' + key + '"]').click(), lv.new);
      await page.waitForFunction(() => !document.getElementById('level-sheet').hidden, null, { timeout: 10000 });
      await page.waitForTimeout(1500);     // and the sheet before pressing Start
      res = await page.evaluate(fn => new Promise(resolve => {
        const up = (0, eval)('(' + fn + ')');
        const t0 = performance.now();
        document.getElementById('sheet-start-btn').click();
        const tick = () => {
          if (up('new')) { const t1 = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: t1 - t0, paint: performance.now() - t0 }))); return; }
          setTimeout(tick, 2);
        };
        tick();
      }), questionUp.toString());
    } else {
      await page.evaluate(folder => document.querySelector('[data-folder="' + folder + '"]').click(), lv.old[0]);
      await page.waitForSelector('[data-region="' + lv.old[1] + '"]', { timeout: 10000 });
      await page.waitForTimeout(1500);
      res = await page.evaluate(([fn, region]) => new Promise(resolve => {
        const up = (0, eval)('(' + fn + ')');
        const t0 = performance.now();
        document.querySelector('[data-region="' + region + '"]').click();
        const tick = () => {
          if (up('old')) { const t1 = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: t1 - t0, paint: performance.now() - t0 }))); return; }
          setTimeout(tick, 2);
        };
        tick();
      }), [questionUp.toString(), lv.old[1]]);
    }
    row.ms.push(round(res.ms));
    row.paintMs.push(round(res.paint));
    await h.close();
  }
  row.median = median(row.ms);
  row.paintMedian = median(row.paintMs);
  save(row);
}

// A level link opened cold: navigation to a question that can be answered
async function link(app, size) {
  const row = { what: 'link', app, size, ms: [] };
  for (let i = 0; i < RUNS; i++) {
    const h = await open(app, size);
    await h.context.addInitScript(([fn, a]) => {
      window.__q = null;
      const up = (0, eval)('(' + fn + ')');
      const tick = () => { if (up(a)) { window.__q = performance.now(); return; } setTimeout(tick, 2); };
      document.addEventListener('DOMContentLoaded', tick);
    }, [questionUp.toString(), app]);
    await h.page.goto(h.url + '?play=world');
    await h.page.waitForFunction(() => window.__q !== null, null, { timeout: 60000 });
    row.ms.push(round(await h.page.evaluate(() => window.__q)));
    await h.close();
  }
  row.median = median(row.ms);
  save(row);
}

// JS heap in use (after a forced collection) on Home, and again after ten rounds started and left
async function memory(app, size) {
  const row = { what: 'memory', app, size };
  const h = await open(app, size);
  const page = h.page;
  const cdp = await h.context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const m = {};
    (await cdp.send('Performance.getMetrics')).metrics.forEach(x => { m[x.name] = x.value; });
    return { heapMB: Math.round(m.JSHeapUsedSize / 1048576 * 10) / 10, nodes: m.Nodes, listeners: m.JSEventListeners };
  };
  await page.goto(h.url);
  await page.waitForFunction(homeUp(app), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  row.home = await heap();
  const levels = app === 'new' ? ['Europe', 'us-state', 'World', 'Africa', 'india-states'] : ['Europe', 'us-state', 'World', 'Africa', 'india-states'];
  const rounds = async n => {
    for (let i = 0; i < n; i++) {
      const arg = levels[i % levels.length];
      await page.evaluate(([a, isNew]) => {
        if (isNew) { window.__atlas.startGame(a); return; }
        // The old app has no hook: its level links start a round the same way a card does
        history.replaceState(null, '', '?play=' + a.toLowerCase());
      }, [arg, app === 'new']);
      if (app === 'old') { await page.goto(h.url + '?play=' + arg.toLowerCase()); }
      await page.waitForFunction(questionUp, app, { timeout: 60000 });
      await page.waitForTimeout(400);
      if (app === 'new') {
        await page.evaluate(() => document.getElementById('back-btn').click());
        await page.waitForFunction(() => document.getElementById('menu-screen').classList.contains('active'), null, { timeout: 10000 });
      }
      await page.waitForTimeout(200);
    }
  };
  if (app === 'new') {
    await rounds(10);
    row.after10 = await heap();
    await rounds(10);
    row.after20 = await heap();
  }
  save(row);
  await h.close();
}

(async () => {
  { const h = await open('new', 'desktop'); await h.page.goto(h.url); await h.page.waitForTimeout(1500); await h.close(); }   // fonts into the cache
  for (const app of APPS) for (const size of SIZES) {
    if (ONLY.includes('load')) await load(app, size);
    if (ONLY.includes('link')) await link(app, size);
    if (ONLY.includes('start')) {
      await start(app, size, 'europe', false);
      await start(app, size, 'states', false);
      if (app === 'new') await start(app, size, 'india', false);     // the old app's province levels open on a chooser
      await start(app, size, 'europe', true);
    }
    if (ONLY.includes('memory') && app === 'new') await memory(app, size);
  }
  console.log('\n' + out.map(r => [r.what, r.app, r.size, r.level || '', r.style || '', r.what === 'load' ? 'home ' + r.homeMedian + ' ms, ' + r.requests + ' req, ' + r.raw + ' B raw, ' + r.sent + ' B sent' : r.what === 'memory' ? JSON.stringify([r.home, r.after10, r.after20]) : r.median + ' ms (' + r.ms.join(',') + ')' + (r.paintMedian ? ' painted ' + r.paintMedian : '')].join(' | ')).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
