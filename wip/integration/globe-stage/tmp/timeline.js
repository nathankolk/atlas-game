const path = require('path');
const S = path.resolve(__dirname, '../../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
if (!process.argv.includes('--stock-gpu')) chromium.launch = o => stockLaunch(Object.assign({}, o, { args: ((o && o.args) || []).concat(['--disable-gpu-compositing']) }));
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
function probe() {
  const t = window.__tl = {};
  const mark = (k, ok) => { if (t[k] === undefined && ok) t[k] = Math.round(performance.now()); };
  const tick = () => {
    const A = window.__atlas;
    mark('dom', true);
    mark('hook', !!A);
    if (A) {
      mark('globe', !!A.globe);
      mark('world50', A.state.allFeatures.length > 0);
      mark('gameScreen', document.body.dataset.screen === 'game');
      mark('drawn', A.map.drawn && A.state.allFeatures.length > 0);
      mark('firstFrame', !!A.globe && A.globe.stats().frames > 0);
      mark('prompt', !!A.state.current);
      mark('built50', !!A.globe && A.globe.stats().triangles > 100000);
      if (A.globe && t.built50 && t.framesAtBuilt === undefined) t.framesAtBuilt = A.globe.stats().frames;
      if (A.globe && t.drawn && t.framesAtDrawn === undefined) t.framesAtDrawn = A.globe.stats().frames;
      if (A.globe && t.prompt && t.framesAtPrompt === undefined) { t.framesAtPrompt = A.globe.stats().frames; t.lastFrameMs = A.globe.stats().lastFrameMs; }
      mark('startRound', A.state.roundId > 0);
      if (A.globe) t.frames = A.globe.stats().frames;
    }
    if (!t.prompt || performance.now() < 4000) setTimeout(tick, 3);
  };
  document.addEventListener('DOMContentLoaded', tick);
}
(async () => {
  for (const [name, root] of [['head', '/home/user/atlas-game/public'], ['prev', path.join(__dirname, '../prev-app/public')]]) {
    for (const q of ['?play=world', '?play=world', '?play=world']) {
      const h = await launch({ root, width: 1280, height: 800 });
      await h.context.addInitScript(probe);
      await h.page.goto(h.url + q);
      await h.page.waitForTimeout(4500);
      console.log(name, q || '(home)', JSON.stringify(await h.page.evaluate(() => window.__tl)));
      await h.close();
    }
  }
})();
