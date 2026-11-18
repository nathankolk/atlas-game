'use strict';
// Evaluate latency through a whole short round (Oceania, all skipped quickly is slow; answer by synthetic click here)
const path = require('path');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
(async () => {
  const h = await launch({ dpr: 1, root: ROOT });
  const { page, url } = h;
  const T = Date.now();
  const stamp = () => String(Date.now() - T).padStart(6);
  await page.goto(url + '?play=oceania', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  console.log(stamp(), 'first question');
  let done = false;
  const sampler = (async () => {
    while (!done) { const a = Date.now(); const scr = await page.evaluate(() => (document.querySelector('.screen.active') || {}).id + ' q=' + window.__atlas.state.sequence.length).catch(() => '?'); const d = Date.now() - a; if (d > 150) console.log(stamp(), 'slow evaluate', d, scr); await new Promise(r => setTimeout(r, 20)); }
  })();
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => { const s = window.__atlas.state; return !s.interactionLocked; }, null, { polling: 30 });
    await page.evaluate(() => { const s = window.__atlas.state; const f = s.featureByCanonical.get(s.current); const el = [...document.querySelectorAll('#world-map .country')].find(e => e.__data__ === f); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    console.log(stamp(), 'answered', i + 1);
    await new Promise(r => setTimeout(r, 300));
  }
  await page.waitForFunction(() => document.getElementById('results-screen').classList.contains('active'), null, { polling: 30 });
  console.log(stamp(), 'results active');
  await new Promise(r => setTimeout(r, 25000));
  done = true; await sampler;
  console.log(stamp(), 'closing');
  await h.close();
  console.log(stamp(), 'closed');
})().catch(e => { console.error(e); process.exit(1); });
