'use strict';
// Where does the time go around screen switches? Samples evaluate latency.
const path = require('path');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
const variant = process.argv[2] || 'plain';
(async () => {
  const h = await launch({ dpr: 1, root: ROOT });
  const { page, url, context } = h;
  if (variant === 'notrans') await context.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.screen{transition:none!important}'; document.head.appendChild(st); }); });
  if (variant === 'reduce') await page.emulateMedia({ reducedMotion: 'reduce' });
  const T = Date.now();
  const stamp = () => String(Date.now() - T).padStart(6);
  await page.goto(url + '?play=south-america', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  console.log(stamp(), 'first question');
  // evaluate latency for 6 s
  let worst = 0, t0 = Date.now();
  while (Date.now() - t0 < 9000) { const a = Date.now(); await page.evaluate(() => 1); const d = Date.now() - a; if (d > 200) console.log(stamp(), 'slow evaluate', d); worst = Math.max(worst, d); await new Promise(r => setTimeout(r, 20)); }
  console.log(stamp(), 'worst evaluate after start', worst);
  // jump to results: answer everything by skipping quickly? Use Escape -> menu to see the cost of leaving
  await page.keyboard.press('Escape');
  worst = 0; t0 = Date.now();
  while (Date.now() - t0 < 9000) { const a = Date.now(); await page.evaluate(() => 1); const d = Date.now() - a; if (d > 200) console.log(stamp(), 'slow evaluate', d); worst = Math.max(worst, d); await new Promise(r => setTimeout(r, 20)); }
  console.log(stamp(), 'worst evaluate after leaving', worst);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
