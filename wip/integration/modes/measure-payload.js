// Size of the sync payload for the heavy player of harness/seed-rich.js (--heavy: every level played,
// every day for 57 weeks), as the server would receive it, against the 256 KB limit of functions/api/records.js.
//   NODE_PATH=/opt/node-tools/node_modules node measure-payload.js [seed.json]
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const LIMIT = 256 * 1024;
(async () => {
  const file = process.argv[2] || path.join(S, 'harness/scratch/seed-heavy.json');
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  seed['atlas-sync-token'] = '00000000000000000000000000000001';
  seed['atlas-sync-username'] = 'A fairly long username';
  const posts = [];
  const h = await lib.launchApp({ seedStorage: seed, beforeLoad: async hh => {
    await hh.page.route(/\/api\/records/, async route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
  } });
  const page = h.page;
  await page.evaluate(() => window.__atlas.showView('settings'));
  await page.waitForSelector('#sync-now-btn');
  await page.click('#sync-now-btn');
  await page.waitForFunction(() => !document.getElementById('sync-now-btn').disabled && /last synced/.test(document.getElementById('sync-status-line').textContent), null, { timeout: 10000 });
  const body = posts[posts.length - 1];
  const bytes = Buffer.byteLength(body, 'utf8');
  const parsed = JSON.parse(body);
  const parts = {};
  Object.keys(parsed).forEach(k => { parts[k] = Buffer.byteLength(JSON.stringify(parsed[k]), 'utf8'); });
  const items = Object.keys(parsed.mastery.items).reduce((a, k) => a + Object.keys(parsed.mastery.items[k]).length, 0);
  console.log('seed: ' + path.basename(file));
  console.log('payload: ' + bytes + ' bytes (' + (bytes / 1024).toFixed(1) + ' KB) of ' + LIMIT / 1024 + ' KB; ' + (bytes > 200 * 1024 ? 'OVER' : 'under') + ' 200 KB');
  console.log('parts (bytes): ' + JSON.stringify(parts));
  console.log('mastery items: ' + items + ', days kept: ' + Object.keys(parsed.mastery.days).length + ', records: ' + Object.keys(parsed.records).length + ', pin games: ' + parsed.pin.games.length);
  console.log('errors: ' + JSON.stringify(h.errors));
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
