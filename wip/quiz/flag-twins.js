// Finds flags that the flag font draws identically or nearly so (a flag question cannot tell them apart).
// Run: NODE_PATH=/opt/node-tools/node_modules node flag-twins.js
'use strict';
const path = require('path');
const SCRATCH = path.resolve(__dirname, '..', '..');
const { launch } = require(path.join(SCRATCH, 'harness', 'atlas-harness.js'));
const data = require('./load-data.js');
(async () => {
  const h = await launch({ root: __dirname, width: 800, height: 600 });
  try {
    await h.page.goto(h.url + 'flag-page.html');
    await h.page.evaluate(() => Quiz.flagSupport(document));
    const pairs = await h.page.evaluate(facts => {
      const size = 64, names = Object.keys(facts).filter(n => Quiz.hasFlag(facts, n));
      const pix = names.map(n => {
        const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.font = size + 'px ' + Quiz.FLAG_FONT_STACK; ctx.textBaseline = 'middle'; ctx.fillText(Quiz.flagEmoji(facts[n][1]), 4, size);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      });
      const out = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        let diff = 0, area = 0;
        const a = pix[i], b = pix[j];
        for (let k = 0; k < a.length; k += 4) {
          if (a[k + 3] < 128 && b[k + 3] < 128) continue;
          area++;
          diff += (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) + Math.abs(a[k + 3] - b[k + 3])) / 4;
        }
        out.push([Math.round(diff / area * 100) / 100, names[i], names[j]]);
      }
      return out.sort((x, y) => x[0] - y[0]).slice(0, 14);
    }, data.WORLD_FACTS);
    console.log('mean per-pixel colour difference (0-255) of the closest flag pairs:');
    pairs.forEach(p => console.log('  ' + String(p[0]).padStart(6) + '  ' + p[1] + ' / ' + p[2]));
  } finally { await h.close(); }
})().catch(e => { console.error(e); process.exit(1); });
