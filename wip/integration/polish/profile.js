// CPU profile of a cold load (or of a Start), totalled by function: node profile.js [new|old] [query] [--start=<level key>]
'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const root = process.argv[2] === 'old' ? path.join(S, 'work/integration/globe-stage/old-app/public') : '/home/user/atlas-game/public';
const q = (process.argv[3] || '').startsWith('--') ? '' : (process.argv[3] || '');
const startArg = (process.argv.find(a => a.startsWith('--start=')) || '').slice(8);
const fonts = new Map();
(async () => {
  const h = await launch({ root, seedStorage: { 'atlas-theme': 'light' } });
  const cdp = await h.context.newCDPSession(h.page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  if (!startArg) await cdp.send('Profiler.start');
  await h.page.goto(h.url + q);
  await h.page.waitForFunction(() => document.querySelectorAll('#menu-screen .level, #menu-content .region-card').length > 2 || (window.__atlas && window.__atlas.state.current), null, { timeout: 60000 });
  await h.page.waitForTimeout(1500);
  if (startArg) {
    await cdp.send('Profiler.start');
    await h.page.evaluate(a => window.__atlas.startGame(a), startArg);
    await h.page.waitForFunction(() => window.__atlas.state.current && window.__atlas.map.drawn, null, { timeout: 60000 });
    await h.page.waitForTimeout(300);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map();
  profile.nodes.forEach(n => byId.set(n.id, n));
  const dt = profile.timeDeltas, samples = profile.samples;
  for (let i = 0; i < samples.length; i++) {
    const n = byId.get(samples[i]);
    const name = (n.callFrame.functionName || '(anon)') + ' ' + n.callFrame.url.split('/').pop().slice(0, 24) + ':' + n.callFrame.lineNumber;
    self.set(name, (self.get(name) || 0) + dt[i] / 1000);
  }
  // Inclusive time of chosen functions: every sample whose stack holds the function
  const parent = new Map();
  profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
  const incl = new Map();
  for (let i = 0; i < samples.length; i++) {
    const seen = new Set();
    for (let id = samples[i]; id; id = parent.get(id)) {
      const f = byId.get(id).callFrame.functionName;
      if (f && !seen.has(f)) { seen.add(f); incl.set(f, (incl.get(f) || 0) + dt[i] / 1000); }
    }
  }
  const top = (m, n) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[1].toFixed(1).padStart(8) + '  ' + e[0]).join('\n');
  console.log('SELF\n' + top(self, 28) + '\nINCLUSIVE\n' + top(incl, 45));
  await h.close();
})();
