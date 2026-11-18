// Shared launcher for the globe review: the harness with software compositing, any viewport, touch or mouse.
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
let ctxOverride = null, extraArgs = [];
chromium.launch = async options => {
  const browser = await stockLaunch(Object.assign({}, options, {
    args: ((options && options.args) || []).concat(['--disable-gpu-compositing']).concat(extraArgs)
  }));
  const newContext = browser.newContext.bind(browser);
  browser.newContext = o => newContext(Object.assign({}, o, ctxOverride || {}));
  return browser;
};
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));

const SIZES = {
  d1280: { width: 1280, height: 800, touch: false },
  d1024: { width: 1024, height: 768, touch: false },
  t768: { width: 768, height: 1024, touch: true },
  p390: { width: 390, height: 844, touch: true },
  p360: { width: 360, height: 640, touch: true }
};

// opts: { size: key of SIZES, seedStorage, tiles, args, reducedMotion, colorScheme, initScript, query, root }
async function open(opts) {
  opts = opts || {};
  const sz = SIZES[opts.size || 'd1280'];
  ctxOverride = { viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: opts.dpr || 1 };
  if (sz.touch) { ctxOverride.hasTouch = true; ctxOverride.isMobile = true; }
  if (opts.reducedMotion) ctxOverride.reducedMotion = 'reduce';
  if (opts.colorScheme) ctxOverride.colorScheme = opts.colorScheme;
  extraArgs = opts.args || [];
  const h = await launch({ width: sz.width, height: sz.height, tiles: opts.tiles || 'mock', seedStorage: opts.seedStorage, root: opts.root });
  h.size = sz;
  if (opts.initScript) await h.context.addInitScript(opts.initScript, opts.initArg);
  if (opts.fast) {
    await h.context.addInitScript(f => {
      const st = window.setTimeout;
      window.setTimeout = function (fn, ms) {
        const rest = Array.prototype.slice.call(arguments, 2);
        return st.apply(window, [fn, ms > 50 ? ms / f : ms].concat(rest));
      };
    }, opts.fast);
  }
  if (!opts.noGoto) {
    await h.page.goto(h.url + (opts.query || ''));
    await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && window.__atlas.globe, null, { timeout: 30000 });
  }
  return h;
}

// Starts a level through startGame and waits until the map is ready for it
async function startLevel(page, arg, startOpts) {
  await page.evaluate(([a, o]) => { window.__atlas.startGame(a, o || undefined); }, [arg, startOpts || null]);
  await page.waitForFunction(() => {
    const A = window.__atlas, st = A.state;
    const scr = (document.querySelector('.screen.active') || {}).id;
    return scr === 'game-screen' && (st.current || (st.learn && st.learn.phase === 'study')) && A.map.round === st.roundId && A.map.drawn;
  }, null, { timeout: 40000 });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { open, startLevel, SIZES, S, sleep };
