const { open } = require('./rlib.js');
(async () => {
  const h = await open({ size: 'd1280' });
  const out = await h.page.evaluate(() => window.__atlas.LEVELS.map(l => ({ key: l.key, arg: l.arg, mode: l.mode, skill: l.skill, n: l.count ? l.count() : null, avail: typeof l.available === 'function' ? l.available() : l.available, learn: !!l.learn, coll: l.collection, variant: l.variant, keys: Object.keys(l).join(',') })));
  console.log(out.map(l => [l.key, JSON.stringify(l.arg), l.mode, l.skill, l.n, l.avail, l.learn, l.coll, l.variant || ''].join(' | ')).join('\n'));
  console.log(out[0].keys);
  console.log('errors', h.errors);
  await h.close();
})();
