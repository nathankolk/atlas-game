'use strict';
// How long do screenshot / close take right after the results screen appears?
const path = require('path');
const { launch } = require('../atlas-harness.js');
const ROOT = path.join(__dirname, '..', 'app-copy');
const variant = process.argv[2] || 'close';
(async () => {
  const h = await launch({ dpr: 1, root: ROOT });
  const { page, url } = h;
  const T = Date.now();
  const stamp = () => String(Date.now() - T).padStart(6);
  await page.goto(url + '?play=oceania', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = window.__atlas && window.__atlas.state; return s && s.current && !s.interactionLocked && s.queue.length === s.totalQuestions - 1; }, null, { polling: 30 });
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => { const s = window.__atlas.state; return !s.interactionLocked; }, null, { polling: 30 });
    await page.evaluate(() => { const s = window.__atlas.state; const f = s.featureByCanonical.get(s.current); const el = [...document.querySelectorAll('#world-map .country')].find(e => e.__data__ === f); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
  await page.waitForFunction(() => document.getElementById('results-screen').classList.contains('active'), null, { polling: 30 });
  console.log(stamp(), 'results active');
  if (variant === 'shot') { await page.screenshot({ path: '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/harness/scratch/x.png' }); console.log(stamp(), 'screenshot'); }
  if (variant === 'blank') { await page.goto('about:blank'); console.log(stamp(), 'about:blank'); }
  if (variant === 'pageclose') { await page.close(); console.log(stamp(), 'page closed'); }
  if (variant === 'pageclose-nb') { await page.close({ runBeforeUnload: false }); console.log(stamp(), 'page closed'); }
  if (variant === 'ctxclose') { await h.context.close(); console.log(stamp(), 'context closed'); }
  await h.close();
  console.log(stamp(), 'closed');
})().catch(e => { console.error(e); process.exit(1); });
