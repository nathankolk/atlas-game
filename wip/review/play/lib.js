// Shared helpers for the review scripts: the harness with software compositing, plus the smoke suite's
// map adapter and play helpers.
'use strict';
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad';
const smoke = require(S + '/harness/smoke.js');   // patches chromium.launch with --disable-gpu-compositing
const { launch } = require(S + '/harness/atlas-harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Opens a browser on the app. opts: { mobile, width, height, seed, tiles, root, init (fn run before load), initArg }
async function open(opts) {
  opts = opts || {};
  smoke.OPT.mobile = !!opts.mobile;
  const h = await launch({ mobile: opts.mobile, dpr: opts.mobile ? 2 : 1, width: opts.width || 1280, height: opts.height || 800,
    tiles: opts.tiles || 'mock', seedStorage: opts.seed, root: opts.root });
  await smoke.MapAdapter.install(h.context);
  if (opts.init) await h.context.addInitScript(opts.init, opts.initArg);
  const sess = { page: h.page, context: h.context, url: h.url, netLog: h.netLog, log: [], errors: h.errors, close: h.close, label: opts.label || '' };
  h.page.on('dialog', d => { sess.log.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  return sess;
}
async function home(sess, q) {
  await sess.page.goto(sess.url + (q || ''), { waitUntil: 'domcontentloaded' });
  await sess.page.waitForFunction(() => !!(window.__atlas && window.__atlas.state && window.__atlas.state.allFeatures && window.__atlas.state.allFeatures.length), null, { timeout: 20000 });
}
const store = (page, key) => page.evaluate(k => { const r = localStorage.getItem(k); try { return JSON.parse(r); } catch (e) { return r; } }, key);
const raw = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
module.exports = Object.assign({ S, open, home, sleep, store, raw, smoke }, smoke);
