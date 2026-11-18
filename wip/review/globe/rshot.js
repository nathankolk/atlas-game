// Screenshot of a round for the globe review.
//   node rshot.js --name=x --arg=Europe [--size=p390] [--seed='{"atlas-motion":"reduce"}'] [--dark] [--sat] [--diff=hard|uncharted]
//        [--opts='{"learn":true}'] [--js="code run in the page after the round is up"] [--wait=ms] [--reduced] [--tiles=fail] [--nogl] [--info]
'use strict';
const path = require('path');
const { open, startLevel } = require('./rlib.js');
const args = process.argv.slice(2);
const flag = f => args.includes('--' + f);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
(async () => {
  const seed = Object.assign({ 'atlas-theme': flag('dark') ? 'dark' : 'light' }, JSON.parse(opt('seed', '{}')));
  if (opt('diff')) seed['atlas-difficulty'] = opt('diff');
  if (flag('sat')) seed['atlas-map-style'] = 'satellite';
  const h = await open({
    size: opt('size', 'd1280'), seedStorage: seed, reducedMotion: flag('reduced'), tiles: opt('tiles', 'mock'), dpr: Number(opt('dpr', 1)),
    initScript: flag('nogl') ? () => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) { return /webgl/.test(type) ? null : get.apply(this, arguments); };
    } : null
  });
  const page = h.page;
  const list = opt('arg', 'World').split('>');    // "Europe>flags-europe" plays one after another
  for (const a of list) {
    await startLevel(page, a, opt('opts') ? JSON.parse(opt('opts')) : null);
    await page.waitForTimeout(250);
  }
  if (opt('js')) await page.evaluate(code => (0, eval)('(async () => {' + code + '})()'), opt('js'));
  await page.waitForTimeout(Number(opt('wait', 1200)));
  const file = path.join(__dirname, 'shots', opt('name', 'shot') + '.png');
  await page.screenshot({ path: file });
  if (flag('info')) {
    console.log(JSON.stringify(await page.evaluate(() => {
      const A = window.__atlas, g = A.globe;
      return { view: g.getView(), home: A.map.home, clear: A.map.clear, cur: A.state.current, stats: g.stats(), cls: document.getElementById('map-wrap').className };
    })));
  }
  console.log(file, 'errors', JSON.stringify(h.errors.slice(0, 4)));
  await h.close();
})();
