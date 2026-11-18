// Screenshots for the polish stage: several scenes per run, one window size and theme.
//   NODE_PATH=/opt/node-tools/node_modules node shot.js --size=390x844 [--dark] [--seed=rich|new|quiz] [--touch]
//        --scenes=home,sheet:europe,play:Europe,results:Europe,explore,stats,settings,... [--tag=x] [--sat] [--diff=hard|uncharted]
// Scenes:
//   home | explore | stats | settings            a view (add @y to scroll: home@1200)
//   sheet:<level key>                            the level sheet
//   play:<start arg>[:answers]                   a round with the first question up (answers: number answered first)
//   learn:<start arg>                            a Learn level's study screen
//   results:<start arg>                          the results of a round played through by the hook
//   explore:<country name>                       Explore with a country selected
// Writes $S/shots/app/polish/<tag->scene-<WxH>-<light|dark>.png
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const args = process.argv.slice(2);
const flag = f => args.includes('--' + f);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const [W, H] = opt('size', '1280x800').split('x').map(Number);
const DARK = flag('dark');
const OUT = path.join(S, 'shots/app/polish');
fs.mkdirSync(OUT, { recursive: true });
const SEEDS = { rich: 'harness/scratch/seed-rich.json', quiz: 'harness/scratch/seed-quiz.json', unplayed: 'harness/scratch/seed-rich-unplayed.json' };

// Runs in the page: layout faults on the screen that is showing
function audit() {
  const out = [];
  const screen = document.querySelector('.screen.active');
  const W = window.innerWidth, H = window.innerHeight;
  const tag = el => (el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) +
    (el.textContent ? ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) + '"' : '');
  const shown = el => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const roots = [screen, document.getElementById('level-sheet'), document.getElementById('dialog'), document.querySelector('.topnav'), document.querySelector('.tabbar')].filter(r => r && shown(r));
  if (document.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + W);
  const seen = new Set();
  roots.forEach(root => {
    if (root.scrollWidth > root.clientWidth + 1 && getComputedStyle(root).overflowX !== 'hidden') out.push('scrolls sideways: ' + tag(root).slice(0, 40));
    root.querySelectorAll('*').forEach(el => {
      if (seen.has(el) || !shown(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cs = getComputedStyle(el);
      // Off the side of the window (the globe's host and canvases are meant to overhang)
      if ((r.right > W + 1.5 || r.left < -1.5) && !el.closest('.globe-host') && !el.closest('.stage > canvas') && el.tagName !== 'CANVAS' && !el.closest('[class*="strip"]') && cs.position !== 'fixed' && !el.closest('.vh') && !el.classList.contains('vh')) {
        const scroller = (function up(n) { for (; n && n !== root; n = n.parentElement) { const c = getComputedStyle(n); if (/(auto|scroll|hidden)/.test(c.overflowX)) return n; } return null; })(el.parentElement);
        if (!scroller) out.push('off the side: ' + tag(el) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
      }
      // Text cut short
      if (el.classList.contains('vh') || el.closest('.vh')) return;
      const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (own && el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX) && r.top < H && r.bottom > 0) out.push('text cut: ' + tag(el) + ' ' + el.scrollWidth + '>' + el.clientWidth);
      if (own && el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && cs.display !== 'inline' && r.top < H && r.bottom > 0) out.push('text spills: ' + tag(el) + ' ' + el.scrollWidth + '>' + el.clientWidth);
    });
    // Controls on top of one another
    const controls = Array.from(root.querySelectorAll('button, a[href], input, [role="radio"], [role="switch"]')).filter(shown).map(el => ({ el, r: el.getBoundingClientRect() })).filter(c => c.r.width && c.r.bottom > 0 && c.r.top < H);
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h2 = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h2 > 3) out.push('controls overlap: ' + tag(a.el) + ' / ' + tag(b.el) + ' by ' + Math.round(w) + 'x' + Math.round(h2));
    }
    // Small touch targets on a narrow window
    if (W < 600) controls.forEach(c => { if ((c.r.width < 40 || c.r.height < 40) && !c.el.closest('.vh')) { const after = getComputedStyle(c.el, '::after'), before = getComputedStyle(c.el, '::before'); const grown = [after, before].some(p => p.content !== 'none' && p.position === 'absolute'); if (!grown) out.push('small target: ' + tag(c.el) + ' ' + Math.round(c.r.width) + 'x' + Math.round(c.r.height)); } });
  });
  return Array.from(new Set(out)).slice(0, 14);
}

(async () => {
  const seedName = opt('seed', 'new');
  const seed = seedName === 'new' ? {} : JSON.parse(fs.readFileSync(path.join(S, SEEDS[seedName]), 'utf8'));
  seed['atlas-theme'] = DARK ? 'dark' : 'light';
  if (flag('sat')) seed['atlas-map-style'] = 'satellite';
  if (opt('diff')) seed['atlas-difficulty'] = opt('diff');
  if (flag('reduce')) seed['atlas-motion'] = 'reduce';
  const touch = flag('touch') || W < 600 || H < 500;
  const h = await launch(Object.assign({ seedStorage: seed }, touch ? { mobile: true, dpr: 2 } : { width: W, height: H }));
  const page = h.page;
  if (touch) await page.setViewportSize({ width: W, height: H });
  const name = scene => path.join(OUT, (opt('tag') ? opt('tag') + '-' : '') + scene.replace(/[^a-z0-9@]+/gi, '-') + '-' + W + 'x' + H + '-' + (DARK ? 'dark' : 'light') + '.png');
  const ready = () => page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && (window.location.hash || document.querySelectorAll('#menu-screen .level').length > 5), null, { timeout: 60000 });
  const question = () => page.waitForFunction(() => { const A = window.__atlas; return A.state.current && A.map.round === A.state.roundId && A.map.drawn; }, null, { timeout: 60000 });
  const settle = async ms => {
    await page.waitForTimeout(ms || 900);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  for (const scene of opt('scenes', 'home').split(',')) {
    const [kind, arg, extra] = scene.split(':');
    const [view, scroll] = kind.split('@');
    try {
      if (['home', 'explore', 'stats', 'settings'].includes(view) && !arg) {
        await page.goto(h.url + (view === 'home' ? '' : '#' + view));
        await ready();
        await settle(view === 'explore' ? 2500 : 700);
        if (scroll) {
          await page.evaluate(([v, y]) => { document.getElementById((v === 'home' ? 'menu' : v) + '-screen').scrollTop = Number(y); }, [view, scroll]);
          await settle(300);
        }
      } else if (kind === 'explore') {
        await page.goto(h.url + '#explore');
        await ready();
        await settle(2000);
        await page.evaluate(n => window.__atlas.selectCountry(n), arg);
        await settle(2500);
      } else if (kind === 'sheet') {
        await page.goto(h.url);
        await ready();
        await page.evaluate(key => document.querySelector('[data-action="open-level"][data-level="' + key + '"]').click(), arg);
        await settle(800);
      } else if (kind === 'play' || kind === 'learn' || kind === 'results') {
        await page.goto(h.url);
        await ready();
        await page.evaluate(([a, learn]) => window.__atlas.startGame(a, learn ? { learn: true, learnFresh: true } : undefined), [arg, kind === 'learn']);
        if (kind === 'learn') await page.waitForFunction(() => window.__atlas.state.learn && window.__atlas.map.drawn, null, { timeout: 60000 });
        else await question();
        await settle(1600);
        if (kind === 'results') {
          // Skip through the round: every question missed but the first few
          await page.evaluate(async () => {
            const A = window.__atlas, st = window.setTimeout;
            window.setTimeout = (fn, ms) => st(fn, Math.min(ms, 5));
            const skip = document.getElementById('skip-btn');
            for (let i = 0; i < 400 && !document.getElementById('results-screen').classList.contains('active'); i++) {
              const next = document.getElementById('pin-btn');
              if (A.state.pin && A.state.pin.phase === 'reveal' && !next.disabled) next.click();
              else if (A.state.current && !A.state.interactionLocked) skip.click();
              await new Promise(r => st(r, 12));
            }
            window.setTimeout = st;
          });
          await page.waitForFunction(() => document.getElementById('results-screen').classList.contains('active'), null, { timeout: 60000 });
          await settle(900);
        }
        if (extra) { await page.evaluate(code => (0, eval)(code), extra); await settle(1200); }
      }
      const js = opt('js');
      if (js) { await page.evaluate(code => (0, eval)(code), js); await settle(Number(opt('wait', 900))); }
      await page.screenshot({ path: name(scene), timeout: 60000 });
      const issues = flag('audit') ? await page.evaluate(audit) : [];
      console.log('shot', path.basename(name(scene)), h.errors.length ? 'ERRORS ' + h.errors.slice(0, 2).join(' | ') : '');
      issues.forEach(i => console.log('   ISSUE ' + i));
    } catch (e) {
      console.log('FAILED', scene, String(e).split('\n')[0]);
    }
  }
  await h.close();
})();
